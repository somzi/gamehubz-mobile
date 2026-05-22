import React, { createContext, useContext, useState, ReactNode, useMemo, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { User, AuthResponse, UserSocial } from '../types/auth';
import { API_BASE_URL, ENDPOINTS, setAuthToken, authenticatedFetch, subscribeToLogout } from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { usePushNotifications, STORAGE_KEY_LAST_SYNCED_TOKEN } from '../hooks/usePushNotifications';


interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    register: (data: any) => Promise<boolean>;
    logout: () => void;
    updateProfile: (data: any) => Promise<boolean>;
    saveUserSocial: (social: UserSocial) => Promise<boolean>;
    deleteUserSocial: (id: string) => Promise<boolean>;
    refreshUser: () => Promise<void>;
    deleteAccount: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, _setUser] = useState<User | null>(null);
    const setUser = (newUser: User | null | ((prev: User | null) => User | null)) => {
        if (typeof newUser === 'function') {
            _setUser(prev => {
                const val = (newUser as (prev: User | null) => User | null)(prev);
                console.log(`[AuthContext] setUser (functional) - New User: ${val?.username}, Auth: ${!!val}`);
                if (val) SecureStore.setItemAsync('user_meta', JSON.stringify(val)).catch(() => { });
                else SecureStore.deleteItemAsync('user_meta').catch(() => { });
                return val;
            });
        } else {
            console.log(`[AuthContext] setUser (direct) - New User: ${newUser?.username}, Auth: ${!!newUser}`);
            if (newUser) SecureStore.setItemAsync('user_meta', JSON.stringify(newUser)).catch(() => { });
            else SecureStore.deleteItemAsync('user_meta').catch(() => { });
            _setUser(newUser);
        }
    };
    const [token, setToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAppReady, setIsAppReady] = useState(false);

    // Push notifications
    const { checkAndSync, requestAndSync } = usePushNotifications();

    useEffect(() => {
        const loadStoredAuth = async () => {
            try {
                const storedAccess = await SecureStore.getItemAsync('access_token');
                const storedRefresh = await SecureStore.getItemAsync('refresh_token');
                if (storedAccess && storedRefresh) {
                    setToken(storedAccess);
                    setAuthToken(storedAccess);
                    setRefreshToken(storedRefresh);

                    const storedUserStr = await SecureStore.getItemAsync('user_meta');
                    if (storedUserStr) {
                        try {
                            const parsed = JSON.parse(storedUserStr);
                            if (parsed) _setUser(parsed);
                        } catch (e) { }
                    }
                }
            } catch (error) {
                console.error('Error loading stored auth:', error);
            } finally {
                setIsAppReady(true);
            }
        };

        loadStoredAuth();

        const unsubscribe = subscribeToLogout(() => {
            _setUser(null);
            setToken(null);
            setRefreshToken(null);
            setAuthToken(null);
            SecureStore.deleteItemAsync('user_meta').catch(() => { });
            SecureStore.deleteItemAsync(STORAGE_KEY_LAST_SYNCED_TOKEN).catch(() => { });
        });

        return () => unsubscribe();
    }, []);

    // ─── Push notification initialization on authentication ────────
    // Runs on every authenticated session start (login or auto-restore).
    //
    // Flow:
    // 1. checkAndSync() — non-intrusive read of current permission.
    //    Handles the "recovery" case: user denied earlier but later
    //    enabled notifications in system settings → token is fetched
    //    and synced without any popup.
    // 2. If permission is not granted but can still be requested,
    //    call requestAndSync() to trigger the native OS dialog:
    //    • Android 13+: shows the POST_NOTIFICATIONS system popup.
    //    • iOS: shows the native alert exactly once per install
    //      (subsequent calls are no-ops per Apple policy).
    // 3. AppState listener: when the user returns from system settings
    //    after enabling notifications, checkAndSync() re-runs silently
    //    to pick up the newly granted permission and sync the token.
    //
    // NOTE: pushInitialized is set at the END of the try block so that
    // if the flow fails (e.g. network error during sync), it will
    // retry on the next render cycle without requiring a hard restart.
    const pushInitialized = useRef(false);
    useEffect(() => {
        if (user && token && isAppReady && !pushInitialized.current) {
            console.log('[AuthContext] User authenticated — starting push notification flow');

            (async () => {
                try {
                    // Step 1: non-intrusive check + forced sync.
                    // force=true ensures the token is (re)written to the DB on
                    // every authenticated session start, regardless of the local
                    // cache — recovers the case where the row was deleted server-side.
                    const permission = await checkAndSync(true);
                    console.log(
                        `[AuthContext] Push checkAndSync result: ${permission.status} | granted=${permission.granted} | canAskAgain=${permission.canAskAgain}`,
                    );

                    const shouldRequestPermission =
                        !permission.granted &&
                        (
                            permission.status === 'undetermined' ||
                            (Platform.OS === 'android' && permission.canAskAgain)
                        );

                    if (permission.granted) {
                        console.log('[AuthContext] Push permissions already granted, sync handled');
                    } else if (shouldRequestPermission) {
                        // Android can report denied even before first prompt; if requestable, ask explicitly.
                        console.log(`[AuthContext] Permissions not granted on ${Platform.OS} but requestable, requesting…`);
                        const granted = await requestAndSync();
                        console.log(`[AuthContext] Push requestAndSync result: ${granted ? 'granted' : 'denied'}`);
                    } else {
                        console.log('[AuthContext] Push permissions denied and not requestable — user must enable in system settings');
                    }

                    // Mark as initialized only after the entire flow succeeds.
                    // If an error occurred above, this line is skipped and the
                    // flow will retry on the next render cycle.
                    pushInitialized.current = true;
                } catch (err) {
                    console.warn('[AuthContext] Push notification flow error (will retry):', err);
                }
            })();
        }

        // Reset when user logs out so the flow re-fires on next login
        if (!user) {
            pushInitialized.current = false;
        }
    }, [user, token, isAppReady, checkAndSync, requestAndSync]);

    // ─── AppState listener for push notification recovery ──────────
    // When the user toggles back from System Settings → App, we
    // re-check permissions silently. This covers the scenario where
    // a user denied the initial prompt, navigated to settings to
    // enable notifications, and then returned to the app.
    // checkAndSync() is non-intrusive (no prompt) and idempotent,
    // so this is safe on both iOS and Android.
    const appStateRef = useRef(AppState.currentState);
    useEffect(() => {
        if (!user || !token) return;

        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                console.log('[AuthContext] App foregrounded — re-checking push permissions');
                checkAndSync().catch(err => {
                    console.warn('[AuthContext] Foreground push re-check error:', err);
                });
            }
            appStateRef.current = nextAppState;
        });

        return () => subscription.remove();
    }, [user, token, checkAndSync]);
    // Helpers
    const normalizeUser = (apiUser: any): User => {
        return {
            ...apiUser,
            id: apiUser.Id || apiUser.id,
            username: apiUser.Username || apiUser.username,
            nickName: apiUser.Nickname || apiUser.nickName || apiUser.nickname,
            region: apiUser.Region !== undefined ? apiUser.Region : apiUser.region,
            avatarUrl: apiUser.avatarUrl || apiUser.AvatarUrl || apiUser.Avatar || apiUser.avatar || undefined,
            userSocials: (apiUser.UserSocials || apiUser.userSocials || []).map((s: any) => ({
                ...s,
                id: s.Id || s.id,
                username: s.Username || s.username,
                socialType: s.Type !== undefined ? s.Type : (s.SocialType !== undefined ? s.SocialType : (s.type !== undefined ? s.type : s.socialType))
            }))
        };
    };

    const refreshUser = useCallback(async () => {
        if (!user?.id) return;
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_USER_INFO(user.id));
            if (response.ok) {
                const userInfo = await response.json();
                const apiInfo = userInfo.result || userInfo;
                setUser(normalizeUser(apiInfo));
            }
        } catch (error) {
            console.error('Refresh user error:', error);
        }
    }, [user?.id]);

    const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/Auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const text = await response.text();
            let data: any;

            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('Failed to parse login response:', text);
                return { success: false, message: 'Invalid server response' };
            }

            if (data.isSuccessful && data.accessToken?.token) {
                const newAcc = data.accessToken.token;
                const newRef = data.refreshToken;

                await SecureStore.setItemAsync('access_token', newAcc);
                if (newRef) {
                    await SecureStore.setItemAsync('refresh_token', newRef);
                }

                setToken(newAcc);
                setAuthToken(newAcc);
                setRefreshToken(newRef);
                setUser(normalizeUser(data.user));


                return { success: true };
            } else {
                // Determine error message from body
                let msg = 'Invalid credentials';
                if (Array.isArray(data) && data.length > 0) {
                    msg = data[0];
                } else if (data && typeof data === 'object') {
                    const messages = (data as any).messages || (data as any).Messages;
                    if (Array.isArray(messages) && messages.length > 0) {
                        msg = messages[0];
                    } else if (typeof messages === 'string') {
                        msg = messages;
                    }
                } else if (typeof data === 'string' && data.length > 0) {
                    msg = data;
                }

                console.error('Login failed:', msg, '- Raw data:', data);
                return { success: false, message: msg };
            }
        } catch (error: any) {
            console.error('Login error:', error);
            return { success: false, message: error.message || 'Network error' };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const register = useCallback(async (formData: any): Promise<boolean> => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/Auth/registerUser`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const text = await response.text();

            if (response.ok) {
                return true;
            } else {
                let errorMessage = text;
                try {
                    const errorData = JSON.parse(text);
                    errorMessage = errorData.messages || errorData;
                } catch (e) { }
                console.error('Register failed response:', errorMessage);
                return false;
            }
        } catch (error) {
            console.error('Register error:', error);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const updateProfile = useCallback(async (data: any): Promise<boolean> => {
        setIsLoading(true);
        try {
            const payload = {
                Nickname: data.nickName || data.nickname || '',
                UserId: data.id || data.userId,
                Username: data.username || ''
            };

            const response = await authenticatedFetch(ENDPOINTS.UPDATE_PROFILE, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                try {
                    const result = await response.json();
                    const apiUser = result.result || result;

                    if (apiUser && (apiUser.id || apiUser.Id)) {
                        setUser(normalizeUser(apiUser));
                    } else {
                        await refreshUser();
                    }
                } catch (e) {
                    await refreshUser();
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('Update profile error:', error);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [refreshUser]);

    const saveUserSocial = useCallback(async (social: UserSocial): Promise<boolean> => {
        if (!user?.id) return false;

        setIsLoading(true);
        try {
            const payload: any = {
                type: social.socialType,
                username: social.username,
                userId: user.id
            };

            if (social.id) {
                payload.id = social.id;
            }

            const response = await authenticatedFetch(ENDPOINTS.USER_SOCIAL, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                const savedSocial: UserSocial = await response.json();

                setUser(prev => {
                    if (!prev) return null;
                    const socialType = savedSocial.type !== undefined ? savedSocial.type : savedSocial.socialType;
                    const currentSocials = prev.userSocials || [];
                    const existingIndex = currentSocials.findIndex(s => {
                        const sType = s.socialType !== undefined ? s.socialType : s.type;
                        return sType === socialType;
                    });
                    let newSocials = [...currentSocials];
                    const normalizedSocial = {
                        ...savedSocial,
                        socialType: socialType
                    };
                    if (existingIndex >= 0) {
                        newSocials[existingIndex] = normalizedSocial;
                    } else {
                        newSocials.push(normalizedSocial);
                    }
                    return { ...prev, userSocials: newSocials };
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Save user social error:', error);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    const deleteUserSocial = useCallback(async (id: string): Promise<boolean> => {
        setIsLoading(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.DELETE_USER_SOCIAL(id), {
                method: 'DELETE',
            });

            if (response.ok) {
                setUser(prev => {
                    if (!prev) return null;
                    const newSocials = (prev.userSocials || []).filter(s => s.id !== id);
                    return { ...prev, userSocials: newSocials };
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Delete user social error:', error);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        if (refreshToken) {
            try {
                await fetch(`${API_BASE_URL}/api/Auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : ''
                    },
                    body: JSON.stringify(refreshToken),
                });
            } catch (error) {
                console.error('[AuthContext] Logout API error:', error);
            }
        }
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        await SecureStore.deleteItemAsync('user_meta');
        await SecureStore.deleteItemAsync(STORAGE_KEY_LAST_SYNCED_TOKEN);

        setUser(null);
        setToken(null);
        setRefreshToken(null);
        setAuthToken(null);
    }, [refreshToken, token]);

    const deleteAccount = useCallback(async (): Promise<boolean> => {
        setIsLoading(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.DELETE_ACCOUNT, {
                method: 'DELETE',
            });

            if (response.ok) {
                await SecureStore.deleteItemAsync('access_token');
                await SecureStore.deleteItemAsync('refresh_token');
                await SecureStore.deleteItemAsync('user_meta');
                setUser(null);
                setToken(null);
                setRefreshToken(null);
                setAuthToken(null);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Delete account error:', error);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        setAuthToken(token);
    }, [token]);

    const authContextValue = useMemo(() => ({
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        register,
        logout,
        updateProfile,
        saveUserSocial,
        deleteUserSocial,
        refreshUser,
        deleteAccount,
    }), [user, token, isLoading, login, register, logout, updateProfile, saveUserSocial, refreshUser, deleteAccount]);

    return (
        <AuthContext.Provider value={authContextValue}>
            {isAppReady ? children : null}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

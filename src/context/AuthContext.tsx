import React, { createContext, useContext, useState, ReactNode, useMemo, useEffect, useCallback, useRef } from 'react';
import { User, AuthResponse, UserSocial } from '../types/auth';
import { API_BASE_URL, ENDPOINTS, setAuthToken, authenticatedFetch, subscribeToLogout } from '../lib/api';
import * as SecureStore from 'expo-secure-store';

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<boolean>;
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
                if (val) SecureStore.setItemAsync('user_meta', JSON.stringify(val)).catch(() => {});
                else SecureStore.deleteItemAsync('user_meta').catch(() => {});
                return val;
            });
        } else {
            console.log(`[AuthContext] setUser (direct) - New User: ${newUser?.username}, Auth: ${!!newUser}`);
            if (newUser) SecureStore.setItemAsync('user_meta', JSON.stringify(newUser)).catch(() => {});
            else SecureStore.deleteItemAsync('user_meta').catch(() => {});
            _setUser(newUser);
        }
    };
    const [token, setToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAppReady, setIsAppReady] = useState(false);

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
                        } catch (e) {}
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
            SecureStore.deleteItemAsync('user_meta').catch(() => {});
        });
        
        return () => unsubscribe();
    }, []);

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

    const login = useCallback(async (email: string, password: string): Promise<boolean> => {
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
            let data: AuthResponse;

            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('Failed to parse login response:', text);
                return false;
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
                return true;
            } else {
                console.error('Login failed:', data.messages);
                return false;
            }
        } catch (error) {
            console.error('Login error:', error);
            return false;
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

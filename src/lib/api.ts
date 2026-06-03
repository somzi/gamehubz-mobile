// Environment configuration
const IS_PROD = !__DEV__;
const PROD_URL = 'https://codespheresolutions.dev';
// For local development on physical devices, use your computer's local IP
const LOCAL_IP = '192.168.0.13';
const LOCAL_PORT = '5057';
const LOCAL_URL = `http://${LOCAL_IP}:${LOCAL_PORT}`;

export const API_BASE_URL = IS_PROD ? PROD_URL : LOCAL_URL;

export const ENDPOINTS = {
    SET_PASSWORD: `${API_BASE_URL}/api/Auth/setPassword`,
    HUBS: `${API_BASE_URL}/api/Hub/getAll`,
    GET_HUB: (id: string) => `${API_BASE_URL}/api/Hub/${id}`,
    GET_TOURNAMENT_STRUCTURE: (id: string) => `${API_BASE_URL}/api/tournament/${id}/structure`,
    GET_TOURNAMENT_STRUCTURE_V2: (id: string) => `${API_BASE_URL}/api/tournament/${id}/structure/v2`,
    UPDATE_PROFILE: `${API_BASE_URL}/api/user/update`,
    GET_PLAYER_STATS: (id: string) => `${API_BASE_URL}/api/UserProfile/v2/${id}/stats`,
    USER_SOCIAL: `${API_BASE_URL}/api/UserSocial`,
    GET_USER_INFO: (id: string) => `${API_BASE_URL}/api/UserProfile/${id}/info`,
    GET_USER_HUBS: (userId: string, pageNumber: number = 0, search: string = "") => `${API_BASE_URL}/api/Hub/user/${userId}/joined?pageNumber=${pageNumber}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    GET_DISCOVERY_HUBS: (userId: string, pageNumber: number = 0, search: string = "") => `${API_BASE_URL}/api/Hub/user/${userId}/discovery?pageNumber=${pageNumber}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    GET_PROFILE_TOURNAMENTS: (userId: string, pageNumber: number = 0) => `${API_BASE_URL}/api/UserProfile/${userId}/tournaments?pageNumber=${pageNumber}`,
    GET_PROFILE_MATCHES: (userId: string, pageNumber: number = 0) => `${API_BASE_URL}/api/UserProfile/${userId}/matches?pageNumber=${pageNumber}`,
    CREATE_TOURNAMENT: `${API_BASE_URL}/api/tournament`,
    GET_USER_TOURNAMENTS: (userId: string, status: number, page: number, pageSize: number = 10) =>
        `${API_BASE_URL}/api/User/${userId}/tournaments?Status=${status}&Page=${page}&PageSize=${pageSize}`,
    GET_TOURNAMENT: (id: string) => `${API_BASE_URL}/api/tournament/${id}`,
    GET_TOURNAMENT_OVERVIEW: (id: string) => `${API_BASE_URL}/api/tournament/${id}/overview`,
    GET_TOURNAMENT_OVERVIEW_V2: (id: string) => `${API_BASE_URL}/api/tournament/${id}/overview/v2`,
    REGISTER_TOURNAMENT: `${API_BASE_URL}/api/tournamentRegistration`,
    REGISTER_TEAM_IN_TOURNAMENT: (tournamentId: string, teamId: string) => `${API_BASE_URL}/api/tournamentRegistration/tournament/${tournamentId}/team/${teamId}/register`,
    GET_PENDING_REGISTRATIONS: (tournamentId: string) => `${API_BASE_URL}/api/tournamentRegistration/tournament/${tournamentId}/pending`,
    APPROVE_REGISTRATION: `${API_BASE_URL}/api/tournamentRegistration/approve`,
    APPROVE_ALL_REGISTRATIONS: `${API_BASE_URL}/api/tournamentRegistration/approveAll`,
    REJECT_REGISTRATION: `${API_BASE_URL}/api/tournamentRegistration/reject`,
    GET_TOURNAMENT_PARTICIPANTS: (tournamentId: string) => `${API_BASE_URL}/api/TournamentParticipant/tournament/${tournamentId}`,
    REMOVE_PARTICIPANT: (tournamentId: string, userId: string) => `${API_BASE_URL}/api/TournamentParticipant/tournament/${tournamentId}/user/${userId}`,
    CREATE_BRACKET: `${API_BASE_URL}/api/tournament/createBracket`,
    REPORT_MATCH_RESULT: `${API_BASE_URL}/api/tournament/matchResult`,
    APPROVE_MATCH_RESULT: `${API_BASE_URL}/api/tournament/matchResult/approve`,
    REJECT_MATCH_RESULT: `${API_BASE_URL}/api/tournament/matchResult/reject`,
    GET_HUB_TOURNAMENTS: (hubId: string, status: number, page: number, pageSize: number = 10) =>
        `${API_BASE_URL}/api/Hub/${hubId}/tournaments?Status=${status}&Page=${page}&PageSize=${pageSize}`,
    FOLLOW_HUB: `${API_BASE_URL}/api/userHub`,
    UNFOLLOW_HUB: (userId: string, hubId: string) => `${API_BASE_URL}/api/userHub/unfollow?userId=${userId}&hubId=${hubId}`,
    UPDATE_HUB: `${API_BASE_URL}/api/hub/update`,
    SUBMIT_MATCH_AVAILABILITY: `${API_BASE_URL}/api/match/availability`,
    GET_HUB_MEMBERS: (id: string) => `${API_BASE_URL}/api/Hub/${id}/members`,
    GET_HUB_MEMBERS_PAGED: (id: string, pageNumber: number = 0, search: string = "") => `${API_BASE_URL}/api/Hub/${id}/members/paged?pageNumber=${pageNumber}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    GET_MATCH_AVAILABILITY: (matchId: string, userId: string) => `${API_BASE_URL}/api/match/${matchId}/availability/user/${userId}`,
    GET_USER_HOME_MATCHES: (userId: string) => `${API_BASE_URL}/api/match/home/${userId}`,
    CHECK_REGISTRATION: (id: string, userId: string) => `${API_BASE_URL}/api/tournament/${id}/user/${userId}/registred`,
    GET_HUB_ACTIVITY_HOME: `${API_BASE_URL}/api/hubActivity/home`,
    CREATE_HUB: `${API_BASE_URL}/api/hub/create`,
    DELETE_USER_SOCIAL: (id: string) => `${API_BASE_URL}/api/UserSocial/${id}`,
    HUB_SOCIAL: `${API_BASE_URL}/api/HubSocial`,
    DELETE_HUB_SOCIAL: (id: string) => `${API_BASE_URL}/api/HubSocial/${id}`,
    UPDATE_TOURNAMENT: `${API_BASE_URL}/api/tournament/update`,
    SET_ROUND_SCHEDULE: (id: string) => `${API_BASE_URL}/api/tournament/${id}/roundSchedule`,
    CANCEL_TOURNAMENT: (id: string) => `${API_BASE_URL}/api/tournament/${id}/cancel`,
    HARD_DELETE_TOURNAMENT: (id: string) => `${API_BASE_URL}/api/tournament/${id}/hardDelete`,
    OPEN_REGISTRATION: (id: string) => `${API_BASE_URL}/api/tournament/${id}/openRegistration`,
    CLOSE_REGISTRATION: (id: string) => `${API_BASE_URL}/api/tournament/${id}/closeRegistration`,
    KICK_HUB_MEMBER: (hubId: string, userId: string) => `${API_BASE_URL}/api/Hub/${hubId}/user/${userId}/kick`,
    ADD_HUB_MEMBER: (hubId: string) => `${API_BASE_URL}/api/Hub/${hubId}/members`,
    CHANGE_HUB_MEMBER_ROLE: (hubId: string, userId: string) => `${API_BASE_URL}/api/Hub/${hubId}/members/${userId}`,
    REMOVE_HUB_MEMBER: (hubId: string, userId: string) => `${API_BASE_URL}/api/Hub/${hubId}/members/${userId}`,
    BAN_HUB_MEMBER: (hubId: string, userId: string) => `${API_BASE_URL}/api/Hub/${hubId}/members/${userId}/ban`,
    GET_HUB_BANS: (hubId: string) => `${API_BASE_URL}/api/Hub/${hubId}/bans`,
    UNBAN_HUB_MEMBER: (hubId: string, userId: string) => `${API_BASE_URL}/api/Hub/${hubId}/bans/${userId}`,
    REQUEST_HUB_VERIFICATION: (hubId: string) => `${API_BASE_URL}/api/Hub/${hubId}/verification-request`,
    GET_HUB_VERIFICATION_REQUEST: (hubId: string) => `${API_BASE_URL}/api/Hub/${hubId}/verification-request`,
    RESPOND_HUB_VERIFICATION: (hubId: string) => `${API_BASE_URL}/api/Hub/${hubId}/verification-response`,
    REQUEST_HUB_JOIN: (hubId: string) => `${API_BASE_URL}/api/Hub/${hubId}/join-request`,
    CANCEL_HUB_JOIN_REQUEST: (hubId: string) => `${API_BASE_URL}/api/Hub/${hubId}/join-request`,
    GET_HUB_JOIN_REQUESTS: (hubId: string) => `${API_BASE_URL}/api/Hub/${hubId}/join-requests`,
    APPROVE_HUB_JOIN_REQUEST: (requestId: string) => `${API_BASE_URL}/api/Hub/join-request/${requestId}/approve`,
    REJECT_HUB_JOIN_REQUEST: (requestId: string) => `${API_BASE_URL}/api/Hub/join-request/${requestId}/reject`,
    UPLOAD_MATCH_EVIDENCE: (id: string) => `${API_BASE_URL}/api/match/${id}/evidence`,
    GET_MATCH_DETAILS: (id: string) => `${API_BASE_URL}/api/match/${id}/details`,
    GET_MATCH_COMMENTS: (matchId: string) => `${API_BASE_URL}/api/MatchChat/${matchId}/history`,
    POST_MATCH_COMMENT: (matchId: string) => `${API_BASE_URL}/api/MatchChat/${matchId}`,
    UPLOAD_AVATAR: `${API_BASE_URL}/api/userProfile/avatar`,
    UPLOAD_HUB_AVATAR: (id: string) => `${API_BASE_URL}/api/hub/${id}/avatar`,
    DELETE_HUB: (id: string) => `${API_BASE_URL}/api/hub/${id}`,
    REMOVE_TEAM_FROM_TOURNAMENT: (tournamentId: string, teamId: string) => `${API_BASE_URL}/api/tournamentParticipant/tournament/${tournamentId}/team/${teamId}`,
    DELETE_ACCOUNT: `${API_BASE_URL}/api/Auth`,
    FORGOT_PASSWORD: `${API_BASE_URL}/api/Auth/forgotPassword`,
    RESET_PASSWORD: `${API_BASE_URL}/api/Auth/resetPassword`,
    GET_ALL_HUB_ACTIVITY: (pageNumber: number) => `${API_BASE_URL}/api/hubActivity/all?pageNumber=${pageNumber}`,
    EXPORT_BRACKET_PDF: (id: string) => `${API_BASE_URL}/api/tournament/${id}/export/pdf`,
    PUSH_TOKEN: `${API_BASE_URL}/api/user/push-token`,
    SET_MATCH_SCHEDULED: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/schedule`,

    // ─── Friends / Social ───────────────────────────────────────────────
    GET_FRIENDS: (search: string = "") => `${API_BASE_URL}/api/Friend${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    GET_INCOMING_REQUESTS: (search: string = "") => `${API_BASE_URL}/api/Friend/requests/incoming${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    GET_OUTGOING_REQUESTS: (search: string = "") => `${API_BASE_URL}/api/Friend/requests/outgoing${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    GET_BLOCKED_USERS: (search: string = "") => `${API_BASE_URL}/api/Friend/blocked${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    GET_FRIEND_STATUS: (otherUserId: string) => `${API_BASE_URL}/api/Friend/status/${otherUserId}`,
    SEND_FRIEND_REQUEST: `${API_BASE_URL}/api/Friend/request`,
    ACCEPT_FRIEND_REQUEST: (requestId: string) => `${API_BASE_URL}/api/Friend/requests/${requestId}/accept`,
    REJECT_FRIEND_REQUEST: (requestId: string) => `${API_BASE_URL}/api/Friend/requests/${requestId}/reject`,
    CANCEL_FRIEND_REQUEST: (requestId: string) => `${API_BASE_URL}/api/Friend/requests/${requestId}/cancel`,
    UNFRIEND: (otherUserId: string) => `${API_BASE_URL}/api/Friend/${otherUserId}`,
    BLOCK_USER: `${API_BASE_URL}/api/Friend/block`,
    UNBLOCK_USER: (otherUserId: string) => `${API_BASE_URL}/api/Friend/block/${otherUserId}`,

    // ─── Direct Chat ────────────────────────────────────────────────────
    GET_DIRECT_CHATS: (search: string = "") => `${API_BASE_URL}/api/DirectChat${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    GET_OR_CREATE_DIRECT_CHAT: (otherUserId: string) => `${API_BASE_URL}/api/DirectChat/with/${otherUserId}`,
    GET_DIRECT_CHAT_MESSAGES: (chatId: string, take: number = 100, before?: string) =>
        `${API_BASE_URL}/api/DirectChat/${chatId}/messages?take=${take}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    SEND_DIRECT_MESSAGE: (chatId: string) => `${API_BASE_URL}/api/DirectChat/${chatId}/messages`,
    MARK_DIRECT_CHAT_READ: (chatId: string) => `${API_BASE_URL}/api/DirectChat/${chatId}/read`,

    // ─── SignalR hub URLs ───────────────────────────────────────────────
    SIGNALR_DM_HUB: `${API_BASE_URL}/hubs/dm`,
};

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

let authToken: string | null = null;
export const setAuthToken = (token: string | null) => { authToken = token; };

let logoutListeners: (() => void)[] = [];
export const subscribeToLogout = (listener: () => void) => {
    logoutListeners.push(listener);
    return () => { logoutListeners = logoutListeners.filter(l => l !== listener); };
};
export const triggerLogout = () => { logoutListeners.forEach(l => l()); };

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use(async (config) => {
    try {
        const token = await SecureStore.getItemAsync('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        } else if (authToken) {
            config.headers.Authorization = `Bearer ${authToken}`;
        }
    } catch (e) {
        if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
}, (error) => Promise.reject(error));

let isRefreshing = false;
let failedQueue: { resolve: (val?: any) => void, reject: (err: any) => void }[] = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
};

apiClient.interceptors.response.use((response) => response, async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then(token => {
                originalRequest.headers.Authorization = 'Bearer ' + token;
                return apiClient(originalRequest);
            }).catch(err => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const refreshToken = await SecureStore.getItemAsync('refresh_token');
            const accessToken = await SecureStore.getItemAsync('access_token');

            if (refreshToken && accessToken) {
                const refreshResponse = await axios.post(`${API_BASE_URL}/api/Auth/refreshtoken`, {
                    AccessToken: accessToken,
                    RefreshToken: refreshToken
                });

                if (refreshResponse.data) {
                    const newAccess = refreshResponse.data.accessToken?.token || refreshResponse.data.accessToken || refreshResponse.data.AccessToken;
                    const newRefresh = refreshResponse.data.refreshToken || refreshResponse.data.RefreshToken;

                    if (newAccess && newRefresh) {
                        await SecureStore.setItemAsync('access_token', newAccess);
                        await SecureStore.setItemAsync('refresh_token', newRefresh);
                        authToken = newAccess;

                        originalRequest.headers.Authorization = 'Bearer ' + newAccess;
                        processQueue(null, newAccess);
                        return apiClient(originalRequest);
                    }
                }
            }
            throw new Error('Refresh failed');
        } catch (refreshError) {
            processQueue(refreshError, null);
            await SecureStore.deleteItemAsync('access_token');
            await SecureStore.deleteItemAsync('refresh_token');
            triggerLogout();
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }

    return Promise.reject(error);
});

export const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    try {
        const isFormData = options.body instanceof FormData;

        // 1. Priprema zaglavlja (Headers)
        let headers: Record<string, string> = {};
        if (options.headers) {
            if (options.headers instanceof Headers) {
                options.headers.forEach((value, key) => { headers[key] = value; });
            } else {
                headers = { ...(options.headers as any) };
            }
        }

        // 2. SPECIJALNA LOGIKA ZA FORM DATA (Slike/Fajlovi) - Fix za Android
        if (isFormData) {
            const token = await SecureStore.getItemAsync('access_token').catch(() => null) || authToken;

            const formHeaders = { ...headers };
            // KLJUČNO: Brišemo Content-Type da bi fetch sam dodao boundary
            delete formHeaders['Content-Type'];

            if (token) formHeaders['Authorization'] = `Bearer ${token}`;

            const fetchResponse = await fetch(url, {
                method: options.method || 'POST',
                headers: formHeaders,
                body: options.body
            });

            // Ako server vrati grešku (npr. 400, 413, 500)
            if (!fetchResponse.ok) {
                const errText = await fetchResponse.text().catch(() => 'Upload failed');
                return {
                    ok: false,
                    status: fetchResponse.status,
                    statusText: fetchResponse.statusText,
                    json: async () => {
                        try { return JSON.parse(errText); }
                        catch { throw new Error(errText); }
                    },
                    text: async () => errText,
                } as unknown as Response;
            }

            // Ako je sve u redu, vraćamo fetch response (koji ima .json() i .text())
            return fetchResponse;
        }

        // 3. LOGIKA ZA STANDARDNE JSON ZAHTEVE (Axios)
        if (!headers['Content-Type'] && (options.method === 'POST' || options.method === 'PUT')) {
            headers['Content-Type'] = 'application/json';
        }

        let routeUrl = url;
        if (routeUrl.startsWith(API_BASE_URL)) {
            routeUrl = routeUrl.replace(API_BASE_URL, '');
        }

        const response = await apiClient({
            method: options.method || 'GET',
            url: routeUrl,
            data: options.body,
            headers: headers,
        });

        // Pakujemo Axios odgovor da izgleda kao standardni Fetch Response
        return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            statusText: response.statusText,
            json: async () => response.data,
            text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        } as unknown as Response;

    } catch (error: any) {
        // 4. ERROR HANDLING (Mreža, Timeout, Axios errori)
        const response = error.response;
        return {
            ok: false,
            status: response ? response.status : 500,
            statusText: response ? response.statusText : error.message,
            json: async () => {
                const errData = response?.data?.messages || response?.data || 'API Error';
                throw new Error(typeof errData === 'string' ? errData : JSON.stringify(errData));
            },
            text: async () => {
                if (!response) return error.message;
                return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            },
        } as unknown as Response;
    }
};
/**
 * Extract a human-readable error message from an API error
 */
export function getErrorMessage(error: any): string {
    if (!error) return 'An unexpected error occurred';

    // If it's a string, try to parse it as JSON first
    if (typeof error === 'string') {
        if (error.startsWith('{') || error.startsWith('[')) {
            try {
                const parsed = JSON.parse(error);
                return getErrorMessage(parsed);
            } catch (e) {
                return error;
            }
        }
        return error;
    }

    // Handle Axios Errors
    if (axios.isAxiosError(error)) {
        const data = error.response?.data;

        console.log('[API Error Debug] Axios error data:', JSON.stringify(data));

        if (data) return getErrorMessage(data);

        return error.message;
    }

    // Handle generic Error objects
    if (error instanceof Error) {
        // If the message is JSON, parse it
        if (error.message.startsWith('{') || error.message.startsWith('[')) {
            try {
                const parsed = JSON.parse(error.message);
                return getErrorMessage(parsed);
            } catch (e) {
                return error.message;
            }
        }
        return error.message;
    }

    // Handle data objects (from axios.response.data or JSON.parse)
    if (typeof error === 'object') {
        const getField = (obj: any, field: string) => obj[field] || obj[field.charAt(0).toUpperCase() + field.slice(1)];

        const detail = getField(error, 'detail');
        if (detail && typeof detail === 'string') return detail;

        const message = getField(error, 'message');
        if (message && typeof message === 'string') return message;

        const err = getField(error, 'error');
        if (err && typeof err === 'string') return err;

        const messages = getField(error, 'messages');
        if (messages) {
            return Array.isArray(messages) ? messages.join(', ') : (typeof messages === 'string' ? messages : JSON.stringify(messages));
        }

        // Specifically handle ASP.NET un-named exceptions that might come as a JSON object with just one message key
        const values = Object.values(error);
        if (values.length === 1 && typeof values[0] === 'string') {
            return values[0] as string;
        }

        // Fallback for objects with many fields - look for anything that looks like a message
        for (const key in error) {
            if (key.toLowerCase().includes('message') && typeof error[key] === 'string') {
                return error[key];
            }
        }

        // If it's just an object we can't digest, stringify it
        return JSON.stringify(error);
    }

    return String(error);
}

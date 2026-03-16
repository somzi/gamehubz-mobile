// Environment configuration
const IS_PROD = !__DEV__;
const PROD_URL = 'https://codespheresolutions.dev';
// For local development on physical devices, use your computer's local IP
const LOCAL_IP = '192.168.0.3';
const LOCAL_PORT = '5057';
const LOCAL_URL = `http://${LOCAL_IP}:${LOCAL_PORT}`;

export const API_BASE_URL = PROD_URL;

console.log(`[API] Environment: ${IS_PROD ? 'Production' : 'Development'}`);
console.log(`[API] Base URL: ${API_BASE_URL}`);

export const ENDPOINTS = {
    SET_PASSWORD: `${API_BASE_URL}/api/Auth/setPassword`,
    HUBS: `${API_BASE_URL}/api/Hub/getAll`,
    GET_HUB: (id: string) => `${API_BASE_URL}/api/Hub/${id}`,
    GET_TOURNAMENT_STRUCTURE: (id: string) => `${API_BASE_URL}/api/tournament/${id}/structure`,
    UPDATE_PROFILE: `${API_BASE_URL}/api/user/update`,
    GET_PLAYER_STATS: (id: string) => `${API_BASE_URL}/api/userProfile/${id}/stats`,
    USER_SOCIAL: `${API_BASE_URL}/api/UserSocial`,
    GET_USER_INFO: (id: string) => `${API_BASE_URL}/api/UserProfile/${id}/info`,
    GET_USER_HUBS: (userId: string, pageNumber: number = 0) => `${API_BASE_URL}/api/Hub/user/${userId}/joined?pageNumber=${pageNumber}`,
    GET_DISCOVERY_HUBS: (userId: string, pageNumber: number = 0) => `${API_BASE_URL}/api/Hub/user/${userId}/discovery?pageNumber=${pageNumber}`,
    GET_PROFILE_TOURNAMENTS: (userId: string, pageNumber: number = 0) => `${API_BASE_URL}/api/UserProfile/${userId}/tournaments?pageNumber=${pageNumber}`,
    GET_PROFILE_MATCHES: (userId: string, pageNumber: number = 0) => `${API_BASE_URL}/api/UserProfile/${userId}/matches?pageNumber=${pageNumber}`,
    CREATE_TOURNAMENT: `${API_BASE_URL}/api/tournament`,
    GET_USER_TOURNAMENTS: (userId: string, status: number, page: number, pageSize: number = 10) =>
        `${API_BASE_URL}/api/User/${userId}/tournaments?Status=${status}&Page=${page}&PageSize=${pageSize}`,
    GET_TOURNAMENT: (id: string) => `${API_BASE_URL}/api/tournament/${id}`,
    GET_TOURNAMENT_OVERVIEW: (id: string) => `${API_BASE_URL}/api/tournament/${id}/overview`,
    REGISTER_TOURNAMENT: `${API_BASE_URL}/api/tournamentRegistration`,
    GET_PENDING_REGISTRATIONS: (tournamentId: string) => `${API_BASE_URL}/api/tournamentRegistration/tournament/${tournamentId}/pending`,
    APPROVE_REGISTRATION: `${API_BASE_URL}/api/tournamentRegistration/approve`,
    APPROVE_ALL_REGISTRATIONS: `${API_BASE_URL}/api/tournamentRegistration/approveAll`,
    REJECT_REGISTRATION: `${API_BASE_URL}/api/tournamentRegistration/reject`,
    GET_TOURNAMENT_PARTICIPANTS: (tournamentId: string) => `${API_BASE_URL}/api/TournamentParticipant/tournament/${tournamentId}`,
    REMOVE_PARTICIPANT: (tournamentId: string, userId: string) => `${API_BASE_URL}/api/TournamentParticipant/tournament/${tournamentId}/user/${userId}`,
    CREATE_BRACKET: `${API_BASE_URL}/api/tournament/createBracket`,
    REPORT_MATCH_RESULT: `${API_BASE_URL}/api/tournament/matchResult`,
    GET_HUB_TOURNAMENTS: (hubId: string, status: number, page: number, pageSize: number = 10) =>
        `${API_BASE_URL}/api/Hub/${hubId}/tournaments?Status=${status}&Page=${page}&PageSize=${pageSize}`,
    FOLLOW_HUB: `${API_BASE_URL}/api/userHub`,
    UNFOLLOW_HUB: (userId: string, hubId: string) => `${API_BASE_URL}/api/userHub/unfollow?userId=${userId}&hubId=${hubId}`,
    UPDATE_HUB: `${API_BASE_URL}/api/hub/update`,
    SUBMIT_MATCH_AVAILABILITY: `${API_BASE_URL}/api/match/availability`,
    GET_HUB_MEMBERS: (id: string) => `${API_BASE_URL}/api/Hub/${id}/members`,
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
    UPLOAD_MATCH_EVIDENCE: (id: string) => `${API_BASE_URL}/api/match/${id}/evidence`,
    GET_MATCH_DETAILS: (id: string) => `${API_BASE_URL}/api/match/${id}/details`,
    GET_MATCH_COMMENTS: (matchId: string) => `${API_BASE_URL}/api/MatchChat/${matchId}/history`,
    POST_MATCH_COMMENT: (matchId: string) => `${API_BASE_URL}/api/MatchChat/${matchId}`,
    UPLOAD_AVATAR: `${API_BASE_URL}/api/userProfile/avatar`,
    UPLOAD_HUB_AVATAR: (id: string) => `${API_BASE_URL}/api/hub/${id}/avatar`,
    DELETE_ACCOUNT: `${API_BASE_URL}/api/Auth`,
    FORGOT_PASSWORD: `${API_BASE_URL}/api/Auth/forgotPassword`,
    RESET_PASSWORD: `${API_BASE_URL}/api/Auth/resetPassword`,
    GET_ALL_HUB_ACTIVITY: (pageNumber: number) => `${API_BASE_URL}/api/hubActivity/all?pageNumber=${pageNumber}`,
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
                failedQueue.push({resolve, reject});
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
        
        let headers: Record<string, string> = {};
        if (options.headers) {
            if (options.headers instanceof Headers) {
                 options.headers.forEach((value, key) => { headers[key] = value; });
            } else {
                 headers = { ...(options.headers as any) };
            }
        }

        if (!headers['Content-Type'] && (options.method === 'POST' || options.method === 'PUT') && !isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        let routeUrl = url;
        if (routeUrl.startsWith(API_BASE_URL)) routeUrl = routeUrl.replace(API_BASE_URL, '');

        let bodyData = options.body;
        if (typeof bodyData === 'string' && !isFormData) {
             try { bodyData = JSON.parse(bodyData); } catch(e) {}
        }
        
        const response = await apiClient({
            method: options.method || 'GET',
            url: routeUrl,
            data: isFormData ? options.body : bodyData,
            headers: headers,
        });

        // Add `.text()` to resolve returning empty string when response.data is undefined or null
        return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            statusText: response.statusText,
            json: async () => response.data,
            text: async () => typeof response.data === 'string' ? response.data : (response.data ? JSON.stringify(response.data) : ''),
        } as unknown as Response;
    } catch (error: any) {
        const response = error.response;
        return {
            ok: false,
            status: response ? response.status : 500,
            statusText: response ? response.statusText : error.message,
            json: async () => { throw new Error(response?.data?.messages || response?.data || 'API Error'); },
            text: async () => { 
                if (!response) return error.message;
                return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            },
        } as unknown as Response;
    }
};

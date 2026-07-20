// Environment configuration
const IS_PROD = !__DEV__;
const PROD_URL = 'https://codespheresolutions.dev';
// For local development on physical devices, use your computer's local IP
const LOCAL_IP = '192.168.1.44';
const LOCAL_PORT = '5057';
const LOCAL_URL = `http://${LOCAL_IP}:${LOCAL_PORT}`;

export const API_BASE_URL = IS_PROD ? PROD_URL : LOCAL_URL;

export const ENDPOINTS = {
    SET_PASSWORD: `${API_BASE_URL}/api/Auth/setPassword`,
    HUBS: `${API_BASE_URL}/api/Hub/getAll`,
    GET_HUB: (id: string) => `${API_BASE_URL}/api/Hub/${id}`,
    GET_TOURNAMENT_STRUCTURE: (id: string) => `${API_BASE_URL}/api/tournament/${id}/structure`,
    GET_TOURNAMENT_STRUCTURE_V2: (id: string) => `${API_BASE_URL}/api/tournament/${id}/structure/v2`,
    // v3: group-stage matches in team tournaments come back as one Team-vs-Team card per team match
    // (v1/v2 return the per-player sub-matches). Carries the same CanManage/approval fields as v2.
    GET_TOURNAMENT_STRUCTURE_V3: (id: string) => `${API_BASE_URL}/api/tournament/${id}/structure/v3`,
    UPDATE_PROFILE: `${API_BASE_URL}/api/user/update`,
    GET_PLAYER_STATS: (id: string) => `${API_BASE_URL}/api/UserProfile/v2/${id}/stats`,
    USER_SOCIAL: `${API_BASE_URL}/api/UserSocial`,
    GET_USER_INFO: (id: string) => `${API_BASE_URL}/api/UserProfile/${id}/info`,
    // Discord bot account link (OAuth runs fully on the backend; the app just opens authorizeUrl).
    // Link status arrives on GET_USER_INFO as discordUsername + discordDmEnabled.
    DISCORD_LINK_START: `${API_BASE_URL}/api/Discord/link/start`,
    DISCORD_UNLINK: `${API_BASE_URL}/api/Discord/link`,
    DISCORD_DM_ENABLED: `${API_BASE_URL}/api/Discord/dm-enabled`,
    DISCORD_SHOW_ON_PROFILE: `${API_BASE_URL}/api/Discord/show-on-profile`,
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
    // v3: same as v2 plus HasUserRegistered so the client can render the Join / Registered state
    // without firing a second CHECK_REGISTRATION request on open.
    GET_TOURNAMENT_OVERVIEW_V3: (id: string) => `${API_BASE_URL}/api/tournament/${id}/overview/v3`,
    REGISTER_TOURNAMENT: `${API_BASE_URL}/api/tournamentRegistration`,
    REGISTER_TEAM_IN_TOURNAMENT: (tournamentId: string, teamId: string) => `${API_BASE_URL}/api/tournamentRegistration/tournament/${tournamentId}/team/${teamId}/register`,
    GET_PENDING_REGISTRATIONS: (tournamentId: string) => `${API_BASE_URL}/api/tournamentRegistration/tournament/${tournamentId}/pending`,
    APPROVE_REGISTRATION: `${API_BASE_URL}/api/tournamentRegistration/approve`,
    APPROVE_ALL_REGISTRATIONS: `${API_BASE_URL}/api/tournamentRegistration/approveAll`,
    REJECT_REGISTRATION: `${API_BASE_URL}/api/tournamentRegistration/reject`,
    GET_TOURNAMENT_PARTICIPANTS: (tournamentId: string) => `${API_BASE_URL}/api/TournamentParticipant/tournament/${tournamentId}`,
    REMOVE_PARTICIPANT: (tournamentId: string, userId: string) => `${API_BASE_URL}/api/TournamentParticipant/tournament/${tournamentId}/user/${userId}`,
    CREATE_BRACKET: `${API_BASE_URL}/api/tournament/createBracket`,
    // Admin-only: tear the knockout bracket back down (group results kept) so a mistake can be fixed,
    // then re-draw it from the standings on demand.
    RESET_BRACKET: (id: string) => `${API_BASE_URL}/api/tournament/${id}/bracket/reset`,
    DRAW_BRACKET: (id: string) => `${API_BASE_URL}/api/tournament/${id}/bracket/draw`,
    // Admin-only: manually swap two first-round teams' bracket positions (re-seed).
    SWAP_BRACKET: (id: string) => `${API_BASE_URL}/api/tournament/${id}/bracket/swap`,
    REPORT_MATCH_RESULT: `${API_BASE_URL}/api/tournament/matchResult`,
    APPROVE_MATCH_RESULT: `${API_BASE_URL}/api/tournament/matchResult/approve`,
    REJECT_MATCH_RESULT: `${API_BASE_URL}/api/tournament/matchResult/reject`,
    REVERT_MATCH_RESULT: `${API_BASE_URL}/api/tournament/matchResult/revert`,
    CASCADE_REVERT_PREVIEW: `${API_BASE_URL}/api/tournament/matchResult/cascadePreview`,
    DOUBLE_WALKOVER: `${API_BASE_URL}/api/tournament/matchResult/doubleWalkover`,
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
    // One-shot combined payload: match details + streams + caller availability. Lets the
    // match modal open in one round-trip instead of three back-to-back fetches.
    GET_MATCH_DETAILS_FULL: (id: string) => `${API_BASE_URL}/api/match/${id}/details/full`,
    GET_MATCH_COMMENTS: (matchId: string, take?: number, before?: string) => {
        const qs = [
            take != null ? `take=${take}` : '',
            before ? `before=${encodeURIComponent(before)}` : '',
        ].filter(Boolean).join('&');
        return `${API_BASE_URL}/api/MatchChat/${matchId}/history${qs ? `?${qs}` : ''}`;
    },
    POST_MATCH_COMMENT: (matchId: string) => `${API_BASE_URL}/api/MatchChat/${matchId}`,
    MARK_MATCH_CHAT_READ: (matchId: string) => `${API_BASE_URL}/api/MatchChat/${matchId}/read`,
    UPLOAD_AVATAR: `${API_BASE_URL}/api/userProfile/avatar`,
    UPLOAD_HUB_AVATAR: (id: string) => `${API_BASE_URL}/api/hub/${id}/avatar`,
    DELETE_HUB: (id: string) => `${API_BASE_URL}/api/hub/${id}`,
    REMOVE_TEAM_FROM_TOURNAMENT: (tournamentId: string, teamId: string) => `${API_BASE_URL}/api/tournamentParticipant/tournament/${tournamentId}/team/${teamId}`,
    DELETE_ACCOUNT: `${API_BASE_URL}/api/Auth`,
    FORGOT_PASSWORD: `${API_BASE_URL}/api/Auth/forgotPassword`,
    // v2: backend never returns the OTP in the body (it's emailed) and always reports success,
    // so we always continue to the OTP entry screen regardless of whether the email is registered.
    FORGOT_PASSWORD_V2: `${API_BASE_URL}/api/Auth/v2/forgotPassword`,
    RESET_PASSWORD: `${API_BASE_URL}/api/Auth/resetPassword`,
    GET_ALL_HUB_ACTIVITY: (pageNumber: number) => `${API_BASE_URL}/api/hubActivity/all?pageNumber=${pageNumber}`,
    EXPORT_BRACKET_PDF: (id: string) => `${API_BASE_URL}/api/tournament/${id}/export/pdf`,
    PUSH_TOKEN: `${API_BASE_URL}/api/user/push-token`,
    SET_MATCH_SCHEDULED: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/schedule`,

    // ─── Match streaming ────────────────────────────────────────────────
    GET_MATCH_STREAM: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/stream`,
    GET_MATCH_STREAMS: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/streams`,
    START_MATCH_STREAM: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/stream/start`,
    END_MATCH_STREAM: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/stream/end`,
    SET_MATCH_STREAM_VOD: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/stream/vod`,
    DELETE_MATCH_STREAM: (matchId: string, streamerUserId?: string) =>
        `${API_BASE_URL}/api/match/${matchId}/stream${streamerUserId ? `?streamerUserId=${encodeURIComponent(streamerUserId)}` : ''}`,

    // ─── Match admin help ───────────────────────────────────────────────
    REQUEST_MATCH_ADMIN_HELP: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/adminHelp`,
    RESOLVE_MATCH_ADMIN_HELP: (matchId: string) => `${API_BASE_URL}/api/match/${matchId}/adminHelp/resolve`,
    GET_ADMIN_HELP_REQUESTS: (tournamentId: string) => `${API_BASE_URL}/api/match/adminHelp/tournament/${tournamentId}`,
    GET_PENDING_APPROVALS: (tournamentId: string) => `${API_BASE_URL}/api/match/pendingApproval/tournament/${tournamentId}`,

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
    GET_DIRECT_CHAT_BY_ID: (chatId: string) => `${API_BASE_URL}/api/DirectChat/${chatId}`,
    GET_OR_CREATE_DIRECT_CHAT: (otherUserId: string) => `${API_BASE_URL}/api/DirectChat/with/${otherUserId}`,
    GET_DIRECT_CHAT_MESSAGES: (chatId: string, take: number = 100, before?: string) =>
        `${API_BASE_URL}/api/DirectChat/${chatId}/messages?take=${take}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    SEND_DIRECT_MESSAGE: (chatId: string) => `${API_BASE_URL}/api/DirectChat/${chatId}/messages`,
    MARK_DIRECT_CHAT_READ: (chatId: string) => `${API_BASE_URL}/api/DirectChat/${chatId}/read`,

    // ─── Country catalog ────────────────────────────────────────────────
    GET_COUNTRIES: `${API_BASE_URL}/api/Country`,

    // ─── Notification badges ────────────────────────────────────────────
    GET_BADGES: `${API_BASE_URL}/api/v2/badges`,
    GET_BADGE_APPROVALS: `${API_BASE_URL}/api/v2/badges/approvals`,

    // ─── SignalR hub URLs ───────────────────────────────────────────────
    SIGNALR_DM_HUB: `${API_BASE_URL}/hubs/dm`,
    SIGNALR_USER_HUB: `${API_BASE_URL}/hubs/user`,
};

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Sent on every request so server-side ErrorLog rows record which app build/platform hit
// the bug — set once at startup.
const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';
const APP_PLATFORM = Platform.OS;

let authToken: string | null = null;
export const setAuthToken = (token: string | null) => { authToken = token; };

let logoutListeners: (() => void)[] = [];
export const subscribeToLogout = (listener: () => void) => {
    logoutListeners.push(listener);
    return () => { logoutListeners = logoutListeners.filter(l => l !== listener); };
};
export const triggerLogout = () => { logoutListeners.forEach(l => l()); };

// 15 second network timeout. On a solid connection every real endpoint responds
// in well under a second; anything past 15s is almost always a hung TLS handshake
// or a stuck server response that used to leave the UI spinner spinning forever.
// Timeouts surface as a normal axios error that our interceptors and callers
// already handle, and react-query will surface the retry-once behaviour on top.
const NETWORK_TIMEOUT_MS = 15_000;

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: NETWORK_TIMEOUT_MS,
});

apiClient.interceptors.request.use(async (config) => {
    config.headers['X-App-Version'] = APP_VERSION;
    config.headers['X-Platform'] = APP_PLATFORM;
    try {
        // Prefer the in-memory token. It's kept current on bootstrap, login and refresh,
        // so we avoid an encrypted-keystore read (SecureStore) on every single request —
        // that read is several ms of crypto/disk per call on Android. SecureStore is only
        // consulted as a cold-start fallback before AuthContext has populated authToken.
        let token = authToken;
        if (!token) {
            token = await SecureStore.getItemAsync('access_token');
            if (token) authToken = token;
        }
        if (token) config.headers.Authorization = `Bearer ${token}`;
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

/**
 * Perform a single token refresh against the backend and persist the new pair.
 * Updates the in-memory authToken so subsequent requests pick it up immediately.
 * Throws on any failure (caller decides whether to log the user out).
 * Shared by the axios 401 interceptor and the raw-fetch upload path so uploads
 * get the same refresh-and-retry behaviour as JSON requests.
 */
async function doRefresh(): Promise<string> {
    const refreshToken = await SecureStore.getItemAsync('refresh_token');
    const accessToken = await SecureStore.getItemAsync('access_token');
    if (!refreshToken || !accessToken) throw new Error('Refresh failed');

    const refreshResponse = await axios.post(`${API_BASE_URL}/api/Auth/refreshtoken`, {
        AccessToken: accessToken,
        RefreshToken: refreshToken,
    });

    const data = refreshResponse.data;
    const newAccess = data?.accessToken?.token || data?.accessToken || data?.AccessToken;
    const newRefresh = data?.refreshToken || data?.RefreshToken;
    if (!newAccess || !newRefresh) throw new Error('Refresh failed');

    await SecureStore.setItemAsync('access_token', newAccess);
    await SecureStore.setItemAsync('refresh_token', newRefresh);
    authToken = newAccess;
    return newAccess;
}

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
            const newAccess = await doRefresh();
            originalRequest.headers.Authorization = 'Bearer ' + newAccess;
            processQueue(null, newAccess);
            return apiClient(originalRequest);
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
            const buildFormHeaders = (token: string | null) => {
                const h = { ...headers };
                // KLJUČNO: Brišemo Content-Type da bi fetch sam dodao boundary
                delete h['Content-Type'];
                h['X-App-Version'] = APP_VERSION;
                h['X-Platform'] = APP_PLATFORM;
                if (token) h['Authorization'] = `Bearer ${token}`;
                return h;
            };

            // Prefer the in-memory token (same reasoning as the axios interceptor).
            let token = authToken || (await SecureStore.getItemAsync('access_token').catch(() => null));

            // Uploads get a longer timeout than regular JSON calls — 90s covers even a
            // heavy set of match-evidence screenshots on a slow LTE link. Anything past
            // that is almost certainly a stuck connection; the AbortController rejects
            // the fetch with a normal error so the caller can surface it (same code
            // path as the "Upload failed" branch below).
            const uploadTimeout = 90_000;

            const doUpload = async (activeToken: string | null) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), uploadTimeout);
                try {
                    return await fetch(url, {
                        method: options.method || 'POST',
                        headers: buildFormHeaders(activeToken),
                        body: options.body,
                        signal: controller.signal,
                    });
                } finally {
                    clearTimeout(timer);
                }
            };

            let fetchResponse = await doUpload(token);

            // Uploads use raw fetch and so bypass the axios 401→refresh interceptor.
            // Handle the same refresh-and-retry here once, so an expired token mid-upload
            // doesn't silently fail (e.g. avatar / match evidence upload on a stale session).
            if (fetchResponse.status === 401) {
                try {
                    const newAccess = await doRefresh();
                    fetchResponse = await doUpload(newAccess);
                } catch {
                    await SecureStore.deleteItemAsync('access_token').catch(() => { });
                    await SecureStore.deleteItemAsync('refresh_token').catch(() => { });
                    triggerLogout();
                }
            }

            // Ako server vrati grešku (npr. 400, 413, 500)
            if (!fetchResponse.ok) {
                const errText = await fetchResponse.text().catch(() => 'Upload failed');
                // Never surface the raw error body (stack trace / JSON) to the UI.
                const friendly = getApiErrorMessage(errText, 'Upload failed');
                return {
                    ok: false,
                    status: fetchResponse.status,
                    statusText: fetchResponse.statusText,
                    json: async () => {
                        try { return JSON.parse(errText); }
                        catch { throw new Error(friendly); }
                    },
                    text: async () => friendly,
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
        // Surface a clean, human message (+ support reference) — never the raw response
        // body. The backend no longer ships stack traces, and we never dump JSON at the user.
        const friendly = response
            ? getApiErrorMessage(response.data, error.message || 'API Error')
            : (error.message || 'Network error');
        return {
            ok: false,
            status: response ? response.status : 500,
            statusText: response ? response.statusText : error.message,
            json: async () => { throw new Error(friendly); },
            text: async () => friendly,
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

/**
 * Pull the ErrorLog reference id (if any) out of an API error payload so users can quote
 * a short code when reporting a problem. Accepts an object or a JSON string.
 */
function extractErrorId(data: any): string | null {
    if (data == null) return null;

    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try { return extractErrorId(JSON.parse(trimmed)); } catch { return null; }
        }
        return null;
    }

    if (typeof data === 'object') {
        const id = (data as any).errorId ?? (data as any).ErrorId;
        return typeof id === 'string' && id.length > 0 ? id : null;
    }

    return null;
}

/**
 * Build a clean, user-facing error string from an API error payload: the server's human
 * message only — never a stack trace or raw JSON — with the support reference appended
 * when the server provides one.
 */
export function getApiErrorMessage(data: any, fallback = 'An unexpected error occurred'): string {
    let message: string;
    try { message = getErrorMessage(data); } catch { message = fallback; }

    if (!message || message.trim() === '' || message === '{}' || message === '[]') {
        message = fallback;
    }

    const errorId = extractErrorId(data);
    if (errorId) {
        const shortRef = errorId.split('-')[0];
        return `${message}\n(Ref: ${shortRef})`;
    }

    return message;
}

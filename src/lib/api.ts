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
    CLOSE_REGISTRATION: (id: string) => `${API_BASE_URL}/api/tournament/${id}/closeRegistration`,
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
    SET_ROUND_DEADLINE: (id: string) => `${API_BASE_URL}/api/tournament/${id}/roundDeadline`,
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

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
    authToken = token;
};

export const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
    } else {
        console.warn(`[API] authenticatedFetch called without token for: ${url}`);
    }

    // Default to json content type if not set (for POST/PUT) and not FormData
    if (!headers.has('Content-Type') && (options.method === 'POST' || options.method === 'PUT') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    console.log(`[API] ${options.method || 'GET'} -> ${url} (Auth: ${!!authToken})`);

    const response = await fetch(url, {
        ...options,
        headers,
    });

    console.log(`[API] ${options.method || 'GET'} <- ${url} (${response.status} ${response.statusText})`);
    return response;
};

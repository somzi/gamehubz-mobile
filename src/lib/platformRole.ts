// The platform role travels in the access token's role claim — the same claim the backend's
// AccessTokenReader parses into UserRoleEnum. Nothing else the app loads carries it: the login
// payload has it, but refreshUser() overwrites the stored user with the /info profile, which
// doesn't. UI gating only — every admin-only action is still refused server-side.
const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

export function isPlatformAdminToken(token: string | null | undefined): boolean {
    if (!token || typeof atob !== 'function') return false;
    try {
        const part = token.split('.')[1];
        if (!part) return false;
        const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
        const role = payload?.[ROLE_CLAIM] ?? payload?.role;
        const roles: unknown[] = Array.isArray(role) ? role : [role];
        return roles.some(r => typeof r === 'string' && r.toLowerCase() === 'admin');
    } catch {
        return false;
    }
}

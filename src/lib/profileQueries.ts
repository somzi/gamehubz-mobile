import i18n from '../i18n';
import { authenticatedFetch, ENDPOINTS } from './api';
import type { UserInfo } from '../types/auth';
import type { PlayerMatchesDto } from '../types/user';

/**
 * Query keys and fetchers for the profile screens' blocking load — the request that decides whether
 * the screen paints at all.
 *
 * These screens used to hold their own `useState` + `fetch` + `isLoading`, so every visit started
 * from a blank screen with a spinner, even when you had just been looking at that exact hub or
 * player. Behind react-query they paint the last snapshot straight away (the persister in App.tsx
 * carries it across cold starts) and refetch underneath. Caching is first-paint only: `staleTime` is
 * 30s at the call sites, so anything older refetches on mount, and the screens invalidate after
 * their own mutations.
 */

export const HUB_KEY = (hubId: string) => ['hub', hubId] as const;
export const PLAYER_PROFILE_KEY = (userId: string) => ['player-profile', userId] as const;

export async function fetchHub(hubId: string): Promise<any> {
    const response = await authenticatedFetch(ENDPOINTS.GET_HUB(hubId));
    if (!response.ok) {
        throw new Error(i18n.t('hub:profile.fetchFailed'));
    }
    const data = await response.json();
    return data.result || data;
}

/** The player header: identity and the career numbers beside it, fetched together. */
export interface PlayerProfileData {
    userInfo: UserInfo | null;
    playerMatches: PlayerMatchesDto | null;
}

export async function fetchPlayerProfile(userId: string): Promise<PlayerProfileData> {
    // One round trip's worth of latency for both, as before.
    const [infoRes, statsRes] = await Promise.all([
        authenticatedFetch(ENDPOINTS.GET_USER_INFO(userId)),
        authenticatedFetch(ENDPOINTS.GET_PLAYER_STATS(userId)),
    ]);

    // Half a profile is still worth showing — only a total failure is an error. Kept from the
    // original inline fetch, along with every casing fallback below: the API answers in both.
    if (!infoRes.ok && !statsRes.ok) {
        throw new Error(i18n.t('profile:couldNotLoadPlayer'));
    }

    let userInfo: UserInfo | null = null;
    if (infoRes.ok) {
        const infoData = await infoRes.json();
        const d = infoData.result || infoData;
        userInfo = {
            ...d,
            id: d.id || d.Id,
            username: d.username || d.Username,
            nickName: d.nickName || d.NickName || d.Nickname || d.nickname,
            avatarUrl: d.avatarUrl || d.AvatarUrl || d.Avatar || d.avatar,
        };
    }

    let playerMatches: PlayerMatchesDto | null = null;
    if (statsRes.ok) {
        const statsData = await statsRes.json();
        const s = statsData.result || statsData;
        playerMatches = {
            stats: s.stats || s.Stats ? {
                totalMatches: s.stats?.TotalMatches || s.stats?.totalMatches || s.Stats?.TotalMatches || s.Stats?.totalMatches || 0,
                wins: s.stats?.Wins || s.stats?.wins || s.Stats?.Wins || s.Stats?.wins || 0,
                losses: s.stats?.Losses || s.stats?.losses || s.Stats?.Losses || s.Stats?.losses || 0,
                draws: s.stats?.Draws || s.stats?.draws || s.Stats?.Draws || s.Stats?.draws || 0,
                tournamentsWon: s.stats?.tournamentsWon || s.Stats?.tournamentsWon || s.stats?.tournamentsWon || 0,
                winRate: s.stats?.WinRate || s.stats?.winRate || s.Stats?.WinRate || s.Stats?.winRate || 0,
            } : null,
            performance: (s.performance || s.Performance || []).map((m: any) => ({
                outcome: (m.outcome || m.Outcome || 'L') as 'W' | 'L' | 'D',
            })),
        };
    }

    return { userInfo, playerMatches };
}

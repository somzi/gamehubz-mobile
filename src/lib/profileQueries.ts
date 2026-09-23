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
        playerMatches = normalizePlayerMatches(statsData.result || statsData);
    }

    return { userInfo, playerMatches };
}

/** The stats endpoint's payload, shared by both profile screens. */
export function normalizePlayerMatches(s: any): PlayerMatchesDto {
    const raw = s.stats || s.Stats;
    return {
        stats: raw ? {
            totalMatches: raw.TotalMatches || raw.totalMatches || 0,
            wins: raw.Wins || raw.wins || 0,
            losses: raw.Losses || raw.losses || 0,
            draws: raw.Draws || raw.draws || 0,
            tournamentsWon: raw.TournamentsWon || raw.tournamentsWon || 0,
            winRate: raw.WinRate || raw.winRate || 0,
            // No `|| 0` here: an API without these fields must read as "unknown", not as zero.
            tournamentsPlayed: raw.tournamentsPlayed ?? raw.TournamentsPlayed,
            longestWinStreak: raw.longestWinStreak ?? raw.LongestWinStreak,
        } : null,
        performance: (s.performance || s.Performance || []).map((m: any) => ({
            outcome: (m.outcome || m.Outcome || 'L') as 'W' | 'L' | 'D',
        })),
    };
}

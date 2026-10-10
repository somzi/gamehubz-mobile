import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from './api';
import { SocialType } from '../types/auth';

/**
 * Twitch / Kick channels linked for the in-app broadcast. Linking is the Discord pattern: the backend
 * runs the whole OAuth exchange, the app only opens the authorize url in the system browser and
 * refetches when it comes back to the foreground. Tokens never reach the phone.
 */

export type StreamAccountPlatform = SocialType.Twitch | SocialType.Kick;

export const BROADCAST_PLATFORMS: StreamAccountPlatform[] = [SocialType.Twitch, SocialType.Kick];

export interface StreamAccount {
    platform: StreamAccountPlatform;
    login: string;
    displayName?: string | null;
    channelUrl?: string | null;
    needsRelink: boolean;
    linkedOn: string;
}

export interface StreamAccountsState {
    accounts: StreamAccount[];
    /** Platforms the server can link right now (credentials configured there). */
    availablePlatforms: StreamAccountPlatform[];
}

export const STREAM_ACCOUNTS_KEY = (userId: string | undefined) => ['stream-accounts', userId ?? ''] as const;

export const platformSlug = (platform: StreamAccountPlatform): 'twitch' | 'kick' =>
    platform === SocialType.Kick ? 'kick' : 'twitch';

export async function fetchStreamAccounts(): Promise<StreamAccountsState> {
    const response = await authenticatedFetch(ENDPOINTS.STREAM_ACCOUNTS);
    if (!response.ok) throw new Error(`STREAM_ACCOUNTS failed: ${response.status}`);
    const data = await response.json();
    const d = data.result || data;
    return {
        accounts: (d.accounts || []) as StreamAccount[],
        availablePlatforms: (d.availablePlatforms || []) as StreamAccountPlatform[],
    };
}

export function useStreamAccounts(userId: string | undefined, enabled = true) {
    return useQuery({
        queryKey: STREAM_ACCOUNTS_KEY(userId),
        queryFn: fetchStreamAccounts,
        enabled: enabled && !!userId,
        staleTime: 30_000,
    });
}

/** Opens the platform's consent page. The caller refetches once the app is active again. */
export async function startStreamLink(platform: StreamAccountPlatform): Promise<void> {
    const response = await authenticatedFetch(ENDPOINTS.STREAM_ACCOUNT_LINK_START(platformSlug(platform)));
    if (!response.ok) throw new Error(getErrorMessage(await response.text()));
    const data = await response.json();
    const authorizeUrl = data.authorizeUrl || data.result?.authorizeUrl;
    if (!authorizeUrl) throw new Error('No authorize URL in response');
    await Linking.openURL(authorizeUrl);
}

export async function unlinkStreamAccount(platform: StreamAccountPlatform): Promise<void> {
    const response = await authenticatedFetch(ENDPOINTS.STREAM_ACCOUNT_UNLINK(platformSlug(platform)), {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error(getErrorMessage(await response.text()));
}

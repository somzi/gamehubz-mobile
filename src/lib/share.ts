import { Alert, Platform, Share, ToastAndroid } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export const SHARE_BASE_URL = 'https://share.codespheresolutions.dev';

type ShareTarget = 'tournament' | 'player' | 'hub';

// The share site exposes player profiles as /user/..., while the in-app
// route (and the gamehubz:// deep link) is player/...
const WEB_PATHS: Record<ShareTarget, string> = {
    tournament: 'tournament',
    hub: 'hub',
    player: 'user',
};

export function buildShareUrl(target: ShareTarget, id: string) {
    return `${SHARE_BASE_URL}/${WEB_PATHS[target]}/${id}`;
}

function notify(message: string) {
    if (Platform.OS === 'android') {
        ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
        Alert.alert(message);
    }
}

export async function copyShareLink(url: string) {
    await Clipboard.setStringAsync(url);
    notify('Link copied to clipboard');
}

interface ShareLinkOptions {
    title: string;
    description: string;
    url: string;
}

export async function shareLink({ title, description, url }: ShareLinkOptions) {
    const content = Platform.OS === 'ios'
        ? {
            title,
            message: description,
            url,
        }
        : {
            title,
            message: `${description}\n${url}`,
        };

    try {
        await Share.share(content, Platform.OS === 'android' ? { dialogTitle: title } : undefined);
    } catch {
        try {
            await copyShareLink(url);
        } catch {
            notify('Could not share the link');
        }
    }
}

export function shareTournament(id: string, name?: string) {
    return shareLink({
        title: name || 'Tournament',
        description: name ? `Join ${name} on GameHubz.` : 'Join this tournament on GameHubz.',
        url: buildShareUrl('tournament', id),
    });
}

export function shareHub(id: string, name?: string) {
    return shareLink({
        title: name || 'Hub',
        description: name ? `Check out ${name} on GameHubz.` : 'Check out this hub on GameHubz.',
        url: buildShareUrl('hub', id),
    });
}

export function shareUser(id: string, name?: string) {
    return shareLink({
        title: name || 'Player Profile',
        description: name ? `View ${name} on GameHubz.` : 'View this player on GameHubz.',
        url: buildShareUrl('player', id),
    });
}

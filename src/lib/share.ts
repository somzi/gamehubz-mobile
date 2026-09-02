import i18n from '../i18n';
import { Alert, Platform, Share, ToastAndroid } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export const SHARE_BASE_URL = 'https://share.codespheresolutions.dev';

type ShareTarget = 'tournament' | 'player' | 'hub' | 'team';

// The share site exposes player profiles as /user/..., while the in-app
// route (and the gamehubz:// deep link) is player/...
const WEB_PATHS: Record<ShareTarget, string> = {
    tournament: 'tournament',
    hub: 'hub',
    player: 'user',
    team: 'team',
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
    notify(i18n.t('common:linkCopied'));
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
            notify(i18n.t('common:couldNotShare'));
        }
    }
}

export function shareTournament(id: string, name?: string) {
    return shareLink({
        title: name || i18n.t('common:shareLinks.tournament'),
        description: name ? i18n.t('common:shareLinks.joinTournament', { name }) : i18n.t('common:shareLinks.joinTournamentGeneric'),
        url: buildShareUrl('tournament', id),
    });
}

export function shareHub(id: string, name?: string) {
    return shareLink({
        title: name || i18n.t('common:shareLinks.hub'),
        description: name ? i18n.t('common:shareLinks.checkOutHub', { name }) : i18n.t('common:shareLinks.checkOutHubGeneric'),
        url: buildShareUrl('hub', id),
    });
}

export function shareUser(id: string, name?: string) {
    return shareLink({
        title: name || i18n.t('common:shareLinks.playerProfile'),
        description: name ? i18n.t('common:shareLinks.viewPlayer', { name }) : i18n.t('common:shareLinks.viewPlayerGeneric'),
        url: buildShareUrl('player', id),
    });
}

export function shareTeam(id: string, name?: string) {
    return shareLink({
        title: name || 'Team',
        description: name ? i18n.t('common:shareLinks.joinTournament', { name }) : i18n.t('common:shareLinks.joinTeamGeneric'),
        url: buildShareUrl('team', id),
    });
}

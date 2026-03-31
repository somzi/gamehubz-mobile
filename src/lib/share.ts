import { Platform, Share } from 'react-native';

type ShareTarget = 'tournament' | 'player' | 'hub';

interface ShareDeepLinkOptions {
    title: string;
    description: string;
    deepLink: string;
}

export function buildDeepLink(target: ShareTarget, id: string) {
    return `gamehubz://${target}/${id}`;
}

export async function shareDeepLink({ title, description, deepLink }: ShareDeepLinkOptions) {
    const content = Platform.OS === 'ios'
        ? {
            title,
            message: description,
            url: deepLink,
        }
        : {
            title,
            message: `${description}\n\nOpen in GameHubz:\n${deepLink}`,
        };

    await Share.share(content, Platform.OS === 'android' ? { dialogTitle: title } : undefined);
}
export const getSocialUrl = (platform: string, username: string): string => {
    if (!username) return '#';

    // Clean username (remove @ if present)
    const cleanUsername = username.startsWith('@') ? username.substring(1) : username;

    switch (platform.toLowerCase()) {
        case 'instagram':
            return `https://instagram.com/${cleanUsername}`;
        case 'twitter':
        case 'x':
            return `https://x.com/${cleanUsername}`;
        case 'facebook':
            return `https://facebook.com/${cleanUsername}`;
        case 'tiktok':
            return `https://tiktok.com/@${cleanUsername}`;
        case 'youtube':
            // YouTube can have /c/, /user/, or /@ depending on the type, but /@ is most common now
            return `https://youtube.com/@${cleanUsername}`;
        case 'twitch':
            return `https://twitch.tv/${cleanUsername}`;
        case 'kick':
            return `https://kick.com/${cleanUsername}`;
        case 'discord': {
            // If it's already a full URL containing discord.gg, normalize it
            if (cleanUsername.includes('discord.gg/')) {
                const code = cleanUsername.split('discord.gg/').pop()?.split('/')[0];
                return code ? `https://discord.gg/${code}` : '#';
            }
            // If it looks like an invite code (short alphanumeric, no # or . or @)
            if (/^[a-zA-Z0-9_-]{2,20}$/.test(cleanUsername)) {
                return `https://discord.gg/${cleanUsername}`;
            }
            // Otherwise it's a username (e.g. john#1234) — no url, handle as copy
            return '#';
        }
        case 'telegram':
            return `https://t.me/${cleanUsername}`;
        default:
            return '#';
    }
};

type MappedSocialLink = { platform: any; username: string; url?: string };

/**
 * Folds the OAuth-linked Discord into a profile's mapped social links: it becomes the Discord chip
 * (a real user id → a working discord.com/users profile link, which a manual username never yields)
 * and replaces any legacy manual Discord entry so the icon isn't shown twice. When there's no linked
 * id, the list passes through unchanged.
 */
export const withDiscordProfileLink = (
    mappedLinks: MappedSocialLink[],
    discordUserId?: string | null,
    discordUsername?: string | null,
): MappedSocialLink[] => {
    if (!discordUserId) return mappedLinks;
    return [
        ...mappedLinks.filter(l => l.platform !== 'discord'),
        { platform: 'discord', username: discordUsername || 'Discord', url: `https://discord.com/users/${discordUserId}` },
    ];
};

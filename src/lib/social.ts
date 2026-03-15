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
        case 'discord':
            // Discord doesn't have a direct profile URL for users in the same way, 
            // but we can return the username or a search link if needed.
            // For now, let's return '#' as it usually requires an invite link or specific channel link.
            return '#';
        case 'telegram':
            return `https://t.me/${cleanUsername}`;
        default:
            return '#';
    }
};

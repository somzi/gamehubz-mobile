import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../../lib/theme';
import { getOptimizedCloudinaryUrl } from '../../lib/image';

// Muted tones for players without a photo, so a list of them isn't a column of identical grey
// circles. Each name always gets the same tone.
const INITIAL_TONES = ['#34D399', '#60A5FA', '#A78BFA', '#FBBF24', '#F472B6', '#22D3EE'];

function toneFor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return INITIAL_TONES[hash % INITIAL_TONES.length];
}

/**
 * A player's round avatar at any size, for Social and direct messages: the photo (sized through
 * Cloudinary, like PlayerAvatar), or the initials on the player's own tone.
 */
export const SocialAvatar = React.memo(function SocialAvatar({
    src,
    name,
    size,
}: {
    src?: string | null;
    name: string;
    size: number;
}) {
    const uri = src ? getOptimizedCloudinaryUrl(src, size * 2) : '';
    const box = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' as const };

    if (uri) {
        return (
            <View style={[box, { backgroundColor: COLORS.cardElevated }]}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={150} />
            </View>
        );
    }

    const tone = toneFor(name || '?');
    const initials = (name || '?')
        .trim()
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2);
    return (
        <View style={[box, { backgroundColor: tone + '24', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: tone, fontSize: Math.round(size * 0.38), fontWeight: '900' }}>{initials}</Text>
        </View>
    );
});

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SocialType } from '../../types/auth';
import { getPlatformMeta } from '../../lib/stream';
import { KickIcon } from '../icons/KickIcon';

interface PlatformIconProps {
    platform: SocialType;
    size?: number;
    color?: string;
}

// Renders the right brand mark for a streaming platform. Kick uses its real wordmark "K"
// (drawn SVG); the others use their Ionicons logo glyph.
export function PlatformIcon({ platform, size = 20, color }: PlatformIconProps) {
    const meta = getPlatformMeta(platform);
    const tint = color ?? meta.color;

    if (platform === SocialType.Kick) {
        return <KickIcon size={size} color={tint} />;
    }
    return <Ionicons name={meta.icon} size={size} color={tint} />;
}

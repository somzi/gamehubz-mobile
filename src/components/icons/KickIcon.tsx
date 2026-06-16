import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface KickIconProps {
    size?: number;
    color?: string;
}

// Kick's wordmark "K" glyph. Ionicons has no Kick logo, so we draw it; tintable via `color`.
export function KickIcon({ size = 20, color = '#53FC18' }: KickIconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path
                d="M5 3 H9 V10.5 L16.5 3 H22 L13 12 L22 21 H16.5 L9 13.5 V21 H5 Z"
                fill={color}
            />
        </Svg>
    );
}

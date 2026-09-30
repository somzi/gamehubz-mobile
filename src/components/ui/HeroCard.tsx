import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '../../lib/theme';

type GradientStops = readonly [string, string, ...string[]];

const FRAME_RADIUS = 26;
const BANNER_HEIGHT = 84;
// 80 image + 3 inset + 2 ring on each side.
const EMBLEM_SIZE = 90;

/**
 * The in-app counterpart of the share cards: a card inside a gradient hairline. Hubs and
 * tournaments use their share card's colours, so the page and the image a player shares read as
 * the same thing.
 */
export function HeroFrame({ hairline, children, className }: {
    hairline: GradientStops;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <View className={className}>
            <LinearGradient colors={hairline} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.frame}>
                <View style={styles.body}>{children}</View>
            </LinearGradient>
        </View>
    );
}

/**
 * Gradient banner with the share cards' concentric rings and top shine. With children it grows to
 * fit them, so it doubles as a cover the content sits on.
 */
export function HeroBanner({ colors, watermark, children }: {
    colors: GradientStops;
    /** A faint icon at the centre of the rings (the tournament cover's trophy). */
    watermark?: keyof typeof Ionicons.glyphMap;
    children?: React.ReactNode;
}) {
    return (
        <View style={{ minHeight: BANNER_HEIGHT, overflow: 'hidden' }}>
            <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
            <Svg width={220} height={220} style={styles.rings}>
                <Circle cx={110} cy={110} r={52} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
                <Circle cx={110} cy={110} r={78} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                <Circle cx={110} cy={110} r={104} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            </Svg>
            {watermark && (
                <Ionicons name={watermark} size={40} color="rgba(255,255,255,0.12)" style={styles.watermark} />
            )}
            <LinearGradient
                colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
                style={styles.shine}
                pointerEvents="none"
            />
            {children}
        </View>
    );
}

/** Rounded-square emblem in a gradient ring, with a soft glow on iOS. */
export function HeroEmblem({ ringColors, glowColor, children }: {
    ringColors: GradientStops;
    glowColor: string;
    children: React.ReactNode;
}) {
    return (
        <View style={[styles.emblemGlow, { shadowColor: glowColor }]}>
            <LinearGradient colors={ringColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emblemRing}>
                <View style={styles.emblemInset}>{children}</View>
            </LinearGradient>
        </View>
    );
}

/** Glassy pill for a banner: a status dot or an icon, and a tracked label. */
export function CoverPill({ label, dotColor, glow = false, icon, iconColor, tint = 'rgba(2,6,23,0.35)', border = 'rgba(255,255,255,0.14)' }: {
    label: string;
    dotColor?: string;
    /** Live: the dot glows. */
    glow?: boolean;
    icon?: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    tint?: string;
    border?: string;
}) {
    return (
        <View
            className="flex-row items-center rounded-full"
            style={{ paddingHorizontal: 10, paddingVertical: 5, gap: 6, backgroundColor: tint, borderWidth: 1, borderColor: border }}
        >
            {icon ? (
                <Ionicons name={icon} size={10} color={iconColor} />
            ) : (
                <View
                    style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: dotColor,
                        shadowColor: dotColor,
                        shadowOpacity: glow ? 0.9 : 0,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 0 },
                    }}
                />
            )}
            <Text className="uppercase" style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: '#F8FAFC' }} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

/**
 * Identity hero (a hub, like the player header): banner, the emblem overlapping it, `aside` to its
 * right under the banner, then the content. `bannerAccessory` sits in the banner's top-right corner.
 */
export function HeroCard({
    hairline,
    banner,
    emblemRing,
    glowColor,
    emblem,
    aside,
    bannerAccessory,
    children,
    className,
}: {
    hairline: GradientStops;
    banner: GradientStops;
    emblemRing: GradientStops;
    glowColor: string;
    emblem: React.ReactNode;
    aside?: React.ReactNode;
    bannerAccessory?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <HeroFrame hairline={hairline} className={className}>
            <HeroBanner colors={banner}>
                {bannerAccessory ? <View style={styles.bannerAccessory}>{bannerAccessory}</View> : null}
            </HeroBanner>
            <View style={styles.identity}>
                <View className="flex-row items-end" style={{ gap: 12 }}>
                    <HeroEmblem ringColors={emblemRing} glowColor={glowColor}>{emblem}</HeroEmblem>
                    {aside ? <View className="flex-1 items-end pb-1">{aside}</View> : null}
                </View>
                {children}
            </View>
        </HeroFrame>
    );
}

const styles = StyleSheet.create({
    frame: {
        borderRadius: FRAME_RADIUS,
        padding: 1,
    },
    body: {
        borderRadius: FRAME_RADIUS - 1,
        overflow: 'hidden',
        backgroundColor: COLORS.card,
    },
    rings: {
        position: 'absolute',
        top: -70,
        right: -60,
    },
    // Centred on the rings: their centre sits 50 from the right edge and 40 from the top.
    watermark: {
        position: 'absolute',
        top: 20,
        right: 30,
    },
    shine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 44,
    },
    bannerAccessory: {
        position: 'absolute',
        top: 12,
        right: 12,
    },
    identity: {
        paddingHorizontal: 18,
        paddingBottom: 18,
        // The emblem sits half on the banner.
        marginTop: -EMBLEM_SIZE / 2,
    },
    emblemGlow: {
        borderRadius: 28,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
    },
    emblemRing: {
        width: EMBLEM_SIZE,
        height: EMBLEM_SIZE,
        borderRadius: 28,
        padding: 2,
    },
    emblemInset: {
        flex: 1,
        borderRadius: 26,
        padding: 3,
        backgroundColor: COLORS.card,
    },
});

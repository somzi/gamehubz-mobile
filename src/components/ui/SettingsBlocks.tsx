import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HeroFrame, HeroEmblem } from './HeroCard';
import { COLORS } from '../../lib/theme';

type GradientStops = readonly [string, string, ...string[]];

/** Each settings screen's identity, in the colours of that thing's page and share card. */
export const SETTINGS_THEMES = {
    player: {
        hairline: ['rgba(52,211,153,0.55)', 'rgba(148,163,184,0.14)', 'rgba(59,130,246,0.5)'],
        band: ['#064E3B', '#0F766E', '#1E3A8A'],
        ring: ['#34D399', '#22D3EE', '#3B82F6'],
    },
    hub: {
        hairline: ['rgba(52,211,153,0.55)', 'rgba(148,163,184,0.14)', 'rgba(16,185,129,0.5)'],
        band: ['#065F46', '#059669', '#0F766E'],
        ring: ['#34D399', '#2DD4ED'],
    },
    tournament: {
        hairline: ['rgba(167,139,250,0.55)', 'rgba(148,163,184,0.14)', 'rgba(245,158,11,0.45)'],
        band: ['#4C1D95', '#6D28D9', '#4338CA'],
        ring: ['#A78BFA', '#FBBF24'],
    },
} satisfies Record<string, { hairline: GradientStops; band: GradientStops; ring: GradientStops }>;

export const SETTINGS_EMBLEM = 66;
/** The picture inside the emblem: the emblem minus its ring (2) and inset (3) on each side. */
export const SETTINGS_EMBLEM_IMAGE = SETTINGS_EMBLEM - 10;
export const SETTINGS_EMBLEM_IMAGE_RADIUS = Math.round(SETTINGS_EMBLEM * 0.31) - 5;
const BAND_HEIGHT = 18;

/**
 * The card at the top of a settings screen: a slim band of the entity's gradient, the emblem in its
 * ring (no glow), the name and a line under it. With `onPress` the whole card opens something
 * (the player's own card opens Edit profile) and carries a chevron.
 */
export function SettingsHero({
    theme,
    emblem,
    emblemAccessory,
    title,
    titleAccessory,
    children,
    onPress,
    accessibilityLabel,
}: {
    theme: keyof typeof SETTINGS_THEMES;
    emblem: React.ReactNode;
    /** On the emblem's bottom-right corner — a camera button. */
    emblemAccessory?: React.ReactNode;
    title: string;
    /** Beside the title (a verified check). */
    titleAccessory?: React.ReactNode;
    /** Lines under the title. */
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
}) {
    const colors = SETTINGS_THEMES[theme];

    const content = (
        <View className="flex-row items-center" style={styles.content}>
            <View>
                <HeroEmblem ringColors={colors.ring} glowColor="transparent" size={SETTINGS_EMBLEM}>
                    {emblem}
                </HeroEmblem>
                {emblemAccessory ? <View style={styles.accessory}>{emblemAccessory}</View> : null}
            </View>
            <View className="flex-1 min-w-0" style={{ marginLeft: 16 }}>
                <View className="flex-row items-center" style={{ gap: 6 }}>
                    <Text
                        className="shrink text-[20px] leading-[25px] font-black text-white tracking-tight"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.65}
                    >
                        {title}
                    </Text>
                    {titleAccessory}
                </View>
                {children ? <View style={{ marginTop: 5, gap: 4 }}>{children}</View> : null}
            </View>
            {onPress ? <Ionicons name="chevron-forward" size={18} color={COLORS.slate500} style={{ marginLeft: 8 }} /> : null}
        </View>
    );

    return (
        <HeroFrame hairline={colors.hairline}>
            <View style={{ height: BAND_HEIGHT, overflow: 'hidden' }}>
                <LinearGradient colors={colors.band} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
            </View>
            {onPress ? (
                <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} className="active:opacity-70">
                    {content}
                </Pressable>
            ) : (
                content
            )}
        </HeroFrame>
    );
}

/** One line under the hero's title: an icon and quiet text, or a tinted status pill. */
export function SettingsHeroLine({
    icon,
    iconColor = COLORS.slate400,
    text,
    textColor = COLORS.slate400,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    text: string;
    textColor?: string;
}) {
    return (
        <View className="flex-row items-center" style={{ gap: 6 }}>
            <Ionicons name={icon} size={14} color={iconColor} />
            <Text className="shrink text-[13px] font-semibold" style={{ color: textColor }} numberOfLines={1}>
                {text}
            </Text>
        </View>
    );
}

/** A group of menu rows under a small tracked label. `danger` edges the card in red. */
export function SettingsGroup({
    title,
    danger = false,
    children,
}: {
    title?: string;
    danger?: boolean;
    children: React.ReactNode;
}) {
    return (
        <View>
            {title ? (
                <Text
                    className="text-[10.5px] font-black uppercase tracking-[1.4px] mb-2 ml-1"
                    style={{ color: danger ? '#F87171' : COLORS.slate400 }}
                    numberOfLines={1}
                >
                    {title}
                </Text>
            ) : null}
            <View style={[styles.group, danger && styles.groupDanger]}>{children}</View>
        </View>
    );
}

/** Round camera button for an emblem's corner. */
export function CameraButton({ onPress, busy, label, ringColor = COLORS.card }: {
    onPress: () => void;
    busy: boolean;
    label: string;
    ringColor?: string;
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="w-8 h-8 rounded-full items-center justify-center bg-primary active:opacity-80"
            style={{ borderWidth: 3, borderColor: ringColor }}
        >
            {busy ? (
                <ActivityIndicator size="small" color={COLORS.primaryForeground} />
            ) : (
                <Ionicons name="camera" size={14} color={COLORS.primaryForeground} />
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 16,
    },
    accessory: {
        position: 'absolute',
        right: -6,
        bottom: -6,
    },
    group: {
        backgroundColor: COLORS.card,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderTopColor: 'rgba(255,255,255,0.11)',
        overflow: 'hidden',
    },
    groupDanger: {
        borderColor: 'rgba(239,68,68,0.20)',
        borderTopColor: 'rgba(239,68,68,0.30)',
    },
});

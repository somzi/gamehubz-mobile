import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { Skeleton } from '../ui/Skeleton';
import { SocialLinks } from './SocialLinks';
import { getRegionName } from '../../lib/countries';
import { RegionType } from '../../types/auth';
import { COLORS } from '../../lib/theme';

interface ProfileHeaderCardProps {
    avatarUrl?: string | null;
    /** Account username — the one bold line of the block. */
    username: string;
    /** In-game nickname. Gets its own gamepad line whenever the player has one, even when it matches
     *  the username — same rule as PlayerIdentity: it is the name opponents look for in-game. */
    nickname?: string | null;
    countryFlag?: string | null;
    countryName?: string | null;
    region?: RegionType | null;
    socialLinks: React.ComponentProps<typeof SocialLinks>['links'];
    className?: string;
}

// The header is the in-app version of the shareable player card: a gradient hairline frame, a
// thin band of gradient along the top, and the avatar in a gradient emblem ring. Emerald is the app's colour,
// cyan and blue are the GameHubz wordmark's.
const HAIRLINE = ['rgba(52,211,153,0.55)', 'rgba(148,163,184,0.14)', 'rgba(59,130,246,0.5)'] as const;
// A pitch at night: deep emerald into teal into navy.
const BANNER = ['#064E3B', '#0F766E', '#1E3A8A'] as const;
const EMBLEM_RING = ['#34D399', '#22D3EE', '#3B82F6'] as const;

// A thin band of the gradient along the top — the colour without the bulk.
const BANNER_HEIGHT = 22;
// 80 avatar + 3 inset + 2 ring on each side.
const EMBLEM_SIZE = 90;
const FRAME_RADIUS = 26;

// ALL / unset don't narrow anything down — they only stand in when there's no country to show.
const isSpecificRegion = (region?: RegionType | null) =>
    !!region && region >= RegionType.NA && region <= RegionType.OCEANIA;

/**
 * Identity block at the top of a profile, shared by the own-profile tab and PlayerProfileScreen.
 * The player's links sit beside the avatar; under it, one bold name, then two quiet lines in the
 * same style — in-game nickname, and country + region folded into a single "Serbia · Europe" line.
 */
export function ProfileHeaderCard({
    avatarUrl,
    username,
    nickname,
    countryFlag,
    countryName,
    region,
    socialLinks,
    className,
}: ProfileHeaderCardProps) {
    const nick = nickname?.trim() || '';
    const flag = countryFlag?.trim() || '';
    const country = countryName?.trim() || '';
    const location = country
        ? (isSpecificRegion(region) ? `${country} · ${getRegionName(region)}` : country)
        : getRegionName(region);

    return (
        <View className={className}>
            <LinearGradient colors={HAIRLINE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.frame}>
                <View style={styles.body}>
                    <PitchBanner />

                    <View style={styles.content}>
                        {/* The avatar, with the player's identity beside it */}
                        <View className="flex-row items-center" style={{ gap: 14 }}>
                            <View style={styles.emblemGlow}>
                                <LinearGradient colors={EMBLEM_RING} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emblemRing}>
                                    <View style={styles.emblemInset}>
                                        <PlayerAvatar
                                            src={avatarUrl || undefined}
                                            name={username}
                                            size="xl"
                                            className="rounded-[23px] border-0"
                                        />
                                    </View>
                                </LinearGradient>
                            </View>

                            <View className="flex-1">
                                <Text
                                    className="text-[22px] leading-[27px] font-black text-white tracking-tight"
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.6}
                                >
                                    {username}
                                </Text>
                                {!!nick && (
                                    <View className="flex-row items-center mt-1">
                                        <View className="w-[18px] items-center">
                                            {/* 16 matches the footprint of the 13px flag emoji on the line below. */}
                                            <Ionicons name="game-controller" size={16} color={COLORS.primary} />
                                        </View>
                                        <Text className="flex-1 text-[13px] font-medium text-slate-400 ml-1.5" numberOfLines={1}>
                                            {nick}
                                        </Text>
                                    </View>
                                )}
                                <View className="flex-row items-center mt-1">
                                    <View className="w-[18px] items-center">
                                        {flag ? (
                                            <Text className="text-[13px]">{flag}</Text>
                                        ) : (
                                            <Ionicons name="globe-outline" size={16} color={COLORS.slate500} />
                                        )}
                                    </View>
                                    <Text className="flex-1 text-[13px] font-medium text-slate-400 ml-1.5" numberOfLines={1}>
                                        {location}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* The player's links, centred under a hairline */}
                        {socialLinks.length > 0 && (
                            <View className="mt-4 pt-3.5 border-t border-white/[0.06] items-center">
                                <SocialLinks links={socialLinks} className="justify-center" />
                            </View>
                        )}
                    </View>
                </View>
            </LinearGradient>
        </View>
    );
}

/** The band along the top: the gradient with a soft shine. */
function PitchBanner() {
    return (
        <View style={{ height: BANNER_HEIGHT, overflow: 'hidden' }}>
            <LinearGradient colors={BANNER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
            <LinearGradient
                colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: BANNER_HEIGHT }}
            />
        </View>
    );
}

/** The header's shape while a player's profile loads for the first time. */
export function ProfileHeaderSkeleton({ className }: { className?: string }) {
    return (
        <View className={className}>
            <View style={[styles.frame, styles.skeletonFrame]}>
                <View style={styles.body}>
                    <Skeleton height={BANNER_HEIGHT} radius={0} />
                    <View style={styles.content}>
                        <View className="flex-row items-center" style={{ gap: 14 }}>
                            <View style={styles.skeletonEmblem}>
                                <Skeleton width={EMBLEM_SIZE - 8} height={EMBLEM_SIZE - 8} radius={24} />
                            </View>
                            <View className="flex-1" style={{ gap: 9 }}>
                                <Skeleton width="75%" height={20} radius={8} />
                                <Skeleton width="50%" height={12} radius={6} />
                                <Skeleton width="65%" height={12} radius={6} />
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </View>
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
    content: {
        paddingHorizontal: 18,
        paddingBottom: 18,
        paddingTop: 16,
    },
    emblemGlow: {
        borderRadius: 28,
        shadowColor: COLORS.primary,
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
    skeletonFrame: {
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    skeletonEmblem: {
        width: EMBLEM_SIZE,
        height: EMBLEM_SIZE,
        borderRadius: 28,
        padding: 4,
        backgroundColor: COLORS.card,
    },
});

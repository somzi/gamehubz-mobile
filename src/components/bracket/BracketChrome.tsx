import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { RaisedCard } from '../ui/RaisedCard';
import { SeriesFormatChip, type RoundSeriesFormat } from './SeriesFormatChip';
import { COLORS } from '../../lib/theme';
import { parseUtcDate } from '../../lib/utils';
import { dateLocale } from '../../i18n';
import { MatchStatus, isTerminalMatchStatus } from '../../types/matchStatus';

/** Shared pieces of the winners and losers brackets: column headers, zoom, connector colours, the champion. */

export const CONNECTOR_STROKE = 2;
/** A path nobody has walked yet. */
export const LINE_IDLE = 'rgba(255,255,255,0.08)';
/** A winner has already gone down this line. */
export const LINE_PLAYED = 'rgba(255,255,255,0.2)';
/** The viewer's own way through the bracket. */
export const LINE_MY_PATH = 'rgba(52,211,153,0.6)';
const GOLD = '#FBBF24';
const DAY_MS = 24 * 60 * 60 * 1000;
const TABULAR = { fontVariant: ['tabular-nums' as const] };

export type RoundStatus = 'completed' | 'active' | 'upcoming';

interface StatusMatch {
    status: number;
    home: unknown;
    away: unknown;
}

/**
 * Done once every match is settled (byes included); being played while a drawn pair still owes a
 * result; upcoming while its slots are still waiting on the round before.
 */
export function roundStatusOf(matches: StatusMatch[]): RoundStatus {
    if (matches.length === 0) return 'upcoming';
    if (matches.every((m) => isTerminalMatchStatus(m.status))) return 'completed';
    if (matches.some((m) => !!m.home && !!m.away && !isTerminalMatchStatus(m.status))) return 'active';
    return 'upcoming';
}

export const isSettled = (m: StatusMatch) => m.status === MatchStatus.Completed || m.status === MatchStatus.NoShow;

/**
 * A round's column header: its name with where it stands (a dot while it's being played, a tick
 * once it's done), the deadline in the colour of its urgency, and the round's best-of. Admins get
 * a schedule button beside the name.
 */
export function RoundHeader({
    name,
    status,
    deadline,
    format,
    isTeamTournament,
    onEdit,
    height,
}: {
    name: string;
    status: RoundStatus;
    deadline?: string | null;
    format?: RoundSeriesFormat | null;
    isTeamTournament?: boolean;
    onEdit?: () => void;
    height: number;
}) {
    const date = deadline ? parseUtcDate(deadline) : null;
    const hasDate = !!date && !isNaN(date.getTime());
    const msLeft = hasDate ? date!.getTime() - Date.now() : 0;
    const deadlineColor = status === 'completed'
        ? COLORS.slate500
        : msLeft < 0 ? '#F87171' : msLeft < DAY_MS ? '#FBBF24' : COLORS.slate300;

    return (
        <View style={[styles.header, { height }]}>
            <View className="flex-row items-center" style={{ gap: 7, maxWidth: '100%' }}>
                {status === 'completed' && <Ionicons name="checkmark-circle" size={15} color="#34D399" />}
                {status === 'active' && <View style={styles.liveDot} />}
                <Text
                    className="shrink text-[15px] font-black"
                    style={{ color: status === 'active' ? '#FFFFFF' : status === 'completed' ? COLORS.slate400 : COLORS.slate500 }}
                    numberOfLines={1}
                >
                    {name}
                </Text>
                {onEdit && (
                    <Pressable
                        onPress={onEdit}
                        accessibilityRole="button"
                        hitSlop={6}
                        className="w-[30px] h-[30px] rounded-[10px] items-center justify-center border border-white/10 bg-white/[0.04] active:opacity-70"
                    >
                        <Ionicons name="calendar-outline" size={14} color={COLORS.slate300} />
                    </Pressable>
                )}
            </View>
            {hasDate && (
                <View className="flex-row items-center" style={{ gap: 5, marginTop: 5 }}>
                    <Ionicons name="time-outline" size={12} color={deadlineColor} />
                    <Text style={[TABULAR, { color: deadlineColor }]} className="text-[12px] font-semibold" numberOfLines={1}>
                        {date!.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                        {', '}
                        {date!.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </Text>
                </View>
            )}
            {format && (
                <SeriesFormatChip format={format} isTeamTournament={isTeamTournament} style={{ marginTop: 6 }} />
            )}
        </View>
    );
}

/**
 * Heading of a match that stands outside the tree (grand final, third place): tinted icon tile,
 * title and the match's best-of. Collapsible when given `onToggle`.
 */
export function BracketSectionTitle({
    icon,
    color,
    title,
    format,
    isTeamTournament,
    expanded,
    onToggle,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    title: string;
    format?: RoundSeriesFormat | null;
    isTeamTournament?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
}) {
    const content = (
        <View className="flex-row items-center" style={{ gap: 10 }}>
            <View
                className="w-8 h-8 rounded-[10px] items-center justify-center"
                style={{ backgroundColor: color + '1F', borderWidth: 1, borderColor: color + '40' }}
            >
                <Ionicons name={icon} size={15} color={color} />
            </View>
            <Text className="shrink text-[16px] font-black text-white" numberOfLines={1}>
                {title}
            </Text>
            {format && <SeriesFormatChip format={format} isTeamTournament={isTeamTournament} />}
            <View className="flex-1" />
            {onToggle && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={COLORS.slate400} />}
        </View>
    );

    return onToggle ? (
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} className="mb-3 active:opacity-70">
            {content}
        </Pressable>
    ) : (
        <View className="mb-3">{content}</View>
    );
}

/** Zoom out / in as one joined control. */
export function ZoomControls({
    onZoomOut,
    onZoomIn,
    canZoomOut,
    canZoomIn,
}: {
    onZoomOut: () => void;
    onZoomIn: () => void;
    canZoomOut: boolean;
    canZoomIn: boolean;
}) {
    return (
        <View className="flex-row rounded-xl border border-white/[0.07] bg-card overflow-hidden">
            <Pressable
                onPress={onZoomOut}
                disabled={!canZoomOut}
                accessibilityRole="button"
                accessibilityLabel="Zoom out"
                className="w-[38px] h-9 items-center justify-center active:bg-white/[0.06]"
                style={{ opacity: canZoomOut ? 1 : 0.35 }}
            >
                <Ionicons name="remove" size={18} color={COLORS.slate300} />
            </Pressable>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
            <Pressable
                onPress={onZoomIn}
                disabled={!canZoomIn}
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
                className="w-[38px] h-9 items-center justify-center active:bg-white/[0.06]"
                style={{ opacity: canZoomIn ? 1 : 0.35 }}
            >
                <Ionicons name="add" size={18} color={COLORS.slate300} />
            </Pressable>
        </View>
    );
}

interface ChampionParticipant {
    username: string;
    avatarUrl?: string | null;
}

/**
 * Where the bracket ends: the champion, once the final is decided — gold ring, gold name tag.
 * Before that it waits, dimmed, so the bracket always reads as a road to one place.
 */
export function ChampionPlate({
    champion,
    isTeamTournament,
    width,
}: {
    champion: ChampionParticipant | null;
    isTeamTournament?: boolean;
    /** Fixed width inside the bracket canvas; omitted, the plate fills its row. */
    width?: number;
}) {
    const { t } = useTranslation('bracket');
    const crowned = !!champion;

    return (
        <RaisedCard
            style={[
                styles.plate,
                width != null && { width },
                crowned && { borderColor: 'rgba(251,191,36,0.35)', borderTopColor: 'rgba(253,230,138,0.5)' },
                crowned && Platform.OS === 'ios' && { shadowColor: GOLD, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
            ]}
        >
            {crowned && (
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(251,191,36,0.12)', 'rgba(251,191,36,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            )}
            <View className="flex-row items-center" style={{ gap: 12 }}>
                {crowned && !isTeamTournament ? (
                    <View>
                        <View style={styles.goldRing}>
                            <PlayerAvatar src={champion!.avatarUrl ?? undefined} name={champion!.username} size="md" className="border-0" />
                        </View>
                        <View style={styles.trophyBadge}>
                            <Ionicons name="trophy" size={10} color="#3B2604" />
                        </View>
                    </View>
                ) : crowned ? (
                    <LinearGradient colors={['#FDE68A', '#F59E0B']} style={styles.trophyDisc}>
                        <Ionicons name="people" size={20} color="#3B2604" />
                    </LinearGradient>
                ) : (
                    <View style={[styles.trophyDisc, styles.trophyIdle]}>
                        <Ionicons name="trophy-outline" size={20} color={COLORS.slate500} />
                    </View>
                )}
                <View className="flex-1">
                    <Text
                        className="text-[10px] font-black uppercase tracking-[1.6px]"
                        style={{ color: crowned ? GOLD : COLORS.slate500 }}
                        numberOfLines={1}
                    >
                        {t('card.champion')}
                    </Text>
                    <Text
                        className={crowned ? 'text-[16px] leading-[21px] font-black text-white mt-0.5' : 'text-[14px] leading-[21px] font-semibold italic text-slate-600 mt-0.5'}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                    >
                        {crowned ? champion!.username : t('common:app.tbd')}
                    </Text>
                </View>
            </View>
        </RaisedCard>
    );
}

const styles = StyleSheet.create({
    header: {
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 12,
        paddingHorizontal: 6,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#34D399',
        ...Platform.select({
            ios: { shadowColor: '#34D399', shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
            default: {},
        }),
    },
    plate: {
        overflow: 'hidden',
        paddingHorizontal: 14,
        paddingVertical: 14,
    },
    goldRing: {
        borderRadius: 999,
        padding: 2,
        borderWidth: 2,
        borderColor: GOLD,
    },
    trophyBadge: {
        position: 'absolute',
        right: -3,
        bottom: -3,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: GOLD,
        borderWidth: 2,
        borderColor: COLORS.cardRaised,
    },
    trophyDisc: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
    },
    trophyIdle: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.12)',
    },
});

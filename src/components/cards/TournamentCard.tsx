import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PressableScale } from '../ui/PressableScale';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RaisedCard } from '../ui/RaisedCard';
import { HeroEmblem, EmblemImage } from '../ui/HeroCard';
import { PrivateBadge, PRIVATE_COLORS } from '../ui/PrivateBadge';
import { COLORS } from '../../lib/theme';
import { parseUtcDate } from '../../lib/utils';
import { dateLocale } from '../../i18n';

interface TournamentCardProps {
    name: string;
    description?: string;
    /**
     * 'scheduled' = registration hasn't opened yet (the organiser set an opening time). The card
     * then reads the date as that opening moment rather than the start date — for a tournament you
     * cannot join yet, when sign-ups open is the only date that matters.
     */
    status: 'live' | 'upcoming' | 'completed' | 'scheduled';
    /** The same date, already formatted — shown when `dateIso` is missing or unreadable. */
    date: string;
    /** Start (or, for 'scheduled', registration opening) as an ISO string, for a readable date. */
    dateIso?: string | null;
    region: string;
    prizePool: string;
    players: any[];
    showApply?: boolean;
    onApply?: () => void;
    onClick: () => void;
    className?: string;
    index?: number;
    hubName?: string;
    hubAvatarUrl?: string;
    /** Pending items the organizer has to approve in this tournament — red corner badge. */
    badgeCount?: number;
    /** Invite-only tournament: lock on the emblem plus a "Private" pill beside the status. */
    isPrivate?: boolean;
}

const STATUS_THEME: Record<TournamentCardProps['status'], { main: string; text: string }> = {
    live: { main: '#EF4444', text: '#FCA5A5' },
    upcoming: { main: '#60A5FA', text: '#93C5FD' },
    scheduled: { main: '#818CF8', text: '#C7D2FE' },
    completed: { main: '#10B981', text: '#6EE7B7' },
};

// The tournament share card's violet → gold, muted so a list of logos stays calm. No glow.
const TOURNAMENT_RING = ['rgba(167,139,250,0.55)', 'rgba(251,191,36,0.45)'] as const;
const EMBLEM = 52;
// The emblem minus its ring (2) and inset (3) on each side.
const EMBLEM_IMAGE = EMBLEM - 10;
const EMBLEM_IMAGE_RADIUS = Math.round(EMBLEM * 0.31) - 5;
const GOLD = '#FBBF24';
const TABULAR = { fontVariant: ['tabular-nums' as const] };

/** "27 Sep 2026" for a start; "4 Oct, 18:00" for a registration opening. */
function readableDate(iso: string | null | undefined, scheduled: boolean): string | null {
    if (!iso) return null;
    const d = parseUtcDate(iso);
    if (isNaN(d.getTime())) return null;
    if (!scheduled) return d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
    const day = d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day}, ${time}`;
}

/**
 * A tournament in a list, drawn as the hub card's sibling: the emblem in the tournament's
 * violet-and-gold ring, host and name beside it, the state top-right, and under a hairline the
 * facts a player scans for — when, where, and what's on the line.
 */
// Memoized so a parent re-render (badge count tick, unrelated state change) doesn't
// re-render every visible tournament card. Callers should pass a stable onClick
// (useCallback) so the memo actually skips re-renders.
export const TournamentCard = React.memo(function TournamentCard({
    name,
    status,
    date,
    dateIso,
    region,
    prizePool,
    onClick,
    className,
    hubName,
    hubAvatarUrl,
    badgeCount = 0,
    isPrivate = false,
}: TournamentCardProps) {
    const { t } = useTranslation('common');
    const theme = STATUS_THEME[status] || STATUS_THEME.upcoming;
    const scheduled = status === 'scheduled';
    const live = status === 'live';
    const shownDate = readableDate(dateIso, scheduled) ?? date;
    const dateText = scheduled ? t('app.opensOn', { date: shownDate }) : shownDate;
    const statusLabel = t(`status.${status}`);
    const hubLabel = hubName || t('app.officialHub');

    return (
        <PressableScale
            onPress={onClick}
            className={className}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={[name, statusLabel, hubLabel, dateText, region, prizePool].join('. ')}
        >
            {/* A live tournament's edge takes the live red; every other state stays neutral. */}
            <RaisedCard style={live ? styles.liveEdge : undefined}>
                <View style={styles.body}>
                    {/* ─── Identity: emblem, host, name, state ─── */}
                    <View className="flex-row items-center">
                        <View>
                            <HeroEmblem ringColors={TOURNAMENT_RING} glowColor="transparent" size={EMBLEM}>
                                {hubAvatarUrl ? (
                                    <EmblemImage src={hubAvatarUrl} name={hubLabel} size={EMBLEM_IMAGE} radius={EMBLEM_IMAGE_RADIUS} />
                                ) : (
                                    <LinearGradient
                                        colors={['#1E1B4B', '#0B111D']}
                                        style={[styles.trophyTile, { borderRadius: EMBLEM_IMAGE_RADIUS }]}
                                    >
                                        <Ionicons name="trophy" size={20} color={GOLD} />
                                    </LinearGradient>
                                )}
                            </HeroEmblem>
                            {/* Lock on the emblem's corner — the first thing the eye lands on in a list. */}
                            {isPrivate && (
                                <View pointerEvents="none" style={styles.lock}>
                                    <Ionicons name="lock-closed" size={10} color={PRIVATE_COLORS.icon} />
                                </View>
                            )}
                        </View>

                        {/* State on top, then the host and the name, each on the column's full width —
                            nothing beside them to cut the hub's name short. */}
                        <View className="flex-1 min-w-0" style={{ marginLeft: 16 }}>
                            <View className="flex-row items-center" style={{ gap: 5 }}>
                                <View
                                    className="flex-row items-center rounded-full"
                                    style={[styles.statusPill, { backgroundColor: theme.main + '1F', borderColor: theme.main + '4D' }]}
                                >
                                    <View
                                        style={[
                                            styles.statusDot,
                                            { backgroundColor: theme.main, shadowColor: theme.main, shadowOpacity: live ? 0.9 : 0 },
                                        ]}
                                    />
                                    <Text
                                        className="text-[9px] font-black uppercase tracking-[1px]"
                                        style={{ color: theme.text }}
                                        numberOfLines={1}
                                    >
                                        {statusLabel}
                                    </Text>
                                </View>
                                {isPrivate && <PrivateBadge size="sm" />}
                            </View>
                            {/* The host, marked with the hub's planet like on the tournament cover */}
                            <View className="flex-row items-center" style={{ gap: 4, marginTop: 6 }}>
                                <Ionicons name="planet" size={12} color={COLORS.primaryBright} />
                                <Text
                                    className="shrink text-[10.5px] font-black uppercase tracking-[1.2px]"
                                    style={{ color: COLORS.primaryBright }}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.8}
                                >
                                    {hubLabel}
                                </Text>
                            </View>
                            <Text
                                className="text-[15.5px] leading-[20px] font-black text-white tracking-tight mt-0.5"
                                numberOfLines={2}
                                adjustsFontSizeToFit
                                minimumFontScale={0.8}
                            >
                                {name}
                            </Text>
                        </View>
                    </View>

                    {/* ─── Facts: when, where, prize ─── */}
                    <View className="flex-row items-center mt-3.5 pt-3 border-t border-white/[0.06]" style={{ gap: 14 }}>
                        <View className="flex-1 flex-row items-center min-w-0" style={{ gap: 6 }}>
                            <Ionicons
                                name={scheduled ? 'lock-open' : 'calendar-clear'}
                                size={13}
                                color={scheduled ? theme.main : '#A5B4FC'}
                            />
                            <Text className="shrink text-[12.5px] font-bold text-slate-200" style={TABULAR} numberOfLines={1}>
                                {dateText}
                            </Text>
                        </View>
                        <View className="flex-row items-center" style={{ gap: 5 }}>
                            <Ionicons name="earth" size={13} color={COLORS.slate400} />
                            <Text className="text-[12.5px] font-bold text-slate-300" numberOfLines={1}>
                                {region}
                            </Text>
                        </View>
                        <View className="flex-row items-center rounded-xl" style={styles.prize}>
                            <Ionicons name="trophy" size={11} color={GOLD} />
                            <Text className="text-[11.5px] font-black" style={[TABULAR, { color: GOLD }]} numberOfLines={1}>
                                {prizePool}
                            </Text>
                        </View>
                    </View>
                </View>
            </RaisedCard>

            {/* Pending-approvals badge — lives on the Pressable, OUTSIDE the card, so it can poke
                out of the corner. */}
            {badgeCount > 0 && (
                <View
                    pointerEvents="none"
                    className="absolute z-10 rounded-full items-center justify-center"
                    style={{
                        top: -6,
                        right: -6,
                        minWidth: 22,
                        height: 22,
                        paddingHorizontal: 6,
                        backgroundColor: '#EF4444',
                        borderWidth: 2,
                        borderColor: '#0B1120',
                    }}
                >
                    <Text className="text-white text-[11px] font-black">
                        {badgeCount > 99 ? '99+' : badgeCount}
                    </Text>
                </View>
            )}
        </PressableScale>
    );
});

const styles = StyleSheet.create({
    liveEdge: {
        borderColor: 'rgba(239,68,68,0.28)',
        borderTopColor: 'rgba(239,68,68,0.42)',
    },
    body: {
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 12,
    },
    trophyTile: {
        width: EMBLEM_IMAGE,
        height: EMBLEM_IMAGE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lock: {
        position: 'absolute',
        right: -5,
        bottom: -5,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1A1410',
        borderWidth: 1.5,
        borderColor: PRIVATE_COLORS.border,
    },
    statusPill: {
        paddingHorizontal: 7,
        paddingVertical: 2.5,
        gap: 4,
        borderWidth: 1,
    },
    statusDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
    },
    prize: {
        paddingHorizontal: 7,
        paddingVertical: 3,
        gap: 4,
        backgroundColor: 'rgba(251,191,36,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(251,191,36,0.24)',
    },
});

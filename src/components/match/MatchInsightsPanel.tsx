import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authenticatedFetch, ENDPOINTS } from '../../lib/api';
import { cn, formatDateSafe } from '../../lib/utils';
import { PlayerAvatar } from '../ui/PlayerAvatar';

type Outcome = 'W' | 'D' | 'L';

export interface MatchInsightPlayer {
    id: string;
    name: string;
    avatarUrl?: string | null;
}

interface HeadToHead {
    totalMatches: number;
    myWins: number;
    opponentWins: number;
    draws: number;
    lastMatchTime?: string | null;
    lastMyScore?: number | null;
    lastOpponentScore?: number | null;
    lastOutcome?: Outcome | null;
    lastTournamentName?: string | null;
    lastHubName?: string | null;
}

interface MatchInsights {
    h2h: HeadToHead;
    opponentForm: Outcome[];
}

interface Props {
    active: boolean;
    primary: MatchInsightPlayer;
    opponent: MatchInsightPlayer;
    viewerIsPrimary: boolean;
    /** Opens a player's profile. The host does the navigating: it has to close its own modal
     *  first, or the pushed screen ends up underneath it. */
    onPlayerPress?: (playerId: string) => void;
}

const read = (source: any, camel: string, pascal: string) => source?.[camel] ?? source?.[pascal];

function normalizeOutcome(value: unknown): Outcome {
    const normalized = String(value ?? '').toUpperCase();
    return normalized === 'W' || normalized === 'D' ? normalized : 'L';
}

async function fetchInsights(primaryId: string, opponentId: string): Promise<MatchInsights> {
    const [h2hResponse, formResponse] = await Promise.all([
        authenticatedFetch(ENDPOINTS.GET_HEAD_TO_HEAD(primaryId, opponentId)),
        authenticatedFetch(ENDPOINTS.GET_PLAYER_STATS(opponentId)),
    ]);

    if (!h2hResponse.ok || !formResponse.ok) {
        throw new Error(`Match insights failed: ${h2hResponse.status}/${formResponse.status}`);
    }

    const h2hEnvelope = await h2hResponse.json();
    const formEnvelope = await formResponse.json();
    const rawH2h = h2hEnvelope?.result ?? h2hEnvelope?.Result ?? h2hEnvelope;
    const rawForm = formEnvelope?.result ?? formEnvelope?.Result ?? formEnvelope;
    const performance = read(rawForm, 'performance', 'Performance');

    return {
        h2h: {
            totalMatches: Number(read(rawH2h, 'totalMatches', 'TotalMatches') ?? 0),
            myWins: Number(read(rawH2h, 'myWins', 'MyWins') ?? 0),
            opponentWins: Number(read(rawH2h, 'opponentWins', 'OpponentWins') ?? 0),
            draws: Number(read(rawH2h, 'draws', 'Draws') ?? 0),
            lastMatchTime: read(rawH2h, 'lastMatchTime', 'LastMatchTime') ?? null,
            lastMyScore: read(rawH2h, 'lastMyScore', 'LastMyScore') ?? null,
            lastOpponentScore: read(rawH2h, 'lastOpponentScore', 'LastOpponentScore') ?? null,
            lastOutcome: read(rawH2h, 'lastOutcome', 'LastOutcome')
                ? normalizeOutcome(read(rawH2h, 'lastOutcome', 'LastOutcome'))
                : null,
            lastTournamentName: read(rawH2h, 'lastTournamentName', 'LastTournamentName') ?? null,
            lastHubName: read(rawH2h, 'lastHubName', 'LastHubName') ?? null,
        },
        // The v2 stats endpoint returns newest first. The render reverses only the selected
        // window so the strip reads naturally from oldest on the left to latest on the right.
        opponentForm: Array.isArray(performance)
            ? performance.map((item: any) => normalizeOutcome(read(item, 'outcome', 'Outcome')))
            : [],
    };
}

export function MatchInsightsPanel({ active, primary, opponent, viewerIsPrimary, onPlayerPress }: Props) {
    const { t } = useTranslation('match');
    const { t: tCommon } = useTranslation('common');
    const [formLimit, setFormLimit] = useState<5 | 10>(5);

    const insightsQuery = useQuery({
        queryKey: ['match-insights', primary.id, opponent.id],
        queryFn: () => fetchInsights(primary.id, opponent.id),
        enabled: active && !!primary.id && !!opponent.id,
        staleTime: 60_000,
        retry: 1,
    });

    const h2h = insightsQuery.data?.h2h;
    const newestFirst = insightsQuery.data?.opponentForm ?? [];
    const selectedForm = useMemo(
        () => newestFirst.slice(0, formLimit).reverse(),
        [newestFirst, formLimit],
    );
    const wins = selectedForm.filter((result) => result === 'W').length;
    const draws = selectedForm.filter((result) => result === 'D').length;
    const losses = selectedForm.filter((result) => result === 'L').length;
    const winRate = selectedForm.length > 0 ? Math.round((wins / selectedForm.length) * 100) : 0;

    if (insightsQuery.isPending) {
        return (
            <View className="flex-1 items-center justify-center px-8">
                <View className="w-14 h-14 rounded-3xl bg-primary/10 border border-primary/20 items-center justify-center mb-4">
                    <ActivityIndicator color="#10B981" />
                </View>
                <Text className="text-white text-sm font-black">{t('insights.loading')}</Text>
                <Text className="text-slate-600 text-[10px] font-bold uppercase tracking-[2px] mt-2">H2H · FORM</Text>
            </View>
        );
    }

    if (insightsQuery.isError || !h2h) {
        return (
            <View className="flex-1 items-center justify-center px-8">
                <View className="w-14 h-14 rounded-3xl bg-red-500/10 border border-red-500/20 items-center justify-center mb-4">
                    <Ionicons name="analytics-outline" size={24} color="#F87171" />
                </View>
                <Text className="text-white text-sm font-black text-center">{t('insights.loadFailed')}</Text>
                <Pressable
                    onPress={() => insightsQuery.refetch()}
                    className="mt-5 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 active:opacity-70"
                >
                    <Text className="text-primary text-xs font-black uppercase tracking-wider">{t('insights.retry')}</Text>
                </Pressable>
            </View>
        );
    }

    const total = Math.max(1, h2h.totalMatches);
    const primaryShare = `${(h2h.myWins / total) * 100}%` as `${number}%`;
    const drawShare = `${(h2h.draws / total) * 100}%` as `${number}%`;
    const opponentShare = `${(h2h.opponentWins / total) * 100}%` as `${number}%`;
    const leader = h2h.myWins === h2h.opponentWins
        ? t('insights.level')
        : t('insights.leads', { name: h2h.myWins > h2h.opponentWins ? primary.name : opponent.name });

    // No horizontal padding of its own: the two hosts inset their content differently (the
    // bracket modal wraps it, the Home match sheet already pads its whole body), same as the
    // stream panel.
    return (
        <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 36 }}
        >
            <View className="flex-row items-center justify-between mb-4">
                <View>
                    <Text className="text-primary text-[9px] font-black uppercase tracking-[3px]">{t('insights.eyebrow')}</Text>
                    <Text className="text-white text-xl font-black tracking-tight mt-1">{t('insights.title')}</Text>
                </View>
                <View className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-400/15 items-center justify-center">
                    <Ionicons name="pulse" size={19} color="#818CF8" />
                </View>
            </View>

            <LinearGradient
                colors={['rgba(16,185,129,0.13)', 'rgba(30,41,59,0.72)', 'rgba(15,23,42,0.96)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 24, borderWidth: 1, borderColor: 'rgba(52,211,153,0.16)', padding: 18 }}
            >
                <View className="flex-row items-center justify-between">
                    <PlayerColumn
                        player={primary}
                        badge={viewerIsPrimary ? t('insights.you') : undefined}
                        onPress={onPlayerPress && primary.id ? () => onPlayerPress(primary.id) : undefined}
                    />

                    <View className="items-center px-2">
                        {h2h.totalMatches > 0 ? (
                            <>
                                <View className="flex-row items-end" style={{ gap: 7 }}>
                                    <Text className="text-white text-3xl font-black tracking-tighter">{h2h.myWins}</Text>
                                    <Text className="text-slate-600 text-sm font-black mb-1">:</Text>
                                    <Text className="text-white text-3xl font-black tracking-tighter">{h2h.opponentWins}</Text>
                                </View>
                                <Text className="text-slate-500 text-[8px] font-black uppercase tracking-[2px] mt-1">
                                    {t('insights.h2h')}
                                </Text>
                            </>
                        ) : (
                            <View className="w-14 h-14 rounded-full bg-white/5 border border-white/10 items-center justify-center">
                                <Text className="text-slate-500 text-[11px] font-black">VS</Text>
                            </View>
                        )}
                    </View>

                    <PlayerColumn
                        player={opponent}
                        onPress={onPlayerPress && opponent.id ? () => onPlayerPress(opponent.id) : undefined}
                    />
                </View>

                {h2h.totalMatches > 0 ? (
                    <>
                        <View className="flex-row h-1.5 rounded-full overflow-hidden mt-5 bg-white/5" style={{ gap: 2 }}>
                            {h2h.myWins > 0 && <View style={{ width: primaryShare, backgroundColor: '#10B981' }} />}
                            {h2h.draws > 0 && <View style={{ width: drawShare, backgroundColor: '#F59E0B' }} />}
                            {h2h.opponentWins > 0 && <View style={{ width: opponentShare, backgroundColor: '#818CF8' }} />}
                        </View>
                        <View className="flex-row items-center justify-between mt-3">
                            <Text className="text-slate-400 text-[10px] font-bold">{leader}</Text>
                            <Text className="text-slate-600 text-[9px] font-black uppercase tracking-wider">
                                {t('insights.meetings', { count: h2h.totalMatches })} · {t('insights.drawsCount', { count: h2h.draws })}
                            </Text>
                        </View>
                    </>
                ) : (
                    <View className="items-center mt-5 pt-4 border-t border-white/[0.06]">
                        <Text className="text-white text-xs font-black">{t('insights.firstMeeting')}</Text>
                        <Text className="text-slate-500 text-[10px] text-center mt-1 leading-4">{t('insights.firstMeetingHint')}</Text>
                    </View>
                )}
            </LinearGradient>

            <View className="bg-card rounded-3xl border border-white/[0.05] p-4 mt-4">
                <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1" style={{ gap: 9 }}>
                        <View className="w-8 h-8 rounded-xl bg-indigo-500/10 items-center justify-center">
                            <Ionicons name="trending-up" size={15} color="#818CF8" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white text-xs font-black uppercase tracking-wider">{t('insights.recentForm')}</Text>
                            <Text className="text-slate-500 text-[10px] font-semibold mt-0.5" numberOfLines={1}>{opponent.name}</Text>
                        </View>
                    </View>
                    <View className="flex-row bg-background-deep rounded-xl p-0.5 border border-white/[0.05]">
                        {([5, 10] as const).map((limit) => (
                            <Pressable
                                key={limit}
                                onPress={() => setFormLimit(limit)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: formLimit === limit }}
                                className={cn('px-3 py-1.5 rounded-[10px]', formLimit === limit && 'bg-primary/15')}
                            >
                                <Text className={cn('text-[9px] font-black', formLimit === limit ? 'text-primary' : 'text-slate-600')}>
                                    {limit}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                {selectedForm.length > 0 ? (
                    <>
                        <View className="flex-row items-center mt-5" style={{ gap: 4 }}>
                            {selectedForm.map((outcome, index) => (
                                <View key={`${outcome}-${index}`} className="flex-1 items-center">
                                    <OutcomePill outcome={outcome} compact={formLimit === 10} label={tCommon(`outcome.${outcome}`)} />
                                </View>
                            ))}
                            {Array.from({ length: Math.max(0, formLimit - selectedForm.length) }).map((_, index) => (
                                <View key={`empty-${index}`} className="flex-1 items-center">
                                    <View
                                        className={cn('rounded-lg bg-white/[0.025] border border-white/[0.04] items-center justify-center', formLimit === 10 ? 'w-[23px] h-[23px]' : 'w-[30px] h-[30px]')}
                                    >
                                        <Text className="text-white/10 text-[9px] font-black">–</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                        <View className="flex-row items-center mt-2 px-0.5">
                            <Text className="text-slate-700 text-[7px] font-black uppercase tracking-wider">{t('insights.oldest')}</Text>
                            <View className="flex-1 h-[1px] bg-white/[0.04] mx-3" />
                            <Ionicons name="arrow-forward" size={9} color="#334155" />
                            <Text className="text-slate-600 text-[7px] font-black uppercase tracking-wider ml-1">{t('insights.latest')}</Text>
                        </View>

                        <View className="flex-row mt-5 rounded-2xl bg-background-deep border border-white/[0.04] px-2 py-3">
                            <FormStat value={wins} label={t('insights.wins')} color="#34D399" />
                            <Divider />
                            <FormStat value={draws} label={t('insights.draws')} color="#FBBF24" />
                            <Divider />
                            <FormStat value={losses} label={t('insights.losses')} color="#F87171" />
                            <Divider />
                            <FormStat value={`${winRate}%`} label={t('insights.winRate')} color="#818CF8" />
                        </View>
                    </>
                ) : (
                    <View className="items-center py-8">
                        <Ionicons name="analytics-outline" size={28} color="#334155" />
                        <Text className="text-slate-500 text-[11px] font-bold mt-3">{t('insights.noForm')}</Text>
                    </View>
                )}
            </View>

            {h2h.totalMatches > 0 && (
                <View className="bg-card rounded-3xl border border-white/[0.05] p-4 mt-4">
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                            <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center">
                                <Ionicons name="time-outline" size={15} color="#34D399" />
                            </View>
                            <View>
                                <Text className="text-white text-xs font-black uppercase tracking-wider">{t('insights.lastMeeting')}</Text>
                                <Text className="text-slate-600 text-[9px] font-semibold mt-0.5">
                                    {formatDateSafe(h2h.lastMatchTime, tCommon('app.notAvailableShort'))}
                                </Text>
                            </View>
                        </View>
                        <View className={cn(
                            'px-3 py-1.5 rounded-xl border',
                            h2h.lastOutcome === 'W' ? 'bg-primary/10 border-primary/20'
                                : h2h.lastOutcome === 'D' ? 'bg-warning/10 border-warning/20'
                                    : 'bg-red-500/10 border-red-500/20',
                        )}>
                            <Text className={cn(
                                'text-[10px] font-black',
                                h2h.lastOutcome === 'W' ? 'text-primary' : h2h.lastOutcome === 'D' ? 'text-warning' : 'text-red-400',
                            )}>
                                {h2h.lastMyScore ?? '–'} : {h2h.lastOpponentScore ?? '–'}
                            </Text>
                        </View>
                    </View>
                    <View className="mt-3 pt-3 border-t border-white/[0.05]">
                        <Text className="text-slate-300 text-[11px] font-bold" numberOfLines={1}>{h2h.lastTournamentName || '—'}</Text>
                        {!!h2h.lastHubName && <Text className="text-slate-600 text-[9px] font-semibold mt-1" numberOfLines={1}>{h2h.lastHubName}</Text>}
                    </View>
                </View>
            )}
        </ScrollView>
    );
}

function PlayerColumn({ player, badge, onPress }: { player: MatchInsightPlayer; badge?: string; onPress?: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={player.name}
            className="flex-1 items-center min-w-0 active:opacity-70"
        >
            <View className="rounded-full p-[2px] bg-white/10">
                <PlayerAvatar src={player.avatarUrl ?? undefined} name={player.name} size="lg" className="border-0" />
            </View>
            <Text className="text-white text-[11px] font-black mt-2 w-full text-center" numberOfLines={1}>{player.name}</Text>
            <View className="h-4 mt-1">
                {!!badge && (
                    <View className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                        <Text className="text-primary text-[7px] font-black uppercase tracking-wider">{badge}</Text>
                    </View>
                )}
            </View>
        </Pressable>
    );
}

function OutcomePill({ outcome, compact, label }: { outcome: Outcome; compact: boolean; label: string }) {
    return (
        <View
            className={cn(
                'rounded-lg items-center justify-center border',
                compact ? 'w-[23px] h-[23px]' : 'w-[30px] h-[30px]',
                outcome === 'W' ? 'bg-primary/15 border-primary/30'
                    : outcome === 'D' ? 'bg-warning/15 border-warning/30'
                        : 'bg-red-500/15 border-red-500/30',
            )}
        >
            <Text className={cn(
                compact ? 'text-[8px]' : 'text-[10px]',
                'font-black',
                outcome === 'W' ? 'text-primary' : outcome === 'D' ? 'text-warning' : 'text-red-400',
            )}>{label}</Text>
        </View>
    );
}

function FormStat({ value, label, color }: { value: number | string; label: string; color: string }) {
    return (
        <View className="flex-1 items-center px-1">
            <Text style={{ color }} className="text-sm font-black">{value}</Text>
            <Text className="text-slate-600 text-[7px] font-black uppercase tracking-wider mt-0.5" numberOfLines={1}>{label}</Text>
        </View>
    );
}

function Divider() {
    return <View className="w-[1px] bg-white/[0.05] my-1" />;
}

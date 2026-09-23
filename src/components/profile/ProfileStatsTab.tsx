import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CircularProgress } from '../ui/CircularProgress';
import { cn } from '../../lib/utils';
import type { PlayerMatchesDto } from '../../types/user';

interface ProfileStatsTabProps {
    playerMatches: PlayerMatchesDto | null;
}

/**
 * Stats tab of both profiles (own tab and PlayerProfileScreen). The top row leaves out wins and win
 * rate: the chart below already shows both.
 */
export function ProfileStatsTab({ playerMatches }: ProfileStatsTabProps) {
    const { t } = useTranslation('profile');
    const { t: tCommon } = useTranslation('common');

    const stats = playerMatches?.stats;
    const totalMatches = stats?.totalMatches || 0;
    const wins = stats?.wins || 0;
    const draws = stats?.draws || 0;
    const losses = stats?.losses || 0;
    const winPercentage = Math.round(stats?.winRate || 0);
    const performanceList = playerMatches?.performance || [];

    const share = (count: number): `${number}%` => (totalMatches > 0 ? `${(count / totalMatches) * 100}%` : '0%');

    return (
        <View style={{ gap: 10 }}>
            {/* ─── Career ─── */}
            <View className="flex-row bg-card rounded-2xl p-1" style={{ gap: 2 }}>
                <CareerStat value={stats ? totalMatches : undefined} label={t('matches')} valueClassName="text-white" />
                <View className="w-[1px] bg-white/[0.04] my-2" />
                <CareerStat value={stats?.tournamentsPlayed} label={t('tournaments')} valueClassName="text-white" />
                <View className="w-[1px] bg-white/[0.04] my-2" />
                <CareerStat value={stats ? stats.tournamentsWon : undefined} label={t('trophies')} valueClassName="text-amber-400" />
                <View className="w-[1px] bg-white/[0.04] my-2" />
                <CareerStat value={stats?.longestWinStreak} label={t('bestStreak')} valueClassName="text-primary" />
            </View>

            {/* ─── Recent Form ─── */}
            <View className="bg-card rounded-3xl p-4">
                <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                        <View className="w-7 h-7 rounded-xl bg-indigo-500/10 items-center justify-center">
                            <Ionicons name="trending-up" size={14} color="#818CF8" />
                        </View>
                        <Text className="text-[11px] font-black text-white uppercase tracking-widest">{t('recentForm')}</Text>
                    </View>
                    {performanceList.length > 0 && (
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                            <View className="flex-row items-center" style={{ gap: 3 }}>
                                <View className="w-2 h-2 rounded-full bg-primary" />
                                <Text className="text-[8px] text-slate-500 font-bold uppercase">{t('win')}</Text>
                            </View>
                            <View className="flex-row items-center" style={{ gap: 3 }}>
                                <View className="w-2 h-2 rounded-full bg-yellow-500" />
                                <Text className="text-[8px] text-slate-500 font-bold uppercase">{t('draw')}</Text>
                            </View>
                            <View className="flex-row items-center" style={{ gap: 3 }}>
                                <View className="w-2 h-2 rounded-full bg-destructive" />
                                <Text className="text-[8px] text-slate-500 font-bold uppercase">{t('loss')}</Text>
                            </View>
                        </View>
                    )}
                </View>
                {performanceList.length > 0 ? (
                    <>
                        <View className="flex-row items-center justify-center" style={{ gap: 5 }}>
                            {[...performanceList].reverse().slice(-10).map((match, i) => (
                                <View key={i} className="flex-1 items-center">
                                    <View
                                        className={cn(
                                            "w-7 h-7 rounded-lg items-center justify-center",
                                            match.outcome === 'W' ? "bg-primary/15" : match.outcome === 'D' ? "bg-yellow-500/15" : "bg-destructive/15"
                                        )}
                                        style={{ borderWidth: 1.5, borderColor: match.outcome === 'W' ? 'rgba(16,185,129,0.3)' : match.outcome === 'D' ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)' }}
                                    >
                                        <Text className={cn(
                                            "text-[10px] font-black",
                                            match.outcome === 'W' ? "text-primary" : match.outcome === 'D' ? "text-yellow-500" : "text-destructive"
                                        )}>
                                            {tCommon(`outcome.${match.outcome}`)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                            {Array.from({ length: Math.max(0, 10 - performanceList.length) }).map((_, i) => (
                                <View key={`empty-${i}`} className="flex-1 items-center">
                                    <View
                                        className="w-7 h-7 rounded-lg items-center justify-center bg-white/[0.03]"
                                        style={{ borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.04)' }}
                                    >
                                        <Text className="text-[10px] font-black text-white/10">-</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                        <View className="flex-row items-center justify-between mt-2 px-1">
                            <Text className="text-[7px] text-slate-600 font-bold uppercase tracking-wider">{t('oldest')}</Text>
                            <View className="flex-1 mx-3 h-[1px] bg-white/[0.04]" />
                            <Text className="text-[7px] text-slate-600 font-bold uppercase tracking-wider">{t('latest')}</Text>
                        </View>
                    </>
                ) : (
                    <View className="items-center py-4">
                        <Ionicons name="analytics-outline" size={28} color="#1E293B" />
                        <Text className="text-slate-600 text-[10px] mt-2">{t('noPerformanceData')}</Text>
                    </View>
                )}
            </View>

            {/* ─── Win Rate + W / D / L ─── */}
            <View className="bg-card rounded-3xl p-5 items-center">
                <View style={{
                    width: 100,
                    height: 100,
                    position: 'relative',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 14,
                    shadowColor: '#10B981',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.3,
                    shadowRadius: 14,
                    elevation: 4,
                }}>
                    <CircularProgress
                        percentage={winPercentage}
                        size={100}
                        strokeWidth={9}
                        color="#10B981"
                        backgroundColor="#1E293B"
                        showText={false}
                    />
                    <View className="absolute inset-0 items-center justify-center">
                        <Text className="text-white text-2xl font-black">{winPercentage}%</Text>
                        <Text className="text-slate-500 text-[7px] uppercase font-black tracking-[2px]">{t('winRate')}</Text>
                    </View>
                </View>

                <View className="w-full" style={{ gap: 8 }}>
                    <View>
                        <View className="flex-row items-center justify-between mb-1">
                            <View className="flex-row items-center" style={{ gap: 6 }}>
                                <View className="w-2 h-2 rounded-full bg-primary" />
                                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{t('wins')}</Text>
                            </View>
                            <Text className="text-primary text-sm font-black">{wins}</Text>
                        </View>
                        <View className="bg-white/[0.04] rounded-full overflow-hidden" style={{ height: 6 }}>
                            <View className="h-full bg-primary rounded-full" style={{ width: share(wins) }} />
                        </View>
                    </View>
                    <View>
                        <View className="flex-row items-center justify-between mb-1">
                            <View className="flex-row items-center" style={{ gap: 6 }}>
                                <View className="w-2 h-2 rounded-full bg-yellow-500" />
                                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{t('draws')}</Text>
                            </View>
                            <Text className="text-yellow-500 text-sm font-black">{draws}</Text>
                        </View>
                        <View className="bg-white/[0.04] rounded-full overflow-hidden" style={{ height: 6 }}>
                            <View className="h-full bg-yellow-500 rounded-full" style={{ width: share(draws) }} />
                        </View>
                    </View>
                    <View>
                        <View className="flex-row items-center justify-between mb-1">
                            <View className="flex-row items-center" style={{ gap: 6 }}>
                                <View className="w-2 h-2 rounded-full bg-destructive" />
                                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{t('losses')}</Text>
                            </View>
                            <Text className="text-destructive text-sm font-black">{losses}</Text>
                        </View>
                        <View className="bg-white/[0.04] rounded-full overflow-hidden" style={{ height: 6 }}>
                            <View className="h-full bg-destructive rounded-full" style={{ width: share(losses) }} />
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

/** One column of the career row. `undefined` means the API didn't send the number: show a dash, not 0. */
function CareerStat({ value, label, valueClassName }: { value: number | undefined; label: string; valueClassName: string }) {
    return (
        <View className="flex-1 py-2.5 items-center">
            <Text className={cn('text-lg font-black', value === undefined ? 'text-slate-600' : valueClassName)}>
                {value === undefined ? '–' : value}
            </Text>
            <Text
                className="w-full text-center text-slate-500 text-[8px] uppercase font-black tracking-[1px]"
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {label}
            </Text>
        </View>
    );
}

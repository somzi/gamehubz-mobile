import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { COLORS } from '../../lib/theme';
import type { PlayerMatchesDto } from '../../types/user';

interface ProfileStatsTabProps {
    playerMatches: PlayerMatchesDto | null;
}

const OUTCOME = {
    W: { color: '#34D399', border: 'rgba(52,211,153,0.45)', from: 'rgba(52,211,153,0.32)', to: 'rgba(52,211,153,0.08)' },
    D: { color: '#FACC15', border: 'rgba(250,204,21,0.40)', from: 'rgba(250,204,21,0.26)', to: 'rgba(250,204,21,0.06)' },
    L: { color: '#F87171', border: 'rgba(248,113,113,0.45)', from: 'rgba(248,113,113,0.30)', to: 'rgba(248,113,113,0.07)' },
} as const;

const DONUT_SIZE = 100;
const DONUT_STROKE = 9;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2 - 1;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * Stats tab of both profiles (own tab and PlayerProfileScreen), drawn in the shareable player card's
 * language: career numbers with icons, the recent form strip, and the win-rate donut with the
 * wins / draws / losses beside it — sized so the whole tab fits a phone screen without scrolling.
 * The top row leaves out wins and win rate: the donut below shows both.
 */
export function ProfileStatsTab({ playerMatches }: ProfileStatsTabProps) {
    const { t } = useTranslation('profile');
    const { t: tCommon } = useTranslation('common');

    const stats = playerMatches?.stats;
    const totalMatches = stats?.totalMatches || 0;
    const wins = stats?.wins || 0;
    const draws = stats?.draws || 0;
    const losses = stats?.losses || 0;
    const winPercentage = Math.max(0, Math.min(100, Math.round(stats?.winRate || 0)));
    const filled = (winPercentage / 100) * DONUT_CIRCUMFERENCE;
    // The API sends the latest first; the strip reads left to right, oldest to latest.
    const form = [...(playerMatches?.performance || [])].reverse().slice(-10);

    return (
        <View style={{ gap: 10 }}>
            {/* ─── Career ─── */}
            <Panel style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 }}>
                <CareerStat icon="game-controller" iconColor="rgba(52,211,153,0.75)" value={stats ? totalMatches : undefined} label={t('matches')} />
                <StatDivider />
                <CareerStat icon="git-network" iconColor="rgba(34,211,238,0.75)" value={stats?.tournamentsPlayed} label={t('tournaments')} />
                <StatDivider />
                <CareerStat icon="trophy" iconColor="rgba(251,191,36,0.85)" value={stats ? stats.tournamentsWon : undefined} label={t('trophies')} valueColor="#FBBF24" />
                <StatDivider />
                <CareerStat icon="flash" iconColor="rgba(52,211,153,0.85)" value={stats?.longestWinStreak} label={t('bestStreak')} valueColor="#34D399" />
            </Panel>

            {/* ─── Recent Form ─── */}
            <Panel style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                        <View className="w-7 h-7 rounded-xl bg-indigo-500/10 items-center justify-center border border-indigo-400/20">
                            <Ionicons name="trending-up" size={14} color={COLORS.info} />
                        </View>
                        <Text className="text-[11px] font-black text-white uppercase tracking-widest">{t('recentForm')}</Text>
                    </View>
                    {form.length > 0 && (
                        <View className="flex-row items-center" style={{ gap: 9 }}>
                            <LegendDot color={OUTCOME.W.color} label={t('win')} />
                            <LegendDot color={OUTCOME.D.color} label={t('draw')} />
                            <LegendDot color={OUTCOME.L.color} label={t('loss')} />
                        </View>
                    )}
                </View>

                {form.length > 0 ? (
                    <>
                        <View className="flex-row" style={{ gap: 5 }}>
                            {form.map((match, i) => (
                                <FormTile
                                    key={i}
                                    outcome={match.outcome}
                                    label={tCommon(`outcome.${match.outcome}`)}
                                    latest={i === form.length - 1}
                                />
                            ))}
                            {Array.from({ length: 10 - form.length }).map((_, i) => (
                                <View
                                    key={`empty-${i}`}
                                    className="flex-1 h-7 rounded-[9px] items-center justify-center bg-white/[0.03] border border-white/[0.05]"
                                >
                                    <Text className="text-[10px] font-black text-white/10">-</Text>
                                </View>
                            ))}
                        </View>
                        <View className="flex-row items-center justify-between mt-2 px-0.5">
                            <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t('oldest')}</Text>
                            <View className="flex-1 mx-3 h-px bg-white/[0.05]" />
                            <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t('latest')}</Text>
                        </View>
                    </>
                ) : (
                    <View className="items-center py-3">
                        <Ionicons name="analytics-outline" size={26} color={COLORS.slate600} />
                        <Text className="text-slate-500 text-[12px] font-medium mt-2">{t('noPerformanceData')}</Text>
                    </View>
                )}
            </Panel>

            {/* ─── Win rate, with wins / draws / losses beside the donut ─── */}
            <Panel style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={styles.donutGlow}>
                    <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
                        <Defs>
                            <SvgLinearGradient id="profileWinRate" x1="0" y1="0" x2="1" y2="1">
                                <Stop offset="0" stopColor="#34D399" />
                                <Stop offset="1" stopColor="#22D3EE" />
                            </SvgLinearGradient>
                        </Defs>
                        <G rotation={-90} origin={`${DONUT_SIZE / 2}, ${DONUT_SIZE / 2}`}>
                            <Circle
                                cx={DONUT_SIZE / 2}
                                cy={DONUT_SIZE / 2}
                                r={DONUT_RADIUS}
                                fill="none"
                                stroke="rgba(148,163,184,0.14)"
                                strokeWidth={DONUT_STROKE}
                            />
                            {/* Skipped at 0%: a zero-length dash with a round cap would still paint a dot */}
                            {winPercentage > 0 && (
                                <Circle
                                    cx={DONUT_SIZE / 2}
                                    cy={DONUT_SIZE / 2}
                                    r={DONUT_RADIUS}
                                    fill="none"
                                    stroke="url(#profileWinRate)"
                                    strokeWidth={DONUT_STROKE}
                                    strokeLinecap="round"
                                    strokeDasharray={`${filled.toFixed(2)} ${DONUT_CIRCUMFERENCE.toFixed(2)}`}
                                />
                            )}
                        </G>
                    </Svg>
                    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }]}>
                        {/* No matches is no win rate, not 0%. */}
                        <Text style={TABULAR} className="text-[22px] leading-[26px] font-black text-white">
                            {totalMatches > 0 ? `${winPercentage}%` : '–'}
                        </Text>
                        <Text
                            className="w-full text-center text-[9px] font-bold text-slate-500 tracking-[1.4px]"
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                        >
                            {tCommon('app.winRate')}
                        </Text>
                    </View>
                </View>

                <View className="flex-1" style={{ gap: 6 }}>
                    <RecordRow label={tCommon('share.statWins')} value={wins} color="#34D399" tint="rgba(52,211,153,0.08)" border="rgba(52,211,153,0.22)" />
                    <RecordRow label={tCommon('share.statDraws')} value={draws} color="#FACC15" tint="rgba(250,204,21,0.06)" border="rgba(250,204,21,0.2)" />
                    <RecordRow label={tCommon('share.statLosses')} value={losses} color="#F87171" tint="rgba(248,113,113,0.07)" border="rgba(248,113,113,0.22)" />
                </View>
            </Panel>
        </View>
    );
}

/** Card for one block of the tab: card navy, a hairline edge and a soft shine along the top. */
function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return (
        <View style={[styles.panel, style]}>
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
                style={styles.panelShine}
            />
            {children}
        </View>
    );
}

/** One column of the career row. `undefined` means the API didn't send the number: show a dash, not 0. */
function CareerStat({
    icon,
    iconColor,
    value,
    label,
    valueColor = COLORS.foreground,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    value: number | undefined;
    label: string;
    valueColor?: string;
}) {
    return (
        <View className="flex-1 items-center px-1">
            <Ionicons name={icon} size={13} color={iconColor} style={{ marginBottom: 4 }} />
            <Text
                style={[TABULAR, { color: value === undefined ? COLORS.slate600 : valueColor }]}
                className="text-[21px] leading-[24px] font-black"
            >
                {value === undefined ? '–' : value}
            </Text>
            <Text
                className="w-full text-center text-[9px] font-bold uppercase tracking-[1.2px] text-slate-500 mt-1"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
            >
                {label}
            </Text>
        </View>
    );
}

function StatDivider() {
    return <View style={{ width: 1, height: 36, backgroundColor: 'rgba(148,163,184,0.12)' }} />;
}

/** One outcome beside the donut: the tinted pill of the share card, laid out as a row. */
function RecordRow({ label, value, color, tint, border }: { label: string; value: number; color: string; tint: string; border: string }) {
    return (
        <View
            className="flex-row items-center justify-between rounded-xl px-3 py-2"
            style={{ backgroundColor: tint, borderWidth: 1, borderColor: border }}
        >
            <Text className="shrink text-[10px] font-bold tracking-[1.2px]" style={{ color, opacity: 0.8 }} numberOfLines={1}>
                {label}
            </Text>
            <Text style={[TABULAR, { color }]} className="text-[17px] leading-[20px] font-black ml-2">
                {value}
            </Text>
        </View>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <View className="flex-row items-center" style={{ gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
            <Text className="text-[9px] text-slate-500 font-bold uppercase">{label}</Text>
        </View>
    );
}

/** One result in the form strip; the latest one glows so the eye lands on "now". */
function FormTile({ outcome, label, latest }: { outcome: 'W' | 'D' | 'L'; label: string; latest: boolean }) {
    const theme = OUTCOME[outcome] ?? OUTCOME.L;
    return (
        <View
            className="flex-1"
            style={latest ? { shadowColor: theme.color, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } } : undefined}
        >
            <LinearGradient
                colors={[theme.from, theme.to]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.formTile, { borderColor: latest ? theme.color : theme.border }]}
            >
                <Text className="text-[11px] font-black" style={{ color: theme.color }}>
                    {label}
                </Text>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    panel: {
        backgroundColor: COLORS.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    panelShine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
    },
    donutGlow: {
        width: DONUT_SIZE,
        height: DONUT_SIZE,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
    },
    formTile: {
        height: 28,
        borderRadius: 9,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

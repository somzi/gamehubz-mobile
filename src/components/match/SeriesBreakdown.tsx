import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';
import { SeriesFormatChip } from '../bracket/SeriesFormatChip';
import {
    SeriesFormat,
    SeriesGame,
    groupBySeries,
    seriesBlockLabel,
} from '../../lib/series';

interface SeriesBreakdownProps {
    /** Games to list, main series first then any tiebreak replay. */
    games: SeriesGame[];
    format: SeriesFormat;
    /**
     * Which accent marks the winner of each game. "final" is the settled result's green; "proposed"
     * is the amber of a result still waiting on approval, so the rows read as part of the proposal
     * rather than as something already official.
     */
    tone?: 'final' | 'proposed';
    className?: string;
}

const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * The games behind a headline score.
 *
 * "2 : 1" says nothing about what was actually played, so every place that shows a series result —
 * settled or merely proposed — lists the games the same way: the format on top (the same chip the
 * bracket columns wear), then one row per game with the side that took it lit up. A single-game
 * match has nothing to break down and renders nothing.
 */
export function SeriesBreakdown({ games, format, tone = 'final', className }: SeriesBreakdownProps) {
    const { t } = useTranslation('match');
    if (games.length === 0) return null;

    const accent = tone === 'proposed' ? '#FBBF24' : '#34D399';

    return (
        <View className={cn('pt-4 border-t border-white/[0.06]', className)}>
            <View className="items-center mb-3">
                <SeriesFormatChip format={format} />
            </View>

            {groupBySeries(games).map(block => (
                <View key={block.seriesNumber} className="mb-1">
                    {block.seriesNumber > 1 && (
                        <Text className="text-[9.5px] font-black text-warning uppercase tracking-[1.5px] text-center mt-2 mb-1.5">
                            {seriesBlockLabel(block.seriesNumber)}
                        </Text>
                    )}
                    <View style={{ gap: 4 }}>
                        {block.games.map((g, gi) => {
                            const homeTook = g.homeScore > g.awayScore;
                            const awayTook = g.awayScore > g.homeScore;
                            return (
                                <View key={gi} className="flex-row items-center h-9 px-3 rounded-xl bg-white/[0.03]">
                                    <Text className="flex-1 text-[12px] font-semibold text-slate-500" numberOfLines={1}>
                                        {t('series.gameN', { n: gi + 1 })}
                                    </Text>
                                    <View className="flex-row items-center">
                                        <Text
                                            style={[TABULAR, { color: homeTook ? accent : COLORS.slate300 }]}
                                            className="w-8 text-right text-[15px] font-black"
                                        >
                                            {g.homeScore}
                                        </Text>
                                        <Text className="text-[12px] font-black text-slate-600 mx-2">:</Text>
                                        <Text
                                            style={[TABULAR, { color: awayTook ? accent : COLORS.slate300 }]}
                                            className="w-8 text-[15px] font-black"
                                        >
                                            {g.awayScore}
                                        </Text>
                                    </View>
                                    {/* Mirrors the label's width so the score sits on the card's axis */}
                                    <View className="flex-1" />
                                </View>
                            );
                        })}
                    </View>
                </View>
            ))}
        </View>
    );
}

import { View, Text } from 'react-native';
import { cn } from '../../lib/utils';
import {
    SeriesFormat,
    SeriesGame,
    SeriesWinCondition,
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

/**
 * The games behind a headline score.
 *
 * "2 : 1" says nothing about what was actually played, so every place that shows a series result —
 * settled or merely proposed — lists the games the same way. A single-game match has nothing to
 * break down and renders nothing.
 */
export function SeriesBreakdown({ games, format, tone = 'final', className }: SeriesBreakdownProps) {
    if (games.length === 0) return null;

    const accent = tone === 'proposed' ? 'text-warning' : 'text-primary';

    return (
        <View className={cn('pt-4 border-t border-white/[0.06]', className)}>
            <Text className="text-[9px] font-black text-slate-500 uppercase tracking-[2px] text-center mb-3">
                Best of {format.bestOf} · {format.condition === SeriesWinCondition.AggregateScore ? 'Total score' : 'Games won'}
            </Text>

            {groupBySeries(games).map(block => (
                <View key={block.seriesNumber} className="mb-1.5">
                    {block.seriesNumber > 1 && (
                        <Text className="text-[9px] font-black text-warning uppercase tracking-[1.5px] text-center mb-1">
                            {seriesBlockLabel(block.seriesNumber)}
                        </Text>
                    )}
                    {block.games.map((g, gi) => (
                        <View key={gi} className="flex-row items-center justify-center gap-3 py-0.5">
                            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16 text-right">
                                Game {gi + 1}
                            </Text>
                            <Text className={cn(
                                'text-sm font-black w-8 text-right',
                                g.homeScore > g.awayScore ? accent : 'text-slate-400',
                            )}>
                                {g.homeScore}
                            </Text>
                            <Text className="text-[10px] font-black text-slate-700">:</Text>
                            <Text className={cn(
                                'text-sm font-black w-8',
                                g.awayScore > g.homeScore ? accent : 'text-slate-400',
                            )}>
                                {g.awayScore}
                            </Text>
                            <View className="w-16" />
                        </View>
                    ))}
                </View>
            ))}
        </View>
    );
}

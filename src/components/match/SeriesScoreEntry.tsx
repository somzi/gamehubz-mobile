import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import {
    SeriesFormat,
    SeriesGame,
    SeriesOutcome,
    SeriesWinCondition,
    bestOfForSeries,
    evaluateSeries,
    seriesBlockLabel,
} from '../../lib/series';

interface GameRow {
    left: string;
    right: string;
    seriesNumber: number;
}

interface SeriesScoreEntryProps {
    /** Left column label — the parent decides whose side that is (usually the logged-in player). */
    leftName: string;
    rightName: string;
    format: SeriesFormat;
    /**
     * Whether a level series can go to a tiebreak replay. True only for solo knockout matches:
     * league / group / Swiss record a level series as a draw, and a level team sub-match is settled
     * one level up by the tie itself.
     */
    allowTiebreak: boolean;
    /** Games already reported, in the same left/right orientation as the labels. */
    initialGames?: SeriesGame[];
    /** Fires on every edit. `isComplete` means the series is finished and safe to submit. */
    onChange: (games: SeriesGame[], outcome: SeriesOutcome, isComplete: boolean) => void;
    onFocusInput?: () => void;
    /** False for viewers who can't report this match — the games still render, read-only. */
    editable?: boolean;
}

const emptyRow = (seriesNumber: number): GameRow => ({ left: '', right: '', seriesNumber });

const isFilled = (row: GameRow) => row.left !== '' && row.right !== '';

const toGames = (rows: GameRow[]): SeriesGame[] =>
    rows.filter(isFilled).map(r => ({
        homeScore: parseInt(r.left, 10),
        awayScore: parseInt(r.right, 10),
        seriesNumber: r.seriesNumber,
    }));

/**
 * Progressive best-of entry: shows the games played plus, at most, the single next one.
 *
 * A best-of-7 won 4–0 asks for four games and then stops — it never puts seven blank inputs on
 * screen and never asks for games that cannot change the result. When a series ends level and a
 * tiebreak is available, the reporter starts the replay explicitly rather than the form silently
 * growing.
 *
 * Everything is computed from the shared series module, the same rules the server enforces on
 * submit, so what the form calls finished is what the server accepts.
 */
export function SeriesScoreEntry({
    leftName,
    rightName,
    format,
    allowTiebreak,
    initialGames,
    onChange,
    onFocusInput,
    editable = true,
}: SeriesScoreEntryProps) {
    const [rows, setRows] = useState<GameRow[]>(() => {
        const seeded = (initialGames ?? []).map(g => ({
            left: String(g.homeScore),
            right: String(g.awayScore),
            seriesNumber: g.seriesNumber,
        }));
        return seeded.length > 0 ? seeded : [emptyRow(1)];
    });

    const games = useMemo(() => toGames(rows), [rows]);
    const outcome = useMemo(() => evaluateSeries(games, format), [games, format]);

    // Keep exactly one open row while the series can still take games, and none once it can't.
    // Runs after every edit so the form grows a game at a time and collapses the moment the
    // series is clinched — the "Bo7 won 4–0 shouldn't ask for 7 scores" rule.
    useEffect(() => {
        setRows(current => {
            const filled = current.filter(isFilled);
            const currentSeries = outcome.currentSeriesNumber;

            if (outcome.canAddGame) {
                const openRows = current.filter(r => !isFilled(r));
                if (openRows.length === 1 && current.length === filled.length + 1) return current;
                return [...filled, emptyRow(currentSeries)];
            }

            if (current.length === filled.length) return current;
            return filled;
        });
    }, [outcome.canAddGame, outcome.currentSeriesNumber, games.length]);

    useEffect(() => {
        // Reportable as soon as the current series is played out. A level knockout series counts:
        // the tiebreak is a game still to be played, often days later, so the server records the
        // series and parks the match awaiting it rather than forcing one all-in-one submission.
        // Players who already played the tiebreak add it here first via "Start tiebreak".
        const isComplete = games.length > 0 && outcome.currentSeriesOver;

        onChange(games, outcome, isComplete);
        // onChange identity is not stable across parent renders; the payload is what matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [games, outcome, allowTiebreak]);

    const setCell = (index: number, side: 'left' | 'right', value: string) => {
        const digits = value.replace(/[^0-9]/g, '').slice(0, 3);
        setRows(current => current.map((r, i) => (i === index ? { ...r, [side]: digits } : r)));
    };

    const startTiebreak = () => {
        setRows(current => [...current, emptyRow(outcome.currentSeriesNumber + 1)]);
    };

    const undoLastGame = () => {
        setRows(current => {
            const filled = current.filter(isFilled);
            if (filled.length === 0) return current;
            const remaining = filled.slice(0, -1);
            return remaining.length > 0 ? remaining : [emptyRow(1)];
        });
    };

    const isSingleGame = format.bestOf <= 1 && outcome.currentSeriesNumber === 1;
    const isAggregate = format.condition === SeriesWinCondition.AggregateScore;

    // Rows grouped into their series so tiebreak replays read as their own blocks rather than
    // continuing the main series' numbering.
    const blocks = useMemo(() => {
        const bySeries = new Map<number, { row: GameRow; index: number }[]>();
        rows.forEach((row, index) => {
            const list = bySeries.get(row.seriesNumber);
            if (list) list.push({ row, index });
            else bySeries.set(row.seriesNumber, [{ row, index }]);
        });
        return [...bySeries.entries()].sort((a, b) => a[0] - b[0]);
    }, [rows]);

    return (
        <View className={cn('gap-3', !editable && 'opacity-60')}>
            {!isSingleGame && (
                <View className="flex-row items-center justify-between px-1">
                    <Text className="text-[10px] font-black text-slate-500 uppercase tracking-[2px]">
                        Best of {format.bestOf} · {isAggregate ? 'Aggregate score' : 'Match wins'}
                    </Text>
                    {games.length > 0 && editable && (
                        <Pressable onPress={undoLastGame} className="flex-row items-center gap-1 active:opacity-60">
                            <Ionicons name="arrow-undo-outline" size={13} color="#64748B" />
                            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Undo game</Text>
                        </Pressable>
                    )}
                </View>
            )}

            <View className="rounded-[20px] bg-card/60 border border-white/[0.04] overflow-hidden">
                {/* Player headers */}
                <View className="flex-row items-center px-4 pt-4 pb-2">
                    <View className="w-16" />
                    <View className="flex-1 items-center">
                        <Text className="text-[11px] font-black text-primary uppercase tracking-wider" numberOfLines={1}>
                            {leftName}
                        </Text>
                    </View>
                    <View className="w-8" />
                    <View className="flex-1 items-center">
                        <Text className="text-[11px] font-black text-white uppercase tracking-wider" numberOfLines={1}>
                            {rightName}
                        </Text>
                    </View>
                </View>

                {blocks.map(([seriesNumber, entries]) => (
                    <View key={seriesNumber}>
                        {seriesNumber > 1 && (
                            <View className="flex-row items-center gap-2 px-4 pt-3 pb-1">
                                <Ionicons name="flash" size={12} color="#F59E0B" />
                                <Text className="text-[10px] font-black text-warning uppercase tracking-[2px]">
                                    {seriesBlockLabel(seriesNumber)} · Bo{bestOfForSeries(seriesNumber, format)}
                                </Text>
                            </View>
                        )}

                        {entries.map(({ row, index }, positionInSeries) => {
                            const open = !isFilled(row);
                            return (
                                <View
                                    key={index}
                                    className={cn(
                                        'flex-row items-center px-4 py-2',
                                        open ? 'bg-primary/[0.04]' : '',
                                    )}
                                >
                                    <View className="w-16">
                                        <Text className={cn(
                                            'text-[11px] font-bold uppercase tracking-wider',
                                            open ? 'text-primary' : 'text-slate-500',
                                        )}>
                                            {isSingleGame ? 'Score' : `Game ${positionInSeries + 1}`}
                                        </Text>
                                    </View>

                                    <View className="flex-1">
                                        <TextInput
                                            className={cn(
                                                'w-full text-center font-black h-12 rounded-2xl border',
                                                open
                                                    ? 'bg-background-deep text-xl text-primary border-primary/30'
                                                    : 'bg-background-deep/60 text-lg text-primary border-white/[0.06]',
                                            )}
                                            placeholder="0"
                                            placeholderTextColor="#1E293B"
                                            keyboardType="numeric"
                                            value={row.left}
                                            onChangeText={v => setCell(index, 'left', v)}
                                            onFocus={onFocusInput}
                                            editable={editable}
                                        />
                                    </View>

                                    <View className="w-8 items-center">
                                        <Text className="text-[11px] font-black text-slate-600">:</Text>
                                    </View>

                                    <View className="flex-1">
                                        <TextInput
                                            className={cn(
                                                'w-full text-center font-black h-12 rounded-2xl border',
                                                open
                                                    ? 'bg-background-deep text-xl text-white border-primary/30'
                                                    : 'bg-background-deep/60 text-lg text-white border-white/[0.06]',
                                            )}
                                            placeholder="0"
                                            placeholderTextColor="#1E293B"
                                            keyboardType="numeric"
                                            value={row.right}
                                            onChangeText={v => setCell(index, 'right', v)}
                                            onFocus={onFocusInput}
                                            editable={editable}
                                        />
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ))}

                {!isSingleGame && <SeriesSummary outcome={outcome} format={format} leftName={leftName} rightName={rightName} />}
            </View>

            {outcome.isLevel && allowTiebreak && editable && (
                <Pressable
                    onPress={startTiebreak}
                    className="rounded-[20px] p-4 flex-row items-center gap-3 bg-warning/[0.08] border border-warning/20 active:opacity-80"
                >
                    <View className="w-10 h-10 rounded-2xl bg-warning/15 items-center justify-center">
                        <Ionicons name="flash" size={18} color="#F59E0B" />
                    </View>
                    <View className="flex-1">
                        <Text className="text-[10px] font-black text-warning uppercase tracking-[2px]">Match tied</Text>
                        <Text className="text-[11px] text-slate-400 mt-0.5">
                            Tap to play a tiebreak — best of {bestOfForSeries(outcome.currentSeriesNumber + 1, format)}.
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#F59E0B" />
                </Pressable>
            )}
        </View>
    );
}

/** The running / final line under the games: who leads, who won, and why the form stopped asking. */
function SeriesSummary({
    outcome,
    format,
    leftName,
    rightName,
}: {
    outcome: SeriesOutcome;
    format: SeriesFormat;
    leftName: string;
    rightName: string;
}) {
    const { homeHeadline, awayHeadline, currentSeriesOver, isLevel, gamesInCurrentSeries, currentSeriesBestOf } = outcome;

    if (gamesInCurrentSeries === 0) {
        return (
            <View className="px-4 py-3 border-t border-white/[0.04]">
                <Text className="text-[11px] text-slate-500 text-center">
                    Enter game 1 to start the series.
                </Text>
            </View>
        );
    }

    const leader = homeHeadline > awayHeadline ? leftName : rightName;
    const clinchedEarly = currentSeriesOver && gamesInCurrentSeries < currentSeriesBestOf;

    return (
        <View className="px-4 py-3 border-t border-white/[0.04] items-center">
            <View className="flex-row items-baseline gap-2">
                <Text className="text-2xl font-black text-primary">{homeHeadline}</Text>
                <Text className="text-sm font-black text-slate-600">—</Text>
                <Text className="text-2xl font-black text-white">{awayHeadline}</Text>
            </View>

            {currentSeriesOver ? (
                <Text className={cn(
                    'text-[11px] font-bold mt-1 text-center',
                    isLevel ? 'text-warning' : 'text-primary',
                )}>
                    {isLevel
                        ? 'Series level'
                        : `${leader} wins the series ${Math.max(homeHeadline, awayHeadline)}–${Math.min(homeHeadline, awayHeadline)}`}
                    {clinchedEarly ? ` · ended after game ${gamesInCurrentSeries}` : ''}
                </Text>
            ) : (
                <Text className="text-[11px] text-slate-500 mt-1 text-center">
                    {format.condition === SeriesWinCondition.AggregateScore
                        ? `${gamesInCurrentSeries} of ${currentSeriesBestOf} games played`
                        : `Game ${gamesInCurrentSeries + 1} of up to ${currentSeriesBestOf}`}
                </Text>
            )}
        </View>
    );
}

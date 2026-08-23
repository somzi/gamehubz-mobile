import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PlayerIdentity, hasNickname } from './PlayerIdentity';
import {
    SeriesFormat,
    SeriesGame,
    SeriesOutcome,
    SeriesWinCondition,
    bestOfForSeries,
    evaluateSeries,
    isSeriesOver,
    minimumGamesRequired,
    playableGames,
    seriesBlockLabel,
} from '../../lib/series';

interface GameRow {
    left: string;
    right: string;
    seriesNumber: number;
}

interface SeriesScoreEntryProps {
    /** Left column player — the parent decides whose side that is (usually the logged-in player). */
    leftName: string;
    /** In-game nickname, shown on its own gamepad line under the username. */
    leftNickname?: string | null;
    leftAvatarUrl?: string | null;
    rightName: string;
    rightNickname?: string | null;
    rightAvatarUrl?: string | null;
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
    /**
     * Called with the focused game row so the host can scroll it clear of the keyboard. The row is
     * handed over rather than a "scroll to bottom" signal, because the games sit above the summary,
     * the submit button and the evidence panel — scrolling to the end skips straight past them.
     */
    onFocusInput?: (row: View | null) => void;
    /** False for viewers who can't report this match — the games still render, read-only. */
    editable?: boolean;
}

const isFilled = (row: GameRow) => row.left !== '' && row.right !== '';

/** Games recorded so far in one series: the unbroken run from the top, so a gap ends the record. */
const contiguousFilled = (rows: GameRow[]) => {
    let count = 0;
    while (count < rows.length && isFilled(rows[count])) count++;
    return count;
};

/** Groups rows into their series, in order, keeping each block's index into the flat list. */
function groupRows(rows: GameRow[]): { seriesNumber: number; rows: GameRow[]; offset: number }[] {
    const blocks: { seriesNumber: number; rows: GameRow[]; offset: number }[] = [];

    rows.forEach((row, index) => {
        const last = blocks[blocks.length - 1];
        if (last && last.seriesNumber === row.seriesNumber) last.rows.push(row);
        else blocks.push({ seriesNumber: row.seriesNumber, rows: [row], offset: index });
    });

    return blocks;
}

/** Lays every series out at full length, so a Bo5 shows five rows from the start. */
function buildRows(initialGames: SeriesGame[] | undefined, format: SeriesFormat): GameRow[] {
    const games = initialGames ?? [];
    const seriesCount = games.length === 0 ? 1 : Math.max(...games.map(g => g.seriesNumber));
    const rows: GameRow[] = [];

    for (let seriesNumber = 1; seriesNumber <= seriesCount; seriesNumber++) {
        const bestOf = bestOfForSeries(seriesNumber, format);
        // Only what could have been played: a game recorded after the series was already decided
        // is one the server will refuse, so it must not come back into the form as an edit.
        const played = playableGames(
            games.filter(g => g.seriesNumber === seriesNumber),
            bestOf,
            format.condition,
        );

        for (let i = 0; i < bestOf; i++) {
            const game = played[i];
            rows.push({
                left: game ? String(game.homeScore) : '',
                right: game ? String(game.awayScore) : '',
                seriesNumber,
            });
        }
    }

    return rows;
}

function collectGames(rows: GameRow[]): SeriesGame[] {
    const games: SeriesGame[] = [];

    for (const block of groupRows(rows)) {
        for (const row of block.rows) {
            if (!isFilled(row)) break;
            games.push({
                homeScore: parseInt(row.left, 10),
                awayScore: parseInt(row.right, 10),
                seriesNumber: block.seriesNumber,
            });
        }
    }

    return games;
}

/**
 * Best-of entry: the whole series is laid out, but only the games that need playing are open.
 *
 * A Bo5 shows five rows from the start with the last two dimmed, because three is the fewest that
 * can settle it. Each further row unlocks only once the score makes it necessary, so the format's
 * shape is visible up front while the form never asks for a game that cannot change the result —
 * a Bo7 won 4–0 leaves its last three rows greyed and stops there.
 *
 * Everything is computed from the shared series module, the same rules the server enforces on
 * submit, so what the form calls finished is what the server accepts.
 */
export function SeriesScoreEntry({
    leftName,
    leftNickname,
    leftAvatarUrl,
    rightName,
    rightNickname,
    rightAvatarUrl,
    format,
    allowTiebreak,
    initialGames,
    onChange,
    onFocusInput,
    editable = true,
}: SeriesScoreEntryProps) {
    // The raw `format` prop is fine here: the initializer runs once, so identity churn can't reach it.
    const [rows, setRows] = useState<GameRow[]>(() => buildRows(initialGames, format));

    // Callers build the format object inline, so a fresh identity arrives on every parent render.
    // Rebuilding it from its primitive fields keeps everything memoised below stable: without this
    // the outcome recomputed each render, the onChange effect fired, the parent set state from it,
    // and that re-render produced yet another format object — an unbounded update loop.
    const stableFormat = useMemo<SeriesFormat>(
        () => ({ bestOf: format.bestOf, tiebreakBestOf: format.tiebreakBestOf, condition: format.condition }),
        [format.bestOf, format.tiebreakBestOf, format.condition],
    );

    const games = useMemo(() => collectGames(rows), [rows]);
    const outcome = useMemo(() => evaluateSeries(games, stableFormat), [games, stableFormat]);

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
        setRows(current => {
            const next = outcome.currentSeriesNumber + 1;
            const length = bestOfForSeries(next, stableFormat);
            return [
                ...current,
                ...Array.from({ length }, () => ({ left: '', right: '', seriesNumber: next })),
            ];
        });
    };

    /** Clears the last recorded game rather than removing its row — the layout stays put. */
    const undoLastGame = () => {
        setRows(current => {
            const lastFilled = current.map(isFilled).lastIndexOf(true);
            if (lastFilled < 0) return current;
            return current.map((r, i) => (i === lastFilled ? { ...r, left: '', right: '' } : r));
        });
    };

    // Reserve the nickname line on both sides when either player has one, so the two columns line up.
    const pairingHasNickname =
        hasNickname(leftNickname) || hasNickname(rightNickname);

    const isSingleGame = stableFormat.bestOf <= 1 && outcome.currentSeriesNumber === 1;
    const isAggregate = stableFormat.condition === SeriesWinCondition.AggregateScore;

    const rowRefs = useRef<Record<number, View | null>>({});

    // How far each series is opened up: the games it must play whatever happens, then one more at a
    // time for as long as the score leaves the outcome open. A settled series opens nothing further.
    const blocks = useMemo(() => groupRows(rows).map(block => {
        const bestOf = bestOfForSeries(block.seriesNumber, stableFormat);
        const played = contiguousFilled(block.rows);
        const settled = isSeriesOver(
            games.filter(g => g.seriesNumber === block.seriesNumber),
            bestOf,
            stableFormat.condition,
        );

        const unlocked = settled
            ? played
            : Math.min(bestOf, Math.max(minimumGamesRequired(bestOf, stableFormat.condition), played + 1));

        return { ...block, bestOf, played, unlocked };
    }), [rows, games, stableFormat]);

    return (
        <View className={cn('gap-3', !editable && 'opacity-60')}>
            {!isSingleGame && (
                <View className="flex-row items-center justify-between px-1">
                    <Text className="text-[10px] font-black text-slate-500 uppercase tracking-[2px]">
                        Best of {stableFormat.bestOf} · {isAggregate ? 'Aggregate score' : 'Match wins'}
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
                {/* Player headers: avatar plus both names, the same pairing block the rest of the
                    app uses. Who is entering a score for whom matters more here than anywhere, so
                    the in-game nickname stays visible rather than being collapsed into a username. */}
                <View className="flex-row items-start px-4 pt-4 pb-2">
                    <View className="w-16" />
                    <View className="flex-1 items-center gap-1.5">
                        <PlayerAvatar src={leftAvatarUrl ?? undefined} name={leftName} size="sm" />
                        <PlayerIdentity
                            username={leftName}
                            nickname={leftNickname}
                            tone="home"
                            reserveNicknameSpace={pairingHasNickname}
                        />
                    </View>
                    <View className="w-8" />
                    <View className="flex-1 items-center gap-1.5">
                        <PlayerAvatar src={rightAvatarUrl ?? undefined} name={rightName} size="sm" />
                        <PlayerIdentity
                            username={rightName}
                            nickname={rightNickname}
                            tone="away"
                            reserveNicknameSpace={pairingHasNickname}
                        />
                    </View>
                </View>

                {blocks.map(block => (
                    <View key={block.seriesNumber}>
                        {block.seriesNumber > 1 && (
                            <View className="flex-row items-center gap-2 px-4 pt-3 pb-1">
                                <Ionicons name="flash" size={12} color="#F59E0B" />
                                <Text className="text-[10px] font-black text-warning uppercase tracking-[2px]">
                                    {seriesBlockLabel(block.seriesNumber)} · Bo{block.bestOf}
                                </Text>
                            </View>
                        )}

                        {block.rows.map((row, positionInSeries) => {
                            const index = block.offset + positionInSeries;
                            // Beyond what the score has made necessary: shown so the format's length
                            // is visible, dimmed and closed so it can't be filled out of turn.
                            const locked = positionInSeries >= block.unlocked;
                            // The one row the reporter is being asked for right now.
                            const open = !locked && !isFilled(row) && positionInSeries === block.played;
                            return (
                                <View
                                    key={index}
                                    ref={node => { rowRefs.current[index] = node; }}
                                    className={cn(
                                        'flex-row items-center px-4 py-2',
                                        open ? 'bg-primary/[0.04]' : '',
                                        locked ? 'opacity-35' : '',
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
                                            placeholder={locked ? '–' : '0'}
                                            placeholderTextColor="#1E293B"
                                            keyboardType="numeric"
                                            value={row.left}
                                            onChangeText={v => setCell(index, 'left', v)}
                                            onFocus={() => onFocusInput?.(rowRefs.current[index])}
                                            editable={editable && !locked}
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
                                            placeholder={locked ? '–' : '0'}
                                            placeholderTextColor="#1E293B"
                                            keyboardType="numeric"
                                            value={row.right}
                                            onChangeText={v => setCell(index, 'right', v)}
                                            onFocus={() => onFocusInput?.(rowRefs.current[index])}
                                            editable={editable && !locked}
                                        />
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ))}

                {!isSingleGame && <SeriesSummary outcome={outcome} format={stableFormat} leftName={leftName} rightName={rightName} />}
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
                            Tap to play a tiebreak — best of {bestOfForSeries(outcome.currentSeriesNumber + 1, stableFormat)}.
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

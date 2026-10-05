import type { VerificationGame, VerificationPanel, VerificationRecord, VerificationTarget } from './resultVerification';
import type { SeriesFormat, SeriesGame } from './series';
import { bestOfForSeries, evaluateSeries, minimumGamesRequired } from './series';

/**
 * Per-game result verification, as pure rules: which games a report has to prove, and what each game
 * of the panel means for the series as it stands. The server's VerificationGames holds the same rules
 * for its report gate — keep the two in step.
 */

/** Mirrors the server's MatchVerificationStatus. */
export const VERIFICATION_STARTED = 0;
export const VERIFICATION_BIOMETRIC_OK = 1;
export const VERIFICATION_VERIFIED = 2;
export const VERIFICATION_FAILED = 3;

/**
 * seriesNumber and gameNumber of a proof for the whole match — made before per-game verification, or by
 * an app from before it. The server lays it on every game of its player.
 */
export const WHOLE_MATCH = 0;

export const isVerified = (record: VerificationRecord | null | undefined) =>
    !!record && record.status === VERIFICATION_VERIFIED;

export const verificationGameKey = (game: VerificationTarget) => `${game.seriesNumber}:${game.gameNumber}`;

/** What a game is to the series as it stands. */
export type VerificationSlotRole =
    /** Played, or certain to be: a proof of it is what the report needs. */
    | 'required'
    /** Only played if the series runs on that long — nothing asks for it yet. */
    | 'optional'
    /** On the recorded result already (a parked tiebreak's level series): it stands on its own proofs. */
    | 'recorded'
    /** The series ended before it. */
    | 'notPlayed';

export interface VerificationSlot extends VerificationGame {
    role: VerificationSlotRole;
    /** This game in the result being shown, when it has one. */
    score: SeriesGame | null;
}

/** Numbers each game inside its series: [S1, S1, S2] → 1:1, 1:2, 2:1. */
export function numberGames(games: Pick<SeriesGame, 'seriesNumber'>[]): VerificationTarget[] {
    const counts = new Map<number, number>();
    return games.map(game => {
        const gameNumber = (counts.get(game.seriesNumber) ?? 0) + 1;
        counts.set(game.seriesNumber, gameNumber);
        return { seriesNumber: game.seriesNumber, gameNumber };
    });
}

/**
 * The games of a report its reporter has to prove: all of them, except those already on the recorded
 * result unchanged — a tiebreak is reported together with the level series before it. A report that
 * leaves out a recorded game rewrites the result rather than adding to it, so all its games are proven.
 */
export function gamesToProve(games: SeriesGame[], recorded: SeriesGame[]): VerificationTarget[] {
    const onRecord = new Map(numberGames(recorded).map((target, index) => [verificationGameKey(target), recorded[index]]));
    const reported = numberGames(games);
    const reportedKeys = new Set(reported.map(verificationGameKey));
    const dropsRecordedGame = [...onRecord.keys()].some(key => !reportedKeys.has(key));
    return reported.filter((target, index) => {
        const kept = onRecord.get(verificationGameKey(target));
        return dropsRecordedGame || !kept || kept.homeScore !== games[index].homeScore || kept.awayScore !== games[index].awayScore;
    });
}

/**
 * The fewest games the next report can hold, for when no score exists yet: the series still to be played
 * — the main one, or the tiebreak a parked match waits for — up to its win target.
 */
export function shortestNextSeries(format: SeriesFormat, recorded: SeriesGame[]): VerificationTarget[] {
    const seriesNumber = recorded.length === 0 ? 1 : Math.max(...recorded.map(game => game.seriesNumber)) + 1;
    const count = minimumGamesRequired(bestOfForSeries(seriesNumber, format), format.condition);
    return Array.from({ length: count }, (_, index) => ({ seriesNumber, gameNumber: index + 1 }));
}

/** A player reads their own proof; an organizer (or a spectator) needs both players'. */
export function gameIsVerified(game: VerificationGame, byBothPlayers: boolean): boolean {
    if (!byBothPlayers) return isVerified(game.mine);
    const players = game.records.filter(record => record.status !== VERIFICATION_FAILED);
    return players.length > 0 && players.every(isVerified);
}

/**
 * Every game of the panel, with what it means for the result in view — the card's rows, its progress
 * (the required ones) and the sheet's next game. `played` is that result: the score being typed, a
 * pending proposal, or the result on record, and `complete` says it is a whole one. `recorded` are the
 * games a new report repeats (a parked tiebreak's level series) — none when the result is reviewed.
 */
export function buildVerificationSlots(
    panel: VerificationPanel,
    format: SeriesFormat,
    played: SeriesGame[],
    complete: boolean,
    recorded: SeriesGame[] = [],
): VerificationSlot[] {
    const playedTargets = numberGames(played);
    const scores = new Map(playedTargets.map((target, index) => [verificationGameKey(target), played[index]]));
    const toProve = new Set(gamesToProve(played, recorded).map(verificationGameKey));
    const lastPlayed = played.length === 0 ? 0 : Math.max(...played.map(game => game.seriesNumber));
    // A whole result that finished level waits for the next series: a parked knockout tiebreak.
    const awaitingTiebreak = complete && played.length > 0 && evaluateSeries(played, format).isLevel;
    // A series the server does not list yet (a tiebreak typed into the same report) is open to the
    // player as long as anything is, and a whole-match proof covers it like every other game.
    const wholeMatchProof = panel.games.map(game => game.mine).find(mine => isVerified(mine) && mine!.gameNumber === WHOLE_MATCH) ?? null;
    const isPlayer = panel.canVerify || panel.games.some(game => isVerified(game.mine));

    const seriesNumbers = [...new Set([1, ...panel.games.map(game => game.seriesNumber), ...played.map(game => game.seriesNumber)])]
        .sort((a, b) => a - b);

    return seriesNumbers.flatMap(seriesNumber => {
        const bestOf = bestOfForSeries(seriesNumber, format);
        const minimum = minimumGamesRequired(bestOf, format.condition);
        const listed = panel.games.filter(game => game.seriesNumber === seriesNumber);
        const playedHere = playedTargets.filter(target => target.seriesNumber === seriesNumber).length;
        const count = Math.max(bestOf, ...listed.map(game => game.gameNumber));

        const roleOf = (gameNumber: number, key: string): VerificationSlotRole => {
            if (scores.has(key)) return toProve.has(key) ? 'required' : 'recorded';
            // Only a finished, level series is ever followed by another one.
            if (seriesNumber < lastPlayed) return 'notPlayed';
            if (seriesNumber === lastPlayed) {
                if (complete) return 'notPlayed';
                // Still being typed: the next game, and as many as its shortest finish needs, will be played.
                return gameNumber <= Math.max(minimum, playedHere + 1) ? 'required' : 'optional';
            }
            // Nothing played in it yet: the main series before any score, or the tiebreak a level result
            // waits for. A whole result with no games at all (a no-show) has nothing left to play.
            const upNext = lastPlayed === 0
                ? seriesNumber === 1 && !complete
                : seriesNumber === lastPlayed + 1 && awaitingTiebreak;
            if (upNext) return gameNumber <= minimum ? 'required' : 'optional';
            return complete ? 'notPlayed' : 'optional';
        };

        return Array.from({ length: count }, (_, index): VerificationSlot => {
            const gameNumber = index + 1;
            const key = verificationGameKey({ seriesNumber, gameNumber });
            const game: VerificationGame = listed.find(item => item.gameNumber === gameNumber) ?? {
                seriesNumber,
                gameNumber,
                canVerify: !wholeMatchProof && isPlayer,
                mine: wholeMatchProof,
                records: [],
            };
            return { ...game, role: roleOf(gameNumber, key), score: scores.get(key) ?? null };
        });
    });
}

/** The first game the player still has to prove — what the card opens, and what the sheet offers next. */
export function nextVerificationTarget(slots: VerificationSlot[] | null): VerificationTarget | null {
    const next = slots?.find(slot => slot.role === 'required' && slot.canVerify && !isVerified(slot.mine));
    return next ? { seriesNumber: next.seriesNumber, gameNumber: next.gameNumber } : null;
}

/**
 * Whether the server would refuse this report for want of a proof — its gate, run on the score being
 * typed (every game but those already on the recorded result), or, before any score, on the shortest
 * series still to be played. Organizers are exempt, except in a match they play themselves.
 */
export function verificationBlocksReport(
    panel: VerificationPanel | null,
    format: SeriesFormat,
    draft: SeriesGame[],
    recorded: SeriesGame[] = [],
): boolean {
    // An older server names no participant and exempts every organizer; it is the one that decides.
    if (!panel || !panel.required || (panel.isManager && panel.isParticipant !== true)) return false;
    // A server from before per-game verification takes one proof per match, and says itself whether it is in.
    if (panel.games.length === 0) return panel.reportBlocked;

    const targets = draft.length > 0 ? gamesToProve(draft, recorded) : shortestNextSeries(format, recorded);
    return targets.some(target => {
        const game = panel.games.find(item => verificationGameKey(item) === verificationGameKey(target));
        if (game) return !isVerified(game.mine);
        return !panel.games.some(item => isVerified(item.mine) && item.mine!.gameNumber === WHOLE_MATCH);
    });
}

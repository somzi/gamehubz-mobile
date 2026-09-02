import i18n from '../i18n';
/**
 * Best-of series maths, mirroring the server's SeriesEvaluator.
 *
 * The server is authoritative — it re-derives the headline score, the goal totals and the winner
 * from the submitted games and rejects anything inconsistent. This module exists so the entry form
 * can answer "is this series over?" and "do we open another game?" instantly, without a round-trip
 * per game. Keep the two in sync: any rule change belongs in both.
 */

/** Reuses the backend's TeamWinCondition values. */
export const SeriesWinCondition = {
    MatchWins: 0,
    AggregateScore: 1,
} as const;

export type SeriesWinConditionValue = 0 | 1;

export interface SeriesGame {
    homeScore: number;
    awayScore: number;
    /** 1 = main series, 2 = first tiebreak, 3 = second tiebreak, … */
    seriesNumber: number;
}

export interface SeriesFormat {
    bestOf: number;
    /** Games in a tiebreak replay. Null = replay the match's own best-of. */
    tiebreakBestOf: number | null;
    condition: SeriesWinConditionValue;
}

export interface SeriesOutcome {
    /** Every series added together — what the card shows, and what the listed games add up to. */
    homeHeadline: number;
    awayHeadline: number;
    /** Real goals across every game of every series. */
    homeGoals: number;
    awayGoals: number;
    currentSeriesNumber: number;
    currentSeriesBestOf: number;
    gamesInCurrentSeries: number;
    /** The current series can take no further games (clinched, or full). */
    currentSeriesOver: boolean;
    /** Current series is over and level — a draw, or a tiebreak waiting to start. */
    isLevel: boolean;
    /** Another game may be added to the current series. */
    canAddGame: boolean;
}

export const MAX_BEST_OF = 15;

/** Wins needed to settle a Best-of under MatchWins, assuming no drawn games. */
export function winsNeeded(bestOf: number): number {
    return Math.floor(normalizeBestOf(bestOf) / 2) + 1;
}

export function normalizeBestOf(bestOf: number | null | undefined): number {
    if (bestOf == null || Number.isNaN(bestOf) || bestOf < 1) return 1;
    return Math.min(Math.floor(bestOf), MAX_BEST_OF);
}

/**
 * Best-of that applies to a given series: the main series uses the match format, tiebreak replays
 * use the tiebreak format — falling back to the match format, i.e. "a drawn Bo3 replays as a Bo3".
 */
export function bestOfForSeries(seriesNumber: number, format: SeriesFormat): number {
    return seriesNumber <= 1
        ? normalizeBestOf(format.bestOf)
        : normalizeBestOf(format.tiebreakBestOf ?? format.bestOf);
}

/**
 * Scores one series and decides whether it can still take games.
 *
 * A single-game series always reports the raw score under either criterion — otherwise every Bo1
 * would read "1–0" instead of what was played.
 *
 * Under MatchWins the series ends early once a lead cannot be caught: wins > opponentWins +
 * gamesRemaining. That general form is what makes drawn games safe; the usual "first to ⌈N/2⌉"
 * shortcut assumes every game has a winner, so a Bo3 at 1–0 with a drawn game would look unfinished.
 *
 * Under AggregateScore there is no early clinch — game scores are unbounded, so any remaining game
 * could overturn any lead. The series runs its full best-of.
 */
function scoreSeries(
    games: SeriesGame[],
    condition: SeriesWinConditionValue,
    bestOf: number,
): { home: number; away: number; over: boolean } {
    const remaining = Math.max(0, bestOf - games.length);

    if (bestOf <= 1 || condition === SeriesWinCondition.AggregateScore) {
        let home = 0;
        let away = 0;
        for (const g of games) {
            home += g.homeScore;
            away += g.awayScore;
        }
        return { home, away, over: remaining === 0 };
    }

    let homeWins = 0;
    let awayWins = 0;
    for (const g of games) {
        if (g.homeScore > g.awayScore) homeWins++;
        else if (g.awayScore > g.homeScore) awayWins++;
        // a drawn game counts for neither side
    }

    const clinched = homeWins > awayWins + remaining || awayWins > homeWins + remaining;
    return { home: homeWins, away: awayWins, over: clinched || remaining === 0 };
}

/**
 * How many games of a series must be played no matter how it goes — the rows the entry form can
 * unlock up front. Under MatchWins that is the win target (a Bo5 always plays at least 3); under
 * AggregateScore every game is played, because totals can be overturned to the very last one.
 */
export function minimumGamesRequired(bestOf: number, condition: SeriesWinConditionValue): number {
    const n = normalizeBestOf(bestOf);
    return condition === SeriesWinCondition.AggregateScore ? n : winsNeeded(n);
}

/** Whether one series, judged on its own games and best-of, can still take another game. */
export function isSeriesOver(
    games: SeriesGame[],
    bestOf: number,
    condition: SeriesWinConditionValue,
): boolean {
    return scoreSeries(games, condition, bestOf).over;
}

/** Reads a game list into an outcome. An empty list describes a match that has not started. */
export function evaluateSeries(games: SeriesGame[], format: SeriesFormat): SeriesOutcome {
    let homeGoals = 0;
    let awayGoals = 0;
    for (const g of games) {
        homeGoals += g.homeScore;
        awayGoals += g.awayScore;
    }

    const currentSeriesNumber = games.length === 0
        ? 1
        : games.reduce((max, g) => Math.max(max, g.seriesNumber), 1);

    const currentGames = games.filter(g => g.seriesNumber === currentSeriesNumber);
    const bestOf = bestOfForSeries(currentSeriesNumber, format);
    const { home, away, over } = scoreSeries(currentGames, format.condition, bestOf);

    // The headline counts every series, not just the deciding one, so it always matches what a
    // reader can add up from the games listed. Safe for the winner: a tiebreak only exists because
    // the series before it finished level, so each adds the same amount to both sides.
    let homeHeadline = 0;
    let awayHeadline = 0;
    for (const number of [...new Set(games.map(g => g.seriesNumber))]) {
        const slice = games.filter(g => g.seriesNumber === number);
        const scored = scoreSeries(slice, format.condition, bestOfForSeries(number, format));
        homeHeadline += scored.home;
        awayHeadline += scored.away;
    }

    return {
        homeHeadline,
        awayHeadline,
        homeGoals,
        awayGoals,
        currentSeriesNumber,
        currentSeriesBestOf: bestOf,
        gamesInCurrentSeries: currentGames.length,
        currentSeriesOver: over,
        isLevel: over && home === away,
        canAddGame: !over,
    };
}

/**
 * The games of one series that could actually have been played: everything up to and including the
 * one that decided it.
 *
 * A decided series takes no further games — a Bo3 won 2–0 has no third — and the server refuses a
 * submission carrying one. Stored lists never contain them (the entry form locks those rows), but
 * hand-made or pre-rule data can, and loading it straight into the form would produce an edit that
 * can never be saved. Trimming here keeps the form and the server telling the same story.
 * Aggregate series never clinch early, so this only ever bites MatchWins.
 */
export function playableGames(
    games: SeriesGame[],
    bestOf: number,
    condition: SeriesWinConditionValue,
): SeriesGame[] {
    for (let count = 1; count < games.length; count++) {
        if (isSeriesOver(games.slice(0, count), bestOf, condition)) return games.slice(0, count);
    }
    return games;
}

/** Groups games into their series, in order, for the "Main series / Tiebreak 1 / …" blocks. */
export function groupBySeries(games: SeriesGame[]): { seriesNumber: number; games: SeriesGame[] }[] {
    const bySeries = new Map<number, SeriesGame[]>();
    for (const g of games) {
        const list = bySeries.get(g.seriesNumber);
        if (list) list.push(g);
        else bySeries.set(g.seriesNumber, [g]);
    }

    return [...bySeries.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([seriesNumber, list]) => ({ seriesNumber, games: list }));
}

/** "Main series" / "Tiebreak" / "Tiebreak 2" — the label above each block of games. */
export function seriesBlockLabel(seriesNumber: number): string {
    if (seriesNumber <= 1) return i18n.t('match:seriesInfo.mainSeries');
    return seriesNumber === 2 ? i18n.t('match:seriesInfo.tiebreak') : i18n.t('match:seriesInfo.tiebreakN', { n: seriesNumber - 1 });
}

/**
 * Pulls the series format off any match-shaped payload. The API is dual-cased and older responses
 * omit these fields entirely, which reads as the pre-series default: one game, decided by its score.
 */
export function seriesFormatFrom(match: any): SeriesFormat {
    const bestOf = match?.bestOf ?? match?.BestOf;
    const tiebreakBestOf = match?.tiebreakBestOf ?? match?.TiebreakBestOf;
    const condition = match?.seriesWinCondition ?? match?.SeriesWinCondition;

    return {
        bestOf: normalizeBestOf(bestOf),
        tiebreakBestOf: tiebreakBestOf == null ? null : normalizeBestOf(tiebreakBestOf),
        condition: normalizeCondition(condition),
    };
}

/** Accepts the numeric enum or its string name — the API has shipped both shapes over time. */
export function normalizeCondition(value: any): SeriesWinConditionValue {
    if (value === 1 || value === 'AggregateScore') return SeriesWinCondition.AggregateScore;
    return SeriesWinCondition.MatchWins;
}

/** Reads the played games off a match payload, tolerating both casings and legacy omissions. */
export function seriesGamesFrom(match: any): SeriesGame[] {
    const raw = match?.games ?? match?.Games;
    if (!Array.isArray(raw)) return [];

    return raw
        .map((g: any) => ({
            homeScore: Number(g?.homeScore ?? g?.HomeScore ?? 0),
            awayScore: Number(g?.awayScore ?? g?.AwayScore ?? 0),
            seriesNumber: Number(g?.seriesNumber ?? g?.SeriesNumber ?? 1),
        }))
        .filter(g => Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore));
}

/**
 * The line under the format grid. It knows the criterion, because "first to 2" is simply wrong when
 * the series is decided on aggregate score.
 */
export function bestOfInlineDescription(bestOf: number, condition: SeriesWinConditionValue): string {
    const n = normalizeBestOf(bestOf);

    if (n === 1) return i18n.t('match:seriesInfo.singleGameDecides');

    if (condition === SeriesWinCondition.AggregateScore) {
        return i18n.t('match:seriesInfo.highestTotal', { n });
    }

    return n % 2 === 0
        ? i18n.t('match:seriesInfo.upToGames', { n })
        : i18n.t('match:seriesInfo.firstToWins', { wins: winsNeeded(n) });
}

/** The sentence under the tiebreak selector, spelling out what actually happens on a draw. */
export function tiebreakDescription(bestOf: number, tiebreakBestOf: number | null): string {
    const replay = normalizeBestOf(tiebreakBestOf ?? bestOf);

    return tiebreakBestOf == null
        ? i18n.t('match:seriesInfo.drawReplaySeries', { bo: replay })
        : i18n.t('match:seriesInfo.drawTiebreak', { bo: replay });
}

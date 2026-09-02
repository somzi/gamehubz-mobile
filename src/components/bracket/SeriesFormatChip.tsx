import { useTranslation } from 'react-i18next';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { SeriesWinCondition, SeriesWinConditionValue, seriesFormatFrom, seriesGamesFrom } from '../../lib/series';

export interface RoundSeriesFormat {
    bestOf: number;
    condition: SeriesWinConditionValue;
}

/**
 * A match whose format is already frozen. Best-of locks onto a match the moment a result lands
 * (or a proposal is pending), and the round editor skips those, so their value can be an older
 * format the round has since moved on from.
 */
function isFormatLocked(match: any): boolean {
    const status = Number(match?.status ?? match?.Status ?? 0);
    // Completed (3/4), NoShow (5) and TieBreakRequired (6) are all past the point of re-formatting.
    return seriesGamesFrom(match).length > 0
        || !!(match?.proposedByUserId ?? match?.ProposedByUserId)
        || status === 3 || status === 4 || status === 5 || status === 6;
}

/**
 * The best-of format a round is played under *now*, or null when there is nothing worth saying.
 *
 * Format is set per round (each round inherits the tournament default unless an admin overrides
 * it), so a single caption above the column speaks for the cards under it. That is deliberate:
 * the bracket places cards in fixed-height slots, so anything printed on the cards themselves
 * would push them into each other.
 *
 * Read off the matches still to be played, not all of them: a match freezes its Best-of when its
 * result lands, so a round moved from Bo3 to Bo5 half-way through still carries Bo3 on the games
 * already played — captioning the round with those would name a format nobody is playing any
 * more. Once every match is locked their shared value is all there is, so it is used. Returns
 * null for Bo1, the classic single game that needs no label.
 */
export function roundSeriesFormat(matches: any[] | null | undefined): RoundSeriesFormat | null {
    if (!matches?.length) return null;

    const open = matches.filter(m => !isFormatLocked(m));
    const pool = open.length > 0 ? open : matches;

    // Uniform in practice — every format write covers the whole round — so the tally only decides
    // a round left mixed by older data.
    const tally = new Map<string, { format: RoundSeriesFormat; count: number }>();
    for (const match of pool) {
        const { bestOf, condition } = seriesFormatFrom(match);
        const key = `${bestOf}|${condition}`;
        const seen = tally.get(key);
        if (seen) seen.count++;
        else tally.set(key, { format: { bestOf, condition }, count: 1 });
    }

    let winner: { format: RoundSeriesFormat; count: number } | null = null;
    for (const entry of tally.values()) {
        if (!winner || entry.count > winner.count) winner = entry;
    }

    return winner && winner.format.bestOf > 1 ? winner.format : null;
}

/** Same, for a single stand-alone card (grand final, third place). */
export function matchSeriesFormat(match: any): RoundSeriesFormat | null {
    return match ? roundSeriesFormat([match]) : null;
}

/**
 * "BO3 · GAMES WON" — what the score on the cards below actually means. Without it "2–1" could be
 * a single game, a series or an aggregate; the number alone is ambiguous.
 */
export function SeriesFormatChip({
    format,
    isTeamTournament,
    style,
}: {
    format: RoundSeriesFormat;
    isTeamTournament?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const { t } = useTranslation('bracket');
    const criterion = format.condition === SeriesWinCondition.AggregateScore ? t('card.totalScore') : t('card.gamesWon');

    return (
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 5 }, style]}>
            <View style={{
                paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6,
                backgroundColor: 'rgba(255,255,255,0.06)',
            }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: '#94A3B8', letterSpacing: 1 }} numberOfLines={1}>
                    BO{format.bestOf}
                </Text>
            </View>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B', letterSpacing: 1 }} numberOfLines={1}>
                {criterion}{isTeamTournament ? t('card.perGame') : ''}
            </Text>
        </View>
    );
}

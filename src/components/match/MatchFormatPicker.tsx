import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { BestOfInput } from './BestOfInput';
import {
    SeriesWinCondition,
    SeriesWinConditionValue,
    bestOfInlineDescription,
    normalizeBestOf,
    tiebreakDescription,
} from '../../lib/series';

const FIELD_LABEL = 'text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2';
const FIELD_HINT = 'text-[11px] text-slate-500 mt-2 leading-4';

interface MatchFormatPickerProps {
    bestOf: number;
    onBestOfChange: (value: number) => void;
    winCondition: SeriesWinConditionValue;
    onWinConditionChange: (value: SeriesWinConditionValue) => void;
    /** Null = a level series is replayed under the match's own Best-of. */
    tiebreakBestOf: number | null;
    onTiebreakBestOfChange: (value: number | null) => void;
    /**
     * True when the tournament has a knockout phase, where a level series has to be replayed.
     * League / group / Swiss record it as a draw instead, so the tiebreak control is hidden.
     */
    hasKnockout: boolean;
    /**
     * True when that knockout is played AFTER another phase (groups or Swiss), which is the only
     * case where a second length means anything — a plain bracket is one phase, and its Best-of
     * already describes every match it plays.
     */
    hasSeparateKnockoutPhase?: boolean;
    /** What the phase before the knockout is called, for the labels: "Group Stage" / "Swiss Rounds". */
    firstPhaseLabel?: string;
    /** Null = the knockout is played over the same Best-of as the phase before it. */
    knockoutBestOf?: number | null;
    onKnockoutBestOfChange?: (value: number | null) => void;
    /** Team tournaments: the format applies to each individual game inside a tie. */
    isTeamTournament?: boolean;
    /** Locks the controls once the format can no longer be changed for this tournament. */
    disabled?: boolean;
}

/**
 * Series format for a tournament: how many games a match is played over, how the winner of those
 * games is decided, and what happens when they finish level.
 *
 * The length is stepped, not picked from a list. Every list shape tried before had the same flaw in
 * a different place — a chip row truncated its labels, a sheet had to be opened and dismissed, a
 * grid of every supported value was a wall of tiles — and each still needed a "custom" escape hatch
 * for whatever it left out. A stepper has no such edge: every length is reachable, Bo8 is set
 * exactly like Bo3, and the line underneath spells out what the number means.
 */
export function MatchFormatPicker({
    bestOf,
    onBestOfChange,
    winCondition,
    onWinConditionChange,
    tiebreakBestOf,
    onTiebreakBestOfChange,
    hasKnockout,
    hasSeparateKnockoutPhase = false,
    firstPhaseLabel,
    knockoutBestOf = null,
    onKnockoutBestOfChange,
    isTeamTournament = false,
    disabled = false,
}: MatchFormatPickerProps) {
    const { t } = useTranslation('match');
    const isSeries = bestOf > 1;
    // With two phases the first control no longer speaks for the whole tournament, so it says
    // which half it governs.
    const phaseLabel = firstPhaseLabel ?? t('formatPicker.groupStage');
    const primaryLabel = hasSeparateKnockoutPhase ? t('formatPicker.phaseFormat', { phase: phaseLabel }) : t('formatPicker.matchFormat');
    // The length the knockout actually plays, whether it was chosen or inherited.
    const effectiveKnockoutBestOf = knockoutBestOf ?? bestOf;

    return (
        <View className="gap-4">
            {/* ── Match format ───────────────────────────────────────────── */}
            <View>
                <Text className={FIELD_LABEL}>{primaryLabel}</Text>

                <BestOfInput value={normalizeBestOf(bestOf)} onChange={onBestOfChange} disabled={disabled} />

                <Text className={FIELD_HINT}>{bestOfInlineDescription(bestOf, winCondition)}</Text>

                {isTeamTournament && (
                    <Text className={FIELD_HINT}>
                        {t('formatPicker.appliesToEveryGame')}
                        its own win condition.
                    </Text>
                )}
            </View>

            {/* ── Win condition — only meaningful with more than one game to compare ── */}
            {isSeries && (
                <View>
                    <Text className={FIELD_LABEL}>{t('formatPicker.seriesDecidedBy')}</Text>
                    <SegmentedToggle
                        options={[
                            { value: String(SeriesWinCondition.MatchWins), label: t('formatPicker.gamesWon') },
                            { value: String(SeriesWinCondition.AggregateScore), label: t('formatPicker.totalScore') },
                        ]}
                        value={String(winCondition)}
                        onChange={v => onWinConditionChange(v === '1' ? SeriesWinCondition.AggregateScore : SeriesWinCondition.MatchWins)}
                        disabled={disabled}
                    />
                    <Text className={FIELD_HINT}>
                        {winCondition === SeriesWinCondition.AggregateScore
                            ? t('formatPicker.aggregateHint')
                            : t('formatPicker.matchWinsHint')}
                    </Text>
                </View>
            )}

            {/* ── Knockout format ────────────────────────────────────────── */}
            {hasSeparateKnockoutPhase && onKnockoutBestOfChange && (
                <View>
                    <Text className={FIELD_LABEL}>{t('formatPicker.knockoutFormat')}</Text>

                    <SegmentedToggle
                        options={[
                            { value: 'same', label: t('formatPicker.sameAsPhase', { phase: phaseLabel }) },
                            { value: 'custom', label: t('formatPicker.different') },
                        ]}
                        value={knockoutBestOf == null ? 'same' : 'custom'}
                        onChange={v => onKnockoutBestOfChange(v === 'same' ? null : normalizeBestOf(bestOf))}
                        disabled={disabled}
                    />

                    {knockoutBestOf != null && (
                        <View className="mt-3">
                            <BestOfInput
                                value={normalizeBestOf(knockoutBestOf)}
                                onChange={onKnockoutBestOfChange}
                                disabled={disabled}
                            />
                        </View>
                    )}

                    <Text className={FIELD_HINT}>
                        {knockoutBestOf == null
                            ? t('formatPicker.knockoutSameHint', { phase: phaseLabel.toLowerCase() })
                            : bestOfInlineDescription(effectiveKnockoutBestOf, winCondition)}
                        {' '}Each round can still be changed on its own once the bracket exists.
                    </Text>
                </View>
            )}

            {/* ── Tiebreak ───────────────────────────────────────────────── */}
            {hasKnockout && (
                <View>
                    <Text className={FIELD_LABEL}>{t('formatPicker.knockoutTiebreak')}</Text>

                    {/* Two mutually exclusive choices, so a toggle fits without crowding. */}
                    <SegmentedToggle
                        options={[
                            { value: 'same', label: t('formatPicker.sameFormat') },
                            { value: 'custom', label: t('formatPicker.different') },
                        ]}
                        value={tiebreakBestOf == null ? 'same' : 'custom'}
                        onChange={v => onTiebreakBestOfChange(v === 'same' ? null : normalizeBestOf(effectiveKnockoutBestOf))}
                        disabled={disabled}
                    />

                    {tiebreakBestOf != null && (
                        <View className="mt-3">
                            <BestOfInput
                                value={normalizeBestOf(tiebreakBestOf)}
                                onChange={onTiebreakBestOfChange}
                                disabled={disabled}
                            />
                        </View>
                    )}

                    <Text className={FIELD_HINT}>{tiebreakDescription(effectiveKnockoutBestOf, tiebreakBestOf)}</Text>

                    {/* Drawn games are allowed, so any Best-of can finish level — including odd ones.
                        Say so plainly instead of letting organizers assume Bo3 can't draw. */}
                    <View className="flex-row items-start gap-2 mt-3 px-3 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                        <Ionicons name="information-circle-outline" size={15} color="#64748B" style={{ marginTop: 1 }} />
                        <Text className="flex-1 text-[11px] text-slate-500 leading-4">
                            {t('formatPicker.tiebreakNote')}
                            matches always go to a tiebreak; league, group and Swiss matches record it as a draw.
                        </Text>
                    </View>
                </View>
            )}
        </View>
    );
}

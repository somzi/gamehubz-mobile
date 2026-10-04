import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { RaisedCard } from '../ui/RaisedCard';
import { COLORS } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { MatchStatus, isPlayableMatchStatus } from '../../types/matchStatus';

export interface Participant {
    participantId: string;
    userId: string;
    username: string;
    score: number | null;
    isWinner: boolean;
    seed: number;
    /** Profile photo of the player behind the slot; absent on team slots and on older backends. */
    avatarUrl?: string | null;
}

/** Running state of a team fixture while its individual games are still being played. */
export interface TeamProgress {
    total: number;
    decided: number;
    homeWins: number;
    awayWins: number;
}

/** Ready-check state of a bracket card. Present only while the match actually runs one. */
export interface CardCheckIn {
    homeIn: boolean;
    awayIn: boolean;
}

/**
 * Pulls the ready-check state off a bracket match payload (dual-cased, absent on older backends
 * and on every match that runs no check). The server only computes CheckInDeadline for a match
 * that can still be turned up for, so its presence is what says "this card has a check to run".
 */
export function checkInFrom(match: any): CardCheckIn | null {
    const deadline = match?.checkInDeadline ?? match?.CheckInDeadline;
    if (!deadline) return null;

    return {
        homeIn: !!(match?.homeCheckedInOn ?? match?.HomeCheckedInOn),
        awayIn: !!(match?.awayCheckedInOn ?? match?.AwayCheckedInOn),
    };
}

/**
 * Pulls the team-progress block off a bracket match payload (dual-cased, and absent on solo
 * cards or against an older backend). Returns null when there is nothing to show, so callers
 * can hand the result straight to <BracketMatch teamProgress={...} />.
 */
export function teamProgressFrom(match: any): TeamProgress | null {
    const total = match?.teamGamesTotal ?? match?.TeamGamesTotal;
    if (!total) return null;

    return {
        total,
        decided: match?.teamGamesDecided ?? match?.TeamGamesDecided ?? 0,
        homeWins: match?.teamLiveHomeScore ?? match?.TeamLiveHomeScore ?? 0,
        awayWins: match?.teamLiveAwayScore ?? match?.TeamLiveAwayScore ?? 0,
    };
}

interface BracketMatchProps {
    home: Participant | null;
    away: Participant | null;
    startTime?: string | null;
    status?: number;
    className?: string;
    /** The viewer played (or plays) this match on their way through the bracket. */
    onMyPath?: boolean;
    onPress?: () => void;
    currentUserId?: string;
    currentUsername?: string;
    isAdmin?: boolean;
    isTeamTournament?: boolean;
    // Pending proposal — when set, the match is in "awaiting approval" state regardless of its raw status.
    proposedByUserId?: string | null;
    // Team fixtures only: lets the card show the running score mid-fixture instead of a dash.
    teamProgress?: TeamProgress | null;
    // Ready check — set only while this match is waiting on one.
    checkIn?: CardCheckIn | null;
}

interface MatchCardStateInput {
    home: Participant | null;
    away: Participant | null;
    startTime?: string | null;
    status?: number;
    /** Whether the card has somewhere to go when tapped (the match modal). */
    hasOnPress: boolean;
    currentUserId?: string;
    currentUsername?: string;
    isAdmin?: boolean;
    proposedByUserId?: string | null;
    teamProgress?: TeamProgress | null;
    checkIn?: CardCheckIn | null;
}

/**
 * Everything a match card needs to know about where its match stands and what the viewer may do
 * with it. Shared by the bracket card and the group fixture card, so both offer the same actions
 * in the same states.
 */
export function matchCardState({
    home, away, startTime, status, hasOnPress, currentUserId, currentUsername, isAdmin, proposedByUserId, teamProgress, checkIn,
}: MatchCardStateInput) {
    // A team fixture with at least one game decided but no settled result yet. The final Score
    // stays null until the fixture settles, so this is the only way the card knows it is under way.
    // Deliberately NOT "decided < total": a 1-1 fixture waiting on tie-break representatives has
    // every game played and still no result — that is exactly when the running score matters most.
    const isTeamInProgress = !!teamProgress
        && teamProgress.decided > 0
        && status !== MatchStatus.Completed;

    // A completed match with exactly one side is a bye (Swiss free win / walkover) —
    // label the empty slot BYE instead of TBD since nobody is coming.
    const isCompletedBye = status === MatchStatus.Completed && (!home !== !away);

    const getUserId = (p: any) => p?.userId || p?.UserId || p?.id || p?.Id;
    const getUsername = (p: any) => p?.username || p?.Username || p?.name || p?.Name;

    const pHomeId = getUserId(home);
    const pAwayId = getUserId(away);
    const pHomeName = getUsername(home);
    const pAwayName = getUsername(away);
    const currId = currentUserId;
    const currName = currentUsername;

    const isHome = (!!currId && !!pHomeId && pHomeId.toLowerCase() === currId.toLowerCase()) ||
        (!!currName && !!pHomeName && pHomeName.toLowerCase() === currName.toLowerCase());
    const isAway = (!!currId && !!pAwayId && pAwayId.toLowerCase() === currId.toLowerCase()) ||
        (!!currName && !!pAwayName && pAwayName.toLowerCase() === currName.toLowerCase());
    const isParticipant = isHome || isAway;

    const hasScore = (p: any) => p?.score !== null && p?.score !== undefined;
    const isAlreadyReported = hasScore(home) || hasScore(away);
    // Completed only. This used to read `status === 3 || status === 4`, and 3 is Live, not a second
    // spelling of Completed — a match under way would have rendered as finished and lost its Report
    // Result button (canReport below requires Pending/Scheduled). Safe to drop rather than preserve:
    // the backend never assigns Live, so no row has ever carried it.
    const isCompleted = status === MatchStatus.Completed;
    // Backend MatchStatus.NoShow (5): a group/league/Swiss fixture the admin closed as a double
    // forfeit — nobody played, nobody scored points. Terminal like Completed, rendered distinctly.
    const isNoShow = status === MatchStatus.NoShow;
    // Double walkover: a completed elimination match with both players present, no winner and no
    // scores. Both no-showed, so neither advanced (their opponent went through unopposed). The
    // no-score guard separates it from a legitimate scored draw.
    const isDoubleWalkover = isCompleted && !!home && !!away && !home.isWinner && !away.isWinner
        && !hasScore(home) && !hasScore(away);
    // Renamed, not re-pointed: this has always been Scheduled (2), and what it renders is
    // t('card.scheduled'). Calling it isScheduled while comparing against Scheduled is what made the
    // isCompleted bug above easy to miss. Live (3) has no rendering of its own and, since the
    // backend never sets it, needs none — it now falls through to the neutral state instead of
    // masquerading as finished.
    const isScheduled = status === MatchStatus.Scheduled;
    // MatchStatus.TieBreakRequired (6): the series was reported but finished level, so the match is
    // played-but-undecided and still owes a tiebreak. Terminal for neither side.
    const isTieBreakNeeded = status === MatchStatus.TieBreakRequired;
    // A pending proposal trumps any other in-progress state — surface it clearly so participants
    // know they're waiting on an approval and not on the actual match.
    const isAwaitingApproval = !isCompleted && !isNoShow && !!proposedByUserId;

    // NoShow stays openable: the admin can still enter a late real result (or undo) from the modal.
    // TieBreakRequired likewise — that is where the tiebreak games get reported.
    // Spelled out rather than a numeric range: `status` is optional, and a range check would also
    // silently swallow any value the backend adds to the enum later.
    const canShowDetails = hasOnPress && !!home && !!away && (
        status === MatchStatus.Pending
        || status === MatchStatus.Scheduled
        || status === MatchStatus.Live
        || status === MatchStatus.Completed
        || status === MatchStatus.NoShow
        || status === MatchStatus.TieBreakRequired
    );

    // A ready check still owed: nobody may report yet — either the missing side turns up, or the
    // match is settled by forfeit. Showing "Report Result" here would offer something the server
    // refuses, so the card says what is actually being waited on instead.
    const checkInPending = !!checkIn && !(checkIn.homeIn && checkIn.awayIn);
    const checkedInCount = checkIn ? (checkIn.homeIn ? 1 : 0) + (checkIn.awayIn ? 1 : 0) : 0;

    const hasStartTime = !!startTime;
    const canUserReport = hasStartTime ? isParticipant : isAdmin;
    // While a proposal is pending we hide the "Report Result" CTA — the opponent should Approve / Reject instead.
    // A tiebreak-pending match keeps its CTA despite already having a score: the reported series is
    // exactly what makes the next games necessary.
    const canReport = canShowDetails && !isAwaitingApproval && !checkInPending && !!canUserReport
        && (isTieBreakNeeded || (!isAlreadyReported && isPlayableMatchStatus(status)));

    // The check-in banner is for the two players; an organizer scanning the bracket sees the
    // scheduled state as before.
    const showCheckIn = checkInPending && isParticipant && !isCompleted && !isNoShow;

    return {
        isTeamInProgress, isCompletedBye, isHome, isAway, isParticipant, isCompleted, isNoShow,
        isDoubleWalkover, isScheduled, isTieBreakNeeded, isAwaitingApproval, canShowDetails,
        checkedInCount, canReport, showCheckIn,
    };
}

/** Green: the match is on. Amber: it's waiting on someone, or ended without a game. */
export const CARD_ACCENT = {
    go: { main: '#10B981', bright: '#A7F3D0', text: '#34D399' },
    wait: { main: '#F59E0B', bright: '#FDE68A', text: '#FBBF24' },
} as const;

export type CardLabelKind =
    | 'report' | 'checkIn' | 'live' | 'approval' | 'tiebreak' | 'noShow' | 'doubleWalkover' | 'completed' | 'scheduled';

export interface CardLabel {
    kind: CardLabelKind;
    text: string;
    /** null = neutral (a finished match). */
    accent: (typeof CARD_ACCENT)[keyof typeof CARD_ACCENT] | null;
    /** A count that rides along: check-ins so far, team games decided. */
    trailing?: string;
}

/**
 * The one line a match card says about where its match stands. `includeReport` puts the viewer's
 * own "Report result" first — the bracket card says it here, the group card has a button for it.
 */
export function matchCardLabel(
    s: ReturnType<typeof matchCardState>,
    t: TFunction,
    teamProgress: TeamProgress | null | undefined,
    includeReport: boolean,
): CardLabel | null {
    const games = s.isTeamInProgress && teamProgress ? `${teamProgress.decided}/${teamProgress.total}` : undefined;

    if (includeReport && s.canReport) {
        return s.isTieBreakNeeded
            ? { kind: 'report', text: t('bracket:card.reportTiebreak'), accent: CARD_ACCENT.wait, trailing: games }
            : { kind: 'report', text: t('bracket:card.reportResult'), accent: CARD_ACCENT.go, trailing: games };
    }
    // A ready check owed beats the plain "Scheduled": it's the one thing these two have to do now.
    if (!s.canReport && s.showCheckIn) {
        return { kind: 'checkIn', text: t('bracket:card.checkIn'), accent: CARD_ACCENT.wait, trailing: `${s.checkedInCount}/2` };
    }
    if (!s.canReport && !s.isAwaitingApproval && s.isTeamInProgress) {
        return { kind: 'live', text: t('bracket:card.live'), accent: CARD_ACCENT.go, trailing: games };
    }
    if (!s.canReport && s.isAwaitingApproval) {
        return { kind: 'approval', text: t('bracket:card.awaitingApproval'), accent: CARD_ACCENT.wait };
    }
    if (!s.canReport && s.isTieBreakNeeded) {
        return { kind: 'tiebreak', text: t('bracket:card.tiebreakNeeded'), accent: CARD_ACCENT.wait };
    }
    if (s.isNoShow) return { kind: 'noShow', text: t('bracket:card.noShow'), accent: CARD_ACCENT.wait };
    if (s.isDoubleWalkover) return { kind: 'doubleWalkover', text: t('bracket:card.doubleWalkover'), accent: CARD_ACCENT.wait };
    if (s.isCompleted) return { kind: 'completed', text: t('bracket:card.completed'), accent: null };
    if (s.isScheduled) return { kind: 'scheduled', text: t('bracket:card.scheduled'), accent: CARD_ACCENT.go };
    return null;
}

const TABULAR = { fontVariant: ['tabular-nums' as const] };
const DIMMED = 0.5;

/**
 * A knockout match: the two sides stacked, the winner bright and the loser faded, and a line on
 * top saying where it stands — in the state's colour, with a rail of the same colour down the
 * left edge. Kept under the bracket's 130px slot; the bracket centres it there, so the connector
 * lines meet it in the middle whatever its height.
 */
export const BracketMatch = React.memo(function BracketMatch({ home, away, startTime, status, className, onMyPath, onPress, currentUserId, currentUsername, isAdmin, isTeamTournament, proposedByUserId, teamProgress, checkIn }: BracketMatchProps) {
    const { t } = useTranslation('bracket');
    const s = matchCardState({ home, away, startTime, status, hasOnPress: !!onPress, currentUserId, currentUsername, isAdmin, proposedByUserId, teamProgress, checkIn });
    const label = matchCardLabel(s, t, teamProgress, true);
    const accent = label?.accent ?? null;

    const nobodyPlayed = s.isNoShow || s.isDoubleWalkover;
    const decided = s.isCompleted && (!!home?.isWinner || !!away?.isWinner);
    const emptyLabel = s.isCompletedBye ? t('bye') : t('common:app.tbd');

    const renderSide = (participant: Participant | null, side: 'home' | 'away') => {
        if (!participant) {
            return (
                <View style={styles.row}>
                    <View style={styles.emptyAvatar} />
                    <Text className="flex-1 ml-2.5 text-[13px] font-semibold italic text-slate-600" numberOfLines={1}>
                        {emptyLabel}
                    </Text>
                    <Text style={[TABULAR, styles.score, { color: COLORS.slate700 }]}>–</Text>
                </View>
            );
        }

        const isMe = side === 'home' ? s.isHome : s.isAway;
        const won = !!participant.isWinner;
        const dimmed = nobodyPlayed || (decided && !won);
        const hasScore = participant.score !== null && participant.score !== undefined;
        // Mid-fixture stand-in for the final score: games won so far by this side.
        const liveScore = !hasScore && s.isTeamInProgress && teamProgress
            ? (side === 'home' ? teamProgress.homeWins : teamProgress.awayWins)
            : null;

        return (
            <View style={[styles.row, dimmed && { opacity: DIMMED }]}>
                {isTeamTournament ? (
                    <View style={[styles.teamTile, isMe && styles.meEdge]}>
                        <Ionicons name="people" size={15} color={isMe ? CARD_ACCENT.go.text : COLORS.slate400} />
                    </View>
                ) : (
                    <PlayerAvatar
                        name={participant.username}
                        src={participant.avatarUrl ?? (participant as any).AvatarUrl ?? undefined}
                        size="sm"
                        className={isMe ? 'border-emerald-400/70' : 'border-white/10'}
                    />
                )}
                <Text
                    className={
                        isMe
                            ? 'flex-1 ml-2.5 text-[13.5px] font-bold text-emerald-300'
                            : won
                                ? 'flex-1 ml-2.5 text-[13.5px] font-bold text-white'
                                : 'flex-1 ml-2.5 text-[13.5px] font-semibold text-slate-200'
                    }
                    numberOfLines={1}
                >
                    {participant.username}
                </Text>
                <Text
                    style={[
                        TABULAR,
                        styles.score,
                        { color: hasScore || liveScore !== null ? '#FFFFFF' : COLORS.slate600 },
                    ]}
                >
                    {hasScore ? participant.score : liveScore !== null ? liveScore : '–'}
                </Text>
            </View>
        );
    };

    return (
        <PressableScale
            onPress={s.canShowDetails ? onPress : undefined}
            disabled={!s.canShowDetails}
            pressedScale={0.98}
            className={className}
            accessibilityRole="button"
            accessibilityLabel={[
                `${home?.username ?? emptyLabel} vs ${away?.username ?? emptyLabel}`,
                label?.text,
            ].filter(Boolean).join('. ')}
        >
            <RaisedCard
                style={[
                    styles.card,
                    s.canReport && accent
                        ? { borderColor: accent.main + '40', borderTopColor: accent.main + '5C' }
                        : onMyPath
                            ? { borderColor: 'rgba(52,211,153,0.22)', borderTopColor: 'rgba(52,211,153,0.32)' }
                            : null,
                ]}
            >
                {/* The state's rail down the left edge */}
                {accent && (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.rail,
                            { backgroundColor: accent.main },
                            Platform.OS === 'ios' && { shadowColor: accent.main, shadowOpacity: 0.7, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
                        ]}
                    />
                )}

                {label && (
                    <View style={styles.labelRow}>
                        <Text
                            className="flex-1 text-[10px] font-black uppercase tracking-[1.4px]"
                            style={{ color: accent?.text ?? COLORS.slate500 }}
                            numberOfLines={1}
                        >
                            {label.text}
                        </Text>
                        {!!label.trailing && (
                            <Text style={[TABULAR, { color: accent?.text ?? COLORS.slate500, opacity: 0.75 }]} className="text-[10.5px] font-black ml-2">
                                {label.trailing}
                            </Text>
                        )}
                        {(label.kind === 'report' || label.kind === 'approval') && (
                            <Ionicons name="chevron-forward" size={12} color={accent?.text ?? COLORS.slate500} style={{ marginLeft: 4 }} />
                        )}
                    </View>
                )}

                {renderSide(home, 'home')}
                <View style={styles.divider} />
                {renderSide(away, 'away')}
            </RaisedCard>
        </PressableScale>
    );
});

const styles = StyleSheet.create({
    card: {
        overflow: 'hidden',
        paddingVertical: 4,
    },
    rail: {
        position: 'absolute',
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 14,
        paddingRight: 12,
        paddingTop: 5,
        paddingBottom: 1,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        paddingLeft: 14,
        paddingRight: 14,
    },
    divider: {
        height: 1,
        marginLeft: 14,
        marginRight: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    score: {
        minWidth: 22,
        marginLeft: 8,
        textAlign: 'right',
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
    },
    teamTile: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    meEdge: {
        borderColor: 'rgba(52,211,153,0.6)',
    },
    emptyAvatar: {
        width: 32,
        height: 32,
        borderRadius: 999,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.12)',
    },
});

import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { cn } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

interface Participant {
    participantId: string;
    userId: string;
    username: string;
    score: number | null;
    isWinner: boolean;
    seed: number;
}

/** Running state of a team fixture while its individual games are still being played. */
export interface TeamProgress {
    total: number;
    decided: number;
    homeWins: number;
    awayWins: number;
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
    onPress?: () => void;
    currentUserId?: string;
    currentUsername?: string;
    isAdmin?: boolean;
    isTeamTournament?: boolean;
    // Pending proposal — when set, the match is in "awaiting approval" state regardless of its raw status.
    proposedByUserId?: string | null;
    // Team fixtures only: lets the card show the running score mid-fixture instead of a dash.
    teamProgress?: TeamProgress | null;
}

type NavigationProp = StackNavigationProp<RootStackParamList>;

export function BracketMatch({ home, away, startTime, status, className, onPress, currentUserId, currentUsername, isAdmin, isTeamTournament, proposedByUserId, teamProgress }: BracketMatchProps) {
    const navigation = useNavigation<NavigationProp>();

    // A team fixture with at least one game decided but no settled result yet. The final Score
    // stays null until the fixture settles, so this is the only way the card knows it is under way.
    // Deliberately NOT "decided < total": a 1-1 fixture waiting on tie-break representatives has
    // every game played and still no result — that is exactly when the running score matters most.
    const isTeamInProgress = !!teamProgress
        && teamProgress.decided > 0
        && status !== 3 && status !== 4;

    const handlePlayerClick = (userId: string) => {
        if (onPress) {
            onPress();
        } else if (userId) {
            navigation.navigate('PlayerProfile', { id: userId });
        }
    };

    // A completed match with exactly one side is a bye (Swiss free win / walkover) —
    // label the empty slot BYE instead of TBD since nobody is coming.
    const isCompletedBye = (status === 3 || status === 4) && (!home !== !away);

    const renderParticipant = (participant: Participant | null, position: 'top' | 'bottom') => {
        const isTop = position === 'top';

        if (!participant) {
            return (
                <View className={cn(
                    "flex-row items-center px-4 py-3",
                    isTop ? "rounded-t-2xl" : "rounded-b-2xl",
                )}>
                    <View
                        className="w-7 h-7 rounded-full items-center justify-center"
                        style={{ borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed' }}
                    />
                    <Text className="text-xs text-slate-700 italic ml-3 flex-1 font-medium">
                        {isCompletedBye ? 'BYE' : 'TBD'}
                    </Text>
                    <View className="w-8 h-8 rounded-xl bg-white/[0.02] items-center justify-center">
                        <Text className="text-xs text-slate-700 font-black">—</Text>
                    </View>
                </View>
            );
        }

        const isWinner = participant.isWinner;
        const hasMatchScore = participant.score !== null && participant.score !== undefined;
        // Mid-fixture stand-in for the final score: games won so far by this side.
        const liveScore = !hasMatchScore && isTeamInProgress
            ? (isTop ? teamProgress!.homeWins : teamProgress!.awayWins)
            : null;

        return (
            <Pressable
                onPress={() => handlePlayerClick(participant.userId)}
                className={cn(
                    "flex-row items-center px-4 py-3",
                    isTop ? "rounded-t-2xl" : "rounded-b-2xl",
                    isWinner ? "bg-emerald-500/[0.06]" : undefined,
                )}
            >
                {/* Winner accent bar */}
                {isWinner && (
                    <View
                        className="absolute left-0 w-[3px] bg-emerald-400 rounded-full"
                        style={{ top: 6, bottom: 6 }}
                    />
                )}

                {isTeamTournament ? (
                    <View className={cn(
                        "w-7 h-7 rounded-xl items-center justify-center",
                        isWinner ? "bg-emerald-500/20" : "bg-white/[0.05]"
                    )}>
                        <Ionicons name="people" size={13} color={isWinner ? '#34D399' : '#475569'} />
                    </View>
                ) : (
                    <PlayerAvatar name={participant.username} size="sm" className={isWinner ? "border-emerald-400/70" : "border-white/10"} />
                )}

                <Text
                    className={cn(
                        "text-sm font-semibold flex-1 ml-3",
                        isWinner ? "text-emerald-300" : "text-slate-200"
                    )}
                    numberOfLines={1}
                >
                    {participant.username}
                </Text>

                {/* Score chip */}
                <View className={cn(
                    "min-w-[32px] h-8 px-2 rounded-xl items-center justify-center ml-2",
                    isWinner ? "bg-emerald-500/20" : liveScore !== null ? "bg-white/[0.07]" : "bg-white/[0.04]"
                )}>
                    {hasMatchScore ? (
                        <Text className={cn(
                            "text-sm font-black",
                            isWinner ? "text-emerald-300" : "text-slate-500"
                        )}>
                            {participant.score}
                        </Text>
                    ) : liveScore !== null ? (
                        // Brighter than a settled loser's score, dimmer than a winner's: this is a
                        // running number, not a result.
                        <Text className="text-sm font-black text-slate-200">
                            {liveScore}
                        </Text>
                    ) : (
                        <Text className="text-xs text-slate-700 font-bold">—</Text>
                    )}
                </View>

            </Pressable>
        );
    };

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
    const isCompleted = status === 3 || status === 4;
    // Backend MatchStatus.NoShow (5): a group/league/Swiss fixture the admin closed as a double
    // forfeit — nobody played, nobody scored points. Terminal like Completed, rendered distinctly.
    const isNoShow = status === 5;
    // Double walkover: a completed elimination match with both players present, no winner and no
    // scores. Both no-showed, so neither advanced (their opponent went through unopposed). The
    // no-score guard separates it from a legitimate scored draw.
    const isDoubleWalkover = isCompleted && !!home && !!away && !home.isWinner && !away.isWinner
        && !hasScore(home) && !hasScore(away);
    const isLive = status === 2;
    // A pending proposal trumps any other in-progress state — surface it clearly so participants
    // know they're waiting on an approval and not on the actual match.
    const isAwaitingApproval = !isCompleted && !isNoShow && !!proposedByUserId;

    // NoShow stays openable: the admin can still enter a late real result (or undo) from the modal.
    const canShowDetails = !!onPress && !!home && !!away && (status === 1 || status === 2 || status === 3 || status === 4 || status === 5);

    const hasStartTime = !!startTime;
    const canUserReport = hasStartTime ? isParticipant : isAdmin;
    // While a proposal is pending we hide the "Report Result" CTA — the opponent should Approve / Reject instead.
    const canReport = canShowDetails && !isAlreadyReported && !isAwaitingApproval && canUserReport && (status === 2 || status === 1);

    const glow = canReport || isLive ? '#10B981' : isAwaitingApproval ? '#F59E0B' : null;

    return (
        <Pressable
            onPress={canShowDetails ? onPress : undefined}
            disabled={!canShowDetails}
            className={cn(
                "rounded-[20px] bg-card border overflow-hidden",
                canReport ? "border-emerald-500/30" : isAwaitingApproval ? "border-warning/25" : "border-white/[0.06]",
                className
            )}
            style={({ pressed }) => ({
                opacity: pressed && canShowDetails ? 0.8 : 1,
                transform: [{ scale: pressed && canShowDetails ? 0.985 : 1 }],
                shadowColor: glow ?? '#000000',
                shadowOpacity: glow ? 0.2 : 0.28,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 5 },
                elevation: 5,
            })}
        >
            {glow && (
                <LinearGradient
                    colors={[glow + '1F', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.9, y: 0 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
            )}

            {/* Status / action header */}
            {(canReport || isAwaitingApproval || isLive || isCompleted || isNoShow || isTeamInProgress) && (
                <View className={cn(
                    "flex-row items-center justify-between px-4 py-2",
                    canReport
                        ? "bg-emerald-500/[0.08]"
                        : isAwaitingApproval || isNoShow
                            ? "bg-warning/[0.10]"
                            : isLive || isTeamInProgress
                                ? "bg-emerald-500/[0.06]"
                                : "bg-white/[0.02]"
                )}>
                    {canReport && (
                        <>
                            <View className="flex-row items-center gap-1.5">
                                <View className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <Text className="text-[10px] font-black text-emerald-400 uppercase tracking-[1.5px]">
                                    Report Result
                                </Text>
                            </View>
                            <View className="flex-row items-center gap-1.5">
                                {/* Progress rides along with the CTA — an admin reporting game 2 of 2
                                    wants to see that game 1 is already in. */}
                                {isTeamInProgress && (
                                    <Text className="text-[10px] font-black text-emerald-300/70 tracking-[0.5px]">
                                        {teamProgress!.decided}/{teamProgress!.total}
                                    </Text>
                                )}
                                <Ionicons name="chevron-forward" size={11} color="#34D399" />
                            </View>
                        </>
                    )}
                    {/* Everyone without a report affordance still gets the live state. */}
                    {!canReport && !isAwaitingApproval && isTeamInProgress && (
                        <>
                            <View className="flex-row items-center gap-1.5">
                                <View className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <Text className="text-[10px] font-black text-emerald-300 uppercase tracking-[1.5px]">
                                    Live
                                </Text>
                            </View>
                            <Text className="text-[10px] font-black text-emerald-300/70 tracking-[0.5px]">
                                {teamProgress!.decided}/{teamProgress!.total} Done
                            </Text>
                        </>
                    )}
                    {!canReport && isAwaitingApproval && (
                        <>
                            <View className="flex-row items-center gap-1.5">
                                <Ionicons name="hourglass-outline" size={11} color="#F59E0B" />
                                <Text className="text-[10px] font-black text-warning uppercase tracking-[1.5px]">
                                    Awaiting Approval
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={11} color="#F59E0B" />
                        </>
                    )}
                    {!canReport && !isAwaitingApproval && !isTeamInProgress && isLive && (
                        <View className="flex-row items-center gap-1.5">
                            <Ionicons name="time-outline" size={11} color="#34D399" />
                            <Text className="text-[10px] font-black text-emerald-300 uppercase tracking-[1.5px]">
                                Scheduled
                            </Text>
                        </View>
                    )}
                    {!canReport && !isAwaitingApproval && isCompleted && !isDoubleWalkover && (
                        <View className="flex-row items-center gap-1.5">
                            <Ionicons name="checkmark-circle" size={11} color="#34D399" />
                            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-[1.5px]">
                                Completed
                            </Text>
                        </View>
                    )}
                    {!canReport && !isAwaitingApproval && isDoubleWalkover && (
                        <View className="flex-row items-center gap-1.5">
                            <Ionicons name="play-skip-forward-outline" size={11} color="#F59E0B" />
                            <Text className="text-[10px] font-bold text-warning uppercase tracking-[1.5px]">
                                Double Walkover
                            </Text>
                        </View>
                    )}
                    {!canReport && isNoShow && (
                        <View className="flex-row items-center gap-1.5">
                            <Ionicons name="ban-outline" size={11} color="#F59E0B" />
                            <Text className="text-[10px] font-bold text-warning uppercase tracking-[1.5px]">
                                No-Show
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {renderParticipant(home, 'top')}
            <View className="h-px mx-4" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
            {renderParticipant(away, 'bottom')}
        </Pressable>
    );
}

import { View, Text, Pressable } from 'react-native';
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
}

type NavigationProp = StackNavigationProp<RootStackParamList>;

export function BracketMatch({ home, away, startTime, status, className, onPress, currentUserId, currentUsername, isAdmin, isTeamTournament }: BracketMatchProps) {
    const navigation = useNavigation<NavigationProp>();

    const handlePlayerClick = (userId: string) => {
        if (onPress) {
            onPress();
        } else if (userId) {
            navigation.navigate('PlayerProfile', { id: userId });
        }
    };

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
                    <Text className="text-xs text-slate-700 italic ml-3 flex-1 font-medium">TBD</Text>
                    <View className="w-8 h-8 rounded-xl bg-white/[0.02] items-center justify-center">
                        <Text className="text-xs text-slate-700 font-black">—</Text>
                    </View>
                </View>
            );
        }

        const isWinner = participant.isWinner;
        const hasMatchScore = participant.score !== null && participant.score !== undefined;

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
                    <PlayerAvatar name={participant.username} size="sm" className="w-7 h-7" />
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
                    isWinner ? "bg-emerald-500/20" : "bg-white/[0.04]"
                )}>
                    {hasMatchScore ? (
                        <Text className={cn(
                            "text-sm font-black",
                            isWinner ? "text-emerald-300" : "text-slate-500"
                        )}>
                            {participant.score}
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
    const isLive = status === 2;

    const canShowDetails = !!onPress && !!home && !!away && (status === 1 || status === 2 || status === 3 || status === 4);

    const hasStartTime = !!startTime;
    const canUserReport = hasStartTime ? isParticipant : isAdmin;
    const canReport = canShowDetails && !isAlreadyReported && canUserReport && (status === 2 || status === 1);

    return (
        <Pressable
            onPress={canShowDetails ? onPress : undefined}
            disabled={!canShowDetails}
            className={cn(
                "rounded-2xl bg-[#0D1525] border overflow-hidden",
                canReport ? "border-emerald-500/25" : isCompleted ? "border-white/[0.06]" : "border-white/[0.06]",
                className
            )}
            style={({ pressed }) => ({
                opacity: pressed && canShowDetails ? 0.75 : 1,
                transform: [{ scale: pressed && canShowDetails ? 0.985 : 1 }]
            })}
        >
            {/* Status / action header */}
            {(canReport || isLive || isCompleted) && (
                <View className={cn(
                    "flex-row items-center justify-between px-4 py-2",
                    canReport
                        ? "bg-emerald-500/[0.08]"
                        : isLive
                            ? "bg-amber-500/[0.08]"
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
                            <Ionicons name="chevron-forward" size={11} color="#34D399" />
                        </>
                    )}
                    {!canReport && isLive && (
                        <View className="flex-row items-center gap-1.5">
                            <View className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <Text className="text-[10px] font-black text-amber-400 uppercase tracking-[1.5px]">
                                In Progress
                            </Text>
                        </View>
                    )}
                    {!canReport && isCompleted && (
                        <View className="flex-row items-center gap-1.5">
                            <Ionicons name="checkmark-circle" size={11} color="#34D399" />
                            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-[1.5px]">
                                Completed
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

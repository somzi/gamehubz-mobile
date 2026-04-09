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
        if (!participant) {
            return (
                <View className={cn(
                    "flex-row items-center px-3 py-2.5",
                    position === 'top' ? "rounded-t-2xl" : "rounded-b-2xl",
                )}>
                    <View className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
                    <Text className="text-xs text-slate-600 italic ml-2.5 flex-1">TBD</Text>
                </View>
            );
        }

        const isWinner = participant.isWinner;

        return (
            <Pressable
                onPress={() => handlePlayerClick(participant.userId)}
                className={cn(
                    "flex-row items-center px-3 py-2.5",
                    position === 'top' ? "rounded-t-2xl" : "rounded-b-2xl",
                    isWinner && "bg-emerald-500/[0.04]",
                )}
            >
                {isTeamTournament ? (
                    <View className={cn(
                        "w-6 h-6 rounded-lg items-center justify-center",
                        isWinner ? "bg-emerald-500/15" : "bg-white/[0.04]"
                    )}>
                        <Ionicons name="people" size={12} color={isWinner ? '#10B981' : '#475569'} />
                    </View>
                ) : (
                    <PlayerAvatar name={participant.username} size="sm" className="w-6 h-6" />
                )}
                <Text
                    className={cn(
                        "text-xs font-semibold flex-1 ml-2.5",
                        isWinner ? "text-emerald-400" : "text-slate-300"
                    )}
                    numberOfLines={1}
                >
                    {participant.username}
                </Text>
                {participant.score !== null && (
                    <View className={cn(
                        "w-7 h-7 rounded-lg items-center justify-center ml-2",
                        isWinner ? "bg-emerald-500/15" : "bg-white/[0.04]"
                    )}>
                        <Text className={cn(
                            "text-xs font-black",
                            isWinner ? "text-emerald-400" : "text-slate-400"
                        )}>
                            {participant.score}
                        </Text>
                    </View>
                )}
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

    const canShowDetails = !!onPress && !!home && !!away && (status === 1 || status === 2 || status === 3 || status === 4);
    
    const hasStartTime = !!startTime;
    const canUserReport = hasStartTime ? isParticipant : isAdmin;
    const canReport = canShowDetails && !isAlreadyReported && canUserReport && (status === 2 || status === 1);

    return (
        <Pressable
            onPress={canShowDetails ? onPress : undefined}
            disabled={!canShowDetails}
            className={cn(
                "w-52 rounded-2xl bg-[#0D1525] border overflow-hidden",
                canReport ? "border-emerald-500/20" : "border-white/[0.06]",
                className
            )}
            style={({ pressed }) => ({
                opacity: pressed && canShowDetails ? 0.7 : 1,
                transform: [{ scale: pressed && canShowDetails ? 0.98 : 1 }]
            })}
        >
            {canReport && (
                <View className="flex-row items-center justify-between px-3 py-1.5 bg-emerald-500/[0.06]">
                    <View className="flex-row items-center gap-1">
                        <Ionicons name="create-outline" size={10} color="#10B981" />
                        <Text className="text-[9px] font-black text-emerald-400 uppercase tracking-[1.5px]">Report</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={10} color="#10B981" />
                </View>
            )}
            {renderParticipant(home, 'top')}
            <View className="h-px bg-white/[0.04] mx-3" />
            {renderParticipant(away, 'bottom')}
        </Pressable>
    );
}

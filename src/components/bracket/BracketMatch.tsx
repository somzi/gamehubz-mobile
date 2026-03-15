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
}

type NavigationProp = StackNavigationProp<RootStackParamList>;

export function BracketMatch({ home, away, startTime, status, className, onPress, currentUserId, currentUsername, isAdmin }: BracketMatchProps) {
    const navigation = useNavigation<NavigationProp>();

    const handlePlayerClick = (userId: string) => {
        // Only navigate if we're not using the match detail modal
        if (onPress) {
            onPress();
        } else if (userId) {
            navigation.navigate('PlayerProfile', { id: userId });
        }
    };

    const renderParticipant = (participant: Participant | null) => {
        if (!participant) {
            return (
                <View className="flex-row items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg h-10">
                    <View className="w-6 h-6 rounded-full bg-muted/50" />
                    <Text className="text-sm text-muted-foreground italic">TBD</Text>
                </View>
            );
        }

        const isWinner = participant.isWinner;

        return (
            <Pressable
                onPress={() => handlePlayerClick(participant.userId)}
                className="flex-row items-center gap-2 px-3 py-2 rounded-lg h-10 bg-muted/30"
            >
                <PlayerAvatar name={participant.username} size="sm" className="w-6 h-6" />
                <Text
                    className={cn("text-sm font-medium flex-1", isWinner ? "text-primary" : "text-foreground")}
                    numberOfLines={1}
                >
                    {participant.username}
                </Text>
                {participant.score !== null && (
                    <Text className={cn("text-sm font-bold", isWinner ? "text-primary" : "text-foreground")}>
                        {participant.score}
                    </Text>
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

    // Can show details if match has participants and is Scheduled (1), Live (2) or Completed (3, 4)
    // We relax the "isParticipant" requirement for viewing, but keep it for reporting
    const canShowDetails = !!onPress && !!home && !!away && (status === 1 || status === 2 || status === 3 || status === 4);
    
    // User request: admin only if startTime is null, players only if startTime is not null
    const hasStartTime = !!startTime;
    const canUserReport = hasStartTime ? isParticipant : isAdmin;
    const canReport = canShowDetails && !isAlreadyReported && canUserReport && (status === 2 || status === 1);

    return (
        <Pressable
            onPress={canShowDetails ? onPress : undefined}
            disabled={!canShowDetails}
            className={cn(
                "flex-col gap-1 w-52 p-2 rounded-2xl bg-card border border-border/30",
                canReport && "border-primary/30",
                className
            )}
            style={({ pressed }) => ({
                opacity: pressed && canShowDetails ? 0.7 : 1,
                transform: [{ scale: pressed && canShowDetails ? 0.98 : 1 }]
            })}
        >
            {canReport && (
                <View className="flex-row items-center justify-between mb-1 px-1">
                    <View className="flex-row items-center gap-1">
                        <Ionicons name="create-outline" size={10} color="#10B981" />
                        <Text className="text-[10px] font-extrabold text-primary uppercase tracking-tighter">Report</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={10} color="#3F3F46" />
                </View>
            )}
            {renderParticipant(home)}
            {renderParticipant(away)}
        </Pressable>
    );
}

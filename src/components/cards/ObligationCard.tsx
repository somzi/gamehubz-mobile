import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '../ui/Card';
import { cn } from '../../lib/utils';

interface ObligationCardProps {
    tournamentName: string;
    matchType: string;
    scheduledTime: string;
    opponentName: string;
    status: 'live' | 'scheduled' | 'completed';
    isUrgent?: boolean;
    onClick: () => void;
}

export function ObligationCard({
    tournamentName,
    matchType,
    scheduledTime,
    opponentName,
    status,
    isUrgent = false,
    onClick,
}: ObligationCardProps) {
    const getStatusColor = () => {
        switch (status) {
            case 'live':
                return 'bg-red-500';
            case 'scheduled':
                return 'bg-accent';
            case 'completed':
                return 'bg-muted';
            default:
                return 'bg-muted';
        }
    };

    return (
        <Card onPress={onClick} className={cn("mb-3", isUrgent && "border-red-500")}>
            <View className="space-y-2">
                <View className="flex-row items-center justify-between">
                    <Text className="text-base font-semibold text-foreground">{tournamentName}</Text>
                    <View className={cn("px-2 py-1 rounded", getStatusColor())}>
                        <Text className="text-xs font-medium text-white uppercase">{status}</Text>
                    </View>
                </View>
                <Text className="text-sm text-muted-foreground">{matchType}</Text>
                <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-foreground">vs {opponentName}</Text>
                    <Text className="text-sm text-muted-foreground">{scheduledTime}</Text>
                </View>
            </View>
        </Card>
    );
}

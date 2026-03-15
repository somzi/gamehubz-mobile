import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface MatchReadyButtonProps {
    matchId: string;
    scheduledTime: string;
    opponentName: string;
    opponentReady: boolean;
    onReady: () => void;
}

export function MatchReadyButton({
    matchId,
    scheduledTime,
    opponentName,
    opponentReady,
    onReady,
}: MatchReadyButtonProps) {
    const [isReady, setIsReady] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<string | null>('5:00');
    const [canReady, setCanReady] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeRemaining((prev) => {
                if (!prev) return null;
                const [mins, secs] = prev.split(':').map(Number);
                if (mins === 0 && secs === 0) return '0:00';
                const newSecs = secs === 0 ? 59 : secs - 1;
                const newMins = secs === 0 ? mins - 1 : mins;
                return `${newMins}:${String(newSecs).padStart(2, '0')}`;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const handleReady = () => {
        setIsReady(true);
        onReady();
    };

    const bothReady = isReady && opponentReady;

    return (
        <View className="space-y-4">
            <View className="items-center">
                <Text className="text-sm text-muted-foreground">Match vs</Text>
                <Text className="text-lg font-bold text-foreground">{opponentName}</Text>
                <Text className="text-sm text-primary mt-1">{scheduledTime}</Text>
            </View>

            <View className="flex-row gap-3">
                {/* Your status */}
                <View className={cn(
                    'flex-1 p-3 rounded-xl border items-center',
                    isReady ? 'bg-primary/10 border-primary/30' : 'bg-secondary border-border/50'
                )}>
                    <View className={cn(
                        'w-8 h-8 rounded-full mb-2 items-center justify-center',
                        isReady ? 'bg-primary' : 'bg-muted'
                    )}>
                        <Ionicons
                            name={isReady ? 'checkmark' : 'time-outline'}
                            size={16}
                            color={isReady ? 'hsl(222, 47%, 6%)' : 'hsl(220, 15%, 55%)'}
                        />
                    </View>
                    <Text className="text-xs font-medium text-foreground">You</Text>
                    <Text className={cn('text-xs', isReady ? 'text-primary' : 'text-muted-foreground')}>
                        {isReady ? 'Ready' : 'Not Ready'}
                    </Text>
                </View>

                {/* Opponent status */}
                <View className={cn(
                    'flex-1 p-3 rounded-xl border items-center',
                    opponentReady ? 'bg-primary/10 border-primary/30' : 'bg-secondary border-border/50'
                )}>
                    <View className={cn(
                        'w-8 h-8 rounded-full mb-2 items-center justify-center',
                        opponentReady ? 'bg-primary' : 'bg-muted'
                    )}>
                        <Ionicons
                            name={opponentReady ? 'checkmark' : 'time-outline'}
                            size={16}
                            color={opponentReady ? 'hsl(222, 47%, 6%)' : 'hsl(220, 15%, 55%)'}
                        />
                    </View>
                    <Text className="text-xs font-medium text-foreground">{opponentName}</Text>
                    <Text className={cn('text-xs', opponentReady ? 'text-primary' : 'text-muted-foreground')}>
                        {opponentReady ? 'Ready' : 'Not Ready'}
                    </Text>
                </View>
            </View>

            {bothReady ? (
                <View className="py-4 rounded-xl bg-accent/10 border border-accent/30 items-center">
                    <Ionicons name="checkmark-circle" size={24} color="hsl(45, 90%, 55%)" />
                    <Text className="font-semibold text-accent mt-2">Both Players Ready!</Text>
                    <Text className="text-xs text-muted-foreground mt-1">Match starting...</Text>
                </View>
            ) : canReady ? (
                <View className="space-y-2">
                    <Button
                        onPress={handleReady}
                        disabled={isReady}
                        className={cn(
                            'w-full',
                            isReady ? 'bg-primary/50' : 'bg-accent'
                        )}
                    >
                        <View className="flex-row items-center justify-center">
                            {isReady && <Ionicons name="checkmark" size={16} color="hsl(222, 47%, 6%)" />}
                            <Text className="font-semibold text-accent-foreground ml-1">
                                {isReady ? "You're Ready" : "I'm Ready"}
                            </Text>
                        </View>
                    </Button>
                    {timeRemaining && !isReady && (
                        <View className="flex-row items-center justify-center gap-1">
                            <Ionicons name="alert-circle-outline" size={12} color="hsl(220, 15%, 55%)" />
                            <Text className="text-xs text-muted-foreground">
                                Ready window closes in {timeRemaining}
                            </Text>
                        </View>
                    )}
                </View>
            ) : (
                <View className="py-3 rounded-xl bg-secondary border border-border/50 items-center">
                    <Ionicons name="time-outline" size={20} color="hsl(220, 15%, 55%)" />
                    <Text className="text-sm text-muted-foreground mt-1">
                        Ready button available 15 mins before match
                    </Text>
                </View>
            )}
        </View>
    );
}

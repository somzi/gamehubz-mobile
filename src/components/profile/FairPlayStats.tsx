import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { cn } from '../../lib/utils';

interface FairPlayStatsProps {
    fairPlayScore: number;
    noShowCount: number;
    reportsCount: number;
    matchesPlayed: number;
}

export function FairPlayStats({
    fairPlayScore,
    noShowCount,
    reportsCount,
    matchesPlayed,
}: FairPlayStatsProps) {
    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-accent';
        if (score >= 70) return 'text-primary';
        if (score >= 50) return 'text-yellow-500';
        return 'text-destructive';
    };

    const getScoreLabel = (score: number) => {
        if (score >= 90) return 'Excellent';
        if (score >= 70) return 'Good';
        if (score >= 50) return 'Fair';
        return 'Poor';
    };

    const getBarColor = (score: number) => {
        if (score >= 90) return 'bg-accent';
        if (score >= 70) return 'bg-primary';
        if (score >= 50) return 'bg-yellow-500';
        return 'bg-destructive';
    };

    return (
        <View className="space-y-4">
            {/* Main Fair Play Score */}
            <View className="p-4 rounded-xl bg-card border border-border/50">
                <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center gap-2">
                        <View className="w-8 h-8 rounded-lg items-center justify-center bg-primary/20">
                            <Ionicons name="shield-checkmark" size={16} color="hsl(185, 75%, 45%)" />
                        </View>
                        <Text className="font-medium text-foreground">Fair Play Score</Text>
                    </View>
                    <Text className={cn('text-sm font-medium', getScoreColor(fairPlayScore))}>
                        {getScoreLabel(fairPlayScore)}
                    </Text>
                </View>

                {/* Progress bar */}
                <View className="h-3 bg-secondary rounded-full overflow-hidden">
                    <View
                        className={cn('h-full rounded-full', getBarColor(fairPlayScore))}
                        style={{ width: `${fairPlayScore}%` }}
                    />
                </View>
                <View className="flex-row justify-between mt-1">
                    <Text className="text-xs text-muted-foreground">0</Text>
                    <Text className={cn('font-bold text-lg', getScoreColor(fairPlayScore))}>
                        {fairPlayScore}%
                    </Text>
                    <Text className="text-xs text-muted-foreground">100</Text>
                </View>
            </View>

            {/* Stats Grid */}
            <View className="flex-row gap-3">
                <View className="flex-1 bg-card p-4 rounded-xl border border-border/50 items-center">
                    <View className="w-8 h-8 rounded-lg items-center justify-center bg-muted mb-2">
                        <Ionicons name="trending-up" size={16} color="hsl(220, 15%, 55%)" />
                    </View>
                    <Text className="text-xl font-bold text-foreground">{matchesPlayed}</Text>
                    <Text className="text-xs text-muted-foreground">Matches</Text>
                </View>

                <View className="flex-1 bg-card p-4 rounded-xl border border-border/50 items-center">
                    <View className={cn(
                        'w-8 h-8 rounded-lg items-center justify-center mb-2',
                        noShowCount > 0 ? 'bg-destructive/20' : 'bg-accent/20'
                    )}>
                        <Ionicons
                            name="warning"
                            size={16}
                            color={noShowCount > 0 ? 'hsl(0, 72%, 51%)' : 'hsl(45, 90%, 55%)'}
                        />
                    </View>
                    <Text className={cn(
                        'text-xl font-bold',
                        noShowCount > 0 ? 'text-destructive' : 'text-foreground'
                    )}>
                        {noShowCount}
                    </Text>
                    <Text className="text-xs text-muted-foreground">No-Shows</Text>
                </View>

                <View className="flex-1 bg-card p-4 rounded-xl border border-border/50 items-center">
                    <View className={cn(
                        'w-8 h-8 rounded-lg items-center justify-center mb-2',
                        reportsCount > 0 ? 'bg-destructive/20' : 'bg-muted'
                    )}>
                        <Ionicons
                            name="flag"
                            size={16}
                            color={reportsCount > 0 ? 'hsl(0, 72%, 51%)' : 'hsl(220, 15%, 55%)'}
                        />
                    </View>
                    <Text className={cn(
                        'text-xl font-bold',
                        reportsCount > 0 ? 'text-destructive' : 'text-foreground'
                    )}>
                        {reportsCount}
                    </Text>
                    <Text className="text-xs text-muted-foreground">Reports</Text>
                </View>
            </View>

            {/* Warning if score is low */}
            {fairPlayScore < 70 && (
                <View className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex-row items-start gap-2">
                    <Ionicons name="warning" size={16} color="hsl(0, 72%, 51%)" />
                    <View className="flex-1">
                        <Text className="font-medium text-destructive">Low Fair Play Score</Text>
                        <Text className="text-xs text-muted-foreground mt-0.5">
                            Improve your score by showing up to matches on time and following tournament rules.
                        </Text>
                    </View>
                </View>
            )}
        </View>
    );
}

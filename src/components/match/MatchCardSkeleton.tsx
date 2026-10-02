import React from 'react';
import { View } from 'react-native';
import { RaisedCard } from '../ui/RaisedCard';
import { Skeleton } from '../ui/Skeleton';

// A match card's shape while the list loads (Home, My Matches), so the cards arrive in place
// instead of a "No matches" flash before the first response lands.
export function MatchCardSkeleton() {
    return (
        <RaisedCard>
            <View style={{ paddingLeft: 16, paddingRight: 14, paddingVertical: 12 }}>
                <View className="flex-row items-center gap-3">
                    <Skeleton width="36%" height={10} radius={5} />
                    <View className="flex-1" />
                    <Skeleton width="28%" height={10} radius={5} />
                </View>
                <View className="flex-row items-center gap-3" style={{ marginTop: 11 }}>
                    <Skeleton width={45} height={45} radius={23} />
                    <View className="flex-1" style={{ gap: 8 }}>
                        <Skeleton width="64%" height={14} radius={7} />
                        <Skeleton width="42%" height={10} radius={5} />
                    </View>
                    <Skeleton width={68} height={44} radius={12} />
                </View>
            </View>
        </RaisedCard>
    );
}

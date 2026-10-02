import { useTranslation } from 'react-i18next';
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MatchScheduleCard } from '../components/match/MatchScheduleCard';
import { MatchCardSkeleton } from '../components/match/MatchCardSkeleton';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useHomeMatches, type MatchOverviewDto } from '../lib/homeMatches';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { EmptyState, LoadFailedState } from '../components/ui/EmptyState';
import { RefreshFailedBanner } from '../components/ui/RefreshFailedBanner';
import { COLORS } from '../lib/theme';
import { parseUtcDate } from '../lib/utils';
import { dateLocale } from '../i18n';

const EMPTY_MATCHES: MatchOverviewDto[] = [];

export default function MyMatchesScreen() {
    const { t } = useTranslation('match');
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'scheduled'>('all');

    // The list Home shows, from the same query: "See all" opens on the cards Home already holds
    // and refetches underneath once they are older than 30s.
    const matchesQuery = useHomeMatches(user?.id);
    const matches = matchesQuery.data ?? EMPTY_MATCHES;

    // Stable: it is handed to every MatchScheduleCard as onMatchUpdate, and the card is memoized —
    // a fresh function here would invalidate every row on every render and undo the memo entirely.
    // Invalidating the shared key refreshes Home's cards as well.
    const refreshMatches = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['home-matches'] });
    }, [queryClient]);

    // The spinner follows the pull only — a background refetch (a card's own update) must not
    // drop the list down by the control's height on iOS.
    const [isPulling, setIsPulling] = useState(false);
    const onRefresh = useCallback(async () => {
        setIsPulling(true);
        try {
            await queryClient.invalidateQueries({ queryKey: ['home-matches'] });
        } finally {
            setIsPulling(false);
        }
    }, [queryClient]);

    const filteredMatches = matches.filter(m => {
        if (activeTab === 'all') return true;
        if (activeTab === 'pending') return !m.scheduledTime;
        if (activeTab === 'scheduled') return m.scheduledTime && m.status !== 3; // Assuming status 3 is completed
        if (activeTab === 'completed') return m.status === 3;
        return true;
    });

    const pendingCount = matches.filter(m => !m.scheduledTime).length;

    const tabs: PremiumTabItem[] = [
        { value: 'all', label: t('myMatches.tabAll'), icon: 'apps' },
        { value: 'pending', label: t('myMatches.tabPending'), icon: 'time', badge: pendingCount > 0 ? pendingCount : undefined },
        { value: 'scheduled', label: t('myMatches.tabScheduled'), icon: 'calendar' },
    ];

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader
                title={t('myMatches.title')}
                showBack={true}
            />

            <View className="px-4 pb-3">
                <PremiumTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={(value) => setActiveTab(value as typeof activeTab)}
                />
            </View>

            <ScrollView
                className="flex-1 px-4"
                // MatchScheduleCard renders its match Modal as a child of this list, and RN
                // negotiates touches over the REACT tree, not the native one — so this ScrollView
                // sees the taps inside that modal too. Left at the default ('never') it captured
                // the first tap whenever the keyboard was up, blurred the input and swallowed the
                // press: every chat message needed two taps on Send. 'handled' lets the tap reach
                // its target, exactly like the friends DM list.
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={isPulling} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                contentContainerStyle={{ paddingBottom: 40 }}
            >
                <View className="gap-3">
                    {matchesQuery.isError && matches.length > 0 && (
                        <RefreshFailedBanner onRetry={refreshMatches} retrying={matchesQuery.isFetching} />
                    )}
                    {matchesQuery.isPending ? (
                        <>
                            <MatchCardSkeleton />
                            <MatchCardSkeleton />
                            <MatchCardSkeleton />
                        </>
                    ) : matchesQuery.isError && matches.length === 0 ? (
                        <LoadFailedState onRetry={refreshMatches} retrying={matchesQuery.isFetching} />
                    ) : filteredMatches.length > 0 ? (
                        filteredMatches.map((match) => (
                            <MatchScheduleCard
                                key={match.id || match.matchId}
                                matchId={match.id || match.matchId || ''}
                                tournamentId={match.tournamentId || ''}
                                tournamentName={match.tournamentName}
                                roundName={match.hubName}
                                opponentName={match.opponentName}
                                opponentAvatarUrl={match.opponentAvatarUrl}
                                status={!match.scheduledTime ? 'pending_availability' : match.status === 3 ? 'completed' : 'scheduled'}
                                // parseUtcDate, not new Date(): backend timestamps carry no Z, so
                                // raw parsing read the UTC clock as local and showed a shifted time.
                                scheduledTime={match.scheduledTime ? parseUtcDate(match.scheduledTime).toLocaleString(dateLocale()) : undefined}
                                scheduledTimeIso={match.scheduledTime}
                                deadline={match.roundDeadline ?? undefined}
                                onMatchUpdate={refreshMatches}
                                isRoundLocked={match.isRoundLocked}
                                unreadMessages={match.unreadMessages}
                                bestOf={match.bestOf}
                                checkIn={match.checkIn}
                            />
                        ))
                    ) : (
                        <EmptyState
                            icon="game-controller-outline"
                            title={t('myMatches.noneFound')}
                            description={t('myMatches.noneFoundHint')}
                        />
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

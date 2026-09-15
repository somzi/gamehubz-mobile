import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    SectionList,
    RefreshControl,
    Linking,
    Pressable,
    SectionListData,
    SectionListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useInfiniteQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { NotificationRow, NotificationRowSkeleton } from '../components/cards/NotificationRow';
import { ConfirmationModal } from '../components/modals/ConfirmationModal';
import { useNotifications } from '../context/NotificationsContext';
import { NOTIFICATIONS_KEY, fetchNotificationPage } from '../lib/notificationsApi';
import { externalLinkFromNotification, routeFromNotification } from '../lib/notificationRouting';
import { COLORS } from '../lib/theme';
import { parseUtcDate } from '../lib/utils';
import { dateLocale } from '../i18n';
import { RootStackParamList } from '../types/navigation';
import type { NotificationFilter, NotificationItem, NotificationPage } from '../types/notifications';

type NotificationsNavigationProp = StackNavigationProp<RootStackParamList>;

// Footer fallback only: the page itself reports the server's Notifications:RetentionDays, and this is
// the backend default for a server that predates that field.
const DEFAULT_RETENTION_DAYS = 60;
const SKELETON_ROWS = 6;
const ROW_GAP = 8;

interface DaySection {
    key: string;
    title: string;
    data: NotificationItem[];
}

const EMPTY_COPY: Record<NotificationFilter, { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string }> = {
    all: { icon: 'notifications-outline', title: 'empty.allTitle', hint: 'empty.allHint' },
    action: { icon: 'checkmark-done-circle-outline', title: 'empty.actionTitle', hint: 'empty.actionHint' },
    update: { icon: 'newspaper-outline', title: 'empty.updateTitle', hint: 'empty.updateHint' },
};

const keyExtractor = (item: NotificationItem) => item.id;

const RowGap = () => <View style={{ height: ROW_GAP }} />;

const countBadge = (count: number) => (count > 0 ? (count > 99 ? '99+' : count) : undefined);

function localDayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Exact calendar days, never "3 days ago": Today, Yesterday, then the weekday and date. Rows under a
// header show only their clock time, so every notification still reads as an exact local time.
function dayTitle(date: Date, todayLabel: string, yesterdayLabel: string): string {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (localDayKey(date) === localDayKey(now)) return todayLabel;
    if (localDayKey(date) === localDayKey(yesterday)) return yesterdayLabel;

    return date.toLocaleDateString(dateLocale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    });
}

function groupByDay(items: NotificationItem[], todayLabel: string, yesterdayLabel: string): DaySection[] {
    const sections: DaySection[] = [];
    const seen = new Set<string>();

    for (const item of items) {
        // A row that shifts across a page boundary during a refetch must not render twice.
        if (seen.has(item.id)) continue;
        seen.add(item.id);

        const date = parseUtcDate(item.createdOn);
        const key = localDayKey(date);
        const current = sections[sections.length - 1];

        if (current?.key === key) {
            current.data.push(item);
        } else {
            sections.push({ key, title: dayTitle(date, todayLabel, yesterdayLabel), data: [item] });
        }
    }

    return sections;
}

export default function NotificationsScreen() {
    const { t } = useTranslation('notifications');
    const { t: tCommon } = useTranslation('common');
    const navigation = useNavigation<NotificationsNavigationProp>();
    const isFocused = useIsFocused();
    const { summary, markRead, markAllRead, markSeen } = useNotifications();

    const [filter, setFilter] = useState<NotificationFilter>('all');
    const [isPulling, setIsPulling] = useState(false);
    const [isConfirmingMarkAll, setIsConfirmingMarkAll] = useState(false);

    // One cache per tab, filtered on the server: a client-side filter over paged data would show a
    // near-empty "Needs you" whenever the loaded pages happen to be all updates.
    const {
        data,
        isPending,
        isError,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        refetch,
    } = useInfiniteQuery({
        queryKey: [...NOTIFICATIONS_KEY, filter],
        queryFn: ({ pageParam }) => fetchNotificationPage(filter, pageParam),
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage: NotificationPage) => lastPage.nextCursor,
        staleTime: 15_000,
    });

    // Opening the inbox is what clears the bell, and anything that lands while it is open is seen as it
    // arrives. Rows keep their unread styling until they are opened.
    useEffect(() => {
        if (isFocused && summary.unseen > 0) markSeen();
    }, [isFocused, summary.unseen, markSeen]);

    const todayLabel = t('sections.today');
    const yesterdayLabel = t('sections.yesterday');
    const sections = useMemo(
        () => groupByDay(data?.pages.flatMap((page) => page.items) ?? [], todayLabel, yesterdayLabel),
        [data, todayLabel, yesterdayLabel],
    );

    const handlePress = useCallback((item: NotificationItem) => {
        // Read first, optimistically — the navigation below never waits on the request.
        if (!item.readOn) markRead(item.id);

        const url = externalLinkFromNotification(item.data);
        if (url) {
            Linking.openURL(url).catch((error) => console.warn('[Notifications] could not open link', url, error));
            return;
        }

        // The same router a push tap uses. A notification that outlived its target (a deleted
        // tournament, a hub the user left) lands on that screen's own not-found state.
        routeFromNotification(navigation, item.data);
    }, [markRead, navigation]);

    const handleRefresh = useCallback(async () => {
        setIsPulling(true);
        try {
            await refetch();
        } finally {
            setIsPulling(false);
        }
    }, [refetch]);

    const handleEndReached = useCallback(() => {
        // After a failed page the footer offers a retry — scrolling does not hammer the request.
        if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

    const tabs = useMemo<PremiumTabItem[]>(() => [
        { value: 'all', label: t('tabs.all'), icon: 'albums' },
        {
            value: 'action',
            label: t('tabs.action'),
            icon: 'flash',
            badge: countBadge(summary.unreadActions),
            badgeTone: 'alert',
        },
        { value: 'update', label: t('tabs.update'), icon: 'newspaper', badge: countBadge(summary.unreadUpdates) },
    ], [t, summary.unreadActions, summary.unreadUpdates]);

    const unreadInTab = filter === 'all'
        ? summary.unread
        : filter === 'action' ? summary.unreadActions : summary.unreadUpdates;

    // Clears what the current tab shows — "Updates" never silently clears what needs the user.
    // Confirmed first: it is a bulk action with no undo, and on the "Needs you" tab it wipes the
    // only remaining cue that something is waiting on this user.
    const headerRight = unreadInTab > 0 ? (
        <Pressable
            onPress={() => setIsConfirmingMarkAll(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('markAllRead')}
            className="w-10 h-10 rounded-2xl items-center justify-center bg-white/5 border border-white/10"
        >
            <Ionicons name="checkmark-done" size={19} color={COLORS.primaryBright} />
        </Pressable>
    ) : null;

    // Names the blast radius rather than asking a vague "are you sure?": the count is what the user
    // needs to judge this, and on a filtered tab the tab's own label says which rows are in scope.
    const confirmMarkAllMessage = filter === 'all'
        ? t('confirmMarkAll.all', { count: unreadInTab })
        : t('confirmMarkAll.tab', {
            count: unreadInTab,
            tab: filter === 'action' ? t('tabs.action') : t('tabs.update'),
        });

    const renderItem = useCallback<SectionListRenderItem<NotificationItem, DaySection>>(
        ({ item }) => (
            <View className="px-4">
                <NotificationRow item={item} onPress={handlePress} />
            </View>
        ),
        [handlePress],
    );

    const renderSectionHeader = useCallback(
        ({ section }: { section: SectionListData<NotificationItem, DaySection> }) => (
            <View
                className="bg-background px-4 pt-4 pb-2 flex-row items-center"
                style={{ gap: 10 }}
                accessibilityRole="header"
            >
                <Text className="text-slate-500 text-[11px] font-black uppercase tracking-[2px]">
                    {section.title}
                </Text>
                <View className="flex-1 h-px bg-white/5" />
            </View>
        ),
        [],
    );

    let footer: React.ReactElement | null = null;
    if (isFetchingNextPage) {
        footer = (
            <View className="px-4" style={{ gap: ROW_GAP, paddingTop: ROW_GAP }}>
                <NotificationRowSkeleton />
                <NotificationRowSkeleton />
            </View>
        );
    } else if (isFetchNextPageError) {
        footer = (
            <View className="items-center pt-5">
                <Button variant="ghost" size="sm" onPress={() => fetchNextPage()}>
                    {tCommon('retry')}
                </Button>
            </View>
        );
    } else if (sections.length > 0 && !hasNextPage) {
        footer = (
            <Text className="text-slate-600 text-[11px] text-center leading-4 pt-6 px-10">
                {t('footer', { days: data?.pages[0]?.retentionDays ?? DEFAULT_RETENTION_DAYS })}
            </Text>
        );
    }

    const empty = isError ? (
        <EmptyState
            variant="plain"
            icon="cloud-offline-outline"
            color={COLORS.warning}
            title={t('error.title')}
            description={t('error.hint')}
            action={
                <Button size="sm" onPress={() => refetch()}>
                    {tCommon('retry')}
                </Button>
            }
        />
    ) : (
        <EmptyState
            variant="plain"
            icon={EMPTY_COPY[filter].icon}
            title={t(EMPTY_COPY[filter].title)}
            description={t(EMPTY_COPY[filter].hint)}
        />
    );

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title={t('title')} showBack rightElement={headerRight} />

            <View className="px-4 pb-1">
                <PremiumTabs
                    tabs={tabs}
                    activeTab={filter}
                    onTabChange={(value) => setFilter(value as NotificationFilter)}
                />
            </View>

            {isPending ? (
                // First load of a tab: rows in their real shape instead of a bare spinner.
                <View
                    className="px-4 pt-4"
                    style={{ gap: ROW_GAP }}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel={tCommon('loading')}
                >
                    {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                        <NotificationRowSkeleton key={index} />
                    ))}
                </View>
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    renderSectionHeader={renderSectionHeader}
                    stickySectionHeadersEnabled
                    ItemSeparatorComponent={RowGap}
                    ListEmptyComponent={<View className="flex-1 justify-center pb-24">{empty}</View>}
                    ListFooterComponent={footer}
                    onEndReached={handleEndReached}
                    onEndReachedThreshold={0.5}
                    refreshControl={
                        <RefreshControl
                            refreshing={isPulling}
                            onRefresh={handleRefresh}
                            tintColor={COLORS.primary}
                            colors={[COLORS.primary]}
                        />
                    }
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={12}
                    maxToRenderPerBatch={12}
                    windowSize={11}
                />
            )}

            <ConfirmationModal
                visible={isConfirmingMarkAll}
                onClose={() => setIsConfirmingMarkAll(false)}
                onConfirm={() => {
                    // markAllRead is optimistic and fire-and-forget, so there is nothing to wait on:
                    // close first and the rows are already updated behind the sheet.
                    setIsConfirmingMarkAll(false);
                    markAllRead(filter);
                }}
                title={t('confirmMarkAll.title')}
                message={confirmMarkAllMessage}
                confirmText={t('confirmMarkAll.confirm')}
                // Nothing is deleted — the prompt exists because the action is bulk and has no undo,
                // not because it is dangerous. The red warning treatment would overstate it.
                isDestructive={false}
                // "Mark as read" / "Marcar como leídas" both outrun the side-by-side layout, which
                // clips its labels to one line.
                stacked
            />
        </SafeAreaView>
    );
}

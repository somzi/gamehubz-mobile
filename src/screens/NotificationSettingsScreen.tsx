import React from 'react';
import { View, Text, FlatList, Linking, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/layout/PageHeader';
import { StatusModal } from '../components/modals/StatusModal';
import { MenuItem } from '../components/ui/MenuItem';
import { EmblemImage } from '../components/ui/HeroCard';
import { SearchInput } from '../components/ui/SearchInput';
import { Toggle } from '../components/ui/Toggle';
import { COLORS } from '../lib/theme';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { setSourceNotifications, sourceNotificationState, supportsSourceMuting } from '../lib/notificationSettings';
import { NotificationSettings, NotificationSourceKind, NotificationSourcePage } from '../types/social';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { usePushPermission } from '../hooks/usePushPermission';

export default function NotificationSettingsScreen() {
    const { t } = useTranslation('settings');
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { permission: pushPermission, refresh: refreshPushPermission } = usePushPermission();
    const { requestAndSync } = usePushNotifications();
    const [isSaving, setIsSaving] = React.useState(false);
    const savingRef = React.useRef(false);
    const [showSaveFailed, setShowSaveFailed] = React.useState(false);
    const [kind, setKind] = React.useState<NotificationSourceKind>('hubs');
    const [search, setSearch] = React.useState('');
    const [debouncedSearch, setDebouncedSearch] = React.useState('');
    const listRef = React.useRef<FlatList>(null);
    const settingsKey = ['notification-settings', user?.id];

    React.useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const settingsQuery = useQuery({
        queryKey: settingsKey,
        queryFn: async ({ signal }): Promise<NotificationSettings> => {
            const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SETTINGS, { signal });
            if (!response.ok) throw new Error(`NOTIFICATION_SETTINGS failed: ${response.status}`);
            return response.json();
        },
        enabled: !!user?.id,
        staleTime: 0,
    });
    const settings = settingsQuery.data;
    const supportsSources = !!settings && supportsSourceMuting(settings);
    const sourcesQuery = useInfiniteQuery({
        queryKey: ['notification-sources', user?.id, kind, debouncedSearch],
        initialPageParam: 0,
        queryFn: async ({ pageParam, signal }): Promise<NotificationSourcePage> => {
            const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SOURCES(kind, pageParam, debouncedSearch), { signal });
            if (!response.ok) throw new Error(`NOTIFICATION_SOURCES failed: ${response.status}`);
            return response.json();
        },
        getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
        enabled: !!user?.id && supportsSources,
        staleTime: 30_000,
    });
    const sources = React.useMemo(() => {
        const unique = new Map(sourcesQuery.data?.pages.flatMap(page => page.items).map(item => [item.id, item]));
        return [...unique.values()];
    }, [sourcesQuery.data]);

    const handlePushPermissionPress = async () => {
        if (pushPermission && !pushPermission.granted && pushPermission.canAskAgain) {
            await requestAndSync();
            await refreshPushPermission();
            return;
        }
        Linking.openSettings().catch(() => {});
    };

    const saveSettings = async (next: NotificationSettings) => {
        // Ref closes the same-frame double-tap window before React disables the switches.
        if (savingRef.current || !settings) return;
        savingRef.current = true;
        setIsSaving(true);
        const previous = settings;
        await queryClient.cancelQueries({ queryKey: settingsKey });
        queryClient.setQueryData(settingsKey, next);
        try {
            const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SETTINGS, {
                method: 'PUT', body: JSON.stringify(next),
            });
            if (!response.ok) throw new Error(`NOTIFICATION_SETTINGS failed: ${response.status}`);
            const saved: NotificationSettings = await response.json();
            // Older servers can return 200 while ignoring unknown fields.
            if (supportsSourceMuting(next) && !supportsSourceMuting(saved)) throw new Error('Source muting is unavailable');
            queryClient.setQueryData(settingsKey, saved);
        } catch (error) {
            console.error('Error updating notification settings:', error);
            queryClient.setQueryData(settingsKey, previous);
            setShowSaveFailed(true);
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    const retryRow = (retry: () => void) => (
        <View className="items-center px-4 py-6">
            <Text className="text-slate-400 text-center mb-3">{t('notifications.loadFailed')}</Text>
            <Pressable accessibilityRole="button" onPress={retry} className="px-5 py-3 bg-primary/15 rounded-xl">
                <Text className="text-primary font-semibold">{t('notifications.retry')}</Text>
            </Pressable>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
            <PageHeader title={t('notifications.title')} showBack />
            <FlatList
                ref={listRef}
                data={supportsSources ? sources : []}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                ListHeaderComponent={
                    <View>
                        <View className="mt-4 bg-card border border-white/[0.07] rounded-[22px] overflow-hidden">
                            {pushPermission && (
                                <MenuItem icon="phone-portrait-outline" label={t('notifications.push')}
                                    onPress={handlePushPermissionPress} isLast={!settings}
                                    rightElement={
                                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: (pushPermission.granted ? COLORS.primary : COLORS.warning) + '1F' }}>
                                            <Text className="text-[11px] font-black" style={{ color: pushPermission.granted ? COLORS.primaryBright : COLORS.warning }}>
                                                {pushPermission.granted ? t('notifications.pushOn') : t('notifications.pushOff')}
                                            </Text>
                                        </View>
                                    }
                                />
                            )}
                            {settings && (
                                <View className="flex-row items-center py-3.5 px-4">
                                    <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.slate300} />
                                    <View className="flex-1 mx-3">
                                        <Text className="font-semibold text-[15px] text-white">{t('notifications.moderatedChats')}</Text>
                                        <Text className="text-xs text-slate-500 mt-0.5">{t('notifications.moderatedChatsHint')}</Text>
                                    </View>
                                    <Toggle size="sm" value={settings.moderatedChatNotifications}
                                        accessibilityLabel={t('notifications.moderatedChats')}
                                        onValueChange={enabled => saveSettings({ ...settings, moderatedChatNotifications: enabled })}
                                        disabled={isSaving || settingsQuery.isFetching} />
                                </View>
                            )}
                        </View>
                        {settingsQuery.isPending && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />}
                        {settingsQuery.isError && retryRow(() => { void settingsQuery.refetch(); })}
                        {settings && !supportsSources && <Text className="text-slate-400 text-sm mt-6">{t('notifications.sourcesUnavailable')}</Text>}
                        {supportsSources && (
                            <View className="mt-7 mb-3">
                                <Text className="text-lg font-bold text-white">{t('notifications.sourcesTitle')}</Text>
                                <Text className="text-sm text-slate-400 mt-2 leading-5">{t('notifications.sourcesHint')}</Text>
                                <View className="flex-row bg-card rounded-2xl p-1 mt-5 mb-4 border border-white/[0.07]">
                                    {(['hubs', 'tournaments'] as const).map(tab => (
                                        <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: kind === tab }}
                                            onPress={() => { setKind(tab); listRef.current?.scrollToOffset({ offset: 0, animated: false }); }}
                                            className={`flex-1 flex-row justify-center items-center gap-2 py-3 rounded-xl ${kind === tab ? 'bg-primary/15' : ''}`}>
                                            <Ionicons name={tab === 'hubs' ? 'people-outline' : 'trophy-outline'} size={17} color={kind === tab ? COLORS.primary : COLORS.slate400} />
                                            <Text className={`font-semibold text-sm ${kind === tab ? 'text-primary' : 'text-slate-400'}`}>{t(`notifications.${tab}`)}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                                <SearchInput value={search} onChange={setSearch} placeholder={t(`notifications.search.${kind}`)} />
                            </View>
                        )}
                    </View>
                }
                renderItem={({ item }) => {
                    if (!settings) return null;
                    const { enabled, inheritedMute } = sourceNotificationState(settings, kind, item);
                    return (
                        <View className="flex-row items-center px-4 py-4 mb-2 bg-card border border-white/[0.07] rounded-2xl">
                            {/* Hubs show their avatar; a tournament shows its hub's (initials of the hub when it has none). */}
                            <EmblemImage
                                src={item.avatarUrl}
                                name={kind === 'tournaments' ? (item.hubName || item.name) : item.name}
                                size={40}
                                radius={12}
                            />
                            <View className="flex-1 mx-3">
                                <Text className="text-white text-[15px] font-semibold" numberOfLines={2}>{item.name}</Text>
                                {kind === 'tournaments' && item.hubName && <Text className="text-slate-500 text-xs mt-1" numberOfLines={1}>{item.hubName}</Text>}
                                <Text className="text-slate-400 text-xs mt-1">{t(inheritedMute ? 'notifications.mutedByHub' : enabled ? 'notifications.receiving' : 'notifications.muted')}</Text>
                            </View>
                            <Toggle size="sm" value={enabled} accessibilityLabel={t('notifications.sourceLabel', { name: item.name })}
                                disabled={isSaving || settingsQuery.isFetching || inheritedMute}
                                onValueChange={value => saveSettings(setSourceNotifications(settings, kind, item.id, value))} />
                        </View>
                    );
                }}
                ListEmptyComponent={supportsSources ? (
                    sourcesQuery.isPending ? <ActivityIndicator color={COLORS.primary} style={{ margin: 28 }} />
                        : sourcesQuery.isError ? retryRow(() => { void sourcesQuery.refetch(); })
                            : <Text className="text-slate-400 text-center py-8">{debouncedSearch ? t('notifications.noResults') : t(`notifications.empty.${kind}`)}</Text>
                ) : null}
                ListFooterComponent={supportsSources && sources.length > 0 ? (
                    sourcesQuery.isError ? retryRow(() => {
                        if (sourcesQuery.isFetchNextPageError) void sourcesQuery.fetchNextPage();
                        else void sourcesQuery.refetch();
                    }) : sourcesQuery.hasNextPage ? (
                        <Pressable accessibilityRole="button" disabled={sourcesQuery.isFetching} onPress={() => { void sourcesQuery.fetchNextPage(); }} className="items-center py-4">
                            {sourcesQuery.isFetchingNextPage ? <ActivityIndicator color={COLORS.primary} /> : <Text className="text-primary font-semibold">{t('notifications.loadMore')}</Text>}
                        </Pressable>
                    ) : null
                ) : null}
            />
            <StatusModal visible={showSaveFailed} onClose={() => setShowSaveFailed(false)} type="error"
                title={t('notifications.saveFailedTitle')} message={t('notifications.saveFailedMessage')} />
        </SafeAreaView>
    );
}

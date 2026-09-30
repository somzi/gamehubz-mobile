import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRefetchOnFocusIfStale } from '../hooks/useRefetchOnFocusIfStale';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { parseUtcDate, cn } from '../lib/utils';
import { Friend, FriendRequest, DirectChat, BadgeCounts } from '../types/social';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { Panel } from '../components/ui/Panel';
import { Skeleton } from '../components/ui/Skeleton';
import { COLORS } from '../lib/theme';
import { EmptyState } from '../components/ui/EmptyState';
import { useBadges } from '../context/BadgesContext';
import { useAuth } from '../context/AuthContext';

type TabKey = 'friends' | 'requests' | 'chats';
type NavProp = StackNavigationProp<RootStackParamList>;
type SocialRoute = RouteProp<MainTabParamList, 'Social'>;

interface FriendRequests {
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
}

// Stable fallbacks so the derived useMemos below don't churn on every render
// before the first response lands.
const EMPTY_CHATS: DirectChat[] = [];
const EMPTY_FRIENDS: Friend[] = [];
const EMPTY_REQUESTS: FriendRequests = { incoming: [], outgoing: [] };

const TABULAR = { fontVariant: ['tabular-nums' as const] };
const LIST_PADDING = { paddingHorizontal: 20, paddingBottom: 120 };

// A gradient ring around an avatar means one thing across Social: this person sent you
// something you haven't read. Same emerald → cyan as the share cards.
const UNREAD_RING = ['#34D399', '#22D3EE'] as const;
const INCOMING = '#F59E0B';

/** Where Social opens when nothing asked for a tab: wherever the badge points. */
function landingTab(badges: BadgeCounts): TabKey {
    if (badges.unreadDirectMessages > 0) return 'chats';
    if (badges.friendRequests > 0) return 'requests';
    return 'friends';
}

export default function SocialScreen() {
    const { t } = useTranslation('social');
    const navigation = useNavigation<NavProp>();
    const route = useRoute<SocialRoute>();
    const { badges } = useBadges();
    const [activeTab, setActiveTab] = useState<TabKey>(() => route.params?.initialTab ?? landingTab(badges));

    const tabs: PremiumTabItem[] = [
        { value: 'friends', label: t('tabFriends'), icon: 'people' },
        { value: 'requests', label: t('tabRequests'), icon: 'person-add', badge: badges.friendRequests > 0 ? badges.friendRequests : undefined, badgeTone: 'alert' },
        { value: 'chats', label: t('tabChats'), icon: 'chatbubble-ellipses', badge: badges.unreadDirectMessages > 0 ? badges.unreadDirectMessages : undefined, badgeTone: 'alert' },
    ];

    useFocusEffect(
        useCallback(() => {
            if (route.params?.initialTab) {
                setActiveTab(route.params.initialTab);
            }
        }, [route.params?.initialTab])
    );

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            {/* ─── Header ──────────────────────────────────────── */}
            <View className="px-5 pt-2 pb-3">
                <Text className="text-white text-2xl font-black tracking-tight">{t('common:nav.social')}</Text>
                <Text className="text-slate-500 text-xs font-medium mt-0.5">
                    {t('tagline')}
                </Text>
            </View>

            {/* ─── Segmented Tabs ──────────────────────────────── */}
            <View className="px-5 mb-3">
                <PremiumTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={(v) => setActiveTab(v as TabKey)}
                />
            </View>

            {/* ─── Tab Content ─────────────────────────────────── */}
            <View className="flex-1">
                {activeTab === 'friends' && <FriendsTab navigation={navigation} />}
                {activeTab === 'requests' && <RequestsTab navigation={navigation} />}
                {activeTab === 'chats' && <ChatsTab navigation={navigation} />}
            </View>
        </SafeAreaView>
    );
}

// ═════════════════════════════════════════════════════════════════════
// DATA
// ═════════════════════════════════════════════════════════════════════

/** The live value drives the input; the debounced one drives the query key, so typing
 *  doesn't fire a request per keystroke. */
function useDebouncedSearch() {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    useEffect(() => {
        if (search === debounced) return;
        const timer = setTimeout(() => setDebounced(search), 300);
        return () => clearTimeout(timer);
    }, [search, debounced]);
    return { search, setSearch, debounced };
}

async function readJsonOrThrow(res: Response) {
    if (!res.ok) throw new Error(getErrorMessage(await res.text().catch(() => '')));
    return res.json();
}

// Cold-start cache is handled globally by PersistQueryClientProvider in App.tsx — the last
// snapshot for each key restores before render, so every tab paints at once.
function useFriends(search: string) {
    const { user } = useAuth();
    return useQuery<Friend[]>({
        queryKey: ['friends', user?.id, search],
        queryFn: async () => {
            const data = await readJsonOrThrow(await authenticatedFetch(ENDPOINTS.GET_FRIENDS(search)));
            return Array.isArray(data) ? data : [];
        },
        enabled: !!user?.id,
        staleTime: 30_000,
        refetchOnMount: true,
        // Keep showing the previous list while the new search key is fetching.
        placeholderData: keepPreviousData,
    });
}

function useDirectChats(search: string) {
    const { user } = useAuth();
    return useQuery<DirectChat[]>({
        queryKey: ['direct-chats', user?.id, search],
        queryFn: async () => {
            const data = await readJsonOrThrow(await authenticatedFetch(ENDPOINTS.GET_DIRECT_CHATS(search)));
            return Array.isArray(data) ? sortChats(data) : [];
        },
        enabled: !!user?.id,
        staleTime: 30_000,
        refetchOnMount: true,
        placeholderData: keepPreviousData,
    });
}

function useFriendRequests(search: string) {
    const { user } = useAuth();
    return useQuery<FriendRequests>({
        queryKey: ['friend-requests', user?.id, search],
        queryFn: async () => {
            const [inRes, outRes] = await Promise.all([
                authenticatedFetch(ENDPOINTS.GET_INCOMING_REQUESTS(search)),
                authenticatedFetch(ENDPOINTS.GET_OUTGOING_REQUESTS(search)),
            ]);
            const [incoming, outgoing] = await Promise.all([readJsonOrThrow(inRes), readJsonOrThrow(outRes)]);
            return {
                incoming: Array.isArray(incoming) ? incoming : [],
                outgoing: Array.isArray(outgoing) ? outgoing : [],
            };
        },
        enabled: !!user?.id,
        staleTime: 30_000,
        refetchOnMount: true,
        placeholderData: keepPreviousData,
    });
}

/** Unread count per friend, from the unfiltered chat list. */
function useUnreadByUser(chats: DirectChat[]) {
    return useMemo(() => {
        const map = new Map<string, DirectChat>();
        for (const chat of chats) map.set(chat.otherUserId.toLowerCase(), chat);
        return map;
    }, [chats]);
}

/**
 * Pull-to-refresh only — the control must not follow background refetches. Opening a chat
 * marks it read and invalidates the chat list while it sits covered by the chat screen; on iOS
 * a `refreshing` flip that happens off-screen leaves the list pushed down by the control's
 * height, a blank band above the search bar on the way back.
 */
function usePullToRefresh(refetch: () => Promise<unknown>) {
    const [isPulling, setIsPulling] = useState(false);
    const onRefresh = useCallback(async () => {
        setIsPulling(true);
        try {
            await refetch();
        } finally {
            setIsPulling(false);
        }
    }, [refetch]);
    return { isPulling, onRefresh };
}

/** Refetch when a live badge count moves (a message or a request arrived while the list is open). */
function useRefetchWhenCountMoves(count: number, refetch: () => unknown) {
    const previous = useRef(count);
    useEffect(() => {
        if (previous.current === count) return;
        previous.current = count;
        refetch();
    }, [count, refetch]);
}

function openChatWith(navigation: NavProp, friend: Friend, chat?: DirectChat) {
    navigation.navigate('DirectChat', {
        ...(chat ? { chatId: chat.id } : { otherUserId: friend.userId }),
        header: {
            otherUserId: friend.userId,
            otherUsername: friend.username,
            otherNickname: friend.nickname,
            otherAvatarUrl: friend.avatarUrl,
        },
    });
}

// ═════════════════════════════════════════════════════════════════════
// FRIENDS TAB — the roster: one panel, a row per friend
// ═════════════════════════════════════════════════════════════════════

function FriendsTab({ navigation }: { navigation: NavProp }) {
    const { t } = useTranslation('social');
    const { user } = useAuth();
    const { search, setSearch, debounced } = useDebouncedSearch();
    const friendsQuery = useFriends(debounced);
    const chatsQuery = useDirectChats('');
    const friends = friendsQuery.data ?? EMPTY_FRIENDS;
    const chatByUser = useUnreadByUser(chatsQuery.data ?? EMPTY_CHATS);

    useRefetchOnFocusIfStale(friendsQuery.refetch, friendsQuery.dataUpdatedAt, { enabled: !!user?.id });
    const { isPulling, onRefresh } = usePullToRefresh(
        useCallback(() => Promise.all([friendsQuery.refetch(), chatsQuery.refetch()]), [friendsQuery.refetch, chatsQuery.refetch]),
    );

    const openProfile = useCallback((userId: string) => navigation.navigate('PlayerProfile', { id: userId }), [navigation]);
    const message = useCallback(
        (friend: Friend) => openChatWith(navigation, friend, chatByUser.get(friend.userId.toLowerCase())),
        [navigation, chatByUser],
    );

    const searching = search.length > 0;

    if (friendsQuery.isPending && friends.length === 0) {
        return (
            <View style={LIST_PADDING}>
                <SearchBar value={search} onChange={setSearch} placeholder={t('searchFriends')} />
                <ListLabelSkeleton />
                <RosterSkeleton rows={6} />
            </View>
        );
    }

    return (
        <FlatList
            keyboardShouldPersistTaps="handled"
            data={friends.length > 0 ? [friends] : []}
            keyExtractor={() => 'roster'}
            contentContainerStyle={LIST_PADDING}
            ListHeaderComponent={
                <>
                    <SearchBar value={search} onChange={setSearch} placeholder={t('searchFriends')} />
                    {!searching && friends.length > 0 && <ListLabel title={t('tabFriends')} count={friends.length} />}
                </>
            }
            refreshControl={<RefreshControl refreshing={isPulling} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            ListEmptyComponent={
                friendsQuery.isError ? (
                    <LoadError title={t('loadFriendsFailed')} onRetry={() => friendsQuery.refetch()} />
                ) : (
                    <EmptyState
                        icon={searching ? 'search-outline' : 'people-outline'}
                        title={searching ? t('noFriendsMatched') : t('noFriendsYet')}
                        description={searching ? t('tryDifferentSearch') : t('growCircle')}
                        variant="plain"
                        className="mt-6"
                    />
                )
            }
            // The whole roster is one panel, so it renders as a single item; rows inside are cheap
            // (memoized avatar, no images beyond it).
            renderItem={({ item }) => (
                <Panel>
                    {item.map((friend, index) => (
                        <FriendRow
                            key={friend.userId}
                            friend={friend}
                            first={index === 0}
                            unread={(chatByUser.get(friend.userId.toLowerCase())?.unreadCount ?? 0) > 0}
                            onOpenProfile={openProfile}
                            onMessage={message}
                        />
                    ))}
                </Panel>
            )}
        />
    );
}

const FriendRow = React.memo(function FriendRow({
    friend,
    first,
    unread,
    onOpenProfile,
    onMessage,
}: {
    friend: Friend;
    first: boolean;
    unread: boolean;
    onOpenProfile: (userId: string) => void;
    onMessage: (friend: Friend) => void;
}) {
    const { t } = useTranslation('social');
    const nickname = friend.nickname?.trim();

    return (
        <View className={cn('flex-row items-center pl-4 pr-3 py-2.5', !first && 'border-t border-white/[0.05]')}>
            <Pressable
                onPress={() => onOpenProfile(friend.userId)}
                accessibilityRole="button"
                className="flex-1 flex-row items-center active:opacity-70"
            >
                <AvatarRing src={friend.avatarUrl} name={friend.username} tone={unread ? 'unread' : 'neutral'} />
                <View className="flex-1 ml-3">
                    <Text className="text-white font-black text-[15px] tracking-tight" numberOfLines={1}>
                        {friend.username}
                    </Text>
                    {/* Same gamepad line as the profile header; a friend without an in-game
                        nickname gets the friendship date instead. */}
                    {nickname ? (
                        <View className="flex-row items-center mt-0.5" style={{ gap: 5 }}>
                            <Ionicons name="game-controller" size={13} color={COLORS.primary} />
                            <Text className="flex-1 text-slate-400 text-[12px] font-semibold" numberOfLines={1}>
                                {nickname}
                            </Text>
                        </View>
                    ) : (
                        <Text className="text-slate-500 text-[12px] font-medium mt-0.5" numberOfLines={1}>
                            {t('friendsSince', { date: monthYear(friend.friendsSince) })}
                        </Text>
                    )}
                </View>
            </Pressable>
            {/* Lights up solid when this friend's messages are waiting. */}
            <Pressable
                onPress={() => onMessage(friend)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('profile:friend.message')}
                className={cn(
                    'w-9 h-9 ml-3 rounded-xl items-center justify-center active:opacity-60',
                    unread ? 'bg-primary' : 'bg-primary/10 border border-primary/25',
                )}
            >
                <Ionicons
                    name="chatbubble-ellipses"
                    size={16}
                    color={unread ? COLORS.primaryForeground : COLORS.primaryBright}
                />
            </Pressable>
        </View>
    );
});

// ═════════════════════════════════════════════════════════════════════
// REQUESTS TAB — received and sent on one page, no sub-tabs
// ═════════════════════════════════════════════════════════════════════

type RequestAction = 'accept' | 'reject' | 'cancel';

function RequestsTab({ navigation }: { navigation: NavProp }) {
    const { t } = useTranslation('social');
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { badges, refresh: refreshBadges } = useBadges();
    const { search, setSearch, debounced } = useDebouncedSearch();
    const requestsQuery = useFriendRequests(debounced);
    const { incoming, outgoing } = requestsQuery.data ?? EMPTY_REQUESTS;
    const [busy, setBusy] = useState<{ id: string; action: RequestAction } | null>(null);

    useRefetchOnFocusIfStale(requestsQuery.refetch, requestsQuery.dataUpdatedAt, { enabled: !!user?.id });
    useRefetchWhenCountMoves(badges.friendRequests, requestsQuery.refetch);
    const { isPulling, onRefresh } = usePullToRefresh(requestsQuery.refetch);

    const act = async (req: FriendRequest, action: RequestAction) => {
        if (busy) return;
        setBusy({ id: req.id, action });
        try {
            const url =
                action === 'accept' ? ENDPOINTS.ACCEPT_FRIEND_REQUEST(req.id)
                    : action === 'reject' ? ENDPOINTS.REJECT_FRIEND_REQUEST(req.id)
                        : ENDPOINTS.CANCEL_FRIEND_REQUEST(req.id);
            const res = await authenticatedFetch(url, { method: 'POST' });
            if (!res.ok) throw new Error(getErrorMessage(await res.text().catch(() => '')));
            // Drop it from every cached search at once, so clearing the search doesn't bring it back.
            queryClient.setQueriesData<FriendRequests>({ queryKey: ['friend-requests'] }, (prev) =>
                prev && {
                    incoming: prev.incoming.filter((r) => r.id !== req.id),
                    outgoing: prev.outgoing.filter((r) => r.id !== req.id),
                },
            );
            if (action === 'accept') queryClient.invalidateQueries({ queryKey: ['friends'] });
            refreshBadges();
        } catch (e) {
            Alert.alert(t('common:error'), getErrorMessage(e));
            // It may have been answered elsewhere in the meantime — show what's really there.
            requestsQuery.refetch();
        } finally {
            setBusy(null);
        }
    };

    const searching = search.length > 0;
    const sections = [
        ...(incoming.length > 0 ? [{ key: 'incoming' as const, items: incoming }] : []),
        ...(outgoing.length > 0 ? [{ key: 'outgoing' as const, items: outgoing }] : []),
    ];

    if (requestsQuery.isPending && sections.length === 0) {
        return (
            <View style={LIST_PADDING}>
                <SearchBar value={search} onChange={setSearch} placeholder={t('searchRequests')} />
                <ListLabelSkeleton />
                <RosterSkeleton rows={3} action="pair" />
            </View>
        );
    }

    return (
        <FlatList
            keyboardShouldPersistTaps="handled"
            data={sections}
            keyExtractor={(section) => section.key}
            contentContainerStyle={LIST_PADDING}
            ListHeaderComponent={<SearchBar value={search} onChange={setSearch} placeholder={t('searchRequests')} />}
            refreshControl={<RefreshControl refreshing={isPulling} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            ListEmptyComponent={
                requestsQuery.isError ? (
                    <LoadError title={t('common:unexpectedError')} onRetry={() => requestsQuery.refetch()} />
                ) : (
                    <EmptyState
                        icon={searching ? 'search-outline' : 'mail-open-outline'}
                        title={searching ? t('noRequestsMatched') : t('noRequests')}
                        description={searching ? t('tryDifferentSearch') : t('requestsHint')}
                        variant="plain"
                        className="mt-6"
                    />
                )
            }
            ItemSeparatorComponent={() => <View style={{ height: 22 }} />}
            renderItem={({ item: section }) => {
                const isIncoming = section.key === 'incoming';
                return (
                    <View>
                        <ListLabel
                            title={isIncoming ? t('subTabIncoming') : t('subTabOutgoing')}
                            count={section.items.length}
                            countColor={isIncoming ? '#FBBF24' : undefined}
                        />
                        {/* Received requests wait on you — the panel carries the amber edge the
                            organizer's registration requests use. */}
                        <Panel style={isIncoming ? { borderColor: 'rgba(245,158,11,0.22)' } : undefined}>
                            {section.items.map((req, index) => (
                                <RequestRow
                                    key={req.id}
                                    request={req}
                                    incoming={isIncoming}
                                    first={index === 0}
                                    busyAction={busy?.id === req.id ? busy.action : null}
                                    disabled={busy !== null}
                                    onOpenProfile={(id) => navigation.navigate('PlayerProfile', { id })}
                                    onAct={act}
                                />
                            ))}
                        </Panel>
                    </View>
                );
            }}
        />
    );
}

function RequestRow({
    request,
    incoming,
    first,
    busyAction,
    disabled,
    onOpenProfile,
    onAct,
}: {
    request: FriendRequest;
    incoming: boolean;
    first: boolean;
    busyAction: RequestAction | null;
    disabled: boolean;
    onOpenProfile: (userId: string) => void;
    onAct: (req: FriendRequest, action: RequestAction) => void;
}) {
    const { t } = useTranslation('social');
    const userId = incoming ? request.fromUserId : request.toUserId;
    const username = incoming ? request.fromUsername : request.toUsername;
    const nickname = (incoming ? request.fromNickname : request.toNickname)?.trim();
    const avatarUrl = incoming ? request.fromAvatarUrl : request.toAvatarUrl;

    return (
        <View className={cn('flex-row items-center pl-4 pr-3 py-2.5', !first && 'border-t border-white/[0.05]')}>
            {/* Avatar + name open the profile, so you can see who it is before answering. */}
            <Pressable
                onPress={() => onOpenProfile(userId)}
                accessibilityRole="button"
                className="flex-1 flex-row items-center active:opacity-70"
            >
                <View>
                    <AvatarRing src={avatarUrl} name={username} tone={incoming ? 'incoming' : 'neutral'} />
                    {incoming && (
                        <View
                            className="absolute items-center justify-center"
                            style={{ bottom: -2, right: -2, width: 16, height: 16, borderRadius: 999, backgroundColor: INCOMING, borderWidth: 2, borderColor: COLORS.card }}
                        >
                            <Ionicons name="person-add" size={8} color={COLORS.primaryForeground} />
                        </View>
                    )}
                </View>
                <View className="flex-1 ml-3">
                    <Text className="text-white font-black text-[15px] tracking-tight" numberOfLines={1}>
                        {username}
                    </Text>
                    <View className="flex-row items-center mt-0.5" style={{ gap: 5 }}>
                        {nickname ? (
                            <>
                                <Ionicons name="game-controller" size={13} color={COLORS.primary} />
                                <Text className="shrink text-slate-400 text-[12px] font-semibold" numberOfLines={1}>
                                    {nickname}
                                </Text>
                            </>
                        ) : (
                            <Text className="shrink text-slate-500 text-[12px] font-medium" numberOfLines={1}>
                                {incoming ? t('wantsToConnect') : t('requestSent')}
                            </Text>
                        )}
                        <Text className="text-slate-600 text-[11px] font-bold ml-1" style={TABULAR}>
                            {formatChatTime(request.createdOn)}
                        </Text>
                    </View>
                </View>
            </Pressable>

            <View className="flex-row items-center ml-2" style={{ gap: 6 }}>
                {incoming ? (
                    <>
                        <RowAction
                            icon="close"
                            tone="danger"
                            label={t('decline')}
                            busy={busyAction === 'reject'}
                            disabled={disabled}
                            onPress={() => onAct(request, 'reject')}
                        />
                        <RowAction
                            icon="checkmark"
                            tone="primary"
                            label={t('accept')}
                            busy={busyAction === 'accept'}
                            disabled={disabled}
                            onPress={() => onAct(request, 'accept')}
                        />
                    </>
                ) : (
                    <RowAction
                        icon="close"
                        tone="quiet"
                        label={t('cancelRequest')}
                        busy={busyAction === 'cancel'}
                        disabled={disabled}
                        onPress={() => onAct(request, 'cancel')}
                    />
                )}
            </View>
        </View>
    );
}

const ROW_ACTION_TONES = {
    primary: { box: 'bg-primary', icon: COLORS.primaryForeground },
    danger: { box: 'bg-red-500/10 border border-red-500/25', icon: '#F87171' },
    quiet: { box: 'bg-white/[0.05] border border-white/10', icon: COLORS.slate400 },
} as const;

/** 36px square action on a roster row — the same buttons the registration requests use. */
function RowAction({
    icon,
    tone,
    label,
    busy,
    disabled,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    tone: keyof typeof ROW_ACTION_TONES;
    label: string;
    busy: boolean;
    disabled: boolean;
    onPress: () => void;
}) {
    const style = ROW_ACTION_TONES[tone];
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled, busy }}
            className={cn('w-9 h-9 rounded-xl items-center justify-center active:opacity-60', style.box, disabled && !busy && 'opacity-50')}
        >
            {busy ? (
                <ActivityIndicator size="small" color={style.icon} />
            ) : (
                <Ionicons name={icon} size={tone === 'primary' ? 18 : 17} color={style.icon} />
            )}
        </Pressable>
    );
}

// ═════════════════════════════════════════════════════════════════════
// CHATS TAB — a friends rail to start one, then every conversation in its own card
// ═════════════════════════════════════════════════════════════════════

function ChatsTab({ navigation }: { navigation: NavProp }) {
    const { t } = useTranslation('social');
    const { user } = useAuth();
    const { badges } = useBadges();
    const { search, setSearch, debounced } = useDebouncedSearch();
    const chatsQuery = useDirectChats(debounced);
    const friendsQuery = useFriends('');
    const chats = chatsQuery.data ?? EMPTY_CHATS;
    const friends = friendsQuery.data ?? EMPTY_FRIENDS;
    const searching = search.length > 0;

    // Bottom tabs keep this screen mounted; useRefetchOnFocusIfStale bridges the gap, and a
    // message landing while the list is open moves the unread badge, which refetches it.
    useRefetchOnFocusIfStale(chatsQuery.refetch, chatsQuery.dataUpdatedAt, { enabled: !!user?.id });
    useRefetchWhenCountMoves(badges.unreadDirectMessages, chatsQuery.refetch);
    const { isPulling, onRefresh } = usePullToRefresh(
        useCallback(() => Promise.all([chatsQuery.refetch(), friendsQuery.refetch()]), [chatsQuery.refetch, friendsQuery.refetch]),
    );

    // The rail is ordered by who you talk to: unread first, then the latest conversation,
    // then friends you haven't written to yet. Only built from the unfiltered chat list.
    const chatByUser = useUnreadByUser(debounced ? EMPTY_CHATS : chats);
    const railFriends = useMemo(() => {
        const lastAt = (f: Friend) => {
            const at = chatByUser.get(f.userId.toLowerCase())?.lastMessageAt;
            return at ? parseUtcDate(at).getTime() : 0;
        };
        const unread = (f: Friend) => ((chatByUser.get(f.userId.toLowerCase())?.unreadCount ?? 0) > 0 ? 1 : 0);
        return [...friends].sort((a, b) => unread(b) - unread(a) || lastAt(b) - lastAt(a));
    }, [friends, chatByUser]);

    const openChat = useCallback((chat: DirectChat) => {
        navigation.navigate('DirectChat', {
            chatId: chat.id,
            header: {
                otherUserId: chat.otherUserId,
                otherUsername: chat.otherUsername,
                otherNickname: chat.otherNickname,
                otherAvatarUrl: chat.otherAvatarUrl,
            },
        });
    }, [navigation]);

    const showRail = !searching && railFriends.length > 0;

    if (chatsQuery.isPending && chats.length === 0) {
        return (
            <View style={LIST_PADDING}>
                <SearchBar value={search} onChange={setSearch} placeholder={t('searchChats')} />
                <ListLabelSkeleton />
                <RailSkeleton />
                <ListLabelSkeleton />
                <View style={{ gap: 8 }}>
                    {[0, 1, 2, 3].map((i) => <ChatCardSkeleton key={i} />)}
                </View>
            </View>
        );
    }

    return (
        <FlatList
            keyboardShouldPersistTaps="handled"
            data={chats}
            keyExtractor={(item) => item.id}
            contentContainerStyle={LIST_PADDING}
            ListHeaderComponent={
                <>
                    <SearchBar value={search} onChange={setSearch} placeholder={t('searchChats')} />
                    {showRail && (
                        <View className="mb-5">
                            <ListLabel title={t('tabFriends')} />
                            <FlatList
                                horizontal
                                data={railFriends}
                                keyExtractor={(f) => f.userId}
                                showsHorizontalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                // Bleeds to the screen edges so the rail reads as scrollable.
                                style={{ marginHorizontal: -20 }}
                                contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                                renderItem={({ item: friend }) => {
                                    const chat = chatByUser.get(friend.userId.toLowerCase());
                                    return (
                                        <RailFriend
                                            friend={friend}
                                            unread={(chat?.unreadCount ?? 0) > 0}
                                            onPress={() => openChatWith(navigation, friend, chat)}
                                        />
                                    );
                                }}
                            />
                        </View>
                    )}
                    {!searching && chats.length > 0 && <ListLabel title={t('tabChats')} count={chats.length} />}
                </>
            }
            refreshControl={<RefreshControl refreshing={isPulling} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            ListEmptyComponent={
                chatsQuery.isError ? (
                    <LoadError title={t('common:unexpectedError')} onRetry={() => chatsQuery.refetch()} />
                ) : (
                    <EmptyState
                        icon={searching ? 'search-outline' : 'chatbubbles-outline'}
                        title={searching ? t('noChatsMatched') : t('noChatsYet')}
                        description={searching ? t('tryDifferentSearch') : showRail ? t('chatsHintRail') : t('chatsHint')}
                        variant="plain"
                        className={showRail ? 'mt-0' : 'mt-6'}
                    />
                )
            }
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => (
                <ChatCard chat={item} fromMe={!!user?.id && item.lastMessageSenderId === user.id} onPress={openChat} />
            )}
        />
    );
}

const RAIL_ITEM_WIDTH = 64;

const RailFriend = React.memo(function RailFriend({
    friend,
    unread,
    onPress,
}: {
    friend: Friend;
    unread: boolean;
    onPress: () => void;
}) {
    const { t } = useTranslation('social');
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${t('profile:friend.message')}: ${friend.username}`}
            className="items-center active:opacity-70"
            style={{ width: RAIL_ITEM_WIDTH }}
        >
            <AvatarRing src={friend.avatarUrl} name={friend.username} size="lg" tone={unread ? 'unread' : 'neutral'} gapColor={COLORS.background} />
            <Text
                className={cn('w-full text-center text-[11px] mt-1.5', unread ? 'text-white font-black' : 'text-slate-400 font-semibold')}
                numberOfLines={1}
            >
                {friend.username}
            </Text>
        </Pressable>
    );
});

const CHAT_CARD_RADIUS = 18;

/** Card shell shared with the notification inbox: unread trades the neutral edge for emerald. */
function ChatShell({ unread, children }: { unread?: boolean; children: React.ReactNode }) {
    return (
        <View
            style={{
                backgroundColor: COLORS.card,
                borderRadius: CHAT_CARD_RADIUS,
                borderWidth: 1,
                borderColor: unread ? COLORS.primary + '33' : 'rgba(255,255,255,0.07)',
                borderTopColor: unread ? COLORS.primary + '4D' : 'rgba(255,255,255,0.11)',
                overflow: 'hidden',
            }}
        >
            {children}
        </View>
    );
}

const ChatCard = React.memo(function ChatCard({
    chat,
    fromMe,
    onPress,
}: {
    chat: DirectChat;
    fromMe: boolean;
    onPress: (chat: DirectChat) => void;
}) {
    const { t } = useTranslation('social');
    const unread = chat.unreadCount > 0;

    return (
        <ChatShell unread={unread}>
            <Pressable onPress={() => onPress(chat)} accessibilityRole="button" className="active:opacity-70">
                {unread && (
                    <>
                        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLORS.primary + '0F' }} />
                        <View
                            pointerEvents="none"
                            style={{
                                position: 'absolute', left: 0, top: 14, bottom: 14, width: 3,
                                borderTopRightRadius: 3, borderBottomRightRadius: 3,
                                backgroundColor: COLORS.primary,
                                shadowColor: COLORS.primary, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
                            }}
                        />
                    </>
                )}
                <View className="flex-row items-center px-4 py-3" style={{ gap: 12 }}>
                    <AvatarRing src={chat.otherAvatarUrl} name={chat.otherUsername} tone={unread ? 'unread' : 'neutral'} />
                    <View className="flex-1">
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                            <Text
                                className={cn('flex-1 text-[15px] tracking-tight', unread ? 'text-white font-black' : 'text-slate-200 font-bold')}
                                numberOfLines={1}
                            >
                                {chat.otherUsername}
                            </Text>
                            {chat.lastMessageAt && (
                                <Text
                                    className="text-[11px] font-bold"
                                    style={[TABULAR, { color: unread ? COLORS.primaryBright : COLORS.slate500 }]}
                                >
                                    {formatChatTime(chat.lastMessageAt)}
                                </Text>
                            )}
                        </View>
                        <View className="flex-row items-center mt-0.5" style={{ gap: 8 }}>
                            <Text
                                className={cn('flex-1 text-[13px] leading-[18px]', unread ? 'text-slate-200 font-semibold' : 'text-slate-400 font-medium')}
                                numberOfLines={1}
                            >
                                {fromMe ? <Text className="text-slate-500 font-medium">{t('youPrefix')}</Text> : null}
                                {chat.lastMessage}
                            </Text>
                            {unread && (
                                <View className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-primary-foreground text-[11px] font-black" style={TABULAR}>
                                        {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </Pressable>
        </ChatShell>
    );
});

// ═════════════════════════════════════════════════════════════════════
// SHARED PIECES
// ═════════════════════════════════════════════════════════════════════

type RingTone = 'neutral' | 'unread' | 'incoming';

/**
 * Avatar in a ring. `unread` is the gradient ring (with a soft glow on iOS) that marks someone
 * whose messages are waiting; `incoming` is the amber of a request waiting on you. The gap
 * between ring and photo is painted in the surface colour, so pass `gapColor` off a card.
 */
function AvatarRing({
    src,
    name,
    size = 'md',
    tone = 'neutral',
    gapColor = COLORS.card,
}: {
    src?: string | null;
    name: string;
    size?: 'md' | 'lg';
    tone?: RingTone;
    gapColor?: string;
}) {
    const avatar = <PlayerAvatar src={src ?? undefined} name={name} size={size} className="border-0" />;

    if (tone === 'unread') {
        return (
            <View
                style={{
                    borderRadius: 999,
                    shadowColor: COLORS.primary, shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
                }}
            >
                <LinearGradient
                    colors={UNREAD_RING}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ borderRadius: 999, padding: 2 }}
                >
                    <View style={{ borderRadius: 999, padding: 1, backgroundColor: gapColor }}>{avatar}</View>
                </LinearGradient>
            </View>
        );
    }

    return (
        <View
            style={{
                borderRadius: 999,
                padding: 1.5,
                borderWidth: 1.5,
                borderColor: tone === 'incoming' ? 'rgba(245,158,11,0.55)' : 'rgba(255,255,255,0.12)',
            }}
        >
            {avatar}
        </View>
    );
}

/** Tracked uppercase heading over a list, with a quiet count — as on the hub's member list. */
function ListLabel({ title, count, countColor }: { title: string; count?: number; countColor?: string }) {
    return (
        <View className="flex-row items-center px-1 mb-2" style={{ gap: 8 }}>
            <Text className="text-slate-400 text-[11px] font-black uppercase tracking-[1.6px]" numberOfLines={1}>
                {title}
            </Text>
            {count !== undefined && (
                <Text className="text-[11px] font-bold" style={[TABULAR, { color: countColor ?? COLORS.slate600 }]}>
                    {count.toLocaleString(i18n.language)}
                </Text>
            )}
        </View>
    );
}

function SearchBar({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
}) {
    const { t } = useTranslation('common');
    const active = value.length > 0;
    return (
        <View
            className="flex-row items-center px-3.5 h-12 rounded-2xl mt-1 mb-4"
            style={{
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: active ? 'rgba(16,185,129,0.30)' : 'rgba(255,255,255,0.07)',
                borderTopColor: active ? 'rgba(16,185,129,0.40)' : 'rgba(255,255,255,0.11)',
            }}
        >
            <Ionicons name="search" size={17} color={active ? COLORS.primary : COLORS.slate500} />
            <TextInput
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={COLORS.slate500}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                className="flex-1 h-12 ml-2.5 text-white text-[14px] font-medium"
            />
            {active && (
                <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('close')}>
                    <Ionicons name="close-circle" size={18} color={COLORS.slate500} />
                </Pressable>
            )}
        </View>
    );
}

function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
    const { t } = useTranslation('common');
    return (
        <EmptyState
            icon="cloud-offline-outline"
            title={title}
            color={COLORS.destructive}
            variant="plain"
            className="mt-6"
            action={
                <Pressable
                    onPress={onRetry}
                    accessibilityRole="button"
                    className="flex-row items-center h-10 px-4 rounded-xl bg-white/[0.05] border border-white/10 active:opacity-70"
                    style={{ gap: 6 }}
                >
                    <Ionicons name="refresh" size={15} color={COLORS.slate300} />
                    <Text className="text-slate-200 text-[13px] font-bold">{t('retry')}</Text>
                </Pressable>
            }
        />
    );
}

// ─── Skeletons, in the real rows' shapes ─────────────────────────────

function ListLabelSkeleton() {
    return (
        <View className="px-1 mb-3">
            <Skeleton width={72} height={10} radius={5} />
        </View>
    );
}

function RosterSkeleton({ rows, action = 'single' }: { rows: number; action?: 'single' | 'pair' }) {
    return (
        <Panel>
            {Array.from({ length: rows }, (_, i) => (
                <View key={i} className={cn('flex-row items-center pl-4 pr-3 py-2.5', i > 0 && 'border-t border-white/[0.05]')}>
                    <Skeleton width={46} height={46} radius={23} />
                    <View className="flex-1 ml-3" style={{ gap: 7 }}>
                        <Skeleton width="48%" height={12} radius={6} />
                        <Skeleton width="32%" height={10} radius={5} />
                    </View>
                    <View className="flex-row ml-3" style={{ gap: 6 }}>
                        {action === 'pair' && <Skeleton width={36} height={36} radius={12} />}
                        <Skeleton width={36} height={36} radius={12} />
                    </View>
                </View>
            ))}
        </Panel>
    );
}

function RailSkeleton() {
    return (
        <View className="flex-row mb-5" style={{ gap: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} className="items-center" style={{ width: RAIL_ITEM_WIDTH, gap: 8 }}>
                    <Skeleton width={62} height={62} radius={31} />
                    <Skeleton width={44} height={8} radius={4} />
                </View>
            ))}
        </View>
    );
}

function ChatCardSkeleton() {
    return (
        <ChatShell>
            <View className="flex-row items-center px-4 py-3" style={{ gap: 12 }}>
                <Skeleton width={46} height={46} radius={23} />
                <View className="flex-1" style={{ gap: 8 }}>
                    <View className="flex-row items-center">
                        <Skeleton width="44%" height={12} radius={6} />
                        <View className="flex-1" />
                        <Skeleton width={34} height={10} radius={5} />
                    </View>
                    <Skeleton width="78%" height={10} radius={5} />
                </View>
            </View>
        </ChatShell>
    );
}

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

/**
 * Drop empty chats (no message exchanged yet) so they don't clutter the list,
 * then float unread chats to the top; within each group the most recent message wins.
 */
function sortChats(chats: DirectChat[]): DirectChat[] {
    return chats
        .filter((c) => !!c.lastMessageAt || !!c.lastMessage)
        .sort((a, b) => {
        const aUnread = a.unreadCount > 0 ? 1 : 0;
        const bUnread = b.unreadCount > 0 ? 1 : 0;
        if (aUnread !== bUnread) return bUnread - aUnread;
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
    });
}

// Compact, chat-app style timestamp: today → time, yesterday → "Yesterday",
// within a week → weekday, older → "27 Jun".
// Module scope, so this reads the label off the i18n singleton rather than a hook.
const YESTERDAY_LABEL = () => i18n.t('social:yesterday');

function formatChatTime(iso: string): string {
    const d = parseUtcDate(iso);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 86400000;
    const ts = d.getTime();
    if (ts >= startOfToday) return d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
    if (ts >= startOfToday - dayMs) return YESTERDAY_LABEL();
    if (ts >= startOfToday - 6 * dayMs) return d.toLocaleDateString(dateLocale(), { weekday: 'short' });
    return d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}

function monthYear(iso?: string): string {
    if (!iso) return '';
    return parseUtcDate(iso).toLocaleDateString(dateLocale(), { month: 'short', year: 'numeric' });
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { parseUtcDate, cn } from '../lib/utils';
import { Friend, FriendRequest, DirectChat } from '../types/social';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { useBadges } from '../context/BadgesContext';
import { useAuth } from '../context/AuthContext';

type TabKey = 'friends' | 'requests' | 'chats';
type NavProp = StackNavigationProp<RootStackParamList>;
type SocialRoute = RouteProp<MainTabParamList, 'Social'>;

// Stable fallback so the derived useMemo below doesn't churn on every render
// before the first response lands.
const EMPTY_CHATS: DirectChat[] = [];

export default function SocialScreen() {
    const navigation = useNavigation<NavProp>();
    const route = useRoute<SocialRoute>();
    const { badges } = useBadges();
    const [activeTab, setActiveTab] = useState<TabKey>(route.params?.initialTab ?? 'friends');

    const tabs: PremiumTabItem[] = [
        { value: 'friends', label: 'Friends', icon: 'people' },
        { value: 'requests', label: 'Requests', icon: 'person-add', badge: badges.friendRequests > 0 ? badges.friendRequests : undefined, badgeTone: 'alert' },
        { value: 'chats', label: 'Chats', icon: 'chatbubble-ellipses', badge: badges.unreadDirectMessages > 0 ? badges.unreadDirectMessages : undefined, badgeTone: 'alert' },
    ];

    useFocusEffect(
        useCallback(() => {
            if (route.params?.initialTab) {
                setActiveTab(route.params.initialTab);
            }
        }, [route.params?.initialTab])
    );

    return (
        <SafeAreaView className="flex-1 bg-[#0F172A]" edges={['top']}>
            {/* ─── Header ──────────────────────────────────────── */}
            <View className="px-5 pt-2 pb-3">
                <Text className="text-white text-2xl font-black tracking-tight">Social</Text>
                <Text className="text-slate-500 text-xs font-medium mt-0.5">
                    Stay connected with your gaming circle
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
                {activeTab === 'requests' && <RequestsTab />}
                {activeTab === 'chats' && <ChatsTab navigation={navigation} />}
            </View>
        </SafeAreaView>
    );
}

// ═════════════════════════════════════════════════════════════════════
// FRIENDS TAB
// ═════════════════════════════════════════════════════════════════════

function FriendsTab({ navigation }: { navigation: NavProp }) {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reqSeqRef = useRef(0);

    const load = useCallback(async (q: string = '') => {
        const seq = ++reqSeqRef.current;
        try {
            const res = await authenticatedFetch(ENDPOINTS.GET_FRIENDS(q));
            if (seq !== reqSeqRef.current) return;
            if (res.ok) {
                const data = await res.json();
                if (seq !== reqSeqRef.current) return;
                setFriends(Array.isArray(data) ? data : []);
                setError(null);
            } else {
                setError('Failed to load friends');
            }
        } catch (e: any) {
            if (seq !== reqSeqRef.current) return;
            setError(getErrorMessage(e));
        } finally {
            if (seq === reqSeqRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, []);

    // Single-source-of-truth loader: debounced when the user is typing (skips first fire so we
    // don't waste a request while the query is still being composed), immediate when they open
    // the tab with an empty box. Merging the focus + debounce effects here avoids the previous
    // double-fetch on mount and the stale-closure that reset the query after a tab switch.
    const isFirst = useRef(true);
    useFocusEffect(useCallback(() => { load(search); }, [load, search]));
    useEffect(() => {
        if (isFirst.current) { isFirst.current = false; return; }
        const t = setTimeout(() => { load(search); }, 300);
        return () => clearTimeout(t);
    }, [search, load]);

    const openChat = async (friend: Friend) => {
        navigation.navigate('DirectChat', {
            otherUserId: friend.userId,
            header: {
                otherUserId: friend.userId,
                otherUsername: friend.username,
                otherNickname: friend.nickname,
                otherAvatarUrl: friend.avatarUrl,
            },
        });
    };

    if (loading) return <Loading />;

    return (
        <FlatList
            data={friends}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
            ListHeaderComponent={
                <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Search friends..."
                />
            }
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => { setRefreshing(true); load(search); }}
                    tintColor="#10B981"
                />
            }
            ListEmptyComponent={
                <EmptyState
                    icon="people-outline"
                    title={search ? "No friends matched" : "No friends yet"}
                    subtitle={search ? "Try a different search term" : "Add players to grow your circle"}
                />
            }
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
                <CardSurface onPress={() => navigation.navigate('PlayerProfile', { id: item.userId })}>
                    <View className="flex-row items-center p-3.5">
                        <RingAvatar src={item.avatarUrl ?? undefined} name={item.username} />
                        <View className="flex-1 ml-3.5">
                            <Text className="text-white font-black text-[15px] tracking-tight" numberOfLines={1}>
                                {item.username}
                            </Text>
                            <Text className="text-slate-500 text-[11px] font-semibold mt-0.5" numberOfLines={1}>
                                {item.nickname ? `@${item.nickname}` : `Friends since ${monthYear(item.friendsSince)}`}
                            </Text>
                        </View>
                        <Pressable
                            onPress={() => openChat(item)}
                            hitSlop={8}
                            className="w-10 h-10 rounded-2xl items-center justify-center mr-1.5"
                            style={({ pressed }) => ({
                                backgroundColor: 'rgba(16,185,129,0.10)',
                                borderWidth: 1,
                                borderColor: 'rgba(16,185,129,0.22)',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Ionicons name="chatbubble-ellipses" size={17} color="#10B981" />
                        </Pressable>
                        <Ionicons name="chevron-forward" size={16} color="#334155" />
                    </View>
                </CardSurface>
            )}
        />
    );
}

// ═════════════════════════════════════════════════════════════════════
// REQUESTS TAB (incoming + outgoing)
// ═════════════════════════════════════════════════════════════════════

function RequestsTab() {
    const { refresh: refreshBadges } = useBadges();
    const [subTab, setSubTab] = useState<'incoming' | 'outgoing'>('incoming');
    const [incoming, setIncoming] = useState<FriendRequest[]>([]);
    const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const reqSeqRef = useRef(0);

    const load = useCallback(async (q: string = '') => {
        const seq = ++reqSeqRef.current;
        try {
            const [inRes, outRes] = await Promise.all([
                authenticatedFetch(ENDPOINTS.GET_INCOMING_REQUESTS(q)),
                authenticatedFetch(ENDPOINTS.GET_OUTGOING_REQUESTS(q)),
            ]);
            if (seq !== reqSeqRef.current) return;
            if (inRes.ok) {
                const inData = await inRes.json();
                if (seq !== reqSeqRef.current) return;
                setIncoming(inData);
            }
            if (outRes.ok) {
                const outData = await outRes.json();
                if (seq !== reqSeqRef.current) return;
                setOutgoing(outData);
            }
        } finally {
            if (seq === reqSeqRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, []);

    // Same pattern as FriendsTab: focus fires with the current query; debounce skips the initial
    // render so it doesn't fire an identical second request on mount / tab entry.
    const isFirst = useRef(true);
    useFocusEffect(useCallback(() => { load(search); }, [load, search]));
    useEffect(() => {
        if (isFirst.current) { isFirst.current = false; return; }
        const t = setTimeout(() => { load(search); }, 300);
        return () => clearTimeout(t);
    }, [search, load]);

    const accept = async (req: FriendRequest) => {
        try {
            await authenticatedFetch(ENDPOINTS.ACCEPT_FRIEND_REQUEST(req.id), { method: 'POST' });
            setIncoming((prev) => prev.filter((r) => r.id !== req.id));
            refreshBadges();
        } catch { /* ignore */ }
    };

    const reject = async (req: FriendRequest) => {
        try {
            await authenticatedFetch(ENDPOINTS.REJECT_FRIEND_REQUEST(req.id), { method: 'POST' });
            setIncoming((prev) => prev.filter((r) => r.id !== req.id));
            refreshBadges();
        } catch { /* ignore */ }
    };

    const cancel = async (req: FriendRequest) => {
        try {
            await authenticatedFetch(ENDPOINTS.CANCEL_FRIEND_REQUEST(req.id), { method: 'POST' });
            setOutgoing((prev) => prev.filter((r) => r.id !== req.id));
            refreshBadges();
        } catch { /* ignore */ }
    };

    if (loading) return <Loading />;

    const list = subTab === 'incoming' ? incoming : outgoing;

    return (
        <View className="flex-1">
            <View className="px-5 mb-2">
                <PremiumTabs
                    tabs={[
                        { value: 'incoming', label: 'Incoming', icon: 'arrow-down-circle-outline', badge: incoming.length > 0 ? incoming.length : undefined, badgeTone: 'alert' },
                        { value: 'outgoing', label: 'Outgoing', icon: 'arrow-up-circle-outline', badge: outgoing.length > 0 ? outgoing.length : undefined },
                    ]}
                    activeTab={subTab}
                    onTabChange={(v) => setSubTab(v as 'incoming' | 'outgoing')}
                />
            </View>

            <FlatList
                data={list}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
                ListHeaderComponent={
                    <SearchBar
                        value={search}
                        onChange={setSearch}
                        placeholder={`Search ${subTab} requests...`}
                    />
                }
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); load(search); }}
                        tintColor="#10B981"
                    />
                }
                ListEmptyComponent={
                    <EmptyState
                        icon="mail-open-outline"
                        title={
                            subTab === 'incoming'
                                ? 'No incoming requests'
                                : 'No outgoing requests'
                        }
                        subtitle="When new requests arrive, they'll show up here"
                    />
                }
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                renderItem={({ item }) => {
                    const isIncoming = subTab === 'incoming';
                    const username = isIncoming ? item.fromUsername : item.toUsername;
                    const avatarUrl = isIncoming ? item.fromAvatarUrl : item.toAvatarUrl;
                    return (
                        <CardSurface>
                            <View className="p-3.5">
                                <View className="flex-row items-center">
                                    <RingAvatar
                                        src={avatarUrl ?? undefined}
                                        name={username}
                                        ringColor={isIncoming ? 'rgba(16,185,129,0.30)' : 'rgba(255,255,255,0.10)'}
                                    />
                                    <View className="flex-1 ml-3.5">
                                        <Text className="text-white font-black text-[15px] tracking-tight" numberOfLines={1}>
                                            {username}
                                        </Text>
                                        <View className="flex-row items-center mt-0.5" style={{ gap: 5 }}>
                                            <Ionicons
                                                name={isIncoming ? 'arrow-down' : 'arrow-up'}
                                                size={11}
                                                color={isIncoming ? '#10B981' : '#64748B'}
                                            />
                                            <Text className="text-slate-500 text-[11px] font-semibold">
                                                {isIncoming ? 'Wants to connect' : 'Request sent'}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text className="text-slate-600 text-[10px] font-bold ml-2">
                                        {formatChatTime(item.createdOn)}
                                    </Text>
                                </View>
                                {/* Action row — full-width split buttons. flex-1 via className (NativeWind
                                    applies it reliably; an inline flex inside a function style does NOT here,
                                    which left them content-width). Green = accept, red = decline. */}
                                <View className="flex-row" style={{ marginTop: 16, gap: 10 }}>
                                    {isIncoming ? (
                                        <>
                                            <Pressable
                                                onPress={() => accept(item)}
                                                className="flex-1"
                                                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
                                            >
                                                <View
                                                    style={{
                                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                                                        backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 14,
                                                        shadowColor: '#10B981', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
                                                    }}
                                                >
                                                    <Ionicons name="checkmark-circle" size={18} color="#04130D" />
                                                    <Text style={{ color: '#04130D', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 }}>Accept</Text>
                                                </View>
                                            </Pressable>
                                            <Pressable
                                                onPress={() => reject(item)}
                                                className="flex-1"
                                                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
                                            >
                                                <View
                                                    style={{
                                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                                                        backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.40)',
                                                        borderRadius: 14, paddingVertical: 13,
                                                    }}
                                                >
                                                    <Ionicons name="close-circle" size={17} color="#F87171" />
                                                    <Text style={{ color: '#F87171', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 }}>Decline</Text>
                                                </View>
                                            </Pressable>
                                        </>
                                    ) : (
                                        <Pressable
                                            onPress={() => cancel(item)}
                                            className="flex-1"
                                            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
                                        >
                                            <View
                                                style={{
                                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                                                    backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)',
                                                    borderRadius: 14, paddingVertical: 13,
                                                }}
                                            >
                                                <Ionicons name="close-circle" size={17} color="#F87171" />
                                                <Text style={{ color: '#F87171', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 }}>Cancel request</Text>
                                            </View>
                                        </Pressable>
                                    )}
                                </View>
                            </View>
                        </CardSurface>
                    );
                }}
            />
        </View>
    );
}

// ═════════════════════════════════════════════════════════════════════
// CHATS TAB
// ═════════════════════════════════════════════════════════════════════

function ChatsTab({ navigation }: { navigation: NavProp }) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Immediate value drives the input; debounced value drives the query key so
    // we don't fire a fresh network round-trip on every keystroke. Same 300ms
    // window the old manual load() used, just moved into a single ref.
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        if (search === debouncedSearch) return;
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search, debouncedSearch]);

    // Cold-start cache is handled globally by PersistQueryClientProvider in App.tsx —
    // the last snapshot for each (userId, search) key restores before render, so no
    // manual hydration effect is needed here.
    const chatsQuery = useQuery<DirectChat[]>({
        queryKey: ['direct-chats', user?.id, debouncedSearch],
        queryFn: async () => {
            const res = await authenticatedFetch(ENDPOINTS.GET_DIRECT_CHATS(debouncedSearch));
            if (!res.ok) throw new Error(`GET_DIRECT_CHATS failed: ${res.status}`);
            const data = await res.json();
            return Array.isArray(data) ? sortChats(data) : [];
        },
        enabled: !!user?.id,
        staleTime: 30_000,
        refetchOnMount: true,
    });

    const chats = chatsQuery.data ?? EMPTY_CHATS;

    // Bottom tabs keep this screen mounted, so useQuery's refetchOnMount doesn't
    // fire on tab-swap. Explicit refetch when the query is stale (>30s) mirrors
    // the semantics the manual load() had.
    useFocusEffect(useCallback(() => {
        if (!user?.id) return;
        const stamp = chatsQuery.dataUpdatedAt;
        if (!stamp || Date.now() - stamp > 30_000) {
            chatsQuery.refetch();
        }
    }, [user?.id, chatsQuery.refetch, chatsQuery.dataUpdatedAt]));

    const onRefresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['direct-chats'] });
    }, [queryClient]);

    if (chatsQuery.isPending && chats.length === 0) return <Loading />;

    return (
        <FlatList
            data={chats}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
            ListHeaderComponent={
                <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Search chats..."
                />
            }
            refreshControl={
                <RefreshControl
                    // isFetching (not isPending) so pull-to-refresh spins for background
                    // refetches too, not just the very first load.
                    refreshing={chatsQuery.isFetching}
                    onRefresh={onRefresh}
                    tintColor="#10B981"
                />
            }
            ListEmptyComponent={
                <EmptyState
                    icon="chatbubbles-outline"
                    title={search ? "No chats matched" : "No chats yet"}
                    subtitle="Open a friend's profile and tap message to get started"
                />
            }
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => {
                const unread = item.unreadCount > 0;
                const fromMe = !!user?.id && item.lastMessageSenderId === user.id;
                return (
                    <CardSurface
                        highlight={unread}
                        onPress={() => navigation.navigate('DirectChat', {
                            chatId: item.id,
                            header: {
                                otherUserId: item.otherUserId,
                                otherUsername: item.otherUsername,
                                otherNickname: item.otherNickname,
                                otherAvatarUrl: item.otherAvatarUrl,
                            },
                        })}
                    >
                        <View className="flex-row items-center p-3.5">
                            <View>
                                <RingAvatar
                                    src={item.otherAvatarUrl ?? undefined}
                                    name={item.otherUsername}
                                    ringColor={unread ? 'rgba(16,185,129,0.55)' : 'rgba(255,255,255,0.10)'}
                                />
                                {unread && (
                                    <View
                                        style={{
                                            position: 'absolute', top: -3, right: -3,
                                            backgroundColor: '#10B981',
                                            minWidth: 18, height: 18, borderRadius: 999,
                                            paddingHorizontal: 4,
                                            alignItems: 'center', justifyContent: 'center',
                                            borderWidth: 2, borderColor: '#0F172A',
                                        }}
                                    >
                                        <Text style={{ color: '#0F172A', fontWeight: '900', fontSize: 9 }}>
                                            {item.unreadCount > 99 ? '99+' : item.unreadCount}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <View className="flex-1 ml-3.5">
                                <View className="flex-row items-center justify-between">
                                    <Text className="text-white font-black text-[15px] tracking-tight flex-1" numberOfLines={1}>
                                        {item.otherUsername}
                                    </Text>
                                    {item.lastMessageAt && (
                                        <Text className={cn('text-[10px] font-bold ml-2', unread ? 'text-emerald-400' : 'text-slate-600')}>
                                            {formatChatTime(item.lastMessageAt)}
                                        </Text>
                                    )}
                                </View>
                                {item.lastMessage ? (
                                    <Text
                                        className={cn('text-[12.5px] mt-1', unread ? 'text-slate-100 font-semibold' : 'text-slate-500 font-medium')}
                                        numberOfLines={1}
                                    >
                                        {fromMe ? <Text className="text-slate-500 font-medium">You: </Text> : null}
                                        {item.lastMessage}
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                    </CardSurface>
                );
            }}
        />
    );
}

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

function SearchBar({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
}) {
    const active = value.length > 0;
    return (
        <View className="mb-3 mt-1">
            <View
                className="flex-row items-center px-3.5"
                style={{
                    height: 48,
                    borderRadius: 16,
                    backgroundColor: '#131B2E',
                    borderWidth: 1,
                    borderColor: active ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)',
                }}
            >
                <Ionicons name="search" size={17} color={active ? '#10B981' : '#475569'} />
                <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder={placeholder}
                    placeholderTextColor="#475569"
                    className="flex-1 ml-2.5 text-white text-sm font-medium"
                    style={{ height: 48 }}
                />
                {active && (
                    <Pressable onPress={() => onChange('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={17} color="#64748B" />
                    </Pressable>
                )}
            </View>
        </View>
    );
}

function EmptyState({
    icon,
    title,
    subtitle,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
}) {
    return (
        <View className="items-center mt-24 px-6">
            <View
                style={{
                    width: 72, height: 72, borderRadius: 24,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(16,185,129,0.06)',
                    borderWidth: 1, borderColor: 'rgba(16,185,129,0.14)',
                }}
            >
                <Ionicons name={icon} size={30} color="#10B981" />
            </View>
            <Text className="text-white font-black text-base mt-4 mb-1">{title}</Text>
            <Text className="text-slate-500 text-xs text-center font-medium leading-5">{subtitle}</Text>
        </View>
    );
}

function Loading() {
    return (
        <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#10B981" />
        </View>
    );
}

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
function formatChatTime(iso: string): string {
    const d = parseUtcDate(iso);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 86400000;
    const t = d.getTime();
    if (t >= startOfToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (t >= startOfToday - dayMs) return 'Yesterday';
    if (t >= startOfToday - 6 * dayMs) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function monthYear(iso?: string): string {
    if (!iso) return '';
    return parseUtcDate(iso).toLocaleDateString([], { month: 'short', year: 'numeric' });
}

// Premium card chrome shared across all Social rows: soft gradient, hairline
// border, lift shadow. `highlight` gives unread chats an emerald accent + edge strip.
function CardSurface({
    onPress,
    children,
    highlight = false,
}: {
    onPress?: () => void;
    children: React.ReactNode;
    highlight?: boolean;
}) {
    const surface = (
        <View
            style={{
                borderRadius: 20,
                overflow: 'hidden',
                backgroundColor: '#131B2E',
                borderWidth: 1,
                borderColor: highlight ? 'rgba(16,185,129,0.20)' : 'rgba(255,255,255,0.06)',
                shadowColor: highlight ? '#10B981' : '#000',
                shadowOpacity: highlight ? 0.15 : 0.18,
                shadowRadius: highlight ? 10 : 7,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
            }}
        >
            <LinearGradient
                colors={highlight ? ['rgba(16,185,129,0.10)', 'transparent'] : ['rgba(255,255,255,0.04)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.8, y: 0.7 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            {highlight && (
                <View
                    style={{
                        position: 'absolute', left: 0, top: 12, bottom: 12, width: 3,
                        backgroundColor: '#10B981',
                        borderTopRightRadius: 3, borderBottomRightRadius: 3,
                    }}
                />
            )}
            {children}
        </View>
    );
    if (!onPress) return surface;
    return (
        <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            {surface}
        </Pressable>
    );
}

// Avatar wrapped in a subtle ring (emerald when emphasised). PlayerAvatar's own
// border is dropped so the ring reads as a single clean band.
function RingAvatar({
    src,
    name,
    ringColor = 'rgba(255,255,255,0.10)',
}: {
    src?: string;
    name: string;
    ringColor?: string;
}) {
    return (
        <View style={{ borderRadius: 999, padding: 2, borderWidth: 1.5, borderColor: ringColor }}>
            <PlayerAvatar src={src} name={name} size="md" className="border-0" />
        </View>
    );
}

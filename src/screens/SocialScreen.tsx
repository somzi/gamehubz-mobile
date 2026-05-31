import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { Friend, FriendRequest, DirectChat } from '../types/social';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';

type TabKey = 'friends' | 'requests' | 'chats';
type NavProp = StackNavigationProp<RootStackParamList>;
type SocialRoute = RouteProp<MainTabParamList, 'Social'>;

const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'friends', label: 'Friends', icon: 'people' },
    { key: 'requests', label: 'Requests', icon: 'person-add' },
    { key: 'chats', label: 'Chats', icon: 'chatbubble-ellipses' },
];

export default function SocialScreen() {
    const navigation = useNavigation<NavProp>();
    const route = useRoute<SocialRoute>();
    const [activeTab, setActiveTab] = useState<TabKey>(route.params?.initialTab ?? 'friends');

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
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text className="text-white text-2xl font-black tracking-tight">Social</Text>
                        <Text className="text-slate-500 text-xs font-medium mt-0.5">
                            Stay connected with your gaming circle
                        </Text>
                    </View>
                    <Pressable
                        onPress={() => navigation.navigate('Notifications')}
                        className="w-10 h-10 rounded-2xl items-center justify-center bg-white/5 border border-white/10"
                    >
                        <Ionicons name="notifications-outline" size={20} color="#FAFAFA" />
                    </Pressable>
                </View>
            </View>

            {/* ─── Segmented Tabs ──────────────────────────────── */}
            <View className="px-5 mb-3">
                <View
                    className="flex-row bg-[#131B2E] rounded-2xl border border-white/[0.06] p-1"
                    style={{ gap: 4 }}
                >
                    {tabs.map((t) => {
                        const isActive = activeTab === t.key;
                        return (
                            <Pressable
                                key={t.key}
                                onPress={() => setActiveTab(t.key)}
                                className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl ${
                                    isActive ? 'bg-emerald-500/15 border border-emerald-500/25' : ''
                                }`}
                                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                            >
                                <Ionicons name={t.icon} size={14} color={isActive ? '#10B981' : '#475569'} />
                                <Text
                                    className={`text-xs font-black ${
                                        isActive ? 'text-white' : 'text-slate-600'
                                    }`}
                                >
                                    {t.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
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

    const load = useCallback(async (q: string = '') => {
        try {
            const res = await authenticatedFetch(ENDPOINTS.GET_FRIENDS(q));
            if (res.ok) {
                const data = await res.json();
                setFriends(Array.isArray(data) ? data : []);
                setError(null);
            } else {
                setError('Failed to load friends');
            }
        } catch (e: any) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(search); }, [load]));

    // debounced search
    useEffect(() => {
        const t = setTimeout(() => { load(search); }, 300);
        return () => clearTimeout(t);
    }, [search, load]);

    const openChat = async (friend: Friend) => {
        navigation.navigate('DirectChat', { otherUserId: friend.userId });
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
                <Pressable
                    onPress={() => navigation.navigate('PlayerProfile', { id: item.userId })}
                    className="bg-[#131B2E] rounded-2xl p-3 flex-row items-center border border-white/[0.04]"
                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                >
                    <PlayerAvatar src={item.avatarUrl ?? undefined} name={item.username} size="md" />
                    <View className="flex-1 ml-3">
                        <Text className="text-white font-black text-sm" numberOfLines={1}>
                            {item.username}
                        </Text>
                        {item.nickname ? (
                            <Text className="text-slate-500 text-[11px] font-medium mt-0.5" numberOfLines={1}>
                                {item.nickname}
                            </Text>
                        ) : null}
                    </View>
                    <Pressable
                        onPress={() => openChat(item)}
                        className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center"
                        hitSlop={8}
                    >
                        <Ionicons name="chatbubble-ellipses" size={16} color="#10B981" />
                    </Pressable>
                </Pressable>
            )}
        />
    );
}

// ═════════════════════════════════════════════════════════════════════
// REQUESTS TAB (incoming + outgoing)
// ═════════════════════════════════════════════════════════════════════

function RequestsTab() {
    const [subTab, setSubTab] = useState<'incoming' | 'outgoing'>('incoming');
    const [incoming, setIncoming] = useState<FriendRequest[]>([]);
    const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (q: string = '') => {
        try {
            const [inRes, outRes] = await Promise.all([
                authenticatedFetch(ENDPOINTS.GET_INCOMING_REQUESTS(q)),
                authenticatedFetch(ENDPOINTS.GET_OUTGOING_REQUESTS(q)),
            ]);
            if (inRes.ok) setIncoming(await inRes.json());
            if (outRes.ok) setOutgoing(await outRes.json());
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(search); }, [load]));

    useEffect(() => {
        const t = setTimeout(() => { load(search); }, 300);
        return () => clearTimeout(t);
    }, [search, load]);

    const accept = async (req: FriendRequest) => {
        try {
            await authenticatedFetch(ENDPOINTS.ACCEPT_FRIEND_REQUEST(req.id), { method: 'POST' });
            setIncoming((prev) => prev.filter((r) => r.id !== req.id));
        } catch { /* ignore */ }
    };

    const reject = async (req: FriendRequest) => {
        try {
            await authenticatedFetch(ENDPOINTS.REJECT_FRIEND_REQUEST(req.id), { method: 'POST' });
            setIncoming((prev) => prev.filter((r) => r.id !== req.id));
        } catch { /* ignore */ }
    };

    const cancel = async (req: FriendRequest) => {
        try {
            await authenticatedFetch(ENDPOINTS.CANCEL_FRIEND_REQUEST(req.id), { method: 'POST' });
            setOutgoing((prev) => prev.filter((r) => r.id !== req.id));
        } catch { /* ignore */ }
    };

    if (loading) return <Loading />;

    const list = subTab === 'incoming' ? incoming : outgoing;

    return (
        <View className="flex-1">
            <View className="px-5 mb-2">
                <View className="flex-row bg-white/[0.03] rounded-xl p-1" style={{ gap: 2 }}>
                    {(['incoming', 'outgoing'] as const).map((k) => {
                        const isActive = subTab === k;
                        const count = k === 'incoming' ? incoming.length : outgoing.length;
                        return (
                            <Pressable
                                key={k}
                                onPress={() => setSubTab(k)}
                                className={`flex-1 py-2 rounded-lg flex-row items-center justify-center ${
                                    isActive ? 'bg-emerald-500/15' : ''
                                }`}
                                style={{ gap: 6 }}
                            >
                                <Text
                                    className={`text-[11px] font-bold uppercase tracking-wider ${
                                        isActive ? 'text-emerald-400' : 'text-slate-500'
                                    }`}
                                >
                                    {k}
                                </Text>
                                {count > 0 && (
                                    <View
                                        className={`px-1.5 rounded-full min-w-[18px] items-center ${
                                            isActive ? 'bg-emerald-500/30' : 'bg-white/10'
                                        }`}
                                    >
                                        <Text
                                            className={`text-[10px] font-black ${
                                                isActive ? 'text-white' : 'text-slate-400'
                                            }`}
                                        >
                                            {count}
                                        </Text>
                                    </View>
                                )}
                            </Pressable>
                        );
                    })}
                </View>
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
                        <View className="bg-[#131B2E] rounded-2xl p-3 border border-white/[0.04]">
                            <View className="flex-row items-center">
                                <PlayerAvatar
                                    src={avatarUrl ?? undefined}
                                    name={username}
                                    size="md"
                                />
                                <View className="flex-1 ml-3">
                                    <Text className="text-white font-black text-sm" numberOfLines={1}>
                                        {username}
                                    </Text>
                                    <Text className="text-slate-500 text-[11px] mt-0.5">
                                        {isIncoming ? 'Wants to be your friend' : 'Request sent'}
                                    </Text>
                                </View>
                            </View>
                            <View className="flex-row mt-3" style={{ gap: 8 }}>
                                {isIncoming ? (
                                    <>
                                        <Pressable
                                            onPress={() => accept(item)}
                                            className="flex-1 bg-emerald-500 py-2.5 rounded-xl items-center"
                                            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                        >
                                            <Text className="text-white font-black text-xs">Accept</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => reject(item)}
                                            className="flex-1 bg-white/5 border border-white/10 py-2.5 rounded-xl items-center"
                                            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                        >
                                            <Text className="text-slate-300 font-black text-xs">Decline</Text>
                                        </Pressable>
                                    </>
                                ) : (
                                    <Pressable
                                        onPress={() => cancel(item)}
                                        className="flex-1 bg-white/5 border border-white/10 py-2.5 rounded-xl items-center"
                                        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                                    >
                                        <Text className="text-slate-300 font-black text-xs">Cancel request</Text>
                                    </Pressable>
                                )}
                            </View>
                        </View>
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
    const [chats, setChats] = useState<DirectChat[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (q: string = '') => {
        try {
            const res = await authenticatedFetch(ENDPOINTS.GET_DIRECT_CHATS(q));
            if (res.ok) {
                const data = await res.json();
                setChats(Array.isArray(data) ? data : []);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(search); }, [load]));

    useEffect(() => {
        const t = setTimeout(() => { load(search); }, 300);
        return () => clearTimeout(t);
    }, [search, load]);

    if (loading) return <Loading />;

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
                    refreshing={refreshing}
                    onRefresh={() => { setRefreshing(true); load(search); }}
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
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => (
                <Pressable
                    onPress={() => navigation.navigate('DirectChat', { chatId: item.id })}
                    className="bg-[#131B2E] rounded-2xl p-3 flex-row items-center border border-white/[0.04]"
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                    <View>
                        <PlayerAvatar
                            src={item.otherAvatarUrl ?? undefined}
                            name={item.otherUsername}
                            size="md"
                        />
                        {item.unreadCount > 0 && (
                            <View
                                className="absolute -top-1 -right-1 bg-emerald-500 px-1.5 rounded-full min-w-[18px] items-center border-2 border-[#0F172A]"
                                style={{ paddingVertical: 1 }}
                            >
                                <Text className="text-white font-black text-[9px]">
                                    {item.unreadCount > 99 ? '99+' : item.unreadCount}
                                </Text>
                            </View>
                        )}
                    </View>
                    <View className="flex-1 ml-3 mr-2">
                        <View className="flex-row items-center justify-between">
                            <Text className="text-white font-black text-sm flex-1" numberOfLines={1}>
                                {item.otherUsername}
                            </Text>
                            {item.lastMessageAt && (
                                <Text className="text-slate-600 text-[10px] font-bold ml-2">
                                    {formatRelative(item.lastMessageAt)}
                                </Text>
                            )}
                        </View>
                        <Text
                            className={`text-[12px] mt-0.5 ${
                                item.unreadCount > 0 ? 'text-slate-200 font-bold' : 'text-slate-500 font-medium'
                            }`}
                            numberOfLines={1}
                        >
                            {item.lastMessage ?? 'Say hi 👋'}
                        </Text>
                    </View>
                </Pressable>
            )}
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
    return (
        <View className="mb-3 mt-1">
            <View
                className="flex-row items-center bg-[#131B2E] rounded-xl border border-white/[0.06] px-3"
                style={{ height: 44 }}
            >
                <Ionicons name="search" size={16} color="#475569" />
                <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder={placeholder}
                    placeholderTextColor="#475569"
                    className="flex-1 ml-2 text-white text-sm"
                    style={{ height: 44 }}
                />
                {value.length > 0 && (
                    <Pressable onPress={() => onChange('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color="#475569" />
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
        <View className="items-center mt-20 px-6">
            <View className="w-16 h-16 rounded-2xl bg-white/[0.03] items-center justify-center mb-4">
                <Ionicons name={icon} size={28} color="#1E293B" />
            </View>
            <Text className="text-white font-black text-base mb-1">{title}</Text>
            <Text className="text-slate-500 text-xs text-center font-medium">{subtitle}</Text>
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

function formatRelative(iso: string): string {
    try {
        const date = new Date(iso);
        const now = new Date();
        const diff = (now.getTime() - date.getTime()) / 1000;
        if (diff < 60) return 'now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
        return date.toLocaleDateString();
    } catch {
        return '';
    }
}

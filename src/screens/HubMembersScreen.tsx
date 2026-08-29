import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types/navigation';
import { HubRole } from '../types/hub';
import { PageHeader } from '../components/layout/PageHeader';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { formatDateSafe } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { COLORS } from '../lib/theme';
import { ActionSheetModal, type ActionSheetAction } from '../components/modals/ActionSheetModal';

type HubMembersScreenRouteProp = RouteProp<RootStackParamList, 'HubMembers'>;

interface JoinRequest {
    requestId: string;
    userId: string;
    hubId: string;
    username: string;
    avatarUrl?: string;
    requestedAt: string;
}

interface MemberRow {
    userId: string;
    username: string;
    nickname?: string;
    avatarUrl?: string;
    hubRole: HubRole;
}

interface BannedRow {
    userId: string;
    username: string;
    avatarUrl?: string;
    bannedAt?: string;
}

const ROLE_META: Record<HubRole, { label: string; container: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
    [HubRole.HubOwner]: {
        label: 'Owner',
        container: 'bg-amber-500/15 border border-amber-500/30',
        text: 'text-amber-400',
        icon: 'shield-checkmark',
    },
    [HubRole.HubAdmin]: {
        label: 'Admin',
        container: 'bg-indigo-500/15 border border-indigo-500/30',
        text: 'text-indigo-300',
        icon: 'star',
    },
    [HubRole.HubExclusive]: {
        label: 'Exclusive',
        container: 'bg-fuchsia-500/15 border border-fuchsia-500/30',
        text: 'text-fuchsia-300',
        icon: 'sparkles',
    },
    [HubRole.HubMember]: {
        label: 'Member',
        container: 'bg-white/[0.05] border border-white/10',
        text: 'text-slate-400',
        icon: 'person',
    },
};

function normalizeMember(raw: any): MemberRow | null {
    const userId = raw.UserId || raw.userId || raw.id || raw.Id;
    if (!userId) return null;
    const username = raw.Username || raw.username || raw.Name || raw.name || 'Unknown';
    const nickname = raw.Nickname || raw.nickname || raw.nickName || '';
    const avatarUrl = raw.AvatarUrl || raw.avatarUrl || undefined;
    const role = raw.HubRole ?? raw.hubRole ?? HubRole.HubMember;
    return { userId, username, nickname, avatarUrl, hubRole: role as HubRole };
}

function RoleBadge({ role }: { role: HubRole }) {
    const meta = ROLE_META[role] ?? ROLE_META[HubRole.HubMember];
    return (
        <View className={`flex-row items-center px-2 py-1 rounded-full ${meta.container}`} style={{ gap: 4 }}>
            <Ionicons name={meta.icon} size={11} color={
                role === HubRole.HubOwner ? '#FBBF24'
                    : role === HubRole.HubAdmin ? '#A5B4FC'
                        : role === HubRole.HubExclusive ? '#E879F9'
                            : '#94A3B8'
            } />
            <Text className={`text-[10px] font-black uppercase tracking-wide ${meta.text}`}>
                {meta.label}
            </Text>
        </View>
    );
}

export default function HubMembersScreen() {
    const route = useRoute<HubMembersScreenRouteProp>();
    const { hubId } = route.params;
    const { user: currentUser } = useAuth();

    const [activeTab, setActiveTab] = useState<'members' | 'requests' | 'blacklisted'>('members');
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [bans, setBans] = useState<BannedRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRequestsLoading, setIsRequestsLoading] = useState(false);
    const [isBansLoading, setIsBansLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const [isOwner, setIsOwner] = useState(false);
    const [actionMember, setActionMember] = useState<MemberRow | null>(null);

    const fetchHubMeta = useCallback(async () => {
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB(hubId));
            if (response.ok) {
                const data = await response.json();
                const hub = data.result || data;
                setIsOwner(!!(hub.isUserOwner || hub.IsUserOwner));
            }
        } catch (error) {
            console.error('Error fetching hub meta:', error);
        }
    }, [hubId]);

    const markProcessing = (id: string, on: boolean) => {
        setProcessingIds(prev => {
            const next = new Set(prev);
            if (on) next.add(id); else next.delete(id);
            return next;
        });
    };

    const fetchMembers = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_MEMBERS(hubId));
            if (response.ok) {
                const data = await response.json();
                const raw = data.result || data || [];
                const normalized = (Array.isArray(raw) ? raw : []).map(normalizeMember).filter(Boolean) as MemberRow[];
                // Backend can return the same user twice (e.g. the owner also listed as a plain
                // member), which crashes the FlatList with duplicate keys (keyExtractor = userId).
                // Dedupe by userId, keeping the most-privileged role on collision.
                const rolePriority: Record<number, number> = {
                    [HubRole.HubOwner]: 0,
                    [HubRole.HubAdmin]: 1,
                    [HubRole.HubExclusive]: 2,
                    [HubRole.HubMember]: 3,
                };
                const byUser = new Map<string, MemberRow>();
                for (const m of normalized) {
                    const key = m.userId.toLowerCase();
                    const existing = byUser.get(key);
                    if (!existing || (rolePriority[m.hubRole] ?? 99) < (rolePriority[existing.hubRole] ?? 99)) {
                        byUser.set(key, m);
                    }
                }
                setMembers(Array.from(byUser.values()));
            }
        } catch (error) {
            console.error('Error fetching hub members:', error);
        } finally {
            setIsLoading(false);
        }
    }, [hubId]);

    const fetchRequests = useCallback(async () => {
        try {
            setIsRequestsLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_JOIN_REQUESTS(hubId));
            if (response.ok) {
                const data = await response.json();
                setRequests(data.result || data || []);
            }
        } catch (error) {
            console.error('Error fetching join requests:', error);
        } finally {
            setIsRequestsLoading(false);
        }
    }, [hubId]);

    const fetchBans = useCallback(async () => {
        try {
            setIsBansLoading(true);
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_BANS(hubId));
            if (response.ok) {
                const data = await response.json();
                const raw: any[] = Array.isArray(data) ? data : (data.result || []);
                const normalized: BannedRow[] = raw.map(b => ({
                    userId: b.userId || b.UserId,
                    username: b.username || b.Username || 'Unknown',
                    avatarUrl: b.avatarUrl || b.AvatarUrl,
                    bannedAt: b.bannedAt || b.BannedAt,
                })).filter(b => !!b.userId);
                setBans(normalized);
            }
        } catch (error) {
            console.error('Error fetching hub bans:', error);
        } finally {
            setIsBansLoading(false);
        }
    }, [hubId]);

    useFocusEffect(
        useCallback(() => {
            fetchHubMeta();
            fetchMembers();
            fetchRequests();
            fetchBans();
        }, [fetchHubMeta, fetchMembers, fetchRequests, fetchBans])
    );

    const changeRole = async (member: MemberRow, newRole: HubRole) => {
        markProcessing(member.userId, true);
        try {
            const response = await authenticatedFetch(
                ENDPOINTS.CHANGE_HUB_MEMBER_ROLE(hubId, member.userId),
                {
                    method: 'PUT',
                    body: JSON.stringify({ role: newRole }),
                }
            );
            if (response.ok) {
                setMembers(prev =>
                    prev.map(m => (m.userId === member.userId ? { ...m, hubRole: newRole } : m))
                );
            } else {
                const text = await response.text();
                Alert.alert('Error', getErrorMessage(text) || 'Failed to update role.');
            }
        } catch (error) {
            Alert.alert('Error', getErrorMessage(error));
        } finally {
            markProcessing(member.userId, false);
        }
    };

    // Hands the hub over: the target becomes Owner and the current owner drops to Admin. Confirmed
    // in two steps because the caller cannot undo it afterwards — only the new owner can transfer back.
    const transferOwnership = (member: MemberRow) => {
        Alert.alert(
            'Transfer Ownership',
            `Make ${member.username} the owner of this hub?

`
            + 'You will stay on as an admin. Only the new owner will be able to transfer the hub, '
            + 'edit its details or delete it.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Transfer',
                    style: 'destructive',
                    onPress: async () => {
                        markProcessing(member.userId, true);
                        try {
                            const response = await authenticatedFetch(
                                ENDPOINTS.TRANSFER_HUB_OWNERSHIP(hubId),
                                {
                                    method: 'POST',
                                    body: JSON.stringify({ userId: member.userId }),
                                }
                            );
                            if (response.ok) {
                                // The viewer is no longer the owner, so re-read both the hub meta
                                // (drops the owner-only controls) and the member list (new badges).
                                await Promise.all([fetchHubMeta(), fetchMembers()]);
                                Alert.alert('Ownership transferred', `${member.username} now owns this hub.`);
                            } else {
                                const text = await response.text();
                                Alert.alert('Error', getErrorMessage(text) || 'Failed to transfer ownership.');
                            }
                        } catch (error) {
                            Alert.alert('Error', getErrorMessage(error));
                        } finally {
                            markProcessing(member.userId, false);
                        }
                    },
                },
            ]
        );
    };

    const removeMember = (member: MemberRow) => {
        Alert.alert(
            'Remove Member',
            `Remove ${member.username} from the hub? They will be able to join again.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        markProcessing(member.userId, true);
                        try {
                            const response = await authenticatedFetch(
                                ENDPOINTS.REMOVE_HUB_MEMBER(hubId, member.userId),
                                { method: 'DELETE' }
                            );
                            if (response.ok) {
                                setMembers(prev => prev.filter(m => m.userId !== member.userId));
                            } else {
                                const text = await response.text();
                                Alert.alert('Error', getErrorMessage(text) || 'Failed to remove member.');
                            }
                        } catch (error) {
                            Alert.alert('Error', getErrorMessage(error));
                        } finally {
                            markProcessing(member.userId, false);
                        }
                    },
                },
            ]
        );
    };

    const banMember = (member: MemberRow) => {
        Alert.alert(
            'Ban Member',
            `Ban ${member.username} from the hub? They will no longer be able to join or send requests.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Ban',
                    style: 'destructive',
                    onPress: async () => {
                        markProcessing(member.userId, true);
                        try {
                            const response = await authenticatedFetch(
                                ENDPOINTS.BAN_HUB_MEMBER(hubId, member.userId),
                                { method: 'POST' }
                            );
                            if (response.ok) {
                                setMembers(prev => prev.filter(m => m.userId !== member.userId));
                                fetchBans();
                            } else {
                                const text = await response.text();
                                Alert.alert('Error', getErrorMessage(text) || 'Failed to ban member.');
                            }
                        } catch (error) {
                            Alert.alert('Error', getErrorMessage(error));
                        } finally {
                            markProcessing(member.userId, false);
                        }
                    },
                },
            ]
        );
    };

    const unbanMember = (ban: BannedRow) => {
        Alert.alert(
            'Unban Member',
            `Lift the ban on ${ban.username}? They will be able to join the hub again.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Unban',
                    onPress: async () => {
                        markProcessing(ban.userId, true);
                        try {
                            const response = await authenticatedFetch(
                                ENDPOINTS.UNBAN_HUB_MEMBER(hubId, ban.userId),
                                { method: 'DELETE' }
                            );
                            if (response.ok) {
                                setBans(prev => prev.filter(b => b.userId !== ban.userId));
                            } else {
                                const text = await response.text();
                                Alert.alert('Error', getErrorMessage(text) || 'Failed to unban user.');
                            }
                        } catch (error) {
                            Alert.alert('Error', getErrorMessage(error));
                        } finally {
                            markProcessing(ban.userId, false);
                        }
                    },
                },
            ]
        );
    };

    // Actions for the in-app sheet (replaces the old native Alert action list).
    // Icons mirror ROLE_META — the icon shows the TARGET role of the change.
    const memberSheetActions = (member: MemberRow): ActionSheetAction[] => {
        const actions: ActionSheetAction[] = [];

        // Only the Owner can grant/revoke elevated roles (admin / exclusive). Same test the row
        // gate uses (canManageMember) — the `isOwner` flag alone lags behind the hub-meta fetch,
        // which left an owner with a sheet offering nothing but "Remove from hub".
        if (viewerIsOwner) {
            if (member.hubRole === HubRole.HubMember) {
                actions.push({
                    label: 'Promote to admin',
                    icon: 'star-outline',
                    onPress: () => changeRole(member, HubRole.HubAdmin),
                });
                actions.push({
                    label: 'Promote to exclusive',
                    icon: 'sparkles-outline',
                    onPress: () => changeRole(member, HubRole.HubExclusive),
                });
            } else if (member.hubRole === HubRole.HubExclusive) {
                actions.push({
                    label: 'Promote to admin',
                    icon: 'star-outline',
                    onPress: () => changeRole(member, HubRole.HubAdmin),
                });
                actions.push({
                    label: 'Demote to member',
                    icon: 'person-outline',
                    onPress: () => changeRole(member, HubRole.HubMember),
                });
            } else if (member.hubRole === HubRole.HubAdmin) {
                actions.push({
                    label: 'Demote to exclusive',
                    icon: 'sparkles-outline',
                    onPress: () => changeRole(member, HubRole.HubExclusive),
                });
                actions.push({
                    label: 'Demote to member',
                    icon: 'person-outline',
                    onPress: () => changeRole(member, HubRole.HubMember),
                });
            }

            // Marked destructive: it is the one action here the owner cannot take back.
            actions.push({
                label: 'Transfer ownership',
                icon: 'key-outline',
                destructive: true,
                onPress: () => transferOwnership(member),
            });
        }

        actions.push({
            label: 'Remove from hub',
            icon: 'person-remove-outline',
            destructive: true,
            onPress: () => removeMember(member),
        });
        actions.push({
            label: 'Ban from hub',
            icon: 'ban-outline',
            destructive: true,
            onPress: () => banMember(member),
        });

        return actions;
    };

    const openMemberActions = (member: MemberRow) => setActionMember(member);

    const handleApprove = async (requestId: string, username: string) => {
        markProcessing(requestId, true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.APPROVE_HUB_JOIN_REQUEST(requestId), {
                method: 'POST',
            });
            if (response.ok) {
                setRequests(prev => prev.filter(r => r.requestId !== requestId));
                fetchMembers();
            } else {
                Alert.alert('Error', `Failed to approve request from ${username}.`);
            }
        } catch (error) {
            Alert.alert('Error', 'An unexpected error occurred.');
        } finally {
            markProcessing(requestId, false);
        }
    };

    const handleReject = (requestId: string, username: string) => {
        Alert.alert(
            'Reject Request',
            `Reject join request from ${username}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: async () => {
                        markProcessing(requestId, true);
                        try {
                            const response = await authenticatedFetch(ENDPOINTS.REJECT_HUB_JOIN_REQUEST(requestId), {
                                method: 'POST',
                            });
                            if (response.ok) {
                                setRequests(prev => prev.filter(r => r.requestId !== requestId));
                            } else {
                                Alert.alert('Error', 'Failed to reject request.');
                            }
                        } catch (error) {
                            Alert.alert('Error', 'An unexpected error occurred.');
                        } finally {
                            markProcessing(requestId, false);
                        }
                    },
                },
            ]
        );
    };

    const filteredMembers = members.filter(m =>
        m.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredRequests = requests.filter(r =>
        r.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredBans = bans.filter(b =>
        b.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const adminCount = members.filter(m => m.hubRole === HubRole.HubAdmin).length;

    // The viewer's own role within this hub (drives what actions they may take).
    const currentUserRole = members.find(m => m.userId === currentUser?.id)?.hubRole;
    const viewerIsOwner = isOwner || currentUserRole === HubRole.HubOwner;
    const viewerIsAdmin = currentUserRole === HubRole.HubAdmin;

    // The owner can manage every other member. An admin can only manage regular and
    // exclusive members — never the owner or another admin.
    const canManageMember = (member: MemberRow): boolean => {
        if (member.userId === currentUser?.id) return false;     // never self
        if (member.hubRole === HubRole.HubOwner) return false;   // owner is untouchable
        if (viewerIsOwner) return true;
        if (viewerIsAdmin) return member.hubRole !== HubRole.HubAdmin;
        return false;
    };

    const tabs: PremiumTabItem[] = [
        { value: 'members', label: 'Members', icon: 'people-outline', badge: members.length > 0 ? members.length : undefined },
        { value: 'requests', label: 'Requests', icon: 'mail-outline', badge: requests.length > 0 ? requests.length : undefined },
        { value: 'blacklisted', label: 'Banned', icon: 'ban-outline', badge: bans.length > 0 ? bans.length : undefined },
    ];

    const searchPlaceholder =
        activeTab === 'members' ? 'Search members...'
            : activeTab === 'requests' ? 'Search requests...'
                : 'Search blacklisted...';

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title="Hub Members" showBack />

            {/* Tabs */}
            <View className="px-4 pt-2 pb-1">
                <PremiumTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={(v) => setActiveTab(v as 'members' | 'requests' | 'blacklisted')}
                />
            </View>

            {activeTab === 'members' && adminCount > 0 && (
                <View className="px-4 pt-2">
                    <Text className="text-[11px] text-slate-500">
                        {adminCount} {adminCount === 1 ? 'admin' : 'admins'} · {members.length} total
                    </Text>
                </View>
            )}

            <View className="px-4 py-2">
                <View className="flex-row items-center bg-card px-3 rounded-xl border border-white/5">
                    <Ionicons name="search-outline" size={20} color="#71717A" />
                    <TextInput
                        className="flex-1 h-12 text-white ml-2"
                        placeholder={searchPlaceholder}
                        placeholderTextColor="#71717A"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {activeTab === 'members' && (
                isLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color={COLORS.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={filteredMembers}
                        keyExtractor={(item) => item.userId}
                        className="flex-1 px-4"
                        contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
                        removeClippedSubviews
                        renderItem={({ item: member }) => {
                            const isSelf = member.userId === currentUser?.id;
                            const isProcessing = processingIds.has(member.userId);
                            return (
                                <View className="flex-row items-center justify-between py-3.5 border-b border-white/5">
                                    <View className="flex-row items-center flex-1 mr-2" style={{ gap: 12 }}>
                                        <PlayerAvatar name={member.username} src={member.avatarUrl} size="md" />
                                        <View className="flex-1">
                                            <View className="flex-row items-center" style={{ gap: 8 }}>
                                                <Text className="text-white font-semibold text-base" numberOfLines={1}>
                                                    {member.username}
                                                </Text>
                                                {isSelf && (
                                                    <Text className="text-[10px] font-black uppercase text-slate-500">
                                                        You
                                                    </Text>
                                                )}
                                            </View>
                                            <View className="flex-row items-center mt-1" style={{ gap: 6 }}>
                                                <RoleBadge role={member.hubRole} />
                                                {member.nickname ? (
                                                    <Text className="text-slate-500 text-xs" numberOfLines={1}>
                                                        {member.nickname}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </View>
                                    </View>

                                    {canManageMember(member) && (
                                        isProcessing ? (
                                            <View className="w-10 h-10 items-center justify-center">
                                                <ActivityIndicator size="small" color="#818CF8" />
                                            </View>
                                        ) : (
                                            <Pressable
                                                onPress={() => openMemberActions(member)}
                                                className="w-10 h-10 rounded-xl items-center justify-center bg-white/[0.03] border border-white/[0.06]"
                                                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                                                hitSlop={8}
                                            >
                                                <Ionicons name="ellipsis-horizontal" size={18} color="#94A3B8" />
                                            </Pressable>
                                        )
                                    )}
                                </View>
                            );
                        }}
                        ListEmptyComponent={
                            <View className="items-center py-20 opacity-30">
                                <Ionicons name="people-outline" size={64} color="white" />
                                <Text className="text-white mt-4">No members found</Text>
                            </View>
                        }
                    />
                )
            )}

            {activeTab === 'requests' && (
                isRequestsLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#818CF8" />
                    </View>
                ) : (
                    <FlatList
                        data={filteredRequests}
                        keyExtractor={(item) => item.requestId}
                        className="flex-1 px-4"
                        contentContainerStyle={{ flexGrow: 1 }}
                        removeClippedSubviews
                        renderItem={({ item: request }) => {
                            const isProcessing = processingIds.has(request.requestId);
                            return (
                                <View className="flex-row items-center justify-between py-4 border-b border-white/5">
                                    <View className="flex-row items-center gap-3 flex-1 mr-2">
                                        <PlayerAvatar name={request.username} src={request.avatarUrl} size="md" />
                                        <View className="flex-1">
                                            <Text className="text-white font-medium text-base" numberOfLines={1}>
                                                {request.username}
                                            </Text>
                                            <Text className="text-slate-500 text-xs">
                                                Requested {formatDateSafe(request.requestedAt, 'recently')}
                                            </Text>
                                        </View>
                                    </View>

                                    <View className="flex-row gap-2">
                                        <Pressable
                                            onPress={() => handleApprove(request.requestId, request.username)}
                                            disabled={isProcessing}
                                            className="bg-emerald-500/15 border border-emerald-500/30 w-10 h-10 rounded-xl items-center justify-center"
                                            style={({ pressed }) => ({ opacity: (pressed || isProcessing) ? 0.6 : 1 })}
                                        >
                                            {isProcessing ? (
                                                <ActivityIndicator size="small" color="#10B981" />
                                            ) : (
                                                <Ionicons name="checkmark" size={20} color="#10B981" />
                                            )}
                                        </Pressable>
                                        <Pressable
                                            onPress={() => handleReject(request.requestId, request.username)}
                                            disabled={isProcessing}
                                            className="bg-red-500/15 border border-red-500/30 w-10 h-10 rounded-xl items-center justify-center"
                                            style={({ pressed }) => ({ opacity: (pressed || isProcessing) ? 0.6 : 1 })}
                                        >
                                            <Ionicons name="close" size={20} color="#EF4444" />
                                        </Pressable>
                                    </View>
                                </View>
                            );
                        }}
                        ListEmptyComponent={
                            <View className="items-center py-20">
                                <View className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] items-center justify-center mb-4">
                                    <Ionicons name="mail-outline" size={28} color="#334155" />
                                </View>
                                <Text className="text-sm font-semibold text-slate-500">No pending requests</Text>
                                <Text className="text-xs text-slate-600 mt-1">New join requests will appear here</Text>
                            </View>
                        }
                    />
                )
            )}

            {activeTab === 'blacklisted' && (
                isBansLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#EF4444" />
                    </View>
                ) : (
                    <FlatList
                        data={filteredBans}
                        keyExtractor={(item) => item.userId}
                        className="flex-1 px-4"
                        contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
                        removeClippedSubviews
                        renderItem={({ item: ban }) => {
                            const isProcessing = processingIds.has(ban.userId);
                            return (
                                <View className="flex-row items-center justify-between py-4 border-b border-white/5">
                                    <View className="flex-row items-center flex-1 mr-2" style={{ gap: 12 }}>
                                        <PlayerAvatar name={ban.username} src={ban.avatarUrl} size="md" />
                                        <View className="flex-1">
                                            <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                                                {ban.username}
                                            </Text>
                                            <View className="flex-row items-center mt-1" style={{ gap: 6 }}>
                                                <Ionicons name="ban-outline" size={11} color="#EF4444" />
                                                <Text className="text-[11px] text-red-400">
                                                    Banned{ban.bannedAt ? ` ${formatDateSafe(ban.bannedAt, '')}` : ''}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {isProcessing ? (
                                        <View className="w-24 h-10 items-center justify-center">
                                            <ActivityIndicator size="small" color="#10B981" />
                                        </View>
                                    ) : (
                                        <Pressable
                                            onPress={() => unbanMember(ban)}
                                            className="bg-emerald-500/15 border border-emerald-500/30 px-4 h-10 rounded-xl items-center justify-center flex-row"
                                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, gap: 6 })}
                                        >
                                            <Ionicons name="checkmark-circle-outline" size={15} color="#10B981" />
                                            <Text className="text-[11px] font-black uppercase tracking-wide text-emerald-300">
                                                Unban
                                            </Text>
                                        </Pressable>
                                    )}
                                </View>
                            );
                        }}
                        ListEmptyComponent={
                            <View className="items-center py-20">
                                <View className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] items-center justify-center mb-4">
                                    <Ionicons name="ban-outline" size={28} color="#334155" />
                                </View>
                                <Text className="text-sm font-semibold text-slate-500">No banned users</Text>
                                <Text className="text-xs text-slate-600 mt-1">Banned users will appear here</Text>
                            </View>
                        }
                    />
                )
            )}

            <ActionSheetModal
                visible={!!actionMember}
                onClose={() => setActionMember(null)}
                title={actionMember?.username ?? ''}
                subtitle="Choose an action"
                header={actionMember ? (
                    <PlayerAvatar name={actionMember.username} src={actionMember.avatarUrl} size="md" />
                ) : undefined}
                actions={actionMember ? memberSheetActions(actionMember) : []}
            />
        </SafeAreaView>
    );
}

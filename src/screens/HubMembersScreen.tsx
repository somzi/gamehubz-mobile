import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert, TextInput, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../types/navigation';
import { HubRole } from '../types/hub';
import { PageHeader } from '../components/layout/PageHeader';
import { PlayerAvatar } from '../components/ui/PlayerAvatar';
import { Panel } from '../components/ui/Panel';
import { Skeleton } from '../components/ui/Skeleton';
import { LoadFailedState } from '../components/ui/EmptyState';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../lib/api';
import { formatDateSafe, sameId } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { PremiumTabs, type PremiumTabItem } from '../components/ui/PremiumTabs';
import { COLORS } from '../lib/theme';
import { ActionSheetModal, type ActionSheetAction } from '../components/modals/ActionSheetModal';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateHubData } from '../lib/queryPolicy';

type HubMembersScreenRouteProp = RouteProp<RootStackParamList, 'HubMembers'>;
type IconName = keyof typeof Ionicons.glyphMap;
type Tab = 'members' | 'requests' | 'blacklisted';

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
    avatarUrl?: string;
    hubRole: HubRole;
}

interface BannedRow {
    userId: string;
    username: string;
    avatarUrl?: string;
    bannedAt?: string;
    bannedByName?: string;
}

// One colour per role, shared by the avatar ring, the pill, the section and the sheet's actions.
// Labels carry i18n keys, not text: this map is module scope and would otherwise freeze whatever
// language was active at import time.
const ROLE_META: Record<HubRole, { labelKey: string; color: string; icon: IconName }> = {
    [HubRole.HubOwner]: { labelKey: 'role.owner', color: '#FBBF24', icon: 'shield-checkmark' },
    [HubRole.HubAdmin]: { labelKey: 'role.admin', color: '#A5B4FC', icon: 'star' },
    [HubRole.HubExclusive]: { labelKey: 'role.exclusive', color: '#E879F9', icon: 'sparkles' },
    [HubRole.HubMember]: { labelKey: 'role.member', color: '#94A3B8', icon: 'person' },
};

const roleMeta = (role: HubRole) => ROLE_META[role] ?? ROLE_META[HubRole.HubMember];

// Most privileged first — the roster's order, and the role kept when the backend lists a user twice.
const ROLE_RANK: Record<number, number> = {
    [HubRole.HubOwner]: 0,
    [HubRole.HubAdmin]: 1,
    [HubRole.HubExclusive]: 2,
    [HubRole.HubMember]: 3,
};

// Panel edges: a list's colour sits in its frame, not behind the rows.
const EDGE = {
    members: 'rgba(255,255,255,0.06)',
    requests: 'rgba(245,158,11,0.22)',
    banned: 'rgba(239,68,68,0.2)',
};

const TAB_ACCENT: Record<Tab, [string, string]> = {
    members: [COLORS.primary, COLORS.primaryBright],
    requests: [COLORS.warning, '#FBBF24'],
    blacklisted: [COLORS.destructive, '#F87171'],
};

const TABULAR = { fontVariant: ['tabular-nums' as const] };

// The hairline between rows starts where the name does: row padding 16 + ringed avatar 46 + gap 12.
const DIVIDER_INSET = 74;

type ListItem =
    | { kind: 'header'; key: string; icon: IconName; color: string; label: string; count: number; first: boolean }
    | { kind: 'member'; key: string; member: MemberRow; first: boolean; last: boolean }
    | { kind: 'request'; key: string; request: JoinRequest; first: boolean; last: boolean }
    | { kind: 'ban'; key: string; ban: BannedRow; first: boolean; last: boolean };

// Module scope, so the "unknown" fallback is passed in rather than resolved here.
function normalizeMember(raw: any, unknownLabel: string): MemberRow | null {
    const userId = raw.UserId || raw.userId || raw.id || raw.Id;
    if (!userId) return null;
    const username = raw.Username || raw.username || raw.Name || raw.name || unknownLabel;
    const avatarUrl = raw.AvatarUrl || raw.avatarUrl || undefined;
    const role = raw.HubRole ?? raw.hubRole ?? HubRole.HubMember;
    return { userId, username, avatarUrl, hubRole: role as HubRole };
}

/**
 * One row's slice of a panel. The rows of a section are separate list items (a hub can run to
 * hundreds of members, so the list stays virtualised); together they draw one Panel: the first
 * carries the top edge, radius and shine, the last the bottom edge, and each one after the first
 * a hairline that starts at the name.
 */
function PanelSegment({ first, last, edge, children }: { first: boolean; last: boolean; edge: string; children: React.ReactNode }) {
    return (
        <View style={[styles.segment, { borderColor: edge }, first && styles.segmentFirst, last && styles.segmentLast]}>
            {first ? (
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
                    style={styles.shine}
                />
            ) : (
                <View pointerEvents="none" style={styles.divider} />
            )}
            {children}
        </View>
    );
}

function SectionHeader({ icon, color, label, count, first }: { icon: IconName; color: string; label: string; count: number; first: boolean }) {
    return (
        <View className={`flex-row items-center px-1 mb-2 ${first ? '' : 'mt-6'}`} style={{ gap: 7 }}>
            <Ionicons name={icon} size={12} color={color} />
            <Text className="shrink text-slate-400 text-[11px] font-black uppercase tracking-[1.6px]" numberOfLines={1}>
                {label}
            </Text>
            <Text className="text-slate-600 text-[11px] font-bold" style={TABULAR}>
                {count}
            </Text>
        </View>
    );
}

/** Avatar in a thin ring of the row's colour, with an optional status coin on its corner. */
function RingAvatar({
    name,
    src,
    ring,
    badge,
    dimmed,
}: {
    name: string;
    src?: string;
    ring: string;
    badge?: { icon: IconName; bg: string; color: string };
    dimmed?: boolean;
}) {
    return (
        <View>
            <View style={{ borderRadius: 999, padding: 1.5, borderWidth: 1.5, borderColor: ring }}>
                <View style={dimmed ? { opacity: 0.55 } : undefined}>
                    <PlayerAvatar name={name} src={src} size="md" className="border-0" />
                </View>
            </View>
            {badge && (
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Ionicons name={badge.icon} size={8} color={badge.color} />
                </View>
            )}
        </View>
    );
}

function Pill({ label, color }: { label: string; color: string }) {
    return (
        <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: color + '26', borderWidth: 1, borderColor: color + '4D' }}>
            <Text className="text-[9px] font-black uppercase tracking-wider" style={{ color }} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

/** The whole panel while a list has nothing to show: a tinted tile and one line. */
function PanelMessage({ icon, color, text, edge }: { icon: IconName; color: string; text: string; edge: string }) {
    return (
        <Panel style={{ borderColor: edge, paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center' }}>
            <View
                className="w-12 h-12 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: color + '1A', borderWidth: 1, borderColor: color + '33' }}
            >
                <Ionicons name={icon} size={22} color={color} />
            </View>
            <Text className="text-sm font-semibold text-slate-400 text-center">{text}</Text>
        </Panel>
    );
}

function SkeletonPanel({ edge }: { edge: string }) {
    return (
        <Panel style={{ borderColor: edge }}>
            {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} className="flex-row items-center pl-4 pr-3 py-2.5">
                    {i > 0 && <View pointerEvents="none" style={styles.divider} />}
                    <Skeleton width={46} height={46} radius={23} />
                    <View className="flex-1 ml-3" style={{ gap: 6 }}>
                        <Skeleton width={i % 2 ? '42%' : '56%'} height={12} radius={6} />
                        <Skeleton width="28%" height={8} radius={4} />
                    </View>
                </View>
            ))}
        </Panel>
    );
}

export default function HubMembersScreen() {
    const queryClient = useQueryClient();
    const navigation = useNavigation<any>();
    const { t, i18n } = useTranslation('hub');
    const { t: tCommon } = useTranslation('common');
    const route = useRoute<HubMembersScreenRouteProp>();
    const { hubId } = route.params;
    const { user: currentUser } = useAuth();

    const [activeTab, setActiveTab] = useState<Tab>('members');
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [bans, setBans] = useState<BannedRow[]>([]);
    // `loaded` = the first answer is in (rows or an error); until then the panel shows skeleton rows.
    // Later focus refreshes run quietly over the rows already on screen.
    const [membersLoaded, setMembersLoaded] = useState(false);
    const [requestsLoaded, setRequestsLoaded] = useState(false);
    const [bansLoaded, setBansLoaded] = useState(false);
    const [membersError, setMembersError] = useState(false);
    const [requestsError, setRequestsError] = useState(false);
    const [bansError, setBansError] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    // Only a pull shows the spinner — see refreshcontrol-background-refetch-gap.
    const [isPulling, setIsPulling] = useState(false);
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
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_MEMBERS(hubId));
            if (response.ok) {
                const data = await response.json();
                const raw = data.result || data || [];
                const normalized = (Array.isArray(raw) ? raw : []).map((row: any) => normalizeMember(row, tCommon('unknown'))).filter(Boolean) as MemberRow[];
                // Backend can return the same user twice (e.g. the owner also listed as a plain
                // member), which crashes the FlatList with duplicate keys (keyExtractor = userId).
                // Dedupe by userId, keeping the most-privileged role on collision.
                const byUser = new Map<string, MemberRow>();
                for (const m of normalized) {
                    const key = m.userId.toLowerCase();
                    const existing = byUser.get(key);
                    if (!existing || (ROLE_RANK[m.hubRole] ?? 99) < (ROLE_RANK[existing.hubRole] ?? 99)) {
                        byUser.set(key, m);
                    }
                }
                setMembers(Array.from(byUser.values()));
                setMembersError(false);
            } else {
                setMembersError(true);
            }
        } catch (error) {
            console.error('Error fetching hub members:', error);
            setMembersError(true);
        } finally {
            setMembersLoaded(true);
        }
    }, [hubId]);

    const fetchRequests = useCallback(async () => {
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_JOIN_REQUESTS(hubId));
            if (response.ok) {
                const data = await response.json();
                setRequests(data.result || data || []);
                setRequestsError(false);
            } else {
                setRequestsError(true);
            }
        } catch (error) {
            console.error('Error fetching join requests:', error);
            setRequestsError(true);
        } finally {
            setRequestsLoaded(true);
        }
    }, [hubId]);

    const fetchBans = useCallback(async () => {
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_BANS(hubId));
            if (response.ok) {
                const data = await response.json();
                const raw: any[] = Array.isArray(data) ? data : (data.result || []);
                const normalized: BannedRow[] = raw.map(b => ({
                    userId: b.userId || b.UserId,
                    username: b.username || b.Username || tCommon('unknown'),
                    avatarUrl: b.avatarUrl || b.AvatarUrl,
                    bannedAt: b.bannedAt || b.BannedAt,
                    bannedByName: b.bannedByName || b.BannedByName || undefined,
                })).filter(b => !!b.userId);
                setBans(normalized);
                setBansError(false);
            } else {
                setBansError(true);
            }
        } catch (error) {
            console.error('Error fetching hub bans:', error);
            setBansError(true);
        } finally {
            setBansLoaded(true);
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

    const onRefresh = async () => {
        setIsPulling(true);
        await Promise.all([fetchHubMeta(), fetchMembers(), fetchRequests(), fetchBans()]);
        setIsPulling(false);
    };

    const retryActiveList = async () => {
        setIsRetrying(true);
        await (activeTab === 'members' ? fetchMembers() : activeTab === 'requests' ? fetchRequests() : fetchBans());
        setIsRetrying(false);
    };

    const openProfile = (userId?: string) => {
        if (userId) navigation.navigate('PlayerProfile', { id: userId });
    };

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
                await invalidateHubData(queryClient, hubId);
                setMembers(prev =>
                    prev.map(m => (m.userId === member.userId ? { ...m, hubRole: newRole } : m))
                );
            } else {
                const text = await response.text();
                Alert.alert(tCommon('error'), getErrorMessage(text) || t('members.updateRoleFailed'));
            }
        } catch (error) {
            Alert.alert(tCommon('error'), getErrorMessage(error));
        } finally {
            markProcessing(member.userId, false);
        }
    };

    // Hands the hub over: the target becomes Owner and the current owner drops to Admin. Confirmed
    // in two steps because the caller cannot undo it afterwards — only the new owner can transfer back.
    const transferOwnership = (member: MemberRow) => {
        Alert.alert(
            t('members.transferTitle'),
            t('members.transferMessage', { username: member.username }),
            [
                { text: tCommon('cancel'), style: 'cancel' },
                {
                    text: t('members.transfer'),
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
                                await invalidateHubData(queryClient, hubId);
                                await Promise.all([fetchHubMeta(), fetchMembers()]);
                                Alert.alert(t('members.ownershipTransferred'), t('members.ownershipTransferredMessage', { username: member.username }));
                            } else {
                                const text = await response.text();
                                Alert.alert(tCommon('error'), getErrorMessage(text) || t('members.transferFailed'));
                            }
                        } catch (error) {
                            Alert.alert(tCommon('error'), getErrorMessage(error));
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
            t('members.removeTitle'),
            t('members.removeMessage', { username: member.username }),
            [
                { text: tCommon('cancel'), style: 'cancel' },
                {
                    text: tCommon('remove'),
                    style: 'destructive',
                    onPress: async () => {
                        markProcessing(member.userId, true);
                        try {
                            const response = await authenticatedFetch(
                                ENDPOINTS.REMOVE_HUB_MEMBER(hubId, member.userId),
                                { method: 'DELETE' }
                            );
                            if (response.ok) {
                                await invalidateHubData(queryClient, hubId);
                                setMembers(prev => prev.filter(m => m.userId !== member.userId));
                            } else {
                                const text = await response.text();
                                Alert.alert(tCommon('error'), getErrorMessage(text) || t('members.removeFailed'));
                            }
                        } catch (error) {
                            Alert.alert(tCommon('error'), getErrorMessage(error));
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
            t('members.banTitle'),
            t('members.banMessage', { username: member.username }),
            [
                { text: tCommon('cancel'), style: 'cancel' },
                {
                    text: t('members.ban'),
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
                                await invalidateHubData(queryClient, hubId);
                            } else {
                                const text = await response.text();
                                Alert.alert(tCommon('error'), getErrorMessage(text) || t('members.banFailed'));
                            }
                        } catch (error) {
                            Alert.alert(tCommon('error'), getErrorMessage(error));
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
            t('members.unbanTitle'),
            t('members.unbanMessage', { username: ban.username }),
            [
                { text: tCommon('cancel'), style: 'cancel' },
                {
                    text: t('members.unban'),
                    onPress: async () => {
                        markProcessing(ban.userId, true);
                        try {
                            const response = await authenticatedFetch(
                                ENDPOINTS.UNBAN_HUB_MEMBER(hubId, ban.userId),
                                { method: 'DELETE' }
                            );
                            if (response.ok) {
                                await invalidateHubData(queryClient, hubId);
                                setBans(prev => prev.filter(b => b.userId !== ban.userId));
                            } else {
                                const text = await response.text();
                                Alert.alert(tCommon('error'), getErrorMessage(text) || t('members.unbanFailed'));
                            }
                        } catch (error) {
                            Alert.alert(tCommon('error'), getErrorMessage(error));
                        } finally {
                            markProcessing(ban.userId, false);
                        }
                    },
                },
            ]
        );
    };

    // Actions for the in-app sheet (replaces the old native Alert action list).
    // Icon and colour show the TARGET role of the change (ROLE_META).
    const memberSheetActions = (member: MemberRow): ActionSheetAction[] => {
        const actions: ActionSheetAction[] = [];
        const adminAction: ActionSheetAction = {
            label: t('members.promoteToAdmin'),
            icon: 'star-outline',
            color: ROLE_META[HubRole.HubAdmin].color,
            onPress: () => changeRole(member, HubRole.HubAdmin),
        };
        const memberAction: ActionSheetAction = {
            label: t('members.demoteToMember'),
            icon: 'person-outline',
            color: ROLE_META[HubRole.HubMember].color,
            onPress: () => changeRole(member, HubRole.HubMember),
        };

        // Only the Owner can grant/revoke elevated roles (admin / exclusive). Same test the row
        // gate uses (canManageMember) — the `isOwner` flag alone lags behind the hub-meta fetch,
        // which left an owner with a sheet offering nothing but "Remove from hub".
        if (viewerIsOwner) {
            if (member.hubRole === HubRole.HubMember) {
                actions.push(adminAction);
                actions.push({
                    label: t('members.promoteToExclusive'),
                    icon: 'sparkles-outline',
                    color: ROLE_META[HubRole.HubExclusive].color,
                    onPress: () => changeRole(member, HubRole.HubExclusive),
                });
            } else if (member.hubRole === HubRole.HubExclusive) {
                actions.push(adminAction);
                actions.push(memberAction);
            } else if (member.hubRole === HubRole.HubAdmin) {
                actions.push({
                    label: t('members.demoteToExclusive'),
                    icon: 'sparkles-outline',
                    color: ROLE_META[HubRole.HubExclusive].color,
                    onPress: () => changeRole(member, HubRole.HubExclusive),
                });
                actions.push(memberAction);
            }

            // Marked destructive: it is the one action here the owner cannot take back.
            actions.push({
                label: t('members.transferOwnership'),
                icon: 'key-outline',
                destructive: true,
                onPress: () => transferOwnership(member),
            });
        }

        actions.push({
            label: t('members.removeFromHub'),
            icon: 'person-remove-outline',
            destructive: true,
            onPress: () => removeMember(member),
        });
        actions.push({
            label: t('members.banFromHub'),
            icon: 'ban-outline',
            destructive: true,
            onPress: () => banMember(member),
        });

        return actions;
    };

    const handleApprove = async (requestId: string, username: string) => {
        markProcessing(`${requestId}:approve`, true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.APPROVE_HUB_JOIN_REQUEST(requestId), {
                method: 'POST',
            });
            if (response.ok) {
                await invalidateHubData(queryClient, hubId);
                setRequests(prev => prev.filter(r => r.requestId !== requestId));
                fetchMembers();
            } else {
                Alert.alert(tCommon('error'), t('members.approveFailed', { username }));
            }
        } catch (error) {
            Alert.alert(tCommon('error'), tCommon('unexpectedError'));
        } finally {
            markProcessing(`${requestId}:approve`, false);
        }
    };

    const handleReject = (requestId: string, username: string) => {
        Alert.alert(
            t('members.rejectTitle'),
            t('members.rejectMessage', { username }),
            [
                { text: tCommon('cancel'), style: 'cancel' },
                {
                    text: t('members.reject'),
                    style: 'destructive',
                    onPress: async () => {
                        markProcessing(`${requestId}:reject`, true);
                        try {
                            const response = await authenticatedFetch(ENDPOINTS.REJECT_HUB_JOIN_REQUEST(requestId), {
                                method: 'POST',
                            });
                            if (response.ok) {
                                await invalidateHubData(queryClient, hubId);
                                setRequests(prev => prev.filter(r => r.requestId !== requestId));
                            } else {
                                Alert.alert(tCommon('error'), t('members.rejectFailed'));
                            }
                        } catch (error) {
                            Alert.alert(tCommon('error'), tCommon('unexpectedError'));
                        } finally {
                            markProcessing(`${requestId}:reject`, false);
                        }
                    },
                },
            ]
        );
    };

    // The viewer's own role within this hub (drives what actions they may take).
    // sameId, not ===: the members list and the auth user come from different endpoints, so a
    // casing difference would leave this undefined and silently strip an owner or admin of
    // every control on this screen. (The server enforces the real rules either way — see
    // UserHubService.ChangeMemberRole / RemoveMember — this only decides what is drawn.)
    const currentUserRole = members.find(m => sameId(m.userId, currentUser?.id))?.hubRole;
    const viewerIsOwner = isOwner || currentUserRole === HubRole.HubOwner;
    const viewerIsAdmin = currentUserRole === HubRole.HubAdmin;

    // The owner can manage every other member. An admin can only manage regular and
    // exclusive members — never the owner or another admin.
    const canManageMember = (member: MemberRow): boolean => {
        if (sameId(member.userId, currentUser?.id)) return false; // never self
        if (member.hubRole === HubRole.HubOwner) return false;   // owner is untouchable
        if (viewerIsOwner) return true;
        if (viewerIsAdmin) return member.hubRole !== HubRole.HubAdmin;
        return false;
    };

    const query = searchQuery.trim().toLowerCase();

    // The active tab as one flat list: a header per section, then that section's rows as panel slices.
    const listData = useMemo<ListItem[]>(() => {
        const matches = (name: string) => !query || name.toLowerCase().includes(query);
        const byName = (a: { username: string }, b: { username: string }) =>
            a.username.localeCompare(b.username, i18n.language, { sensitivity: 'base' });
        const items: ListItem[] = [];

        const pushSection = <T,>(
            key: string,
            header: { icon: IconName; color: string; label: string },
            rows: T[],
            toItem: (row: T, first: boolean, last: boolean) => ListItem,
        ) => {
            if (rows.length === 0) return;
            items.push({ kind: 'header', key: `h-${key}`, ...header, count: rows.length, first: items.length === 0 });
            rows.forEach((row, i) => items.push(toItem(row, i === 0, i === rows.length - 1)));
        };

        if (activeTab === 'members') {
            // One roster, ranked: owner, admins, exclusive, members — by name within each rank.
            const sorted = members
                .filter(m => matches(m.username))
                .sort((a, b) => (ROLE_RANK[a.hubRole] ?? 99) - (ROLE_RANK[b.hubRole] ?? 99) || byName(a, b));

            pushSection(
                'members',
                { icon: 'people', color: COLORS.slate400, label: t('members.tabMembers') },
                sorted,
                (member, first, last) => ({ kind: 'member', key: member.userId, member, first, last }),
            );
        } else if (activeTab === 'requests') {
            pushSection(
                'requests',
                { icon: 'person-add', color: '#FBBF24', label: t('members.tabRequests') },
                requests.filter(r => matches(r.username)),
                (request, first, last) => ({ kind: 'request', key: request.requestId, request, first, last }),
            );
        } else {
            pushSection(
                'banned',
                { icon: 'ban', color: '#F87171', label: t('members.tabBanned') },
                bans.filter(b => matches(b.username)).sort(byName),
                (ban, first, last) => ({ kind: 'ban', key: ban.userId, ban, first, last }),
            );
        }
        return items;
    }, [activeTab, members, requests, bans, query, i18n.language, t]);

    const switchTab = (value: string) => {
        setActiveTab(value as Tab);
        setSearchQuery('');
    };

    // Only Requests carries a count on its tab — it is the one that asks for something. Once the
    // tab is open, the section header shows the number.
    const tabs: PremiumTabItem[] = [
        { value: 'members', label: t('members.tabMembers'), icon: 'people-outline' },
        {
            value: 'requests',
            label: t('members.tabRequests'),
            icon: 'person-add-outline',
            badge: requests.length > 0 && activeTab !== 'requests' ? requests.length : undefined,
            badgeTone: 'alert',
        },
        { value: 'blacklisted', label: t('members.tabBanned'), icon: 'ban-outline' },
    ];

    const tabState = {
        members: { loaded: membersLoaded, error: membersError, total: members.length, edge: EDGE.members },
        requests: { loaded: requestsLoaded, error: requestsError, total: requests.length, edge: EDGE.requests },
        blacklisted: { loaded: bansLoaded, error: bansError, total: bans.length, edge: EDGE.banned },
    }[activeTab];

    const searchPlaceholder =
        activeTab === 'members' ? t('members.searchMembers')
            : activeTab === 'requests' ? t('members.searchRequests')
                : t('members.searchBanned');

    // Search only when there is something to search through.
    const showSearch = tabState.total > 0 || searchQuery.length > 0;

    const renderMember = (member: MemberRow, first: boolean, last: boolean) => {
        const meta = roleMeta(member.hubRole);
        const isMe = sameId(member.userId, currentUser?.id);
        const hasRank = member.hubRole !== HubRole.HubMember;
        const manageable = canManageMember(member);
        const isProcessing = processingIds.has(member.userId);

        return (
            <PanelSegment first={first} last={last} edge={EDGE.members}>
                {isMe && (
                    <>
                        <View pointerEvents="none" style={styles.meTint} />
                        <View pointerEvents="none" style={styles.meLine} />
                    </>
                )}
                <Pressable
                    onPress={() => openProfile(member.userId)}
                    accessibilityRole="button"
                    className="flex-row items-center pl-4 pr-3 py-2.5 active:opacity-70"
                >
                    <RingAvatar
                        name={member.username}
                        src={member.avatarUrl}
                        ring={hasRank ? meta.color + '80' : isMe ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.12)'}
                    />
                    <View className="flex-1 flex-row items-center ml-3" style={{ gap: 6 }}>
                        <Text className="shrink text-[14px] font-black text-white" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                            {member.username}
                        </Text>
                        {isMe && <Pill label={tCommon('app.me')} color={COLORS.primaryBright} />}
                    </View>
                    {/* Plain members carry no pill — on a roster it would repeat on every row. */}
                    {hasRank && (
                        <View className="flex-row items-center px-2 py-1 rounded-full ml-2" style={{ gap: 4, backgroundColor: meta.color + '26', borderWidth: 1, borderColor: meta.color + '4D' }}>
                            <Ionicons name={meta.icon} size={10} color={meta.color} />
                            <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: meta.color }}>
                                {t(meta.labelKey)}
                            </Text>
                        </View>
                    )}
                    {manageable ? (
                        isProcessing ? (
                            <View className="w-9 h-9 ml-2 items-center justify-center">
                                <ActivityIndicator size="small" color={COLORS.slate400} />
                            </View>
                        ) : (
                            <Pressable
                                onPress={() => setActionMember(member)}
                                accessibilityRole="button"
                                accessibilityLabel={t('members.chooseAnAction')}
                                hitSlop={6}
                                className="w-9 h-9 ml-2 rounded-xl items-center justify-center bg-white/[0.04] border border-white/[0.08] active:opacity-60"
                            >
                                <Ionicons name="ellipsis-horizontal" size={17} color={COLORS.slate300} />
                            </Pressable>
                        )
                    ) : (
                        <Ionicons name="chevron-forward" size={14} color={COLORS.slate600} style={{ marginLeft: 8 }} />
                    )}
                </Pressable>
            </PanelSegment>
        );
    };

    const renderRequest = (request: JoinRequest, first: boolean, last: boolean) => {
        const approving = processingIds.has(`${request.requestId}:approve`);
        const rejecting = processingIds.has(`${request.requestId}:reject`);
        const busy = approving || rejecting;

        return (
            <PanelSegment first={first} last={last} edge={EDGE.requests}>
                <View className="flex-row items-center pl-4 pr-3 py-2.5">
                    {/* Avatar + name open the profile, so the request can be vetted before approving. */}
                    <Pressable
                        onPress={() => openProfile(request.userId)}
                        accessibilityRole="button"
                        className="flex-1 flex-row items-center active:opacity-70"
                    >
                        <RingAvatar
                            name={request.username}
                            src={request.avatarUrl}
                            ring="rgba(245,158,11,0.55)"
                            badge={{ icon: 'hourglass', bg: COLORS.warning, color: '#0F172A' }}
                        />
                        <View className="flex-1 ml-3">
                            <View className="flex-row items-center" style={{ gap: 4 }}>
                                <Text className="shrink text-[14px] font-black text-white" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                    {request.username}
                                </Text>
                                <Ionicons name="chevron-forward" size={13} color={COLORS.slate500} />
                            </View>
                            <Text className="text-[9px] font-bold uppercase tracking-[1.2px] mt-1" style={{ color: '#FCD34D' }} numberOfLines={1}>
                                {t('members.requestedOn', { date: formatDateSafe(request.requestedAt, '') }).trim()}
                            </Text>
                        </View>
                    </Pressable>
                    <View className="flex-row items-center ml-2" style={{ gap: 6 }}>
                        <Pressable
                            onPress={() => handleReject(request.requestId, request.username)}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel={t('members.reject')}
                            className={`w-9 h-9 rounded-xl items-center justify-center bg-red-500/10 border border-red-500/25 active:opacity-60 ${busy && !rejecting ? 'opacity-40' : ''}`}
                        >
                            {rejecting ? (
                                <ActivityIndicator size="small" color={COLORS.destructive} />
                            ) : (
                                <Ionicons name="close" size={17} color="#F87171" />
                            )}
                        </Pressable>
                        <Pressable
                            onPress={() => handleApprove(request.requestId, request.username)}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel={t('members.approve')}
                            className={`w-9 h-9 rounded-xl items-center justify-center bg-primary active:opacity-80 ${busy && !approving ? 'opacity-40' : ''}`}
                        >
                            {approving ? (
                                <ActivityIndicator size="small" color="#0F172A" />
                            ) : (
                                <Ionicons name="checkmark" size={18} color="#0F172A" />
                            )}
                        </Pressable>
                    </View>
                </View>
            </PanelSegment>
        );
    };

    const renderBan = (ban: BannedRow, first: boolean, last: boolean) => {
        const isProcessing = processingIds.has(ban.userId);
        const date = formatDateSafe(ban.bannedAt, '');

        return (
            <PanelSegment first={first} last={last} edge={EDGE.banned}>
                <View className="flex-row items-center pl-4 pr-3 py-2.5">
                    <Pressable
                        onPress={() => openProfile(ban.userId)}
                        accessibilityRole="button"
                        className="flex-1 flex-row items-center active:opacity-70"
                    >
                        <RingAvatar
                            name={ban.username}
                            src={ban.avatarUrl}
                            ring="rgba(239,68,68,0.5)"
                            badge={{ icon: 'ban', bg: COLORS.destructive, color: '#FFFFFF' }}
                            dimmed
                        />
                        <View className="flex-1 ml-3">
                            <View className="flex-row items-center" style={{ gap: 4 }}>
                                <Text className="shrink text-[14px] font-black text-slate-200" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                    {ban.username}
                                </Text>
                                <Ionicons name="chevron-forward" size={13} color={COLORS.slate500} />
                            </View>
                            <Text className="text-[9px] font-bold uppercase tracking-[1.2px] mt-1" numberOfLines={1}>
                                <Text style={{ color: '#FCA5A5' }}>
                                    {date ? t('members.bannedOn', { date }) : t('members.tabBanned')}
                                </Text>
                                {ban.bannedByName ? (
                                    <Text className="text-slate-500">{`  ${t('members.bannedBy', { name: ban.bannedByName })}`}</Text>
                                ) : null}
                            </Text>
                        </View>
                    </Pressable>
                    {isProcessing ? (
                        <View className="h-9 ml-2 items-center justify-center" style={{ minWidth: 84 }}>
                            <ActivityIndicator size="small" color={COLORS.primary} />
                        </View>
                    ) : (
                        <Pressable
                            onPress={() => unbanMember(ban)}
                            accessibilityRole="button"
                            className="h-9 ml-2 px-3 rounded-xl flex-row items-center justify-center active:opacity-60"
                            style={{ gap: 5, minWidth: 84, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}
                        >
                            <Ionicons name="lock-open" size={13} color={COLORS.primaryBright} />
                            <Text className="text-[12px] font-bold text-emerald-300" numberOfLines={1}>
                                {t('members.unban')}
                            </Text>
                        </Pressable>
                    )}
                </View>
            </PanelSegment>
        );
    };

    const renderItem = ({ item }: { item: ListItem }) => {
        switch (item.kind) {
            case 'header':
                return <SectionHeader icon={item.icon} color={item.color} label={item.label} count={item.count} first={item.first} />;
            case 'member':
                return renderMember(item.member, item.first, item.last);
            case 'request':
                return renderRequest(item.request, item.first, item.last);
            case 'ban':
                return renderBan(item.ban, item.first, item.last);
        }
    };

    const emptyComponent = (() => {
        if (!tabState.loaded) return <SkeletonPanel edge={tabState.edge} />;
        if (tabState.error && tabState.total === 0) {
            return (
                <Panel style={{ borderColor: tabState.edge }}>
                    <LoadFailedState variant="plain" className="py-10" onRetry={retryActiveList} retrying={isRetrying} />
                </Panel>
            );
        }
        if (query) {
            return <PanelMessage icon="search-outline" color={COLORS.slate400} text={t('profile.noMatches')} edge={tabState.edge} />;
        }
        if (activeTab === 'requests') {
            return <PanelMessage icon="checkmark-done" color={COLORS.primary} text={t('members.noPendingRequests')} edge={EDGE.members} />;
        }
        if (activeTab === 'blacklisted') {
            return <PanelMessage icon="shield-checkmark-outline" color={COLORS.slate400} text={t('members.noBannedUsers')} edge={EDGE.members} />;
        }
        return <PanelMessage icon="people-outline" color={COLORS.slate400} text={t('members.noMembersFound')} edge={EDGE.members} />;
    })();

    const actionMeta = actionMember ? roleMeta(actionMember.hubRole) : null;

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <PageHeader title={t('members.title')} showBack />

            <View className="px-4 pt-1 pb-3">
                <PremiumTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={switchTab}
                    accentColor={TAB_ACCENT[activeTab][0]}
                    accentColorActive={TAB_ACCENT[activeTab][1]}
                />
            </View>

            <FlatList
                // A fresh list per tab, so each one opens at its top.
                key={activeTab}
                data={listData}
                keyExtractor={(item) => item.key}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
                removeClippedSubviews
                refreshControl={<RefreshControl refreshing={isPulling} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                ListHeaderComponent={showSearch ? (
                    <View
                        className="flex-row items-center px-3.5 h-12 rounded-2xl mb-4"
                        style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderTopColor: 'rgba(255,255,255,0.11)' }}
                    >
                        <Ionicons name="search" size={17} color={COLORS.slate500} />
                        <TextInput
                            className="flex-1 h-12 text-white ml-2.5 text-[14px]"
                            placeholder={searchPlaceholder}
                            placeholderTextColor={COLORS.slate500}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCorrect={false}
                            autoCapitalize="none"
                            returnKeyType="search"
                        />
                        {searchQuery.length > 0 && (
                            <Pressable onPress={() => setSearchQuery('')} hitSlop={10} accessibilityRole="button">
                                <Ionicons name="close-circle" size={18} color={COLORS.slate500} />
                            </Pressable>
                        )}
                    </View>
                ) : null}
                ListEmptyComponent={emptyComponent}
            />

            <ActionSheetModal
                visible={!!actionMember}
                onClose={() => setActionMember(null)}
                title={actionMember?.username ?? ''}
                subtitle={actionMeta ? t(actionMeta.labelKey) : undefined}
                header={actionMember && actionMeta ? (
                    <RingAvatar
                        name={actionMember.username}
                        src={actionMember.avatarUrl}
                        ring={actionMember.hubRole === HubRole.HubMember ? 'rgba(255,255,255,0.12)' : actionMeta.color + '80'}
                    />
                ) : undefined}
                actions={actionMember ? memberSheetActions(actionMember) : []}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    segment: {
        backgroundColor: COLORS.card,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        overflow: 'hidden',
    },
    segmentFirst: {
        borderTopWidth: 1,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 4,
    },
    segmentLast: {
        borderBottomWidth: 1,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        paddingBottom: 4,
    },
    shine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
    },
    divider: {
        position: 'absolute',
        top: 0,
        left: DIVIDER_INSET,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    meTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(16,185,129,0.07)',
    },
    meLine: {
        position: 'absolute',
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        backgroundColor: COLORS.primary,
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.7,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
    },
    badge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 16,
        height: 16,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: COLORS.card,
    },
});

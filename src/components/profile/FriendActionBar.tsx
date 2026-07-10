import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { authenticatedFetch, ENDPOINTS } from '../../lib/api';
import { FriendRelationStatus, FriendRelationStatusInfo } from '../../types/social';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { ActionSheetModal, type ActionSheetAction } from '../modals/ActionSheetModal';
import { PressableScale } from '../ui/PressableScale';
import { PlayerAvatar } from '../ui/PlayerAvatar';

type Nav = StackNavigationProp<RootStackParamList>;

interface Props {
    otherUserId: string;
    otherUsername?: string;
    otherAvatarUrl?: string;
}

type Confirm = {
    title: string;
    message: string;
    confirmText: string;
    action: () => Promise<void>;
} | null;

export function FriendActionBar({ otherUserId, otherUsername, otherAvatarUrl }: Props) {
    const navigation = useNavigation<Nav>();
    const [status, setStatus] = useState<FriendRelationStatusInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<Confirm>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    const targetName = otherUsername || 'this user';

    const fetchStatus = useCallback(async () => {
        try {
            const res = await authenticatedFetch(ENDPOINTS.GET_FRIEND_STATUS(otherUserId));
            if (res.ok) {
                setStatus(await res.json());
            }
        } finally {
            setLoading(false);
        }
    }, [otherUserId]);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    const run = async (fn: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            await fetchStatus();
        } finally {
            setBusy(false);
        }
    };

    const sendRequest = () => run(async () => {
        await authenticatedFetch(ENDPOINTS.SEND_FRIEND_REQUEST, {
            method: 'POST',
            body: JSON.stringify({ userId: otherUserId }),
        });
    });

    const cancelRequest = () => run(async () => {
        if (!status?.requestId) return;
        await authenticatedFetch(ENDPOINTS.CANCEL_FRIEND_REQUEST(status.requestId), { method: 'POST' });
    });

    const acceptRequest = () => run(async () => {
        if (!status?.requestId) return;
        await authenticatedFetch(ENDPOINTS.ACCEPT_FRIEND_REQUEST(status.requestId), { method: 'POST' });
    });

    const rejectRequest = () => run(async () => {
        if (!status?.requestId) return;
        await authenticatedFetch(ENDPOINTS.REJECT_FRIEND_REQUEST(status.requestId), { method: 'POST' });
    });

    const unfriend = () => run(async () => {
        await authenticatedFetch(ENDPOINTS.UNFRIEND(otherUserId), { method: 'DELETE' });
    });

    const block = () => run(async () => {
        await authenticatedFetch(ENDPOINTS.BLOCK_USER, {
            method: 'POST',
            body: JSON.stringify({ userId: otherUserId }),
        });
    });

    const unblock = () => run(async () => {
        await authenticatedFetch(ENDPOINTS.UNBLOCK_USER(otherUserId), { method: 'DELETE' });
    });

    const openChat = () => navigation.navigate('DirectChat', {
        otherUserId,
        header: otherUsername ? { otherUserId, otherUsername } : undefined,
    });

    const confirmRemoveFriend = () => setConfirm({
        title: 'Remove friend?',
        message: `You will no longer be friends with ${targetName}. You can send a new request later.`,
        confirmText: 'Remove',
        action: unfriend,
    });

    const confirmBlock = () => setConfirm({
        title: `Block ${targetName}?`,
        message: `${targetName} won't be able to message you or send friend requests. Any existing friendship will be removed.`,
        confirmText: 'Block',
        action: block,
    });

    if (loading) {
        return (
            <View className="px-5 mt-3">
                <View className="bg-card rounded-2xl h-12 items-center justify-center border border-white/[0.04]">
                    <ActivityIndicator size="small" color="#10B981" />
                </View>
            </View>
        );
    }

    if (!status || status.status === FriendRelationStatus.Self) {
        return null;
    }

    const s = status.status;
    const canBlock =
        s === FriendRelationStatus.None ||
        s === FriendRelationStatus.OutgoingRequest ||
        s === FriendRelationStatus.IncomingRequest ||
        s === FriendRelationStatus.Friends;

    // Rare/destructive actions live in the bottom sheet, not on the profile
    // surface — the row keeps one primary action plus a quiet entry point.
    const sheetActions: ActionSheetAction[] = [];
    if (s === FriendRelationStatus.Friends) {
        sheetActions.push({
            label: 'Remove Friend',
            icon: 'person-remove-outline',
            destructive: true,
            onPress: confirmRemoveFriend,
        });
    }
    if (canBlock) {
        sheetActions.push({
            label: 'Block User',
            icon: 'ban-outline',
            destructive: true,
            onPress: confirmBlock,
        });
    }

    const sheetSubtitle =
        s === FriendRelationStatus.Friends ? 'You are friends' :
            s === FriendRelationStatus.OutgoingRequest ? 'Friend request sent' :
                s === FriendRelationStatus.IncomingRequest ? 'Sent you a friend request' :
                    'Not friends yet';

    return (
        <>
            <View className="px-5 mt-3">
                <View className="flex-row" style={{ gap: 8 }}>
                    {/* ── Primary action ─────────────────────────────── */}
                    {s === FriendRelationStatus.None && (
                        <ActionButton icon="person-add" label="Add Friend" onPress={sendRequest} variant="primary" busy={busy} />
                    )}
                    {s === FriendRelationStatus.OutgoingRequest && (
                        <ActionButton icon="time-outline" label="Request Sent" onPress={cancelRequest} variant="secondary" busy={busy} />
                    )}
                    {s === FriendRelationStatus.IncomingRequest && (
                        <ActionButton icon="checkmark" label="Accept Request" onPress={acceptRequest} variant="primary" busy={busy} />
                    )}
                    {s === FriendRelationStatus.Friends && (
                        <ActionButton icon="chatbubble-ellipses" label="Message" onPress={openChat} variant="primary" busy={busy} />
                    )}
                    {s === FriendRelationStatus.BlockedByMe && (
                        <ActionButton icon="lock-open" label="Unblock" onPress={unblock} variant="secondary" busy={busy} />
                    )}
                    {s === FriendRelationStatus.BlockedByOther && (
                        <View className="flex-1 bg-white/[0.03] border border-white/[0.04] rounded-2xl h-12 items-center justify-center">
                            <Text className="text-slate-500 text-xs font-bold">Not available</Text>
                        </View>
                    )}

                    {/* ── Secondary actions ──────────────────────────── */}
                    {s === FriendRelationStatus.IncomingRequest && (
                        <IconButton icon="close" onPress={rejectRequest} label="Decline request" busy={busy} />
                    )}
                    {s === FriendRelationStatus.Friends && (
                        <PressableScale
                            onPress={() => setSheetOpen(true)}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel="Manage friendship"
                            className="h-12 px-3.5 rounded-2xl flex-row items-center justify-center bg-emerald-500/10 border border-emerald-500/25 gap-1.5"
                        >
                            <Ionicons name="people" size={15} color="#34D399" />
                            <Text className="text-emerald-300 font-black text-xs">Friends</Text>
                            <Ionicons name="chevron-down" size={12} color="#34D399" />
                        </PressableScale>
                    )}
                    {canBlock && s !== FriendRelationStatus.Friends && (
                        <IconButton icon="ellipsis-horizontal" onPress={() => setSheetOpen(true)} label="More options" busy={busy} />
                    )}
                </View>
            </View>

            <ActionSheetModal
                visible={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title={targetName}
                subtitle={sheetSubtitle}
                header={<PlayerAvatar src={otherAvatarUrl} name={targetName} size="md" />}
                actions={sheetActions}
            />

            <ConfirmationModal
                visible={!!confirm}
                onClose={() => setConfirm(null)}
                onConfirm={async () => {
                    const c = confirm;
                    setConfirm(null);
                    if (c) await c.action();
                }}
                title={confirm?.title ?? ''}
                message={confirm?.message ?? ''}
                confirmText={confirm?.confirmText}
                isDestructive
                isLoading={busy}
            />
        </>
    );
}

function ActionButton({
    icon, label, onPress, variant, busy,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    variant: 'primary' | 'secondary';
    busy: boolean;
}) {
    return (
        <PressableScale
            onPress={onPress}
            disabled={busy}
            // Sizing stays on the animated wrapper — flex-1 on the inner Pressable
            // collapses it to its padding (see Button.tsx).
            containerStyle={{ flex: 1 }}
            className={`flex-row items-center justify-center h-12 rounded-2xl gap-1.5 ${
                variant === 'primary' ? 'bg-emerald-500' : 'bg-white/5 border border-white/10'
            } ${busy ? 'opacity-60' : ''}`}
        >
            {busy ? (
                <ActivityIndicator size="small" color={variant === 'primary' ? '#0F172A' : '#fff'} />
            ) : (
                <>
                    <Ionicons name={icon} size={16} color={variant === 'primary' ? '#0F172A' : '#FAFAFA'} />
                    <Text className={`font-black text-xs ${variant === 'primary' ? 'text-slate-900' : 'text-white'}`}>
                        {label}
                    </Text>
                </>
            )}
        </PressableScale>
    );
}

function IconButton({
    icon, onPress, label, busy,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    label: string;
    busy: boolean;
}) {
    return (
        <PressableScale
            onPress={onPress}
            disabled={busy}
            accessibilityLabel={label}
            accessibilityRole="button"
            className={`w-12 h-12 rounded-2xl items-center justify-center bg-white/5 border border-white/10 ${busy ? 'opacity-60' : ''}`}
        >
            <Ionicons name={icon} size={18} color="#FAFAFA" />
        </PressableScale>
    );
}

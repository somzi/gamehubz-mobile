import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    Keyboard,
    Modal,
    Pressable,
    ScrollView,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { KeyboardAvoider } from '../ui/KeyboardAvoider';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { INVITE_COLORS } from '../ui/InviteOnlyBadge';
import { ConfirmationModal } from './ConfirmationModal';
import { COLORS } from '../../lib/theme';
import { getErrorMessage } from '../../lib/api';
import { hapticSuccess } from '../../lib/haptics';
import {
    InviteCandidate,
    InviteSendItem,
    TournamentInvite,
    TournamentInviteKind,
    TournamentInviteStatus,
    cancelTournamentInvite,
    fetchInviteCandidates,
    fetchTournamentInvites,
    sendTournamentInvites,
} from '../../lib/tournamentInvites';

const PAGE_SIZE = 20;

interface InvitePlayersModalProps {
    visible: boolean;
    onClose: () => void;
    tournamentId: string;
    /** Called whenever the invite list changed (sent / cancelled), so the card behind can recount. */
    onChanged?: () => void;
    /**
     * False once the tournament no longer takes new players: only the sent list is shown, so the
     * organizer can still withdraw a swap invite while the tournament runs.
     */
    allowPick?: boolean;
}

const STATUS_STYLE: Record<number, { key: string; color: string }> = {
    [TournamentInviteStatus.Pending]: { key: 'invites.status.pending', color: COLORS.warning },
    [TournamentInviteStatus.Accepted]: { key: 'invites.status.accepted', color: COLORS.primaryBright },
    [TournamentInviteStatus.Declined]: { key: 'invites.status.declined', color: COLORS.destructive },
    [TournamentInviteStatus.Cancelled]: { key: 'invites.status.cancelled', color: COLORS.slate500 },
    [TournamentInviteStatus.Expired]: { key: 'invites.status.expired', color: COLORS.slate500 },
};

/**
 * Manager-only "invite players" sheet. Two views: pick players (the hub's members until something
 * is typed, then anyone by username) and the invites already sent.
 *
 * A player outside the tournament's country / region / exclusive rules is marked Guest. Picking
 * them is the organizer's explicit choice — the request says "as guest" for exactly those players,
 * and the server refuses such a player without it. The filter only narrows the list; it never
 * grants an exception on its own.
 */
export function InvitePlayersModal({ visible, onClose, tournamentId, onChanged, allowPick = true }: InvitePlayersModalProps) {
    const { t } = useTranslation('tournament');
    const { t: tCommon } = useTranslation('common');
    const insets = useSafeAreaInsets();

    const [view, setView] = useState<'pick' | 'sent'>('pick');
    const [search, setSearch] = useState('');
    const [onlyEligible, setOnlyEligible] = useState(false);
    const [candidates, setCandidates] = useState<InviteCandidate[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(0);
    const [listError, setListError] = useState<string | null>(null);

    const [selected, setSelected] = useState<Record<string, InviteCandidate>>({});
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<InviteSendItem[] | null>(null);

    const [invites, setInvites] = useState<TournamentInvite[]>([]);
    const [loadingInvites, setLoadingInvites] = useState(false);
    const [cancelTarget, setCancelTarget] = useState<TournamentInvite | null>(null);
    const [cancelling, setCancelling] = useState(false);

    // Every async result is checked against the latest request, so a slow page for an old search
    // term (or a sheet that was closed meanwhile) can't overwrite what is on screen.
    const requestRef = useRef(0);
    // Term + filter of the latest page-one request (see the debounced effect below).
    const requestedRef = useRef<{ term: string; eligible: boolean } | null>(null);

    const loadCandidates = useCallback(async (term: string, eligibleOnly: boolean, pageNumber: number) => {
        const token = ++requestRef.current;
        if (pageNumber === 0) {
            requestedRef.current = { term, eligible: eligibleOnly };
            setLoading(true);
        } else setLoadingMore(true);
        setListError(null);

        try {
            const list = await fetchInviteCandidates(tournamentId, term, eligibleOnly, pageNumber);
            if (token !== requestRef.current) return;
            setCandidates((prev) => (pageNumber === 0 ? list : [...prev, ...list]));
            setHasMore(list.length >= PAGE_SIZE);
            setPage(pageNumber);
        } catch (err) {
            if (token !== requestRef.current) return;
            if (pageNumber === 0) setCandidates([]);
            setListError(getErrorMessage(err));
        } finally {
            if (token === requestRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [tournamentId]);

    const loadInvites = useCallback(async () => {
        setLoadingInvites(true);
        try {
            setInvites(await fetchTournamentInvites(tournamentId));
        } catch {
            // The list keeps what it had; the next open or action reloads it.
        } finally {
            setLoadingInvites(false);
        }
    }, [tournamentId]);

    // Fresh state on every open.
    useEffect(() => {
        if (!visible) return;
        setView(allowPick ? 'pick' : 'sent');
        setSearch('');
        setOnlyEligible(false);
        setSelected({});
        setSendError(null);
        setLastResult(null);
        if (allowPick) loadCandidates('', false, 0);
        loadInvites();
    }, [visible, allowPick, loadCandidates, loadInvites]);

    // Debounced search / filter change. Skips what the open (or the last page-one request) already
    // loaded, so opening the sheet doesn't fetch the first page twice.
    useEffect(() => {
        if (!visible || !allowPick) return;
        const term = search.trim();
        const last = requestedRef.current;
        if (last && last.term === term && last.eligible === onlyEligible) return;

        const timer = setTimeout(() => loadCandidates(term, onlyEligible, 0), 350);
        return () => clearTimeout(timer);
    }, [search, onlyEligible, visible, allowPick, loadCandidates]);

    const selectedList = useMemo(() => Object.values(selected), [selected]);
    const guestCount = selectedList.filter((c) => !c.meetsRequirements).length;

    const toggle = (candidate: InviteCandidate) => {
        setSelected((prev) => {
            const next = { ...prev };
            if (next[candidate.userId]) delete next[candidate.userId];
            else next[candidate.userId] = candidate;
            return next;
        });
    };

    const handleSend = async () => {
        if (selectedList.length === 0 || sending) return;
        Keyboard.dismiss();
        setSending(true);
        setSendError(null);
        try {
            const items = await sendTournamentInvites(
                tournamentId,
                // "As guest" only for the players who need it — the organizer saw the Guest mark on
                // each of them when picking.
                selectedList.map((c) => ({ userId: c.userId, asGuest: !c.meetsRequirements })),
            );
            setLastResult(items);
            if (items.some((i) => i.outcome === 'sent')) hapticSuccess();
            setSelected({});
            loadCandidates(search.trim(), onlyEligible, 0);
            loadInvites();
            onChanged?.();
        } catch (err) {
            setSendError(getErrorMessage(err));
        } finally {
            setSending(false);
        }
    };

    const handleCancelInvite = async () => {
        if (!cancelTarget) return;
        setCancelling(true);
        try {
            await cancelTournamentInvite(cancelTarget.id);
            setCancelTarget(null);
            loadInvites();
            loadCandidates(search.trim(), onlyEligible, 0);
            onChanged?.();
        } catch (err) {
            setSendError(getErrorMessage(err));
            setCancelTarget(null);
        } finally {
            setCancelling(false);
        }
    };

    const sentCount = lastResult?.filter((i) => i.outcome === 'sent').length ?? 0;
    const skipped = lastResult?.filter((i) => i.outcome !== 'sent') ?? [];
    const pendingInvites = invites.filter((i) => i.status === TournamentInviteStatus.Pending).length;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={() => {
                if (cancelTarget) { setCancelTarget(null); return; }
                if (!sending) onClose();
            }}
        >
            <View className="flex-1 justify-end">
                <Pressable className="absolute inset-0 bg-black/70" onPress={sending ? undefined : onClose} />

                <KeyboardAvoider bottomInset="none" style={{ maxHeight: '92%' }}>
                    <View
                        className="bg-card rounded-t-[32px] border-t border-x border-white/[0.07] overflow-hidden"
                        style={{ paddingBottom: Math.max(insets.bottom, 12), flexShrink: 1 }}
                    >
                        <View className="self-center w-10 h-1 rounded-full bg-white/15 mt-3 mb-3" />

                        {/* Header */}
                        <View className="px-5 pb-4 flex-row items-center gap-3 border-b border-white/[0.05]">
                            <View
                                className="w-10 h-10 rounded-2xl items-center justify-center"
                                style={{ backgroundColor: INVITE_COLORS.bg, borderWidth: 1, borderColor: INVITE_COLORS.border }}
                            >
                                <Ionicons name="mail" size={19} color={INVITE_COLORS.icon} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white text-lg font-black" numberOfLines={1}>
                                    {allowPick ? t('invites.modal.title') : t('invites.modal.sentTitle')}
                                </Text>
                                <Text className="text-slate-500 text-[11px] mt-0.5" numberOfLines={2}>
                                    {allowPick ? t('invites.modal.subtitle') : t('invites.modal.sentSubtitle')}
                                </Text>
                            </View>
                            <Pressable
                                onPress={sending ? undefined : onClose}
                                hitSlop={8}
                                className="w-9 h-9 rounded-full bg-white/[0.05] items-center justify-center"
                            >
                                <Ionicons name="close" size={18} color="#94A3B8" />
                            </Pressable>
                        </View>

                        {allowPick && (
                            <View className="px-5 pt-4">
                                <SegmentedToggle
                                    options={[
                                        { value: 'pick', label: t('invites.modal.tabInvite') },
                                        { value: 'sent', label: t('invites.modal.tabSent', { n: pendingInvites }) },
                                    ]}
                                    value={view}
                                    onChange={(v) => setView(v as 'pick' | 'sent')}
                                />
                            </View>
                        )}

                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 8 }}
                            style={{ flexShrink: 1 }}
                        >
                            {view === 'pick' ? (
                                <View className="px-5 pt-4">
                                    {/* Search */}
                                    <View
                                        className="flex-row items-center gap-2.5 h-12 px-3.5 rounded-2xl"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
                                    >
                                        <Ionicons name="search" size={17} color="#64748B" />
                                        <TextInput
                                            value={search}
                                            onChangeText={setSearch}
                                            placeholder={t('invites.modal.searchPlaceholder')}
                                            placeholderTextColor="#64748B"
                                            autoCorrect={false}
                                            autoCapitalize="none"
                                            className="flex-1 text-[14px] text-white"
                                            style={{ paddingVertical: 0 }}
                                        />
                                        {search.length > 0 && (
                                            <Pressable onPress={() => setSearch('')} hitSlop={8}>
                                                <Ionicons name="close-circle" size={17} color="#475569" />
                                            </Pressable>
                                        )}
                                    </View>

                                    {/* Filter: narrows the list only. */}
                                    <View className="flex-row gap-2 mt-3">
                                        {([false, true] as const).map((value) => {
                                            const active = onlyEligible === value;
                                            return (
                                                <Pressable
                                                    key={String(value)}
                                                    onPress={() => setOnlyEligible(value)}
                                                    className="px-3 py-2 rounded-full"
                                                    style={{
                                                        backgroundColor: active ? `${COLORS.primary}26` : 'rgba(255,255,255,0.04)',
                                                        borderWidth: 1,
                                                        borderColor: active ? `${COLORS.primary}66` : 'rgba(255,255,255,0.08)',
                                                    }}
                                                >
                                                    <Text className="text-[11.5px] font-bold" style={{ color: active ? COLORS.primaryBright : COLORS.slate400 }}>
                                                        {value ? t('invites.modal.filterEligible') : t('invites.modal.filterAll')}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>

                                    <Text className="text-slate-600 text-[11px] mt-2.5 leading-4">
                                        {search.trim() ? t('invites.modal.searchingEveryone') : t('invites.modal.showingMembers')}
                                    </Text>

                                    {/* Result of the last send */}
                                    {lastResult && (
                                        <View
                                            className="mt-3 p-3 rounded-2xl"
                                            style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.22)' }}
                                        >
                                            <Text className="text-emerald-300 text-[12px] font-bold">
                                                {t('invites.modal.sentCount', { count: sentCount })}
                                            </Text>
                                            {skipped.map((item) => (
                                                <Text key={item.userId} className="text-slate-400 text-[11px] mt-1 leading-4">
                                                    {t(`invites.outcome.${item.outcome}`, { name: item.username || tCommon('player') })}
                                                </Text>
                                            ))}
                                        </View>
                                    )}

                                    {sendError && (
                                        <View
                                            className="flex-row items-start gap-2 mt-3 p-3 rounded-2xl"
                                            style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)' }}
                                        >
                                            <Ionicons name="alert-circle" size={15} color={COLORS.destructive} />
                                            <Text className="flex-1 text-[12px] leading-[17px] text-red-200">{sendError}</Text>
                                        </View>
                                    )}

                                    {/* Candidates */}
                                    <View className="mt-3 gap-2">
                                        {loading ? (
                                            <View className="py-10 items-center">
                                                <ActivityIndicator size="small" color={COLORS.primary} />
                                            </View>
                                        ) : candidates.length === 0 ? (
                                            <View className="items-center py-9 px-6 rounded-3xl bg-white/[0.02] border border-white/[0.06]">
                                                <Ionicons name="person-outline" size={32} color="#475569" />
                                                <Text className="text-slate-400 text-[13px] font-bold mt-3 text-center">
                                                    {listError || (search.trim() ? t('invites.modal.noMatches') : t('invites.modal.noMembers'))}
                                                </Text>
                                                <Text className="text-slate-600 text-[11px] mt-1.5 text-center leading-4">
                                                    {t('invites.modal.alreadyInHidden')}
                                                </Text>
                                            </View>
                                        ) : (
                                            <>
                                                {candidates.map((candidate) => {
                                                    const isSelected = !!selected[candidate.userId];
                                                    const blocked = candidate.inviteState !== 'none';
                                                    const isGuest = !candidate.meetsRequirements;

                                                    return (
                                                        <PressableScale
                                                            key={candidate.userId}
                                                            onPress={() => !blocked && toggle(candidate)}
                                                            disabled={blocked}
                                                            className="flex-row items-center gap-3 p-3 rounded-2xl"
                                                            style={{
                                                                backgroundColor: isSelected ? 'rgba(16,185,129,0.10)' : 'rgba(255,255,255,0.025)',
                                                                borderWidth: 1,
                                                                borderColor: isSelected ? 'rgba(16,185,129,0.40)' : 'rgba(255,255,255,0.06)',
                                                                opacity: blocked ? 0.55 : 1,
                                                            }}
                                                        >
                                                            <PlayerAvatar src={candidate.avatarUrl ?? undefined} name={candidate.username} size="sm" />
                                                            <View className="flex-1">
                                                                <Text className="text-white font-bold text-[14px]" numberOfLines={1}>
                                                                    {candidate.username}
                                                                </Text>
                                                                <View className="flex-row items-center gap-1.5 mt-0.5">
                                                                    {isGuest && (
                                                                        <Text style={{ color: INVITE_COLORS.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}>
                                                                            {t('invites.guest').toUpperCase()}
                                                                        </Text>
                                                                    )}
                                                                    {candidate.inviteState === 'pending' && (
                                                                        <Text className="text-amber-400 text-[10px] font-black uppercase tracking-wider">
                                                                            {t('invites.status.pending')}
                                                                        </Text>
                                                                    )}
                                                                    {candidate.inviteState === 'declined' && (
                                                                        <Text className="text-red-400 text-[10px] font-black uppercase tracking-wider">
                                                                            {t('invites.status.declined')}
                                                                        </Text>
                                                                    )}
                                                                </View>
                                                            </View>
                                                            {!blocked && (
                                                                <View
                                                                    className="w-6 h-6 rounded-full items-center justify-center"
                                                                    style={{
                                                                        backgroundColor: isSelected ? COLORS.primary : 'rgba(255,255,255,0.05)',
                                                                        borderWidth: 1,
                                                                        borderColor: isSelected ? COLORS.primary : 'rgba(255,255,255,0.12)',
                                                                    }}
                                                                >
                                                                    {isSelected && <Ionicons name="checkmark" size={14} color={COLORS.primaryForeground} />}
                                                                </View>
                                                            )}
                                                        </PressableScale>
                                                    );
                                                })}

                                                {hasMore && (
                                                    <Pressable
                                                        onPress={() => loadCandidates(search.trim(), onlyEligible, page + 1)}
                                                        disabled={loadingMore}
                                                        className="h-11 rounded-2xl items-center justify-center mt-1 bg-white/[0.035] border border-white/[0.07]"
                                                    >
                                                        {loadingMore ? (
                                                            <ActivityIndicator size="small" color={COLORS.slate400} />
                                                        ) : (
                                                            <Text className="text-slate-300 font-bold text-[12px]">{t('swap.loadMore')}</Text>
                                                        )}
                                                    </Pressable>
                                                )}
                                            </>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                <View className="px-5 pt-4 gap-2">
                                    {loadingInvites && invites.length === 0 ? (
                                        <View className="py-10 items-center">
                                            <ActivityIndicator size="small" color={COLORS.primary} />
                                        </View>
                                    ) : invites.length === 0 ? (
                                        <View className="items-center py-9 px-6 rounded-3xl bg-white/[0.02] border border-white/[0.06]">
                                            <Ionicons name="mail-outline" size={32} color="#475569" />
                                            <Text className="text-slate-400 text-[13px] font-bold mt-3 text-center">{t('invites.modal.noneSent')}</Text>
                                        </View>
                                    ) : (
                                        invites.map((invite) => {
                                            const status = STATUS_STYLE[invite.status] ?? STATUS_STYLE[TournamentInviteStatus.Pending];
                                            const isSwap = invite.kind === TournamentInviteKind.Swap;
                                            return (
                                                <View
                                                    key={invite.id}
                                                    className="flex-row items-center gap-3 p-3 rounded-2xl bg-white/[0.025] border border-white/[0.06]"
                                                >
                                                    <PlayerAvatar src={invite.avatarUrl ?? undefined} name={invite.username} size="sm" />
                                                    <View className="flex-1">
                                                        <Text className="text-white font-bold text-[14px]" numberOfLines={1}>{invite.username}</Text>
                                                        <View className="flex-row flex-wrap items-center gap-x-1.5 mt-0.5">
                                                            <Text style={{ color: status.color, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}>
                                                                {t(status.key).toUpperCase()}
                                                            </Text>
                                                            {invite.isGuest && (
                                                                <Text style={{ color: INVITE_COLORS.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}>
                                                                    · {t('invites.guest').toUpperCase()}
                                                                </Text>
                                                            )}
                                                            {isSwap && (
                                                                <Text className="text-slate-500 text-[10.5px]" numberOfLines={1}>
                                                                    · {t('invites.modal.swapFor', { name: invite.swapOutgoingUsername || t('swap.thisPlayer') })}
                                                                </Text>
                                                            )}
                                                        </View>
                                                    </View>
                                                    {invite.status === TournamentInviteStatus.Pending && (
                                                        <Pressable
                                                            onPress={() => setCancelTarget(invite)}
                                                            hitSlop={6}
                                                            className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] active:opacity-70"
                                                        >
                                                            <Text className="text-slate-300 text-[11px] font-black">{t('invites.modal.cancelInvite')}</Text>
                                                        </Pressable>
                                                    )}
                                                </View>
                                            );
                                        })
                                    )}
                                </View>
                            )}
                        </ScrollView>

                        {/* Send bar */}
                        {view === 'pick' && (
                            <View className="px-5 pt-3 border-t border-white/[0.05]">
                                {guestCount > 0 && (
                                    <Text className="text-[11px] text-center mb-2.5 leading-4" style={{ color: INVITE_COLORS.text }}>
                                        {t('invites.modal.guestNote', { count: guestCount })}
                                    </Text>
                                )}
                                <Text className="text-slate-500 text-[11px] text-center mb-3 leading-4">{t('invites.modal.noReservationNote')}</Text>
                                <PressableScale
                                    onPress={handleSend}
                                    disabled={selectedList.length === 0 || sending}
                                    className="h-14 rounded-2xl flex-row items-center justify-center gap-2"
                                    style={{
                                        backgroundColor: selectedList.length === 0 || sending ? 'rgba(255,255,255,0.05)' : COLORS.primary,
                                        borderWidth: 1,
                                        borderColor: selectedList.length === 0 || sending ? 'rgba(255,255,255,0.08)' : COLORS.primary,
                                    }}
                                >
                                    {sending ? (
                                        <ActivityIndicator size="small" color={COLORS.primaryForeground} />
                                    ) : (
                                        <>
                                            <Ionicons name="paper-plane" size={17} color={selectedList.length ? COLORS.primaryForeground : '#64748B'} />
                                            <Text className="font-black text-[15px]" style={{ color: selectedList.length ? COLORS.primaryForeground : '#64748B' }}>
                                                {selectedList.length
                                                    ? t('invites.modal.sendCount', { count: selectedList.length })
                                                    : t('invites.modal.pickPlayers')}
                                            </Text>
                                        </>
                                    )}
                                </PressableScale>
                            </View>
                        )}
                    </View>
                </KeyboardAvoider>
            </View>

            {/* Overlay, not a nested Modal — see ConfirmationModal.overlay. */}
            <ConfirmationModal
                overlay
                visible={!!cancelTarget}
                onClose={() => setCancelTarget(null)}
                onConfirm={handleCancelInvite}
                title={t('invites.modal.cancelTitle')}
                message={t('invites.modal.cancelMessage', { name: cancelTarget?.username ?? '' })}
                confirmText={t('invites.modal.cancelInvite')}
                isDestructive
                isLoading={cancelling}
                stacked
            />
        </Modal>
    );
}

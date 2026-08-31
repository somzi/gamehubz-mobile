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
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { KeyboardAvoider } from '../ui/KeyboardAvoider';
import { ConfirmationModal } from './ConfirmationModal';
import { ENDPOINTS, authenticatedFetch, getErrorMessage } from '../../lib/api';
import { HubRole } from '../../types/hub';
import { COLORS } from '../../lib/theme';

export interface SwapEligibility {
    tournamentId: string;
    userId: string;
    username: string;
    avatarUrl?: string | null;
    format: number;
    canSwap: boolean;
    blockReason?: string | null;
    playedMatches: number;
    totalMatches: number;
    playedPercent: number;
    /** null on knockout / Swiss, where a single played match already blocks the swap. */
    maxPlayedPercent?: number | null;
    allowsPartiallyPlayed: boolean;
}

export interface SwapCandidate {
    userId: string;
    username: string;
    avatarUrl?: string | null;
    hubRole: HubRole;
}

interface SwapParticipantModalProps {
    visible: boolean;
    onClose: () => void;
    tournamentId: string;
    /** The participant being replaced — used for the header before eligibility lands. */
    outgoing: { userId: string; username: string; avatarUrl?: string | null } | null;
    /** Fires after the swap succeeded, with the replacement's name for the toast. */
    onSwapped: (incomingUsername: string) => void;
}

const ROLE_LABELS: Record<number, string> = {
    [HubRole.HubOwner]: 'Owner',
    [HubRole.HubAdmin]: 'Admin',
    [HubRole.HubExclusive]: 'Exclusive',
    [HubRole.HubMember]: 'Member',
};

const ROLE_ACCENTS: Record<number, string> = {
    [HubRole.HubOwner]: COLORS.warning,
    [HubRole.HubAdmin]: COLORS.info,
    [HubRole.HubExclusive]: COLORS.highlight,
    [HubRole.HubMember]: COLORS.slate400,
};

/**
 * Manager-only "hand this spot to someone else" sheet.
 *
 * Two screens in one sheet: pick a replacement from the hub's members, then confirm what carries
 * over. The eligibility verdict is never computed here — the rule depends on the format and on a
 * server-side threshold, so the backend decides and this only renders the numbers behind it. When
 * the swap is blocked the picker is not shown at all, so the organizer can't build a selection that
 * the confirm call would then reject.
 */
export function SwapParticipantModal({
    visible,
    onClose,
    tournamentId,
    outgoing,
    onSwapped,
}: SwapParticipantModalProps) {
    const insets = useSafeAreaInsets();

    const [eligibility, setEligibility] = useState<SwapEligibility | null>(null);
    const [loadingEligibility, setLoadingEligibility] = useState(false);
    const [eligibilityError, setEligibilityError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(0);

    const [selected, setSelected] = useState<SwapCandidate | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    // Handing over a spot transfers a real record, so the CTA asks first rather than firing on tap.
    const [confirming, setConfirming] = useState(false);

    // Guards every async result against a stale render: the sheet can be closed, or the search term
    // retyped, while a request is still in flight.
    const requestRef = useRef(0);

    const resetState = useCallback(() => {
        setEligibility(null);
        setEligibilityError(null);
        setSearch('');
        setCandidates([]);
        setHasMore(false);
        setPage(0);
        setSelected(null);
        setSubmitError(null);
        setSubmitting(false);
        setConfirming(false);
    }, []);

    const loadCandidates = useCallback(
        async (term: string, pageNumber: number) => {
            const token = ++requestRef.current;
            if (pageNumber === 0) setLoadingCandidates(true);
            else setLoadingMore(true);

            try {
                const response = await authenticatedFetch(
                    ENDPOINTS.PARTICIPANT_SWAP_CANDIDATES(tournamentId, term, pageNumber),
                );
                if (!response.ok) throw new Error(await response.text().catch(() => 'Failed to load members'));

                const data = await response.json();
                const list: SwapCandidate[] = data?.result ?? data ?? [];
                if (token !== requestRef.current) return;

                setCandidates((prev) => (pageNumber === 0 ? list : [...prev, ...list]));
                // A short page means the server ran out of members for this term.
                setHasMore(list.length >= 20);
                setPage(pageNumber);
            } catch {
                if (token === requestRef.current && pageNumber === 0) setCandidates([]);
            } finally {
                if (token === requestRef.current) {
                    setLoadingCandidates(false);
                    setLoadingMore(false);
                }
            }
        },
        [tournamentId],
    );

    // Open: read the verdict first, and only go looking for replacements when a swap is actually
    // possible — a blocked participant never needs a member list.
    useEffect(() => {
        if (!visible || !outgoing?.userId) return;

        let cancelled = false;
        resetState();
        setLoadingEligibility(true);

        (async () => {
            try {
                const response = await authenticatedFetch(
                    ENDPOINTS.PARTICIPANT_SWAP_ELIGIBILITY(tournamentId, outgoing.userId),
                );
                if (!response.ok) throw new Error(await response.text().catch(() => 'Failed to check eligibility'));

                const data = await response.json();
                const result: SwapEligibility = data?.result ?? data;
                if (cancelled) return;

                setEligibility(result);
                if (result?.canSwap) loadCandidates('', 0);
            } catch (err: any) {
                if (!cancelled) setEligibilityError(getErrorMessage(err));
            } finally {
                if (!cancelled) setLoadingEligibility(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [visible, outgoing?.userId, tournamentId, resetState, loadCandidates]);

    // Debounced search so typing doesn't fire a request per keystroke.
    useEffect(() => {
        if (!visible || !eligibility?.canSwap) return;

        const timer = setTimeout(() => loadCandidates(search.trim(), 0), 350);
        return () => clearTimeout(timer);
    }, [search, visible, eligibility?.canSwap, loadCandidates]);

    const handleConfirm = async () => {
        if (!outgoing?.userId || !selected || submitting) return;

        // The confirmation stays up with a spinner until the call lands; the catch below drops back
        // to the picker so the failure is readable next to the selection that caused it.
        setSubmitting(true);
        setSubmitError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.SWAP_PARTICIPANT(tournamentId), {
                method: 'POST',
                body: JSON.stringify({
                    outgoingUserId: outgoing.userId,
                    incomingUserId: selected.userId,
                }),
            });

            if (!response.ok) throw new Error(await response.text().catch(() => 'Swap failed'));

            const name = selected.username;

            // The confirmation is an in-sheet overlay, not a window, so dropping it costs
            // nothing and this sheet is the only window that closes here. Hand off to the
            // screen's success modal only once it is gone - same shape as ExportBracketModal.
            // Dismiss the keyboard first: the picker's TextInput may still hold focus, and an
            // IME left open across a Modal teardown is the other way Android strands a window.
            Keyboard.dismiss();
            setConfirming(false);
            onClose();
            setTimeout(() => onSwapped(name), 350);
        } catch (err: any) {
            setSubmitError(getErrorMessage(err));
            setConfirming(false);
        } finally {
            setSubmitting(false);
        }
    };

    const meter = useMemo(() => {
        if (!eligibility) return null;

        const { playedMatches, totalMatches, playedPercent, maxPlayedPercent, allowsPartiallyPlayed } = eligibility;
        const limit = allowsPartiallyPlayed ? maxPlayedPercent ?? null : 0;
        const fill = Math.max(playedPercent > 0 ? 4 : 0, Math.min(100, playedPercent));

        return { playedMatches, totalMatches, playedPercent, limit, fill, allowsPartiallyPlayed };
    }, [eligibility]);

    const blocked = !!eligibility && !eligibility.canSwap;
    const accent = blocked ? COLORS.destructive : COLORS.primary;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            // The confirmation no longer has a window of its own, so back has to be routed by hand.
            onRequestClose={() => {
                if (submitting) return;
                if (confirming) { setConfirming(false); return; }
                onClose();
            }}
        >
            <View className="flex-1 justify-end">
                <Pressable className="absolute inset-0 bg-black/70" onPress={submitting ? undefined : onClose} />

                <KeyboardAvoider bottomInset="none" style={{ maxHeight: '92%' }}>
                    <View
                        className="bg-card rounded-t-[32px] border-t border-x border-white/[0.07] overflow-hidden"
                        // flexShrink lets the sheet obey the parent's maxHeight instead of growing to
                        // its content: without it a full page of candidates pushed the confirm button
                        // out of the clipped area, so the swap could not be confirmed at all.
                        style={{ paddingBottom: Math.max(insets.bottom, 12), flexShrink: 1 }}
                    >
                        {/* Grab handle */}
                        <View className="self-center w-10 h-1 rounded-full bg-white/15 mt-3 mb-3" />

                        {/* ── Header ─────────────────────────────────────────────────────── */}
                        <View className="px-5 pb-4 flex-row items-center gap-3 border-b border-white/[0.05]">
                            <View
                                className="w-10 h-10 rounded-2xl items-center justify-center"
                                style={{
                                    backgroundColor: `${accent}1F`,
                                    borderWidth: 1,
                                    borderColor: `${accent}38`,
                                }}
                            >
                                <Ionicons name="people-circle-outline" size={21} color={accent} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white text-lg font-black" numberOfLines={1}>
                                    Replace player
                                </Text>
                                <Text className="text-slate-500 text-[11px] mt-0.5" numberOfLines={2}>
                                    The replacement inherits the spot, the seed and every result so far.
                                </Text>
                            </View>
                            <Pressable
                                onPress={submitting ? undefined : onClose}
                                hitSlop={8}
                                className="w-9 h-9 rounded-full bg-white/[0.05] items-center justify-center"
                            >
                                <Ionicons name="close" size={18} color="#94A3B8" />
                            </Pressable>
                        </View>

                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 8 }}
                            // Without flexShrink the list grows to its content height, pushes the
                            // confirm button past the sheet's maxHeight and the parent clips it —
                            // in a hub with a full page of candidates the swap became impossible to
                            // confirm unless the search narrowed the list first.
                            style={{ flexShrink: 1 }}
                        >
                            {/* ── Outgoing player + verdict ───────────────────────────────── */}
                            <View className="px-5 pt-4">
                                <Text className="text-[10px] font-black uppercase tracking-[1.6px] text-slate-500 mb-2.5">
                                    Leaving
                                </Text>

                                <View
                                    className="rounded-3xl overflow-hidden"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderWidth: 1, borderColor: `${accent}2E` }}
                                >
                                    <LinearGradient
                                        colors={[`${accent}16`, 'transparent']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 0.9, y: 1 }}
                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                    />

                                    <View className="flex-row items-center p-4 gap-3">
                                        <View style={{ borderWidth: 1.5, borderColor: `${accent}66`, borderRadius: 999, padding: 2 }}>
                                            <PlayerAvatar
                                                src={eligibility?.avatarUrl ?? outgoing?.avatarUrl ?? undefined}
                                                name={eligibility?.username || outgoing?.username || 'Player'}
                                                size="md"
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-white font-black text-[15px]" numberOfLines={1}>
                                                {eligibility?.username || outgoing?.username || 'Player'}
                                            </Text>
                                            {loadingEligibility ? (
                                                <Text className="text-slate-500 text-[11px] mt-1">Checking eligibility…</Text>
                                            ) : meter ? (
                                                <Text className="text-slate-400 text-[11px] mt-1">
                                                    {meter.playedMatches} of {meter.totalMatches}{' '}
                                                    {meter.totalMatches === 1 ? 'match' : 'matches'} played
                                                </Text>
                                            ) : null}
                                        </View>

                                        {loadingEligibility ? (
                                            <ActivityIndicator size="small" color={COLORS.slate400} />
                                        ) : eligibility ? (
                                            <View
                                                className="px-2.5 py-1 rounded-full flex-row items-center gap-1"
                                                style={{ backgroundColor: `${accent}1F`, borderWidth: 1, borderColor: `${accent}44` }}
                                            >
                                                <Ionicons
                                                    name={blocked ? 'lock-closed' : 'checkmark-circle'}
                                                    size={11}
                                                    color={accent}
                                                />
                                                <Text
                                                    style={{ color: accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }}
                                                >
                                                    {blocked ? 'LOCKED' : 'ALLOWED'}
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>

                                    {/* Progress meter — only meaningful once there are fixtures to play. */}
                                    {meter && meter.totalMatches > 0 && (
                                        <View className="px-4 pb-4">
                                            <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                                                <View
                                                    style={{
                                                        width: `${meter.fill}%`,
                                                        height: '100%',
                                                        borderRadius: 999,
                                                        backgroundColor: accent,
                                                    }}
                                                />
                                            </View>
                                            <View className="flex-row items-center justify-between mt-2">
                                                <Text className="text-[10px] font-bold" style={{ color: accent }}>
                                                    {meter.playedPercent}% played
                                                </Text>
                                                <Text className="text-[10px] font-bold text-slate-500">
                                                    {meter.allowsPartiallyPlayed && meter.limit !== null
                                                        ? `Limit ${meter.limit}%`
                                                        : 'Must be unplayed'}
                                                </Text>
                                            </View>
                                        </View>
                                    )}
                                </View>

                                {/* Why it's blocked, in the backend's own words. */}
                                {(eligibilityError || (blocked && eligibility?.blockReason)) && (
                                    <View
                                        className="flex-row items-start gap-2.5 mt-3 p-3.5 rounded-2xl"
                                        style={{
                                            backgroundColor: 'rgba(239,68,68,0.08)',
                                            borderWidth: 1,
                                            borderColor: 'rgba(239,68,68,0.22)',
                                        }}
                                    >
                                        <Ionicons name="information-circle" size={16} color={COLORS.destructive} />
                                        <Text className="flex-1 text-[12px] leading-[17px] text-red-200">
                                            {eligibilityError || eligibility?.blockReason}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* ── Replacement picker ──────────────────────────────────────── */}
                            {eligibility?.canSwap && (
                                <View className="px-5 pt-5">
                                    <View className="flex-row items-center justify-between mb-2.5">
                                        <Text className="text-[10px] font-black uppercase tracking-[1.6px] text-slate-500">
                                            Coming in
                                        </Text>
                                        {selected && (
                                            <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                                                <Text className="text-[11px] font-bold text-slate-400">Clear</Text>
                                            </Pressable>
                                        )}
                                    </View>

                                    {/* Search */}
                                    <View
                                        className="flex-row items-center gap-2.5 h-12 px-3.5 rounded-2xl mb-3"
                                        style={{
                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                            borderWidth: 1,
                                            borderColor: 'rgba(255,255,255,0.08)',
                                        }}
                                    >
                                        <Ionicons name="search" size={17} color="#64748B" />
                                        <TextInput
                                            value={search}
                                            onChangeText={setSearch}
                                            placeholder="Search hub members…"
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

                                    {loadingCandidates ? (
                                        <View className="py-10 items-center">
                                            <ActivityIndicator size="small" color={COLORS.primary} />
                                        </View>
                                    ) : candidates.length === 0 ? (
                                        <View
                                            className="items-center py-9 px-6 rounded-3xl"
                                            style={{
                                                backgroundColor: 'rgba(255,255,255,0.02)',
                                                borderWidth: 1,
                                                borderColor: 'rgba(255,255,255,0.06)',
                                            }}
                                        >
                                            <Ionicons name="person-remove-outline" size={34} color="#475569" />
                                            <Text className="text-slate-400 text-[13px] font-bold mt-3 text-center">
                                                {search.trim() ? 'No member matches that name' : 'No members left to swap in'}
                                            </Text>
                                            <Text className="text-slate-600 text-[11px] mt-1.5 text-center leading-4">
                                                Everyone already in this tournament is hidden from the list.
                                            </Text>
                                        </View>
                                    ) : (
                                        <View className="gap-2">
                                            {candidates.map((candidate) => {
                                                const isSelected = selected?.userId === candidate.userId;
                                                const roleAccent = ROLE_ACCENTS[candidate.hubRole] ?? COLORS.slate400;

                                                return (
                                                    <PressableScale
                                                        key={candidate.userId}
                                                        onPress={() => setSelected(isSelected ? null : candidate)}
                                                        className="flex-row items-center gap-3 p-3 rounded-2xl"
                                                        style={{
                                                            backgroundColor: isSelected
                                                                ? 'rgba(16,185,129,0.10)'
                                                                : 'rgba(255,255,255,0.025)',
                                                            borderWidth: 1,
                                                            borderColor: isSelected
                                                                ? 'rgba(16,185,129,0.40)'
                                                                : 'rgba(255,255,255,0.06)',
                                                        }}
                                                    >
                                                        <PlayerAvatar
                                                            src={candidate.avatarUrl ?? undefined}
                                                            name={candidate.username}
                                                            size="sm"
                                                        />
                                                        <View className="flex-1">
                                                            <Text className="text-white font-bold text-[14px]" numberOfLines={1}>
                                                                {candidate.username}
                                                            </Text>
                                                            <Text
                                                                className="text-[10px] font-black uppercase tracking-wider mt-0.5"
                                                                style={{ color: roleAccent }}
                                                            >
                                                                {ROLE_LABELS[candidate.hubRole] ?? 'Member'}
                                                            </Text>
                                                        </View>
                                                        <View
                                                            className="w-6 h-6 rounded-full items-center justify-center"
                                                            style={{
                                                                backgroundColor: isSelected ? COLORS.primary : 'rgba(255,255,255,0.05)',
                                                                borderWidth: 1,
                                                                borderColor: isSelected
                                                                    ? COLORS.primary
                                                                    : 'rgba(255,255,255,0.12)',
                                                            }}
                                                        >
                                                            {isSelected && (
                                                                <Ionicons name="checkmark" size={14} color={COLORS.primaryForeground} />
                                                            )}
                                                        </View>
                                                    </PressableScale>
                                                );
                                            })}

                                            {hasMore && (
                                                <Pressable
                                                    onPress={() => loadCandidates(search.trim(), page + 1)}
                                                    disabled={loadingMore}
                                                    className="h-11 rounded-2xl items-center justify-center mt-1"
                                                    style={{
                                                        backgroundColor: 'rgba(255,255,255,0.035)',
                                                        borderWidth: 1,
                                                        borderColor: 'rgba(255,255,255,0.07)',
                                                    }}
                                                >
                                                    {loadingMore ? (
                                                        <ActivityIndicator size="small" color={COLORS.slate400} />
                                                    ) : (
                                                        <Text className="text-slate-300 font-bold text-[12px]">Load more</Text>
                                                    )}
                                                </Pressable>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}
                        </ScrollView>

                        {/* ── Confirm bar ─────────────────────────────────────────────────── */}
                        {eligibility?.canSwap && (
                            <View className="px-5 pt-3 border-t border-white/[0.05]">
                                {/* Live "A ⇄ B" preview so the direction of the swap is never ambiguous. */}
                                {selected && (
                                    <View className="flex-row items-center justify-center gap-2.5 mb-3">
                                        <Text className="text-slate-400 text-[12px] font-bold flex-shrink" numberOfLines={1}>
                                            {eligibility.username || outgoing?.username}
                                        </Text>
                                        <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
                                        <Text className="text-white text-[12px] font-black flex-shrink" numberOfLines={1}>
                                            {selected.username}
                                        </Text>
                                    </View>
                                )}

                                {selected && eligibility.playedMatches > 0 && (
                                    <Text className="text-slate-500 text-[11px] text-center mb-3 leading-4">
                                        {selected.username} inherits {eligibility.playedMatches}{' '}
                                        {eligibility.playedMatches === 1 ? 'played match' : 'played matches'} and the
                                        standings that go with them.
                                    </Text>
                                )}

                                {submitError && (
                                    <View
                                        className="flex-row items-start gap-2 p-3 rounded-2xl mb-3"
                                        style={{
                                            backgroundColor: 'rgba(239,68,68,0.08)',
                                            borderWidth: 1,
                                            borderColor: 'rgba(239,68,68,0.22)',
                                        }}
                                    >
                                        <Ionicons name="alert-circle" size={15} color={COLORS.destructive} />
                                        <Text className="flex-1 text-[12px] leading-[17px] text-red-200">{submitError}</Text>
                                    </View>
                                )}

                                <PressableScale
                                    onPress={() => selected && setConfirming(true)}
                                    disabled={!selected || submitting}
                                    className="h-14 rounded-2xl flex-row items-center justify-center gap-2"
                                    style={{
                                        backgroundColor: !selected || submitting ? 'rgba(255,255,255,0.05)' : COLORS.primary,
                                        borderWidth: 1,
                                        borderColor: !selected || submitting ? 'rgba(255,255,255,0.08)' : COLORS.primary,
                                    }}
                                >
                                    {submitting ? (
                                        <ActivityIndicator size="small" color={COLORS.primaryForeground} />
                                    ) : (
                                        <>
                                            <Ionicons
                                                name="swap-horizontal"
                                                size={18}
                                                color={selected ? COLORS.primaryForeground : '#64748B'}
                                            />
                                            <Text
                                                className="font-black text-[15px]"
                                                style={{ color: selected ? COLORS.primaryForeground : '#64748B' }}
                                            >
                                                {selected ? `Swap in ${selected.username}` : 'Pick a replacement'}
                                            </Text>
                                        </>
                                    )}
                                </PressableScale>
                            </View>
                        )}
                    </View>
                </KeyboardAvoider>
            </View>

            {/* Overlay, not a nested Modal: this keeps the sheet and its confirmation in one
                Android window, so closing them cannot strand a window over the screen. */}
            <ConfirmationModal
                overlay
                visible={confirming && !!selected}
                onClose={() => setConfirming(false)}
                onConfirm={handleConfirm}
                title="Confirm the replacement"
                message={selected
                    ? `${selected.username} takes over ${eligibility?.username || outgoing?.username || 'this player'}'s spot in the tournament.`
                        + (eligibility && eligibility.playedMatches > 0
                            ? `\n\nThey inherit ${eligibility.playedMatches === 1 ? '1 played match' : `${eligibility.playedMatches} played matches`}, the seed and the standings that go with them.`
                            : '\n\nThey take the seed and the fixtures that go with the spot.')
                        + `\n\n${eligibility?.username || 'The outgoing player'} is removed from this tournament.`
                    : ''}
                confirmText="Swap the player"
                isDestructive={false}
                isLoading={submitting}
                stacked
            />
        </Modal>
    );
}

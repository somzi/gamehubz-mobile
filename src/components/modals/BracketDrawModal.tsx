import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { SearchInput } from '../ui/SearchInput';
import { KeyboardAvoider } from '../ui/KeyboardAvoider';
import { ConfirmationModal } from './ConfirmationModal';
import { COLORS } from '../../lib/theme';
import { groupLabel } from '../../lib/groups';
import {
    BracketSeedingMode,
    getStandardSeedOrder,
    type BracketDrawEntrant,
    type BracketDrawOptions,
    type BracketDrawPlan,
} from '../../types/tournament';

export interface BracketDrawModalProps {
    visible: boolean;
    onClose: () => void;
    /** Draw setup from the draw-options endpoint. Null while it's still loading. */
    options: BracketDrawOptions | null;
    loading?: boolean;
    error?: string | null;
    /** True while the bracket is being generated. */
    busy?: boolean;
    onRetry?: () => void;
    onConfirm: (mode: BracketSeedingMode, plan: BracketDrawPlan | null) => void;
}

type Step = 'mode' | 'arrange';

/** Which spot the entrant picker is currently filling. */
type PickerTarget =
    | { kind: 'slot'; index: number }
    | { kind: 'bucket'; index: number };

const shuffle = <T,>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

const MODE_ACCENT: Record<BracketSeedingMode, string> = {
    [BracketSeedingMode.Random]: COLORS.primary,
    [BracketSeedingMode.Manual]: COLORS.info,
    [BracketSeedingMode.Seeded]: COLORS.warning,
    [BracketSeedingMode.Pots]: COLORS.highlight,
};

const MODE_ICON: Record<BracketSeedingMode, keyof typeof Ionicons.glyphMap> = {
    [BracketSeedingMode.Random]: 'shuffle',
    [BracketSeedingMode.Manual]: 'hand-left',
    [BracketSeedingMode.Seeded]: 'trending-up',
    [BracketSeedingMode.Pots]: 'albums',
};

function modeTitle(mode: BracketSeedingMode) {
    switch (mode) {
        case BracketSeedingMode.Manual: return 'Manual';
        case BracketSeedingMode.Seeded: return 'Seeded';
        case BracketSeedingMode.Pots: return 'Pot draw';
        default: return 'Random';
    }
}

function modeSubtitle(mode: BracketSeedingMode, options: BracketDrawOptions, isGroups: boolean) {
    const who = options.isTeamTournament ? 'teams' : 'players';

    switch (mode) {
        case BracketSeedingMode.Random:
            return isGroups
                ? `The ${who} are shuffled and spread evenly across the groups.`
                : `The ${who} are shuffled into the bracket. One tap, nothing to set up.`;

        case BracketSeedingMode.Manual:
            return isGroups
                ? 'You fill every group sheet yourself.'
                : `You place every entrant yourself — pick the pairings and who gets a bye.`;

        case BracketSeedingMode.Seeded:
            return isGroups
                ? 'Registration order snakes across the groups, so the early joiners are split up.'
                : 'Registration order is the ranking: #1 v #N, #2 v #N-1 … and the top seeds take the byes.';

        case BracketSeedingMode.Pots:
            return `Sort the ${who} into ${options.potCount ?? 0} pots — each group draws one name out of every pot.`;

        default:
            return '';
    }
}

/** Groups and pots share the same bucket editor; only the labels and the size rules differ. */
type BucketKind = 'group' | 'pot';

function initialsOf(name: string) {
    return (name || '')
        .split(' ')
        .map((part) => part?.[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

/**
 * Full-screen draw picker shown instead of firing the bracket generation straight off the Create
 * Bracket button. Step one chooses how the draw is made; step two — only for the hand-made modes —
 * hands the whole screen to the bracket (or group sheets) and opens a searchable entrant picker
 * when a spot is tapped. Keeping the field in a sheet rather than a chip rail is deliberate: a rail
 * wraps into ragged rows and eats the space the bracket itself needs.
 */
export function BracketDrawModal({
    visible,
    onClose,
    options,
    loading,
    error,
    busy,
    onRetry,
    onConfirm,
}: BracketDrawModalProps) {
    const insets = useSafeAreaInsets();

    const [step, setStep] = useState<Step>('mode');
    const [mode, setMode] = useState<BracketSeedingMode>(BracketSeedingMode.Random);
    /** Elimination: one entry per bracket slot, null = empty (a bye once the draw is complete). */
    const [slots, setSlots] = useState<(string | null)[]>([]);
    /** Group / pot formats: bucket index → participant ids. */
    const [buckets, setBuckets] = useState<string[][]>([]);
    /** The spot whose entrant picker is open, if any. */
    const [picker, setPicker] = useState<PickerTarget | null>(null);
    const [search, setSearch] = useState('');
    /** Last stop before the tournament goes live and every participant is notified. */
    const [confirming, setConfirming] = useState(false);

    const isGroups = !!options?.groupsCount && options.groupsCount > 0;
    const bracketSize = options?.bracketSize ?? 0;
    const groupsCount = options?.groupsCount ?? 0;
    const potCount = options?.potCount ?? 0;
    const entrantCount = options?.entrantCount ?? 0;

    const entrantById = useMemo(() => {
        const map = new Map<string, BracketDrawEntrant>();
        (options?.entrants ?? []).forEach((e) => map.set(e.participantId, e));
        return map;
    }, [options]);

    // Re-arm whenever the sheet opens or the field changes underneath it (a late approval, a
    // removed player) — a stale plan would be rejected by the server anyway.
    const fieldSignature = (options?.entrants ?? []).map((e) => e.participantId).join(',');
    useEffect(() => {
        if (!visible) return;
        setStep('mode');
        setPicker(null);
        setSearch('');
        setConfirming(false);
        setMode(options?.supportedModes?.[0] ?? BracketSeedingMode.Random);
        setSlots([]);
        setBuckets([]);
    }, [visible, fieldSignature]);

    const bucketKind: BucketKind = mode === BracketSeedingMode.Pots ? 'pot' : 'group';
    const bucketCount = bucketKind === 'pot' ? potCount : groupsCount;

    /** Pots hold one entrant per group; the last pot takes whatever is left over. */
    const potTarget = (index: number) => Math.min(groupsCount, entrantCount - index * groupsCount);

    const startArranging = () => {
        if (!options) return;
        if (isGroups) {
            setBuckets(Array.from({ length: bucketCount }, () => []));
        } else {
            setSlots(Array.from({ length: bracketSize }, () => null));
        }
        setPicker(null);
        setStep('arrange');
    };

    const placedIds = useMemo(() => {
        const ids = isGroups ? buckets.flat() : slots.filter((s): s is string => !!s);
        return new Set(ids);
    }, [isGroups, buckets, slots]);

    const unassigned = useMemo(
        () => (options?.entrants ?? []).filter((e) => !placedIds.has(e.participantId)),
        [options, placedIds]
    );

    const visiblePool = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return unassigned;
        return unassigned.filter((e) => e.displayName.toLowerCase().includes(query));
    }, [unassigned, search]);

    // ---- placement -------------------------------------------------------

    const openPicker = (target: PickerTarget) => {
        if (busy) return;
        setSearch('');
        setPicker(target);
    };

    const closePicker = () => {
        setPicker(null);
        setSearch('');
    };

    /** Places the chosen entrant into whatever spot the picker was opened for. */
    const choose = (participantId: string) => {
        if (!picker) return;

        if (picker.kind === 'slot') {
            // Anyone already sitting there drops back into the pool.
            setSlots((prev) => prev.map((value, i) => (i === picker.index ? participantId : value)));
        } else {
            setBuckets((prev) => prev.map((b, i) => (i === picker.index ? [...b, participantId] : b)));
        }

        closePicker();
    };

    const clearSlot = (slotIndex: number) => {
        setSlots((prev) => prev.map((value, i) => (i === slotIndex ? null : value)));
        closePicker();
    };

    const removeFromBucket = (bucketIndex: number, participantId: string) => {
        setBuckets((prev) => prev.map((b, i) => (i === bucketIndex ? b.filter((x) => x !== participantId) : b)));
    };

    const clearAll = () => {
        closePicker();
        if (isGroups) setBuckets(Array.from({ length: bucketCount }, () => []));
        else setSlots(Array.from({ length: bracketSize }, () => null));
    };

    /** Fills what's still empty at random, leaving anything already placed alone. */
    const autoFill = () => {
        const pool = shuffle(unassigned.map((e) => e.participantId));
        if (!pool.length) return;
        closePicker();

        if (!isGroups) {
            // Byes belong opposite the top seeds, so prefer the slots the standard spread leaves
            // empty (seed > entrant count) and fill everything else first.
            const seedOrder = getStandardSeedOrder(bracketSize);
            const empty = slots
                .map((value, index) => ({ value, index }))
                .filter((s) => !s.value)
                .map((s) => s.index)
                .sort((a, b) => seedOrder[a] - seedOrder[b]);

            const next = [...slots];
            empty.forEach((slotIndex) => {
                const id = pool.shift();
                if (id) next[slotIndex] = id;
            });
            setSlots(next);
            return;
        }

        const next = buckets.map((b) => [...b]);
        if (bucketKind === 'pot') {
            for (let i = 0; i < next.length && pool.length; i++) {
                while (next[i].length < potTarget(i) && pool.length) next[i].push(pool.shift()!);
            }
        } else {
            // Always top up the smallest group, so an uneven field stays within one of itself.
            while (pool.length) {
                let smallest = 0;
                for (let i = 1; i < next.length; i++) if (next[i].length < next[smallest].length) smallest = i;
                next[smallest].push(pool.shift()!);
            }
        }
        setBuckets(next);
    };

    // ---- validation ------------------------------------------------------

    /** Index of the first round-1 match with neither side filled, or -1. */
    const emptyMatchIndex = () => {
        for (let i = 0; i + 1 < slots.length; i += 2) {
            if (!slots[i] && !slots[i + 1]) return i / 2;
        }
        return -1;
    };

    const problem = useMemo(() => {
        if (step !== 'arrange' || !options) return null;
        if (unassigned.length > 0) {
            const noun = options.isTeamTournament ? 'team' : 'player';
            return `${unassigned.length} ${noun}${unassigned.length === 1 ? '' : 's'} still to place.`;
        }
        if (bucketKind === 'pot') {
            const bad = buckets.findIndex((b, i) => b.length !== potTarget(i));
            if (bad >= 0) return `Pot ${bad + 1} needs exactly ${potTarget(bad)} — it has ${buckets[bad].length}.`;
        } else if (isGroups) {
            const bad = buckets.findIndex((b) => b.length < 2);
            if (bad >= 0) return `Group ${groupLabel(bad, groupsCount)} needs at least 2 — a one-entrant group never plays.`;
        } else {
            // Both sides empty isn't a bye, it's a match nobody can ever play — and the round it
            // feeds would wait forever for a winner. The server rejects it too.
            const bad = emptyMatchIndex();
            if (bad >= 0) return `Match ${bad + 1} is empty — spread the byes out so every match has someone in it.`;
        }
        return null;
    }, [step, options, unassigned.length, buckets, bucketKind, isGroups, slots]);

    // The server validates a plan against its own entrant list, so a payload whose list doesn't
    // match its own count could never produce a valid draw — say so instead of rendering an empty
    // bracket that reports "everyone is placed".
    const payloadBroken = !!options && (options.entrants?.length ?? 0) !== entrantCount;
    const shownError = error ?? (payloadBroken ? 'The entrant list came back incomplete. Pull to refresh and open the draw again.' : null);

    const needsSetup = mode === BracketSeedingMode.Manual || mode === BracketSeedingMode.Pots;
    const canSubmit = !busy && !!options && !payloadBroken && entrantCount >= 2 && !problem;

    /** The CTA either advances to the arrange step, or asks for confirmation — never generates. */
    const submit = () => {
        if (!options || busy) return;

        if (step === 'mode' && needsSetup) {
            startArranging();
            return;
        }

        if (problem) return;

        setConfirming(true);
    };

    /** Fires only after the confirmation is accepted. */
    const generate = () => {
        setConfirming(false);

        if (step === 'mode') {
            onConfirm(mode, null);
            return;
        }

        if (mode === BracketSeedingMode.Pots) onConfirm(mode, { pots: buckets });
        else if (isGroups) onConfirm(mode, { groups: buckets });
        else onConfirm(mode, { slots });
    };

    // ---- pieces ----------------------------------------------------------

    const renderSlot = (slotIndex: number, sideLabel: string) => {
        const id = slots[slotIndex];
        const entrant = id ? entrantById.get(id) : undefined;
        const drawDone = unassigned.length === 0;

        return (
            <Pressable
                onPress={() => openPicker({ kind: 'slot', index: slotIndex })}
                className="flex-row items-center gap-2.5 px-3 py-2.5 rounded-2xl border"
                style={{
                    backgroundColor: entrant ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.02)',
                    borderColor: entrant ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
                    borderStyle: entrant ? 'solid' : 'dashed',
                }}
            >
                <Text className="text-[10px] font-black text-slate-600 w-4">{sideLabel}</Text>

                {entrant ? (
                    <>
                        <PlayerAvatar src={entrant.avatarUrl ?? undefined} name={entrant.displayName} size="sm" />
                        <Text className="flex-1 text-[13px] font-bold text-slate-100" numberOfLines={1}>
                            {entrant.displayName}
                        </Text>
                        <Ionicons name="swap-horizontal" size={15} color={COLORS.slate600} />
                    </>
                ) : (
                    <>
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-white/[0.04]">
                            <Ionicons name="add" size={16} color={COLORS.slate600} />
                        </View>
                        <Text className="flex-1 text-[12px] font-bold text-slate-600">
                            {drawDone ? 'BYE' : 'Tap to add'}
                        </Text>
                    </>
                )}
            </Pressable>
        );
    };

    const renderBracketEditor = () => {
        const matchCount = Math.max(0, Math.floor(bracketSize / 2));

        return (
            <View className="px-5 pb-4" style={{ gap: 10 }}>
                {Array.from({ length: matchCount }, (_, i) => {
                    const home = slots[i * 2];
                    const away = slots[i * 2 + 1];
                    const drawDone = unassigned.length === 0;
                    const isBye = (!!home !== !!away) && drawDone;
                    // Nobody on either side once the field is placed — not a bye, an unplayable match.
                    const isEmpty = !home && !away && drawDone;

                    return (
                        <View
                            key={`match-${i}`}
                            className="rounded-3xl border p-3"
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                borderColor: isEmpty ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.06)',
                            }}
                        >
                            <View className="flex-row items-center justify-between mb-2 px-1">
                                <Text className="text-[10px] font-black tracking-widest uppercase text-slate-500">
                                    Match {i + 1}
                                </Text>
                                {isEmpty ? (
                                    <View className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30">
                                        <Text className="text-[9px] font-black tracking-wider text-red-300">NOBODY HERE</Text>
                                    </View>
                                ) : isBye ? (
                                    <View className="px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30">
                                        <Text className="text-[9px] font-black tracking-wider text-amber-300">BYE</Text>
                                    </View>
                                ) : null}
                            </View>

                            <View style={{ gap: 6 }}>
                                {renderSlot(i * 2, '1')}
                                {renderSlot(i * 2 + 1, '2')}
                            </View>
                        </View>
                    );
                })}
            </View>
        );
    };

    const renderBucketEditor = () => (
        <View className="px-5 pb-4" style={{ gap: 10 }}>
            {buckets.map((bucket, index) => {
                const isPot = bucketKind === 'pot';
                const target = isPot ? potTarget(index) : 0;
                const isFull = isPot && bucket.length === target;
                const accent = isPot ? COLORS.highlight : COLORS.info;

                return (
                    <View
                        key={`bucket-${index}`}
                        className="rounded-3xl border p-3"
                        style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
                    >
                        <View className="flex-row items-center justify-between mb-2.5 px-1">
                            <View className="flex-row items-center gap-2">
                                <View
                                    className="w-6 h-6 rounded-lg items-center justify-center"
                                    style={{ backgroundColor: accent + '1F', borderWidth: 1, borderColor: accent + '38' }}
                                >
                                    <Text className="text-[10px] font-black" style={{ color: accent }}>
                                        {isPot ? index + 1 : groupLabel(index, groupsCount)}
                                    </Text>
                                </View>
                                <Text className="text-[13px] font-black text-white">
                                    {isPot ? `Pot ${index + 1}` : `Group ${groupLabel(index, groupsCount)}`}
                                </Text>
                            </View>

                            <Text
                                className="text-[10px] font-black tracking-wide"
                                style={{ color: isPot && isFull ? COLORS.primary : COLORS.slate500 }}
                            >
                                {isPot ? `${bucket.length}/${target}` : `${bucket.length}`}
                            </Text>
                        </View>

                        <View style={{ gap: 6 }}>
                            {bucket.map((participantId) => {
                                const entrant = entrantById.get(participantId);
                                return (
                                    <Pressable
                                        key={participantId}
                                        onPress={() => removeFromBucket(index, participantId)}
                                        className="flex-row items-center gap-2.5 px-3 py-2 rounded-2xl border border-white/[0.07]"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.045)' }}
                                    >
                                        <View className="w-7 h-7 rounded-full items-center justify-center bg-white/[0.06]">
                                            <Text className="text-[9px] font-black text-slate-300">
                                                {initialsOf(entrant?.displayName ?? '?')}
                                            </Text>
                                        </View>
                                        <Text className="flex-1 text-[13px] font-bold text-slate-100" numberOfLines={1}>
                                            {entrant?.displayName ?? 'Unknown'}
                                        </Text>
                                        <Ionicons name="close-circle-outline" size={16} color={COLORS.slate600} />
                                    </Pressable>
                                );
                            })}

                            {unassigned.length > 0 ? (
                                <Pressable
                                    onPress={() => openPicker({ kind: 'bucket', index })}
                                    className="flex-row items-center justify-center gap-2 py-2.5 rounded-2xl border"
                                    style={{ borderColor: accent + '4D', borderStyle: 'dashed', backgroundColor: accent + '0F' }}
                                >
                                    <Ionicons name="add" size={15} color={accent} />
                                    <Text className="text-[12px] font-black" style={{ color: accent }}>
                                        Add {options?.isTeamTournament ? 'team' : 'player'}
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                    </View>
                );
            })}
        </View>
    );

    const renderModeStep = () => {
        if (!options) return null;

        if (entrantCount < 2) {
            return (
                <View className="py-12 px-8 items-center">
                    <Ionicons name="people-outline" size={32} color={COLORS.slate600} />
                    <Text className="text-slate-400 text-sm text-center mt-3">
                        A bracket needs at least 2 {options.isTeamTournament ? 'teams' : 'players'} — there
                        {entrantCount === 1 ? ' is 1' : ' are none'} so far.
                    </Text>
                </View>
            );
        }

        return (
            <View className="px-5 pb-4" style={{ gap: 10 }}>
                {options.supportedModes.map((supported) => {
                    const active = supported === mode;
                    const accent = MODE_ACCENT[supported] ?? COLORS.primary;

                    return (
                        <PressableScale
                            key={supported}
                            onPress={() => setMode(supported)}
                            className="flex-row items-center gap-3.5 rounded-3xl border p-4"
                            style={{
                                backgroundColor: active ? accent + '14' : 'rgba(255,255,255,0.02)',
                                borderColor: active ? accent + '66' : 'rgba(255,255,255,0.06)',
                            }}
                        >
                            <View
                                className="w-11 h-11 rounded-2xl items-center justify-center"
                                style={{ backgroundColor: accent + '1F', borderWidth: 1, borderColor: accent + '38' }}
                            >
                                <Ionicons name={MODE_ICON[supported]} size={21} color={accent} />
                            </View>

                            <View className="flex-1">
                                <Text className="text-[15px] font-black text-white">{modeTitle(supported)}</Text>
                                <Text className="text-slate-400 text-[11px] mt-1 leading-4">
                                    {modeSubtitle(supported, options, isGroups)}
                                </Text>
                            </View>

                            <Ionicons
                                name={active ? 'radio-button-on' : 'radio-button-off'}
                                size={18}
                                color={active ? accent : COLORS.slate600}
                            />
                        </PressableScale>
                    );
                })}

                <View
                    className="flex-row items-center gap-2 rounded-2xl px-3.5 py-3 mt-1"
                    style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}
                >
                    <Ionicons name="information-circle-outline" size={15} color={COLORS.slate500} />
                    <Text className="flex-1 text-[11px] text-slate-500 leading-4">
                        {isGroups
                            ? `${entrantCount} entrants · ${groupsCount} groups${options.qualifiersPerGroup ? ` · top ${options.qualifiersPerGroup} advance` : ''}`
                            : `${entrantCount} entrants · bracket of ${bracketSize}${(options.byeCount ?? 0) > 0 ? ` · ${options.byeCount} bye${options.byeCount === 1 ? '' : 's'}` : ''}`}
                    </Text>
                </View>
            </View>
        );
    };

    /**
     * Entrant picker. A full-screen layer, not a bottom sheet: a sheet anchored to the bottom sits
     * right where the keyboard comes up, and no amount of keyboard-inset maths inside a Modal is
     * reliable across both platforms. With the search pinned to the top, the keyboard can only ever
     * cover the tail of a list that scrolls anyway. Not a nested <Modal> either — stacking modals is
     * unreliable on iOS.
     */
    const renderPicker = () => {
        if (!picker || !options) return null;

        const occupantId = picker.kind === 'slot' ? slots[picker.index] : null;
        const occupant = occupantId ? entrantById.get(occupantId) : undefined;

        const title = picker.kind === 'slot'
            ? `Match ${Math.floor(picker.index / 2) + 1} · side ${(picker.index % 2) + 1}`
            : bucketKind === 'pot'
                ? `Pot ${picker.index + 1}`
                : `Group ${groupLabel(picker.index, groupsCount)}`;

        // Inline styles, not className — the codebase keeps Animated.View on plain styles
        // (NativeWind's interop on it isn't relied on anywhere else).
        return (
            <Animated.View
                entering={FadeIn.duration(120)}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 30,
                    backgroundColor: COLORS.background,
                }}
            >
                {/* Header */}
                <View className="px-5 pt-4 pb-3 flex-row items-center gap-3 border-b border-white/[0.05]">
                    <Pressable
                        onPress={closePicker}
                        className="w-9 h-9 rounded-2xl items-center justify-center bg-white/[0.05] border border-white/[0.06]"
                    >
                        <Ionicons name="chevron-back" size={18} color={COLORS.slate300} />
                    </Pressable>

                    <View className="flex-1">
                        <Text className="text-[16px] font-black text-white" numberOfLines={1}>{title}</Text>
                        <Text className="text-[11px] text-slate-500 mt-0.5">
                            {unassigned.length} left to place
                        </Text>
                    </View>

                    <Pressable onPress={closePicker} className="w-9 h-9 items-center justify-center rounded-full bg-white/[0.04]">
                        <Ionicons name="close" size={17} color={COLORS.slate400} />
                    </Pressable>
                </View>

                {/* Search stays pinned above the list, so it is never the thing the keyboard hides. */}
                <View className="px-5 pt-3 pb-2">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder={`Search ${options.isTeamTournament ? 'teams' : 'players'}…`}
                    />
                </View>

                <ScrollView
                    className="flex-1 px-5"
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingTop: 4, paddingBottom: Math.max(insets.bottom, 16) + 24 }}
                >
                    {occupant ? (
                        <Pressable
                            onPress={() => clearSlot(picker.index)}
                            className="flex-row items-center gap-3 px-3 py-3 rounded-2xl border mb-2"
                            style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.28)' }}
                        >
                            <View className="w-8 h-8 rounded-full items-center justify-center bg-red-500/15">
                                <Ionicons name="close" size={16} color="#F87171" />
                            </View>
                            <Text className="flex-1 text-[13px] font-bold text-red-300" numberOfLines={1}>
                                Clear this spot ({occupant.displayName})
                            </Text>
                        </Pressable>
                    ) : null}

                    {visiblePool.map((entrant) => (
                        <Pressable
                            key={entrant.participantId}
                            onPress={() => choose(entrant.participantId)}
                            className="flex-row items-center gap-3 px-3 py-3 rounded-2xl border border-white/[0.06] mb-2"
                            style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                        >
                            <PlayerAvatar src={entrant.avatarUrl ?? undefined} name={entrant.displayName} size="sm" />
                            <Text className="flex-1 text-[14px] font-bold text-slate-100" numberOfLines={1}>
                                {entrant.displayName}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />
                        </Pressable>
                    ))}

                    {visiblePool.length === 0 ? (
                        <Text className="text-[12px] text-slate-500 py-8 text-center">
                            {unassigned.length === 0
                                ? 'Everyone is already placed.'
                                : `Nobody left to place matches “${search.trim()}”.`}
                        </Text>
                    ) : null}
                </ScrollView>
            </Animated.View>
        );
    };

    const headerSubtitle = step === 'mode'
        ? 'How should the opening fixtures be decided?'
        : mode === BracketSeedingMode.Pots
            ? 'Tap a pot to fill it'
            : isGroups
                ? 'Tap a group to fill it'
                : 'Tap a spot to put someone in it';

    const ctaLabel = step === 'mode'
        ? (needsSetup ? 'Set up the draw' : 'Generate bracket')
        : 'Generate bracket';

    // What the organiser is about to commit to, spelled out before anyone gets a push notification.
    const shapeLine = isGroups
        ? `${groupsCount} group${groupsCount === 1 ? '' : 's'}`
        : `bracket of ${bracketSize}${(options?.byeCount ?? 0) > 0 ? ` · ${options?.byeCount} bye${options?.byeCount === 1 ? '' : 's'}` : ''}`;

    const confirmMessage =
        `${modeTitle(mode)} draw · ${entrantCount} ${options?.isTeamTournament ? 'teams' : 'players'} · ${shapeLine}.\n\n`
        + 'Everyone registered gets a notification and the tournament goes live. The draw cannot be re-run afterwards'
        + (isGroups ? '.' : ' — after this you can only swap two positions.');

    // Placement progress, so a big field doesn't need counting by eye.
    const placedCount = entrantCount - unassigned.length;
    const progressLine = isGroups
        ? `${placedCount} of ${entrantCount} placed`
        : `${placedCount} of ${entrantCount} placed · ${Math.max(0, bracketSize - entrantCount)} byes`;

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="slide"
            onRequestClose={busy ? undefined : (picker ? closePicker : onClose)}
        >
            {/* Full screen, not a sheet: a 16-slot bracket has nowhere to breathe in 60% of the
                viewport. Mirrors the MatchDetailsModal shell (no statusBarTranslucent — the
                keyboard avoider mismeasures inside one). */}
            <View className="flex-1 bg-background" style={{ paddingTop: Math.max(insets.top, 50) }}>
                <KeyboardAvoider>
                    {/* Header */}
                    <View className="px-5 pb-4 border-b border-white/[0.05]">
                        <View className="flex-row items-center gap-3">
                            {step === 'arrange' ? (
                                <Pressable
                                    onPress={() => { if (!busy) { closePicker(); setStep('mode'); } }}
                                    className="w-9 h-9 rounded-2xl items-center justify-center bg-white/[0.05] border border-white/[0.06]"
                                >
                                    <Ionicons name="chevron-back" size={18} color={COLORS.slate300} />
                                </Pressable>
                            ) : (
                                <View
                                    className="w-9 h-9 rounded-2xl items-center justify-center"
                                    style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}
                                >
                                    <Ionicons name="git-network" size={18} color={COLORS.primary} />
                                </View>
                            )}

                            <View className="flex-1">
                                <Text className="text-xl font-black text-white" numberOfLines={1}>
                                    {step === 'mode' ? 'Bracket draw' : modeTitle(mode)}
                                </Text>
                                <Text className="text-[11px] text-slate-500 mt-0.5" numberOfLines={1}>
                                    {step === 'arrange' && !shownError ? progressLine : headerSubtitle}
                                </Text>
                            </View>

                            <Pressable
                                onPress={busy ? undefined : onClose}
                                className="w-9 h-9 items-center justify-center rounded-full bg-white/[0.04]"
                            >
                                <Ionicons name="close" size={18} color={COLORS.slate400} />
                            </Pressable>
                        </View>
                    </View>

                    {/* Arrange-step shortcuts. One compact row — the field itself lives in the picker,
                        so everything below this belongs to the bracket. */}
                    {step === 'arrange' && options && !shownError ? (
                        <View className="flex-row gap-2 px-5 py-3 border-b border-white/[0.05]">
                            <Pressable
                                onPress={autoFill}
                                disabled={busy || unassigned.length === 0}
                                className="flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] active:opacity-70"
                                style={{ opacity: unassigned.length === 0 ? 0.4 : 1 }}
                            >
                                <Ionicons name="shuffle" size={14} color={COLORS.slate300} />
                                <Text className="text-[12px] font-black text-slate-300">Auto-fill rest</Text>
                            </Pressable>
                            <Pressable
                                onPress={clearAll}
                                disabled={busy}
                                className="flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] active:opacity-70"
                            >
                                <Ionicons name="refresh" size={14} color={COLORS.slate300} />
                                <Text className="text-[12px] font-black text-slate-300">Clear</Text>
                            </Pressable>
                        </View>
                    ) : null}

                    {/* Body takes whatever the header and footer leave — full height on purpose. */}
                    <ScrollView
                        className="flex-1 pt-4"
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {loading ? (
                            <View className="py-16 items-center justify-center">
                                <ActivityIndicator size="small" color={COLORS.primary} />
                                <Text className="text-slate-500 text-xs mt-3">Loading the field…</Text>
                            </View>
                        ) : shownError ? (
                            <View className="py-12 px-8 items-center">
                                <Ionicons name="alert-circle-outline" size={32} color={COLORS.destructive} />
                                <Text className="text-slate-400 text-sm text-center mt-3">{shownError}</Text>
                                {onRetry ? (
                                    <Pressable
                                        onPress={onRetry}
                                        className="mt-4 px-4 py-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] active:opacity-70"
                                    >
                                        <Text className="text-[12px] font-black text-slate-300">Try again</Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        ) : !options ? null : step === 'mode' ? (
                            renderModeStep()
                        ) : isGroups ? (
                            renderBucketEditor()
                        ) : (
                            renderBracketEditor()
                        )}
                    </ScrollView>

                    {/* Footer */}
                    {!loading && !shownError && options ? (
                        <View
                            className="px-5 pt-3 border-t border-white/[0.05]"
                            style={{ paddingBottom: Math.max(insets.bottom, 12) + 8, gap: 10 }}
                        >
                            {problem ? (
                                <Text className="text-[11px] font-bold text-amber-300 text-center" numberOfLines={2}>
                                    {problem}
                                </Text>
                            ) : null}

                            <PressableScale
                                onPress={submit}
                                disabled={!canSubmit}
                                className="w-full flex-row items-center justify-center gap-2 py-3.5 rounded-2xl"
                                style={{ backgroundColor: canSubmit ? COLORS.primary : 'rgba(255,255,255,0.06)' }}
                            >
                                {busy ? (
                                    <ActivityIndicator size="small" color={COLORS.primaryForeground} />
                                ) : (
                                    <Ionicons
                                        name={step === 'mode' && needsSetup ? 'arrow-forward' : 'flash'}
                                        size={16}
                                        color={canSubmit ? COLORS.primaryForeground : COLORS.slate500}
                                    />
                                )}
                                <Text
                                    className="text-sm font-black"
                                    style={{ color: canSubmit ? COLORS.primaryForeground : COLORS.slate500 }}
                                >
                                    {ctaLabel}
                                </Text>
                            </PressableScale>
                        </View>
                    ) : null}

                    {renderPicker()}
                </KeyboardAvoider>
            </View>

            {/* Nested transparent modal — the same shape MatchDetailsModal already uses for its
                image preview. Dismissed the moment it is accepted, so a failed generation surfaces
                its error over the draw screen rather than over a third stacked layer. */}
            <ConfirmationModal
                visible={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={generate}
                title="Start the tournament?"
                message={confirmMessage}
                confirmText="Generate bracket"
                isDestructive={false}
                stacked
            />
        </Modal>
    );
}

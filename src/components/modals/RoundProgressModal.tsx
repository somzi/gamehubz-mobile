import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { cn, formatLocalDateTime, parseUtcDate } from '../../lib/utils';
import { compareGroupNames } from '../../lib/groups';
import { COLORS } from '../../lib/theme';

// Backend MatchStatus: 1 Pending, 2 Scheduled, 3 Live, 4 Completed, 5 NoShow, 6 TieBreakRequired.
// A fixture counts as settled when it has a recorded outcome — a completed match or a double
// forfeit. Everything else is still owed, which is exactly what this screen is for.
const STATUS_COMPLETED = 4;
const STATUS_NO_SHOW = 5;
const STATUS_TIEBREAK = 6;

// League round deadlines can carry a year-9999 sentinel meaning "opens after the previous round"
// rather than a real play-by date. Same guard the PDF / CSV exports apply.
const SENTINEL_YEAR = 9000;

type FixtureState = 'awaiting' | 'proposed' | 'tiebreak' | 'locked' | 'tbd';

interface Fixture {
    match: any;
    matchId: string;
    groupName: string;
    homeName: string;
    homeAvatarUrl?: string | null;
    awayName: string;
    awayAvatarUrl?: string | null;
    state: FixtureState;
    overdue: boolean;
}

interface RoundBucket {
    key: string;
    round: number;
    label: string;
    deadline: string | null;
    total: number;
    done: number;
    outstanding: Fixture[];
    /** Distinct groups with at least one fixture still owed. */
    groupsIncomplete: number;
}

interface StageBucket {
    stageId: string;
    name: string;
    rounds: RoundBucket[];
    total: number;
    done: number;
}

interface RoundProgressModalProps {
    visible: boolean;
    onClose: () => void;
    /** The v3 structure the bracket tab already holds — no extra round-trip. */
    stages: any[];
    isTeamTournament?: boolean;
    /** Opens the fixture in the match modal — chat is one tap further in, inside it. */
    onOpenMatch: (match: any) => void;
}

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Loose translator signature. `buildStages` runs outside a component (it is called from a
 * `useMemo`), so it takes `t` as an argument rather than pulling in the hook — the labels it
 * bakes into the buckets are read straight into the UI.
 */
type Translate = (key: string, options?: Record<string, unknown>) => string;

const norm = (o: any, camel: string, pascal: string) => o?.[camel] ?? o?.[pascal];

function cleanDeadline(value: any): string | null {
    if (!value) return null;
    const d = parseUtcDate(String(value));
    if (isNaN(d.getTime()) || d.getFullYear() > SENTINEL_YEAR) return null;
    return String(value);
}

function sideName(side: any, isTeam: boolean, t: Translate): string {
    if (!side) return t('common:app.tbd');
    const team = norm(side, 'teamName', 'TeamName');
    const username = norm(side, 'username', 'Username');
    return (isTeam ? team || username : username) || t('common:app.tbd');
}

function fixtureState(match: any, home: any, away: any): FixtureState {
    if (!home || !away) return 'tbd';
    if (norm(match, 'proposedByUserId', 'ProposedByUserId')) return 'proposed';
    if (norm(match, 'status', 'Status') === STATUS_TIEBREAK) return 'tiebreak';
    if (norm(match, 'isRoundLocked', 'IsRoundLocked')) return 'locked';
    return 'awaiting';
}

const STATE_META: Record<FixtureState, { labelKey: string; color: string }> = {
    awaiting: { labelKey: 'progress.state.awaiting', color: COLORS.slate500 },
    proposed: { labelKey: 'progress.state.proposed', color: COLORS.primary },
    tiebreak: { labelKey: 'progress.state.tiebreak', color: COLORS.highlight },
    locked: { labelKey: 'progress.state.locked', color: COLORS.slate600 },
    tbd: { labelKey: 'progress.state.tbd', color: COLORS.slate600 },
};

/** Flattens the tournament structure into per-stage then per-round completion buckets. */
function buildStages(stages: any[], isTeam: boolean, t: Translate): StageBucket[] {
    const result: StageBucket[] = [];

    for (const stage of stages ?? []) {
        const stageId = String(norm(stage, 'stageId', 'StageId') ?? norm(stage, 'name', 'Name') ?? result.length);
        const stageName = norm(stage, 'name', 'Name') || t('progress.stage');
        const byRound = new Map<
            number,
            { label: string; matches: { match: any; groupName: string }[]; deadline: string | null }
        >();

        const push = (round: number, label: string, match: any, groupName: string, deadline: string | null) => {
            let bucket = byRound.get(round);
            if (!bucket) {
                bucket = { label, matches: [], deadline: null };
                byRound.set(round, bucket);
            }
            bucket.matches.push({ match, groupName });
            // Rounds share one deadline; the first real one wins (a bye can carry none).
            bucket.deadline = bucket.deadline ?? deadline;
        };

        // Bracket stages already come grouped by round and carry their own labels ("Final", ...).
        for (const round of norm(stage, 'rounds', 'Rounds') ?? []) {
            const number = norm(round, 'roundNumber', 'RoundNumber') ?? 0;
            const label = norm(round, 'name', 'Name') || t('details.roundNumber', { number });
            const deadline = cleanDeadline(norm(round, 'roundDeadline', 'RoundDeadline'));
            for (const match of norm(round, 'matches', 'Matches') ?? []) {
                push(number, label, match, '', deadline ?? cleanDeadline(norm(match, 'roundDeadline', 'RoundDeadline')));
            }
        }

        // Group / league / Swiss stages carry a matches list per group — the whole point of this
        // screen is collapsing those N groups back into one row per round.
        for (const group of norm(stage, 'groups', 'Groups') ?? []) {
            const groupName = norm(group, 'name', 'Name') || '';
            for (const match of norm(group, 'matches', 'Matches') ?? []) {
                const number = norm(match, 'round', 'Round') || norm(match, 'order', 'Order') || 1;
                push(number, t('details.roundNumber', { number }), match, groupName, cleanDeadline(norm(match, 'roundDeadline', 'RoundDeadline')));
            }
        }

        if (byRound.size === 0) continue;

        const now = Date.now();
        const rounds: RoundBucket[] = [...byRound.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([round, bucket]) => {
                const outstanding: Fixture[] = [];
                const incompleteGroups = new Set<string>();
                let done = 0;

                for (const { match, groupName } of bucket.matches) {
                    const status = norm(match, 'status', 'Status');
                    if (status === STATUS_COMPLETED || status === STATUS_NO_SHOW) {
                        done += 1;
                        continue;
                    }

                    const home = norm(match, 'home', 'Home');
                    const away = norm(match, 'away', 'Away');
                    if (groupName) incompleteGroups.add(groupName);

                    outstanding.push({
                        match,
                        matchId: String(norm(match, 'id', 'Id')),
                        groupName,
                        homeName: sideName(home, isTeam, t),
                        homeAvatarUrl: home ? norm(home, 'avatarUrl', 'AvatarUrl') : null,
                        awayName: sideName(away, isTeam, t),
                        awayAvatarUrl: away ? norm(away, 'avatarUrl', 'AvatarUrl') : null,
                        state: fixtureState(match, home, away),
                        overdue: !!bucket.deadline && parseUtcDate(bucket.deadline).getTime() < now,
                    });
                }

                // Read like the groups tab: group order first (the shared comparator keeps
                // "Group 2" ahead of "Group 18" — plain alphabetical does not), then the
                // pairing. Overdue is a property of the round's deadline, so every fixture in
                // this bucket shares it and it can't be a tiebreaker here.
                outstanding.sort(
                    (a, b) =>
                        compareGroupNames(a.groupName, b.groupName) ||
                        a.homeName.localeCompare(b.homeName),
                );

                return {
                    key: `${stageId}-${round}`,
                    round,
                    label: bucket.label,
                    deadline: bucket.deadline,
                    total: bucket.matches.length,
                    done,
                    outstanding,
                    groupsIncomplete: incompleteGroups.size,
                };
            });

        result.push({
            stageId,
            name: stageName,
            rounds,
            total: rounds.reduce((sum, r) => sum + r.total, 0),
            done: rounds.reduce((sum, r) => sum + r.done, 0),
        });
    }

    return result;
}

function pct(done: number, total: number) {
    return total === 0 ? 0 : Math.round((done / total) * 100);
}

// ── UI ───────────────────────────────────────────────────────────────

function ProgressBar({ done, total, height = 6 }: { done: number; total: number; height?: number }) {
    const ratio = total === 0 ? 0 : done / total;
    const complete = total > 0 && done === total;
    return (
        <View className="flex-1 rounded-full bg-white/[0.06] overflow-hidden" style={{ height }}>
            <View
                style={{
                    width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%`,
                    height: '100%',
                    borderRadius: 999,
                    backgroundColor: complete ? COLORS.primary : COLORS.warning,
                }}
            />
        </View>
    );
}

/**
 * Each name gets roughly 80pt beside its avatar — about eleven characters at the base size.
 * Rather than cutting "ardakaygusuz" off, the pair steps down a point at a time until it
 * fits. Both sides take the size the LONGER name needs, so the matchup stays symmetric
 * instead of pairing a 13pt name with a 10pt one; past ~16 characters the ellipsis takes
 * over again, since anything smaller stops being readable on a phone.
 */
function nameFontSize(home: string, away: string): number {
    const longest = Math.max(home.length, away.length);
    if (longest <= 11) return 13;
    if (longest <= 12) return 12;
    if (longest <= 14) return 11;
    if (longest <= 16) return 10;
    return 9;
}

/**
 * One outstanding fixture. The two sides are mirrored around the "vs" chip so each avatar
 * sits against the name it belongs to, the group and the state ride in the eyebrow, and a
 * tinted rail down the left edge carries the state colour at a glance. The whole card opens
 * the match — chat lives one tap deeper, inside the match modal, where the organizer can
 * also see the score, the deadline and the evidence before writing anything.
 */
function FixtureRow({ fixture, onOpen }: { fixture: Fixture; onOpen: () => void }) {
    const { t } = useTranslation('tournament');
    const meta = STATE_META[fixture.state];
    const openable = fixture.state !== 'tbd';

    // Overdue outranks "not played": it is the reason the organizer opened this list.
    const late = fixture.overdue && fixture.state === 'awaiting';
    const accent = late ? COLORS.destructive : meta.color;
    const fontSize = nameFontSize(fixture.homeName, fixture.awayName);

    return (
        <PressableScale
            onPress={onOpen}
            disabled={!openable}
            containerStyle={{ marginBottom: 8 }}
            className={cn(
                'rounded-2xl border overflow-hidden bg-white/[0.03]',
                late ? 'border-destructive/20' : 'border-white/[0.07]',
                !openable && 'opacity-60',
            )}
        >
            {/* State rail */}
            <View
                className="absolute left-0 top-0 bottom-0"
                style={{ width: 3, backgroundColor: accent, opacity: late ? 1 : 0.7 }}
            />

            <View className="pl-4 pr-3.5 py-2.5">
                {/* Eyebrow: which group it belongs to, and why it is still open. */}
                <View className="flex-row items-center justify-between mb-2">
                    {fixture.groupName ? (
                        <View className="bg-white/[0.05] border border-white/[0.07] rounded-md px-1.5 py-[3px] flex-shrink mr-2">
                            <Text
                                className="text-[9px] font-black uppercase tracking-widest text-slate-300"
                                numberOfLines={1}
                            >
                                {fixture.groupName}
                            </Text>
                        </View>
                    ) : (
                        <View />
                    )}

                    <View className="flex-row items-center gap-1.5">
                        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                        <Text
                            className="text-[9px] font-black uppercase tracking-wider"
                            style={{ color: accent }}
                            numberOfLines={1}
                        >
                            {late ? t('progress.overdue') : t(meta.labelKey)}
                        </Text>
                    </View>
                </View>

                {/* Matchup — mirrored columns, avatar always beside its own name. */}
                <View className="flex-row items-center">
                    <View className="flex-1 flex-row items-center">
                        <PlayerAvatar src={fixture.homeAvatarUrl || undefined} name={fixture.homeName} size="sm" />
                        <Text
                            className="flex-1 ml-2 font-bold text-white"
                            style={{ fontSize }}
                            numberOfLines={1}
                        >
                            {fixture.homeName}
                        </Text>
                    </View>

                    <View className="px-2 py-1 mx-1 rounded-lg bg-white/[0.04]">
                        <Text className="text-[9px] font-black text-slate-500 uppercase tracking-wider">vs</Text>
                    </View>

                    <View className="flex-1 flex-row items-center justify-end">
                        <Text
                            className="flex-1 mr-2 font-bold text-white text-right"
                            style={{ fontSize }}
                            numberOfLines={1}
                        >
                            {fixture.awayName}
                        </Text>
                        <PlayerAvatar src={fixture.awayAvatarUrl || undefined} name={fixture.awayName} size="sm" />
                    </View>
                </View>
            </View>
        </PressableScale>
    );
}

function RoundCard({
    round,
    expanded,
    onToggle,
    onOpenMatch,
}: {
    round: RoundBucket;
    expanded: boolean;
    onToggle: () => void;
    onOpenMatch: (match: any) => void;
}) {
    const { t } = useTranslation('tournament');
    const remaining = round.total - round.done;
    const complete = remaining === 0;
    const overdue = !!round.deadline && !complete && parseUtcDate(round.deadline).getTime() < Date.now();

    return (
        <View
            className={cn(
                'rounded-[22px] border mb-2.5 overflow-hidden',
                complete
                    ? 'bg-card border-primary/15'
                    : overdue
                        ? 'bg-card border-destructive/25'
                        : 'bg-card border-white/10',
            )}
        >
            <Pressable onPress={onToggle} disabled={complete} className="px-4 py-3.5 active:opacity-80">
                <View className="flex-row items-center">
                    <View
                        className="w-8 h-8 rounded-xl items-center justify-center mr-3"
                        style={{ backgroundColor: complete ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)' }}
                    >
                        <Ionicons
                            name={complete ? 'checkmark-done' : 'time-outline'}
                            size={15}
                            color={complete ? COLORS.primary : COLORS.warning}
                        />
                    </View>

                    <View className="flex-1">
                        <Text className="text-[13px] font-black text-white tracking-tight" numberOfLines={1}>
                            {round.label}
                        </Text>
                        <Text className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">
                            {complete
                                ? t('progress.allPlayed')
                                : `${t('progress.remaining', { count: remaining })}${
                                      round.groupsIncomplete > 0
                                          ? ` · ${t('progress.groupsIncomplete', { count: round.groupsIncomplete })}`
                                          : ''
                                  }`}
                        </Text>
                    </View>

                    <Text className={cn('text-[12px] font-black mr-2', complete ? 'text-primary' : 'text-white')}>
                        {round.done}
                        <Text className="text-slate-600">/{round.total}</Text>
                    </Text>

                    {!complete && (
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.slate400} />
                    )}
                </View>

                <View className="flex-row items-center gap-3 mt-3">
                    <ProgressBar done={round.done} total={round.total} />
                    <Text className="text-[10px] font-black text-slate-500 w-9 text-right">
                        {pct(round.done, round.total)}%
                    </Text>
                </View>

                {round.deadline && (
                    <View className="flex-row items-center gap-1.5 mt-2">
                        <Ionicons
                            name={overdue ? 'alert-circle' : 'calendar-outline'}
                            size={11}
                            color={overdue ? COLORS.destructive : COLORS.slate500}
                        />
                        <Text className={cn('text-[10px] font-bold', overdue ? 'text-destructive' : 'text-slate-500')}>
                            {overdue ? t('progress.deadlinePassed') : t('progress.deadline')} · {formatLocalDateTime(round.deadline)}
                        </Text>
                    </View>
                )}
            </Pressable>

            {/* The fixtures come pre-sorted by group, so the cards read as runs per group
                without spending a whole row on a heading each time — with one fixture left in
                each of thirty groups, those headings were half the list. */}
            {expanded && !complete && (
                <View className="px-3 pb-1 pt-3 border-t border-white/[0.06]">
                    {round.outstanding.map((fixture) => (
                        <FixtureRow
                            key={fixture.matchId}
                            fixture={fixture}
                            onOpen={() => onOpenMatch(fixture.match)}
                        />
                    ))}
                </View>
            )}
        </View>
    );
}

/**
 * Organizer view of "who still owes a game". A 32-group league hides its four missing
 * fixtures behind 32 group tabs; this collapses the whole tournament into one row per
 * round and, when a round is opened, lists exactly which pairings are outstanding — each
 * one a tap away from its match page.
 */
export function RoundProgressModal({
    visible,
    onClose,
    stages,
    isTeamTournament,
    onOpenMatch,
}: RoundProgressModalProps) {
    const { t } = useTranslation('tournament');
    const data = useMemo(
        () => buildStages(stages ?? [], !!isTeamTournament, t),
        [stages, isTeamTournament, t],
    );

    const [stageIndex, setStageIndex] = useState(0);
    const [expandedRound, setExpandedRound] = useState<string | null>(null);

    const stage = data[Math.min(stageIndex, Math.max(data.length - 1, 0))];

    // Opening the sheet should answer the question straight away, so the first round that
    // still owes fixtures starts expanded instead of making the organizer hunt for it.
    // Deliberately keyed on `visible` alone: a background bracket refetch swaps `data` for a
    // fresh array, and re-running on that would snap an open round shut under the reader.
    useEffect(() => {
        if (!visible) return;
        setStageIndex(0);
        const firstIncomplete = data[0]?.rounds.find((r) => r.done < r.total);
        setExpandedRound(firstIncomplete?.key ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const totals = useMemo(
        () => ({
            done: data.reduce((sum, s) => sum + s.done, 0),
            total: data.reduce((sum, s) => sum + s.total, 0),
        }),
        [data],
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View className="flex-1 justify-end bg-black/70">
                <Pressable className="absolute inset-0" onPress={onClose} />

                <View
                    className="bg-background-deep rounded-t-[32px] border-t border-x border-white/10"
                    style={{ height: '92%' }}
                >
                    <View className="w-10 h-1 bg-white/10 rounded-full self-center mt-3 mb-1" />

                    {/* Header */}
                    <View className="flex-row items-center justify-between px-6 py-4">
                        <View className="flex-row items-center gap-3 flex-1 pr-3">
                            <View className="w-10 h-10 rounded-2xl bg-info/15 items-center justify-center">
                                <Ionicons name="stats-chart" size={18} color={COLORS.info} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-base font-black text-white tracking-tight">{t('progress.title')}</Text>
                                <Text className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                                    {totals.total === 0
                                        ? t('progress.nothingScheduled')
                                        : t('progress.fixturesPlayed', { done: totals.done, total: totals.total })}
                                </Text>
                            </View>
                        </View>
                        <Pressable
                            onPress={onClose}
                            className="w-9 h-9 rounded-full bg-white/5 items-center justify-center border border-white/10 active:opacity-60"
                        >
                            <Ionicons name="close" size={18} color={COLORS.slate400} />
                        </Pressable>
                    </View>

                    {/* Tournament-wide bar */}
                    {totals.total > 0 && (
                        <View className="flex-row items-center gap-3 px-6 pb-4">
                            <ProgressBar done={totals.done} total={totals.total} height={8} />
                            <Text className="text-[11px] font-black text-white w-10 text-right">
                                {pct(totals.done, totals.total)}%
                            </Text>
                        </View>
                    )}

                    {/* Stage picker — only when the tournament actually has more than one. */}
                    {data.length > 1 && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 14 }}
                        >
                            {data.map((s, index) => {
                                const active = index === stageIndex;
                                return (
                                    <Pressable
                                        key={s.stageId}
                                        onPress={() => {
                                            setStageIndex(index);
                                            setExpandedRound(s.rounds.find((r) => r.done < r.total)?.key ?? null);
                                        }}
                                        className={cn(
                                            'px-3.5 py-1.5 rounded-full border active:opacity-70 self-start',
                                            active ? 'bg-info/15 border-info/40' : 'bg-white/[0.04] border-white/[0.08]',
                                        )}
                                    >
                                        <Text
                                            className={cn(
                                                'text-[10px] font-black uppercase tracking-wide',
                                                active ? 'text-info' : 'text-slate-500',
                                            )}
                                        >
                                            {s.name} · {s.done}/{s.total}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    )}

                    <ScrollView
                        className="px-5 flex-1"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 36, paddingTop: 4 }}
                    >
                        {!stage || stage.rounds.length === 0 ? (
                            <View className="py-12 items-center">
                                <View className="w-16 h-16 rounded-full bg-info/10 border border-info/20 items-center justify-center mb-4">
                                    <Ionicons name="stats-chart-outline" size={26} color={COLORS.info} />
                                </View>
                                <Text className="text-sm font-black text-white uppercase tracking-widest">
                                    {t('progress.emptyTitle')}
                                </Text>
                                <Text className="text-xs text-slate-500 mt-2 text-center px-8">
                                    {t('progress.emptyBody')}
                                </Text>
                            </View>
                        ) : (
                            stage.rounds.map((round) => (
                                <RoundCard
                                    key={round.key}
                                    round={round}
                                    expanded={expandedRound === round.key}
                                    onToggle={() =>
                                        setExpandedRound((current) => (current === round.key ? null : round.key))
                                    }
                                    onOpenMatch={onOpenMatch}
                                />
                            ))
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

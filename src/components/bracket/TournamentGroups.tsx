import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { teamProgressFrom, checkInFrom } from './BracketMatch';
import { GroupFixtureCard } from './GroupFixtureCard';
import { SeriesFormatChip, roundSeriesFormat } from './SeriesFormatChip';
import { Panel } from '../ui/Panel';
import { cn, parseUtcDate } from '../../lib/utils';
import { COLORS } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { isTerminalMatchStatus } from '../../types/matchStatus';

interface Standing {
    position: number;
    participantId: string;
    userId: string;
    // Authoritative display name from the backend (LeagueStandingDto.Name):
    // team name for team groups, username for solo groups. Prefer this over the
    // userId→match lookup, which can't resolve team rows (their userId is empty).
    name?: string;
    username?: string;
    points: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    // Swiss only: sum of opponents' points (Buchholz). Null on non-Swiss groups.
    opponentPointsSum?: number | null;
}

interface Participant {
    participantId: string;
    userId: string;
    username: string;
    score: number | null;
    isWinner: boolean;
    seed: number;
    /** Profile photo of the player behind the slot; absent on team slots and on older backends. */
    avatarUrl?: string | null;
}

interface Match {
    id: string;
    order: number;
    status: number;
    startTime: string | null;
    roundDeadline?: string | null;
    nextMatchId: string | null;
    home: Participant | null;
    away: Participant | null;
    round?: number;
    isRoundLocked?: boolean;
    matchOpensAt?: string | null;
}

interface Group {
    groupId: string;
    name: string;
    standings: Standing[];
    matches: Match[];
}

interface TournamentGroupsProps {
    groups: Group[];
    onMatchPress?: (match: Match) => void;
    currentUserId?: string;
    currentUsername?: string;
    isAdmin?: boolean;
    onEditDeadline?: (roundInfo: { roundNumber: number; roundDeadline?: string | null; roundOpenAt?: string | null }) => void;
    tournamentStatus?: number;
    // Explicit qualification zones — positions <= direct go straight to the knockout (green),
    // positions <= playInEnd enter the play-in (amber; Swiss only — classic groups pass
    // direct === playInEnd). When omitted, the legacy top-2 group highlight is used.
    qualificationZones?: { direct: number; playInEnd: number };
    // Swiss: total rounds scheduled — drives the "Round X of Y" header on the matches list.
    // When omitted, only "Round X" is shown (legacy group/league behaviour).
    totalRounds?: number;
    // Team tournaments: each group card is a Team-vs-Team match — render the team icon
    // instead of a player avatar, mirroring the knockout bracket.
    isTeamTournament?: boolean;
}

type Zone = 'direct' | 'playIn' | null;

const ZONE_COLOR = { direct: '#10B981', playIn: '#F59E0B' } as const;
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const DAY_MS = 24 * 60 * 60 * 1000;
const TABULAR = { fontVariant: ['tabular-nums' as const] };

// Column widths sized so the whole table fits a phone without sideways scrolling; the name takes
// whatever is left.
const COL = { pos: 22, stat: 22, goals: 44, diff: 30, opp: 30, pts: 30 } as const;

/** A fixture both sides have been drawn into — byes and empty slots aren't games to count. */
const isRealFixture = (m: Match) => !!m.home && !!m.away;

export function TournamentGroups({ groups, onMatchPress, currentUserId, currentUsername, isAdmin, onEditDeadline, tournamentStatus, qualificationZones, totalRounds, isTeamTournament }: TournamentGroupsProps) {
    const { t } = useTranslation('bracket');
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [selectedRounds, setSelectedRounds] = useState<Record<string, number>>({});

    const getUsername = (userId: string, matches: Match[]) => {
        for (const match of matches) {
            if (match.home?.userId === userId) return match.home.username;
            if (match.away?.userId === userId) return match.away.username;
        }
        return i18n.t('common:unknown');
    };

    const zoneOf = (position: number): Zone => {
        if (qualificationZones) {
            if (position <= qualificationZones.direct) return 'direct';
            if (position <= qualificationZones.playInEnd) return 'playIn';
            return null;
        }
        return position <= 2 ? 'direct' : null;
    };

    const isMeRow = (standing: Standing) =>
        (!!currentUserId && !!standing.userId && standing.userId.toLowerCase() === currentUserId.toLowerCase())
        || (!!currentUsername && !!standing.username && standing.username.toLowerCase() === currentUsername.toLowerCase());

    return (
        <View className="px-4 gap-8">
            {groups.map((group) => {
                const groupedMatches = group.matches.reduce((acc, match) => {
                    const roundNum = match.round !== undefined && match.round !== 0 ? match.round : (match.order !== undefined && match.order !== 0 ? match.order : 1);
                    if (!acc[roundNum]) acc[roundNum] = [];
                    acc[roundNum].push(match);
                    return acc;
                }, {} as Record<number, Match[]>);

                const rounds = Object.keys(groupedMatches).map(Number).sort((a, b) => a - b);
                const isRoundDone = (roundNum: number) =>
                    groupedMatches[roundNum].filter(isRealFixture).every((m) => isTerminalMatchStatus(m.status));
                // Open on the round being played — the first with a game still owed — rather than
                // round 1, which a few weeks in is history. Once everything is played, the last.
                const currentRound = rounds.find((r) => !isRoundDone(r)) ?? rounds[rounds.length - 1] ?? 1;
                const activeRound = selectedRounds[group.groupId] ?? currentRound;
                const currentRoundMatches = groupedMatches[activeRound] || [];
                const roundFormat = roundSeriesFormat(currentRoundMatches);
                const activeRoundDone = currentRoundMatches.length > 0 && isRoundDone(activeRound);

                const fixtures = group.matches.filter(isRealFixture);
                const fixturesPlayed = fixtures.filter((m) => isTerminalMatchStatus(m.status)).length;

                // Buchholz column visible when at least one row carries it — i.e. on Swiss groups.
                // Sits right before Pts since it ranks tied players right after them.
                const showBuchholz = group.standings.some(s => s.opponentPointsSum != null);

                const deadline = currentRoundMatches[0]?.roundDeadline ? parseUtcDate(currentRoundMatches[0].roundDeadline!) : null;
                const hasDeadline = !!deadline && !isNaN(deadline.getTime());
                const msLeft = hasDeadline ? deadline!.getTime() - Date.now() : 0;
                const deadlineColor = activeRoundDone
                    ? COLORS.slate500
                    : msLeft < 0 ? '#F87171' : msLeft < DAY_MS ? '#FBBF24' : COLORS.slate300;
                // Not tied to this group being done with the round: the schedule is the whole round's,
                // across every group, and one group finishing early must not hide it from the organizer.
                const canEditSchedule = !!isAdmin && tournamentStatus !== 4 && currentRoundMatches.length > 0;

                const renderRoundTab = (roundNum: number, stretch: boolean) => {
                    const rMatches = groupedMatches[roundNum];
                    const isLocked = rMatches.length > 0 && !!rMatches[0].isRoundLocked;
                    const isActive = activeRound === roundNum;
                    const done = isRoundDone(roundNum);

                    return (
                        <Pressable
                            key={`tab-${roundNum}`}
                            onPress={() => setSelectedRounds(prev => ({ ...prev, [group.groupId]: roundNum }))}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: isActive }}
                            className={cn(
                                'h-9 flex-row items-center justify-center gap-1.5 rounded-xl border',
                                stretch ? 'flex-1 px-1' : 'px-4',
                                isActive ? 'bg-[#1E293B] border-white/10' : 'border-transparent active:bg-white/[0.04]',
                            )}
                        >
                            <Text
                                className={cn('text-[12.5px] font-bold', isActive ? 'text-white' : 'text-slate-500')}
                                numberOfLines={1}
                            >
                                {t('tournament:details.roundNumber', { number: roundNum })}
                            </Text>
                            {done ? (
                                <Ionicons name="checkmark-circle" size={12} color={isActive ? '#34D399' : 'rgba(52,211,153,0.6)'} />
                            ) : isLocked ? (
                                <Ionicons name="lock-closed" size={11} color={COLORS.slate500} />
                            ) : null}
                        </Pressable>
                    );
                };

                return (
                    <View key={group.groupId} className="gap-8">
                        {/* ─── Standings ─── */}
                        <Panel>
                            <View className="flex-row items-center px-4 pt-3.5 pb-3" style={{ gap: 12 }}>
                                <Text className="flex-1 text-[16px] font-black text-white" numberOfLines={1}>
                                    {group.name}
                                </Text>
                                {fixtures.length > 0 && (
                                    <Text style={TABULAR} className="text-[12px] font-semibold text-slate-400" numberOfLines={1}>
                                        {t('tournament:progress.fixturesPlayed', { done: fixturesPlayed, total: fixtures.length })}
                                    </Text>
                                )}
                            </View>

                            <View className="flex-row items-center px-3.5 py-2 bg-white/[0.025] border-y border-white/[0.05]">
                                <Text style={{ width: COL.pos }} className="text-[10px] font-black text-slate-500 text-center">#</Text>
                                <Text numberOfLines={1} className="flex-1 ml-2.5 text-[10px] font-black text-slate-500 uppercase tracking-[0.8px]">
                                    {t('card.player')}
                                </Text>
                                {[t('table.played'), t('table.won'), t('table.drawn'), t('table.lost')].map((label) => (
                                    <Text key={label} style={{ width: COL.stat }} numberOfLines={1} className="text-[10px] font-black text-slate-500 text-center uppercase">
                                        {label}
                                    </Text>
                                ))}
                                <Text style={{ width: COL.goals }} numberOfLines={1} className="text-[10px] font-black text-slate-500 text-center uppercase">
                                    {t('table.goalsFor')}:{t('table.goalsAgainst')}
                                </Text>
                                <Text style={{ width: COL.diff }} numberOfLines={1} className="text-[10px] font-black text-slate-500 text-center uppercase">
                                    {t('table.goalDiff')}
                                </Text>
                                {showBuchholz && (
                                    <Text style={{ width: COL.opp }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} className="text-[10px] font-black text-slate-500 text-center uppercase">
                                        {t('common:app.opp')}
                                    </Text>
                                )}
                                <Text style={{ width: COL.pts }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} className="text-[10px] font-black text-white text-center uppercase">
                                    {t('card.pts')}
                                </Text>
                            </View>

                            {group.standings.map((standing, index) => {
                                const isMe = isMeRow(standing);
                                const zone = zoneOf(standing.position);
                                const next = group.standings[index + 1];
                                // A line in the zone's colour under its last row marks the cut, the way
                                // league tables do; elsewhere rows part on a hairline.
                                const cutBelow = !!next && zone !== null && zoneOf(next.position) !== zone;
                                // Team rows carry no real user (UserId = empty GUID) — disable the tap so we
                                // don't navigate to a non-existent player profile (the backend 500s on it).
                                const canOpenProfile = !!standing.userId && standing.userId !== EMPTY_GUID;
                                const diff = standing.goalDifference;

                                return (
                                    <React.Fragment key={standing.participantId}>
                                        <Pressable
                                            onPress={canOpenProfile ? () => navigation.navigate('PlayerProfile', { id: standing.userId }) : undefined}
                                            disabled={!canOpenProfile}
                                            className={cn(
                                                'flex-row items-center px-3.5 h-11',
                                                isMe ? 'bg-emerald-500/[0.08]' : 'active:bg-white/[0.04]',
                                            )}
                                        >
                                            <View style={{ width: COL.pos }} className="items-center">
                                                <View
                                                    className="w-[22px] h-[22px] rounded-[7px] items-center justify-center"
                                                    style={zone ? { backgroundColor: ZONE_COLOR[zone] + '26' } : undefined}
                                                >
                                                    <Text
                                                        style={[TABULAR, { color: zone === 'direct' ? '#34D399' : zone === 'playIn' ? '#FBBF24' : COLORS.slate500 }]}
                                                        className="text-[11px] font-black"
                                                    >
                                                        {standing.position}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text
                                                className={cn('flex-1 ml-2.5 mr-1 text-[13.5px] font-bold', isMe ? 'text-emerald-300' : 'text-slate-100')}
                                                numberOfLines={1}
                                                adjustsFontSizeToFit
                                                minimumFontScale={0.8}
                                            >
                                                {standing.name || standing.username || getUsername(standing.userId, group.matches)}
                                            </Text>
                                            {[standing.matchesPlayed, standing.wins, standing.draws, standing.losses].map((value, i) => (
                                                <Text key={i} style={[TABULAR, { width: COL.stat }]} className="text-[13px] text-center font-medium text-slate-400">
                                                    {value}
                                                </Text>
                                            ))}
                                            <Text style={[TABULAR, { width: COL.goals }]} numberOfLines={1} className="text-[12.5px] text-center font-medium text-slate-500">
                                                {standing.goalsFor}:{standing.goalsAgainst}
                                            </Text>
                                            <Text
                                                style={[TABULAR, { width: COL.diff }]}
                                                numberOfLines={1}
                                                className={cn(
                                                    'text-[13px] text-center font-semibold',
                                                    diff > 0 ? 'text-emerald-400/90' : diff < 0 ? 'text-red-400/90' : 'text-slate-500',
                                                )}
                                            >
                                                {diff > 0 ? `+${diff}` : diff}
                                            </Text>
                                            {showBuchholz && (
                                                <Text style={[TABULAR, { width: COL.opp }]} className="text-[13px] text-center font-medium text-slate-400">
                                                    {standing.opponentPointsSum ?? 0}
                                                </Text>
                                            )}
                                            <Text style={[TABULAR, { width: COL.pts }]} className="text-[14px] text-center font-black text-white">
                                                {standing.points}
                                            </Text>
                                        </Pressable>
                                        {next && (
                                            cutBelow ? (
                                                <View style={{ height: 1, backgroundColor: ZONE_COLOR[zone!] + '80' }} />
                                            ) : (
                                                <View className="mx-3.5" style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                                            )
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </Panel>

                        {/* ─── Matches ─── */}
                        {rounds.length > 0 && (
                            <View>
                                <View className="flex-row items-center justify-between mb-3 px-0.5">
                                    <Text numberOfLines={1} className="text-[11px] font-black text-slate-400 uppercase tracking-[2px]">
                                        {t('card.matches')}
                                    </Text>
                                    {totalRounds != null && totalRounds > 0 && (
                                        <Text style={TABULAR} className="text-[12px] font-semibold text-slate-500">
                                            {t('card.roundOf', { n: activeRound, total: totalRounds })}
                                        </Text>
                                    )}
                                </View>

                                {/* Round picker — a joined track, quieter than the group pills above it */}
                                <View className="rounded-2xl p-1 bg-card border border-white/[0.05]">
                                    {rounds.length <= 4 ? (
                                        <View className="flex-row" style={{ gap: 4 }}>
                                            {rounds.map((roundNum) => renderRoundTab(roundNum, true))}
                                        </View>
                                    ) : (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                                            {rounds.map((roundNum) => renderRoundTab(roundNum, false))}
                                        </ScrollView>
                                    )}
                                </View>

                                {/* What holds for the whole round: its deadline and its format */}
                                {(hasDeadline || roundFormat || canEditSchedule) && (
                                    <View className="flex-row items-center mt-3.5 px-0.5" style={{ gap: 12 }}>
                                        <View className="flex-1" style={{ gap: 6 }}>
                                            {/* The state on one line, the date under it: side by side with the
                                                Edit Schedule button, "Deadline passed" left the time cut off. */}
                                            {hasDeadline && (
                                                <View className="flex-row items-start" style={{ gap: 6 }}>
                                                    <Ionicons name="time-outline" size={14} color={deadlineColor} style={{ marginTop: 1 }} />
                                                    <View className="shrink">
                                                        <Text className="text-[11.5px] font-semibold" style={{ color: deadlineColor }} numberOfLines={1}>
                                                            {msLeft < 0 && !activeRoundDone ? t('tournament:progress.deadlinePassed') : t('tournament:progress.deadline')}
                                                        </Text>
                                                        <Text className="text-[13px] font-bold text-white" style={TABULAR} numberOfLines={1}>
                                                            {deadline!.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                                                            {', '}
                                                            {deadline!.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                        </Text>
                                                    </View>
                                                </View>
                                            )}
                                            {roundFormat && (
                                                <SeriesFormatChip format={roundFormat} isTeamTournament={isTeamTournament} />
                                            )}
                                        </View>
                                        {canEditSchedule && (
                                            <Pressable
                                                onPress={() => onEditDeadline?.({ roundNumber: Number(activeRound), roundDeadline: currentRoundMatches[0]?.roundDeadline, roundOpenAt: currentRoundMatches[0]?.matchOpensAt })}
                                                accessibilityRole="button"
                                                hitSlop={6}
                                                className="flex-row items-center h-9 px-3 rounded-xl border border-white/10 bg-white/[0.04] active:opacity-70"
                                                style={{ gap: 6 }}
                                            >
                                                <Ionicons name="calendar-outline" size={14} color={COLORS.slate300} />
                                                <Text numberOfLines={1} className="text-[12.5px] font-bold text-slate-200">
                                                    {t('card.editSchedule')}
                                                </Text>
                                            </Pressable>
                                        )}
                                    </View>
                                )}

                                <View className="mt-4" style={{ gap: 12 }}>
                                    {currentRoundMatches.map((match) => (
                                        <GroupFixtureCard
                                            key={match.id}
                                            home={match.home}
                                            away={match.away}
                                            startTime={match.startTime}
                                            status={match.status}
                                            onPress={() => onMatchPress?.({ ...match, isRoundLocked: !!match.isRoundLocked })}
                                            currentUserId={currentUserId}
                                            currentUsername={currentUsername}
                                            isAdmin={isAdmin}
                                            isTeamTournament={isTeamTournament}
                                            proposedByUserId={(match as any).proposedByUserId ?? (match as any).ProposedByUserId ?? null}
                                            teamProgress={teamProgressFrom(match)}
                                            checkIn={checkInFrom(match)}
                                        />
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                );
            })}
        </View>
    );
}

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { BracketMatch } from './BracketMatch';
import { parseUtcDate } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';

// LB layout is a flat column-per-round grid: match counts don't halve cleanly between rounds
// (a "minor" consolidation round is followed by a "major" round with the same count once a
// fresh batch of WB losers drops in), so the binary-tree connector geometry used by
// TournamentBracket doesn't apply. Cards are stacked top-to-bottom inside each round column.

const MATCH_H = 130;
const MATCH_GAP = 16;
const MATCH_W = 220;
const COL_GAP = 24;
const HEADER_H = 64;

interface Participant {
    participantId: string;
    userId: string;
    username: string;
    score: number | null;
    isWinner: boolean;
    seed: number;
}

interface Match {
    id: string;
    order: number;
    status: number;
    startTime: string | null;
    nextMatchId: string | null;
    home: Participant | null;
    away: Participant | null;
}

interface Round {
    roundNumber: number;
    name: string;
    roundDeadline?: string | null;
    roundOpenAt?: string | null;
    matches: Match[];
}

interface LosersBracketProps {
    rounds: Round[];
    onMatchPress?: (match: Match) => void;
    currentUserId?: string;
    currentUsername?: string;
    isAdmin?: boolean;
    onEditDeadline?: (round: Round) => void;
    tournamentStatus?: number;
    isTeamTournament?: boolean;
    /** Rendered on the left of the zoom-controls row (e.g. the admin Help Requests pill). */
    headerLeft?: React.ReactNode;
}

type RoundStatus = 'completed' | 'active' | 'upcoming';

function getRoundStatus(round: Round): RoundStatus {
    if (!round.matches.length) return 'upcoming';
    if (round.matches.every(m => m.status === 3 || m.status === 4)) return 'completed';
    if (round.matches.some(m => m.status === 1 || m.status === 2)) return 'active';
    return 'upcoming';
}

// LB rounds alternate: round 1 takes WB R1 losers, round 2 takes WB R2 losers, then 3 is a
// consolidation, 4 takes WB R3 losers, and so on. We label them so participants can tell at
// a glance whether a fresh wave of losers will drop into this round.
//
// We anchor "LB Final" / "LB Semifinal" to the MAX persisted round number rather than the
// length of the visible rounds array — the DE bye cascade can collapse early LB rounds out
// of the structure (a 5-player bracket has no LB R1 to show), and we don't want a collapse
// to push every later round's label up by one.
function getLbRoundLabel(roundNumber: number, maxRoundNumber: number): string {
    if (roundNumber === maxRoundNumber) return 'LB Final';
    if (roundNumber === maxRoundNumber - 1) return 'LB Semifinal';
    return `LB Round ${roundNumber}`;
}

export function LosersBracket({
    rounds,
    onMatchPress,
    currentUserId,
    currentUsername,
    isAdmin,
    onEditDeadline,
    tournamentStatus,
    isTeamTournament,
    headerLeft,
}: LosersBracketProps) {
    if (!rounds?.length) return null;

    const ZOOM_STEP = 0.15;
    const ZOOM_MIN = 0.5;
    const ZOOM_MAX = 1.0;
    const [scale, setScale] = useState(0.85);
    const zoomIn = () => setScale(prev => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
    const zoomOut = () => setScale(prev => Math.max(ZOOM_MIN, prev - ZOOM_STEP));

    const maxMatches = Math.max(...rounds.map(r => r.matches.length || 1));
    const maxRoundNumber = Math.max(...rounds.map(r => r.roundNumber));
    const totalH = maxMatches * MATCH_H + (maxMatches - 1) * MATCH_GAP;

    const contentWidth = rounds.length * MATCH_W + (rounds.length - 1) * COL_GAP;
    const contentHeight = HEADER_H + totalH;

    const innerContent = (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {rounds.map((round, roundIdx) => {
                const roundStatus = getRoundStatus(round);
                const canEditRound =
                    isAdmin && tournamentStatus !== 4 && roundStatus !== 'completed';
                const label = getLbRoundLabel(round.roundNumber, maxRoundNumber);
                const colHeight = round.matches.length * MATCH_H + (round.matches.length - 1) * MATCH_GAP;
                const verticalOffset = (totalH - colHeight) / 2;

                return (
                    <React.Fragment key={round.roundNumber}>
                        <View style={{ width: MATCH_W }}>
                            <View
                                style={{
                                    height: HEADER_H,
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingBottom: 10,
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 6,
                                            paddingHorizontal: 12,
                                            paddingVertical: 6,
                                            borderRadius: 999,
                                            borderWidth: 1,
                                            backgroundColor:
                                                roundStatus === 'active'
                                                    ? 'rgba(244,63,94,0.7)'
                                                    : 'rgba(255,255,255,0.03)',
                                            borderColor:
                                                roundStatus === 'active'
                                                    ? 'rgba(251,113,133,0.4)'
                                                    : 'rgba(255,255,255,0.07)',
                                        }}
                                    >
                                        {roundStatus === 'completed' && (
                                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' }} />
                                        )}
                                        {roundStatus === 'active' && (
                                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FECDD3' }} />
                                        )}
                                        <Text
                                            style={{
                                                fontSize: 11,
                                                fontWeight: '700',
                                                color:
                                                    roundStatus === 'active'
                                                        ? '#FFFFFF'
                                                        : roundStatus === 'completed'
                                                          ? '#64748B'
                                                          : '#94A3B8',
                                            }}
                                            numberOfLines={1}
                                        >
                                            {label}
                                        </Text>
                                        <Text
                                            style={{
                                                fontSize: 10,
                                                fontWeight: '600',
                                                color: roundStatus === 'active' ? 'rgba(254,205,211,0.85)' : '#475569',
                                            }}
                                        >
                                            {round.matches.length}
                                        </Text>
                                    </View>

                                    {canEditRound && (
                                        <Pressable
                                            onPress={() => onEditDeadline?.(round)}
                                            style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: 14,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: 'rgba(244,63,94,0.1)',
                                                borderWidth: 1,
                                                borderColor: 'rgba(244,63,94,0.2)',
                                            }}
                                        >
                                            <Ionicons name="calendar-outline" size={12} color="#FB7185" />
                                        </Pressable>
                                    )}
                                </View>
                                {round.roundDeadline && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <Ionicons name="time-outline" size={9} color="#F87171" />
                                        <Text style={{ fontSize: 9, color: '#F87171', fontWeight: '600' }}>
                                            {parseUtcDate(round.roundDeadline).toLocaleDateString([], {
                                                month: 'short',
                                                day: 'numeric',
                                            })}{' '}
                                            {parseUtcDate(round.roundDeadline).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: false,
                                            })}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View style={{ width: MATCH_W, height: totalH, position: 'relative' }}>
                                {round.matches.map((match, matchIdx) => {
                                    const top = verticalOffset + matchIdx * (MATCH_H + MATCH_GAP);
                                    return (
                                        <View
                                            key={match.id}
                                            style={{ position: 'absolute', top, left: 0, width: MATCH_W }}
                                        >
                                            <BracketMatch
                                                home={match.home}
                                                away={match.away}
                                                startTime={match.startTime}
                                                status={match.status}
                                                onPress={() => onMatchPress?.(match)}
                                                currentUserId={currentUserId}
                                                currentUsername={currentUsername}
                                                isAdmin={isAdmin}
                                                isTeamTournament={isTeamTournament}
                                                proposedByUserId={
                                                    (match as any).proposedByUserId ??
                                                    (match as any).ProposedByUserId ??
                                                    null
                                                }
                                            />
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {roundIdx < rounds.length - 1 && <View style={{ width: COL_GAP }} />}
                    </React.Fragment>
                );
            })}
        </View>
    );

    return (
        <View>
            {/* Header row — headerLeft (e.g. Help Requests pill) on the left, zoom controls on the right */}
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingBottom: 8,
                }}
            >
                <View style={{ flexShrink: 1 }}>{headerLeft ?? null}</View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                        onPress={zoomOut}
                        disabled={scale <= ZOOM_MIN}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.08)',
                            opacity: scale <= ZOOM_MIN ? 0.35 : 1,
                        }}
                    >
                        <Text style={{ color: '#94A3B8', fontWeight: '700', fontSize: 16, lineHeight: 20 }}>−</Text>
                    </Pressable>
                    <Pressable
                        onPress={zoomIn}
                        disabled={scale >= ZOOM_MAX}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.08)',
                            opacity: scale >= ZOOM_MAX ? 0.35 : 1,
                        }}
                    >
                        <Text style={{ color: '#94A3B8', fontWeight: '700', fontSize: 16, lineHeight: 20 }}>+</Text>
                    </Pressable>
                </View>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
            >
                <View style={{ width: contentWidth * scale, height: contentHeight * scale, overflow: 'hidden' }}>
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: contentWidth,
                            height: contentHeight,
                            transform: [{ scale }],
                            transformOrigin: 'top left',
                        }}
                    >
                        {innerContent}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { BracketMatch, teamProgressFrom } from './BracketMatch';
import { SeriesFormatChip, roundSeriesFormat } from './SeriesFormatChip';
import { parseUtcDate } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';

/* ── Layout constants ─────────────────────────────────────────────── */
const MATCH_H = 130;            // vertical slot per match card
const BASE_GAP = 16;            // gap between R1 cards
const UNIT = MATCH_H + BASE_GAP; // 146 px per R1 slot
const MATCH_W = 220;            // fixed card width
const CONNECTOR_W = 40;         // width of connector column between rounds
const HEADER_H = 64;            // height of round header row
const FORMAT_ROW_H = 18;        // extra header height when the round shows its best-of caption
// A card with a status header ("Report Result", "Completed", …) stands ~16px taller than its
// MATCH_H slot, and drops a shadow below that. The canvas is clipped to its computed height, so
// without this reserve the bottom card of a column comes out visibly sliced off.
const CARD_OVERHANG = 24;
const STROKE = 1.5;
const LINE_DEFAULT = 'rgba(255,255,255,0.06)';
const LINE_MY_PATH = 'rgba(99,102,241,0.25)';

/** Absolute top of a match card within its round's match-area View. */
function computeMatchTop(roundIdx: number, matchIdx: number): number {
    if (roundIdx === 0) return matchIdx * UNIT;
    // Center between the two feeder matches from the previous round
    return ((2 * matchIdx + 1) * Math.pow(2, roundIdx - 1) - 0.5) * UNIT;
}

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

interface TournamentBracketProps {
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

export function TournamentBracket({
    rounds,
    onMatchPress,
    currentUserId,
    currentUsername,
    isAdmin,
    onEditDeadline,
    tournamentStatus,
    isTeamTournament,
    headerLeft,
}: TournamentBracketProps) {
    if (!rounds?.length) return null;

    /* Zoom state */
    const ZOOM_STEP = 0.15;
    const ZOOM_MIN = 0.5;
    const ZOOM_MAX = 1.0;
    const [scale, setScale] = useState(0.7);
    const zoomIn = () => {
        setScale(prev => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
    };
    const zoomOut = () => {
        setScale(prev => Math.max(ZOOM_MIN, prev - ZOOM_STEP));
    };

    /* Total height of the match area — driven by the first (largest) round */
    const maxR1 = rounds[0].matches.length || 1;
    const totalH = maxR1 * UNIT - BASE_GAP + CARD_OVERHANG;

    /* Best-of caption per round. It lives in the header, not on the cards: the cards sit in fixed
       MATCH_H slots, so a strip on them would overflow into the next slot. */
    const roundFormats = useMemo(() => rounds.map(r => roundSeriesFormat(r.matches)), [rounds]);
    /* One height for every column, so the cards of all rounds stay on the same baseline. */
    const headerH = HEADER_H + (roundFormats.some(Boolean) ? FORMAT_ROW_H : 0);

    /* Exact pixel dimensions of the bracket canvas */
    const contentWidth = rounds.length * MATCH_W + (rounds.length - 1) * CONNECTOR_W;
    const contentHeight = headerH + totalH;

    /* Match id → Match lookup */
    const matchById = useMemo(() => {
        const map: Record<string, Match> = {};
        rounds.forEach(r => r.matches.forEach(m => { map[m.id] = m; }));
        return map;
    }, [rounds]);

    /* "My path" highlight set */
    const myPathIds = useMemo(() => {
        const highlighted = new Set<string>();
        if (!currentUserId && !currentUsername) return highlighted;
        const norm = (s?: string | null) => (s ?? '').toLowerCase().trim();
        const cId = norm(currentUserId);
        const cName = norm(currentUsername);
        const isMe = (uid?: string | null, uname?: string | null) =>
            (!!cId && norm(uid) === cId) || (!!cName && norm(uname) === cName);
        const trace = (matchId: string) => {
            if (highlighted.has(matchId)) return;
            const m = matchById[matchId];
            if (!m) return;
            highlighted.add(matchId);
            if (m.nextMatchId) {
                if (m.home?.isWinner && isMe(m.home.userId, m.home.username)) trace(m.nextMatchId);
                if (m.away?.isWinner && isMe(m.away.userId, m.away.username)) trace(m.nextMatchId);
            }
        };
        rounds.forEach(r => r.matches.forEach(m => {
            if (isMe(m.home?.userId, m.home?.username) || isMe(m.away?.userId, m.away?.username)) {
                trace(m.id);
            }
        }));
        return highlighted;
    }, [rounds, currentUserId, currentUsername, matchById]);

    const innerContent = (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {rounds.map((round, roundIdx) => {
                    const roundStatus = getRoundStatus(round);
                    const isLastRound = roundIdx === rounds.length - 1;
                    const canEditRound = isAdmin &&
                        tournamentStatus !== 4 &&
                        roundStatus !== 'completed';

                    return (
                        <React.Fragment key={round.roundNumber}>
                            {/* ── Round column ──────────────────────────────── */}
                            <View style={{ width: MATCH_W }}>

                                {/* Header pill */}
                                <View style={{ height: headerH, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 6,
                                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                                            borderWidth: 1,
                                            backgroundColor: roundStatus === 'active' ? 'rgba(79,70,229,0.8)' : 'rgba(255,255,255,0.03)',
                                            borderColor: roundStatus === 'active' ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.07)',
                                        }}>
                                            {roundStatus === 'completed' && (
                                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' }} />
                                            )}
                                            {roundStatus === 'active' && (
                                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#C7D2FE' }} />
                                            )}
                                            <Text
                                                style={{
                                                    fontSize: 11, fontWeight: '700',
                                                    color: roundStatus === 'active' ? '#FFFFFF' : roundStatus === 'completed' ? '#64748B' : '#94A3B8',
                                                }}
                                                numberOfLines={1}
                                            >
                                                {round.name}
                                            </Text>
                                            <Text style={{
                                                fontSize: 10, fontWeight: '600',
                                                color: roundStatus === 'active' ? 'rgba(199,210,254,0.7)' : '#475569',
                                            }}>
                                                {round.matches.length}
                                            </Text>
                                        </View>

                                        {/* Admin calendar button */}
                                        {canEditRound && (
                                            <Pressable
                                                onPress={() => onEditDeadline?.(round)}
                                                style={{
                                                    width: 28, height: 28, borderRadius: 14,
                                                    alignItems: 'center', justifyContent: 'center',
                                                    backgroundColor: 'rgba(99,102,241,0.1)',
                                                    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
                                                }}
                                            >
                                                <Ionicons name="calendar-outline" size={12} color="#818CF8" />
                                            </Pressable>
                                        )}
                                    </View>
                                    {round.roundDeadline && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                            <Ionicons name="time-outline" size={9} color="#F87171" />
                                            <Text style={{ fontSize: 9, color: '#F87171', fontWeight: '600' }}>
                                                {parseUtcDate(round.roundDeadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                {' '}
                                                {parseUtcDate(round.roundDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                            </Text>
                                        </View>
                                    )}
                                    {roundFormats[roundIdx] && (
                                        <SeriesFormatChip
                                            format={roundFormats[roundIdx]!}
                                            isTeamTournament={isTeamTournament}
                                            style={{ marginTop: 4 }}
                                        />
                                    )}
                                </View>

                                {/* Match cards — absolutely positioned within the match area */}
                                <View style={{ width: MATCH_W, height: totalH, position: 'relative' }}>
                                    {round.matches.map((match, matchIdx) => {
                                        const top = computeMatchTop(roundIdx, matchIdx);
                                        const isHighlighted = myPathIds.has(match.id);
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
                                                    proposedByUserId={(match as any).proposedByUserId ?? (match as any).ProposedByUserId ?? null}
                                                    teamProgress={teamProgressFrom(match)}
                                                    className={isHighlighted ? 'border-indigo-500/30' : undefined}
                                                />
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* ── Connector column ──────────────────────────── */}
                            {!isLastRound && (
                                <View style={{ width: CONNECTOR_W, height: headerH + totalH, position: 'relative' }}>
                                    {Array.from({ length: Math.floor(round.matches.length / 2) }, (_, j) => {
                                        const topMatch = round.matches[2 * j];
                                        const botMatch = round.matches[2 * j + 1];
                                        if (!topMatch || !botMatch) return null;

                                        const topCenter = headerH + computeMatchTop(roundIdx, 2 * j) + MATCH_H / 2;
                                        const botCenter = headerH + computeMatchTop(roundIdx, 2 * j + 1) + MATCH_H / 2;
                                        const midCenter = (topCenter + botCenter) / 2;
                                        const halfW = CONNECTOR_W / 2;

                                        // Determine if this connector is on "my path"
                                        const nextMatch = topMatch.nextMatchId
                                            ? matchById[topMatch.nextMatchId]
                                            : botMatch.nextMatchId
                                                ? matchById[botMatch.nextMatchId]
                                                : null;
                                        const onMyPath =
                                            (myPathIds.has(topMatch.id) || myPathIds.has(botMatch.id)) &&
                                            !!nextMatch && myPathIds.has(nextMatch.id);
                                        const lineColor = onMyPath ? LINE_MY_PATH : LINE_DEFAULT;

                                        return (
                                            <React.Fragment key={j}>
                                                {/* Top horizontal stub */}
                                                <View style={{ position: 'absolute', left: 0, top: topCenter - STROKE / 2, width: halfW, height: STROKE, backgroundColor: lineColor }} />
                                                {/* Bottom horizontal stub */}
                                                <View style={{ position: 'absolute', left: 0, top: botCenter - STROKE / 2, width: halfW, height: STROKE, backgroundColor: lineColor }} />
                                                {/* Vertical connector */}
                                                <View style={{ position: 'absolute', left: halfW - STROKE / 2, top: topCenter, width: STROKE, height: botCenter - topCenter, backgroundColor: lineColor }} />
                                                {/* Right stub into next-round match */}
                                                <View style={{ position: 'absolute', left: halfW, top: midCenter - STROKE / 2, width: halfW, height: STROKE, backgroundColor: lineColor }} />
                                            </React.Fragment>
                                        );
                                    })}
                                </View>
                            )}
                        </React.Fragment>
                    );
                })}
            </View>
    );

    return (
        <View>
            {/* Header row — headerLeft (e.g. Help Requests pill) on the left, zoom controls on the right */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
                <View style={{ flexShrink: 1 }}>{headerLeft ?? null}</View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                        onPress={zoomOut}
                        disabled={scale <= ZOOM_MIN}
                        style={{
                            width: 28, height: 28, borderRadius: 8,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                            opacity: scale <= ZOOM_MIN ? 0.35 : 1,
                        }}
                    >
                        <Text style={{ color: '#94A3B8', fontWeight: '700', fontSize: 16, lineHeight: 20 }}>−</Text>
                    </Pressable>
                    <Pressable
                        onPress={zoomIn}
                        disabled={scale >= ZOOM_MAX}
                        style={{
                            width: 28, height: 28, borderRadius: 8,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
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
                {/*
                  Outer View is explicitly sized to the SCALED dimensions so the
                  ScrollView only allocates real visual space — no excess blank area.
                  The inner Animated.View lives absolutely inside and scales from
                  the top-left origin.
                */}
                <View style={{ width: contentWidth * scale, height: contentHeight * scale, overflow: 'hidden' }}>
                    <View style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: contentWidth,
                        height: contentHeight,
                        transform: [{ scale }],
                        transformOrigin: 'top left',
                    }}>
                        {innerContent}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

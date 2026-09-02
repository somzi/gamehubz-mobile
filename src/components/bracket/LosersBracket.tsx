import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { BracketMatch, teamProgressFrom } from './BracketMatch';
import { SeriesFormatChip, roundSeriesFormat } from './SeriesFormatChip';
import { parseUtcDate } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';

// LB layout is a flat column-per-round grid: match counts don't halve cleanly between rounds
// (a "minor" consolidation round is followed by a "major" round with the same count once a
// fresh batch of WB losers drops in), so the binary-tree connector geometry used by
// TournamentBracket doesn't apply. Cards are stacked top-to-bottom inside each round column,
// and connectors are instead drawn data-driven from each match's nextMatchId (see `connectors`):
// this works for the irregular LB topology and still forms a clean Y-merge for paired feeders,
// matching the winners-bracket look.

const MATCH_H = 130;
const MATCH_GAP = 16;
const MATCH_W = 220;
const COL_GAP = 40;            // gap between round columns — also the lane the connectors live in
const HEADER_H = 64;
const FORMAT_ROW_H = 18;       // extra header height when the round shows its best-of caption
// A card with a status header stands ~16px taller than its MATCH_H slot, plus its shadow. The
// canvas is clipped to its computed height, so this reserve keeps the bottom card of a column
// from being sliced off.
const CARD_OVERHANG = 24;
const STROKE = 1.5;
const LINE_DEFAULT = 'rgba(255,255,255,0.06)';
const LINE_MY_PATH = 'rgba(99,102,241,0.25)';

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
    if (roundNumber === maxRoundNumber) return i18n.t('bracket:card.lbFinal');
    if (roundNumber === maxRoundNumber - 1) return i18n.t('bracket:card.lbSemifinal');
    return i18n.t('bracket:card.lbRound', { n: roundNumber });
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

    const maxRoundNumber = Math.max(...rounds.map(r => r.roundNumber));
    const contentWidth = rounds.length * MATCH_W + (rounds.length - 1) * COL_GAP;

    // Best-of caption per round. It belongs in the header rather than on the cards, which sit in
    // fixed MATCH_H slots and would collide with each other if they grew.
    const roundFormats = useMemo(() => rounds.map(r => roundSeriesFormat(r.matches)), [rounds]);
    // One height for every column, so cards across rounds stay on the same baseline.
    const headerH = HEADER_H + (roundFormats.some(Boolean) ? FORMAT_ROW_H : 0);

    // Match lookup, used by the path tracer.
    const matchById = useMemo(() => {
        const map: Record<string, Match> = {};
        rounds.forEach(r => r.matches.forEach(m => { map[m.id] = m; }));
        return map;
    }, [rounds]);

    // Feeder-centered layout. Each match is positioned on the vertical center of the matches that
    // feed it (its nextMatch predecessors) — exactly how the winners bracket centers a match
    // between its two feeders — so connectors run straight/clean instead of tangling, which is what
    // happens when every round is centered independently. The first round (and any match whose
    // feeders were collapsed out in a small/bye bracket) falls back to even stacking, and a
    // per-column guard guarantees cards never overlap.
    const layout = useMemo(() => {
        const P = MATCH_W + COL_GAP;
        const UNIT = MATCH_H + MATCH_GAP;

        // targetMatchId -> ids of the matches whose winner advances into it
        const feedersOf: Record<string, string[]> = {};
        rounds.forEach(r => r.matches.forEach(m => {
            if (m.nextMatchId) (feedersOf[m.nextMatchId] ??= []).push(m.id);
        }));

        const pos: Record<string, { roundIdx: number; top: number; centerY: number; rightX: number; leftX: number }> = {};
        let areaH = 0;

        rounds.forEach((round, roundIdx) => {
            let cursor = -Infinity; // top of the previously placed card in this column + UNIT
            round.matches.forEach((m, matchIdx) => {
                // Only feeders already placed (always in an earlier column, since they point forward).
                const feeders = (feedersOf[m.id] ?? []).filter(fid => pos[fid]);
                let desired: number;
                if (roundIdx === 0 || feeders.length === 0) {
                    desired = matchIdx === 0 ? 0 : cursor;
                } else {
                    desired = feeders.reduce((sum, fid) => sum + pos[fid].top, 0) / feeders.length;
                }
                const top = matchIdx === 0 ? desired : Math.max(desired, cursor);
                pos[m.id] = {
                    roundIdx,
                    top,
                    centerY: headerH + top + MATCH_H / 2,
                    rightX: roundIdx * P + MATCH_W,
                    leftX: roundIdx * P,
                };
                cursor = top + UNIT;
                if (top + MATCH_H > areaH) areaH = top + MATCH_H;
            });
        });

        return { pos, areaH };
    }, [rounds, headerH]);

    const totalH = layout.areaH + CARD_OVERHANG;
    const contentHeight = headerH + totalH;

    // "My path" highlight — same tracer the winners bracket uses: follow each match the current
    // user wins forward via nextMatchId.
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

    // One connector per match → its nextMatch (forward, same-stage only). Paired feeders that
    // share a target naturally combine into the winners-bracket-style Y-merge. The LB final has
    // no in-stage nextMatch (the grand final is a separate stage), so it simply draws none.
    const connectors = useMemo(() => {
        const segs: { id: string; sx: number; sy: number; tx: number; ty: number; color: string }[] = [];
        rounds.forEach(round => {
            round.matches.forEach(m => {
                if (!m.nextMatchId) return;
                const src = layout.pos[m.id];
                const tgt = layout.pos[m.nextMatchId];
                if (!src || !tgt || tgt.roundIdx <= src.roundIdx) return;
                const onMyPath = myPathIds.has(m.id) && myPathIds.has(m.nextMatchId);
                segs.push({
                    id: m.id,
                    sx: src.rightX,
                    sy: src.centerY,
                    tx: tgt.leftX,
                    ty: tgt.centerY,
                    color: onMyPath ? LINE_MY_PATH : LINE_DEFAULT,
                });
            });
        });
        return segs;
    }, [rounds, layout, myPathIds]);

    const innerContent = (
        <View style={{ width: contentWidth, height: contentHeight, position: 'relative' }}>
            {/* Connector lane — behind the cards, living in the gaps between columns. Each match
                links to its nextMatch (winner advances); paired feeders form a clean Y-merge that
                mirrors the winners-bracket connector styling. */}
            <View
                pointerEvents="none"
                style={{ position: 'absolute', top: 0, left: 0, width: contentWidth, height: contentHeight }}
            >
                {connectors.map((c) => {
                    const midX = (c.sx + c.tx) / 2;
                    const vTop = Math.min(c.sy, c.ty);
                    const vH = Math.abs(c.ty - c.sy);
                    return (
                        <React.Fragment key={c.id}>
                            {/* stub out of the source card */}
                            <View style={{ position: 'absolute', left: c.sx, top: c.sy - STROKE / 2, width: midX - c.sx, height: STROKE, backgroundColor: c.color }} />
                            {/* vertical run across the gap */}
                            {vH > 0 && (
                                <View style={{ position: 'absolute', left: midX - STROKE / 2, top: vTop, width: STROKE, height: vH, backgroundColor: c.color }} />
                            )}
                            {/* stub into the target card */}
                            <View style={{ position: 'absolute', left: midX, top: c.ty - STROKE / 2, width: c.tx - midX, height: STROKE, backgroundColor: c.color }} />
                        </React.Fragment>
                    );
                })}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {rounds.map((round, roundIdx) => {
                const roundStatus = getRoundStatus(round);
                const canEditRound =
                    isAdmin && tournamentStatus !== 4 && roundStatus !== 'completed';
                const label = getLbRoundLabel(round.roundNumber, maxRoundNumber);

                return (
                    <React.Fragment key={round.roundNumber}>
                        <View style={{ width: MATCH_W }}>
                            <View
                                style={{
                                    height: headerH,
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
                                            {parseUtcDate(round.roundDeadline).toLocaleDateString(i18n.language, {
                                                month: 'short',
                                                day: 'numeric',
                                            })}{' '}
                                            {parseUtcDate(round.roundDeadline).toLocaleTimeString(i18n.language, {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: false,
                                            })}
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

                            <View style={{ width: MATCH_W, height: totalH, position: 'relative' }}>
                                {round.matches.map((match) => {
                                    const top = layout.pos[match.id]?.top ?? 0;
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
                                                teamProgress={teamProgressFrom(match)}
                                                className={myPathIds.has(match.id) ? 'border-indigo-500/30' : undefined}
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
                {/* Grows so the admin strip can fill the row instead of sizing to its own
                    text; the zoom controls keep their intrinsic width on the right. */}
                <View style={{ flex: 1, flexDirection: 'row', marginRight: headerLeft ? 8 : 0 }}>
                    {headerLeft ?? null}
                </View>
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

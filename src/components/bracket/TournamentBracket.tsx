import React, { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { BracketMatch, teamProgressFrom, checkInFrom } from './BracketMatch';
import { roundSeriesFormat } from './SeriesFormatChip';
import {
    RoundHeader, ZoomControls, ChampionPlate, roundStatusOf, isSettled,
    CONNECTOR_STROKE as STROKE, LINE_IDLE, LINE_PLAYED, LINE_MY_PATH,
} from './BracketChrome';
import { MatchStatus } from '../../types/matchStatus';

/* ── Layout constants ─────────────────────────────────────────────── */
const MATCH_H = 130;            // vertical slot per match card
const BASE_GAP = 16;            // gap between R1 cards
const UNIT = MATCH_H + BASE_GAP; // 146 px per R1 slot
const MATCH_W = 220;            // fixed card width
const CONNECTOR_W = 40;         // width of connector column between rounds
const HEADER_H = 64;            // height of round header row
const FORMAT_ROW_H = 20;        // extra header height when the round shows its best-of caption
const CHAMPION_W = 200;         // the champion plate after the final
// Cards are centred in their MATCH_H slot and stay under it, so only a little breathing room is
// kept under the last one (the canvas is clipped to its computed height).
const CARD_OVERHANG = 8;
const LINE_CHAMPION = 'rgba(251,191,36,0.5)';

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
    /** Profile photo of the player behind the slot; absent on team slots and on older backends. */
    avatarUrl?: string | null;
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
    /**
     * The final of this bracket decides the tournament (single elimination) — end it in the
     * champion plate. Off for a winners bracket, whose final only feeds the grand final.
     */
    showChampion?: boolean;
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
    showChampion,
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

    /* The final, when this bracket ends in a single match that crowns someone */
    const lastRound = rounds[rounds.length - 1];
    const finalMatch = showChampion && lastRound.matches.length === 1 ? lastRound.matches[0] : null;
    const champion = finalMatch && finalMatch.status === MatchStatus.Completed
        ? (finalMatch.home?.isWinner ? finalMatch.home : finalMatch.away?.isWinner ? finalMatch.away : null)
        : null;

    /* Exact pixel dimensions of the bracket canvas */
    const contentWidth = rounds.length * MATCH_W + (rounds.length - 1) * CONNECTOR_W
        + (finalMatch ? CONNECTOR_W + CHAMPION_W : 0);
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

    const finalCenter = finalMatch ? headerH + computeMatchTop(rounds.length - 1, 0) + MATCH_H / 2 : 0;

    const innerContent = (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {rounds.map((round, roundIdx) => {
                    const roundStatus = roundStatusOf(round.matches);
                    const isLastRound = roundIdx === rounds.length - 1;
                    const canEditRound = isAdmin &&
                        tournamentStatus !== 4 &&
                        roundStatus !== 'completed';

                    return (
                        <React.Fragment key={round.roundNumber}>
                            {/* ── Round column ──────────────────────────────── */}
                            <View style={{ width: MATCH_W }}>
                                <RoundHeader
                                    name={round.name}
                                    status={roundStatus}
                                    deadline={round.roundDeadline}
                                    format={roundFormats[roundIdx]}
                                    isTeamTournament={isTeamTournament}
                                    onEdit={canEditRound ? () => onEditDeadline?.(round) : undefined}
                                    height={headerH}
                                />

                                {/* Match cards — each centred in its slot, so the connectors meet it mid-height */}
                                <View style={{ width: MATCH_W, height: totalH, position: 'relative' }}>
                                    {round.matches.map((match, matchIdx) => {
                                        const top = computeMatchTop(roundIdx, matchIdx);
                                        return (
                                            <View
                                                key={match.id}
                                                style={{ position: 'absolute', top, left: 0, width: MATCH_W, height: MATCH_H, justifyContent: 'center' }}
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
                                                    checkIn={checkInFrom(match)}
                                                    onMyPath={myPathIds.has(match.id)}
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
                                        const nextOnMyPath = !!nextMatch && myPathIds.has(nextMatch.id);
                                        // Each feeder's stub lights up once its winner has gone through it;
                                        // the joint and the stub into the next match once both have.
                                        const stubColor = (m: Match) =>
                                            myPathIds.has(m.id) && nextOnMyPath ? LINE_MY_PATH : isSettled(m) ? LINE_PLAYED : LINE_IDLE;
                                        const topColor = stubColor(topMatch);
                                        const botColor = stubColor(botMatch);
                                        const jointColor = (myPathIds.has(topMatch.id) || myPathIds.has(botMatch.id)) && nextOnMyPath
                                            ? LINE_MY_PATH
                                            : isSettled(topMatch) && isSettled(botMatch) ? LINE_PLAYED : LINE_IDLE;

                                        return (
                                            <React.Fragment key={j}>
                                                {/* Top horizontal stub */}
                                                <View style={{ position: 'absolute', left: 0, top: topCenter - STROKE / 2, width: halfW, height: STROKE, backgroundColor: topColor }} />
                                                {/* Bottom horizontal stub */}
                                                <View style={{ position: 'absolute', left: 0, top: botCenter - STROKE / 2, width: halfW, height: STROKE, backgroundColor: botColor }} />
                                                {/* Vertical connector — each half in its feeder's colour */}
                                                <View style={{ position: 'absolute', left: halfW - STROKE / 2, top: topCenter - STROKE / 2, width: STROKE, height: midCenter - topCenter + STROKE / 2, backgroundColor: topColor }} />
                                                <View style={{ position: 'absolute', left: halfW - STROKE / 2, top: midCenter, width: STROKE, height: botCenter - midCenter + STROKE / 2, backgroundColor: botColor }} />
                                                {/* Right stub into next-round match */}
                                                <View style={{ position: 'absolute', left: halfW, top: midCenter - STROKE / 2, width: halfW, height: STROKE, backgroundColor: jointColor }} />
                                            </React.Fragment>
                                        );
                                    })}
                                </View>
                            )}
                        </React.Fragment>
                    );
                })}

            {/* ── The champion, where the road ends ─────────────── */}
            {finalMatch && (
                <>
                    <View style={{ width: CONNECTOR_W, height: headerH + totalH, position: 'relative' }}>
                        <View
                            style={{
                                position: 'absolute', left: 0, top: finalCenter - STROKE / 2, width: CONNECTOR_W, height: STROKE,
                                backgroundColor: champion ? LINE_CHAMPION : LINE_IDLE,
                            }}
                        />
                    </View>
                    <View style={{ width: CHAMPION_W, height: headerH + totalH }}>
                        <View style={{ position: 'absolute', top: finalCenter - MATCH_H / 2, left: 0, width: CHAMPION_W, height: MATCH_H, justifyContent: 'center' }}>
                            <ChampionPlate champion={champion} isTeamTournament={isTeamTournament} width={CHAMPION_W} />
                        </View>
                    </View>
                </>
            )}
        </View>
    );

    return (
        <View>
            {/* Header row — headerLeft (e.g. Help Requests pill) on the left, zoom controls on the right */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
                {/* Grows so the admin strip can fill the row instead of sizing to its own
                    text; the zoom controls keep their intrinsic width on the right. */}
                <View style={{ flex: 1, flexDirection: 'row', marginRight: headerLeft ? 10 : 0 }}>
                    {headerLeft ?? null}
                </View>
                <ZoomControls
                    onZoomOut={zoomOut}
                    onZoomIn={zoomIn}
                    canZoomOut={scale > ZOOM_MIN}
                    canZoomIn={scale < ZOOM_MAX}
                />
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

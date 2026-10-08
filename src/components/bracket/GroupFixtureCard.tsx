import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { RaisedCard } from '../ui/RaisedCard';
import { COLORS } from '../../lib/theme';
import { parseUtcDate } from '../../lib/utils';
import { dateLocale } from '../../i18n';
import { matchCardState, matchCardLabel, CARD_ACCENT as ACCENT, type Participant, type TeamProgress, type CardCheckIn } from './BracketMatch';

type Accent = (typeof ACCENT)[keyof typeof ACCENT];

const TABULAR = { fontVariant: ['tabular-nums' as const] };
const WIN_GLOW = Platform.OS === 'ios'
    ? { shadowColor: ACCENT.go.main, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }
    : null;

interface GroupFixtureCardProps {
    home: Participant | null;
    away: Participant | null;
    startTime?: string | null;
    status?: number;
    onPress?: () => void;
    currentUserId?: string;
    currentUsername?: string;
    isAdmin?: boolean;
    isTeamTournament?: boolean;
    proposedByUserId?: string | null;
    teamProgress?: TeamProgress | null;
    checkIn?: CardCheckIn | null;
    noEvidence?: boolean;
}

/**
 * One side of the face-off: avatar (or team shield) over the name. The winner gets a green ring
 * and a trophy; nobody is faded. The viewer's own side shows in its green name.
 */
function Side({
    participant,
    isMe,
    won,
    isTeam,
    emptyLabel,
}: {
    participant: Participant | null;
    isMe: boolean;
    won: boolean;
    isTeam?: boolean;
    emptyLabel: string;
}) {
    if (!participant) {
        return (
            <View style={styles.side}>
                <View style={styles.emptyAvatar} />
                <Text className="w-full text-center text-[12.5px] leading-[16px] font-semibold italic text-slate-600" style={{ marginTop: 6 }} numberOfLines={1}>
                    {emptyLabel}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.side}>
            <View>
                {isTeam ? (
                    <View style={[styles.teamTile, won && styles.winRing, won && WIN_GLOW]}>
                        <Ionicons name="people" size={18} color={won ? ACCENT.go.text : COLORS.slate400} />
                    </View>
                ) : (
                    <View style={[styles.avatarRing, won && styles.winRing, won && WIN_GLOW]}>
                        <PlayerAvatar
                            src={participant.avatarUrl ?? (participant as any).AvatarUrl ?? undefined}
                            name={participant.username}
                            size="md"
                            className="border-0"
                        />
                    </View>
                )}
                {won && (
                    <View style={styles.trophyBadge}>
                        <Ionicons name="trophy" size={9} color="#04150F" />
                    </View>
                )}
            </View>
            <Text
                className={isMe ? 'w-full text-center text-[12.5px] leading-[16px] font-bold text-emerald-300' : 'w-full text-center text-[12.5px] leading-[16px] font-bold text-white'}
                style={{ marginTop: 6 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
            >
                {participant.username}
            </Text>
        </View>
    );
}

/**
 * A group fixture drawn as a face-off: home left, away right, and between them what the match
 * comes down to right now — the score once there is one, the kick-off time once it's set, "vs"
 * until then. The state sits over it in its colour, with a short line on the top edge; when the
 * viewer has a result to report, the card ends in that action.
 *
 * Group stages lay cards out in a list, so unlike the bracket card this one isn't held to a fixed
 * slot height and can give each player half the width.
 */
export const GroupFixtureCard = React.memo(function GroupFixtureCard({
    home,
    away,
    startTime,
    status,
    onPress,
    currentUserId,
    currentUsername,
    isAdmin,
    isTeamTournament,
    proposedByUserId,
    teamProgress,
    checkIn,
    noEvidence,
}: GroupFixtureCardProps) {
    const { t } = useTranslation('bracket');
    const s = matchCardState({ home, away, startTime, status, hasOnPress: !!onPress, currentUserId, currentUsername, isAdmin, proposedByUserId, teamProgress, checkIn, noEvidence });

    // What the match is waiting on — same wording as the bracket card, minus "Report result",
    // which this card has a button for. The running team score sits under the score instead.
    const cardLabel = matchCardLabel(s, t, teamProgress, false);
    const label = cardLabel
        ? cardLabel.kind === 'checkIn' ? `${cardLabel.text} ${cardLabel.trailing}` : cardLabel.text
        : null;
    const labelAccent: Accent | null = cardLabel?.accent ?? null;

    const actionAccent = s.isTieBreakNeeded ? ACCENT.wait : ACCENT.go;
    // A result with no evidence keeps its "Completed" label; the line and a note under the score flag it.
    const lineAccent: Accent | null = s.canReport ? actionAccent : labelAccent ?? (s.isMissingEvidence ? ACCENT.wait : null);

    const homeScore = home?.score ?? null;
    const awayScore = away?.score ?? null;
    const hasScore = homeScore !== null || awayScore !== null;
    const decided = s.isCompleted && (!!home?.isWinner || !!away?.isWinner);

    const kickOff = startTime && !s.isCompleted && !s.isNoShow && !hasScore && !s.isTeamInProgress
        ? parseUtcDate(startTime)
        : null;
    const hasKickOff = !!kickOff && !isNaN(kickOff.getTime());

    const emptyLabel = s.isCompletedBye ? t('bye') : t('common:app.tbd');

    const renderCenter = () => {
        if (hasScore) {
            return (
                <View className="flex-row items-center">
                    <Text style={[TABULAR, styles.scoreDigit, { color: decided && !home?.isWinner ? COLORS.slate500 : '#FFFFFF' }]}>
                        {homeScore ?? '–'}
                    </Text>
                    <Text style={styles.scoreColon}>:</Text>
                    <Text style={[TABULAR, styles.scoreDigit, { color: decided && !away?.isWinner ? COLORS.slate500 : '#FFFFFF' }]}>
                        {awayScore ?? '–'}
                    </Text>
                </View>
            );
        }
        if (s.isTeamInProgress && teamProgress) {
            return (
                <>
                    <View className="flex-row items-center">
                        <Text style={[TABULAR, styles.scoreDigit, { color: '#FFFFFF' }]}>{teamProgress.homeWins}</Text>
                        <Text style={styles.scoreColon}>:</Text>
                        <Text style={[TABULAR, styles.scoreDigit, { color: '#FFFFFF' }]}>{teamProgress.awayWins}</Text>
                    </View>
                    <Text style={TABULAR} className="text-[11px] font-semibold text-slate-500">
                        {teamProgress.decided}/{teamProgress.total}
                    </Text>
                </>
            );
        }
        if (hasKickOff) {
            return (
                <>
                    <Text style={[TABULAR, styles.time]}>
                        {kickOff!.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </Text>
                    <Text className="w-full text-center text-[11px] leading-[14px] font-semibold text-slate-400" numberOfLines={1}>
                        {kickOff!.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                    </Text>
                </>
            );
        }
        return <Text style={styles.vs}>VS</Text>;
    };

    const homeName = home?.username ?? emptyLabel;
    const awayName = away?.username ?? emptyLabel;

    return (
        <PressableScale
            onPress={s.canShowDetails ? onPress : undefined}
            disabled={!s.canShowDetails}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={[
                `${homeName} vs ${awayName}`,
                hasScore ? `${homeScore ?? 0}:${awayScore ?? 0}` : null,
                label,
                s.isMissingEvidence ? t('card.noEvidence') : null,
                s.canReport ? (s.isTieBreakNeeded ? t('card.reportTiebreak') : t('card.reportResult')) : null,
            ].filter(Boolean).join('. ')}
        >
            <RaisedCard
                style={[
                    styles.card,
                    s.canReport && { borderColor: actionAccent.main + '40', borderTopColor: actionAccent.main + '5C' },
                ]}
            >
                {lineAccent && (
                    <View pointerEvents="none" style={styles.lineWrap}>
                        <LinearGradient
                            colors={[lineAccent.main, lineAccent.bright, lineAccent.main]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.line}
                        />
                    </View>
                )}

                <View style={styles.body}>
                    <View className="flex-row items-center">
                        <Side
                            participant={home}
                            isMe={s.isHome}
                            won={decided && !!home?.isWinner}
                            isTeam={isTeamTournament}
                            emptyLabel={emptyLabel}
                        />

                        <View style={styles.center}>
                            {label && (
                                <Text
                                    className="w-full text-center text-[10px] leading-[13px] font-black uppercase tracking-[1.4px]"
                                    style={{ color: labelAccent?.text ?? COLORS.slate500, marginBottom: 3 }}
                                    numberOfLines={2}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.8}
                                >
                                    {label}
                                </Text>
                            )}
                            {renderCenter()}
                            {s.isMissingEvidence && (
                                <Text
                                    className="w-full text-center text-[11px] leading-[14px] font-bold"
                                    style={{ color: ACCENT.wait.text, marginTop: 2 }}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.8}
                                >
                                    {t('card.noEvidence')}
                                </Text>
                            )}
                        </View>

                        <Side
                            participant={away}
                            isMe={s.isAway}
                            won={decided && !!away?.isWinner}
                            isTeam={isTeamTournament}
                            emptyLabel={emptyLabel}
                        />
                    </View>
                </View>

                {s.canReport && (
                    <View
                        className="flex-row items-center justify-center"
                        style={[styles.action, { borderTopColor: actionAccent.main + '2E', backgroundColor: actionAccent.main + '14' }]}
                    >
                        <Text className="text-[13px] font-bold" style={{ color: actionAccent.text }} numberOfLines={1}>
                            {s.isTieBreakNeeded ? t('card.reportTiebreak') : t('card.reportResult')}
                        </Text>
                        <Ionicons name="chevron-forward" size={13} color={actionAccent.text} />
                    </View>
                )}
            </RaisedCard>
        </PressableScale>
    );
});

const styles = StyleSheet.create({
    card: {
        overflow: 'hidden',
    },
    lineWrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    line: {
        width: '30%',
        height: 3,
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
    },
    body: {
        paddingHorizontal: 12,
        paddingTop: 16,
        paddingBottom: 14,
    },
    side: {
        flex: 1,
        alignItems: 'center',
    },
    avatarRing: {
        borderRadius: 999,
        padding: 2,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    winRing: {
        borderWidth: 2,
        padding: 1,
        borderColor: ACCENT.go.main,
    },
    trophyBadge: {
        position: 'absolute',
        right: -3,
        bottom: -3,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ACCENT.go.main,
        borderWidth: 2.5,
        borderColor: COLORS.cardRaised,
    },
    teamTile: {
        width: 46,
        height: 46,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    emptyAvatar: {
        width: 46,
        height: 46,
        borderRadius: 999,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    center: {
        width: 116,
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    scoreDigit: {
        fontSize: 26,
        lineHeight: 31,
        fontWeight: '900',
    },
    scoreColon: {
        fontSize: 20,
        lineHeight: 31,
        fontWeight: '800',
        color: COLORS.slate500,
        marginHorizontal: 7,
    },
    time: {
        fontSize: 22,
        lineHeight: 27,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    vs: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '900',
        letterSpacing: 2,
        color: COLORS.slate500,
    },
    action: {
        gap: 6,
        paddingVertical: 11,
        borderTopWidth: 1,
    },
});

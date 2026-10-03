import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { RaisedCard } from '../ui/RaisedCard';
import { COLORS } from '../../lib/theme';

interface MatchHistoryCardProps {
    tournamentName: string;
    hubName?: string;
    /** The profile owner — drawn on the left, the opponent on the right. */
    userName?: string;
    userAvatarUrl?: string;
    opponentName: string;
    opponentAvatarUrl?: string;
    result: 'win' | 'loss' | 'draw';
    date: string;
    userScore?: number;
    opponentScore?: number;
    onPress?: () => void;
    className?: string;
}

// The result's colour lives only in the line over the score and the outcome under it.
const RESULT_THEME = {
    win: { main: '#10B981', bright: '#A7F3D0', text: '#34D399', labelKey: 'app.victory' },
    draw: { main: '#EAB308', bright: '#FEF08A', text: '#FACC15', labelKey: 'app.drawResult' },
    loss: { main: '#EF4444', bright: '#FECACA', text: '#F87171', labelKey: 'app.defeat' },
} as const;

const TABULAR = { fontVariant: ['tabular-nums' as const] };
const LOSER_OPACITY = 0.5;

/** One player of the face-off: avatar over name. The losing side is dimmed, like a results board. */
function Side({ name, avatarUrl, lost }: { name: string; avatarUrl?: string; lost: boolean }) {
    return (
        <View style={[styles.side, lost && { opacity: LOSER_OPACITY }]}>
            <View style={styles.avatarRing}>
                <PlayerAvatar src={avatarUrl} name={name} size="md" className="border-0" />
            </View>
            <Text
                className="w-full text-center text-[12.5px] leading-[16px] font-bold text-white"
                style={{ marginTop: 6 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
            >
                {name}
            </Text>
        </View>
    );
}

/**
 * One played match on a profile, drawn as a face-off: the profile owner left, the opponent right,
 * and between them the score under a line in the result's colour — the outcome, the score and the
 * date stacked on the card's axis. Under a hairline, where it was played.
 *
 * Memoized so scrolling / loading additional pages doesn't re-render every history row.
 */
export const MatchHistoryCard = React.memo(function MatchHistoryCard({
    tournamentName,
    hubName,
    userName,
    userAvatarUrl,
    opponentName,
    opponentAvatarUrl,
    result,
    date,
    userScore,
    opponentScore,
    onPress,
    className,
}: MatchHistoryCardProps) {
    const { t } = useTranslation('common');
    const theme = RESULT_THEME[result];
    const resultLabel = t(theme.labelKey);
    const hasScore = userScore != null && opponentScore != null;
    const ownerName = userName || t('app.me');

    return (
        <PressableScale
            onPress={onPress}
            disabled={!onPress}
            pressedScale={0.98}
            className={className}
            accessibilityLabel={[`vs ${opponentName}`, resultLabel, hasScore ? `${userScore}:${opponentScore}` : null, tournamentName, hubName, date]
                .filter(Boolean)
                .join('. ')}
        >
            <RaisedCard style={styles.card}>
                {/* The result's line on the top edge, right over the score */}
                <View pointerEvents="none" style={styles.spotlight}>
                    <View style={[styles.glowLine, { backgroundColor: theme.main }]}>
                        <LinearGradient
                            colors={[theme.main, theme.bright, theme.main]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.glowFill}
                        />
                    </View>
                </View>

                <View style={styles.body}>
                    {/* ─── Face-off ─── */}
                    <View className="flex-row items-center">
                        <Side name={ownerName} avatarUrl={userAvatarUrl} lost={result === 'loss'} />

                        <View style={styles.center}>
                            <Text
                                className="w-full text-center text-[10.5px] leading-[13px] font-black uppercase tracking-[1.6px]"
                                style={{ color: theme.text }}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                            >
                                {resultLabel}
                            </Text>
                            {hasScore ? (
                                <View className="flex-row items-center" style={{ marginTop: 2 }}>
                                    <Text style={[TABULAR, styles.scoreDigit, { color: result === 'loss' ? COLORS.slate500 : '#FFFFFF' }]}>
                                        {userScore}
                                    </Text>
                                    <Text style={styles.scoreColon}>:</Text>
                                    <Text style={[TABULAR, styles.scoreDigit, { color: result === 'win' ? COLORS.slate500 : '#FFFFFF' }]}>
                                        {opponentScore}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={[styles.scoreDigit, { color: COLORS.slate500, marginTop: 2 }]}>–</Text>
                            )}
                            {!!date && (
                                <Text
                                    style={TABULAR}
                                    className="w-full text-center text-[11px] leading-[14px] font-semibold text-slate-500"
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.8}
                                >
                                    {date}
                                </Text>
                            )}
                        </View>

                        <Side name={opponentName} avatarUrl={opponentAvatarUrl} lost={result === 'win'} />
                    </View>

                    {/* ─── Where: the tournament, then its hub ─── */}
                    <View className="flex-row items-center mt-3.5 pt-3 border-t border-white/[0.06]" style={{ gap: 14 }}>
                        <View className="flex-1 flex-row items-center min-w-0" style={{ gap: 6 }}>
                            <Ionicons name="trophy" size={12} color={COLORS.slate500} />
                            <Text className="shrink text-[12.5px] font-bold text-slate-200" numberOfLines={1}>
                                {tournamentName}
                            </Text>
                        </View>
                        {!!hubName && (
                            <View className="flex-row items-center" style={{ gap: 5, maxWidth: '45%' }}>
                                <Ionicons name="planet" size={12} color={COLORS.slate500} />
                                <Text className="shrink text-[12px] font-semibold text-slate-400" numberOfLines={1}>
                                    {hubName}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </RaisedCard>
        </PressableScale>
    );
});

const styles = StyleSheet.create({
    card: {
        overflow: 'hidden',
    },
    spotlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    glowLine: {
        width: '30%',
        height: 3,
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
    },
    glowFill: {
        flex: 1,
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
    },
    body: {
        paddingHorizontal: 14,
        paddingTop: 16,
        paddingBottom: 12,
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
});

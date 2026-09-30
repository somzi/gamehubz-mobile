import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PressableScale } from '../ui/PressableScale';
import { RaisedCard } from '../ui/RaisedCard';
import { COLORS } from '../../lib/theme';

interface MatchHistoryCardProps {
    tournamentName: string;
    hubName?: string;
    /** The profile owner. Not drawn — the whole page is theirs — kept for callers. */
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

// The result's colour does what the section colour does on a Home match card: rail, wash, hub
// eyebrow, "VS", avatar ring and the tile's band.
const RESULT_THEME = {
    win: { accent: '#10B981', text: '#34D399', labelKey: 'app.victory' },
    draw: { accent: '#EAB308', text: '#FACC15', labelKey: 'app.drawResult' },
    loss: { accent: '#EF4444', text: '#F87171', labelKey: 'app.defeat' },
} as const;

const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * One played match on a profile, in the Home match card's language: where on top, the opponent in
 * the middle, and on the right the same tile the Home card uses for the kick-off — here the result
 * on the coloured band and the score underneath.
 *
 * Memoized so scrolling / loading additional pages doesn't re-render every history row.
 */
export const MatchHistoryCard = React.memo(function MatchHistoryCard({
    tournamentName,
    hubName,
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
    // With no hub the tournament moves up into the eyebrow instead of showing twice.
    const eyebrow = hubName || tournamentName;
    const showTournament = !!hubName && !!tournamentName;

    return (
        <PressableScale
            onPress={onPress}
            disabled={!onPress}
            pressedScale={0.98}
            className={className}
            accessibilityLabel={[`vs ${opponentName}`, resultLabel, hasScore ? `${userScore}:${opponentScore}` : null, tournamentName, date]
                .filter(Boolean)
                .join('. ')}
        >
            <RaisedCard style={{ overflow: 'hidden' }}>
                <LinearGradient
                    pointerEvents="none"
                    colors={[theme.accent + '1A', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.65, y: 0 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 12,
                        bottom: 12,
                        width: 3,
                        backgroundColor: theme.accent,
                        borderTopRightRadius: 3,
                        borderBottomRightRadius: 3,
                        shadowColor: theme.accent,
                        shadowOpacity: 0.8,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 0 },
                    }}
                />

                <View style={{ paddingLeft: 16, paddingRight: 14, paddingVertical: 12 }}>
                    {/* Where: the hub top-left in the result's colour, the tournament top-right */}
                    <View className="flex-row items-center" style={{ gap: 10 }}>
                        <View className="flex-1 flex-row items-center" style={{ gap: 6 }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.accent }} />
                            <Text
                                className="flex-1 text-[10.5px] font-black uppercase tracking-[1.5px]"
                                style={{ color: theme.text }}
                                numberOfLines={1}
                            >
                                {eyebrow}
                            </Text>
                        </View>
                        {showTournament && (
                            <View className="flex-row items-center" style={{ gap: 4, maxWidth: '50%' }}>
                                <Ionicons name="trophy" size={11} color={COLORS.slate400} />
                                <Text className="shrink text-[11px] font-bold text-slate-300" numberOfLines={1}>
                                    {tournamentName}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Who, when, and how it ended */}
                    <View className="flex-row items-center" style={{ marginTop: 9, gap: 11 }}>
                        <View
                            style={{
                                borderRadius: 999,
                                padding: 1.5,
                                borderWidth: 1,
                                borderColor: theme.accent + '66',
                                shadowColor: theme.accent,
                                shadowOpacity: 0.35,
                                shadowRadius: 8,
                                shadowOffset: { width: 0, height: 0 },
                            }}
                        >
                            <PlayerAvatar src={opponentAvatarUrl} name={opponentName} size="md" className="border-0" />
                        </View>

                        <View className="flex-1 min-w-0">
                            <View className="flex-row items-baseline" style={{ gap: 6 }}>
                                <Text className="text-[11px] font-black uppercase tracking-[1px]" style={{ color: theme.text }}>
                                    vs
                                </Text>
                                <Text
                                    className="flex-1 text-[17px] leading-[22px] font-black text-white tracking-tight"
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.7}
                                >
                                    {opponentName}
                                </Text>
                            </View>
                            {!!date && (
                                <View className="flex-row items-center mt-1" style={{ gap: 5 }}>
                                    <Ionicons name="calendar-outline" size={12} color={COLORS.slate500} />
                                    <Text style={TABULAR} className="shrink text-[12px] font-semibold text-slate-400" numberOfLines={1}>
                                        {date}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Result tile: the outcome on the band, the score underneath */}
                        <View
                            style={{
                                width: 68,
                                height: 44,
                                borderRadius: 12,
                                overflow: 'hidden',
                                borderWidth: 1,
                                borderColor: theme.accent + '66',
                                backgroundColor: 'rgba(2, 6, 23, 0.55)',
                            }}
                        >
                            <View className="items-center justify-center px-1" style={{ height: 15, backgroundColor: theme.accent }}>
                                <Text
                                    className="text-[9px] leading-[11px] font-black uppercase tracking-[0.6px]"
                                    style={{ color: COLORS.background }}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.7}
                                >
                                    {resultLabel}
                                </Text>
                            </View>
                            <View className="flex-1 items-center justify-center px-1">
                                <Text
                                    style={TABULAR}
                                    className="text-[16px] leading-[20px] font-black text-white"
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                >
                                    {hasScore ? `${userScore}:${opponentScore}` : '–'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
            </RaisedCard>
        </PressableScale>
    );
});

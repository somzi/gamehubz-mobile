import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from '../ui/PressableScale';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { COLORS } from '../../lib/theme';
import { HubActivityType } from '../../types/dashboard';

type IconName = keyof typeof Ionicons.glyphMap;

interface FeedCardProps {
    type: HubActivityType;
    hubName: string;
    hubAvatar?: string;
    tournamentName?: string;
    /** When it happened, already formatted ("2h ago"). */
    time: string;
    onClick?: () => void;
}

// What happened, told by the card itself: the server's message is a sentence fragment written to
// follow the hub name ("started a live tournament"), which reads as nothing on its own line with
// the tournament parked in a tag underneath. Each event gets a label, an icon and a colour instead.
const EVENTS: Partial<Record<HubActivityType, { labelKey: string; icon: IconName; color: string }>> = {
    [HubActivityType.TournamentAnnounced]: { labelKey: 'activity.announced', icon: 'megaphone', color: COLORS.info },
    [HubActivityType.RegistrationOpen]: { labelKey: 'activity.registrationOpen', icon: 'person-add', color: COLORS.primary },
    [HubActivityType.TournamentLive]: { labelKey: 'activity.live', icon: 'radio', color: COLORS.live },
    [HubActivityType.TournamentCompleted]: { labelKey: 'activity.completed', icon: 'trophy', color: COLORS.warning },
    [HubActivityType.TournamentCanceled]: { labelKey: 'activity.canceled', icon: 'close-circle', color: COLORS.slate400 },
    [HubActivityType.TournamentDeleted]: { labelKey: 'activity.deleted', icon: 'trash', color: COLORS.slate400 },
};
const FALLBACK_EVENT = { labelKey: 'activity.updated', icon: 'sparkles' as IconName, color: COLORS.highlight };

/**
 * One hub event, laid out like the match cards above it on Home: what happened and when on top,
 * then the tournament it happened to — the thing a tap opens — with its hub underneath.
 *
 * Memoized: every prop is a primitive except onClick, which callers should keep stable.
 */
export const FeedCard = React.memo(function FeedCard({
    type,
    hubName,
    hubAvatar,
    tournamentName,
    time,
    onClick,
}: FeedCardProps) {
    const { t } = useTranslation('home');
    const event = EVENTS[type] ?? FALLBACK_EVENT;
    const label = t(event.labelKey);
    const tournament = tournamentName?.trim() || '';
    // A removed tournament has no page left to open.
    const tappable = !!onClick && type !== HubActivityType.TournamentDeleted;

    return (
        <PressableScale
            onPress={tappable ? onClick : undefined}
            disabled={!tappable}
            accessibilityRole={tappable ? 'button' : undefined}
            accessibilityLabel={[label, tournament, hubName, time].filter(Boolean).join('. ')}
        >
            <View
                className="rounded-[22px] overflow-hidden"
                style={{
                    backgroundColor: COLORS.card,
                    shadowColor: event.color,
                    shadowOpacity: 0.12,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6,
                }}
            >
                <LinearGradient
                    colors={[event.color + '14', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.7, y: 0 }}
                    style={StyleSheet.absoluteFill}
                />
                <View
                    pointerEvents="none"
                    className="absolute inset-0 rounded-[22px]"
                    style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' }}
                />
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 12,
                        bottom: 12,
                        width: 3,
                        backgroundColor: event.color,
                        borderTopRightRadius: 3,
                        borderBottomRightRadius: 3,
                        shadowColor: event.color,
                        shadowOpacity: 0.7,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 0 },
                    }}
                />

                <View className="pt-3 pb-3 pr-3.5 pl-4">
                    {/* What happened, and when */}
                    <View className="flex-row items-center justify-between mb-2.5">
                        <View className="flex-row items-center gap-1.5 flex-1 mr-2">
                            <Ionicons name={event.icon} size={11} color={event.color} />
                            <Text
                                className="text-[10px] font-black uppercase tracking-[2px] flex-1"
                                style={{ color: event.color }}
                                numberOfLines={1}
                            >
                                {label}
                            </Text>
                        </View>
                        {!!time && (
                            <Text className="text-[10px] font-bold text-slate-500 tracking-wider" numberOfLines={1}>
                                {time}
                            </Text>
                        )}
                    </View>

                    {/* Which tournament, in which hub */}
                    <View className="flex-row items-center">
                        <View style={{ borderWidth: 1, borderColor: event.color + '55', borderRadius: 13, padding: 1.5 }}>
                            <PlayerAvatar src={hubAvatar} name={hubName} size="sm" className="rounded-[10px]" />
                        </View>
                        <View className="flex-1 ml-3 min-w-0">
                            <Text className="text-[17px] leading-[22px] font-black text-white tracking-tight" numberOfLines={1}>
                                {tournament || hubName}
                            </Text>
                            {!!tournament && (
                                <View className="flex-row items-center mt-1.5" style={{ gap: 5 }}>
                                    <Ionicons name="planet-outline" size={12} color={COLORS.slate500} />
                                    <Text className="flex-1 text-[12px] font-semibold text-slate-400" numberOfLines={1}>
                                        {hubName}
                                    </Text>
                                </View>
                            )}
                        </View>
                        {tappable && (
                            <View
                                className="w-7 h-7 rounded-full items-center justify-center ml-1.5"
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255, 255, 255, 0.07)',
                                }}
                            >
                                <Ionicons name="chevron-forward" size={12} color={COLORS.slate400} />
                            </View>
                        )}
                    </View>
                </View>
            </View>
        </PressableScale>
    );
});

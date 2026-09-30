import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PressableScale } from '../ui/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import { RaisedCard } from '../ui/RaisedCard';
import { HeroEmblem, EmblemImage } from '../ui/HeroCard';
import { COLORS } from '../../lib/theme';
import i18n from '../../i18n';

interface HubCardProps {
    name: string;
    description?: string;
    numberOfUsers: number;
    numberOfTournaments?: number;
    avatarUrl?: string;
    onClick: () => void;
    isJoined?: boolean;
    isVerified?: boolean;
    className?: string;
    index?: number;
    /** Pending items the user has to approve in this hub — shown as a red corner badge. */
    badgeCount?: number;
}

const NAME_SIZE = 17;
const NAME_MIN_SIZE = 11;

// The hub hero's emblem ring (HubProfileScreen): emerald → cyan.
const HUB_EMBLEM_RING = ['#34D399', '#2DD4ED'] as const;

const EMBLEM = 60;
// The emblem minus its ring (2) and inset (3) on each side.
const EMBLEM_IMAGE = EMBLEM - 10;
const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * Largest size (up to NAME_SIZE) at which the longest word of the name still fits on one line of
 * the given width. Without it a long single word ("HUNDERTWASSER") gets broken mid-word across the
 * two lines, because shrinking to fit only checks that the whole name fits in two lines.
 * ~0.72em per character covers wide uppercase glyphs in the heavy system font.
 */
function nameSizeFor(name: string, width: number): number {
    if (!width) return NAME_SIZE;
    const longestWord = (name || '').split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
    if (!longestWord) return NAME_SIZE;
    return Math.max(NAME_MIN_SIZE, Math.min(NAME_SIZE, Math.floor(width / (longestWord * 0.72))));
}

/**
 * A hub in a list: the emblem from the hub page (the same emerald → cyan ring) and, beside it,
 * name, membership and numbers.
 */
// Memoized to avoid re-rendering the whole hubs list every time an unrelated piece of
// state changes (search input, badge tick). Callers should pass a stable onClick.
export const HubCard = React.memo(function HubCard({
    name,
    numberOfUsers,
    numberOfTournaments = 0,
    avatarUrl,
    onClick,
    isJoined,
    isVerified,
    className,
    badgeCount = 0,
}: HubCardProps) {
    const { t } = useTranslation('common');
    const [nameWidth, setNameWidth] = useState(0);
    // Room left for the name once the verified check (18 + 6 gap) sits beside it.
    const nameSize = nameSizeFor(name, nameWidth - (isVerified ? 24 : 0));

    return (
        <PressableScale
            onPress={onClick}
            className={className}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={[
                name,
                isJoined ? t('app.joined') : null,
                `${numberOfUsers} ${t('app.fans')}`,
                `${numberOfTournaments} ${t('common:nav.tournaments')}`,
            ].filter(Boolean).join('. ')}
        >
            <RaisedCard style={styles.card}>
                <View style={styles.content}>
                    <HeroEmblem ringColors={HUB_EMBLEM_RING} glowColor={COLORS.primary} glowOpacity={0.2} size={EMBLEM}>
                        <EmblemImage src={avatarUrl} name={name} size={EMBLEM_IMAGE} radius={Math.round(EMBLEM * 0.31) - 5} />
                    </HeroEmblem>

                    {/* ─── Name, membership, numbers ─── */}
                    <View className="flex-1 min-w-0" style={{ marginLeft: 14 }}>
                        {isJoined && (
                            <View className="flex-row items-center mb-1" style={{ gap: 4 }}>
                                <Ionicons name="checkmark-circle" size={11} color={COLORS.primaryBright} />
                                <Text
                                    className="shrink text-[10.5px] font-black uppercase tracking-[1.5px]"
                                    style={{ color: COLORS.primaryBright }}
                                    numberOfLines={1}
                                >
                                    {t('app.joined')}
                                </Text>
                            </View>
                        )}

                        <View
                            className="flex-row items-center"
                            style={{ gap: 6 }}
                            onLayout={(e) => setNameWidth(e.nativeEvent.layout.width)}
                        >
                            {/* Sized so the longest word stays whole on one line, then shrunk further
                                if the whole name still needs more than two lines. */}
                            <Text
                                className="text-white font-black tracking-tight flex-shrink"
                                style={{ fontSize: nameSize, lineHeight: Math.round(nameSize * 1.2) }}
                                numberOfLines={2}
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                            >
                                {name}
                            </Text>
                            {isVerified && (
                                <View className="w-[18px] h-[18px] rounded-full bg-sky-500 items-center justify-center">
                                    <Ionicons name="checkmark" size={12} color="#fff" />
                                </View>
                            )}
                        </View>

                        {/* A thin rule between the two numbers keeps them apart */}
                        <View className="flex-row items-center" style={{ marginTop: 12, gap: 12 }}>
                            <HubStat icon="people" value={numberOfUsers} label={t('app.fans')} />
                            <View style={{ width: 1, height: 14, backgroundColor: 'rgba(148,163,184,0.25)' }} />
                            <HubStat icon="trophy" value={numberOfTournaments} label={t('common:nav.tournaments')} />
                        </View>
                    </View>

                    <Ionicons name="chevron-forward" size={16} color={COLORS.slate500} style={{ marginLeft: 8 }} />
                </View>

                {/* Pending-approvals badge — sits inside the card's top-right corner
                    so it isn't clipped by FlatList's removeClippedSubviews. */}
                {badgeCount > 0 && (
                    <View
                        pointerEvents="none"
                        className="absolute z-10 rounded-full items-center justify-center"
                        style={{
                            top: 8,
                            right: 8,
                            minWidth: 22,
                            height: 22,
                            paddingHorizontal: 6,
                            backgroundColor: '#EF4444',
                            borderWidth: 2,
                            borderColor: '#0B1120',
                        }}
                    >
                        <Text className="text-white text-[11px] font-black">
                            {badgeCount > 99 ? '99+' : badgeCount}
                        </Text>
                    </View>
                )}
            </RaisedCard>
        </PressableScale>
    );
});

function HubStat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
    return (
        <View className="flex-row items-center shrink" style={{ gap: 5 }}>
            <Ionicons name={icon} size={12} color={COLORS.slate400} />
            <Text className="text-[13px] font-black text-white" style={TABULAR} numberOfLines={1}>
                {(value || 0).toLocaleString(i18n.language)}{' '}
                <Text className="text-[12px] font-semibold text-slate-500">{label}</Text>
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        minHeight: 88,
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 14,
        paddingRight: 12,
        paddingVertical: 14,
    },
});

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { PlayerIdentity } from './PlayerIdentity';
import { COLORS } from '../../lib/theme';
import { cn } from '../../lib/utils';

export interface ResultSide {
    userId?: string | null;
    username: string;
    nickname?: string | null;
    countryFlag?: string | null;
    countryName?: string | null;
    avatarUrl?: string | null;
}

// final: a settled result. noShow: closed without a game. proposed: reported, waiting on approval.
const TONES = {
    final: { main: '#10B981', bright: '#A7F3D0', text: '#34D399' },
    noShow: { main: '#F59E0B', bright: '#FDE68A', text: '#FBBF24' },
    proposed: { main: '#F59E0B', bright: '#FDE68A', text: '#FBBF24' },
} as const;

const TABULAR = { fontVariant: ['tabular-nums' as const] };

interface ResultBoardProps {
    home: ResultSide;
    away: ResultSide;
    homeScore: number | null;
    awayScore: number | null;
    /** Who took it; null while nothing is settled (a proposal, a no-show). */
    winner: 'home' | 'away' | 'draw' | null;
    tone: keyof typeof TONES;
    /** The one word over the score: Final score, No-show, Awaiting approval… */
    label: string;
    /** A short line under the face-off, when the state needs one. */
    note?: string | null;
    reserveNicknameSpace?: boolean;
    onPressSide?: (userId: string) => void;
    /** Under a hairline: the games behind the score, the actions on it. */
    children?: React.ReactNode;
    className?: string;
}

/**
 * A match result as a face-off: both players with the score between them, the winner ringed and
 * marked with a trophy; both players stay at full strength. The state's colour runs in a short line along the top
 * edge and in the word over the score — green once it's final, amber while it isn't.
 */
export function ResultBoard({
    home,
    away,
    homeScore,
    awayScore,
    winner,
    tone,
    label,
    note,
    reserveNicknameSpace,
    onPressSide,
    children,
    className,
}: ResultBoardProps) {
    const accent = TONES[tone];
    const nobodyPlayed = tone === 'noShow';
    // Two-digit scores step the numbers down so "12 : 10" still fits between the players.
    const digitSize = Math.max(homeScore ?? 0, awayScore ?? 0) >= 10 ? { fontSize: 34 } : null;
    const decided = winner === 'home' || winner === 'away';

    const digitColor = (side: 'home' | 'away') => {
        if (nobodyPlayed) return COLORS.slate600;
        if (tone === 'proposed') return accent.text;
        return decided && winner !== side ? COLORS.slate500 : '#FFFFFF';
    };

    const renderSide = (side: ResultSide, key: 'home' | 'away') => {
        const won = winner === key;
        const canOpen = !!side.userId && !!onPressSide;

        return (
            <Pressable
                onPress={canOpen ? () => onPressSide!(side.userId!) : undefined}
                disabled={!canOpen}
                accessibilityRole={canOpen ? 'button' : undefined}
                className="flex-1 items-center active:opacity-70"
            >
                <View className="items-center w-full">
                    <View>
                        <View
                            style={[
                                styles.ring,
                                won && { borderColor: accent.main },
                                won && Platform.OS === 'ios' && { shadowColor: accent.main, shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
                            ]}
                        >
                            <PlayerAvatar src={side.avatarUrl ?? undefined} name={side.username} size="lg" className="border-0" />
                        </View>
                        {won && (
                            <View style={[styles.badge, { backgroundColor: accent.main }]}>
                                <Ionicons name="trophy" size={11} color="#04150F" />
                            </View>
                        )}
                    </View>
                    <PlayerIdentity
                        className="mt-2.5"
                        username={side.username}
                        nickname={side.nickname}
                        countryFlag={side.countryFlag}
                        countryName={side.countryName}
                        tone={key}
                        reserveNicknameSpace={reserveNicknameSpace}
                    />
                </View>
            </Pressable>
        );
    };

    return (
        <View className={cn('rounded-[24px] border border-white/[0.06] overflow-hidden', className)} style={styles.card}>
            {/* Soft shine along the top, and the state's line over the score */}
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
                style={styles.shine}
            />
            <View pointerEvents="none" style={styles.lineWrap}>
                <LinearGradient
                    colors={[accent.main, accent.bright, accent.main]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.line}
                />
            </View>

            <View style={styles.body}>
                <View className="flex-row items-start">
                    {renderSide(home, 'home')}

                    <View style={styles.center}>
                        <Text
                            className="w-full text-center text-[10.5px] leading-[14px] font-black uppercase tracking-[1.8px]"
                            style={{ color: accent.text }}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                        >
                            {label}
                        </Text>
                        <View className="flex-row items-center" style={{ marginTop: 4 }}>
                            <Text style={[TABULAR, styles.digit, digitSize, { color: digitColor('home') }]}>
                                {nobodyPlayed || homeScore === null ? '–' : homeScore}
                            </Text>
                            <Text style={styles.colon}>:</Text>
                            <Text style={[TABULAR, styles.digit, digitSize, { color: digitColor('away') }]}>
                                {nobodyPlayed || awayScore === null ? '–' : awayScore}
                            </Text>
                        </View>
                    </View>

                    {renderSide(away, 'away')}
                </View>

                {!!note && (
                    <Text className="text-[12.5px] leading-[17px] font-medium text-slate-400 text-center mt-4 px-2">
                        {note}
                    </Text>
                )}

                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.card,
    },
    shine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 64,
    },
    lineWrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    line: {
        width: '28%',
        height: 3,
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
    },
    body: {
        paddingHorizontal: 16,
        paddingTop: 24,
        paddingBottom: 18,
    },
    ring: {
        borderRadius: 999,
        padding: 3,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    badge: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: COLORS.card,
    },
    center: {
        width: 124,
        alignItems: 'center',
        paddingTop: 8,
        paddingHorizontal: 4,
    },
    digit: {
        fontSize: 44,
        lineHeight: 50,
        fontWeight: '900',
    },
    colon: {
        fontSize: 26,
        lineHeight: 50,
        fontWeight: '800',
        color: COLORS.slate600,
        marginHorizontal: 9,
    },
});

import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { shareUser } from '../../lib/share';
import { getOptimizedCloudinaryUrl } from '../../lib/image';
import {
    ShareCardShell,
    PosterRoot,
    CardFrame,
    EmblemRing,
    SideStat,
    StatDivider,
    StatPill,
    PosterWordmark,
} from './ShareCardShell';

// In-app version of the public share card (ShareController /user/{id} scoreboard page):
// same banner + avatar + win-rate donut + W/D/L pills, rendered natively so it can be
// captured as a PNG and pushed to Instagram stories / WhatsApp / etc. via the share sheet.

export interface PlayerCardStats {
    matches: number;
    winRate: number; // 0-100
    wins: number;
    draws: number;
    losses: number;
    trophies: number;
}

interface SharePlayerCardModalProps {
    visible: boolean;
    onClose: () => void;
    playerId: string;
    name: string;
    avatarUrl?: string | null;
    stats: PlayerCardStats;
}

const DONUT_SIZE = 116;
const DONUT_RADIUS = 48;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function PlayerCardPoster({ name, avatarUrl, stats, width }: {
    name: string;
    avatarUrl?: string | null;
    stats: PlayerCardStats;
    width: number;
}) {
    const { t } = useTranslation('common');
    const rate = Math.max(0, Math.min(100, Math.round(stats.winRate)));
    const filled = (rate / 100) * DONUT_CIRCUMFERENCE;
    const initial = (name || 'G').trim().charAt(0).toUpperCase() || 'G';
    // ~100dp box captured at ~3x pixel ratio → ask Cloudinary for ~300px so the PNG stays sharp.
    const optimizedAvatar = avatarUrl ? getOptimizedCloudinaryUrl(avatarUrl, 300) : '';

    return (
        <PosterRoot width={width} glowA="#22D3EE" glowB="#3B82F6">
            <CardFrame
                hairlineColors={['rgba(45,212,237,0.55)', 'rgba(148,163,184,0.14)', 'rgba(59,130,246,0.5)']}
                bannerColors={['#0E7490', '#2563EB', '#1E3A8A']}
            >
                <EmblemRing colors={['#2DD4ED', '#3B82F6']}>
                    {optimizedAvatar ? (
                        <Image
                            source={{ uri: optimizedAvatar }}
                            style={{ width: '100%', height: '100%', borderRadius: 25, backgroundColor: '#1A1D2E' }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                    ) : (
                        <LinearGradient colors={['#2DD4ED', '#3B82F6']} style={{ flex: 1, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 44, fontWeight: '800', color: '#06121C' }}>{initial}</Text>
                        </LinearGradient>
                    )}
                </EmblemRing>

                <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.55}
                    style={{ marginTop: 16, fontSize: 30, fontWeight: '800', color: '#F8FAFC', textAlign: 'center', letterSpacing: -0.5 }}
                >
                    {name}
                </Text>

                {/* Matches | win-rate donut | trophies */}
                <View style={{ marginTop: 26, flexDirection: 'row', alignItems: 'center' }}>
                    <SideStat icon="game-controller" iconColor="rgba(45,212,237,0.65)" value={stats.matches} label={t('share.statMatches')} />
                    <StatDivider />
                    <View style={{ width: DONUT_SIZE, height: DONUT_SIZE, marginHorizontal: 8 }}>
                        <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
                            <Defs>
                                <SvgLinearGradient id="ghDonut" x1="0" y1="0" x2="1" y2="1">
                                    <Stop offset="0" stopColor="#2DD4ED" />
                                    <Stop offset="1" stopColor="#3B82F6" />
                                </SvgLinearGradient>
                            </Defs>
                            <G rotation={-90} origin={`${DONUT_SIZE / 2}, ${DONUT_SIZE / 2}`}>
                                <Circle
                                    cx={DONUT_SIZE / 2}
                                    cy={DONUT_SIZE / 2}
                                    r={DONUT_RADIUS}
                                    fill="none"
                                    stroke="rgba(148,163,184,0.14)"
                                    strokeWidth={10}
                                />
                                {/* Skipped at 0%: a zero-length dash with a round cap would still paint a dot */}
                                {rate > 0 && (
                                    <Circle
                                        cx={DONUT_SIZE / 2}
                                        cy={DONUT_SIZE / 2}
                                        r={DONUT_RADIUS}
                                        fill="none"
                                        stroke="url(#ghDonut)"
                                        strokeWidth={10}
                                        strokeLinecap="round"
                                        strokeDasharray={`${filled.toFixed(2)} ${DONUT_CIRCUMFERENCE.toFixed(2)}`}
                                    />
                                )}
                            </G>
                        </Svg>
                        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                            <Text style={{ fontSize: 26, fontWeight: '800', color: '#F8FAFC', lineHeight: 28 }}>{rate}%</Text>
                            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1.4, color: '#64748B', marginTop: 2 }}>{t('app.winRate')}</Text>
                        </View>
                    </View>
                    <StatDivider />
                    <SideStat icon="trophy" iconColor="rgba(251,191,36,0.8)" value={stats.trophies} label={t('share.statTrophies')} valueColor="#FBBF24" />
                </View>

                <View style={{ marginTop: 24, flexDirection: 'row', gap: 10 }}>
                    <StatPill value={stats.wins} label={t('share.statWins')} background="rgba(52,211,153,0.08)" border="rgba(52,211,153,0.22)" valueColor="#34D399" labelColor="rgba(52,211,153,0.7)" />
                    <StatPill value={stats.draws} label={t('share.statDraws')} background="rgba(148,163,184,0.06)" border="rgba(148,163,184,0.18)" valueColor="#94A3B8" labelColor="#64748B" />
                    <StatPill value={stats.losses} label={t('share.statLosses')} background="rgba(248,113,113,0.07)" border="rgba(248,113,113,0.22)" valueColor="#F87171" labelColor="rgba(248,113,113,0.7)" />
                </View>
            </CardFrame>

            <PosterWordmark />
        </PosterRoot>
    );
}

export function SharePlayerCardModal({ visible, onClose, playerId, name, avatarUrl, stats }: SharePlayerCardModalProps) {
    const { t } = useTranslation('common');
    return (
        <ShareCardShell
            visible={visible}
            onClose={onClose}
            headerTitle={t('app.playerCard')}
            dialogTitle={t('app.playerDialogTitle', { name })}
            fileName={name || 'player'}
            onShareLink={() => shareUser(playerId, name)}
            renderPoster={(width) => (
                <PlayerCardPoster name={name} avatarUrl={avatarUrl} stats={stats} width={width} />
            )}
        />
    );
}

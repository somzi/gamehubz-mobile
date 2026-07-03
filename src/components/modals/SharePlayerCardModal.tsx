import React, { useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Alert, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { File as FSFile, Paths } from 'expo-file-system';
import { Button } from '../ui/Button';
import { shareUser } from '../../lib/share';
import { getOptimizedCloudinaryUrl } from '../../lib/image';

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

function WdlPill({ value, label, background, border, valueColor, labelColor }: {
    value: number;
    label: string;
    background: string;
    border: string;
    valueColor: string;
    labelColor: string;
}) {
    return (
        <View style={{
            flex: 1,
            borderRadius: 16,
            paddingVertical: 13,
            alignItems: 'center',
            backgroundColor: background,
            borderWidth: 1,
            borderColor: border,
        }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: valueColor, lineHeight: 22 }}>{value}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: labelColor, marginTop: 2 }}>{label}</Text>
        </View>
    );
}

function PlayerCardPoster({ name, avatarUrl, stats, width }: {
    name: string;
    avatarUrl?: string | null;
    stats: PlayerCardStats;
    width: number;
}) {
    const rate = Math.max(0, Math.min(100, Math.round(stats.winRate)));
    const filled = (rate / 100) * DONUT_CIRCUMFERENCE;
    const initial = (name || 'G').trim().charAt(0).toUpperCase() || 'G';
    // ~100dp box captured at ~3x pixel ratio → ask Cloudinary for ~300px so the PNG stays sharp.
    const optimizedAvatar = avatarUrl ? getOptimizedCloudinaryUrl(avatarUrl, 300) : '';
    const sideLabel = { fontSize: 9, fontWeight: '700' as const, letterSpacing: 1.2, color: '#64748B', marginTop: 3 };

    return (
        <View style={{ width, backgroundColor: '#06070D', overflow: 'hidden', paddingHorizontal: 16, paddingTop: 26, paddingBottom: 20 }}>
            <LinearGradient colors={['#0D1224', '#06070D']} style={StyleSheet.absoluteFill} />
            {/* Soft cyan / blue glows echoing the web page's aurora blobs */}
            <Svg width={260} height={260} style={{ position: 'absolute', top: -90, left: -90 }}>
                <Defs>
                    <RadialGradient id="ghGlowA" cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor="#22D3EE" stopOpacity={0.22} />
                        <Stop offset="1" stopColor="#22D3EE" stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Circle cx={130} cy={130} r={130} fill="url(#ghGlowA)" />
            </Svg>
            <Svg width={280} height={280} style={{ position: 'absolute', bottom: -110, right: -100 }}>
                <Defs>
                    <RadialGradient id="ghGlowB" cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor="#3B82F6" stopOpacity={0.2} />
                        <Stop offset="1" stopColor="#3B82F6" stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Circle cx={140} cy={140} r={140} fill="url(#ghGlowB)" />
            </Svg>

            {/* Card wrapped in a thin cyan→blue gradient hairline for a premium edge */}
            <LinearGradient
                colors={['rgba(45,212,237,0.55)', 'rgba(148,163,184,0.14)', 'rgba(59,130,246,0.5)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 28, padding: 1 }}
            >
            <View style={{ backgroundColor: '#0B111D', borderRadius: 27, overflow: 'hidden' }}>
                <View style={{ height: 112, overflow: 'hidden' }}>
                    <LinearGradient
                        colors={['#0E7490', '#2563EB', '#1E3A8A']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0.7 }}
                        style={StyleSheet.absoluteFill}
                    />
                    {/* Decorative concentric rings + a soft top shine on the banner */}
                    <Svg width={220} height={220} style={{ position: 'absolute', top: -70, right: -60 }}>
                        <Circle cx={110} cy={110} r={52} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
                        <Circle cx={110} cy={110} r={78} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                        <Circle cx={110} cy={110} r={104} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                    </Svg>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 54 }}
                    />
                </View>

                <View style={{ paddingHorizontal: 18, paddingBottom: 24, marginTop: -56 }}>
                    {/* Avatar in a cyan→blue gradient ring, overlapping the banner */}
                    <LinearGradient
                        colors={['#2DD4ED', '#3B82F6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ alignSelf: 'center', width: 112, height: 112, borderRadius: 32, padding: 2 }}
                    >
                        <View style={{ flex: 1, borderRadius: 30, padding: 4, backgroundColor: '#0B111D' }}>
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
                        </View>
                    </LinearGradient>

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
                        <View style={{ flex: 1, alignItems: 'center' }}>
                            <Ionicons name="game-controller" size={15} color="rgba(45,212,237,0.65)" style={{ marginBottom: 5 }} />
                            <Text style={{ fontSize: 24, fontWeight: '800', color: '#F8FAFC', lineHeight: 26 }}>{stats.matches}</Text>
                            <Text style={sideLabel} numberOfLines={1} adjustsFontSizeToFit>MATCHES</Text>
                        </View>
                        <View style={{ width: 1, height: 44, backgroundColor: 'rgba(148,163,184,0.12)' }} />
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
                                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1.4, color: '#64748B', marginTop: 2 }}>WIN RATE</Text>
                            </View>
                        </View>
                        <View style={{ width: 1, height: 44, backgroundColor: 'rgba(148,163,184,0.12)' }} />
                        <View style={{ flex: 1, alignItems: 'center' }}>
                            <Ionicons name="trophy" size={15} color="rgba(251,191,36,0.8)" style={{ marginBottom: 5 }} />
                            <Text style={{ fontSize: 24, fontWeight: '800', color: '#FBBF24', lineHeight: 26 }}>{stats.trophies}</Text>
                            <Text style={sideLabel} numberOfLines={1} adjustsFontSizeToFit>TROPHIES</Text>
                        </View>
                    </View>

                    <View style={{ marginTop: 24, flexDirection: 'row', gap: 10 }}>
                        <WdlPill value={stats.wins} label="WINS" background="rgba(52,211,153,0.08)" border="rgba(52,211,153,0.22)" valueColor="#34D399" labelColor="rgba(52,211,153,0.7)" />
                        <WdlPill value={stats.draws} label="DRAWS" background="rgba(148,163,184,0.06)" border="rgba(148,163,184,0.18)" valueColor="#94A3B8" labelColor="#64748B" />
                        <WdlPill value={stats.losses} label="LOSSES" background="rgba(248,113,113,0.07)" border="rgba(248,113,113,0.22)" valueColor="#F87171" labelColor="rgba(248,113,113,0.7)" />
                    </View>
                </View>
            </View>
            </LinearGradient>

            <View style={{ marginTop: 16, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 5 }}>
                    <Text style={{ color: '#2DD4ED' }}>GAME</Text>
                    <Text style={{ color: '#3B82F6' }}>HUBZ</Text>
                </Text>
            </View>
        </View>
    );
}

export function SharePlayerCardModal({ visible, onClose, playerId, name, avatarUrl, stats }: SharePlayerCardModalProps) {
    const posterRef = useRef<View>(null);
    const [isSharing, setIsSharing] = useState(false);
    const { width: windowWidth } = useWindowDimensions();
    const posterWidth = Math.max(288, Math.min(360, windowWidth - 32));

    const shareAsImage = async () => {
        if (isSharing) return;
        setIsSharing(true);
        try {
            const captured = await captureRef(posterRef, { format: 'png', quality: 1 });
            // iOS resolves a bare tmp path while Android returns file:///... — the
            // File API and the share sheet both want a proper file URI.
            const uri = captured.startsWith('file://') ? captured : `file://${captured}`;

            // Give the tmpfile a recognizable name — some share targets surface it.
            let shareUri = uri;
            try {
                const safeName = (name || 'player').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40) || 'player';
                const dest = new FSFile(Paths.cache, `gamehubz_${safeName}_card.png`);
                if (dest.exists) {
                    dest.delete();
                }
                new FSFile(uri).move(dest);
                shareUri = dest.uri;
            } catch {
                // Renaming is cosmetic — fall back to sharing the tmpfile directly.
            }

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(shareUri, {
                    mimeType: 'image/png',
                    dialogTitle: `${name} — GameHubz player card`,
                });
            } else {
                await shareUser(playerId, name);
            }
        } catch (error) {
            console.error('Share player card error:', error);
            Alert.alert('Share failed', 'Could not generate the card image. Please try again.');
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
            {/* Near-opaque scrim so the screen behind doesn't bleed through the card UI */}
            <Pressable className="flex-1 bg-[#04060CF2]" onPress={onClose}>
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 28, paddingHorizontal: 16 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Pressable onPress={() => { }}>
                        <View style={{ width: posterWidth }} className="flex-row items-center justify-between mb-2 px-1">
                            <Text className="text-white text-base font-black tracking-tight">Player Card</Text>
                            <Pressable
                                onPress={onClose}
                                className="w-9 h-9 rounded-full bg-white/10 items-center justify-center"
                                hitSlop={8}
                                accessibilityLabel="Close"
                            >
                                <Ionicons name="close" size={18} color="#FAFAFA" />
                            </Pressable>
                        </View>

                        {/* Rounded clip is preview-only; the captured poster keeps square corners
                            so the PNG has no transparent edges on a story background. */}
                        <View style={{ borderRadius: 24, overflow: 'hidden' }}>
                            <View ref={posterRef} collapsable={false}>
                                <PlayerCardPoster name={name} avatarUrl={avatarUrl} stats={stats} width={posterWidth} />
                            </View>
                        </View>

                        <View style={{ width: posterWidth }} className="mt-4">
                            <Button onPress={shareAsImage} loading={isSharing} disabled={isSharing} className="w-full">
                                Share Card
                            </Button>
                            <Pressable
                                onPress={() => shareUser(playerId, name)}
                                className="mt-3 py-3 rounded-lg border border-white/10 bg-white/5 flex-row items-center justify-center active:opacity-60"
                            >
                                <Ionicons name="link-outline" size={16} color="#94A3B8" />
                                <Text className="text-slate-300 font-bold text-sm ml-2">Share Link</Text>
                            </Pressable>
                        </View>
                    </Pressable>
                </ScrollView>
            </Pressable>
        </Modal>
    );
}

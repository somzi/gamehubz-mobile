import React, { useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Alert, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { File as FSFile, Paths } from 'expo-file-system';
import { Button } from '../ui/Button';

// Shared chrome + poster building blocks for the in-app share cards (player /
// hub / tournament): near-opaque scrim, PNG capture via react-native-view-shot,
// and the Share Card / Share Link buttons. Each card supplies its own poster
// content through renderPoster and composes the primitives below.

interface ShareCardShellProps {
    visible: boolean;
    onClose: () => void;
    headerTitle: string;
    dialogTitle: string;
    /** Base name for the captured PNG — sanitized into gamehubz_<name>_card.png */
    fileName: string;
    /** Link-share fallback, also wired to the "Share Link" button. */
    onShareLink: () => void | Promise<void>;
    renderPoster: (width: number) => React.ReactNode;
}

export function ShareCardShell({ visible, onClose, headerTitle, dialogTitle, fileName, onShareLink, renderPoster }: ShareCardShellProps) {
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
                const safeName = (fileName || 'card').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40) || 'card';
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
                    dialogTitle,
                });
            } else {
                await onShareLink();
            }
        } catch (error) {
            console.error('Share card error:', error);
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
                            <Text className="text-white text-base font-black tracking-tight">{headerTitle}</Text>
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
                                {renderPoster(posterWidth)}
                            </View>
                        </View>

                        <View style={{ width: posterWidth }} className="mt-4">
                            <Button onPress={shareAsImage} loading={isSharing} disabled={isSharing} className="w-full">
                                Share Card
                            </Button>
                            <Pressable
                                onPress={() => onShareLink()}
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

// ─── Poster primitives ───────────────────────────────────────────────────────

type GradientStops = readonly [string, string, ...string[]];

/** Dark poster background with two soft radial glows in the card's accent colors. */
export function PosterRoot({ width, glowA, glowB, children }: {
    width: number;
    glowA: string;
    glowB: string;
    children: React.ReactNode;
}) {
    return (
        <View style={{ width, backgroundColor: '#06070D', overflow: 'hidden', paddingHorizontal: 16, paddingTop: 26, paddingBottom: 20 }}>
            <LinearGradient colors={['#0D1224', '#06070D']} style={StyleSheet.absoluteFill} />
            <Svg width={260} height={260} style={{ position: 'absolute', top: -90, left: -90 }}>
                <Defs>
                    <RadialGradient id="posterGlowA" cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={glowA} stopOpacity={0.22} />
                        <Stop offset="1" stopColor={glowA} stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Circle cx={130} cy={130} r={130} fill="url(#posterGlowA)" />
            </Svg>
            <Svg width={280} height={280} style={{ position: 'absolute', bottom: -110, right: -100 }}>
                <Defs>
                    <RadialGradient id="posterGlowB" cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={glowB} stopOpacity={0.2} />
                        <Stop offset="1" stopColor={glowB} stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Circle cx={140} cy={140} r={140} fill="url(#posterGlowB)" />
            </Svg>
            {children}
        </View>
    );
}

/** Gradient-hairline card with a decorated banner; children render below the banner
    with a -56 offset so a 112dp emblem overlaps it halfway. */
export function CardFrame({ hairlineColors, bannerColors, children }: {
    hairlineColors: GradientStops;
    bannerColors: GradientStops;
    children: React.ReactNode;
}) {
    return (
        <LinearGradient
            colors={hairlineColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 28, padding: 1 }}
        >
            <View style={{ backgroundColor: '#0B111D', borderRadius: 27, overflow: 'hidden' }}>
                <View style={{ height: 112, overflow: 'hidden' }}>
                    <LinearGradient
                        colors={bannerColors}
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
                    {children}
                </View>
            </View>
        </LinearGradient>
    );
}

/** 112dp gradient ring for the avatar / logo / trophy emblem overlapping the banner. */
export function EmblemRing({ colors, children }: {
    colors: GradientStops;
    children: React.ReactNode;
}) {
    return (
        <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ alignSelf: 'center', width: 112, height: 112, borderRadius: 32, padding: 2 }}
        >
            <View style={{ flex: 1, borderRadius: 30, padding: 4, backgroundColor: '#0B111D' }}>
                {children}
            </View>
        </LinearGradient>
    );
}

export const sideStatLabel = { fontSize: 9, fontWeight: '700' as const, letterSpacing: 1.2, color: '#64748B', marginTop: 3 };

/** Icon + big value + tiny label column for the sides of the stats row. */
export function SideStat({ icon, iconColor, value, label, valueColor = '#F8FAFC', valueSize = 24 }: {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    value: string | number;
    label: string;
    valueColor?: string;
    valueSize?: number;
}) {
    return (
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
            <Ionicons name={icon} size={15} color={iconColor} style={{ marginBottom: 5 }} />
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: valueSize, fontWeight: '800', color: valueColor, lineHeight: valueSize + 2 }}>{value}</Text>
            <Text style={sideStatLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
        </View>
    );
}

export function StatDivider() {
    return <View style={{ width: 1, height: 44, backgroundColor: 'rgba(148,163,184,0.12)' }} />;
}

/** Full gradient ring with a value + label inside — the hub/tournament counterpart
    of the player card's win-rate donut. */
export function StatRing({ value, label, ringColors, valueColor = '#F8FAFC' }: {
    value: string | number;
    label: string;
    ringColors: GradientStops;
    valueColor?: string;
}) {
    const size = 116;
    const radius = 48;
    return (
        <View style={{ width: size, height: size, marginHorizontal: 8 }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <SvgLinearGradient id="statRingGrad" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={ringColors[0]} />
                        <Stop offset="1" stopColor={ringColors[ringColors.length - 1]} />
                    </SvgLinearGradient>
                </Defs>
                <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="url(#statRingGrad)" strokeWidth={10} opacity={0.9} />
            </Svg>
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ fontSize: 24, fontWeight: '800', color: valueColor, lineHeight: 26, maxWidth: size - 40, textAlign: 'center' }}
                >
                    {value}
                </Text>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1.4, color: '#64748B', marginTop: 2 }} numberOfLines={1}>{label}</Text>
            </View>
        </View>
    );
}

/** Bottom info pill (the player card's W/D/L pills, generalized). */
export function StatPill({ value, label, background, border, valueColor, labelColor, valueSize = 20 }: {
    value: string | number;
    label: string;
    background: string;
    border: string;
    valueColor: string;
    labelColor: string;
    valueSize?: number;
}) {
    return (
        <View style={{
            flex: 1,
            borderRadius: 16,
            paddingVertical: 13,
            paddingHorizontal: 8,
            alignItems: 'center',
            backgroundColor: background,
            borderWidth: 1,
            borderColor: border,
        }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: valueSize, fontWeight: '800', color: valueColor, lineHeight: valueSize + 2 }}>{value}</Text>
            <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: labelColor, marginTop: 2 }}>{label}</Text>
        </View>
    );
}

export function PosterWordmark() {
    return (
        <View style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 5 }}>
                <Text style={{ color: '#2DD4ED' }}>GAME</Text>
                <Text style={{ color: '#3B82F6' }}>HUBZ</Text>
            </Text>
        </View>
    );
}

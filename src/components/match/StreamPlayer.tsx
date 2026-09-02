import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Rect, Stop } from 'react-native-svg';
import { EmbedSource, getPlatformMeta } from '../../lib/stream';
import { SocialType } from '../../types/auth';

interface StreamPlayerProps {
    source: EmbedSource;
    // Shown on the play poster and on the "open externally" fallback card.
    title?: string;
    // Optional context for the play poster (platform badge + LIVE pill).
    platform?: SocialType;
    live?: boolean;
    // Controlled mode (optional). When provided, the parent manages play state so multiple
    // StreamPlayers can coordinate — used by MatchStreamPanel to ensure only one card plays
    // at a time, avoiding double audio / wasted bandwidth.
    isPlaying?: boolean;
    onPlayPress?: () => void;
}

export function StreamPlayer({ source, title, platform, live, isPlaying, onPlayPress }: StreamPlayerProps) {
    const { t } = useTranslation('match');
    const resolvedTitle = title ?? t('player.openStream');
    // Uncontrolled fallback: internal "started" state when the parent doesn't pass isPlaying.
    const [internalStarted, setInternalStarted] = useState(false);
    const controlled = isPlaying !== undefined;
    const started = controlled ? isPlaying! : internalStarted;
    const handlePlay = controlled
        ? (onPlayPress ?? (() => { }))
        : () => setInternalStarted(true);

    if (source.kind === 'external') {
        return (
            <View className="rounded-2xl border border-white/[0.06] bg-card p-5 items-center">
                <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center mb-3">
                    <Ionicons name="open-outline" size={22} color="#10B981" />
                </View>
                <Text className="text-sm font-bold text-white text-center">{t('player.cantPlayInApp')}</Text>
                {!!source.reason && (
                    <Text className="text-xs text-slate-500 text-center mt-1">{source.reason}</Text>
                )}
                <Pressable
                    onPress={() => Linking.openURL(source.url)}
                    className="mt-4 bg-primary rounded-2xl py-3 px-6 flex-row items-center gap-2 active:opacity-80"
                >
                    <Ionicons name="play" size={16} color="#0F172A" />
                    <Text className="text-xs font-black text-primary-foreground uppercase tracking-widest">{title}</Text>
                </Pressable>
            </View>
        );
    }

    if (!started) {
        const meta = platform !== undefined ? getPlatformMeta(platform) : null;
        const accent = meta?.color ?? '#10B981';
        const gradId = `posterMesh-${platform ?? 'default'}`;
        const gradId2 = `posterMeshB-${platform ?? 'default'}`;
        return (
            <Pressable
                onPress={handlePlay}
                className="rounded-2xl overflow-hidden items-center justify-center"
                style={({ pressed }) => ({
                    aspectRatio: 16 / 9,
                    backgroundColor: '#0A0F1C',
                    opacity: pressed ? 0.92 : 1,
                })}
            >
                {/* Mesh gradient — two soft radials anchored to opposite corners. Reads as an
                    organic glow rather than a flat color band; much closer to how premium streaming
                    apps render placeholder thumbnails (Apple Music / iOS 17 vibe). */}
                <View style={StyleSheet.absoluteFill}>
                    <Svg width="100%" height="100%">
                        <Defs>
                            <SvgRadialGradient id={gradId} cx="18%" cy="22%" rx="85%" ry="85%">
                                <Stop offset="0" stopColor={accent} stopOpacity="0.22" />
                                <Stop offset="0.55" stopColor={accent} stopOpacity="0.04" />
                                <Stop offset="1" stopColor={accent} stopOpacity="0" />
                            </SvgRadialGradient>
                            <SvgRadialGradient id={gradId2} cx="100%" cy="100%" rx="60%" ry="60%">
                                <Stop offset="0" stopColor={accent} stopOpacity="0.10" />
                                <Stop offset="1" stopColor={accent} stopOpacity="0" />
                            </SvgRadialGradient>
                        </Defs>
                        <Rect x="0" y="0" width="100%" height="100%" fill="#0A0F1C" />
                        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
                        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId2})`} />
                    </Svg>
                </View>

                {/* 1px inner top-highlight — the embossed "lens cap" trick Apple uses on its cards */}
                <View
                    style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                        backgroundColor: 'rgba(255,255,255,0.06)',
                    }}
                />

                {/* Refined white play button — drop shadow makes it float above the gradient */}
                <View
                    className="items-center justify-center"
                    style={{
                        width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF',
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
                        shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 8 },
                    }}
                >
                    {/* marginLeft nudges the triangle to look optically centered */}
                    <Ionicons name="play" size={22} color="#0F172A" style={{ marginLeft: 3 }} />
                </View>

                {/* LIVE pill in the top-right — small, out of the way of the play button */}
                {live && (
                    <View className="absolute top-3 right-3 flex-row items-center gap-1 bg-red-500/20 border border-red-500/40 px-2 py-1 rounded-md">
                        <View className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <Text className="text-[9px] font-black text-red-300 uppercase tracking-widest">{t('player.live')}</Text>
                    </View>
                )}
            </Pressable>
        );
    }

    return (
        <View
            className="rounded-2xl overflow-hidden border border-white/[0.06]"
            style={{ aspectRatio: 16 / 9, backgroundColor: '#000' }}
        >
            <WebView
                source={source.kind === 'uri' ? { uri: source.uri } : { html: source.html, baseUrl: source.baseUrl }}
                style={{ flex: 1, backgroundColor: '#000' }}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
                startInLoadingState
                renderLoading={() => (
                    <View style={[StyleSheet.absoluteFill, styles.loading]}>
                        <ActivityIndicator size="small" color="#10B981" />
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
});

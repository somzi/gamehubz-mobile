import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, AppState, Platform, PermissionsAndroid } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import { Toggle } from '../ui/Toggle';
import { PlatformIcon } from './PlatformIcon';
import { getPlatformMeta } from '../../lib/stream';
import { getErrorMessage } from '../../lib/api';
import {
    BROADCAST_PLATFORMS,
    StreamAccountPlatform,
    startStreamLink,
    useStreamAccounts,
} from '../../lib/streamAccounts';
import { BroadcastStatus, broadcastErrorMessage, endLive, goLive } from '../../lib/broadcast';
import { MatchStream, MatchStreamStatus } from '../../types/stream';

// After a start or a stop the backend can trail the phone: "started" is retried, the first heartbeat
// may be what puts the stream on air, and an end waits on the VOD lookup — or, if the phone's report is
// lost, on the backend's sweep (heartbeat timeout + platform check, about two and a half minutes). The
// list is re-read until it shows the new state: quickly at first, then slower, for about three minutes.
const FAST_REFRESH_MS = 2500;
const FAST_REFRESH_ATTEMPTS = 12;
const SLOW_REFRESH_MS = 10_000;
const SLOW_REFRESH_ATTEMPTS = 15;

interface BroadcastControlsProps {
    matchId: string;
    /** Live status of the native broadcaster (owned by the panel, shared with its stream cards). */
    status: BroadcastStatus;
    /** Participant of a match that isn't over: may start a stream here. */
    canStart: boolean;
    /** The stream list changed on the backend (went live / stopped) — refetch it; null when it failed. */
    onStreamsChanged: () => Promise<MatchStream[] | null>;
}

/**
 * "Start stream" / "Stop stream" for streaming the phone's screen to the player's linked Twitch or
 * Kick channel. The player picks the sound (game, microphone, both, or none), starts, goes to the
 * game, and stops it here — or from the notification — when the match is over.
 */
export function BroadcastControls({ matchId, status, canStart, onStreamsChanged }: BroadcastControlsProps) {
    const { t } = useTranslation('match');
    const { user } = useAuth();
    const { data, refetch } = useStreamAccounts(user?.id);

    const [platform, setPlatform] = useState<StreamAccountPlatform | null>(null);
    const [gameAudio, setGameAudio] = useState(true);
    const [microphone, setMicrophone] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());
    const awaitingLink = useRef(false);
    const appStateRef = useRef(AppState.currentState);

    const isThisMatch = status.matchId === matchId;
    const isActiveHere = isThisMatch && (status.state === 'starting' || status.state === 'live');
    const isActiveElsewhere = !isThisMatch && (status.state === 'starting' || status.state === 'live');

    // Back from linking in the browser → refresh the linked channels.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (next) => {
            if (appStateRef.current.match(/inactive|background/) && next === 'active' && awaitingLink.current) {
                awaitingLink.current = false;
                refetch();
            }
            appStateRef.current = next;
        });
        return () => subscription.remove();
    }, [refetch]);

    // Re-reads the stream list until the player's own card shows the expected state. A newer call (or
    // leaving the screen) supersedes a running one.
    const refreshGeneration = useRef(0);
    const refreshUntil = (expectLive: boolean) => {
        const generation = ++refreshGeneration.current;
        const me = user?.id?.toLowerCase();
        let attempt = 0;
        const run = async () => {
            if (refreshGeneration.current !== generation) return;
            const list = await onStreamsChanged();
            if (refreshGeneration.current !== generation) return;
            const mineLive = !!list?.some(s =>
                s.streamerUserId?.toLowerCase() === me && s.status === MatchStreamStatus.Live);
            if (list && mineLive === expectLive) return;
            attempt++;
            if (attempt < FAST_REFRESH_ATTEMPTS) setTimeout(run, FAST_REFRESH_MS);
            else if (attempt < FAST_REFRESH_ATTEMPTS + SLOW_REFRESH_ATTEMPTS) setTimeout(run, SLOW_REFRESH_MS);
        };
        run();
    };
    useEffect(() => () => { refreshGeneration.current++; }, []);

    // The stream list follows the broadcaster: a card appears once live, closes once stopped.
    const previous = useRef(status);
    useEffect(() => {
        const prev = previous.current;
        previous.current = status;

        const wasActiveHere = prev.matchId === matchId && (prev.state === 'starting' || prev.state === 'live');
        const changedHere = isThisMatch && prev.state !== status.state;

        if (changedHere && status.state === 'live') {
            refreshUntil(true);
        } else if ((changedHere && (status.state === 'idle' || status.state === 'error')) || (wasActiveHere && !isActiveHere)) {
            // This match's stream ended — from the Stop button, the Android notification, the system
            // UI or the backend; an ended status may also arrive without a match id.
            refreshUntil(false);
        }
        if (changedHere && status.state === 'error') setError(broadcastErrorMessage(status.error));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status.state, status.matchId]);

    // Elapsed time while live.
    useEffect(() => {
        if (!(isActiveHere && status.state === 'live')) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [isActiveHere, status.state]);

    const linked = (data?.accounts ?? []).filter(a => !a.needsRelink);
    const expired = (data?.accounts ?? []).filter(a => a.needsRelink);
    const linkable = (data?.availablePlatforms ?? []).filter(p => !linked.some(a => a.platform === p));
    const chosen = platform && linked.some(a => a.platform === platform) ? platform : linked[0]?.platform ?? null;

    const link = async (p: StreamAccountPlatform) => {
        setError(null);
        try {
            awaitingLink.current = true;
            await startStreamLink(p);
        } catch (e) {
            awaitingLink.current = false;
            setError(getErrorMessage(e));
        }
    };

    const start = async () => {
        if (!chosen || busy) return;
        setError(null);
        setBusy(true);
        try {
            // Game sound and the microphone both go through RECORD_AUDIO on Android.
            if (Platform.OS === 'android' && (gameAudio || microphone)) {
                const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
                if (result !== PermissionsAndroid.RESULTS.GRANTED) {
                    setError(t('broadcast.errorAudioPermission'));
                    return;
                }
            }
            await goLive({ matchId, platform: chosen, gameAudio, microphone });
        } catch (e: any) {
            const code = typeof e?.code === 'string' ? e.code : null;
            setError(code === 'permission_denied' ? broadcastErrorMessage(code) : getErrorMessage(e));
            // The backend may have just marked the channel for re-link (token refused): pick that up so
            // the card offers "Link again" instead of the same Start.
            refetch();
        } finally {
            setBusy(false);
        }
    };

    const stop = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await endLive(status.matchId || matchId);
        } finally {
            setBusy(false);
            refreshUntil(false);
        }
    };

    // ─── Streaming right now ───
    if (isActiveHere || isActiveElsewhere) {
        const meta = status.platform ? getPlatformMeta(status.platform) : null;
        const live = status.state === 'live';
        const elapsed = live && status.startedAt ? Math.max(0, Math.floor((now - status.startedAt) / 1000)) : 0;
        const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

        return (
            <View className="mb-5 p-4 rounded-[22px] border" style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
                <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-2xl items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
                        {live ? <View className="w-3 h-3 rounded-full bg-red-500" /> : <ActivityIndicator size="small" color="#FCA5A5" />}
                    </View>
                    <View className="flex-1">
                        <Text className="text-sm font-black text-white">
                            {isActiveElsewhere ? t('broadcast.elsewhere') : live ? t('broadcast.live') : t('broadcast.starting')}
                        </Text>
                        <View className="flex-row items-center gap-1.5 mt-0.5">
                            {meta && status.platform ? <PlatformIcon platform={status.platform} size={11} color={meta.color} /> : null}
                            <Text className="text-xs text-slate-400">
                                {meta ? meta.name : ''}{live ? ` · ${clock}` : ''}
                            </Text>
                        </View>
                    </View>
                </View>

                {isActiveHere && live && (
                    <Text className="text-[11px] text-slate-400 mt-3">{t('broadcast.goPlay')}</Text>
                )}

                <Pressable
                    onPress={stop}
                    disabled={busy}
                    className="mt-4 h-12 rounded-2xl flex-row items-center justify-center active:opacity-80"
                    style={{ backgroundColor: '#EF4444', gap: 8 }}
                >
                    {busy ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="stop-circle" size={18} color="#fff" />
                            <Text className="text-sm font-black text-white uppercase" style={{ letterSpacing: 1.2 }}>
                                {t('broadcast.stop')}
                            </Text>
                        </>
                    )}
                </Pressable>
            </View>
        );
    }

    if (!canStart) return null;

    // ─── Not linked yet ───
    if (linked.length === 0) {
        return (
            <View className="mb-5 p-4 rounded-[22px] bg-card border border-white/[0.07]">
                <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-2xl items-center justify-center bg-primary/10">
                        <Ionicons name="radio" size={20} color="#10B981" />
                    </View>
                    <View className="flex-1">
                        <Text className="text-sm font-black text-white">{t('broadcast.title')}</Text>
                        <Text className="text-xs text-slate-500 mt-0.5">
                            {expired.length > 0
                                ? t('broadcast.needsRelink', { platform: getPlatformMeta(expired[0].platform).name })
                                : t('broadcast.linkFirst')}
                        </Text>
                    </View>
                </View>
                <View className="flex-row gap-2 mt-4">
                    {BROADCAST_PLATFORMS.filter(p => linkable.includes(p)).map(p => {
                        const meta = getPlatformMeta(p);
                        return (
                            <Pressable
                                key={p}
                                onPress={() => link(p)}
                                className="flex-1 h-11 rounded-2xl flex-row items-center justify-center active:opacity-80"
                                style={{ backgroundColor: `${meta.color}1F`, borderWidth: 1, borderColor: `${meta.color}55`, gap: 6 }}
                            >
                                <PlatformIcon platform={p} size={15} color={meta.color} />
                                <Text className="text-xs font-black text-white">{t('broadcast.link', { platform: meta.name })}</Text>
                            </Pressable>
                        );
                    })}
                </View>
                {error && <Text className="text-xs text-destructive font-bold mt-3 text-center">{error}</Text>}
            </View>
        );
    }

    // ─── Ready to go live ───
    return (
        <View className="mb-5 p-4 rounded-[22px] bg-card border border-white/[0.07]">
            <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-2xl items-center justify-center bg-primary/10">
                    <Ionicons name="radio" size={20} color="#10B981" />
                </View>
                <View className="flex-1">
                    <Text className="text-sm font-black text-white">{t('broadcast.title')}</Text>
                    <Text className="text-xs text-slate-500 mt-0.5">{t('broadcast.subtitle')}</Text>
                </View>
            </View>

            {/* Destination — only a choice when both channels are linked */}
            {linked.length > 1 && (
                <View className="flex-row gap-2 mt-4">
                    {linked.map(a => {
                        const meta = getPlatformMeta(a.platform);
                        const selected = chosen === a.platform;
                        return (
                            <Pressable
                                key={a.platform}
                                onPress={() => setPlatform(a.platform)}
                                className="flex-1 h-11 rounded-2xl flex-row items-center justify-center active:opacity-80"
                                style={{
                                    backgroundColor: selected ? `${meta.color}26` : 'rgba(255,255,255,0.03)',
                                    borderWidth: 1,
                                    borderColor: selected ? meta.color : 'rgba(255,255,255,0.07)',
                                    gap: 6,
                                }}
                            >
                                <PlatformIcon platform={a.platform} size={15} color={meta.color} />
                                <Text className="text-xs font-black text-white" numberOfLines={1}>@{a.login}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            )}
            {linked.length === 1 && (
                <View className="flex-row items-center gap-2 mt-4">
                    <PlatformIcon platform={linked[0].platform} size={14} color={getPlatformMeta(linked[0].platform).color} />
                    <Text className="text-xs text-slate-400">
                        {t('broadcast.streamTo')} <Text className="font-bold text-white">@{linked[0].login}</Text>
                    </Text>
                </View>
            )}

            {/* Sound: game, microphone, both, or none */}
            <View className="mt-4 pt-4 border-t border-white/5 gap-3">
                <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                        <Text className="text-sm font-bold text-white">{t('broadcast.gameAudio')}</Text>
                        <Text className="text-xs text-slate-500">{t('broadcast.gameAudioHint')}</Text>
                    </View>
                    <Toggle size="sm" value={gameAudio} onValueChange={setGameAudio} disabled={busy} />
                </View>
                <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                        <Text className="text-sm font-bold text-white">{t('broadcast.microphone')}</Text>
                        <Text className="text-xs text-slate-500">{t('broadcast.microphoneHint')}</Text>
                    </View>
                    <Toggle size="sm" value={microphone} onValueChange={setMicrophone} disabled={busy} />
                </View>
                {microphone && Platform.OS === 'ios' && (
                    <Text className="text-[11px] text-slate-400">{t('broadcast.micIosHint')}</Text>
                )}
            </View>

            <View className="flex-row items-start gap-2 mt-4 px-3 py-2 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
                <Ionicons name="moon-outline" size={14} color="#FBBF24" style={{ marginTop: 1 }} />
                <Text className="text-[11px] text-amber-300/90 flex-1">{t('broadcast.dndTip')}</Text>
            </View>

            {error && <Text className="text-xs text-destructive font-bold mt-3 text-center">{error}</Text>}

            <Pressable
                onPress={start}
                disabled={busy || !chosen}
                className="mt-4 h-12 rounded-2xl flex-row items-center justify-center active:opacity-80"
                style={{ backgroundColor: '#10B981', gap: 8, opacity: busy || !chosen ? 0.6 : 1 }}
            >
                {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <>
                        <Ionicons name="radio" size={18} color="#fff" />
                        <Text className="text-sm font-black text-white uppercase" style={{ letterSpacing: 1.2 }}>
                            {t('broadcast.start')}
                        </Text>
                    </>
                )}
            </Pressable>
        </View>
    );
}

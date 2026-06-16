import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { SocialType } from '../../types/auth';
import { MatchStream, MatchStreamStatus, STREAMING_PLATFORMS } from '../../types/stream';
import { getLiveEmbed, getVodEmbed, getPlatformMeta } from '../../lib/stream';
import { StreamPlayer } from './StreamPlayer';
import { PlatformIcon } from './PlatformIcon';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { SelectInput } from '../ui/SelectInput';

interface MatchStreamPanelProps {
    matchId: string;
    isParticipant: boolean;
    isCompleted: boolean;
    currentUserId?: string;
    initialStreams?: MatchStream[];
    onStreamsChange?: (streams: MatchStream[]) => void;
}

const platformOptions = STREAMING_PLATFORMS.map(p => ({ label: getPlatformMeta(p).name, value: p }));

export function MatchStreamPanel({
    matchId,
    isParticipant,
    isCompleted,
    currentUserId,
    initialStreams,
    onStreamsChange,
}: MatchStreamPanelProps) {
    const { user, refreshUser } = useAuth();

    const [streams, setStreams] = useState<MatchStream[]>(initialStreams ?? []);
    const [loading, setLoading] = useState(!initialStreams);
    // The single stream id currently playing — only one card mounts a WebView at a time so we
    // never hit double-audio or a flooded uplink. Tapping play on a different card pauses this one.
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // start form
    const [startOpen, setStartOpen] = useState(false);
    const [platform, setPlatform] = useState<SocialType | undefined>(undefined);
    const [handle, setHandle] = useState('');

    // manual VOD fallback
    const [vodInput, setVodInput] = useState('');

    const applyStreams = (list: MatchStream[]) => {
        setStreams(list);
        onStreamsChange?.(list);
        // If the currently-playing stream got removed (delete/end), stop playback so the user
        // doesn't see a dead poster mid-card. Otherwise leave their choice alone.
        setPlayingId(prev => (prev && list.some(s => s.id === prev) ? prev : null));
    };

    const fetchStreams = async () => {
        try {
            const res = await authenticatedFetch(ENDPOINTS.GET_MATCH_STREAMS(matchId));
            if (res.ok) {
                const data = await res.json();
                applyStreams(Array.isArray(data) ? data : []);
            }
        } catch {
            /* keep whatever we have */
        }
    };

    useEffect(() => {
        let active = true;
        (async () => {
            await fetchStreams();
            if (active) setLoading(false);
        })();
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId]);

    // Saved streaming channels from socials (quick-pick when starting).
    const savedChannels = (user?.userSocials || [])
        .map(s => ({ platform: (s.type ?? s.socialType) as SocialType, username: s.username }))
        .filter(s => STREAMING_PLATFORMS.includes(s.platform) && !!s.username);

    const myLiveStream = streams.find(
        s => s.streamerUserId?.toLowerCase() === currentUserId?.toLowerCase() && s.status === MatchStreamStatus.Live
    );
    const canStartMine = isParticipant && !isCompleted && !myLiveStream;

    const startStream = async (chosenPlatform: SocialType, chosenHandle?: string) => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await authenticatedFetch(ENDPOINTS.START_MATCH_STREAM(matchId), {
                method: 'POST',
                body: JSON.stringify({ Platform: chosenPlatform, Handle: chosenHandle?.trim() || undefined }),
            });
            if (!res.ok) throw new Error(getErrorMessage(await res.text()));
            await fetchStreams();
            setStartOpen(false);
            setHandle('');
            setPlatform(undefined);
            refreshUser?.();
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setSubmitting(false);
        }
    };

    const endStream = async (streamerUserId: string) => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await authenticatedFetch(ENDPOINTS.END_MATCH_STREAM(matchId), {
                method: 'POST',
                body: JSON.stringify({ StreamerUserId: streamerUserId }),
            });
            if (!res.ok) throw new Error(getErrorMessage(await res.text()));
            await fetchStreams();
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setSubmitting(false);
        }
    };

    const deleteStream = async (streamerUserId: string) => {
        Alert.alert(
            'Delete stream?',
            'This removes the stream link and replay. You can start a new one after.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setSubmitting(true);
                        setError(null);
                        try {
                            const res = await authenticatedFetch(
                                ENDPOINTS.DELETE_MATCH_STREAM(matchId, streamerUserId),
                                { method: 'DELETE' }
                            );
                            if (!res.ok) throw new Error(getErrorMessage(await res.text()));
                            await fetchStreams();
                        } catch (e) {
                            setError(getErrorMessage(e));
                        } finally {
                            setSubmitting(false);
                        }
                    },
                },
            ],
        );
    };

    const submitVod = async (streamerUserId: string) => {
        if (!vodInput.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await authenticatedFetch(ENDPOINTS.SET_MATCH_STREAM_VOD(matchId), {
                method: 'POST',
                body: JSON.stringify({ VodUrl: vodInput.trim(), StreamerUserId: streamerUserId }),
            });
            if (!res.ok) throw new Error(getErrorMessage(await res.text()));
            await fetchStreams();
            setVodInput('');
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View className="h-48 items-center justify-center">
                <ActivityIndicator size="small" color="#10B981" />
            </View>
        );
    }

    const labelFor = (s: MatchStream) =>
        s.streamerNickname || s.streamerUsername || getPlatformMeta(s.platform).name;

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
        >
            {error && (
                <View className="mb-4 p-3 rounded-2xl bg-destructive/10 border border-destructive/20">
                    <Text className="text-destructive text-sm font-bold text-center">{error}</Text>
                </View>
            )}

            {streams.length === 0 ? (
                canStartMine ? (
                    <StartArea
                        savedChannels={savedChannels}
                        platform={platform}
                        setPlatform={setPlatform}
                        handle={handle}
                        setHandle={setHandle}
                        submitting={submitting}
                        forceForm={startOpen}
                        onForceForm={() => setStartOpen(true)}
                        onStart={startStream}
                    />
                ) : (
                    <EmptyState />
                )
            ) : (
                <View className="gap-5">
                    {streams.map(s => {
                        const isMine = s.streamerUserId?.toLowerCase() === currentUserId?.toLowerCase();
                        return (
                            <StreamCard
                                key={s.id}
                                stream={s}
                                label={labelFor(s)}
                                isMine={isMine}
                                isPlaying={playingId === s.id}
                                onPlay={() => setPlayingId(s.id)}
                                onPause={() => setPlayingId(null)}
                                submitting={submitting}
                                vodInput={vodInput}
                                setVodInput={setVodInput}
                                onEnd={() => endStream(s.streamerUserId)}
                                onSubmitVod={() => submitVod(s.streamerUserId)}
                                onDelete={() => deleteStream(s.streamerUserId)}
                            />
                        );
                    })}

                    {/* A participant who isn't live yet can still add their own stream alongside the other's. */}
                    {canStartMine && (
                        startOpen ? (
                            <StartArea
                                savedChannels={savedChannels}
                                platform={platform}
                                setPlatform={setPlatform}
                                handle={handle}
                                setHandle={setHandle}
                                submitting={submitting}
                                forceForm
                                onForceForm={() => setStartOpen(true)}
                                onStart={startStream}
                                onCancel={() => setStartOpen(false)}
                            />
                        ) : (
                            <Pressable
                                onPress={() => setStartOpen(true)}
                                className="flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-primary/10 border border-primary/20 active:opacity-70"
                            >
                                <Ionicons name="videocam" size={16} color="#10B981" />
                                <Text className="text-xs font-black text-primary uppercase tracking-widest">Stream your own POV</Text>
                            </Pressable>
                        )
                    )}
                </View>
            )}
        </ScrollView>
    );
}

// Premium per-streamer card: header (avatar + name + platform + status), the player slot, and
// owner controls. Each card is fully self-contained so two of them stack cleanly when both
// opponents stream — separation is visual via spacing + platform-tinted accent.
function StreamCard({
    stream, label, isMine, isPlaying, onPlay, onPause, submitting, vodInput, setVodInput, onEnd, onSubmitVod, onDelete,
}: {
    stream: MatchStream;
    label: string;
    isMine: boolean;
    isPlaying: boolean;
    onPlay: () => void;
    onPause: () => void;
    submitting: boolean;
    vodInput: string;
    setVodInput: (v: string) => void;
    onEnd: () => void;
    onSubmitVod: () => void;
    onDelete: () => void;
}) {
    const meta = getPlatformMeta(stream.platform);
    const live = stream.status === MatchStreamStatus.Live;
    const hasReplay = !live && !!stream.vodUrl;

    return (
        <View
            className="rounded-3xl overflow-hidden bg-[#0D1525] border"
            style={{ borderColor: isMine ? `${meta.color}3A` : 'rgba(255,255,255,0.06)' }}
        >
            {/* Header: just avatar + name + (You) + pause when playing. Nothing more — pills
                live in the footer below the player so the header reads at a glance. */}
            <View className="flex-row items-center gap-3 px-4 pt-4 pb-3">
                <PlayerAvatar src={stream.streamerAvatarUrl || undefined} name={label} size="md" />
                <View className="flex-1 min-w-0 flex-row items-center gap-2">
                    <Text className="text-[15px] font-black text-white flex-shrink" numberOfLines={1}>{label}</Text>
                    {isMine && (
                        <View className="bg-primary/15 px-1.5 py-0.5 rounded">
                            <Text className="text-[8px] font-black text-primary uppercase tracking-widest">You</Text>
                        </View>
                    )}
                </View>
                {isPlaying && (
                    <Pressable
                        onPress={onPause}
                        className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] items-center justify-center active:opacity-60"
                    >
                        <Ionicons name="pause" size={14} color="#94A3B8" />
                    </Pressable>
                )}
            </View>

            {/* Player slot — clean, just the player or its poster, no overlays */}
            <View className="px-4">
                {live ? (
                    <StreamPlayer
                        source={getLiveEmbed(stream.platform, stream.channelHandle)}
                        title="Watch live"
                        platform={stream.platform}
                        live
                        isPlaying={isPlaying}
                        onPlayPress={onPlay}
                    />
                ) : hasReplay ? (
                    <StreamPlayer
                        source={getVodEmbed(stream.platform, stream.vodUrl!)}
                        title="Watch replay"
                        platform={stream.platform}
                        isPlaying={isPlaying}
                        onPlayPress={onPlay}
                    />
                ) : (
                    <PendingReplay channelUrl={stream.channelUrl} />
                )}
            </View>

            {/* Footer: platform pill + status pill, breathing room from the player above */}
            <View className="flex-row items-center gap-2 px-4 pt-3 pb-3">
                <View
                    className="flex-row items-center gap-1.5 px-2 py-1 rounded-md"
                    style={{ backgroundColor: `${meta.color}1A` }}
                >
                    <PlatformIcon platform={stream.platform} size={11} color={meta.color} />
                    <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: meta.color }}>
                        {meta.name}
                    </Text>
                </View>
                {live ? (
                    <View className="flex-row items-center gap-1 bg-red-500/15 px-2 py-1 rounded-md">
                        <View className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <Text className="text-[10px] font-black text-red-400 uppercase tracking-widest">Live</Text>
                    </View>
                ) : hasReplay ? (
                    <View className="bg-white/[0.05] px-2 py-1 rounded-md">
                        <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Replay</Text>
                    </View>
                ) : (
                    <View className="bg-yellow-500/10 px-2 py-1 rounded-md">
                        <Text className="text-[10px] font-black text-yellow-500/90 uppercase tracking-widest">Pending</Text>
                    </View>
                )}
            </View>

            {/* Owner controls — divider above to clearly mark "actions" zone */}
            {isMine && (
                <>
                    <View className="h-px bg-white/[0.04] mx-4" />
                    <View className="px-4 pt-3 pb-4 gap-2.5">
                        {live && (
                            <Button onPress={onEnd} loading={submitting} variant="outline" className="h-11 rounded-2xl">
                                <View className="flex-row items-center gap-2">
                                    <Ionicons name="stop-circle-outline" size={15} color="#F87171" />
                                    <Text className="text-[11px] font-black text-red-400 uppercase tracking-widest">End stream</Text>
                                </View>
                            </Button>
                        )}
                        {!live && stream.vodPending && (
                            <View className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 gap-2.5">
                                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paste the replay link</Text>
                                <Input placeholder="https://..." value={vodInput} onChangeText={setVodInput} autoCapitalize="none" />
                                <Button onPress={onSubmitVod} loading={submitting} disabled={!vodInput.trim()} size="sm">
                                    <Text className="text-white font-bold">Save replay link</Text>
                                </Button>
                            </View>
                        )}
                        <Pressable
                            onPress={onDelete}
                            disabled={submitting}
                            className="flex-row items-center justify-center gap-1.5 py-1 active:opacity-60"
                        >
                            <Ionicons name="trash-outline" size={12} color="#64748B" />
                            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Delete stream</Text>
                        </Pressable>
                    </View>
                </>
            )}
            {!isMine && <View className="h-1" />}
        </View>
    );
}

function PendingReplay({ channelUrl }: { channelUrl?: string | null }) {
    return (
        <View
            className="rounded-2xl border border-white/[0.06] bg-[#0B1120] items-center justify-center px-5"
            style={{ aspectRatio: 16 / 9 }}
        >
            <View className="w-12 h-12 rounded-2xl bg-yellow-500/10 items-center justify-center mb-3">
                <Ionicons name="hourglass-outline" size={22} color="#EAB308" />
            </View>
            <Text className="text-sm font-bold text-white text-center">Replay not available yet</Text>
            <Text className="text-xs text-slate-500 text-center mt-1">
                The platform hasn't published the VOD, or it couldn't be found automatically.
            </Text>
            {!!channelUrl && (
                <Pressable onPress={() => Linking.openURL(channelUrl)} className="mt-3 flex-row items-center gap-1.5">
                    <Ionicons name="open-outline" size={13} color="#10B981" />
                    <Text className="text-[11px] font-bold text-primary uppercase tracking-wider">Open channel</Text>
                </Pressable>
            )}
        </View>
    );
}

function StartArea({
    savedChannels, platform, setPlatform, handle, setHandle, submitting, forceForm, onForceForm, onStart, onCancel,
}: {
    savedChannels: { platform: SocialType; username: string }[];
    platform?: SocialType;
    setPlatform: (p: SocialType) => void;
    handle: string;
    setHandle: (h: string) => void;
    submitting: boolean;
    forceForm: boolean;
    onForceForm: () => void;
    onStart: (p: SocialType, h?: string) => void;
    onCancel?: () => void;
}) {
    const showForm = forceForm || savedChannels.length === 0;

    return (
        <View className="gap-3">
            <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Stream this match</Text>

            {!showForm ? (
                <View className="gap-3">
                    {savedChannels.map(c => {
                        const meta = getPlatformMeta(c.platform);
                        return (
                            <Pressable
                                key={`${c.platform}-${c.username}`}
                                disabled={submitting}
                                onPress={() => onStart(c.platform, c.username)}
                                className="flex-row items-center gap-3 p-4 rounded-2xl bg-[#131B2E] border border-white/[0.06] active:opacity-70"
                            >
                                <View className="w-10 h-10 rounded-2xl items-center justify-center" style={{ backgroundColor: `${meta.color}1A` }}>
                                    <PlatformIcon platform={c.platform} size={20} color={meta.color} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-sm font-bold text-white">{meta.name}</Text>
                                    <Text className="text-xs text-slate-500">@{c.username}</Text>
                                </View>
                                <Ionicons name="play-circle" size={24} color="#10B981" />
                            </Pressable>
                        );
                    })}
                    <Pressable onPress={onForceForm} className="flex-row items-center justify-center gap-2 py-3 active:opacity-60">
                        <Ionicons name="add" size={16} color="#64748B" />
                        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">Use another channel</Text>
                    </Pressable>
                </View>
            ) : (
                <View className="p-4 rounded-2xl bg-[#131B2E] border border-white/[0.06] gap-3">
                    <SelectInput placeholder="Select platform" options={platformOptions} value={platform} onSelect={setPlatform} />
                    {platform !== undefined && (
                        <Input placeholder="Your channel / handle" value={handle} onChangeText={setHandle} autoCapitalize="none" />
                    )}
                    <Button
                        onPress={() => platform !== undefined && onStart(platform, handle)}
                        loading={submitting}
                        disabled={platform === undefined || !handle.trim()}
                    >
                        <View className="flex-row items-center gap-2">
                            <Ionicons name="videocam" size={16} color="white" />
                            <Text className="text-white font-bold">Go live</Text>
                        </View>
                    </Button>
                    {!!onCancel && (
                        <Pressable onPress={onCancel} className="items-center py-1 active:opacity-60">
                            <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cancel</Text>
                        </Pressable>
                    )}
                </View>
            )}

            <Text className="text-[11px] text-slate-500 px-1">
                Your channel is saved to your profile for next time. When you end the stream we save the replay link automatically.
            </Text>
        </View>
    );
}

function EmptyState() {
    return (
        <View className="py-12 items-center justify-center bg-white/[0.02] rounded-2xl border border-white/5">
            <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center mb-3">
                <Ionicons name="videocam-outline" size={24} color="#10B981" />
            </View>
            <Text className="text-white font-bold text-sm">No stream for this match</Text>
            <Text className="text-slate-500 text-xs mt-1">Check back when a player goes live.</Text>
        </View>
    );
}

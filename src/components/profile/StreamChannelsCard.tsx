import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../context/AuthContext';
import { SectionLabel } from '../ui/SectionLabel';
import { Button } from '../ui/Button';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { PlatformIcon } from '../match/PlatformIcon';
import { getPlatformMeta } from '../../lib/stream';
import {
    BROADCAST_PLATFORMS,
    STREAM_ACCOUNTS_KEY,
    StreamAccountPlatform,
    startStreamLink,
    unlinkStreamAccount,
    useStreamAccounts,
} from '../../lib/streamAccounts';
import { isBroadcastAvailable } from '../../lib/broadcast';

interface StreamChannelsCardProps {
    onError: (message: string) => void;
}

/**
 * Twitch / Kick channels linked for streaming from GameHubz. Same flow as the Discord card: the
 * consent page opens in the browser, the backend stores the link, and the card refetches when the
 * app comes back to the foreground. Hidden on builds without the native broadcaster.
 */
export function StreamChannelsCard({ onError }: StreamChannelsCardProps) {
    const { t } = useTranslation('socials');
    const { t: tCommon } = useTranslation('common');
    const { user, refreshUser } = useAuth();
    const queryClient = useQueryClient();
    const available = isBroadcastAvailable();
    const { data, isLoading, refetch } = useStreamAccounts(user?.id, available);

    const [connecting, setConnecting] = useState<StreamAccountPlatform | null>(null);
    const [confirmUnlink, setConfirmUnlink] = useState<StreamAccountPlatform | null>(null);
    const [unlinking, setUnlinking] = useState(false);
    const awaitingLink = useRef(false);
    const appStateRef = useRef(AppState.currentState);

    // Back from the browser: the callback already stored the link — refetch so the row flips.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (next) => {
            if (appStateRef.current.match(/inactive|background/) && next === 'active' && awaitingLink.current) {
                awaitingLink.current = false;
                refetch();
                // The verified channel also lands on the profile's socials.
                refreshUser();
            }
            appStateRef.current = next;
        });
        return () => subscription.remove();
    }, [refetch, refreshUser]);

    if (!available) return null;

    const connect = async (platform: StreamAccountPlatform) => {
        if (connecting) return;
        setConnecting(platform);
        try {
            awaitingLink.current = true;
            await startStreamLink(platform);
        } catch (e) {
            awaitingLink.current = false;
            onError(t('streamChannels.startFailed'));
        } finally {
            setConnecting(null);
        }
    };

    const unlink = async () => {
        if (!confirmUnlink || unlinking) return;
        setUnlinking(true);
        try {
            await unlinkStreamAccount(confirmUnlink);
            await queryClient.invalidateQueries({ queryKey: STREAM_ACCOUNTS_KEY(user?.id) });
            setConfirmUnlink(null);
        } catch {
            onError(t('streamChannels.unlinkFailed'));
        } finally {
            setUnlinking(false);
        }
    };

    const accounts = data?.accounts ?? [];
    const confirmAccount = accounts.find(a => a.platform === confirmUnlink);

    return (
        <View className="mb-6">
            <SectionLabel icon="videocam" title={t('streamChannels.title')} color="#10B981" />
            <View className="p-4 bg-card rounded-[22px] border border-white/[0.07] border-t-white/[0.11]">
                <Text className="text-xs text-slate-500 mb-3">{t('streamChannels.hint')}</Text>

                {isLoading ? (
                    <View className="py-4 items-center">
                        <ActivityIndicator size="small" color="#10B981" />
                    </View>
                ) : (
                    <View className="gap-3">
                        {BROADCAST_PLATFORMS.map((platform) => {
                            const meta = getPlatformMeta(platform);
                            const account = accounts.find(a => a.platform === platform);
                            const canLink = data?.availablePlatforms.includes(platform) ?? false;

                            return (
                                <View key={platform} className="flex-row items-center gap-3">
                                    <View
                                        className="w-10 h-10 rounded-xl items-center justify-center border"
                                        style={{ backgroundColor: `${meta.color}1A`, borderColor: `${meta.color}33` }}
                                    >
                                        <PlatformIcon platform={platform} size={18} color={meta.color} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-sm font-bold text-white">{meta.name}</Text>
                                        {account ? (
                                            account.needsRelink ? (
                                                <Text className="text-xs text-amber-400">{t('streamChannels.needsRelink')}</Text>
                                            ) : (
                                                <Text className="text-xs text-slate-500" numberOfLines={1}>
                                                    {t('streamChannels.connected')} · @{account.login}
                                                </Text>
                                            )
                                        ) : !canLink ? (
                                            <Text className="text-xs text-slate-600">{t('streamChannels.unavailable')}</Text>
                                        ) : null}
                                    </View>

                                    {account && !account.needsRelink ? (
                                        <TouchableOpacity
                                            onPress={() => setConfirmUnlink(platform)}
                                            className="w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center border border-red-500/20"
                                        >
                                            <Ionicons name="unlink-outline" size={16} color="#EF4444" />
                                        </TouchableOpacity>
                                    ) : canLink ? (
                                        <Button
                                            onPress={() => connect(platform)}
                                            variant="outline"
                                            size="sm"
                                            disabled={!!connecting}
                                            loading={connecting === platform}
                                        >
                                            <Text className="text-white font-bold">
                                                {t('streamChannels.connect', { platform: meta.name })}
                                            </Text>
                                        </Button>
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>

            <ConfirmationModal
                visible={confirmUnlink !== null}
                onClose={() => setConfirmUnlink(null)}
                onConfirm={unlink}
                title={t('streamChannels.disconnectTitle', {
                    platform: confirmUnlink ? getPlatformMeta(confirmUnlink).name : '',
                })}
                message={t('streamChannels.disconnectMessage', { name: confirmAccount?.login ?? '' })}
                confirmText={t('disconnect')}
                cancelText={tCommon('cancel')}
                isDestructive
                isLoading={unlinking}
            />
        </View>
    );
}

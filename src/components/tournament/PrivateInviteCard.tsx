import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ENDPOINTS, authenticatedFetch, getErrorMessage } from '../../lib/api';
import { shareTournamentInvite } from '../../lib/share';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { hapticSuccess } from '../../lib/haptics';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { PRIVATE_COLORS } from '../ui/PrivateBadge';

interface PrivateInviteCardProps {
    tournamentId: string;
    tournamentName: string;
}

/**
 * The organiser's side of a private tournament: the six-digit join code, big enough to read out,
 * with one-tap copy and share. The code is fetched on its own manager-only endpoint — it is never
 * part of the (cached, public) overview — and can be replaced when it has leaked.
 */
export function PrivateInviteCard({ tournamentId, tournamentName }: PrivateInviteCardProps) {
    const { t } = useTranslation('tournament');
    const { copied, copy } = useCopyToClipboard(1600);
    const [code, setCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);

    const readCode = (data: any): string | null => {
        const raw = data?.result ?? data;
        return raw?.joinCode ?? raw?.JoinCode ?? null;
    };

    const fetchCode = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_TOURNAMENT_JOIN_CODE(tournamentId));
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || body.Message || t('invite.loadFailed'));
            }
            setCode(readCode(await response.json()));
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    }, [tournamentId, t]);

    useEffect(() => {
        fetchCode();
    }, [fetchCode]);

    const handleRegenerate = async () => {
        setIsRegenerating(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REGENERATE_TOURNAMENT_JOIN_CODE(tournamentId), {
                method: 'POST',
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || body.Message || t('invite.loadFailed'));
            }
            setCode(readCode(await response.json()));
            setError(null);
            hapticSuccess();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setIsRegenerating(false);
            setShowRegenerateConfirm(false);
        }
    };

    const digits = (code ?? '').split('');

    return (
        <View
            className="w-full rounded-[24px] p-5 mb-4 overflow-hidden"
            style={{
                backgroundColor: '#17120E',
                borderWidth: 1,
                borderColor: PRIVATE_COLORS.border,
            }}
        >
            {/* Header */}
            <View className="flex-row items-center gap-3">
                <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: PRIVATE_COLORS.bg }}
                >
                    <Ionicons name="lock-closed" size={18} color={PRIVATE_COLORS.icon} />
                </View>
                <View className="flex-1">
                    <Text className="text-white text-base font-black tracking-tight">{t('invite.title')}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5 leading-4">{t('invite.subtitle')}</Text>
                </View>
            </View>

            {/* Code */}
            <Text className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-5 mb-2">
                {t('invite.codeLabel')}
            </Text>
            {isLoading ? (
                <View className="h-16 items-center justify-center">
                    <ActivityIndicator size="small" color={PRIVATE_COLORS.icon} />
                </View>
            ) : error && !code ? (
                <Pressable
                    onPress={fetchCode}
                    className="h-16 rounded-2xl items-center justify-center flex-row gap-2 bg-white/[0.03] border border-white/[0.06] active:opacity-70"
                >
                    <Ionicons name="refresh" size={16} color="#94A3B8" />
                    <Text className="text-slate-400 text-xs font-bold">{error}</Text>
                </Pressable>
            ) : (
                <Pressable
                    onPress={() => code && copy(code)}
                    accessibilityRole="button"
                    accessibilityLabel={t('invite.copyCode')}
                    className="flex-row items-center justify-center active:opacity-70"
                    style={{ gap: 6 }}
                >
                    {digits.map((digit, index) => (
                        <React.Fragment key={index}>
                            {/* Visual break between the halves — the same 3+3 grouping the share
                                message uses, so the code reads identically everywhere. */}
                            {index === 3 && <View style={{ width: 8 }} />}
                            <View
                                className="items-center justify-center rounded-xl"
                                style={{
                                    flex: 1,
                                    maxWidth: 42,
                                    height: 54,
                                    backgroundColor: 'rgba(255,255,255,0.04)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,255,255,0.08)',
                                }}
                            >
                                <Text className="text-white font-black" style={{ fontSize: 26, fontVariant: ['tabular-nums'] }}>
                                    {digit}
                                </Text>
                            </View>
                        </React.Fragment>
                    ))}
                </Pressable>
            )}

            {/* Actions */}
            <View className="flex-row gap-3 mt-5">
                <Pressable
                    disabled={!code}
                    onPress={() => code && copy(code)}
                    className="flex-1 h-11 rounded-2xl flex-row items-center justify-center gap-2 bg-white/[0.05] border border-white/[0.08] active:opacity-70"
                    style={{ opacity: code ? 1 : 0.5 }}
                >
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? '#34D399' : '#E2E8F0'} />
                    <Text className="text-xs font-black" style={{ color: copied ? '#34D399' : '#E2E8F0' }}>
                        {copied ? t('invite.copied') : t('invite.copyCode')}
                    </Text>
                </Pressable>
                <Pressable
                    disabled={!code}
                    onPress={() => code && shareTournamentInvite(tournamentId, tournamentName, code)}
                    className="flex-1 h-11 rounded-2xl flex-row items-center justify-center gap-2 active:opacity-80"
                    style={{ backgroundColor: PRIVATE_COLORS.icon, opacity: code ? 1 : 0.5 }}
                >
                    <Ionicons name="share-social" size={16} color="#1A1410" />
                    <Text className="text-xs font-black" style={{ color: '#1A1410' }}>{t('invite.share')}</Text>
                </Pressable>
            </View>

            {code && (
                <Pressable
                    onPress={() => setShowRegenerateConfirm(true)}
                    disabled={isRegenerating}
                    className="self-center flex-row items-center gap-1.5 mt-4 px-3 py-1.5 active:opacity-60"
                >
                    {isRegenerating ? (
                        <ActivityIndicator size="small" color="#64748B" />
                    ) : (
                        <Ionicons name="refresh" size={13} color="#64748B" />
                    )}
                    <Text className="text-[11px] font-bold text-slate-500">{t('invite.newCode')}</Text>
                </Pressable>
            )}

            <ConfirmationModal
                visible={showRegenerateConfirm}
                onClose={() => setShowRegenerateConfirm(false)}
                onConfirm={handleRegenerate}
                title={t('invite.newCodeConfirmTitle')}
                message={t('invite.newCodeConfirmMessage')}
                confirmText={t('invite.newCodeConfirm')}
                isLoading={isRegenerating}
                stacked
            />
        </View>
    );
}

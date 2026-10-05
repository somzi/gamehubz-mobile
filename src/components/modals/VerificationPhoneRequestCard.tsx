import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { TournamentPhone, TournamentPhoneRequest } from '../../lib/tournamentVerificationPhones';
import { formatLocalDateTime } from '../../lib/utils';

export function VerificationPhoneRequestCard({ request, onDecide, onOpenProfile }: {
    request: TournamentPhoneRequest;
    onDecide: (request: TournamentPhoneRequest, approve: boolean) => Promise<void>;
    onOpenProfile?: (userId: string) => void;
}) {
    const { t } = useTranslation('tournament');
    const [action, setAction] = useState<'approve' | 'reject' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const decide = async (approve: boolean) => {
        if (busy.current) return;
        busy.current = true;
        setAction(approve ? 'approve' : 'reject');
        setError(null);
        try { await onDecide(request, approve); }
        catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : t('phoneRequests.failed')); }
        finally { busy.current = false; setAction(null); }
    };
    const label = (phone: TournamentPhone | null) => phone
        ? [phone.deviceModel, phone.platform === 'ios' ? 'iOS' : phone.platform === 'android' ? 'Android' : phone.platform].filter(Boolean).join(' · ')
        : t('phoneRequests.noPhone');

    return (
        <View className="rounded-[22px] border border-warning/25 bg-warning/[0.04] p-4 mb-3">
            <View className="flex-row items-center gap-2 mb-3">
                <Ionicons name="phone-portrait-outline" size={16} color="#F59E0B" />
                <Text className="flex-1 text-xs font-bold text-warning">{t('phoneRequests.title')}</Text>
                <Text className="text-[11px] text-slate-400">{formatLocalDateTime(request.requestedOn)}</Text>
            </View>
            <Pressable onPress={() => onOpenProfile?.(request.userId)} disabled={!onOpenProfile}
                accessibilityRole="button" className="flex-row items-center gap-3 min-h-[44px]">
                <PlayerAvatar name={request.username} src={request.avatarUrl ?? undefined} size="sm" />
                <Text className="flex-1 text-base font-bold text-white">{request.username}</Text>
            </Pressable>
            <View className="gap-3 rounded-2xl bg-black/20 p-3 my-3">
                <View>
                    <Text className="text-[11px] text-slate-400 mb-1">{t('phoneRequests.current')}</Text>
                    <Text className="text-sm font-semibold text-slate-200">{label(request.activePhone)}</Text>
                </View>
                <View>
                    <Text className="text-[11px] text-warning mb-1">{t('phoneRequests.requested')}</Text>
                    <Text className="text-sm font-bold text-white">{label(request.requestedPhone)}</Text>
                </View>
            </View>
            {request.otherAccounts.length > 0 && (
                <View className="mb-3">
                    <Text className="text-xs font-semibold text-warning mb-1">{t('phoneRequests.possiblePlayers')}</Text>
                    {request.otherAccounts.map(account => (
                        <Pressable key={account.userId} onPress={() => onOpenProfile?.(account.userId)} disabled={!onOpenProfile}
                            accessibilityRole="button" className="flex-row items-center gap-2 min-h-[44px]">
                            <PlayerAvatar name={account.username} src={account.avatarUrl ?? undefined} size="sm" />
                            <Text className="flex-1 text-sm font-semibold text-slate-200">{account.username}</Text>
                            <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                        </Pressable>
                    ))}
                </View>
            )}
            {!!error && <Text accessibilityRole="alert" className="text-destructive text-sm mb-3">{error}</Text>}
            <View className="flex-row gap-2">
                {([false, true] as const).map(approve => (
                    <Pressable key={String(approve)} disabled={!!action} onPress={() => decide(approve)}
                        accessibilityRole="button" accessibilityState={{ disabled: !!action, busy: action === (approve ? 'approve' : 'reject') }}
                        className={`flex-1 min-h-[48px] rounded-xl items-center justify-center ${approve ? 'bg-primary' : 'bg-white/5 border border-white/15'} ${action ? 'opacity-60' : 'active:opacity-70'}`}>
                        {action === (approve ? 'approve' : 'reject')
                            ? <ActivityIndicator size="small" color={approve ? '#022C22' : '#E2E8F0'} />
                            : <Text className={`font-bold text-sm ${approve ? 'text-emerald-950' : 'text-slate-200'}`}>{t(approve ? 'phoneRequests.approve' : 'phoneRequests.reject')}</Text>}
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

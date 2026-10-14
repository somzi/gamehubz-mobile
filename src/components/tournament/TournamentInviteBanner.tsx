import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { INVITE_COLORS } from '../ui/InviteOnlyBadge';
import { COLORS } from '../../lib/theme';
import { getErrorMessage } from '../../lib/api';
import { hapticSuccess } from '../../lib/haptics';
import {
    MyTournamentInvite,
    TournamentInviteKind,
    TournamentInviteStatus,
    acceptTournamentInvite,
    declineTournamentInvite,
} from '../../lib/tournamentInvites';

interface TournamentInviteBannerProps {
    invite: MyTournamentInvite;
    /** After an accept or decline went through — the screen reloads the tournament and the invite. */
    onAnswered: (accepted: boolean) => void;
}

/**
 * The invited player's side: what they are invited to, and Accept / Decline. Nobody is ever put
 * into a tournament without this tap. An invite reserves no place, so the card says so, and while
 * the tournament is full (or not open yet) Accept waits. A swap invite also spells out that the
 * matches the spot already played stay on the outgoing player's profile.
 */
export function TournamentInviteBanner({ invite, onAnswered }: TournamentInviteBannerProps) {
    const { t } = useTranslation('tournament');
    const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmDecline, setConfirmDecline] = useState(false);

    if (invite.status === TournamentInviteStatus.Expired || invite.status === TournamentInviteStatus.Cancelled) {
        return (
            <View className="w-full flex-row items-center gap-2.5 rounded-2xl px-4 py-3 bg-white/[0.03] border border-white/[0.06]">
                <Ionicons name="mail-outline" size={16} color={COLORS.slate500} />
                <Text className="flex-1 text-slate-400 text-xs font-semibold">
                    {invite.status === TournamentInviteStatus.Expired ? t('invites.banner.expired') : t('invites.banner.cancelled')}
                </Text>
            </View>
        );
    }

    if (invite.status !== TournamentInviteStatus.Pending) return null;

    const isSwap = invite.kind === TournamentInviteKind.Swap;
    const waiting = !isSwap && (invite.isTournamentFull || invite.registrationNotOpenYet);

    const answer = async (accept: boolean) => {
        setBusy(accept ? 'accept' : 'decline');
        setError(null);
        try {
            if (accept) await acceptTournamentInvite(invite.id);
            else await declineTournamentInvite(invite.id);
            if (accept) hapticSuccess();
            setConfirmDecline(false);
            onAnswered(accept);
        } catch (err) {
            setError(getErrorMessage(err));
            setConfirmDecline(false);
        } finally {
            setBusy(null);
        }
    };

    const title = isSwap ? t('invites.banner.swapTitle') : t('invites.banner.title');
    const subtitle = isSwap
        ? t('invites.banner.swapSubtitle', { name: invite.swapOutgoingUsername || t('swap.thisPlayer') })
        : invite.invitedByUsername
            ? t('invites.banner.byOrganizer', { name: invite.invitedByUsername })
            : t('invites.banner.generic');

    const note = isSwap
        ? (invite.swapPlayedMatches > 0
            ? t('invites.banner.swapPlayed', { count: invite.swapPlayedMatches, name: invite.swapOutgoingUsername || t('swap.thisPlayer') })
            : t('invites.banner.swapFresh'))
        : invite.registrationNotOpenYet
            ? t('invites.banner.notOpenYet')
            : invite.isTournamentFull
                ? t('invites.banner.full')
                : t('invites.banner.noReservation');

    return (
        <View
            className="w-full rounded-[22px] p-4 overflow-hidden"
            style={{ backgroundColor: '#0C1A24', borderWidth: 1, borderColor: INVITE_COLORS.border }}
        >
            <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: INVITE_COLORS.bg }}>
                    <Ionicons name={isSwap ? 'swap-horizontal' : 'mail-open'} size={19} color={INVITE_COLORS.icon} />
                </View>
                <View className="flex-1">
                    <Text className="text-white text-base font-black tracking-tight">{title}</Text>
                    <Text className="text-slate-300 text-xs mt-0.5 leading-4">{subtitle}</Text>
                </View>
                {invite.isGuest && (
                    <View className="px-2 py-1 rounded-full" style={{ backgroundColor: INVITE_COLORS.bg, borderWidth: 1, borderColor: INVITE_COLORS.border }}>
                        <Text style={{ color: INVITE_COLORS.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }}>
                            {t('invites.guest').toUpperCase()}
                        </Text>
                    </View>
                )}
            </View>

            <View className="flex-row items-start gap-2 mt-3">
                <Ionicons
                    name={waiting ? 'hourglass-outline' : 'information-circle-outline'}
                    size={14}
                    color={waiting ? COLORS.warning : COLORS.slate400}
                    style={{ marginTop: 1 }}
                />
                <Text className="flex-1 text-[11.5px] leading-4" style={{ color: waiting ? '#FCD34D' : COLORS.slate400 }}>
                    {note}
                </Text>
            </View>

            {error && (
                <View className="flex-row items-start gap-2 mt-3 p-3 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)' }}>
                    <Ionicons name="alert-circle" size={14} color={COLORS.destructive} />
                    <Text className="flex-1 text-[12px] leading-[17px] text-red-200">{error}</Text>
                </View>
            )}

            <View className="flex-row gap-3 mt-4">
                <Pressable
                    onPress={() => setConfirmDecline(true)}
                    disabled={!!busy}
                    className="flex-1 h-11 rounded-2xl flex-row items-center justify-center gap-2 bg-white/[0.05] border border-white/[0.08] active:opacity-70"
                >
                    {busy === 'decline' ? (
                        <ActivityIndicator size="small" color={COLORS.slate300} />
                    ) : (
                        <Text className="text-slate-200 text-sm font-black">{t('invites.banner.decline')}</Text>
                    )}
                </Pressable>
                <Pressable
                    onPress={() => answer(true)}
                    disabled={!!busy || waiting}
                    className="flex-1 h-11 rounded-2xl flex-row items-center justify-center gap-2 active:opacity-80"
                    style={{ backgroundColor: waiting ? 'rgba(255,255,255,0.05)' : COLORS.primary, opacity: waiting ? 0.7 : 1 }}
                >
                    {busy === 'accept' ? (
                        <ActivityIndicator size="small" color={COLORS.primaryForeground} />
                    ) : (
                        <>
                            <Ionicons name="checkmark" size={17} color={waiting ? COLORS.slate500 : COLORS.primaryForeground} />
                            <Text className="text-sm font-black" style={{ color: waiting ? COLORS.slate500 : COLORS.primaryForeground }}>
                                {isSwap ? t('invites.banner.acceptSpot') : t('invites.banner.accept')}
                            </Text>
                        </>
                    )}
                </Pressable>
            </View>

            <ConfirmationModal
                visible={confirmDecline}
                onClose={() => setConfirmDecline(false)}
                onConfirm={() => answer(false)}
                title={t('invites.banner.declineTitle')}
                message={t('invites.banner.declineMessage')}
                confirmText={t('invites.banner.decline')}
                isDestructive
                isLoading={busy === 'decline'}
                stacked
            />
        </View>
    );
}

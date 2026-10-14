import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { INVITE_COLORS } from '../ui/InviteOnlyBadge';
import { InvitePlayersModal } from '../modals/InvitePlayersModal';
import { TournamentInvite, TournamentInviteStatus, fetchTournamentInvites } from '../../lib/tournamentInvites';

interface InvitePlayersCardProps {
    tournamentId: string;
    /** Invite-only: invites are the only way in, so the card says that instead of "skips approval". */
    isInviteOnly: boolean;
    /** After an invite was sent or cancelled — nothing on the roster changes until a player accepts. */
    onChanged?: () => void;
    /**
     * Registration is open (or scheduled): new players can be invited. Once it closes the card only
     * shows up while swap invites wait for an answer, so the organizer can still withdraw them.
     */
    canInviteNew: boolean;
    /** Bumped by the screen after it sent an invite elsewhere (the swap sheet), to recount. */
    refreshKey?: number;
}

/**
 * The organizer's entry point to invites while players can still get in: how many invites are
 * open / accepted / declined, and the button that opens the picker.
 */
export function InvitePlayersCard({ tournamentId, isInviteOnly, onChanged, canInviteNew, refreshKey = 0 }: InvitePlayersCardProps) {
    const { t } = useTranslation('tournament');
    const [invites, setInvites] = useState<TournamentInvite[]>([]);
    const [open, setOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            setInvites(await fetchTournamentInvites(tournamentId));
        } catch {
            // The counts are a convenience; the sheet itself loads the list again.
        }
    }, [tournamentId]);

    useEffect(() => {
        load();
    }, [load, refreshKey]);

    const count = (status: TournamentInviteStatus) => invites.filter((i) => i.status === status).length;
    const pending = count(TournamentInviteStatus.Pending);
    const accepted = count(TournamentInviteStatus.Accepted);
    const declined = count(TournamentInviteStatus.Declined);

    // A running tournament takes no new players; the card is only there for swap invites still open.
    // Kept while its sheet is up: withdrawing the last one must not pull the sheet out from under it.
    if (!canInviteNew && pending === 0 && !open) return null;

    return (
        <View
            className="w-full rounded-[24px] p-5 mb-4 overflow-hidden"
            style={{ backgroundColor: '#0C1822', borderWidth: 1, borderColor: INVITE_COLORS.border }}
        >
            <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: INVITE_COLORS.bg }}>
                    <Ionicons name="mail" size={18} color={INVITE_COLORS.icon} />
                </View>
                <View className="flex-1">
                    <Text className="text-white text-base font-black tracking-tight">{t('invites.card.title')}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5 leading-4">
                        {!canInviteNew
                            ? t('invites.card.subtitleSwaps')
                            : isInviteOnly ? t('invites.card.subtitleInviteOnly') : t('invites.card.subtitleOpen')}
                    </Text>
                </View>
            </View>

            {invites.length > 0 && (
                <View className="flex-row gap-2 mt-4">
                    {[
                        { label: t('invites.status.pending'), value: pending, color: '#FCD34D' },
                        { label: t('invites.status.accepted'), value: accepted, color: '#6EE7B7' },
                        { label: t('invites.status.declined'), value: declined, color: '#FCA5A5' },
                    ].map((stat) => (
                        <View key={stat.label} className="flex-1 items-center py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                            <Text className="text-lg font-black" style={{ color: stat.color }}>{stat.value}</Text>
                            <Text className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5" numberOfLines={1}>
                                {stat.label}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            <Pressable
                onPress={() => setOpen(true)}
                className="h-11 rounded-2xl flex-row items-center justify-center gap-2 mt-4 active:opacity-80"
                style={{ backgroundColor: INVITE_COLORS.icon }}
            >
                <Ionicons name={canInviteNew ? 'person-add' : 'mail-open'} size={16} color="#06202D" />
                <Text className="text-xs font-black" style={{ color: '#06202D' }}>
                    {canInviteNew ? t('invites.card.invite') : t('invites.card.manage')}
                </Text>
            </Pressable>

            <InvitePlayersModal
                visible={open}
                onClose={() => {
                    setOpen(false);
                    // Players may have answered while the sheet was open.
                    load();
                }}
                tournamentId={tournamentId}
                allowPick={canInviteNew}
                onChanged={() => {
                    load();
                    onChanged?.();
                }}
            />
        </View>
    );
}

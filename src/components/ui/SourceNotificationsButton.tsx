import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActionSheetModal, type ActionSheetAction } from '../modals/ActionSheetModal';
import { StatusModal } from '../modals/StatusModal';
import { EmblemImage } from './HeroCard';
import { COLORS } from '../../lib/theme';
import { useSourceNotifications } from '../../hooks/useSourceNotifications';
import type { NotificationSourceKind } from '../../types/social';

interface SourceNotificationsButtonProps {
    kind: NotificationSourceKind;
    id: string;
    name: string;
    avatarUrl?: string | null;
    /** A tournament's hub: muting the hub silences the tournament too. */
    hubId?: string | null;
    hubName?: string | null;
    /** The viewer gets this source's notifications (member, player, organiser). Without it the bell
     *  only shows while the source is muted, so a mute is never stranded where it can't be undone. */
    involved: boolean;
}

/**
 * The header bell beside Share on a hub or tournament: the same switch as that source's row in
 * Settings → Notifications, one tap away from the thing it silences.
 */
export function SourceNotificationsButton({ kind, id, name, avatarUrl, hubId, hubName, involved }: SourceNotificationsButtonProps) {
    const { t } = useTranslation('settings');
    const { state, isSaving, setEnabled, enableHub, saveFailed, dismissSaveFailed } = useSourceNotifications(kind, id, hubId);
    const [sheetOpen, setSheetOpen] = useState(false);

    const muted = !!state && !state.enabled;
    const visible = !!state && (involved || muted);

    const actions: ActionSheetAction[] = state?.inheritedMute
        ? [
            { label: t('notifications.mutedWithHub'), icon: 'notifications-off-outline', color: COLORS.warning, selected: true, onPress: () => {} },
            { label: t('notifications.turnOnForHub'), icon: 'notifications-outline', color: COLORS.primary, onPress: enableHub },
        ]
        : [
            { label: t('notifications.receiving'), icon: 'notifications-outline', color: COLORS.primary, selected: !muted, onPress: () => { if (muted) setEnabled(true); } },
            { label: t('notifications.muted'), icon: 'notifications-off-outline', color: COLORS.warning, selected: muted, onPress: () => { if (!muted) setEnabled(false); } },
        ];

    return (
        <>
            {visible && (
                <Pressable
                    onPress={() => setSheetOpen(true)}
                    disabled={isSaving}
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center border active:opacity-60 ${muted ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10'}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('notifications.sourceLabel', { name })}
                    accessibilityValue={{ text: t(muted ? 'notifications.muted' : 'notifications.receiving') }}
                >
                    <Ionicons name={muted ? 'notifications-off-outline' : 'notifications-outline'} size={20} color={muted ? COLORS.warning : '#FAFAFA'} />
                </Pressable>
            )}
            <ActionSheetModal
                visible={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title={t('notifications.title')}
                subtitle={name}
                header={<EmblemImage src={avatarUrl} name={kind === 'tournaments' ? (hubName || name) : name} size={40} radius={12} />}
                actions={actions}
            />
            <StatusModal visible={saveFailed} onClose={dismissSaveFailed} type="error"
                title={t('notifications.saveFailedTitle')} message={t('notifications.saveFailedMessage')} />
        </>
    );
}

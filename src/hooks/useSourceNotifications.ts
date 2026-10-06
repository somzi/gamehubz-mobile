import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch, ENDPOINTS } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { setSourceNotifications, sourceNotificationState, supportsSourceMuting } from '../lib/notificationSettings';
import type { NotificationSettings, NotificationSourceKind } from '../types/social';

/**
 * One hub's or tournament's notification switch, for the bell beside Share on its screen. Reads and
 * writes the same settings (and the same query cache entry) as Settings → Notifications, so a change
 * made in either place shows in the other.
 *
 * `state` stays null until the server answers — and on a server without source muting — so the
 * caller renders nothing rather than a bell in the wrong position.
 */
export function useSourceNotifications(kind: NotificationSourceKind, id: string | undefined, hubId?: string | null) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const settingsKey = useMemo(() => ['notification-settings', user?.id], [user?.id]);
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);
    const [saveFailed, setSaveFailed] = useState(false);

    const settingsQuery = useQuery({
        queryKey: settingsKey,
        queryFn: async ({ signal }): Promise<NotificationSettings> => {
            const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SETTINGS, { signal });
            if (!response.ok) throw new Error(`NOTIFICATION_SETTINGS failed: ${response.status}`);
            return response.json();
        },
        enabled: !!user?.id && !!id,
        staleTime: 30_000,
    });

    const settings = settingsQuery.data;
    const state = settings && id && supportsSourceMuting(settings)
        ? sourceNotificationState(settings, kind, { id, name: '', hubId: hubId ?? null, hubName: null })
        : null;

    // Same optimistic write as the settings screen: the bell moves on the tap, and a failure puts
    // the previous settings back.
    const save = useCallback(async (sourceKind: NotificationSourceKind, sourceId: string, enabled: boolean) => {
        const previous = queryClient.getQueryData<NotificationSettings>(settingsKey);
        if (savingRef.current || !previous) return;
        savingRef.current = true;
        setIsSaving(true);
        const next = setSourceNotifications(previous, sourceKind, sourceId, enabled);
        await queryClient.cancelQueries({ queryKey: settingsKey });
        queryClient.setQueryData(settingsKey, next);
        try {
            const response = await authenticatedFetch(ENDPOINTS.NOTIFICATION_SETTINGS, {
                method: 'PUT', body: JSON.stringify(next),
            });
            if (!response.ok) throw new Error(`NOTIFICATION_SETTINGS failed: ${response.status}`);
            const saved: NotificationSettings = await response.json();
            if (!supportsSourceMuting(saved)) throw new Error('Source muting is unavailable');
            queryClient.setQueryData(settingsKey, saved);
        } catch (error) {
            console.error('[useSourceNotifications] Error updating notification settings:', error);
            queryClient.setQueryData(settingsKey, previous);
            setSaveFailed(true);
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    }, [queryClient, settingsKey]);

    const setEnabled = useCallback((enabled: boolean) => {
        if (id) void save(kind, id, enabled);
    }, [save, kind, id]);

    // A tournament silenced by its hub only comes back by turning the hub on again.
    const enableHub = useCallback(() => {
        if (hubId) void save('hubs', hubId, true);
    }, [save, hubId]);

    return { state, isSaving, setEnabled, enableHub, saveFailed, dismissSaveFailed: () => setSaveFailed(false) };
}

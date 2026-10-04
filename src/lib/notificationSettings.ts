import type { NotificationSettings, NotificationSource, NotificationSourceKind } from '../types/social';

export function supportsSourceMuting(settings: NotificationSettings): boolean {
    return Array.isArray(settings.mutedHubIds) && Array.isArray(settings.mutedTournamentIds);
}

export function sourceNotificationState(settings: NotificationSettings, kind: NotificationSourceKind, source: NotificationSource) {
    const inheritedMute = kind === 'tournaments' && !!source.hubId && !!settings.mutedHubIds?.includes(source.hubId);
    const ids = kind === 'hubs' ? settings.mutedHubIds : settings.mutedTournamentIds;
    return { enabled: !inheritedMute && !ids?.includes(source.id), inheritedMute };
}

export function setSourceNotifications(settings: NotificationSettings, kind: NotificationSourceKind, id: string, enabled: boolean): NotificationSettings {
    const key = kind === 'hubs' ? 'mutedHubIds' : 'mutedTournamentIds';
    const ids = new Set(settings[key] ?? []);
    if (enabled) ids.delete(id);
    else ids.add(id);
    return { ...settings, [key]: [...ids] };
}

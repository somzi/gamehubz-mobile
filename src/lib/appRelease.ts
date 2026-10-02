import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/** Display only: keep OTA identifiers out of version checks and X-App-Version. */
export function getAppReleaseLabel(): string {
    const version = Constants.expoConfig?.version || '—';

    // Embedded bundles also have an updateId, but are not downloaded OTA releases.
    if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) {
        return version;
    }

    // expoConfig belongs to the RUNNING update, not one waiting to be applied.
    const release = Constants.expoConfig?.extra?.otaRelease;
    if (release?.baseVersion === version && Number.isSafeInteger(release.revision) && release.revision > 0) {
        return `${version}-r${release.revision}`;
    }

    // Older / directly published updates may not have revision metadata.
    return `${version} · OTA ${Updates.updateId.slice(0, 8)}`;
}

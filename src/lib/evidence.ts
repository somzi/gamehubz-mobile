import * as ImagePicker from 'expo-image-picker';
import { File as FSFile } from 'expo-file-system';
import { MAX_FILE_SIZE } from './image';

/**
 * Media rules for match evidence, in one place because two screens attach it
 * (MatchDetailsModal and MatchScheduleCard) and they must agree with the server byte-for-byte.
 */

/**
 * The compressor is loaded lazily and never at module scope.
 *
 * react-native-compressor is a Nitro module, so requiring it inside Expo Go throws on import —
 * and a static import here would take the whole match screen down with it, not just video. A
 * guarded require keeps the app running everywhere and lets the video path simply not exist where
 * the native side is missing. Resolved once and cached: the answer cannot change at runtime.
 */
let compressorModule: typeof import('react-native-compressor') | null | undefined;

function getCompressor() {
    if (compressorModule === undefined) {
        try {
            compressorModule = require('react-native-compressor');
        } catch {
            compressorModule = null;
        }
    }
    return compressorModule;
}

/**
 * Whether this build can accept video at all.
 *
 * False in Expo Go and in any build predating the native module. Callers use it to keep the
 * picker on stills rather than letting someone choose a clip that could never be prepared.
 */
export function isVideoEvidenceSupported(): boolean {
    return getCompressor() !== null;
}

/** Mirrors the server's per-file video cap. Compression lands far below this; it is the guard. */
export const MAX_VIDEO_SIZE = 32 * 1024 * 1024;

/**
 * Longest clip we accept, in seconds.
 *
 * The picker's own videoMaxDuration only constrains recording, not library picks, so the limit
 * has to be enforced here after the fact. Ninety seconds at the settings below lands around 22MB,
 * inside the server cap — the three numbers (duration, bitrate, cap) are chosen together and have
 * to move together.
 */
export const MAX_VIDEO_DURATION_SECONDS = 90;

/** Matches the server enum: 0 = image, 1 = video. */
export const EVIDENCE_IMAGE = 0;
export const EVIDENCE_VIDEO = 1;

export interface EvidenceItem {
    url: string;
    mediaType: number;
}

/**
 * Reconciles the two shapes the API can return.
 *
 * `evidenceItems` is the typed list; `evidences` is the flat URL list that shipped clients read and
 * which the server still sends. When only the flat list is present — an older API, or a cached
 * payload — every entry is an image, which is what every row was before video existed.
 */
export function normalizeEvidenceItems(
    items: EvidenceItem[] | undefined | null,
    urls: string[] | undefined | null,
): EvidenceItem[] {
    if (items && items.length > 0) {
        return items
            .filter(i => !!i?.url)
            .map(i => ({ url: i.url, mediaType: i.mediaType === EVIDENCE_VIDEO ? EVIDENCE_VIDEO : EVIDENCE_IMAGE }));
    }

    return (urls ?? []).filter(Boolean).map(url => ({ url, mediaType: EVIDENCE_IMAGE }));
}

/**
 * A still frame to show in the gallery tile for a clip.
 *
 * Swapping the extension asks Cloudinary for a poster, which costs one derived asset per video —
 * generated once, then CDN-cached forever. Worth it: without it every clip is an identical black
 * square and nobody can tell which is which. Anything that is not a Cloudinary video URL comes
 * back unchanged, and the caller falls back to a plain placeholder tile.
 */
export function getVideoPosterUrl(url: string, width: number = 400): string | null {
    if (!url.includes('/video/upload/')) return null;

    const withoutExtension = url.replace(/\.[A-Za-z0-9]+$/, '');
    return withoutExtension.replace('/video/upload/', `/video/upload/w_${width},c_limit,q_auto/`) + '.jpg';
}

export function isVideoItem(item: EvidenceItem): boolean {
    return item.mediaType === EVIDENCE_VIDEO;
}

/** One file, already compressed where it needed to be, ready to be appended to a FormData. */
export interface PreparedEvidence {
    uri: string;
    name: string;
    type: string;
    isVideo: boolean;
}

export type EvidenceRejectionReason = 'tooLong' | 'tooLarge' | 'failed' | 'unsupported';

export interface EvidenceRejection {
    name: string;
    reason: EvidenceRejectionReason;
}

export interface PreparedEvidenceResult {
    prepared: PreparedEvidence[];
    rejected: EvidenceRejection[];
}

function extensionOf(uri: string, fallback: string): string {
    const match = /\.(\w+)(?:\?.*)?$/.exec(uri);
    return match ? match[1].toLowerCase() : fallback;
}

function videoMimeFor(extension: string): string {
    // The server whitelists by content type, so a wrong guess here is a rejected upload.
    switch (extension) {
        case 'mov': return 'video/quicktime';
        case 'm4v': return 'video/x-m4v';
        case '3gp': return 'video/3gpp';
        case 'webm': return 'video/webm';
        default: return 'video/mp4';
    }
}

function sizeOf(uri: string): number | null {
    try {
        return new FSFile(uri).size ?? null;
    } catch {
        // Unreadable size is not a reason to block an upload; the server has its own cap.
        return null;
    }
}

/**
 * Turns picked assets into upload-ready files, transcoding video on the device first.
 *
 * This is the whole point of doing it here rather than server-side: a phone clip can be 50MB, and
 * that is the user's mobile data, our upload timeout and our storage bill. Compressing before the
 * request means what crosses the wire is a few megabytes, and the provider stores exactly what we
 * send instead of transcoding it again on our tab.
 *
 * Anything that cannot be made to fit is returned in `rejected` rather than thrown, so a batch
 * with one bad clip still uploads the rest.
 */
export async function prepareEvidenceForUpload(
    assets: ImagePicker.ImagePickerAsset[],
    onVideoProgress?: (fileIndex: number, progress: number) => void,
): Promise<PreparedEvidenceResult> {
    const prepared: PreparedEvidence[] = [];
    const rejected: EvidenceRejection[] = [];

    for (let index = 0; index < assets.length; index++) {
        const asset = assets[index];
        const fallbackName = asset.fileName || asset.uri.split('/').pop() || `evidence-${index}`;
        const isVideo = asset.type === 'video';

        if (!isVideo) {
            const extension = extensionOf(asset.fileName || asset.uri, 'jpg');
            prepared.push({
                uri: asset.uri,
                name: fallbackName,
                // Normalised: HEIC and friends are declared honestly so the server whitelist sees
                // what it is actually getting.
                type: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
                isVideo: false,
            });
            continue;
        }

        const compressor = getCompressor();
        if (!compressor) {
            // No native side (Expo Go, or a build from before the module landed). Uploading the
            // raw clip is not an option — that is exactly the 40MB-over-mobile-data problem the
            // compression exists to prevent — so the clip is refused rather than sent.
            rejected.push({ name: fallbackName, reason: 'unsupported' });
            continue;
        }

        // duration arrives in milliseconds. Checked before compressing: transcoding a ten-minute
        // clip only to reject it wastes a minute of the user's time and their battery.
        const durationSeconds = (asset.duration ?? 0) / 1000;
        if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
            rejected.push({ name: fallbackName, reason: 'tooLong' });
            continue;
        }

        try {
            const compressedUri = await compressor.Video.compress(
                asset.uri,
                {
                    // Manual rather than auto: evidence needs a predictable ceiling that lines up
                    // with the server cap, and auto sizes itself from the source.
                    compressionMethod: 'manual',
                    // 1080, not 720. What people attach is a screen recording of a scoreboard, so
                    // the thing being judged is small text. A portrait phone capture is ~1080x2340;
                    // capping the long side at 720 would render it ~332px wide and smear the digits
                    // the organizer is trying to read. Clips run 20-40s in practice, so the size
                    // budget is there to spend on legibility.
                    maxSize: 1080,
                    bitrate: 2_000_000,
                },
                progress => onVideoProgress?.(index, progress),
            );

            const size = sizeOf(compressedUri);
            if (size !== null && size > MAX_VIDEO_SIZE) {
                rejected.push({ name: fallbackName, reason: 'tooLarge' });
                continue;
            }

            const extension = extensionOf(compressedUri, 'mp4');
            prepared.push({
                uri: compressedUri,
                name: fallbackName.replace(/\.[^.]+$/, '') + `.${extension}`,
                type: videoMimeFor(extension),
                isVideo: true,
            });
        } catch {
            rejected.push({ name: fallbackName, reason: 'failed' });
        }
    }

    return { prepared, rejected };
}

/**
 * Opens the library for stills and clips together — or stills only where video cannot be
 * compressed, so nobody picks a clip that would be refused a moment later.
 */
export async function pickEvidenceAssets(): Promise<ImagePicker.ImagePickerAsset[] | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isVideoEvidenceSupported() ? ['images', 'videos'] : ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
        videoMaxDuration: MAX_VIDEO_DURATION_SECONDS,
    });

    if (result.canceled) return null;
    return result.assets;
}

/**
 * Size gate for stills, kept separate from the video path: an image is rejected outright, while a
 * clip gets a chance to be compressed down first.
 */
export function isImageWithinLimit(asset: ImagePicker.ImagePickerAsset): boolean {
    if (asset.type === 'video') return true;
    if (asset.fileSize === undefined || asset.fileSize === null) return true;
    return asset.fileSize <= MAX_FILE_SIZE;
}

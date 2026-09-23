import { File as FSFile } from 'expo-file-system';

/**
 * When a clip says it was recorded, read from its own MP4 / QuickTime metadata.
 *
 * Result verification sends this alongside the recording so an organizer can see a clip that is days
 * older than the match it claims to settle. It is a HINT: metadata is whatever the file says, and a
 * determined cheat can rewrite it. It has to be read here, before compression — the transcoder writes a
 * brand-new file with a brand-new creation time, and the upload is that file.
 *
 * The movie header ('moov' > 'mvhd') carries the creation time as seconds since 1904-01-01 UTC. Only
 * box headers are read while walking the file — a few dozen bytes at a time — so a 50MB screen
 * recording is never loaded into memory; recorders commonly put 'moov' at the END of the file, after
 * the media data, which is why this seeks instead of reading from the top.
 */

/** Seconds between the MP4 epoch (1904-01-01) and the Unix epoch. */
const MP4_EPOCH_OFFSET = 2082844800;

/** A box header can't be smaller than this; anything smaller means the walk has lost its place. */
const HEADER_BYTES = 8;

// A clip claiming to predate smartphone screen recording, or to come from the future, is metadata
// nobody set properly rather than a date worth showing.
const EARLIEST_PLAUSIBLE = Date.UTC(2015, 0, 1);

function readUint32(bytes: Uint8Array, at: number): number {
    return ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
}

function readUint64(bytes: Uint8Array, at: number): number {
    // Exact up to 2^53, far beyond any timestamp or file offset this will ever meet.
    return readUint32(bytes, at) * 0x100000000 + readUint32(bytes, at + 4);
}

function typeOf(bytes: Uint8Array, at: number): string {
    return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

/** The recording's creation time, or null when the file does not carry a usable one. Never throws. */
export function readVideoRecordedAt(uri: string): Date | null {
    let handle: ReturnType<FSFile['open']> | null = null;

    try {
        const file = new FSFile(uri);
        const fileSize = file.size ?? 0;
        if (fileSize < HEADER_BYTES) return null;

        handle = file.open();

        const readAt = (offset: number, length: number): Uint8Array | null => {
            if (!handle || offset < 0 || offset + length > fileSize) return null;
            handle.offset = offset;
            const bytes = handle.readBytes(length);
            return bytes.length === length ? bytes : null;
        };

        /** Finds a child box of `type` between [start, end); returns its payload range. */
        const findBox = (type: string, start: number, end: number): { payload: number; end: number } | null => {
            let offset = start;
            // Bounded: a corrupt size field must not become an endless walk.
            for (let guard = 0; guard < 512 && offset + HEADER_BYTES <= end; guard++) {
                const header = readAt(offset, 16 <= end - offset ? 16 : HEADER_BYTES);
                if (!header) return null;

                let size = readUint32(header, 0);
                let headerLength = HEADER_BYTES;
                if (size === 1) {
                    // 64-bit "largesize" follows the type.
                    if (header.length < 16) return null;
                    size = readUint64(header, 8);
                    headerLength = 16;
                } else if (size === 0) {
                    // Box runs to the end of its container.
                    size = end - offset;
                }

                if (size < headerLength || offset + size > end) return null;

                if (typeOf(header, 4) === type) {
                    return { payload: offset + headerLength, end: offset + size };
                }
                offset += size;
            }
            return null;
        };

        const moov = findBox('moov', 0, fileSize);
        if (!moov) return null;

        const mvhd = findBox('mvhd', moov.payload, moov.end);
        if (!mvhd) return null;

        // Full box: version (1) + flags (3), then creation_time — 32-bit in version 0, 64-bit in 1.
        const body = readAt(mvhd.payload, 12);
        if (!body) return null;

        const version = body[0];
        const seconds = version === 1 ? readUint64(body, 4) : readUint32(body, 4);
        if (!seconds) return null;

        const ms = (seconds - MP4_EPOCH_OFFSET) * 1000;
        if (ms < EARLIEST_PLAUSIBLE || ms > Date.now() + 10 * 60 * 1000) return null;

        return new Date(ms);
    } catch {
        // An unreadable header is not a reason to hold up a verification.
        return null;
    } finally {
        try { handle?.close(); } catch { /* already closed */ }
    }
}

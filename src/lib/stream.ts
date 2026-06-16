import { Ionicons } from '@expo/vector-icons';
import { SocialType } from '../types/auth';

// Twitch embeds require a `parent` that matches the WebView origin. We load Twitch via an HTML
// string with this fixed baseUrl so the parent check passes in both dev and prod.
const TWITCH_PARENT = 'codespheresolutions.dev';

export type EmbedSource =
    | { kind: 'uri'; uri: string }
    | { kind: 'html'; html: string; baseUrl: string }
    | { kind: 'external'; url: string; reason?: string };

export interface PlatformMeta {
    name: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
}

export function getPlatformMeta(platform: SocialType): PlatformMeta {
    switch (platform) {
        case SocialType.Twitch:
            return { name: 'Twitch', icon: 'logo-twitch', color: '#9146FF' };
        case SocialType.YouTube:
            return { name: 'YouTube', icon: 'logo-youtube', color: '#FF0000' };
        case SocialType.Kick:
            return { name: 'Kick', icon: 'play-circle', color: '#53FC18' };
        default:
            return { name: 'Stream', icon: 'videocam', color: '#10B981' };
    }
}

const wrapIframe = (src: string) =>
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">` +
    `<style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;background:#000;overflow:hidden}` +
    `iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>` +
    `<body><iframe src="${src}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe></body></html>`;

// Native <video> + hls.js player for a raw HLS manifest (.m3u8). Used for Kick VODs, whose only
// embeddable form is the CORS-open master.m3u8 (Kick's own player page can't be embedded). iOS
// WebView plays HLS natively; Android needs hls.js. The manifest's CORS is `*`, so both work.
const wrapHls = (src: string) =>
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">` +
    `<style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;background:#000;overflow:hidden}` +
    `video{position:absolute;inset:0;width:100%;height:100%;background:#000}</style></head>` +
    `<body><video id="v" controls playsinline webkit-playsinline></video>` +
    `<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js"></script>` +
    `<script>(function(){var url=${JSON.stringify(src)};var v=document.getElementById('v');` +
    `function go(){v.play&&v.play().catch(function(){});}` +
    // iOS / Safari: native HLS is best; otherwise fall back to hls.js (Android WebView).
    `if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=url;v.addEventListener('loadedmetadata',go);}` +
    `else if(window.Hls&&window.Hls.isSupported()){var h=new Hls({enableWorker:true});h.loadSource(url);h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,go);}` +
    `else{v.src=url;}})();</script></body></html>`;

const isHlsUrl = (url: string): boolean => /\.m3u8(\?|#|$)/i.test(url);

// ── id / handle extraction ───────────────────────────────────────────────
const youTubeVideoId = (s: string): string | null =>
    s.match(/(?:v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null;

const youTubeChannelId = (s: string): string | null =>
    s.match(/(UC[A-Za-z0-9_-]{20,})/)?.[1] ?? null;

const twitchVideoId = (s: string): string | null =>
    s.match(/videos?\/(\d+)/)?.[1] ?? null;

// Strip url/@ to a bare channel token.
export function cleanHandle(raw: string): string {
    let h = (raw || '').trim();
    if (/https?:\/\//i.test(h) || /twitch\.tv|kick\.com|youtube\.com|youtu\.be/i.test(h)) {
        h = h.replace(/^https?:\/\//i, '');
        const segments = h.split('/').filter(Boolean);
        // for youtube.com/@name/live the channel token is the @name segment
        const at = segments.find(s => s.startsWith('@'));
        h = at ?? segments[1] ?? segments[segments.length - 1] ?? h;
    }
    h = h.replace(/^@/, '');
    const q = h.indexOf('?');
    if (q >= 0) h = h.slice(0, q);
    return h.trim();
}

// Live embed for an actively-streaming channel.
export function getLiveEmbed(platform: SocialType, handle: string): EmbedSource {
    const h = cleanHandle(handle);

    switch (platform) {
        case SocialType.Twitch:
            return {
                kind: 'html',
                baseUrl: `https://${TWITCH_PARENT}`,
                html: wrapIframe(
                    `https://player.twitch.tv/?channel=${encodeURIComponent(h)}&parent=${TWITCH_PARENT}&autoplay=true&muted=false&playsinline=true`
                ),
            };

        case SocialType.Kick:
            return { kind: 'uri', uri: `https://player.kick.com/${encodeURIComponent(h)}` };

        case SocialType.YouTube: {
            // YouTube live can only be iframed by channel id (UC..) — embed when we have one,
            // otherwise fall back to opening the channel's live page externally.
            const channelId = youTubeChannelId(handle);
            if (channelId) {
                return {
                    kind: 'uri',
                    uri: `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1&playsinline=1`,
                };
            }
            const url = /https?:\/\//i.test(handle) ? handle : `https://www.youtube.com/@${h}/live`;
            return { kind: 'external', url, reason: "YouTube live can't be embedded without a channel ID." };
        }

        default:
            return { kind: 'external', url: `https://${cleanHandle(handle)}` };
    }
}

// Identify the platform from the VOD url itself (so a pasted/sample link renders correctly even
// if it doesn't match the stream's selected platform).
function detectPlatformFromUrl(url: string): SocialType | null {
    if (/youtube\.com|youtu\.be/i.test(url)) return SocialType.YouTube;
    if (/twitch\.tv/i.test(url)) return SocialType.Twitch;
    if (/kick\.com/i.test(url)) return SocialType.Kick;
    return null;
}

// Replay embed for a stored VOD link. The url's own platform wins over the passed hint.
export function getVodEmbed(platformHint: SocialType, vodUrl: string): EmbedSource {
    // A raw HLS manifest (Kick VODs are stored as the master.m3u8) plays directly via hls.js,
    // regardless of platform.
    if (isHlsUrl(vodUrl)) {
        return { kind: 'html', baseUrl: 'https://kick.com', html: wrapHls(vodUrl) };
    }

    const platform = detectPlatformFromUrl(vodUrl) ?? platformHint;

    switch (platform) {
        case SocialType.Twitch: {
            const id = twitchVideoId(vodUrl);
            if (!id) return { kind: 'external', url: vodUrl };
            return {
                kind: 'html',
                baseUrl: `https://${TWITCH_PARENT}`,
                html: wrapIframe(
                    `https://player.twitch.tv/?video=${id}&parent=${TWITCH_PARENT}&autoplay=false&playsinline=true`
                ),
            };
        }

        case SocialType.YouTube: {
            const id = youTubeVideoId(vodUrl);
            if (!id) return { kind: 'external', url: vodUrl };
            return { kind: 'uri', uri: `https://www.youtube.com/embed/${id}?playsinline=1` };
        }

        case SocialType.Kick:
            // Kick VODs are embedded only via their .m3u8 (handled above). A non-manifest Kick url
            // here is a legacy/watch-page link — Kick's player page can't be embedded, so open it
            // externally rather than render the "misconfigured" placeholder.
            return { kind: 'external', url: vodUrl };

        default:
            return { kind: 'external', url: vodUrl };
    }
}

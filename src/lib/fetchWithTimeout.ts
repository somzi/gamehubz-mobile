/** The deadline of fetchTextWithTimeout passed. RN's own abort error only says "Aborted". */
export class RequestTimeoutError extends Error {
    name = 'TimeoutError';
}

/** Includes reading the response body in the deadline, not only receiving its headers. */
export async function fetchTextWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text: async () => text };
    } catch (error) {
        // Nobody else holds this controller, so an abort is the deadline.
        if (controller.signal.aborted) throw new RequestTimeoutError('Request timed out');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/** What to tell the player when an auth request never got an answer (no HTTP status to read). */
export function transportErrorKey(error: unknown): 'common:app.requestTimedOut' | 'common:app.networkError' {
    return error instanceof RequestTimeoutError || (error as { name?: string } | null)?.name === 'TimeoutError'
        ? 'common:app.requestTimedOut'
        : 'common:app.networkError';
}

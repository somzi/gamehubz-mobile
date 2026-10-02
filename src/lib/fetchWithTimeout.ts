/** Includes reading the response body in the deadline, not only receiving its headers. */
export async function fetchTextWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text: async () => text };
    } finally {
        clearTimeout(timer);
    }
}

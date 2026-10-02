export type OutgoingMessage = { id: string; content: string; state: 'sending' | 'failed'; error?: string };
let nextId = 0;

/** A failed send retains its exact text independently from whatever is now in the composer. */
export function createChatOutbox(deliver: (content: string) => Promise<void>, publish: (messages: OutgoingMessage[]) => void) {
    let messages: OutgoingMessage[] = [];
    const inFlight = new Set<string>();
    const update = (next: OutgoingMessage[]) => { messages = next; publish(next); };
    const send = async (content: string, retryId?: string): Promise<boolean> => {
        if (!content.trim()) return false;
        const id = retryId ?? `local-${++nextId}`;
        if (inFlight.has(id) || (retryId && !messages.some((m) => m.id === id))) return false;
        inFlight.add(id);
        const message: OutgoingMessage = { id, content, state: 'sending' };
        update(retryId ? messages.map((m) => m.id === id ? message : m) : [...messages, message]);
        try {
            await deliver(content);
            update(messages.filter((m) => m.id !== id));
            return true;
        } catch (error) {
            update(messages.map((m) => m.id === id ? { ...m, state: 'failed', error: String(error) } : m));
            return false;
        } finally { inFlight.delete(id); }
    };
    return { send, retry: (id: string) => {
        const message = messages.find((m) => m.id === id);
        return message ? send(message.content, id) : Promise.resolve(false);
    } };
}

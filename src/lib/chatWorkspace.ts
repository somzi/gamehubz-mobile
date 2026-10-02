import { createChatOutbox, type OutgoingMessage } from './chatOutbox';

export type SentChatMessage = { id: string; content: string; sentAt: string };
type Draft = { id: string; content: string };
type Snapshot = { draft: string; drafts: Draft[]; pending: OutgoingMessage[]; sent: SentChatMessage[] };
let draftId = 0;

/** Lives outside the native modal/route subtree. Merging transfers ownership, never resends work. */
export class ChatWorkspace {
    private parent?: ChatWorkspace;
    private members = new Set<ChatWorkspace>([this]);
    private listeners = new Set<() => void>();
    private pending: OutgoingMessage[] = [];
    private sender?: { token: object; send: (content: string) => Promise<void> };
    private snapshot: Snapshot = { draft: '', drafts: [], pending: [], sent: [] };
    private outbox = createChatOutbox(
        content => {
            const sender = this.root().sender;
            return sender ? sender.send(content) : Promise.reject(new Error('Chat inactive'));
        },
        pending => { this.pending = pending; this.root().publish(); },
    );

    private root(): ChatWorkspace { return this.parent ? this.parent.root() : this; }
    private publish(update: Partial<Snapshot> = {}) {
        const root = this.root();
        root.snapshot = { ...root.snapshot, ...update, pending: [...root.members].flatMap(member => member.pending) };
        for (const member of root.members) for (const listener of member.listeners) listener();
    }
    getSnapshot = (): Snapshot => this.root().snapshot;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    setDraft = (draft: string) => this.root().publish({ draft });
    restoreDraft = (id: string) => {
        const root = this.root(), state = root.snapshot;
        const selected = state.drafts.find(draft => draft.id === id);
        if (!selected) return;
        const drafts = state.drafts.filter(draft => draft.id !== id);
        if (state.draft.trim() && state.draft !== selected.content) drafts.push({ id: `draft-${++draftId}`, content: state.draft });
        root.publish({ draft: selected.content, drafts });
    };
    discardDraft = (id: string) => this.root().publish({ drafts: this.root().snapshot.drafts.filter(draft => draft.id !== id) });
    bindSender(send: (content: string) => Promise<void>) {
        const token = {};
        this.root().sender = { token, send };
        return () => { const root = this.root(); if (root.sender?.token === token) root.sender = undefined; };
    }
    recordSent(message: SentChatMessage) {
        const root = this.root();
        root.publish({ sent: [...root.snapshot.sent.filter(item => item.id !== message.id), message] });
    }
    send = (content: string) => this.root().outbox.send(content);
    retry = (message: OutgoingMessage) => {
        const owner = [...this.root().members].find(member => member.pending.some(item => item.id === message.id));
        return owner ? owner.outbox.retry(message.id) : Promise.resolve(false);
    };
    discard = (message: OutgoingMessage) => {
        const owner = [...this.root().members].find(member => member.pending.some(item => item.id === message.id));
        return owner?.outbox.discard(message.id) ?? false;
    };
    absorb(other: ChatWorkspace) {
        const root = this.root(), source = other.root();
        if (root === source) return;
        const drafts = [...root.snapshot.drafts];
        for (const content of [source.snapshot.draft, ...source.snapshot.drafts.map(draft => draft.content)]) {
            if (content.trim() && content !== root.snapshot.draft && !drafts.some(draft => draft.content === content)) {
                drafts.push({ id: `draft-${++draftId}`, content });
            }
        }
        const sent = new Map([...source.snapshot.sent, ...root.snapshot.sent].map(message => [message.id, message]));
        source.parent = root;
        for (const member of source.members) root.members.add(member);
        root.publish({ drafts, sent: [...sent.values()] });
    }
}

// Route keys are unique across accounts. Entries are released on unmount and on logout.
const routes = new Map<string, ChatWorkspace>();
export function getChatWorkspace(routeKey: string) {
    let workspace = routes.get(routeKey);
    if (!workspace) { workspace = new ChatWorkspace(); routes.set(routeKey, workspace); }
    return workspace;
}
export function mergeChatWorkspaces(targetKey: string, removedKeys: string[]) {
    const target = getChatWorkspace(targetKey);
    for (const key of removedKeys) {
        const source = routes.get(key);
        if (source) target.absorb(source);
    }
}
export function retainChatWorkspace(routeKey: string, workspace: ChatWorkspace) { routes.set(routeKey, workspace); }
export function releaseChatWorkspace(routeKey: string, workspace: ChatWorkspace) {
    if (routes.get(routeKey) === workspace) routes.delete(routeKey);
}
export function clearChatWorkspaces() { routes.clear(); }

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadConversationCallback, loadFetcher } from './loadFetcher.mjs';
import { deferred, flush } from './loadApi.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { QueryClient, QueryObserver } = require('@tanstack/query-core');

test('a failed DM read reconciles its optimistic badge and reports failure so the queue can retry', async () => {
    let invalidations = 0;
    const read = loadFetcher('src/screens/DirectChatScreen.tsx', 'markChatRead', {
        useCallback: fn => fn, updateCachedChat() {}, refreshCounts() {},
        queryClient: { invalidateQueries() { invalidations++; } },
        authenticatedFetch: async () => ({ ok: false, status: 503 }), ENDPOINTS: { MARK_DIRECT_CHAT_READ: id => id },
    });
    await assert.rejects(read('chat'), /503/);
    assert.equal(invalidations, 1);
});

test('a delayed match-read response reconciles a newer unread badge with server state', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const queryKey = ['home-matches', 'user-A'];
    queryClient.setQueryData(queryKey, [{ id: 'match-A', unreadMessages: 2 }]);
    let serverUnread = 0;
    const observer = new QueryObserver(queryClient, { queryKey, staleTime: Infinity,
        queryFn: async () => [{ id: 'match-A', unreadMessages: serverUnread }] });
    const unsubscribe = observer.subscribe(() => {}), read = deferred();
    try {
        const markRead = loadConversationCallback('src/components/match/MatchChatPanel.tsx', 'onRead', {
            queryClient, refreshCounts() {}, scheduleMatchesRefresh() {}, authenticatedFetch: () => read.promise,
            ENDPOINTS: { MARK_MATCH_CHAT_READ: id => id },
        });
        const pending = markRead('match-A');
        // The read was already committed; another message arrives before its HTTP answer.
        serverUnread = 1;
        queryClient.setQueryData(queryKey, [{ id: 'match-A', unreadMessages: 1 }]);
        read.resolve({ ok: true }); await pending; await flush();
        assert.equal(queryClient.getQueryData(queryKey)[0].unreadMessages, 1);
    } finally { unsubscribe(); queryClient.clear(); }
});

test('a read with no newer list clears the badge locally, without refetching the lists right away', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const queryKey = ['home-matches', 'user-A'];
    queryClient.setQueryData(queryKey, [{ id: 'match-A', unreadMessages: 3 }, { id: 'match-B', unreadMessages: 1 }]);
    let fetches = 0, counts = 0, scheduled = 0;
    const observer = new QueryObserver(queryClient, { queryKey, staleTime: Infinity,
        queryFn: async () => { fetches++; return []; } });
    const unsubscribe = observer.subscribe(() => {});
    try {
        const markRead = loadConversationCallback('src/components/match/MatchChatPanel.tsx', 'onRead', {
            queryClient, refreshCounts() { counts++; }, scheduleMatchesRefresh() { scheduled++; },
            authenticatedFetch: async () => ({ ok: true }), ENDPOINTS: { MARK_MATCH_CHAT_READ: id => id },
        });
        await markRead('MATCH-A'); await flush();
        assert.deepEqual(queryClient.getQueryData(queryKey).map(m => m.unreadMessages), [0, 1]);
        assert.equal(fetches, 0);
        assert.equal(counts, 1);
        // The server check still happens, through the shared one-per-window refetch.
        assert.equal(scheduled, 1);
    } finally { unsubscribe(); queryClient.clear(); }
});

test('a failed read leaves the badge alone', async () => {
    const queryClient = new QueryClient();
    const queryKey = ['home-matches', 'user-A'];
    queryClient.setQueryData(queryKey, [{ id: 'match-A', unreadMessages: 2 }]);
    const markRead = loadConversationCallback('src/components/match/MatchChatPanel.tsx', 'onRead', {
        queryClient, refreshCounts() {}, scheduleMatchesRefresh() {},
        authenticatedFetch: async () => ({ ok: false, status: 503 }), ENDPOINTS: { MARK_MATCH_CHAT_READ: id => id },
    });
    await assert.rejects(markRead('match-A'), /503/);
    assert.equal(queryClient.getQueryData(queryKey)[0].unreadMessages, 2);
    queryClient.clear();
});

test('a new message written in the same millisecond as the read started keeps its badge', async () => {
    const realNow = Date.now;
    Date.now = () => 1_700_000_000_000; // every cache write below lands on one dataUpdatedAt
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const queryKey = ['home-matches', 'user-A'];
    try {
        queryClient.setQueryData(queryKey, [{ id: 'match-A', unreadMessages: 0 }]);
        const read = deferred();
        const markRead = loadConversationCallback('src/components/match/MatchChatPanel.tsx', 'onRead', {
            queryClient, refreshCounts() {}, scheduleMatchesRefresh() {}, authenticatedFetch: () => read.promise,
            ENDPOINTS: { MARK_MATCH_CHAT_READ: id => id },
        });
        const pending = markRead('match-A');
        queryClient.setQueryData(queryKey, [{ id: 'match-A', unreadMessages: 1 }]);
        assert.equal(queryClient.getQueryState(queryKey).dataUpdatedAt, 1_700_000_000_000);
        read.resolve({ ok: true }); await pending;
        assert.equal(queryClient.getQueryData(queryKey)[0].unreadMessages, 1);
    } finally { Date.now = realNow; queryClient.clear(); }
});

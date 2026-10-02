import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';
import { authenticatedFetch, API_BASE_URL, ENDPOINTS, getErrorMessage } from '../lib/api';
import { mergeMessagesById } from '../lib/mergeMessages';
import { startSignalRWithRetry } from '../lib/signalR';
import { useRequestGate } from './useRequestGate';
import { loadChatHistory } from '../lib/chatHistory';
import { createChatOutbox, type OutgoingMessage } from '../lib/chatOutbox';
export type { OutgoingMessage } from '../lib/chatOutbox';

type Message = { id: string; content: string; sentAt: string };
type Options<T> = {
    id?: string; kind: 'match' | 'direct'; active: boolean;
    map: (raw: any) => T;
    onRead: (id: string) => void | Promise<void>;
    onSent?: (message: T) => void;
};

/** Both chat surfaces use the same paging, connection lifecycle and explicit send retry. */
export function useChatConversation<T extends Message>(options: Options<T>) {
    const { id, kind, active } = options;
    const latest = useRef(options);
    latest.current = options;
    const navigation = useNavigation();
    const requests = useRequestGate(`${kind}:${id}`);
    const [messages, setMessages] = useState<T[]>([]);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const loadedRef = useRef(false);
    // Only completed history reads move this cursor. A live message received during
    // reconnect cannot hide the messages missed before rejoining the group.
    const historyAnchor = useRef<T | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const paging = useRef(false);
    const [pageError, setPageError] = useState(false);
    const [pending, setPending] = useState<OutgoingMessage[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
    const [foreground, setForeground] = useState(AppState.currentState === 'active');
    const history = (take = 30, before?: string) => kind === 'match'
        ? ENDPOINTS.GET_MATCH_COMMENTS(id!, take, before)
        : ENDPOINTS.GET_DIRECT_CHAT_MESSAGES(id!, take, before);
    const visible = () => latest.current.id === id && latest.current.active && navigation.isFocused() && AppState.currentState === 'active';
    const read = () => { if (id && visible()) void Promise.resolve(latest.current.onRead(id)).catch(() => {}); };

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
        return () => subscription.remove();
    }, []);

    useEffect(() => {
        setMessages([]); messagesRef.current = [];
        setPending([]);
        loadedRef.current = false; historyAnchor.current = undefined; setLoaded(false); setLoading(true);
        setHasMore(false); setError(null); setPageError(false); paging.current = false;
    }, [id, kind]);

    const refresh = async () => {
        if (!id || !visible()) return;
        const current = requests.begin('history');
        if (!loadedRef.current) setLoading(true);
        setError(null);
        try {
            // Walk back to the previous newest message after a disconnect. A fixed 30/100
            // message backfill leaves an unreachable hole after a long offline period.
            const anchor = historyAnchor.current;
            const result = await loadChatHistory<T>({
                anchor, isCurrent: () => current() && visible(),
                loadPage: async (before) => {
                    const response = await authenticatedFetch(history(30, before));
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const raw = await response.json();
                    return (Array.isArray(raw) ? raw : []).map(latest.current.map);
                },
            });
            if (!result) return;
            historyAnchor.current = result.messages[result.messages.length - 1] ?? anchor;
            if (result.hasMore !== undefined) setHasMore(result.hasMore);
            setMessages((previous) => mergeMessagesById(previous, result.messages));
            loadedRef.current = true; setLoaded(true);
            read();
        } catch (e) {
            if (current() && visible()) setError(getErrorMessage(e));
        } finally {
            if (current()) setLoading(false);
        }
    };
    const refreshRef = useRef(refresh); refreshRef.current = refresh;

    const loadEarlier = async () => {
        if (!id || !visible() || paging.current || !hasMore || !messagesRef.current.length) return;
        const current = requests.begin('page');
        paging.current = true; setLoadingMore(true); setPageError(false);
        try {
            const response = await authenticatedFetch(history(30, messagesRef.current[0].sentAt));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const raw = await response.json();
            if (!current()) return;
            const page = (Array.isArray(raw) ? raw : []).map(latest.current.map) as T[];
            setMessages((previous) => mergeMessagesById(previous, page));
            setHasMore(page.length >= 30);
        } catch {
            if (current()) setPageError(true);
        } finally {
            if (current()) { paging.current = false; setLoadingMore(false); }
        }
    };

    useFocusEffect(useCallback(() => {
        if (!id || !active || !foreground) return;
        let alive = true;
        let readTimer: ReturnType<typeof setTimeout> | undefined;
        void refreshRef.current();
        const connection = new HubConnectionBuilder()
            .withUrl(kind === 'match' ? `${API_BASE_URL}/hubs/chat` : ENDPOINTS.SIGNALR_DM_HUB, {
                accessTokenFactory: async () => (await SecureStore.getItemAsync('access_token')) ?? '',
            })
            .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (context) => Math.min(30_000, 1000 * 2 ** Math.min(context.previousRetryCount, 5)) })
            .configureLogging(LogLevel.Warning).build();
        const join = async () => {
            await connection.invoke(kind === 'match' ? 'JoinMatchGroup' : 'JoinChatGroup', id);
            // Backfill after joining also covers messages sent during the first REST read.
            if (alive) { setConnectionStatus('connected'); void refreshRef.current(); }
        };
        setConnectionStatus('connecting');
        connection.on('ReceiveMessage', (raw) => {
            if (!alive || !visible()) return;
            if (kind === 'direct' && (raw.chatId ?? raw.ChatId)?.toLowerCase() !== id.toLowerCase()) return;
            const message = latest.current.map(raw);
            setMessages((previous) => mergeMessagesById(previous, [message]));
            clearTimeout(readTimer);
            readTimer = setTimeout(read, 300);
        });
        connection.onreconnecting(() => { if (alive) setConnectionStatus('reconnecting'); });
        connection.onreconnected(() => { void join().catch(() => {
            if (alive) { setConnectionStatus('reconnecting'); void connection.stop(); }
        }); });
        const handle = startSignalRWithRetry(connection, {
            onConnected: join,
            onError: () => { if (alive) setConnectionStatus('reconnecting'); },
        });
        return () => {
            alive = false;
            clearTimeout(readTimer);
            requests.clear();
            paging.current = false; setLoadingMore(false);
            connection.off('ReceiveMessage');
            void handle.stop();
        };
    }, [id, kind, active, foreground, requests]));

    const outbox = useMemo(() => createChatOutbox(async (content) => {
            if (!id || !visible()) throw new Error('Chat inactive');
            const response = await authenticatedFetch(kind === 'match' ? ENDPOINTS.POST_MATCH_COMMENT(id) : ENDPOINTS.SEND_DIRECT_MESSAGE(id), {
                method: 'POST', body: JSON.stringify({ content }),
            });
            if (!response.ok) throw new Error(getErrorMessage(await response.text()));
            const raw = await response.json();
            if (latest.current.id !== id) return;
            const message = latest.current.map(raw);
            setMessages((previous) => mergeMessagesById(previous, [message]));
            latest.current.onSent?.(message);
    }, (next) => { if (latest.current.id === id) setPending(next); }), [id, kind]);

    return { messages, loading, loaded, error, hasMore, loadingMore, pageError, loadEarlier, refresh,
        pending, send: outbox.send, retry: (message: OutgoingMessage) => outbox.retry(message.id), connectionStatus };
}

import { useEffect, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export function useChatScroll<T extends { id: string }>(messages: T[], loadingEarlier: boolean) {
    const listRef = useRef<FlatList<T>>(null);
    const atBottom = useRef(true);
    const lastMessage = useRef<string | undefined>(undefined);
    const [hasNewMessages, setHasNewMessages] = useState(false);
    const jumpToLatest = () => {
        atBottom.current = true;
        setHasNewMessages(false);
        listRef.current?.scrollToEnd({ animated: true });
    };
    useEffect(() => {
        const next = messages[messages.length - 1]?.id;
        if (lastMessage.current && next !== lastMessage.current && !atBottom.current) setHasNewMessages(true);
        lastMessage.current = next;
    }, [messages]);
    const onScroll = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
        atBottom.current = e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y < 100;
        if (atBottom.current) setHasNewMessages(false);
    };
    const onContentSizeChange = () => {
        if (atBottom.current && !loadingEarlier) listRef.current?.scrollToEnd({ animated: false });
    };
    return { listRef, onScroll, onContentSizeChange, jumpToLatest, hasNewMessages };
}

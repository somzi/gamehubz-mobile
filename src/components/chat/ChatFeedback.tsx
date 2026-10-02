import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { OutgoingMessage } from '../../hooks/useChatConversation';
import { createDelayedNotice } from '../../lib/delayedNotice';

// Long enough that an ordinary connect or a blip of a reconnect never shows (see delayedNotice).
const CONNECTION_NOTICE_DELAY_MS = 1_200;

export function ChatConnectionStatus({ status }: { status: string }) {
    const { t } = useTranslation('common');
    const [shown, setShown] = useState(false);
    const [notice] = useState(() => createDelayedNotice(setShown, CONNECTION_NOTICE_DELAY_MS));
    useEffect(() => { notice.set(status !== 'connected'); }, [notice, status]);
    useEffect(() => () => notice.dispose(), [notice]);
    return status === 'connected' || !shown ? null : <View className="flex-row items-center justify-center gap-2 py-2">
        <ActivityIndicator size="small" color="#FBBF24" />
        <Text className="text-xs text-amber-200">{t(status === 'connecting' ? 'chatConnecting' : 'chatReconnecting')}</Text>
    </View>;
}

export function ChatOutbox({ messages, onRetry, onDiscard }: {
    messages: OutgoingMessage[];
    onRetry: (message: OutgoingMessage) => unknown;
    /** A failed message can be let go: one the server keeps refusing otherwise stays for good. */
    onDiscard: (message: OutgoingMessage) => unknown;
}) {
    const { t } = useTranslation('common');
    return <>{messages.map((message) => <View key={message.id} className="self-end max-w-[85%] rounded-2xl bg-emerald-500/10 p-3 mb-3">
        <Text className="text-white">{message.content}</Text>
        {message.state === 'sending' ? <Text className="text-xs text-slate-400 mt-1">{t('chatSending')}</Text> : (
            <View className="flex-row items-center gap-5 pt-2">
                <Pressable accessibilityRole="button" onPress={() => onRetry(message)} hitSlop={8} className="py-1">
                    <Text className="text-xs text-amber-200">{t('chatSendFailed')} · {t('retry')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => onDiscard(message)} hitSlop={8} className="py-1">
                    <Text className="text-xs text-slate-400">{t('remove')}</Text>
                </Pressable>
            </View>
        )}
    </View>)}</>;
}

export function ChatNewMessages({ visible, onPress }: { visible: boolean; onPress: () => void }) {
    const { t } = useTranslation('common');
    return visible ? <Pressable accessibilityRole="button" onPress={onPress} className="self-center bg-emerald-500/15 rounded-full px-4 py-2 mb-2">
        <Text className="text-emerald-300 font-bold text-xs">↓ {t('chatNewMessages')}</Text>
    </Pressable> : null;
}

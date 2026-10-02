import type { RootStackParamList } from '../types/navigation';
import type { DirectChat } from '../types/social';

type ChatParams = RootStackParamList['DirectChat'];
type Route = { name: string; params?: object };

/** Resolve an ambiguous notification before dispatch, while a profile-opened chat is still
 * learning its id. Normal opens do not need another request; the screen loads its own metadata. */
export async function prepareDirectChatTarget(
    chatId: string,
    routes: readonly Route[],
    load: (id: string) => Promise<DirectChat | null>,
): Promise<ChatParams> {
    const chats = routes.filter((r) => r.name === 'DirectChat').map((r) => r.params as ChatParams | undefined);
    const known = chats.find((p) => p?.chatId?.toLowerCase() === chatId.toLowerCase());
    if (known) return { ...known, chatId: known.chatId };
    if (!chats.some((p) => !p?.chatId && (p?.otherUserId || p?.header?.otherUserId))) return { chatId };
    try {
        const chat = await load(chatId);
        if (chat?.otherUserId) return {
            chatId,
            otherUserId: chat.otherUserId,
            header: {
                otherUserId: chat.otherUserId,
                otherUsername: chat.otherUsername,
                otherNickname: chat.otherNickname,
                otherAvatarUrl: chat.otherAvatarUrl,
            },
        };
    } catch {
        // The destination owns load errors/retry. Once identity is known, SET_PARAMS also
        // reconciles duplicate routes (including older links with no partner information).
    }
    return { chatId };
}

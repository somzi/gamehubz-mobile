import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

/**
 * Whether a nickname is worth printing next to the username: it exists and actually says
 * something the username doesn't. Older payloads collapse both names into one, and some
 * endpoints fall the nickname back to the username — printing a name twice tells nobody anything.
 * Exported so a caller can reserve the same vertical space on the opposite side of a pairing.
 */
export function hasDistinctNickname(username?: string | null, nickname?: string | null): boolean {
    const name = username?.trim() || '';
    const nick = nickname?.trim() || '';
    return !!nick && nick.toLowerCase() !== name.toLowerCase();
}

interface PlayerIdentityProps {
    /** Account username — the always-visible primary line. */
    username?: string | null;
    /** In-game nickname. Rendered on its own gamepad line, skipped when absent or redundant. */
    nickname?: string | null;
    /** Which side of the pairing this is — only tints the gamepad icon, matching the home card. */
    tone?: 'home' | 'away';
    /** Keep the nickname line's height even without a nickname, so both sides of a pairing stay
     *  the same height when only one player has one. */
    reserveNicknameSpace?: boolean;
    className?: string;
}

/**
 * The two names a player carries — account username and in-game nickname — shown as separate,
 * labelled lines so nobody has to guess which one they are looking at. Mirrors the pairing block
 * on the home screen's match card.
 */
export function PlayerIdentity({
    username,
    nickname,
    tone = 'home',
    reserveNicknameSpace = false,
    className,
}: PlayerIdentityProps) {
    const name = username?.trim() || '';
    const nick = nickname?.trim() || '';
    const showNickname = hasDistinctNickname(name, nick);

    return (
        <View className={cn('items-center w-full', className)}>
            <Text className="text-xs font-bold text-slate-300 text-center px-1" numberOfLines={1}>
                {name}
            </Text>
            {showNickname ? (
                <View className="flex-row items-center justify-center gap-1 mt-1 px-1">
                    <Ionicons
                        name="game-controller"
                        size={12}
                        color={tone === 'away' ? COLORS.info : COLORS.primary}
                    />
                    <Text className="text-[11px] font-semibold text-slate-500 shrink" numberOfLines={1}>
                        {nick}
                    </Text>
                </View>
            ) : reserveNicknameSpace ? (
                <View className="mt-1 px-1" style={{ opacity: 0 }}>
                    <Text className="text-[11px] font-semibold text-slate-500" numberOfLines={1}> </Text>
                </View>
            ) : null}
        </View>
    );
}

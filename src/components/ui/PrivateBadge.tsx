import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

// Orange sits apart from every status colour on the cards (red live, blue upcoming, indigo
// scheduled, emerald completed) and from the amber prize chip, so the lock reads as its own thing.
export const PRIVATE_COLORS = {
    icon: '#FB923C',
    text: '#FDBA74',
    bg: 'rgba(251, 146, 60, 0.12)',
    border: 'rgba(251, 146, 60, 0.30)',
} as const;

interface PrivateBadgeProps {
    /**
     * 'sm' for tight inline spots, 'md' for the tournament screen's hero, 'pill' to sit under the
     * status pill on a tournament card — same height, type and tracking, so the two read as a pair.
     */
    size?: 'sm' | 'md' | 'pill';
}

const SIZES = {
    sm: { paddingHorizontal: 7, paddingVertical: 2, gap: 3, icon: 9, fontSize: 9, letterSpacing: 0.8 },
    md: { paddingHorizontal: 10, paddingVertical: 4, gap: 5, icon: 12, fontSize: 11, letterSpacing: 0.8 },
    pill: { paddingHorizontal: 10, paddingVertical: 5, gap: 4, icon: 10, fontSize: 10, letterSpacing: 1.4 },
} as const;

/** Lock pill marking an invite-only tournament — reachable only by its code or share link. */
export function PrivateBadge({ size = 'sm' }: PrivateBadgeProps) {
    const { t } = useTranslation('common');
    const s = SIZES[size];

    return (
        <View
            className="flex-row items-center rounded-full"
            style={{
                paddingHorizontal: s.paddingHorizontal,
                paddingVertical: s.paddingVertical,
                gap: s.gap,
                backgroundColor: PRIVATE_COLORS.bg,
                borderWidth: 1,
                borderColor: PRIVATE_COLORS.border,
            }}
        >
            <Ionicons name="lock-closed" size={s.icon} color={PRIVATE_COLORS.icon} />
            <Text
                className="font-black uppercase"
                style={{ color: PRIVATE_COLORS.text, fontSize: s.fontSize, letterSpacing: s.letterSpacing }}
                numberOfLines={1}
            >
                {t('app.private')}
            </Text>
        </View>
    );
}

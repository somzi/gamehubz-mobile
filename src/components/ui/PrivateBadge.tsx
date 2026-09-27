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
    /** 'sm' for list cards, 'md' for the tournament screen's hero. */
    size?: 'sm' | 'md';
}

/** Lock pill marking an invite-only tournament — reachable only by its code or share link. */
export function PrivateBadge({ size = 'sm' }: PrivateBadgeProps) {
    const { t } = useTranslation('common');
    const isSmall = size === 'sm';

    return (
        <View
            className="flex-row items-center rounded-full"
            style={{
                paddingHorizontal: isSmall ? 7 : 10,
                paddingVertical: isSmall ? 2 : 4,
                gap: isSmall ? 3 : 5,
                backgroundColor: PRIVATE_COLORS.bg,
                borderWidth: 1,
                borderColor: PRIVATE_COLORS.border,
            }}
        >
            <Ionicons name="lock-closed" size={isSmall ? 9 : 12} color={PRIVATE_COLORS.icon} />
            <Text
                className="font-black uppercase"
                style={{ color: PRIVATE_COLORS.text, fontSize: isSmall ? 9 : 11, letterSpacing: 0.8 }}
                numberOfLines={1}
            >
                {t('app.private')}
            </Text>
        </View>
    );
}

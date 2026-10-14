import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

// Sky blue: apart from the private lock's orange, the exclusive fuchsia and every status colour on
// the cards, so "invite only" reads as its own access rule.
export const INVITE_COLORS = {
    icon: '#38BDF8',
    text: '#7DD3FC',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.30)',
} as const;

interface InviteOnlyBadgeProps {
    /** Same three sizes as PrivateBadge, so the two pills line up wherever both can appear. */
    size?: 'sm' | 'md' | 'pill';
}

const SIZES = {
    sm: { paddingHorizontal: 7, paddingVertical: 2, gap: 3, icon: 9, fontSize: 9, letterSpacing: 0.8 },
    md: { paddingHorizontal: 10, paddingVertical: 4, gap: 5, icon: 12, fontSize: 11, letterSpacing: 0.8 },
    pill: { paddingHorizontal: 10, paddingVertical: 5, gap: 4, icon: 10, fontSize: 10, letterSpacing: 1.4 },
} as const;

/** Envelope pill marking an invite-only tournament — players get in only by accepting an invite. */
export function InviteOnlyBadge({ size = 'sm' }: InviteOnlyBadgeProps) {
    const { t } = useTranslation('common');
    const s = SIZES[size];

    return (
        <View
            className="flex-row items-center rounded-full"
            style={{
                paddingHorizontal: s.paddingHorizontal,
                paddingVertical: s.paddingVertical,
                gap: s.gap,
                backgroundColor: INVITE_COLORS.bg,
                borderWidth: 1,
                borderColor: INVITE_COLORS.border,
            }}
        >
            <Ionicons name="mail" size={s.icon} color={INVITE_COLORS.icon} />
            <Text
                className="font-black uppercase"
                style={{ color: INVITE_COLORS.text, fontSize: s.fontSize, letterSpacing: s.letterSpacing }}
                numberOfLines={1}
            >
                {t('app.inviteOnly')}
            </Text>
        </View>
    );
}

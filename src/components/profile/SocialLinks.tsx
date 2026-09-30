import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text, Pressable, Linking, Alert, Share } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';
import { KickIcon } from '../icons/KickIcon';

interface SocialLink {
    platform: "discord" | "tiktok" | "instagram" | "twitter" | "youtube" | "facebook" | "telegram" | "twitch" | "kick";
    username: string;
    url?: string;
}

interface SocialLinksProps {
    links: SocialLink[];
    /** 'md' — 40px buttons (hub profile); 'sm' — 32px, for a row inside the player header. */
    size?: 'md' | 'sm';
    className?: string;
}

// Each platform keeps its own colour on the glyph; the button around it is the same quiet glass
// for all of them, so a row of five links doesn't turn into five coloured badges.
const platformIcon: Record<SocialLink['platform'], (size: number) => React.ReactNode> = {
    discord: (s) => <Ionicons name="logo-discord" size={s} color="#5865F2" />,
    tiktok: (s) => <Ionicons name="logo-tiktok" size={s} color={COLORS.foreground} />,
    instagram: (s) => <FontAwesome name="instagram" size={s} color="#E4405F" />,
    twitter: (s) => <Text style={{ fontSize: s - 2, fontWeight: '900', color: COLORS.foreground }}>𝕏</Text>,
    youtube: (s) => <FontAwesome name="youtube-play" size={s} color="#FF0000" />,
    facebook: (s) => <FontAwesome name="facebook" size={s} color="#1877F2" />,
    telegram: (s) => <Ionicons name="paper-plane" size={s - 2} color="#0088cc" />,
    twitch: (s) => <Ionicons name="logo-twitch" size={s} color="#9146FF" />,
    kick: (s) => <KickIcon size={s} color="#53fc18" />,
};

export function SocialLinks({ links, size = 'md', className }: SocialLinksProps) {
    const { t } = useTranslation('profile');
    if (!links || links.length === 0) return null;

    const handlePress = (link: SocialLink) => {
        if (link.platform === 'discord') {
            if (link.url && link.url !== '#') {
                // A discord.gg address is already Discord's own universal link: iOS and Android hand
                // it to the app when it is installed and fall through to the browser when it is not,
                // so there is nothing useful to attempt ahead of it. The previous "fallback" retried
                // the identical URL and then swallowed the failure into console.error — which App.tsx
                // replaces with a no-op in release builds, so a link that could not open did nothing
                // and said nothing. Tell the user instead.
                Linking.openURL(link.url).catch(() =>
                    Alert.alert(t('socialModal.linkFailedTitle'), t('socialModal.linkFailedBody'))
                );
            } else {
                // Plain username — share/copy
                Share.share({ message: link.username, title: t('socialModal.discordUsername') });
            }
            return;
        }
        if (link.url && link.url !== '#') {
            // Same reasoning as the Discord branch: a silenced console.error is not a failure path.
            Linking.openURL(link.url).catch(() =>
                Alert.alert(t('socialModal.linkFailedTitle'), t('socialModal.linkFailedBody'))
            );
        }
    };

    const small = size === 'sm';

    return (
        <View className={cn('flex-row flex-wrap', small ? 'gap-2' : 'gap-3', className)}>
            {links.map((link) => {
                const renderIcon = platformIcon[link.platform];
                if (!renderIcon) return null;

                return (
                    <Pressable
                        key={link.platform}
                        onPress={() => handlePress(link)}
                        accessibilityRole="link"
                        accessibilityLabel={link.platform}
                        hitSlop={small ? 4 : 0}
                        className={cn(
                            'items-center justify-center rounded-full bg-white/[0.05] border border-white/10 active:opacity-70',
                            small ? 'w-8 h-8' : 'w-10 h-10'
                        )}
                    >
                        {renderIcon(small ? 15 : 20)}
                    </Pressable>
                );
            })}
        </View>
    );
}

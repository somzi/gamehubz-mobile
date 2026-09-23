import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { SocialLinks } from './SocialLinks';
import { getRegionName } from '../../lib/countries';
import { RegionType } from '../../types/auth';
import { COLORS } from '../../lib/theme';
import { cn } from '../../lib/utils';

interface ProfileHeaderCardProps {
    avatarUrl?: string | null;
    /** Account username — the one bold line of the block. */
    username: string;
    /** In-game nickname. Gets its own gamepad line whenever the player has one, even when it matches
     *  the username — same rule as PlayerIdentity: it is the name opponents look for in-game. */
    nickname?: string | null;
    countryFlag?: string | null;
    countryName?: string | null;
    region?: RegionType | null;
    socialLinks: React.ComponentProps<typeof SocialLinks>['links'];
    className?: string;
}

// ALL / unset don't narrow anything down — they only stand in when there's no country to show.
const isSpecificRegion = (region?: RegionType | null) =>
    !!region && region >= RegionType.NA && region <= RegionType.OCEANIA;

/**
 * Identity block at the top of a profile, shared by the own-profile tab and PlayerProfileScreen.
 * One bold name, then two quiet lines in the same style — in-game nickname, and country + region
 * folded into a single "Serbia · Europe" line.
 */
export function ProfileHeaderCard({
    avatarUrl,
    username,
    nickname,
    countryFlag,
    countryName,
    region,
    socialLinks,
    className,
}: ProfileHeaderCardProps) {
    const nick = nickname?.trim() || '';
    const flag = countryFlag?.trim() || '';
    const country = countryName?.trim() || '';
    const location = country
        ? (isSpecificRegion(region) ? `${country} · ${getRegionName(region)}` : country)
        : getRegionName(region);

    return (
        <View className={cn('bg-card rounded-3xl p-5', className)}>
            <View className="flex-row items-center" style={{ gap: 16 }}>
                <View style={AVATAR_RING}>
                    <PlayerAvatar src={avatarUrl || undefined} name={username} size="xl" className="border-0" />
                </View>
                <View className="flex-1">
                    <Text
                        className="text-2xl font-black text-white tracking-tight"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                    >
                        {username}
                    </Text>
                    {!!nick && (
                        <View className="flex-row items-center mt-1">
                            <View className="w-[18px] items-center">
                                {/* 16 matches the footprint of the 13px flag emoji on the line below. */}
                                <Ionicons name="game-controller" size={16} color={COLORS.primary} />
                            </View>
                            <Text className="flex-1 text-[13px] font-medium text-slate-400 ml-1.5" numberOfLines={1}>
                                {nick}
                            </Text>
                        </View>
                    )}
                    <View className="flex-row items-center mt-1">
                        <View className="w-[18px] items-center">
                            {flag ? (
                                <Text className="text-[13px]">{flag}</Text>
                            ) : (
                                <Ionicons name="globe-outline" size={16} color={COLORS.slate500} />
                            )}
                        </View>
                        <Text className="flex-1 text-[13px] font-medium text-slate-400 ml-1.5" numberOfLines={1}>
                            {location}
                        </Text>
                    </View>
                </View>
            </View>
            {socialLinks.length > 0 && (
                <View className="mt-4 pt-4 border-t border-white/5">
                    <SocialLinks links={socialLinks} className="justify-center" />
                </View>
            )}
        </View>
    );
}

const AVATAR_RING = {
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: 'rgba(16,185,129,0.5)',
    padding: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
} as const;

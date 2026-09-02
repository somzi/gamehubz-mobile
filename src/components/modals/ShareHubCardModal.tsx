import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { shareHub } from '../../lib/share';
import { getOptimizedCloudinaryUrl } from '../../lib/image';
import {
    ShareCardShell,
    PosterRoot,
    CardFrame,
    EmblemRing,
    SideStat,
    StatDivider,
    StatRing,
    StatPill,
    PosterWordmark,
} from './ShareCardShell';
import i18n from '../../i18n';

// Shareable hub card — same premium poster style as the player card but in the
// hub's emerald accent: logo emblem, name + verified badge, followers ring
// flanked by tournaments / access, and an owner pill.

export interface HubCardStats {
    followers: number;
    tournaments: number;
}

interface ShareHubCardModalProps {
    visible: boolean;
    onClose: () => void;
    hubId: string;
    name: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
    isPublic?: boolean;
    ownerName?: string | null;
    stats: HubCardStats;
}

function HubCardPoster({ name, avatarUrl, isVerified, isPublic, ownerName, stats, width }: {
    name: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
    isPublic?: boolean;
    ownerName?: string | null;
    stats: HubCardStats;
    width: number;
}) {
    const { t } = useTranslation('common');
    const { t: tHub } = useTranslation('hub');
    const initial = (name || 'H').trim().charAt(0).toUpperCase() || 'H';
    // ~100dp box captured at ~3x pixel ratio → ask Cloudinary for ~300px so the PNG stays sharp.
    const optimizedAvatar = avatarUrl ? getOptimizedCloudinaryUrl(avatarUrl, 300) : '';

    return (
        <PosterRoot width={width} glowA="#34D399" glowB="#10B981">
            <CardFrame
                hairlineColors={['rgba(52,211,153,0.55)', 'rgba(148,163,184,0.14)', 'rgba(16,185,129,0.5)']}
                bannerColors={['#065F46', '#059669', '#0F766E']}
            >
                <EmblemRing colors={['#34D399', '#2DD4ED']}>
                    {optimizedAvatar ? (
                        <Image
                            source={{ uri: optimizedAvatar }}
                            style={{ width: '100%', height: '100%', borderRadius: 25, backgroundColor: '#1A1D2E' }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                    ) : (
                        <LinearGradient colors={['#34D399', '#10B981']} style={{ flex: 1, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 44, fontWeight: '800', color: '#052E22' }}>{initial}</Text>
                        </LinearGradient>
                    )}
                </EmblemRing>

                <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 }}>
                    <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.55}
                        style={{ fontSize: 28, fontWeight: '800', color: '#F8FAFC', textAlign: 'center', letterSpacing: -0.5, flexShrink: 1 }}
                    >
                        {name}
                    </Text>
                    {isVerified && (
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="checkmark" size={14} color="#fff" />
                        </View>
                    )}
                </View>

                {/* Tournaments | followers ring | access */}
                <View style={{ marginTop: 26, flexDirection: 'row', alignItems: 'center' }}>
                    <SideStat icon="trophy" iconColor="rgba(251,191,36,0.8)" value={stats.tournaments} label={t('share.statTournaments')} valueColor="#FBBF24" />
                    <StatDivider />
                    <StatRing value={stats.followers.toLocaleString(i18n.language)} label={t('share.statMembers')} ringColors={['#34D399', '#2DD4ED']} />
                    <StatDivider />
                    <SideStat
                        icon={isPublic ? 'globe-outline' : 'lock-closed'}
                        iconColor="rgba(52,211,153,0.75)"
                        value={isPublic ? tHub('profile.public') : tHub('profile.private')}
                        label={t('share.statAccess')}
                        valueSize={18}
                    />
                </View>

                {!!ownerName && (
                    <View style={{ marginTop: 24, flexDirection: 'row', gap: 10 }}>
                        <StatPill
                            value={ownerName}
                            label={t('app.hubOwner')}
                            background="rgba(52,211,153,0.08)"
                            border="rgba(52,211,153,0.22)"
                            valueColor="#34D399"
                            labelColor="rgba(52,211,153,0.7)"
                            valueSize={16}
                        />
                    </View>
                )}
            </CardFrame>

            <PosterWordmark />
        </PosterRoot>
    );
}

export function ShareHubCardModal({ visible, onClose, hubId, name, avatarUrl, isVerified, isPublic, ownerName, stats }: ShareHubCardModalProps) {
    const { t } = useTranslation('common');
    return (
        <ShareCardShell
            visible={visible}
            onClose={onClose}
            headerTitle={t('app.hubCard')}
            dialogTitle={t('app.hubDialogTitle', { name })}
            fileName={name || 'hub'}
            onShareLink={() => shareHub(hubId, name)}
            renderPoster={(width) => (
                <HubCardPoster
                    name={name}
                    avatarUrl={avatarUrl}
                    isVerified={isVerified}
                    isPublic={isPublic}
                    ownerName={ownerName}
                    stats={stats}
                    width={width}
                />
            )}
        />
    );
}

import React from 'react';
import { Pressable, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

interface RefreshFailedBannerProps {
    onRetry: () => void;
    retrying?: boolean;
    className?: string;
}

/**
 * A refresh failed but the screen still holds what it loaded before: one line above the content
 * instead of swapping the whole page for an error screen. Tapping it tries again.
 */
export function RefreshFailedBanner({ onRetry, retrying, className }: RefreshFailedBannerProps) {
    const { t } = useTranslation('common');
    return (
        <Pressable
            onPress={onRetry}
            disabled={retrying}
            accessibilityRole="button"
            accessibilityLabel={`${t('refreshFailed')}. ${t('retry')}`}
            className={cn('flex-row items-center gap-2.5 px-4 py-3 rounded-2xl active:opacity-70', className)}
            style={{ backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)' }}
        >
            <Ionicons name="cloud-offline-outline" size={17} color={COLORS.warning} />
            <Text className="flex-1 text-[13px] font-semibold text-amber-100" numberOfLines={1}>
                {t('refreshFailed')}
            </Text>
            {retrying ? (
                <ActivityIndicator size="small" color={COLORS.warning} />
            ) : (
                <Text className="text-[13px] font-black" style={{ color: COLORS.warning }}>
                    {t('retry')}
                </Text>
            )}
        </Pressable>
    );
}

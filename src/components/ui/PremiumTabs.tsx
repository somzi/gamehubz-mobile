import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { cn } from '../../lib/utils';

export interface PremiumTabItem {
    value: string;
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    badge?: string | number;
}

interface PremiumTabsProps {
    tabs: PremiumTabItem[];
    activeTab: string;
    onTabChange: (value: string) => void;
    accentColor?: string;
    accentColorActive?: string;
    className?: string;
}

const DEFAULT_ACCENT = '#10B981';
const DEFAULT_ACCENT_ACTIVE = '#34D399';

function withAlpha(color: string, alpha: number): string {
    if (color.startsWith('rgba') || color.startsWith('rgb(')) return color;
    const c = color.replace('#', '');
    const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function PremiumTabs({
    tabs,
    activeTab,
    onTabChange,
    accentColor = DEFAULT_ACCENT,
    accentColorActive = DEFAULT_ACCENT_ACTIVE,
    className,
}: PremiumTabsProps) {
    return (
        <View
            className={cn('flex-row rounded-2xl p-1', className)}
            style={{
                backgroundColor: '#131B2E',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.05)',
                gap: 4,
            }}
        >
            {tabs.map((tab) => (
                <PremiumTabButton
                    key={tab.value}
                    tab={tab}
                    active={activeTab === tab.value}
                    onPress={() => onTabChange(tab.value)}
                    accentColor={accentColor}
                    accentColorActive={accentColorActive}
                />
            ))}
        </View>
    );
}

interface PremiumTabButtonProps {
    tab: PremiumTabItem;
    active: boolean;
    onPress: () => void;
    accentColor: string;
    accentColorActive: string;
}

function PremiumTabButton({
    tab,
    active,
    onPress,
    accentColor,
    accentColorActive,
}: PremiumTabButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            className="flex-1 flex-row items-center justify-center py-2.5 px-1 rounded-xl overflow-hidden"
            style={({ pressed }) =>
                active
                    ? {
                        opacity: pressed ? 0.85 : 1,
                        shadowColor: accentColor,
                        shadowOpacity: 0.35,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        gap: 5,
                    }
                    : { opacity: pressed ? 0.7 : 1, gap: 5 }
            }
        >
            {active && (
                <LinearGradient
                    colors={[withAlpha(accentColor, 0.28), withAlpha(accentColor, 0.1)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
            )}
            {tab.icon && (
                <Ionicons
                    name={tab.icon}
                    size={12}
                    color={active ? accentColorActive : '#475569'}
                />
            )}
            <Text
                className="font-black uppercase"
                style={{
                    color: active ? accentColorActive : '#64748B',
                    fontSize: 11,
                    letterSpacing: 0.6,
                    flexShrink: 1,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                allowFontScaling={false}
            >
                {tab.label}
            </Text>
            {tab.badge !== undefined && (
                <View
                    className="min-w-[18px] h-[18px] items-center justify-center rounded-full px-1"
                    style={{
                        backgroundColor: active
                            ? withAlpha(accentColor, 0.3)
                            : 'rgba(255, 255, 255, 0.06)',
                    }}
                >
                    <Text
                        className="font-black"
                        style={{
                            fontSize: 9,
                            color: active ? accentColorActive : '#64748B',
                        }}
                    >
                        {tab.badge}
                    </Text>
                </View>
            )}
        </Pressable>
    );
}

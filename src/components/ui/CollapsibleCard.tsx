import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

function withAlpha(hex: string, alpha: number): string {
    const c = hex.replace('#', '');
    const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface CollapsibleCardProps {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

export function CollapsibleCard({
    icon,
    iconColor,
    title,
    isOpen,
    onToggle,
    children,
}: CollapsibleCardProps) {
    return (
        <View
            className="rounded-2xl overflow-hidden mb-3"
            style={{
                backgroundColor: '#131B2E',
                shadowColor: '#000000',
                shadowOpacity: 0.50,
                shadowRadius: 1,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
            }}
        >
            <LinearGradient
                colors={[withAlpha(iconColor, 0.04), 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.4, y: 0 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            <View
                pointerEvents="none"
                className="absolute inset-0 rounded-2xl"
                style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}
            />

            <Pressable
                onPress={onToggle}
                className="flex-row items-center justify-between p-4"
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
                <View className="flex-row items-center gap-2.5 flex-1">
                    <View
                        className="w-9 h-9 rounded-xl items-center justify-center"
                        style={{
                            backgroundColor: withAlpha(iconColor, 0.14),
                            borderWidth: 1,
                            borderColor: withAlpha(iconColor, 0.28),
                        }}
                    >
                        <Ionicons name={icon} size={17} color={iconColor} />
                    </View>
                    <Text
                        className="text-[12px] font-black text-white uppercase tracking-[2px]"
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                </View>
                <View
                    className="w-8 h-8 rounded-full items-center justify-center"
                    style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.07)',
                    }}
                >
                    <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color="#94A3B8"
                    />
                </View>
            </Pressable>

            {isOpen && (
                <View className="px-3 pb-3">
                    <View
                        style={{
                            height: 1,
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            marginHorizontal: 4,
                            marginBottom: 12,
                        }}
                    />
                    {children}
                </View>
            )}
        </View>
    );
}

interface InfoRowProps {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    label: string;
    value: React.ReactNode;
    onPress?: () => void;
}

export function InfoRow({ icon, iconColor, label, value, onPress }: InfoRowProps) {
    const content = (
        <View
            className="flex-row items-center justify-between"
            style={{
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 6,
            }}
        >
            <View className="flex-row items-center gap-3 flex-1 mr-2">
                <View
                    className="w-8 h-8 rounded-xl items-center justify-center"
                    style={{
                        backgroundColor: withAlpha(iconColor, 0.14),
                        borderWidth: 1,
                        borderColor: withAlpha(iconColor, 0.25),
                    }}
                >
                    <Ionicons name={icon} size={15} color={iconColor} />
                </View>
                <Text className="text-[13px] text-slate-300 font-bold">{label}</Text>
            </View>
            <View className="flex-row items-center" style={{ gap: 6, maxWidth: '64%' }}>
                {typeof value === 'string' ? (
                    <Text
                        className="text-[14px] font-black text-white text-right"
                        numberOfLines={2}
                    >
                        {value}
                    </Text>
                ) : (
                    value
                )}
                {onPress && <Ionicons name="chevron-forward" size={14} color="#475569" />}
            </View>
        </View>
    );

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
                {content}
            </Pressable>
        );
    }
    return content;
}

interface QuoteBlockProps {
    accentColor: string;
    children: React.ReactNode;
}

export function QuoteBlock({ accentColor, children }: QuoteBlockProps) {
    return (
        <View
            className="flex-row"
            style={{
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 14,
                padding: 14,
            }}
        >
            <View
                style={{
                    width: 3,
                    backgroundColor: accentColor,
                    borderRadius: 2,
                    marginRight: 12,
                    opacity: 0.7,
                }}
            />
            <Text className="text-slate-300 text-[14px] leading-[22px] flex-1">{children}</Text>
        </View>
    );
}

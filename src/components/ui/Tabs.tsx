import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { cn } from '../../lib/utils';

interface TabsProps {
    tabs: { label: string; value: string }[];
    activeTab: string;
    onTabChange: (value: string) => void;
    variant?: 'default' | 'pills';
}

export function Tabs({ tabs, activeTab, onTabChange, variant = 'default' }: TabsProps) {
    if (variant === 'pills') {
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-1 px-1">
                    {tabs.map((tab) => (
                        <Pressable
                            key={tab.value}
                            onPress={() => {
                                console.log(`[Tabs] Switching to: ${tab.value}`);
                                onTabChange(tab.value);
                            }}
                            className={cn(
                                "px-4 py-2 rounded-full border",
                                activeTab === tab.value
                                    ? "bg-[#4F46E5] border-[#4F46E5]"
                                    : "bg-transparent border-white/10"
                            )}
                        >
                            <Text className={cn(
                                "text-sm font-bold tracking-wide",
                                activeTab === tab.value ? "text-white" : "text-slate-400"
                            )}>
                                {tab.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </ScrollView>
        );
    }

    return (
        <View className="bg-[#131B2E] p-1 rounded-2xl flex-row border border-white/5">
            {tabs.map((tab) => (
                <Pressable
                    key={tab.value}
                    onPress={() => {
                        console.log(`[Tabs] Switching to: ${tab.value}`);
                        onTabChange(tab.value);
                    }}
                    className={cn(
                        "flex-1 py-3 px-1 rounded-xl items-center justify-center",
                        activeTab === tab.value ? "bg-[#4F46E5]" : ""
                    )}
                >
                    <Text className={cn(
                        "text-xs font-bold tracking-wide",
                        activeTab === tab.value ? "text-white" : "text-zinc-500"
                    )}>
                        {tab.label}
                    </Text>
                </Pressable>
            ))}
        </View>
    );
}

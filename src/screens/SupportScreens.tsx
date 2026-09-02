import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Linking } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../components/layout/PageHeader';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { SectionLabel } from '../components/ui/SectionLabel';
import { PressableScale } from '../components/ui/PressableScale';
import { COLORS } from '../lib/theme';

const DISCORD_BLURPLE = '#5865F2';

const FAQ_KEYS = [
    { q: 'q1', a: 'a1' },
    { q: 'q2', a: 'a2' },
    { q: 'q3', a: 'a3' },
    { q: 'q4', a: 'a4' },
    { q: 'q5', a: 'a5' },
    { q: 'q6', a: 'a6' },
];

function FaqItem({ questionKey, answerKey }: { questionKey: string; answerKey: string }) {
    const { t } = useTranslation('support');
    const [open, setOpen] = useState(false);
    const question = t(questionKey);
    const answer = t(answerKey);

    // Expand/collapse animates via a Reanimated layout transition on the wrapper —
    // LayoutAnimation ghosts text on the new architecture.
    return (
        <Animated.View layout={LinearTransition.duration(200)} style={{ borderRadius: 16, overflow: 'hidden' }}>
            <PressableScale
                onPress={() => setOpen((prev) => !prev)}
                pressedScale={0.98}
                className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4"
            >
                <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-white font-bold text-sm flex-1 leading-5">{question}</Text>
                    <View className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.06] items-center justify-center">
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.slate400} />
                    </View>
                </View>
                {open && (
                    <Animated.View entering={FadeIn.duration(150)}>
                        <Text className="text-slate-400 text-[13px] leading-5 mt-3">{answer}</Text>
                    </Animated.View>
                )}
            </PressableScale>
        </Animated.View>
    );
}

export function HelpCenterScreen() {
    const { t } = useTranslation('support');
    const { t: tAuth } = useTranslation('auth');
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title={t('helpCenter')} showBack />
            <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <View className="items-center py-6">
                    <View className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center mb-4">
                        <Ionicons name="help-circle-outline" size={30} color={COLORS.primary} />
                    </View>
                    <Text className="text-2xl font-black text-white text-center tracking-tight">{t('howCanWeHelp')}</Text>
                    <Text className="text-slate-400 text-[13px] text-center mt-2 px-8 leading-5">
                        {t('findAnswers')}
                    </Text>
                </View>

                <SectionLabel icon="chatbubbles" title={t('faqTitle')} />
                <View className="gap-3">
                    {FAQ_KEYS.map((faq) => (
                        <FaqItem key={faq.q} questionKey={faq.q} answerKey={faq.a} />
                    ))}
                </View>

                <Animated.View layout={LinearTransition.duration(200)} style={{ marginTop: 32 }}>
                    <SectionLabel icon="mail" title={t('stillNeedHelp')} color={COLORS.info} />
                    <TouchableOpacity
                        onPress={() => Linking.openURL('mailto:support@codespheresolutions.dev')}
                        className="bg-card p-4 rounded-2xl border border-white/[0.06] flex-row items-center gap-3 active:opacity-70"
                    >
                        <View className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 items-center justify-center">
                            <Ionicons name="mail" size={18} color={COLORS.info} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-bold text-sm">{t('emailSupport')}</Text>
                            <Text className="text-slate-500 text-xs mt-0.5">support@codespheresolutions.dev</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </SafeAreaView>
    );
}

export function AboutUsScreen() {
    const { t } = useTranslation('support');
    const { t: tAuth } = useTranslation('auth');
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title={t('aboutUs')} showBack />
            <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <View className="items-center py-6">
                    <View className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center mb-4">
                        <Ionicons name="information-circle-outline" size={30} color={COLORS.primary} />
                    </View>
                    <Text className="text-3xl font-black text-white tracking-tight">{tAuth('brand')}</Text>
                </View>

                <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6">
                    <Text className="text-slate-300 leading-7 text-center text-base">
                        {t('aboutLine1')}
                        {t('aboutLine2')}
                        from the ground up.
                    </Text>
                </View>

                <View className="mt-12 items-center">
                    <Text className="text-slate-500 text-xs tracking-widest uppercase w-full text-center" numberOfLines={1}>Version {Constants.expoConfig?.version || '1.0.0'}</Text>
                    <Text className="text-slate-500 text-xs mt-2">{t('copyright')}</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

export function ContactUsScreen() {
    const { t } = useTranslation('support');
    const { t: tAuth } = useTranslation('auth');
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title={t('contactUs')} showBack />
            <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <View className="items-center py-6 mb-2">
                    <View className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center mb-4">
                        <Ionicons name="mail-outline" size={30} color={COLORS.primary} />
                    </View>
                    <Text className="text-2xl font-black text-white tracking-tight">{t('getInTouch')}</Text>
                    <Text className="text-slate-400 text-[13px] text-center mt-2 px-8 leading-5">
                        {t('contactLine')}
                    </Text>
                </View>

                <View className="gap-3">
                    <TouchableOpacity
                        onPress={() => Linking.openURL('mailto:support@codespheresolutions.dev')}
                        className="bg-card p-4 rounded-2xl border border-white/[0.06] flex-row items-center gap-3 active:opacity-70"
                    >
                        <View className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 items-center justify-center">
                            <Ionicons name="mail" size={18} color={COLORS.primary} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-bold text-sm">{t('emailSupport')}</Text>
                            <Text className="text-slate-500 text-xs mt-0.5">support@codespheresolutions.dev</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => Linking.openURL('https://discord.gg/CUFWXhfRPb')}
                        className="bg-card p-4 rounded-2xl border border-white/[0.06] flex-row items-center gap-3 active:opacity-70"
                    >
                        <View
                            className="w-10 h-10 rounded-xl items-center justify-center border"
                            style={{ backgroundColor: 'rgba(88,101,242,0.1)', borderColor: 'rgba(88,101,242,0.2)' }}
                        >
                            <Ionicons name="logo-discord" size={18} color={DISCORD_BLURPLE} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-bold text-sm">{t('joinDiscord')}</Text>
                            <Text className="text-slate-500 text-xs mt-0.5">discord.gg/CUFWXhfRPb</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

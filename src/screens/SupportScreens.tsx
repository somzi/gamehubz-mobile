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

const FAQS: { question: string; answer: string }[] = [
    {
        question: 'How do I join a tournament?',
        answer: 'Navigate to the Hubs screen, find a Hub you like in the Discovery section, and join it. Once you are a member, you can find active competitions under the Upcoming Tournaments section.',
    },
    {
        question: 'How do I report a match result?',
        answer: 'You can report your score from your Home page by clicking on the active match, or by going to the tournament Bracket tab, clicking on your match, and submitting the result.',
    },
    {
        question: 'How can I create my own Hub?',
        answer: 'Go to the Hubs section and click the "Create" button. Follow the instructions to set up your community and start building your player base.',
    },
    {
        question: 'How do I find new Hubs to join?',
        answer: 'Use the Discovery tab within the Hubs section. This allows you to explore and search for different gaming communities that you might want to join.',
    },
    {
        question: 'How do I create a tournament?',
        answer: 'You must be the owner of a Hub to create tournaments. If you own a Hub, go to its settings menu where you will find the option to create and configure a new tournament.',
    },
    {
        question: 'How can I change my password?',
        answer: 'Navigate to your Profile screen. Under the account settings, you will find the option to securely update your password.',
    },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
    const [open, setOpen] = useState(false);

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
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title="Help Center" showBack />
            <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <View className="items-center py-6">
                    <View className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center mb-4">
                        <Ionicons name="help-circle-outline" size={30} color={COLORS.primary} />
                    </View>
                    <Text className="text-2xl font-black text-white text-center tracking-tight">How can we help?</Text>
                    <Text className="text-slate-400 text-[13px] text-center mt-2 px-8 leading-5">
                        Find answers to the most common questions
                    </Text>
                </View>

                <SectionLabel icon="chatbubbles" title="Frequently Asked Questions" />
                <View className="gap-3">
                    {FAQS.map((faq) => (
                        <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
                    ))}
                </View>

                <Animated.View layout={LinearTransition.duration(200)} style={{ marginTop: 32 }}>
                    <SectionLabel icon="mail" title="Still need help?" color={COLORS.info} />
                    <TouchableOpacity
                        onPress={() => Linking.openURL('mailto:support@codespheresolutions.dev')}
                        className="bg-card p-4 rounded-2xl border border-white/[0.06] flex-row items-center gap-3 active:opacity-70"
                    >
                        <View className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 items-center justify-center">
                            <Ionicons name="mail" size={18} color={COLORS.info} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-bold text-sm">Email Support</Text>
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
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title="About Us" showBack />
            <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <View className="items-center py-6">
                    <View className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center mb-4">
                        <Ionicons name="information-circle-outline" size={30} color={COLORS.primary} />
                    </View>
                    <Text className="text-3xl font-black text-white tracking-tight">GameHubz</Text>
                </View>

                <View className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6">
                    <Text className="text-slate-300 leading-7 text-center text-base">
                        GameHubz is the ultimate platform for tournament organizers and competitive gamers.
                        We provide the professional tools you need to create, manage, and scale your gaming communities
                        from the ground up.
                    </Text>
                </View>

                <View className="mt-12 items-center">
                    <Text className="text-slate-500 text-xs tracking-widest uppercase">Version {Constants.expoConfig?.version || '1.0.0'}</Text>
                    <Text className="text-slate-500 text-xs mt-2">© 2026 CodeSphere Solutions</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

export function ContactUsScreen() {
    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title="Contact Us" showBack />
            <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <View className="items-center py-6 mb-2">
                    <View className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center mb-4">
                        <Ionicons name="mail-outline" size={30} color={COLORS.primary} />
                    </View>
                    <Text className="text-2xl font-black text-white tracking-tight">Get in Touch</Text>
                    <Text className="text-slate-400 text-[13px] text-center mt-2 px-8 leading-5">
                        Our team is here to support your competitive journey.
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
                            <Text className="text-white font-bold text-sm">Email Support</Text>
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
                            <Text className="text-white font-bold text-sm">Join our Discord</Text>
                            <Text className="text-slate-500 text-xs mt-0.5">discord.gg/CUFWXhfRPb</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

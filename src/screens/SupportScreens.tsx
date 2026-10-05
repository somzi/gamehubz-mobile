import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, StyleSheet } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { PageHeader } from '../components/layout/PageHeader';
import { HeroFrame, HeroEmblem } from '../components/ui/HeroCard';
import { Panel } from '../components/ui/Panel';
import { RaisedCard } from '../components/ui/RaisedCard';
import { PressableScale } from '../components/ui/PressableScale';
import { SettingsGroup, SETTINGS_EMBLEM, SETTINGS_EMBLEM_IMAGE, SETTINGS_EMBLEM_IMAGE_RADIUS } from '../components/ui/SettingsBlocks';
import { getAppReleaseLabel } from '../lib/appRelease';
import { hapticSelection, hapticSuccess } from '../lib/haptics';
import { COLORS } from '../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type GradientStops = readonly [string, string, ...string[]];

const SUPPORT_EMAIL = 'support@codespheresolutions.dev';
const DISCORD_URL = 'https://discord.gg/CUFWXhfRPb';
const DISCORD_HANDLE = 'discord.gg/CUFWXhfRPb';
const DISCORD_BLURPLE = '#5865F2';
const CYAN = '#22D3EE';

/**
 * Each page in the colour of its row in Settings — help cyan, contact green, about the logo's neon
 * emerald — so the menu row and the page it opens read as one thing.
 */
const THEMES = {
    help: {
        hairline: ['rgba(34,211,238,0.55)', 'rgba(148,163,184,0.14)', 'rgba(59,130,246,0.5)'],
        band: ['#155E75', '#0E7490', '#1E40AF'],
        ring: ['#22D3EE', '#3B82F6'],
    },
    contact: {
        hairline: ['rgba(52,211,153,0.55)', 'rgba(148,163,184,0.14)', 'rgba(88,101,242,0.45)'],
        band: ['#065F46', '#059669', '#3730A3'],
        ring: ['#34D399', '#818CF8'],
    },
    about: {
        hairline: ['rgba(52,211,153,0.6)', 'rgba(148,163,184,0.14)', 'rgba(34,211,238,0.45)'],
        band: ['#064E3B', '#047857', '#0E7490'],
        ring: ['#34D399', '#22D3EE'],
    },
} satisfies Record<string, { hairline: GradientStops; band: GradientStops; ring: GradientStops }>;

/** The help topics, each with the colour and icon of the part of the app it is about. */
const FAQ: { q: string; a: string; icon: IconName; color: string }[] = [
    { q: 'q1', a: 'a1', icon: 'enter', color: '#A78BFA' },
    { q: 'q2', a: 'a2', icon: 'checkmark-done', color: COLORS.primaryBright },
    { q: 'q3', a: 'a3', icon: 'planet', color: '#2DD4BF' },
    { q: 'q4', a: 'a4', icon: 'compass', color: CYAN },
    { q: 'q5', a: 'a5', icon: 'trophy', color: '#FBBF24' },
    { q: 'q6', a: 'a6', icon: 'key', color: COLORS.slate400 },
];

// ─── Building blocks ────────────────────────────────────────────────────────

/** The card at the top of each page: a slim band of the page's gradient, the emblem in its ring, the title. */
function SupportHero({
    theme,
    emblem,
    title,
    subtitle,
    subtitleSelectable = false,
}: {
    theme: keyof typeof THEMES;
    emblem: React.ReactNode;
    title: string;
    subtitle?: string;
    subtitleSelectable?: boolean;
}) {
    const colors = THEMES[theme];
    return (
        <HeroFrame hairline={colors.hairline}>
            <View style={styles.band}>
                <LinearGradient colors={colors.band} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
            </View>
            <View className="flex-row items-center" style={styles.heroContent}>
                <HeroEmblem ringColors={colors.ring} glowColor="transparent" size={SETTINGS_EMBLEM}>
                    {emblem}
                </HeroEmblem>
                <View className="flex-1 min-w-0" style={{ marginLeft: 16 }}>
                    <Text className="text-[20px] leading-[25px] font-black text-white tracking-tight" numberOfLines={2}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text selectable={subtitleSelectable} className="text-[13px] leading-[18px] font-semibold text-slate-400" style={{ marginTop: 5 }}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
            </View>
        </HeroFrame>
    );
}

/** An icon on the emblem's dark tile. */
function EmblemIcon({ icon, color }: { icon: IconName; color: string }) {
    return (
        <LinearGradient colors={['#1E293B', '#0B111D']} style={styles.emblemTile}>
            <Ionicons name={icon} size={26} color={color} />
        </LinearGradient>
    );
}

/** Tinted icon chip, the same as the Settings rows'. */
function IconTile({ icon, color, size = 36 }: { icon: IconName; color: string; size?: number }) {
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: Math.round(size * 0.33),
                backgroundColor: color + '1A',
                borderWidth: 1,
                borderColor: color + '33',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Ionicons name={icon} size={Math.round(size * 0.47)} color={color} />
        </View>
    );
}

/** The lit edge on the left of a card or an open row, in its colour. */
function SideGlow({ color }: { color: string }) {
    return (
        <View pointerEvents="none" style={[styles.sideGlow, { shadowColor: color }]}>
            <LinearGradient
                colors={[color + '00', color, color + '00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.sideGlowFill]}
            />
        </View>
    );
}

/** Copies the support address, and says so for a moment. Also what an email tap falls back to on a phone with no mail app. */
function useCopyEmail() {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const copy = useCallback(async () => {
        await Clipboard.setStringAsync(SUPPORT_EMAIL);
        hapticSuccess();
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1800);
    }, []);

    const openEmail = useCallback(() => {
        Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(copy);
    }, [copy]);

    return { copied, copy, openEmail };
}

const openDiscord = () => { Linking.openURL(DISCORD_URL).catch(() => {}); };

/** A way to reach the team: a big card with the channel's colour on its edge. */
function ChannelCard({
    icon,
    color,
    title,
    detail,
    detailColor = COLORS.slate400,
    onPress,
    accessory,
}: {
    icon: IconName;
    color: string;
    title: string;
    detail: string;
    detailColor?: string;
    onPress: () => void;
    /** Before the chevron — the email's copy button. */
    accessory?: React.ReactNode;
}) {
    return (
        <PressableScale onPress={onPress} pressedScale={0.98} accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`}>
            <RaisedCard style={{ overflow: 'hidden' }}>
                <SideGlow color={color} />
                <View className="flex-row items-center" style={styles.channelBody}>
                    <IconTile icon={icon} color={color} size={48} />
                    <View className="flex-1 min-w-0">
                        <Text className="text-[16px] leading-[21px] font-black text-white tracking-tight" numberOfLines={1}>
                            {title}
                        </Text>
                        <Text className="text-[12.5px] font-semibold mt-0.5" style={{ color: detailColor }} numberOfLines={1}>
                            {detail}
                        </Text>
                    </View>
                    {accessory}
                    <Ionicons name="chevron-forward" size={16} color={COLORS.slate500} />
                </View>
            </RaisedCard>
        </PressableScale>
    );
}

/** One way to reach the team inside a grouped card — the compact form of a channel. */
function ChannelRow({
    icon,
    color,
    title,
    detail,
    detailColor = COLORS.slate500,
    onPress,
    isLast = false,
}: {
    icon: IconName;
    color: string;
    title: string;
    detail: string;
    detailColor?: string;
    onPress: () => void;
    isLast?: boolean;
}) {
    return (
        <PressableScale
            onPress={onPress}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${detail}`}
            className="flex-row items-center py-3 px-4 active:opacity-80"
        >
            <View className="flex-row items-center flex-1 min-w-0" style={{ gap: 12 }}>
                <IconTile icon={icon} color={color} />
                <View className="flex-1 min-w-0">
                    <Text className="text-[15px] font-bold text-white" numberOfLines={1}>{title}</Text>
                    <Text className="text-[12px] font-semibold mt-px" style={{ color: detailColor }} numberOfLines={1}>{detail}</Text>
                </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.slate600} />
            {!isLast && <View pointerEvents="none" style={styles.rowDivider} />}
        </PressableScale>
    );
}

/** One question: its topic's icon and the question; open, the answer under it and the topic's lit edge. */
function FaqRow({ item, isLast }: { item: (typeof FAQ)[number]; isLast: boolean }) {
    const { t } = useTranslation('support');
    const [open, setOpen] = useState(false);

    // Reanimated's layout transition, not LayoutAnimation — that ghosts text on the new architecture.
    return (
        <Animated.View layout={LinearTransition.duration(200)} style={open ? { backgroundColor: item.color + '0D' } : undefined}>
            {open && <SideGlow color={item.color} />}
            <Pressable
                onPress={() => { hapticSelection(); setOpen(value => !value); }}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                className="flex-row items-center px-4 py-3.5 active:opacity-70"
                style={{ gap: 12 }}
            >
                <IconTile icon={item.icon} color={item.color} />
                <Text className="flex-1 text-[14px] leading-[19px] font-bold text-white">{t(item.q)}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={open ? item.color : COLORS.slate500} />
            </Pressable>
            {open && (
                <Animated.View entering={FadeIn.duration(160)} style={styles.answer}>
                    <Text className="text-[13.5px] leading-[20px] text-slate-300">{t(item.a)}</Text>
                </Animated.View>
            )}
            {!isLast && <View pointerEvents="none" style={styles.rowDivider} />}
        </Animated.View>
    );
}

// ─── Screens ────────────────────────────────────────────────────────────────

export function HelpCenterScreen() {
    const { t } = useTranslation('support');
    const { t: tCommon } = useTranslation('common');
    const { copied, openEmail } = useCopyEmail();

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title={t('helpCenter')} showBack />
            <ScrollView className="flex-1" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <SupportHero
                    theme="help"
                    emblem={<EmblemIcon icon="help-buoy" color={CYAN} />}
                    title={t('howCanWeHelp')}
                    subtitle={t('findAnswers')}
                />

                <SettingsGroup title={t('faqTitle')}>
                    {FAQ.map((item, index) => (
                        <FaqRow key={item.q} item={item} isLast={index === FAQ.length - 1} />
                    ))}
                </SettingsGroup>

                <Animated.View layout={LinearTransition.duration(200)}>
                    <SettingsGroup title={t('stillNeedHelp')}>
                        <ChannelRow
                            icon="logo-discord"
                            color={DISCORD_BLURPLE}
                            title={t('joinDiscord')}
                            detail={DISCORD_HANDLE}
                            onPress={openDiscord}
                        />
                        <ChannelRow
                            icon={copied ? 'checkmark-circle' : 'mail'}
                            color={COLORS.primaryBright}
                            title={t('emailSupport')}
                            detail={copied ? tCommon('app.copied') : SUPPORT_EMAIL}
                            detailColor={copied ? COLORS.primaryBright : COLORS.slate500}
                            onPress={openEmail}
                            isLast
                        />
                    </SettingsGroup>
                </Animated.View>
            </ScrollView>
        </SafeAreaView>
    );
}

export function ContactUsScreen() {
    const { t } = useTranslation('support');
    const { t: tCommon } = useTranslation('common');
    const { copied, copy, openEmail } = useCopyEmail();

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title={t('contactUs')} showBack />
            <ScrollView className="flex-1" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <SupportHero
                    theme="contact"
                    emblem={<EmblemIcon icon="chatbubbles" color={COLORS.primaryBright} />}
                    title={t('getInTouch')}
                    subtitle={t('contactLine')}
                />

                <View style={{ gap: 12 }}>
                    <ChannelCard
                        icon="logo-discord"
                        color={DISCORD_BLURPLE}
                        title={t('joinDiscord')}
                        detail={DISCORD_HANDLE}
                        onPress={openDiscord}
                    />
                    <ChannelCard
                        icon="mail"
                        color={COLORS.primaryBright}
                        title={t('emailSupport')}
                        detail={copied ? tCommon('app.copied') : SUPPORT_EMAIL}
                        detailColor={copied ? COLORS.primaryBright : COLORS.slate400}
                        onPress={openEmail}
                        accessory={
                            <Pressable
                                onPress={copy}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={t('copyEmail')}
                                className="w-9 h-9 rounded-xl items-center justify-center border border-white/10 bg-white/[0.04] active:opacity-70"
                            >
                                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? COLORS.primaryBright : COLORS.slate300} />
                            </Pressable>
                        }
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

export function AboutUsScreen() {
    const { t } = useTranslation('support');
    const { t: tAuth } = useTranslation('auth');
    const { t: tSettings } = useTranslation('settings');

    return (
        <SafeAreaView className="flex-1 bg-background">
            <PageHeader title={t('aboutUs')} showBack />
            <ScrollView className="flex-1" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <SupportHero
                    theme="about"
                    emblem={
                        <Image
                            source={require('../../assets/logo.png')}
                            style={styles.logo}
                            contentFit="cover"
                            accessibilityIgnoresInvertColors
                        />
                    }
                    title={tAuth('brand')}
                    subtitle={tSettings('version', { version: getAppReleaseLabel() })}
                    subtitleSelectable
                />

                {/* What GameHubz is, said once and large: the page's one statement. */}
                <Panel>
                    <SideGlow color={COLORS.primaryBright} />
                    <View style={styles.mission}>
                        <Text className="text-[18px] leading-[26px] font-black text-white tracking-tight">
                            {t('aboutLine1')}
                        </Text>
                        <Text className="text-[15px] leading-[23px] text-slate-300" style={{ marginTop: 12 }}>
                            {t('aboutLine2')}
                        </Text>
                    </View>
                </Panel>

                <Text className="text-[12px] font-semibold text-slate-500 text-center">{t('copyright')}</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    scroll: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 40,
        gap: 22,
    },
    band: {
        height: 18,
        overflow: 'hidden',
    },
    heroContent: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 16,
    },
    emblemTile: {
        width: SETTINGS_EMBLEM_IMAGE,
        height: SETTINGS_EMBLEM_IMAGE,
        borderRadius: SETTINGS_EMBLEM_IMAGE_RADIUS,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: SETTINGS_EMBLEM_IMAGE,
        height: SETTINGS_EMBLEM_IMAGE,
        borderRadius: SETTINGS_EMBLEM_IMAGE_RADIUS,
    },
    sideGlow: {
        position: 'absolute',
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
        // No overflow clip: the glow is the shadow, and a clip would cut it off.
        shadowOpacity: 0.9,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
    },
    sideGlowFill: {
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
    },
    channelBody: {
        paddingVertical: 16,
        paddingLeft: 18,
        paddingRight: 14,
        gap: 14,
    },
    // The answer lines up with the question: row padding 16 + chip 36 + gap 12.
    answer: {
        paddingLeft: 64,
        paddingRight: 18,
        paddingBottom: 16,
        marginTop: -4,
    },
    rowDivider: {
        position: 'absolute',
        left: 64,
        right: 0,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    mission: {
        paddingVertical: 22,
        paddingLeft: 22,
        paddingRight: 20,
    },
});

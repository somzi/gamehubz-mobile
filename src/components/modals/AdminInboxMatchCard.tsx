import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlayerAvatar } from '../ui/PlayerAvatar';

export interface InboxCardSide {
    username?: string | null;
    avatarUrl?: string | null;
    /** Team-tournament sub-matches only — shown under the player's name. */
    teamName?: string | null;
}

interface AdminInboxMatchCardProps {
    /** warning = help request (amber), primary = pending approval (emerald). */
    tone: 'warning' | 'primary';
    /** Context line, e.g. "Group E · Round 4". */
    eyebrow: string;
    /** Right side of the context line, e.g. when the help was requested. */
    meta?: string | null;
    home: InboxCardSide;
    away: InboxCardSide;
    /** When set, renders the proposed score between the players instead of "vs". */
    proposedScore?: { home: number | null; away: number | null } | null;
    footerIcon: keyof typeof Ionicons.glyphMap;
    /** e.g. "Requested by" / "Reported by". */
    footerLabel: string;
    footerName: string;
    ctaLabel: string;
    onPress: () => void;
}

const TONES = {
    warning: { hex: '#F59E0B', footerBg: 'bg-warning/10', ctaText: 'text-warning' },
    primary: { hex: '#10B981', footerBg: 'bg-primary/10', ctaText: 'text-primary' },
} as const;

function SideColumn({ side }: { side: InboxCardSide }) {
    const { t } = useTranslation('common');
    return (
        <View className="flex-1 items-center px-1">
            <PlayerAvatar
                src={side.avatarUrl || undefined}
                name={side.username || t('player')}
                size="md"
            />
            <Text className="text-[13px] font-bold text-white mt-2 text-center" numberOfLines={1}>
                {side.username || t('app.tbd')}
            </Text>
            {side.teamName ? (
                <Text className="text-[10px] font-semibold text-slate-500 mt-0.5 text-center" numberOfLines={1}>
                    {side.teamName}
                </Text>
            ) : null}
        </View>
    );
}

/**
 * One match in an admin inbox (help requests / pending approvals): symmetric
 * player columns around a "vs" or proposed-score centerpiece, context eyebrow
 * on top, and a tinted footer strip carrying the who + the call to action.
 */
export function AdminInboxMatchCard({
    tone,
    eyebrow,
    meta,
    home,
    away,
    proposedScore,
    footerIcon,
    footerLabel,
    footerName,
    ctaLabel,
    onPress,
}: AdminInboxMatchCardProps) {
    const { t: tr } = useTranslation('common');
    const t = TONES[tone];

    return (
        <Pressable
            onPress={onPress}
            className="bg-card rounded-[24px] border border-white/10 mb-3 overflow-hidden active:opacity-80"
        >
            {/* Context row */}
            <View className="flex-row items-center justify-between px-5 pt-4">
                <Text
                    className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex-shrink pr-3"
                    numberOfLines={1}
                >
                    {eyebrow}
                </Text>
                {meta ? (
                    <Text className="text-[10px] font-bold text-slate-500">{meta}</Text>
                ) : null}
            </View>

            {/* Matchup */}
            <View className="flex-row items-center px-4 pt-4 pb-5">
                <SideColumn side={home} />

                {proposedScore ? (
                    <View className="items-center px-1">
                        <View className="flex-row items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2">
                            <Text className="text-lg font-black text-white">
                                {proposedScore.home ?? '–'}
                            </Text>
                            <Text className="text-xs font-black text-slate-600">:</Text>
                            <Text className="text-lg font-black text-white">
                                {proposedScore.away ?? '–'}
                            </Text>
                        </View>
                        <Text className={`text-[8px] font-black uppercase tracking-widest mt-1.5 ${t.ctaText}`}>
                            {tr('app.proposed')}
                        </Text>
                    </View>
                ) : (
                    <View className="w-9 h-9 rounded-full bg-white/5 border border-white/10 items-center justify-center">
                        <Text className="text-[9px] font-black text-slate-500 uppercase">vs</Text>
                    </View>
                )}

                <SideColumn side={away} />
            </View>

            {/* Footer strip */}
            <View className={`flex-row items-center justify-between px-5 py-3 border-t border-white/5 ${t.footerBg}`}>
                <View className="flex-row items-center gap-2 flex-1 pr-3">
                    <Ionicons name={footerIcon} size={13} color={t.hex} />
                    <Text className="text-[11px] text-slate-400 font-medium flex-shrink" numberOfLines={1}>
                        {footerLabel}{' '}
                        <Text className="font-black text-slate-200">{footerName}</Text>
                    </Text>
                </View>
                <View className="flex-row items-center gap-1">
                    <Text className={`text-[10px] font-black uppercase tracking-wider ${t.ctaText}`}>
                        {ctaLabel}
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color={t.hex} />
                </View>
            </View>
        </Pressable>
    );
}

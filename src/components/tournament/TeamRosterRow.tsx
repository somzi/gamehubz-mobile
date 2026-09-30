import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { COLORS } from '../../lib/theme';

export type TeamRowTone = 'confirmed' | 'open' | 'request';

// Confirmed teams wear the team green, open teams blue, join requests amber — the same colours the
// three sub-tabs' cards always used.
const TONES: Record<TeamRowTone, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    confirmed: { color: COLORS.team, icon: 'shield-half-outline' },
    open: { color: '#3B82F6', icon: 'game-controller-outline' },
    request: { color: COLORS.warning, icon: 'shield-half-outline' },
};

export interface TeamRoster {
    members: any[];
    teamSize: number;
    allowReserves: boolean;
    memberCount: number;
    starterCount: number;
    reserveCount: number;
    rosterCapacity: number;
}

interface TeamRosterRowProps {
    tone: TeamRowTone;
    teamName?: string | null;
    roster: TeamRoster;
    captainUserId?: string | null;
    /** First row of the panel: no hairline above it. */
    first: boolean;
    expanded: boolean;
    onToggle: () => void;
    onOpenProfile: (userId: string) => void;
    isOnBench: (member: any) => boolean;
    /** Empty seats drawn under the members while the team is open. */
    openSlots: number;
    /** Small buttons at the end of the row (remove, approve / reject). */
    actions?: React.ReactNode;
    /** Under the roster while expanded (the join button). */
    footer?: React.ReactNode;
}

const idOf = (m: any): string | undefined => m?.userId || m?.UserId;

/**
 * One team as a row of a Teams sub-tab panel: shield, name, roster count, bench and captain on one
 * meta line. Tapping opens the roster underneath, inside the same panel.
 */
export function TeamRosterRow({
    tone,
    teamName,
    roster,
    captainUserId,
    first,
    expanded,
    onToggle,
    onOpenProfile,
    isOnBench,
    openSlots,
    actions,
    footer,
}: TeamRosterRowProps) {
    const { t } = useTranslation('tournament');
    const { t: tTeam } = useTranslation('team');
    const { t: tCommon } = useTranslation('common');
    const { color, icon } = TONES[tone];
    const { members, teamSize } = roster;
    const captainKey = captainUserId?.toLowerCase();
    const captain = members.find((m) => idOf(m)?.toLowerCase() === captainKey);
    const isFull = teamSize > 0 && roster.memberCount >= roster.rosterCapacity;

    return (
        <View
            className={first ? '' : 'border-t border-white/[0.05]'}
            style={expanded ? { backgroundColor: color + '0D' } : undefined}
        >
            {expanded && (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute', left: 0, top: 12, bottom: 12, width: 3,
                        backgroundColor: color, borderTopRightRadius: 3, borderBottomRightRadius: 3,
                    }}
                />
            )}

            <View className="flex-row items-center pl-4 pr-3 py-3">
                <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} className="flex-1 flex-row items-center active:opacity-70">
                    <View
                        className="w-10 h-10 rounded-xl items-center justify-center"
                        style={{ backgroundColor: color + '1A', borderWidth: 1, borderColor: color + '40' }}
                    >
                        <Ionicons name={icon} size={19} color={color} />
                    </View>
                    <View className="flex-1 ml-3">
                        <Text className="text-[15px] font-black text-white" numberOfLines={1}>
                            {teamName || t('details.unknownTeam')}
                        </Text>
                        <View className="flex-row items-center mt-1" style={{ gap: 8 }}>
                            {/* "Full" means the whole roster is taken. Without reserves the capacity IS
                                the lineup, so this reads exactly as it always did. */}
                            {isFull ? (
                                <Text className="text-[9px] font-black uppercase tracking-[1.2px]" style={{ color }}>
                                    {tTeam('teamFull')}
                                </Text>
                            ) : (
                                <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-slate-400">
                                    {roster.starterCount} / {teamSize > 0 ? teamSize : '?'} {tTeam('membersLabel')}
                                </Text>
                            )}
                            {roster.allowReserves && roster.reserveCount > 0 && (
                                <Text className="text-[9px] font-black uppercase tracking-[1.2px]" style={{ color: '#A5B4FC' }}>
                                    +{roster.reserveCount} {t('details.reserveBadge')}
                                </Text>
                            )}
                            {captain && (
                                <View className="flex-row items-center shrink" style={{ gap: 3 }}>
                                    <Ionicons name="shield" size={9} color={COLORS.warning} />
                                    <Text className="shrink text-[10px] font-bold text-amber-400" numberOfLines={1}>
                                        {captain.username || captain.Username}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.slate500} style={{ marginLeft: 6 }} />
                </Pressable>
                {actions ? <View className="flex-row items-center ml-2" style={{ gap: 6 }}>{actions}</View> : null}
            </View>

            {expanded && (
                <View className="pl-4 pr-3 pb-3.5" style={{ gap: 6 }}>
                    {members.length > 0 ? (
                        members.map((m: any, index: number) => {
                            const memberId = idOf(m);
                            const isCaptain = !!captainKey && memberId?.toLowerCase() === captainKey;
                            const onBench = isOnBench(m);
                            return (
                                <Pressable
                                    key={memberId || `m-${index}`}
                                    onPress={() => { if (memberId) onOpenProfile(memberId); }}
                                    className={`flex-row items-center rounded-2xl px-3 py-2 border active:opacity-70 ${isCaptain ? 'bg-warning/[0.08] border-warning/25' : 'bg-white/[0.03] border-white/[0.06]'}`}
                                >
                                    <View style={{ borderWidth: 1.5, borderColor: isCaptain ? 'rgba(245,158,11,0.55)' : 'rgba(255,255,255,0.12)', borderRadius: 999, padding: 1.5 }}>
                                        <PlayerAvatar name={m.username || m.Username} src={m.avatarUrl || m.AvatarUrl} size="sm" className="border-0" />
                                    </View>
                                    <View className="flex-1 ml-2.5">
                                        <View className="flex-row items-center" style={{ gap: 6 }}>
                                            <Text className="shrink text-[14px] font-bold text-white" numberOfLines={1}>{m.username || m.Username}</Text>
                                            {onBench && (
                                                <View className="px-1.5 py-[1px] rounded-full" style={{ backgroundColor: 'rgba(129,140,248,0.14)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.28)' }}>
                                                    <Text className="text-[8px] font-black uppercase tracking-wider" style={{ color: '#A5B4FC' }}>
                                                        {t('details.reserveBadge')}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        {isCaptain ? (
                                            <View className="flex-row items-center mt-0.5" style={{ gap: 3 }}>
                                                <Ionicons name="shield-checkmark" size={9} color={COLORS.warning} />
                                                <Text className="text-[9px] font-black uppercase tracking-wider text-amber-400">{tTeam('captainBadge')}</Text>
                                            </View>
                                        ) : (
                                            <Text className="text-[10px] font-semibold text-slate-500 mt-0.5">
                                                {onBench ? t('details.notPlaying') : tCommon('player')}
                                            </Text>
                                        )}
                                    </View>
                                    <Ionicons name="chevron-forward" size={13} color={COLORS.slate600} />
                                </Pressable>
                            );
                        })
                    ) : (
                        <Text className="text-slate-500 text-center text-xs py-2 italic">{t('details.noMembersFound')}</Text>
                    )}

                    {Array.from({ length: Math.max(0, openSlots) }).map((_, i) => (
                        <View
                            key={`slot-${i}`}
                            className="flex-row items-center rounded-2xl px-3 py-2 border border-white/10"
                            style={{ borderStyle: 'dashed' }}
                        >
                            <View className="w-8 h-8 rounded-full border border-white/15 items-center justify-center" style={{ borderStyle: 'dashed' }}>
                                <Ionicons name="person-add-outline" size={13} color={COLORS.slate600} />
                            </View>
                            <Text className="ml-2.5 text-slate-500 text-xs font-semibold">{t('details.openSlot')}</Text>
                        </View>
                    ))}

                    {footer}
                </View>
            )}
        </View>
    );
}

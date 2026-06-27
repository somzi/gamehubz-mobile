import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import { formatLocalDateTime } from '../../lib/utils';

export interface AdminHelpRequestItem {
    matchId: string;
    roundNumber?: number | null;
    status: number;
    scheduledStartTime?: string | null;
    requestedByUserId?: string | null;
    requestedByUsername?: string | null;
    requestedOn?: string | null;
    homeUserId?: string | null;
    homeUsername?: string | null;
    homeAvatarUrl?: string | null;
    awayUserId?: string | null;
    awayUsername?: string | null;
    awayAvatarUrl?: string | null;
}

interface AdminHelpRequestsModalProps {
    visible: boolean;
    onClose: () => void;
    requests: AdminHelpRequestItem[];
    isLoading: boolean;
    onSelect: (item: AdminHelpRequestItem) => void;
}

function formatTimeAgo(dateString?: string | null) {
    return formatLocalDateTime(dateString);
}

/**
 * Bottom sheet for tournament admins: every match where a player requested
 * admin help. Tapping a card opens the match so the admin can read the chat,
 * talk to the players and resolve the request.
 */
export function AdminHelpRequestsModal({
    visible,
    onClose,
    requests,
    isLoading,
    onSelect,
}: AdminHelpRequestsModalProps) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/70">
                {/* Backdrop */}
                <Pressable className="absolute inset-0" onPress={onClose} />

                <View
                    className="bg-[#0B1120] rounded-t-[32px] border-t border-x border-white/10"
                    style={{ height: '92%' }}
                >
                    {/* Drag handle */}
                    <View className="w-10 h-1 bg-white/10 rounded-full self-center mt-3 mb-1" />

                    {/* Header */}
                    <View className="flex-row items-center justify-between px-6 py-4">
                        <View className="flex-row items-center gap-3">
                            <View className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 items-center justify-center">
                                <Ionicons name="hand-left" size={18} color="#F59E0B" />
                            </View>
                            <View>
                                <Text className="text-base font-black text-white tracking-tight">Help Requests</Text>
                                <Text className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                                    {requests.length === 0
                                        ? 'All clear'
                                        : `${requests.length} ${requests.length === 1 ? 'match needs' : 'matches need'} attention`}
                                </Text>
                            </View>
                        </View>
                        <Pressable
                            onPress={onClose}
                            className="w-9 h-9 rounded-full bg-white/5 items-center justify-center border border-white/10 active:opacity-60"
                        >
                            <Ionicons name="close" size={18} color="#94A3B8" />
                        </Pressable>
                    </View>

                    <ScrollView
                        className="px-5 flex-1"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 36 }}
                    >
                        {isLoading ? (
                            <View className="py-16 items-center">
                                <ActivityIndicator size="small" color="#F59E0B" />
                            </View>
                        ) : requests.length === 0 ? (
                            <View className="py-12 items-center">
                                <View className="w-16 h-16 rounded-full bg-[#10B981]/10 border border-[#10B981]/20 items-center justify-center mb-4">
                                    <Ionicons name="checkmark-done" size={26} color="#10B981" />
                                </View>
                                <Text className="text-sm font-black text-white uppercase tracking-widest">No Help Requests</Text>
                                <Text className="text-xs text-slate-500 mt-2 text-center px-8">
                                    All matches are running smoothly. You'll get a push notification when a player asks for help.
                                </Text>
                            </View>
                        ) : (
                            requests.map((item) => (
                                <Pressable
                                    key={item.matchId}
                                    onPress={() => onSelect(item)}
                                    className="bg-[#131B2E] rounded-[24px] border border-[#F59E0B]/20 mb-3 overflow-hidden active:opacity-80"
                                >
                                    <View className="flex-row">
                                        {/* Amber accent bar */}
                                        <View style={{ width: 4, backgroundColor: '#F59E0B', opacity: 0.7 }} />

                                        <View className="flex-1 p-4">
                                            {/* Top row: round + time ago */}
                                            <View className="flex-row items-center justify-between mb-3">
                                                <View className="bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                                                    <Text className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                        {item.roundNumber ? `Round ${item.roundNumber}` : 'Match'}
                                                    </Text>
                                                </View>
                                                <View className="flex-row items-center gap-1.5">
                                                    <View className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                                                    <Text className="text-[10px] font-bold text-[#F59E0B]">
                                                        {formatTimeAgo(item.requestedOn)}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Players */}
                                            <View className="flex-row items-center">
                                                <View className="flex-row items-center flex-1 gap-2.5">
                                                    <PlayerAvatar
                                                        src={item.homeAvatarUrl || undefined}
                                                        name={item.homeUsername || 'Player'}
                                                        size="sm"
                                                    />
                                                    <Text className="text-sm font-bold text-white flex-shrink" numberOfLines={1}>
                                                        {item.homeUsername || 'TBD'}
                                                    </Text>
                                                </View>
                                                <View className="px-2">
                                                    <Text className="text-[9px] font-black text-slate-600 uppercase">vs</Text>
                                                </View>
                                                <View className="flex-row items-center flex-1 gap-2.5 justify-end">
                                                    <Text className="text-sm font-bold text-white flex-shrink text-right" numberOfLines={1}>
                                                        {item.awayUsername || 'TBD'}
                                                    </Text>
                                                    <PlayerAvatar
                                                        src={item.awayAvatarUrl || undefined}
                                                        name={item.awayUsername || 'Player'}
                                                        size="sm"
                                                    />
                                                </View>
                                            </View>

                                            {/* Requested by + CTA */}
                                            <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-white/5">
                                                <View className="flex-row items-center gap-1.5 flex-1">
                                                    <Ionicons name="megaphone-outline" size={12} color="#94A3B8" />
                                                    <Text className="text-[11px] text-slate-400 font-medium" numberOfLines={1}>
                                                        Requested by{' '}
                                                        <Text className="font-black text-slate-300">
                                                            {item.requestedByUsername || 'a player'}
                                                        </Text>
                                                    </Text>
                                                </View>
                                                <View className="flex-row items-center gap-1">
                                                    <Text className="text-[10px] font-black text-[#10B981] uppercase tracking-wider">Open</Text>
                                                    <Ionicons name="chevron-forward" size={12} color="#10B981" />
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                </Pressable>
                            ))
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

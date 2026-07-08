import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminInboxMatchCard } from './AdminInboxMatchCard';
import { formatLocalDateTime } from '../../lib/utils';

export interface AdminHelpRequestItem {
    matchId: string;
    // Set when the requested match is a team-tournament sub-match — admin opens the parent
    // team-match modal instead of the solo modal.
    teamMatchId?: string | null;
    roundNumber?: number | null;
    /** Group-stage matches only, e.g. "Group A". */
    groupName?: string | null;
    /** Team-tournament sub-matches only — each player's tournament team. */
    homeTeamName?: string | null;
    awayTeamName?: string | null;
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
                    className="bg-background-deep rounded-t-[32px] border-t border-x border-white/10"
                    style={{ height: '92%' }}
                >
                    {/* Drag handle */}
                    <View className="w-10 h-1 bg-white/10 rounded-full self-center mt-3 mb-1" />

                    {/* Header */}
                    <View className="flex-row items-center justify-between px-6 py-4">
                        <View className="flex-row items-center gap-3">
                            <View className="w-10 h-10 rounded-2xl bg-warning/15 items-center justify-center">
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
                                <View className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 items-center justify-center mb-4">
                                    <Ionicons name="checkmark-done" size={26} color="#10B981" />
                                </View>
                                <Text className="text-sm font-black text-white uppercase tracking-widest">No Help Requests</Text>
                                <Text className="text-xs text-slate-500 mt-2 text-center px-8">
                                    All matches are running smoothly. You'll get a push notification when a player asks for help.
                                </Text>
                            </View>
                        ) : (
                            requests.map((item) => (
                                <AdminInboxMatchCard
                                    key={item.matchId}
                                    tone="warning"
                                    eyebrow={[item.groupName, item.roundNumber ? `Round ${item.roundNumber}` : null]
                                        .filter(Boolean)
                                        .join(' · ') || 'Match'}
                                    meta={formatLocalDateTime(item.requestedOn)}
                                    home={{
                                        username: item.homeUsername,
                                        avatarUrl: item.homeAvatarUrl,
                                        teamName: item.homeTeamName,
                                    }}
                                    away={{
                                        username: item.awayUsername,
                                        avatarUrl: item.awayAvatarUrl,
                                        teamName: item.awayTeamName,
                                    }}
                                    footerIcon="hand-left"
                                    footerLabel="Requested by"
                                    footerName={item.requestedByUsername || 'a player'}
                                    ctaLabel="Open"
                                    onPress={() => onSelect(item)}
                                />
                            ))
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

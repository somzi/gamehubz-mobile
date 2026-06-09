import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticatedFetch, ENDPOINTS } from '../../lib/api';

interface AdminHelpSectionProps {
    matchId: string;
    /** Current flag state from the match details payload. */
    requested: boolean;
    /** True when the open request was raised by the logged-in user. */
    requestedByMe?: boolean;
    /** Participants get the "Request Admin Help" entry point. */
    isParticipant: boolean;
    /** Hub owner / hub admin / platform admin — gets the "Mark Resolved" action. */
    canResolve: boolean;
    /** Called after a successful request / resolve so the host can refresh its data. */
    onChanged?: () => void;
}

/**
 * "Request Admin Help" escalation for a match.
 *
 * - Participant, no open request  → amber call-to-action card (confirm dialog → POST).
 * - Open request                  → amber status banner; admins also get a green
 *                                   "Mark Resolved" button.
 * - Spectator, no open request    → renders nothing.
 */
export function AdminHelpSection({
    matchId,
    requested,
    requestedByMe = false,
    isParticipant,
    canResolve,
    onChanged,
}: AdminHelpSectionProps) {
    // Local mirror so the card flips to "requested" instantly after the POST,
    // before the parent refetches the match details.
    const [localRequested, setLocalRequested] = useState(requested);
    const [localByMe, setLocalByMe] = useState(requestedByMe);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLocalRequested(requested);
        setLocalByMe(requestedByMe);
    }, [requested, requestedByMe, matchId]);

    const submitRequest = async () => {
        if (!matchId || isSubmitting) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REQUEST_MATCH_ADMIN_HELP(matchId), {
                method: 'POST',
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || 'Failed to notify admins');
            }
            setLocalRequested(true);
            setLocalByMe(true);
            if (onChanged) onChanged();
        } catch (err: any) {
            console.error('[AdminHelpSection] Request error:', err);
            setError('Could not notify the admins. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRequestPress = () => {
        Alert.alert(
            'Request Admin Help',
            'Tournament admins and the hub owner will be notified and can join your match chat to sort things out.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Notify Admins', onPress: submitRequest },
            ]
        );
    };

    const handleResolve = async () => {
        if (!matchId || isResolving) return;
        setIsResolving(true);
        setError(null);
        try {
            const response = await authenticatedFetch(ENDPOINTS.RESOLVE_MATCH_ADMIN_HELP(matchId), {
                method: 'POST',
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || 'Failed to resolve');
            }
            setLocalRequested(false);
            setLocalByMe(false);
            if (onChanged) onChanged();
        } catch (err: any) {
            console.error('[AdminHelpSection] Resolve error:', err);
            setError('Could not resolve the request. Please try again.');
        } finally {
            setIsResolving(false);
        }
    };

    if (!localRequested && !isParticipant) return null;

    if (!localRequested) {
        return (
            <View>
                <Pressable
                    onPress={handleRequestPress}
                    disabled={isSubmitting}
                    className="bg-[#F59E0B]/[0.06] rounded-[20px] border border-[#F59E0B]/20 p-4 flex-row items-center gap-3 active:opacity-70"
                >
                    <View className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 items-center justify-center">
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#F59E0B" />
                        ) : (
                            <Ionicons name="hand-left-outline" size={18} color="#F59E0B" />
                        )}
                    </View>
                    <View className="flex-1">
                        <Text className="text-[11px] font-black text-[#F59E0B] uppercase tracking-[2px]">Need Help?</Text>
                        <Text className="text-[11px] text-slate-400 mt-0.5">
                            Problem with this match? Notify the tournament admins.
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
                </Pressable>
                {error && (
                    <Text className="text-red-400 text-[11px] font-medium text-center mt-2">{error}</Text>
                )}
            </View>
        );
    }

    return (
        <View className="bg-[#F59E0B]/[0.08] rounded-[20px] border border-[#F59E0B]/25 p-4">
            <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 items-center justify-center">
                    <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                </View>
                <View className="flex-1">
                    <Text className="text-[11px] font-black text-[#F59E0B] uppercase tracking-[2px]">Admin Help Requested</Text>
                    <Text className="text-[11px] text-slate-400 mt-0.5">
                        {canResolve
                            ? 'A player asked for help here. Check the match chat and mark it resolved when done.'
                            : localByMe
                                ? 'Admins have been notified — they can join your match chat.'
                                : 'An admin has been called to this match.'}
                    </Text>
                </View>
            </View>
            {canResolve && (
                <Pressable
                    onPress={handleResolve}
                    disabled={isResolving}
                    className="mt-3 bg-[#10B981] rounded-2xl py-3 items-center flex-row justify-center gap-2 active:opacity-80"
                >
                    {isResolving ? (
                        <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                        <>
                            <Ionicons name="checkmark-circle" size={16} color="#0F172A" />
                            <Text className="text-xs font-black text-[#0F172A] uppercase tracking-wider">Mark Resolved</Text>
                        </>
                    )}
                </Pressable>
            )}
            {error && (
                <Text className="text-red-400 text-[11px] font-medium text-center mt-2">{error}</Text>
            )}
        </View>
    );
}

import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../../lib/api';
import { ConfirmationModal } from '../modals/ConfirmationModal';

// getErrorMessage swallows everything into "An unexpected error occurred" when there
// is no usable text — for this surface we prefer a domain-specific fallback in that case.
function extractErrorMessage(err: unknown, fallback: string): string {
    const parsed = getErrorMessage(err);
    if (!parsed || parsed === i18n.t('common:unexpectedError')) return fallback;
    return parsed;
}

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
    const { t } = useTranslation('match');
    // Local mirror so the card flips to "requested" instantly after the POST,
    // before the parent refetches the match details.
    const [localRequested, setLocalRequested] = useState(requested);
    const [localByMe, setLocalByMe] = useState(requestedByMe);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);

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
                throw new Error(text || t('adminHelp.notifyFailed'));
            }
            setLocalRequested(true);
            setLocalByMe(true);
            setShowConfirm(false);
            if (onChanged) onChanged();
        } catch (err: any) {
            console.error('[AdminHelpSection] Request error:', err);
            // Prefer the server's message so users see "Only match participants…" etc.
            setError(extractErrorMessage(err, t('adminHelp.notifyFailedHint')));
            setShowConfirm(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRequestPress = () => {
        setError(null);
        setShowConfirm(true);
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
                throw new Error(text || t('adminHelp.resolveFailed'));
            }
            setLocalRequested(false);
            setLocalByMe(false);
            if (onChanged) onChanged();
        } catch (err: any) {
            console.error('[AdminHelpSection] Resolve error:', err);
            setError(extractErrorMessage(err, t('adminHelp.resolveFailedHint')));
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
                    className="bg-warning/[0.06] rounded-[20px] border border-warning/20 p-4 flex-row items-center gap-3 active:opacity-70"
                >
                    <View className="w-10 h-10 rounded-2xl bg-warning/15 items-center justify-center">
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#F59E0B" />
                        ) : (
                            <Ionicons name="hand-left-outline" size={18} color="#F59E0B" />
                        )}
                    </View>
                    <View className="flex-1">
                        <Text className="text-[11px] font-black text-warning uppercase tracking-[2px]">{t('adminHelp.needHelp')}</Text>
                        <Text className="text-[11px] text-slate-400 mt-0.5">
                            {t('adminHelp.needHelpHint')}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
                </Pressable>
                {error && (
                    <Text className="text-red-400 text-[11px] font-medium text-center mt-2">{error}</Text>
                )}
                <ConfirmationModal
                    visible={showConfirm}
                    onClose={() => setShowConfirm(false)}
                    onConfirm={submitRequest}
                    title={t('adminHelp.requestTitle')}
                    message={t('adminHelp.requestMessage')}
                    confirmText={t('adminHelp.notifyAdmins')}
                    isDestructive={false}
                    isLoading={isSubmitting}
                />
            </View>
        );
    }

    return (
        <View className="bg-warning/[0.08] rounded-[20px] border border-warning/25 p-4">
            <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-2xl bg-warning/15 items-center justify-center">
                    <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                </View>
                <View className="flex-1">
                    <Text className="text-[11px] font-black text-warning uppercase tracking-[2px]">{t('adminHelp.helpRequested')}</Text>
                    <Text className="text-[11px] text-slate-400 mt-0.5">
                        {canResolve
                            ? t('adminHelp.adminView')
                            : localByMe
                                ? t('adminHelp.requesterView')
                                : t('adminHelp.otherView')}
                    </Text>
                </View>
            </View>
            {canResolve && (
                <Pressable
                    onPress={handleResolve}
                    disabled={isResolving}
                    className="mt-3 bg-primary rounded-2xl py-3 items-center flex-row justify-center gap-2 active:opacity-80"
                >
                    {isResolving ? (
                        <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                        <>
                            <Ionicons name="checkmark-circle" size={16} color="#0F172A" />
                            <Text className="text-xs font-black text-primary-foreground uppercase tracking-wider">{t('adminHelp.markResolved')}</Text>
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

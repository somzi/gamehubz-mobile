import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, TextInput, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { authenticatedFetch, ENDPOINTS, getErrorMessage } from '../../lib/api';

enum HubVerificationStatus {
    Pending = 0,
    Approved = 1,
    Rejected = 2,
}

interface VerificationRequest {
    id: string;
    hubId: string;
    reason: string;
    status: HubVerificationStatus;
    createdOn?: string;
}

interface Props {
    visible: boolean;
    hubId: string;
    isAlreadyVerified: boolean;
    onClose: () => void;
    onSubmitted?: () => void;
}

export function RequestVerificationModal({ visible, hubId, isAlreadyVerified, onClose, onSubmitted }: Props) {
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [request, setRequest] = useState<VerificationRequest | null>(null);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (!visible) return;
        if (isAlreadyVerified) {
            setRequest(null);
            setReason('');
            return;
        }
        fetchCurrent();
    }, [visible, hubId, isAlreadyVerified]);

    const fetchCurrent = async () => {
        setIsLoading(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.GET_HUB_VERIFICATION_REQUEST(hubId));
            if (response.ok) {
                const data = await response.json();
                setRequest(data || null);
            } else {
                setRequest(null);
            }
        } catch {
            setRequest(null);
        } finally {
            setIsLoading(false);
        }
    };

    const canSubmit = !isAlreadyVerified && (!request || request.status === HubVerificationStatus.Rejected);
    const isPending = request?.status === HubVerificationStatus.Pending;

    const handleSubmit = async () => {
        if (!reason.trim()) {
            Alert.alert('Reason required', 'Please describe why this hub should be verified and provide any supporting evidence.');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await authenticatedFetch(ENDPOINTS.REQUEST_HUB_VERIFICATION(hubId), {
                method: 'POST',
                body: JSON.stringify({ reason: reason.trim() }),
            });

            if (response.ok) {
                const data = await response.json();
                setRequest(data);
                setReason('');
                onSubmitted?.();
            } else {
                const text = await response.text();
                Alert.alert('Error', getErrorMessage(text) || 'Failed to submit verification request.');
            }
        } catch (error) {
            Alert.alert('Error', getErrorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderBody = () => {
        if (isAlreadyVerified) {
            return (
                <View className="items-center py-6">
                    <View className="w-14 h-14 rounded-full bg-sky-500 items-center justify-center mb-3">
                        <Ionicons name="checkmark" size={32} color="#fff" />
                    </View>
                    <Text className="text-white font-black text-base">Hub is verified</Text>
                    <Text className="text-slate-500 text-xs mt-1 text-center">
                        This hub displays the verified badge across the app.
                    </Text>
                </View>
            );
        }

        if (isLoading) {
            return (
                <View className="items-center py-10">
                    <ActivityIndicator size="large" color="#818CF8" />
                </View>
            );
        }

        if (isPending) {
            return (
                <View>
                    <View className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-4 flex-row items-center" style={{ gap: 12 }}>
                        <View className="w-10 h-10 rounded-xl bg-amber-500/20 items-center justify-center">
                            <Ionicons name="time-outline" size={20} color="#F59E0B" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-amber-400 font-black text-sm">Pending review</Text>
                            <Text className="text-amber-300/70 text-xs mt-0.5">
                                Submitted {request?.createdOn ? new Date(request.createdOn).toLocaleDateString() : ''}
                            </Text>
                        </View>
                    </View>

                    <Text className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Your submission</Text>
                    <View className="bg-card border border-white/5 rounded-xl p-3">
                        <Text className="text-slate-300 text-sm leading-5">{request?.reason}</Text>
                    </View>
                </View>
            );
        }

        return (
            <View>
                {request?.status === HubVerificationStatus.Rejected && (
                    <View className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-4 flex-row items-center" style={{ gap: 12 }}>
                        <View className="w-10 h-10 rounded-xl bg-red-500/20 items-center justify-center">
                            <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-red-400 font-black text-sm">Previous request rejected</Text>
                            <Text className="text-red-300/70 text-xs mt-0.5">You can submit a new request below.</Text>
                        </View>
                    </View>
                )}

                <Text className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
                    Why should this hub be verified?
                </Text>
                <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Describe your role, link to official accounts, attach any proof that this hub represents you or your organization."
                    placeholderTextColor="#475569"
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    maxLength={2000}
                    className="bg-card border border-white/5 rounded-xl px-3 py-3 text-white text-sm min-h-[140px]"
                />
                <Text className="text-[10px] text-slate-600 mt-1.5 text-right">{reason.length}/2000</Text>

                <View className="bg-indigo-500/[0.06] border border-indigo-500/20 rounded-xl p-3 mt-3 flex-row" style={{ gap: 10 }}>
                    <Ionicons name="information-circle-outline" size={16} color="#818CF8" />
                    <Text className="text-slate-400 text-xs flex-1 leading-4">
                        Your request is reviewed by a human. We may contact you for additional proof.
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <Pressable className="flex-1 bg-black/60 justify-center items-center px-5" onPress={onClose}>
                <Pressable
                    className="bg-card rounded-3xl w-full max-w-md border border-white/5 overflow-hidden"
                    onPress={(e) => e.stopPropagation()}
                >
                    <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
                        <View className="flex-row items-center" style={{ gap: 10 }}>
                            <View className="w-9 h-9 rounded-xl bg-sky-500/15 items-center justify-center">
                                <Ionicons name="shield-checkmark-outline" size={18} color="#0EA5E9" />
                            </View>
                            <Text className="text-white font-black text-base">Hub Verification</Text>
                        </View>
                        <Pressable onPress={onClose} hitSlop={10}>
                            <Ionicons name="close" size={22} color="#64748B" />
                        </Pressable>
                    </View>

                    <ScrollView className="px-5" style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
                        {renderBody()}
                    </ScrollView>

                    {canSubmit && (
                        <View className="flex-row px-5 py-4 border-t border-white/5" style={{ gap: 10 }}>
                            <Button onPress={onClose} variant="secondary" className="flex-1" disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button onPress={handleSubmit} className="flex-1" disabled={isSubmitting || !reason.trim()}>
                                {isSubmitting ? 'Submitting...' : 'Submit request'}
                            </Button>
                        </View>
                    )}

                    {!canSubmit && (
                        <View className="px-5 py-4 border-t border-white/5">
                            <Button onPress={onClose} variant="secondary" className="w-full">
                                Close
                            </Button>
                        </View>
                    )}
                </Pressable>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}

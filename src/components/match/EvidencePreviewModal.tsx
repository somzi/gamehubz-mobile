import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { EvidenceItem, isVideoItem } from '../../lib/evidence';

/**
 * Guarded require, for the same reason the compressor uses one: a static import of a native
 * module takes the whole match screen down in Expo Go, where the native side does not exist.
 * Resolved once — the answer cannot change at runtime.
 */
let videoModule: typeof import('expo-video') | null | undefined;

function getVideoModule() {
    if (videoModule === undefined) {
        try {
            videoModule = require('expo-video');
        } catch {
            videoModule = null;
        }
    }
    return videoModule;
}

/**
 * Its own component so the player exists only while a clip is on screen and is torn down with it.
 * useVideoPlayer cannot be called conditionally, and mounting a player for every image preview
 * would hold a decoder open for nothing. Only rendered once the module is known to be present.
 */
function VideoPreview({ uri }: { uri: string }) {
    const { useVideoPlayer, VideoView } = getVideoModule()!;

    const player = useVideoPlayer(uri, p => {
        p.loop = false;
        // Evidence is opened to settle an argument, so it starts on its own rather than making
        // the organizer hunt for a play button after already tapping the tile.
        p.play();
    });

    return (
        <VideoView
            player={player}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            allowsFullscreen
            nativeControls
        />
    );
}

interface EvidencePreviewModalProps {
    item: EvidenceItem | null;
    onClose: () => void;
}

/** Fullscreen viewer for one piece of evidence, image or clip. */
export function EvidencePreviewModal({ item, onClose }: EvidencePreviewModalProps) {
    const { t } = useTranslation('match');
    const canPlayVideo = getVideoModule() !== null;

    const renderContent = () => {
        if (!item) return null;

        if (!isVideoItem(item)) {
            return (
                <Image
                    source={{ uri: item.url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                />
            );
        }

        if (!canPlayVideo) {
            return (
                <View className="items-center px-8">
                    <Ionicons name="videocam-off-outline" size={32} color="#64748B" />
                    <Text className="text-xs font-bold text-slate-400 text-center mt-3">
                        {t('details.videoPlaybackUnavailable')}
                    </Text>
                </View>
            );
        }

        return <VideoPreview uri={item.url} />;
    };

    return (
        <Modal
            visible={!!item}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View className="flex-1 bg-black/95 items-center justify-center p-4">
                <Pressable
                    className="absolute top-12 right-6 z-10 w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/20"
                    onPress={onClose}
                >
                    <Ionicons name="close" size={24} color="white" />
                </Pressable>

                {renderContent()}
            </View>
        </Modal>
    );
}

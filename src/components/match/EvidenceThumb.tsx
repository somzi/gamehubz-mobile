import React from 'react';
import { View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';
import { getOptimizedCloudinaryUrl } from '../../lib/image';
import { EvidenceItem, getVideoPosterUrl, isVideoItem } from '../../lib/evidence';

interface EvidenceThumbProps {
    item: EvidenceItem;
    width?: number;
    height?: number;
    onPress: () => void;
    className?: string;
}

/**
 * One tile in the evidence strip.
 *
 * A clip is drawn as its own poster frame with a play badge rather than a generic icon, because a
 * row of identical black squares tells the organizer nothing about which clip is which. If the
 * provider cannot give us a frame the tile degrades to a plain dark card with the badge, which is
 * still tappable and still obviously a video.
 */
export function EvidenceThumb({
    item,
    width = 112,
    height = 160,
    onPress,
    className,
}: EvidenceThumbProps) {
    const isVideo = isVideoItem(item);
    const poster = isVideo ? getVideoPosterUrl(item.url, 400) : getOptimizedCloudinaryUrl(item.url, 400);

    return (
        <Pressable className={className} onPress={onPress}>
            <View className="rounded-2xl overflow-hidden border border-white/5">
                {poster ? (
                    <Image
                        source={{ uri: poster }}
                        style={{ width, height, backgroundColor: COLORS.cardElevated }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                    />
                ) : (
                    <View style={{ width, height, backgroundColor: COLORS.cardElevated }} />
                )}

                {isVideo && (
                    <View className="absolute inset-0 items-center justify-center">
                        <View className="w-11 h-11 rounded-full bg-black/60 items-center justify-center border border-white/25">
                            <Ionicons name="play" size={20} color="white" style={{ marginLeft: 2 }} />
                        </View>
                    </View>
                )}
            </View>
        </Pressable>
    );
}

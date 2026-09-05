import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';
import { PreparedEvidence } from '../../lib/evidence';

interface PendingEvidenceStripProps {
    files: PreparedEvidence[];
    onRemove: (uri: string) => void;
    size?: number;
}

/**
 * The picked-but-not-yet-sent row.
 *
 * Clips get a card with a play badge rather than a frame from the file: pulling a still out of a
 * local video needs its own native module, and this tile lives for the few seconds between
 * picking and uploading. The badge and the extension say what it is, which is all that is needed
 * before the real poster appears in the gallery after upload.
 */
export function PendingEvidenceStrip({ files, onRemove, size = 80 }: PendingEvidenceStripProps) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {files.map((file, index) => (
                <View key={file.uri + index} className="mr-3 mb-2">
                    <View
                        className="rounded-2xl overflow-hidden border border-white/5"
                        style={{ width: size, height: size }}
                    >
                        {file.isVideo ? (
                            <View
                                className="flex-1 items-center justify-center"
                                style={{ backgroundColor: COLORS.cardElevated }}
                            >
                                <Ionicons name="play-circle" size={26} color="white" />
                                <Text className="text-[8px] font-black text-slate-400 uppercase tracking-wider mt-1">
                                    {file.type.split('/')[1] ?? 'video'}
                                </Text>
                            </View>
                        ) : (
                            <Image source={{ uri: file.uri }} style={{ width: size, height: size }} />
                        )}
                    </View>
                    <Pressable
                        onPress={() => onRemove(file.uri)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 w-5 h-5 rounded-full items-center justify-center border-2 border-background-deep shadow-sm"
                    >
                        <Ionicons name="close" size={10} color="white" />
                    </Pressable>
                </View>
            ))}
        </ScrollView>
    );
}

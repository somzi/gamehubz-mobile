import React, { JSX } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';

/** Transient "Copied" pill drawn over a chat bubble after a long-press copy.
 *  Absolutely positioned, so the flash never reflows the message list. */
export function CopiedOverlay(): JSX.Element {
  return (
    <View
      className="absolute inset-0 items-center justify-center"
      pointerEvents="none"
    >
      <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-white/10">
        <Ionicons name="checkmark-circle" size={13} color={COLORS.primary} />
        <Text className="text-[10px] font-black uppercase tracking-widest text-white">
          Copied
        </Text>
      </View>
    </View>
  );
}

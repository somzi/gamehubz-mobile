import React, { JSX } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';

/** How far the pill may spill past the bubble on each side.
 *
 *  A short message ("ok", "gg") makes a bubble narrower than the pill itself, and
 *  a pill laid out inside those bounds wrapped mid-word — "Cop" on one line, "ied"
 *  on the next. The overlay is absolutely positioned, so widening it past the
 *  bubble costs nothing in layout: it just gives the row enough room to stay on
 *  one line, still centred on the bubble, whatever the message length. */
const OVERHANG = 60;

/** Transient "Copied" pill drawn over a chat bubble after a long-press copy.
 *  Absolutely positioned, so the flash never reflows the message list. */
export function CopiedOverlay(): JSX.Element {
  return (
    <View
      className="absolute items-center justify-center"
      style={{ top: 0, bottom: 0, left: -OVERHANG, right: -OVERHANG }}
      pointerEvents="none"
    >
      <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-white/10">
        <Ionicons name="checkmark-circle" size={13} color={COLORS.primary} />
        <Text
          numberOfLines={1}
          className="text-[10px] font-black uppercase tracking-widest text-white"
        >
          Copied
        </Text>
      </View>
    </View>
  );
}

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { COLORS } from '../../lib/theme';

export const RAISED_CARD_RADIUS = 20;

/**
 * The surface Home draws its cards on (match cards, highlights, and their skeletons): a navy one
 * step lighter than the page, a hairline edge, and a slightly brighter top edge, as if lit from
 * above. No shadow or glow — the lighter surface and the edge separate the card from the page.
 */
export function RaisedCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
    card: {
        borderRadius: RAISED_CARD_RADIUS,
        backgroundColor: COLORS.cardRaised,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.07)',
        borderTopColor: 'rgba(255, 255, 255, 0.11)',
    },
});

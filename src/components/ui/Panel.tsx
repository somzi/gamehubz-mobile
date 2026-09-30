import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * Building blocks of the hub and tournament overviews, in the share cards' language: panels with a
 * soft top shine, stat cells (icon, big value, tracked label), a two-column details grid, and
 * readable text that folds away when it runs long.
 */

/** Card for one block of an overview: card navy, a hairline edge and a soft shine along the top. */
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return (
        <View style={[styles.panel, style]}>
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
                style={styles.panelShine}
            />
            {children}
        </View>
    );
}

/** Tinted icon tile + tracked uppercase title heading a panel. */
export function PanelTitle({ icon, color, title }: { icon: IconName; color: string; title: string }) {
    return (
        <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
            <View
                className="w-7 h-7 rounded-xl items-center justify-center"
                style={{ backgroundColor: color + '1A', borderWidth: 1, borderColor: color + '33' }}
            >
                <Ionicons name={icon} size={14} color={color} />
            </View>
            <Text className="flex-1 text-[11px] font-black text-white uppercase tracking-widest" numberOfLines={1}>
                {title}
            </Text>
        </View>
    );
}

/** One column of a stats row: icon, big value, tiny tracked label. */
export function StatCell({
    icon,
    iconColor,
    value,
    label,
    valueColor = COLORS.foreground,
    valueSize = 22,
    lines = 1,
}: {
    icon: IconName;
    iconColor: string;
    value: string;
    label: string;
    valueColor?: string;
    valueSize?: number;
    /** Two for words that can run long (a format name); numbers stay on one. */
    lines?: number;
}) {
    return (
        <View className="flex-1 items-center px-1.5">
            <Ionicons name={icon} size={15} color={iconColor} style={{ marginBottom: 5 }} />
            <Text
                numberOfLines={lines}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                className="font-black text-center"
                style={[TABULAR, { color: valueColor, fontSize: valueSize, lineHeight: Math.round(valueSize * 1.15) }]}
            >
                {value}
            </Text>
            <Text
                className="w-full text-center text-[9px] font-bold uppercase tracking-[1.2px] text-slate-500 mt-1"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
            >
                {label}
            </Text>
        </View>
    );
}

export function StatDivider() {
    return <View style={{ width: 1, height: 44, backgroundColor: 'rgba(148,163,184,0.12)' }} />;
}

export interface DetailItem {
    key: string;
    icon: IconName;
    /** Icon colour. */
    color: string;
    label: string;
    value: string;
    /** For a value that needs attention (an open registration's deadline). */
    valueColor?: string;
    onPress?: () => void;
}

/**
 * Label + value pairs laid out two per row in fixed halves, so every label starts on the same line
 * whatever the values are. Each group starts on a new row (dates that belong together stay
 * together); an odd last item in a group keeps its half.
 */
export function DetailGrid({ groups }: { groups: DetailItem[][] }) {
    const rows: DetailItem[][] = [];
    for (const group of groups) {
        for (let i = 0; i < group.length; i += 2) rows.push(group.slice(i, i + 2));
    }

    return (
        <View style={{ gap: 14 }}>
            {rows.map((row) => (
                <View key={row.map((item) => item.key).join('|')} className="flex-row" style={{ gap: 12 }}>
                    {row.map((item) => (
                        <DetailCell key={item.key} item={item} />
                    ))}
                    {row.length === 1 && <View style={{ flex: 1 }} />}
                </View>
            ))}
        </View>
    );
}

function DetailCell({ item }: { item: DetailItem }) {
    const content = (
        <>
            <View className="flex-row items-center" style={{ gap: 5 }}>
                <Ionicons name={item.icon} size={12} color={item.color} />
                <Text className="shrink text-[9px] font-bold uppercase tracking-[1.2px] text-slate-500" numberOfLines={1}>
                    {item.label}
                </Text>
                {item.onPress && <Ionicons name="chevron-forward" size={11} color={COLORS.slate500} />}
            </View>
            <Text
                className="text-[14px] leading-[19px] font-black mt-1"
                style={{ color: item.valueColor ?? COLORS.foreground }}
                numberOfLines={2}
            >
                {item.value}
            </Text>
        </>
    );

    // The half is the wrapper's; the Pressable only fills it (its own style prop isn't applied
    // reliably here).
    return (
        <View style={{ flex: 1 }}>
            {item.onPress ? (
                <Pressable onPress={item.onPress} accessibilityRole="button" hitSlop={6} className="active:opacity-70">
                    {content}
                </Pressable>
            ) : (
                content
            )}
        </View>
    );
}

/**
 * Body text that folds to `collapsedLines` with a Show more / Show less toggle — only when it
 * actually runs longer. An invisible copy at the same width measures the full line count.
 */
export function ExpandableText({
    text,
    collapsedLines = 6,
    accentColor = COLORS.primaryBright,
}: {
    text: string;
    collapsedLines?: number;
    accentColor?: string;
}) {
    const { t } = useTranslation('common');
    const [expanded, setExpanded] = useState(false);
    const [overflows, setOverflows] = useState(false);

    return (
        <View>
            <Text
                className="text-[14px] leading-[21px] font-medium text-slate-300"
                numberOfLines={expanded ? undefined : collapsedLines}
            >
                {text}
            </Text>
            <View pointerEvents="none" style={styles.measure} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Text
                    className="text-[14px] leading-[21px] font-medium"
                    onTextLayout={(e) => setOverflows(e.nativeEvent.lines.length > collapsedLines)}
                >
                    {text}
                </Text>
            </View>
            {overflows && (
                <Pressable
                    onPress={() => setExpanded((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    className="self-start mt-2 active:opacity-60"
                >
                    <Text className="text-[13px] font-bold" style={{ color: accentColor }}>
                        {expanded ? t('app.showLess') : t('app.showMore')}
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    panel: {
        backgroundColor: COLORS.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    panelShine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
    },
    measure: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        opacity: 0,
    },
});

import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Dimensions,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBadges } from '../../context/BadgesContext';

const { width } = Dimensions.get('window');
const TAB_WIDTH = width / 4;

export function ModernTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const translateX = useRef(new Animated.Value(0)).current;
    const { badges } = useBadges();

    // Notification badge count per tab. Matches surface on Home (dashboard + My Matches);
    // friend requests / unread DMs surface under Social.
    const badgeForTab = (name: string): number => {
        switch (name) {
            case 'Home': return badges.matchesTotal;
            case 'Social': return badges.socialTotal;
            default: return 0;
        }
    };

    const tabWidth = width / state.routes.length;

    useEffect(() => {
        Animated.spring(translateX, {
            toValue: state.index * tabWidth,
            useNativeDriver: true,
            tension: 60,
            friction: 10,
        }).start();
    }, [state.index]);

    return (
        <View
            style={[
                styles.container,
                { paddingBottom: Math.max(insets.bottom, 8) }
            ]}
        >
            <View style={styles.tabWrapper}>
                {/* Animated Indicator Container */}
                <Animated.View
                    style={[
                        styles.indicatorContainer,
                        {
                            width: tabWidth,
                            transform: [{ translateX: translateX }],
                        },
                    ]}
                >
                    {/* Glowing Top Line */}
                    <View style={styles.topGlowLine} />
                    
                    {/* Subtle Circular Glow behind Icon */}
                    <View style={styles.activeGlowCircle} />
                </Animated.View>

                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    const getIconName = (name: string, focused: boolean): keyof typeof Ionicons.glyphMap => {
                        switch (name) {
                            case 'Home': return focused ? 'home' : 'home-outline';
                            case 'Tournaments': return focused ? 'trophy' : 'trophy-outline';
                            case 'Hubs': return focused ? 'planet' : 'planet-outline';
                            case 'Social': return focused ? 'chatbubbles' : 'chatbubbles-outline';
                            case 'Profile': return focused ? 'person' : 'person-outline';
                            default: return 'help-outline';
                        }
                    };

                    const label =
                        options.tabBarLabel !== undefined
                            ? options.tabBarLabel
                            : options.title !== undefined
                                ? options.title
                                : route.name;

                    const badgeCount = badgeForTab(route.name);

                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={onPress}
                            activeOpacity={0.7}
                            style={styles.tabButton}
                        >
                            <View style={styles.contentWrapper}>
                                <View>
                                    <Ionicons
                                        name={getIconName(route.name, isFocused)}
                                        size={22}
                                        color={isFocused ? '#10B981' : '#64748B'}
                                        style={isFocused && styles.activeIconGlow}
                                    />
                                    {badgeCount > 0 && (
                                        <View style={styles.badge}>
                                            <Text style={styles.badgeText} numberOfLines={1}>
                                                {badgeCount > 99 ? '99+' : badgeCount}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.85}
                                    style={[
                                        styles.tabLabel,
                                        { color: isFocused ? '#FFFFFF' : '#64748B' }
                                    ]}
                                >
                                    {label as string}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: '#0B1120', // Very deep premium slate
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 15,
    },
    tabWrapper: {
        flexDirection: 'row',
        height: 60,
        alignItems: 'center',
    },
    indicatorContainer: {
        position: 'absolute',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    topGlowLine: {
        position: 'absolute',
        top: -1,
        width: '40%',
        height: 3,
        backgroundColor: '#10B981',
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 4,
    },
    activeGlowCircle: {
        position: 'absolute',
        top: 8,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    tabButton: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    contentWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        marginTop: 4, // Shift slightly down to balance the top indicator
        width: '100%',
    },
    activeIconGlow: {
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
        letterSpacing: 0.2,
        textAlign: 'center',
    },
    badge: {
        position: 'absolute',
        top: -6,
        left: 12,
        minWidth: 17,
        height: 17,
        borderRadius: 9,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        borderWidth: 2,
        borderColor: '#0B1120',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '900',
        lineHeight: 12,
    },
});

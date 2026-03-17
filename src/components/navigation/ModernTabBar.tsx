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

const { width } = Dimensions.get('window');
const TAB_WIDTH = width / 4;

export function ModernTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const translateX = useRef(new Animated.Value(0)).current;

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

                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={onPress}
                            activeOpacity={0.7}
                            style={styles.tabButton}
                        >
                            <View style={styles.contentWrapper}>
                                <Ionicons
                                    name={getIconName(route.name, isFocused)}
                                    size={22}
                                    color={isFocused ? '#10B981' : '#64748B'}
                                    style={isFocused && styles.activeIconGlow}
                                />
                                <Text style={[
                                    styles.tabLabel,
                                    { color: isFocused ? '#FFFFFF' : '#64748B' }
                                ]}>
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
    },
    contentWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        marginTop: 4, // Shift slightly down to balance the top indicator
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
        letterSpacing: 0.5,
    },
});

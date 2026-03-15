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
const TAB_BAR_WIDTH = width - 32;
const TAB_WIDTH = TAB_BAR_WIDTH / 4;

export function ModernTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const translateX = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(translateX, {
            toValue: state.index * TAB_WIDTH,
            useNativeDriver: true,
            tension: 60,
            friction: 10,
        }).start();
    }, [state.index]);

    return (
        <View
            style={[
                styles.container,
                { bottom: Math.max(insets.bottom, 16) }
            ]}
        >
            <View style={styles.tabWrapper}>
                {/* Active Indicator (Rounded Square + Dot) */}
                <Animated.View
                    style={[
                        styles.indicatorContainer,
                        {
                            width: TAB_WIDTH,
                            transform: [{ translateX: translateX }],
                        },
                    ]}
                >
                    <View style={styles.dot} />
                    <View style={styles.activeSquare} />
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
                            case 'Hubs': return focused ? 'people' : 'people-outline';
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
                                    size={24}
                                    color={isFocused ? '#FFFFFF' : '#94A3B8'}
                                />
                                <Text style={[
                                    styles.tabLabel,
                                    { color: isFocused ? '#FFFFFF' : '#94A3B8' }
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
        position: 'absolute',
        left: 16,
        right: 16,
        height: 80,
        backgroundColor: 'rgba(15, 23, 42, 0.9)', // Muted slate
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
        elevation: 8,
    },
    tabWrapper: {
        flexDirection: 'row',
        height: '100%',
        alignItems: 'center',
    },
    indicatorContainer: {
        position: 'absolute',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        position: 'absolute',
        top: 6,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#10B981',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 4,
        elevation: 5,
    },
    activeSquare: {
        width: 64,
        height: 64,
        backgroundColor: '#10B981', // Emerald fill
        borderRadius: 20,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
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
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
        letterSpacing: 0.5,
    },
});

import React from 'react';
import { View, Text, TextInput, TextInputProps, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
    leftIcon?: keyof typeof Ionicons.glyphMap;
    rightIcon?: keyof typeof Ionicons.glyphMap;
    onRightIconPress?: () => void;
}

export function Input({
    label,
    error,
    leftIcon,
    rightIcon,
    onRightIconPress,
    className,
    ...props
}: InputProps) {
    return (
        <View className={`w-full ${className}`}>
            {label && (
                <Text className="text-sm font-medium text-muted-foreground mb-1.5 ml-1">
                    {label}
                </Text>
            )}
            <View className={`
                flex-row items-center w-full h-12 bg-card/50 border rounded-xl px-3
                ${error ? 'border-destructive' : 'border-border'}
                focus:border-primary focus:bg-card
            `}>
                {leftIcon && (
                    <Ionicons
                        name={leftIcon}
                        size={20}
                        color={error ? "hsl(0, 72%, 51%)" : "hsl(220, 15%, 55%)"}
                        style={{ marginRight: 8 }}
                    />
                )}
                <TextInput
                    className="flex-1 text-foreground text-base h-full"
                    placeholderTextColor="hsl(220, 15%, 55%)"
                    {...props}
                />
                {rightIcon && (
                    <TouchableOpacity onPress={onRightIconPress} disabled={!onRightIconPress}>
                        <Ionicons
                            name={rightIcon}
                            size={20}
                            color="hsl(220, 15%, 55%)"
                        />
                    </TouchableOpacity>
                )}
            </View>
            {error && (
                <Text className="text-xs text-destructive mt-1 ml-1">
                    {error}
                </Text>
            )}
        </View>
    );
}

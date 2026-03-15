import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Button } from '../components/ui/Button';

export default function NotFoundScreen() {
    const route = useRoute();
    const navigation = useNavigation<any>();

    useEffect(() => {
        console.error("404 Error: User attempted to access non-existent route:", route.name);
    }, [route.name]);

    return (
        <SafeAreaView className="flex-1 bg-background items-center justify-center">
            <View className="items-center px-6">
                <Text className="text-6xl font-bold text-primary mb-4">404</Text>
                <Text className="text-xl font-semibold text-foreground mb-2">Oops! Page not found</Text>
                <Text className="text-base text-muted-foreground text-center mb-8">
                    The screen you're looking for doesn't exist or has been moved.
                </Text>
                <Button onPress={() => navigation.navigate('MainTabs')} className="w-full">
                    Return to Home
                </Button>
            </View>
        </SafeAreaView>
    );
}

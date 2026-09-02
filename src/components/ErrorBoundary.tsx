import i18n from '../i18n';
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    children: React.ReactNode;
}

interface State {
    error: Error | null;
}

/**
 * Root-level error boundary. Catches any render / lifecycle error thrown by a
 * descendant and shows a graceful fallback instead of the app crashing to a
 * white screen. The user can tap "Try again" to reset — that clears the error
 * state and re-renders the tree; if the underlying cause is transient (bad
 * server payload, race condition, one-off render bug) the app recovers in-place
 * without a full relaunch.
 *
 * Class component because that's the only API React provides for catching
 * render-time errors; there's no hook equivalent.
 */
export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Log both to native + JS console so it surfaces in Metro / adb logcat /
        // Xcode console. In production the App.tsx no-op silences console.log but
        // console.error is untouched, so this still reaches Crashlytics/Sentry
        // if/when they get wired in.
        // eslint-disable-next-line no-console
        console.error('[ErrorBoundary] Render error:', error, info.componentStack);
    }

    reset = () => this.setState({ error: null });

    render() {
        if (!this.state.error) return this.props.children;

        const message = this.state.error.message || i18n.t('common:app.unexpectedCrash');
        return (
            <View className="flex-1 bg-background items-center justify-center px-6">
                <View className="w-16 h-16 rounded-3xl bg-red-500/10 items-center justify-center mb-4">
                    <Ionicons name="warning" size={28} color="#EF4444" />
                </View>
                <Text className="text-lg font-black text-white mb-2 text-center">
                    {i18n.t('common:app.somethingWentWrong')}
                </Text>
                <Text className="text-xs text-slate-500 text-center mb-6 leading-5">
                    {message}
                </Text>
                <Pressable
                    onPress={this.reset}
                    className="px-6 py-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 active:opacity-70"
                >
                    <Text className="text-sm font-bold text-indigo-300">{i18n.t('common:app.tryAgain')}</Text>
                </Pressable>
                <Text className="text-[10px] text-slate-700 text-center mt-8 leading-4">
                    {i18n.t('common:app.keepsHappening')}
                </Text>
            </View>
        );
    }
}

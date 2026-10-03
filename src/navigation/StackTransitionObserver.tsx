import React, { useLayoutEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import { observeStackTransitions } from './stackTransitions';

/** The outgoing scene stays mounted until its animation ends, even after POP removes its route. */
export function StackTransitionObserver({ children }: { children: React.ReactNode }) {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    useLayoutEffect(() => observeStackTransitions(navigation), [navigation]);
    return <>{children}</>;
}

import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { getTeamShareSummary } from '../lib/teamApi';

type TeamRouteProp = RouteProp<RootStackParamList, 'Team'>;

/**
 * Landing for a shared /team/{id} link. A team only makes sense inside its
 * tournament, so we resolve the tournament from the teamId and then replace
 * ourselves with TournamentDetails (focused on this team, with a join prompt).
 * Pure pass-through screen — just a spinner while the lookup runs.
 */
export default function TeamRedirectScreen() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const route = useRoute<TeamRouteProp>();
    const { teamId } = route.params;
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;
        handled.current = true;

        (async () => {
            try {
                const team = await getTeamShareSummary(teamId);
                navigation.replace('TournamentDetails', {
                    id: team.tournamentId,
                    focusTeamId: team.teamId,
                    focusTeamName: team.teamName,
                    focusTeamRequiresApproval: team.requiresApproval,
                });
            } catch {
                navigation.replace('NotFound');
            }
        })();
    }, [teamId, navigation]);

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1120' }}>
            <ActivityIndicator size="large" color="#10B981" />
        </View>
    );
}

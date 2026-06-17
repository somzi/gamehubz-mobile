import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS, authenticatedFetch } from '../../lib/api';
import { DateTimePickerModal } from './DateTimePickerModal';
import { SWISS_KNOCKOUT_OPTIONS, TEAM_TOURNAMENT_FORMATS, TOURNAMENT_FORMAT_OPTIONS, TournamentFormat, TournamentRegion } from '../../types/tournament';
import { TEAM_LABELS } from '../../lib/teamConstants';
import { CountryPicker } from '../ui/CountryPicker';

interface CreateTournamentModalProps {
    visible: boolean;
    onClose: () => void;
    hubId?: string;
}

const regions = [
    { value: 'global', label: 'Global (No Restrictions)' },
    { value: 'europe', label: 'Europe' },
    { value: 'north-america', label: 'North America' },
    { value: 'south-america', label: 'South America' },
    { value: 'asia', label: 'Asia' },
    { value: 'africa', label: 'Africa' },
    { value: 'oceania', label: 'Oceania' },
];

const prizeCurrencies = [
    { value: '1', label: 'EUR' },
    { value: '2', label: 'USD' },
    { value: '3', label: 'StarPass' },
    { value: '4', label: 'FCP' },
];

const durationUnits = [
    { value: 'Minutes', label: 'Minutes' },
    { value: 'Hours', label: 'Hours' },
    { value: 'Days', label: 'Days' },
];

const teamWinConditions = [
    { value: '0', label: 'Match Wins' },
    { value: '1', label: 'Aggregate Score' },
];

const regionMapping: Record<string, number> = {
    'global': TournamentRegion.Global,
    'north-america': TournamentRegion.NorthAmerica,
    'europe': TournamentRegion.Europe,
    'asia': TournamentRegion.Asia,
    'south-america': TournamentRegion.SouthAmerica,
    'africa': TournamentRegion.Africa,
    'oceania': TournamentRegion.Oceania,
};

export function CreateTournamentModal({ visible, onClose, hubId }: CreateTournamentModalProps) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [rules, setRules] = useState('');
    const [selectedHubId, setSelectedHubId] = useState<string>('');
    const [selectedRegions, setSelectedRegions] = useState<string[]>(['global']);
    // Scope: a tournament is either region-scoped (existing) or country-scoped (one or more countries).
    const [scopeMode, setScopeMode] = useState<'region' | 'country'>('region');
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);

    const toggleCountry = (code: string) => {
        setSelectedCountries(prev =>
            prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
        );
    };
    const [prizePool, setPrizePool] = useState('');
    const [prizeCurrency, setPrizeCurrency] = useState('1'); // Default to Eur
    const [maxPlayers, setMaxPlayers] = useState('');
    const [startDate, setStartDate] = useState('');
    const [registrationDeadline, setRegistrationDeadline] = useState('');
    const [selectedFormat, setSelectedFormat] = useState('3'); // Default to Single Elimination (or choose a safer default)
    const [groupsCount, setGroupsCount] = useState('4');
    const [qualifiersPerGroup, setQualifiersPerGroup] = useState('2');
    // League / Groups: each pair plays twice when on (home + away leg).
    const [doubleRoundRobin, setDoubleRoundRobin] = useState(false);
    const [inviteFollowers, setInviteFollowers] = useState(false);

    // Swiss format config: rounds (empty = auto), knockout size ('0' = pure Swiss),
    // direct berths (empty = everyone qualifies directly, no play-in).
    const [swissRounds, setSwissRounds] = useState('');
    const [swissKnockout, setSwissKnockout] = useState('0');
    const [swissDirect, setSwissDirect] = useState('');

    // Round Duration
    const [roundDurationValue, setRoundDurationValue] = useState('');
    const [roundDurationUnit, setRoundDurationUnit] = useState('Minutes'); // Minutes | Hours | Days

    // Team mode
    const [isTeamTournament, setIsTeamTournament] = useState(false);
    const [teamSize, setTeamSize] = useState('');
    const [teamWinCondition, setTeamWinCondition] = useState('0');

    // Third place play-off (single elimination only)
    const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(false);

    // Result approval — when on, reported scores need opponent (or admin) confirmation.
    const [requireResultApproval, setRequireResultApproval] = useState(false);

    // Exclusive — when on, only Exclusive-or-higher hub members can see/join the tournament.
    const [isExclusive, setIsExclusive] = useState(false);

    // Data State
    const [hubs, setHubs] = useState<{ id: string; name: string }[]>([]);
    const [isLoadingHubs, setIsLoadingHubs] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Picker States
    const [showHubPicker, setShowHubPicker] = useState(false);
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showRegDeadlinePicker, setShowRegDeadlinePicker] = useState(false);
    const [showFormatPicker, setShowFormatPicker] = useState(false);
    const [showDurationUnitPicker, setShowDurationUnitPicker] = useState(false);
    const [showTeamWinConditionPicker, setShowTeamWinConditionPicker] = useState(false);
    const [showSwissKnockoutPicker, setShowSwissKnockoutPicker] = useState(false);

    // Fetch Hubs
    useEffect(() => {
        if (visible && user?.id) {
            const fetchHubs = async () => {
                setIsLoadingHubs(true);
                try {
                    const response = await authenticatedFetch(ENDPOINTS.GET_USER_HUBS(user.id));
                    if (response.ok) {
                        const data = await response.json();
                        // Handle both direct array and wrapped { items: [] } pattern
                        const hubsList = Array.isArray(data) ? data : (data.items || []);

                        const formattedHubs = hubsList
                            .filter((h: any) => h.id || h.hubId) // ONLY hubs with a GUID
                            .map((h: any) => ({
                                id: h.id || h.hubId,
                                name: h.name || h.hubName || 'Unnamed Hub'
                            }));

                        setHubs(formattedHubs);
                        if (hubId) {
                            setSelectedHubId(hubId);
                        } else if (formattedHubs.length > 0) {
                            setSelectedHubId(formattedHubs[0].id);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching user hubs:', error);
                } finally {
                    setIsLoadingHubs(false);
                }
            };
            fetchHubs();
        }
    }, [visible, user?.id, hubId]);

    const handleRegionSelect = (regionValue: string) => {
        if (regionValue === 'global') {
            setSelectedRegions(['global']);
            return;
        }

        let updated = selectedRegions.includes('global')
            ? [regionValue]
            : selectedRegions.includes(regionValue)
                ? selectedRegions.filter(r => r !== regionValue)
                : [...selectedRegions, regionValue];

        if (updated.length === 0) updated = ['global'];
        setSelectedRegions(updated);
    };

    const getRegionLabel = () => {
        if (selectedRegions.includes('global')) return 'Global (No Restrictions)';
        if (selectedRegions.length === 1) {
            return regions.find(r => r.value === selectedRegions[0])?.label ?? 'Region';
        }
        return `${selectedRegions.length} Regions Selected`;
    };

    const getHubLabel = () => {
        if (isLoadingHubs) return 'Loading hubs...';
        if (hubs.length === 0) return 'No hubs found';
        return hubs.find(h => h.id === selectedHubId)?.name || 'Select Hub';
    };

    const getCurrencyLabel = () => {
        return prizeCurrencies.find(c => c.value === prizeCurrency)?.label || 'Currency';
    };

    const getFormatLabel = () => {
        return TOURNAMENT_FORMAT_OPTIONS.find(f => f.value === selectedFormat)?.label || 'Select Format';
    };

    // Number of bracket entrants: players for solo, teams for team tournaments.
    const participantCount = (() => {
        const mp = parseInt(maxPlayers);
        if (isTeamTournament) {
            const ts = parseInt(teamSize);
            if (!ts || ts <= 0 || !mp) return 0;
            return Math.floor(mp / ts);
        }
        return mp || 0;
    })();
    // Third place only makes sense for a single-elimination bracket with more than 2 entrants.
    const canShowThirdPlace = selectedFormat === String(TournamentFormat.SingleElimination) && participantCount > 2;

    const isSwiss = selectedFormat === String(TournamentFormat.Swiss);
    const swissKnockoutSize = isSwiss ? parseInt(swissKnockout) || 0 : 0;
    // Empty direct input = every knockout slot is a direct berth (no play-in).
    const swissDirectCount = swissKnockout !== '0' && swissDirect !== ''
        ? parseInt(swissDirect)
        : swissKnockoutSize;
    const swissPlayInPlayers = swissKnockoutSize > 0 && swissDirectCount < swissKnockoutSize
        ? 2 * (swissKnockoutSize - swissDirectCount)
        : 0;

    useEffect(() => {
        if (!isTeamTournament) {
            return;
        }

        const selectedFormatValue = Number(selectedFormat);
        const isAllowedTeamFormat = TEAM_TOURNAMENT_FORMATS.some((format) => format === selectedFormatValue);

        if (!isAllowedTeamFormat) {
            setSelectedFormat(String(TournamentFormat.SingleElimination));
        }
    }, [isTeamTournament, selectedFormat]);

    const handleSubmit = async () => {
        if (!name || !selectedHubId) {
            setError('Tournament name and Hub are required');
            return;
        }

        if (!maxPlayers || isNaN(parseInt(maxPlayers)) || parseInt(maxPlayers) <= 0) {
            setError('Valid Max Players count is required (must be greater than 0)');
            return;
        }

        if (scopeMode === 'country' && selectedCountries.length === 0) {
            setError('Please select at least one country for a country-based tournament');
            return;
        }

        if (isTeamTournament) {
            const ts = parseInt(teamSize);
            if (!teamSize || isNaN(ts) || ts < 2 || ts > 11) {
                setError('Team size must be between 2 and 11');
                return;
            }
            const mp = parseInt(maxPlayers);
            if (mp < ts * 2) {
                setError(`Max Players must be at least ${ts * 2} (Team Size × 2) to allow a minimum of 2 teams`);
                return;
            }

            const selectedFormatValue = Number(selectedFormat);
            const isAllowedTeamFormat = TEAM_TOURNAMENT_FORMATS.some((format) => format === selectedFormatValue);
            if (!isAllowedTeamFormat) {
                setError('Team tournaments only support Single Bracket, League, or Groups + Bracket');
                return;
            }
        }

        if (selectedFormat === String(TournamentFormat.DoubleElimination) && participantCount > 0 && participantCount < 4) {
            setError('Double Elimination requires at least 4 players — raise Max Players');
            return;
        }

        if (isSwiss && swissKnockoutSize > 0) {
            if (swissKnockoutSize > participantCount) {
                setError(`Knockout qualifiers (${swissKnockoutSize}) cannot exceed Max Players (${participantCount})`);
                return;
            }
            if (isNaN(swissDirectCount) || swissDirectCount < 0 || swissDirectCount > swissKnockoutSize) {
                setError(`Direct qualifiers must be between 0 and ${swissKnockoutSize}`);
                return;
            }
            if (swissPlayInPlayers > 0 && swissDirectCount + swissPlayInPlayers > participantCount) {
                setError(`Play-in needs ${swissDirectCount + swissPlayInPlayers} players (${swissDirectCount} direct + ${swissPlayInPlayers} play-in) but Max Players is ${participantCount}`);
                return;
            }
        }

        if (!startDate || !registrationDeadline) {
            setError('Please set both Registration Deadline and Start Date');
            return;
        }

        const now = new Date();
        const start = new Date(startDate.replace(' ', 'T'));
        const deadline = new Date(registrationDeadline.replace(' ', 'T'));

        if (deadline < now) {
            setError('Registration deadline cannot be in the past');
            return;
        }

        if (start < deadline) {
            setError('Start date cannot be earlier than the registration deadline');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const formatToISO = (dateStr: string) => {
                if (!dateStr) return null;
                // Handle different date formats or default to now
                try {
                    const d = new Date(dateStr.replace(' ', 'T'));
                    return d.toISOString();
                } catch (e) {
                    return new Date().toISOString();
                }
            };

            let roundDurationMinutes: number | null = null;
            if ((selectedFormat === '0' || selectedFormat === '5' || isSwiss) && roundDurationValue) {
                const val = parseInt(roundDurationValue);
                if (!isNaN(val)) {
                    if (roundDurationUnit === 'Minutes') roundDurationMinutes = val;
                    else if (roundDurationUnit === 'Hours') roundDurationMinutes = val * 60;
                    else if (roundDurationUnit === 'Days') roundDurationMinutes = val * 1440;
                }
            }

            const tournamentPayload = {
                HubId: selectedHubId,
                Name: name,
                Description: description || "",
                Rules: rules || "",
                Status: 1,
                MaxPlayers: parseInt(maxPlayers) || 0,
                StartDate: formatToISO(startDate),
                RegistrationDeadline: formatToISO(registrationDeadline),
                Prize: parseFloat(prizePool) || 0,
                PrizeCurrency: parseInt(prizeCurrency) || 1,
                Region: regionMapping[selectedRegions[0]] ?? 0,
                // Country-scoped when the country tab is active; backend derives Region from the first.
                Countries: scopeMode === 'country' ? selectedCountries : null,
                Format: parseInt(selectedFormat),
                GroupsCount: selectedFormat === '5' ? parseInt(groupsCount) : null,
                QualifiersPerGroup: selectedFormat === '5' ? parseInt(qualifiersPerGroup) : null,
                SwissRoundsCount: isSwiss && swissRounds ? parseInt(swissRounds) : null,
                SwissKnockoutQualifiers: isSwiss && swissKnockoutSize > 0 ? swissKnockoutSize : null,
                SwissDirectQualifiers: isSwiss && swissKnockoutSize > 0 && swissDirectCount < swissKnockoutSize
                    ? swissDirectCount
                    : null,
                RoundDurationMinutes: roundDurationMinutes,
                IsTeamTournament: isTeamTournament,
                TeamSize: isTeamTournament ? parseInt(teamSize) : null,
                TeamWinCondition: parseInt(teamWinCondition) || 0,
                HasThirdPlaceMatch: canShowThirdPlace ? hasThirdPlaceMatch : false,
                RequireResultApproval: requireResultApproval,
                IsExclusive: isExclusive,
                DoubleRoundRobin: (selectedFormat === '0' || selectedFormat === '5') ? doubleRoundRobin : false,
            };

            const requestBody = {
                ...tournamentPayload,
                inputDto: tournamentPayload,
                modelSave: tournamentPayload,
            };

            console.log('Creating tournament with payload:', requestBody);
            console.log('Create tournament request JSON:', JSON.stringify(requestBody));
            console.log('Endpoint:', ENDPOINTS.CREATE_TOURNAMENT);

            const response = await authenticatedFetch(ENDPOINTS.CREATE_TOURNAMENT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                console.error('Create tournament failed - Status:', response.status, '- Body:', errorText);
                let errorMessage = 'Failed to create tournament';
                try {
                    const parsed = JSON.parse(errorText);
                    errorMessage = parsed.message || parsed.Message || parsed.title || (parsed.errors ? JSON.stringify(parsed.errors) : null) || errorMessage;
                } catch {}
                throw new Error(errorMessage);
            }

            console.log('Tournament created successfully');
            onClose();
        } catch (err: any) {
            console.error('Error creating tournament:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderSelectField = (
        label: string,
        value: string,
        icon: keyof typeof Ionicons.glyphMap,
        onPress: () => void,
        isLoading = false
    ) => (
        <View className="flex-1">
            <View className="flex-row items-center mb-3">
                <Ionicons name={icon} size={16} color="#10B981" style={{ marginRight: 6 }} />
                <Text className="text-sm font-bold text-white">{label}</Text>
            </View>
            <TouchableOpacity
                onPress={onPress}
                disabled={isLoading}
                className="bg-[#131B2E] p-3 h-12 rounded-xl border border-white/10 flex-row justify-between items-center"
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color="#10B981" />
                ) : (
                    <Text className="text-white text-sm" numberOfLines={1}>{value}</Text>
                )}
                {!isLoading && !hubId && <Ionicons name="chevron-down" size={16} color="#94A3B8" />}
            </TouchableOpacity>
        </View>
    );

    const renderOptionsModal = (
        visible: boolean,
        onCloseModal: () => void,
        options: ReadonlyArray<{ value: string; label: any }>,
        selected: string | string[],
        onSelect: (val: string) => void,
        multi = false
    ) => {
        if (!visible) return null;
        return (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
                <Pressable className="flex-1 bg-black/60 justify-center px-6" onPress={onCloseModal}>
                    <Pressable className="bg-[#131B2E] rounded-3xl border border-white/10 max-h-[60%] overflow-hidden shadow-2xl">
                        <ScrollView contentContainerStyle={{ padding: 12 }}>
                            {options.map(opt => {
                                const active = multi
                                    ? (selected as string[]).includes(opt.value)
                                    : selected === opt.value;

                                return (
                                    <TouchableOpacity
                                        key={opt.value}
                                        onPress={() => {
                                            onSelect(opt.value);
                                            if (!multi) onCloseModal();
                                        }}
                                        className={`p-4 mb-2 rounded-2xl flex-row justify-between items-center ${active ? 'bg-[#10B981]' : 'bg-[#1E293B]'
                                            }`}
                                    >
                                        <Text className={`${active ? 'text-black' : 'text-white'} font-semibold`}>
                                            {opt.label}
                                        </Text>
                                        {active && <Ionicons name="checkmark" size={18} color="#000" />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </View>
        );
    };

    if (!visible) return null;

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
            <View
                className="flex-1 bg-black/80 px-4 justify-center"
                style={{
                    paddingTop: insets.top + 20,
                    paddingBottom: insets.bottom + 20,
                }}
            >
                <View className="bg-[#0f172a] w-full rounded-[40px] border border-white/10 shadow-2xl overflow-hidden max-h-full">
                    <View className="flex-row justify-between items-center p-6 border-b border-white/5">
                        <Text className="text-xl font-bold text-white">Create Tournament</Text>
                        <TouchableOpacity onPress={onClose} className="bg-white/5 p-2 rounded-full">
                            <Ionicons name="close" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        className="px-6 py-4"
                        contentContainerStyle={{ paddingBottom: 32 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <View className="flex flex-col gap-y-6">
                            {/* Hub Selection */}
                            {renderSelectField(
                                'Hub',
                                getHubLabel(),
                                'business-outline',
                                () => hubId ? null : setShowHubPicker(true),
                                isLoadingHubs
                            )}

                            <View>
                                <Text className="text-sm font-bold text-white mb-3">Tournament Name</Text>
                                <TextInput
                                    className="bg-[#131B2E] p-4 rounded-xl text-white border border-white/10"
                                    placeholder="Enter tournament name"
                                    placeholderTextColor="#6b7280"
                                    value={name}
                                    onChangeText={setName}
                                />
                            </View>

                            <View>
                                <Text className="text-sm font-bold text-white mb-3">Description</Text>
                                <TextInput
                                    multiline
                                    className="bg-[#131B2E] p-4 h-24 rounded-xl text-white border border-white/10"
                                    placeholder="Describe your tournament..."
                                    placeholderTextColor="#6b7280"
                                    textAlignVertical="top"
                                    value={description}
                                    onChangeText={setDescription}
                                />
                            </View>

                            <View>
                                <View className="flex-row items-center mb-3">
                                    <Ionicons name="document-text-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                    <Text className="text-sm font-bold text-white">Rules</Text>
                                </View>
                                <TextInput
                                    multiline
                                    className="bg-[#131B2E] p-4 h-24 rounded-xl text-white border border-white/10"
                                    placeholder="Enter tournament rules (e.g., Best of 3...)"
                                    placeholderTextColor="#6b7280"
                                    textAlignVertical="top"
                                    value={rules}
                                    onChangeText={setRules}
                                />
                            </View>

                            <View className="flex-row gap-4">
                                <View className="flex-1">
                                    <Text className="text-sm font-bold text-white mb-3">Max Players *</Text>
                                    <TextInput
                                        className="bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-white/10"
                                        placeholder="e.g. 16"
                                        placeholderTextColor="#6b7280"
                                        keyboardType="numeric"
                                        value={maxPlayers}
                                        onChangeText={setMaxPlayers}
                                    />
                                </View>
                                <View className="flex-1">
                                    {renderSelectField('Format', getFormatLabel(), 'list-outline', () =>
                                        setShowFormatPicker(true)
                                    )}
                                </View>
                            </View>

                            {/* Tournament Scope: region-based or country-based */}
                            <View>
                                <View className="flex-row items-center mb-3">
                                    <Ionicons name="globe-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                    <Text className="text-sm font-bold text-white">Tournament Scope</Text>
                                </View>
                                <View className="bg-[#131B2E] p-1 rounded-2xl flex-row border border-white/5 mb-3">
                                    <Pressable
                                        onPress={() => setScopeMode('region')}
                                        className={`flex-1 py-2.5 rounded-xl items-center ${scopeMode === 'region' ? 'bg-primary' : ''}`}
                                    >
                                        <Text className={`text-sm font-bold ${scopeMode === 'region' ? 'text-[#0F172A]' : 'text-slate-400'}`}>By Region</Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => setScopeMode('country')}
                                        className={`flex-1 py-2.5 rounded-xl items-center ${scopeMode === 'country' ? 'bg-primary' : ''}`}
                                    >
                                        <Text className={`text-sm font-bold ${scopeMode === 'country' ? 'text-[#0F172A]' : 'text-slate-400'}`}>By Country</Text>
                                    </Pressable>
                                </View>

                                {scopeMode === 'region' ? (
                                    renderSelectField('Region', getRegionLabel(), 'earth-outline', () =>
                                        setShowRegionPicker(true)
                                    )
                                ) : (
                                    <CountryPicker
                                        placeholder="Select countries"
                                        multiple
                                        values={selectedCountries}
                                        onToggle={toggleCountry}
                                    />
                                )}
                            </View>

                            {/* Tournament Mode Toggle */}
                            <View>
                                <View className="flex-row items-center mb-3">
                                    <Ionicons name="people-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                    <Text className="text-sm font-bold text-white">{TEAM_LABELS.MODE_LABEL}</Text>
                                </View>
                                <View className="bg-[#131B2E] p-1 rounded-2xl flex-row border border-white/5">
                                    <Pressable
                                        onPress={() => setIsTeamTournament(false)}
                                        className={`flex-1 py-3 rounded-xl items-center justify-center ${!isTeamTournament ? 'bg-[#4F46E5]' : ''}`}
                                    >
                                        <Text className={`text-xs font-bold tracking-wide ${!isTeamTournament ? 'text-white' : 'text-zinc-500'}`}>
                                            {TEAM_LABELS.MODE_SOLO}
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => setIsTeamTournament(true)}
                                        className={`flex-1 py-3 rounded-xl items-center justify-center ${isTeamTournament ? 'bg-[#4F46E5]' : ''}`}
                                    >
                                        <Text className={`text-xs font-bold tracking-wide ${isTeamTournament ? 'text-white' : 'text-zinc-500'}`}>
                                            {TEAM_LABELS.MODE_TEAM}
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>

                            {/* Team Size & Win Cond (visible only for Team mode) */}
                            {isTeamTournament && (
                                <View className="flex-row gap-4 mb-2">
                                    <View className="flex-1">
                                        <View className="flex-row items-center mb-3">
                                            <Ionicons name="grid-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                            <Text className="text-sm font-bold text-white">{TEAM_LABELS.TEAM_SIZE_LABEL} *</Text>
                                        </View>
                                        <TextInput
                                            className="bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-white/10 text-sm"
                                            placeholder={TEAM_LABELS.TEAM_SIZE_PLACEHOLDER}
                                            placeholderTextColor="#6b7280"
                                            keyboardType="numeric"
                                            value={teamSize}
                                            onChangeText={setTeamSize}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <View className="flex-row items-center mb-3">
                                            <Ionicons name="trophy-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                            <Text className="text-sm font-bold text-white">Win Condition</Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setShowTeamWinConditionPicker(true)}
                                            className="bg-[#131B2E] px-4 h-12 rounded-xl border border-white/10 flex-row items-center justify-between"
                                        >
                                            <Text className="text-white text-sm" numberOfLines={1}>
                                                {teamWinConditions.find(c => c.value === teamWinCondition)?.label || 'Select'}
                                            </Text>
                                            <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {/* Result Approval */}
                            <View>
                                <View className="flex-row items-center mb-3">
                                    <Ionicons name="shield-checkmark-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                    <Text className="text-sm font-bold text-white">Require Result Approval</Text>
                                </View>
                                <View className="bg-[#131B2E] p-1 rounded-2xl flex-row border border-white/5">
                                    <Pressable
                                        onPress={() => setRequireResultApproval(false)}
                                        className={`flex-1 py-3 rounded-xl items-center justify-center ${!requireResultApproval ? 'bg-[#4F46E5]' : ''}`}
                                    >
                                        <Text className={`text-xs font-bold tracking-wide ${!requireResultApproval ? 'text-white' : 'text-zinc-500'}`}>
                                            NO
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => setRequireResultApproval(true)}
                                        className={`flex-1 py-3 rounded-xl items-center justify-center ${requireResultApproval ? 'bg-[#4F46E5]' : ''}`}
                                    >
                                        <Text className={`text-xs font-bold tracking-wide ${requireResultApproval ? 'text-white' : 'text-zinc-500'}`}>
                                            YES
                                        </Text>
                                    </Pressable>
                                </View>
                                <Text className="text-[11px] text-zinc-500 mt-2">
                                    When ON, the opposing participant must confirm a reported result. The hub owner or admin can override.
                                </Text>
                            </View>

                            {/* Exclusive members only */}
                            <View>
                                <View className="flex-row items-center mb-3">
                                    <Ionicons name="sparkles-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                    <Text className="text-sm font-bold text-white">Exclusive Members Only</Text>
                                </View>
                                <View className="bg-[#131B2E] p-1 rounded-2xl flex-row border border-white/5">
                                    <Pressable
                                        onPress={() => setIsExclusive(false)}
                                        className={`flex-1 py-3 rounded-xl items-center justify-center ${!isExclusive ? 'bg-[#4F46E5]' : ''}`}
                                    >
                                        <Text className={`text-xs font-bold tracking-wide ${!isExclusive ? 'text-white' : 'text-zinc-500'}`}>
                                            NO
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => setIsExclusive(true)}
                                        className={`flex-1 py-3 rounded-xl items-center justify-center ${isExclusive ? 'bg-[#4F46E5]' : ''}`}
                                    >
                                        <Text className={`text-xs font-bold tracking-wide ${isExclusive ? 'text-white' : 'text-zinc-500'}`}>
                                            YES
                                        </Text>
                                    </Pressable>
                                </View>
                                <Text className="text-[11px] text-zinc-500 mt-2">
                                    When ON, only hub members with the Exclusive role (or admins/owner) can see and join this tournament.
                                </Text>
                            </View>

                            {/* Third Place Match (single elimination, > 2 entrants) */}
                            {canShowThirdPlace && (
                                <View>
                                    <View className="flex-row items-center mb-3">
                                        <Ionicons name="medal-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                        <Text className="text-sm font-bold text-white">Third Place Match</Text>
                                    </View>
                                    <View className="bg-[#131B2E] p-1 rounded-2xl flex-row border border-white/5">
                                        <Pressable
                                            onPress={() => setHasThirdPlaceMatch(false)}
                                            className={`flex-1 py-3 rounded-xl items-center justify-center ${!hasThirdPlaceMatch ? 'bg-[#4F46E5]' : ''}`}
                                        >
                                            <Text className={`text-xs font-bold tracking-wide ${!hasThirdPlaceMatch ? 'text-white' : 'text-zinc-500'}`}>
                                                NO
                                            </Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => setHasThirdPlaceMatch(true)}
                                            className={`flex-1 py-3 rounded-xl items-center justify-center ${hasThirdPlaceMatch ? 'bg-[#4F46E5]' : ''}`}
                                        >
                                            <Text className={`text-xs font-bold tracking-wide ${hasThirdPlaceMatch ? 'text-white' : 'text-zinc-500'}`}>
                                                YES
                                            </Text>
                                        </Pressable>
                                    </View>
                                    <Text className="text-[11px] text-zinc-500 mt-2">
                                        Adds a third place match. Skipped if fewer than 4 participants register.
                                    </Text>
                                </View>
                            )}

                            {selectedFormat === '5' && (
                                <View className="flex-row gap-4">
                                    <View className="flex-1">
                                        <Text className="text-sm font-bold text-white mb-3">Groups Count</Text>
                                        <TextInput
                                            className="bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-white/10"
                                            placeholder="e.g. 4"
                                            placeholderTextColor="#6b7280"
                                            keyboardType="numeric"
                                            value={groupsCount}
                                            onChangeText={setGroupsCount}
                                        />
                                        <Text className="text-[11px] text-zinc-500 mt-2">
                                            How many groups players will be split into.
                                        </Text>
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-sm font-bold text-white mb-3">Qualifiers / Group</Text>
                                        <TextInput
                                            className="bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-white/10"
                                            placeholder="e.g. 2"
                                            placeholderTextColor="#6b7280"
                                            keyboardType="numeric"
                                            value={qualifiersPerGroup}
                                            onChangeText={setQualifiersPerGroup}
                                        />
                                        <Text className="text-[11px] text-zinc-500 mt-2">
                                            How many players from each group advance to the knockout bracket.
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Double round robin — every pair plays twice (home + away). Shown for League and Groups+Bracket. */}
                            {(selectedFormat === '0' || selectedFormat === '5') && (
                                <View>
                                    <View className="flex-row items-center mb-3">
                                        <Ionicons name="repeat-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                        <Text className="text-sm font-bold text-white">Double Round Robin</Text>
                                    </View>
                                    <View className="bg-[#131B2E] p-1 rounded-2xl flex-row border border-white/5">
                                        <Pressable
                                            onPress={() => setDoubleRoundRobin(false)}
                                            className={`flex-1 py-3 rounded-xl items-center justify-center ${!doubleRoundRobin ? 'bg-[#4F46E5]' : ''}`}
                                        >
                                            <Text className={`text-xs font-bold tracking-wide ${!doubleRoundRobin ? 'text-white' : 'text-zinc-500'}`}>
                                                NO
                                            </Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => setDoubleRoundRobin(true)}
                                            className={`flex-1 py-3 rounded-xl items-center justify-center ${doubleRoundRobin ? 'bg-[#4F46E5]' : ''}`}
                                        >
                                            <Text className={`text-xs font-bold tracking-wide ${doubleRoundRobin ? 'text-white' : 'text-zinc-500'}`}>
                                                YES
                                            </Text>
                                        </Pressable>
                                    </View>
                                    <Text className="text-[11px] text-zinc-500 mt-2">
                                        Every pair plays twice — one home leg and one away leg. Doubles the match count.
                                    </Text>
                                </View>
                            )}

                            {isSwiss && (
                                <View className="flex flex-col gap-y-6">
                                    <View className="flex-row gap-4">
                                        <View className="flex-1">
                                            <View className="flex-row items-center mb-3">
                                                <Ionicons name="repeat-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                                <Text className="text-sm font-bold text-white">Swiss Rounds</Text>
                                            </View>
                                            <TextInput
                                                className="bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-white/10"
                                                placeholder="Auto"
                                                placeholderTextColor="#6b7280"
                                                keyboardType="numeric"
                                                value={swissRounds}
                                                onChangeText={setSwissRounds}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <View className="flex-row items-center mb-3">
                                                <Ionicons name="git-merge-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                                <Text className="text-sm font-bold text-white">Knockout Stage</Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => setShowSwissKnockoutPicker(true)}
                                                className="bg-[#131B2E] px-4 h-12 rounded-xl border border-white/10 flex-row items-center justify-between"
                                            >
                                                <Text className="text-white text-sm" numberOfLines={1}>
                                                    {SWISS_KNOCKOUT_OPTIONS.find(o => o.value === swissKnockout)?.label || 'None'}
                                                </Text>
                                                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <Text className="text-[11px] text-zinc-500 -mt-3">
                                        Everyone plays every round against opponents on a similar score. Leave rounds empty for the standard count.
                                    </Text>

                                    {swissKnockoutSize > 0 && (
                                        <View>
                                            <View className="flex-row items-center mb-3">
                                                <Ionicons name="flash-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                                <Text className="text-sm font-bold text-white">Direct Qualifiers (optional play-in)</Text>
                                            </View>
                                            <TextInput
                                                className="bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-white/10"
                                                placeholder={`All ${swissKnockoutSize} direct — enter fewer to add a play-in`}
                                                placeholderTextColor="#6b7280"
                                                keyboardType="numeric"
                                                value={swissDirect}
                                                onChangeText={setSwissDirect}
                                            />
                                            <Text className="text-[11px] text-zinc-500 mt-2">
                                                {swissPlayInPlayers > 0 && !isNaN(swissDirectCount)
                                                    ? `Top ${swissDirectCount} go straight to the bracket. Standings ${swissDirectCount + 1}–${swissDirectCount + swissPlayInPlayers} play one play-in round (best vs worst) for the remaining ${swissKnockoutSize - swissDirectCount} spots.`
                                                    : `Top ${swissKnockoutSize} from the standings are seeded into the bracket (1 vs ${swissKnockoutSize}, 2 vs ${swissKnockoutSize - 1}, …).`}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            {(selectedFormat === '0' || selectedFormat === '5' || isSwiss) && (
                                <View>
                                    <Text className="text-sm font-bold text-white mb-3">How long should each round last? (optional)</Text>
                                    <View className="flex-row gap-4">
                                        <View className="flex-1">
                                            <TextInput
                                                className="bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-white/10"
                                                placeholder="e.g. 2"
                                                placeholderTextColor="#6b7280"
                                                keyboardType="numeric"
                                                value={roundDurationValue}
                                                onChangeText={setRoundDurationValue}
                                            />
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setShowDurationUnitPicker(true)}
                                            className="flex-1 bg-[#131B2E] px-4 h-12 rounded-xl border border-white/10 flex-row items-center justify-between"
                                        >
                                            <Text className="text-white font-medium">{roundDurationUnit}</Text>
                                            <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            <View className="flex-row gap-4">
                                <View className="flex-1">
                                    <View className="flex-row items-center mb-3">
                                        <Ionicons name="calendar-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                        <Text className="text-sm font-bold text-white">Start Date</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setShowStartDatePicker(true)}
                                        className="bg-[#131B2E] px-4 h-12 rounded-xl border border-white/10 justify-center"
                                    >
                                        <Text className={`${startDate ? 'text-white' : 'text-slate-500'} text-sm`} numberOfLines={1}>
                                            {startDate || 'Select Start Date'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row items-center mb-3">
                                        <Ionicons name="timer-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                        <Text className="text-sm font-bold text-white">Reg. Deadline</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setShowRegDeadlinePicker(true)}
                                        className="bg-[#131B2E] px-4 h-12 rounded-xl border border-white/10 justify-center"
                                    >
                                        <Text className={`${registrationDeadline ? 'text-white' : 'text-slate-500'} text-sm`} numberOfLines={1}>
                                            {registrationDeadline || 'Select Deadline'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Prize Pool & Currency */}
                            <View>
                                <View className="flex-row items-center mb-3">
                                    <Ionicons name="cash-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                                    <Text className="text-sm font-bold text-white">Prize Pool</Text>
                                </View>
                                <View className="flex-row gap-4">
                                    <View className="flex-1">
                                        <TextInput
                                            className="bg-[#131B2E] px-4 h-12 rounded-xl text-white border border-white/10"
                                            placeholder="Amount (e.g. 500)"
                                            placeholderTextColor="#6b7280"
                                            keyboardType="numeric"
                                            value={prizePool}
                                            onChangeText={setPrizePool}
                                        />
                                    </View>
                                    <View className="w-32">
                                        <TouchableOpacity
                                            onPress={() => setShowCurrencyPicker(true)}
                                            className="bg-[#131B2E] p-3 h-12 rounded-xl border border-white/10 flex-row justify-between items-center"
                                        >
                                            <Text className="text-white text-sm">{getCurrencyLabel()}</Text>
                                            <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </ScrollView>

                    <View className="p-6 bg-[#131B2E] border-t border-white/5">
                        {error && (
                            <Text className="text-red-500 text-xs mb-4 text-center">{error}</Text>
                        )}
                        <Button
                            onPress={handleSubmit}
                            disabled={isSubmitting}
                            loading={isSubmitting}
                            className="bg-primary py-4 rounded-2xl"
                        >
                            Create Tournament
                        </Button>
                    </View>
                    {renderOptionsModal(
                        showHubPicker,
                        () => setShowHubPicker(false),
                        hubs.map(h => ({ value: h.id, label: h.name })),
                        selectedHubId,
                        setSelectedHubId
                    )}
                    {renderOptionsModal(
                        showRegionPicker,
                        () => setShowRegionPicker(false),
                        regions,
                        selectedRegions,
                        handleRegionSelect,
                        true
                    )}
                    {renderOptionsModal(
                        showCurrencyPicker,
                        () => setShowCurrencyPicker(false),
                        prizeCurrencies,
                        prizeCurrency,
                        setPrizeCurrency
                    )}
                    {renderOptionsModal(
                        showFormatPicker,
                        () => setShowFormatPicker(false),
                        TOURNAMENT_FORMAT_OPTIONS,
                        selectedFormat,
                        setSelectedFormat
                    )}
                    {renderOptionsModal(
                        showDurationUnitPicker,
                        () => setShowDurationUnitPicker(false),
                        durationUnits,
                        roundDurationUnit,
                        setRoundDurationUnit
                    )}
                    {renderOptionsModal(
                        showTeamWinConditionPicker,
                        () => setShowTeamWinConditionPicker(false),
                        teamWinConditions,
                        teamWinCondition,
                        setTeamWinCondition
                    )}
                    {renderOptionsModal(
                        showSwissKnockoutPicker,
                        () => setShowSwissKnockoutPicker(false),
                        SWISS_KNOCKOUT_OPTIONS,
                        swissKnockout,
                        setSwissKnockout
                    )}
                    <DateTimePickerModal
                        visible={showStartDatePicker}
                        onClose={() => setShowStartDatePicker(false)}
                        onConfirm={setStartDate}
                        title="Tournament Start"
                        initialValue={startDate}
                    />
                    <DateTimePickerModal
                        visible={showRegDeadlinePicker}
                        onClose={() => setShowRegDeadlinePicker(false)}
                        onConfirm={setRegistrationDeadline}
                        title="Registration Deadline"
                        initialValue={registrationDeadline}
                    />
                </View>
            </View>
        </View>
    );
}

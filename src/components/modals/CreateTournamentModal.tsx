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
import { TournamentFormat, TournamentRegion } from '../../types/tournament';

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

const tournamentFormats = [
    { value: '0', label: 'League' },
    { value: '3', label: 'Single Elimination' },
    { value: '5', label: 'Group Stage + Knockout' },
];

const durationUnits = [
    { value: 'Minutes', label: 'Minutes' },
    { value: 'Hours', label: 'Hours' },
    { value: 'Days', label: 'Days' },
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
    const [prizePool, setPrizePool] = useState('');
    const [prizeCurrency, setPrizeCurrency] = useState('1'); // Default to Eur
    const [maxPlayers, setMaxPlayers] = useState('');
    const [startDate, setStartDate] = useState('');
    const [registrationDeadline, setRegistrationDeadline] = useState('');
    const [selectedFormat, setSelectedFormat] = useState('3'); // Default to Single Elimination (or choose a safer default)
    const [groupsCount, setGroupsCount] = useState('4');
    const [qualifiersPerGroup, setQualifiersPerGroup] = useState('2');
    const [inviteFollowers, setInviteFollowers] = useState(false);

    // Round Duration
    const [roundDurationValue, setRoundDurationValue] = useState('');
    const [roundDurationUnit, setRoundDurationUnit] = useState('Minutes'); // Minutes | Hours | Days

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
        return tournamentFormats.find(f => f.value === selectedFormat)?.label || 'Select Format';
    };

    const handleSubmit = async () => {
        if (!name || !selectedHubId) {
            setError('Tournament name and Hub are required');
            return;
        }

        if (!maxPlayers || isNaN(parseInt(maxPlayers)) || parseInt(maxPlayers) <= 0) {
            setError('Valid Max Players count is required (must be greater than 0)');
            return;
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
            if ((selectedFormat === '0' || selectedFormat === '5') && roundDurationValue) {
                const val = parseInt(roundDurationValue);
                if (!isNaN(val)) {
                    if (roundDurationUnit === 'Minutes') roundDurationMinutes = val;
                    else if (roundDurationUnit === 'Hours') roundDurationMinutes = val * 60;
                    else if (roundDurationUnit === 'Days') roundDurationMinutes = val * 1440;
                }
            }

            const payload = {
                hubId: selectedHubId,
                name: name,
                description: description || "",
                rules: rules || "",
                status: 1, // Always 1 per requirement
                maxPlayers: parseInt(maxPlayers) || 0,
                startDate: formatToISO(startDate),
                registrationDeadline: formatToISO(registrationDeadline),
                prize: parseFloat(prizePool) || 0,
                prizeCurrency: parseInt(prizeCurrency) || 1,
                region: regionMapping[selectedRegions[0]] ?? 0,
                format: parseInt(selectedFormat),
                GroupsCount: selectedFormat === '5' ? parseInt(groupsCount) : null,
                QualifiersPerGroup: selectedFormat === '5' ? parseInt(qualifiersPerGroup) : null,
                roundDurationMinutes: roundDurationMinutes
            };

            console.log('Creating tournament with payload:', payload);

            const response = await authenticatedFetch(ENDPOINTS.CREATE_TOURNAMENT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to create tournament');
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
        options: { value: string; label: string | any }[],
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
                                    {renderSelectField('Region', getRegionLabel(), 'globe-outline', () =>
                                        setShowRegionPicker(true)
                                    )}
                                </View>
                            </View>

                            <View className="flex-row gap-4">
                                <View className="flex-1">
                                    {renderSelectField('Format', getFormatLabel(), 'list-outline', () =>
                                        setShowFormatPicker(true)
                                    )}
                                </View>
                            </View>

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
                                    </View>
                                </View>
                            )}

                            {(selectedFormat === '0' || selectedFormat === '5') && (
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
                        tournamentFormats,
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

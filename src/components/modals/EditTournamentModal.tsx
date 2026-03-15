import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Pressable,
    ActivityIndicator,
    Modal,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ENDPOINTS, authenticatedFetch } from '../../lib/api';
import { TournamentFormat, TournamentRegion } from '../../types/tournament';
import { DateTimePickerModal } from './DateTimePickerModal';

interface EditTournamentModalProps {
    visible: boolean;
    onClose: () => void;
    tournament: any;
    onSaveSuccess: () => void;
}

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

const regionMapping: Record<string, number> = {
    'global': TournamentRegion.Global,
    'north-america': TournamentRegion.NorthAmerica,
    'europe': TournamentRegion.Europe,
    'asia': TournamentRegion.Asia,
    'south-america': TournamentRegion.SouthAmerica,
    'africa': TournamentRegion.Africa,
    'oceania': TournamentRegion.Oceania,
};

const regionReverseMapping: Record<number, string> = Object.entries(regionMapping).reduce((acc, [key, val]) => ({ ...acc, [val]: key }), {});

export function EditTournamentModal({ visible, onClose, tournament, onSaveSuccess }: EditTournamentModalProps) {
    const insets = useSafeAreaInsets();
    const tStatus = Number(tournament?.status !== undefined ? tournament.status : tournament?.Status);
    const canEditAll = tStatus === 0 || tStatus === 1 || tStatus === 2; // Editable while Open, Upcoming, or Reg. Closed
    const canEditDeadline = tStatus === 0 || tStatus === 1; // Deadline cannot be changed if Reg is Closed (status 2)

    const [name, setName] = useState(tournament?.name || '');
    const [description, setDescription] = useState(tournament?.description || '');
    const [rules, setRules] = useState(tournament?.rules || '');
    const [maxPlayers, setMaxPlayers] = useState(String(tournament?.maxPlayers || ''));
    const [selectedFormat, setSelectedFormat] = useState(String(tournament?.format !== undefined ? tournament.format : '3'));
    const [groupsCount, setGroupsCount] = useState(String(tournament?.groupsCount || '4'));
    const [qualifiersPerGroup, setQualifiersPerGroup] = useState(String(tournament?.qualifiersPerGroup || '2'));
    const [prize, setPrize] = useState(String(tournament?.prize || ''));
    const [prizeCurrency, setPrizeCurrency] = useState(String(tournament?.prizeCurrency || '1'));
    const [selectedRegion, setSelectedRegion] = useState(regionReverseMapping[tournament?.region] || 'global');
    const [startDate, setStartDate] = useState(tournament?.startDate || '');
    const [registrationDeadline, setRegistrationDeadline] = useState(tournament?.registrationDeadline || '');

    const initialDurationMinutes = tournament?.roundDurationMinutes;
    let initialDurVal = '';
    let initialDurUnit = 'Minutes';
    if (initialDurationMinutes != null) {
        if (initialDurationMinutes > 0 && initialDurationMinutes % 1440 === 0) {
            initialDurVal = String(initialDurationMinutes / 1440);
            initialDurUnit = 'Days';
        } else if (initialDurationMinutes > 0 && initialDurationMinutes % 60 === 0) {
            initialDurVal = String(initialDurationMinutes / 60);
            initialDurUnit = 'Hours';
        } else {
            initialDurVal = String(initialDurationMinutes);
        }
    }
    const [roundDurationValue, setRoundDurationValue] = useState(initialDurVal);
    const [roundDurationUnit, setRoundDurationUnit] = useState(initialDurUnit);
    const [showDurationUnitPicker, setShowDurationUnitPicker] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showFormatPicker, setShowFormatPicker] = useState(false);
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showRegDeadlinePicker, setShowRegDeadlinePicker] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getFormatLabel = () => {
        return tournamentFormats.find(f => f.value === selectedFormat)?.label || 'Select Format';
    };

    const getRegionLabel = () => {
        return regions.find(r => r.value === selectedRegion)?.label || 'Region';
    };

    const getCurrencyLabel = () => {
        return prizeCurrencies.find(c => c.value === prizeCurrency)?.label || 'Currency';
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Tournament name is required');
            return;
        }

        if (!maxPlayers || isNaN(parseInt(maxPlayers)) || parseInt(maxPlayers) <= 0) {
            setError('Valid Max Players count is required (must be greater than 0)');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const formatToISO = (dateStr: string) => {
                if (!dateStr) return null;
                try {
                    // If it's already ISO, just return it
                    if (dateStr.includes('T')) return dateStr;
                    // Otherwise try to convert from our display format (replace space with T)
                    const d = new Date(dateStr.replace(' ', 'T'));
                    return d.toISOString();
                } catch (e) {
                    return dateStr;
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
                Id: tournament.id,
                HubId: tournament.hubId || tournament.HubId,
                Name: name.trim(),
                Description: description || "",
                Rules: rules || "",
                Status: tournament.status !== undefined ? tournament.status : tournament.Status,
                MaxPlayers: parseInt(maxPlayers) || 0,
                StartDate: startDate ? new Date(startDate).toISOString() : null,
                Format: parseInt(selectedFormat),
                QualifiersPerGroup: selectedFormat === '5' ? parseInt(qualifiersPerGroup) : null,
                GroupsCount: selectedFormat === '5' ? parseInt(groupsCount) : null,
                RegistrationDeadline: registrationDeadline ? new Date(registrationDeadline).toISOString() : null,
                Prize: parseInt(prize) || 0,
                PrizeCurrency: parseInt(prizeCurrency) || 1,
                Region: regionMapping[selectedRegion] ?? 0,
                RoundDurationMinutes: roundDurationMinutes
            };

            const response = await authenticatedFetch(ENDPOINTS.CREATE_TOURNAMENT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to update tournament');
            }

            onSaveSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error updating tournament:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderSelectField = (label: string, value: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void, disabled = false) => (
        <View className="flex-1">
            <Text className="text-sm font-bold text-white mb-3">{label}</Text>
            <TouchableOpacity
                onPress={onPress}
                disabled={disabled}
                className={`bg-[#131B2E] p-4 h-14 rounded-xl border border-white/10 flex-row justify-between items-center ${disabled ? 'opacity-50' : ''}`}
            >
                <Text className="text-white text-sm" numberOfLines={1}>{value}</Text>
                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
            </TouchableOpacity>
        </View>
    );

    const renderOptionsModal = (
        visible: boolean,
        onCloseModal: () => void,
        options: { value: string; label: string }[],
        selected: string | string[],
        onSelect: (val: string) => void,
        multi = false
    ) => {
        if (!visible) return null;
        return (
            <Modal visible={visible} transparent animationType="fade">
                <Pressable className="flex-1 bg-black/60 justify-center px-6" onPress={onCloseModal}>
                    <View className="bg-[#131B2E] rounded-3xl border border-white/10 max-h-[60%] overflow-hidden shadow-2xl">
                        <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
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
                                        className={`p-4 mb-2 rounded-2xl flex-row justify-between items-center ${active ? 'bg-primary' : 'bg-[#1E293B]'}`}
                                    >
                                        <Text className={`${active ? 'text-black' : 'text-white'} font-semibold`}>
                                            {opt.label}
                                        </Text>
                                        {active && <Ionicons name="checkmark" size={18} color="#000" />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        );
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1 bg-black/80 justify-end"
            >
                <View
                    className="bg-[#0f172a] w-full rounded-t-[40px] border-t border-white/10 shadow-2xl overflow-hidden"
                    style={{ maxHeight: '90%' }}
                >
                    <View className="flex-row justify-between items-center p-6 border-b border-white/5">
                        <Text className="text-xl font-bold text-white">Edit Tournament</Text>
                        <TouchableOpacity onPress={onClose} className="bg-white/5 p-2 rounded-full">
                            <Ionicons name="close" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        className="px-6 py-4"
                        contentContainerStyle={{ paddingBottom: 40 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <View>
                            <View className="mb-6">
                                <Text className="text-sm font-bold text-white mb-3">Tournament Name</Text>
                                <TextInput
                                    className={`bg-[#131B2E] p-4 rounded-xl text-white border border-white/10 ${!canEditAll ? 'opacity-50' : ''}`}
                                    placeholder="Enter tournament name"
                                    placeholderTextColor="#6b7280"
                                    value={name}
                                    onChangeText={setName}
                                    editable={canEditAll}
                                />
                            </View>

                            <View className="mb-6">
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

                            <View className="mb-6">
                                <Text className="text-sm font-bold text-white mb-3">Rules</Text>
                                <TextInput
                                    multiline
                                    className="bg-[#131B2E] p-4 h-24 rounded-xl text-white border border-white/10"
                                    placeholder="Tournament rules..."
                                    placeholderTextColor="#6b7280"
                                    textAlignVertical="top"
                                    value={rules}
                                    onChangeText={setRules}
                                />
                            </View>

                            <View className="flex-row gap-4 mb-6">
                                <View className="flex-1">
                                    <Text className="text-sm font-bold text-white mb-3">Prize Pool</Text>
                                    <TextInput
                                        className={`bg-[#131B2E] px-4 h-14 rounded-xl text-white border border-white/10 ${!canEditAll ? 'opacity-50' : ''}`}
                                        placeholder="Amount"
                                        placeholderTextColor="#6b7280"
                                        keyboardType="numeric"
                                        value={prize}
                                        onChangeText={setPrize}
                                        editable={canEditAll}
                                    />
                                </View>
                                <View className="w-32">
                                    {renderSelectField('Currency', getCurrencyLabel(), 'cash-outline', () =>
                                        setShowCurrencyPicker(true)
                                        , !canEditAll)}
                                </View>
                            </View>

                            <View className="mb-6">
                                {renderSelectField('Region', getRegionLabel(), 'globe-outline', () =>
                                    setShowRegionPicker(true)
                                    , !canEditAll)}
                            </View>

                            <View className="flex-row gap-4 mb-6">
                                <View className="flex-1">
                                    <Text className="text-sm font-bold text-white mb-3">Max Players *</Text>
                                    <TextInput
                                        className={`bg-[#131B2E] px-4 h-14 rounded-xl text-white border border-white/10 ${!canEditAll ? 'opacity-50' : ''}`}
                                        placeholder="e.g. 16"
                                        placeholderTextColor="#6b7280"
                                        keyboardType="numeric"
                                        value={maxPlayers}
                                        onChangeText={setMaxPlayers}
                                        editable={canEditAll}
                                    />
                                </View>
                                <View className="flex-1">
                                    {renderSelectField('Format', getFormatLabel(), 'list-outline', () =>
                                        setShowFormatPicker(true)
                                        , !canEditAll)}
                                </View>
                            </View>

                            {selectedFormat === '5' && (
                                <View className="flex-row gap-4 mb-6">
                                    <View className="flex-1">
                                        <Text className="text-sm font-bold text-white mb-3">Groups Count</Text>
                                        <TextInput
                                            className={`bg-[#131B2E] px-4 h-14 rounded-xl text-white border border-white/10 ${!canEditAll ? 'opacity-50' : ''}`}
                                            placeholder="e.g. 4"
                                            placeholderTextColor="#6b7280"
                                            keyboardType="numeric"
                                            value={groupsCount}
                                            onChangeText={setGroupsCount}
                                            editable={canEditAll}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-sm font-bold text-white mb-3">Qualifiers / Group</Text>
                                        <TextInput
                                            className={`bg-[#131B2E] px-4 h-14 rounded-xl text-white border border-white/10 ${!canEditAll ? 'opacity-50' : ''}`}
                                            placeholder="e.g. 2"
                                            placeholderTextColor="#6b7280"
                                            keyboardType="numeric"
                                            value={qualifiersPerGroup}
                                            onChangeText={setQualifiersPerGroup}
                                            editable={canEditAll}
                                        />
                                    </View>
                                </View>
                            )}

                            {(selectedFormat === '0' || selectedFormat === '5') && (
                                <View className="mb-6">
                                    <Text className="text-sm font-bold text-white mb-3">How long should each round last? (optional)</Text>
                                    <View className="flex-row gap-4">
                                        <View className="flex-1">
                                            <TextInput
                                                className={`bg-[#131B2E] px-4 h-14 rounded-xl text-white border border-white/10 ${!canEditAll ? 'opacity-50' : ''}`}
                                                placeholder="e.g. 2"
                                                placeholderTextColor="#6b7280"
                                                keyboardType="numeric"
                                                value={roundDurationValue}
                                                onChangeText={setRoundDurationValue}
                                                editable={canEditAll}
                                            />
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => { if (canEditAll) setShowDurationUnitPicker(true); }}
                                            disabled={!canEditAll}
                                            className={`flex-1 bg-[#131B2E] px-4 h-14 rounded-xl border border-white/10 flex-row items-center justify-between ${!canEditAll ? 'opacity-50' : ''}`}
                                        >
                                            <Text className="text-white font-medium">{roundDurationUnit}</Text>
                                            <Ionicons name="chevron-down" size={20} color="#94A3B8" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            <View className="flex-row gap-4 mb-6">
                                <View className="flex-1">
                                    <Text className="text-sm font-bold text-white mb-3">Start Date</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowStartDatePicker(true)}
                                        disabled={!canEditAll}
                                        className={`bg-[#131B2E] px-4 h-14 rounded-xl border border-white/10 justify-center ${!canEditAll ? 'opacity-50' : ''}`}
                                    >
                                        <Text className={`${startDate ? 'text-white' : 'text-slate-500'} text-sm`} numberOfLines={1}>
                                            {startDate ? new Date(startDate).toLocaleString() : 'Select Start Date'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <View className="flex-1">
                                    <Text className="text-sm font-bold text-white mb-3">Reg. Deadline</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowRegDeadlinePicker(true)}
                                        disabled={!canEditDeadline}
                                        className={`bg-[#131B2E] px-4 h-14 rounded-xl border border-white/10 justify-center ${!canEditDeadline ? 'opacity-50' : ''}`}
                                    >
                                        <Text className={`${registrationDeadline ? 'text-white' : 'text-slate-500'} text-sm`} numberOfLines={1}>
                                            {registrationDeadline ? new Date(registrationDeadline).toLocaleString() : 'Select Deadline'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>


                        </View>
                    </ScrollView>

                    <View className="p-6 bg-[#131B2E] border-t border-white/5" style={{ paddingBottom: insets.bottom + 20 }}>
                        {error && (
                            <Text className="text-red-500 text-xs mb-4 text-center">{error}</Text>
                        )}
                        <Button
                            onPress={handleSave}
                            disabled={isSubmitting}
                            loading={isSubmitting}
                            className="bg-primary py-4 rounded-2xl"
                        >
                            Save Changes
                        </Button>
                    </View>
                </View>

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

                {renderOptionsModal(
                    showRegionPicker,
                    () => setShowRegionPicker(false),
                    regions,
                    selectedRegion,
                    setSelectedRegion
                )}

                {renderOptionsModal(
                    showCurrencyPicker,
                    () => setShowCurrencyPicker(false),
                    prizeCurrencies,
                    prizeCurrency,
                    setPrizeCurrency
                )}

                <DateTimePickerModal
                    visible={showStartDatePicker}
                    onClose={() => setShowStartDatePicker(false)}
                    onConfirm={(val) => setStartDate(val)}
                    title="Tournament Start"
                    initialValue={startDate}
                />
                <DateTimePickerModal
                    visible={showRegDeadlinePicker}
                    onClose={() => setShowRegDeadlinePicker(false)}
                    onConfirm={(val) => setRegistrationDeadline(val)}
                    title="Registration Deadline"
                    initialValue={registrationDeadline}
                />
            </KeyboardAvoidingView>
        </Modal>
    );
}

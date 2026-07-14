import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Pressable,
    ActivityIndicator,
    KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS, authenticatedFetch } from '../../lib/api';
import { DateTimePickerModal } from './DateTimePickerModal';
import { SWISS_KNOCKOUT_OPTIONS, TEAM_TOURNAMENT_FORMATS, TournamentFormat, TournamentRegion } from '../../types/tournament';
import { TEAM_LABELS } from '../../lib/teamConstants';
import { CountryPicker } from '../ui/CountryPicker';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { COLORS } from '../../lib/theme';

const YES_NO_OPTIONS = [
    { value: 'no', label: 'No' },
    { value: 'yes', label: 'Yes' },
] as const;

const FIELD_LABEL = "text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2";
const FIELD_INPUT = "bg-white/[0.03] px-4 h-12 rounded-2xl text-white border border-white/[0.06] text-sm";
const FIELD_MULTILINE = "bg-white/[0.03] p-4 h-24 rounded-2xl text-white border border-white/[0.06] text-sm";
const FIELD_HINT = "text-[11px] text-slate-500 mt-2";

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

// User-facing format groups. Single/Double Elimination collapse into one "Bracket"
// entry — the Single/Double sub-toggle picks between them. The backend still receives
// the full TournamentFormat (3 = SingleElim, 4 = DoubleElim).
const FORMAT_GROUP_OPTIONS = [
    { value: 'league', label: 'League' },
    { value: 'bracket', label: 'Bracket' },
    { value: 'groups-bracket', label: 'Groups + Bracket' },
    { value: 'swiss', label: 'Swiss' },
] as const;

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
    // Knockout bracket style for Groups+Bracket / Swiss: '1' = Single, '2' = Double elimination.
    const [knockoutType, setKnockoutType] = useState('1');

    // Round Duration
    const [roundDurationValue, setRoundDurationValue] = useState('');
    const [roundDurationUnit, setRoundDurationUnit] = useState('Minutes'); // Minutes | Hours | Days

    // Team mode
    const [isTeamTournament, setIsTeamTournament] = useState(false);
    const [teamSize, setTeamSize] = useState('');
    const [teamWinCondition, setTeamWinCondition] = useState('0');

    // Third place play-off (any format that ends in a single-elimination bracket)
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

    // Map selectedFormat (TournamentFormat) → user-facing group key.
    const formatGroup: typeof FORMAT_GROUP_OPTIONS[number]['value'] =
        selectedFormat === String(TournamentFormat.League) ? 'league' :
        (selectedFormat === String(TournamentFormat.SingleElimination)
            || selectedFormat === String(TournamentFormat.DoubleElimination)) ? 'bracket' :
        selectedFormat === String(TournamentFormat.GroupStageWithKnockout) ? 'groups-bracket' :
        selectedFormat === String(TournamentFormat.Swiss) ? 'swiss' :
        'bracket';

    const getFormatLabel = () => {
        return FORMAT_GROUP_OPTIONS.find(f => f.value === formatGroup)?.label || 'Select Format';
    };

    // The format dropdown writes a group key, which we expand back to TournamentFormat here.
    // Switching INTO 'bracket' keeps the current Single/Double choice (3 or 4); otherwise defaults to Single.
    const handleFormatGroupChange = (group: string) => {
        if (group === 'league') setSelectedFormat(String(TournamentFormat.League));
        else if (group === 'bracket') {
            if (selectedFormat !== String(TournamentFormat.SingleElimination)
                && selectedFormat !== String(TournamentFormat.DoubleElimination)) {
                setSelectedFormat(String(TournamentFormat.SingleElimination));
            }
        } else if (group === 'groups-bracket') setSelectedFormat(String(TournamentFormat.GroupStageWithKnockout));
        else if (group === 'swiss') setSelectedFormat(String(TournamentFormat.Swiss));
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
    const isSwiss = selectedFormat === String(TournamentFormat.Swiss);
    const swissKnockoutSize = isSwiss ? parseInt(swissKnockout) || 0 : 0;
    // Empty direct input = every knockout slot is a direct berth (no play-in).
    const swissDirectCount = swissKnockout !== '0' && swissDirect !== ''
        ? parseInt(swissDirect)
        : swissKnockoutSize;
    const swissPlayInPlayers = swissKnockoutSize > 0 && swissDirectCount < swissKnockoutSize
        ? 2 * (swissKnockoutSize - swissDirectCount)
        : 0;

    // Single/Double knockout choice applies to: a pure Bracket (where it picks between SingleElim/DoubleElim),
    // Groups+Bracket (where it picks the knockout phase style), and Swiss (where it picks the post-Swiss bracket).
    // The knockout needs >= 4 bracket slots for a real losers bracket — Groups+Bracket / Swiss gate the toggle
    // on that. For a pure Bracket we always show it; backend submit rejects Double-Elim with < 4 players anyway.
    const groupsTotalQualifiers = (parseInt(groupsCount) || 0) * (parseInt(qualifiersPerGroup) || 0);
    const showKnockoutTypeToggle =
        formatGroup === 'bracket' ||
        (selectedFormat === String(TournamentFormat.GroupStageWithKnockout) && groupsTotalQualifiers >= 4) ||
        (isSwiss && swissKnockoutSize >= 4);

    // For a pure Bracket the choice IS the format (3 vs 4); for Groups+Bracket / Swiss it's stored on knockoutType.
    const currentElimType: '1' | '2' = formatGroup === 'bracket'
        ? (selectedFormat === String(TournamentFormat.DoubleElimination) ? '2' : '1')
        : (knockoutType === '2' ? '2' : '1');
    const setCurrentElimType = (val: '1' | '2') => {
        if (formatGroup === 'bracket') {
            setSelectedFormat(val === '2'
                ? String(TournamentFormat.DoubleElimination)
                : String(TournamentFormat.SingleElimination));
        } else {
            setKnockoutType(val);
        }
    };

    // Third place exists whenever the run ends in a single-elimination bracket with real
    // semi-finals. League never has a bracket, a double-elimination bracket decides 3rd via
    // the losers bracket final, and pure Swiss (knockout 'None') crowns the winner straight
    // from the standings — so those hide the toggle. Entrants = bracket slots of the phase
    // hosting the final: group qualifiers / Swiss knockout size / everyone.
    const thirdPlaceEntrants =
        formatGroup === 'groups-bracket' ? groupsTotalQualifiers :
        isSwiss ? swissKnockoutSize :
        participantCount;
    const usesDoubleElimBracket = formatGroup === 'bracket'
        ? selectedFormat === String(TournamentFormat.DoubleElimination)
        : showKnockoutTypeToggle && knockoutType === '2';
    const canShowThirdPlace = formatGroup !== 'league' && !usesDoubleElimBracket && thirdPlaceEntrants > 2;

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
                setError('Team tournaments only support Single Bracket, Double Bracket, League, or Groups + Bracket');
                return;
            }
        }

        if (selectedFormat === String(TournamentFormat.DoubleElimination) && participantCount > 0 && participantCount < 4) {
            setError('Double Elimination requires at least 4 players — raise Max Players');
            return;
        }

        // Groups + Bracket pads the knockout up to the next power of two with byes (single- and
        // double-elimination alike), so any qualifier count >= 2 works.
        if (selectedFormat === String(TournamentFormat.GroupStageWithKnockout) && groupsTotalQualifiers < 2) {
            setError('Groups + Bracket needs at least 2 total qualifiers (Groups × Qualifiers/Group).');
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
                // Single (1) / Double (2) elimination for the Groups+Bracket / Swiss knockout phase.
                // Null when not applicable (including pure Bracket, where SingleElim/DoubleElim IS the format).
                // Backend treats null as single.
                KnockoutEliminationType: showKnockoutTypeToggle && formatGroup !== 'bracket'
                    ? parseInt(knockoutType)
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

    // `standalone` = rendered on its own in a column. The default flex-1 is for row
    // usage (sharing width with siblings) — in an auto-height column flex-1 resolves
    // to flexBasis 0 and Yoga collapses the field to height 0, so its label/box paint
    // over whatever comes next.
    const renderSelectField = (
        label: string,
        value: string,
        onPress: () => void,
        isLoading = false,
        locked = false,
        standalone = false
    ) => (
        <View className={standalone ? undefined : 'flex-1'}>
            <Text className={FIELD_LABEL}>{label}</Text>
            <TouchableOpacity
                onPress={onPress}
                disabled={isLoading || locked}
                className="bg-white/[0.03] px-4 h-12 rounded-2xl border border-white/[0.06] flex-row justify-between items-center"
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                    <Text className="text-white text-sm" numberOfLines={1}>{value}</Text>
                )}
                {!isLoading && !locked && <Ionicons name="chevron-down" size={16} color="#64748B" />}
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
                    <Pressable className="bg-card rounded-3xl border border-white/10 max-h-[60%] overflow-hidden shadow-2xl">
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
                                        className={`p-4 mb-2 rounded-2xl flex-row justify-between items-center ${active ? 'bg-primary' : 'bg-card-elevated'
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

    // Collapsed-header recaps so a skimmed form still reads at a glance.
    const basicsSummary = [
        name.trim() || 'No name yet',
        getFormatLabel(),
        maxPlayers ? `${maxPlayers} players` : null,
    ].filter(Boolean).join(' · ');
    const detailsSummary = (description.trim() || rules.trim()) ? 'Added' : 'Optional';
    const accessSummary = [
        isTeamTournament ? TEAM_LABELS.MODE_TEAM : TEAM_LABELS.MODE_SOLO,
        scopeMode === 'region' ? getRegionLabel() : `${selectedCountries.length} ${selectedCountries.length === 1 ? 'country' : 'countries'}`,
        isExclusive ? 'Exclusive' : null,
    ].filter(Boolean).join(' · ');
    const matchSettingsSummary = [
        requireResultApproval ? 'Result approval' : null,
        canShowThirdPlace && hasThirdPlaceMatch ? 'Third place' : null,
        (selectedFormat === '0' || selectedFormat === '5') && doubleRoundRobin ? 'Double round robin' : null,
    ].filter(Boolean).join(' · ') || 'Defaults';
    const scheduleSummary = startDate && registrationDeadline ? `Starts ${startDate}` : 'Not set yet';
    const prizeSummary = prizePool ? `${prizePool} ${getCurrencyLabel()}` : 'Optional';

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
            {/* 'padding' shrinks the centered card when the keyboard is up so the focused
                input stays visible (matches the EditHubModal keyboard pattern). */}
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1 bg-black/80 px-4 justify-center"
                style={{
                    paddingTop: insets.top + 20,
                    paddingBottom: insets.bottom + 20,
                }}
            >
                <View className="bg-background w-full rounded-[40px] border border-white/10 shadow-2xl overflow-hidden max-h-full">
                    <View className="flex-row justify-between items-center p-6 border-b border-white/5">
                        <View>
                            <Text className="text-[10px] font-black uppercase tracking-[2px] text-primary mb-0.5">New Tournament</Text>
                            <Text className="text-xl font-black text-white">Create Tournament</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="bg-white/5 p-2 rounded-full">
                            <Ionicons name="close" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        className="px-5 py-4"
                        contentContainerStyle={{ paddingBottom: 32 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <View className="gap-4">
                            {/* ── Basics: hub, name, size, format ── */}
                            <CollapsibleSection icon="trophy" title="Basics" defaultOpen summary={basicsSummary}>
                                <View className="gap-4">
                                    {renderSelectField(
                                        'Hub',
                                        getHubLabel(),
                                        () => hubId ? null : setShowHubPicker(true),
                                        isLoadingHubs,
                                        !!hubId,
                                        true
                                    )}

                                    <View>
                                        <Text className={FIELD_LABEL}>Tournament Name *</Text>
                                        <TextInput
                                            className={FIELD_INPUT}
                                            placeholder="Enter tournament name"
                                            placeholderTextColor="#334155"
                                            value={name}
                                            onChangeText={setName}
                                        />
                                    </View>

                                    <View className="flex-row gap-3">
                                        <View className="flex-1">
                                            <Text className={FIELD_LABEL}>Max Players *</Text>
                                            <TextInput
                                                className={FIELD_INPUT}
                                                placeholder="e.g. 16"
                                                placeholderTextColor="#334155"
                                                keyboardType="numeric"
                                                value={maxPlayers}
                                                onChangeText={setMaxPlayers}
                                            />
                                        </View>
                                        {renderSelectField('Format', getFormatLabel(), () => setShowFormatPicker(true))}
                                    </View>

                                    {/* Groups + Bracket: groups count and qualifiers-per-group drive the knockout size. */}
                                    {selectedFormat === '5' && (
                                        <View className="flex-row gap-3">
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>Groups Count</Text>
                                                <TextInput
                                                    className={FIELD_INPUT}
                                                    placeholder="e.g. 4"
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={groupsCount}
                                                    onChangeText={setGroupsCount}
                                                />
                                                <Text className={FIELD_HINT}>
                                                    How many groups players will be split into.
                                                </Text>
                                            </View>
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>Qualifiers / Group</Text>
                                                <TextInput
                                                    className={FIELD_INPUT}
                                                    placeholder="e.g. 2"
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={qualifiersPerGroup}
                                                    onChangeText={setQualifiersPerGroup}
                                                />
                                                <Text className={FIELD_HINT}>
                                                    How many players from each group advance to the knockout bracket.
                                                </Text>
                                            </View>
                                        </View>
                                    )}

                                    {/* Swiss: rounds count + knockout-stage size + optional direct-qualifiers play-in. */}
                                    {isSwiss && (
                                        <View className="gap-4">
                                            <View>
                                                <View className="flex-row gap-3">
                                                    <View className="flex-1">
                                                        <Text className={FIELD_LABEL}>Swiss Rounds</Text>
                                                        <TextInput
                                                            className={FIELD_INPUT}
                                                            placeholder="Auto"
                                                            placeholderTextColor="#334155"
                                                            keyboardType="numeric"
                                                            value={swissRounds}
                                                            onChangeText={setSwissRounds}
                                                        />
                                                    </View>
                                                    {renderSelectField(
                                                        'Knockout Stage',
                                                        SWISS_KNOCKOUT_OPTIONS.find(o => o.value === swissKnockout)?.label || 'None',
                                                        () => setShowSwissKnockoutPicker(true)
                                                    )}
                                                </View>
                                                <Text className={FIELD_HINT}>
                                                    Everyone plays every round against opponents on a similar score. Leave rounds empty for the standard count.
                                                </Text>
                                            </View>

                                            {swissKnockoutSize > 0 && (
                                                <View>
                                                    <Text className={FIELD_LABEL}>Direct Qualifiers (optional play-in)</Text>
                                                    <TextInput
                                                        className={FIELD_INPUT}
                                                        placeholder={`All ${swissKnockoutSize} direct — enter fewer to add a play-in`}
                                                        placeholderTextColor="#334155"
                                                        keyboardType="numeric"
                                                        value={swissDirect}
                                                        onChangeText={setSwissDirect}
                                                    />
                                                    <Text className={FIELD_HINT}>
                                                        {swissPlayInPlayers > 0 && !isNaN(swissDirectCount)
                                                            ? `Top ${swissDirectCount} go straight to the bracket. Standings ${swissDirectCount + 1}–${swissDirectCount + swissPlayInPlayers} play one play-in round (best vs worst) for the remaining ${swissKnockoutSize - swissDirectCount} spots.`
                                                            : `Top ${swissKnockoutSize} from the standings are seeded into the bracket (1 vs ${swissKnockoutSize}, 2 vs ${swissKnockoutSize - 1}, …).`}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {/* Bracket / Groups+Bracket / Swiss: pick Single vs Double elimination for the knockout stage. */}
                                    {showKnockoutTypeToggle && (
                                        <View>
                                            <Text className={FIELD_LABEL}>Knockout Bracket</Text>
                                            <SegmentedToggle
                                                options={[
                                                    { value: '1', label: 'Single' },
                                                    { value: '2', label: 'Double' },
                                                ]}
                                                value={currentElimType}
                                                onChange={(v) => setCurrentElimType(v as '1' | '2')}
                                            />
                                            <Text className={FIELD_HINT}>
                                                Single: one loss and you're out. Double: a losers bracket gives everyone a second chance before elimination.
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </CollapsibleSection>

                            {/* ── Description & Rules ── */}
                            <CollapsibleSection icon="document-text" title="Description & Rules" color="#94A3B8" summary={detailsSummary}>
                                <View className="gap-4">
                                    <View>
                                        <Text className={FIELD_LABEL}>Description</Text>
                                        <TextInput
                                            multiline
                                            className={FIELD_MULTILINE}
                                            placeholder="Describe your tournament..."
                                            placeholderTextColor="#334155"
                                            textAlignVertical="top"
                                            value={description}
                                            onChangeText={setDescription}
                                        />
                                    </View>
                                    <View>
                                        <Text className={FIELD_LABEL}>Rules</Text>
                                        <TextInput
                                            multiline
                                            className={FIELD_MULTILINE}
                                            placeholder="Enter tournament rules (e.g., Best of 3...)"
                                            placeholderTextColor="#334155"
                                            textAlignVertical="top"
                                            value={rules}
                                            onChangeText={setRules}
                                        />
                                    </View>
                                </View>
                            </CollapsibleSection>

                            {/* ── Players & Access ── */}
                            <CollapsibleSection icon="people" title="Players & Access" color="#818CF8" summary={accessSummary}>
                                <View className="gap-4">
                                    <View>
                                        <Text className={FIELD_LABEL}>{TEAM_LABELS.MODE_LABEL}</Text>
                                        <SegmentedToggle
                                            options={[
                                                { value: 'solo', label: TEAM_LABELS.MODE_SOLO },
                                                { value: 'team', label: TEAM_LABELS.MODE_TEAM },
                                            ]}
                                            value={isTeamTournament ? 'team' : 'solo'}
                                            onChange={(v) => setIsTeamTournament(v === 'team')}
                                        />
                                    </View>

                                    {/* Team Size & Win Cond (visible only for Team mode) */}
                                    {isTeamTournament && (
                                        <View className="flex-row gap-3">
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>{TEAM_LABELS.TEAM_SIZE_LABEL} *</Text>
                                                <TextInput
                                                    className={FIELD_INPUT}
                                                    placeholder={TEAM_LABELS.TEAM_SIZE_PLACEHOLDER}
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={teamSize}
                                                    onChangeText={setTeamSize}
                                                />
                                            </View>
                                            {renderSelectField(
                                                'Win Condition',
                                                teamWinConditions.find(c => c.value === teamWinCondition)?.label || 'Select',
                                                () => setShowTeamWinConditionPicker(true)
                                            )}
                                        </View>
                                    )}

                                    {/* Tournament Scope: region-based or country-based */}
                                    <View>
                                        <Text className={FIELD_LABEL}>Tournament Scope</Text>
                                        <SegmentedToggle
                                            options={[
                                                { value: 'region', label: 'By Region' },
                                                { value: 'country', label: 'By Country' },
                                            ]}
                                            value={scopeMode}
                                            onChange={(v) => setScopeMode(v as 'region' | 'country')}
                                        />
                                        <View className="mt-3">
                                            {scopeMode === 'region' ? (
                                                renderSelectField('Region', getRegionLabel(), () => setShowRegionPicker(true), false, false, true)
                                            ) : (
                                                <CountryPicker
                                                    placeholder="Select countries"
                                                    multiple
                                                    values={selectedCountries}
                                                    onToggle={toggleCountry}
                                                />
                                            )}
                                        </View>
                                    </View>

                                    {/* Exclusive members only */}
                                    <View>
                                        <Text className={FIELD_LABEL}>Exclusive Members Only</Text>
                                        <SegmentedToggle
                                            options={[...YES_NO_OPTIONS]}
                                            value={isExclusive ? 'yes' : 'no'}
                                            onChange={(v) => setIsExclusive(v === 'yes')}
                                        />
                                        <Text className={FIELD_HINT}>
                                            When ON, only hub members with the Exclusive role (or admins/owner) can see and join this tournament.
                                        </Text>
                                    </View>
                                </View>
                            </CollapsibleSection>

                            {/* ── Match Settings ── */}
                            <CollapsibleSection icon="options" title="Match Settings" color="#38BDF8" summary={matchSettingsSummary}>
                                <View className="gap-4">
                                    <View>
                                        <Text className={FIELD_LABEL}>Require Result Approval</Text>
                                        <SegmentedToggle
                                            options={[...YES_NO_OPTIONS]}
                                            value={requireResultApproval ? 'yes' : 'no'}
                                            onChange={(v) => setRequireResultApproval(v === 'yes')}
                                        />
                                        <Text className={FIELD_HINT}>
                                            When ON, the opposing participant must confirm a reported result. The hub owner or admin can override.
                                        </Text>
                                    </View>

                                    {/* Third Place Match — hidden for League, double-elim brackets, and pure Swiss */}
                                    {canShowThirdPlace && (
                                        <View>
                                            <Text className={FIELD_LABEL}>Third Place Match</Text>
                                            <SegmentedToggle
                                                options={[...YES_NO_OPTIONS]}
                                                value={hasThirdPlaceMatch ? 'yes' : 'no'}
                                                onChange={(v) => setHasThirdPlaceMatch(v === 'yes')}
                                            />
                                            <Text className={FIELD_HINT}>
                                                Adds a third place match between the semi-final losers. Skipped if the bracket ends up with fewer than 4 entrants.
                                            </Text>
                                        </View>
                                    )}

                                    {/* Double round robin — every pair plays twice (home + away). Shown for League and Groups+Bracket. */}
                                    {(selectedFormat === '0' || selectedFormat === '5') && (
                                        <View>
                                            <Text className={FIELD_LABEL}>Double Round Robin</Text>
                                            <SegmentedToggle
                                                options={[...YES_NO_OPTIONS]}
                                                value={doubleRoundRobin ? 'yes' : 'no'}
                                                onChange={(v) => setDoubleRoundRobin(v === 'yes')}
                                            />
                                            <Text className={FIELD_HINT}>
                                                Every pair plays twice — one home leg and one away leg. Doubles the match count.
                                            </Text>
                                        </View>
                                    )}

                                    {(selectedFormat === '0' || selectedFormat === '5' || isSwiss) && (
                                        <View>
                                            <Text className={FIELD_LABEL}>Round Duration (optional)</Text>
                                            <View className="flex-row gap-3">
                                                <View className="flex-1">
                                                    <TextInput
                                                        className={FIELD_INPUT}
                                                        placeholder="e.g. 2"
                                                        placeholderTextColor="#334155"
                                                        keyboardType="numeric"
                                                        value={roundDurationValue}
                                                        onChangeText={setRoundDurationValue}
                                                    />
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => setShowDurationUnitPicker(true)}
                                                    className="flex-1 bg-white/[0.03] px-4 h-12 rounded-2xl border border-white/[0.06] flex-row items-center justify-between"
                                                >
                                                    <Text className="text-white text-sm">{roundDurationUnit}</Text>
                                                    <Ionicons name="chevron-down" size={16} color="#64748B" />
                                                </TouchableOpacity>
                                            </View>
                                            <Text className={FIELD_HINT}>
                                                How long each round stays open before results are due.
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </CollapsibleSection>

                            {/* ── Schedule ── */}
                            <CollapsibleSection icon="calendar" title="Schedule" defaultOpen summary={scheduleSummary}>
                                <View className="flex-row gap-3">
                                    <View className="flex-1">
                                        <Text className={FIELD_LABEL}>Reg. Deadline *</Text>
                                        <TouchableOpacity
                                            onPress={() => setShowRegDeadlinePicker(true)}
                                            className="bg-white/[0.03] px-4 h-12 rounded-2xl border border-white/[0.06] justify-center"
                                        >
                                            <Text className={`${registrationDeadline ? 'text-white' : 'text-slate-500'} text-sm`} numberOfLines={1}>
                                                {registrationDeadline || 'Select Deadline'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View className="flex-1">
                                        <Text className={FIELD_LABEL}>Start Date *</Text>
                                        <TouchableOpacity
                                            onPress={() => setShowStartDatePicker(true)}
                                            className="bg-white/[0.03] px-4 h-12 rounded-2xl border border-white/[0.06] justify-center"
                                        >
                                            <Text className={`${startDate ? 'text-white' : 'text-slate-500'} text-sm`} numberOfLines={1}>
                                                {startDate || 'Select Start Date'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </CollapsibleSection>

                            {/* ── Prize Pool ── */}
                            <CollapsibleSection icon="cash" title="Prize Pool" color={COLORS.warning} summary={prizeSummary}>
                                <View className="flex-row gap-3">
                                    <View className="flex-1">
                                        <Text className={FIELD_LABEL}>Amount</Text>
                                        <TextInput
                                            className={FIELD_INPUT}
                                            placeholder="e.g. 500"
                                            placeholderTextColor="#334155"
                                            keyboardType="numeric"
                                            value={prizePool}
                                            onChangeText={setPrizePool}
                                        />
                                    </View>
                                    <View className="w-32">
                                        {renderSelectField('Currency', getCurrencyLabel(), () => setShowCurrencyPicker(true))}
                                    </View>
                                </View>
                            </CollapsibleSection>
                        </View>
                    </ScrollView>

                    <View className="p-5 bg-card border-t border-white/5">
                        {error && (
                            <Text className="text-red-400 text-xs mb-3 text-center">{error}</Text>
                        )}
                        <Button
                            onPress={handleSubmit}
                            disabled={isSubmitting}
                            loading={isSubmitting}
                            className="w-full h-14 rounded-2xl"
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
                        FORMAT_GROUP_OPTIONS.map(o => ({ value: o.value, label: o.label })),
                        formatGroup,
                        handleFormatGroupChange
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
            </KeyboardAvoidingView>
        </View>
    );
}

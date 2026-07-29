import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Pressable,
    Modal,
    KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ENDPOINTS, authenticatedFetch } from '../../lib/api';
import { SWISS_KNOCKOUT_OPTIONS, TEAM_TOURNAMENT_FORMATS, TOURNAMENT_FORMAT_OPTIONS, TournamentFormat, TournamentRegion } from '../../types/tournament';
import { TEAM_LABELS } from '../../lib/teamConstants';
import { CountryPicker } from '../ui/CountryPicker';
import { DateTimePickerModal } from './DateTimePickerModal';
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

interface EditTournamentModalProps {
    visible: boolean;
    onClose: () => void;
    tournament: any;
    onSaveSuccess: () => void;
}

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

const regionReverseMapping: Record<number, string> = Object.entries(regionMapping).reduce((acc, [key, val]) => ({ ...acc, [val]: key }), {});

// Resolve whatever shape the backend returned (number, string-label, or numeric-string)
// to the kebab-case key the dropdown uses. Returning 'global' silently when the value
// is unrecognized causes regions to reset to Global on save, so we only fall back
// when the input is genuinely missing.
function resolveRegionKey(region: unknown): string {
    if (region === null || region === undefined || region === '') return 'global';

    if (typeof region === 'number') {
        return regionReverseMapping[region] ?? 'global';
    }

    if (typeof region === 'string') {
        // Numeric string ("2") → use as enum number
        const asNum = Number(region);
        if (!isNaN(asNum) && regionReverseMapping[asNum] !== undefined) {
            return regionReverseMapping[asNum];
        }
        // Direct key match: "europe", "north-america"
        const normalized = region.toLowerCase().replace(/[\s_]+/g, '-');
        if (regionMapping[normalized] !== undefined) return normalized;
    }

    return 'global';
}

export function EditTournamentModal({ visible, onClose, tournament, onSaveSuccess }: EditTournamentModalProps) {
    const insets = useSafeAreaInsets();
    const tStatus = Number(tournament?.status !== undefined ? tournament.status : tournament?.Status);
    const isTeamTournament = Boolean(tournament?.isTeamTournament ?? tournament?.IsTeamTournament);
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
    const [selectedRegion, setSelectedRegion] = useState(resolveRegionKey(tournament?.region));
    const [startDate, setStartDate] = useState(tournament?.startDate || '');
    const [registrationDeadline, setRegistrationDeadline] = useState(tournament?.registrationDeadline || '');
    const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(Boolean(tournament?.hasThirdPlaceMatch ?? tournament?.HasThirdPlaceMatch));
    const [requireResultApproval, setRequireResultApproval] = useState(Boolean(tournament?.requireResultApproval ?? tournament?.RequireResultApproval));
    const [isExclusive, setIsExclusive] = useState(Boolean(tournament?.isExclusive ?? tournament?.IsExclusive));
    const [doubleRoundRobin, setDoubleRoundRobin] = useState(Boolean(tournament?.doubleRoundRobin ?? tournament?.DoubleRoundRobin));
    const [teamSize, setTeamSize] = useState(String(tournament?.teamSize ?? tournament?.TeamSize ?? ''));
    // Bench slots on top of the lineup — structural, so only editable before the tournament starts.
    const [allowReserves, setAllowReserves] = useState(Boolean(tournament?.allowReserves ?? tournament?.AllowReserves));
    const [maxReserves, setMaxReserves] = useState(String(tournament?.maxReserves ?? tournament?.MaxReserves ?? ''));
    const [teamWinCondition, setTeamWinCondition] = useState(
        String((tournament?.teamWinCondition ?? tournament?.TeamWinCondition) ?? '0')
    );

    // Scope: country list overrides region. Pre-fill the scope toggle from the persisted Countries.
    const initialCountries: string[] = Array.isArray(tournament?.countries ?? tournament?.Countries)
        ? (tournament?.countries ?? tournament?.Countries)
        : [];
    const [scopeMode, setScopeMode] = useState<'region' | 'country'>(
        initialCountries.length > 0 ? 'country' : 'region'
    );
    const [selectedCountries, setSelectedCountries] = useState<string[]>(initialCountries);

    const toggleCountry = (code: string) => {
        setSelectedCountries(prev =>
            prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
        );
    };

    // Swiss format config: rounds (empty = auto), knockout size ('0' = pure Swiss),
    // direct berths (empty = everyone qualifies directly, no play-in).
    const [swissRounds, setSwissRounds] = useState(tournament?.swissRoundsCount ? String(tournament.swissRoundsCount) : '');
    const [swissKnockout, setSwissKnockout] = useState(String(tournament?.swissKnockoutQualifiers || '0'));
    const [swissDirect, setSwissDirect] = useState(
        tournament?.swissDirectQualifiers != null ? String(tournament.swissDirectQualifiers) : '');
    // Knockout bracket style for Groups+Bracket / Swiss: '1' = Single, '2' = Double elimination.
    const [knockoutType, setKnockoutType] = useState(String(tournament?.knockoutEliminationType || '1'));
    const [showSwissKnockoutPicker, setShowSwissKnockoutPicker] = useState(false);

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
    const [showTeamWinConditionPicker, setShowTeamWinConditionPicker] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getFormatLabel = () => {
        return TOURNAMENT_FORMAT_OPTIONS.find(f => f.value === selectedFormat)?.label || 'Select Format';
    };

    // Team tournaments only support a subset of formats (no Swiss / Groups-then-X), so the
    // picker is restricted to those. Solo tournaments get the full list. The format stays
    // editable until the tournament starts (canEditAll), since no bracket exists yet.
    const formatOptions = isTeamTournament
        ? TOURNAMENT_FORMAT_OPTIONS.filter(o => TEAM_TOURNAMENT_FORMATS.some(f => f === Number(o.value)))
        : TOURNAMENT_FORMAT_OPTIONS;

    // Number of bracket entrants: players for solo, teams for team tournaments.
    // Use the editable teamSize so the format/third-place gates reflect the user's pending edit.
    const teamSizeNum = parseInt(teamSize) || 0;
    const participantCount = isTeamTournament
        ? (teamSizeNum > 0 && parseInt(maxPlayers) ? Math.floor(parseInt(maxPlayers) / teamSizeNum) : 0)
        : (parseInt(maxPlayers) || 0);

    const isSwiss = selectedFormat === String(TournamentFormat.Swiss);
    const swissKnockoutSize = isSwiss ? parseInt(swissKnockout) || 0 : 0;
    const swissDirectCount = swissKnockout !== '0' && swissDirect !== ''
        ? parseInt(swissDirect)
        : swissKnockoutSize;
    const swissPlayInPlayers = swissKnockoutSize > 0 && swissDirectCount < swissKnockoutSize
        ? 2 * (swissKnockoutSize - swissDirectCount)
        : 0;

    // Single/Double knockout choice for the Groups+Bracket / Swiss bracket phase. Needs >= 4 bracket
    // slots for a real losers bracket. (Swiss is solo-only; Groups+Bracket supports team double-elim.)
    const groupsTotalQualifiers = (parseInt(groupsCount) || 0) * (parseInt(qualifiersPerGroup) || 0);
    const showKnockoutTypeToggle =
        (selectedFormat === String(TournamentFormat.GroupStageWithKnockout) && groupsTotalQualifiers >= 4) ||
        (isSwiss && swissKnockoutSize >= 4);

    // Third place exists whenever the run ends in a single-elimination bracket with real
    // semi-finals. League never has a bracket, a double-elimination bracket decides 3rd via
    // the losers bracket final, and pure Swiss (knockout 'None') crowns the winner straight
    // from the standings — so those hide the toggle. Entrants = bracket slots of the phase
    // hosting the final: group qualifiers / Swiss knockout size / everyone.
    const thirdPlaceEntrants =
        selectedFormat === String(TournamentFormat.GroupStageWithKnockout) ? groupsTotalQualifiers :
        isSwiss ? swissKnockoutSize :
        participantCount;
    const usesDoubleElimBracket =
        selectedFormat === String(TournamentFormat.DoubleElimination) ||
        (showKnockoutTypeToggle && knockoutType === '2');
    const canShowThirdPlace =
        selectedFormat !== String(TournamentFormat.League) && !usesDoubleElimBracket && thirdPlaceEntrants > 2;

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

    // Re-sync form fields whenever the modal opens or the tournament prop changes.
    // useState initializers only run on the first mount; without this the modal
    // keeps showing the initial values even after the parent refetches.
    useEffect(() => {
        if (!visible || !tournament) return;

        setName(tournament?.name || '');
        setDescription(tournament?.description || '');
        setRules(tournament?.rules || '');
        setMaxPlayers(String(tournament?.maxPlayers || ''));
        setSelectedFormat(String(tournament?.format !== undefined ? tournament.format : '3'));
        setGroupsCount(String(tournament?.groupsCount || '4'));
        setQualifiersPerGroup(String(tournament?.qualifiersPerGroup || '2'));
        setPrize(String(tournament?.prize || ''));
        setPrizeCurrency(String(tournament?.prizeCurrency || '1'));
        setSelectedRegion(resolveRegionKey(tournament?.region));
        setStartDate(tournament?.startDate || '');
        setRegistrationDeadline(tournament?.registrationDeadline || '');
        setHasThirdPlaceMatch(Boolean(tournament?.hasThirdPlaceMatch ?? tournament?.HasThirdPlaceMatch));
        setRequireResultApproval(Boolean(tournament?.requireResultApproval ?? tournament?.RequireResultApproval));
        setIsExclusive(Boolean(tournament?.isExclusive ?? tournament?.IsExclusive));
        setDoubleRoundRobin(Boolean(tournament?.doubleRoundRobin ?? tournament?.DoubleRoundRobin));
        setTeamSize(String(tournament?.teamSize ?? tournament?.TeamSize ?? ''));
        setAllowReserves(Boolean(tournament?.allowReserves ?? tournament?.AllowReserves));
        setMaxReserves(String(tournament?.maxReserves ?? tournament?.MaxReserves ?? ''));
        setTeamWinCondition(String((tournament?.teamWinCondition ?? tournament?.TeamWinCondition) ?? '0'));
        const refreshedCountries: string[] = Array.isArray(tournament?.countries ?? tournament?.Countries)
            ? (tournament?.countries ?? tournament?.Countries)
            : [];
        setSelectedCountries(refreshedCountries);
        setScopeMode(refreshedCountries.length > 0 ? 'country' : 'region');
        setSwissRounds(tournament?.swissRoundsCount ? String(tournament.swissRoundsCount) : '');
        setSwissKnockout(String(tournament?.swissKnockoutQualifiers || '0'));
        setSwissDirect(tournament?.swissDirectQualifiers != null ? String(tournament.swissDirectQualifiers) : '');
        setKnockoutType(String(tournament?.knockoutEliminationType || '1'));

        const durMinutes = tournament?.roundDurationMinutes;
        if (durMinutes != null) {
            if (durMinutes > 0 && durMinutes % 1440 === 0) {
                setRoundDurationValue(String(durMinutes / 1440));
                setRoundDurationUnit('Days');
            } else if (durMinutes > 0 && durMinutes % 60 === 0) {
                setRoundDurationValue(String(durMinutes / 60));
                setRoundDurationUnit('Hours');
            } else {
                setRoundDurationValue(String(durMinutes));
                setRoundDurationUnit('Minutes');
            }
        } else {
            setRoundDurationValue('');
            setRoundDurationUnit('Minutes');
        }

        setError(null);
    }, [visible, tournament]);

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

        if (isTeamTournament) {
            const selectedFormatValue = Number(selectedFormat);
            const isAllowedTeamFormat = TEAM_TOURNAMENT_FORMATS.some((format) => format === selectedFormatValue);
            if (!isAllowedTeamFormat) {
                setError('Team tournaments only support Single Bracket, Double Bracket, League, or Groups + Bracket');
                return;
            }
            // Team size and Max Players must still produce ≥ 2 teams once the bracket is built.
            if (canEditAll) {
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
                if (allowReserves) {
                    const mr = parseInt(maxReserves);
                    if (!maxReserves || isNaN(mr) || mr < 1 || mr > 11) {
                        setError('Reserves per team must be between 1 and 11');
                        return;
                    }
                }
            }
        }

        if (canEditAll && scopeMode === 'country' && selectedCountries.length === 0) {
            setError('Please select at least one country for a country-based tournament');
            return;
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
            if ((selectedFormat === '0' || selectedFormat === '5' || isSwiss) && roundDurationValue) {
                const val = parseInt(roundDurationValue);
                if (!isNaN(val)) {
                    if (roundDurationUnit === 'Minutes') roundDurationMinutes = val;
                    else if (roundDurationUnit === 'Hours') roundDurationMinutes = val * 60;
                    else if (roundDurationUnit === 'Days') roundDurationMinutes = val * 1440;
                }
            }

            const isLeagueOrGroup = selectedFormat === '0' || selectedFormat === '5';
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
                SwissRoundsCount: isSwiss && swissRounds ? parseInt(swissRounds) : null,
                SwissKnockoutQualifiers: isSwiss && swissKnockoutSize > 0 ? swissKnockoutSize : null,
                SwissDirectQualifiers: isSwiss && swissKnockoutSize > 0 && swissDirectCount < swissKnockoutSize
                    ? swissDirectCount
                    : null,
                // Single (1) / Double (2) elimination for the Groups+Bracket / Swiss knockout phase.
                KnockoutEliminationType: showKnockoutTypeToggle ? parseInt(knockoutType) : null,
                RegistrationDeadline: registrationDeadline ? new Date(registrationDeadline).toISOString() : null,
                Prize: parseInt(prize) || 0,
                PrizeCurrency: parseInt(prizeCurrency) || 1,
                Region: regionMapping[selectedRegion] ?? 0,
                Countries: scopeMode === 'country' ? selectedCountries : null,
                RoundDurationMinutes: roundDurationMinutes,
                // Always sent so an edit never silently resets it; only changeable before the bracket is
                // generated. Forced off when the current format can't host one (League / double-elim /
                // pure Swiss) so a format switch clears a stale flag.
                HasThirdPlaceMatch: canShowThirdPlace ? hasThirdPlaceMatch : false,
                RequireResultApproval: requireResultApproval,
                // Structural fields the backend will only honour when AllowStructuralEdits=true and the
                // tournament hasn't started; otherwise it preserves the persisted values regardless of
                // what we send. IsTeamTournament is locked forever — sent for completeness only.
                IsTeamTournament: isTeamTournament,
                TeamSize: isTeamTournament ? (parseInt(teamSize) || null) : null,
                AllowReserves: isTeamTournament ? allowReserves : false,
                MaxReserves: isTeamTournament && allowReserves ? (parseInt(maxReserves) || null) : null,
                TeamWinCondition: parseInt(teamWinCondition) || 0,
                IsExclusive: isExclusive,
                DoubleRoundRobin: isLeagueOrGroup ? doubleRoundRobin : false,
                AllowStructuralEdits: true,
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

    // `standalone` = rendered on its own in a column. The default flex-1 is for row
    // usage — in an auto-height column flex-1 collapses the field to height 0 and it
    // paints over the next field.
    const renderSelectField = (label: string, value: string, onPress: () => void, disabled = false, standalone = false) => (
        <View className={standalone ? undefined : 'flex-1'}>
            <Text className={FIELD_LABEL}>{label}</Text>
            <TouchableOpacity
                onPress={onPress}
                disabled={disabled}
                className={`bg-white/[0.03] px-4 h-12 rounded-2xl border border-white/[0.06] flex-row justify-between items-center ${disabled ? 'opacity-50' : ''}`}
            >
                <Text className="text-white text-sm" numberOfLines={1}>{value}</Text>
                {!disabled && <Ionicons name="chevron-down" size={16} color="#64748B" />}
            </TouchableOpacity>
        </View>
    );

    const renderOptionsModal = (
        visible: boolean,
        onCloseModal: () => void,
        options: ReadonlyArray<{ value: string; label: string }>,
        selected: string | string[],
        onSelect: (val: string) => void,
        multi = false
    ) => {
        if (!visible) return null;
        return (
            <Modal visible={visible} transparent animationType="fade">
                <Pressable className="flex-1 bg-black/60 justify-center px-6" onPress={onCloseModal}>
                    <View className="bg-card rounded-3xl border border-white/10 max-h-[60%] overflow-hidden shadow-2xl">
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
                                        className={`p-4 mb-2 rounded-2xl flex-row justify-between items-center ${active ? 'bg-primary' : 'bg-card-elevated'}`}
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

    // Collapsed-header recaps so a skimmed form still reads at a glance.
    const basicsSummary = [
        name.trim() || 'Unnamed',
        getFormatLabel(),
        maxPlayers ? `${maxPlayers} players` : null,
    ].filter(Boolean).join(' · ');
    const detailsSummary = (String(description).trim() || String(rules).trim()) ? 'Added' : 'Optional';
    const accessSummary = [
        isTeamTournament ? TEAM_LABELS.MODE_TEAM : TEAM_LABELS.MODE_SOLO,
        isTeamTournament && allowReserves && maxReserves ? `+${maxReserves} reserves` : null,
        scopeMode === 'region' ? getRegionLabel() : `${selectedCountries.length} ${selectedCountries.length === 1 ? 'country' : 'countries'}`,
        isExclusive ? 'Exclusive' : null,
    ].filter(Boolean).join(' · ');
    const matchSettingsSummary = [
        requireResultApproval ? 'Result approval' : null,
        canShowThirdPlace && hasThirdPlaceMatch ? 'Third place' : null,
        (selectedFormat === '0' || selectedFormat === '5') && doubleRoundRobin ? 'Double round robin' : null,
    ].filter(Boolean).join(' · ') || 'Defaults';
    const scheduleSummary = startDate ? `Starts ${new Date(startDate).toLocaleString()}` : 'Not set';
    const prizeSummary = prize && prize !== '0' ? `${prize} ${getCurrencyLabel()}` : 'None';

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1 bg-black/80 justify-end"
            >
                <View
                    className="bg-background w-full rounded-t-[40px] border-t border-white/10 shadow-2xl overflow-hidden"
                    style={{ maxHeight: '90%' }}
                >
                    <View className="flex-row justify-between items-center p-6 border-b border-white/5">
                        <View>
                            <Text className="text-[10px] font-black uppercase tracking-[2px] text-primary mb-0.5">Manage Tournament</Text>
                            <Text className="text-xl font-black text-white">Edit Tournament</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="bg-white/5 p-2 rounded-full">
                            <Ionicons name="close" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        className="px-5 py-4"
                        contentContainerStyle={{ paddingBottom: 40 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <View className="gap-4">
                            {/* Started tournaments lock structural fields — say so instead of leaving
                                mysteriously disabled inputs. */}
                            {!canEditAll && (
                                <View className="flex-row items-start gap-2.5 bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-3.5">
                                    <Ionicons name="lock-closed" size={14} color={COLORS.warning} style={{ marginTop: 1 }} />
                                    <Text style={{ color: '#FCD34D' }} className="text-xs flex-1 leading-4">
                                        The tournament has started — only the description, rules and result approval can still be changed.
                                    </Text>
                                </View>
                            )}

                            {/* ── Basics: name, size, format ── */}
                            <CollapsibleSection icon="trophy" title="Basics" defaultOpen summary={basicsSummary}>
                                <View className="gap-4">
                                    <View>
                                        <Text className={FIELD_LABEL}>Tournament Name *</Text>
                                        <TextInput
                                            className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                            placeholder="Enter tournament name"
                                            placeholderTextColor="#334155"
                                            value={name}
                                            onChangeText={setName}
                                            editable={canEditAll}
                                        />
                                    </View>

                                    <View className="flex-row gap-3">
                                        <View className="flex-1">
                                            <Text className={FIELD_LABEL}>Max Players *</Text>
                                            <TextInput
                                                className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                                placeholder="e.g. 16"
                                                placeholderTextColor="#334155"
                                                keyboardType="numeric"
                                                value={maxPlayers}
                                                onChangeText={setMaxPlayers}
                                                editable={canEditAll}
                                            />
                                        </View>
                                        {renderSelectField('Format', getFormatLabel(), () => setShowFormatPicker(true), !canEditAll)}
                                    </View>

                                    {selectedFormat === '5' && (
                                        <View className="flex-row gap-3">
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>Groups Count</Text>
                                                <TextInput
                                                    className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                                    placeholder="e.g. 4"
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={groupsCount}
                                                    onChangeText={setGroupsCount}
                                                    editable={canEditAll}
                                                />
                                            </View>
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>Qualifiers / Group</Text>
                                                <TextInput
                                                    className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                                    placeholder="e.g. 2"
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={qualifiersPerGroup}
                                                    onChangeText={setQualifiersPerGroup}
                                                    editable={canEditAll}
                                                />
                                            </View>
                                        </View>
                                    )}

                                    {isSwiss && (
                                        <View className="gap-4">
                                            <View className="flex-row gap-3">
                                                <View className="flex-1">
                                                    <Text className={FIELD_LABEL}>Swiss Rounds</Text>
                                                    <TextInput
                                                        className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                                        placeholder="Auto"
                                                        placeholderTextColor="#334155"
                                                        keyboardType="numeric"
                                                        value={swissRounds}
                                                        onChangeText={setSwissRounds}
                                                        editable={canEditAll}
                                                    />
                                                </View>
                                                {renderSelectField(
                                                    'Knockout Stage',
                                                    SWISS_KNOCKOUT_OPTIONS.find(o => o.value === swissKnockout)?.label || 'None',
                                                    () => setShowSwissKnockoutPicker(true),
                                                    !canEditAll
                                                )}
                                            </View>

                                            {swissKnockoutSize > 0 && (
                                                <View>
                                                    <Text className={FIELD_LABEL}>Direct Qualifiers (optional play-in)</Text>
                                                    <TextInput
                                                        className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                                        placeholder={`All ${swissKnockoutSize} direct — enter fewer to add a play-in`}
                                                        placeholderTextColor="#334155"
                                                        keyboardType="numeric"
                                                        value={swissDirect}
                                                        onChangeText={setSwissDirect}
                                                        editable={canEditAll}
                                                    />
                                                    <Text className={FIELD_HINT}>
                                                        {swissPlayInPlayers > 0 && !isNaN(swissDirectCount)
                                                            ? `Top ${swissDirectCount} go straight to the bracket. Standings ${swissDirectCount + 1}–${swissDirectCount + swissPlayInPlayers} play one play-in round for the remaining ${swissKnockoutSize - swissDirectCount} spots.`
                                                            : `Top ${swissKnockoutSize} from the standings are seeded into the bracket (1 vs ${swissKnockoutSize}, 2 vs ${swissKnockoutSize - 1}, …).`}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {showKnockoutTypeToggle && (
                                        <View>
                                            <Text className={FIELD_LABEL}>Knockout Bracket</Text>
                                            <SegmentedToggle
                                                options={[
                                                    { value: '1', label: 'Single' },
                                                    { value: '2', label: 'Double' },
                                                ]}
                                                value={knockoutType === '2' ? '2' : '1'}
                                                onChange={setKnockoutType}
                                                disabled={!canEditAll}
                                            />
                                            <Text className={FIELD_HINT}>
                                                Single: one loss and you're out. Double: a losers bracket gives everyone a second chance before elimination.
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </CollapsibleSection>

                            {/* ── Description & Rules (always editable) ── */}
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
                                            placeholder="Tournament rules..."
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
                                    {isTeamTournament && (
                                        <View className="flex-row gap-3">
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>{TEAM_LABELS.TEAM_SIZE_LABEL} *</Text>
                                                <TextInput
                                                    className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                                    placeholder={TEAM_LABELS.TEAM_SIZE_PLACEHOLDER}
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={teamSize}
                                                    onChangeText={setTeamSize}
                                                    editable={canEditAll}
                                                />
                                            </View>
                                            {renderSelectField(
                                                'Win Condition',
                                                teamWinConditions.find(c => c.value === teamWinCondition)?.label || 'Select',
                                                () => { if (canEditAll) setShowTeamWinConditionPicker(true); },
                                                !canEditAll
                                            )}
                                        </View>
                                    )}

                                    {/* Reserves — structural, so locked once the bracket exists (rosters are
                                        already split into lineup/bench by then). */}
                                    {isTeamTournament && (
                                        <View>
                                            <Text className={FIELD_LABEL}>Allow Reserves</Text>
                                            <SegmentedToggle
                                                options={[...YES_NO_OPTIONS]}
                                                value={allowReserves ? 'yes' : 'no'}
                                                onChange={(v) => setAllowReserves(v === 'yes')}
                                                disabled={!canEditAll}
                                            />
                                            {allowReserves ? (
                                                <View className="mt-3">
                                                    <Text className={FIELD_LABEL}>Reserves Per Team *</Text>
                                                    <TextInput
                                                        className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                                        placeholder="e.g. 2"
                                                        placeholderTextColor="#334155"
                                                        keyboardType="numeric"
                                                        value={maxReserves}
                                                        onChangeText={setMaxReserves}
                                                        editable={canEditAll}
                                                    />
                                                    <Text className={FIELD_HINT}>
                                                        Extra squad slots on top of the {teamSize || 'lineup'} players who
                                                        play. Teams fill 0 up to this many, and captains swap a reserve in
                                                        for a starter between rounds — always into that player's exact game.
                                                    </Text>
                                                </View>
                                            ) : (
                                                <Text className={FIELD_HINT}>
                                                    When OFF, the roster is the lineup — every member plays.
                                                </Text>
                                            )}
                                        </View>
                                    )}

                                    <View>
                                        <Text className={FIELD_LABEL}>Tournament Scope</Text>
                                        <SegmentedToggle
                                            options={[
                                                { value: 'region', label: 'By Region' },
                                                { value: 'country', label: 'By Country' },
                                            ]}
                                            value={scopeMode}
                                            onChange={(v) => setScopeMode(v as 'region' | 'country')}
                                            disabled={!canEditAll}
                                        />
                                        <View className="mt-3">
                                            {scopeMode === 'region' ? (
                                                renderSelectField('Region', getRegionLabel(), () => setShowRegionPicker(true), !canEditAll, true)
                                            ) : (
                                                <View pointerEvents={canEditAll ? 'auto' : 'none'} style={{ opacity: canEditAll ? 1 : 0.5 }}>
                                                    <CountryPicker
                                                        placeholder="Select countries"
                                                        multiple
                                                        values={selectedCountries}
                                                        onToggle={toggleCountry}
                                                    />
                                                </View>
                                            )}
                                        </View>
                                    </View>

                                    <View>
                                        <Text className={FIELD_LABEL}>Exclusive Members Only</Text>
                                        <SegmentedToggle
                                            options={[...YES_NO_OPTIONS]}
                                            value={isExclusive ? 'yes' : 'no'}
                                            onChange={(v) => setIsExclusive(v === 'yes')}
                                            disabled={!canEditAll}
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
                                        {/* Approval can be toggled any time — even mid-tournament — since it only
                                            affects how future results are confirmed, not the bracket structure. */}
                                        <SegmentedToggle
                                            options={[...YES_NO_OPTIONS]}
                                            value={requireResultApproval ? 'yes' : 'no'}
                                            onChange={(v) => setRequireResultApproval(v === 'yes')}
                                        />
                                        <Text className={FIELD_HINT}>
                                            Opponent must confirm a reported result. Owner / admin can override.
                                        </Text>
                                    </View>

                                    {canShowThirdPlace && (
                                        <View>
                                            <Text className={FIELD_LABEL}>Third Place Match</Text>
                                            <SegmentedToggle
                                                options={[...YES_NO_OPTIONS]}
                                                value={hasThirdPlaceMatch ? 'yes' : 'no'}
                                                onChange={(v) => setHasThirdPlaceMatch(v === 'yes')}
                                                disabled={!canEditAll}
                                            />
                                            <Text className={FIELD_HINT}>
                                                Adds a third place match between the semi-final losers. Skipped if the bracket ends up with fewer than 4 entrants. Takes effect when the bracket is generated.
                                            </Text>
                                        </View>
                                    )}

                                    {(selectedFormat === '0' || selectedFormat === '5') && (
                                        <View>
                                            <Text className={FIELD_LABEL}>Double Round Robin</Text>
                                            <SegmentedToggle
                                                options={[...YES_NO_OPTIONS]}
                                                value={doubleRoundRobin ? 'yes' : 'no'}
                                                onChange={(v) => setDoubleRoundRobin(v === 'yes')}
                                                disabled={!canEditAll}
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
                                                        className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                                        placeholder="e.g. 2"
                                                        placeholderTextColor="#334155"
                                                        keyboardType="numeric"
                                                        value={roundDurationValue}
                                                        onChangeText={setRoundDurationValue}
                                                        editable={canEditAll}
                                                    />
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => { if (canEditAll) setShowDurationUnitPicker(true); }}
                                                    disabled={!canEditAll}
                                                    className={`flex-1 bg-white/[0.03] px-4 h-12 rounded-2xl border border-white/[0.06] flex-row items-center justify-between ${!canEditAll ? 'opacity-50' : ''}`}
                                                >
                                                    <Text className="text-white text-sm">{roundDurationUnit}</Text>
                                                    <Ionicons name="chevron-down" size={16} color="#64748B" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            </CollapsibleSection>

                            {/* ── Schedule ── */}
                            <CollapsibleSection icon="calendar" title="Schedule" defaultOpen summary={scheduleSummary}>
                                <View className="flex-row gap-3">
                                    <View className="flex-1">
                                        <Text className={FIELD_LABEL}>Reg. Deadline</Text>
                                        <TouchableOpacity
                                            onPress={() => setShowRegDeadlinePicker(true)}
                                            disabled={!canEditDeadline}
                                            className={`bg-white/[0.03] px-4 h-12 rounded-2xl border border-white/[0.06] justify-center ${!canEditDeadline ? 'opacity-50' : ''}`}
                                        >
                                            <Text className={`${registrationDeadline ? 'text-white' : 'text-slate-500'} text-sm`} numberOfLines={1}>
                                                {registrationDeadline ? new Date(registrationDeadline).toLocaleString() : 'Select Deadline'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View className="flex-1">
                                        <Text className={FIELD_LABEL}>Start Date</Text>
                                        <TouchableOpacity
                                            onPress={() => setShowStartDatePicker(true)}
                                            disabled={!canEditAll}
                                            className={`bg-white/[0.03] px-4 h-12 rounded-2xl border border-white/[0.06] justify-center ${!canEditAll ? 'opacity-50' : ''}`}
                                        >
                                            <Text className={`${startDate ? 'text-white' : 'text-slate-500'} text-sm`} numberOfLines={1}>
                                                {startDate ? new Date(startDate).toLocaleString() : 'Select Start Date'}
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
                                            className={`${FIELD_INPUT} ${!canEditAll ? 'opacity-50' : ''}`}
                                            placeholder="Amount"
                                            placeholderTextColor="#334155"
                                            keyboardType="numeric"
                                            value={prize}
                                            onChangeText={setPrize}
                                            editable={canEditAll}
                                        />
                                    </View>
                                    <View className="w-32">
                                        {renderSelectField('Currency', getCurrencyLabel(), () => setShowCurrencyPicker(true), !canEditAll)}
                                    </View>
                                </View>
                            </CollapsibleSection>
                        </View>
                    </ScrollView>

                    <View className="p-5 bg-card border-t border-white/5" style={{ paddingBottom: insets.bottom + 16 }}>
                        {error && (
                            <Text className="text-red-400 text-xs mb-3 text-center">{error}</Text>
                        )}
                        <Button
                            onPress={handleSave}
                            disabled={isSubmitting}
                            loading={isSubmitting}
                            className="w-full h-14 rounded-2xl"
                        >
                            Save Changes
                        </Button>
                    </View>
                </View>

                {renderOptionsModal(
                    showFormatPicker,
                    () => setShowFormatPicker(false),
                    formatOptions,
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
                    showSwissKnockoutPicker,
                    () => setShowSwissKnockoutPicker(false),
                    SWISS_KNOCKOUT_OPTIONS,
                    swissKnockout,
                    setSwissKnockout
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

                {renderOptionsModal(
                    showTeamWinConditionPicker,
                    () => setShowTeamWinConditionPicker(false),
                    teamWinConditions,
                    teamWinCondition,
                    setTeamWinCondition
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

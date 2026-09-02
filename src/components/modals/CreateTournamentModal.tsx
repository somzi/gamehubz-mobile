import React, { useState, useEffect, useMemo } from 'react';
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
import { ScheduleField } from '../ui/ScheduleField';
import { SWISS_KNOCKOUT_OPTIONS, TEAM_TOURNAMENT_FORMATS, TournamentFormat, TournamentRegion } from '../../types/tournament';
import { useTranslation } from 'react-i18next';
import { CountryPicker } from '../ui/CountryPicker';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { MatchFormatPicker } from '../match/MatchFormatPicker';
import { SeriesWinConditionValue } from '../../lib/series';
import { COLORS } from '../../lib/theme';

// Option arrays keep their VALUES at module scope (types below depend on them) but carry
// i18n keys instead of labels — labels are resolved per render so a language switch applies.
const YES_NO_OPTIONS = [
    { value: 'no', labelKey: 'common:no' },
    { value: 'yes', labelKey: 'common:yes' },
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

const REGION_OPTIONS = [
    { value: 'global', labelKey: 'scope.global' },
    { value: 'europe', labelKey: 'scope.europe' },
    { value: 'north-america', labelKey: 'scope.northAmerica' },
    { value: 'south-america', labelKey: 'scope.southAmerica' },
    { value: 'asia', labelKey: 'scope.asia' },
    { value: 'africa', labelKey: 'scope.africa' },
    { value: 'oceania', labelKey: 'scope.oceania' },
];

const prizeCurrencies = [
    { value: '1', label: 'EUR' },
    { value: '2', label: 'USD' },
    { value: '3', label: 'StarPass' },
    { value: '4', label: 'FCP' },
];

const DURATION_UNIT_OPTIONS = [
    { value: 'Minutes', labelKey: 'duration.minutes' },
    { value: 'Hours', labelKey: 'duration.hours' },
    { value: 'Days', labelKey: 'duration.days' },
];

const TEAM_WIN_CONDITION_OPTIONS = [
    { value: '0', labelKey: 'teamWinCondition.matchWins' },
    { value: '1', labelKey: 'teamWinCondition.aggregateScore' },
];

// User-facing format groups. Single/Double Elimination collapse into one "Bracket"
// entry — the Single/Double sub-toggle picks between them. The backend still receives
// the full TournamentFormat (3 = SingleElim, 4 = DoubleElim).
const FORMAT_GROUP_OPTIONS = [
    { value: 'league', labelKey: 'formatGroup.league' },
    { value: 'bracket', labelKey: 'formatGroup.bracket' },
    { value: 'groups-bracket', labelKey: 'formatGroup.groupsBracket' },
    { value: 'swiss', labelKey: 'formatGroup.swiss' },
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
    const { t } = useTranslation('tournament');
    const { t: tTeam } = useTranslation('team');

    // Labels resolved here rather than at module scope so switching language re-renders them.
    const swissKnockoutOptions = useMemo(
        () => SWISS_KNOCKOUT_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const yesNoOptions = useMemo(
        () => YES_NO_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const regions = useMemo(
        () => REGION_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const durationUnits = useMemo(
        () => DURATION_UNIT_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const teamWinConditions = useMemo(
        () => TEAM_WIN_CONDITION_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const formatGroupOptions = useMemo(
        () => FORMAT_GROUP_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);

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
    // Optional scheduled opening. Empty = the old behaviour, registration is open the moment the
    // tournament is created. Set to a future time and the backend keeps it as a draft nobody can
    // join until then, opening and announcing it on the dot.
    const [registrationOpensAt, setRegistrationOpensAt] = useState('');
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
    // Bench players on top of the lineup. When on, MaxReserves is how many slots each team gets —
    // a team may fill 0..N of them, so the bench is an option, never a requirement.
    const [allowReserves, setAllowReserves] = useState(false);
    const [maxReserves, setMaxReserves] = useState('');
    const [teamWinCondition, setTeamWinCondition] = useState('0');

    // Third place play-off (any format that ends in a single-elimination bracket)
    const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(false);

    // Result approval — when on, reported scores need opponent (or admin) confirmation.
    const [requireResultApproval, setRequireResultApproval] = useState(false);

    // Series format: how many games a single match is played over, how those games decide the
    // match, and what settles a level knockout series. 1 = one game, the pre-series default.
    const [bestOf, setBestOf] = useState(1);
    const [seriesWinCondition, setSeriesWinCondition] = useState<SeriesWinConditionValue>(0);
    // Null = a level knockout series is replayed under the match's own Best-of.
    const [tiebreakBestOf, setTiebreakBestOf] = useState<number | null>(null);
    // Null = the knockout is played over the same Best-of as the phase that feeds it.
    const [knockoutBestOf, setKnockoutBestOf] = useState<number | null>(null);

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
    const [showRegOpensPicker, setShowRegOpensPicker] = useState(false);
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
                                name: h.name || h.hubName || t('form.unnamedHub')
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
        if (selectedRegions.includes('global')) return t('scope.global');
        if (selectedRegions.length === 1) {
            return regions.find(r => r.value === selectedRegions[0])?.label ?? t('form.region');
        }
        return t('form.regionsSelected', { count: selectedRegions.length });
    };

    const getHubLabel = () => {
        if (isLoadingHubs) return t('form.loadingHubs');
        if (hubs.length === 0) return t('form.noHubsFound');
        return hubs.find(h => h.id === selectedHubId)?.name || t('form.selectHub');
    };

    const getCurrencyLabel = () => {
        return prizeCurrencies.find(c => c.value === prizeCurrency)?.label || t('form.currency');
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
        return formatGroupOptions.find(f => f.value === formatGroup)?.label || t('form.selectFormat');
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

    // Does this tournament ever play a knockout match? That is the only place a level series has to
    // be replayed — League records it as a draw, and Swiss only knocks out when a bracket follows.
    const hasKnockoutPhase = formatGroup === 'bracket'
        || formatGroup === 'groups-bracket'
        || (formatGroup === 'swiss' && swissKnockout !== '0');
    // A knockout that FOLLOWS another phase is the only one worth its own length: a plain bracket
    // is a single phase, so one Best-of already describes every match it plays.
    const hasSeparateKnockoutPhase = hasKnockoutPhase && formatGroup !== 'bracket';
    const firstPhaseLabel = formatGroup === 'swiss' ? t('form.swissRounds') : t('form.groupStage');
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
            setError(t('validation.nameAndHubRequired'));
            return;
        }

        if (!maxPlayers || isNaN(parseInt(maxPlayers)) || parseInt(maxPlayers) <= 0) {
            setError(t('validation.maxPlayersRequired'));
            return;
        }

        if (scopeMode === 'country' && selectedCountries.length === 0) {
            setError(t('validation.countryRequired'));
            return;
        }

        if (isTeamTournament) {
            const ts = parseInt(teamSize);
            if (!teamSize || isNaN(ts) || ts < 2 || ts > 11) {
                setError(t('validation.teamSizeRange'));
                return;
            }
            const mp = parseInt(maxPlayers);
            if (mp < ts * 2) {
                setError(t('validation.maxPlayersForTeams', { min: ts * 2 }));
                return;
            }

            if (allowReserves) {
                const mr = parseInt(maxReserves);
                if (!maxReserves || isNaN(mr) || mr < 1 || mr > 11) {
                    setError(t('validation.reservesRange'));
                    return;
                }
            }

            const selectedFormatValue = Number(selectedFormat);
            const isAllowedTeamFormat = TEAM_TOURNAMENT_FORMATS.some((format) => format === selectedFormatValue);
            if (!isAllowedTeamFormat) {
                setError(t('validation.teamFormatUnsupported'));
                return;
            }
        }

        if (selectedFormat === String(TournamentFormat.DoubleElimination) && participantCount > 0 && participantCount < 4) {
            setError(t('validation.doubleElimMinPlayers'));
            return;
        }

        // Groups + Bracket pads the knockout up to the next power of two with byes (single- and
        // double-elimination alike), so any qualifier count >= 2 works.
        if (selectedFormat === String(TournamentFormat.GroupStageWithKnockout) && groupsTotalQualifiers < 2) {
            setError(t('validation.groupsQualifiersMin'));
            return;
        }

        if (isSwiss && swissKnockoutSize > 0) {
            if (swissKnockoutSize > participantCount) {
                setError(t('validation.knockoutExceedsPlayers', { knockout: swissKnockoutSize, players: participantCount }));
                return;
            }
            if (isNaN(swissDirectCount) || swissDirectCount < 0 || swissDirectCount > swissKnockoutSize) {
                setError(t('validation.directQualifiersRange', { max: swissKnockoutSize }));
                return;
            }
            if (swissPlayInPlayers > 0 && swissDirectCount + swissPlayInPlayers > participantCount) {
                setError(t('validation.playInNeedsPlayers', { needed: swissDirectCount + swissPlayInPlayers, direct: swissDirectCount, playIn: swissPlayInPlayers, players: participantCount }));
                return;
            }
        }

        if (!startDate || !registrationDeadline) {
            setError(t('validation.scheduleRequired'));
            return;
        }

        const now = new Date();
        const start = new Date(startDate.replace(' ', 'T'));
        const deadline = new Date(registrationDeadline.replace(' ', 'T'));

        if (deadline < now) {
            setError(t('validation.deadlineInPast'));
            return;
        }

        if (start < deadline) {
            setError(t('validation.startBeforeDeadline'));
            return;
        }

        // Optional field, but a schedule that has already passed (or that outlives the deadline)
        // would either be ignored by the server or leave a tournament nobody can ever join.
        if (registrationOpensAt) {
            const opensAt = new Date(registrationOpensAt.replace(' ', 'T'));

            if (opensAt <= now) {
                setError(t('validation.opensInFuture'));
                return;
            }

            if (opensAt >= deadline) {
                setError(t('validation.opensBeforeDeadline'));
                return;
            }
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
                // Null = open immediately. A future value makes the server create this as a draft
                // and open it itself at that moment (see TournamentEntity.RegistrationOpensAt).
                RegistrationOpensAt: registrationOpensAt ? formatToISO(registrationOpensAt) : null,
                // Tells the server this client knows the field, so a later edit is allowed to move it.
                AllowScheduleEdits: true,
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
                // Bench slots on top of the lineup. Null when the option is off so the backend
                // treats the roster as the lineup, exactly as before reserves existed.
                AllowReserves: isTeamTournament ? allowReserves : false,
                MaxReserves: isTeamTournament && allowReserves ? parseInt(maxReserves) : null,
                TeamWinCondition: parseInt(teamWinCondition) || 0,
                // Series format. BestOf 1 is the pre-series default, in which case the criterion is
                // irrelevant (a single game always reports its own score) and the tiebreak format is
                // only meaningful where a knockout match can actually end level.
                BestOf: bestOf,
                SeriesWinCondition: seriesWinCondition,
                TiebreakBestOf: hasKnockoutPhase ? tiebreakBestOf : null,
                // Only meaningful when a bracket follows another phase; the server drops it
                // otherwise, and sending null keeps "same as the phase before it".
                KnockoutBestOf: hasSeparateKnockoutPhase ? knockoutBestOf : null,
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
                let errorMessage = t('validation.createFailed');
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
            setError(err.message || t('common:unexpectedError'));
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
        name.trim() || t('form.summaryNoName'),
        getFormatLabel(),
        maxPlayers ? t('form.summaryPlayers', { count: Number(maxPlayers) }) : null,
    ].filter(Boolean).join(' · ');
    const detailsSummary = (description.trim() || rules.trim()) ? t('form.summaryAdded') : t('form.summaryOptional');
    const accessSummary = [
        isTeamTournament ? tTeam('modeTeam') : tTeam('modeSolo'),
        isTeamTournament && allowReserves && maxReserves ? t('form.summaryReserves', { count: Number(maxReserves) }) : null,
        scopeMode === 'region' ? getRegionLabel() : t('form.summaryCountries', { count: selectedCountries.length }),
        isExclusive ? t('form.summaryExclusive') : null,
    ].filter(Boolean).join(' · ');
    const matchSettingsSummary = [
        bestOf > 1 ? `Bo${bestOf} · ${seriesWinCondition === 1 ? t('form.summaryTotalScore') : t('form.summaryGamesWon')}` : t('form.summarySingleGame'),
        requireResultApproval ? t('form.summaryResultApproval') : null,
        canShowThirdPlace && hasThirdPlaceMatch ? t('form.summaryThirdPlace') : null,
        (selectedFormat === '0' || selectedFormat === '5') && doubleRoundRobin ? t('form.summaryDoubleRoundRobin') : null,
    ].filter(Boolean).join(' · ') || t('form.summaryDefaults');
    const scheduleSummary = startDate && registrationDeadline
        ? (registrationOpensAt ? t('form.summaryOpensStarts', { opens: registrationOpensAt, starts: startDate }) : t('form.summaryStarts', { starts: startDate }))
        : t('form.summaryNotSet');
    const prizeSummary = prizePool ? `${prizePool} ${getCurrencyLabel()}` : t('form.summaryOptional');

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
                            <Text className="text-[10px] font-black uppercase tracking-[2px] text-primary mb-0.5">{t('form.newTournament')}</Text>
                            <Text className="text-xl font-black text-white">{t('form.createTournament')}</Text>
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
                            <CollapsibleSection icon="trophy" title={t('form.sectionBasicInfo')} defaultOpen summary={basicsSummary}>
                                <View className="gap-4">
                                    {renderSelectField(
                                        t('form.hub'),
                                        getHubLabel(),
                                        () => hubId ? null : setShowHubPicker(true),
                                        isLoadingHubs,
                                        !!hubId,
                                        true
                                    )}

                                    <View>
                                        <Text className={FIELD_LABEL}>{t('form.name')}</Text>
                                        <TextInput
                                            className={FIELD_INPUT}
                                            placeholder={t('form.namePlaceholder')}
                                            placeholderTextColor="#334155"
                                            value={name}
                                            onChangeText={setName}
                                        />
                                    </View>

                                    <View className="flex-row gap-3">
                                        <View className="flex-1">
                                            <Text className={FIELD_LABEL}>{t('form.maxPlayers')}</Text>
                                            <TextInput
                                                className={FIELD_INPUT}
                                                placeholder={t('form.egMaxPlayers')}
                                                placeholderTextColor="#334155"
                                                keyboardType="numeric"
                                                value={maxPlayers}
                                                onChangeText={setMaxPlayers}
                                            />
                                        </View>
                                        {renderSelectField(t('form.format'), getFormatLabel(), () => setShowFormatPicker(true))}
                                    </View>

                                    {/* Groups + Bracket: groups count and qualifiers-per-group drive the knockout size. */}
                                    {selectedFormat === '5' && (
                                        <View className="flex-row gap-3">
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>{t('form.groupsCount')}</Text>
                                                <TextInput
                                                    className={FIELD_INPUT}
                                                    placeholder={t('form.egGroups')}
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={groupsCount}
                                                    onChangeText={setGroupsCount}
                                                />
                                                <Text className={FIELD_HINT}>
                                                    {t('form.groupsCountHint')}
                                                </Text>
                                            </View>
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>{t('form.qualifiersPerGroup')}</Text>
                                                <TextInput
                                                    className={FIELD_INPUT}
                                                    placeholder={t('form.egQualifiers')}
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={qualifiersPerGroup}
                                                    onChangeText={setQualifiersPerGroup}
                                                />
                                                <Text className={FIELD_HINT}>
                                                    {t('form.qualifiersPerGroupHint')}
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
                                                        <Text className={FIELD_LABEL}>{t('form.swissRounds')}</Text>
                                                        <TextInput
                                                            className={FIELD_INPUT}
                                                            placeholder={t('form.swissRoundsPlaceholder')}
                                                            placeholderTextColor="#334155"
                                                            keyboardType="numeric"
                                                            value={swissRounds}
                                                            onChangeText={setSwissRounds}
                                                        />
                                                    </View>
                                                    {renderSelectField(
                                                        t('form.knockoutStage'),
                                                        swissKnockoutOptions.find(o => o.value === swissKnockout)?.label || t('form.none'),
                                                        () => setShowSwissKnockoutPicker(true)
                                                    )}
                                                </View>
                                                <Text className={FIELD_HINT}>
                                                    {t('form.swissRoundsHint')}
                                                </Text>
                                            </View>

                                            {swissKnockoutSize > 0 && (
                                                <View>
                                                    <Text className={FIELD_LABEL}>{t('form.directQualifiers')}</Text>
                                                    <TextInput
                                                        className={FIELD_INPUT}
                                                        placeholder={t('form.directQualifiersPlaceholder', { count: swissKnockoutSize })}
                                                        placeholderTextColor="#334155"
                                                        keyboardType="numeric"
                                                        value={swissDirect}
                                                        onChangeText={setSwissDirect}
                                                    />
                                                    <Text className={FIELD_HINT}>
                                                        {swissPlayInPlayers > 0 && !isNaN(swissDirectCount)
                                                            ? t('form.swissPlayInHint', { direct: swissDirectCount, from: swissDirectCount + 1, to: swissDirectCount + swissPlayInPlayers, spots: swissKnockoutSize - swissDirectCount })
                                                            : t('form.swissDirectHint', { size: swissKnockoutSize, second: swissKnockoutSize - 1 })}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {/* Bracket / Groups+Bracket / Swiss: pick Single vs Double elimination for the knockout stage. */}
                                    {showKnockoutTypeToggle && (
                                        <View>
                                            <Text className={FIELD_LABEL}>{t('form.knockoutBracket')}</Text>
                                            <SegmentedToggle
                                                options={[
                                                    { value: '1', label: t('form.single') },
                                                    { value: '2', label: t('form.double') },
                                                ]}
                                                value={currentElimType}
                                                onChange={(v) => setCurrentElimType(v as '1' | '2')}
                                            />
                                            <Text className={FIELD_HINT}>
                                                {t('form.knockoutHint')}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </CollapsibleSection>

                            {/* ── Description & Rules ── */}
                            <CollapsibleSection icon="document-text" title={t('form.sectionDescriptionRules')} color="#94A3B8" summary={detailsSummary}>
                                <View className="gap-4">
                                    <View>
                                        <Text className={FIELD_LABEL}>{t('form.description')}</Text>
                                        <TextInput
                                            multiline
                                            className={FIELD_MULTILINE}
                                            placeholder={t('form.descriptionPlaceholder')}
                                            placeholderTextColor="#334155"
                                            textAlignVertical="top"
                                            value={description}
                                            onChangeText={setDescription}
                                        />
                                    </View>
                                    <View>
                                        <Text className={FIELD_LABEL}>{t('form.rules')}</Text>
                                        <TextInput
                                            multiline
                                            className={FIELD_MULTILINE}
                                            placeholder={t('form.rulesPlaceholder')}
                                            placeholderTextColor="#334155"
                                            textAlignVertical="top"
                                            value={rules}
                                            onChangeText={setRules}
                                        />
                                    </View>
                                </View>
                            </CollapsibleSection>

                            {/* ── Players & Access ── */}
                            <CollapsibleSection icon="people" title={t('form.sectionPlayersAccess')} color="#818CF8" summary={accessSummary}>
                                <View className="gap-4">
                                    <View>
                                        <Text className={FIELD_LABEL}>{tTeam('modeLabel')}</Text>
                                        <SegmentedToggle
                                            options={[
                                                { value: 'solo', label: tTeam('modeSolo') },
                                                { value: 'team', label: tTeam('modeTeam') },
                                            ]}
                                            value={isTeamTournament ? 'team' : 'solo'}
                                            onChange={(v) => setIsTeamTournament(v === 'team')}
                                        />
                                    </View>

                                    {/* Team Size & Win Cond (visible only for Team mode) */}
                                    {isTeamTournament && (
                                        <View className="flex-row gap-3">
                                            <View className="flex-1">
                                                <Text className={FIELD_LABEL}>{tTeam('teamSizeLabel')} *</Text>
                                                <TextInput
                                                    className={FIELD_INPUT}
                                                    placeholder={tTeam('teamSizePlaceholder')}
                                                    placeholderTextColor="#334155"
                                                    keyboardType="numeric"
                                                    value={teamSize}
                                                    onChangeText={setTeamSize}
                                                />
                                            </View>
                                            {renderSelectField(
                                                t('form.winCondition'),
                                                teamWinConditions.find(c => c.value === teamWinCondition)?.label || t('form.select'),
                                                () => setShowTeamWinConditionPicker(true)
                                            )}
                                        </View>
                                    )}

                                    {/* Reserves: bench slots on top of the lineup, with the captain free
                                        to trade a starter for a reserve between rounds. */}
                                    {isTeamTournament && (
                                        <View>
                                            <Text className={FIELD_LABEL}>{t('form.allowReserves')}</Text>
                                            <SegmentedToggle
                                                options={yesNoOptions}
                                                value={allowReserves ? 'yes' : 'no'}
                                                onChange={(v) => setAllowReserves(v === 'yes')}
                                            />
                                            {allowReserves ? (
                                                <View className="mt-3">
                                                    <Text className={FIELD_LABEL}>{t('form.reservesPerTeam')}</Text>
                                                    <TextInput
                                                        className={FIELD_INPUT}
                                                        placeholder={t('form.egQualifiers')}
                                                        placeholderTextColor="#334155"
                                                        keyboardType="numeric"
                                                        value={maxReserves}
                                                        onChangeText={setMaxReserves}
                                                    />
                                                    <Text className={FIELD_HINT}>
                                                        {t('form.reservesDetailHint', { lineup: teamSize || t('form.lineupWord') })}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <Text className={FIELD_HINT}>
                                                    {t('form.reservesHint')}
                                                </Text>
                                            )}
                                        </View>
                                    )}

                                    {/* Tournament Scope: region-based or country-based */}
                                    <View>
                                        <Text className={FIELD_LABEL}>{t('form.tournamentScope')}</Text>
                                        <SegmentedToggle
                                            options={[
                                                { value: 'region', label: t('form.byRegion') },
                                                { value: 'country', label: t('form.byCountry') },
                                            ]}
                                            value={scopeMode}
                                            onChange={(v) => setScopeMode(v as 'region' | 'country')}
                                        />
                                        <View className="mt-3">
                                            {scopeMode === 'region' ? (
                                                renderSelectField(t('form.region'), getRegionLabel(), () => setShowRegionPicker(true), false, false, true)
                                            ) : (
                                                <CountryPicker
                                                    placeholder={t('form.selectCountries')}
                                                    multiple
                                                    values={selectedCountries}
                                                    onToggle={toggleCountry}
                                                />
                                            )}
                                        </View>
                                    </View>

                                    {/* Exclusive members only */}
                                    <View>
                                        <Text className={FIELD_LABEL}>{t('form.exclusiveOnly')}</Text>
                                        <SegmentedToggle
                                            options={yesNoOptions}
                                            value={isExclusive ? 'yes' : 'no'}
                                            onChange={(v) => setIsExclusive(v === 'yes')}
                                        />
                                        <Text className={FIELD_HINT}>
                                            {t('form.exclusiveHint')}
                                        </Text>
                                    </View>
                                </View>
                            </CollapsibleSection>

                            {/* ── Match Settings ── */}
                            <CollapsibleSection icon="options" title={t('form.sectionMatchSettings')} color="#38BDF8" summary={matchSettingsSummary}>
                                <View className="gap-4">
                                    {/* How a single match is played — the format everything else in
                                        this section builds on, so it comes first. */}
                                    <MatchFormatPicker
                                        bestOf={bestOf}
                                        onBestOfChange={setBestOf}
                                        winCondition={seriesWinCondition}
                                        onWinConditionChange={setSeriesWinCondition}
                                        tiebreakBestOf={tiebreakBestOf}
                                        onTiebreakBestOfChange={setTiebreakBestOf}
                                        hasKnockout={hasKnockoutPhase}
                                        hasSeparateKnockoutPhase={hasSeparateKnockoutPhase}
                                        firstPhaseLabel={firstPhaseLabel}
                                        knockoutBestOf={knockoutBestOf}
                                        onKnockoutBestOfChange={setKnockoutBestOf}
                                        isTeamTournament={isTeamTournament}
                                    />

                                    <View>
                                        <Text className={FIELD_LABEL}>{t('form.requireApproval')}</Text>
                                        <SegmentedToggle
                                            options={yesNoOptions}
                                            value={requireResultApproval ? 'yes' : 'no'}
                                            onChange={(v) => setRequireResultApproval(v === 'yes')}
                                        />
                                        <Text className={FIELD_HINT}>
                                            {t('form.requireApprovalHint')}
                                        </Text>
                                    </View>

                                    {/* Third Place Match — hidden for League, double-elim brackets, and pure Swiss */}
                                    {canShowThirdPlace && (
                                        <View>
                                            <Text className={FIELD_LABEL}>{t('form.thirdPlaceMatch')}</Text>
                                            <SegmentedToggle
                                                options={yesNoOptions}
                                                value={hasThirdPlaceMatch ? 'yes' : 'no'}
                                                onChange={(v) => setHasThirdPlaceMatch(v === 'yes')}
                                            />
                                            <Text className={FIELD_HINT}>
                                                {t('form.thirdPlaceHint')}
                                            </Text>
                                        </View>
                                    )}

                                    {/* Double round robin — every pair plays twice (home + away). Shown for League and Groups+Bracket. */}
                                    {(selectedFormat === '0' || selectedFormat === '5') && (
                                        <View>
                                            <Text className={FIELD_LABEL}>{t('form.doubleRoundRobin')}</Text>
                                            <SegmentedToggle
                                                options={yesNoOptions}
                                                value={doubleRoundRobin ? 'yes' : 'no'}
                                                onChange={(v) => setDoubleRoundRobin(v === 'yes')}
                                            />
                                            <Text className={FIELD_HINT}>
                                                {t('form.doubleRoundRobinHint')}
                                            </Text>
                                        </View>
                                    )}

                                    {(selectedFormat === '0' || selectedFormat === '5' || isSwiss) && (
                                        <View>
                                            <Text className={FIELD_LABEL}>{t('form.roundDuration')}</Text>
                                            <View className="flex-row gap-3">
                                                <View className="flex-1">
                                                    <TextInput
                                                        className={FIELD_INPUT}
                                                        placeholder={t('form.egQualifiers')}
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
                                                {t('form.roundDurationHint')}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </CollapsibleSection>

                            {/* ── Schedule ── */}
                            <CollapsibleSection icon="calendar" title={t('form.sectionSchedule')} defaultOpen summary={scheduleSummary}>
                                <View className="flex-row gap-3">
                                    <ScheduleField
                                        label={t('form.regDeadline')}
                                        value={registrationDeadline}
                                        placeholder={t('form.select')}
                                        iconName="time-outline"
                                        iconColor={COLORS.warning}
                                        onPress={() => setShowRegDeadlinePicker(true)}
                                    />
                                    <ScheduleField
                                        label={t('form.startDate')}
                                        value={startDate}
                                        placeholder={t('form.select')}
                                        iconName="calendar-outline"
                                        iconColor={COLORS.primary}
                                        onPress={() => setShowStartDatePicker(true)}
                                    />
                                </View>
                                <View className="mt-3">
                                    <ScheduleField
                                        label={t('form.registrationOpens')}
                                        value={registrationOpensAt}
                                        placeholder={t('form.immediately')}
                                        iconName="lock-open-outline"
                                        iconColor={COLORS.info}
                                        onPress={() => setShowRegOpensPicker(true)}
                                    />
                                    <Text className="text-[11px] text-slate-500 mt-2 leading-4">
                                        {t('form.scheduleHint')}
                                    </Text>
                                </View>
                            </CollapsibleSection>

                            {/* ── Prize Pool ── */}
                            <CollapsibleSection icon="cash" title={t('form.sectionPrizePool')} color={COLORS.warning} summary={prizeSummary}>
                                <View className="flex-row gap-3">
                                    <View className="flex-1">
                                        <Text className={FIELD_LABEL}>{t('form.amount')}</Text>
                                        <TextInput
                                            className={FIELD_INPUT}
                                            placeholder={t('form.egPrize')}
                                            placeholderTextColor="#334155"
                                            keyboardType="numeric"
                                            value={prizePool}
                                            onChangeText={setPrizePool}
                                        />
                                    </View>
                                    <View className="w-32">
                                        {renderSelectField(t('form.currency'), getCurrencyLabel(), () => setShowCurrencyPicker(true))}
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
                            {t('form.createTournament')}
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
                        formatGroupOptions,
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
                        swissKnockoutOptions,
                        swissKnockout,
                        setSwissKnockout
                    )}
                    <DateTimePickerModal
                        visible={showStartDatePicker}
                        onClose={() => setShowStartDatePicker(false)}
                        onConfirm={setStartDate}
                        title={t('form.tournamentStart')}
                        initialValue={startDate}
                    />
                    <DateTimePickerModal
                        visible={showRegDeadlinePicker}
                        onClose={() => setShowRegDeadlinePicker(false)}
                        onConfirm={setRegistrationDeadline}
                        title={t('form.registrationDeadline')}
                        initialValue={registrationDeadline}
                    />
                    <DateTimePickerModal
                        visible={showRegOpensPicker}
                        onClose={() => setShowRegOpensPicker(false)}
                        onConfirm={setRegistrationOpensAt}
                        onClear={() => setRegistrationOpensAt('')}
                        clearText={t('form.openImmediately')}
                        title={t('form.registrationOpens')}
                        initialValue={registrationOpensAt}
                    />
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

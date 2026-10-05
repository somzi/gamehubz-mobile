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
    Keyboard,
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
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { FIELD_HINT, GradientButton, GhostButton, FormPanel } from '../ui/FormField';
import { StepHeader, Field, ChoiceCards, Choice, ToggleCard, FormError, FormStep, SelectField, FormInput } from '../tournament/TournamentFormKit';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MatchFormatPicker } from '../match/MatchFormatPicker';
import { SeriesWinConditionValue } from '../../lib/series';
import { COLORS } from '../../lib/theme';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useFormScroll, FormScrollProvider } from '../ui/FormScroll';
import { invalidateHubData } from '../../lib/queryPolicy';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';
import { PrivateInviteCard } from '../tournament/PrivateInviteCard';
import { PRIVATE_COLORS } from '../ui/PrivateBadge';

// Option arrays keep their VALUES at module scope (types below depend on them) but carry
// i18n keys instead of labels — labels are resolved per render so a language switch applies.

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

// The form's steps, in order: who it is, who plays, how it is played, the rules of a match, when.
const STEP_KEYS = ['basics', 'players', 'format', 'matches', 'schedule'] as const;
// Space between the fields of one panel.
const PANEL_GAP = { gap: 18 };

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
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { t } = useTranslation('tournament');
    const { t: tTeam } = useTranslation('team');
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

    // Labels resolved here rather than at module scope so switching language re-renders them.
    const swissKnockoutOptions = useMemo(
        () => SWISS_KNOCKOUT_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const regions = useMemo(
        () => REGION_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const durationUnits = useMemo(
        () => DURATION_UNIT_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const teamWinConditions = useMemo(
        () => TEAM_WIN_CONDITION_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);

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

    // Ready check — when on, a match with an agreed time asks both sides to confirm they are
    // there, and the side that shows up alone wins by walkover once the grace runs out.
    const [requireMatchCheckIn, setRequireMatchCheckIn] = useState(false);
    // Kept as text so the field can be emptied while typing; blank means "server default".
    const [checkInGraceMinutes, setCheckInGraceMinutes] = useState('10');

    // Result verification — when on, a participant proves the final score (biometric unlock on a
    // registered phone + a screen recording) before their report is accepted.
    const [requireResultVerification, setRequireResultVerification] = useState(false);

    // "Agreed outside the app" — on by default; off means a match time can only come from the
    // availability calendar.
    const [allowScheduleOutsideApp, setAllowScheduleOutsideApp] = useState(true);

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

    // Private — invite-only: hidden from the feed, the hub page and every notification. Players get
    // in with the six-digit code or the share link, both handed over on the step after creation.
    const [isPrivate, setIsPrivate] = useState(false);
    // Set once a private tournament is created: the form gives way to its code, because without
    // that code (or the link) nobody will ever find the tournament.
    const [createdPrivate, setCreatedPrivate] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        if (!visible) setCreatedPrivate(null);
    }, [visible]);

    // Data State
    const [hubs, setHubs] = useState<{ id: string; name: string }[]>([]);
    const [isLoadingHubs, setIsLoadingHubs] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // One step on screen at a time; the bar above lets the creator go back to any step already seen.
    const [step, setStep] = useState(0);
    const keyboardUp = useKeyboardInset(0, visible) > 0;
    // Moves the step to the field being typed in; each step's scroll starts back at the top.
    const formScroll = useFormScroll();
    useEffect(() => { formScroll.resetOffset(); }, [step, formScroll.resetOffset]);
    const [furthestStep, setFurthestStep] = useState(0);
    useEffect(() => {
        if (!visible) return;
        setStep(0);
        setFurthestStep(0);
        setError(null);
    }, [visible]);

    // Picker States
    const [showHubPicker, setShowHubPicker] = useState(false);
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showRegDeadlinePicker, setShowRegDeadlinePicker] = useState(false);
    const [showRegOpensPicker, setShowRegOpensPicker] = useState(false);
    const [showDurationUnitPicker, setShowDurationUnitPicker] = useState(false);
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

    // What stops each step: checked on Next, and every step again on Create, which then opens the step
    // that needs fixing.
    const stepError = (index: number): string | null => {
        switch (STEP_KEYS[index]) {
            case 'basics':
                if (!name || !selectedHubId) return t('validation.nameAndHubRequired');
                return null;
            case 'players': {
                if (!maxPlayers || isNaN(parseInt(maxPlayers)) || parseInt(maxPlayers) <= 0) return t('validation.maxPlayersRequired');
                if (isTeamTournament) {
                    const ts = parseInt(teamSize);
                    if (!teamSize || isNaN(ts) || ts < 2 || ts > 11) return t('validation.teamSizeRange');
                    if (parseInt(maxPlayers) < ts * 2) return t('validation.maxPlayersForTeams', { min: ts * 2 });
                    if (allowReserves) {
                        const mr = parseInt(maxReserves);
                        if (!maxReserves || isNaN(mr) || mr < 1 || mr > 11) return t('validation.reservesRange');
                    }
                }
                if (scopeMode === 'country' && selectedCountries.length === 0) return t('validation.countryRequired');
                return null;
            }
            case 'format': {
                if (isTeamTournament && !TEAM_TOURNAMENT_FORMATS.some((format) => format === Number(selectedFormat))) {
                    return t('validation.teamFormatUnsupported');
                }
                if (selectedFormat === String(TournamentFormat.DoubleElimination) && participantCount > 0 && participantCount < 4) {
                    return t('validation.doubleElimMinPlayers');
                }
                // Groups + Bracket pads the knockout up to the next power of two with byes (single- and
                // double-elimination alike), so any qualifier count >= 2 works.
                if (selectedFormat === String(TournamentFormat.GroupStageWithKnockout) && groupsTotalQualifiers < 2) {
                    return t('validation.groupsQualifiersMin');
                }
                if (isSwiss && swissKnockoutSize > 0) {
                    if (swissKnockoutSize > participantCount) {
                        return t('validation.knockoutExceedsPlayers', { knockout: swissKnockoutSize, players: participantCount });
                    }
                    if (isNaN(swissDirectCount) || swissDirectCount < 0 || swissDirectCount > swissKnockoutSize) {
                        return t('validation.directQualifiersRange', { max: swissKnockoutSize });
                    }
                    if (swissPlayInPlayers > 0 && swissDirectCount + swissPlayInPlayers > participantCount) {
                        return t('validation.playInNeedsPlayers', { needed: swissDirectCount + swissPlayInPlayers, direct: swissDirectCount, playIn: swissPlayInPlayers, players: participantCount });
                    }
                }
                return null;
            }
            case 'matches': {
                // Grace is free text: say what is wrong here instead of letting the server quietly clamp it.
                // Empty stays allowed — it means the default.
                if (requireMatchCheckIn && checkInGraceMinutes.trim() !== '') {
                    const grace = parseInt(checkInGraceMinutes, 10);
                    if (isNaN(grace) || grace < 1 || grace > 180) return t('validation.checkInGraceRange', { min: 1, max: 180 });
                }
                return null;
            }
            case 'schedule': {
                if (!startDate || !registrationDeadline) return t('validation.scheduleRequired');
                const now = new Date();
                const start = new Date(startDate.replace(' ', 'T'));
                const deadline = new Date(registrationDeadline.replace(' ', 'T'));
                if (deadline < now) return t('validation.deadlineInPast');
                if (start < deadline) return t('validation.startBeforeDeadline');
                // Optional field, but a schedule that has already passed (or that outlives the deadline)
                // would either be ignored by the server or leave a tournament nobody can ever join.
                if (registrationOpensAt) {
                    const opensAt = new Date(registrationOpensAt.replace(' ', 'T'));
                    if (opensAt <= now) return t('validation.opensInFuture');
                    if (opensAt >= deadline) return t('validation.opensBeforeDeadline');
                }
                return null;
            }
        }
        return null;
    };

    const goToStep = (index: number) => {
        setError(null);
        setStep(index);
    };

    const goNext = () => {
        const problem = stepError(step);
        if (problem) {
            setError(problem);
            return;
        }
        const next = Math.min(step + 1, STEP_KEYS.length - 1);
        setError(null);
        setStep(next);
        setFurthestStep(current => Math.max(current, next));
    };

    const handleSubmit = async () => {
        for (let index = 0; index < STEP_KEYS.length; index++) {
            const problem = stepError(index);
            if (problem) {
                setStep(index);
                setError(problem);
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
                RequireMatchCheckIn: requireMatchCheckIn,
                // Null with the check on = the server's own default window.
                CheckInGraceMinutes: requireMatchCheckIn ? (parseInt(checkInGraceMinutes, 10) || null) : null,
                RequireResultVerification: requireResultVerification,
                AllowScheduleOutsideApp: allowScheduleOutsideApp,
                IsExclusive: isExclusive,
                IsPrivate: isPrivate,
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
            await queryClient.invalidateQueries({ queryKey: ['tournaments'] });
            if (hubId) await invalidateHubData(queryClient, hubId);

            if (isPrivate) {
                const created = await response.json().catch(() => null);
                const createdId = created?.result?.id ?? created?.id ?? created?.Id;
                if (createdId) {
                    setCreatedPrivate({ id: createdId, name });
                    return;
                }
            }

            onClose();
        } catch (err: any) {
            console.error('Error creating tournament:', err);
            setError(err.message || t('common:unexpectedError'));
        } finally {
            setIsSubmitting(false);
        }
    };

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

    const steps: FormStep[] = [
        { key: 'basics', icon: 'trophy', color: '#34D399', title: t('form.sectionBasicInfo') },
        { key: 'players', icon: 'people', color: '#818CF8', title: t('form.sectionPlayersAccess') },
        { key: 'format', icon: 'git-network', color: '#38BDF8', title: t('form.format') },
        { key: 'matches', icon: 'shield-checkmark', color: '#FBBF24', title: t('form.sectionMatchSettings') },
        { key: 'schedule', icon: 'calendar', color: '#A78BFA', title: t('form.sectionSchedule') },
    ];
    const isLastStep = step === STEP_KEYS.length - 1;

    const formatChoices: Choice<typeof FORMAT_GROUP_OPTIONS[number]['value']>[] = [
        { value: 'league', icon: 'list', label: t('formatGroup.league'), hint: t('formatGroupHint.league'), color: '#38BDF8' },
        { value: 'bracket', icon: 'git-network', label: t('formatGroup.bracket'), hint: t('formatGroupHint.bracket'), color: '#38BDF8' },
        { value: 'groups-bracket', icon: 'grid', label: t('formatGroup.groupsBracket'), hint: t('formatGroupHint.groupsBracket'), color: '#38BDF8' },
        // Teams play every format but Swiss.
        { value: 'swiss', icon: 'swap-horizontal', label: t('formatGroup.swiss'), hint: t('formatGroupHint.swiss'), color: '#38BDF8', disabled: isTeamTournament },
    ];

    const renderBasics = () => (
        <View className="gap-4">
            <FormPanel style={PANEL_GAP}>
                {!hubId && (
                    <SelectField
                        label={t('form.hub')}
                        icon="planet-outline"
                        value={getHubLabel()}
                        onPress={() => setShowHubPicker(true)}
                        loading={isLoadingHubs}
                    />
                )}
                <FormInput
                    label={t('form.name')}
                    icon="trophy-outline"
                    placeholder={t('form.namePlaceholder')}
                    value={name}
                    onChangeText={setName}
                />
            </FormPanel>

            {/* Visibility — up front, because it decides whether anyone hears about the tournament at all. */}
            <Field label={t('form.visibility')}>
                <ChoiceCards
                    options={[
                        { value: 'public', icon: 'globe-outline', label: t('form.visibilityPublic') },
                        { value: 'private', icon: 'lock-closed', label: t('form.visibilityPrivate'), color: PRIVATE_COLORS.icon },
                    ]}
                    value={isPrivate ? 'private' : 'public'}
                    onChange={(v) => setIsPrivate(v === 'private')}
                />
                {isPrivate && (
                    <View
                        className="flex-row items-start gap-2 mt-2.5 px-3 py-2.5 rounded-xl"
                        style={{ backgroundColor: PRIVATE_COLORS.bg, borderWidth: 1, borderColor: PRIVATE_COLORS.border }}
                    >
                        <Ionicons name="lock-closed" size={13} color={PRIVATE_COLORS.icon} style={{ marginTop: 1 }} />
                        <Text className="flex-1 text-[11px] leading-4" style={{ color: PRIVATE_COLORS.text }}>
                            {t('form.visibilityPrivateHint')}
                        </Text>
                    </View>
                )}
            </Field>

            <FormPanel style={PANEL_GAP}>
                <Field label={t('form.sectionPrizePool')}>
                    <View className="flex-row" style={{ gap: 10 }}>
                        <View className="flex-1">
                            <FormInput
                                icon="cash-outline"
                                placeholder={t('form.egPrize')}
                                keyboardType="numeric"
                                value={prizePool}
                                onChangeText={setPrizePool}
                            />
                        </View>
                        <View style={{ width: 118 }}>
                            <SelectField value={getCurrencyLabel()} onPress={() => setShowCurrencyPicker(true)} />
                        </View>
                    </View>
                </Field>
                <FormInput
                    label={t('form.description')}
                    icon="document-text-outline"
                    multiline
                    placeholder={t('form.descriptionPlaceholder')}
                    value={description}
                    onChangeText={setDescription}
                />
            </FormPanel>
        </View>
    );

    const renderPlayers = () => (
        <View className="gap-4">
            <Field label={tTeam('modeLabel')}>
                <ChoiceCards
                    options={[
                        { value: 'solo', icon: 'person', label: tTeam('modeSolo'), color: '#818CF8' },
                        { value: 'team', icon: 'people', label: tTeam('modeTeam'), color: '#818CF8' },
                    ]}
                    value={isTeamTournament ? 'team' : 'solo'}
                    onChange={(v) => setIsTeamTournament(v === 'team')}
                />
            </Field>

            <FormPanel style={PANEL_GAP}>
                {isTeamTournament && (
                    <FormInput
                        label={`${tTeam('teamSizeLabel')} *`}
                        icon="people-circle-outline"
                        placeholder={tTeam('teamSizePlaceholder')}
                        keyboardType="numeric"
                        value={teamSize}
                        onChangeText={setTeamSize}
                    />
                )}
                {/* Two outcomes, both named in full — a dropdown cut the chosen one to "Match…". */}
                {isTeamTournament && (
                    <Field label={t('form.winCondition')}>
                        <ChoiceCards
                            compact
                            options={[
                                { value: '0', icon: 'podium-outline', label: t('teamWinCondition.matchWins'), color: '#818CF8' },
                                { value: '1', icon: 'calculator-outline', label: t('teamWinCondition.aggregateScore'), color: '#818CF8' },
                            ]}
                            value={teamWinCondition === '1' ? '1' : '0'}
                            onChange={setTeamWinCondition}
                        />
                    </Field>
                )}

                <FormInput
                    label={t('form.maxPlayers')}
                    icon="people-outline"
                    placeholder={t('form.egMaxPlayers')}
                    keyboardType="numeric"
                    value={maxPlayers}
                    onChangeText={setMaxPlayers}
                />

                <Field label={t('form.tournamentScope')}>
                    <SegmentedToggle
                        raised
                        options={[
                            { value: 'region', label: t('form.byRegion') },
                            { value: 'country', label: t('form.byCountry') },
                        ]}
                        value={scopeMode}
                        onChange={(v) => setScopeMode(v as 'region' | 'country')}
                    />
                    <View className="mt-3">
                        {scopeMode === 'region' ? (
                            <SelectField icon="earth-outline" value={getRegionLabel()} onPress={() => setShowRegionPicker(true)} />
                        ) : (
                            <CountryPicker
                                placeholder={t('form.selectCountries')}
                                multiple
                                values={selectedCountries}
                                onToggle={toggleCountry}
                            />
                        )}
                    </View>
                </Field>
            </FormPanel>

            {/* Reserves: bench slots on top of the lineup, with the captain free to trade a starter
                for a reserve between rounds. */}
            {isTeamTournament && (
                <ToggleCard
                    icon="person-add"
                    color="#818CF8"
                    title={t('form.allowReserves')}
                    value={allowReserves}
                    onChange={setAllowReserves}
                >
                    <FormInput
                        label={t('form.reservesPerTeam')}
                        icon="person-add-outline"
                        hint={t('form.reservesDetailHint', { lineup: teamSize || t('form.lineupWord') })}
                        placeholder={t('form.egQualifiers')}
                        keyboardType="numeric"
                        value={maxReserves}
                        onChangeText={setMaxReserves}
                    />
                </ToggleCard>
            )}

            <ToggleCard
                icon="star"
                color="#FBBF24"
                title={t('form.exclusiveOnly')}
                hint={t('form.exclusiveHint')}
                value={isExclusive}
                onChange={setIsExclusive}
            />
        </View>
    );

    const renderFormat = () => (
        <View className="gap-4">
            <ChoiceCards options={formatChoices} value={formatGroup} onChange={handleFormatGroupChange} />

            {/* What the chosen format needs on top: groups, Swiss rounds, the knockout's style. */}
            {(selectedFormat === '5' || isSwiss || showKnockoutTypeToggle) && (
                <FormPanel style={PANEL_GAP}>
                    {/* Groups + Bracket: groups count and qualifiers-per-group drive the knockout size. */}
                    {selectedFormat === '5' && (
                        <View className="flex-row" style={{ gap: 10 }}>
                            <View className="flex-1">
                                <FormInput
                                    label={t('form.groupsCount')}
                                    icon="grid-outline"
                                    hint={t('form.groupsCountHint')}
                                    placeholder={t('form.egGroups')}
                                    keyboardType="numeric"
                                    value={groupsCount}
                                    onChangeText={setGroupsCount}
                                />
                            </View>
                            <View className="flex-1">
                                <FormInput
                                    label={t('form.qualifiersPerGroup')}
                                    icon="arrow-up-circle-outline"
                                    hint={t('form.qualifiersPerGroupHint')}
                                    placeholder={t('form.egQualifiers')}
                                    keyboardType="numeric"
                                    value={qualifiersPerGroup}
                                    onChangeText={setQualifiersPerGroup}
                                />
                            </View>
                        </View>
                    )}

                    {/* Swiss: rounds count + knockout-stage size + optional direct-qualifiers play-in. */}
                    {isSwiss && (
                        <View>
                            <View className="flex-row" style={{ gap: 10 }}>
                                <View className="flex-1">
                                    <FormInput
                                        label={t('form.swissRounds')}
                                        icon="repeat-outline"
                                        placeholder={t('form.swissRoundsPlaceholder')}
                                        keyboardType="numeric"
                                        value={swissRounds}
                                        onChangeText={setSwissRounds}
                                    />
                                </View>
                                <View className="flex-1">
                                    <SelectField
                                        label={t('form.knockoutStage')}
                                        icon="git-merge-outline"
                                        value={swissKnockoutOptions.find(o => o.value === swissKnockout)?.label || t('form.none')}
                                        onPress={() => setShowSwissKnockoutPicker(true)}
                                    />
                                </View>
                            </View>
                            <Text className={FIELD_HINT}>{t('form.swissRoundsHint')}</Text>
                        </View>
                    )}

                    {isSwiss && swissKnockoutSize > 0 && (
                        <FormInput
                            label={t('form.directQualifiers')}
                            icon="flash-outline"
                            hint={swissPlayInPlayers > 0 && !isNaN(swissDirectCount)
                                ? t('form.swissPlayInHint', { direct: swissDirectCount, from: swissDirectCount + 1, to: swissDirectCount + swissPlayInPlayers, spots: swissKnockoutSize - swissDirectCount })
                                : t('form.swissDirectHint', { size: swissKnockoutSize, second: swissKnockoutSize - 1 })}
                            placeholder={t('form.directQualifiersPlaceholder', { count: swissKnockoutSize })}
                            keyboardType="numeric"
                            value={swissDirect}
                            onChangeText={setSwissDirect}
                        />
                    )}

                    {/* Bracket / Groups+Bracket / Swiss: pick Single vs Double elimination for the knockout stage. */}
                    {showKnockoutTypeToggle && (
                        <Field label={t('form.knockoutBracket')} hint={t('form.knockoutHint')}>
                            <SegmentedToggle
                                raised
                                options={[
                                    { value: '1', label: t('form.single') },
                                    { value: '2', label: t('form.double') },
                                ]}
                                value={currentElimType}
                                onChange={(v) => setCurrentElimType(v as '1' | '2')}
                            />
                        </Field>
                    )}
                </FormPanel>
            )}

            {/* How a single match is played. */}
            <FormPanel>
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
            </FormPanel>

            {/* Third Place Match — hidden for League, double-elim brackets, and pure Swiss */}
            {canShowThirdPlace && (
                <ToggleCard
                    icon="medal"
                    color="#FBBF24"
                    title={t('form.thirdPlaceMatch')}
                    hint={t('form.thirdPlaceHint')}
                    value={hasThirdPlaceMatch}
                    onChange={setHasThirdPlaceMatch}
                />
            )}

            {/* Double round robin — every pair plays twice (home + away). League and Groups+Bracket. */}
            {(selectedFormat === '0' || selectedFormat === '5') && (
                <ToggleCard
                    icon="repeat"
                    color="#38BDF8"
                    title={t('form.doubleRoundRobin')}
                    hint={t('form.doubleRoundRobinHint')}
                    value={doubleRoundRobin}
                    onChange={setDoubleRoundRobin}
                />
            )}

            {(selectedFormat === '0' || selectedFormat === '5' || isSwiss) && (
                <FormPanel>
                    <Field label={t('form.roundDuration')} hint={t('form.roundDurationHint')}>
                        <View className="flex-row" style={{ gap: 10 }}>
                            <View className="flex-1">
                                <FormInput
                                    icon="timer-outline"
                                    placeholder={t('form.egQualifiers')}
                                    keyboardType="numeric"
                                    value={roundDurationValue}
                                    onChangeText={setRoundDurationValue}
                                />
                            </View>
                            <View className="flex-1">
                                <SelectField
                                    value={durationUnits.find(u => u.value === roundDurationUnit)?.label ?? roundDurationUnit}
                                    onPress={() => setShowDurationUnitPicker(true)}
                                />
                            </View>
                        </View>
                    </Field>
                </FormPanel>
            )}
        </View>
    );

    const renderMatches = () => (
        <View className="gap-3">
            <ToggleCard
                icon="checkmark-done"
                color="#34D399"
                title={t('form.requireApproval')}
                hint={t('form.requireApprovalHint')}
                value={requireResultApproval}
                onChange={setRequireResultApproval}
            />
            {/* "Agreed outside the app" — on by default. Off, every kick-off has to come from the two
                availability lists meeting in the calendar. */}
            <ToggleCard
                icon="chatbubbles"
                color="#38BDF8"
                title={t('form.allowOutsideApp')}
                hint={t('form.allowOutsideAppHint')}
                value={allowScheduleOutsideApp}
                onChange={setAllowScheduleOutsideApp}
            />
            {/* Ready check — both sides confirm they turned up for the time they agreed on; the one
                who shows up alone takes the match. The grace only matters with it on. */}
            <ToggleCard
                icon="hand-left"
                color="#FBBF24"
                title={t('form.readyCheck')}
                hint={t('form.readyCheckHint')}
                value={requireMatchCheckIn}
                onChange={setRequireMatchCheckIn}
            >
                <Field label={t('form.checkInGrace')} hint={t('form.checkInGraceHint')}>
                    <View className="flex-row items-center" style={{ gap: 10 }}>
                        <View className="flex-1">
                            <FormInput
                                icon="hourglass-outline"
                                placeholder="10"
                                keyboardType="numeric"
                                value={checkInGraceMinutes}
                                onChangeText={setCheckInGraceMinutes}
                            />
                        </View>
                        <Text className="text-slate-400 text-sm font-bold">{t('duration.minutes')}</Text>
                    </View>
                </Field>
            </ToggleCard>
            {/* Result verification — Face ID / fingerprint on a registered phone plus a recording of
                the final score before a player's report counts. */}
            <ToggleCard
                icon="finger-print"
                color="#A78BFA"
                title={t('form.resultVerification')}
                hint={t('form.resultVerificationHint')}
                value={requireResultVerification}
                onChange={setRequireResultVerification}
            />

            <FormPanel style={{ marginTop: 6 }}>
                <FormInput
                    label={t('form.rules')}
                    icon="reader-outline"
                    multiline
                    placeholder={t('form.rulesPlaceholder')}
                    value={rules}
                    onChangeText={setRules}
                />
            </FormPanel>
        </View>
    );

    const renderSchedule = () => (
        <View className="gap-4">
            <FormPanel style={{ gap: 14 }}>
                <ScheduleField
                    label={t('form.regDeadline')}
                    value={registrationDeadline}
                    placeholder={t('form.select')}
                    iconName="time-outline"
                    iconColor={COLORS.warning}
                    onPress={() => setShowRegDeadlinePicker(true)}
                    standalone
                />
                <ScheduleField
                    label={t('form.startDate')}
                    value={startDate}
                    placeholder={t('form.select')}
                    iconName="calendar-outline"
                    iconColor={COLORS.primary}
                    onPress={() => setShowStartDatePicker(true)}
                    standalone
                />
            </FormPanel>
            <FormPanel>
                <ScheduleField
                    label={t('form.registrationOpens')}
                    value={registrationOpensAt}
                    placeholder={t('form.immediately')}
                    iconName="lock-open-outline"
                    iconColor={COLORS.info}
                    onPress={() => setShowRegOpensPicker(true)}
                    standalone
                />
                <Text className={FIELD_HINT}>{t('form.scheduleHint')}</Text>
            </FormPanel>
        </View>
    );

    const renderStep = () => {
        switch (STEP_KEYS[step]) {
            case 'basics': return renderBasics();
            case 'players': return renderPlayers();
            case 'format': return renderFormat();
            case 'matches': return renderMatches();
            case 'schedule': return renderSchedule();
        }
    };

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
            {/* 'padding' shrinks the form when the keyboard is up so the focused input stays visible
                (matches the EditHubModal keyboard pattern). */}
            <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
                {/* The whole screen, edge to edge: a floating card left a black frame and cut its bottom off. */}
                <View className="flex-1 bg-background w-full">
                    <View className="px-5 pb-4 border-b border-white/5" style={{ paddingTop: insets.top + 10 }}>
                        <View className="flex-row justify-between items-center mb-4">
                            <View>
                                <Text className="text-[10px] font-black uppercase tracking-[2px] text-primary mb-0.5">{t('form.newTournament')}</Text>
                                <Text className="text-xl font-black text-white">{t('form.createTournament')}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common:close')} className="bg-white/5 p-2 rounded-full">
                                <Ionicons name="close" size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                        <StepHeader steps={steps} current={step} onSelect={goToStep} reachable={index => index <= furthestStep} />
                    </View>

                    {/* Keyed by step: each one opens at its top. */}
                    <FormScrollProvider value={formScroll.reveal}>
                        <ScrollView
                            key={step}
                            ref={formScroll.scrollRef}
                            onScroll={formScroll.onScroll}
                            scrollEventThrottle={16}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            className="flex-1 px-5"
                            contentContainerStyle={{ paddingTop: 18, paddingBottom: 28 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <Pressable onPress={Keyboard.dismiss} accessible={false}>
                                <Animated.View entering={FadeIn.duration(180)}>
                                    {renderStep()}
                                </Animated.View>
                            </Pressable>
                        </ScrollView>
                    </FormScrollProvider>

                    {keyboardUp ? (
                        // Typing: one way out of the keyboard (a number pad has no return key), not
                        // Next floating over it.
                        <View className="flex-row justify-end px-3 py-1.5 bg-card border-t border-white/5">
                            <Pressable onPress={Keyboard.dismiss} hitSlop={8} accessibilityRole="button" className="px-3 py-2 active:opacity-60">
                                <Text className="text-[15px] font-black text-primary">{t('common:done')}</Text>
                            </Pressable>
                        </View>
                    ) : (
                    <View className="px-5 pt-4 bg-card border-t border-white/5" style={{ paddingBottom: insets.bottom + 14 }}>
                        <FormError message={error} />
                        <View className="flex-row" style={{ gap: 10 }}>
                            {step > 0 && (
                                <GhostButton label={t('common:back')} onPress={() => goToStep(step - 1)} style={{ flex: 1 }} />
                            )}
                            <GradientButton
                                label={isLastStep ? t('form.createTournament') : t('common:next')}
                                icon={isLastStep ? 'checkmark-circle' : undefined}
                                onPress={isLastStep ? handleSubmit : goNext}
                                loading={isSubmitting}
                                style={{ flex: 2 }}
                            />
                        </View>
                    </View>
                    )}

                    {/* Private tournament created: its code replaces the form. Drawn over the card
                        instead of swapping the tree, so the form below needs no restructuring. */}
                    {createdPrivate && (
                        <View className="absolute inset-0 bg-background">
                            <View className="flex-row justify-end px-6 pt-5">
                                <TouchableOpacity onPress={onClose} className="bg-white/5 p-2 rounded-full">
                                    <Ionicons name="close" size={20} color="#94A3B8" />
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                className="px-5"
                                contentContainerStyle={{ paddingBottom: 28 }}
                                showsVerticalScrollIndicator={false}
                            >
                                <View className="items-center mb-5">
                                    <View className="w-16 h-16 rounded-full items-center justify-center mb-3" style={{ backgroundColor: 'rgba(16,185,129,0.10)' }}>
                                        <Ionicons name="checkmark-circle" size={40} color="#10B981" />
                                    </View>
                                    <Text className="text-xl font-black text-white text-center">{t('form.createdTitle')}</Text>
                                    <Text className="text-xs text-slate-400 text-center mt-1.5 px-4 leading-5">
                                        {t('form.createdPrivateHint')}
                                    </Text>
                                </View>

                                <PrivateInviteCard tournamentId={createdPrivate.id} tournamentName={createdPrivate.name} />

                                <Button
                                    className="w-full h-14 rounded-2xl"
                                    onPress={() => {
                                        const id = createdPrivate.id;
                                        onClose();
                                        navigation.navigate('TournamentDetails', { id });
                                    }}
                                >
                                    {t('form.openTournament')}
                                </Button>
                                <Button variant="ghost" className="w-full mt-2" onPress={onClose}>
                                    {t('common:done')}
                                </Button>
                            </ScrollView>
                        </View>
                    )}
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
                        showDurationUnitPicker,
                        () => setShowDurationUnitPicker(false),
                        durationUnits,
                        roundDurationUnit,
                        setRoundDurationUnit
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

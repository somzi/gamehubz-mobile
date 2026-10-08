import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Pressable,
    Modal,
    KeyboardAvoidingView,
    Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ENDPOINTS, authenticatedFetch } from '../../lib/api';
import { SWISS_KNOCKOUT_OPTIONS, TEAM_TOURNAMENT_FORMATS, TournamentFormat, TournamentRegion } from '../../types/tournament';
import { useTranslation } from 'react-i18next';
import { CountryPicker } from '../ui/CountryPicker';
import { DateTimePickerModal } from './DateTimePickerModal';
import { ScheduleField } from '../ui/ScheduleField';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { LinearGradient } from 'expo-linear-gradient';
import { FIELD_HINT, GradientButton, FormPanel } from '../ui/FormField';
import { StepHeader, Field, ChoiceCards, Choice, ToggleCard, FormError, FormStep, StepArrow, SelectField, FormInput } from '../tournament/TournamentFormKit';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MatchFormatPicker } from '../match/MatchFormatPicker';
import { SeriesWinConditionValue, normalizeBestOf, normalizeCondition } from '../../lib/series';
import { COLORS } from '../../lib/theme';
import { PRIVATE_COLORS } from '../ui/PrivateBadge';
import { useQueryClient } from '@tanstack/react-query';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useFormScroll, FormScrollProvider } from '../ui/FormScroll';
import { invalidateTournamentData } from '../../lib/queryPolicy';

// The form's steps, the same as when creating: who it is, who plays, how it is played, the rules of
// a match, when.
const STEP_KEYS = ['basics', 'players', 'format', 'matches', 'schedule'] as const;
// Space between the fields of one panel.
const PANEL_GAP = { gap: 18 };

// The format as it is picked: a bracket is one choice, with single or double elimination under it.
type FormatGroup = 'league' | 'bracket' | 'groups-bracket' | 'swiss';


interface EditTournamentModalProps {
    visible: boolean;
    onClose: () => void;
    tournament: any;
    onSaveSuccess: () => void;
}

const DURATION_UNIT_OPTIONS = [
    { value: 'Minutes', labelKey: 'duration.minutes' },
    { value: 'Hours', labelKey: 'duration.hours' },
    { value: 'Days', labelKey: 'duration.days' },
];

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

const TEAM_WIN_CONDITION_OPTIONS = [
    { value: '0', labelKey: 'teamWinCondition.matchWins' },
    { value: '1', labelKey: 'teamWinCondition.aggregateScore' },
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
    const queryClient = useQueryClient();
    const { t } = useTranslation('tournament');
    const { t: tTeam } = useTranslation('team');
    const swissKnockoutOptions = useMemo(
        () => SWISS_KNOCKOUT_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const regions = useMemo(() => REGION_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const durationUnits = useMemo(() => DURATION_UNIT_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const teamWinConditions = useMemo(() => TEAM_WIN_CONDITION_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })), [t]);
    const insets = useSafeAreaInsets();
    const tStatus = Number(tournament?.status !== undefined ? tournament.status : tournament?.Status);
    const isTeamTournament = Boolean(tournament?.isTeamTournament ?? tournament?.IsTeamTournament);
    const canEditAll = tStatus === 0 || tStatus === 1 || tStatus === 2; // Editable while Open, Upcoming, or Reg. Closed
    const canEditDeadline = tStatus === 0 || tStatus === 1; // Deadline cannot be changed if Reg is Closed (status 2)
    // A tournament in Draft with a stored opening time is one waiting to open — the only state in
    // which the schedule can still be moved. Once registration is live the field is history.
    const isScheduled = tStatus === 0
        && !!(tournament?.registrationOpensAt || tournament?.RegistrationOpensAt);

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
    // Only meaningful while the tournament is still waiting to open (status 0). Present = the
    // organiser scheduled the opening; the time can be moved but not removed, because dropping it
    // would leave a draft nothing ever opens — "Open Registration" is the way to start early.
    const [registrationOpensAt, setRegistrationOpensAt] = useState(
        tournament?.registrationOpensAt || tournament?.RegistrationOpensAt || ''
    );
    const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState(Boolean(tournament?.hasThirdPlaceMatch ?? tournament?.HasThirdPlaceMatch));
    const [requireResultApproval, setRequireResultApproval] = useState(Boolean(tournament?.requireResultApproval ?? tournament?.RequireResultApproval));

    // Ready check on scheduled matches, editable for the life of the tournament like the series
    // format: turning it on mid-tournament only ever reaches fixtures still to be played.
    const [requireMatchCheckIn, setRequireMatchCheckIn] = useState(Boolean(tournament?.requireMatchCheckIn ?? tournament?.RequireMatchCheckIn));
    const [checkInGraceMinutes, setCheckInGraceMinutes] = useState(
        String(tournament?.checkInGraceMinutes ?? tournament?.CheckInGraceMinutes ?? 10),
    );
    // Result verification, likewise editable for the whole tournament: it only gates reports that
    // have not been made yet.
    const [requireResultVerification, setRequireResultVerification] = useState(
        Boolean(tournament?.requireResultVerification ?? tournament?.RequireResultVerification),
    );
    // "Agreed outside the app" defaults ON, so only an explicit false switches it off — a server
    // that predates the setting sends nothing.
    const [allowScheduleOutsideApp, setAllowScheduleOutsideApp] = useState(
        (tournament?.allowScheduleOutsideApp ?? tournament?.AllowScheduleOutsideApp) !== false,
    );
    // Chat after availability, editable for the whole tournament: it only gates matches still
    // waiting for a time.
    const [requireAvailabilityForChat, setRequireAvailabilityForChat] = useState(
        Boolean(tournament?.requireAvailabilityForChat ?? tournament?.RequireAvailabilityForChat),
    );
    const [isExclusive, setIsExclusive] = useState(Boolean(tournament?.isExclusive ?? tournament?.IsExclusive));
    // Invite-only. Editable for the whole life of the tournament — it only changes who can find it.
    const [isPrivate, setIsPrivate] = useState(Boolean(tournament?.isPrivate ?? tournament?.IsPrivate));
    const [doubleRoundRobin, setDoubleRoundRobin] = useState(Boolean(tournament?.doubleRoundRobin ?? tournament?.DoubleRoundRobin));
    const [teamSize, setTeamSize] = useState(String(tournament?.teamSize ?? tournament?.TeamSize ?? ''));
    // Bench slots on top of the lineup — structural, so only editable before the tournament starts.
    const [allowReserves, setAllowReserves] = useState(Boolean(tournament?.allowReserves ?? tournament?.AllowReserves));
    const [maxReserves, setMaxReserves] = useState(String(tournament?.maxReserves ?? tournament?.MaxReserves ?? ''));
    const [teamWinCondition, setTeamWinCondition] = useState(
        String((tournament?.teamWinCondition ?? tournament?.TeamWinCondition) ?? '0')
    );

    // Series format. Unlike the structural fields below, this stays editable for the whole life of
    // the tournament: a match freezes its own format the moment a result lands on it, so a change
    // here only ever reaches fixtures still to be played.
    const [bestOf, setBestOf] = useState(normalizeBestOf(tournament?.bestOf ?? tournament?.BestOf));
    const [seriesWinCondition, setSeriesWinCondition] = useState<SeriesWinConditionValue>(
        normalizeCondition(tournament?.seriesWinCondition ?? tournament?.SeriesWinCondition)
    );
    const [tiebreakBestOf, setTiebreakBestOf] = useState<number | null>(
        (tournament?.tiebreakBestOf ?? tournament?.TiebreakBestOf) ?? null
    );
    // Null = the knockout keeps playing over the same Best-of as the phase that feeds it.
    const [knockoutBestOf, setKnockoutBestOf] = useState<number | null>(
        (tournament?.knockoutBestOf ?? tournament?.KnockoutBestOf) ?? null
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
    const [showRegionPicker, setShowRegionPicker] = useState(false);
    const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showRegDeadlinePicker, setShowRegDeadlinePicker] = useState(false);
    const [showRegOpensPicker, setShowRegOpensPicker] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // One step on screen at a time; every step stays one tap away on the bar above.
    const [step, setStep] = useState(0);
    const keyboardUp = useKeyboardInset(0, visible) > 0;
    // Moves the step to the field being typed in; each step's scroll starts back at the top.
    const formScroll = useFormScroll();
    useEffect(() => { formScroll.resetOffset(); }, [step, formScroll.resetOffset]);
    useEffect(() => {
        if (!visible) return;
        setStep(0);
    }, [visible]);

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

    // Does this tournament ever play a knockout match? The only place a level series has to be
    // replayed — League records it as a draw, and Swiss only knocks out when a bracket follows.
    const hasKnockoutPhase =
        selectedFormat === String(TournamentFormat.SingleElimination) ||
        selectedFormat === String(TournamentFormat.DoubleElimination) ||
        selectedFormat === String(TournamentFormat.GroupStageWithKnockout) ||
        (isSwiss && swissKnockoutSize > 0);
    // Only a knockout that follows another phase gets its own length — a plain bracket is one phase.
    const hasSeparateKnockoutPhase = hasKnockoutPhase
        && selectedFormat !== String(TournamentFormat.SingleElimination)
        && selectedFormat !== String(TournamentFormat.DoubleElimination);
    const firstPhaseLabel = isSwiss ? t('form.swissRounds') : t('form.groupStage');

    const formatGroup: FormatGroup =
        selectedFormat === String(TournamentFormat.League) ? 'league' :
        selectedFormat === String(TournamentFormat.GroupStageWithKnockout) ? 'groups-bracket' :
        isSwiss ? 'swiss' : 'bracket';
    // Switching into 'bracket' keeps the current single / double choice; otherwise single.
    const handleFormatGroupChange = (group: FormatGroup) => {
        if (group === 'league') setSelectedFormat(String(TournamentFormat.League));
        else if (group === 'bracket') {
            if (selectedFormat !== String(TournamentFormat.SingleElimination)
                && selectedFormat !== String(TournamentFormat.DoubleElimination)) {
                setSelectedFormat(String(TournamentFormat.SingleElimination));
            }
        } else if (group === 'groups-bracket') setSelectedFormat(String(TournamentFormat.GroupStageWithKnockout));
        else setSelectedFormat(String(TournamentFormat.Swiss));
    };
    // For a bracket the choice IS the format (3 vs 4); after groups or Swiss it is the knockout's style.
    const showElimChoice = formatGroup === 'bracket' || showKnockoutTypeToggle;
    const currentElimType: '1' | '2' = formatGroup === 'bracket'
        ? (selectedFormat === String(TournamentFormat.DoubleElimination) ? '2' : '1')
        : (knockoutType === '2' ? '2' : '1');
    const setCurrentElimType = (value: '1' | '2') => {
        if (formatGroup === 'bracket') {
            setSelectedFormat(value === '2'
                ? String(TournamentFormat.DoubleElimination)
                : String(TournamentFormat.SingleElimination));
        } else {
            setKnockoutType(value);
        }
    };

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
        setRegistrationOpensAt(tournament?.registrationOpensAt || tournament?.RegistrationOpensAt || '');
        setHasThirdPlaceMatch(Boolean(tournament?.hasThirdPlaceMatch ?? tournament?.HasThirdPlaceMatch));
        setRequireResultApproval(Boolean(tournament?.requireResultApproval ?? tournament?.RequireResultApproval));
        setRequireMatchCheckIn(Boolean(tournament?.requireMatchCheckIn ?? tournament?.RequireMatchCheckIn));
        setCheckInGraceMinutes(String(tournament?.checkInGraceMinutes ?? tournament?.CheckInGraceMinutes ?? 10));
        setRequireResultVerification(Boolean(tournament?.requireResultVerification ?? tournament?.RequireResultVerification));
        setAllowScheduleOutsideApp((tournament?.allowScheduleOutsideApp ?? tournament?.AllowScheduleOutsideApp) !== false);
        setRequireAvailabilityForChat(Boolean(tournament?.requireAvailabilityForChat ?? tournament?.RequireAvailabilityForChat));
        setIsExclusive(Boolean(tournament?.isExclusive ?? tournament?.IsExclusive));
        setIsPrivate(Boolean(tournament?.isPrivate ?? tournament?.IsPrivate));
        setDoubleRoundRobin(Boolean(tournament?.doubleRoundRobin ?? tournament?.DoubleRoundRobin));
        setTeamSize(String(tournament?.teamSize ?? tournament?.TeamSize ?? ''));
        setAllowReserves(Boolean(tournament?.allowReserves ?? tournament?.AllowReserves));
        setMaxReserves(String(tournament?.maxReserves ?? tournament?.MaxReserves ?? ''));
        setTeamWinCondition(String((tournament?.teamWinCondition ?? tournament?.TeamWinCondition) ?? '0'));
        setBestOf(normalizeBestOf(tournament?.bestOf ?? tournament?.BestOf));
        setSeriesWinCondition(normalizeCondition(tournament?.seriesWinCondition ?? tournament?.SeriesWinCondition));
        setTiebreakBestOf((tournament?.tiebreakBestOf ?? tournament?.TiebreakBestOf) ?? null);
        setKnockoutBestOf((tournament?.knockoutBestOf ?? tournament?.KnockoutBestOf) ?? null);
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
        return regions.find(r => r.value === selectedRegion)?.label || t('form.region');
    };

    const getCurrencyLabel = () => {
        return prizeCurrencies.find(c => c.value === prizeCurrency)?.label || t('form.currency');
    };

    // What stops each step — checked on every Save, which then opens the step that needs fixing.
    const stepError = (index: number): string | null => {
        switch (STEP_KEYS[index]) {
            case 'basics':
                if (!name.trim()) return t('validation.nameRequired');
                return null;
            case 'players': {
                if (!maxPlayers || isNaN(parseInt(maxPlayers)) || parseInt(maxPlayers) <= 0) return t('validation.maxPlayersRequired');
                // Team size and Max Players must still produce ≥ 2 teams once the bracket is built.
                if (isTeamTournament && canEditAll) {
                    const ts = parseInt(teamSize);
                    if (!teamSize || isNaN(ts) || ts < 2 || ts > 11) return t('validation.teamSizeRange');
                    if (parseInt(maxPlayers) < ts * 2) return t('validation.maxPlayersForTeams', { min: ts * 2 });
                    if (allowReserves) {
                        const mr = parseInt(maxReserves);
                        if (!maxReserves || isNaN(mr) || mr < 1 || mr > 11) return t('validation.reservesRange');
                    }
                }
                if (canEditAll && scopeMode === 'country' && selectedCountries.length === 0) return t('validation.countryRequired');
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
            case 'matches':
                return null;
            case 'schedule': {
                // Moving the opening past the deadline would leave a tournament nobody can ever join.
                if (isScheduled && registrationOpensAt && registrationDeadline) {
                    const opensAt = new Date(String(registrationOpensAt).replace(' ', 'T'));
                    const deadline = new Date(String(registrationDeadline).replace(' ', 'T'));
                    if (opensAt >= deadline) return t('validation.opensBeforeDeadline');
                }
                return null;
            }
        }
        return null;
    };

    const goToStep = (index: number) => {
        setError(null);
        setStep(Math.max(0, Math.min(index, STEP_KEYS.length - 1)));
    };

    const handleSave = async () => {
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
                // Server only applies this on a tournament still waiting to open; anywhere else it
                // preserves what is stored. The flag is what tells it this client knows the field —
                // without it a null here would silently unschedule the tournament.
                RegistrationOpensAt: registrationOpensAt
                    ? new Date(String(registrationOpensAt).replace(' ', 'T')).toISOString()
                    : null,
                AllowScheduleEdits: true,
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
                RequireMatchCheckIn: requireMatchCheckIn,
                CheckInGraceMinutes: requireMatchCheckIn ? (parseInt(checkInGraceMinutes, 10) || null) : null,
                // Always sent: the server reads its absence as "an older app, keep what is stored".
                RequireResultVerification: requireResultVerification,
                AllowScheduleOutsideApp: allowScheduleOutsideApp,
                RequireAvailabilityForChat: requireAvailabilityForChat,
                // Series format — applied whenever AllowStructuralEdits is set, with no start-date
                // gate: already-played matches carry their own frozen format, so this can only
                // change fixtures that have yet to be reported.
                BestOf: bestOf,
                SeriesWinCondition: seriesWinCondition,
                TiebreakBestOf: hasKnockoutPhase ? tiebreakBestOf : null,
                // Same freedom as BestOf above: only fixtures still to be played pick it up.
                KnockoutBestOf: hasSeparateKnockoutPhase ? knockoutBestOf : null,
                // Structural fields the backend will only honour when AllowStructuralEdits=true and the
                // tournament hasn't started; otherwise it preserves the persisted values regardless of
                // what we send. IsTeamTournament is locked forever — sent for completeness only.
                IsTeamTournament: isTeamTournament,
                TeamSize: isTeamTournament ? (parseInt(teamSize) || null) : null,
                AllowReserves: isTeamTournament ? allowReserves : false,
                MaxReserves: isTeamTournament && allowReserves ? (parseInt(maxReserves) || null) : null,
                TeamWinCondition: parseInt(teamWinCondition) || 0,
                IsExclusive: isExclusive,
                // Always sent by this build; an older one omits it and the server keeps the stored value.
                IsPrivate: isPrivate,
                DoubleRoundRobin: isLeagueOrGroup ? doubleRoundRobin : false,
                AllowStructuralEdits: true,
            };

            const response = await authenticatedFetch(ENDPOINTS.CREATE_TOURNAMENT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || t('validation.updateFailed'));
            }

            await invalidateTournamentData(queryClient, tournament.id || tournament.Id);
            onSaveSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error updating tournament:', err);
            setError(err.message || t('common:unexpectedError'));
        } finally {
            setIsSubmitting(false);
        }
    };

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
                    <View
                        className="rounded-3xl max-h-[60%] overflow-hidden"
                        style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderTopColor: 'rgba(255,255,255,0.12)' }}
                    >
                        <ScrollView className="p-3" showsVerticalScrollIndicator={false}>
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
                                        className={`px-4 py-3.5 mb-1.5 rounded-2xl flex-row justify-between items-center border ${active ? 'bg-primary/15 border-primary/40' : 'bg-white/[0.03] border-white/[0.05]'}`}
                                    >
                                        <Text className={`shrink text-[15px] ${active ? 'text-white font-black' : 'text-slate-300 font-semibold'}`}>
                                            {opt.label}
                                        </Text>
                                        {active && <Ionicons name="checkmark-circle" size={19} color={COLORS.primaryBright} />}
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

    const steps: FormStep[] = [
        { key: 'basics', icon: 'trophy', color: '#34D399', title: t('form.sectionBasicInfo') },
        { key: 'players', icon: 'people', color: '#818CF8', title: t('form.sectionPlayersAccess') },
        { key: 'format', icon: 'git-network', color: '#38BDF8', title: t('form.format') },
        { key: 'matches', icon: 'shield-checkmark', color: '#FBBF24', title: t('form.sectionMatchSettings') },
        { key: 'schedule', icon: 'calendar', color: '#A78BFA', title: t('form.sectionSchedule') },
    ];
    const lastStep = STEP_KEYS.length - 1;

    const formatChoices: Choice<FormatGroup>[] = [
        { value: 'league', icon: 'list', label: t('formatGroup.league'), hint: t('formatGroupHint.league'), color: '#38BDF8' },
        { value: 'bracket', icon: 'git-network', label: t('formatGroup.bracket'), hint: t('formatGroupHint.bracket'), color: '#38BDF8' },
        { value: 'groups-bracket', icon: 'grid', label: t('formatGroup.groupsBracket'), hint: t('formatGroupHint.groupsBracket'), color: '#38BDF8' },
        // Teams play every format but Swiss.
        { value: 'swiss', icon: 'swap-horizontal', label: t('formatGroup.swiss'), hint: t('formatGroupHint.swiss'), color: '#38BDF8', disabled: isTeamTournament },
    ];

    const renderBasics = () => (
        <View className="gap-4">
            <FormPanel>
                <FormInput
                    label={t('form.name')}
                    icon="trophy-outline"
                    placeholder={t('form.namePlaceholder')}
                    value={name}
                    onChangeText={setName}
                    editable={canEditAll}
                />
            </FormPanel>

            {/* Invite-only can change for the whole life of the tournament — it only changes who can find it. */}
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
                            {t('form.visibilityPrivateEditHint')}
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
                                placeholder={t('form.amountPlaceholder')}
                                keyboardType="numeric"
                                value={prize}
                                onChangeText={setPrize}
                                editable={canEditAll}
                            />
                        </View>
                        <View style={{ width: 118 }}>
                            <SelectField value={getCurrencyLabel()} onPress={() => setShowCurrencyPicker(true)} disabled={!canEditAll} />
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
            {/* Solo or team is fixed once the tournament exists; shown for what it is. */}
            <Field label={tTeam('modeLabel')}>
                <ChoiceCards
                    options={[
                        { value: 'solo', icon: 'person', label: tTeam('modeSolo'), color: '#818CF8' },
                        { value: 'team', icon: 'people', label: tTeam('modeTeam'), color: '#818CF8' },
                    ]}
                    value={isTeamTournament ? 'team' : 'solo'}
                    onChange={() => {}}
                    disabled
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
                        editable={canEditAll}
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
                            disabled={!canEditAll}
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
                    editable={canEditAll}
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
                        disabled={!canEditAll}
                    />
                    <View className="mt-3">
                        {scopeMode === 'region' ? (
                            <SelectField icon="earth-outline" value={getRegionLabel()} onPress={() => setShowRegionPicker(true)} disabled={!canEditAll} />
                        ) : (
                            <View pointerEvents={canEditAll ? 'auto' : 'none'} style={{ opacity: canEditAll ? 1 : 0.5 }}>
                                <CountryPicker
                                    placeholder={t('form.selectCountries')}
                                    multiple
                                    values={selectedCountries}
                                    onToggle={toggleCountry}
                                />
                            </View>
                        )}
                    </View>
                </Field>
            </FormPanel>

            {/* Reserves — structural, so locked once the bracket exists (rosters are already split
                into lineup and bench by then). */}
            {isTeamTournament && (
                <ToggleCard
                    icon="person-add"
                    color="#818CF8"
                    title={t('form.allowReserves')}
                    value={allowReserves}
                    onChange={setAllowReserves}
                    disabled={!canEditAll}
                >
                    <FormInput
                        label={t('form.reservesPerTeam')}
                        icon="person-add-outline"
                        hint={t('form.reservesDetailHint', { lineup: teamSize || t('form.lineupWord') })}
                        placeholder={t('form.egQualifiers')}
                        keyboardType="numeric"
                        value={maxReserves}
                        onChangeText={setMaxReserves}
                        editable={canEditAll}
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
                disabled={!canEditAll}
            />
        </View>
    );

    const renderFormat = () => (
        <View className="gap-4">
            <ChoiceCards options={formatChoices} value={formatGroup} onChange={handleFormatGroupChange} disabled={!canEditAll} />

            {(selectedFormat === '5' || isSwiss || showElimChoice) && (
                <FormPanel style={PANEL_GAP}>
                    {selectedFormat === '5' && (
                        <View className="flex-row" style={{ gap: 10 }}>
                            <View className="flex-1">
                                <FormInput
                                    label={t('form.groupsCount')}
                                    icon="grid-outline"
                                    placeholder={t('form.egGroups')}
                                    keyboardType="numeric"
                                    value={groupsCount}
                                    onChangeText={setGroupsCount}
                                    editable={canEditAll}
                                />
                            </View>
                            <View className="flex-1">
                                <FormInput
                                    label={t('form.qualifiersPerGroup')}
                                    icon="arrow-up-circle-outline"
                                    placeholder={t('form.egQualifiers')}
                                    keyboardType="numeric"
                                    value={qualifiersPerGroup}
                                    onChangeText={setQualifiersPerGroup}
                                    editable={canEditAll}
                                />
                            </View>
                        </View>
                    )}

                    {isSwiss && (
                        <View className="flex-row" style={{ gap: 10 }}>
                            <View className="flex-1">
                                <FormInput
                                    label={t('form.swissRounds')}
                                    icon="repeat-outline"
                                    placeholder={t('form.swissRoundsPlaceholder')}
                                    keyboardType="numeric"
                                    value={swissRounds}
                                    onChangeText={setSwissRounds}
                                    editable={canEditAll}
                                />
                            </View>
                            <View className="flex-1">
                                <SelectField
                                    label={t('form.knockoutStage')}
                                    icon="git-merge-outline"
                                    value={swissKnockoutOptions.find(o => o.value === swissKnockout)?.label || t('form.none')}
                                    onPress={() => setShowSwissKnockoutPicker(true)}
                                    disabled={!canEditAll}
                                />
                            </View>
                        </View>
                    )}

                    {isSwiss && swissKnockoutSize > 0 && (
                        <FormInput
                            label={t('form.directQualifiers')}
                            icon="flash-outline"
                            hint={swissPlayInPlayers > 0 && !isNaN(swissDirectCount)
                                ? t('form.swissPlayInHintShort', { direct: swissDirectCount, from: swissDirectCount + 1, to: swissDirectCount + swissPlayInPlayers, spots: swissKnockoutSize - swissDirectCount })
                                : t('form.swissDirectHint', { size: swissKnockoutSize, second: swissKnockoutSize - 1 })}
                            placeholder={t('form.directQualifiersPlaceholder', { count: swissKnockoutSize })}
                            keyboardType="numeric"
                            value={swissDirect}
                            onChangeText={setSwissDirect}
                            editable={canEditAll}
                        />
                    )}

                    {/* Single vs double elimination: the format itself for a bracket, the knockout's style after groups or Swiss. */}
                    {showElimChoice && (
                        <Field label={t('form.knockoutBracket')} hint={t('form.knockoutHint')}>
                            <SegmentedToggle
                                raised
                                options={[
                                    { value: '1', label: t('form.single') },
                                    { value: '2', label: t('form.double') },
                                ]}
                                value={currentElimType}
                                onChange={(v) => setCurrentElimType(v as '1' | '2')}
                                disabled={!canEditAll}
                            />
                        </Field>
                    )}
                </FormPanel>
            )}

            {/* Editable at any point in the tournament: matches already reported keep the format they
                were played under, so this only reaches fixtures still to come. */}
            <FormPanel>
                <MatchFormatPicker
                    bestOf={bestOf}
                    onBestOfChange={setBestOf}
                    winCondition={seriesWinCondition}
                    onWinConditionChange={setSeriesWinCondition}
                    tiebreakBestOf={tiebreakBestOf}
                    onTiebreakBestOfChange={setTiebreakBestOf}
                    hasSeparateKnockoutPhase={hasSeparateKnockoutPhase}
                    firstPhaseLabel={firstPhaseLabel}
                    knockoutBestOf={knockoutBestOf}
                    onKnockoutBestOfChange={setKnockoutBestOf}
                    hasKnockout={hasKnockoutPhase}
                    isTeamTournament={isTeamTournament}
                />
            </FormPanel>

            {canShowThirdPlace && (
                <ToggleCard
                    icon="medal"
                    color="#FBBF24"
                    title={t('form.thirdPlaceMatch')}
                    hint={t('form.thirdPlaceHintEdit')}
                    value={hasThirdPlaceMatch}
                    onChange={setHasThirdPlaceMatch}
                    disabled={!canEditAll}
                />
            )}

            {(selectedFormat === '0' || selectedFormat === '5') && (
                <ToggleCard
                    icon="repeat"
                    color="#38BDF8"
                    title={t('form.doubleRoundRobin')}
                    hint={t('form.doubleRoundRobinHint')}
                    value={doubleRoundRobin}
                    onChange={setDoubleRoundRobin}
                    disabled={!canEditAll}
                />
            )}

            {(selectedFormat === '0' || selectedFormat === '5' || isSwiss) && (
                <FormPanel>
                    <Field label={t('form.roundDuration')}>
                        <View className="flex-row" style={{ gap: 10 }}>
                            <View className="flex-1">
                                <FormInput
                                    icon="timer-outline"
                                    placeholder={t('form.egQualifiers')}
                                    keyboardType="numeric"
                                    value={roundDurationValue}
                                    onChangeText={setRoundDurationValue}
                                    editable={canEditAll}
                                />
                            </View>
                            <View className="flex-1">
                                <SelectField
                                    value={durationUnits.find(u => u.value === roundDurationUnit)?.label ?? roundDurationUnit}
                                    onPress={() => setShowDurationUnitPicker(true)}
                                    disabled={!canEditAll}
                                />
                            </View>
                        </View>
                    </Field>
                </FormPanel>
            )}
        </View>
    );

    // Safe to switch any time, even mid-tournament: each only reaches fixtures still to be played.
    const renderMatches = () => (
        <View className="gap-3">
            <ToggleCard
                icon="checkmark-done"
                color="#34D399"
                title={t('form.requireApproval')}
                hint={t('form.requireApprovalHintShort')}
                value={requireResultApproval}
                onChange={setRequireResultApproval}
            />
            <ToggleCard
                icon="chatbubbles"
                color="#38BDF8"
                title={t('form.allowOutsideApp')}
                hint={t('form.allowOutsideAppHint')}
                value={allowScheduleOutsideApp}
                onChange={setAllowScheduleOutsideApp}
            />
            <ToggleCard
                icon="calendar"
                color="#FB923C"
                title={t('form.chatAfterAvailability')}
                hint={t('form.chatAfterAvailabilityHint')}
                value={requireAvailabilityForChat}
                onChange={setRequireAvailabilityForChat}
            />
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
                    placeholder={t('form.rulesPlaceholderShort')}
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
                    label={t('form.regDeadlinePlain')}
                    value={registrationDeadline}
                    placeholder={t('form.select')}
                    iconName="time-outline"
                    iconColor={COLORS.warning}
                    onPress={() => setShowRegDeadlinePicker(true)}
                    disabled={!canEditDeadline}
                    standalone
                />
                <ScheduleField
                    label={t('form.startDatePlain')}
                    value={startDate}
                    placeholder={t('form.select')}
                    iconName="calendar-outline"
                    iconColor={COLORS.primary}
                    onPress={() => setShowStartDatePicker(true)}
                    disabled={!canEditAll}
                    standalone
                />
            </FormPanel>
            {isScheduled && (
                <FormPanel>
                    <ScheduleField
                        label={t('form.registrationOpens')}
                        value={registrationOpensAt}
                        placeholder={t('form.select')}
                        iconName="lock-open-outline"
                        iconColor={COLORS.info}
                        onPress={() => setShowRegOpensPicker(true)}
                        standalone
                    />
                    <Text className={FIELD_HINT}>{t('form.opensClosedNotice')}</Text>
                </FormPanel>
            )}
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
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            // Edge to edge on Android too, so the safe-area padding below is the only spacing.
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
                {/* The whole screen, like creating one: the same height on every step, so the buttons
                    stay put while the steps change. */}
                <View className="flex-1 bg-background w-full">
                    <View className="px-5 pb-4 border-b border-white/[0.06]" style={{ paddingTop: insets.top + 10 }}>
                        <View className="flex-row items-center mb-4" style={{ gap: 12 }}>
                            <LinearGradient
                                colors={['#4C1D95', '#312E81']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)' }}
                            >
                                <Ionicons name="trophy" size={20} color="#FBBF24" />
                            </LinearGradient>
                            <View className="flex-1">
                                <Text className="text-[19px] leading-[23px] font-black text-white tracking-tight" numberOfLines={1}>
                                    {t('form.editTournament')}
                                </Text>
                                <Text className="text-[13px] font-semibold mt-0.5" style={{ color: '#C4B5FD' }} numberOfLines={1}>
                                    {name.trim() || t('form.manageTournament')}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={onClose}
                                accessibilityRole="button"
                                accessibilityLabel={t('common:close')}
                                className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 items-center justify-center"
                            >
                                <Ionicons name="close" size={18} color={COLORS.slate400} />
                            </TouchableOpacity>
                        </View>
                        {/* Every step can be reached directly: an edit usually touches one thing. */}
                        <StepHeader steps={steps} current={step} onSelect={goToStep} reachable={() => true} />
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
                    <View className="px-5 pt-4 bg-background-deep border-t border-white/[0.06]" style={{ paddingBottom: insets.bottom + 20 }}>
                        <FormError message={error} />
                        <View className="flex-row items-center" style={{ gap: 10 }}>
                            <StepArrow direction="back" onPress={() => goToStep(step - 1)} disabled={step === 0} label={t('common:back')} />
                            <StepArrow direction="forward" onPress={() => goToStep(step + 1)} disabled={step === lastStep} label={t('common:next')} />
                            <GradientButton
                                label={t('form.saveChanges')}
                                icon="checkmark-circle"
                                onPress={handleSave}
                                loading={isSubmitting}
                                compact
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                    )}
                </View>

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
                    title={t('form.tournamentStart')}
                    initialValue={startDate}
                />
                <DateTimePickerModal
                    visible={showRegDeadlinePicker}
                    onClose={() => setShowRegDeadlinePicker(false)}
                    onConfirm={(val) => setRegistrationDeadline(val)}
                    title={t('form.registrationDeadline')}
                    initialValue={registrationDeadline}
                />
                <DateTimePickerModal
                    visible={showRegOpensPicker}
                    onClose={() => setShowRegOpensPicker(false)}
                    onConfirm={(val) => setRegistrationOpensAt(val)}
                    title={t('form.registrationOpens')}
                    initialValue={registrationOpensAt}
                />
            </KeyboardAvoidingView>
        </Modal>
    );
}

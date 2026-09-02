import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { shareTournament } from '../../lib/share';
import { getCurrencyLabel } from '../../lib/utils';
import { TournamentRegion } from '../../types/tournament';
import {
    ShareCardShell,
    PosterRoot,
    CardFrame,
    EmblemRing,
    SideStat,
    StatDivider,
    StatPill,
    PosterWordmark,
} from './ShareCardShell';
import i18n from '../../i18n';

// Shareable tournament card — the player-card poster style in a violet/gold
// "champion" theme: trophy emblem, name + status chip, prize (or participants)
// ring, and mode / date pills. Prize takes the center ring when there is one.

interface ShareTournamentCardModalProps {
    visible: boolean;
    onClose: () => void;
    tournamentId: string;
    name: string;
    /** TournamentStatus: 0 Open, 1 Upcoming, 2 Reg. Closed, 3 Live, 4 Completed */
    status: number;
    isTeam: boolean;
    /** Registered players — or teams when isTeam. */
    participants: number;
    teamSize?: number | null;
    /** Raw prize amount as the API returns it; null/undefined when there is no prize. */
    prize?: string | number | null;
    prizeCurrency?: number | string | null;
    format?: number | null;
    startDate?: string | null;
    region?: number | null;
    countries?: string[] | null;
    countryFlags?: string[] | null;
    hubName?: string | null;
}

const STATUS_META: Record<number, { labelKey: string; color: string; bg: string; border: string }> = {
    0: { labelKey: 'share.stOpen', color: '#818CF8', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.35)' },
    1: { labelKey: 'share.stUpcoming', color: '#818CF8', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.35)' },
    2: { labelKey: 'share.regClosed', color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.3)' },
    3: { labelKey: 'share.stLive', color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
    4: { labelKey: 'share.stCompleted', color: '#94A3B8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
};

// getTournamentFormatLabel's full labels don't fit a stat column — short forms only.
const FORMAT_SHORT: Record<number, string> = {
    0: 'share.fmtLeague',
    1: 'share.fmtGroupsSE',
    2: 'share.fmtGroupsDE',
    3: 'share.fmtSingleElim',
    4: 'share.fmtDoubleElim',
    5: 'share.fmtGroupsKO',
    6: 'share.fmtSwiss',
};

const REGION_SHORT: Record<number, string> = {
    [TournamentRegion.Global]: 'Global',
    [TournamentRegion.NorthAmerica]: 'NA',
    [TournamentRegion.Europe]: 'EU',
    [TournamentRegion.Asia]: 'Asia',
    [TournamentRegion.SouthAmerica]: 'SA',
    [TournamentRegion.Africa]: 'AFR',
    [TournamentRegion.Oceania]: 'OCE',
};

function TournamentCardPoster({ name, status, isTeam, participants, teamSize, prize, prizeCurrency, format, startDate, region, countries, countryFlags, hubName, width }: {
    width: number;
} & Omit<ShareTournamentCardModalProps, 'visible' | 'onClose' | 'tournamentId'>) {
    const { t } = useTranslation('common');
    const statusMeta = STATUS_META[status] ?? STATUS_META[1];
    const participantsLabel = isTeam ? t('share.teams') : t('share.players');
    const prizeText = prize != null && String(prize).trim() !== '' ? String(prize).trim() : null;
    const formatLabel = FORMAT_SHORT[Number(format)] ? t(FORMAT_SHORT[Number(format)]) : t('share.custom');

    const currencyLabel = getCurrencyLabel(prizeCurrency);

    let regionValue = REGION_SHORT[Number(region)] ?? 'Global';
    let regionLabel = 'REGION';
    if (countries && countries.length === 1) {
        regionValue = `${countryFlags?.[0] ? countryFlags[0] + ' ' : ''}${countries[0]}`;
        regionLabel = 'COUNTRY';
    } else if (countries && countries.length > 1) {
        regionValue = String(countries.length);
        regionLabel = 'COUNTRIES';
    }

    const dateValue = startDate
        ? new Date(startDate).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
        : t('app.tbd');
    const modeValue = isTeam ? (teamSize ? `${teamSize}v${teamSize}` : t('team:modeTeam')) : t('team:modeSolo');

    return (
        <PosterRoot width={width} glowA="#8B5CF6" glowB="#F59E0B">
            <CardFrame
                hairlineColors={['rgba(167,139,250,0.55)', 'rgba(148,163,184,0.14)', 'rgba(245,158,11,0.45)']}
                bannerColors={['#4C1D95', '#6D28D9', '#4338CA']}
            >
                <EmblemRing colors={['#A78BFA', '#FBBF24']}>
                    <LinearGradient colors={['#1E1B4B', '#0B111D']} style={{ flex: 1, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="trophy" size={44} color="#FBBF24" />
                    </LinearGradient>
                </EmblemRing>

                <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{ marginTop: 16, fontSize: 26, fontWeight: '800', color: '#F8FAFC', textAlign: 'center', letterSpacing: -0.5 }}
                >
                    {name}
                </Text>
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 99,
                        backgroundColor: statusMeta.bg,
                        borderWidth: 1,
                        borderColor: statusMeta.border,
                    }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusMeta.color }} />
                        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: statusMeta.color }}>{t(statusMeta.labelKey)}</Text>
                    </View>
                </View>

                {/* Prize takes the center column when there is one; otherwise participants do. */}
                <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center' }}>
                    {prizeText ? (
                        <>
                            <SideStat icon="people" iconColor="rgba(129,140,248,0.75)" value={participants} label={participantsLabel} />
                            <StatDivider />
                            <SideStat icon="trophy" iconColor="rgba(251,191,36,0.8)" value={prizeText} label={t('share.prizeLabel', { currency: currencyLabel.toUpperCase() })} valueColor="#FBBF24" />
                            <StatDivider />
                            <SideStat icon="list" iconColor="rgba(167,139,250,0.75)" value={formatLabel} label={t('share.statFormat')} valueSize={15} />
                        </>
                    ) : (
                        <>
                            <SideStat icon="list" iconColor="rgba(167,139,250,0.75)" value={formatLabel} label={t('share.statFormat')} valueSize={15} />
                            <StatDivider />
                            <SideStat icon="people" iconColor="rgba(129,140,248,0.75)" value={participants} label={participantsLabel} />
                            <StatDivider />
                            <SideStat icon="globe-outline" iconColor="rgba(52,211,153,0.75)" value={regionValue} label={regionLabel} valueSize={16} />
                        </>
                    )}
                </View>

                <View style={{ marginTop: 24, flexDirection: 'row', gap: 10 }}>
                    <StatPill
                        value={modeValue}
                        label={t('share.statMode')}
                        background="rgba(45,212,237,0.08)"
                        border="rgba(45,212,237,0.22)"
                        valueColor="#2DD4ED"
                        labelColor="rgba(45,212,237,0.7)"
                        valueSize={16}
                    />
                    <StatPill
                        value={dateValue}
                        label={t('share.statDate')}
                        background="rgba(167,139,250,0.08)"
                        border="rgba(167,139,250,0.25)"
                        valueColor="#A78BFA"
                        labelColor="rgba(167,139,250,0.7)"
                        valueSize={16}
                    />
                    {prizeText && (
                        <StatPill
                            value={regionValue}
                            label={regionLabel}
                            background="rgba(148,163,184,0.06)"
                            border="rgba(148,163,184,0.18)"
                            valueColor="#94A3B8"
                            labelColor="#64748B"
                            valueSize={16}
                        />
                    )}
                </View>

                {!!hubName && (
                    <Text numberOfLines={1} style={{ marginTop: 16, textAlign: 'center', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#64748B' }}>
                        HOSTED BY <Text style={{ color: '#A78BFA' }}>{hubName.toUpperCase()}</Text>
                    </Text>
                )}
            </CardFrame>

            <PosterWordmark />
        </PosterRoot>
    );
}

export function ShareTournamentCardModal({ visible, onClose, tournamentId, name, ...poster }: ShareTournamentCardModalProps) {
    const { t } = useTranslation('common');
    return (
        <ShareCardShell
            visible={visible}
            onClose={onClose}
            headerTitle={t('share.tournamentCard')}
            dialogTitle={t('share.tournamentDialogTitle', { name })}
            fileName={name || 'tournament'}
            onShareLink={() => shareTournament(tournamentId, name)}
            renderPoster={(width) => (
                <TournamentCardPoster name={name} width={width} {...poster} />
            )}
        />
    );
}

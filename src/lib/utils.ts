import i18n from '../i18n';
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Ensures UTC date strings from backend (which may lack Z suffix) are parsed as UTC
export function parseUtcDate(dateStr: string): Date {
    if (!dateStr) return new Date(dateStr);
    return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
}

// "23 Aug 2026, 10:01" — full date plus a 24h clock for a backend UTC timestamp. Assembled from
// the two parts on purpose: toLocaleString() joins them with the locale's own connector
// ("23 Aug 2026 at 10:01"). Pass a newline separator to stack the clock under the date.
export function formatDateTimeShort(dateStr?: string | null, separator = ', '): string {
    if (!dateStr) return '';
    const d = parseUtcDate(dateStr);
    if (isNaN(d.getTime())) return '';
    const day = d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day}${separator}${time}`;
}

// Exact local (device-timezone) time for a backend UTC timestamp — never "x ago".
// Shows just the clock time for today's items and prefixes the date for older ones,
// so the same instant reads e.g. 15:00 in RS and 18:30 in IN.
export function formatLocalDateTime(dateStr?: string | null): string {
    if (!dateStr) return '';
    const d = parseUtcDate(dateStr);
    if (isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
    const isToday = d.toDateString() === new Date().toDateString();
    return isToday ? time : `${d.toLocaleDateString(i18n.language)} ${time}`;
}

// Schedule picker values are dual-format: the backend sends UTC ISO ("…Z"), while the
// in-app DateTimePickerModal emits a local wall-clock string ("YYYY-MM-DD HH:mm", no
// zone). Both must render as the local wall-clock time the user picked, so we parse
// directly (NOT via parseUtcDate, which would wrongly force the picker's local string to
// UTC) and read with local getters. Splits into date + time so the UI can lay them out;
// time is HH:mm only — the picker has hour granularity, minutes are always :00.
export function formatSchedulePickerValue(value?: string | null): { date: string; time: string } | null {
    if (!value) return null;
    const d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return null;
    return {
        date: d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
}

// Safely format a backend date string for display. Returns the fallback if the
// input is missing or unparseable — avoids "Invalid Date" leaking into UI.
export function formatDateSafe(dateStr: string | null | undefined, fallback?: string): string {
    // Display-only fallback. Callers that rely on 'TBD' as a *sentinel* pass it explicitly.
    const shown = fallback ?? i18n.t('common:app.tbd');
    if (!dateStr) return shown;
    const d = parseUtcDate(dateStr);
    if (isNaN(d.getTime())) return shown;
    return d.toLocaleDateString(i18n.language);
}

// Backend PrizeCurrency enum:  1=EUR, 2=USD, 3=StarPass, 4=FCP
// Accepts both the number and the label string for resilience to backend
// shape changes. Default symbol is '€' (matches backend default value of 1).
export function getCurrencySymbol(currency?: number | string | null): string {
    if (typeof currency === 'string') {
        const lower = currency.toLowerCase();
        if (lower === 'eur') return '€';
        if (lower === 'usd' || lower === 'dollar') return '$';
        if (lower === 'starpass') return 'SP';
        if (lower === 'fcp') return 'FCP';
    }
    switch (currency) {
        case 1: return '€';
        case 2: return '$';
        case 3: return 'SP';
        case 4: return 'FCP';
        default: return '€';
    }
}

// Full label form of the prize currency (e.g. for verbose prize-pool readouts).
export function getCurrencyLabel(currency?: number | string | null): string {
    if (typeof currency === 'string') {
        const lower = currency.toLowerCase();
        if (lower === 'eur') return 'EUR';
        if (lower === 'usd' || lower === 'dollar') return 'USD';
        if (lower === 'starpass') return 'StarPass';
        if (lower === 'fcp') return 'FCP';
    }
    switch (currency) {
        case 1: return 'EUR';
        case 2: return 'USD';
        case 3: return 'StarPass';
        case 4: return 'FCP';
        default: return 'EUR';
    }
}

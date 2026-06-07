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

// Safely format a backend date string for display. Returns the fallback if the
// input is missing or unparseable — avoids "Invalid Date" leaking into UI.
export function formatDateSafe(dateStr: string | null | undefined, fallback: string = 'TBD'): string {
    if (!dateStr) return fallback;
    const d = parseUtcDate(dateStr);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString();
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

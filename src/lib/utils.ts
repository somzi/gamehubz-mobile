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

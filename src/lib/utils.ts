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

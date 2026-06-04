import { ENDPOINTS } from './api';
import { Country, RegionType } from '../types/auth';

// The catalog is static on the backend, so fetch once and memoize for the app session.
let cache: Country[] | null = null;
let inFlight: Promise<Country[]> | null = null;

export async function getCountries(): Promise<Country[]> {
    if (cache) return cache;
    if (inFlight) return inFlight;

    inFlight = (async () => {
        try {
            const res = await fetch(ENDPOINTS.GET_COUNTRIES);
            if (!res.ok) throw new Error(`Country fetch failed: ${res.status}`);
            const data = (await res.json()) as any[];
            cache = data.map(c => ({
                code: c.code ?? c.Code,
                name: c.name ?? c.Name,
                flag: c.flag ?? c.Flag,
                region: (c.region ?? c.Region) as RegionType,
            }));
            return cache;
        } finally {
            inFlight = null;
        }
    })();

    return inFlight;
}

/** Region name for a numeric RegionType — shared by profile screens and pickers. */
export function getRegionName(region?: number | null): string {
    switch (region) {
        case RegionType.NA: return 'North America';
        case RegionType.EUROPE: return 'Europe';
        case RegionType.ASIA: return 'Asia';
        case RegionType.SA: return 'South America';
        case RegionType.AFRICA: return 'Africa';
        case RegionType.OCEANIA: return 'Oceania';
        default: return 'Global';
    }
}

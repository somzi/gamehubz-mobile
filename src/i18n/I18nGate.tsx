import React, { useEffect, useState } from 'react';

import { i18nReady } from './index';

/**
 * Holds the first render until the persisted language choice has been read and
 * applied, so a Spanish user never sees a frame of English before their preference
 * loads. The wait is a single AsyncStorage read and resolves well inside the auth
 * bootstrap that AuthProvider already gates on, so it adds no perceptible startup
 * cost — the native splash is still up at this point.
 */
export function I18nGate({ children }: { children: React.ReactNode }) {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let active = true;
        i18nReady.then(() => {
            if (active) setReady(true);
        });
        return () => {
            active = false;
        };
    }, []);

    if (!ready) return null;

    return <>{children}</>;
}

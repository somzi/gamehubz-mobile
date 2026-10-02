import { useEffect, useRef } from 'react';
import { createRequestGate } from '../lib/requestGate';

export function useRequestGate(scope: unknown) {
    const ref = useRef({ scope, gate: createRequestGate() });
    if (ref.current.scope !== scope) {
        ref.current.gate.clear();
        ref.current = { scope, gate: createRequestGate() };
    }
    const gate = ref.current.gate;
    useEffect(() => () => gate.clear(), [gate]);
    return gate;
}

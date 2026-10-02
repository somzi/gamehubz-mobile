// Token rotation, login and logout share one write queue. An old native storage write
// must finish before logout clears it or a new login persists another account's tokens.
let pending: Promise<unknown> = Promise.resolve();

export function queueAuthStorage<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.catch(() => {}).then(operation);
    pending = result;
    return result;
}

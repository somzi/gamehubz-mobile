/** Polling and an action can share a read; a post-mutation confirmation may replace it. */
export function createSingleFlight<T>() {
    let pending: Promise<T> | undefined;
    return (load: () => Promise<T>, force = false): Promise<T> => {
        if (pending && !force) return pending;
        const operation = load();
        pending = operation;
        void operation.finally(() => { if (pending === operation) pending = undefined; }).catch(() => {});
        return operation;
    };
}

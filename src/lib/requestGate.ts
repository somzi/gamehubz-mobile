/** A response may commit only while it is the latest request for this resource. */
export function createRequestGate() {
    const requests = new Map<string, object>();
    return {
        begin(key: string) {
            const token = {};
            requests.set(key, token);
            return () => requests.get(key) === token;
        },
        clear() { requests.clear(); },
    };
}

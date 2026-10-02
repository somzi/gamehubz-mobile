/**
 * Which background refreshes of a screen failed, by resource ('overview', 'bracket', …). The
 * screen keeps showing what it loaded before and a banner offers the retry; the banner has to say
 * the truth about each resource — one succeeding must not hide another that is still stale — and
 * its retry has to repeat exactly the requests that failed.
 */
export type RefreshFailures = ReadonlySet<string>;

export const NO_REFRESH_FAILURES: RefreshFailures = new Set();

/** The set after one refresh of `resource` finished. Unchanged sets keep their identity. */
export function withRefreshResult(failures: RefreshFailures, resource: string, ok: boolean): RefreshFailures {
    if (ok ? !failures.has(resource) : failures.has(resource)) return failures;
    const next = new Set(failures);
    if (ok) next.delete(resource);
    else next.add(resource);
    return next;
}

/** Repeats the refreshes that failed — only those — together. */
export function retryFailedRefreshes(
    failures: RefreshFailures,
    retry: Record<string, () => Promise<unknown>>,
): Promise<unknown[]> {
    return Promise.all([...failures].filter((resource) => retry[resource]).map((resource) => retry[resource]()));
}

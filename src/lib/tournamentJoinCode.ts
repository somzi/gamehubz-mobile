/** Only a rejected code requires replacing an invite; other failures can be retried. */
export function isRejectedTournamentJoinCode(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const payload = (error as { response?: { data?: unknown } }).response?.data ?? error;
    if (!payload || typeof payload !== 'object') return false;
    const data = payload as { errorCode?: string; ErrorCode?: string };
    const code = data.errorCode ?? data.ErrorCode;
    return code === 'join_code_wrong' || code === 'join_code_required';
}

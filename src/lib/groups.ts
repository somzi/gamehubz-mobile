/**
 * Group labels, mirroring the server's GroupNaming helper.
 *
 * A field that fits the alphabet is lettered (A, B, … Z); anything larger is numbered instead
 * (1, 2, … 30). One scheme per tournament — the old generator lettered the first 26 and then
 * switched to raw ordinals mid-list ("Group 27"), which read as two naming schemes at once and,
 * because digits sort before letters, dragged those groups to one end of the tab strip.
 * Keep in sync with GameHubz.Logic/Utility/GroupNaming.cs.
 */

/** Beyond this many groups the letters run out and the whole stage is numbered. */
export const MAX_LETTERED_GROUPS = 26;

/** Label for the group at `index` (0-based) in a stage of `totalGroups`: "A" with 8, "1" with 30. */
export function groupLabel(index: number, totalGroups: number): string {
    const i = Math.max(0, index);

    // The index check is belt-and-braces: a caller passing a stale total must not walk past 'Z'
    // into the punctuation that follows it in ASCII.
    return totalGroups <= MAX_LETTERED_GROUPS && i < MAX_LETTERED_GROUPS
        ? String.fromCharCode(65 + i)
        : String(i + 1);
}

/** Full display name for the group at `index`, e.g. "Group C". */
export function groupName(index: number, totalGroups: number): string {
    return `Group ${groupLabel(index, totalGroups)}`;
}

/**
 * Sort comparator that puts groups back in creation order. Plain alphabetical would give
 * "Group 1", "Group 10", "Group 2"; shortest label first, then alphabetical, orders both schemes
 * right — digit strings without leading zeros sort numerically once grouped by length. Legacy
 * mixed "Group Z" / "Group 27" names sort correctly under the same rule.
 */
export function compareGroupNames(a?: string | null, b?: string | null): number {
    const labelA = stripPrefix(a);
    const labelB = stripPrefix(b);

    if (labelA.length !== labelB.length) return labelA.length - labelB.length;
    return labelA.localeCompare(labelB);
}

function stripPrefix(name?: string | null): string {
    const value = (name ?? '').trim();
    return /^group /i.test(value) ? value.slice('group '.length) : value;
}

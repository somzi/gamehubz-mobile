# Verification phone binding

Implements the tournament phone enrollment and approval flow described in Claude's B1–B10 / M1–M6 plan.

- Migration 96 adds `TournamentPlayerDevice`. Partial unique indexes allow at most one active and one pending phone per player and tournament. PostgreSQL transaction advisory locks serialize first enrollment, replacement requests and organizer decisions.
- Migration 97 adds the nullable `RawRecordedOn` field. New uploads keep original clip metadata for duplicate detection and store normalized UTC time for organizer display; existing records are preserved.
- Same phone means the same `UserDevice` row or a matching nonempty `PlatformDeviceIdHash`. Prior verified phone history carries across tournaments. A rejected phone always needs another approval request.
- Enrollment runs after a successful solo registration or accepted team join and records which phone it was — no Face ID / fingerprint prompt. Biometrics are asked only when a match result is verified: at registration they would only prove that the phone's own owner unlocked it, which says nothing about who owns the account. A phone without usable biometrics, or an enrollment network failure, leaves the tournament registration intact and the first verification repeats the server binding rule. A pending team join is not yet enrollment.
- Enrollment sends the phone's description, its installation id (if any) and the platform id; the server accepts only this account's own phones. A phone that has never verified gets a `UserDevice` row without a key (empty `KeySecret`) and its installation id; its first verification registers with that id and the key is issued on the same row. An empty key never validates a signature, and Start answers 409 for a keyless row so the phone registers first. New rows share the daily key-issue budget. No migration: `KeySecret` stays NOT NULL. Servers without the endpoint are skipped.
- Panel requests include the local installation ID without unlocking biometrics. `PhoneApprovalPending` applies only to that phone; a pending replacement never hides Verify on the active phone, including after reinstall with the same platform identity.
- Verification Start now requires both series and game numbers. Existing whole-match proofs keep working. A different phone creates/updates a pending request before a new verification attempt is created.
- Upload requires the attempt's device key to sign `gamehubz.evidence.v1`, separate from the biometric challenge. The mobile sheet clears its key reference on completion, closing and a new attempt. Retryable recording rejections retain the attempt and key.
- Missing upload signatures ask the player to update the app. Incorrect signatures ask them to use the verification phone. After a recording rejection, players can choose another clip or start over in the same sheet. Start over clears the attempt and key, shows the recording steps and waits for the player before requesting biometrics; the next game follows the same preparation step.
- Recording metadata must overlap the biometric timestamp, allowing the clip duration plus 60 seconds in either direction. Clock correction is used only within ±15 minutes; the local-time fallback accepts timezone offsets within ±14 hours. Missing timestamp or usable duration is accepted with the organizer flag `noRecordingTime`.
- Organizers review phone changes in the existing help inbox, including before the bracket exists. A decision includes the reviewed `UserDeviceId`, so an old card cannot approve a replacement request. Requests contribute to the tournament, hub and organizer badges.

## Deployment

Release this mobile build first: it tolerates the previous backend, including absent phone endpoints and absent evidence signing messages. Once the build is available, apply outstanding migrations 95, 96 and 97 in order, then deploy the backend. Set the minimum supported app version to the actual released build according to the release policy. Do not point old apps at the stricter backend expecting new verification attempts to remain compatible.

No database migration or deployment is performed by this code change. Existing unfinished attempts from old clients need to be restarted in the updated app.

## Limits and device checks

This implements the existing server-issued HMAC protocol. Device descriptions, platform identifiers and recording metadata are supplied by the client; there is no hardware attestation or guarantee that the account owner played. The evidence signature binds the attempt, not the video bytes. The plan adds device checks at enrollment/Start (unsigned at enrollment, signed at verification) and a signature at upload; result submission continues to require completed per-game proofs, without a new device signature on the score request.

Hub owners without a membership row remain included in managed hub IDs, which also restores their other organizer badges. That existing correction is retained.

On a real iOS and Android device, check that joining raises no biometric prompt and that the first verification on a phone recorded at join stays approved, screen recording across the biometric prompt, consecutive games, retry after an incorrect clip, change-phone approval/rejection and the notification links. Native biometric dialogs and actual recording metadata are outside the automated test environment.

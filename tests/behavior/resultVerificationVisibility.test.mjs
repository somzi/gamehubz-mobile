import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
import { loadFetcher, loadJsxProp } from './loadFetcher.mjs';

const { resultVerificationPresentation } = await load('matchPresentation');
const detailsPath = 'src/components/modals/MatchDetailsModal.tsx';
const schedulePath = 'src/components/match/MatchScheduleCard.tsx';
const time = '2026-10-04T18:00:00Z';
const hidden = { show: false, canStart: false };
const actionable = { show: true, canStart: true };
const history = { show: true, canStart: false };

function details(overrides = {}) {
    return loadFetcher(detailsPath, 'verificationPresentation', {
        resultVerificationPresentation,
        matchDetails: { requireResultVerification: true, status: 1 },
        currentStatus: 'scheduled', status: 'scheduled', isNoShow: false,
        confirmedTimeIso: undefined, confirmedTime: undefined,
        ...overrides,
    });
}

function schedule(overrides = {}) {
    return loadFetcher(schedulePath, 'verificationPresentation', {
        resultVerificationPresentation,
        requireResultVerification: true, hasResultVerifications: false,
        currentStatus: 'scheduled', matchTimeIso: undefined, matchTime: undefined,
        ...overrides,
    });
}

test('a bracket match without a time hides verification even when its UI status says scheduled', () => {
    // Pending backend matches currently enter the bracket modal with the UI label "scheduled".
    assert.deepEqual(details(), hidden);
    assert.deepEqual(details({ currentStatus: 'ready_phase' }), hidden);
    assert.deepEqual(details({ currentStatus: 'pending_availability' }), hidden);
});

test('verification becomes available when a match time arrives through details or availability', () => {
    assert.deepEqual(details({ matchDetails: {
        requireResultVerification: true, status: 2, scheduledTime: time,
    } }), actionable);
    assert.deepEqual(details({ confirmedTimeIso: time }), actionable);
    assert.deepEqual(details({ confirmedTime: '18:00, 4 Oct' }), actionable);
});

test('clearing a bracket schedule removes verification while the old details are refreshing', () => {
    assert.deepEqual(details({
        currentStatus: 'pending_availability',
        matchDetails: { requireResultVerification: true, status: 2, scheduledTime: time },
    }), hidden);
});

test('Home and My Matches use the same schedule requirement', () => {
    assert.deepEqual(schedule(), hidden);
    assert.deepEqual(schedule({ matchTimeIso: time }), actionable);
    assert.deepEqual(schedule({ currentStatus: 'ready_phase', matchTime: '18:00, 4 Oct' }), actionable);
    assert.deepEqual(schedule({ currentStatus: 'pending_availability', matchTimeIso: time }), hidden);
});

test('existing verification remains readable without a schedule or after the setting is disabled', () => {
    assert.deepEqual(details({ matchDetails: {
        requireResultVerification: true, hasResultVerifications: true, status: 1,
    } }), history);
    assert.deepEqual(details({ matchDetails: {
        requireResultVerification: false, hasResultVerifications: true, scheduledTime: time,
    } }), history);
    assert.deepEqual(schedule({ hasResultVerifications: true }), history);
    assert.deepEqual(schedule({
        hasResultVerifications: true, requireResultVerification: false, matchTimeIso: time,
    }), history);
});

test('completed and no-show matches cannot start verification', () => {
    assert.deepEqual(details({ confirmedTimeIso: time, status: 'completed' }), history);
    assert.deepEqual(details({ matchDetails: {
        requireResultVerification: true, status: 4, scheduledTime: time,
    } }), history);
    assert.deepEqual(details({ confirmedTimeIso: time, isNoShow: true }), history);
    assert.deepEqual(schedule({ currentStatus: 'completed', matchTimeIso: time }), history);
});

test('turning verification off hides empty panels even for scheduled matches', () => {
    assert.deepEqual(details({ confirmedTimeIso: time, matchDetails: { requireResultVerification: false } }), hidden);
    assert.deepEqual(schedule({ matchTimeIso: time, requireResultVerification: false }), hidden);
});

test('both verification overlays close immediately when scheduling eligibility is lost', () => {
    for (const path of [detailsPath, schedulePath]) {
        const visible = canStart => loadJsxProp(path, 'VerifyResultSheet', 'visible', {
            showVerifySheet: true, verificationPresentation: { canStart },
        });
        assert.equal(visible(true), true);
        assert.equal(visible(false), false);
    }
});

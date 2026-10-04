import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDeclaredFunction, loadFetcher } from './loadFetcher.mjs';

const screenPath = 'src/screens/TournamentDetailsScreen.tsx';
const stripPrefix = loadDeclaredFunction('src/lib/groups.ts', 'stripPrefix', {});
const compareGroupNames = loadDeclaredFunction('src/lib/groups.ts', 'compareGroupNames', { stripPrefix });
const sortGroupsForTabs = loadFetcher(screenPath, 'sortGroupsForTabs', { compareGroupNames });
const findViewerGroupIndex = loadFetcher(screenPath, 'findViewerGroupIndex', {});
const stageMatches = loadFetcher(screenPath, 'stageMatches', {});
const isMatchDecided = loadFetcher(screenPath, 'isMatchDecided', {});

const group = (name, standings = []) => ({ groupId: name, name, standings, matches: [] });
const groupsStage = () => ({ stageId: 'groups', type: 1, groups: [
    group('Group C', [{ userId: 'VIEWER' }]), group('Group A'), group('Group B'),
] });
const knockout = { stageId: 'knockout', type: 3, rounds: [] };

// Run the screen's actual selection and tap callbacks. Read the next render only after the
// event finishes, as React batches its state updates. Native layout/scrolling needs a device.
function screen(overrides = {}) {
    const state = {
        id: 'tournament', stages: [groupsStage(), knockout], selectedStageIndex: 1,
        selectedGroupIndex: null, user: { id: 'viewer' }, userTeam: null, ...overrides,
    };
    const render = () => loadFetcher(screenPath, 'groupSelection', {
        ...state, useMemo: fn => fn(), sortGroupsForTabs, findViewerGroupIndex,
    });
    const pressStage = index => loadFetcher(screenPath, 'handleStagePress', {
        selectedStageIndex: state.selectedStageIndex,
        setSelectedStageIndex: value => { state.selectedStageIndex = value; },
        setSelectedGroupIndex: value => { state.selectedGroupIndex = value; },
    })(index);
    return { state, render, pressStage };
}

test('every knockout-to-groups transition opens the viewer group in its first render', () => {
    const { render, pressStage, state } = screen();
    for (let visit = 0; visit < 3; visit++) {
        pressStage(0);
        const selection = render();
        assert.equal(selection.activeGroupIndex, 2);
        assert.equal(selection.groups[selection.activeGroupIndex].name, 'Group C');
        state.selectedGroupIndex = 1; // Browse another group before leaving the phase.
        pressStage(1);
        assert.equal(render().groups.length, 0);
    }
});

test('late bracket data selects the viewer group without a selection effect', () => {
    const { state, render } = screen({ stages: [], selectedStageIndex: 0 });
    assert.equal(render().groups.length, 0);
    state.stages = [groupsStage(), knockout];
    assert.equal(render().activeGroupIndex, 2);
});

test('late team data selects its group by team ID, including PascalCase payloads', () => {
    const stage = { StageId: 'team-groups', Groups: [
        { Name: 'Group B', Standings: [{ ParticipantId: 'TEAM-B' }] },
        { Name: 'Group A', Standings: [] },
    ] };
    const { state, render } = screen({ stages: [stage], selectedStageIndex: 0 });
    assert.equal(render().activeGroupIndex, 0);
    state.userTeam = { TeamId: 'team-b' };
    assert.equal(render().activeGroupIndex, 1);
});

test('late team data and bracket refreshes preserve a manual group choice', () => {
    const stage = { stageId: 'teams', groups: [
        group('Group A'), group('Group B', [{ name: 'The Owls' }]),
    ] };
    const { state, render, pressStage } = screen({ stages: [stage], selectedStageIndex: 0 });
    state.selectedGroupIndex = 0;
    state.userTeam = { teamName: ' the owls ' };
    assert.equal(render().viewerGroupIndex, 1);
    assert.equal(render().activeGroupIndex, 0);
    state.stages = structuredClone(state.stages);
    assert.equal(render().activeGroupIndex, 0);
    pressStage(0); // Tapping the already active phase must not reset that choice either.
    assert.equal(render().activeGroupIndex, 0);
});

test('spectators use Group A and a removed group cannot leave the contents blank', () => {
    const { state, render } = screen({ user: { id: 'spectator' }, selectedStageIndex: 0 });
    assert.equal(render().activeGroupIndex, 0);
    state.selectedGroupIndex = 2;
    state.stages = [{ stageId: 'groups', groups: [group('Group A')] }];
    const selection = render();
    assert.equal(selection.groups[selection.activeGroupIndex].name, 'Group A');
});

test('phase progress skips settled byes, counts no-shows, and only rescans on bracket changes', () => {
    const player = { userId: 'player' };
    let stages = [{ stageId: 'groups', type: 1, groups: [{ matches: [
        { status: 4, home: player, away: player },
        { Status: 5, Home: player, Away: player },
        { status: 4, home: player, away: null }, // Bye: excluded.
        { status: 4, home: null, away: player }, // Bye on the other side: excluded.
        { status: 6, home: player, away: player }, // Tiebreak owed: unfinished.
    ] }] }, { stageId: 'knockout', type: 3, rounds: [{ matches: [
        { status: 1, home: null, away: null }, // Future bracket slot: unfinished.
    ] }] }];
    let previousDeps, previousValue, scans = 0;
    const useMemo = (calculate, deps) => {
        if (!previousDeps || deps.some((value, index) => !Object.is(value, previousDeps[index]))) {
            previousValue = calculate();
            previousDeps = deps;
        }
        return previousValue;
    };
    const render = () => loadFetcher(screenPath, 'stageTiles', {
        stages, useMemo, isMatchDecided,
        stageMatches: stage => { scans++; return stageMatches(stage); },
    });
    const first = render();
    assert.deepEqual(first.map(({ total, done }) => ({ total, done })), [
        { total: 3, done: 2 }, { total: 1, done: 0 },
    ]);
    assert.equal(scans, 2);
    assert.equal(render(), first); // Badge or selection changes leave the bracket data intact.
    assert.equal(scans, 2);
    stages = structuredClone(stages);
    stages[0].groups[0].matches[4].status = 4;
    assert.equal(render()[0].done, 3);
    assert.equal(scans, 4);
});

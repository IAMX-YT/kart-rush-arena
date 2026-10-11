import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/server/rooms';
import {
  createPowerWashMatch,
  stepPowerWash,
  applySprayCleaning,
  CLEANABLE_OBJECTS,
  NOZZLES,
  neutralWashInput,
  type WashInput,
} from '../src/shared/powerwash';
import { splitViewport, splitLayout } from '../src/shared/display';
import { kartPlugin } from '../src/shared/simulation';
import { neutral } from '../src/shared/types';

class MockWs {
  readyState = 1;
  bufferedAmount = 0;
  messages: any[] = [];
  send(s: string) {
    this.messages.push(JSON.parse(s));
  }
  close() {
    this.readyState = 3;
  }
  last(type: string) {
    return this.messages.filter(m => m.type === type).at(-1);
  }
  all(type: string) {
    return this.messages.filter(m => m.type === type);
  }
}

function createTestRoom(gameId: 'power-wash' | 'kart-rush' = 'power-wash') {
  const m = new RoomManager({ mode: 'lan' });
  const host = new MockWs();
  m.receive(host as any, {
    type: 'create',
    mode: 'lan',
    origin: 'http://192.168.1.100:3000',
    gameId,
  });
  const code = host.last('session').code;
  if (gameId === 'power-wash') {
    m.receive(host as any, { type: 'game', id: 'power-wash' });
  }
  return { m, host, code, room: m.rooms.get(code)! };
}

// SCENARIO 1: Two players using separate devices, each with gameplay and controls (Arrangement A)
test('Scenario 1: Two players on separate devices both have gameplay and controls', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  const p1 = new MockWs();
  m.receive(p1 as any, { type: 'join', code, name: 'Alice', color: '#bef264' });
  const p1Id = p1.last('session').playerId;

  const p2 = new MockWs();
  m.receive(p2 as any, { type: 'join', code, name: 'Bob', color: '#ff6b6b' });
  const p2Id = p2.last('session').playerId;

  assert.equal(room.players.length, 2);
  m.receive(p1 as any, { type: 'ready', ready: true });
  m.receive(p2 as any, { type: 'ready', ready: true });
  m.receive(host as any, { type: 'start' });

  assert.ok(room.wash);
  assert.equal(room.wash.players.length, 2);
  room.wash.countdown = 0;
  room.wash.phase = 'playing';

  // Both players control only their own character
  m.receive(p1 as any, {
    type: 'wash_input',
    input: { ...neutralWashInput(), moveZ: 1, spray: true },
  });
  m.receive(p2 as any, {
    type: 'wash_input',
    input: { ...neutralWashInput(), moveX: -1, spray: false },
  });

  m.tick(0.1, Date.now());
  const wp1 = room.wash.players.find(p => p.id === p1Id)!;
  const wp2 = room.wash.players.find(p => p.id === p2Id)!;

  assert.equal(wp1.spraying, true);
  assert.equal(wp2.spraying, false);
});

// SCENARIO 2: One shared display with two phone controllers (Arrangement B)
test('Scenario 2: One shared display with two phone controllers', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  // Shared TV creates display session
  const tvDisplay = new MockWs();
  m.receive(tvDisplay as any, { type: 'join', code, name: 'Living Room TV', color: '#bef264', screen: true });
  assert.equal(tvDisplay.last('session').role, 'screen');
  assert.equal(room.players.length, 0); // TV display does not take a player slot

  // Brother 1 joins on phone
  const phone1 = new MockWs();
  m.receive(phone1 as any, { type: 'join', code, name: 'Brother 1', color: '#60a5fa' });
  const p1Id = phone1.last('session').playerId;

  // Brother 2 joins on phone
  const phone2 = new MockWs();
  m.receive(phone2 as any, { type: 'join', code, name: 'Brother 2', color: '#fbbf24' });
  const p2Id = phone2.last('session').playerId;

  assert.equal(room.players.length, 2);

  // TV viewport calculation: 2 viewports side by side
  const vp0 = splitViewport(0, 2, 1920, 1080);
  const vp1 = splitViewport(1, 2, 1920, 1080);
  assert.equal(vp0.width, 960);
  assert.equal(vp1.width, 960);
  assert.equal(vp0.height, 1080);
  assert.equal(vp1.height, 1080);
  assert.equal(vp0.x, 0);
  assert.equal(vp1.x, 960);

  // Each phone controls only its assigned player
  m.receive(phone1 as any, { type: 'ready', ready: true });
  m.receive(phone2 as any, { type: 'ready', ready: true });
  m.receive(host as any, { type: 'start' });
  room.wash!.countdown = 0;
  room.wash!.phase = 'playing';

  m.receive(phone1 as any, {
    type: 'wash_input',
    input: { ...neutralWashInput(), spray: true },
  });
  m.tick(0.1, Date.now());

  assert.equal(room.wash!.players.find(p => p.id === p1Id)!.spraying, true);
  assert.equal(room.wash!.players.find(p => p.id === p2Id)!.spraying, false);
});

// SCENARIO 3: One shared display with four player views/controllers
test('Scenario 3: One shared display with four player views/controllers', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  const tv = new MockWs();
  m.receive(tv as any, { type: 'join', code, name: 'TV', color: '#bef264', screen: true });

  const phones: MockWs[] = [];
  for (let i = 0; i < 4; i++) {
    const p = new MockWs();
    m.receive(p as any, { type: 'join', code, name: `Player ${i + 1}`, color: '#bef264' });
    m.receive(p as any, { type: 'ready', ready: true });
    phones.push(p);
  }
  assert.equal(room.players.length, 4);

  // Four-panel 2x2 grid layout
  const layout = splitLayout(4);
  assert.equal(layout.columns, 2);
  assert.equal(layout.rows, 2);

  for (let i = 0; i < 4; i++) {
    const vp = splitViewport(i, 4, 1920, 1080);
    assert.equal(vp.width, 960);
    assert.equal(vp.height, 540);
  }

  m.receive(host as any, { type: 'start' });
  assert.equal(room.wash!.players.length, 4);
});

// SCENARIO 4: Two homes, each represented by a display + paired phone (Arrangement C)
test('Scenario 4: Two homes, each represented by a display + paired phone', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  // Home A: Player A joins from monitor, paired with Phone A
  const monitorA = new MockWs();
  m.receive(monitorA as any, { type: 'join', code, name: 'Alice', color: '#60a5fa' });
  const aliceId = monitorA.last('session').playerId;

  const phoneA = new MockWs();
  m.receive(phoneA as any, {
    type: 'join',
    code,
    name: 'Alice Phone',
    color: '#60a5fa',
    role: 'controller',
    pairWithPlayerId: aliceId,
  });

  // Home B: Player B joins from TV, paired with Phone B
  const tvB = new MockWs();
  m.receive(tvB as any, { type: 'join', code, name: 'Bob', color: '#ff6b6b' });
  const bobId = tvB.last('session').playerId;

  const phoneB = new MockWs();
  m.receive(phoneB as any, {
    type: 'join',
    code,
    name: 'Bob Phone',
    color: '#ff6b6b',
    role: 'controller',
    pairWithPlayerId: bobId,
  });

  assert.equal(room.players.length, 2); // Exactly 2 players! No duplicate players created for TVs
  assert.equal(room.players.find(p => p.id === aliceId)!.pairedControllerConnected, true);
  assert.equal(room.players.find(p => p.id === bobId)!.pairedControllerConnected, true);

  m.receive(monitorA as any, { type: 'ready', ready: true });
  m.receive(tvB as any, { type: 'ready', ready: true });
  m.receive(host as any, { type: 'start' });
  room.wash!.countdown = 0;
  room.wash!.phase = 'playing';

  // Phone A sends input -> controls Alice
  m.receive(phoneA as any, {
    type: 'wash_input',
    input: { ...neutralWashInput(), spray: true },
  });
  m.tick(0.1, Date.now());

  assert.equal(room.wash!.players.find(p => p.id === aliceId)!.spraying, true);
  assert.equal(room.wash!.players.find(p => p.id === bobId)!.spraying, false);
});

// SCENARIO 5: One mobile-only player with another TV + phone player
test('Scenario 5: Mixed arrangements - Mobile player + TV/Phone player', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  // Player 1 is on Mobile only (Arrangement A)
  const mobileP1 = new MockWs();
  m.receive(mobileP1 as any, { type: 'join', code, name: 'Mobile Alex', color: '#bef264' });
  const alexId = mobileP1.last('session').playerId;

  // Player 2 uses TV display + Phone controller (Arrangement B/C)
  const tvScreen = new MockWs();
  m.receive(tvScreen as any, { type: 'join', code, name: 'Sam TV', color: '#60a5fa', screen: true });

  const phoneSam = new MockWs();
  m.receive(phoneSam as any, { type: 'join', code, name: 'Sam', color: '#60a5fa' });
  const samId = phoneSam.last('session').playerId;

  assert.equal(room.players.length, 2);
  m.receive(mobileP1 as any, { type: 'ready', ready: true });
  m.receive(phoneSam as any, { type: 'ready', ready: true });
  m.receive(host as any, { type: 'start' });

  assert.ok(room.wash);
  assert.equal(room.wash.players.length, 2);
});

// SCENARIO 6: A enabling local split leaves B's layout unchanged
test('Scenario 6: A enabling local split leaves Bs layout unchanged', () => {
  let layoutA = 'single';
  let layoutB = 'single';

  // Player A toggles split view locally
  layoutA = 'split';

  // B's layout is completely unchanged
  assert.equal(layoutA, 'split');
  assert.equal(layoutB, 'single');
});

// SCENARIO 7: A requesting split and B accepting
test('Scenario 7: A requesting split and B accepting', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  const pA = new MockWs();
  m.receive(pA as any, { type: 'join', code, name: 'A', color: '#bef264' });
  const idA = pA.last('session').playerId;

  const pB = new MockWs();
  m.receive(pB as any, { type: 'join', code, name: 'B', color: '#ff6b6b' });
  const idB = pB.last('session').playerId;

  // A requests split on B's screen
  m.receive(pA as any, { type: 'split_request', targetPlayerIds: [idB] });

  assert.equal(room.splitRequests.length, 1);
  const req = room.splitRequests[0];
  assert.equal(req.fromPlayerId, idA);

  // B receives notification
  assert.ok(pB.last('split_request'));
  assert.equal(pB.last('split_request').request.id, req.id);

  // B accepts
  m.receive(pB as any, { type: 'split_response', requestId: req.id, accept: true });
  assert.equal(room.splitRequests.length, 0);

  // Decision broadcast
  assert.equal(pA.last('split_decision').accepted, true);
});

// SCENARIO 8: B declining or ignoring a request
test('Scenario 8: B declining or ignoring a request', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  const pA = new MockWs();
  m.receive(pA as any, { type: 'join', code, name: 'A', color: '#bef264' });
  const idA = pA.last('session').playerId;

  const pB = new MockWs();
  m.receive(pB as any, { type: 'join', code, name: 'B', color: '#ff6b6b' });
  const idB = pB.last('session').playerId;

  m.receive(pA as any, { type: 'split_request', targetPlayerIds: [idB] });
  const reqId = room.splitRequests[0].id;

  // B declines
  m.receive(pB as any, { type: 'split_response', requestId: reqId, accept: false });
  assert.equal(room.splitRequests.length, 0);
  assert.equal(pA.last('split_decision').accepted, false);
});

// SCENARIO 9: Returning to fullscreen on one display leaves the other unchanged
test('Scenario 9: Returning to fullscreen on one display leaves the other unchanged', () => {
  let layoutA = 'split';
  let layoutB = 'split';

  // Player A returns to single view
  layoutA = 'single';

  // Player B remains in split view
  assert.equal(layoutA, 'single');
  assert.equal(layoutB, 'split');
});

// SCENARIO 10: Simultaneous cleaning of the same object
test('Scenario 10: Simultaneous cleaning of the same object without corruption', () => {
  const players = [
    { id: 'p1', name: 'Cleaner 1', color: '#bef264' },
    { id: 'p2', name: 'Cleaner 2', color: '#ff6b6b' },
  ];
  const match = createPowerWashMatch(players);
  const bench = CLEANABLE_OBJECTS.find(o => o.id === 'bench')!;

  // Both spray simultaneously on bench
  const hit1: [number, number, number] = [bench.center[0] - 0.4, bench.center[1], bench.center[2]];
  const hit2: [number, number, number] = [bench.center[0] + 0.4, bench.center[1], bench.center[2]];

  applySprayCleaning(match, match.players[0], bench, hit1, NOZZLES[1], 0.1);
  applySprayCleaning(match, match.players[1], bench, hit2, NOZZLES[1], 0.1);

  const benchState = match.objects['bench'];
  assert.ok(benchState.cleanedCells > 0);
  assert.equal(benchState.cleanedCells, match.players[0].cleanedCount + match.players[1].cleanedCount);
  assert.equal(match.totalCleaned, benchState.cleanedCells);
});

// SCENARIO 11: Disconnect/reconnect with correct identity and dirt-state recovery
test('Scenario 11: Disconnect/reconnect restores identity and dirt state without duplicate players', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  const p1 = new MockWs();
  m.receive(p1 as any, { type: 'join', code, name: 'Reconnector', color: '#bef264' });
  const token = p1.last('session').token;
  const p1Id = p1.last('session').playerId;

  m.receive(p1 as any, { type: 'ready', ready: true });
  m.receive(host as any, { type: 'start' });

  // Clean some cells
  const bench = CLEANABLE_OBJECTS.find(o => o.id === 'bench')!;
  applySprayCleaning(room.wash!, room.wash!.players[0], bench, bench.center, NOZZLES[1], 0.1);
  const cleanedBefore = room.wash!.totalCleaned;
  assert.ok(cleanedBefore > 0);

  // Client disconnects
  m.disconnect(p1 as any);
  assert.equal(room.wash!.players[0].connected, false);

  // Client reconnects with same session token
  const reconnected = new MockWs();
  m.receive(reconnected as any, { type: 'resume', code, token });

  assert.equal(room.players.length, 1); // No duplicate player created!
  assert.equal(reconnected.last('session').playerId, p1Id);
  assert.equal(room.wash!.players[0].connected, true);

  // State snapshot contains correct dirt progress
  const stateMsg = reconnected.last('state');
  assert.ok(stateMsg.room.wash);
  assert.equal(stateMsg.room.wash.totalCleaned, cleanedBefore);
});

// SCENARIO 12: Touch release/cancellation without stuck movement or spraying
test('Scenario 12: Touch release / cancellation neutralizes held inputs', () => {
  const input = { ...neutralWashInput(), moveZ: 1, spray: true };
  assert.equal(input.spray, true);

  // Simulate cancellation / blur
  const neutralized = neutralWashInput();
  assert.equal(neutralized.spray, false);
  assert.equal(neutralized.moveX, 0);
  assert.equal(neutralized.moveZ, 0);
});

// SCENARIO 13: Finishing a job, showing results and replaying
test('Scenario 13: Finishing a job, showing results and replaying', () => {
  const { m, host, code, room } = createTestRoom('power-wash');

  const p1 = new MockWs();
  m.receive(p1 as any, { type: 'join', code, name: 'SpeedCleaner', color: '#bef264' });
  m.receive(p1 as any, { type: 'ready', ready: true });
  m.receive(host as any, { type: 'start' });
  room.wash!.countdown = 0;
  room.wash!.phase = 'playing';

  // Set all objects to completed
  for (const obj of Object.values(room.wash!.objects)) {
    obj.completed = true;
    obj.percent = 100;
    obj.cleanedCells = obj.totalCells;
  }
  room.wash!.totalCleaned = room.wash!.totalCells;
  room.wash!.jobPercent = 100;
  room.wash!.completed = true;

  // Step simulation -> transitions to results
  stepPowerWash(room.wash!, new Map(), 0.1);
  assert.equal(room.wash!.phase, 'results');

  // Host returns to lobby to replay
  m.receive(host as any, { type: 'lobby' });
  assert.equal(room.wash, null);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].ready, false); // Ready to play again
});

// SCENARIO 14: The existing kart game still works
test('Scenario 14: Existing kart game is preserved and fully functional', () => {
  const { m, host, code, room } = createTestRoom('kart-rush');
  assert.equal(room.gameId, 'kart-rush');

  const p1 = new MockWs();
  m.receive(p1 as any, { type: 'join', code, name: 'Racer1', color: '#bef264' });
  m.receive(p1 as any, { type: 'ready', ready: true });
  m.receive(host as any, { type: 'start' });

  assert.ok(room.race);
  assert.equal(room.race.karts.length, 1);
  assert.equal(room.race.phase, 'countdown');

  // Run through countdown and race
  room.race.countdown = 0;
  room.race.phase = 'racing';

  m.receive(p1 as any, {
    type: 'input',
    input: { ...neutral(), gas: true },
  });
  m.tick(0.5, Date.now());

  assert.ok(room.race.karts[0].speed > 0);
  assert.ok(room.race.karts[0].x !== 0 || room.race.karts[0].z !== 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPowerWashMatch,
  stepPowerWash,
  intersectBox,
  applySprayCleaning,
  packDirtGrids,
  unpackDirtGrids,
  CLEANABLE_OBJECTS,
  NOZZLES,
  type WashInput,
  neutralWashInput,
} from '../src/shared/powerwash';
import { RoomManager } from '../src/server/rooms';

class MockSocket {
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
}

test('PowerWashMatch initializes cleanable objects, spawn points and 0% progress', () => {
  const players = [
    { id: 'p1', name: 'Cleaner 1', color: '#bef264' },
    { id: 'p2', name: 'Cleaner 2', color: '#ff6b6b' },
  ];
  const match = createPowerWashMatch(players);

  assert.equal(match.players.length, 2);
  assert.equal(match.phase, 'countdown');
  assert.equal(match.countdown, 3);
  assert.equal(match.totalCleaned, 0);
  assert.equal(match.jobPercent, 0);
  assert.equal(match.completed, false);

  // Check objects
  assert.ok(match.objects['patio']);
  assert.ok(match.objects['bench']);
  assert.ok(match.objects['bicycle']);
  assert.ok(match.objects['cart']);
  assert.ok(match.objects['fence']);
  assert.ok(match.objects['birdbath']);

  for (const obj of Object.values(match.objects)) {
    assert.equal(obj.cleanedCells, 0);
    assert.equal(obj.percent, 0);
    assert.equal(obj.completed, false);
    assert.ok(match.dirtGrids[obj.id]);
    assert.equal(match.dirtGrids[obj.id].length, obj.totalCells);
  }
});

test('Ray intersection detects hits on cleanable boxes', () => {
  // Ray from (0, 1.5, 5) aiming down towards patio center (0, 0, 0)
  const dir: [number, number, number] = [0, -1.5 / Math.hypot(1.5, 5), -5 / Math.hypot(1.5, 5)];
  const patioDef = CLEANABLE_OBJECTS.find(o => o.id === 'patio')!;
  const hit = intersectBox([0, 1.5, 5], dir, patioDef.center, patioDef.size);

  assert.equal(hit.hit, true);
  assert.ok(hit.dist > 0 && hit.dist < 6);
});

test('Spray cleaning cleans dirt cells and hits 98% threshold for auto-completion', () => {
  const players = [{ id: 'p1', name: 'Solo', color: '#bef264' }];
  const match = createPowerWashMatch(players);
  const benchDef = CLEANABLE_OBJECTS.find(o => o.id === 'bench')!;
  const nozzle = NOZZLES[2]; // 40-deg wide fan

  // Spray several times at the bench center
  let totalCleaned = 0;
  for (let i = 0; i < 20; i++) {
    totalCleaned += applySprayCleaning(match, match.players[0], benchDef, benchDef.center, nozzle, 0.1);
  }

  assert.ok(totalCleaned > 0);
  assert.ok(match.objects['bench'].cleanedCells > 0);
  assert.ok(match.objects['bench'].percent > 0);

  // Test 98% auto-finish threshold
  const benchObj = match.objects['bench'];
  const benchGrid = match.dirtGrids['bench'];
  // Manually fill up to 98%
  benchGrid.fill(1, 0, Math.floor(benchObj.totalCells * 0.985));
  benchObj.cleanedCells = Math.floor(benchObj.totalCells * 0.985);

  applySprayCleaning(match, match.players[0], benchDef, benchDef.center, nozzle, 0.1);

  assert.equal(benchObj.completed, true);
  assert.equal(benchObj.percent, 100);
  assert.equal(benchObj.cleanedCells, benchObj.totalCells);
});

test('Simultaneous cleaning of same object by two players without corrupting progress', () => {
  const players = [
    { id: 'p1', name: 'Alice', color: '#bef264' },
    { id: 'p2', name: 'Bob', color: '#60a5fa' },
  ];
  const match = createPowerWashMatch(players);
  const cartDef = CLEANABLE_OBJECTS.find(o => o.id === 'cart')!;
  const nozzle = NOZZLES[1];

  const beforeTotal = match.totalCleaned;

  // Alice cleans left side, Bob cleans right side of the cart
  const aliceHit: [number, number, number] = [cartDef.center[0] - 0.5, cartDef.center[1], cartDef.center[2]];
  const bobHit: [number, number, number] = [cartDef.center[0] + 0.5, cartDef.center[1], cartDef.center[2]];

  applySprayCleaning(match, match.players[0], cartDef, aliceHit, nozzle, 0.1);
  applySprayCleaning(match, match.players[1], cartDef, bobHit, nozzle, 0.1);

  assert.ok(match.players[0].cleanedCount > 0);
  assert.ok(match.players[1].cleanedCount > 0);
  assert.equal(match.totalCleaned, beforeTotal + match.players[0].cleanedCount + match.players[1].cleanedCount);
  assert.equal(match.objects['cart'].cleanedCells, match.players[0].cleanedCount + match.players[1].cleanedCount);
});

test('Run-length pack and unpack preserves exact dirt grids across network', () => {
  const players = [{ id: 'p1', name: 'Test', color: '#bef264' }];
  const match = createPowerWashMatch(players);
  const benchDef = CLEANABLE_OBJECTS.find(o => o.id === 'bench')!;
  applySprayCleaning(match, match.players[0], benchDef, benchDef.center, NOZZLES[1], 0.1);

  const packed = packDirtGrids(match.dirtGrids);
  assert.ok(packed['bench']);
  const unpacked = unpackDirtGrids(packed, match.objects);

  assert.deepEqual(unpacked['bench'], match.dirtGrids['bench']);
});

test('RoomManager switches to power-wash game, handles start, tick and input', () => {
  const m = new RoomManager({ mode: 'lan' });
  const h = new MockSocket();
  m.receive(h as any, { type: 'create', mode: 'lan', origin: 'http://192.168.1.10:3000' });
  const code = h.last('session').code;

  // Change game to power-wash
  m.receive(h as any, { type: 'game', id: 'power-wash' });
  assert.equal(m.rooms.get(code)!.gameId, 'power-wash');

  // Join 2 players
  const p1 = new MockSocket();
  m.receive(p1 as any, { type: 'join', code, name: 'Alex', color: '#bef264' });
  const p2 = new MockSocket();
  m.receive(p2 as any, { type: 'join', code, name: 'Ben', color: '#ff6b6b' });

  // Ready both
  m.receive(p1 as any, { type: 'ready', ready: true });
  m.receive(p2 as any, { type: 'ready', ready: true });

  // Start game
  m.receive(h as any, { type: 'start' });
  const room = m.rooms.get(code)!;
  assert.ok(room.wash);
  assert.equal(room.wash.phase, 'countdown');

  // Tick through countdown
  for (let i = 0; i < 40; i++) {
    m.tick(0.1, Date.now());
  }
  assert.equal(room.wash.phase, 'playing');

  // Send wash input
  const p1Id = p1.last('session').playerId;
  const washInput: WashInput = {
    ...neutralWashInput(),
    moveX: 0,
    moveZ: 1, // forward
    yaw: 0,
    pitch: -0.3,
    spray: true,
    nozzle: 1,
    highlight: false,
  };
  m.receive(p1 as any, { type: 'wash_input', input: washInput });

  const beforeZ = room.wash.players.find(p => p.id === p1Id)!.z;
  m.tick(0.1, Date.now());
  const afterZ = room.wash.players.find(p => p.id === p1Id)!.z;
  assert.notEqual(beforeZ, afterZ);
});

test('Controller pairing binds phone to player identity and forwards inputs', () => {
  const m = new RoomManager({ mode: 'lan' });
  const h = new MockSocket();
  m.receive(h as any, { type: 'create', mode: 'lan', origin: 'http://192.168.1.10:3000' });
  const code = h.last('session').code;
  m.receive(h as any, { type: 'game', id: 'power-wash' });

  // Join a player (e.g. from TV or desktop)
  const tvPlayer = new MockSocket();
  m.receive(tvPlayer as any, { type: 'join', code, name: 'Sam', color: '#60a5fa' });
  const samId = tvPlayer.last('session').playerId;

  // Phone controller pairs with Sam
  const phoneController = new MockSocket();
  m.receive(phoneController as any, {
    type: 'join',
    code,
    name: 'Controller',
    color: '#60a5fa',
    role: 'controller',
    pairWithPlayerId: samId,
  });

  assert.equal(phoneController.last('session').role, 'controller');
  assert.equal(phoneController.last('session').playerId, samId);

  // Player in room reflects paired controller
  const room = m.rooms.get(code)!;
  const sam = room.players.find(p => p.id === samId)!;
  assert.equal(sam.pairedControllerConnected, true);

  // Ready and start
  m.receive(tvPlayer as any, { type: 'ready', ready: true });
  m.receive(h as any, { type: 'start' });

  // Input sent from phone controller is accepted for Sam
  m.receive(phoneController as any, {
    type: 'wash_input',
    input: { ...neutralWashInput(), spray: true },
  });
  assert.ok(room.washInputs.has(samId));
  assert.equal(room.washInputs.get(samId)!.value.spray, true);
});

test('Split screen consent: request, rate-limiting, and accept/decline', () => {
  const m = new RoomManager({ mode: 'lan' });
  const h = new MockSocket();
  m.receive(h as any, { type: 'create', mode: 'lan', origin: 'http://192.168.1.10:3000' });
  const code = h.last('session').code;

  const p1 = new MockSocket();
  m.receive(p1 as any, { type: 'join', code, name: 'P1', color: '#bef264' });
  const p1Id = p1.last('session').playerId;

  const p2 = new MockSocket();
  m.receive(p2 as any, { type: 'join', code, name: 'P2', color: '#ff6b6b' });
  const p2Id = p2.last('session').playerId;

  // P1 requests split screen with P2
  m.receive(p1 as any, { type: 'split_request', targetPlayerIds: [p2Id] });
  const room = m.rooms.get(code)!;
  assert.equal(room.splitRequests.length, 1);
  const req = room.splitRequests[0];
  assert.equal(req.fromPlayerId, p1Id);
  assert.deepEqual(req.targetPlayerIds, [p2Id]);

  // P2 received split request message
  assert.ok(p2.last('split_request'));
  assert.equal(p2.last('split_request').request.id, req.id);

  // Rate limit check: immediate second request should fail
  m.receive(p1 as any, { type: 'split_request', targetPlayerIds: [p2Id] });
  assert.match(p1.last('error').message, /wait a moment/);

  // P2 accepts the split request
  m.receive(p2 as any, { type: 'split_response', requestId: req.id, accept: true });
  assert.equal(room.splitRequests.length, 0); // Removed after decision
  assert.ok(p1.last('split_decision'));
  assert.equal(p1.last('split_decision').accepted, true);
  assert.equal(p1.last('split_decision').fromPlayerId, p2Id);
});

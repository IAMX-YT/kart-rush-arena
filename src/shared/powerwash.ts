// Power Wash Simulator 2 - Authoritative simulation and dirt state tracking
export interface CleanableDef {
  id: string;
  name: string;
  gridX: number;
  gridY: number;
  center: [number, number, number];
  size: [number, number, number];
}

export const CLEANABLE_OBJECTS: CleanableDef[] = [
  {id:'car',name:'Classic Roadster',gridX:40,gridY:24,center:[0,1,-1],size:[4.4,2,2.2]},
  { id: 'patio', name: 'Courtyard Patio', gridX: 32, gridY: 32, center: [0, 0, 0], size: [16, 0.2, 16] },
  { id: 'bench', name: 'Garden Bench', gridX: 16, gridY: 16, center: [3.5, 0.6, -3], size: [2.4, 1.2, 1.2] },
  { id: 'bicycle', name: 'Vintage Bicycle', gridX: 16, gridY: 16, center: [-3.8, 0.8, -2], size: [2.0, 1.4, 0.8] },
  { id: 'cart', name: 'Garden Cart', gridX: 20, gridY: 20, center: [4.2, 0.7, 3.2], size: [2.2, 1.1, 1.4] },
  { id: 'fence', name: 'Picket Fence', gridX: 32, gridY: 12, center: [0, 1.0, -7.5], size: [15, 2.0, 0.4] },
  { id: 'birdbath', name: 'Stone Birdbath', gridX: 16, gridY: 16, center: [-3.2, 0.9, 3.5], size: [1.4, 1.8, 1.4] },
];

export interface NozzleDef {
  id: number;
  name: string;
  angleDeg: number;
  radius: number;     // Hit radius on surface in meters
  power: number;      // Cleaning power per second
  range: number;      // Max effective distance
  color: string;
}

export const NOZZLES: NozzleDef[] = [
  { id: 0, name: '0° Pinpoint', angleDeg: 0, radius: 0.16, power: 1.0, range: 7.0, color: '#ef4444' },
  { id: 1, name: '15° Narrow Fan', angleDeg: 15, radius: 0.38, power: 0.85, range: 6.0, color: '#eab308' },
  { id: 2, name: '40° Wide Fan', angleDeg: 40, radius: 0.75, power: 0.65, range: 5.0, color: '#22c55e' },
  { id: 3, name: 'Turbo Soap', angleDeg: 55, radius: 1.10, power: 0.50, range: 4.5, color: '#38bdf8' },
];

export interface WashPlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  spraying: boolean;
  nozzle: number;
  highlight: boolean;
  cleanedCount: number; // number of cells this player cleaned
  connected: boolean;
  disconnectedAt?: number;
}

export interface WashObjectState {
  id: string;
  name: string;
  totalCells: number;
  cleanedCells: number;
  percent: number;      // 0 - 100
  completed: boolean;   // true when percent >= 98%
}

export interface PowerWashMatch {
  phase: 'countdown' | 'playing' | 'paused' | 'results';
  time: number;
  countdown: number;
  players: WashPlayerState[];
  objects: Record<string, WashObjectState>;
  // Dirt grids stored as Uint8Array (0 = dirty, 1 = cleaned)
  // For serialization, sent as packed runs or byte arrays
  dirtGrids: Record<string, Uint8Array>;
  totalCells: number;
  totalCleaned: number;
  jobPercent: number;
  completed: boolean;
  lastCleanedObjectId?: string;
  pausedFrom?: 'countdown' | 'playing';
}

export interface WashInput {
  moveX: number;       // -1 (left) to 1 (right)
  moveZ: number;       // -1 (backward) to 1 (forward)
  yaw: number;         // camera yaw in radians
  pitch: number;       // camera pitch in radians
  spray: boolean;      // spraying water
  nozzle: number;      // nozzle index (0-3)
  highlight: boolean;  // dirt sonar active
}

export const neutralWashInput = (): WashInput => ({
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  spray: false,
  nozzle: 1, // 15-deg default
  highlight: false,
});

// Helper to create a new match
export function createPowerWashMatch(players: { id: string; name: string; color: string }[]): PowerWashMatch {
  const objects: Record<string, WashObjectState> = {};
  const dirtGrids: Record<string, Uint8Array> = {};
  let totalCells = 0;

  for (const obj of CLEANABLE_OBJECTS) {
    const count = obj.gridX * obj.gridY;
    totalCells += count;
    objects[obj.id] = {
      id: obj.id,
      name: obj.name,
      totalCells: count,
      cleanedCells: 0,
      percent: 0,
      completed: false,
    };
    dirtGrids[obj.id] = new Uint8Array(count); // all 0 = dirty
  }

  // Spawn points around the patio
  const spawnPoints = [
    { x: 3.6, z: 4.5, yaw: Math.atan2(3.6,5.5) },
    { x: -2.5, z: 4.0, yaw: -0.15 },
    { x: 2.5, z: 4.0, yaw: 0.15 },
    { x: 0, z: -4.5, yaw: Math.PI },
  ];

  const washPlayers: WashPlayerState[] = players.map((p, i) => {
    const sp = spawnPoints[i % spawnPoints.length];
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      x: sp.x,
      y: 1.6, // eye height
      z: sp.z,
      yaw: sp.yaw,
      pitch: -0.15,
      spraying: false,
      nozzle: 1,
      highlight: false,
      cleanedCount: 0,
      connected: true,
    };
  });

  return {
    phase: 'countdown',
    time: 0,
    countdown: 3,
    players: washPlayers,
    objects,
    dirtGrids,
    totalCells,
    totalCleaned: 0,
    jobPercent: 0,
    completed: false,
  };
}

// Ray-box intersection to check if a spray line hits an object
export function intersectBox(
  origin: [number, number, number],
  dir: [number, number, number],
  boxCenter: [number, number, number],
  boxSize: [number, number, number]
): { hit: boolean; dist: number; point: [number, number, number]; normal: [number, number, number] } {
  const minX = boxCenter[0] - boxSize[0] / 2;
  const maxX = boxCenter[0] + boxSize[0] / 2;
  const minY = boxCenter[1] - boxSize[1] / 2;
  const maxY = boxCenter[1] + boxSize[1] / 2;
  const minZ = boxCenter[2] - boxSize[2] / 2;
  const maxZ = boxCenter[2] + boxSize[2] / 2;

  const invDx = dir[0] !== 0 ? 1 / dir[0] : 1e9;
  const invDy = dir[1] !== 0 ? 1 / dir[1] : 1e9;
  const invDz = dir[2] !== 0 ? 1 / dir[2] : 1e9;

  const t1 = (minX - origin[0]) * invDx;
  const t2 = (maxX - origin[0]) * invDx;
  const t3 = (minY - origin[1]) * invDy;
  const t4 = (maxY - origin[1]) * invDy;
  const t5 = (minZ - origin[2]) * invDz;
  const t6 = (maxZ - origin[2]) * invDz;

  const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
  const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

  if (tmax < 0 || tmin > tmax) {
    return { hit: false, dist: Infinity, point: [0, 0, 0], normal: [0, 1, 0] };
  }

  const dist = tmin > 0 ? tmin : tmax;
  const hitPoint: [number, number, number] = [
    origin[0] + dir[0] * dist,
    origin[1] + dir[1] * dist,
    origin[2] + dir[2] * dist,
  ];

  // Determine hit normal
  let normal: [number, number, number] = [0, 1, 0];
  const eps = 0.05;
  if (Math.abs(hitPoint[1] - maxY) < eps) normal = [0, 1, 0];
  else if (Math.abs(hitPoint[1] - minY) < eps) normal = [0, -1, 0];
  else if (Math.abs(hitPoint[0] - maxX) < eps) normal = [1, 0, 0];
  else if (Math.abs(hitPoint[0] - minX) < eps) normal = [-1, 0, 0];
  else if (Math.abs(hitPoint[2] - maxZ) < eps) normal = [0, 0, 1];
  else if (Math.abs(hitPoint[2] - minZ) < eps) normal = [0, 0, -1];

  return { hit: true, dist, point: hitPoint, normal };
}

// Clean cells on an object hit by spray
export function applySprayCleaning(
  match: PowerWashMatch,
  player: WashPlayerState,
  objDef: CleanableDef,
  hitPoint: [number, number, number],
  nozzle: NozzleDef,
  dt: number
): number {
  const grid = match.dirtGrids[objDef.id];
  const objState = match.objects[objDef.id];
  if (!grid || !objState || objState.completed) return 0;

  // Map 3D hit point on box to 2D normalized UV [0..1, 0..1]
  // For patio and horizontal surfaces, map X and Z
  let u = 0.5, v = 0.5;
  if (objDef.id === 'patio') {
    u = (hitPoint[0] - (objDef.center[0] - objDef.size[0] / 2)) / objDef.size[0];
    v = (hitPoint[2] - (objDef.center[2] - objDef.size[2] / 2)) / objDef.size[2];
  } else if (objDef.id === 'fence') {
    u = (hitPoint[0] - (objDef.center[0] - objDef.size[0] / 2)) / objDef.size[0];
    v = (hitPoint[1] - (objDef.center[1] - objDef.size[1] / 2)) / objDef.size[1];
  } else {
    // Other 3D items: map based on dominant extents
    const dx = (hitPoint[0] - objDef.center[0]) / (objDef.size[0] || 1);
    const dz = (hitPoint[2] - objDef.center[2]) / (objDef.size[2] || 1);
    u = Math.max(0, Math.min(1, dx + 0.5));
    v = Math.max(0, Math.min(1, (hitPoint[1] - (objDef.center[1] - objDef.size[1] / 2)) / objDef.size[1]));
  }

  u = Math.max(0, Math.min(1, u));
  v = Math.max(0, Math.min(1, v));

  const centerCol = Math.floor(u * objDef.gridX);
  const centerRow = Math.floor(v * objDef.gridY);

  // Radius in cells
  const cellRadiusX = Math.max(1, Math.round((nozzle.radius / objDef.size[0]) * objDef.gridX));
  const cellRadiusY = Math.max(1, Math.round((nozzle.radius / (objDef.size[2] || objDef.size[1])) * objDef.gridY));
  const maxRadius = Math.max(cellRadiusX, cellRadiusY);

  let newlyCleaned = 0;
  for (let r = -maxRadius; r <= maxRadius; r++) {
    const row = centerRow + r;
    if (row < 0 || row >= objDef.gridY) continue;
    for (let c = -maxRadius; c <= maxRadius; c++) {
      const col = centerCol + c;
      if (col < 0 || col >= objDef.gridX) continue;

      const normDist = (c * c) / (cellRadiusX * cellRadiusX) + (r * r) / (cellRadiusY * cellRadiusY);
      if (normDist <= 1.0) {
        const idx = row * objDef.gridX + col;
        if (grid[idx] === 0) {
          grid[idx] = 1; // Mark cleaned
          newlyCleaned++;
        }
      }
    }
  }

  const rawPercent = (objState.cleanedCells / objState.totalCells) * 100;
  if (rawPercent >= 98.0) {
    const remaining = objState.totalCells - objState.cleanedCells;
    if (remaining > 0) {
      grid.fill(1);
      objState.cleanedCells = objState.totalCells;
      match.totalCleaned += remaining;
      player.cleanedCount += remaining;
    }
    objState.percent = 100;
    objState.completed = true;
    match.lastCleanedObjectId = objDef.id;
    match.jobPercent = Math.min(100, Math.floor((match.totalCleaned / match.totalCells) * 100));
    if (Object.values(match.objects).every(o => o.completed) || match.jobPercent >= 98) {
      match.completed = true;
      match.jobPercent = 100;
      match.phase = 'results';
    }
    return newlyCleaned;
  }

  if (newlyCleaned > 0) {
    objState.cleanedCells += newlyCleaned;
    player.cleanedCount += newlyCleaned;
    match.totalCleaned += newlyCleaned;

    const updatedPercent = (objState.cleanedCells / objState.totalCells) * 100;
    if (updatedPercent >= 98.0) {
      const remaining = objState.totalCells - objState.cleanedCells;
      if (remaining > 0) {
        grid.fill(1);
        objState.cleanedCells = objState.totalCells;
        match.totalCleaned += remaining;
        player.cleanedCount += remaining;
      }
      objState.percent = 100;
      objState.completed = true;
      match.lastCleanedObjectId = objDef.id;
    } else {
      objState.percent = Math.floor(updatedPercent);
    }

    match.jobPercent = Math.min(100, Math.floor((match.totalCleaned / match.totalCells) * 100));
    if (Object.values(match.objects).every(o => o.completed) || match.jobPercent >= 98) {
      match.completed = true;
      match.jobPercent = 100;
      match.phase = 'results';
    }
  }

  return newlyCleaned;
}

// Authoritative simulation update tick (runs on server and reconciled on client)
export function stepPowerWash(
  match: PowerWashMatch,
  inputs: Map<string, WashInput>,
  dt: number
) {
  if (match.phase === 'results' || match.phase === 'paused') return;

  if (match.phase === 'countdown') {
    match.countdown = Math.max(0, match.countdown - dt);
    if (match.countdown <= 0) match.phase = 'playing';
    return;
  }

  match.time += dt;

  for (const player of match.players) {
    if (!player.connected) continue;
    const input = inputs.get(player.id) || {...neutralWashInput(),yaw:player.yaw,pitch:player.pitch,nozzle:player.nozzle};

    // Update orientation
    player.yaw = input.yaw;
    player.pitch = Math.max(-1.4, Math.min(1.4, input.pitch));
    player.nozzle = Math.max(0, Math.min(3, Math.floor(input.nozzle)));
    player.spraying = Boolean(input.spray);
    player.highlight = Boolean(input.highlight);

    // Update position with movement vector
    const speed = 4.2; // meters per second
    const moveX = Math.max(-1, Math.min(1, input.moveX));
    const moveZ = Math.max(-1, Math.min(1, input.moveZ));

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.hypot(moveX, moveZ);
      const nx = moveX / (len || 1);
      const nz = moveZ / (len || 1);

      // Camera forward and right relative to yaw
      const forwardX = -Math.sin(player.yaw);
      const forwardZ = -Math.cos(player.yaw);
      const rightX = Math.cos(player.yaw);
      const rightZ = -Math.sin(player.yaw);

      const vx = (rightX * nx + forwardX * nz) * speed;
      const vz = (rightZ * nx + forwardZ * nz) * speed;

      player.x += vx * dt;
      player.z += vz * dt;

      // Constrain inside courtyard boundary
      player.x = Math.max(-7.2, Math.min(7.2, player.x));
      player.z = Math.max(-7.2, Math.min(7.2, player.z));
    }

    // Process water spray if active
    if (player.spraying) {
      const nozzle = NOZZLES[player.nozzle] || NOZZLES[1];

      // Spray origin: camera / nozzle position
      const origin: [number, number, number] = [player.x, player.y, player.z];
      // Spray direction vector
      const cosPitch = Math.cos(player.pitch);
      const dir: [number, number, number] = [
        -Math.sin(player.yaw) * cosPitch,
        Math.sin(player.pitch),
        -Math.cos(player.yaw) * cosPitch,
      ];

      // Find closest intersecting cleanable object
      let closestHit: {
        objDef: CleanableDef;
        dist: number;
        point: [number, number, number];
      } | null = null;

      for (const objDef of CLEANABLE_OBJECTS) {
        const hit = intersectBox(origin, dir, objDef.center, objDef.size);
        if (hit.hit && hit.dist <= nozzle.range) {
          if (!closestHit || hit.dist < closestHit.dist) {
            closestHit = { objDef, dist: hit.dist, point: hit.point };
          }
        }
      }

      if (closestHit) {
        applySprayCleaning(match, player, closestHit.objDef, closestHit.point, nozzle, dt);
      }
    }
  }

  // Check if job completed
  if (match.completed || Object.values(match.objects).every(o => o.completed) || match.jobPercent >= 98) {
    match.completed = true;
    match.jobPercent = 100;
    match.phase = 'results';
  }

  // Auto-finish match after 15 minutes max
  if (match.time >= 900) {
    match.phase = 'results';
  }
}

// Compact serialization for network transport
export function packDirtGrids(dirtGrids: Record<string, Uint8Array>): Record<string, number[]> {
  // Simple run-length encoding: alternating counts of 0s and 1s
  const packed: Record<string, number[]> = {};
  for (const [id, grid] of Object.entries(dirtGrids)) {
    const runs: number[] = [];
    let currentVal = 0;
    let count = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === currentVal) {
        count++;
      } else {
        runs.push(count);
        currentVal = grid[i];
        count = 1;
      }
    }
    runs.push(count);
    packed[id] = runs;
  }
  return packed;
}

export function unpackDirtGrids(packed: Record<string, number[]>, objects: Record<string, WashObjectState>): Record<string, Uint8Array> {
  const dirtGrids: Record<string, Uint8Array> = {};
  for (const [id, runs] of Object.entries(packed)) {
    const total = objects[id]?.totalCells || 1024;
    const grid = new Uint8Array(total);
    let offset = 0;
    let val = 0;
    for (const count of runs) {
      if (val === 1) {
        grid.fill(1, offset, Math.min(total, offset + count));
      }
      offset += count;
      val = val === 0 ? 1 : 0;
    }
    dirtGrids[id] = grid;
  }
  return dirtGrids;
}

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { splitLayout, splitViewport } from '../shared/display';
import {
  CLEANABLE_OBJECTS,
  NOZZLES,
  unpackDirtGrids,
  type PowerWashMatch,
  type WashPlayerState,
} from '../shared/powerwash';
import { type RoomState } from '../shared/types';

interface WashSceneProps {
  room: RoomState;
  follow?: string;
  split?: boolean;
  quality?: string;
  onTargetObjectChange?: (objectName: string, percent: number) => void;
  localSprayState?: { spraying: boolean; nozzle: number };
}

// Procedural textures for clean materials
function createFlagstoneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Warm sandstone flagstones
  ctx.fillStyle = '#d8cbbe';
  ctx.fillRect(0, 0, 512, 512);

  // Stone tiles
  const tileSize = 64;
  for (let y = 0; y < 512; y += tileSize) {
    for (let x = 0; x < 512; x += tileSize) {
      const shade = 210 + Math.floor(Math.sin(x * 12.3 + y * 7.7) * 25);
      ctx.fillStyle = `rgb(${shade}, ${shade - 12}, ${shade - 25})`;
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

      // Fine stone grain
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      for (let k = 0; k < 12; k++) {
        ctx.fillRect(x + (k * 17) % tileSize, y + (k * 23) % tileSize, 3, 3);
      }
    }
  }

  // Mortar lines
  ctx.strokeStyle = '#a39487';
  ctx.lineWidth = 3;
  for (let x = 0; x <= 512; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y <= 512; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

// Procedural dirt canvas for cleanable objects
class DirtSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  gridX: number;
  gridY: number;

  constructor(gridX: number, gridY: number, baseDirtColor = '#3e2e1e') {
    this.gridX = gridX;
    this.gridY = gridY;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(128, gridX * 8);
    this.canvas.height = Math.max(128, gridY * 8);
    this.ctx = this.canvas.getContext('2d')!;

    // Initial full dirt layer (mud/grime/moss)
    this.ctx.fillStyle = baseDirtColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Textured grime variations
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * this.canvas.width;
      const y = Math.random() * this.canvas.height;
      const r = Math.random() * 12 + 4;
      this.ctx.fillStyle = i % 3 === 0 ? 'rgba(38, 55, 24, 0.65)' : 'rgba(25, 18, 12, 0.7)'; // Moss and dark grease
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.needsUpdate = true;
  }

  updateFromGrid(grid: Uint8Array, highlight = false) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cellW = w / this.gridX;
    const cellH = h / this.gridY;

    this.ctx.clearRect(0, 0, w, h);

    for (let r = 0; r < this.gridY; r++) {
      for (let c = 0; c < this.gridX; c++) {
        const idx = r * this.gridX + c;
        if (grid[idx] === 0) {
          // Still dirty!
          if (highlight) {
            // Sonar pulse glowing orange / yellow highlight
            this.ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
          } else {
            // Natural grime
            this.ctx.fillStyle = (r + c) % 2 === 0 ? '#423223' : '#332417';
          }
          this.ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

// 3D Model Builders for Garden Objects
function buildPatioMesh(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  const flagTex = createFlagstoneTexture();

  // Clean stone base
  const cleanMat = new THREE.MeshStandardMaterial({
    map: flagTex,
    roughness: 0.75,
    metalness: 0.05,
  });
  const cleanFloor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 16), cleanMat);
  cleanFloor.position.y = -0.1;
  cleanFloor.receiveShadow = true;
  group.add(cleanFloor);

  // Dirt decal overlay plane
  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirtTex,
    transparent: true,
    opacity: 0.94,
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const dirtPlane = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), dirtMat);
  dirtPlane.rotation.x = -Math.PI / 2;
  dirtPlane.position.y = 0.005;
  dirtPlane.receiveShadow = true;
  group.add(dirtPlane);

  return group;
}

function buildBenchMesh(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(3.5, 0, -3);

  const cleanWood = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.6 });
  const cleanIron = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.8 });

  // Cast iron legs
  const legGeo = new THREE.BoxGeometry(0.12, 0.8, 1.1);
  const legL = new THREE.Mesh(legGeo, cleanIron);
  legL.position.set(-1.0, 0.4, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, cleanIron);
  legR.position.set(1.0, 0.4, 0);
  legR.castShadow = true;
  group.add(legL, legR);

  // Wooden slats (seat)
  for (let i = -2; i <= 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.16), cleanWood);
    slat.position.set(0, 0.65, i * 0.2);
    slat.castShadow = true;
    group.add(slat);
  }

  // Wooden slats (backrest)
  for (let i = 0; i < 3; i++) {
    const backSlat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 0.05), cleanWood);
    backSlat.position.set(0, 0.9 + i * 0.18, -0.5);
    backSlat.castShadow = true;
    group.add(backSlat);
  }

  // Dirt overlay box wrapping the bench
  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirtTex,
    transparent: true,
    opacity: 0.92,
    roughness: 0.9,
  });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.2), dirtMat);
  dirtBox.position.set(0, 0.6, 0);
  group.add(dirtBox);

  return group;
}

function buildBicycleMesh(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(-3.8, 0, -2);
  group.rotation.y = Math.PI * 0.35;

  const bikeRed = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.3, metalness: 0.5 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.2, metalness: 0.9 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.9 });

  // Wheels
  const wheelGeo = new THREE.TorusGeometry(0.45, 0.05, 12, 24);
  const fWheel = new THREE.Mesh(wheelGeo, rubber);
  fWheel.position.set(0.7, 0.45, 0);
  fWheel.rotation.y = Math.PI / 2;
  fWheel.castShadow = true;

  const rWheel = new THREE.Mesh(wheelGeo, rubber);
  rWheel.position.set(-0.7, 0.45, 0);
  rWheel.rotation.y = Math.PI / 2;
  rWheel.castShadow = true;
  group.add(fWheel, rWheel);

  // Diamond Frame tubes
  const tubeGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.85);
  const topTube = new THREE.Mesh(tubeGeo, bikeRed);
  topTube.position.set(0, 0.72, 0);
  topTube.rotation.z = Math.PI / 2;
  topTube.castShadow = true;

  const downTube = new THREE.Mesh(tubeGeo, bikeRed);
  downTube.position.set(0.2, 0.55, 0);
  downTube.rotation.z = -Math.PI / 3.8;
  downTube.castShadow = true;

  const seatTube = new THREE.Mesh(tubeGeo, bikeRed);
  seatTube.position.set(-0.25, 0.6, 0);
  seatTube.rotation.z = Math.PI / 10;
  seatTube.castShadow = true;

  group.add(topTube, downTube, seatTube);

  // Handlebars & Seat
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), chrome);
  bar.position.set(0.65, 0.95, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.18), rubber);
  seat.position.set(-0.3, 0.88, 0);
  group.add(bar, seat);

  // Dirt wrapping volume
  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirtTex,
    transparent: true,
    opacity: 0.9,
    roughness: 0.9,
  });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.8), dirtMat);
  dirtBox.position.set(0, 0.8, 0);
  group.add(dirtBox);

  return group;
}

function buildCartMesh(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(4.2, 0, 3.2);
  group.rotation.y = -Math.PI * 0.2;

  const woodMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.8 });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5, metalness: 0.6 });

  // Cart box / trough
  const trough = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.0), woodMat);
  trough.position.set(0, 0.6, 0);
  trough.castShadow = true;
  group.add(trough);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16);
  const wL = new THREE.Mesh(wheelGeo, metalMat);
  wL.rotation.z = Math.PI / 2;
  wL.position.set(0, 0.35, 0.6);
  wL.castShadow = true;
  const wR = new THREE.Mesh(wheelGeo, metalMat);
  wR.rotation.z = Math.PI / 2;
  wR.position.set(0, 0.35, -0.6);
  wR.castShadow = true;
  group.add(wL, wR);

  // Handlebars
  const handleGeo = new THREE.BoxGeometry(1.2, 0.08, 0.08);
  const handleL = new THREE.Mesh(handleGeo, woodMat);
  handleL.position.set(1.1, 0.75, 0.35);
  handleL.rotation.z = -0.3;
  const handleR = new THREE.Mesh(handleGeo, woodMat);
  handleR.position.set(1.1, 0.75, -0.35);
  handleR.rotation.z = -0.3;
  group.add(handleL, handleR);

  // Dirt wrap
  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirtTex,
    transparent: true,
    opacity: 0.92,
    roughness: 0.9,
  });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.4), dirtMat);
  dirtBox.position.set(0, 0.7, 0);
  group.add(dirtBox);

  return group;
}

function buildFenceMesh(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0, -7.5);

  const whiteWood = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 });

  // Horizontal rails
  const railGeo = new THREE.BoxGeometry(15, 0.1, 0.08);
  const topRail = new THREE.Mesh(railGeo, whiteWood);
  topRail.position.set(0, 1.5, 0);
  const botRail = new THREE.Mesh(railGeo, whiteWood);
  botRail.position.set(0, 0.5, 0);
  group.add(topRail, botRail);

  // Vertical pickets
  const picketGeo = new THREE.BoxGeometry(0.2, 1.8, 0.06);
  for (let x = -7.2; x <= 7.2; x += 0.5) {
    const picket = new THREE.Mesh(picketGeo, whiteWood);
    picket.position.set(x, 0.9, 0);
    picket.castShadow = true;
    group.add(picket);
  }

  // Dirt overlay
  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirtTex,
    transparent: true,
    opacity: 0.92,
    roughness: 0.9,
  });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(15, 2.0, 0.4), dirtMat);
  dirtBox.position.set(0, 1.0, 0);
  group.add(dirtBox);

  return group;
}

function buildBirdbathMesh(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(-3.2, 0, 3.5);

  const cleanStone = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.65 });

  // Pedestal base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.2, 16), cleanStone);
  base.position.y = 0.1;
  base.castShadow = true;

  // Pillar
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.0, 16), cleanStone);
  pillar.position.y = 0.7;
  pillar.castShadow = true;

  // Basin
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.45, 0.35, 16), cleanStone);
  basin.position.y = 1.35;
  basin.castShadow = true;

  // Water inside basin
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.65, 16),
    new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.1, metalness: 0.3 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 1.5;

  group.add(base, pillar, basin, water);

  // Dirt overlay
  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirtTex,
    transparent: true,
    opacity: 0.92,
    roughness: 0.9,
  });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), dirtMat);
  dirtBox.position.set(0, 0.9, 0);
  group.add(dirtBox);

  return group;
}

// 3D Player washer character model
function buildWasherCharacter(color: string): THREE.Group {
  const group = new THREE.Group();
  const suitMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const yellowHat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.4 });
  const blackBoots = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.8 });
  const wandMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.3, metalness: 0.7 });

  // Body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.8, 8), suitMat);
  body.position.y = 0.9;
  body.castShadow = true;

  // Head with helmet
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffedd5' }));
  head.position.y = 1.45;
  const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.14, 12), yellowHat);
  helmet.position.y = 1.55;

  // Legs & boots
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), blackBoots);
  legL.position.set(-0.12, 0.25, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), blackBoots);
  legR.position.set(0.12, 0.25, 0);

  // Pressure washer wand
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9), wandMat);
  wand.rotation.x = Math.PI / 2.5;
  wand.position.set(0.25, 0.9, 0.4);

  group.add(body, head, helmet, legL, legR, wand);
  return group;
}

// Water spray particle system
class SprayEffect {
  points: THREE.Points;
  positions: Float32Array;
  colors: Float32Array;
  life: Float32Array;
  velocities: Float32Array;
  count: number;
  cursor = 0;

  constructor(count = 250) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.velocities = new Float32Array(count * 3);
    this.positions.fill(-1000);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    this.points = new THREE.Points(geo, mat);
  }

  emit(origin: [number, number, number], dir: [number, number, number], nozzleIdx: number) {
    const nozzle = NOZZLES[nozzleIdx] || NOZZLES[1];
    const spread = (nozzle.angleDeg * Math.PI) / 180 / 2;

    for (let k = 0; k < 6; k++) {
      const idx = this.cursor++ % this.count;
      this.positions[idx * 3] = origin[0] + (Math.random() - 0.5) * 0.05;
      this.positions[idx * 3 + 1] = origin[1] - 0.15;
      this.positions[idx * 3 + 2] = origin[2] + (Math.random() - 0.5) * 0.05;

      const angle = (Math.random() - 0.5) * spread;
      const speed = 22 + Math.random() * 5;

      this.velocities[idx * 3] = (dir[0] + Math.sin(angle)) * speed;
      this.velocities[idx * 3 + 1] = (dir[1] + (Math.random() - 0.5) * 0.1) * speed;
      this.velocities[idx * 3 + 2] = (dir[2] + Math.cos(angle) * 0.1) * speed;

      this.life[idx] = 0.28; // life seconds

      // Color profile: white mist or turquoise water
      if (nozzleIdx === 3) {
        // Soap foam
        this.colors[idx * 3] = 0.95;
        this.colors[idx * 3 + 1] = 0.98;
        this.colors[idx * 3 + 2] = 1.0;
      } else {
        // High pressure water
        this.colors[idx * 3] = 0.6;
        this.colors[idx * 3 + 1] = 0.88;
        this.colors[idx * 3 + 2] = 1.0;
      }
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        this.positions[i * 3] += this.velocities[i * 3] * dt;
        this.positions[i * 3 + 1] += (this.velocities[i * 3 + 1] - 9.8 * dt) * dt; // gravity
        this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      } else {
        this.positions[i * 3 + 1] = -1000;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

export function PowerWashScene({
  room,
  follow,
  split = false,
  quality = 'high',
  onTargetObjectChange,
  localSprayState,
}: WashSceneProps) {
  const mount = useRef<HTMLDivElement>(null);
  const latestRoom = useRef(room);
  latestRoom.current = room;

  useEffect(() => {
    const parent = mount.current;
    if (!parent) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: quality === 'high' });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.75 : 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#bae6fd'); // Sunlit azure sky
    scene.fog = new THREE.Fog('#dbeafe', 25, 70);

    // Warm daylight lighting
    const hemiLight = new THREE.HemisphereLight('#fef08a', '#64748b', 1.8);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight('#fffbeb', 3.0);
    sun.position.set(18, 30, 14);
    sun.castShadow = quality === 'high';
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.bias = -0.0003;
    scene.add(sun);

    // Surrounding garden grass
    const grassGeo = new THREE.PlaneGeometry(120, 120);
    const grassMat = new THREE.MeshStandardMaterial({ color: '#4ade80', roughness: 0.85 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.15;
    grass.receiveShadow = true;
    scene.add(grass);

    // Garden boundary wall / tall hedges
    const hedgeMat = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.9 });
    const hedgeGeo = new THREE.BoxGeometry(24, 3.5, 1.2);
    const hedgeNorth = new THREE.Mesh(hedgeGeo, hedgeMat);
    hedgeNorth.position.set(0, 1.75, -10);
    const hedgeSouth = new THREE.Mesh(hedgeGeo, hedgeMat);
    hedgeSouth.position.set(0, 1.75, 10);
    const hedgeEast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 20), hedgeMat);
    hedgeEast.position.set(10, 1.75, 0);
    const hedgeWest = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 20), hedgeMat);
    hedgeWest.position.set(-10, 1.75, 0);
    scene.add(hedgeNorth, hedgeSouth, hedgeEast, hedgeWest);

    // Build dirt surfaces for all cleanable objects
    const dirtSurfaces = new Map<string, DirtSurface>();
    for (const def of CLEANABLE_OBJECTS) {
      dirtSurfaces.set(def.id, new DirtSurface(def.gridX, def.gridY));
    }

    // Add 3D objects to the scene
    const patioGroup = buildPatioMesh(dirtSurfaces.get('patio')!.texture);
    const benchGroup = buildBenchMesh(dirtSurfaces.get('bench')!.texture);
    const bikeGroup = buildBicycleMesh(dirtSurfaces.get('bicycle')!.texture);
    const cartGroup = buildCartMesh(dirtSurfaces.get('cart')!.texture);
    const fenceGroup = buildFenceMesh(dirtSurfaces.get('fence')!.texture);
    const birdbathGroup = buildBirdbathMesh(dirtSurfaces.get('birdbath')!.texture);

    scene.add(patioGroup, benchGroup, bikeGroup, cartGroup, fenceGroup, birdbathGroup);

    // Water spray particle system
    const sprayEffect = new SprayEffect(320);
    scene.add(sprayEffect.points);

    // Player character meshes and cameras
    const playerMeshes = new Map<string, THREE.Group>();
    const playerCameras = new Map<string, THREE.PerspectiveCamera>();

    const resize = () => {
      renderer.setSize(parent.clientWidth, parent.clientHeight);
    };
    resize();
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(parent);

    let animId = 0;
    let lastTime = performance.now();
    let lastDirtUpdate = 0;

    function renderLoop(now: number) {
      animId = requestAnimationFrame(renderLoop);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const wash = latestRoom.current.wash;
      const players = wash?.players || [];

      // Update dirt textures every 120ms or on changes
      if (wash && wash.packedGrids && now - lastDirtUpdate > 120) {
        lastDirtUpdate = now;
        const unpacked = unpackDirtGrids(wash.packedGrids, wash.objects);
        const isHighlightActive = players.some(p => p.highlight);

        for (const [id, grid] of Object.entries(unpacked)) {
          const ds = dirtSurfaces.get(id);
          if (ds) {
            ds.updateFromGrid(grid, isHighlightActive);
          }
        }
      }

      // Update player character positions and spray particles
      for (const p of players) {
        let pMesh = playerMeshes.get(p.id);
        if (!pMesh) {
          pMesh = buildWasherCharacter(p.color);
          playerMeshes.set(p.id, pMesh);
          scene.add(pMesh);
        }

        pMesh.position.set(p.x, 0, p.z);
        pMesh.rotation.y = p.yaw;
        pMesh.visible = p.connected;

        // Emit water particles if spraying
        const isSpraying = p.spraying || (localSprayState?.spraying && p.id === follow);
        const nozzleIdx = localSprayState?.nozzle ?? p.nozzle;

        if (isSpraying) {
          const origin: [number, number, number] = [
            p.x + Math.sin(p.yaw + 0.3) * 0.4,
            1.4 + Math.sin(p.pitch) * 0.3,
            p.z + Math.cos(p.yaw + 0.3) * 0.4,
          ];
          const cosP = Math.cos(p.pitch);
          const dir: [number, number, number] = [
            -Math.sin(p.yaw) * cosP,
            Math.sin(p.pitch),
            -Math.cos(p.yaw) * cosP,
          ];
          sprayEffect.emit(origin, dir, nozzleIdx);
        }
      }

      sprayEffect.update(dt);

      // Multi-camera Viewport Rendering
      // If split, show all players; otherwise follow target player
      const activeViews = split && players.length > 1 ? players.map(p => p.id) : [follow || players[0]?.id || ''];
      const viewCount = Math.min(4, Math.max(1, activeViews.length));

      renderer.setScissorTest(true);

      for (let i = 0; i < viewCount; i++) {
        const pId = activeViews[i];
        const pState = players.find(p => p.id === pId) || players[0];
        if (!pState) continue;

        let cam = playerCameras.get(pId);
        if (!cam) {
          cam = new THREE.PerspectiveCamera(68, 1, 0.1, 150);
          playerCameras.set(pId, cam);
        }

        // Camera positioned at eye level / third-person over-shoulder
        const isFirstPerson = viewCount === 1 && pId === follow;
        if (isFirstPerson) {
          // First person: at head
          cam.position.set(pState.x, 1.6, pState.z);
          // Hide own character mesh in first-person
          const ownMesh = playerMeshes.get(pId);
          if (ownMesh) ownMesh.visible = false;
        } else {
          // Over-the-shoulder third person
          const dist = 2.4;
          const height = 1.9;
          cam.position.set(
            pState.x + Math.sin(pState.yaw) * dist,
            height,
            pState.z + Math.cos(pState.yaw) * dist
          );
          const ownMesh = playerMeshes.get(pId);
          if (ownMesh) ownMesh.visible = true;
        }

        // Camera direction
        const cosP = Math.cos(pState.pitch);
        const lookTarget = new THREE.Vector3(
          cam.position.x - Math.sin(pState.yaw) * cosP * 8,
          cam.position.y + Math.sin(pState.pitch) * 8,
          cam.position.z - Math.cos(pState.yaw) * cosP * 8
        );
        cam.lookAt(lookTarget);

        // Viewport bounds
        const vp = splitViewport(i, viewCount, parent!.clientWidth, parent!.clientHeight);
        cam.aspect = vp.width / vp.height;
        cam.updateProjectionMatrix();

        renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
        renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
        renderer.render(scene, cam);
      }

      renderer.setScissorTest(false);
    }

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      for (const ds of dirtSurfaces.values()) {
        ds.dispose();
      }
      sprayEffect.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [quality, split]);

  return (
    <div
      className="game-canvas wash-canvas"
      ref={mount}
      aria-label="Power Wash Simulator 2 live 3D garden"
    />
  );
}

export function PowerWashPreview() {
  const [demoRoom] = useState<RoomState>(() => {
    const players = [{ id: 'preview', name: 'Master Cleaner', color: '#38bdf8', ready: true, connected: true }];
    return {
      code: 'WASH',
      mode: 'lan',
      gameId: 'power-wash',
      phase: 'playing',
      players,
      race: null,
      wash: {
        phase: 'playing',
        time: 12,
        countdown: 0,
        players: [
          {
            id: 'preview',
            name: 'Master Cleaner',
            color: '#38bdf8',
            x: 0,
            y: 1.6,
            z: 2.5,
            yaw: Math.PI,
            pitch: -0.2,
            spraying: true,
            nozzle: 1,
            highlight: false,
            cleanedCount: 120,
            connected: true,
          },
        ],
        objects: {
          patio: { id: 'patio', name: 'Courtyard Patio', totalCells: 1024, cleanedCells: 120, percent: 12, completed: false },
          bench: { id: 'bench', name: 'Garden Bench', totalCells: 256, cleanedCells: 0, percent: 0, completed: false },
          bicycle: { id: 'bicycle', name: 'Vintage Bicycle', totalCells: 256, cleanedCells: 0, percent: 0, completed: false },
          cart: { id: 'cart', name: 'Garden Cart', totalCells: 400, cleanedCells: 0, percent: 0, completed: false },
          fence: { id: 'fence', name: 'Picket Fence', totalCells: 384, cleanedCells: 0, percent: 0, completed: false },
          birdbath: { id: 'birdbath', name: 'Stone Birdbath', totalCells: 256, cleanedCells: 0, percent: 0, completed: false },
        },
        totalCells: 2576,
        totalCleaned: 120,
        jobPercent: 12,
        completed: false,
        packedGrids: {},
      },
      joinUrl: '',
      screenUrl: '',
      controllerUrl: '',
      hostConnected: true,
      splitRequests: [],
    };
  });

  return (
    <div className="world-preview wash-preview">
      <PowerWashScene room={demoRoom} follow="preview" quality="low" />
      <span className="preview-label">
        LIVE 3D WORLD <i /> POWER WASH SIMULATOR 2
      </span>
    </div>
  );
}

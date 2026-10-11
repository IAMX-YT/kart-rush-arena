import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { splitLayout, splitViewport } from '../shared/display';
import {
  CLEANABLE_OBJECTS,
  NOZZLES,
  intersectBox,
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
  onLook?: (deltaYaw: number, deltaPitch: number) => void;
  onSprayChange?: (spraying: boolean) => void;
  onNozzleCycle?: (delta: number) => void;
}

/* ────────────────────── Procedural Textures ────────────────────── */

function createConcreteTexture(shade = 0.78, tileSize = 0): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base concrete
  const base = Math.floor(shade * 255);
  ctx.fillStyle = `rgb(${base},${base - 3},${base - 8})`;
  ctx.fillRect(0, 0, 512, 512);

  // Concrete noise / grain
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = base + (Math.random() - 0.5) * 30;
    ctx.fillStyle = `rgba(${v},${v - 2},${v - 5},0.4)`;
    ctx.fillRect(x, y, 2 + Math.random() * 2, 2 + Math.random() * 2);
  }

  // Optional tile lines (flagstone / brick pattern)
  if (tileSize > 0) {
    ctx.strokeStyle = `rgba(0,0,0,0.12)`;
    ctx.lineWidth = 2;
    for (let x = 0; x <= 512; x += tileSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
    }
    for (let y = 0; y <= 512; y += tileSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    }
    // Subtle shade variations per tile
    for (let ty = 0; ty < 512; ty += tileSize) {
      for (let tx = 0; tx < 512; tx += tileSize) {
        const v = (Math.random() - 0.5) * 12;
        ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
        ctx.fillRect(tx + 2, ty + 2, tileSize - 4, tileSize - 4);
      }
    }
  }

  // Hairline cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let cx = Math.random() * 512, cy = Math.random() * 512;
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 8; s++) {
      cx += (Math.random() - 0.5) * 80;
      cy += (Math.random() - 0.5) * 80;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createBrickTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Mortar background
  ctx.fillStyle = '#b0a89c';
  ctx.fillRect(0, 0, 512, 512);

  const bw = 64, bh = 28, gap = 4;
  for (let row = 0; row < Math.ceil(512 / (bh + gap)); row++) {
    const offset = (row % 2) * (bw / 2);
    for (let col = -1; col < Math.ceil(512 / (bw + gap)) + 1; col++) {
      const x = col * (bw + gap) + offset;
      const y = row * (bh + gap);
      // Brick color variation
      const r = 160 + Math.floor(Math.random() * 45);
      const g = 75 + Math.floor(Math.random() * 30);
      const b = 60 + Math.floor(Math.random() * 25);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, bw, bh);
      // Texture grain on brick
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
        ctx.fillRect(x + Math.random() * bw, y + Math.random() * bh, 4, 3);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createWoodTexture(baseHue = '#8B6914'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHue;
  ctx.fillRect(0, 0, 256, 256);

  // Wood grain lines
  for (let y = 0; y < 256; y += 3) {
    const offset = Math.sin(y * 0.15) * 6;
    ctx.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    ctx.moveTo(0, y + offset);
    ctx.bezierCurveTo(80, y + offset + Math.random() * 4, 170, y + offset - Math.random() * 3, 256, y + offset);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createRoofTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4a4a52';
  ctx.fillRect(0, 0, 512, 512);

  // Shingle rows
  const sh = 24, sw = 48;
  for (let row = 0; row < Math.ceil(512 / sh) + 1; row++) {
    const offset = (row % 2) * (sw / 2);
    for (let col = -1; col < Math.ceil(512 / sw) + 2; col++) {
      const x = col * sw + offset;
      const y = row * sh;
      const v = 70 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${v},${v},${v + 5})`;
      ctx.fillRect(x + 1, y + 1, sw - 2, sh - 2);
      // Bottom shadow edge
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x, y + sh - 3, sw, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ────────────────────── Dirt Surface System ────────────────────── */

class DirtSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  gridX: number;
  gridY: number;

  constructor(gridX: number, gridY: number) {
    this.gridX = gridX;
    this.gridY = gridY;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(256, gridX * 8);
    this.canvas.height = Math.max(256, gridY * 8);
    this.ctx = this.canvas.getContext('2d')!;

    // Multi-layered realistic grime
    const w = this.canvas.width, h = this.canvas.height;

    // Base layer: dark grime
    this.ctx.fillStyle = '#2a1f12';
    this.ctx.fillRect(0, 0, w, h);

    // Mud splatter layer
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() * 18 + 3;
      const grad = this.ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(45, 32, 16, 0.8)');
      grad.addColorStop(1, 'rgba(45, 32, 16, 0)');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Green moss/algae patches
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() * 25 + 8;
      const grad = this.ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(34, 60, 20, 0.7)');
      grad.addColorStop(0.5, 'rgba(48, 72, 28, 0.5)');
      grad.addColorStop(1, 'rgba(34, 60, 20, 0)');
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Dark oil/grease stains
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() * 20 + 5;
      this.ctx.fillStyle = `rgba(15, 10, 5, ${0.3 + Math.random() * 0.4})`;
      this.ctx.beginPath();
      this.ctx.ellipse(x, y, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Fine speckle noise
    for (let i = 0; i < 1500; i++) {
      this.ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '20,15,8' : '55,45,25'},${0.2 + Math.random() * 0.3})`;
      this.ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
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
          if (highlight) {
            // Pulsing highlight to show remaining dirt
            this.ctx.fillStyle = 'rgba(255, 140, 0, 0.85)';
          } else {
            // Realistic grime colors with variation
            const noise = Math.sin(c * 7.3 + r * 13.1) * 0.5 + 0.5;
            if (noise > 0.7) {
              this.ctx.fillStyle = '#1e3a12'; // moss
            } else if (noise > 0.4) {
              this.ctx.fillStyle = '#33261a'; // mud
            } else {
              this.ctx.fillStyle = '#2a1f12'; // base grime
            }
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

/* ────────────────────── Sky Dome ────────────────────── */

function createSkyDome(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Gradient sky: deep blue top -> warm white horizon
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1a5276');
  grad.addColorStop(0.15, '#2980b9');
  grad.addColorStop(0.35, '#5dade2');
  grad.addColorStop(0.55, '#85c1e9');
  grad.addColorStop(0.72, '#aed6f1');
  grad.addColorStop(0.85, '#d6eaf8');
  grad.addColorStop(0.93, '#fef9ef');
  grad.addColorStop(1.0, '#fdf2e9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Soft cloud wisps
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 12; i++) {
    const y = 140 + Math.random() * 200;
    const w = 60 + Math.random() * 150;
    const h = 10 + Math.random() * 25;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 512, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.SphereGeometry(200, 24, 16);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

/* ────────────────────── 3D Object Builders ────────────────────── */

// Suburban House
function buildHouse(brickTex: THREE.CanvasTexture, woodTex: THREE.CanvasTexture, roofTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0, -12);

  // Main house body
  const wallMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.85, metalness: 0 });
  const mainBody = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 8), wallMat);
  mainBody.position.set(0, 3, 0);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  group.add(mainBody);

  // Roof (prism shape via triangular extrusion)
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.8 });
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-7.5, 0);
  roofShape.lineTo(0, 3.5);
  roofShape.lineTo(7.5, 0);
  roofShape.lineTo(-7.5, 0);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 9, bevelEnabled: false });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(0, 6, 4.5);
  roof.castShadow = true;
  group.add(roof);

  // Front door
  const doorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6, color: '#5d3a1a' });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.12), doorMat);
  door.position.set(-2, 1.2, 4.08);
  door.castShadow = true;
  group.add(door);

  // Door frame
  const frameMat = new THREE.MeshStandardMaterial({ color: '#f5f0e8', roughness: 0.4 });
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.2), frameMat);
  frameTop.position.set(-2, 2.45, 4.1);
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.2), frameMat);
  frameL.position.set(-2.66, 1.2, 4.1);
  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.2), frameMat);
  frameR.position.set(-1.34, 1.2, 4.1);
  group.add(frameTop, frameL, frameR);

  // Windows (4 front windows)
  const glassMat = new THREE.MeshStandardMaterial({ color: '#87ceeb', roughness: 0.05, metalness: 0.4, opacity: 0.5, transparent: true });
  const windowFrameMat = new THREE.MeshStandardMaterial({ color: '#f0ece4', roughness: 0.3 });
  const windowPositions = [
    { x: 1.5, y: 4.2 }, { x: 4.5, y: 4.2 },
    { x: 1.5, y: 1.8 }, { x: 4.5, y: 1.8 },
  ];
  for (const wp of windowPositions) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), glassMat);
    glass.position.set(wp.x, wp.y, 4.07);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.08), windowFrameMat);
    frame.position.set(wp.x, wp.y, 4.05);
    group.add(glass, frame);
  }

  // Garage section (right side)
  const garageDoorMat = new THREE.MeshStandardMaterial({ color: '#e8e0d4', roughness: 0.5, metalness: 0.1 });
  const garageBody = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 7), wallMat);
  garageBody.position.set(9.5, 2.5, 0.5);
  garageBody.castShadow = true;
  garageBody.receiveShadow = true;
  group.add(garageBody);

  // Garage door
  const garageDoor = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3.2, 0.15), garageDoorMat);
  garageDoor.position.set(9.5, 1.6, 4.08);
  // Garage door panel lines
  for (let i = 0; i < 4; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.04, 0.01), new THREE.MeshStandardMaterial({ color: '#c4baa8' }));
    line.position.set(9.5, 0.4 + i * 0.8, 4.16);
    group.add(line);
  }
  group.add(garageDoor);

  // Garage flat roof
  const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 7.4), roofMat);
  garageRoof.position.set(9.5, 5.15, 0.5);
  group.add(garageRoof);

  // Front step / porch
  const stepMat = new THREE.MeshStandardMaterial({ color: '#c4b8a8', roughness: 0.7 });
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 1.2), stepMat);
  step1.position.set(-2, 0.075, 4.6);
  step1.receiveShadow = true;
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.15, 0.8), stepMat);
  step2.position.set(-2, 0.225, 5);
  step2.receiveShadow = true;
  group.add(step1, step2);

  // Chimney
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3, 1.2), wallMat);
  chimney.position.set(-5, 7.5, -1);
  chimney.castShadow = true;
  group.add(chimney);

  return group;
}

// Driveway / Patio floor (the main cleaning surface)
function buildDriveway(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();

  const concreteTex = createConcreteTexture(0.82, 0);
  concreteTex.repeat.set(4, 4);
  const cleanMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.8, metalness: 0 });

  // Main driveway
  const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.15, 14), cleanMat);
  floor.position.y = -0.075;
  floor.receiveShadow = true;
  group.add(floor);

  // Dirt overlay
  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirtTex, transparent: true, opacity: 0.92, roughness: 0.95,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const dirtPlane = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), dirtMat);
  dirtPlane.rotation.x = -Math.PI / 2;
  dirtPlane.position.y = 0.005;
  dirtPlane.receiveShadow = true;
  group.add(dirtPlane);

  return group;
}

// Garden Bench (Cleanable Object id: bench)
function buildBench(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(3.5, 0, -3);

  const woodMat = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.65 });
  const ironMat = new THREE.MeshStandardMaterial({ color: '#2c3e50', roughness: 0.35, metalness: 0.8 });

  // Cast iron curved legs
  for (const xOff of [-0.9, 0.9]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.9), ironMat);
    leg.position.set(xOff, 0.425, 0);
    leg.castShadow = true;
    group.add(leg);
    // Decorative curl on legs
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 12, Math.PI), ironMat);
    curl.position.set(xOff, 0.1, 0.35);
    curl.rotation.y = Math.PI / 2;
    group.add(curl);
  }

  // Wooden seat slats
  for (let i = -2; i <= 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.16), woodMat);
    slat.position.set(0, 0.7, i * 0.18);
    slat.castShadow = true;
    group.add(slat);
  }

  // Backrest slats
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.04), woodMat);
    slat.position.set(0, 0.95 + i * 0.16, -0.42);
    slat.castShadow = true;
    group.add(slat);
  }

  // Armrests
  for (const xOff of [-1.0, 1.0]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.7), woodMat);
    arm.position.set(xOff, 0.9, 0);
    group.add(arm);
  }

  // Dirt overlay matches CLEANABLE_OBJECTS size [2.4, 1.2, 1.2]
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, transparent: true, opacity: 0.9, roughness: 0.9 });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.2), dirtMat);
  dirtBox.position.set(0, 0.6, 0);
  group.add(dirtBox);

  return group;
}

// Garden fence (Cleanable Object id: fence)
function buildFence(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0, -7.5);

  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f5f0e8', roughness: 0.55 });

  // Horizontal rails
  for (const y of [0.4, 1.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(15, 0.08, 0.06), whiteMat);
    rail.position.y = y;
    group.add(rail);
  }

  // Vertical pickets with pointed tops
  for (let x = -7.2; x <= 7.2; x += 0.45) {
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.04), whiteMat);
    picket.position.set(x, 0.65, 0);
    picket.castShadow = true;
    group.add(picket);
    // Pointed cap
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 4), whiteMat);
    cap.position.set(x, 1.35, 0);
    group.add(cap);
  }

  // Dirt overlay matches CLEANABLE_OBJECTS size [15, 2.0, 0.4]
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, transparent: true, opacity: 0.9, roughness: 0.9 });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(15, 1.8, 0.4), dirtMat);
  dirtBox.position.set(0, 1.0, 0);
  group.add(dirtBox);

  return group;
}

// Vintage Bicycle (Cleanable Object id: bicycle)
function buildBicycle(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(-3.8, 0, -2);
  group.rotation.y = Math.PI * 0.15;

  const frameMat = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.3, metalness: 0.6 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.1, metalness: 0.9 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.6 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.95 });

  // Wheels (front and rear)
  for (const xOff of [-0.65, 0.65]) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 10, 24), rubberMat);
    tire.position.set(xOff, 0.35, 0);
    tire.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 8, 24), chromeMat);
    rim.position.set(xOff, 0.35, 0);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8), chromeMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(xOff, 0.35, 0);
    group.add(tire, rim, hub);
  }

  // Frame tubes
  const seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55), frameMat);
  seatTube.position.set(-0.1, 0.55, 0);
  seatTube.rotation.z = -0.3;
  const downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65), frameMat);
  downTube.position.set(0.18, 0.52, 0);
  downTube.rotation.z = 0.65;
  const topTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6), frameMat);
  topTube.position.set(0.1, 0.72, 0);
  topTube.rotation.z = -0.05;
  const seatStay = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55), frameMat);
  seatStay.position.set(-0.38, 0.55, 0);
  seatStay.rotation.z = 0.55;
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55), chromeMat);
  fork.position.set(0.55, 0.55, 0);
  fork.rotation.z = -0.25;
  group.add(seatTube, downTube, topTube, seatStay, fork);

  // Handlebars
  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55), chromeMat);
  handlebar.rotation.x = Math.PI / 2;
  handlebar.position.set(0.48, 0.88, 0);
  for (const z of [-0.24, 0.24]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1), leatherMat);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0.48, 0.88, z);
    group.add(grip);
  }
  group.add(handlebar);

  // Saddle / Seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.16), leatherMat);
  seat.position.set(-0.2, 0.82, 0);
  seat.castShadow = true;
  group.add(seat);

  // Front Basket
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.32), new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.8 }));
  basket.position.set(0.62, 0.82, 0);
  group.add(basket);

  // Dirt overlay matches CLEANABLE_OBJECTS size [2.0, 1.4, 0.8]
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, transparent: true, opacity: 0.9, roughness: 0.9 });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.8), dirtMat);
  dirtBox.position.set(0, 0.7, 0);
  group.add(dirtBox);

  return group;
}

// Scenic Vintage Car (Parked on Driveway near Garage)
function buildScenicCar(): THREE.Group {
  const group = new THREE.Group();
  group.position.set(8.5, 0, 1.5);
  group.rotation.y = Math.PI * 0.05;

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.2, metalness: 0.6 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.08, metalness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#87ceeb', roughness: 0.02, metalness: 0.3, opacity: 0.45, transparent: true });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.2, metalness: 0.8 });

  // Main hull
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 1.9), bodyMat);
  body.position.set(0, 0.7, 0);
  body.castShadow = true;
  group.add(body);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.7), bodyMat);
  cabin.position.set(-0.2, 1.65, 0);
  cabin.castShadow = true;
  group.add(cabin);

  // Windshield & windows
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.7), glassMat);
  windshield.position.set(0.7, 1.55, 0);
  windshield.rotation.y = Math.PI / 2;
  windshield.rotation.x = 0.15;
  group.add(windshield);

  // Chrome bumpers
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 2.0), chromeMat);
  frontBumper.position.set(2.16, 0.35, 0);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 2.0), chromeMat);
  rearBumper.position.set(-2.16, 0.35, 0);
  group.add(frontBumper, rearBumper);

  // Wheels
  for (const wp of [{ x: 1.4, z: -1.05 }, { x: 1.4, z: 1.05 }, { x: -1.4, z: -1.05 }, { x: -1.4, z: 1.05 }]) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.22, 16), tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(wp.x, 0.35, wp.z);
    tire.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.24, 8), hubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(wp.x, 0.35, wp.z);
    group.add(tire, hub);
  }

  return group;
}

// Garden cart / wheelbarrow (Cleanable Object id: cart)
function buildCart(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(4.2, 0, 3.2);
  group.rotation.y = -Math.PI * 0.15;

  const metalMat = new THREE.MeshStandardMaterial({ color: '#3f5147', roughness: 0.6, metalness: 0.5 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.75 });

  // Tray
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.9), metalMat);
  tray.position.set(0, 0.55, 0);
  tray.castShadow = true;
  group.add(tray);

  // Handles
  for (const z of [-0.25, 0.25]) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4), woodMat);
    handle.rotation.z = -Math.PI / 5;
    handle.position.set(-0.95, 0.5, z);
    group.add(handle);
  }

  // Wheel
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }));
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(0.7, 0.25, 0);
  group.add(wheel);

  // Leg stands
  for (const z of [-0.35, 0.35]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), metalMat);
    leg.position.set(-0.3, 0.175, z);
    group.add(leg);
  }

  // Dirt overlay matches CLEANABLE_OBJECTS size [2.2, 1.1, 1.4]
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, transparent: true, opacity: 0.9, roughness: 0.9 });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.4), dirtMat);
  dirtBox.position.set(0, 0.7, 0);
  group.add(dirtBox);

  return group;
}

// Stone birdbath / garden ornament (Cleanable Object id: birdbath)
function buildBirdbath(dirtTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.position.set(-3.2, 0, 3.5);

  const stoneMat = new THREE.MeshStandardMaterial({ color: '#d4cdc3', roughness: 0.7 });

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.2, 16), stoneMat);
  base.position.y = 0.1;
  base.castShadow = true;

  // Column
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.9, 12), stoneMat);
  column.position.y = 0.65;
  column.castShadow = true;

  // Basin
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 0.3, 16), stoneMat);
  basin.position.y = 1.25;
  basin.castShadow = true;

  // Water
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshStandardMaterial({ color: '#3498db', roughness: 0.05, metalness: 0.2 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 1.38;

  // Decorative ring around basin lip
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 24), stoneMat);
  ring.position.y = 1.4;
  ring.rotation.x = Math.PI / 2;

  group.add(base, column, basin, water, ring);

  // Dirt overlay matches CLEANABLE_OBJECTS size [1.4, 1.8, 1.4]
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, transparent: true, opacity: 0.9, roughness: 0.9 });
  const dirtBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), dirtMat);
  dirtBox.position.set(0, 0.9, 0);
  group.add(dirtBox);

  return group;
}

/* ────────────────────── First-Person Pressure Washer Wand ────────────────────── */

function buildFirstPersonWand(): THREE.Group {
  const wand = new THREE.Group();

  // Steel lance pipe extending forward (-Z)
  const lanceMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 0.95,
    roughness: 0.15,
  });
  const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.72, 12), lanceMat);
  lance.rotation.x = Math.PI / 2;
  lance.position.set(0, 0, -0.36);
  lance.castShadow = true;
  wand.add(lance);

  // Ergonomic trigger gun housing
  const gripMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.7,
  });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.11), gripMat);
  handle.position.set(0, -0.07, 0.02);
  handle.rotation.x = -0.25;
  wand.add(handle);

  // Red trigger
  const triggerMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.3 });
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.04, 0.02), triggerMat);
  trigger.position.set(0, -0.03, -0.015);
  wand.add(trigger);

  // Trigger guard loop
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 12, Math.PI), gripMat);
  guard.position.set(0, -0.045, 0.01);
  guard.rotation.y = Math.PI / 2;
  wand.add(guard);

  // Brass quick-connect coupler
  const brassMat = new THREE.MeshStandardMaterial({
    color: '#eab308',
    metalness: 0.85,
    roughness: 0.25,
  });
  const coupler = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.045, 12), brassMat);
  coupler.rotation.x = Math.PI / 2;
  coupler.position.set(0, 0, -0.72);
  wand.add(coupler);

  // Color-coded nozzle tip (updated in real time)
  const nozzleTipMat = new THREE.MeshStandardMaterial({
    color: '#eab308', // default 15° yellow
    metalness: 0.4,
    roughness: 0.3,
  });
  const nozzleTip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.04, 8), nozzleTipMat);
  nozzleTip.rotation.x = Math.PI / 2;
  nozzleTip.position.set(0, 0, -0.76);
  nozzleTip.name = 'nozzleTip';
  wand.add(nozzleTip);

  // Tip marker dummy for spray particle emission
  const tipMarker = new THREE.Object3D();
  tipMarker.position.set(0, 0, -0.80);
  tipMarker.name = 'tipMarker';
  wand.add(tipMarker);

  // High-pressure flexible black hose curving downward
  const hoseMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.85 });
  const hoseCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, -0.15, 0.04),
    new THREE.Vector3(0, -0.28, 0.08),
    new THREE.Vector3(0.06, -0.40, 0.16),
    new THREE.Vector3(0.14, -0.52, 0.28)
  );
  const hoseGeo = new THREE.TubeGeometry(hoseCurve, 16, 0.016, 8, false);
  const hoseMesh = new THREE.Mesh(hoseGeo, hoseMat);
  wand.add(hoseMesh);

  return wand;
}

/* ────────────────────── Player Character ────────────────────── */

function buildWasherCharacter(color: string): THREE.Group {
  const group = new THREE.Group();
  const suitMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#f5d0a9', roughness: 0.7 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.35, metalness: 0.2 });
  const bootMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.85 });
  const wandMat = new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.2, metalness: 0.8 });
  const hoseMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.6 });

  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.75, 8), suitMat);
  torso.position.y = 0.875;
  torso.castShadow = true;

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinMat);
  head.position.y = 1.4;

  // Hard hat
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 12), helmetMat);
  hat.position.y = 1.52;
  // Hat brim
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12), helmetMat);
  brim.position.y = 1.47;

  // Arms
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), suitMat);
    arm.position.set(side * 0.3, 0.95, 0);
    arm.rotation.z = side * 0.15;
    arm.castShadow = true;
    group.add(arm);
    // Gloves
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.5 }));
    glove.position.set(side * 0.34, 0.65, 0);
    group.add(glove);
  }

  // Legs & boots
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), suitMat);
    leg.position.set(side * 0.1, 0.275, 0);
    leg.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.2), bootMat);
    boot.position.set(side * 0.1, 0.075, 0.03);
    group.add(leg, boot);
  }

  // Pressure washer wand
  const wandPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8), wandMat);
  wandPipe.rotation.x = Math.PI / 3;
  wandPipe.position.set(0.28, 0.85, 0.35);
  // Wand nozzle tip
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), wandMat);
  nozzle.rotation.x = Math.PI / 3;
  nozzle.position.set(0.28 + Math.sin(Math.PI / 3) * 0.42, 0.85 + Math.cos(Math.PI / 3) * 0.42, 0.35 + 0.2);

  // Hose going to backpack
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6), hoseMat);
  hose.rotation.z = Math.PI / 4;
  hose.position.set(-0.1, 0.65, -0.15);

  // Backpack tank
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.6, metalness: 0.3 }));
  tank.position.set(0, 0.9, -0.22);

  group.add(torso, head, hat, brim, wandPipe, nozzle, hose, tank);
  return group;
}

/* ────────────────────── Water Spray System ────────────────────── */

class SprayEffect {
  points: THREE.Points;
  positions: Float32Array;
  colors: Float32Array;
  life: Float32Array;
  velocities: Float32Array;
  sizes: Float32Array;
  count: number;
  cursor = 0;

  // Splash ring at impact point
  splashRing: THREE.Mesh;
  splashActive = false;
  splashLife = 0;

  constructor(count = 400) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.velocities = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.positions.fill(-1000);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);

    // Impact splash ring decal
    const ringGeo = new THREE.RingGeometry(0.1, 0.6, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    this.splashRing = new THREE.Mesh(ringGeo, ringMat);
    this.splashRing.rotation.x = -Math.PI / 2;
    this.splashRing.visible = false;
  }

  emit(origin: [number, number, number], dir: [number, number, number], nozzleIdx: number) {
    const nozzle = NOZZLES[nozzleIdx] || NOZZLES[1];
    const spread = (nozzle.angleDeg * Math.PI) / 180 / 2;
    const particlesPerFrame = nozzleIdx === 0 ? 4 : nozzleIdx === 3 ? 10 : 6;

    for (let k = 0; k < particlesPerFrame; k++) {
      const idx = this.cursor++ % this.count;
      this.positions[idx * 3] = origin[0] + (Math.random() - 0.5) * 0.03;
      this.positions[idx * 3 + 1] = origin[1] - 0.1;
      this.positions[idx * 3 + 2] = origin[2] + (Math.random() - 0.5) * 0.03;

      const angle = (Math.random() - 0.5) * spread;
      const speed = 18 + Math.random() * 8;

      this.velocities[idx * 3] = (dir[0] + Math.sin(angle) * 0.3) * speed;
      this.velocities[idx * 3 + 1] = (dir[1] + (Math.random() - 0.5) * 0.08) * speed;
      this.velocities[idx * 3 + 2] = (dir[2] + Math.cos(angle) * 0.15) * speed;

      this.life[idx] = 0.2 + Math.random() * 0.15;

      // Water color profile
      if (nozzleIdx === 3) {
        // Soap foam - white/blue tint
        this.colors[idx * 3] = 0.92 + Math.random() * 0.08;
        this.colors[idx * 3 + 1] = 0.95 + Math.random() * 0.05;
        this.colors[idx * 3 + 2] = 1.0;
      } else {
        // High pressure water - cyan/blue
        this.colors[idx * 3] = 0.5 + Math.random() * 0.2;
        this.colors[idx * 3 + 1] = 0.8 + Math.random() * 0.15;
        this.colors[idx * 3 + 2] = 0.95 + Math.random() * 0.05;
      }
    }

    // Update splash ring position
    const range = nozzle.range * 0.6;
    this.splashRing.position.set(
      origin[0] - dir[0] * range,
      0.05,
      origin[2] - dir[2] * range
    );
    this.splashRing.visible = true;
    this.splashActive = true;
    this.splashLife = 0.1;
    const scale = 0.3 + nozzle.radius;
    this.splashRing.scale.set(scale, scale, scale);
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        this.positions[i * 3] += this.velocities[i * 3] * dt;
        this.positions[i * 3 + 1] += (this.velocities[i * 3 + 1] - 9.8 * dt * 0.5) * dt;
        this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;

        // Fade velocities slightly for mist trail effect
        this.velocities[i * 3] *= 0.98;
        this.velocities[i * 3 + 2] *= 0.98;
      } else {
        this.positions[i * 3 + 1] = -1000;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    // Splash ring fade
    if (this.splashActive) {
      this.splashLife -= dt;
      if (this.splashLife <= 0) {
        this.splashRing.visible = false;
        this.splashActive = false;
      } else {
        (this.splashRing.material as THREE.MeshBasicMaterial).opacity = this.splashLife * 3.5;
      }
    }
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.splashRing.geometry.dispose();
    (this.splashRing.material as THREE.Material).dispose();
  }
}

/* ────────────────────── Main Scene Component ────────────────────── */

export function PowerWashScene({
  room,
  follow,
  split = false,
  quality = 'high',
  onTargetObjectChange,
  localSprayState,
  onLook,
  onSprayChange,
  onNozzleCycle,
}: WashSceneProps) {
  const mount = useRef<HTMLDivElement>(null);
  const latestRoom = useRef(room);
  latestRoom.current = room;

  useEffect(() => {
    const parent = mount.current;
    if (!parent) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', alpha: false });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.75 : 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    parent.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Sky dome
    const sky = createSkyDome();
    scene.add(sky);

    // Atmospheric fog
    scene.fog = new THREE.FogExp2('#c8dce8', 0.012);

    // ── Lighting ──
    // Warm afternoon sunlight
    const hemiLight = new THREE.HemisphereLight('#ffefc0', '#5c7a6e', 1.5);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight('#fff5e0', 3.5);
    sun.position.set(20, 35, 18);
    sun.castShadow = quality === 'high';
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // Subtle fill light from left
    const fillLight = new THREE.DirectionalLight('#b0d4f1', 0.8);
    fillLight.position.set(-15, 10, 5);
    scene.add(fillLight);

    // Ambient bounce
    const ambientLight = new THREE.AmbientLight('#e8e0d0', 0.3);
    scene.add(ambientLight);

    // ── Ground ──
    // Large grass lawn
    const grassTex = createConcreteTexture(0.4, 0);
    grassTex.repeat.set(8, 8);
    const grassMat = new THREE.MeshStandardMaterial({
      color: '#4da848',
      roughness: 0.9,
      map: grassTex,
    });
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.2;
    grass.receiveShadow = true;
    scene.add(grass);

    // Street / road in front
    const roadMat = new THREE.MeshStandardMaterial({ color: '#3d3d3d', roughness: 0.85 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(150, 8), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.18, 12);
    road.receiveShadow = true;
    scene.add(road);
    // Road curb
    const curbMat = new THREE.MeshStandardMaterial({ color: '#c4bfb4', roughness: 0.7 });
    const curb = new THREE.Mesh(new THREE.BoxGeometry(150, 0.15, 0.3), curbMat);
    curb.position.set(0, -0.1, 8.15);
    scene.add(curb);

    // ── Textures ──
    const brickTex = createBrickTexture();
    brickTex.repeat.set(2, 2);
    const woodTex = createWoodTexture();
    const roofTex = createRoofTexture();
    roofTex.repeat.set(3, 3);

    // ── Build dirt surfaces ──
    const dirtSurfaces = new Map<string, DirtSurface>();
    for (const def of CLEANABLE_OBJECTS) {
      dirtSurfaces.set(def.id, new DirtSurface(def.gridX, def.gridY));
    }

    // ── Build scene objects ──
    const house = buildHouse(brickTex, woodTex, roofTex);
    const driveway = buildDriveway(dirtSurfaces.get('patio')!.texture);
    const bench = buildBench(dirtSurfaces.get('bench')!.texture);
    const fence = buildFence(dirtSurfaces.get('fence')!.texture);
    const bicycle = buildBicycle(dirtSurfaces.get('bicycle')!.texture);
    const cart = buildCart(dirtSurfaces.get('cart')!.texture);
    const birdbath = buildBirdbath(dirtSurfaces.get('birdbath')!.texture);
    const scenicCar = buildScenicCar();

    scene.add(house, driveway, bench, fence, bicycle, cart, birdbath, scenicCar);

    // ── Additional environment dressing ──
    // Mailbox
    const mailboxPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.7 }));
    mailboxPost.position.set(8, 0.6, 7.5);
    mailboxPost.castShadow = true;
    const mailbox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.25), new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.3, metalness: 0.5 }));
    mailbox.position.set(8, 1.35, 7.5);
    scene.add(mailboxPost, mailbox);

    // Street lamp
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.5, 8), new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.3, metalness: 0.7 }));
    lampPost.position.set(12, 2.25, 10);
    lampPost.castShadow = true;
    const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: '#4b5563' }));
    lampHead.position.set(12, 4.6, 10);
    scene.add(lampPost, lampHead);

    // Neighbor house (background, no interaction)
    const neighborMat = new THREE.MeshStandardMaterial({ color: '#d4c5a0', roughness: 0.85 });
    const neighbor = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 7), neighborMat);
    neighbor.position.set(-20, 2.5, -6);
    const neighborRoof = new THREE.Mesh(
      new THREE.ConeGeometry(8, 3, 4),
      new THREE.MeshStandardMaterial({ color: '#7c3a1a', roughness: 0.8 })
    );
    neighborRoof.position.set(-20, 6.5, -6);
    neighborRoof.rotation.y = Math.PI / 4;
    scene.add(neighbor, neighborRoof);

    // Trees
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: '#5c3d1e', roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#2d7a32', roughness: 0.85 });
    const treePositions = [
      { x: -12, z: 4 }, { x: 14, z: -5 }, { x: -15, z: -8 },
      { x: 18, z: 5 }, { x: -18, z: 8 },
    ];
    for (const tp of treePositions) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 3, 6), treeTrunkMat);
      trunk.position.set(tp.x, 1.5, tp.z);
      trunk.castShadow = true;
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 8), leafMat);
      canopy.position.set(tp.x, 4.2, tp.z);
      canopy.castShadow = true;
      scene.add(trunk, canopy);
    }

    // Flower beds along house front
    const dirtBedMat = new THREE.MeshStandardMaterial({ color: '#4a3520', roughness: 0.9 });
    const flowerBed = new THREE.Mesh(new THREE.BoxGeometry(12, 0.15, 1.2), dirtBedMat);
    flowerBed.position.set(0, -0.075, -4.2);
    scene.add(flowerBed);
    // Small shrubs in flower bed
    const shrubMat = new THREE.MeshStandardMaterial({ color: '#306e2f', roughness: 0.85 });
    for (let x = -5; x <= 5; x += 2.5) {
      const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 6), shrubMat);
      shrub.position.set(x, 0.3, -4.2);
      shrub.scale.set(1, 0.7, 1);
      shrub.castShadow = true;
      scene.add(shrub);
    }

    // ── Water spray system ──
    const sprayEffect = new SprayEffect(500);
    scene.add(sprayEffect.points);
    scene.add(sprayEffect.splashRing);

    // ── Player meshes & cameras ──
    const playerMeshes = new Map<string, THREE.Group>();
    const playerCameras = new Map<string, THREE.PerspectiveCamera>();
    const fpWand = buildFirstPersonWand();

    // ── Desktop Pointer & Mouse Controls ──
    let isPointerDown = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // primary left click only
      isPointerDown = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      try { parent.setPointerCapture(e.pointerId); } catch {}
      onSprayChange?.(true);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDown) return;
      const dx = e.movementX !== undefined && e.movementX !== 0 ? e.movementX : (e.clientX - lastPointerX);
      const dy = e.movementY !== undefined && e.movementY !== 0 ? e.movementY : (e.clientY - lastPointerY);
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      if (dx !== 0 || dy !== 0) {
        onLook?.(-dx * 0.0035, -dy * 0.0035);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      try { parent.releasePointerCapture(e.pointerId); } catch {}
      onSprayChange?.(false);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      onNozzleCycle?.(e.deltaY > 0 ? 1 : -1);
    };

    parent.addEventListener('pointerdown', handlePointerDown);
    parent.addEventListener('pointermove', handlePointerMove);
    parent.addEventListener('pointerup', handlePointerUp);
    parent.addEventListener('pointercancel', handlePointerUp);
    parent.addEventListener('wheel', handleWheel, { passive: false });

    // ── Resize handling ──
    const resize = () => {
      renderer.setSize(parent.clientWidth, parent.clientHeight);
    };
    resize();
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(parent);

    // ── Render loop ──
    let animId = 0;
    let lastTime = performance.now();
    let lastDirtUpdate = 0;

    function renderLoop(now: number) {
      animId = requestAnimationFrame(renderLoop);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const wash = latestRoom.current.wash;
      const players = wash?.players || [];

      // Update dirt textures periodically
      if (wash && wash.packedGrids && now - lastDirtUpdate > 100) {
        lastDirtUpdate = now;
        const unpacked = unpackDirtGrids(wash.packedGrids, wash.objects);
        const isHighlight = players.some(p => p.highlight);

        for (const [id, grid] of Object.entries(unpacked)) {
          const ds = dirtSurfaces.get(id);
          if (ds) ds.updateFromGrid(grid, isHighlight);
        }
      }

      // Update players
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
      }

      // ── Camera & viewport rendering ──
      const activeViews = split && players.length > 1
        ? players.map(p => p.id)
        : [follow || players[0]?.id || ''];
      const viewCount = Math.min(4, Math.max(1, activeViews.length));

      renderer.setScissorTest(true);

      for (let i = 0; i < viewCount; i++) {
        const pId = activeViews[i];
        const pState = players.find(p => p.id === pId) || players[0];
        if (!pState) continue;

        let cam = playerCameras.get(pId);
        if (!cam) {
          cam = new THREE.PerspectiveCamera(65, 1, 0.1, 250);
          playerCameras.set(pId, cam);
          scene.add(cam);
        }

        const isFirstPerson = viewCount === 1 && pId === follow;

        if (isFirstPerson) {
          // Attach wand to camera if not already attached
          if (fpWand.parent !== cam) {
            cam.add(fpWand);
          }
          fpWand.visible = true;

          cam.position.set(pState.x, 1.55, pState.z);
          const ownMesh = playerMeshes.get(pId);
          if (ownMesh) ownMesh.visible = false;

          const isSpraying = pState.spraying || (localSprayState?.spraying && pId === follow);
          const nozzleIdx = localSprayState?.nozzle ?? pState.nozzle;

          // Wand position recoil kickback & breathing bob
          if (isSpraying) {
            fpWand.position.set(
              0.22 + (Math.random() - 0.5) * 0.003,
              -0.20 + (Math.random() - 0.5) * 0.005,
              -0.34 + Math.sin(now * 0.08) * 0.012
            );
            fpWand.rotation.x = -0.04 + (Math.random() - 0.5) * 0.015;
          } else {
            fpWand.position.set(
              0.22,
              -0.20 + Math.sin(now * 0.002) * 0.003,
              -0.34
            );
            fpWand.rotation.x = 0;
          }

          // Dynamic nozzle tip color
          const tipMesh = fpWand.getObjectByName('nozzleTip') as THREE.Mesh;
          if (tipMesh && tipMesh.material instanceof THREE.MeshStandardMaterial) {
            tipMesh.material.color.set(NOZZLES[nozzleIdx]?.color || '#eab308');
          }

          // Target object raycast detection
          const camDir = new THREE.Vector3();
          cam.getWorldDirection(camDir);
          const camPos: [number, number, number] = [cam.position.x, cam.position.y, cam.position.z];
          const camDirArr: [number, number, number] = [camDir.x, camDir.y, camDir.z];

          let closestDist = Infinity;
          let targetFound: { name: string; percent: number } | null = null;

          for (const def of CLEANABLE_OBJECTS) {
            const hit = intersectBox(camPos, camDirArr, def.center, def.size);
            if (hit.hit && hit.dist < 10 && hit.dist < closestDist) {
              closestDist = hit.dist;
              const st = latestRoom.current.wash?.objects[def.id];
              targetFound = {
                name: def.name,
                percent: st?.percent || 0,
              };
            }
          }

          if (targetFound) {
            onTargetObjectChange?.(targetFound.name, targetFound.percent);
          } else {
            onTargetObjectChange?.('', 0);
          }
        } else {
          fpWand.visible = false;
          const dist = 2.8;
          const height = 2.1;
          cam.position.set(
            pState.x + Math.sin(pState.yaw) * dist,
            height,
            pState.z + Math.cos(pState.yaw) * dist
          );
          const ownMesh = playerMeshes.get(pId);
          if (ownMesh) ownMesh.visible = true;
        }

        const cosP = Math.cos(pState.pitch);
        const lookTarget = new THREE.Vector3(
          cam.position.x - Math.sin(pState.yaw) * cosP * 10,
          cam.position.y + Math.sin(pState.pitch) * 10,
          cam.position.z - Math.cos(pState.yaw) * cosP * 10
        );
        cam.lookAt(lookTarget);

        // Water spray emission
        const isSpraying = pState.spraying || (localSprayState?.spraying && pId === follow);
        const nozzleIdx = localSprayState?.nozzle ?? pState.nozzle;

        if (isSpraying) {
          let origin: [number, number, number];
          if (isFirstPerson) {
            const tipMarker = fpWand.getObjectByName('tipMarker');
            const tipPos = new THREE.Vector3();
            if (tipMarker) tipMarker.getWorldPosition(tipPos);
            else tipPos.set(cam.position.x + 0.2, cam.position.y - 0.2, cam.position.z - 0.5);
            origin = [tipPos.x, tipPos.y, tipPos.z];
          } else {
            origin = [
              pState.x + Math.sin(pState.yaw + 0.25) * 0.35,
              1.35 + Math.sin(pState.pitch) * 0.25,
              pState.z + Math.cos(pState.yaw + 0.25) * 0.35,
            ];
          }
          const dir: [number, number, number] = [
            -Math.sin(pState.yaw) * cosP,
            Math.sin(pState.pitch),
            -Math.cos(pState.yaw) * cosP,
          ];
          sprayEffect.emit(origin, dir, nozzleIdx);
        }

        const vp = splitViewport(i, viewCount, parent!.clientWidth, parent!.clientHeight);
        cam.aspect = vp.width / vp.height;
        cam.updateProjectionMatrix();

        renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
        renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
        renderer.render(scene, cam);
      }

      renderer.setScissorTest(false);
      sprayEffect.update(dt);
    }

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      parent.removeEventListener('pointerdown', handlePointerDown);
      parent.removeEventListener('pointermove', handlePointerMove);
      parent.removeEventListener('pointerup', handlePointerUp);
      parent.removeEventListener('pointercancel', handlePointerUp);
      parent.removeEventListener('wheel', handleWheel);
      for (const ds of dirtSurfaces.values()) ds.dispose();
      sprayEffect.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [quality, split]);

  return (
    <div
      className="game-canvas wash-canvas"
      ref={mount}
      aria-label="Power Wash Simulator 2 live 3D suburban environment"
    />
  );
}

/* ────────────────────── Preview Component ────────────────────── */

export function PowerWashPreview() {
  const [demoRoom] = useState<RoomState>(() => {
    const players = [{ id: 'preview', name: 'Master Cleaner', color: '#2563eb', ready: true, connected: true }];
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
            color: '#2563eb',
            x: 0,
            y: 1.55,
            z: 3.5,
            yaw: Math.PI,
            pitch: -0.15,
            spraying: true,
            nozzle: 1,
            highlight: false,
            cleanedCount: 120,
            connected: true,
          },
        ],
        objects: {
          patio: { id: 'patio', name: 'Driveway', totalCells: 1024, cleanedCells: 120, percent: 12, completed: false },
          bench: { id: 'bench', name: 'Garden Bench', totalCells: 256, cleanedCells: 0, percent: 0, completed: false },
          bicycle: { id: 'bicycle', name: 'Family Car', totalCells: 256, cleanedCells: 0, percent: 0, completed: false },
          cart: { id: 'cart', name: 'Wheelbarrow', totalCells: 400, cleanedCells: 0, percent: 0, completed: false },
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

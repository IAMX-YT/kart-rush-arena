import { useEffect, useRef } from 'react';
import { type Race } from '../shared/types';
import { RX, RZ, WIDTH, TAU } from '../shared/simulation';

export function drawMap(canvas: HTMLCanvasElement, race: Race | null) {
  const c = canvas.getContext('2d');
  if (!c) return;
  const w = canvas.width,
    h = canvas.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = '#143d37';
  c.fillRect(0, 0, w, h);
  c.save();
  c.translate(w / 2, h / 2);
  const scale = Math.min(w / 122, h / 90);
  c.scale(scale, scale);
  c.lineWidth = WIDTH;
  c.strokeStyle = '#465365';
  c.beginPath();
  c.ellipse(0, 0, RX, RZ, 0, 0, TAU);
  c.stroke();
  c.lineWidth = 0.5;
  c.setLineDash([2, 2]);
  c.strokeStyle = '#dfdfba';
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = '#fff';
  c.fillRect(RX - 6, -0.5, 12, 1);
  for (const k of race?.karts || []) {
    c.fillStyle = k.color;
    c.beginPath();
    c.arc(k.x, k.z, 2, 0, TAU);
    c.fill();
    c.strokeStyle = '#101727';
    c.lineWidth = 0.4;
    c.stroke();
  }
  c.restore();
}

export function MiniMap({ race }: { race: Race | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMap(ref.current, race);
  }, [race]);
  return <canvas ref={ref} width={360} height={230} className="minimap" aria-label="Live race map" />;
}

export function HeroKart() {
  return (
    <svg viewBox="0 0 600 360" className="hero-kart" role="img" aria-label="Original lime green racing kart">
      <defs>
        <linearGradient id="body" x2=".7" y2="1">
          <stop stopColor="#e4ff99" />
          <stop offset="1" stopColor="#9dd83d" />
        </linearGradient>
      </defs>
      <ellipse cx="310" cy="300" rx="205" ry="28" fill="#000" opacity=".25" />
      <path d="M70 260 465 160 554 206 160 310Z" fill="#3b4758" />
      <g fill="#101727" stroke="#475367" strokeWidth="9">
        <ellipse cx="153" cy="274" rx="32" ry="44" transform="rotate(-20 153 274)" />
        <ellipse cx="462" cy="186" rx="26" ry="36" transform="rotate(-20 462 186)" />
        <ellipse cx="401" cy="283" rx="32" ry="45" transform="rotate(-20 401 283)" />
        <ellipse cx="119" cy="201" rx="27" ry="35" transform="rotate(-20 119 201)" />
      </g>
      <path d="m122 215 252-71 131 74-263 87Z" fill="url(#body)" />
      <path d="m242 305 263-87v-28l-263 80Z" fill="#77a72c" />
      <path d="m122 215 120 55v35l-120-61Z" fill="#b8ed55" />
      <path d="m339 228 80-24 55 32-83 27Z" fill="#e8ff4b" />
      <path d="m194 205 68-20 43 25-69 22Z" fill="#1f2a3b" />
      <path d="m220 187 5-49 52-12 25 24-5 59Z" fill="#263449" />
      <path d="m102 196-15-38 105-31 70 33-105 34Z" fill="#cfff75" />
      <path d="m87 158 105-31v-17L86 140Z" fill="#8bc43d" />
      <ellipse cx="283" cy="144" rx="34" ry="40" fill="#fbbf24" />
      <path d="m254 133 61-7 5 21-61 9Z" fill="#182539" />
      <path d="m451 229 38-11 16 9-37 13Z" fill="#fff" />
      <path d="m378 251 19-6 14 10-20 6Z" fill="#fff" />
    </svg>
  );
}

export function HeroWasher() {
  return (
    <svg viewBox="0 0 600 360" className="hero-kart hero-washer" role="img" aria-label="Original pressure washer wand blasting water">
      <defs>
        <linearGradient id="waterStream" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="80%" stopColor="#bae6fd" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <radialGradient id="splashGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* High pressure water jet */}
      <polygon points="120,220 480,110 500,160 140,240" fill="url(#waterStream)" opacity="0.85" />
      <polygon points="130,225 520,80 540,190 145,235" fill="url(#waterStream)" opacity="0.4" />
      {/* Splash impact starburst */}
      <circle cx="510" cy="135" r="45" fill="url(#splashGlow)" />
      <circle cx="530" cy="115" r="12" fill="#ffffff" />
      <circle cx="490" cy="95" r="8" fill="#bae6fd" />
      <circle cx="545" cy="155" r="10" fill="#38bdf8" />
      {/* Washer lance & trigger handle */}
      <rect x="30" y="240" width="70" height="24" rx="6" fill="#1e293b" />
      <rect x="75" y="228" width="80" height="18" rx="4" fill="#334155" transform="rotate(-20 75 228)" />
      <rect x="120" y="222" width="16" height="28" rx="3" fill="#e2e8f0" />
      <line x1="80" y1="264" x2="35" y2="310" stroke="#0284c7" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

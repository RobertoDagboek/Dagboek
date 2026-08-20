// Spartan helmet icon: gold on crimson.
//
// No image library here, so this is a small rasteriser - scanline polygon fill
// into a buffer rendered at 4x, then area-averaged down. The supersampling is
// what gives clean curved edges at 180px.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons') + '/';
const D = 512;        // design space
const SS = 4;         // supersample factor
const W = D * SS;

/* ------------------------------ colour ------------------------------ */

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const GOLD_RAMP = [
  [0.00, [86, 54, 8]],
  [0.30, [148, 100, 18]],
  [0.52, [198, 148, 38]],
  [0.72, [232, 192, 92]],
  [0.88, [248, 222, 148]],
  [1.00, [255, 244, 205]],
];

function ramp(stops, l) {
  l = Math.max(0, Math.min(1, l));
  for (let i = 1; i < stops.length; i++) {
    if (l <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      return mix(c0, c1, (l - p0) / (p1 - p0));
    }
  }
  return stops[stops.length - 1][1];
}

/** Lit from the upper left, with a soft highlight on the brow. */
function gold(x, y) {
  const nx = (x - 256) / 135;
  const ny = (y - 250) / 155;
  let l = 0.54 - ny * 0.40 - nx * 0.14;
  l += 0.16 * Math.exp(-(((nx + 0.4) ** 2) + ((ny + 0.55) ** 2)) * 2.6);
  return ramp(GOLD_RAMP, l);
}

function goldDark(x, y) {
  const c = gold(x, y);
  return [c[0] * 0.58, c[1] * 0.55, c[2] * 0.5];
}

function goldBright(x, y) {
  const c = gold(x, y);
  return [Math.min(255, c[0] * 1.25 + 30), Math.min(255, c[1] * 1.25 + 26), Math.min(255, c[2] * 1.2 + 20)];
}

function background(x, y) {
  const d = Math.hypot(x - 256, y - 215) / 340;
  return mix([138, 20, 34], [52, 7, 15], Math.min(1, d) ** 1.35);
}

const SHADOW = (x, y) => {
  const c = background(x, y);
  return [c[0] * 0.55, c[1] * 0.5, c[2] * 0.5];
};

/* ---------------------------- rasteriser ---------------------------- */

const buf = new Uint8ClampedArray(W * W * 4);

function fillAll(colorFn) {
  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      const [r, g, b] = colorFn((px + 0.5) / SS, (py + 0.5) / SS);
      const i = (py * W + px) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
}

/** Even-odd scanline fill of a closed polygon given in design coordinates. */
function fillPoly(points, colorFn) {
  const pts = points.map(([x, y]) => [x * SS, y * SS]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(W - 1, Math.ceil(maxY));

  for (let py = y0; py <= y1; py++) {
    const sy = py + 0.5;
    const xs = [];
    for (let i = 0, n = pts.length; i < n; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % n];
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
        xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let px = xa; px <= xb; px++) {
        const [r, g, b] = colorFn((px + 0.5) / SS, (py + 0.5) / SS);
        const i = (py * W + px) * 4;
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
      }
    }
  }
}

/* ----------------------------- geometry ----------------------------- */

const rad = deg => (deg * Math.PI) / 180;

/** Points along an ellipse arc; 0deg is to the right, angles run clockwise. */
function arc(cx, cy, rx, ry, a0, a1, steps = 64) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / steps);
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

function mirrorX(points, axis = 256) {
  return points.map(([x, y]) => [2 * axis - x, y]);
}

/** A rounded rectangle as a polygon. */
function roundRect(x0, y0, x1, y1, r) {
  return [
    ...arc(x1 - r, y0 + r, r, r, -90, 0, 12),
    ...arc(x1 - r, y1 - r, r, r, 0, 90, 12),
    ...arc(x0 + r, y1 - r, r, r, 90, 180, 12),
    ...arc(x0 + r, y0 + r, r, r, 180, 270, 12),
  ];
}

/* ------------------------------- draw ------------------------------- */

fillAll(background);

const scaleAbout = (pts, k, cx = 256, cy = 292) =>
  pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

// --- the crest: a tall plume arching over the crown, drawn first so the
//     dome overlaps its base
const CREST = [
  [188, 196], [176, 146], [180, 100], [198, 58], [226, 28],
  [258, 16], [292, 22], [318, 48], [336, 90], [346, 140], [348, 196],
  [318, 186], [312, 132], [296, 92], [272, 74], [246, 80], [222, 112], [208, 156], [202, 196],
];
fillPoly(CREST, (x, y) => {
  // strands fanning out from a point below the crown
  const a = Math.atan2(y - 230, x - 258);
  const band = Math.sin(a * 30);
  const t = Math.max(0, Math.min(1, (200 - y) / 165));
  const base = mix([88, 12, 24], [178, 30, 44], t);
  const k = band > 0.2 ? 1.24 : band < -0.2 ? 0.7 : 1;
  return [base[0] * k, base[1] * k, base[2] * k];
});

// --- crest holder: a slim gold fin at the crown
fillPoly([[245, 96], [267, 96], [274, 136], [272, 192], [240, 192], [238, 136]], gold);

// --- helmet silhouette, with cheek plates sweeping to a point
const HELMET_RIGHT = [
  [256, 130],
  ...arc(256, 272, 114, 142, -90, -12, 44),
  [370, 330], [366, 372], [354, 410], [334, 440], [308, 462], [282, 477], [264, 483], [256, 484],
];
const HELMET = [...HELMET_RIGHT, ...mirrorX(HELMET_RIGHT).reverse()];

// a dark rim first, so gold never bleeds into the red at small sizes
fillPoly(scaleAbout(HELMET, 1.035), (x, y) => {
  const c = gold(x, y);
  return [c[0] * 0.3, c[1] * 0.26, c[2] * 0.2];
});
fillPoly(HELMET, gold);

// --- rim highlight along the top of the dome
fillPoly(
  [
    ...arc(256, 272, 114, 142, -172, -8, 60),
    ...arc(256, 272, 101, 128, -8, -172, 60),
  ],
  goldBright,
);

// --- engraved brow band
fillPoly(roundRect(142, 230, 370, 266, 14), goldDark);
fillPoly(roundRect(148, 235, 364, 244, 4), goldBright);

// --- the T-shaped opening: eye slots across, nose and mouth gap down
const DARK = (x, y) => {
  const c = background(x, y);
  return [c[0] * 0.2 + 7, c[1] * 0.16 + 3, c[2] * 0.18 + 6];
};
fillPoly(roundRect(176, 274, 336, 320, 16), DARK);
// The stem splits the cheek plates, stopping just inside the chin so it never
// bleeds onto the red.
fillPoly([[236, 276], [276, 276], [282, 400], [277, 458], [256, 472], [235, 458], [230, 400]], DARK);

// --- nose ridge above the opening
fillPoly([[247, 192], [265, 192], [269, 230], [243, 230]], goldBright);

/* ------------------------------ output ------------------------------ */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(b) {
  let c = -1;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Area-average downsample from the W buffer to `size`. */
function resize(size) {
  const out = Buffer.alloc(size * size * 4);
  const step = W / size;
  for (let y = 0; y < size; y++) {
    const sy0 = Math.floor(y * step), sy1 = Math.min(W, Math.ceil((y + 1) * step));
    for (let x = 0; x < size; x++) {
      const sx0 = Math.floor(x * step), sx1 = Math.min(W, Math.ceil((x + 1) * step));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * W + sx) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return out;
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  const out = png(size, resize(size));
  writeFileSync(OUT + name, out);
  console.log(`wrote ${name}  ${size}x${size}  ${(out.length / 1024).toFixed(1)} KB`);
}

/* --------------------- matching SVG (favicon) --------------------- */
// Same geometry, flat gradients instead of the per-pixel shading.

const pp = pts => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

const DEFS = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="68%">
      <stop offset="0" stop-color="#8a1422"/>
      <stop offset="1" stop-color="#34070f"/>
    </radialGradient>
    <linearGradient id="gold" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#f8e6ae"/>
      <stop offset="0.42" stop-color="#d5a52e"/>
      <stop offset="1" stop-color="#7d5610"/>
    </linearGradient>
    <linearGradient id="plume" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0" stop-color="#c81f31"/>
      <stop offset="1" stop-color="#69101d"/>
    </linearGradient>
  </defs>`;

const FIGURE = `
  <polygon points="${pp(CREST)}" fill="url(#plume)"/>
  <polygon points="${pp([[245, 96], [267, 96], [274, 136], [272, 192], [240, 192], [238, 136]])}" fill="url(#gold)"/>
  <polygon points="${pp(HELMET)}" fill="url(#gold)" stroke="#3d2a06" stroke-width="7" stroke-linejoin="round"/>
  <rect x="142" y="230" width="228" height="36" rx="14" fill="#8d6413"/>
  <rect x="148" y="235" width="216" height="9" rx="4" fill="#f4dfa2"/>
  <rect x="176" y="274" width="160" height="46" rx="16" fill="#1d0409"/>
  <polygon points="${pp([[236, 276], [276, 276], [282, 400], [277, 458], [256, 472], [235, 458], [230, 400]])}" fill="#1d0409"/>
  <polygon points="${pp([[247, 192], [265, 192], [269, 230], [243, 230]])}" fill="#f4dfa2"/>`;

writeFileSync(
  OUT + 'icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>${FIGURE}
</svg>\n`,
);

// Maskable: same art, shrunk into the safe zone so Android's mask cannot clip it.
writeFileSync(
  OUT + 'icon-maskable.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(0.7) translate(-256 -262)">${FIGURE}
  </g>
</svg>\n`,
);

console.log('wrote icon.svg and icon-maskable.svg');



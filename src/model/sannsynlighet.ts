import type { Modellantakelser, Observasjonsklasse } from '../data/modellantakelser';
import { cellAreaKm2, cellX, cellY, type Grid } from './grid';
import { blandingRinger, tetthet, vektetFart, type Komponent } from './lpb';
import { glatt } from './raster';

/**
 * Probability (POA) per cell, see docs/modell.md:
 * 1. distance from IPP (weighted mixture of categories), lightly smoothed
 * 2. reach: cells that need more walking time than available fall off quickly
 * 3. ledelinjer: higher weight near and along them
 * 4. water/sea/unreachable cells: low weight
 * 5. observations: gaussian increase, spread grows with time since the observation
 * 6. normalise → POA before searches (prior)
 * 7. searches: each teig × (1 − accumulated POD), normalise again → POA now
 */
export interface Observasjon {
  x: number;
  y: number;
  timerSiden: number;
  klasse: Observasjonsklasse;
  /** walking time from the observation (h at 1 km/h); null → straight-line distance */
  T1?: Float32Array | null;
}

/** Classes that become a new starting point (veileder 5.3); the rest only weight locally. */
export const UTGANGSPUNKT: Observasjonsklasse[] = ['sikker', 'sannsynlig'];

export interface SokMaske {
  celler: Int32Array;
  pod: number;
}

export interface SannsynlighetInput {
  g: Grid;
  komps: Komponent[];
  m: Modellantakelser;
  /** hours at 1 km/h (cost distance) – null: straight line distance is used */
  T1: Float32Array | null;
  timerSidenSistSett: number | null;
  naer: Uint8Array | null;
  korridor: Uint8Array | null;
  vann: Uint8Array | null;
  hav: Uint8Array | null;
  observasjoner: Observasjon[];
  sok: SokMaske[];
  /** remaining share per cell after search effort outside teiger (checked points/lines, GPS tracks) */
  innsats?: Float32Array | null;
}

export interface SannsynlighetResultat {
  prior: Float64Array;
  post: Float64Array;
  /** share of the prior probability searched away (Σ POS) */
  sokt: number;
  /** 0: 25 %, 1: 50 %, 2: 75 %, 3: 95 %, -1: outside */
  band: Int8Array;
  /** smallest area (km²) holding 25/50/75/95 % */
  arealKm2: [number, number, number, number];
  ringer: [number, number, number, number];
  /** cell indices sorted by post, descending */
  orden: Uint32Array;
}

export function normaliser(p: Float64Array): number {
  let s = 0;
  for (let k = 0; k < p.length; k++) s += p[k];
  if (s > 0) for (let k = 0; k < p.length; k++) p[k] /= s;
  return s;
}

/** Reach factor for one category (1 inside, quickly falling outside). */
export function rekkeviddeFaktor(timer: number, tilgjengelig: number, myk: number): number {
  if (!Number.isFinite(timer)) return 0;
  if (timer <= tilgjengelig) return 1;
  const s = myk * tilgjengelig + 0.05;
  return Math.exp(-(((timer - tilgjengelig) / s) ** 2));
}

export function beregnSannsynlighet(inp: SannsynlighetInput): SannsynlighetResultat {
  const { g, komps, m } = inp;
  const n = g.n;
  const N = n * n;
  const p = new Float64Array(N);
  const comp = new Float64Array(N);
  const dist = new Float64Array(N);
  for (let j = 0; j < n; j++) {
    const y = cellY(g, j) - g.cy;
    for (let i = 0; i < n; i++) dist[j * n + i] = Math.hypot(cellX(g, i) - g.cx, y) / g.k;
  }

  for (const c of komps) {
    for (let k = 0; k < N; k++) comp[k] = tetthet(c, dist[k], m.haleFaktor);
    glatt(comp, n, m.glatting);
    const tilgj = inp.timerSidenSistSett != null ? m.effektivFremdrift * Math.min(inp.timerSidenSistSett, c.mob) : null;
    for (let k = 0; k < N; k++) {
      let f = 1;
      const t1 = inp.T1 ? inp.T1[k] : dist[k] / 1000;
      if (!Number.isFinite(t1)) f = m.uoppnaaeligVekt;
      else if (tilgj != null) f = Math.max(rekkeviddeFaktor(t1 / c.v, tilgj, m.rekkeviddeMyk), 1e-9);
      p[k] += c.w * comp[k] * f;
    }
  }

  const terrengvekt = (a: Float64Array) => {
    for (let k = 0; k < N; k++) {
      if (inp.naer?.[k]) a[k] *= m.vektNaer;
      else if (inp.korridor?.[k]) a[k] *= m.vektKorridor;
      if (inp.hav?.[k]) a[k] *= m.havVekt;
      else if (inp.vann?.[k]) a[k] *= m.vannVekt;
    }
  };
  terrengvekt(p);
  normaliser(p);

  const ringer = blandingRinger(komps, m.haleFaktor);
  const { v, mob } = vektetFart(komps);
  const spredningM = (h: number) =>
    Math.min(ringer[3], Math.max(m.obsMinSpredningM, v * 1000 * m.effektivFremdrift * Math.min(h, mob) * m.obsSpredning));

  // sikker/sannsynlig: new starting point with share w/(w + K), spread by walking time from it
  let rSum = 0;
  for (const o of inp.observasjoner) {
    const w = m.obsVekt[o.klasse] ?? 0;
    if (w <= 0 || !UTGANGSPUNKT.includes(o.klasse)) continue;
    const r = w / Math.max(0.01, m.obsAndelK);
    const sgT = spredningM(Math.max(0, o.timerSiden)) / (1000 * v); // hours
    const G = new Float64Array(N);
    for (let j = 0; j < n; j++) {
      const dy = cellY(g, j) - o.y;
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const t = o.T1 ? o.T1[k] / v : Math.hypot(cellX(g, i) - o.x, dy) / g.k / (1000 * v);
        G[k] = Number.isFinite(t) ? Math.exp(-0.5 * (t / sgT) ** 2) : 0;
      }
    }
    terrengvekt(G);
    if (normaliser(G) <= 0) continue;
    for (let k = 0; k < N; k++) p[k] += r * G[k];
    rSum += r;
  }
  if (rSum > 0) for (let k = 0; k < N; k++) p[k] /= 1 + rSum;

  // mulig: local weighting only
  for (const o of inp.observasjoner) {
    const w = m.obsVekt[o.klasse] ?? 0;
    if (w <= 0 || UTGANGSPUNKT.includes(o.klasse)) continue;
    const h = Math.max(0, o.timerSiden);
    const sg = spredningM(h);
    const r = sg * 4;
    const i0 = Math.max(0, Math.floor((o.x - r - g.west) / g.cell));
    const i1 = Math.min(n - 1, Math.floor((o.x + r - g.west) / g.cell));
    const j0 = Math.max(0, Math.floor((g.north - o.y - r) / g.cell));
    const j1 = Math.min(n - 1, Math.floor((g.north - o.y + r) / g.cell));
    for (let j = j0; j <= j1; j++) {
      const dy = cellY(g, j) - o.y;
      for (let i = i0; i <= i1; i++) {
        const dx = cellX(g, i) - o.x;
        p[j * n + i] *= 1 + w * Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg));
      }
    }
  }

  normaliser(p);
  const prior = Float64Array.from(p);
  for (const s of inp.sok) {
    const f = 1 - Math.min(1, Math.max(0, s.pod));
    for (const c of s.celler) p[c] *= f;
  }
  if (inp.innsats) for (let k = 0; k < N; k++) p[k] *= inp.innsats[k];
  const igjen = normaliser(p);
  const sokt = 1 - igjen;

  const orden = Uint32Array.from({ length: N }, (_, k) => k).sort((a, b) => p[b] - p[a]);
  const band = new Int8Array(N).fill(-1);
  const lim = [0.25, 0.5, 0.75, 0.95];
  const cnt = [0, 0, 0, 0];
  let cum = 0;
  let b = 0;
  for (const k of orden) {
    if (b > 3) break;
    band[k] = b;
    cnt[b]++;
    cum += p[k];
    while (b <= 3 && cum >= lim[b] - 1e-12) b++;
  }
  const a = cellAreaKm2(g);
  const arealKm2 = [0, 1, 2, 3].map((i) => cnt.slice(0, i + 1).reduce((x, y) => x + y, 0) * a) as [number, number, number, number];
  return { prior, post: p, sokt, band, arealKm2, ringer, orden };
}

/** Sum of a field over a set of cells. */
export function sumCeller(f: ArrayLike<number>, celler: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < celler.length; i++) s += f[celler[i]];
  return s;
}

/** Top cells with a minimum separation (m). */
export function mestSannsynlige(g: Grid, post: Float64Array, orden: Uint32Array, antall: number, sep: number): number[] {
  const ut: number[] = [];
  const xy: Array<[number, number]> = [];
  for (const k of orden) {
    if (ut.length >= antall || post[k] <= 0) break;
    const i = k % g.n;
    const j = (k - i) / g.n;
    const x = cellX(g, i);
    const y = cellY(g, j);
    if (xy.every(([a, b]) => Math.hypot(a - x, b - y) >= sep)) {
      ut.push(k);
      xy.push([x, y]);
    }
  }
  return ut;
}

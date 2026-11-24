import { gangtid, type Terreng } from './gangtid';
import { cellIndex, cellX, cellY, type Grid } from './grid';
import type { Komponent } from './lpb';
import { forCellsInPolygon, type XY } from './raster';

/**
 * Sperreposter (veileder 6.3.2: «hindre at den savnede tar seg forbi punktet»), also lookout
 * posts. MODELLANTAKELSE:
 * - A post works only for the share of the category mixture that cannot have passed it
 *   before it was set up: set up t hours after last seen, the person (speed v, effective
 *   progress e) reaches it after T1(post) / (v · e) hours.
 * - Its coverage (a circle, or a drawn field across a valley) is a barrier in the walking
 *   time. Cells whose fastest route goes through the coverage lie «behind» the post: there the
 *   probability is lowered by the post's POD (standard 80 %) for those categories.
 * - Sure/probable observations behind the post still count (they show the person passed).
 */
export interface SperrepostInput {
  id: string;
  x: number;
  y: number;
  /** hours after last seen when the post was set up */
  timerEtter: number;
  radiusM: number;
  /** drawn field (grid coordinates) instead of the circle */
  felt?: XY[];
}

export interface SperrepostResultat {
  id: string;
  /** share of the category mixture the post was in time for (0..1) */
  andel: number;
  /** earliest arrival at the post (h, fastest category), null when it cannot be reached */
  naaTimer: number | null;
  /** share of the probability (POA now) behind the post */
  bakAndel: number;
  /** why it does not work: at the IPP, outside the map, set up too late */
  merknad?: 'ipp' | 'utenfor' | 'sent';
}

export interface Sperrer {
  /** probability factor per cell for each category (aligned with komps), null when no post works */
  faktor: Float32Array[] | null;
  /** cells behind the posts that work for at least half of the mixture (growth stops there) */
  bakSterk: Uint8Array | null;
  poster: Array<Omit<SperrepostResultat, 'bakAndel'> & { bak: Uint8Array | null }>;
}

/** At most this many posts change the model (one walking time each). */
export const MAKS_SPERREPOSTER = 8;

/** Cells covered by a post: inside the drawn field, or centre within the radius; always its own cell. */
export function sperreceller(g: Grid, p: SperrepostInput): number[] {
  const ut = new Set<number>();
  const egen = cellIndex(g, p.x, p.y);
  if (egen >= 0) ut.add(egen);
  if (p.felt && p.felt.length >= 3) {
    forCellsInPolygon(g, [p.felt], (idx) => ut.add(idx));
  } else {
    const r = p.radiusM * g.k;
    const i0 = Math.max(0, Math.floor((p.x - r - g.west) / g.cell));
    const i1 = Math.min(g.n - 1, Math.floor((p.x + r - g.west) / g.cell));
    const j0 = Math.max(0, Math.floor((g.north - p.y - r) / g.cell));
    const j1 = Math.min(g.n - 1, Math.floor((g.north - p.y + r) / g.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(cellX(g, i) - p.x, cellY(g, j) - p.y) <= r) ut.add(j * g.n + i);
  }
  return [...ut];
}

export function beregnSperrer(
  g: Grid,
  terreng: Terreng,
  T1: Float32Array,
  komps: Komponent[],
  m: { sperrepostPod: number; effektivFremdrift: number; maksHelning: number },
  poster: SperrepostInput[],
  start: number,
  cache?: Map<string, Float32Array>,
  cacheNokkel = '',
): Sperrer {
  const N = g.n * g.n;
  const pod = Math.min(1, Math.max(0, m.sperrepostPod));
  const sumW = komps.reduce((s, c) => s + c.w, 0) || 1;
  let faktor: Float32Array[] | null = null;
  let bakSterk: Uint8Array | null = null;
  const ut: Sperrer['poster'] = [];
  const brukt = new Set<string>();
  for (const p of poster.slice(0, MAKS_SPERREPOSTER)) {
    const c = cellIndex(g, p.x, p.y);
    if (c < 0 || !Number.isFinite(T1[c])) {
      ut.push({ id: p.id, andel: 0, naaTimer: null, merknad: 'utenfor', bak: null });
      continue;
    }
    const celler = sperreceller(g, p);
    if (celler.includes(start)) {
      ut.push({ id: p.id, andel: 0, naaTimer: 0, merknad: 'ipp', bak: null });
      continue;
    }
    // in time for which categories: set up before the person could reach it
    const iTide = komps.map((k) => p.timerEtter <= T1[c] / (k.v * m.effektivFremdrift));
    const andel = komps.reduce((s, k, i) => s + (iTide[i] ? k.w : 0), 0) / sumW;
    const naaTimer = Math.min(...komps.map((k) => T1[c] / (k.v * m.effektivFremdrift)));
    if (andel <= 0 || pod <= 0) {
      ut.push({ id: p.id, andel: 0, naaTimer, merknad: 'sent', bak: null });
      continue;
    }
    // walking time with the coverage as a barrier (cached per coverage)
    const nokkel = `${cacheNokkel}|${celler.join(',')}`;
    brukt.add(nokkel);
    let T1b = cache?.get(nokkel);
    if (!T1b) {
      const fart = Float32Array.from(terreng.fart);
      for (const k of celler) fart[k] = 0;
      T1b = gangtid(g, { ...terreng, fart }, [start], m.maksHelning);
      cache?.set(nokkel, T1b);
    }
    // behind: the fastest route goes through the coverage (or there is no other way)
    const bak = new Uint8Array(N);
    for (const k of celler) bak[k] = 1;
    for (let k = 0; k < N; k++) {
      if (!Number.isFinite(T1[k])) continue;
      if (!Number.isFinite(T1b[k]) || T1b[k] > T1[k] * 1.01 + 0.01) bak[k] = 1;
    }
    faktor ??= komps.map(() => new Float32Array(N).fill(1));
    komps.forEach((_, i) => {
      if (!iTide[i]) return;
      const f = faktor![i];
      for (let k = 0; k < N; k++) if (bak[k]) f[k] *= 1 - pod;
    });
    if (andel >= 0.5) {
      bakSterk ??= new Uint8Array(N);
      for (let k = 0; k < N; k++) if (bak[k]) bakSterk[k] = 1;
    }
    ut.push({ id: p.id, andel, naaTimer, bak });
  }
  if (cache) for (const k of [...cache.keys()]) if (!brukt.has(k)) cache.delete(k);
  return { faktor, bakSterk, poster: ut };
}

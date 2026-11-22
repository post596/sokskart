import type { LpbKategori, Ringer, Terreng } from '../data/lpb-stats';

/**
 * Radial distance model for one category.
 *
 * 25 % of the probability lies within R25, 25 % between R25 and R50, 25 % between R50
 * and R75 and 20 % between R75 and R95. Inside each band it is spread evenly over the
 * area. The last 5 % falls off exponentially outside R95 with length scale s = h·R95.
 */
export interface Komponent {
  key: string;
  navn: string;
  /** Mixture weight (sums to 1 over all components). */
  w: number;
  /** R25, R50, R75, R95 in metres, strictly increasing. */
  r: [number, number, number, number];
  /** Walking speed km/h. */
  v: number;
  /** Mobility hours. */
  mob: number;
  verifisert: boolean;
}

const Q = [0, 0.25, 0.5, 0.75, 0.95];

/** Probability density per m² at distance d (m). */
export function tetthet(c: Komponent, d: number, hale: number): number {
  const R = [0, ...c.r];
  for (let i = 0; i < 4; i++) {
    if (d < R[i + 1]) return (Q[i + 1] - Q[i]) / (Math.PI * (R[i + 1] ** 2 - R[i] ** 2));
  }
  const s = Math.max(1, hale * c.r[3]);
  const rho0 = 0.05 / (2 * Math.PI * s * (c.r[3] + s));
  return rho0 * Math.exp(-(d - c.r[3]) / s);
}

/** Cumulative probability within distance d (m). */
export function kumulativ(c: Komponent, d: number, hale: number): number {
  if (d <= 0) return 0;
  const R = [0, ...c.r];
  for (let i = 0; i < 4; i++) {
    if (d <= R[i + 1]) return Q[i] + ((Q[i + 1] - Q[i]) * (d * d - R[i] ** 2)) / (R[i + 1] ** 2 - R[i] ** 2);
  }
  const s = Math.max(1, hale * c.r[3]);
  const g = 1 - ((d + s) / (c.r[3] + s)) * Math.exp(-(d - c.r[3]) / s);
  return 0.95 + 0.05 * g;
}

export function blandingTetthet(cs: Komponent[], d: number, hale: number): number {
  let s = 0;
  for (const c of cs) s += c.w * tetthet(c, d, hale);
  return s;
}

export function blandingKumulativ(cs: Komponent[], d: number, hale: number): number {
  let s = 0;
  for (const c of cs) s += c.w * kumulativ(c, d, hale);
  return s;
}

/** Distance (m) where the mixture reaches cumulative probability q (bisection). */
export function kvantil(cs: Komponent[], q: number, hale: number): number {
  if (!cs.length) return 0;
  let lo = 0;
  let hi = Math.max(...cs.map((c) => c.r[3])) * 40;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (blandingKumulativ(cs, mid, hale) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** R25, R50, R75, R95 (m) of the mixture. For one component they equal its own values. */
export function blandingRinger(cs: Komponent[], hale: number): [number, number, number, number] {
  return [0.25, 0.5, 0.75, 0.95].map((q) => kvantil(cs, q, hale)) as [number, number, number, number];
}

/** Weighted mean walking speed and mobility (km/h, h). */
export function vektetFart(cs: Komponent[]): { v: number; mob: number } {
  let v = 0;
  let mob = 0;
  for (const c of cs) {
    v += c.w * c.v;
    mob += c.w * c.mob;
  }
  return { v, mob };
}

/** Make the ring set usable even if the user typed something inconsistent. */
export function ryddRinger(r: Ringer): [number, number, number, number] {
  const v = [r.r25, r.r50, r.r75, r.r95].map((x) => Math.max(0.01, Number.isFinite(x) ? x : 0.01) * 1000);
  v.sort((a, b) => a - b);
  for (let i = 1; i < 4; i++) if (v[i] <= v[i - 1]) v[i] = v[i - 1] + 1;
  return v as [number, number, number, number];
}

export interface ValgtKategori {
  key: string;
  /** Relative weight set by the user (any positive number). */
  vekt: number;
}

export function byggKomponenter(stats: LpbKategori[], valgte: ValgtKategori[], terreng: Terreng): Komponent[] {
  const brukte = valgte
    .map((v) => ({ v, s: stats.find((s) => s.key === v.key) }))
    .filter((x): x is { v: ValgtKategori; s: LpbKategori } => !!x.s && x.v.vekt > 0);
  const sum = brukte.reduce((a, x) => a + x.v.vekt, 0);
  return brukte.map(({ v, s }) => ({
    key: s.key,
    navn: s.navn,
    w: v.vekt / sum,
    r: ryddRinger(s[terreng]),
    v: Math.max(0.1, s.gangfart),
    mob: Math.max(0.1, s.mobilitet),
    verifisert: s.verifisert,
  }));
}

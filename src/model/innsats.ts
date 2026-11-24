import { distToSegment } from '../domain/geo';
import { cellAreaKm2, cellIndex, type Grid } from './grid';
import type { XY } from './raster';

/**
 * Search effort that is not a registered teig search: points and ledelinjer marked as
 * checked, and GPS tracks. Each is turned into swept ground area per cell, so a corridor
 * narrower than a cell only counts for the part of the cell it covers.
 *
 * Coordinates are grid (UTM) metres; distances in ground metres are multiplied by the
 * point scale factor g.k, and sampled areas divided by g.k².
 */

/** Adds the ground area (m²) swept by a corridor of `halvM` metres on each side of the line. */
export function sveipLinje(g: Grid, linje: XY[], halvM: number, legg: (idx: number, arealM2: number) => void): void {
  if (linje.length < 2 || halvM <= 0) return;
  const halv = halvM * g.k;
  // sample spacing: at most a quarter of a cell and of the corridor width
  const ds = Math.max(1, Math.min(g.cell, 2 * halv) / 4);
  const tvers = Math.max(1, Math.round((2 * halv) / ds));
  const dt = (2 * halv) / tvers;
  for (let k = 1; k < linje.length; k++) {
    const [x0, y0] = linje[k - 1];
    const [x1, y1] = linje[k];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L <= 0) continue;
    const ux = (x1 - x0) / L;
    const uy = (y1 - y0) / L;
    const langs = Math.max(1, Math.round(L / ds));
    const dl = L / langs;
    const a = (dl * dt) / (g.k * g.k);
    for (let i = 0; i < langs; i++) {
      const t = (i + 0.5) * dl;
      const cx = x0 + ux * t;
      const cy = y0 + uy * t;
      for (let j = 0; j < tvers; j++) {
        const o = -halv + (j + 0.5) * dt;
        const c = cellIndex(g, cx - uy * o, cy + ux * o);
        if (c >= 0) legg(c, a);
      }
    }
  }
}

/** Adds the ground area (m²) of a disc of radius `rM` metres around a point. */
export function sveipSkive(g: Grid, x: number, y: number, rM: number, legg: (idx: number, arealM2: number) => void): void {
  if (rM <= 0) return;
  const r = rM * g.k;
  const ds = Math.max(0.5, Math.min(g.cell / 4, r / 8));
  const n = Math.ceil(r / ds);
  const treff: number[] = [];
  let antall = 0;
  for (let j = -n; j < n; j++) {
    for (let i = -n; i < n; i++) {
      const px = (i + 0.5) * ds;
      const py = (j + 0.5) * ds;
      if (px * px + py * py > r * r) continue;
      antall++;
      treff.push(cellIndex(g, x + px, y + py));
    }
  }
  // scale the samples so the disc has exactly the area π·r² (ground metres)
  const a = (Math.PI * rM * rM) / Math.max(1, antall);
  for (const c of treff) if (c >= 0) legg(c, a);
}

/** Swept area per cell for one object (sparse). */
export function dekketAreal(fyll: (legg: (idx: number, arealM2: number) => void) => void): Map<number, number> {
  const m = new Map<number, number>();
  fyll((idx, a) => m.set(idx, (m.get(idx) ?? 0) + a));
  return m;
}

/**
 * Multiplies the remaining share Π(1 − POD) per cell with one object that has a fixed POD
 * inside its swept area: POD in a cell = pod × covered share of the cell.
 */
export function leggTilFastPod(g: Grid, igjen: Float32Array, dekket: Map<number, number>, pod: number): void {
  const cellM2 = cellAreaKm2(g) * 1e6;
  for (const [c, a] of dekket) igjen[c] *= 1 - Math.min(1, Math.max(0, pod)) * Math.min(1, a / cellM2);
}

/** Coverage C = swept area / cell area per cell (for GPS tracks: POD = 1 − e^−C). */
export function leggTilDekning(g: Grid, C: Float32Array, dekket: Map<number, number>, utelat?: Set<number>): void {
  const cellM2 = cellAreaKm2(g) * 1e6;
  for (const [c, a] of dekket) if (!utelat?.has(c)) C[c] += a / cellM2;
}

/**
 * Ledelinjer followed by GPS tracks: the share of each line (sampled every few metres) that
 * lies within a track's tolerance. Returns the lines with at least `minAndel`.
 */
export function linjerAvSpor(
  g: Grid,
  linjer: XY[][],
  spor: Array<{ id: string; xy: XY[]; tolM: number }>,
  minAndel: number,
): Array<{ i: number; andel: number; spor: string[] }> {
  if (!spor.length) return [];
  // segment hash
  const maksTol = Math.max(...spor.map((s) => s.tolM)) * g.k;
  const B = Math.max(50, 2 * maksTol);
  const boks = new Map<string, Array<{ s: number; a: XY; b: XY; tol: number }>>();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  spor.forEach((s, si) => {
    const tol = s.tolM * g.k;
    for (let k = 1; k < s.xy.length; k++) {
      const a = s.xy[k - 1];
      const b = s.xy[k];
      const bx0 = Math.min(a[0], b[0]) - tol;
      const bx1 = Math.max(a[0], b[0]) + tol;
      const by0 = Math.min(a[1], b[1]) - tol;
      const by1 = Math.max(a[1], b[1]) + tol;
      x0 = Math.min(x0, bx0);
      y0 = Math.min(y0, by0);
      x1 = Math.max(x1, bx1);
      y1 = Math.max(y1, by1);
      for (let i = Math.floor(bx0 / B); i <= Math.floor(bx1 / B); i++) {
        for (let j = Math.floor(by0 / B); j <= Math.floor(by1 / B); j++) {
          const key = `${i},${j}`;
          let l = boks.get(key);
          if (!l) boks.set(key, (l = []));
          l.push({ s: si, a, b, tol });
        }
      }
    }
  });
  const steg = Math.max(5, Math.min(25, maksTol / 2));
  const ut: Array<{ i: number; andel: number; spor: string[] }> = [];
  linjer.forEach((l, li) => {
    if (l.length < 2) return;
    let lx0 = Infinity;
    let ly0 = Infinity;
    let lx1 = -Infinity;
    let ly1 = -Infinity;
    for (const [x, y] of l) {
      lx0 = Math.min(lx0, x);
      ly0 = Math.min(ly0, y);
      lx1 = Math.max(lx1, x);
      ly1 = Math.max(ly1, y);
    }
    if (lx1 < x0 || lx0 > x1 || ly1 < y0 || ly0 > y1) return;
    let total = 0;
    let dekket = 0;
    const hvem = new Set<number>();
    for (let k = 1; k < l.length; k++) {
      const [ax, ay] = l[k - 1];
      const [bx, by] = l[k];
      const L = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(L / steg));
      for (let q = 0; q < n; q++) {
        const t = (q + 0.5) / n;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        total += L / n;
        const kand = boks.get(`${Math.floor(px / B)},${Math.floor(py / B)}`);
        if (!kand) continue;
        let truffet = false;
        for (const sg of kand) {
          if (distToSegment(px, py, sg.a[0], sg.a[1], sg.b[0], sg.b[1]) <= sg.tol) {
            truffet = true;
            hvem.add(sg.s);
          }
        }
        if (truffet) dekket += L / n;
      }
    }
    // ignore tiny bits of line (< 50 m)
    if (total / g.k < 50) return;
    const andel = dekket / total;
    if (andel >= minAndel) ut.push({ i: li, andel: Math.round(andel * 1000) / 1000, spor: [...hvem].map((s) => spor[s].id) });
  });
  return ut;
}

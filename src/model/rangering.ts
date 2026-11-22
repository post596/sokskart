import { cellIndex, sample, type Grid } from './grid';
import type { XY } from './raster';

/** Unique cells a polyline passes through (sampled every half cell), in order. */
export function cellerLangs(g: Grid, line: XY[]): Int32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (x: number, y: number) => {
    const c = cellIndex(g, x, y);
    if (c >= 0 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };
  if (line.length === 1) add(line[0][0], line[0][1]);
  for (let k = 1; k < line.length; k++) {
    const [x0, y0] = line[k - 1];
    const [x1, y1] = line[k];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (g.cell / 2)));
    for (let q = 0; q <= steps; q++) add(x0 + ((x1 - x0) * q) / steps, y0 + ((y1 - y0) * q) / steps);
  }
  return Int32Array.from(out);
}

export interface LinjeScore {
  /** index into the input lines */
  i: number;
  /** probability (POA now) along the line */
  na: number;
  /** probability before searches */
  for: number;
  celler: Int32Array;
}

/** Ranks lines by how much probability they pass through (prototype method). */
export function rangerLinjer(g: Grid, linjer: XY[][], post: Float64Array, prior: Float64Array): LinjeScore[] {
  const s: LinjeScore[] = linjer.map((l, i) => {
    const celler = cellerLangs(g, l);
    let na = 0;
    let f = 0;
    for (const c of celler) {
      na += post[c];
      f += prior[c];
    }
    return { i, na, for: f, celler };
  });
  return s.sort((a, b) => b.na - a.na);
}

/** Walking time (hours at 1 km/h) at each vertex of each line, bilinear in the grid. */
export function tidVedPunkter(g: Grid, T1: Float32Array, linjer: XY[][]): { tider: Float32Array; start: Uint32Array } {
  const start = new Uint32Array(linjer.length + 1);
  let tot = 0;
  linjer.forEach((l, i) => {
    start[i] = tot;
    tot += l.length;
  });
  start[linjer.length] = tot;
  const tider = new Float32Array(tot);
  linjer.forEach((l, i) => {
    l.forEach(([x, y], k) => {
      // the vertex' own cell is the path cell; fall back to interpolation if it is a barrier
      const c = cellIndex(g, x, y);
      const v = c >= 0 ? T1[c] : Number.POSITIVE_INFINITY;
      tider[start[i] + k] = Number.isFinite(v) ? v : sample(g, T1, x, y);
    });
  });
  return { tider, start };
}

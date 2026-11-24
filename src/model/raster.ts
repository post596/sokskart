import { distToSegment, pointInRing } from '../domain/geo';
import type { LatLng } from '../domain/coords';
import { cellX, cellY, tilGrid, type Grid } from './grid';

export type XY = [number, number];

/**
 * Calls `mark(index, distance)` for every cell whose centre is within `buffer` metres of
 * the polyline (grid coordinates). A cell is reported once per polyline with its
 * smallest distance.
 */
export function forCellsNearLine(g: Grid, line: XY[], buffer: number, mark: (idx: number, d: number) => void): void {
  if (line.length === 0) return;
  const best = new Map<number, number>();
  const segs = line.length === 1 ? [[line[0], line[0]]] : line.slice(1).map((b, k) => [line[k], b]);
  for (const [a, b] of segs) {
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - buffer - g.west) / g.cell));
    const i1 = Math.min(g.n - 1, Math.floor((Math.max(a[0], b[0]) + buffer - g.west) / g.cell));
    const j0 = Math.max(0, Math.floor((g.north - Math.max(a[1], b[1]) - buffer) / g.cell));
    const j1 = Math.min(g.n - 1, Math.floor((g.north - Math.min(a[1], b[1]) + buffer) / g.cell));
    for (let j = j0; j <= j1; j++) {
      const y = cellY(g, j);
      for (let i = i0; i <= i1; i++) {
        const d = distToSegment(cellX(g, i), y, a[0], a[1], b[0], b[1]);
        if (d <= buffer) {
          const idx = j * g.n + i;
          const prev = best.get(idx);
          if (prev === undefined || d < prev) best.set(idx, d);
        }
      }
    }
  }
  for (const [idx, d] of best) mark(idx, d);
}

/** Marks cells near a set of polylines with `value` (max of existing and value). */
export function rasterLinjer(g: Grid, lines: XY[][], buffer: number, out: Uint8Array, value = 1): void {
  // always mark the cells the line actually passes through
  const b = Math.max(buffer, g.cell * 0.71);
  for (const l of lines) {
    forCellsNearLine(g, l, b, (idx) => {
      if (out[idx] < value) out[idx] = value;
    });
  }
}

/**
 * Calls `mark(index)` for every cell whose centre lies inside the polygon. Rings use
 * the even–odd rule, so inner rings (holes) work when passed together with the outer.
 */
export function forCellsInPolygon(g: Grid, rings: XY[][], mark: (idx: number) => void): void {
  const all = rings.filter((r) => r.length >= 3);
  if (!all.length) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of all) {
    for (const [x, y] of r) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const i0 = Math.max(0, Math.floor((minX - g.west) / g.cell));
  const i1 = Math.min(g.n - 1, Math.floor((maxX - g.west) / g.cell));
  const j0 = Math.max(0, Math.floor((g.north - maxY) / g.cell));
  const j1 = Math.min(g.n - 1, Math.floor((g.north - minY) / g.cell));
  for (let j = j0; j <= j1; j++) {
    const y = cellY(g, j);
    for (let i = i0; i <= i1; i++) {
      const x = cellX(g, i);
      let inside = false;
      for (const r of all) if (pointInRing(x, y, r)) inside = !inside;
      if (inside) mark(j * g.n + i);
    }
  }
}

/** Cell indices inside a polygon given in lat/lng (rings: outer + holes, even–odd). */
export function cellerIPolygon(g: Grid, ringer: LatLng[][]): Int32Array {
  const c: number[] = [];
  forCellsInPolygon(
    g,
    ringer.map((r) => r.map((p) => tilGrid(g, p))),
    (idx) => c.push(idx),
  );
  return Int32Array.from(c);
}

export function rasterPolygon(g: Grid, rings: XY[][], out: Uint8Array, value = 1): void {
  forCellsInPolygon(g, rings, (idx) => {
    out[idx] = value;
  });
}

/** Box blur with radius 1, separable, edge-normalised, in place. */
export function glatt(a: Float64Array, n: number, pass = 1): void {
  const t = new Float64Array(n * n);
  for (let p = 0; p < pass; p++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        let c = 0;
        for (let k = -1; k <= 1; k++) {
          const q = i + k;
          if (q >= 0 && q < n) {
            s += a[j * n + q];
            c++;
          }
        }
        t[j * n + i] = s / c;
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        let c = 0;
        for (let k = -1; k <= 1; k++) {
          const q = j + k;
          if (q >= 0 && q < n) {
            s += t[q * n + i];
            c++;
          }
        }
        a[j * n + i] = s / c;
      }
    }
  }
}

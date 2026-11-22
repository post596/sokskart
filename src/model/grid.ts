import type { LatLng } from '../domain/coords';
import { fromUtm, pointScale, toUtm } from '../domain/utm';

/**
 * Square calculation grid centred on the IPP, axis aligned in UTM (EPSG:258zz).
 * Cell (i, j): i = column from west, j = row from north. Index = j * n + i.
 */
export interface Grid {
  zone: 32 | 33 | 35;
  n: number;
  /** cell size, grid metres */
  cell: number;
  half: number;
  /** IPP in UTM */
  cx: number;
  cy: number;
  /** west and north edges */
  west: number;
  north: number;
  /** point scale factor at the IPP (grid metres = k × ground metres) */
  k: number;
}

export function lagGrid(ipp: LatLng, zone: 32 | 33 | 35, half: number, n: number): Grid {
  const u = toUtm(ipp.lat, ipp.lng, zone);
  // odd number of cells so that the IPP lies in the centre of the middle cell
  let nn = Math.max(11, Math.round(n));
  if (nn % 2 === 0) nn += 1;
  return {
    zone,
    n: nn,
    cell: (2 * half) / nn,
    half,
    cx: u.e,
    cy: u.n,
    west: u.e - half,
    north: u.n + half,
    k: pointScale(ipp.lat, ipp.lng, zone),
  };
}

export const cellX = (g: Grid, i: number) => g.west + (i + 0.5) * g.cell;
export const cellY = (g: Grid, j: number) => g.north - (j + 0.5) * g.cell;

/** Cell index for grid coordinates, or -1 outside. */
export function cellIndex(g: Grid, x: number, y: number): number {
  const i = Math.floor((x - g.west) / g.cell);
  const j = Math.floor((g.north - y) / g.cell);
  if (i < 0 || j < 0 || i >= g.n || j >= g.n) return -1;
  return j * g.n + i;
}

export function tilGrid(g: Grid, p: LatLng): [number, number] {
  const u = toUtm(p.lat, p.lng, g.zone);
  return [u.e, u.n];
}

export function fraGrid(g: Grid, x: number, y: number): LatLng {
  const r = fromUtm(g.zone, x, y);
  return { lat: r.lat, lng: r.lon };
}

/** Ground area of one cell in km². */
export const cellAreaKm2 = (g: Grid) => (g.cell / g.k) ** 2 / 1e6;

/**
 * Bilinear sample of a cell-centred field at grid coordinates. NaN and non-finite
 * values propagate only if all four neighbours are non-finite.
 */
export function sample(g: Grid, f: ArrayLike<number>, x: number, y: number): number {
  const fx = (x - g.west) / g.cell - 0.5;
  const fy = (g.north - y) / g.cell - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  let s = 0;
  let w = 0;
  for (const [di, dj, ww] of [
    [0, 0, (1 - tx) * (1 - ty)],
    [1, 0, tx * (1 - ty)],
    [0, 1, (1 - tx) * ty],
    [1, 1, tx * ty],
  ] as const) {
    const i = i0 + di;
    const j = j0 + dj;
    if (i < 0 || j < 0 || i >= g.n || j >= g.n) continue;
    const v = f[j * g.n + i];
    if (!Number.isFinite(v) || ww === 0) continue;
    s += v * ww;
    w += ww;
  }
  return w > 0 ? s / w : Number.POSITIVE_INFINITY;
}

/**
 * Index from Web-Mercator pixels to grid cells so the grid can be drawn as a Leaflet
 * image overlay without misalignment from UTM grid convergence.
 */
export interface MercatorIndeks {
  /** [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]];
  width: number;
  height: number;
  /** cell index per pixel (row 0 = north), -1 outside the grid */
  index: Int32Array;
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

export function lagMercatorIndeks(g: Grid, width: number): MercatorIndeks {
  // bounding box of the grid square in lat/lng (sample the edges)
  let s = 90;
  let n = -90;
  let w = 180;
  let e = -180;
  const steps = 16;
  for (let k = 0; k <= steps; k++) {
    const t = -g.half + (2 * g.half * k) / steps;
    for (const [x, y] of [
      [g.cx + t, g.cy - g.half],
      [g.cx + t, g.cy + g.half],
      [g.cx - g.half, g.cy + t],
      [g.cx + g.half, g.cy + t],
    ]) {
      const p = fraGrid(g, x, y);
      s = Math.min(s, p.lat);
      n = Math.max(n, p.lat);
      w = Math.min(w, p.lng);
      e = Math.max(e, p.lng);
    }
  }
  const yS = mercY(s);
  const yN = mercY(n);
  const xSpan = ((e - w) * Math.PI) / 180;
  const height = Math.max(1, Math.round(width * ((yN - yS) / xSpan)));
  const index = new Int32Array(width * height);
  for (let py = 0; py < height; py++) {
    const lat = invMercY(yN - ((py + 0.5) / height) * (yN - yS));
    for (let px = 0; px < width; px++) {
      const lng = w + ((px + 0.5) / width) * (e - w);
      const u = toUtm(lat, lng, g.zone);
      index[py * width + px] = cellIndex(g, u.e, u.n);
    }
  }
  return { bounds: [[s, w], [n, e]], width, height, index };
}

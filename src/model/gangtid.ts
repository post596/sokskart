import type { Grid } from './grid';

/**
 * Walking time over terrain (cost distance) from one or more start cells.
 *
 * - Speed factor per cell: 1 on paths/roads, lower off path (Tobler: 0.6), 0 = barrier.
 * - Slope effect: Tobler's hiking function relative to flat ground,
 *   f(S) = exp(−3.5·|S + 0.05|) / exp(−3.5·0.05), with S = dh/dx along the move.
 * - Off path, moves steeper than `maksHelning` degrees are impossible.
 * - 16-neighbourhood (8 neighbours + knight moves) keeps the direction error small.
 *
 * Result: hours needed at a base speed of 1 km/h. Divide by the person's walking speed
 * (km/h) to get hours for that person. Unreachable cells are +Infinity.
 */
export interface Terreng {
  fart: Float32Array;
  sti: Uint8Array;
  hoyde: Float32Array | null;
}

const TOBLER_FLAT = Math.exp(-3.5 * 0.05);
export const toblerFaktor = (S: number) => Math.exp(-3.5 * Math.abs(S + 0.05)) / TOBLER_FLAT;

class MinHeap {
  k = new Float64Array(1024);
  v = new Int32Array(1024);
  size = 0;
  push(key: number, val: number) {
    if (this.size === this.k.length) {
      const k2 = new Float64Array(this.k.length * 2);
      k2.set(this.k);
      this.k = k2;
      const v2 = new Int32Array(this.v.length * 2);
      v2.set(this.v);
      this.v = v2;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p];
      this.v[i] = this.v[p];
      i = p;
    }
    this.k[i] = key;
    this.v[i] = val;
  }
  /** Pops the smallest; returns the value, key in `lastKey`. */
  lastKey = 0;
  pop(): number {
    const topV = this.v[0];
    this.lastKey = this.k[0];
    const k = this.k[--this.size];
    const v = this.v[this.size];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= this.size) break;
      const r = l + 1;
      const c = r < this.size && this.k[r] < this.k[l] ? r : l;
      if (this.k[c] >= k) break;
      this.k[i] = this.k[c];
      this.v[i] = this.v[c];
      i = c;
    }
    this.k[i] = k;
    this.v[i] = v;
    return topV;
  }
}

/** Moves with the intermediate cells they pass through (relative offsets). */
const MOVES: Array<{ di: number; dj: number; via: Array<[number, number]>; side?: Array<[number, number]> }> = [];
for (const [di, dj] of [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]) {
  MOVES.push({ di, dj, via: [] });
}
for (const [di, dj] of [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]) {
  MOVES.push({ di, dj, via: [], side: [[di, 0], [0, dj]] });
}
for (const [di, dj] of [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
]) {
  // a knight move passes through the two cells between start and end
  const via: Array<[number, number]> =
    Math.abs(di) === 2
      ? [
          [di / 2, 0],
          [di / 2, dj],
        ]
      : [
          [0, dj / 2],
          [di, dj / 2],
        ];
  MOVES.push({ di, dj, via });
}

/**
 * Terrain slope (gradient magnitude, degrees) per cell from central differences.
 * NaN where the elevation is unknown.
 */
export function helning(g: Grid, hoyde: Float32Array): Float32Array {
  const n = g.n;
  const c = g.cell / g.k;
  const out = new Float32Array(n * n);
  const at = (i: number, j: number) => hoyde[j * n + i];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // central differences inside, one-sided at the edges
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(n - 1, j + 1);
      const dx = i1 > i0 ? (at(i1, j) - at(i0, j)) / ((i1 - i0) * c) : 0;
      const dy = j1 > j0 ? (at(i, j1) - at(i, j0)) / ((j1 - j0) * c) : 0;
      out[j * n + i] = (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
    }
  }
  return out;
}

/** Sets speed to 0 off path where the slope exceeds `maksGrader`. Returns number of cells blocked. */
export function brattMaske(t: Terreng, slope: Float32Array, maksGrader: number): number {
  let c = 0;
  for (let k = 0; k < slope.length; k++) {
    if (slope[k] > maksGrader && t.sti[k] !== 1 && t.fart[k] > 0) {
      t.fart[k] = 0;
      c++;
    }
  }
  return c;
}

export function gangtid(g: Grid, t: Terreng, start: number[], maksHelningGrader: number): Float32Array {
  const n = g.n;
  const N = n * n;
  const T = new Float32Array(N).fill(Number.POSITIVE_INFINITY);
  const done = new Uint8Array(N);
  const heap = new MinHeap();
  const groundCell = g.cell / g.k;
  const maxS = Math.tan((Math.min(89, Math.max(1, maksHelningGrader)) * Math.PI) / 180);
  const h = t.hoyde;

  for (const s of start) {
    if (s >= 0 && s < N) {
      T[s] = 0;
      heap.push(0, s);
    }
  }

  while (heap.size) {
    const a = heap.pop();
    const ta = heap.lastKey;
    if (done[a]) continue;
    done[a] = 1;
    const ai = a % n;
    const aj = (a - ai) / n;
    const fa = t.fart[a];
    if (fa <= 0 && ta > 0) continue;
    const ha = h ? h[a] : 0;

    for (const mv of MOVES) {
      const bi = ai + mv.di;
      const bj = aj + mv.dj;
      if (bi < 0 || bj < 0 || bi >= n || bj >= n) continue;
      const b = bj * n + bi;
      if (done[b]) continue;
      const fb = t.fart[b];
      if (fb <= 0) continue;

      // cells passed on the way
      let slow = 1 / Math.max(fa, 1e-6) + 1 / fb;
      let cnt = 2;
      let blocked = false;
      for (const [vi, vj] of mv.via) {
        const c = (aj + vj) * n + (ai + vi);
        const fc = t.fart[c];
        if (fc <= 0) {
          blocked = true;
          break;
        }
        slow += 1 / fc;
        cnt++;
      }
      if (blocked) continue;
      if (mv.side) {
        const c1 = (aj + mv.side[0][1]) * n + (ai + mv.side[0][0]);
        const c2 = (aj + mv.side[1][1]) * n + (ai + mv.side[1][0]);
        if (t.fart[c1] <= 0 && t.fart[c2] <= 0) continue; // no corner cutting between barriers
      }

      const dist = groundCell * Math.hypot(mv.di, mv.dj);
      let S = 0;
      if (h) {
        const hb = h[b];
        if (Number.isFinite(ha) && Number.isFinite(hb)) S = (hb - ha) / dist;
      }
      const paaSti = t.sti[a] === 1 && t.sti[b] === 1;
      // steep terrain is handled by brattMaske(); this only stops absurd jumps (e.g. bad data)
      if (!paaSti && Math.abs(S) > maxS * 2) continue;

      const cost = ((dist / 1000) * (slow / cnt)) / toblerFaktor(S);
      const tb = ta + cost;
      if (tb < T[b]) {
        T[b] = tb;
        heap.push(tb, b);
      }
    }
  }
  return T;
}

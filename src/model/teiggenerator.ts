import type { Teknikk } from '../data/modellantakelser';
import type { Grid } from './grid';
import { forCellsNearLine, type XY } from './raster';
import { cellSoketid } from './soketid';

/**
 * Teiggenerator: deler et område inn i teiger som følger naturlige grenser.
 *
 * 1. Et fint rutenett (standard 25 m) legges over området.
 * 2. Grenser: ledelinjer (stier, veier, bekker, kraftgater, jernbane), stup og
 *    arealtypeskifter (skogkant, myrkant). Vann og bratt terreng er ikke med i teigene.
 * 3. Sammenhengende områder mellom grensene blir kandidater.
 * 4. Kandidater som tar mer enn maks søketid eller er større enn maks areal, deles med
 *    geodetisk k-means der kostnaden er høy over rygger og i dalbunner (fra høydedata), slik
 *    at delelinjene legger seg i terrengformer.
 * 5. Små biter slås sammen med en nabo. Grensecellene fordeles på naboene.
 * 6. Hver teig blir en polygon langs cellekantene, forenklet og glattet.
 */

export interface GeneratorInput {
  g: Grid;
  /** POA now per main cell */
  post: ArrayLike<number>;
  /** cells to divide (main grid) */
  maal: Uint8Array;
  /** cells already in teiger (main grid) */
  opptatt: Uint8Array;
  /** search speed factor per main cell (0 = cannot be searched on foot) */
  sokefaktor: Float32Array;
  /** land cover class per main cell (boundaries where it changes) */
  arealtype: Uint8Array;
  /** elevation per main cell (NaN unknown) */
  hoyde: Float32Array | null;
  /** natural boundary lines in grid coordinates */
  linjer: XY[][];
  teknikk: Teknikk;
  maksTimer: number;
  maksKm2: number;
  minKm2: number;
  /** fine cell size (m) */
  fin?: number;
  /** 'drone': no foot time, only area limits, and cells weighted by drone effect */
  modus?: 'teig' | 'drone';
  /** drone effect per main cell (0..1), drone mode only */
  droneeffekt?: Float32Array;
}

export interface GenerertTeig {
  /** outer ring in grid (UTM) coordinates */
  ring: XY[];
  arealKm2: number;
  /** search time (h) for one team with the given technique */
  timer: number;
  /** POA now inside */
  poa: number;
  /** ranking score (POA, × drone effect in drone mode) */
  score: number;
}

interface Fin {
  n: number; // width
  m: number; // height
  west: number;
  north: number;
  c: number;
  hoved: Int32Array; // main cell per fine cell, -1 outside
}

export function genererTeiger(inp: GeneratorInput): GenerertTeig[] {
  const { g } = inp;
  const drone = inp.modus === 'drone';
  // bounding box of target cells
  let i0 = g.n;
  let i1 = -1;
  let j0 = g.n;
  let j1 = -1;
  for (let k = 0; k < inp.maal.length; k++) {
    if (!inp.maal[k] || inp.opptatt[k]) continue;
    const i = k % g.n;
    const j = (k - i) / g.n;
    i0 = Math.min(i0, i);
    i1 = Math.max(i1, i);
    j0 = Math.min(j0, j);
    j1 = Math.max(j1, j);
  }
  if (i1 < 0) return [];
  const bredde = (i1 - i0 + 1) * g.cell;
  const hoydeM = (j1 - j0 + 1) * g.cell;
  let c = inp.fin ?? 25;
  while ((bredde / c) * (hoydeM / c) > 450 * 450) c *= 1.25;
  const F: Fin = {
    n: Math.ceil(bredde / c),
    m: Math.ceil(hoydeM / c),
    west: g.west + i0 * g.cell,
    north: g.north - j0 * g.cell,
    c,
    hoved: new Int32Array(0),
  };
  const NF = F.n * F.m;
  F.hoved = new Int32Array(NF);
  for (let jj = 0; jj < F.m; jj++) {
    const y = F.north - (jj + 0.5) * c;
    const j = Math.floor((g.north - y) / g.cell);
    for (let ii = 0; ii < F.n; ii++) {
      const x = F.west + (ii + 0.5) * c;
      const i = Math.floor((x - g.west) / g.cell);
      F.hoved[jj * F.n + ii] = i >= 0 && j >= 0 && i < g.n && j < g.n ? j * g.n + i : -1;
    }
  }
  const finArealKm2 = (c / g.k) ** 2 / 1e6;
  const andel = (c * c) / (g.cell * g.cell);

  // per fine cell: usable, time, POA share, score weight
  const brukbar = new Uint8Array(NF);
  const tid = new Float64Array(NF);
  const poa = new Float64Array(NF);
  const vekt = new Float64Array(NF);
  for (let p = 0; p < NF; p++) {
    const h = F.hoved[p];
    if (h < 0 || !inp.maal[h] || inp.opptatt[h]) continue;
    if (drone) {
      const e = inp.droneeffekt?.[h] ?? 0;
      if (e < 0.5) continue;
      vekt[p] = e;
    } else {
      if (inp.sokefaktor[h] <= 0) continue;
      tid[p] = cellSoketid(finArealKm2 * 1e6, inp.sokefaktor[h], inp.teknikk);
      vekt[p] = 1;
    }
    brukbar[p] = 1;
    poa[p] = inp.post[h] * andel;
  }

  // natural boundaries (foot teiger only; drone areas are shaped by suitability)
  const grense = new Uint8Array(NF);
  if (!drone) {
    const finGrid: Grid = { zone: g.zone, n: Math.max(F.n, F.m), cell: c, half: 0, cx: 0, cy: 0, west: F.west, north: F.north, k: g.k };
    for (const l of inp.linjer) {
      forCellsNearLine(finGrid, l, c * 0.75, (idx) => {
        const ii = idx % finGrid.n;
        const jj = (idx - ii) / finGrid.n;
        if (ii < F.n && jj < F.m) grense[jj * F.n + ii] = 1;
      });
    }
    // land cover changes (forest edge, wetland edge) at main-grid resolution
    for (let jj = 0; jj < F.m; jj++) {
      for (let ii = 0; ii < F.n; ii++) {
        const p = jj * F.n + ii;
        const h = F.hoved[p];
        if (h < 0) continue;
        const r = ii + 1 < F.n ? F.hoved[p + 1] : -1;
        const d = jj + 1 < F.m ? F.hoved[p + F.n] : -1;
        if ((r >= 0 && r !== h && inp.arealtype[r] !== inp.arealtype[h]) || (d >= 0 && d !== h && inp.arealtype[d] !== inp.arealtype[h])) grense[p] = 1;
      }
    }
  }

  // ridge/valley strength from elevation (soft boundaries when splitting)
  const rygg = new Float32Array(NF);
  if (inp.hoyde) {
    const hf = new Float32Array(NF).fill(Number.NaN);
    for (let p = 0; p < NF; p++) {
      const h = F.hoved[p];
      if (h >= 0) hf[p] = inp.hoyde[h];
    }
    const vals: number[] = [];
    for (let jj = 1; jj < F.m - 1; jj++) {
      for (let ii = 1; ii < F.n - 1; ii++) {
        const p = jj * F.n + ii;
        const L = hf[p - 1] + hf[p + 1] + hf[p - F.n] + hf[p + F.n] - 4 * hf[p];
        if (Number.isFinite(L)) {
          rygg[p] = Math.abs(L);
          vals.push(Math.abs(L));
        }
      }
    }
    vals.sort((a, b) => a - b);
    const p95 = vals[Math.floor(vals.length * 0.95)] || 1;
    for (let p = 0; p < NF; p++) rygg[p] = Math.min(1, rygg[p] / p95);
  }

  // 1. components between boundaries
  const del = new Int32Array(NF).fill(-1);
  const komponenter: number[][] = [];
  const stack: number[] = [];
  for (let p = 0; p < NF; p++) {
    if (!brukbar[p] || grense[p] || del[p] >= 0) continue;
    const id = komponenter.length;
    const celler: number[] = [];
    del[p] = id;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      celler.push(q);
      const ii = q % F.n;
      for (const r of [ii > 0 ? q - 1 : -1, ii < F.n - 1 ? q + 1 : -1, q - F.n, q + F.n]) {
        if (r < 0 || r >= NF || !brukbar[r] || grense[r] || del[r] >= 0) continue;
        del[r] = id;
        stack.push(r);
      }
    }
    komponenter.push(celler);
  }

  const mal = (celler: number[]) => {
    let t = 0;
    for (const p of celler) t += tid[p];
    const a = celler.length * finArealKm2;
    // 15 % margin: the boundary cells are added to the parts afterwards. Drone: 5 % margin so
    // a merged sliver never pushes an area over the maximum (one battery)
    return drone ? a / (inp.maksKm2 * 0.95) : Math.max(t / (inp.maksTimer * 0.85), a / (inp.maksKm2 * 0.9));
  };

  // 2. split too large parts (geodesic k-means with ridge cost)
  const deler: number[][] = [];
  const splitt = (celler: number[], dybde: number) => {
    const f = mal(celler);
    if (f <= 1 || dybde > 5 || celler.length < 8) {
      deler.push(celler);
      return;
    }
    const k = Math.min(celler.length >> 2, Math.ceil(f * 1.15));
    for (const d of kmeans(celler, k, F, rygg)) splitt(d, dybde + 1);
  };
  for (const kmp of komponenter) splitt(kmp, 0);

  // 3. merge small parts into a neighbour
  const minArealKm2 = inp.minKm2;
  let eier = new Int32Array(NF).fill(-1);
  const settEier = () => {
    eier = new Int32Array(NF).fill(-1);
    deler.forEach((d, i) => {
      for (const p of d) eier[p] = i;
    });
  };
  settEier();
  for (let runde = 0; runde < 3; runde++) {
    let endret = false;
    const rekkefolge = deler.map((_, i) => i).sort((a, b) => deler[a].length - deler[b].length);
    for (const i of rekkefolge) {
      const d = deler[i];
      if (!d.length || d.length * finArealKm2 >= minArealKm2) continue;
      // neighbours within 2 cells (across a boundary line)
      const nabo = new Map<number, number>();
      for (const p of d) {
        const ii = p % F.n;
        const jj = (p - ii) / F.n;
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            const a = ii + di;
            const b = jj + dj;
            if (a < 0 || b < 0 || a >= F.n || b >= F.m) continue;
            const o = eier[b * F.n + a];
            if (o >= 0 && o !== i && deler[o].length) nabo.set(o, (nabo.get(o) ?? 0) + 1);
          }
        }
      }
      let best = -1;
      let bestMal = Infinity;
      for (const [o] of nabo) {
        const m2 = mal([...deler[o], ...d]);
        // foot teiger may end up 10 % over the target (the target has a margin); drone areas may not
        if (m2 <= (drone ? 1 : 1.1) && m2 < bestMal) {
          best = o;
          bestMal = m2;
        }
      }
      // never break the time/area limit to reach the minimum size – heavy terrain gives small
      // teiger; only slivers (a few cells) always join the neighbour they touch most
      if (best < 0 && nabo.size && d.length * finArealKm2 < 0.01) best = [...nabo.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (best >= 0) {
        deler[best] = deler[best].concat(d);
        deler[i] = [];
        endret = true;
        settEier();
      }
    }
    if (!endret) break;
  }

  // 4. boundary cells go to the nearest neighbouring part (polygons meet on the line)
  if (!drone) {
    let front: number[] = [];
    for (let p = 0; p < NF; p++) if (eier[p] >= 0) front.push(p);
    for (let steg = 0; steg < 3 && front.length; steg++) {
      const neste: number[] = [];
      for (const q of front) {
        const ii = q % F.n;
        for (const r of [ii > 0 ? q - 1 : -1, ii < F.n - 1 ? q + 1 : -1, q - F.n, q + F.n]) {
          if (r < 0 || r >= NF || eier[r] >= 0 || !grense[r]) continue;
          const h = F.hoved[r];
          if (h < 0 || !inp.maal[h] || inp.opptatt[h] || inp.sokefaktor[h] <= 0) continue;
          eier[r] = eier[q];
          deler[eier[q]].push(r);
          poa[r] = inp.post[h] * andel;
          tid[r] = cellSoketid(finArealKm2 * 1e6, inp.sokefaktor[h], inp.teknikk);
          vekt[r] = 1;
          neste.push(r);
        }
      }
      front = neste;
    }
  }

  // 5. polygons
  const ut: GenerertTeig[] = [];
  deler.forEach((d, i) => {
    if (!d.length) return;
    const a = d.length * finArealKm2;
    if (drone && a < inp.minKm2 * 0.3) return;
    const ring = omriss(d, i, eier, F);
    if (ring.length < 4) return;
    let t = 0;
    let s = 0;
    let pa = 0;
    for (const p of d) {
      t += tid[p];
      pa += poa[p];
      s += poa[p] * vekt[p];
    }
    ut.push({ ring, arealKm2: a, timer: drone ? 0 : t, poa: pa, score: s });
  });
  return ut.sort((a, b) => b.score - a.score);
}

/** Geodesic k-means inside a cell set; step cost rises over ridges and valley bottoms. */
function kmeans(celler: number[], k: number, F: Fin, rygg: Float32Array): number[][] {
  const inn = new Map<number, number>();
  celler.forEach((p, i) => inn.set(p, i));
  const xy = (p: number): [number, number] => [p % F.n, Math.floor(p / F.n)];
  // farthest point seeding (deterministic)
  const seeds: number[] = [celler[0]];
  const dmin = new Float64Array(celler.length).fill(Infinity);
  while (seeds.length < k) {
    const [sx, sy] = xy(seeds[seeds.length - 1]);
    let best = 0;
    for (let i = 0; i < celler.length; i++) {
      const [x, y] = xy(celler[i]);
      dmin[i] = Math.min(dmin[i], (x - sx) ** 2 + (y - sy) ** 2);
      if (dmin[i] > dmin[best]) best = i;
    }
    seeds.push(celler[best]);
  }
  let tildelt = new Int32Array(celler.length);
  for (let it = 0; it < 6; it++) {
    // multi-source Dijkstra (small sets: simple bucketed queue)
    const dist = new Float64Array(celler.length).fill(Infinity);
    tildelt = new Int32Array(celler.length).fill(-1);
    const ko: Array<[number, number]> = [];
    seeds.forEach((s, si) => {
      const i = inn.get(s)!;
      dist[i] = 0;
      tildelt[i] = si;
      ko.push([0, i]);
    });
    const heap = new Heap();
    for (const [d, i] of ko) heap.push(d, i);
    while (heap.size) {
      const i = heap.pop();
      const d0 = heap.lastKey;
      if (d0 > dist[i]) continue;
      const p = celler[i];
      const ii = p % F.n;
      for (const r of [ii > 0 ? p - 1 : -1, ii < F.n - 1 ? p + 1 : -1, p - F.n, p + F.n]) {
        const j = inn.get(r);
        if (j === undefined) continue;
        const nd = d0 + 1 + 6 * rygg[r];
        if (nd < dist[j]) {
          dist[j] = nd;
          tildelt[j] = tildelt[i];
          heap.push(nd, j);
        }
      }
    }
    // move each seed to the member closest to the part centroid
    const sum = Array.from({ length: k }, () => [0, 0, 0]);
    celler.forEach((p, i) => {
      const t = tildelt[i];
      if (t < 0) return;
      const [x, y] = xy(p);
      sum[t][0] += x;
      sum[t][1] += y;
      sum[t][2]++;
    });
    const best = new Float64Array(k).fill(Infinity);
    celler.forEach((p, i) => {
      const t = tildelt[i];
      if (t < 0 || !sum[t][2]) return;
      const [x, y] = xy(p);
      const d = (x - sum[t][0] / sum[t][2]) ** 2 + (y - sum[t][1] / sum[t][2]) ** 2;
      if (d < best[t]) {
        best[t] = d;
        seeds[t] = p;
      }
    });
  }
  const ut: number[][] = Array.from({ length: k }, () => []);
  celler.forEach((p, i) => {
    if (tildelt[i] >= 0) ut[tildelt[i]].push(p);
  });
  return ut.filter((d) => d.length);
}

class Heap {
  k: number[] = [];
  v: number[] = [];
  lastKey = 0;
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    this.lastKey = k[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= k.length) break;
        const r = l + 1;
        const cc = r < k.length && k[r] < k[l] ? r : l;
        if (k[cc] >= lk) break;
        k[i] = k[cc];
        v[i] = v[cc];
        i = cc;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

/**
 * Outline of a cell set: boundary edges between member and non-member cells, linked into
 * loops (clockwise); the longest loop is the outer ring. Simplified and lightly smoothed.
 */
export function omriss(celler: number[], id: number, eier: Int32Array, F: Fin): XY[] {
  const er = (ii: number, jj: number) => ii >= 0 && jj >= 0 && ii < F.n && jj < F.m && eier[jj * F.n + ii] === id;
  // directed edges between grid corners; corner key = jj * (n+1) + ii
  const W = F.n + 1;
  const neste = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const l = neste.get(a);
    if (l) l.push(b);
    else neste.set(a, [b]);
  };
  for (const p of celler) {
    const ii = p % F.n;
    const jj = (p - ii) / F.n;
    const tl = jj * W + ii;
    const tr = tl + 1;
    const bl = tl + W;
    const br = bl + 1;
    if (!er(ii, jj - 1)) add(tl, tr);
    if (!er(ii + 1, jj)) add(tr, br);
    if (!er(ii, jj + 1)) add(br, bl);
    if (!er(ii - 1, jj)) add(bl, tl);
  }
  let lengst: number[] = [];
  const brukt = new Set<string>();
  for (const [start, mal] of neste) {
    for (const m0 of mal) {
      if (brukt.has(`${start}>${m0}`)) continue;
      const loop = [start];
      let a = start;
      let b = m0;
      for (let guard = 0; guard < 1e6; guard++) {
        brukt.add(`${a}>${b}`);
        if (b === start) break;
        loop.push(b);
        const kand = (neste.get(b) ?? []).filter((x) => !brukt.has(`${b}>${x}`));
        if (!kand.length) break;
        a = b;
        b = kand[0];
      }
      if (loop.length > lengst.length) lengst = loop;
    }
  }
  const pts: XY[] = lengst.map((key) => {
    const ii = key % W;
    const jj = (key - ii) / W;
    return [F.west + ii * F.c, F.north - jj * F.c];
  });
  if (pts.length < 4) return [];
  return glatt(forenkleRing(pts, F.c * 0.7));
}

function forenkleRing(pts: XY[], tol: number): XY[] {
  const dp = (a: number, b: number, ut: number[]) => {
    let maks = -1;
    let idx = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b % pts.length];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = Math.abs((by - ay) * (px - ax) - (bx - ax) * (py - ay)) / L;
      if (d > maks) {
        maks = d;
        idx = i;
      }
    }
    if (maks > tol) {
      dp(a, idx, ut);
      ut.push(idx);
      dp(idx, b, ut);
    }
  };
  const mid = Math.floor(pts.length / 2);
  const ut = [0];
  dp(0, mid, ut);
  ut.push(mid);
  dp(mid, pts.length, ut);
  return ut.map((i) => pts[i]);
}

/** One round of Chaikin corner cutting: removes the staircase look. */
function glatt(pts: XY[]): XY[] {
  const ut: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    ut.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return ut;
}

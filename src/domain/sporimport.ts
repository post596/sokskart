import type { LatLng } from './coords';
import { pointInRing } from './geo';

/**
 * GPX import for tracks from crews, dogs, drones and helicopters, and coverage-based POD.
 *
 * Coverage C = Σ (W · L) / A, where W is the effective sweep width of the resource, L the
 * track length inside the teig and A the teig area. Suggested POD = 1 − e^(−C)
 * (exponential detection function, Koopman; Koester et al. 2004). The user approves or
 * adjusts it. Sweep widths are model assumptions.
 */

export interface GpxSporRaa {
  navn: string;
  pts: Array<LatLng & { tid?: string }>;
}

const attr = (tag: string, navn: string) => {
  const m = new RegExp(`\\b${navn}\\s*=\\s*["']([^"']+)["']`).exec(tag);
  return m ? Number(m[1]) : Number.NaN;
};

const dekode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

function punkter(xml: string, tagg: 'trkpt' | 'rtept'): Array<LatLng & { tid?: string }> {
  const ut: Array<LatLng & { tid?: string }> = [];
  const re = new RegExp(`<${tagg}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tagg}>)`, 'g');
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const lat = attr(m[1], 'lat');
    const lng = attr(m[1], 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const tid = m[2] ? /<time>([^<]+)<\/time>/.exec(m[2])?.[1] : undefined;
    ut.push(tid ? { lat, lng, tid } : { lat, lng });
  }
  return ut;
}

/** Reads tracks (trk) and routes (rte) from a GPX file. Tolerant of namespaces and order. */
export function lesGpx(tekst: string): GpxSporRaa[] {
  const xml = tekst.replace(/<(\/?)[a-zA-Z0-9]+:(trk|trkseg|trkpt|rte|rtept|name|time)\b/g, '<$1$2');
  const ut: GpxSporRaa[] = [];
  for (const [tagg, pt] of [
    ['trk', 'trkpt'],
    ['rte', 'rtept'],
  ] as const) {
    const re = new RegExp(`<${tagg}\\b[^>]*>([\\s\\S]*?)</${tagg}>`, 'g');
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
      const kropp = m[1];
      const navn = /<name>([\s\S]*?)<\/name>/.exec(kropp.replace(new RegExp(`<${pt}[\\s\\S]*`, ''), ''))?.[1];
      const pts = punkter(kropp, pt);
      if (pts.length >= 2) ut.push({ navn: navn ? dekode(navn) : '', pts });
    }
  }
  return ut;
}

export interface Sporloggnavn {
  avgrensning: string;
  ddttmm: string;
  org: string;
  type: string;
  id: string;
}

/**
 * Parses the veileder's GPS log name «avgrensning» – «DDTTMM» – «etat/org» – «type» – «id»,
 * e.g. "T005–281345–RK–Drone–71". Accepts en dash, hyphen or underscore and spaces.
 */
export function tolkSporloggnavn(navn: string): Sporloggnavn | null {
  const deler = navn
    .split(/\s*[–—_-]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (deler.length < 4) return null;
  const [avgrensning, ddttmm, org, type, ...rest] = deler;
  if (!/^(T|L|R|H|D|SP)\d{3}$/i.test(avgrensning) && !/^REG[A-Z]+-?T\d{3}$/i.test(avgrensning)) return null;
  if (!/^\d{6}$/.test(ddttmm)) return null;
  return { avgrensning: avgrensning.toUpperCase(), ddttmm, org, type, id: rest.join('–') };
}

/** Ressurstype code from the name (veileder table) → track resource. */
export function ressursFraKode(kode: string): 'fotmannskap' | 'hund' | 'hundefører' | 'drone' | 'helikopter' | 'motorisert' | null {
  const k = kode.toLowerCase();
  if (k === 'msk' || k === 'ptr' || k === 'tau') return 'fotmannskap';
  if (k === 'hund') return 'hund';
  if (k === 'hf') return 'hundefører';
  if (k === 'drone') return 'drone';
  if (k === 'heli' || k === 'fly') return 'helikopter';
  if (k === 'atv' || k === 'bil' || k === 'ss' || k === 'båt') return 'motorisert';
  return null;
}

/** Douglas–Peucker simplification on projected points; keeps first and last. */
export function forenkle<T>(pts: T[], xy: (p: T) => [number, number], toleranse: number): T[] {
  if (pts.length <= 2) return pts.slice();
  const P = pts.map(xy);
  const behold = new Uint8Array(pts.length);
  behold[0] = behold[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maks = -1;
    let idx = -1;
    const [ax, ay] = P[a];
    const [bx, by] = P[b];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (P[i][0] - ax) - dx * (P[i][1] - ay)) / L;
      if (d > maks) {
        maks = d;
        idx = i;
      }
    }
    if (maks > toleranse && idx > 0) {
      behold[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => behold[i]);
}

/**
 * Length (m) of a polyline inside a polygon, in projected metres. Each segment is split
 * into ≤ 5 m pieces and a piece counts when its midpoint is inside.
 */
export function lengdeInnenfor(linje: Array<[number, number]>, ring: Array<[number, number]>, steg = 5): number {
  let sum = 0;
  for (let k = 1; k < linje.length; k++) {
    const [x0, y0] = linje[k - 1];
    const [x1, y1] = linje[k];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(L / steg));
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n;
      if (pointInRing(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ring)) sum += L / n;
    }
  }
  return sum;
}

export interface Dekningsbidrag {
  sporId: string;
  bredde: number;
  lengde: number;
}

/** C = Σ W·L / A and POD = 1 − e^(−C). */
export function dekning(bidrag: Dekningsbidrag[], arealM2: number): { C: number; pod: number } {
  if (arealM2 <= 0) return { C: 0, pod: 0 };
  const C = bidrag.reduce((s, b) => s + b.bredde * b.lengde, 0) / arealM2;
  return { C, pod: 1 - Math.exp(-C) };
}

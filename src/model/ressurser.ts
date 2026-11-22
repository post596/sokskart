import type { LatLng } from '../domain/coords';
import { cellX, cellY, fraGrid, type Grid } from './grid';
import type { LinjeType } from './typer';

/**
 * Anbefalte punkter per ressurstype. Brukeren oppgir hvor mange enheter av hver type som
 * er tilgjengelig, og får like mange forslag til punkter å sjekke.
 *
 * Regler (avklart med bruker og etter veileder kap. 6.3):
 * - Bil: veier. ATV: traktor-/skogsveier. Stier går til fotmannskap.
 * - Drone: IPP først, deretter ledelinjer, så risikoområder (vann, myr, bre, stup).
 * - Hundefører: IPP (sporutgang), deretter områder med høy sannsynlighet (grovsøk).
 * - Fotmannskap: IPP (akslingen), stier, punkter av interesse, områder med høy sannsynlighet.
 * Ledelinjer foreslås til punktet personen kan ha nådd langs linja innen valgt gangtid.
 */
export type RessursType = 'fotmannskap' | 'hundefører' | 'drone' | 'atv' | 'bil';

export const RESSURSER: Array<{ type: RessursType; navn: string; kort: string }> = [
  { type: 'fotmannskap', navn: 'Fotmannskap', kort: 'Fot' },
  { type: 'hundefører', navn: 'Hundefører', kort: 'HF' },
  { type: 'drone', navn: 'Drone', kort: 'Drone' },
  { type: 'atv', navn: 'ATV', kort: 'ATV' },
  { type: 'bil', navn: 'Bil', kort: 'Bil' },
];

export type Ressursantall = Record<RessursType, number>;

export const INGEN_RESSURSER: Ressursantall = { fotmannskap: 0, hundefører: 0, drone: 0, atv: 0, bil: 0 };

export type KandidatType = 'ipp' | 'ledelinje' | 'omrade' | 'risiko' | 'poi';

export interface Kandidat {
  type: KandidatType;
  pos: LatLng;
  x: number;
  y: number;
  /** probability (POA now) the task covers */
  score: number;
  tekst: string;
  linjeType?: LinjeType;
  /** OSM chain id for ledelinjer */
  linjeId?: string;
  /** walking time (h at the person's speed) to the point, if known */
  timer?: number;
}

export interface Forslag extends Kandidat {
  ressurs: RessursType;
  nr: number;
}

/** Which candidates each resource may take, with a preference factor. */
export function egnethet(r: RessursType, k: Kandidat): number {
  switch (r) {
    case 'bil':
      return k.type === 'ledelinje' && k.linjeType === 'vei' ? 1 : 0;
    case 'atv':
      return k.type === 'ledelinje' && k.linjeType === 'traktorvei' ? 1 : 0;
    case 'drone':
      if (k.type === 'ipp') return 100;
      if (k.type === 'ledelinje') return k.linjeType === 'vann' || k.linjeType === 'kraft' ? 2 : 1.5;
      if (k.type === 'risiko') return 1.2;
      if (k.type === 'omrade') return 0.6;
      return 0;
    case 'hundefører':
      if (k.type === 'ipp') return 100;
      if (k.type === 'omrade') return 1;
      return 0;
    case 'fotmannskap':
      if (k.type === 'ipp') return 100;
      if (k.type === 'ledelinje') return k.linjeType === 'sti' ? 1.3 : k.linjeType === 'vann' || k.linjeType === 'kraft' ? 0.8 : 0;
      if (k.type === 'poi') return 1.1;
      if (k.type === 'omrade') return 1;
      if (k.type === 'risiko') return 0.7;
      return 0;
  }
}

/**
 * Picks `antall[type]` points per resource type. Types take turns; a candidate picked by
 * one type counts half for the next (layered search with different resources is good,
 * but spread is better), and the same type never gets two points closer than `sep`.
 */
export function fordelRessurser(kandidater: Kandidat[], antall: Ressursantall, sep: number): Forslag[] {
  const ut: Forslag[] = [];
  const bruktAv = new Map<Kandidat, number>();
  const rest = Object.fromEntries(RESSURSER.map((r) => [r.type, Math.max(0, Math.min(50, Math.floor(antall[r.type] || 0)))])) as Ressursantall;
  const rekkefolge: RessursType[] = ['drone', 'hundefører', 'fotmannskap', 'atv', 'bil'];
  let progress = true;
  while (progress) {
    progress = false;
    for (const r of rekkefolge) {
      if (rest[r] <= 0) continue;
      const egne = ut.filter((f) => f.ressurs === r);
      let best: Kandidat | null = null;
      let bestScore = 0;
      for (const k of kandidater) {
        const e = egnethet(r, k);
        if (e <= 0) continue;
        if (egne.some((f) => f === (k as Forslag) || (f.x === k.x && f.y === k.y) || Math.hypot(f.x - k.x, f.y - k.y) < sep)) continue;
        const s = (k.type === 'ipp' ? 1 : k.score) * e * 0.5 ** (bruktAv.get(k) ?? 0);
        if (s > bestScore) {
          best = k;
          bestScore = s;
        }
      }
      if (!best) {
        rest[r] = 0;
        continue;
      }
      bruktAv.set(best, (bruktAv.get(best) ?? 0) + 1);
      rest[r]--;
      ut.push({ ...best, ressurs: r, nr: egne.length + 1 });
      progress = true;
    }
  }
  return ut;
}

/** Candidate for the cell with the highest value among `celler`. */
export function kandidatIBesteCelle(
  g: Grid,
  post: Float64Array,
  celler: ArrayLike<number>,
  type: KandidatType,
  tekst: string,
  T1: Float32Array | null,
  v: number,
): Kandidat | null {
  let best = -1;
  let sum = 0;
  for (let i = 0; i < celler.length; i++) {
    const c = celler[i];
    sum += post[c];
    if (best < 0 || post[c] > post[best]) best = c;
  }
  if (best < 0) return null;
  const i = best % g.n;
  const j = (best - i) / g.n;
  const x = cellX(g, i);
  const y = cellY(g, j);
  return { type, pos: fraGrid(g, x, y), x, y, score: sum, tekst, timer: T1 ? T1[best] / v : undefined };
}

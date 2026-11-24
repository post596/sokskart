import type { Modellantakelser, Teknikk } from '../data/modellantakelser';
import { toblerFaktor } from './gangtid';
import { AREALKLASSE, type TerrengLag } from './terreng';

/**
 * Search time for foot teams. A team covers (persons × spacing × speed) per hour in easy,
 * open terrain; the speed is lowered in heavy terrain:
 *  - terrain speed relative to open terrain (myr/bre slower, paths a bit faster)
 *  - forest (skogSokefaktor)
 *  - slope: Tobler averaged over up, down and twice across the slope (teams traverse)
 * Steep cells (barriers) cannot be searched on foot (factor 0).
 * All numbers are model assumptions; the veileder only says teiger must suit a crew team.
 */
export const arealPerTime = (t: Teknikk) => t.mannskap * t.avstandM * t.fartKmt * 1000; // m²/h

export function sokefaktorer(terr: TerrengLag, m: Modellantakelser): Float32Array {
  const { fart } = terr.terreng;
  const N = fart.length;
  const ut = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    if (fart[k] <= 0) continue;
    let f = Math.min(1.2, fart[k] / Math.max(0.05, m.terrengfaktor));
    if (terr.arealtype[k] === AREALKLASSE.skog) f *= m.skogSokefaktor;
    const h = terr.helning?.[k];
    if (h != null && Number.isFinite(h)) {
      // a search team mostly traverses along the contours: mean of up, down and twice across
      const S = Math.tan((h * Math.PI) / 180);
      f *= (toblerFaktor(S) + toblerFaktor(-S) + 2 * toblerFaktor(0)) / 4;
    }
    ut[k] = f;
  }
  return ut;
}

/**
 * Flight time for one drone to cover an area once with the drone sweep width
 * (`sokebredde.drone`) at `droneFartKmt`, and the batteries that takes.
 */
export function droneFlytid(arealKm2: number, m: Modellantakelser): { minutter: number; batterier: number } {
  const km2PerTime = (m.sokebredde.drone / 1000) * m.droneFartKmt;
  const minutter = km2PerTime > 0 ? (arealKm2 / km2PerTime) * 60 : Number.POSITIVE_INFINITY;
  return { minutter, batterier: Math.max(1, Math.ceil(minutter / Math.max(1, m.droneBatteriMin) - 1e-9)) };
}

/** Hours for one team to search a cell of the given ground area (m²). Infinity if impossible. */
export function cellSoketid(arealM2: number, faktor: number, t: Teknikk): number {
  return faktor > 0 ? arealM2 / (arealPerTime(t) * faktor) : Number.POSITIVE_INFINITY;
}

import type { Spor, Teig } from '../domain/aksjon';
import { areaM2 } from '../domain/geo';
import { dekning, lengdeInnenfor, type Dekningsbidrag } from '../domain/sporimport';
import { computeZone, toUtm, type ZoneChoice } from '../domain/utm';
import type { SporRessurs } from '../data/modellantakelser';

export interface TeigDekning {
  C: number;
  pod: number;
  bidrag: Array<Dekningsbidrag & { spor: Spor }>;
  arealM2: number;
}

/**
 * Coverage of a teig from imported tracks that are not already used in a registered
 * search of this teig. Suggested POD = 1 − e^(−C).
 */
export function dekningForTeig(t: Teig, spor: Spor[], bredde: Record<SporRessurs, number>, sone: ZoneChoice): TeigDekning | null {
  if (t.ring.length < 3 || !spor.length) return null;
  const zone = computeZone(t.ring[0].lat, t.ring[0].lng, sone);
  const proj = (p: { lat: number; lng: number }): [number, number] => {
    const u = toUtm(p.lat, p.lng, zone);
    return [u.e, u.n];
  };
  const brukt = new Set(t.sok.flatMap((s) => s.spor ?? []));
  const ring = t.ring.map(proj);
  const bidrag = spor
    .filter((s) => !brukt.has(s.id))
    .map((s) => ({ sporId: s.id, bredde: bredde[s.ressurs] ?? 30, lengde: lengdeInnenfor(s.pts.map(proj), ring), spor: s }))
    .filter((b) => b.lengde > 1);
  if (!bidrag.length) return null;
  const arealM2 = areaM2(t.ring, zone);
  return { ...dekning(bidrag, arealM2), bidrag, arealM2 };
}

import { distToSegment, pointInRing } from './geo';

/**
 * Kvalitetssikring ved avslutning uten funn (veileder kap. 7.5.2): det kan kreves at alle
 * teiger innenfor R50 er søkt med svært høy POD (> 95 %) og alle innenfor R75 med normalt
 * høy POD (≥ 50 %). «Innenfor» = teigen overlapper ringen (avklart med bruker).
 */
export const KRAV_R50 = 0.95;
export const KRAV_R75 = 0.5;

export type XY = [number, number];

export function overlapperSirkel(ring: XY[], cx: number, cy: number, r: number): boolean {
  if (ring.length < 3) return false;
  if (pointInRing(cx, cy, ring)) return true;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (distToSegment(cx, cy, a[0], a[1], b[0], b[1]) <= r) return true;
  }
  return false;
}

export interface TeigKsInput {
  id: string;
  ring: XY[];
  akkPod: number;
  /** POA nå */
  poa: number;
}

export interface TeigKs {
  id: string;
  iR50: boolean;
  iR75: boolean;
  akkPod: number;
  /** required accumulated POD, or null if outside R75 */
  krav: number | null;
  oppfylt: boolean;
  poa: number;
  /** markedly higher remaining POA than the other teiger */
  hoyPoa: boolean;
}

export interface Kvalitetsrapport {
  teiger: TeigKs[];
  ikkeOppfylt: TeigKs[];
  hoyPoa: TeigKs[];
  /** all teiger within R75 meet the requirement */
  alleOppfylt: boolean;
}

/**
 * «Markert høyere» POA: more than 1.5 × the mean POA of all teiger (and at least 1 %).
 * This threshold is a model assumption.
 */
export const HOY_POA_FAKTOR = 1.5;

export function kvalitetssikring(teiger: TeigKsInput[], senter: XY, r50: number, r75: number): Kvalitetsrapport {
  const snitt = teiger.length ? teiger.reduce((s, t) => s + t.poa, 0) / teiger.length : 0;
  const ut: TeigKs[] = teiger.map((t) => {
    const iR50 = overlapperSirkel(t.ring, senter[0], senter[1], r50);
    const iR75 = iR50 || overlapperSirkel(t.ring, senter[0], senter[1], r75);
    const krav = iR50 ? KRAV_R50 : iR75 ? KRAV_R75 : null;
    const oppfylt = krav == null || (iR50 ? t.akkPod > krav : t.akkPod >= krav);
    return {
      id: t.id,
      iR50,
      iR75,
      akkPod: t.akkPod,
      krav,
      oppfylt,
      poa: t.poa,
      hoyPoa: teiger.length > 1 && t.poa > HOY_POA_FAKTOR * snitt && t.poa >= 0.01,
    };
  });
  const ikkeOppfylt = ut.filter((t) => !t.oppfylt);
  return {
    teiger: ut,
    ikkeOppfylt,
    hoyPoa: ut.filter((t) => t.hoyPoa).sort((a, b) => b.poa - a.poa),
    alleOppfylt: ikkeOppfylt.length === 0,
  };
}

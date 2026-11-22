/**
 * Mattson konsensus (veileder kap. 7.5.2): hvert ILKO-medlem vekter sannsynligheten i
 * regionene mot hverandre, og POA for hver region er snittet av vurderingene. Hver
 * deltaker fordeler poeng på regionene og «resten» (utenfor alle regioner); poengene
 * normaliseres til 100 % per deltaker før snittet tas.
 */
export const RESTEN = 'resten';

export interface KonsensusResultat {
  /** region id (and 'resten') → share 0..1, sums to 1 */
  andeler: Record<string, number>;
  /** participants with a usable assessment */
  antall: number;
  /** per participant normalised shares */
  perDeltaker: Record<string, Record<string, number>>;
}

export function konsensus(
  deltakere: Array<{ id: string }>,
  vurdering: Record<string, Record<string, number>>,
  regionIds: string[],
): KonsensusResultat | null {
  const nokler = [...regionIds, RESTEN];
  const perDeltaker: Record<string, Record<string, number>> = {};
  for (const d of deltakere) {
    const v = vurdering[d.id] ?? {};
    const sum = nokler.reduce((s, k) => s + Math.max(0, Number(v[k]) || 0), 0);
    if (sum <= 0) continue;
    perDeltaker[d.id] = Object.fromEntries(nokler.map((k) => [k, Math.max(0, Number(v[k]) || 0) / sum]));
  }
  const ids = Object.keys(perDeltaker);
  if (!ids.length) return null;
  const andeler = Object.fromEntries(nokler.map((k) => [k, ids.reduce((s, id) => s + perDeltaker[id][k], 0) / ids.length]));
  return { andeler, antall: ids.length, perDeltaker };
}

/** Veileder: the whole search area should not have more than 20–30 regions. */
export const MAKS_REGIONER = 30;

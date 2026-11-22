/**
 * Statistikk per savnetkategori – Lost Person Behavior (Koester).
 *
 * VIKTIG: Tallene under er PLASSHOLDERE overtatt fra prototypen (sok-kart.html). De er
 * ikke kontrollert mot boka og er merket `verifisert: false`. Appen viser en tydelig
 * advarsel for hver kategori som ikke er verifisert. Brukeren legger inn og kontrollerer
 * tallene i fanen Statistikk (eller med CSV-import).
 *
 * R-verdier: km i rett linje fra IPP til funnsted. Gangfart: km/t. Mobilitet: timer i
 * bevegelse. Egne sett for fjell og flatt terreng; plassholderne er like i begge.
 */

export interface Ringer {
  r25: number;
  r50: number;
  r75: number;
  r95: number;
}

export type Terreng = 'fjell' | 'flatt';

export type Kategorigruppe = 'mental' | 'barn' | 'aktivitet';

export interface LpbKategori {
  key: string;
  navn: string;
  gruppe: Kategorigruppe;
  fjell: Ringer;
  flatt: Ringer;
  /** km/t */
  gangfart: number;
  /** timer */
  mobilitet: number;
  verifisert: boolean;
  /** Hvor tallene kommer fra, f.eks. «LPB 2008, tabell …». */
  kilde: string;
}

const PLASSHOLDER = 'Plassholder fra prototypen – ikke kontrollert mot Lost Person Behavior';

function k(
  key: string,
  navn: string,
  gruppe: Kategorigruppe,
  r: [number, number, number, number],
  gangfart: number,
  mobilitet: number,
): LpbKategori {
  const ringer: Ringer = { r25: r[0], r50: r[1], r75: r[2], r95: r[3] };
  return { key, navn, gruppe, fjell: { ...ringer }, flatt: { ...ringer }, gangfart, mobilitet, verifisert: false, kilde: PLASSHOLDER };
}

/** Rekkefølge og gruppering som i veilederens hurtigguide (figur 5). */
export const LPB_PLASSHOLDERE: LpbKategori[] = [
  k('dement', 'Demens', 'mental', [0.3, 0.8, 1.9, 8.3], 1.5, 12),
  k('suicid', 'Økt selvmordsrisiko', 'mental', [0.2, 0.6, 1.8, 9.0], 2, 8),
  k('utvikl', 'Psykisk utviklingshemmet', 'mental', [0.2, 0.6, 1.7, 6.9], 2, 10),
  k('autist', 'Autisme', 'mental', [0.2, 0.6, 2.4, 9.7], 2.5, 10),
  k('rus', 'Rus', 'mental', [0.2, 0.5, 1.5, 5.0], 2, 6),
  k('b13', 'Barn 1–3 år', 'barn', [0.1, 0.2, 0.6, 2.0], 1, 4),
  k('b46', 'Barn 4–6 år', 'barn', [0.1, 0.5, 1.0, 2.6], 1.5, 6),
  k('b79', 'Barn 7–9 år', 'barn', [0.3, 0.8, 2.0, 5.1], 2, 8),
  k('b1012', 'Barn 10–12 år', 'barn', [0.2, 0.9, 1.6, 5.6], 2.5, 10),
  k('b1315', 'Barn 13–15 år', 'barn', [0.4, 0.8, 2.1, 6.2], 3, 12),
  k('turgaer', 'Turgåer', 'aktivitet', [0.7, 1.9, 3.6, 11.3], 3, 12),
  k('jeger', 'Jeger', 'aktivitet', [1.3, 3.0, 5.0, 13.8], 3, 12),
  k('plukker', 'Bær-/soppplukker', 'aktivitet', [0.9, 1.6, 3.6, 6.9], 2, 10),
  k('fisker', 'Fisker', 'aktivitet', [0.3, 1.4, 4.1, 8.0], 2.5, 10),
  k('langrenn', 'Skiløper, langrenn', 'aktivitet', [1.0, 3.2, 6.4, 18], 5, 10),
  k('alpin', 'Skiløper, alpin', 'aktivitet', [0.6, 1.5, 3.0, 7.0], 4, 8),
];

export const GRUPPENAVN: Record<Kategorigruppe, string> = {
  mental: 'Mental status avgjørende',
  barn: 'Barn',
  aktivitet: 'Aktivitet',
};

export function kopierStatistikk(src: LpbKategori[] = LPB_PLASSHOLDERE): LpbKategori[] {
  return src.map((c) => ({ ...c, fjell: { ...c.fjell }, flatt: { ...c.flatt } }));
}

/** Returns Norwegian error messages for a ring set; empty when valid. */
export function valider(r: Ringer): string[] {
  const feil: string[] = [];
  const v = [r.r25, r.r50, r.r75, r.r95];
  if (v.some((x) => !Number.isFinite(x) || x <= 0)) feil.push('Alle R-verdier må være større enn 0.');
  if (!(r.r25 < r.r50 && r.r50 < r.r75 && r.r75 < r.r95)) feil.push('R-verdiene må øke: R25 < R50 < R75 < R95.');
  return feil;
}

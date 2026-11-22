import type { PoiType } from '../model/typer';

/**
 * INTERESSEPUNKTER PER SAVNETKATEGORI – MODELLANTAKELSE
 *
 * Hvilke typer steder appen foreslår som reflekser (R###) for hver kategori, og hvor tungt
 * de vektes (0–1). Listen er laget ut fra veilederens eksempler (kap. 7.2.5: «myr for
 * bærplukker, vann for fisker …», risikoområder som usikker is, stup, elv) og vanlig
 * søksfaglig praksis. Den er IKKE kontrollert mot Lost Person Behavior eller Norsk
 * Folkehjelp Sanitets veiledere, og bør kvalitetssikres av fagpersoner før operativ bruk.
 *
 * Punktene hentes fra OpenStreetMap: hytter, gapahuker, utsiktspunkter, topper, bruer,
 * kaier, parkeringsplasser, lekeplasser, uthus, kirker/gravplasser og demninger. «stup»,
 * «vann» (strandsone), «myr» og «stikryss» lages av linjer og områder.
 */
export type PunktTypeKandidat = PoiType | 'stup' | 'vann' | 'myr' | 'stikryss';

export const PUNKTTYPENAVN: Record<PunktTypeKandidat, string> = {
  hytte: 'Hytte',
  gapahuk: 'Gapahuk/skjul',
  utsikt: 'Utsiktspunkt',
  topp: 'Topp',
  bru: 'Bru',
  kai: 'Kai/brygge',
  parkering: 'Parkering',
  lekeplass: 'Lekeplass',
  uthus: 'Uthus/låve',
  kirke: 'Kirke/gravplass',
  demning: 'Demning',
  stup: 'Stup/bratt kant',
  vann: 'Strandsone ved vann',
  myr: 'Myr',
  stikryss: 'Stikryss',
};

export const INTERESSEPUNKTER: Record<string, Partial<Record<PunktTypeKandidat, number>>> = {
  suicid: { bru: 1, stup: 1, utsikt: 0.9, kai: 0.9, vann: 0.8, demning: 0.8, parkering: 0.6, topp: 0.5, kirke: 0.5, gapahuk: 0.3 },
  dement: { uthus: 0.9, vann: 0.6, bru: 0.4, parkering: 0.3, kirke: 0.4, stikryss: 0.3, myr: 0.4 },
  utvikl: { uthus: 0.7, lekeplass: 0.6, vann: 0.7, gapahuk: 0.5, hytte: 0.4 },
  autist: { vann: 1, lekeplass: 0.6, uthus: 0.6, bru: 0.5, gapahuk: 0.4 },
  rus: { uthus: 0.7, gapahuk: 0.7, vann: 0.7, bru: 0.6, parkering: 0.5, kai: 0.6 },
  b13: { vann: 1, uthus: 0.7, lekeplass: 0.6 },
  b46: { vann: 1, lekeplass: 0.8, uthus: 0.7, gapahuk: 0.5 },
  b79: { vann: 0.8, gapahuk: 0.8, uthus: 0.7, lekeplass: 0.6, hytte: 0.5 },
  b1012: { gapahuk: 0.8, hytte: 0.7, vann: 0.7, utsikt: 0.5, stup: 0.5 },
  b1315: { gapahuk: 0.8, hytte: 0.7, utsikt: 0.6, stup: 0.6, vann: 0.6 },
  turgaer: { hytte: 1, topp: 0.8, stikryss: 0.8, utsikt: 0.7, stup: 0.7, gapahuk: 0.6, bru: 0.4 },
  jeger: { myr: 0.8, vann: 0.6, hytte: 0.6, gapahuk: 0.6, stup: 0.6, stikryss: 0.4 },
  plukker: { myr: 1, stikryss: 0.5, parkering: 0.5, hytte: 0.4 },
  fisker: { vann: 1, kai: 0.8, demning: 0.7, bru: 0.6, hytte: 0.5 },
  langrenn: { hytte: 1, stikryss: 0.8, topp: 0.5, stup: 0.6, gapahuk: 0.5 },
  alpin: { stup: 1, hytte: 0.6, topp: 0.6, utsikt: 0.4 },
};

/** Weighted type weights for a category mixture (keys from lpb-stats). */
export function punktvekter(kategorier: Array<{ key: string; w: number }>): Partial<Record<PunktTypeKandidat, number>> {
  const ut: Partial<Record<PunktTypeKandidat, number>> = {};
  for (const k of kategorier) {
    for (const [t, v] of Object.entries(INTERESSEPUNKTER[k.key] ?? {}) as Array<[PunktTypeKandidat, number]>) {
      ut[t] = (ut[t] ?? 0) + k.w * v;
    }
  }
  return ut;
}

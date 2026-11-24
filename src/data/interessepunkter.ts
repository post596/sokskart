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
  for (const [t, b] of Object.entries(punktvekterMedBidrag(kategorier)) as Array<[PunktTypeKandidat, { sum: number }]>) ut[t] = b.sum;
  return ut;
}

/** Like punktvekter, but also which categories contribute and how much (w × weight). */
export function punktvekterMedBidrag(
  kategorier: Array<{ key: string; w: number }>,
): Partial<Record<PunktTypeKandidat, { sum: number; bidrag: Array<{ key: string; w: number; v: number }> }>> {
  const ut: Partial<Record<PunktTypeKandidat, { sum: number; bidrag: Array<{ key: string; w: number; v: number }> }>> = {};
  for (const k of kategorier) {
    for (const [t, v] of Object.entries(INTERESSEPUNKTER[k.key] ?? {}) as Array<[PunktTypeKandidat, number]>) {
      const e = (ut[t] ??= { sum: 0, bidrag: [] });
      e.sum += k.w * v;
      e.bidrag.push({ key: k.key, w: k.w, v });
    }
  }
  return ut;
}

/**
 * WHY a point type is suggested – MODELLANTAKELSE, not checked by HRS or Norsk Folkehjelp.
 * `tekst` applies to all categories; `perKategori` replaces it for a category where the
 * reason is specific. `kilde` says where the idea comes from.
 */
export interface Punktbegrunnelse {
  tekst: string;
  perKategori?: Record<string, string>;
  kilde: string;
  verifisert: false;
}

const V725 = 'Veileder 7.2.5 (reflekser)';
const V73 = 'Veileder 7.3 (turmål og farlig terreng)';
const PRAKSIS = 'Søksfaglig praksis (ikke fra HRS)';

export const PUNKTBEGRUNNELSE: Record<PunktTypeKandidat, Punktbegrunnelse> = {
  hytte: {
    tekst: 'Hytter og hus er steder personer søker ly eller hjelp, og som veilederen nevner som områder man umiddelbart vil søke.',
    perKategori: {
      turgaer: 'Hytter er vanlige turmål og overnattingssteder; en turgåer som er sliten eller har gått seg bort, søker ofte mot en hytte.',
      langrenn: 'Hytter er vanlige mål og rasteplasser for skiløpere og gir ly i dårlig vær.',
    },
    kilde: V725,
    verifisert: false,
  },
  gapahuk: {
    tekst: 'Gapahuker og skjul gir ly, og brukes ofte som rasteplass eller oppholdssted.',
    perKategori: { rus: 'Skjul og gapahuker brukes ofte som oppholdssted av personer under påvirkning av rus.' },
    kilde: PRAKSIS,
    verifisert: false,
  },
  utsikt: {
    tekst: 'Utsiktspunkter er vanlige turmål.',
    perKategori: { suicid: 'Utsiktspunkter med høye kanter kan være aktuelle ved økt selvmordsrisiko (fall fra høyde).' },
    kilde: V73,
    verifisert: false,
  },
  topp: {
    tekst: 'Topper er vanlige turmål; veilederen sier at for turkategorier bør man se på mulige turmål og ledelinjene mot dem.',
    kilde: V73,
    verifisert: false,
  },
  bru: {
    tekst: 'Bruer leder ferdselen over vann og elver og er naturlige passeringspunkter.',
    perKategori: {
      suicid: 'Bruer er kjente steder ved økt selvmordsrisiko (fall eller drukning).',
      fisker: 'Bruer er populære fiskeplasser og gir adkomst til elva.',
    },
    kilde: PRAKSIS,
    verifisert: false,
  },
  kai: {
    tekst: 'Kaier og brygger ligger ved vann og gir risiko for å havne i vannet.',
    perKategori: { suicid: 'Kaier og brygger kan være aktuelle ved økt selvmordsrisiko (drukning).', fisker: 'Kaier og brygger er vanlige fiskeplasser.' },
    kilde: PRAKSIS,
    verifisert: false,
  },
  parkering: {
    tekst: 'Parkeringsplasser er utgangspunkt for turer; den savnedes bil eller spor kan finnes her.',
    perKategori: { suicid: 'Parkeringsplasser ved natur- og utsiktsområder er steder der kjøretøy ofte blir funnet ved økt selvmordsrisiko.' },
    kilde: PRAKSIS,
    verifisert: false,
  },
  lekeplass: {
    tekst: 'Lekeplasser trekker barn og kan være et kjent sted for den savnede.',
    kilde: PRAKSIS,
    verifisert: false,
  },
  uthus: {
    tekst: 'Uthus, låver og skur gir ly og brukes som gjemmested eller oppholdssted; veilederen nevner hus som steder man umiddelbart vil søke.',
    perKategori: {
      dement: 'Personer med demens søker ofte inn i bygninger og uthus, gjerne nær der de bor eller har bodd.',
      b13: 'Små barn kryper ofte inn i bygninger, skur og trange steder.',
      b46: 'Barn gjemmer seg ofte i skur, uthus og låver.',
    },
    kilde: V725,
    verifisert: false,
  },
  kirke: {
    tekst: 'Kirker og gravplasser kan være steder med personlig betydning for den savnede.',
    perKategori: { dement: 'Kirker og gravplasser kan være kjente steder fra tidligere liv for personer med demens.' },
    kilde: PRAKSIS,
    verifisert: false,
  },
  demning: {
    tekst: 'Demninger ligger ved vann med fallhøyde og strøm; risikoområde.',
    perKategori: { fisker: 'Demninger og terskler er vanlige fiskeplasser.' },
    kilde: PRAKSIS,
    verifisert: false,
  },
  stup: {
    tekst: 'Stup er risikoområder som veilederen sier skal søkes umiddelbart; søk særlig nedenfor kanten.',
    perKategori: {
      suicid: 'Stup og bratte kanter kan være aktuelle ved økt selvmordsrisiko (fall fra høyde).',
      alpin: 'Utforkjørere kan havne utfor bratte kanter utenfor løypene.',
    },
    kilde: V725,
    verifisert: false,
  },
  vann: {
    tekst: 'Vann og strandsone er risikoområder (drukning, usikker is) som veilederen sier skal søkes umiddelbart.',
    perKategori: {
      fisker: 'Vann er målet for en fisker (veilederens eksempel: «vann for fisker»).',
      autist: 'Personer med autisme trekkes ofte mot vann.',
      b13: 'Små barn trekkes mot vann og har høy risiko for drukning.',
      b46: 'Barn trekkes mot vann og har høy risiko for drukning.',
      suicid: 'Vann kan være aktuelt ved økt selvmordsrisiko (drukning).',
    },
    kilde: V725,
    verifisert: false,
  },
  myr: {
    tekst: 'Myr kan være tungt å ta seg gjennom og et sted man kan bli sittende fast.',
    perKategori: {
      plukker: 'Myr er der bærplukkere går (veilederens eksempel: «myr for bærplukker»).',
      jeger: 'Myrer og myrkanter er vanlige jakt- og passområder.',
    },
    kilde: V725,
    verifisert: false,
  },
  stikryss: {
    tekst: 'I stikryss kan personen ha valgt feil retning; krysset er et naturlig sted for sperrepost og sporsøk.',
    kilde: PRAKSIS,
    verifisert: false,
  },
};

/** The reason text for a type and a category. */
export function punktgrunn(type: PunktTypeKandidat, kategori: string): string {
  const b = PUNKTBEGRUNNELSE[type];
  return b.perKategori?.[kategori] ?? b.tekst;
}

/** A short «Vurder:» suggestion: which resource and what to check. */
export function vurderPunkt(type: PunktTypeKandidat, droneeffekt: number | null): string {
  const drone = droneeffekt != null && droneeffekt >= 0.7;
  switch (type) {
    case 'vann':
    case 'kai':
    case 'demning':
      return 'Punktsøk av vannkant og strandsone med fotlag; drone (eller båt) for vannflaten og is.';
    case 'bru':
      return 'Punktsøk på og under brua og langs elvebredden nedstrøms; drone over elva.';
    case 'stup':
      return 'Søk nedenfor kanten – drone eller mannskap med tau/klatrekompetanse. Ikke send mannskap i farlig lende uten sikring.';
    case 'myr':
      return drone ? 'Drone over åpen myr, fotlag langs myrkanten.' : 'Fotlag i søkekjede over myra.';
    case 'hytte':
    case 'gapahuk':
    case 'uthus':
      return 'Punktsøk: sjekk inne i og rundt bygget/skjulet, rop og lytt, og kontakt eier.';
    case 'topp':
    case 'utsikt':
      return drone ? 'Punktsøk av toppen og kantene rundt; drone ved godt vær.' : 'Punktsøk av toppen og kantene rundt.';
    case 'parkering':
      return 'Sjekk kjøretøy på plassen; vurder sperrepost/observasjonspost.';
    case 'lekeplass':
    case 'kirke':
      return 'Punktsøk av stedet og nærområdet.';
    case 'stikryss':
      return 'Sperrepost eller sporsøk med hund i krysset, og hurtigsøk et stykke langs hver retning.';
  }
}

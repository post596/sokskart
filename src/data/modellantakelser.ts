/**
 * MODELLANTAKELSER
 *
 * Alle vekter og faktorer her er forslag, ikke fra HRS. De er samlet i én fil, kan
 * endres i appen (fanen Statistikk → Modellantakelser) og merkes som modellantakelser
 * i grensesnittet. Se docs/modell.md for hvordan de brukes.
 */

export type Observasjonsklasse = 'sikker' | 'sannsynlig' | 'mulig' | 'usikker';

export interface Modellantakelser {
  /** Celler per side i rutenettet (ca. 300 × 300). */
  rutenett: number;
  /** Halvbredde på beregningsområdet som andel av R95. */
  omradeFaktor: number;
  /** Fall-off utenfor R95 (lengdeskala som andel av R95). */
  haleFaktor: number;
  /** Antall glattepass (boksfilter, radius 1 celle). */
  glatting: number;

  /** Andel av tiden som blir fremdrift bort fra IPP (brukes på rekkevidden). */
  effektivFremdrift: number;
  /** Myk grense for rekkevidde: andel av tilgjengelig gangtid. */
  rekkeviddeMyk: number;

  /** Vekt for celler nær ledelinje. */
  vektNaer: number;
  /** «Nær» = innen (m). */
  naerM: number;
  /** Vekt for celler i ledelinjekorridoren. */
  vektKorridor: number;
  /** Korridor = innen (m). */
  korridorM: number;

  /**
   * Vekt per klasse. Sikker og sannsynlig blir nye utgangspunkt med andel w/(w + K) av
   * sannsynligheten, spredt etter gangtid fra observasjonen. Mulig vekter lokalt:
   * p × (1 + w · gauss). Usikker (0) gjør ingenting.
   */
  obsVekt: Record<Observasjonsklasse, number>;
  /** K i andelen w/(w + K) for observasjoner som blir nytt utgangspunkt. */
  obsAndelK: number;
  /** Spredning = gangfart × effektiv fremdrift × timer siden observasjonen × denne faktoren. */
  obsSpredning: number;
  /** Minste spredning (m). */
  obsMinSpredningM: number;

  /** Fart utenfor sti/vei som andel av gangfarten på sti (Tobler: 0,6). */
  terrengfaktor: number;
  /** Fart i myr og på bre som andel av gangfart på sti. */
  myrfaktor: number;
  /** Fart i kraftgate som andel av gangfart på sti. */
  kraftgatefaktor: number;
  /** Bratthet (grader) der terrenget regnes som ufremkommelig utenfor sti. */
  maksHelning: number;
  /** Elver (waterway=river) er barrierer. Bekker og grøfter kan krysses. */
  elvErBarriere: boolean;

  /** Sannsynlighetsvekt for celler i vann (innsjø/elv). */
  vannVekt: number;
  /** Sannsynlighetsvekt for celler i havet (høydedata mangler). */
  havVekt: number;
  /** Sannsynlighetsvekt for celler som ikke kan nås til fots. */
  uoppnaaeligVekt: number;

  /** Tak på søkeradius for stier og veier (km). */
  ledelinjeTakKm: number;
  /** Antall ledelinjer som får L-nummer. */
  antallLedelinjer: number;
  /** Antall mest sannsynlige punkter. */
  antallPunkter: number;
}

export const STANDARD_MODELL: Modellantakelser = {
  rutenett: 300,
  omradeFaktor: 1.5,
  haleFaktor: 0.3,
  glatting: 2,

  effektivFremdrift: 0.6,
  rekkeviddeMyk: 0.2,

  vektNaer: 3,
  naerM: 60,
  vektKorridor: 1.6,
  korridorM: 200,

  obsVekt: { sikker: 6, sannsynlig: 3, mulig: 1, usikker: 0 },
  obsAndelK: 3,
  obsSpredning: 0.6,
  obsMinSpredningM: 150,

  terrengfaktor: 0.6,
  myrfaktor: 0.4,
  kraftgatefaktor: 0.8,
  maksHelning: 35,
  elvErBarriere: true,

  vannVekt: 0.2,
  havVekt: 0.02,
  uoppnaaeligVekt: 0.02,

  ledelinjeTakKm: 10,
  antallLedelinjer: 20,
  antallPunkter: 8,
};

/** Merges a stored (possibly older/partial) object with the defaults. */
export function medStandard(p: Partial<Modellantakelser> | undefined): Modellantakelser {
  return {
    ...STANDARD_MODELL,
    ...(p ?? {}),
    obsVekt: { ...STANDARD_MODELL.obsVekt, ...(p?.obsVekt ?? {}) },
  };
}

/** Labels for the settings screen. */
export const MODELL_FELT: Array<{
  felt: Exclude<keyof Modellantakelser, 'obsVekt' | 'elvErBarriere'>;
  navn: string;
  steg: number;
  min: number;
  max: number;
  hjelp?: string;
}> = [
  { felt: 'vektNaer', navn: 'Vekt nær ledelinje', steg: 0.1, min: 1, max: 20 },
  { felt: 'naerM', navn: 'Nær = innen (m)', steg: 10, min: 10, max: 500 },
  { felt: 'vektKorridor', navn: 'Vekt i ledelinjekorridor', steg: 0.1, min: 1, max: 20 },
  { felt: 'korridorM', navn: 'Korridor = innen (m)', steg: 10, min: 20, max: 1000 },
  { felt: 'effektivFremdrift', navn: 'Effektiv fremdrift (0–1)', steg: 0.05, min: 0.1, max: 1, hjelp: 'Hvor mye av tiden som blir forflytning bort fra IPP. Brukes på rekkevidden i sannsynlighetskartet.' },
  { felt: 'rekkeviddeMyk', navn: 'Myk grense for rekkevidde (andel)', steg: 0.05, min: 0.05, max: 1 },
  { felt: 'terrengfaktor', navn: 'Fart i terreng (andel av sti)', steg: 0.05, min: 0.1, max: 1, hjelp: 'Toblers gangfunksjon bruker 0,6 utenfor sti.' },
  { felt: 'myrfaktor', navn: 'Fart i myr/bre (andel av sti)', steg: 0.05, min: 0.1, max: 1 },
  { felt: 'kraftgatefaktor', navn: 'Fart i kraftgate (andel av sti)', steg: 0.05, min: 0.1, max: 1 },
  { felt: 'maksHelning', navn: 'Ufremkommelig bratthet (grader)', steg: 1, min: 15, max: 80 },
  { felt: 'vannVekt', navn: 'Sannsynlighetsvekt i vann', steg: 0.05, min: 0, max: 1 },
  { felt: 'havVekt', navn: 'Sannsynlighetsvekt i havet', steg: 0.01, min: 0, max: 1 },
  { felt: 'uoppnaaeligVekt', navn: 'Vekt for områder som ikke kan nås', steg: 0.01, min: 0, max: 1 },
  {
    felt: 'obsAndelK',
    navn: 'K for observasjon som utgangspunkt',
    steg: 0.5,
    min: 0.5,
    max: 50,
    hjelp: 'Sikker og sannsynlig observasjon får andelen vekt/(vekt + K) av sannsynligheten. K = 3: sikker 67 %, sannsynlig 50 %.',
  },
  { felt: 'obsSpredning', navn: 'Spredning rundt observasjoner (faktor)', steg: 0.05, min: 0.05, max: 3 },
  { felt: 'obsMinSpredningM', navn: 'Minste spredning rundt observasjoner (m)', steg: 10, min: 20, max: 2000 },
  { felt: 'haleFaktor', navn: 'Fall-off utenfor R95 (andel av R95)', steg: 0.05, min: 0.05, max: 2 },
  { felt: 'omradeFaktor', navn: 'Beregningsområde (× R95)', steg: 0.1, min: 1.1, max: 3 },
  { felt: 'glatting', navn: 'Glatting (antall pass)', steg: 1, min: 0, max: 6 },
  { felt: 'rutenett', navn: 'Rutenett (celler per side)', steg: 50, min: 100, max: 600 },
  { felt: 'ledelinjeTakKm', navn: 'Tak på søkeradius for stier (km)', steg: 1, min: 1, max: 25 },
  { felt: 'antallLedelinjer', navn: 'Antall ledelinjer med L-nummer', steg: 1, min: 5, max: 60 },
  { felt: 'antallPunkter', navn: 'Antall mest sannsynlige punkter', steg: 1, min: 3, max: 20 },
];

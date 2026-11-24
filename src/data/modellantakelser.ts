/**
 * MODELLANTAKELSER
 *
 * Alle vekter og faktorer her er forslag, ikke fra HRS. De er samlet i én fil, kan
 * endres i appen (fanen Statistikk → Modellantakelser) og merkes som modellantakelser
 * i grensesnittet. Se docs/modell.md for hvordan de brukes.
 */

export type Observasjonsklasse = 'sikker' | 'sannsynlig' | 'mulig' | 'usikker';

/** Search techniques used to size teiger (veileder 6.3.2). Numbers are model assumptions. */
export type SokTeknikk = 'grovsok' | 'finsok' | 'kompasskurs';

export interface Teknikk {
  navn: string;
  /** persons in the team */
  mannskap: number;
  /** spacing between persons (m) */
  avstandM: number;
  /** search speed in easy, open terrain (km/h) */
  fartKmt: number;
}

/** Resource types for imported GPS tracks (colours per veileder 10.6 where given). */
export type SporRessurs = 'fotmannskap' | 'hund' | 'hundefører' | 'drone' | 'helikopter' | 'motorisert';

export const SPORRESSURSER: Array<{ type: SporRessurs; navn: string; farge: string; kode: string }> = [
  { type: 'fotmannskap', navn: 'Søksmannskap til fots', farge: '#dc2626', kode: 'Msk' },
  { type: 'hund', navn: 'Hund', farge: '#374151', kode: 'Hund' },
  { type: 'hundefører', navn: 'Hundefører', farge: '#1d4ed8', kode: 'HF' },
  { type: 'motorisert', navn: 'Motorisert', farge: '#16a34a', kode: 'ATV' },
  { type: 'drone', navn: 'Drone', farge: '#0e7490', kode: 'Drone' },
  { type: 'helikopter', navn: 'Helikopter', farge: '#7c2d12', kode: 'Heli' },
];

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

  /** Effektiv søkebredde (m) per spor og ressurstype, for dekning C = W·L/A og POD = 1 − e^(−C). */
  sokebredde: Record<SporRessurs, number>;

  /** Search techniques for sizing teiger and search time. */
  teknikker: Record<SokTeknikk, Teknikk>;
  /** Technique the generated teiger are sized for. */
  standardTeknikk: SokTeknikk;
  /** Max search time per teig (h) – Norsk Folkehjelp practice, not from HRS. */
  maksSoketid: number;
  /** Max teig area (km²) – Norsk Folkehjelp practice. */
  maksTeigKm2: number;
  /** Teiger smaller than this (km²) are merged with a neighbour. */
  minTeigKm2: number;
  /** Search in forest is slower by this factor. */
  skogSokefaktor: number;
  /** Hours from start: before the first value only ledelinjer/POI (and navet), then teiger for available teams, after the second the full teigsett. */
  fasegrenser: [number, number];
  /** Drone areas (km²); the maximum is about what one battery covers. */
  droneMinKm2: number;
  droneMaksKm2: number;
  /** Drone search speed (km/h) and effective flight time per battery (min), for flight time per area. */
  droneFartKmt: number;
  droneBatteriMin: number;

  /** «Ferdig sjekket» point: POD within the radius (m). */
  sjekketPunktPod: number;
  sjekketPunktM: number;
  /** «Ferdig sjekket» ledelinje (hurtigsøk): POD within this distance (m) on each side. */
  sjekketLinjePod: number;
  sjekketLinjeM: number;
  /** A ledelinje counts as searched by GPS tracks when this share of it lies within the tolerance. */
  sporLinjeAndel: number;
  /** Tolerance (m) between track and ledelinje; at least half the sweep width is used. */
  sporLinjeToleranseM: number;

  /** Sperrepost: POD for someone passing through its coverage, and the default coverage radius (m). */
  sperrepostPod: number;
  sperrepostRadiusM: number;

  /** Stisøk (søk langs ledelinje): speed over the whole line (km/h) per resource, for the time estimate. */
  stisokFotKmt: number;
  stisokFlankeKmt: number;
  stisokHundKmt: number;
  stisokAtvKmt: number;
  stisokBilKmt: number;
  stisokSkuterKmt: number;

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

  sokebredde: { fotmannskap: 30, hund: 80, hundefører: 30, drone: 60, helikopter: 150, motorisert: 20 },

  teknikker: {
    grovsok: { navn: 'Grovsøk (kombinert mannskapssøk)', mannskap: 3, avstandM: 25, fartKmt: 1.5 },
    finsok: { navn: 'Finsøk / søkekjede', mannskap: 6, avstandM: 10, fartKmt: 1.0 },
    kompasskurs: { navn: 'Kompasskurssøk', mannskap: 3, avstandM: 75, fartKmt: 2.5 },
  },
  standardTeknikk: 'grovsok',
  maksSoketid: 2,
  maksTeigKm2: 0.9,
  minTeigKm2: 0.05,
  skogSokefaktor: 0.7,
  fasegrenser: [6, 12],
  // 60 m sweep × 18 km/h ≈ 1.08 km²/h → 25 min per battery ≈ 0.45 km²
  droneMinKm2: 0.2,
  droneMaksKm2: 0.45,
  droneFartKmt: 18,
  droneBatteriMin: 25,

  sjekketPunktPod: 0.8,
  sjekketPunktM: 50,
  sjekketLinjePod: 0.5,
  sjekketLinjeM: 30,
  sporLinjeAndel: 0.7,
  sporLinjeToleranseM: 25,

  sperrepostPod: 0.8,
  sperrepostRadiusM: 100,

  stisokFotKmt: 3,
  stisokFlankeKmt: 1.5,
  stisokHundKmt: 2.5,
  stisokAtvKmt: 8,
  stisokBilKmt: 15,
  stisokSkuterKmt: 15,

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
    sokebredde: { ...STANDARD_MODELL.sokebredde, ...(p?.sokebredde ?? {}) },
    teknikker: {
      grovsok: { ...STANDARD_MODELL.teknikker.grovsok, ...(p?.teknikker?.grovsok ?? {}) },
      finsok: { ...STANDARD_MODELL.teknikker.finsok, ...(p?.teknikker?.finsok ?? {}) },
      kompasskurs: { ...STANDARD_MODELL.teknikker.kompasskurs, ...(p?.teknikker?.kompasskurs ?? {}) },
    },
    fasegrenser: (p?.fasegrenser ?? STANDARD_MODELL.fasegrenser).slice(0, 2) as [number, number],
  };
}

/** Labels for the settings screen. */
export const MODELL_FELT: Array<{
  felt: Exclude<keyof Modellantakelser, 'obsVekt' | 'elvErBarriere' | 'sokebredde' | 'teknikker' | 'standardTeknikk' | 'fasegrenser'>;
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
  { felt: 'maksSoketid', navn: 'Maks søketid per teig (t)', steg: 0.25, min: 0.5, max: 8, hjelp: 'Norsk Folkehjelps praksis: 2 timer.' },
  { felt: 'maksTeigKm2', navn: 'Maks teigstørrelse (km²)', steg: 0.05, min: 0.1, max: 3 },
  { felt: 'minTeigKm2', navn: 'Minste teig før sammenslåing (km²)', steg: 0.01, min: 0.01, max: 0.5 },
  { felt: 'skogSokefaktor', navn: 'Søkefart i skog (andel)', steg: 0.05, min: 0.2, max: 1 },
  { felt: 'droneMinKm2', navn: 'Droneområde minst (km²)', steg: 0.05, min: 0.05, max: 3 },
  {
    felt: 'droneMaksKm2',
    navn: 'Droneområde maks (km²)',
    steg: 0.05,
    min: 0.1,
    max: 5,
    hjelp: 'Standard 0,45 km²: ca. ett batteri med 60 m søkebredde, 18 km/t og 25 min flytid.',
  },
  { felt: 'droneFartKmt', navn: 'Drone søkefart (km/t)', steg: 1, min: 3, max: 60 },
  { felt: 'droneBatteriMin', navn: 'Effektiv flytid per batteri (min)', steg: 1, min: 5, max: 120 },
  { felt: 'sjekketPunktPod', navn: 'POD for sjekket punkt (0–1)', steg: 0.05, min: 0, max: 1, hjelp: 'Gjelder innenfor radiusen under.' },
  { felt: 'sjekketPunktM', navn: 'Radius for sjekket punkt (m)', steg: 5, min: 10, max: 500 },
  { felt: 'sjekketLinjePod', navn: 'POD for sjekket ledelinje (0–1)', steg: 0.05, min: 0, max: 1, hjelp: 'Hurtigsøk langs linja. Gjelder innenfor avstanden under på hver side.' },
  { felt: 'sjekketLinjeM', navn: 'Avstand på hver side av sjekket ledelinje (m)', steg: 5, min: 5, max: 300 },
  {
    felt: 'sporLinjeAndel',
    navn: 'Ledelinje søkt av GPS-spor fra andel (0–1)',
    steg: 0.05,
    min: 0.1,
    max: 1,
    hjelp: 'Så stor del av linja må ligge nær et spor for at den merkes som søkt.',
  },
  { felt: 'sporLinjeToleranseM', navn: 'Avstand spor–ledelinje (m)', steg: 5, min: 5, max: 200 },
  {
    felt: 'sperrepostPod',
    navn: 'Sperrepost: sannsynlighet for å bli sett (0–1)',
    steg: 0.05,
    min: 0,
    max: 1,
    hjelp: 'Senker sannsynligheten bak en sperrepost som var satt opp før personen kunne nå den.',
  },
  { felt: 'sperrepostRadiusM', navn: 'Sperrepost: standard dekning (m)', steg: 5, min: 25, max: 1000, hjelp: 'Kan endres per post ved å dra i sirkelen i kartet.' },
  { felt: 'stisokFotKmt', navn: 'Stisøk: fotlag uten flanke (km/t)', steg: 0.5, min: 0.5, max: 10, hjelp: 'Brukes til tidsestimatet for søk langs ledelinje helt ut.' },
  { felt: 'stisokFlankeKmt', navn: 'Stisøk: fotlag med flanke (km/t)', steg: 0.5, min: 0.5, max: 10 },
  { felt: 'stisokHundKmt', navn: 'Stisøk: hund (km/t)', steg: 0.5, min: 0.5, max: 10 },
  { felt: 'stisokAtvKmt', navn: 'Stisøk: ATV med stopp (km/t)', steg: 1, min: 1, max: 40 },
  { felt: 'stisokBilKmt', navn: 'Stisøk: bil med stopp (km/t)', steg: 1, min: 1, max: 60 },
  { felt: 'stisokSkuterKmt', navn: 'Stisøk: snøskuter med stopp (km/t)', steg: 1, min: 1, max: 60 },
  { felt: 'ledelinjeTakKm', navn: 'Tak på søkeradius for stier (km)', steg: 1, min: 1, max: 25 },
  { felt: 'antallLedelinjer', navn: 'Antall ledelinjer med L-nummer', steg: 1, min: 5, max: 60 },
  { felt: 'antallPunkter', navn: 'Antall mest sannsynlige punkter', steg: 1, min: 3, max: 20 },
];

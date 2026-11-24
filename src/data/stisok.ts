import type { LinjeType } from '../model/typer';
import type { Modellantakelser } from './modellantakelser';

/**
 * Anbefalt ressurs og metode for søk langs en ledelinje (stisøk), etter veileder kap. 6.3:
 * 6.3.1 hund, 6.3.2 søk langs ledelinje (med/uten flanke), 6.3.6 kjøretøy, 6.3.8 droner og
 * 7.3.10 (søk ledelinja helt ut). Søkskart registrerer ikke ressurser – ressursstatus føres i
 * FAKS. Dette er en anbefaling søksleder vurderer, ikke en tildeling.
 */
export type StiRessurs = 'fotlag' | 'hund' | 'drone' | 'atv' | 'bil' | 'snoskuter';

export const STIRESSURSER: Array<{ type: StiRessurs; navn: string }> = [
  { type: 'fotlag', navn: 'Fotlag' },
  { type: 'hund', navn: 'Hund' },
  { type: 'drone', navn: 'Drone' },
  { type: 'atv', navn: 'ATV' },
  { type: 'bil', navn: 'Bil' },
  { type: 'snoskuter', navn: 'Snøskuter' },
];

export const STIRESSURS_NAVN = Object.fromEntries(STIRESSURSER.map((r) => [r.type, r.navn])) as Record<StiRessurs, string>;

export interface StiValg {
  ressurs: StiRessurs;
  tekst: string;
}

export interface StisokAnbefaling {
  primar: StiValg;
  alternativ: StiValg[];
  /** søkemetode as named in the veileder (matches SOKSTYPER in domain/ordre.ts) */
  metode: string;
  flanke: boolean;
  merknader: string[];
  kilder: string[];
  /** false: søksfaglig praksis, not stated in the veileder */
  verifisert: boolean;
  /** estimated time (min) for the primary resource over the whole line */
  minutter: number;
}

/** Categories where the person may be beside, not on, the line (veileder 6.3.2: syke, økt selvmordsrisiko, barn som gjemmer seg). */
export const FLANKEKATEGORIER = ['dement', 'suicid', 'b13', 'b46', 'b79', 'b1012', 'b1315'];
const SKIKATEGORIER = ['langrenn', 'alpin'];

const METODE_UTEN = 'Søk langs ledelinje (uten flanke)';
const METODE_MED = 'Søk langs ledelinje med flanke';
const METODE_DRONE = 'Dronesøk';

interface Rad {
  primar: StiValg;
  alternativ: StiValg[];
  merknader: string[];
  kilder: string[];
  verifisert: boolean;
}

const FOTLAG: StiValg = { ressurs: 'fotlag', tekst: 'Fotlag 1–3 personer, hurtigsøk langs linja' };
const HUND: StiValg = { ressurs: 'hund', tekst: 'Hund – helst før andre har gått linja (minst mulig tråkk og lukt)' };
const GJENTA = 'Personer på ledelinjer er ofte i bevegelse – gjenta søket senere i aksjonen (6.3.2).';

const TABELL: Record<LinjeType, Rad> = {
  sti: {
    primar: FOTLAG,
    alternativ: [HUND],
    merknader: [GJENTA],
    kilder: ['Veileder 6.3.2 Søk langs ledelinje', 'Veileder 6.3.1 Søk med hund'],
    verifisert: true,
  },
  traktorvei: {
    primar: { ressurs: 'atv', tekst: 'ATV med 2 personer – stopp og lytt med faste mellomrom' },
    alternativ: [FOTLAG, HUND],
    merknader: ['Støy fra kjøretøyet gjør det vanskelig å høre rop: flere personer på kjøretøyet og faste stopp for å speide og lytte (6.3.6).', GJENTA],
    kilder: ['Veileder 6.3.6 Søk med kjøretøy', 'Veileder 6.3.2 Søk langs ledelinje'],
    verifisert: true,
  },
  vei: {
    primar: { ressurs: 'bil', tekst: 'Bil med 2 eller flere personer – lav fart, stopp og lytt' },
    alternativ: [{ ressurs: 'fotlag', tekst: 'Fotlag langs veiskråninger og grøfter der utforkjøring er mulig (med flanke)' }],
    merknader: ['Sjekk veiskråninger og grøfter – utforkjøring med sykkel eller kjøretøy (6.3.2).', GJENTA],
    kilder: ['Veileder 6.3.6 Søk med kjøretøy', 'Veileder 6.3.2 Søk langs ledelinje med flanke'],
    verifisert: true,
  },
  vann: {
    primar: { ressurs: 'drone', tekst: 'Drone langs vassdraget (elv- og strandsøk)' },
    alternativ: [{ ressurs: 'fotlag', tekst: 'Fotlag langs bredden' }],
    merknader: ['Følg vassdraget helt ut, f.eks. til bebyggelse (7.3.10).'],
    kilder: ['Veileder 6.3.8 Søk med droner', 'Veileder 7.3.10 Ledelinjene blir ikke søkt langt nok ut'],
    verifisert: true,
  },
  kraft: {
    primar: { ressurs: 'drone', tekst: 'Drone langs ryddebeltet (åpent terreng)' },
    alternativ: [FOTLAG],
    merknader: [],
    kilder: ['Veileder 6.3.8 Søk med droner (åpne områder)'],
    verifisert: true,
  },
  jernbane: {
    primar: { ressurs: 'drone', tekst: 'Drone langs sporet' },
    alternativ: [{ ressurs: 'fotlag', tekst: 'Fotlag langs sporet' }],
    merknader: ['Avklar med Bane NOR (togtrafikk) før søk langs eller på sporet.'],
    kilder: ['Veileder 6.3.8 Søk med droner', 'Søksfaglig praksis (Bane NOR)'],
    verifisert: false,
  },
};

/** Search speed (km/h) for the whole line, by resource. */
export function stisokFart(r: StiRessurs, flanke: boolean, m: Modellantakelser): number {
  switch (r) {
    case 'fotlag':
      return flanke ? m.stisokFlankeKmt : m.stisokFotKmt;
    case 'hund':
      return m.stisokHundKmt;
    case 'drone':
      return m.droneFartKmt;
    case 'atv':
      return m.stisokAtvKmt;
    case 'bil':
      return m.stisokBilKmt;
    case 'snoskuter':
      return m.stisokSkuterKmt;
  }
}

/**
 * Recommendation for one ledelinje. `kategorier` are the chosen category keys (weight > 0).
 * Flanke when a category says the person may be beside the line; snøskuter on paths and
 * tractor roads when a ski category is chosen.
 */
export function stisokAnbefaling(type: LinjeType, lengdeM: number, kategorier: string[], m: Modellantakelser): StisokAnbefaling {
  const rad = TABELL[type];
  let primar = rad.primar;
  let alternativ = [...rad.alternativ];
  const merknader = [...rad.merknader];
  const kilder = [...rad.kilder];
  const flanke = kategorier.some((k) => FLANKEKATEGORIER.includes(k));
  const ski = kategorier.some((k) => SKIKATEGORIER.includes(k));

  if (ski && (type === 'sti' || type === 'traktorvei')) {
    alternativ = [{ ressurs: 'fotlag', tekst: 'Fotlag på ski langs løypa' }, ...alternativ.filter((v) => v.ressurs !== 'fotlag')];
    primar = { ressurs: 'snoskuter', tekst: 'Snøskuter langs løypa/traktorveien – stopp og lytt med faste mellomrom' };
    kilder.push('Veileder 6.3.6 (snøskuter vinterstid)');
  }
  if (flanke) {
    const medFlanke: StiValg = { ressurs: 'fotlag', tekst: 'Fotlag 2–6 personer, søk med flanke (1–3 på hver side av linja)' };
    if (primar.ressurs === 'fotlag') primar = medFlanke;
    else alternativ = [medFlanke, ...alternativ.filter((v) => v.ressurs !== 'fotlag')];
    merknader.unshift('Kategorien tilsier at personen kan ha trukket seg litt bort fra linja – søk med flanke er langsommere, men finner også den som ikke er på linja (6.3.2).');
    if (!kilder.some((k) => k.includes('med flanke'))) kilder.push('Veileder 6.3.2 Søk langs ledelinje med flanke');
  }
  const metode = primar.ressurs === 'drone' ? METODE_DRONE : flanke && primar.ressurs === 'fotlag' ? METODE_MED : METODE_UTEN;
  const fart = stisokFart(primar.ressurs, flanke && primar.ressurs === 'fotlag', m);
  const minutter = fart > 0 ? Math.round(((lengdeM / 1000) / fart) * 60) : 0;
  return { primar, alternativ, metode, flanke, merknader, kilder, verifisert: rad.verifisert, minutter };
}

/** Resources a line is recommended for (primary and alternatives), for the map filter. */
export function ressurserFor(a: StisokAnbefaling): StiRessurs[] {
  return [a.primar.ressurs, ...a.alternativ.map((v) => v.ressurs)];
}

/** Chosen category keys with weight > 0. */
export function valgteKategorier(k: Array<{ key: string; vekt: number }>): string[] {
  return k.filter((x) => x.vekt > 0).map((x) => x.key);
}

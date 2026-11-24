import { kopierStatistikk, type LpbKategori, type Terreng } from '../data/lpb-stats';
import { medStandard, STANDARD_MODELL, type Modellantakelser, type Observasjonsklasse, type SporRessurs } from '../data/modellantakelser';
import type { ValgtKategori } from '../model/lpb';
import { INGEN_RESSURSER, type Ressursantall } from '../model/ressurser';
import type { OsmData } from '../model/typer';
import type { LatLng } from './coords';
import type { ForslagGrunnlag } from './grunnlag';
import type { Sekvens } from './naming';
import { akkumulertPod, type TeigStatus } from './pod';
import type { ZoneChoice } from './utm';

export interface Sok {
  id: string;
  /** ISO time the search was registered/finished */
  tid: string;
  /** 0..1 */
  pod: number;
  org: string;
  ressurstype: string;
  enhet: string;
  merknad: string;
  /** GPS tracks the POD was based on (not counted again for this teig) */
  spor?: string[];
}

export type Avgrensningstype = 'T' | 'H' | 'D';

export interface Teig {
  id: string;
  type: Avgrensningstype;
  navn: string;
  ring: LatLng[];
  status: TeigStatus;
  utdelt: { tid: string; ressurs: string } | null;
  sok: Sok[];
  opprettet: string;
  /** why it was suggested (kept from the suggestion when approved) */
  grunnlag?: ForslagGrunnlag;
}

export type PunktType = 'obs' | 'sp' | 'poi' | 'funn';

export interface Punkt {
  id: string;
  type: PunktType;
  klasse: Observasjonsklasse;
  /** local datetime of the observation 'YYYY-MM-DDTHH:mm' */
  tid: string;
  tekst: string;
  pos: LatLng;
}

export interface LoggPost {
  tid: string;
  tekst: string;
}

/** Aksjon-wide text used in every 5-punktsordre (edited in the order dialog). */
export interface Ordretekster {
  egneStyrker: string;
  varLysFore: string;
  administrasjon: string;
  ledelseSamband: string;
}

export type { SporRessurs } from '../data/modellantakelser';

export interface Spor {
  id: string;
  navn: string;
  ressurs: SporRessurs;
  org: string;
  enhet: string;
  /** geographic area the track belongs to, e.g. T005 (from the name or chosen) */
  avgrensning: string;
  pts: LatLng[];
  /** time of the last point, if the GPX had times */
  tid: string | null;
  importert: string;
}

export interface Aksjon {
  id: string;
  /** data-model revision (see AKSJON_SKJEMA); drives one-time migrations in lesAksjonsfil */
  skjema: number;
  navn: string;
  sarNr: string;
  kategorier: ValgtKategori[];
  terreng: Terreng;
  /** local datetime 'YYYY-MM-DDTHH:mm' */
  sistSett: string | null;
  sone: ZoneChoice;
  ipp: LatLng | null;
  ippSatt: string | null;
  /** when the search started (search phase is measured from here) */
  aksjonStart: string | null;
  teiger: Teig[];
  punkter: Punkt[];
  sykkelhjul: Record<string, boolean>;
  ressurser: Ressursantall;
  /** OSM chain id → fixed L number */
  lnummer: Record<string, string>;
  seq: Sekvens;
  modell: Modellantakelser;
  logg: LoggPost[];
  ordre: Ordretekster;
  spor: Spor[];
  opprettet: string;
  endret: string;
}

export const TOMME_ORDRETEKSTER: Ordretekster = {
  egneStyrker: '',
  varLysFore: '',
  administrasjon: 'Oppmøte og retur til ILKO. Egen mat, drikke og nødbivuakk.',
  ledelseSamband: 'ILKO leder søket. Samband på tildelt talegruppe (Nødnett). Meld start, avvik og ferdig søk til ILKO.',
};

export function nyId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Data-model revision of an aksjon (separate from the file format version, which stays 1).
 * 2: regioner/Mattson and the savnet profile removed.
 * 3: drone areas 0,2–0,45 km² (one battery) instead of 1–3 km².
 */
export const AKSJON_SKJEMA = 3;

export function nyAksjon(): Aksjon {
  const t = new Date().toISOString();
  return {
    id: nyId(),
    skjema: AKSJON_SKJEMA,
    navn: '',
    sarNr: '',
    kategorier: [{ key: 'turgaer', vekt: 1 }],
    terreng: 'fjell',
    sistSett: null,
    sone: 'auto',
    ipp: null,
    ippSatt: null,
    aksjonStart: null,
    teiger: [],
    punkter: [],
    sykkelhjul: {},
    ressurser: { ...INGEN_RESSURSER },
    lnummer: {},
    seq: {},
    modell: medStandard(undefined),
    logg: [{ tid: t, tekst: 'Aksjon opprettet' }],
    ordre: { ...TOMME_ORDRETEKSTER },
    spor: [],
    opprettet: t,
    endret: t,
  };
}

export const teigPods = (t: Teig) => t.sok.map((s) => s.pod);
export const teigAkkPod = (t: Teig) => akkumulertPod(teigPods(t));
export const harRegistrerteSok = (a: Aksjon) => a.teiger.some((t) => t.sok.length > 0);

/** Hours between two local datetimes / ISO strings (null if missing or invalid). */
export function timerMellom(fra: string | null, til: Date): number | null {
  if (!fra) return null;
  const t = new Date(fra).getTime();
  if (!Number.isFinite(t)) return null;
  return (til.getTime() - t) / 3.6e6;
}

/** 'YYYY-MM-DDTHH:mm' in local time, for <input type="datetime-local">. */
export function lokalTid(d: Date = new Date()): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------- aksjonsfil

export const AKSJONSFIL_FORMAT = 'sokskart-aksjon';
export const AKSJONSFIL_VERSJON = 1;

export interface Aksjonsfil {
  format: typeof AKSJONSFIL_FORMAT;
  versjon: number;
  eksportert: string;
  aksjon: Aksjon;
  statistikk: LpbKategori[];
  osm: OsmData | null;
}

export function lagAksjonsfil(a: Aksjon, statistikk: LpbKategori[], osm: OsmData | null): Aksjonsfil {
  return { format: AKSJONSFIL_FORMAT, versjon: AKSJONSFIL_VERSJON, eksportert: new Date().toISOString(), aksjon: a, statistikk, osm };
}

const erLatLng = (p: unknown): p is LatLng =>
  !!p && typeof p === 'object' && Number.isFinite((p as LatLng).lat) && Number.isFinite((p as LatLng).lng);

export type ImportResultat = { ok: true; fil: Aksjonsfil; advarsler: string[] } | { ok: false; feil: string };

/** Validates and normalises an imported aksjonsfil (also accepts the prototype's format). */
export function lesAksjonsfil(tekst: string): ImportResultat {
  let j: unknown;
  try {
    j = JSON.parse(tekst);
  } catch {
    return { ok: false, feil: 'Fila er ikke gyldig JSON.' };
  }
  if (!j || typeof j !== 'object') return { ok: false, feil: 'Fila inneholder ingen aksjon.' };
  const o = j as Record<string, unknown>;
  const advarsler: string[] = [];

  if (o.format !== AKSJONSFIL_FORMAT) {
    if (o.state && typeof o.state === 'object') return fraPrototype(o);
    return { ok: false, feil: 'Dette er ikke en aksjonsfil fra Søkskart.' };
  }
  if (typeof o.versjon !== 'number' || o.versjon > AKSJONSFIL_VERSJON) {
    return { ok: false, feil: 'Aksjonsfila er laget med en nyere versjon av Søkskart.' };
  }
  if (!o.aksjon || typeof o.aksjon !== 'object') return { ok: false, feil: 'Aksjonsfila mangler aksjonsdata.' };
  // work on a copy: fields removed from Søkskart are stripped here (the spread below would keep them)
  const raw = { ...(o.aksjon as Record<string, unknown>) };
  fjernUtgatteFelt(raw, advarsler);
  const a = raw as Partial<Aksjon>;
  const fraSkjema = typeof a.skjema === 'number' ? a.skjema : 1;
  const base = nyAksjon();
  const aksjon: Aksjon = {
    ...base,
    ...a,
    id: typeof a.id === 'string' ? a.id : base.id,
    skjema: AKSJON_SKJEMA,
    ipp: erLatLng(a.ipp) ? a.ipp : null,
    aksjonStart: typeof a.aksjonStart === 'string' ? a.aksjonStart : (a.ippSatt ?? null),
    teiger: Array.isArray(a.teiger) ? a.teiger.filter((t) => t && Array.isArray(t.ring) && t.ring.every(erLatLng)) : [],
    punkter: Array.isArray(a.punkter) ? a.punkter.filter((p) => p && erLatLng(p.pos)) : [],
    kategorier: Array.isArray(a.kategorier) && a.kategorier.length ? a.kategorier : base.kategorier,
    ressurser: { ...INGEN_RESSURSER, ...(a.ressurser ?? {}) },
    modell: medStandard(a.modell),
    logg: Array.isArray(a.logg) ? a.logg : [],
    lnummer: a.lnummer && typeof a.lnummer === 'object' ? a.lnummer : {},
    seq: a.seq && typeof a.seq === 'object' ? a.seq : {},
    sykkelhjul: a.sykkelhjul && typeof a.sykkelhjul === 'object' ? a.sykkelhjul : {},
    ordre: { ...TOMME_ORDRETEKSTER, ...(a.ordre ?? {}) },
    spor: Array.isArray(a.spor) ? a.spor.filter((s) => s && Array.isArray(s.pts) && s.pts.every(erLatLng)) : [],
  };
  migrer(aksjon, fraSkjema, advarsler);
  if (Array.isArray(a.teiger) && aksjon.teiger.length < a.teiger.length) advarsler.push('Noen teiger hadde ugyldig geometri og ble hoppet over.');
  const statistikk = Array.isArray(o.statistikk) && o.statistikk.length ? (o.statistikk as LpbKategori[]) : kopierStatistikk();
  const osm = o.osm && typeof o.osm === 'object' && Array.isArray((o.osm as OsmData).linjer) ? (o.osm as OsmData) : null;
  return { ok: true, fil: { format: AKSJONSFIL_FORMAT, versjon: AKSJONSFIL_VERSJON, eksportert: String(o.eksportert ?? ''), aksjon, statistikk, osm }, advarsler };
}

/**
 * Removes data from features that no longer exist in Søkskart. Runs on every load
 * (files and IndexedDB), so it must be safe to repeat.
 */
function fjernUtgatteFelt(raw: Record<string, unknown>, advarsler: string[]): void {
  const regioner = Array.isArray(raw.regioner) ? raw.regioner.length : 0;
  const mattson = raw.mattson as { deltakere?: unknown[] } | undefined;
  if (regioner > 0 || (Array.isArray(mattson?.deltakere) && mattson.deltakere.length > 0)) {
    advarsler.push('Regioner og Mattson-vurderinger er fjernet fra Søkskart og ble ikke lastet inn.');
  }
  delete raw.regioner;
  delete raw.mattson;
  if (raw.seq && typeof raw.seq === 'object') {
    const seq = { ...(raw.seq as Record<string, unknown>) };
    delete seq.REG;
    raw.seq = seq;
  }

  // personal data about the missing person is no longer kept in Søkskart (open app):
  // drop the profile and the log lines the old Savnet tab wrote (they held the values)
  const profil = raw.savnet as Record<string, unknown> | undefined;
  const hadde = !!profil && Object.values(profil).some((v) => typeof v === 'string' && v !== '' && v !== 'ukjent');
  delete raw.savnet;
  let fjernet = 0;
  if (Array.isArray(raw.logg)) {
    const antallFor = raw.logg.length;
    raw.logg = (raw.logg as LoggPost[]).filter((l) => !(typeof l?.tekst === 'string' && SAVNET_LOGG.test(l.tekst)));
    fjernet = antallFor - (raw.logg as LoggPost[]).length;
  }
  if (hadde || fjernet > 0) {
    advarsler.push('Opplysninger om den savnede (profil, bilde og logglinjer om dem) er fjernet. Søkskart lagrer ikke lenger personopplysninger.');
  }
}

/**
 * One-time changes of stored values, by schema revision. Unlike fjernUtgatteFelt these run
 * only once, so a value the user sets on purpose later is never changed again.
 */
function migrer(a: Aksjon, fra: number, advarsler: string[]): void {
  if (fra < 3 && a.modell.droneMinKm2 === 1 && a.modell.droneMaksKm2 === 3) {
    a.modell.droneMinKm2 = STANDARD_MODELL.droneMinKm2;
    a.modell.droneMaksKm2 = STANDARD_MODELL.droneMaksKm2;
    const t = 'Droneområder er gjort mindre: 0,2–0,45 km² (ca. ett batteri) i stedet for 1–3 km².';
    a.logg.push({ tid: new Date().toISOString(), tekst: t });
    advarsler.push(t);
  }
}

/** Log lines written by the removed Savnet tab and photo function. */
export const SAVNET_LOGG = /^(Savnetprofil:|Bilde av savnede)/;

/** The single-file prototype stored {state:{…}, ways:[…]}. */
function fraPrototype(o: Record<string, unknown>): ImportResultat {
  const s = o.state as Record<string, unknown>;
  const a = nyAksjon();
  a.navn = typeof s.name === 'string' ? s.name : '';
  if (typeof s.cat === 'string') a.kategorier = [{ key: s.cat, vekt: 1 }];
  a.sistSett = typeof s.lastSeen === 'string' && s.lastSeen ? s.lastSeen : null;
  if (s.zone === '32' || s.zone === '33' || s.zone === '35' || s.zone === 'auto') a.sone = s.zone;
  const ipp = s.ipp as { lat?: number; lng?: number } | null;
  if (ipp && Number.isFinite(ipp.lat) && Number.isFinite(ipp.lng)) a.ipp = { lat: ipp.lat!, lng: ipp.lng! };
  const teiger = Array.isArray(s.teiger) ? (s.teiger as Array<Record<string, unknown>>) : [];
  a.teiger = teiger.map((t) => ({
    id: String(t.id),
    type: 'T',
    navn: '',
    ring: ((t.pts as number[][]) ?? []).map(([lat, lng]) => ({ lat, lng })),
    status: t.status === 'utdelt' ? 'utdelt' : 'planlagt',
    utdelt: null,
    sok: ((t.searches as Array<Record<string, unknown>>) ?? []).map((x, i) => ({
      id: `${t.id}-${i + 1}`,
      tid: String(x.t ?? ''),
      pod: Number(x.pod) / 100,
      org: '',
      ressurstype: String(x.res ?? ''),
      enhet: '',
      merknad: '',
    })),
    opprettet: a.opprettet,
  }));
  const punkter = Array.isArray(s.points) ? (s.points as Array<Record<string, unknown>>) : [];
  a.punkter = punkter.map((p) => ({
    id: String(p.id),
    type: (['obs', 'sp', 'poi', 'funn'].includes(String(p.type)) ? p.type : 'obs') as PunktType,
    klasse: (['sikker', 'sannsynlig', 'mulig', 'usikker'].includes(String(p.cls)) ? p.cls : 'mulig') as Observasjonsklasse,
    tid: String(p.t ?? ''),
    tekst: String(p.txt ?? ''),
    pos: { lat: Number(p.lat), lng: Number(p.lng) },
  }));
  const seq = (s.seq ?? {}) as Record<string, number>;
  a.seq = { T: seq.T ?? 0, SP: seq.SP ?? 0, R: seq.R ?? 0, OBS: seq.OBS ?? 0, F: seq.F ?? 0 };
  a.logg.push({ tid: new Date().toISOString(), tekst: 'Importert fra prototypen (sok-kart.html)' });
  return { ok: true, fil: lagAksjonsfil(a, kopierStatistikk(), null), advarsler: ['Fila er fra prototypen. Statistikken er satt til plassholderne, og stier må hentes på nytt.'] };
}

export function aksjonsfilnavn(a: Aksjon, ending: string): string {
  const base = (a.sarNr || a.navn || 'aksjon').replace(/[^\wæøåÆØÅ-]+/g, '_').replace(/^_+|_+$/g, '') || 'aksjon';
  return `${base}.${ending}`;
}

export const teigAktiv = (t: Teig) => teigAkkPod(t) < 1;

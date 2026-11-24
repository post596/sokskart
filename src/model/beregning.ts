import type { LatLng } from '../domain/coords';
import { distanceM } from '../domain/geo';
import { computeZone, type ZoneChoice } from '../domain/utm';
import type { Modellantakelser, Observasjonsklasse } from '../data/modellantakelser';
import { gangtid } from './gangtid';
import { cellAreaKm2, cellIndex, cellX, cellY, fraGrid, lagGrid, lagMercatorIndeks, tilGrid, type Grid, type MercatorIndeks } from './grid';
import { blandingRinger, vektetFart, type Komponent } from './lpb';
import { rangerLinjer, tidVedPunkter } from './rangering';
import { cellerIPolygon, forCellsInPolygon, forCellsNearLine } from './raster';
import { beregnSannsynlighet, mestSannsynlige, sumCeller, UTGANGSPUNKT } from './sannsynlighet';
import { AREALKLASSE, byggTerreng, type TerrengLag } from './terreng';
import { cellSoketid, droneFlytid, sokefaktorer } from './soketid';
import { forslagGrunnlag, type GrunnlagKontekst } from './grunnlag';
import { dekketAreal, leggTilDekning, leggTilFastPod, linjerAvSpor, sveipLinje, sveipSkive } from './innsats';
import type { ForslagGrunnlag } from '../domain/grunnlag';
import { genererTeiger } from './teiggenerator';
import type { SokTeknikk, SporRessurs } from '../data/modellantakelser';
import { PUNKTBEGRUNNELSE, punktgrunn, PUNKTTYPENAVN, punktvekterMedBidrag, vurderPunkt, type PunktTypeKandidat } from '../data/interessepunkter';
import type { HoydeRaster, LinjeType, OsmData } from './typer';
import { POI_NAVN } from './typer';

export interface BeregningInput {
  ipp: LatLng;
  sone: ZoneChoice;
  komps: Komponent[];
  m: Modellantakelser;
  timerSidenSistSett: number | null;
  osm: OsmData | null;
  osmVersjon: string;
  hoyde: HoydeRaster | null;
  hoydeVersjon: string;
  observasjoner: Array<{ pos: LatLng; timerSiden: number; klasse: Observasjonsklasse }>;
  teiger: Array<{ id: string; ringer: LatLng[][]; pod: number }>;
  reflekser: Array<{ id: string; navn: string; pos: LatLng }>;
  /**
   * Search effort outside registered teig searches: points and ledelinjer marked as checked,
   * and GPS tracks. A track does not count inside the teiger in `utelat` (its coverage is
   * already in a registered search there).
   */
  innsats?: {
    punkter: LatLng[];
    linjer: LatLng[][];
    spor?: Array<{ id: string; ressurs: SporRessurs; pts: LatLng[]; utelat: string[] }>;
  };
  /** hours walked used for the frontier along ledelinjer (time slider) */
  visningTimer: number | null;
  merkatorBredde: number;
  /** requested suggestions for new teiger / drone areas */
  forslagOnske?: ForslagOnske | null;
}

export interface ForslagOnske {
  /** fase: why the suggestions were asked for (search phase), passed on to the explanation */
  teig: { modus: 'navet' | 'neste' | 'sett'; antall: number; teknikk: SokTeknikk; fase?: ForslagGrunnlag['fase'] } | null;
  drone: { antall: number } | null;
}

export interface PoiForslag {
  /** stable key (type and rounded position), used to select it in the map */
  id: string;
  type: PunktTypeKandidat;
  navn: string;
  pos: LatLng;
  /** POA within ~150 m */
  poa: number;
  score: number;
  timer: number | null;
  /** why it is suggested */
  grunnlag: PoiGrunnlag;
}

export interface PoiGrunnlag {
  /** where the point comes from: an OSM point, or derived from a cliff, shore, wetland or junction */
  kilde: 'osm' | 'stup' | 'strand' | 'myr' | 'stikryss';
  kildeTekst: string;
  /** categories that make this type relevant, largest share first */
  bidrag: Array<{ kategori: string; navn: string; andel: number }>;
  /** reason per contributing category (max 2) */
  begrunnelse: string[];
  /** reference for the reason (veileder or practice) */
  referanse: string;
  /** 0–3: 25/50/75/95 % zone, null outside */
  sone: number | null;
  vurder: string;
}

export interface TeigForslag {
  ring: LatLng[];
  arealKm2: number;
  timer: number;
  poa: number;
  score: number;
  /** technique the search time is for (teig suggestions) */
  teknikk?: SokTeknikk;
  /** why it was suggested */
  grunnlag?: ForslagGrunnlag;
}

export interface LinjeInfo {
  /** index in osm.linjer */
  i: number;
  id: string;
  type: LinjeType;
  navn: string;
  na: number;
  for: number;
  lengdeM: number;
  /** earliest arrival (h at the person's weighted speed) */
  tMin: number;
}

export interface Punkt {
  pos: LatLng;
  p: number;
  avstandM: number;
  timer: number | null;
  vedLedelinje: boolean;
}

export interface BeregningResultat {
  grid: Grid;
  ringer: [number, number, number, number];
  fart: { v: number; mob: number };
  merc: MercatorIndeks;
  band: Int8Array;
  T1: Float32Array;
  /** POA now per cell */
  post: Float32Array;
  arealKm2: [number, number, number, number];
  sokt: number;
  /** sporDekning: share of the teig covered by imported GPS tracks (mean 1 − e^−C), when there are tracks */
  teiger: Array<{ id: string; poaFor: number; poaNa: number; celler: number; timer: number; sporDekning?: number }>;
  /** POA now outside all teiger */
  utenforTeiger: number;
  /** ledelinjer followed by GPS tracks (share of the line within the tolerance ≥ sporLinjeAndel) */
  sporLinjer: Array<{ id: string; andel: number; spor: string[] }>;
  punkter: Punkt[];
  linjer: LinjeInfo[];
  linjeTider: Float32Array;
  linjeStart: Uint32Array;
  korridorAndel: number | null;
  teigforslag: TeigForslag[];
  droneforslag: TeigForslag[];
  /** suggested points of interest for the chosen categories, best first */
  poiforslag: PoiForslag[];
  harHoyde: boolean;
  brattCeller: number;
  ms: number;
}

export function gridFor(ipp: LatLng, sone: ZoneChoice, komps: Komponent[], m: Modellantakelser): Grid {
  const R = blandingRinger(komps, m.haleFaktor);
  const half = Math.min(30000, Math.max(2000, Math.ceil((R[3] * m.omradeFaktor) / 500) * 500));
  return lagGrid(ipp, computeZone(ipp.lat, ipp.lng, sone), half, m.rutenett);
}

export interface BeregningCache {
  gridKey?: string;
  merc?: MercatorIndeks;
  terrKey?: string;
  terr?: TerrengLag;
  T1?: Float32Array;
  obsT1?: Map<string, Float32Array>;
  /** swept area per cell for each GPS track (sparse), keyed by grid, track and sweep width */
  spor?: Map<string, Map<number, number>>;
}

const gridKeyOf = (g: Grid) => `${g.zone}|${g.west.toFixed(2)}|${g.north.toFixed(2)}|${g.n}|${g.cell.toFixed(4)}`;

export function beregn(inp: BeregningInput, cache: BeregningCache = {}): BeregningResultat {
  const t0 = Date.now();
  const { m, komps } = inp;
  const g = gridFor(inp.ipp, inp.sone, komps, m);
  const gk = gridKeyOf(g);
  if (cache.gridKey !== gk || !cache.merc || cache.merc.width !== inp.merkatorBredde) {
    cache.gridKey = gk;
    cache.merc = lagMercatorIndeks(g, inp.merkatorBredde);
    cache.terrKey = undefined;
  }
  const tk = [
    gk,
    inp.osmVersjon,
    inp.hoydeVersjon,
    m.terrengfaktor,
    m.myrfaktor,
    m.kraftgatefaktor,
    m.maksHelning,
    m.elvErBarriere,
    m.naerM,
    m.korridorM,
  ].join('|');
  if (cache.terrKey !== tk || !cache.terr || !cache.T1) {
    cache.terr = byggTerreng(g, inp.osm, inp.hoyde, m);
    const start = cellIndex(g, g.cx, g.cy);
    cache.T1 = gangtid(g, cache.terr.terreng, [start], m.maksHelning);
    cache.terrKey = tk;
  }
  const terr = cache.terr;
  const T1 = cache.T1;
  const { v, mob } = vektetFart(komps);

  // teiger as cell masks
  const teigCeller = inp.teiger.map((t) => cellerIPolygon(g, t.ringer));

  // walking time from each observation that becomes a new starting point (cached)
  cache.obsT1 ??= new Map();
  const brukt = new Set<string>();
  const obs = inp.observasjoner.map((o) => {
    const [x, y] = tilGrid(g, o.pos);
    let T1o: Float32Array | null = null;
    const c = cellIndex(g, x, y);
    if (c >= 0 && UTGANGSPUNKT.includes(o.klasse) && (m.obsVekt[o.klasse] ?? 0) > 0) {
      const key = `${tk}|${c}`;
      brukt.add(key);
      T1o = cache.obsT1!.get(key) ?? null;
      if (!T1o) {
        T1o = gangtid(g, terr.terreng, [c], m.maksHelning);
        cache.obsT1!.set(key, T1o);
      }
    }
    return { x, y, timerSiden: o.timerSiden, klasse: o.klasse, T1: T1o };
  });
  for (const k of [...cache.obsT1.keys()]) if (!brukt.has(k)) cache.obsT1.delete(k);

  const teigCellerPerId = new Map(inp.teiger.map((t, k) => [t.id, teigCeller[k]]));
  const { igjen: innsats, sporAndel } = lagInnsats(g, gk, inp, teigCellerPerId, cache);

  const s = beregnSannsynlighet({
    g,
    komps,
    m,
    T1,
    timerSidenSistSett: inp.timerSidenSistSett,
    naer: inp.osm ? terr.naer : null,
    korridor: inp.osm ? terr.korridor : null,
    vann: terr.vann,
    hav: terr.hav,
    observasjoner: obs,
    sok: inp.teiger.map((t, k) => ({ celler: teigCeller[k], pod: t.pod })),
    innsats,
  });

  const ringer = s.ringer;
  const sep = Math.max(ringer[0], 300);
  const ippPos = inp.ipp;
  const punktFra = (k: number): Punkt => {
    const i = k % g.n;
    const j = (k - i) / g.n;
    const pos = fraGrid(g, cellX(g, i), cellY(g, j));
    return {
      pos,
      p: s.post[k],
      avstandM: distanceM(ippPos, pos),
      timer: Number.isFinite(T1[k]) ? T1[k] / v : null,
      vedLedelinje: !!(inp.osm && terr.korridor[k]),
    };
  };
  const punkter = mestSannsynlige(g, s.post, s.orden, m.antallPunkter, sep).map(punktFra);

  // ledelinjer
  const osmLinjer = inp.osm?.linjer ?? [];
  const rang = rangerLinjer(g, terr.linjeXY, s.post, s.prior);
  const linjer: LinjeInfo[] = rang.map((r) => {
    const l = osmLinjer[r.i];
    let tMin = Infinity;
    for (const c of r.celler) tMin = Math.min(tMin, T1[c]);
    let len = 0;
    for (let k = 1; k < l.pts.length; k++) len += distanceM(l.pts[k - 1], l.pts[k]);
    return { i: r.i, id: l.id, type: l.type, navn: l.navn, na: r.na, for: r.for, lengdeM: len, tMin: tMin / v };
  });
  const { tider, start } = tidVedPunkter(g, T1, terr.linjeXY);
  let korridorAndel: number | null = null;
  if (inp.osm && osmLinjer.length) {
    korridorAndel = 0;
    for (let k = 0; k < s.post.length; k++) if (terr.korridor[k]) korridorAndel += s.post[k];
  }

  // teig statistics
  const sf = sokefaktorer(terr, m);
  const cellM2 = cellAreaKm2(g) * 1e6;
  const teknikk = m.teknikker[m.standardTeknikk];
  const teiger = inp.teiger.map((t, k) => {
    let timer = 0;
    for (const c of teigCeller[k]) timer += sf[c] > 0 ? cellSoketid(cellM2, sf[c], teknikk) : 0;
    const n = teigCeller[k].length;
    return {
      id: t.id,
      poaFor: sumCeller(s.prior, teigCeller[k]),
      poaNa: sumCeller(s.post, teigCeller[k]),
      celler: n,
      timer,
      ...(sporAndel && n ? { sporDekning: sumCeller(sporAndel, teigCeller[k]) / n } : {}),
    };
  });
  const iTeig = new Uint8Array(s.post.length);
  for (const c of teigCeller) for (const k of c) iTeig[k] = 1;
  let utenforTeiger = 0;
  for (let k = 0; k < s.post.length; k++) if (!iTeig[k]) utenforTeiger += s.post[k];

  // ledelinjer followed by GPS tracks (tolerance: half the sweep width, at least the model value)
  const spor = inp.innsats?.spor ?? [];
  const sporLinjer =
    spor.length && osmLinjer.length
      ? linjerAvSpor(
          g,
          terr.linjeXY,
          spor.map((x) => ({ id: x.id, xy: x.pts.map((p) => tilGrid(g, p)), tolM: Math.max((m.sokebredde[x.ressurs] ?? 30) / 2, m.sporLinjeToleranseM) })),
          m.sporLinjeAndel,
        ).map((r) => ({ id: osmLinjer[r.i].id, andel: r.andel, spor: r.spor }))
      : [];

  // suggested teiger and drone areas (only when asked for)
  let teigforslag: TeigForslag[] = [];
  let droneforslag: TeigForslag[] = [];
  const onske = inp.forslagOnske;
  if (onske?.teig || onske?.drone) {
    const N = g.n * g.n;
    const linjer = [...terr.linjeXY, ...(inp.osm?.stup ?? []).map((l) => l.map((p) => tilGrid(g, p)))];
    const tilLL = (t: { ring: Array<[number, number]>; arealKm2: number; timer: number; poa: number; score: number }): TeigForslag => ({
      ...t,
      ring: t.ring.map(([x, y]) => {
        const p = fraGrid(g, x, y);
        return { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) };
      }),
    });
    const ctx: GrunnlagKontekst = { g, band: s.band, T1, v, terr, osm: inp.osm, reflekser: inp.reflekser, sokefaktor: sf, sporAndel };
    if (onske.teig) {
      const o = onske.teig;
      const maal = new Uint8Array(N);
      if (o.modus === 'navet') {
        for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) if (Math.hypot(cellX(g, i) - g.cx, cellY(g, j) - g.cy) / g.k <= ringer[0]) maal[j * g.n + i] = 1;
      } else {
        const grenseBand = o.modus === 'neste' ? 1 : 2;
        for (let k = 0; k < N; k++) if (s.band[k] >= 0 && s.band[k] <= grenseBand) maal[k] = 1;
      }
      const opptatt = new Uint8Array(N);
      inp.teiger.forEach((_, k) => {
        for (const c of teigCeller[k]) opptatt[c] = 1;
      });
      const gen = genererTeiger({
        g,
        post: s.post,
        maal,
        opptatt,
        sokefaktor: sf,
        arealtype: terr.arealtype,
        hoyde: terr.terreng.hoyde,
        linjer,
        teknikk: m.teknikker[o.teknikk],
        maksTimer: m.maksSoketid,
        maksKm2: m.maksTeigKm2,
        minKm2: m.minTeigKm2,
      });
      const valgt = (o.modus === 'neste' ? gen.slice(0, Math.max(1, o.antall)) : gen).filter((t) => t.poa > 0 || o.modus !== 'neste');
      let kum = 0;
      teigforslag = valgt.map((t, i) => {
        kum += t.poa;
        const grunnlag = forslagGrunnlag(ctx, t.ring, { ...t, rang: i + 1, antall: valgt.length, poaKum: kum }, { teknikk: m.teknikker[o.teknikk], fase: o.fase });
        return { ...tilLL(t), teknikk: o.teknikk, grunnlag };
      });
    }
    if (onske.drone) {
      const maal = new Uint8Array(N);
      for (let k = 0; k < N; k++) if (s.band[k] >= 0 && s.band[k] <= 2) maal[k] = 1;
      const opptatt = new Uint8Array(N);
      inp.teiger.forEach((t, k) => {
        if (t.id.startsWith('D')) for (const c of teigCeller[k]) opptatt[c] = 1;
      });
      const gen = genererTeiger({
        g,
        post: s.post,
        maal,
        opptatt,
        sokefaktor: new Float32Array(N).fill(1),
        arealtype: terr.arealtype,
        hoyde: null,
        linjer: [],
        teknikk: m.teknikker.grovsok,
        maksTimer: Infinity,
        maksKm2: m.droneMaksKm2,
        minKm2: m.droneMinKm2,
        fin: 50,
        modus: 'drone',
        droneeffekt: droneeffekt(g, terr),
      });
      const valgt = gen.slice(0, Math.max(1, onske.drone.antall));
      let kum = 0;
      droneforslag = valgt.map((t, i) => {
        kum += t.poa;
        const drone = { effekt: t.poa > 0 ? t.score / t.poa : 0, ...droneFlytid(t.arealKm2, m) };
        return { ...tilLL(t), grunnlag: forslagGrunnlag(ctx, t.ring, { ...t, rang: i + 1, antall: valgt.length, poaKum: kum }, { drone }) };
      });
    }
  }

  const poiforslag = inp.osm ? lagPoiForslag(g, inp, terr, T1, s.post, v, s.band) : [];

  return {
    poiforslag,
    teigforslag,
    droneforslag,
    grid: g,
    ringer,
    fart: { v, mob },
    merc: cache.merc!,
    band: s.band,
    T1,
    post: Float32Array.from(s.post),
    arealKm2: s.arealKm2,
    sokt: s.sokt,
    teiger,
    utenforTeiger,
    sporLinjer,
    punkter,
    linjer,
    linjeTider: tider,
    linjeStart: start,
    korridorAndel,
    harHoyde: terr.harHoyde,
    brattCeller: terr.brattCeller,
    ms: Date.now() - t0,
  };
}

/**
 * How well a drone works per cell (0..1). MODELLANTAKELSE, after veileder 6.3.8: open areas,
 * wetland, water and shore, glacier and steep terrain are good; forest and built-up are poor.
 */
export const DRONEEFFEKT: Record<number, number> = {
  [AREALKLASSE.ukjent]: 0.7,
  [AREALKLASSE.skog]: 0.2,
  [AREALKLASSE.kratt]: 0.6,
  [AREALKLASSE.apent]: 1,
  [AREALKLASSE.dyrket]: 0.9,
  [AREALKLASSE.bebygd]: 0.1,
  [AREALKLASSE.myr]: 1,
  [AREALKLASSE.bre]: 1,
  [AREALKLASSE.vann]: 0.8,
};

/**
 * Search effort outside registered teig searches.
 * - igjen: remaining share per cell after checked points/lines (fixed POD inside their swept
 *   area) and GPS tracks (C = swept area / cell area with the resource's sweep width,
 *   POD = 1 − e^−C; not inside teiger whose registered search already uses the track)
 * - sporAndel: share covered by all tracks (1 − e^−C), for display per teig/suggestion
 */
function lagInnsats(
  g: Grid,
  gk: string,
  inp: BeregningInput,
  teigCeller: Map<string, Int32Array>,
  cache: BeregningCache,
): { igjen: Float32Array | null; sporAndel: Float32Array | null } {
  const i = inp.innsats;
  const spor = i?.spor ?? [];
  if (!i || (!i.punkter.length && !i.linjer.length && !spor.length)) return { igjen: null, sporAndel: null };
  const m = inp.m;
  const N = g.n * g.n;
  const igjen = new Float32Array(N).fill(1);
  for (const p of i.punkter) {
    const [x, y] = tilGrid(g, p);
    leggTilFastPod(g, igjen, dekketAreal((legg) => sveipSkive(g, x, y, m.sjekketPunktM, legg)), m.sjekketPunktPod);
  }
  for (const l of i.linjer) {
    const xy = l.map((p) => tilGrid(g, p));
    leggTilFastPod(g, igjen, dekketAreal((legg) => sveipLinje(g, xy, m.sjekketLinjeM, legg)), m.sjekketLinjePod);
  }
  let sporAndel: Float32Array | null = null;
  if (spor.length) {
    const Calle = new Float32Array(N);
    const Ceff = new Float32Array(N);
    cache.spor ??= new Map();
    const brukt = new Set<string>();
    for (const s of spor) {
      const W = m.sokebredde[s.ressurs] ?? 30;
      const key = `${gk}|${s.id}|${W}|${s.pts.length}`;
      brukt.add(key);
      let d = cache.spor.get(key);
      if (!d) {
        const xy = s.pts.map((p) => tilGrid(g, p));
        d = dekketAreal((legg) => sveipLinje(g, xy, W / 2, legg));
        cache.spor.set(key, d);
      }
      leggTilDekning(g, Calle, d);
      const ute = new Set<number>();
      for (const id of s.utelat) for (const c of teigCeller.get(id) ?? []) ute.add(c);
      leggTilDekning(g, Ceff, d, ute);
    }
    for (const k of [...cache.spor.keys()]) if (!brukt.has(k)) cache.spor.delete(k);
    sporAndel = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      igjen[k] *= Math.exp(-Ceff[k]);
      sporAndel[k] = 1 - Math.exp(-Calle[k]);
    }
  }
  return { igjen, sporAndel };
}

export function droneeffekt(g: Grid, terr: TerrengLag): Float32Array {
  const N = g.n * g.n;
  const e = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    let v = DRONEEFFEKT[terr.arealtype[k]] ?? 0.7;
    const h = terr.helning?.[k];
    if (h != null && h > 30) v = 1;
    if (terr.arealtype[k] !== AREALKLASSE.vann) {
      const i = k % g.n;
      const j = (k - i) / g.n;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (a >= 0 && b >= 0 && a < g.n && b < g.n && terr.arealtype[b * g.n + a] === AREALKLASSE.vann) v = 1; // shore
      }
    }
    e[k] = v;
  }
  return e;
}

/**
 * Points of interest for the chosen categories (data/interessepunkter.ts): OSM points plus
 * cliffs, shores, wetlands and path junctions, scored by POA nearby × category weight.
 */
function lagPoiForslag(g: Grid, inp: BeregningInput, terr: TerrengLag, T1: Float32Array, post: Float64Array, v: number, band: Int8Array): PoiForslag[] {
  const osm = inp.osm!;
  const medBidrag = punktvekterMedBidrag(inp.komps.map((k) => ({ key: k.key, w: k.w })));
  const vekter: Partial<Record<PunktTypeKandidat, number>> = {};
  for (const [t, b] of Object.entries(medBidrag) as Array<[PunktTypeKandidat, { sum: number }]>) vekter[t] = b.sum;
  const kategorinavn = new Map(inp.komps.map((k) => [k.key, k.navn]));
  let effekt: Float32Array | null = null; // drone effect, computed only if needed
  type Kand = { type: PunktTypeKandidat; navn: string; pos: LatLng; kilde: PoiGrunnlag['kilde']; kildeTekst: string };
  const kand: Kand[] = [];
  for (const p of osm.punkter) {
    if (vekter[p.type]) kand.push({ type: p.type, navn: p.navn, pos: p.pos, kilde: 'osm', kildeTekst: `${POI_NAVN[p.type]} i OpenStreetMap` });
  }
  const besteCelle = (celler: number[]) => {
    let b = -1;
    for (const c of celler) if (b < 0 || post[c] > post[b]) b = c;
    return b;
  };
  const tilPos = (c: number) => {
    const i = c % g.n;
    return fraGrid(g, cellX(g, i), cellY(g, (c - i) / g.n));
  };
  if (vekter.stup) {
    for (const st of osm.stup) {
      const celler: number[] = [];
      forCellsNearLine(g, st.map((p) => tilGrid(g, p)), g.cell, (idx) => celler.push(idx));
      const b = besteCelle(celler);
      if (b >= 0) kand.push({ type: 'stup', navn: '', pos: tilPos(b), kilde: 'stup', kildeTekst: 'Stup i OpenStreetMap – stedet langs kanten med mest sannsynlighet' });
    }
  }
  for (const o of osm.omrader) {
    const type: PunktTypeKandidat | null = o.type === 'vann' && vekter.vann ? 'vann' : o.type === 'myr' && vekter.myr ? 'myr' : null;
    if (!type) continue;
    const inne: number[] = [];
    forCellsInPolygon(g, o.ringer.map((r) => r.map((p) => tilGrid(g, p))), (idx) => inne.push(idx));
    let celler = inne;
    if (type === 'vann') {
      const sett = new Set(inne);
      celler = [];
      for (const c of inne) {
        const i = c % g.n;
        for (const q of [c - 1, c + 1, c - g.n, c + g.n]) if (q >= 0 && q < post.length && !sett.has(q) && Math.abs((q % g.n) - i) <= 1 && !terr.hav[q]) celler.push(q);
      }
    }
    const b = besteCelle(celler);
    if (b >= 0) {
      const hva = type === 'vann' ? `Strandsonen rundt ${o.navn ? `«${o.navn}»` : 'vannet'}` : `Myra${o.navn ? ` «${o.navn}»` : ''}`;
      kand.push({ type, navn: o.navn, pos: tilPos(b), kilde: type === 'vann' ? 'strand' : 'myr', kildeTekst: `${hva} – stedet med mest sannsynlighet` });
    }
  }
  if (vekter.stikryss) {
    const teller = new Map<string, { n: number; pos: LatLng }>();
    for (const l of osm.linjer) {
      if (l.type !== 'sti' && l.type !== 'traktorvei' && l.type !== 'vei') continue;
      for (const p of [l.pts[0], l.pts[l.pts.length - 1]]) {
        const k = p.lat.toFixed(5) + ',' + p.lng.toFixed(5);
        const e = teller.get(k) ?? { n: 0, pos: p };
        e.n++;
        teller.set(k, e);
      }
    }
    for (const e of teller.values()) {
      if (e.n >= 3) kand.push({ type: 'stikryss', navn: '', pos: e.pos, kilde: 'stikryss', kildeTekst: `Kryss der ${e.n} stier eller veier møtes` });
    }
  }
  const eksisterende = inp.reflekser.map((r) => tilGrid(g, r.pos));
  const ut: PoiForslag[] = [];
  for (const k of kand) {
    const [x, y] = tilGrid(g, k.pos);
    const c = cellIndex(g, x, y);
    if (c < 0) continue;
    if (eksisterende.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < 100)) continue;
    const celler: number[] = [];
    forCellsNearLine(g, [[x, y]], Math.max(150, g.cell * 0.75), (idx) => celler.push(idx));
    const poa = sumCeller(post, celler);
    const vb = medBidrag[k.type];
    const score = poa * (vb?.sum ?? 0);
    if (score <= 0 || !vb) continue;
    const bidrag = vb.bidrag
      .map((b) => ({ kategori: b.key, navn: kategorinavn.get(b.key) ?? b.key, andel: Math.round(((b.w * b.v) / vb.sum) * 1000) / 1000 }))
      .sort((a, b) => b.andel - a.andel);
    if (['myr', 'topp', 'utsikt'].includes(k.type)) effekt ??= droneeffekt(g, terr);
    ut.push({
      id: `${k.type}:${k.pos.lat.toFixed(5)},${k.pos.lng.toFixed(5)}`,
      type: k.type,
      navn: k.navn || PUNKTTYPENAVN[k.type],
      pos: k.pos,
      poa,
      score,
      timer: Number.isFinite(T1[c]) ? T1[c] / v : null,
      grunnlag: {
        kilde: k.kilde,
        kildeTekst: k.kildeTekst,
        bidrag,
        begrunnelse: [...new Set(bidrag.slice(0, 2).map((b) => punktgrunn(k.type, b.kategori)))],
        referanse: PUNKTBEGRUNNELSE[k.type].kilde,
        sone: band[c] >= 0 ? band[c] : null,
        vurder: vurderPunkt(k.type, effekt ? effekt[c] : null),
      },
    });
  }
  ut.sort((a, b) => b.score - a.score);
  // spread: no two suggestions closer than 150 m
  const valgt: PoiForslag[] = [];
  for (const p of ut) {
    if (valgt.length >= 20) break;
    if (valgt.every((q) => distanceM(q.pos, p.pos) > 150)) valgt.push(p);
  }
  return valgt;
}

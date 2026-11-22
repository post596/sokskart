import type { LatLng } from '../domain/coords';
import { distanceM } from '../domain/geo';
import { computeZone, type ZoneChoice } from '../domain/utm';
import type { Modellantakelser, Observasjonsklasse } from '../data/modellantakelser';
import { gangtid } from './gangtid';
import { cellIndex, cellX, cellY, fraGrid, lagGrid, lagMercatorIndeks, tilGrid, type Grid, type MercatorIndeks } from './grid';
import { blandingRinger, vektetFart, type Komponent } from './lpb';
import { cellerLangs, rangerLinjer, tidVedPunkter } from './rangering';
import { forCellsInPolygon, forCellsNearLine } from './raster';
import { fordelRessurser, kandidatIBesteCelle, type Forslag, type Kandidat, type Ressursantall } from './ressurser';
import { beregnSannsynlighet, mestSannsynlige, sumCeller, UTGANGSPUNKT } from './sannsynlighet';
import { byggTerreng, type TerrengLag } from './terreng';
import type { HoydeRaster, LinjeType, OsmData } from './typer';
import { LINJETYPE_NAVN, POI_NAVN } from './typer';

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
  ressurser: Ressursantall;
  /** hours walked used for the frontier along ledelinjer (time slider) */
  visningTimer: number | null;
  merkatorBredde: number;
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
  teiger: Array<{ id: string; poaFor: number; poaNa: number; celler: number }>;
  punkter: Punkt[];
  linjer: LinjeInfo[];
  linjeTider: Float32Array;
  linjeStart: Uint32Array;
  korridorAndel: number | null;
  forslag: Forslag[];
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
  const teigCeller = inp.teiger.map((t) => {
    const c: number[] = [];
    forCellsInPolygon(
      g,
      t.ringer.map((r) => r.map((p) => tilGrid(g, p))),
      (idx) => c.push(idx),
    );
    return Int32Array.from(c);
  });

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
  const teiger = inp.teiger.map((t, k) => ({
    id: t.id,
    poaFor: sumCeller(s.prior, teigCeller[k]),
    poaNa: sumCeller(s.post, teigCeller[k]),
    celler: teigCeller[k].length,
  }));

  // resource suggestions
  const total = Object.values(inp.ressurser).reduce((a, b) => a + (b || 0), 0);
  let forslag: Forslag[] = [];
  if (total > 0) {
    const L = inp.visningTimer ?? (inp.timerSidenSistSett != null ? Math.min(inp.timerSidenSistSett, mob) : mob);
    const kand = lagKandidater(g, inp, terr, T1, s.post, s.orden, v, L, rang.slice(0, 60).map((r) => r.i), sep);
    forslag = fordelRessurser(kand, inp.ressurser, Math.max(300, 2 * g.cell));
  }

  return {
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
    punkter,
    linjer,
    linjeTider: tider,
    linjeStart: start,
    korridorAndel,
    forslag,
    harHoyde: terr.harHoyde,
    brattCeller: terr.brattCeller,
    ms: Date.now() - t0,
  };
}

function lagKandidater(
  g: Grid,
  inp: BeregningInput,
  terr: TerrengLag,
  T1: Float32Array,
  post: Float64Array,
  orden: Uint32Array,
  v: number,
  L: number,
  linjeIdx: number[],
  sep: number,
): Kandidat[] {
  const out: Kandidat[] = [];
  const [cx, cy] = [g.cx, g.cy];
  out.push({ type: 'ipp', pos: inp.ipp, x: cx, y: cy, score: 1, tekst: 'IPP – søk grundig (akslingen)', timer: 0 });

  // ledelinjer: out to where the person could have reached within L hours
  const osm = inp.osm;
  if (osm) {
    for (const i of linjeIdx) {
      const l = osm.linjer[i];
      const xy = terr.linjeXY[i];
      let bestK = -1;
      let bestT = -1;
      xy.forEach(([x, y], k) => {
        const c = cellIndex(g, x, y);
        const t = c >= 0 ? T1[c] / v : Infinity;
        if (t <= L && t > bestT) {
          bestT = t;
          bestK = k;
        }
      });
      if (bestK < 0) continue;
      const celler = cellerLangs(g, xy);
      let score = 0;
      for (const c of celler) if (T1[c] / v <= L) score += post[c];
      const [x, y] = xy[bestK];
      const navn = l.navn ? ` «${l.navn}»` : '';
      out.push({
        type: 'ledelinje',
        pos: l.pts[bestK],
        x,
        y,
        score,
        linjeType: l.type,
        linjeId: l.id,
        timer: bestT,
        tekst: `${LINJETYPE_NAVN[l.type]}${navn}: søk ut til punktet`,
      });
    }

    // risk areas: shore of lakes, wetland, glacier, cliffs – only where reachable
    const naaelig = (c: number) => T1[c] / v <= L * 1.2;
    for (const o of osm.omrader) {
      const inne = new Set<number>();
      forCellsInPolygon(
        g,
        o.ringer.map((r) => r.map((p) => tilGrid(g, p))),
        (idx) => inne.add(idx),
      );
      if (!inne.size) continue;
      let celler: number[];
      if (o.type === 'vann') {
        const kyst = new Set<number>();
        for (const c of inne) {
          const i = c % g.n;
          const j = (c - i) / g.n;
          for (const [di, dj] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const a = i + di;
            const b = j + dj;
            if (a < 0 || b < 0 || a >= g.n || b >= g.n) continue;
            const q = b * g.n + a;
            if (!inne.has(q) && !terr.hav[q]) kyst.add(q);
          }
        }
        celler = [...kyst];
      } else celler = [...inne];
      celler = celler.filter(naaelig);
      const navn = o.navn ? ` «${o.navn}»` : '';
      const tekst =
        o.type === 'vann' ? `Risiko: vann${navn} – sjekk strandsonen` : o.type === 'myr' ? `Risiko: myr${navn}` : `Risiko: bre${navn}`;
      const k = kandidatIBesteCelle(g, post, celler, 'risiko', tekst, T1, v);
      if (k) out.push(k);
    }
    for (const st of osm.stup) {
      const celler: number[] = [];
      forCellsNearLine(
        g,
        st.map((p) => tilGrid(g, p)),
        g.cell,
        (idx) => {
          if (naaelig(idx)) celler.push(idx);
        },
      );
      const k = kandidatIBesteCelle(g, post, celler, 'risiko', 'Risiko: stup/bratt – sjekk under', T1, v);
      if (k) out.push(k);
    }

    // points of interest
    const pois = [
      ...osm.punkter.map((p) => ({ pos: p.pos, tekst: `${POI_NAVN[p.type]}${p.navn ? ` «${p.navn}»` : ''}` })),
      ...inp.reflekser.map((r) => ({ pos: r.pos, tekst: `${r.id}${r.navn ? ` – ${r.navn}` : ''}` })),
    ];
    for (const p of pois) {
      const [x, y] = tilGrid(g, p.pos);
      const c = cellIndex(g, x, y);
      if (c < 0 || !(T1[c] / v <= L * 1.2)) continue;
      const celler: number[] = [];
      forCellsNearLine(g, [[x, y]], Math.max(150, g.cell), (idx) => celler.push(idx));
      out.push({ type: 'poi', pos: p.pos, x, y, score: sumCeller(post, celler), tekst: `Punktsøk: ${p.tekst}`, timer: T1[c] / v });
    }
  } else {
    for (const r of inp.reflekser) {
      const [x, y] = tilGrid(g, r.pos);
      const c = cellIndex(g, x, y);
      if (c < 0) continue;
      const celler: number[] = [];
      forCellsNearLine(g, [[x, y]], Math.max(150, g.cell), (idx) => celler.push(idx));
      out.push({ type: 'poi', pos: r.pos, x, y, score: sumCeller(post, celler), tekst: `Punktsøk: ${r.id}${r.navn ? ` – ${r.navn}` : ''}` });
    }
  }

  // high-probability areas
  for (const k of mestSannsynlige(g, post, orden, 40, sep)) {
    const i = k % g.n;
    const j = (k - i) / g.n;
    const celler: number[] = [];
    const x = cellX(g, i);
    const y = cellY(g, j);
    forCellsNearLine(g, [[x, y]], 2 * g.cell, (idx) => celler.push(idx));
    out.push({
      type: 'omrade',
      pos: fraGrid(g, x, y),
      x,
      y,
      score: sumCeller(post, celler),
      tekst: 'Område med høy sannsynlighet – grovsøk',
      timer: Number.isFinite(T1[k]) ? T1[k] / v : undefined,
    });
  }
  return out;
}

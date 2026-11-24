import type { Teknikk } from '../data/modellantakelser';
import { distToSegment, pointInRing } from '../domain/geo';
import type { ForslagGrunnlag } from '../domain/grunnlag';
import { lengdeInnenfor } from '../domain/sporimport';
import { cellIndex, tilGrid, type Grid } from './grid';
import { forCellsInPolygon, type XY } from './raster';
import { AREALKLASSE, type TerrengLag } from './terreng';
import { POI_NAVN, type OsmData } from './typer';

const AREALNAVN: Record<number, string> = {
  [AREALKLASSE.skog]: 'skog',
  [AREALKLASSE.kratt]: 'kratt',
  [AREALKLASSE.apent]: 'åpent',
  [AREALKLASSE.dyrket]: 'dyrket',
  [AREALKLASSE.bebygd]: 'bebygd',
  [AREALKLASSE.myr]: 'myr',
  [AREALKLASSE.bre]: 'bre',
  [AREALKLASSE.vann]: 'vann',
};

/** What the explanation needs from the main computation (all on the main grid). */
export interface GrunnlagKontekst {
  g: Grid;
  band: Int8Array;
  /** hours at 1 km/h from the IPP, and the person's speed */
  T1: Float32Array;
  v: number;
  terr: TerrengLag;
  osm: OsmData | null;
  reflekser: Array<{ id: string; navn: string; pos: { lat: number; lng: number } }>;
  /** search speed factor per cell (foot teiger) */
  sokefaktor?: Float32Array;
  /** share covered by imported GPS tracks per cell (1 − e^−C), when there are tracks */
  sporAndel?: Float32Array | null;
}

/** Bounding boxes of the ledelinjer, computed once per context. */
const bokser = new WeakMap<XY[][], Array<[number, number, number, number]>>();
function linjebokser(linjer: XY[][]): Array<[number, number, number, number]> {
  let b = bokser.get(linjer);
  if (!b) {
    b = linjer.map((l) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of l) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      return [x0, y0, x1, y1];
    });
    bokser.set(linjer, b);
  }
  return b;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r5 = (x: number) => Math.round(x * 1e5) / 1e5;

/**
 * Explanation for one generated teig / drone area with its outer ring in grid coordinates.
 * `poa` is the generator's value (fine grid); the rest is summarised on the main grid.
 */
export function forslagGrunnlag(
  ctx: GrunnlagKontekst,
  ring: XY[],
  f: { rang: number; antall: number; poa: number; poaKum: number; arealKm2: number; timer: number },
  ekstra: { teknikk?: Teknikk; fase?: ForslagGrunnlag['fase']; drone?: ForslagGrunnlag['drone']; utenforSone?: ForslagGrunnlag['utenforSone'] } = {},
): ForslagGrunnlag {
  const { g, terr } = ctx;
  const celler: number[] = [];
  forCellsInPolygon(g, [ring], (idx) => celler.push(idx));
  if (!celler.length) {
    // smaller than one main cell: use the cell under the centre
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const c = cellIndex(g, cx, cy);
    if (c >= 0) celler.push(c);
  }
  const n = Math.max(1, celler.length);

  const soner: ForslagGrunnlag['soner'] = [0, 0, 0, 0, 0];
  const arealer = new Map<number, number>();
  let tMin = Infinity;
  let helSum = 0;
  let helN = 0;
  let sfSum = 0;
  let sfN = 0;
  let sporSum = 0;
  for (const c of celler) {
    if (ctx.sporAndel) sporSum += ctx.sporAndel[c];
    const b = ctx.band[c];
    soner[b >= 0 && b <= 3 ? b : 4] += 1 / n;
    const at = terr.arealtype[c];
    if (at !== AREALKLASSE.ukjent) arealer.set(at, (arealer.get(at) ?? 0) + 1 / n);
    const t = ctx.T1[c] / ctx.v;
    if (Number.isFinite(t)) tMin = Math.min(tMin, t);
    const h = terr.helning?.[c];
    if (h != null && Number.isFinite(h)) {
      helSum += h;
      helN++;
    }
    const sf = ctx.sokefaktor?.[c];
    if (sf != null && sf > 0) {
      sfSum += sf;
      sfN++;
    }
  }

  // distance from the IPP: 0 inside, else to the nearest edge (grid metres → ground metres)
  let avstand = 0;
  if (!pointInRing(g.cx, g.cy, ring)) {
    avstand = Infinity;
    for (let k = 0; k < ring.length; k++) {
      const [ax, ay] = ring[k];
      const [bx, by] = ring[(k + 1) % ring.length];
      avstand = Math.min(avstand, distToSegment(g.cx, g.cy, ax, ay, bx, by));
    }
    avstand /= g.k;
  }

  // ledelinjer inside (bbox prefilter, then length inside the ring)
  let rx0 = Infinity;
  let ry0 = Infinity;
  let rx1 = -Infinity;
  let ry1 = -Infinity;
  for (const [x, y] of ring) {
    rx0 = Math.min(rx0, x);
    ry0 = Math.min(ry0, y);
    rx1 = Math.max(rx1, x);
    ry1 = Math.max(ry1, y);
  }
  // one entry per line id (a chain can come in several pieces)
  const perId = new Map<string, ForslagGrunnlag['linjer'][number]>();
  const osmLinjer = ctx.osm?.linjer ?? [];
  const bb = linjebokser(terr.linjeXY);
  terr.linjeXY.forEach((xy, i) => {
    const [x0, y0, x1, y1] = bb[i];
    if (x1 < rx0 || x0 > rx1 || y1 < ry0 || y0 > ry1) return;
    const l = osmLinjer[i];
    if (!l) return;
    const len = lengdeInnenfor(xy, ring, 10) / g.k;
    if (len <= 0) return;
    const e = perId.get(l.id);
    if (e) e.lengdeM += len;
    else perId.set(l.id, { id: l.id, type: l.type, navn: l.navn, lengdeM: len });
  });
  const linjer = [...perId.values()].filter((l) => l.lengdeM >= 20).map((l) => ({ ...l, lengdeM: Math.round(l.lengdeM) }));
  linjer.sort((a, b) => b.lengdeM - a.lengdeM);

  // points of interest inside (OSM points and the aksjon's own R points)
  const poi: string[] = [];
  for (const p of ctx.osm?.punkter ?? []) {
    const [x, y] = tilGrid(g, p.pos);
    if (pointInRing(x, y, ring)) poi.push(p.navn ? `${POI_NAVN[p.type]} «${p.navn}»` : POI_NAVN[p.type]);
  }
  for (const r of ctx.reflekser) {
    const [x, y] = tilGrid(g, r.pos);
    if (pointInRing(x, y, ring)) poi.push(`${r.id}${r.navn ? ` ${r.navn}` : ''}`);
  }

  const arealtyper = [...arealer.entries()]
    .map(([k, andel]) => ({ navn: AREALNAVN[k] ?? 'annet', andel: r3(andel) }))
    .filter((a) => a.andel >= 0.05)
    .sort((a, b) => b.andel - a.andel)
    .slice(0, 3);

  const t = ekstra.teknikk;
  return {
    rang: f.rang,
    antall: f.antall,
    poa: r5(f.poa),
    poaKum: r5(f.poaKum),
    arealKm2: r3(f.arealKm2),
    soner: soner.map(r3) as ForslagGrunnlag['soner'],
    tMinTimer: Number.isFinite(tMin) ? Math.round(tMin * 100) / 100 : null,
    avstandM: Math.round(avstand),
    arealtyper,
    helningSnitt: helN ? Math.round((helSum / helN) * 10) / 10 : null,
    linjer: linjer.slice(0, 5),
    poi: [...new Set(poi)].slice(0, 6),
    ...(t
      ? { teknikk: { navn: t.navn, mannskap: t.mannskap, avstandM: t.avstandM, fartKmt: t.fartKmt, sokefaktor: r3(sfN ? sfSum / sfN : 0), timer: Math.round(f.timer * 100) / 100 } }
      : {}),
    ...(ekstra.fase ? { fase: ekstra.fase } : {}),
    ...(ekstra.utenforSone ? { utenforSone: { andel: r3(ekstra.utenforSone.andel), sone: ekstra.utenforSone.sone } } : {}),
    ...(ctx.sporAndel ? { sporDekning: r3(sporSum / n) } : {}),
    ...(ekstra.drone ? { drone: { ...ekstra.drone, effekt: r3(ekstra.drone.effekt), minutter: Math.round(ekstra.drone.minutter) } } : {}),
    beregnet: new Date().toISOString(),
  };
}

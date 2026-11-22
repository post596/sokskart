import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { LatLng } from '../domain/coords';
import type { LinjeType, OmradeType, OsmData, OsmLinje, OsmOmrade, OsmPunkt, PoiType } from '../model/typer';
import { slaSammenLinjer } from './overpass';

/**
 * Automatic fallback when the Overpass API does not answer: the same OpenStreetMap data as
 * ready-made vector tiles (OpenMapTiles schema) from OpenFreeMap's CDN – free, no key,
 * CORS enabled, no server of our own. Paths, roads, railways, rivers/streams, lakes, land
 * cover (forest, wetland, glacier, rock/grass, farmland, residential) and POIs. Cliffs and
 * power lines are not in the tiles.
 */
export const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet';
export const VEKTOR_ATTRIBUSJON = '© OpenMapTiles © OpenStreetMap-bidragsytere (OpenFreeMap)';
export const SONE = 14;

export function flisNr(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

export function fliserRundt(senter: LatLng, radiusM: number, z = SONE): Array<[number, number]> {
  const dLat = radiusM / 110540;
  const dLng = radiusM / (111320 * Math.cos((senter.lat * Math.PI) / 180));
  const [x0, y0] = flisNr(senter.lat + dLat, senter.lng - dLng, z);
  const [x1, y1] = flisNr(senter.lat - dLat, senter.lng + dLng, z);
  const ut: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) ut.push([x, y]);
  return ut;
}

/** Tile pixel (0..extent) to lat/lng. */
export function tilLatLng(z: number, x: number, y: number, px: number, py: number, extent: number): LatLng {
  const n = 2 ** z;
  const lng = ((x + px / extent) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / extent)) / n))) * 180) / Math.PI;
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}

const linjeTypeFra = (lag: string, kl: string, sub: string): LinjeType | null => {
  if (lag === 'waterway') return /^(river|stream|ditch|drain|canal)$/.test(kl) ? 'vann' : null;
  if (lag !== 'transportation') return null;
  if (kl === 'path') return 'sti';
  if (kl === 'track') return 'traktorvei';
  if (kl === 'rail' && (sub === 'rail' || !sub)) return 'jernbane';
  if (/^(minor|service|tertiary|secondary|primary|trunk|motorway|raceway|busway)$/.test(kl)) return 'vei';
  return null;
};

const omradeTypeFra = (lag: string, kl: string, sub: string): OmradeType | null => {
  if (lag === 'water') return kl === 'ocean' ? null : 'vann';
  if (lag === 'landcover') {
    if (kl === 'wood' || kl === 'forest') return 'skog';
    if (kl === 'wetland') return 'myr';
    if (kl === 'ice' || sub === 'glacier') return 'bre';
    if (kl === 'farmland') return 'dyrket';
    if (kl === 'rock' || kl === 'grass' || kl === 'sand') return sub === 'scrub' ? 'kratt' : 'apent';
  }
  if (lag === 'landuse' && /^(residential|industrial|commercial|retail|suburb|neighbourhood)$/.test(kl)) return 'bebygd';
  return null;
};

const poiTypeFra = (lag: string, kl: string, sub: string): PoiType | null => {
  if (lag === 'mountain_peak') return 'topp';
  if (lag !== 'poi') return null;
  if (sub === 'alpine_hut' || sub === 'wilderness_hut') return 'hytte';
  if (sub === 'shelter') return 'gapahuk';
  if (sub === 'viewpoint') return 'utsikt';
  if (kl === 'parking' || sub === 'parking') return 'parkering';
  if (sub === 'playground') return 'lekeplass';
  if (kl === 'place_of_worship' || sub === 'place_of_worship' || sub === 'cemetery') return 'kirke';
  if (sub === 'pier') return 'kai';
  return null;
};

export interface FlisInnhold {
  linjer: OsmLinje[];
  omrader: OsmOmrade[];
  punkter: OsmPunkt[];
}

/** Decodes one tile into our structures (lines are tile fragments, merged later). */
export function tolkFlis(data: Uint8Array, z: number, x: number, y: number, kunAreal = false): FlisInnhold {
  const t = new VectorTile(new PbfReader(data));
  const ut: FlisInnhold = { linjer: [], omrader: [], punkter: [] };
  for (const [lag, layer] of Object.entries(t.layers)) {
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties as Record<string, string | number | boolean>;
      const kl = String(p.class ?? '');
      const sub = String(p.subclass ?? '');
      const navn = String(p['name:nb'] ?? p.name ?? p['name:latin'] ?? '');
      const id = `t${z}/${x}/${y}/${lag}/${f.id ?? i}`;
      const geom = f.loadGeometry().map((ring) => ring.map((pt) => tilLatLng(z, x, y, pt.x, pt.y, layer.extent)));
      if (f.type === 3) {
        const ot = omradeTypeFra(lag, kl, sub);
        if (ot) ut.omrader.push({ id, type: ot, navn, ringer: geom.filter((r) => r.length >= 4) });
        continue;
      }
      if (kunAreal) continue;
      if (f.type === 2) {
        const lt = linjeTypeFra(lag, kl, sub);
        if (!lt) continue;
        for (const del of geom) {
          if (del.length < 2) continue;
          ut.linjer.push({ id: `${id}:${f.id ?? ''}`, type: lt, navn, elv: lt === 'vann' && (kl === 'river' || kl === 'canal'), pts: del });
          if (p.brunnel === 'bridge' && lt !== 'vann') ut.punkter.push({ id: `${id}:bru`, type: 'bru', navn, pos: del[Math.floor(del.length / 2)] });
        }
      } else if (f.type === 1) {
        const pt = poiTypeFra(lag, kl, sub);
        if (pt && geom[0]?.[0]) ut.punkter.push({ id, type: pt, navn, pos: geom[0][0] });
      }
    }
  }
  return ut;
}

/** Joins tile fragments of the same OSM way (ends within `tol` metres, tiles overlap a little). */
export function settSammenFragmenter(linjer: OsmLinje[], tol = 25): OsmLinje[] {
  const kx = linjer.length ? 111320 * Math.cos((linjer[0].pts[0].lat * Math.PI) / 180) : 1;
  const d = (a: LatLng, b: LatLng) => Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110540);
  const grupper = new Map<string, OsmLinje[]>();
  for (const l of linjer) {
    const osmId = l.id.split(':').pop() || l.id;
    const k = `${l.type}|${l.navn}|${osmId}`;
    if (!grupper.has(k)) grupper.set(k, []);
    grupper.get(k)!.push(l);
  }
  const ut: OsmLinje[] = [];
  for (const g of grupper.values()) {
    const rest = g.slice();
    while (rest.length) {
      let cur = rest.shift()!;
      let endret = true;
      while (endret) {
        endret = false;
        for (let i = 0; i < rest.length; i++) {
          const o = rest[i];
          const a0 = cur.pts[0];
          const a1 = cur.pts[cur.pts.length - 1];
          const b0 = o.pts[0];
          const b1 = o.pts[o.pts.length - 1];
          let pts: LatLng[] | null = null;
          if (d(a1, b0) < tol) pts = [...cur.pts, ...o.pts.slice(1)];
          else if (d(a1, b1) < tol) pts = [...cur.pts, ...o.pts.slice(0, -1).reverse()];
          else if (d(a0, b1) < tol) pts = [...o.pts, ...cur.pts.slice(1)];
          else if (d(a0, b0) < tol) pts = [...o.pts.slice().reverse(), ...cur.pts.slice(1)];
          if (pts) {
            cur = { ...cur, pts };
            rest.splice(i, 1);
            endret = true;
            break;
          }
        }
      }
      ut.push(cur);
    }
  }
  return ut;
}

let malCache: string | null = null;

async function flisMal(signal?: AbortSignal): Promise<string> {
  if (malCache) return malCache;
  const r = await fetch(OPENFREEMAP_TILEJSON, { signal });
  if (!r.ok) throw new Error(`OpenFreeMap: HTTP ${r.status}`);
  const j = (await r.json()) as { tiles?: string[] };
  if (!j.tiles?.[0]) throw new Error('OpenFreeMap: mangler flisadresse.');
  malCache = j.tiles[0];
  return malCache;
}

/**
 * Fetches all z14 tiles around the centre (limited concurrency) and builds OsmData.
 * `kunAreal`: only land cover and water polygons (used when Overpass gave lines but not areas).
 */
export async function hentFraVektorfliser(senter: LatLng, radiusM: number, kunAreal = false, signal?: AbortSignal): Promise<OsmData> {
  const mal = await flisMal(signal);
  const fliser = fliserRundt(senter, radiusM);
  if (fliser.length > 900) throw new Error('Området er for stort for vektorfliser.');
  const deler: FlisInnhold[] = [];
  let feil = 0;
  let i = 0;
  const arbeider = async () => {
    while (i < fliser.length) {
      const [x, y] = fliser[i++];
      try {
        const r = await fetch(mal.replace('{z}', String(SONE)).replace('{x}', String(x)).replace('{y}', String(y)), { signal });
        if (r.status === 204 || r.status === 404) continue;
        if (!r.ok) throw new Error(String(r.status));
        deler.push(tolkFlis(new Uint8Array(await r.arrayBuffer()), SONE, x, y, kunAreal));
      } catch {
        if (signal?.aborted) return;
        feil++;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, arbeider));
  if (feil > fliser.length / 2) throw new Error(`OpenFreeMap: ${feil} av ${fliser.length} fliser feilet.`);
  const linjer = slaSammenLinjer(settSammenFragmenter(deler.flatMap((d) => d.linjer)));
  // keep only lines that reach into the radius (tiles cover a square)
  return {
    linjer,
    omrader: deler.flatMap((d) => d.omrader),
    stup: [],
    punkter: deler.flatMap((d) => d.punkter),
    senter,
    radiusM,
    hentet: new Date().toISOString(),
    kilde: 'OpenFreeMap (vektorfliser)',
  };
}

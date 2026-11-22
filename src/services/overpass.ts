import type { LatLng } from '../domain/coords';
import type { LinjeType, OmradeType, OsmData, OsmLinje, OsmOmrade, OsmPunkt, PoiType } from '../model/typer';

/**
 * OpenStreetMap via the Overpass API. One query per user action (never in a loop);
 * the result is cached per aksjon by the caller. A second endpoint is tried once if
 * the first fails.
 */
export const OVERPASS_ENDEPUNKTER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export function byggSporring(senter: LatLng, radiusM: number): string {
  const a = `(around:${Math.round(radiusM)},${senter.lat.toFixed(6)},${senter.lng.toFixed(6)})`;
  return (
    '[out:json][timeout:90];(' +
    `way${a}[highway~"^(path|footway|bridleway|steps|track|cycleway|unclassified|residential|service|tertiary|secondary|primary|trunk|living_street|road)$"];` +
    `way${a}[waterway~"^(river|stream|ditch|canal|drain)$"];` +
    `way${a}[power=line];` +
    `way${a}[natural~"^(water|wetland|glacier|cliff)$"];` +
    `relation${a}[natural~"^(water|wetland|glacier)$"];` +
    `nwr${a}[tourism~"^(alpine_hut|wilderness_hut|viewpoint)$"];` +
    `nwr${a}[amenity=shelter];` +
    `node${a}[natural=peak];` +
    ');out geom tags qt;'
  );
}

interface OverpassGeom {
  lat: number;
  lon: number;
}
interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeom[];
  members?: Array<{ type: string; ref: number; role: string; geometry?: OverpassGeom[] }>;
}

export function linjetype(t: Record<string, string>): LinjeType | null {
  if (t.waterway) return 'vann';
  if (t.power === 'line') return 'kraft';
  const h = t.highway;
  if (!h) return null;
  if (/^(path|footway|bridleway|steps|cycleway)$/.test(h)) return 'sti';
  if (h === 'track') return 'traktorvei';
  return 'vei';
}

function omradetype(t: Record<string, string>): OmradeType | null {
  if (t.natural === 'water') return 'vann';
  if (t.natural === 'wetland') return 'myr';
  if (t.natural === 'glacier') return 'bre';
  return null;
}

function poitype(t: Record<string, string>): PoiType | null {
  if (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut') return 'hytte';
  if (t.amenity === 'shelter') return 'gapahuk';
  if (t.tourism === 'viewpoint') return 'utsikt';
  if (t.natural === 'peak') return 'topp';
  return null;
}

const ll = (g: OverpassGeom): LatLng => ({ lat: +g.lat.toFixed(6), lng: +g.lon.toFixed(6) });
const key = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Joins open member lines of a multipolygon into closed rings. */
export function settSammenRinger(deler: LatLng[][]): LatLng[][] {
  const rest = deler.filter((d) => d.length >= 2).map((d) => d.slice());
  const ringer: LatLng[][] = [];
  while (rest.length) {
    let ring = rest.shift()!;
    let changed = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && changed) {
      changed = false;
      for (let i = 0; i < rest.length; i++) {
        const d = rest[i];
        const end = key(ring[ring.length - 1]);
        const start = key(ring[0]);
        if (key(d[0]) === end) ring = ring.concat(d.slice(1));
        else if (key(d[d.length - 1]) === end) ring = ring.concat(d.slice(0, -1).reverse());
        else if (key(d[d.length - 1]) === start) ring = d.concat(ring.slice(1));
        else if (key(d[0]) === start) ring = d.slice().reverse().concat(ring.slice(1));
        else continue;
        rest.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (ring.length >= 4) ringer.push(ring);
  }
  return ringer;
}

/**
 * Merges OSM ways into continuous ledelinjer: ways of the same type and name are joined
 * where exactly two of them meet at an end point (no junction).
 */
export function slaSammenLinjer(linjer: OsmLinje[]): OsmLinje[] {
  const grupper = new Map<string, OsmLinje[]>();
  for (const l of linjer) {
    const g = `${l.type}|${l.navn}|${l.elv}`;
    if (!grupper.has(g)) grupper.set(g, []);
    grupper.get(g)!.push(l);
  }
  const ut: OsmLinje[] = [];
  for (const gruppe of grupper.values()) {
    const ved = new Map<string, number[]>();
    gruppe.forEach((l, i) => {
      for (const k of [key(l.pts[0]), key(l.pts[l.pts.length - 1])]) {
        if (!ved.has(k)) ved.set(k, []);
        if (!ved.get(k)!.includes(i)) ved.get(k)!.push(i);
      }
    });
    const brukt = new Uint8Array(gruppe.length);
    const neste = (k: string, fra: number): number => {
      const v = ved.get(k)!;
      if (v.length !== 2) return -1;
      const o = v[0] === fra ? v[1] : v[0];
      return brukt[o] ? -1 : o;
    };
    for (let s = 0; s < gruppe.length; s++) {
      if (brukt[s]) continue;
      brukt[s] = 1;
      let pts = gruppe[s].pts.slice();
      const ids = [gruppe[s].id];
      // forward
      for (let cur = s; ; ) {
        const k = key(pts[pts.length - 1]);
        const o = neste(k, cur);
        if (o < 0) break;
        brukt[o] = 1;
        const op = gruppe[o].pts;
        pts = pts.concat(key(op[0]) === k ? op.slice(1) : op.slice(0, -1).reverse());
        ids.push(gruppe[o].id);
        cur = o;
        if (key(pts[pts.length - 1]) === key(pts[0])) break;
      }
      // backward
      for (let cur = s; ; ) {
        const k = key(pts[0]);
        if (key(pts[pts.length - 1]) === k) break;
        const o = neste(k, cur);
        if (o < 0) break;
        brukt[o] = 1;
        const op = gruppe[o].pts;
        pts = (key(op[op.length - 1]) === k ? op.slice(0, -1) : op.slice(1).reverse()).concat(pts);
        ids.unshift(gruppe[o].id);
        cur = o;
      }
      ut.push({ ...gruppe[s], id: ids.join('+'), pts });
    }
  }
  return ut;
}

function sentroide(pts: LatLng[]): LatLng {
  const s = pts.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: +(s.lat / pts.length).toFixed(6), lng: +(s.lng / pts.length).toFixed(6) };
}

export function tolkSvar(json: { elements?: OverpassElement[] }, senter: LatLng, radiusM: number, kilde: string): OsmData {
  const linjer: OsmLinje[] = [];
  const omrader: OsmOmrade[] = [];
  const stup: LatLng[][] = [];
  const punkter: OsmPunkt[] = [];
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {};
    const navn = t.name ?? t.ref ?? '';
    const poi = poitype(t);
    if (poi) {
      const pos =
        e.type === 'node' && e.lat != null && e.lon != null
          ? ll({ lat: e.lat, lon: e.lon })
          : e.geometry?.length
            ? sentroide(e.geometry.map(ll))
            : null;
      if (pos) punkter.push({ id: `${e.type[0]}${e.id}`, type: poi, navn, pos });
      continue;
    }
    if (e.type === 'way' && e.geometry && e.geometry.length >= 2) {
      const pts = e.geometry.map(ll);
      if (t.natural === 'cliff') {
        stup.push(pts);
        continue;
      }
      const ot = omradetype(t);
      if (ot) {
        if (key(pts[0]) === key(pts[pts.length - 1]) && pts.length >= 4) {
          omrader.push({ id: `w${e.id}`, type: ot, navn, ringer: [pts] });
        }
        continue;
      }
      const lt = linjetype(t);
      if (lt) linjer.push({ id: `w${e.id}`, type: lt, navn, elv: t.waterway === 'river' || t.waterway === 'canal', pts });
    } else if (e.type === 'relation') {
      const ot = omradetype(t);
      if (!ot || !e.members) continue;
      const deler = e.members
        .filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === 'inner' || m.role === ''))
        .map((m) => m.geometry!.map(ll));
      const ringer = settSammenRinger(deler);
      if (ringer.length) omrader.push({ id: `r${e.id}`, type: ot, navn, ringer });
    }
  }
  return {
    linjer: slaSammenLinjer(linjer),
    omrader,
    stup,
    punkter,
    senter,
    radiusM,
    hentet: new Date().toISOString(),
    kilde,
  };
}

export class OverpassFeil extends Error {}

/** Fetches once from the first endpoint, falls back to the next on failure. */
export async function hentOsm(senter: LatLng, radiusM: number, signal?: AbortSignal): Promise<OsmData> {
  const q = byggSporring(senter, radiusM);
  const feil: string[] = [];
  for (const url of OVERPASS_ENDEPUNKTER.slice(0, 2)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 100_000);
    signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
    try {
      const r = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrl.signal,
      });
      if (r.status === 429) throw new OverpassFeil('for mange forespørsler (429) – vent litt');
      if (!r.ok) throw new OverpassFeil(`HTTP ${r.status}`);
      const json = await r.json();
      return tolkSvar(json, senter, radiusM, new URL(url).hostname);
    } catch (e) {
      if (signal?.aborted) throw e;
      feil.push(`${new URL(url).hostname}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new OverpassFeil(`Fikk ikke hentet stier og veier fra OpenStreetMap (${feil.join('; ')}).`);
}

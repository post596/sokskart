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

/**
 * 'linjer': paths, roads, water, barriers and the main POIs (needed first).
 * 'areal': land cover and small POIs near the IPP (optional, sent afterwards).
 */
export function byggSporring(senter: LatLng, radiusM: number, del: 'linjer' | 'areal' = 'linjer'): string {
  const a = `(around:${Math.round(radiusM)},${senter.lat.toFixed(6)},${senter.lng.toFixed(6)})`;
  // land cover and small buildings closer to the IPP to keep the response small
  const n = `(around:${Math.round(Math.min(radiusM, 6000))},${senter.lat.toFixed(6)},${senter.lng.toFixed(6)})`;
  const b = `(around:${Math.round(Math.min(radiusM, 3000))},${senter.lat.toFixed(6)},${senter.lng.toFixed(6)})`;
  if (del === 'areal') {
    return (
      '[out:json][timeout:120];(' +
      `nwr${n}[amenity=parking];` +
      `nwr${n}[leisure=playground];` +
      `nwr${n}[amenity=place_of_worship];` +
      `nwr${n}[landuse=cemetery];` +
      `way${b}[building~"^(barn|shed|farm_auxiliary|hut)$"];` +
      `way${n}[natural~"^(wood|scrub|heath|bare_rock|scree|grassland)$"];` +
      `relation${n}[natural~"^(wood|scrub|heath|bare_rock|scree|grassland)$"];` +
      `way${n}[landuse~"^(forest|residential|industrial|commercial|farmland|meadow)$"];` +
      `relation${n}[landuse~"^(forest|residential|farmland)$"];` +
      ');out geom tags qt;'
    );
  }
  return (
    '[out:json][timeout:90];(' +
    `way${a}[highway~"^(path|footway|bridleway|steps|track|cycleway|unclassified|residential|service|tertiary|secondary|primary|trunk|living_street|road)$"];` +
    `way${a}[waterway~"^(river|stream|ditch|canal|drain)$"];` +
    `way${a}[power=line];` +
    `way${a}[railway=rail];` +
    `way${a}[natural~"^(water|wetland|glacier|cliff)$"];` +
    `relation${a}[natural~"^(water|wetland|glacier)$"];` +
    `nwr${a}[tourism~"^(alpine_hut|wilderness_hut|viewpoint)$"];` +
    `nwr${a}[amenity=shelter];` +
    `node${a}[natural=peak];` +
    `nwr${a}[man_made=pier];` +
    `nwr${a}[waterway~"^(dam|weir)$"];` +
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
  if (t.railway === 'rail') return 'jernbane';
  if (t.waterway && /^(river|stream|ditch|canal|drain)$/.test(t.waterway)) return 'vann';
  if (t.power === 'line') return 'kraft';
  const h = t.highway;
  if (!h) return null;
  if (/^(path|footway|bridleway|steps|cycleway)$/.test(h)) return 'sti';
  if (h === 'track') return 'traktorvei';
  return 'vei';
}

export function omradetype(t: Record<string, string>): OmradeType | null {
  if (t.natural === 'water') return 'vann';
  if (t.natural === 'wetland') return 'myr';
  if (t.natural === 'glacier') return 'bre';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'skog';
  if (t.natural === 'scrub') return 'kratt';
  if (/^(heath|bare_rock|scree|grassland)$/.test(t.natural ?? '') || t.landuse === 'meadow') return 'apent';
  if (t.landuse === 'farmland') return 'dyrket';
  if (/^(residential|industrial|commercial)$/.test(t.landuse ?? '')) return 'bebygd';
  return null;
}

export function poitype(t: Record<string, string>): PoiType | null {
  if (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut') return 'hytte';
  if (t.amenity === 'shelter') return 'gapahuk';
  if (t.tourism === 'viewpoint') return 'utsikt';
  if (t.natural === 'peak') return 'topp';
  if (t.man_made === 'pier') return 'kai';
  if (t.waterway === 'dam' || t.waterway === 'weir') return 'demning';
  if (t.amenity === 'parking') return 'parkering';
  if (t.leisure === 'playground') return 'lekeplass';
  if (t.amenity === 'place_of_worship' || t.landuse === 'cemetery') return 'kirke';
  if (/^(barn|shed|farm_auxiliary|hut)$/.test(t.building ?? '')) return 'uthus';
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
      if (lt && t.bridge && t.bridge !== 'no' && (lt !== 'vann')) {
        punkter.push({ id: `b${e.id}`, type: 'bru', navn, pos: pts[Math.floor(pts.length / 2)] });
      }
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

export class OverpassFeil extends Error {
  /** One short Norwegian reason per endpoint, e.g. "overpass-api.de: HTTP 502 (overbelastet eller nede)". */
  detaljer: string[];
  constructor(melding: string, detaljer: string[] = []) {
    super(melding);
    this.detaljer = detaljer;
  }
}

/** Short Norwegian reason for an HTTP status from Overpass. */
export function statusTekst(status: number): string {
  if (status === 429) return 'HTTP 429 (for mange forespørsler – vent litt)';
  if (status === 502 || status === 503 || status === 504) return `HTTP ${status} (overbelastet eller nede)`;
  return `HTTP ${status}`;
}

/**
 * Tries the endpoints in order, each at most `perEndepunktMs` and all within `fristMs`,
 * then gives up so the vector-tile fallback can take over. A slow server must not use
 * up the whole deadline: the next endpoint always gets its turn.
 */
export async function hentOsm(
  senter: LatLng,
  radiusM: number,
  signal?: AbortSignal,
  del: 'linjer' | 'areal' = 'linjer',
  fristMs = 50_000,
  perEndepunktMs = 22_000,
): Promise<OsmData> {
  const q = byggSporring(senter, radiusM, del);
  const slutt = Date.now() + fristMs;
  const feil: string[] = [];
  // each endpoint is tried once, in order (never in a loop)
  for (const url of OVERPASS_ENDEPUNKTER) {
    const igjen = slutt - Date.now();
    if (igjen < 3000) break;
    const vent = Math.min(igjen, perEndepunktMs);
    const ctrl = new AbortController();
    let tidUte = false;
    const timer = setTimeout(() => {
      tidUte = true;
      ctrl.abort();
    }, vent);
    const avbryt = () => ctrl.abort();
    signal?.addEventListener('abort', avbryt, { once: true });
    const vert = new URL(url).hostname;
    try {
      const r = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new OverpassFeil(statusTekst(r.status));
      const json = await r.json();
      return tolkSvar(json, senter, radiusM, vert);
    } catch (e) {
      if (signal?.aborted) throw e;
      const grunn = tidUte
        ? `svarte ikke innen ${Math.round(vent / 1000)} s`
        : e instanceof OverpassFeil
          ? e.message
          : e instanceof TypeError
            ? 'fikk ikke kontakt'
            : e instanceof Error
              ? e.message
              : String(e);
      feil.push(`${vert}: ${grunn}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', avbryt);
    }
  }
  throw new OverpassFeil(`Fikk ikke hentet stier og veier fra OpenStreetMap (${feil.join('; ')}).`, feil);
}

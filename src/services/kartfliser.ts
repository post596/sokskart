/**
 * Map tile URLs and pre-download for offline use. Tiles go through the service worker,
 * which stores them in the "kartfliser" cache (CacheFirst).
 */
export interface KartLag {
  id: string;
  navn: string;
  url: string;
  maxZoom: number;
  attribution: string;
}

const KV = 'https://cache.kartverket.no/v1/wmts/1.0.0/';

export const KARTLAG: KartLag[] = [
  {
    id: 'topo',
    navn: 'Topografisk (Kartverket)',
    url: KV + 'topo/default/webmercator/{z}/{y}/{x}.png',
    maxZoom: 18,
    attribution: '© <a href="https://www.kartverket.no/">Kartverket</a> (CC BY 4.0)',
  },
  {
    id: 'graatone',
    navn: 'Gråtone (Kartverket)',
    url: KV + 'topograatone/default/webmercator/{z}/{y}/{x}.png',
    maxZoom: 18,
    attribution: '© <a href="https://www.kartverket.no/">Kartverket</a> (CC BY 4.0)',
  },
  {
    id: 'osm',
    navn: 'OpenStreetMap (reserve)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsytere',
  },
];

export function flisXY(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

export function fliserForOmrade(
  sor: number,
  vest: number,
  nord: number,
  ost: number,
  zMin: number,
  zMax: number,
): Array<{ z: number; x: number; y: number }> {
  const out: Array<{ z: number; x: number; y: number }> = [];
  for (let z = zMin; z <= zMax; z++) {
    const [x0, y0] = flisXY(nord, vest, z);
    const [x1, y1] = flisXY(sor, ost, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

export function flisUrl(lag: KartLag, t: { z: number; x: number; y: number }): string {
  return lag.url.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
}

/** Downloads tiles with limited concurrency. Returns number of tiles that failed. */
export async function lastNedFliser(
  urls: string[],
  onProgress: (ferdig: number, totalt: number) => void,
  signal?: AbortSignal,
  samtidig = 4,
): Promise<number> {
  let i = 0;
  let ferdig = 0;
  let feil = 0;
  const arbeider = async () => {
    while (i < urls.length && !signal?.aborted) {
      const url = urls[i++];
      try {
        const r = await fetch(url, { mode: 'cors', signal });
        if (!r.ok) feil++;
        else await r.blob();
      } catch {
        feil++;
      }
      onProgress(++ferdig, urls.length);
    }
  };
  await Promise.all(Array.from({ length: samtidig }, arbeider));
  return feil;
}

/**
 * Strava Global Heatmap as an overlay: where people have run, walked, skied and cycled the
 * last year – shows much used paths, also those missing in OSM. Only the public tiles that
 * need no login (up to zoom 11, 512 px ≈ 20 m per pixel in southern Norway); the detailed
 * tiles need strava.com cookies that a web page cannot send. Display only: Strava sends no
 * CORS headers (the pixels cannot be read), the tiles are never stored offline (the service
 * worker only caches Kartverket and OSM) and they are not used in any calculation. Strava has
 * allowed tracing from the heatmap into OpenStreetMap only; other use should be cleared with
 * Strava.
 */
export type StravaAktivitet = 'run' | 'winter' | 'ride' | 'all';
export type StravaFarge = 'hot' | 'blue' | 'gray';

export const STRAVA_AKTIVITETER: Array<{ id: StravaAktivitet; navn: string }> = [
  { id: 'run', navn: 'Til fots (løp, gange, fottur)' },
  { id: 'winter', navn: 'Vinter (ski)' },
  { id: 'ride', navn: 'Sykkel' },
  { id: 'all', navn: 'Alle aktiviteter' },
];

export const STRAVA_FARGER: Array<{ id: StravaFarge; navn: string }> = [
  { id: 'hot', navn: 'Rød–gul' },
  { id: 'blue', navn: 'Blå' },
  { id: 'gray', navn: 'Grå' },
];

/** Highest zoom with public tiles; above it the tiles are scaled up. */
export const STRAVA_MAKS_ZOOM = 11;

export const STRAVA_ATTRIBUSJON = 'Heatmap © <a href="https://www.strava.com/maps/global-heatmap" target="_blank" rel="noopener">Strava</a>';

export function stravaUrl(aktivitet: StravaAktivitet, farge: StravaFarge): string {
  return `https://heatmap-external-{s}.strava.com/tiles/${aktivitet}/${farge}/{z}/{x}/{y}.png`;
}

/** Winter activities for ski categories, otherwise on foot. */
export function stravaStandard(kategorier: string[]): StravaAktivitet {
  return kategorier.some((k) => k === 'langrenn' || k === 'alpin') ? 'winter' : 'run';
}

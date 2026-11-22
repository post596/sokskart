import type { LatLng } from '../domain/coords';
import type { OsmLinje } from '../model/typer';

/**
 * Turrutebasen (Kartverket) – marked hiking and ski routes – via WFS 2.0.0 on
 * wfs.geonorge.no (GML 3.2 only, CORS enabled). Used as an extra source of marked trails;
 * routes that already exist in OpenStreetMap are dropped.
 */
export const TRB_WFS = 'https://wfs.geonorge.no/skwms1/wfs.turogfriluftsruter';
export type TrbType = 'Fotrute' | 'Skiløype';

export function trbUrl(type: TrbType, sor: number, vest: number, nord: number, ost: number, antall = 5000): string {
  const crs = 'urn:ogc:def:crs:EPSG::4258';
  const p = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typenames: `app:${type}`,
    srsName: crs,
    // EPSG:4258 in URN form is latitude, longitude
    bbox: `${sor.toFixed(5)},${vest.toFixed(5)},${nord.toFixed(5)},${ost.toFixed(5)},${crs}`,
    count: String(antall),
  });
  return `${TRB_WFS}?${p.toString()}`;
}

const tekst = (xml: string, tag: string) => {
  const re = new RegExp(`<app:${tag}>([^<]*)</app:${tag}>`, 'g');
  const ut: string[] = [];
  for (let m = re.exec(xml); m; m = re.exec(xml)) ut.push(m[1].trim());
  return ut;
};

/** Parses a WFS GetFeature response (GML 3.2, lat/lon order) into ledelinjer of type 'sti'. */
export function tolkTurGml(xml: string, type: TrbType): OsmLinje[] {
  const ut: OsmLinje[] = [];
  const medlemmer = xml.split(/<wfs:member>/).slice(1);
  for (const m of medlemmer) {
    const id = tekst(m, 'lokalId')[0] ?? String(ut.length);
    const navn = tekst(m, 'rutenavn').find((n) => n && !/^ukjent$/i.test(n)) ?? '';
    const nr = tekst(m, 'rutenummer').find((n) => n && !/^ukjent$/i.test(n)) ?? '';
    const lister = [...m.matchAll(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)];
    lister.forEach((pl, k) => {
      const tall = pl[1].trim().split(/\s+/).map(Number);
      const pts: LatLng[] = [];
      for (let i = 0; i + 1 < tall.length; i += 2) {
        if (Number.isFinite(tall[i]) && Number.isFinite(tall[i + 1])) pts.push({ lat: +tall[i].toFixed(6), lng: +tall[i + 1].toFixed(6) });
      }
      if (pts.length < 2) return;
      const visning = [type === 'Skiløype' ? 'Skiløype' : '', navn || nr].filter(Boolean).join(' ');
      ut.push({ id: `trb:${id}${lister.length > 1 ? `:${k}` : ''}`, type: 'sti', navn: visning, elv: false, pts, kilde: 'turrutebasen' });
    });
  }
  return ut;
}

/**
 * Drops new lines that mostly (≥ `andel`) lie within `tol` metres of an existing path or
 * road. Uses a local metric projection and a spatial hash, fine for areas up to ~50 km.
 */
export function fjernDuplikater(nye: OsmLinje[], eksisterende: OsmLinje[], tol = 30, andel = 0.7): { beholdt: OsmLinje[]; duplikater: number } {
  const alle = [...nye, ...eksisterende];
  if (!alle.length) return { beholdt: [], duplikater: 0 };
  const lat0 = alle[0].pts[0].lat;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const xy = (p: LatLng): [number, number] => [p.lng * kx, p.lat * ky];
  const celle = tol;
  const hash = new Set<string>();
  const nokkel = (x: number, y: number) => `${Math.floor(x / celle)},${Math.floor(y / celle)}`;
  const samples = (pts: LatLng[], steg: number, f: (x: number, y: number) => void) => {
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = xy(pts[k - 1]);
      const [x1, y1] = xy(pts[k]);
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / steg));
      for (let q = 0; q <= n; q++) f(x0 + ((x1 - x0) * q) / n, y0 + ((y1 - y0) * q) / n);
    }
  };
  for (const l of eksisterende) {
    if (l.type === 'vann' || l.type === 'kraft') continue;
    samples(l.pts, celle / 2, (x, y) => hash.add(nokkel(x, y)));
  }
  const naer = (x: number, y: number) => {
    const i = Math.floor(x / celle);
    const j = Math.floor(y / celle);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (hash.has(`${i + a},${j + b}`)) return true;
    return false;
  };
  const beholdt: OsmLinje[] = [];
  let duplikater = 0;
  for (const l of nye) {
    let tot = 0;
    let treff = 0;
    samples(l.pts, 10, (x, y) => {
      tot++;
      if (naer(x, y)) treff++;
    });
    if (tot > 0 && treff / tot >= andel) duplikater++;
    else beholdt.push(l);
  }
  return { beholdt, duplikater };
}

/** Fetches marked routes around a centre. Ski tracks only on request (winter, ski categories). */
export async function hentTurruter(senter: LatLng, radiusM: number, medSki: boolean, signal?: AbortSignal): Promise<OsmLinje[]> {
  const dLat = radiusM / 110540;
  const dLng = radiusM / (111320 * Math.cos((senter.lat * Math.PI) / 180));
  const typer: TrbType[] = medSki ? ['Fotrute', 'Skiløype'] : ['Fotrute'];
  const svar = await Promise.all(
    typer.map(async (t) => {
      const r = await fetch(trbUrl(t, senter.lat - dLat, senter.lng - dLng, senter.lat + dLat, senter.lng + dLng), { signal });
      if (!r.ok) throw new Error(`Turrutebasen: HTTP ${r.status}`);
      return tolkTurGml(await r.text(), t);
    }),
  );
  return svar.flat();
}

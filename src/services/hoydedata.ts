import type { Grid } from '../model/grid';
import type { HoydeRaster } from '../model/typer';

/**
 * Kartverket elevation model (DTM, Nasjonal høydemodell) via WCS 1.0.0 on
 * wcs.geonorge.no – open data (CC BY 4.0), CORS enabled. Coverages exist for
 * EPSG:25832, 25833 and 25835. The sea is 0 in this DTM.
 */
export function wcsUrl(zone: 32 | 33 | 35, west: number, south: number, east: number, north: number, n: number): string {
  const p = new URLSearchParams({
    service: 'WCS',
    version: '1.0.0',
    request: 'GetCoverage',
    coverage: `nhm_dtm_topo_258${zone}`,
    crs: `EPSG:258${zone}`,
    bbox: [west, south, east, north].map((v) => Math.round(v)).join(','),
    width: String(n),
    height: String(n),
    format: 'GeoTIFF',
  });
  return `https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-258${zone}?${p.toString()}`;
}

/** Square request area around the grid with a margin, so small changes reuse the raster. */
export function hoydeOmrade(g: Grid): { west: number; north: number; side: number; n: number } {
  const half = Math.ceil((g.half * 1.25) / 1000) * 1000;
  const n = Math.min(1000, Math.max(50, Math.ceil((2 * half) / g.cell)));
  return { west: g.cx - half, north: g.cy + half, side: 2 * half, n };
}

/** True if the raster covers the grid (same zone, at least the grid's resolution). */
export function dekker(r: HoydeRaster | null, g: Grid): boolean {
  if (!r || r.zone !== g.zone) return false;
  const east = r.west + r.n * r.cell;
  const south = r.north - r.n * r.cell;
  return (
    r.west <= g.west && r.north >= g.north && east >= g.west + 2 * g.half && south <= g.north - 2 * g.half && r.cell <= g.cell * 1.5
  );
}

export async function hentHoyde(g: Grid, signal?: AbortSignal): Promise<HoydeRaster> {
  const o = hoydeOmrade(g);
  const url = wcsUrl(g.zone, o.west, o.north - o.side, o.west + o.side, o.north, o.n);
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Høydedata: HTTP ${r.status}`);
  const type = r.headers.get('content-type') ?? '';
  if (!type.includes('tiff')) throw new Error('Høydedata: tjenesten svarte ikke med GeoTIFF.');
  const buf = await r.arrayBuffer();
  const { fromArrayBuffer } = await import('geotiff');
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  if (img.getWidth() !== o.n || img.getHeight() !== o.n) throw new Error('Høydedata: uventet størrelse på rasteret.');
  const ras = (await img.readRasters({ interleave: true })) as unknown as ArrayLike<number>;
  const data = new Float32Array(o.n * o.n);
  const nd = img.getGDALNoData();
  for (let k = 0; k < data.length; k++) {
    const v = ras[k];
    data[k] = !Number.isFinite(v) || (nd != null && v === nd) || v < -500 || v > 9000 ? Number.NaN : v;
  }
  return { zone: g.zone, west: o.west, north: o.north, cell: o.side / o.n, n: o.n, data, hentet: new Date().toISOString() };
}

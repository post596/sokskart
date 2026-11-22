import type { Modellantakelser } from '../data/modellantakelser';
import { brattMaske, helning, type Terreng } from './gangtid';
import { sample, tilGrid, type Grid } from './grid';
import { forCellsInPolygon, rasterLinjer, type XY } from './raster';
import type { HoydeRaster, OsmData } from './typer';

export interface TerrengLag {
  terreng: Terreng;
  /** 1 in lakes/rivers (OSM) */
  vann: Uint8Array;
  /** 1 in the sea (elevation 0 in Kartverket's DTM) */
  hav: Uint8Array;
  /** cells near a ledelinje / in the corridor */
  naer: Uint8Array;
  korridor: Uint8Array;
  /** ledelinjer in grid coordinates (same order as osm.linjer) */
  linjeXY: XY[][];
  brattCeller: number;
  harHoyde: boolean;
}

/** Elevation per grid cell from a raster in the same UTM zone (bilinear). NaN where unknown. */
export function hoydePaGrid(g: Grid, r: HoydeRaster): Float32Array {
  const src: Grid = { zone: r.zone, n: r.n, cell: r.cell, half: (r.n * r.cell) / 2, cx: 0, cy: 0, west: r.west, north: r.north, k: 1 };
  const out = new Float32Array(g.n * g.n);
  for (let j = 0; j < g.n; j++) {
    const y = g.north - (j + 0.5) * g.cell;
    for (let i = 0; i < g.n; i++) {
      const v = sample(src, r.data, g.west + (i + 0.5) * g.cell, y);
      out[j * g.n + i] = Number.isFinite(v) ? v : Number.NaN;
    }
  }
  return out;
}

export function byggTerreng(g: Grid, osm: OsmData | null, hoyde: HoydeRaster | null, m: Modellantakelser): TerrengLag {
  const N = g.n * g.n;
  const fart = new Float32Array(N).fill(m.terrengfaktor);
  const sti = new Uint8Array(N);
  const vann = new Uint8Array(N);
  const hav = new Uint8Array(N);
  const naer = new Uint8Array(N);
  const korridor = new Uint8Array(N);

  let h: Float32Array | null = null;
  if (hoyde && hoyde.zone === g.zone) {
    h = hoydePaGrid(g, hoyde);
    for (let k = 0; k < N; k++) {
      if (Number.isFinite(h[k]) && h[k] <= 0.05) {
        hav[k] = 1;
        fart[k] = 0;
      }
    }
  }

  const xy = (pts: { lat: number; lng: number }[]): XY[] => pts.map((p) => tilGrid(g, p));
  const linjeXY = osm ? osm.linjer.map((l) => xy(l.pts)) : [];

  if (osm) {
    // areas: lakes are barriers, wetland and glacier are slow
    for (const o of osm.omrader) {
      const rings = o.ringer.map(xy);
      forCellsInPolygon(g, rings, (idx) => {
        if (o.type === 'vann') {
          vann[idx] = 1;
          fart[idx] = 0;
        } else if (fart[idx] > 0) fart[idx] = Math.min(fart[idx], m.myrfaktor);
      });
    }
    const tmp = new Uint8Array(N);
    // power line corridors are a bit easier than open terrain
    rasterLinjer(g, linjeXY.filter((_, i) => osm.linjer[i].type === 'kraft'), 0, tmp, 1);
    for (let k = 0; k < N; k++) if (tmp[k] && fart[k] > 0) fart[k] = Math.max(fart[k], m.kraftgatefaktor);
    // rivers and cliffs are barriers
    tmp.fill(0);
    if (m.elvErBarriere) rasterLinjer(g, linjeXY.filter((_, i) => osm.linjer[i].elv), 0, tmp, 1);
    rasterLinjer(g, osm.stup.map(xy), 0, tmp, 1);
    for (let k = 0; k < N; k++) if (tmp[k]) fart[k] = 0;
    // paths and roads: walking speed, and they override barriers (bridges, trails through cliffs)
    tmp.fill(0);
    rasterLinjer(
      g,
      linjeXY.filter((_, i) => ['sti', 'traktorvei', 'vei'].includes(osm.linjer[i].type)),
      0,
      tmp,
      1,
    );
    for (let k = 0; k < N; k++) {
      if (tmp[k]) {
        sti[k] = 1;
        fart[k] = 1;
      }
    }
    // probability weighting near all ledelinjer
    rasterLinjer(g, linjeXY, m.korridorM, korridor, 1);
    rasterLinjer(g, linjeXY, m.naerM, naer, 1);
  }

  const terreng: Terreng = { fart, sti, hoyde: h };
  let brattCeller = 0;
  if (h) {
    // unknown elevation: treat as flat for the slope
    const hh = h.map((v) => (Number.isFinite(v) ? v : 0));
    brattCeller = brattMaske(terreng, helning(g, hh), m.maksHelning);
  }
  return { terreng, vann, hav, naer, korridor, linjeXY, brattCeller, harHoyde: !!h };
}

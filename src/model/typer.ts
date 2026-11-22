import type { LatLng } from '../domain/coords';

/** Ledelinje types from OSM (veileder 7.2.4: stier, veier, elver, bekker, grøfter, kraftlinjer …). */
export type LinjeType = 'sti' | 'traktorvei' | 'vei' | 'vann' | 'kraft';

export interface OsmLinje {
  /** Stable id built from the OSM way ids in the chain, e.g. "w123+w456". */
  id: string;
  type: LinjeType;
  navn: string;
  /** waterway=river/canal (may be a barrier) */
  elv: boolean;
  pts: LatLng[];
}

export type OmradeType = 'vann' | 'myr' | 'bre';

export interface OsmOmrade {
  id: string;
  type: OmradeType;
  navn: string;
  /** Even–odd rings (outer and inner). */
  ringer: LatLng[][];
}

export type PoiType = 'hytte' | 'gapahuk' | 'utsikt' | 'topp';

export interface OsmPunkt {
  id: string;
  type: PoiType;
  navn: string;
  pos: LatLng;
}

export interface OsmData {
  linjer: OsmLinje[];
  omrader: OsmOmrade[];
  /** natural=cliff */
  stup: LatLng[][];
  punkter: OsmPunkt[];
  senter: LatLng;
  radiusM: number;
  hentet: string;
  kilde: string;
}

export interface HoydeRaster {
  zone: 32 | 33 | 35;
  west: number;
  north: number;
  cell: number;
  n: number;
  data: Float32Array;
  hentet: string;
}

export const LINJETYPE_NAVN: Record<LinjeType, string> = {
  sti: 'Sti',
  traktorvei: 'Traktor-/skogsvei',
  vei: 'Vei',
  vann: 'Elv/bekk/grøft',
  kraft: 'Kraftgate',
};

export const LINJETYPE_FARGE: Record<LinjeType, string> = {
  sti: '#be185d',
  traktorvei: '#92400e',
  vei: '#374151',
  vann: '#1d4ed8',
  kraft: '#6d28d9',
};

export const POI_NAVN: Record<PoiType, string> = {
  hytte: 'Hytte',
  gapahuk: 'Gapahuk/skjul',
  utsikt: 'Utsiktspunkt',
  topp: 'Topp',
};

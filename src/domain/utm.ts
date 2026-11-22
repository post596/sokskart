/**
 * UTM on WGS 84 using the Krüger series to 6th order (Karney 2011).
 * Accurate to well below a millimetre within a zone and to centimetres even
 * far outside it, which matters when a zone is forced (e.g. zone 33 used at 22° E).
 */

const A_ = 6378137;
const F_ = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = F_ * (2 - F_);
const E = Math.sqrt(E2);
const N_ = F_ / (2 - F_);
const RAD = Math.PI / 180;

const n = N_;
const n2 = n * n;
const n3 = n2 * n;
const n4 = n3 * n;
const n5 = n4 * n;
const n6 = n5 * n;

/** Rectifying radius. */
const AA = (A_ / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);

const ALPHA = [
  n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
  (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
  (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
  (34729 * n5) / 80640 - (3418889 * n6) / 1995840,
  (212378941 * n6) / 319334400,
];

const BETA = [
  n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360 - (81 * n5) / 512 + (96199 * n6) / 604800,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440 + (46 * n5) / 105 - (1118711 * n6) / 3870720,
  (17 * n3) / 480 - (37 * n4) / 840 - (209 * n5) / 4480 + (5569 * n6) / 90720,
  (4397 * n4) / 161280 - (11 * n5) / 504 - (830251 * n6) / 7257600,
  (4583 * n5) / 161280 - (108847 * n6) / 3991680,
  (20648693 * n6) / 638668800,
];

export type UtmZone = number; // 1..60
export type ZoneChoice = 'auto' | '32' | '33' | '35';

export interface Utm {
  zone: UtmZone;
  band: string;
  /** Easting in metres (false easting 500 000 included). */
  e: number;
  /** Northing in metres (false northing 10 000 000 added south of the equator). */
  n: number;
}

const BANDS = 'CDEFGHJKLMNPQRSTUVWXX';

export function latitudeBand(lat: number): string {
  if (lat < -80 || lat > 84) return '';
  return BANDS[Math.min(20, Math.floor((lat + 80) / 8))] ?? '';
}

/** Standard UTM zone including the Norway (32V) and Svalbard (31X–37X) exceptions. */
export function standardZone(lat: number, lon: number): UtmZone {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  let z = Math.floor((l + 180) / 6) + 1;
  if (z > 60) z = 60;
  if (lat >= 56 && lat < 64 && l >= 3 && l < 12) z = 32;
  if (lat >= 72 && lat < 84) {
    if (l >= 0 && l < 9) z = 31;
    else if (l >= 9 && l < 21) z = 33;
    else if (l >= 21 && l < 33) z = 35;
    else if (l >= 33 && l < 42) z = 37;
  }
  return z;
}

/**
 * Zone used for display. "auto" follows what a GPS set to UTM shows (standard zones
 * with the Norwegian exceptions). A forced zone is used everywhere.
 */
export function displayZone(lat: number, lon: number, choice: ZoneChoice): UtmZone {
  return choice === 'auto' ? standardZone(lat, lon) : Number(choice);
}

/**
 * Zone used for internal calculation grids and Kartverket elevation (WCS exists for
 * EPSG:25832, 25833 and 25835 only). Zone 34 and 36 are mapped to the nearest of these.
 */
export function computeZone(lat: number, lon: number, choice: ZoneChoice): 32 | 33 | 35 {
  if (choice !== 'auto') return Number(choice) as 32 | 33 | 35;
  const z = standardZone(lat, lon);
  if (z <= 32) return 32;
  if (z === 33) return 33;
  if (z === 34) return lon < 21 ? 33 : 35;
  return 35;
}

export function centralMeridian(zone: UtmZone): number {
  return (zone - 1) * 6 - 180 + 3;
}

/** Geographic (WGS 84 degrees) to UTM in the given zone. */
export function toUtm(lat: number, lon: number, zone?: UtmZone): Utm {
  const z = zone ?? standardZone(lat, lon);
  const phi = lat * RAD;
  let dl = (lon - centralMeridian(z)) * RAD;
  // wrap to [-pi, pi]
  dl = Math.atan2(Math.sin(dl), Math.cos(dl));

  const sinPhi = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sinPhi) - E * Math.atanh(E * sinPhi));
  const xiP = Math.atan2(t, Math.cos(dl));
  const etaP = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));

  let xi = xiP;
  let eta = etaP;
  for (let j = 1; j <= 6; j++) {
    const a = ALPHA[j - 1];
    xi += a * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
    eta += a * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
  }
  const e = 500000 + K0 * AA * eta;
  let nn = K0 * AA * xi;
  if (lat < 0) nn += 10000000;
  return { zone: z, band: latitudeBand(lat), e, n: nn };
}

/** UTM to geographic (WGS 84 degrees). `south` must be true for southern hemisphere northings. */
export function fromUtm(zone: UtmZone, e: number, nn: number, south = false): { lat: number; lon: number } {
  const xi = (south ? nn - 10000000 : nn) / (K0 * AA);
  const eta = (e - 500000) / (K0 * AA);
  let xiP = xi;
  let etaP = eta;
  for (let j = 1; j <= 6; j++) {
    const b = BETA[j - 1];
    xiP -= b * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaP -= b * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const tauP = Math.sin(xiP) / Math.sqrt(Math.sinh(etaP) ** 2 + Math.cos(xiP) ** 2);
  const dl = Math.atan2(Math.sinh(etaP), Math.cos(xiP));

  // Newton iteration for tau = tan(phi) (Karney 2011, eq. 19–21)
  let tau = tauP;
  for (let i = 0; i < 6; i++) {
    const sigma = Math.sinh(E * Math.atanh((E * tau) / Math.sqrt(1 + tau * tau)));
    const tauI = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
    const dTau =
      ((tauP - tauI) / Math.sqrt(1 + tauI * tauI)) *
      ((1 + (1 - E2) * tau * tau) / ((1 - E2) * Math.sqrt(1 + tau * tau)));
    tau += dTau;
    if (Math.abs(dTau) < 1e-14) break;
  }
  return { lat: Math.atan(tau) / RAD, lon: centralMeridian(zone) + dl / RAD };
}

/**
 * Point scale factor k at a position (Snyder 1987, eq. 8-11). Used to convert
 * grid distances and areas to true ground values.
 */
export function pointScale(lat: number, lon: number, zone: UtmZone): number {
  const phi = lat * RAD;
  const ep2 = E2 / (1 - E2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const Aa = (lon - centralMeridian(zone)) * RAD * Math.cos(phi);
  return (
    K0 *
    (1 +
      ((1 + C) * Aa ** 2) / 2 +
      ((5 - 4 * T + 42 * C + 13 * C * C - 28 * ep2) * Aa ** 4) / 24 +
      ((61 - 148 * T + 16 * T * T) * Aa ** 6) / 720)
  );
}

const pad7 = (v: number) => String(Math.round(v)).padStart(7, '0');

/** "32V 0526873 6785167" */
export function formatUtm(u: Utm): string {
  return `${u.zone}${u.band} ${pad7(u.e)} ${pad7(u.n)}`;
}

/** 14-digit map reference (7 digits easting + 7 digits northing), e.g. "05268736785167". */
export function utmRef14(u: Utm): string {
  return pad7(u.e) + pad7(u.n);
}

export function formatLatLonUtm(lat: number, lon: number, choice: ZoneChoice): string {
  return formatUtm(toUtm(lat, lon, displayZone(lat, lon, choice)));
}

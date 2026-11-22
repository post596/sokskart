import { fromUtm, type ZoneChoice } from './utm';

export interface LatLng {
  lat: number;
  lng: number;
}

export type ParseResult =
  | { ok: true; pos: LatLng; kind: 'utm' | 'grader' }
  | { ok: false; error: string };

const num = (s: string) => Number(s.replace(',', '.'));

function validLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Degrees, degrees+minutes or degrees+minutes+seconds with optional hemisphere letters. */
function parseAngle(raw: string): number | null {
  const s = raw.trim().toUpperCase();
  const hemi = /[NSØEVW]/.exec(s)?.[0];
  const sign = hemi === 'S' || hemi === 'V' || hemi === 'W' || /^-/.test(s) ? -1 : 1;
  const parts = s
    .replace(/[NSØEVW°'′"″]/g, ' ')
    .replace(/^-/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(num);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null;
  const [d, m = 0, sec = 0] = parts;
  if (m >= 60 || sec >= 60) return null;
  return sign * (d + m / 60 + sec / 3600);
}

/**
 * Parse a position typed by the user. Accepts
 *  - UTM: "32V 0526873 6785167", "32 526873 6785167", "526873 6785167" (uses default zone),
 *    "32V 05268736785167" (14-digit reference)
 *  - decimal degrees: "61.123, 9.456", "61,123 9,456", "N61.123 E9.456"
 *  - degrees and minutes: "61°07.38'N 9°27.36'Ø"
 */
export function parsePosition(input: string, defaultZone: ZoneChoice | number = 'auto'): ParseResult {
  const s = input.trim().replace(/\s+/g, ' ');
  if (!s) return { ok: false, error: 'Skriv inn en posisjon.' };

  // UTM with zone (and optional band): 32V 0526873 6785167 / 32 526873 6785167
  let m = /^(\d{1,2})\s*([C-HJ-NP-Xc-hj-np-x])?\s+(\d{5,7})(?:\s*[EØeø])?\s+(\d{6,8})(?:\s*[Nn])?$/.exec(s);
  if (m) return utmResult(Number(m[1]), Number(m[3]), Number(m[4]), m[2]);

  // 14-digit reference with zone: 32V 05268736785167
  m = /^(\d{1,2})\s*([C-HJ-NP-Xc-hj-np-x])?\s+(\d{14})$/.exec(s);
  if (m) return utmResult(Number(m[1]), Number(m[3].slice(0, 7)), Number(m[3].slice(7)), m[2]);

  // UTM without zone
  m = /^(\d{6,7})\s+(\d{7})$/.exec(s) ?? /^(\d{7})(\d{7})$/.exec(s);
  if (m) {
    if (defaultZone === 'auto') {
      return { ok: false, error: 'UTM uten sone: velg UTM-sone 32, 33 eller 35 under Aksjon, eller skriv sonen først.' };
    }
    return utmResult(Number(defaultZone), Number(m[1]), Number(m[2]));
  }

  // Decimal degrees "61.123, 9.456" or "61,123 9,456" or "61.1;9.4"
  m = /^(-?\d{1,2}(?:[.,]\d+)?)\s*[;,]?\s+(-?\d{1,3}(?:[.,]\d+)?)$/.exec(s) ??
    /^(-?\d{1,2}(?:\.\d+)?)\s*[;,]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(s);
  if (m) {
    const lat = num(m[1]);
    const lng = num(m[2]);
    if (validLatLng(lat, lng)) return { ok: true, pos: { lat, lng }, kind: 'grader' };
  }

  // With hemisphere letters / degree signs, two halves separated by comma or the letter boundary
  const hemi = /^\s*([NS]?\s*[-\d.,°'′"″\s]+[NS]?)\s*[,;]?\s*([ØEVW]?\s*[-\d.,°'′"″\s]+[ØEVW]?)\s*$/i.exec(s);
  if (hemi && /[NS°]/i.test(s)) {
    const lat = parseAngle(hemi[1].replace(/,(?=\d)/, '.'));
    const lng = parseAngle(hemi[2].replace(/,(?=\d)/, '.'));
    if (lat != null && lng != null && validLatLng(lat, lng)) return { ok: true, pos: { lat, lng }, kind: 'grader' };
  }

  return {
    ok: false,
    error: 'Forstod ikke posisjonen. Bruk f.eks. «32V 0463563 6833857» eller «61.6363, 8.3125».',
  };
}

function utmResult(zone: number, e: number, n: number, band?: string): ParseResult {
  if (zone < 1 || zone > 60) return { ok: false, error: `Ugyldig UTM-sone ${zone}.` };
  if (e < 100000 || e > 900000) return { ok: false, error: 'Østverdien må være mellom 100 000 og 900 000.' };
  const south = band ? band.toUpperCase() < 'N' : false;
  const g = fromUtm(zone, e, n, south);
  if (!validLatLng(g.lat, g.lon)) return { ok: false, error: 'Posisjonen ligger utenfor gyldig område.' };
  return { ok: true, pos: { lat: g.lat, lng: g.lon }, kind: 'utm' };
}

/** "61,63630° N 8,31250° Ø" */
export function formatDegrees(p: LatLng, decimals = 5): string {
  const f = (v: number) => Math.abs(v).toFixed(decimals).replace('.', ',');
  return `${f(p.lat)}° ${p.lat >= 0 ? 'N' : 'S'} ${f(p.lng)}° ${p.lng >= 0 ? 'Ø' : 'V'}`;
}

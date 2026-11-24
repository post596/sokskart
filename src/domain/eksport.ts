import { LINJETYPE_FARGE, LINJETYPE_NAVN, type LinjeType } from '../model/typer';
import { fmtAvstand, fmtKm2, fmtTimer } from '../ui/format';
import type { Aksjon, Punkt } from './aksjon';
import { teigAkkPod } from './aksjon';
import type { LatLng } from './coords';
import { motUrviser } from './geo';
import { escXml, lagGpx } from './gpx';
import { kortBegrunnelse } from './grunnlag';
import { prosent, TEIGFARGER, teigfarge } from './pod';
import { forenkle } from './sporimport';
import { computeZone, formatLatLonUtm, toUtm, type ZoneChoice } from './utm';

/**
 * Export for other tools (e.g. FAKS): GeoJSON and KML with IPP, R25–R95 rings, teiger
 * (polygons with HRS status colours), points and prioritised ledelinjer. Names follow the
 * veileder (T###, L###, R###, SP###, OBS###, F###).
 */
export interface EksportLinje {
  nr: string;
  navn: string;
  type: string;
  pts: LatLng[];
}

export interface EksportInput {
  aksjon: Aksjon;
  ringer: [number, number, number, number] | null;
  ledelinjer: EksportLinje[];
}

/** Circle as a closed ring (geodesic enough for a few km). */
export function sirkel(senter: LatLng, radiusM: number, n = 72): LatLng[] {
  const ut: LatLng[] = [];
  const kx = 111320 * Math.cos((senter.lat * Math.PI) / 180);
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    ut.push({ lat: +(senter.lat + (radiusM * Math.cos(a)) / 110540).toFixed(6), lng: +(senter.lng + (radiusM * Math.sin(a)) / kx).toFixed(6) });
  }
  return ut;
}

/** Closed and counter-clockwise (outer ring convention of KML and GeoJSON). */
const lukk = (r: LatLng[]) => {
  const ring = motUrviser(r);
  return ring.length && (ring[0].lat !== ring[ring.length - 1].lat || ring[0].lng !== ring[ring.length - 1].lng) ? [...ring, ring[0]] : ring;
};
const xy = (p: LatLng) => [+p.lng.toFixed(6), +p.lat.toFixed(6)];

const PUNKTTYPE: Record<string, string> = { obs: 'Observasjon/etterretning', sp: 'Sperrepost', poi: 'Interessepunkt (refleks)', funn: 'Funn av gjenstand' };
const medKlasse = (t: string) => t === 'obs' || t === 'funn';

/** Coverage of a sperrepost as a ring: the drawn field, or the circle (own or default radius). */
export function sperreRing(p: Punkt, standardRadiusM: number): LatLng[] {
  return p.sperre?.felt ?? sirkel(p.pos, p.sperre?.radiusM ?? standardRadiusM, 48);
}

/** «sirkel 150 m» / «tegnet felt» */
export function sperreTekst(p: Punkt, standardRadiusM: number): string {
  return p.sperre?.felt ? 'tegnet sperrefelt' : `sirkel ${Math.round(p.sperre?.radiusM ?? standardRadiusM)} m`;
}

export function lagGeoJson(i: EksportInput): string {
  const a = i.aksjon;
  const f: unknown[] = [];
  if (a.ipp) {
    f.push({ type: 'Feature', properties: { name: 'IPP', kind: 'ipp' }, geometry: { type: 'Point', coordinates: xy(a.ipp) } });
    i.ringer?.forEach((r, k) => {
      f.push({
        type: 'Feature',
        properties: { name: ['R25', 'R50', 'R75', 'R95'][k], kind: 'ring', radius_m: Math.round(r) },
        geometry: { type: 'LineString', coordinates: sirkel(a.ipp!, r).map(xy) },
      });
    });
  }
  for (const t of a.teiger) {
    const farge = TEIGFARGER[teigfarge(t.status, t.sok.map((s) => s.pod))];
    f.push({
      type: 'Feature',
      properties: { name: t.id, kind: t.type === 'T' ? 'teig' : t.type === 'H' ? 'helikoptersok' : 'droneomrade', status: t.status, akkumulert_pod: +teigAkkPod(t).toFixed(3), antall_sok: t.sok.length, stroke: farge, fill: farge, 'fill-opacity': 0.15 },
      geometry: { type: 'Polygon', coordinates: [lukk(t.ring).map(xy)] },
    });
  }
  for (const p of a.punkter) {
    f.push({
      type: 'Feature',
      properties: {
        name: p.id,
        kind: p.type,
        type: PUNKTTYPE[p.type],
        ...(medKlasse(p.type) ? { klasse: p.klasse } : {}),
        tid: p.tid,
        description: p.tekst,
        ...(p.sjekket ? { sjekket: p.sjekket.tid } : {}),
        ...(p.begrunnelse ? { begrunnelse: p.begrunnelse.tekst, vurder: p.begrunnelse.vurder ?? '' } : {}),
      },
      geometry: { type: 'Point', coordinates: xy(p.pos) },
    });
    if (p.type === 'sp') {
      f.push({
        type: 'Feature',
        properties: { name: `${p.id} dekning`, kind: 'sperredekning', description: sperreTekst(p, a.modell.sperrepostRadiusM), stroke: '#0f766e', fill: '#0f766e', 'fill-opacity': 0.1 },
        geometry: { type: 'Polygon', coordinates: [lukk(sperreRing(p, a.modell.sperrepostRadiusM)).map(xy)] },
      });
    }
  }
  for (const l of i.ledelinjer) {
    f.push({ type: 'Feature', properties: { name: l.nr, kind: 'ledelinje', type: l.type, description: l.navn }, geometry: { type: 'LineString', coordinates: l.pts.map(xy) } });
  }
  return JSON.stringify({ type: 'FeatureCollection', name: a.navn || a.sarNr || 'Søkskart', features: f }, null, 1);
}

/** KML colour aabbggrr from #rrggbb. */
const kmlFarge = (hex: string, alfa = 'ff') => alfa + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);
const koord = (pts: LatLng[]) => pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)},0`).join(' ');

export function lagKml(i: EksportInput): string {
  const a = i.aksjon;
  const ut: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    `<name>${escXml(a.navn || a.sarNr || 'Søkskart')}</name>`,
  ];
  for (const [k, hex] of Object.entries(TEIGFARGER)) {
    ut.push(`<Style id="teig-${k}"><LineStyle><color>${kmlFarge(hex)}</color><width>3</width></LineStyle><PolyStyle><color>${kmlFarge(hex, '33')}</color></PolyStyle></Style>`);
  }
  ut.push('<Style id="ring"><LineStyle><color>ff1c1cb9</color><width>2</width></LineStyle></Style>');
  ut.push('<Style id="ledelinje"><LineStyle><color>ff47e0fd</color><width>4</width></LineStyle></Style>');
  ut.push('<Style id="sperre"><LineStyle><color>ff76730f</color><width>2</width></LineStyle><PolyStyle><color>1a76730f</color></PolyStyle></Style>');
  if (a.ipp) {
    ut.push(`<Placemark><name>IPP</name><Point><coordinates>${koord([a.ipp])}</coordinates></Point></Placemark>`);
    i.ringer?.forEach((r, k) => {
      ut.push(`<Placemark><name>${['R25', 'R50', 'R75', 'R95'][k]}</name><styleUrl>#ring</styleUrl><LineString><coordinates>${koord(sirkel(a.ipp!, r))}</coordinates></LineString></Placemark>`);
    });
  }
  for (const t of a.teiger) {
    const f = teigfarge(t.status, t.sok.map((s) => s.pod));
    const beskr = `Status: ${t.status}, akkumulert POD ${Math.round(teigAkkPod(t) * 100)} %, ${t.sok.length} søk${t.grunnlag ? `. Foreslått: ${kortBegrunnelse(t.grunnlag, a.lnummer)}` : ''}`;
    ut.push(
      `<Placemark><name>${escXml(t.id)}</name><description>${escXml(beskr)}</description><styleUrl>#teig-${f}</styleUrl>` +
        `<Polygon><outerBoundaryIs><LinearRing><coordinates>${koord(lukk(t.ring))}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
    );
  }
  for (const p of a.punkter) {
    ut.push(
      `<Placemark><name>${escXml(p.id)}</name><description>${escXml(`${PUNKTTYPE[p.type]}${medKlasse(p.type) ? ` (${p.klasse})` : ''}${p.sjekket ? ', ferdig sjekket' : ''}${p.tekst ? ` – ${p.tekst}` : ''}${p.begrunnelse ? `. Hvorfor: ${p.begrunnelse.tekst}${p.begrunnelse.vurder ? ` Vurder: ${p.begrunnelse.vurder}` : ''}` : ''}`)}</description><Point><coordinates>${koord([p.pos])}</coordinates></Point></Placemark>`,
    );
    if (p.type === 'sp') {
      ut.push(
        `<Placemark><name>${escXml(p.id)} dekning</name><description>${escXml(`Sperrepost, ${sperreTekst(p, a.modell.sperrepostRadiusM)}`)}</description><styleUrl>#sperre</styleUrl>` +
          `<Polygon><outerBoundaryIs><LinearRing><coordinates>${koord(lukk(sperreRing(p, a.modell.sperrepostRadiusM)))}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
      );
    }
  }
  for (const l of i.ledelinjer) {
    ut.push(`<Placemark><name>${escXml(l.nr)}</name><description>${escXml(`${l.type}${l.navn ? ` ${l.navn}` : ''}`)}</description><styleUrl>#ledelinje</styleUrl><LineString><coordinates>${koord(l.pts)}</coordinates></LineString></Placemark>`);
  }
  ut.push('</Document></kml>');
  return ut.join('\n');
}

// ---------------------------------------------------------------- teiger and suggestions for FAKS

export type TeigEksportType = 'teig' | 'helikoptersok' | 'droneomrade' | 'teigforslag' | 'droneforslag';

/** One teig or suggestion with what a planner needs in FAKS: name, area, POA, time and why. */
export interface TeigEksport {
  navn: string;
  type: TeigEksportType;
  ring: LatLng[];
  arealKm2: number;
  poa: number | null;
  /** search time for one foot team (h) */
  timer: number | null;
  /** drone areas: flight time and batteries */
  flytid?: { minutter: number; batterier: number } | null;
  begrunnelse: string;
  status?: string;
  akkPod?: number;
}

const TYPENAVN: Record<TeigEksportType, string> = {
  teig: 'Teig',
  helikoptersok: 'Helikoptersøk',
  droneomrade: 'Droneområde',
  teigforslag: 'Teigforslag',
  droneforslag: 'Droneforslag',
};

/** Short text for <description>/<desc>. */
export function teigBeskrivelse(t: TeigEksport): string {
  return [
    `${TYPENAVN[t.type]} ${fmtKm2(t.arealKm2)}`,
    t.poa != null ? `POA ${prosent(t.poa)}` : '',
    t.timer != null && t.timer > 0 ? `ca. ${fmtTimer(t.timer)} søk (ett lag)` : '',
    t.flytid ? `ca. ${Math.round(t.flytid.minutter)} min flytid, ${t.flytid.batterier} ${t.flytid.batterier === 1 ? 'batteri' : 'batterier'}` : '',
    t.status ? `status ${t.status}` : '',
    t.akkPod != null && t.akkPod > 0 ? `akk. POD ${Math.round(t.akkPod * 100)} %` : '',
    t.begrunnelse ? `Hvorfor: ${t.begrunnelse}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const STIL: Record<TeigEksportType, [string, string]> = {
  teig: ['#1d4ed8', '33'],
  helikoptersok: ['#7c2d12', '33'],
  droneomrade: ['#0e7490', '33'],
  teigforslag: ['#6b7280', '22'],
  droneforslag: ['#0e7490', '22'],
};

/** KML with one folder per group (e.g. Teiger, Teigforslag, Droneforslag) and ExtendedData per area. */
export function lagTeigKml(tittel: string, grupper: Array<{ navn: string; teiger: TeigEksport[] }>): string {
  const ut: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    `<name>${escXml(tittel)}</name>`,
  ];
  for (const [k, [hex, alfa]] of Object.entries(STIL)) {
    ut.push(`<Style id="${k}"><LineStyle><color>${kmlFarge(hex)}</color><width>3</width></LineStyle><PolyStyle><color>${kmlFarge(hex, alfa)}</color></PolyStyle></Style>`);
  }
  const data = (navn: string, v: string | number | null | undefined) => (v == null || v === '' ? '' : `<Data name="${navn}"><value>${escXml(String(v))}</value></Data>`);
  for (const g of grupper) {
    if (!g.teiger.length) continue;
    ut.push(`<Folder><name>${escXml(g.navn)}</name>`);
    for (const t of g.teiger) {
      ut.push(
        `<Placemark><name>${escXml(t.navn)}</name><description>${escXml(teigBeskrivelse(t))}</description><styleUrl>#${t.type}</styleUrl>` +
          '<ExtendedData>' +
          data('type', TYPENAVN[t.type]) +
          data('areal_km2', t.arealKm2.toFixed(3)) +
          data('poa_prosent', t.poa != null ? (t.poa * 100).toFixed(1) : null) +
          data('soketid_timer', t.timer != null && t.timer > 0 ? t.timer.toFixed(2) : null) +
          data('flytid_min', t.flytid ? Math.round(t.flytid.minutter) : null) +
          data('batterier', t.flytid?.batterier) +
          data('status', t.status) +
          data('akkumulert_pod', t.akkPod != null ? t.akkPod.toFixed(3) : null) +
          data('begrunnelse', t.begrunnelse) +
          '</ExtendedData>' +
          `<Polygon><outerBoundaryIs><LinearRing><coordinates>${koord(lukk(t.ring))}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
      );
    }
    ut.push('</Folder>');
  }
  ut.push('</Document></kml>');
  return ut.join('\n');
}

/** GPX with each area as a closed track (for GPS units and tools that read GPX only). */
export function lagTeigGpx(tittel: string, teiger: TeigEksport[], tid = new Date()): string {
  return lagGpx(
    tittel,
    [],
    teiger.map((t) => ({ navn: t.navn, pts: motUrviser(t.ring), lukket: true, beskrivelse: teigBeskrivelse(t) })),
    tid,
  );
}

/**
 * Corner list in UTM for reading out or typing into FAKS: the ring is simplified
 * (Douglas–Peucker, tolerance raised until at most `maks` corners) and formatted like
 * «32V 0526873 6785167».
 */
export function utmHjorner(ring: LatLng[], sone: ZoneChoice, maks = 12): string[] {
  if (!ring.length) return [];
  const z = computeZone(ring[0].lat, ring[0].lng, sone);
  const xy = (p: LatLng): [number, number] => {
    const u = toUtm(p.lat, p.lng, z);
    return [u.e, u.n];
  };
  const r = ring.length > 1 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng ? ring.slice(0, -1) : ring;
  if (r.length <= 3) return r.map((p) => formatLatLonUtm(p.lat, p.lng, sone));
  // Douglas–Peucker needs two different end points: split the ring at the corner farthest
  // from the first one and simplify both halves
  const P = r.map(xy);
  let far = 1;
  for (let i = 1; i < P.length; i++) if (Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]) > Math.hypot(P[far][0] - P[0][0], P[far][1] - P[0][1])) far = i;
  const halv1 = r.slice(0, far + 1);
  const halv2 = [...r.slice(far), r[0]];
  const forenklet = (tol: number) => [...forenkle(halv1, xy, tol), ...forenkle(halv2, xy, tol).slice(1, -1)];
  let tol = 5;
  let pts = forenklet(tol);
  while (pts.length > maks && tol < 1e6) {
    tol *= 1.5;
    pts = forenklet(tol);
  }
  return pts.map((p) => formatLatLonUtm(p.lat, p.lng, sone));
}

/** A ledelinje for export (all paths and roads, the prioritised ones, or one). */
export interface LinjeEksport {
  navn: string;
  type: LinjeType;
  pts: LatLng[];
  lengdeM: number;
  nr?: string;
  kilde?: string;
  /** «ferdig sjekket» / «søkt (GPS-spor)» */
  status?: string;
  /** recommended resource for the stisøk */
  anbefalt?: string;
}

export function linjeBeskrivelse(l: LinjeEksport): string {
  return [
    `${LINJETYPE_NAVN[l.type]}, ${fmtAvstand(l.lengdeM)}`,
    l.status ? `status: ${l.status}` : '',
    l.anbefalt ? `anbefalt: ${l.anbefalt}` : '',
    l.kilde ? `kilde: ${l.kilde}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** KML with one folder per line type (Sti, Vei, …), styled with the map colours. */
export function lagLinjeKml(tittel: string, linjer: LinjeEksport[]): string {
  const ut: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    `<name>${escXml(tittel)}</name>`,
  ];
  const typer = Object.keys(LINJETYPE_NAVN) as LinjeType[];
  for (const t of typer) ut.push(`<Style id="linje-${t}"><LineStyle><color>${kmlFarge(LINJETYPE_FARGE[t])}</color><width>3</width></LineStyle></Style>`);
  const data = (navn: string, v: string | number | null | undefined) => (v == null || v === '' ? '' : `<Data name="${navn}"><value>${escXml(String(v))}</value></Data>`);
  for (const t of typer) {
    const gruppe = linjer.filter((l) => l.type === t && l.pts.length >= 2);
    if (!gruppe.length) continue;
    ut.push(`<Folder><name>${escXml(LINJETYPE_NAVN[t])} (${gruppe.length})</name>`);
    for (const l of gruppe) {
      ut.push(
        `<Placemark><name>${escXml(l.navn)}</name><description>${escXml(linjeBeskrivelse(l))}</description><styleUrl>#linje-${t}</styleUrl>` +
          '<ExtendedData>' +
          data('l_nummer', l.nr) +
          data('type', LINJETYPE_NAVN[t]) +
          data('lengde_m', Math.round(l.lengdeM)) +
          data('status', l.status) +
          data('anbefalt_ressurs', l.anbefalt) +
          data('kilde', l.kilde) +
          '</ExtendedData>' +
          `<LineString><tessellate>1</tessellate><coordinates>${koord(l.pts)}</coordinates></LineString></Placemark>`,
      );
    }
    ut.push('</Folder>');
  }
  ut.push('</Document></kml>');
  return ut.join('\n');
}

/** GPX with each line as a track (for GPS units). */
export function lagLinjeGpx(tittel: string, linjer: LinjeEksport[], tid = new Date()): string {
  return lagGpx(
    tittel,
    [],
    linjer.filter((l) => l.pts.length >= 2).map((l) => ({ navn: l.navn, pts: l.pts, beskrivelse: linjeBeskrivelse(l) })),
    tid,
  );
}

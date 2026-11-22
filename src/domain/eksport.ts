import type { Aksjon } from './aksjon';
import { teigAkkPod } from './aksjon';
import type { LatLng } from './coords';
import { escXml } from './gpx';
import { TEIGFARGER, teigfarge } from './pod';

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

const lukk = (ring: LatLng[]) => (ring.length && (ring[0].lat !== ring[ring.length - 1].lat || ring[0].lng !== ring[ring.length - 1].lng) ? [...ring, ring[0]] : ring);
const xy = (p: LatLng) => [+p.lng.toFixed(6), +p.lat.toFixed(6)];

const PUNKTTYPE: Record<string, string> = { obs: 'Observasjon', sp: 'Sperrepost', poi: 'Refleks/POI', funn: 'Funn' };

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
      properties: { name: p.id, kind: p.type, type: PUNKTTYPE[p.type], ...(p.type === 'obs' ? { klasse: p.klasse } : {}), tid: p.tid, description: p.tekst },
      geometry: { type: 'Point', coordinates: xy(p.pos) },
    });
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
  if (a.ipp) {
    ut.push(`<Placemark><name>IPP</name><Point><coordinates>${koord([a.ipp])}</coordinates></Point></Placemark>`);
    i.ringer?.forEach((r, k) => {
      ut.push(`<Placemark><name>${['R25', 'R50', 'R75', 'R95'][k]}</name><styleUrl>#ring</styleUrl><LineString><coordinates>${koord(sirkel(a.ipp!, r))}</coordinates></LineString></Placemark>`);
    });
  }
  for (const t of a.teiger) {
    const f = teigfarge(t.status, t.sok.map((s) => s.pod));
    ut.push(
      `<Placemark><name>${escXml(t.id)}</name><description>${escXml(`Status: ${t.status}, akkumulert POD ${Math.round(teigAkkPod(t) * 100)} %, ${t.sok.length} søk`)}</description><styleUrl>#teig-${f}</styleUrl>` +
        `<Polygon><outerBoundaryIs><LinearRing><coordinates>${koord(lukk(t.ring))}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
    );
  }
  for (const p of a.punkter) {
    ut.push(
      `<Placemark><name>${escXml(p.id)}</name><description>${escXml(`${PUNKTTYPE[p.type]}${p.type === 'obs' ? ` (${p.klasse})` : ''}${p.tekst ? ` – ${p.tekst}` : ''}`)}</description><Point><coordinates>${koord([p.pos])}</coordinates></Point></Placemark>`,
    );
  }
  for (const l of i.ledelinjer) {
    ut.push(`<Placemark><name>${escXml(l.nr)}</name><description>${escXml(`${l.type}${l.navn ? ` ${l.navn}` : ''}`)}</description><styleUrl>#ledelinje</styleUrl><LineString><coordinates>${koord(l.pts)}</coordinates></LineString></Placemark>`);
  }
  ut.push('</Document></kml>');
  return ut.join('\n');
}

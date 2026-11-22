import type { LatLng } from './coords';

/** Minimal GPX 1.1 writer for crews' GPS units. */
export interface GpxPunkt {
  navn: string;
  pos: LatLng;
  beskrivelse?: string;
  symbol?: string;
}

export interface GpxSpor {
  navn: string;
  pts: LatLng[];
  lukket?: boolean;
  beskrivelse?: string;
}

export function escXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

const c = (v: number) => v.toFixed(6);

export function lagGpx(tittel: string, punkter: GpxPunkt[], spor: GpxSpor[], tid = new Date()): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Søkskart" xmlns="http://www.topografix.com/GPX/1/1">',
    `<metadata><name>${escXml(tittel)}</name><time>${tid.toISOString()}</time></metadata>`,
  ];
  for (const p of punkter) {
    out.push(
      `<wpt lat="${c(p.pos.lat)}" lon="${c(p.pos.lng)}"><name>${escXml(p.navn)}</name>` +
        (p.beskrivelse ? `<desc>${escXml(p.beskrivelse)}</desc>` : '') +
        (p.symbol ? `<sym>${escXml(p.symbol)}</sym>` : '') +
        '</wpt>',
    );
  }
  for (const s of spor) {
    const pts = s.lukket && s.pts.length > 2 ? [...s.pts, s.pts[0]] : s.pts;
    out.push(
      `<trk><name>${escXml(s.navn)}</name>` +
        (s.beskrivelse ? `<desc>${escXml(s.beskrivelse)}</desc>` : '') +
        '<trkseg>' +
        pts.map((p) => `<trkpt lat="${c(p.lat)}" lon="${c(p.lng)}"/>`).join('') +
        '</trkseg></trk>',
    );
  }
  out.push('</gpx>');
  return out.join('\n');
}

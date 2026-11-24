import { aksjonsfilnavn, teigAkkPod, type Teig } from '../domain/aksjon';
import { lagTeigGpx, lagTeigKml, utmHjorner, type TeigEksport } from '../domain/eksport';
import { areaM2 } from '../domain/geo';
import { kortBegrunnelse } from '../domain/grunnlag';
import type { TeigForslag } from '../model/beregning';
import { droneFlytid } from '../model/soketid';
import { useStore } from '../state/store';
import { kopier, lastNed } from './felles';

/** Accepted teig → export record (POA and search time from the latest computation). */
export function teigTilEksport(t: Teig): TeigEksport {
  const s = useStore.getState();
  const st = s.resultat?.teiger.find((x) => x.id === t.id);
  const arealKm2 = areaM2(t.ring) / 1e6;
  return {
    navn: t.id,
    type: t.type === 'T' ? 'teig' : t.type === 'H' ? 'helikoptersok' : 'droneomrade',
    ring: t.ring,
    arealKm2,
    poa: st ? st.poaNa : null,
    timer: t.type === 'T' && st ? st.timer : null,
    flytid: t.type === 'D' ? droneFlytid(arealKm2, s.aksjon.modell) : null,
    begrunnelse: t.grunnlag ? kortBegrunnelse(t.grunnlag, s.aksjon.lnummer) : '',
    status: t.status,
    akkPod: teigAkkPod(t),
  };
}

/** Suggestion → export record, named «Forslag 3» / «Drone 2» like in the list. */
export function forslagTilEksport(f: TeigForslag, i: number, drone: boolean): TeigEksport {
  const s = useStore.getState();
  return {
    navn: `${drone ? 'Drone' : 'Forslag'} ${i + 1}`,
    type: drone ? 'droneforslag' : 'teigforslag',
    ring: f.ring,
    arealKm2: f.arealKm2,
    poa: f.poa,
    timer: drone ? null : f.timer,
    flytid: drone ? (f.grunnlag?.drone ?? droneFlytid(f.arealKm2, s.aksjon.modell)) : null,
    begrunnelse: f.grunnlag ? kortBegrunnelse(f.grunnlag, s.aksjon.lnummer) : '',
  };
}

/** Downloads GPX or KML for FAKS and writes a log line. */
export function lastNedTeiger(format: 'gpx' | 'kml', grupper: Array<{ navn: string; teiger: TeigEksport[] }>, hva: string): void {
  const s = useStore.getState();
  const a = s.aksjon;
  const tittel = `${a.navn || a.sarNr || 'Søkskart'} – ${hva}`;
  const alle = grupper.flatMap((g) => g.teiger);
  if (!alle.length) return;
  const del = hva.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-');
  const navn = aksjonsfilnavn(a, `${del}.${format}`);
  if (format === 'kml') lastNed(navn, lagTeigKml(tittel, grupper), 'application/vnd.google-earth.kml+xml');
  else lastNed(navn, lagTeigGpx(tittel, alle), 'application/gpx+xml');
  s.endreAksjon(() => {}, `${hva} eksportert som ${format.toUpperCase()} (${alle.map((t) => t.navn).join(', ')})`);
}

/** Copies the simplified corner list in UTM. */
export function kopierHjorner(navn: string, ring: TeigEksport['ring']): void {
  const s = useStore.getState();
  const linjer = utmHjorner(ring, s.aksjon.sone, 12).map((t, n) => `${n + 1}. ${t}`);
  void kopier(`${navn} – hjørner (UTM)\n${linjer.join('\n')}`, `${navn}: ${linjer.length} hjørner kopiert`);
}

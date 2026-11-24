import { aksjonsfilnavn } from '../domain/aksjon';
import { lagLinjeGpx, lagLinjeKml, type LinjeEksport } from '../domain/eksport';
import { lengthM } from '../domain/geo';
import { stisokAnbefaling, valgteKategorier } from '../data/stisok';
import { LINJETYPE_NAVN, type LinjeType } from '../model/typer';
import { useStore } from '../state/store';
import { lastNed } from './felles';

export type LinjeUtvalg = 'alle' | 'prioriterte' | { id: string };

/** Lines for export from the fetched paths and roads, with L number, status and recommendation. */
export function linjerTilEksport(utvalg: LinjeUtvalg): LinjeEksport[] {
  const s = useStore.getState();
  const a = s.aksjon;
  const kat = valgteKategorier(a.kategorier);
  const lag = (id: string, type: LinjeType, navn: string, pts: LinjeEksport['pts'], kilde?: string): LinjeEksport => {
    const nr = a.lnummer[id];
    const st = a.linjestatus[id];
    const lengdeM = lengthM(pts);
    return {
      navn: `${nr ? `${nr} ` : ''}${LINJETYPE_NAVN[type]}${navn ? ` «${navn}»` : ''}`,
      type,
      pts,
      lengdeM,
      nr,
      kilde,
      status: st ? (st.kilde === 'spor' ? 'søkt (GPS-spor)' : 'ferdig sjekket') : undefined,
      anbefalt: st ? undefined : stisokAnbefaling(type, lengdeM, kat, a.modell).primar.tekst,
    };
  };
  const osm = s.osm;
  const kildeNavn = (k?: string) => (k === 'turrutebasen' ? 'Turrutebasen (Kartverket)' : 'OpenStreetMap');
  if (typeof utvalg === 'object') {
    const l = osm?.linjer.find((x) => x.id === utvalg.id);
    if (l) return [lag(l.id, l.type, l.navn, l.pts, kildeNavn(l.kilde))];
    const st = a.linjestatus[utvalg.id];
    return st ? [lag(utvalg.id, st.type, st.navn, st.pts)] : [];
  }
  if (!osm) return [];
  if (utvalg === 'alle') return osm.linjer.map((l) => lag(l.id, l.type, l.navn, l.pts, kildeNavn(l.kilde)));
  const r = s.resultat;
  if (!r) return [];
  return r.linjer
    .slice(0, a.modell.antallLedelinjer)
    .map((li) => osm.linjer[li.i])
    .filter(Boolean)
    .map((l) => lag(l.id, l.type, l.navn, l.pts, kildeNavn(l.kilde)));
}

/** Downloads KML or GPX of the lines and writes a log line. */
export function lastNedLinjer(format: 'kml' | 'gpx', utvalg: LinjeUtvalg): void {
  const s = useStore.getState();
  const a = s.aksjon;
  const linjer = linjerTilEksport(utvalg);
  if (!linjer.length) {
    s.melding('Ingen linjer å eksportere.', 'info');
    return;
  }
  const hva = typeof utvalg === 'object' ? linjer[0].navn : utvalg === 'alle' ? 'Stier og veier' : 'Prioriterte ledelinjer';
  const tittel = `${a.navn || a.sarNr || 'Søkskart'} – ${hva}`;
  const del = hva.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '');
  const navn = aksjonsfilnavn(a, `${del}.${format}`);
  if (format === 'kml') lastNed(navn, lagLinjeKml(tittel, linjer), 'application/vnd.google-earth.kml+xml');
  else lastNed(navn, lagLinjeGpx(tittel, linjer), 'application/gpx+xml');
  s.endreAksjon(() => {}, `${hva} eksportert som ${format.toUpperCase()} (${linjer.length} linjer)`);
}

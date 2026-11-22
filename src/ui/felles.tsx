import { useState, type ReactNode } from 'react';
import type { LatLng } from '../domain/coords';
import { formatDegrees } from '../domain/coords';
import { displayZone, formatUtm, toUtm, utmRef14, type ZoneChoice } from '../domain/utm';
import { useStore } from '../state/store';

export function Advarsel({ children, type = 'advarsel' }: { children: ReactNode; type?: 'advarsel' | 'feil' | 'info' }) {
  return <div className={`varsel ${type}`} role={type === 'feil' ? 'alert' : 'note'}>{children}</div>;
}

export function Modellmerke() {
  return (
    <span className="merke" title="Forslag fra utviklerne, ikke fra HRS. Kan endres under Statistikk → Modellantakelser.">
      Modellantakelse
    </span>
  );
}

export async function kopier(tekst: string, hva = 'Kopiert'): Promise<void> {
  try {
    await navigator.clipboard.writeText(tekst);
    useStore.getState().melding(`${hva}: ${tekst}`, 'ok');
  } catch {
    useStore.getState().melding('Kunne ikke kopiere – merk teksten og kopier manuelt.', 'feil');
  }
}

/** UTM with zone and band, copy buttons for the full reference and the 14 digits. */
export function Utm({ pos, sone, kompakt }: { pos: LatLng; sone: ZoneChoice; kompakt?: boolean }) {
  const u = toUtm(pos.lat, pos.lng, displayZone(pos.lat, pos.lng, sone));
  const full = formatUtm(u);
  return (
    <span className="utm">
      <span className="mono">{full}</span>
      <button type="button" className="knapp liten" onClick={() => kopier(full, 'UTM kopiert')} title="Kopier UTM med sone og bånd">
        Kopier
      </button>
      {!kompakt && (
        <button type="button" className="knapp liten" onClick={() => kopier(utmRef14(u), '14-sifret referanse kopiert')} title="Kopier 14-sifret UTM-referanse">
          14 siffer
        </button>
      )}
      {!kompakt && <span className="dempet liten-tekst">{formatDegrees(pos)}</span>}
    </span>
  );
}

export function VisKnapp({ pos, zoom }: { pos: LatLng; zoom?: number }) {
  return (
    <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ pos, zoom })}>
      Vis
    </button>
  );
}

export function Sammenleggbar({ tittel, children, start = false }: { tittel: string; children: ReactNode; start?: boolean }) {
  const [apen, setApen] = useState(start);
  return (
    <section className="seksjon">
      <button type="button" className="seksjon-tittel" aria-expanded={apen} onClick={() => setApen(!apen)}>
        <span>{tittel}</span>
        <span aria-hidden="true">{apen ? '▾' : '▸'}</span>
      </button>
      {apen && <div className="seksjon-innhold">{children}</div>}
    </section>
  );
}

export function lastNed(navn: string, tekst: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([tekst], { type }));
  a.download = navn;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

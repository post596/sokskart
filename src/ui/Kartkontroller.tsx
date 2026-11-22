import { useEffect, useRef, useState } from 'react';
import { fliserForOmrade, flisUrl, KARTLAG, lastNedFliser } from '../services/kartfliser';
import { useStore, type Visning } from '../state/store';
import { BANDFARGER } from '../map/lag';

const LAG: Array<[keyof Visning, string]> = [
  ['plankart', 'Plankart'],
  ['resultatkart', 'Resultatkart'],
  ['etterretningskart', 'Etterretningskart'],
];
const EKSTRA: Array<[keyof Visning, string]> = [
  ['sannsynlighet', 'Sannsynlighet (25/50/75/95 %)'],
  ['gangtid', 'Gangtid fra IPP'],
  ['alleLedelinjer', 'Alle ledelinjer'],
  ['forslag', 'Ressursforslag'],
];

export function Kartkontroller() {
  const visning = useStore((s) => s.visning);
  const grunnkart = useStore((s) => s.grunnkart);
  const egen = useStore((s) => s.egenposisjon);
  const r = useStore((s) => s.resultat);
  const set = useStore((s) => s.set);
  const [apen, setApen] = useState(() => window.innerWidth > 900);
  const [nedlasting, setNedlasting] = useState<{ ferdig: number; totalt: number } | null>(null);
  const watch = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
  }, []);

  const vekslPosisjon = () => {
    if (watch.current != null) {
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      set({ egenposisjon: null });
      return;
    }
    if (!('geolocation' in navigator)) {
      useStore.getState().melding('Denne enheten kan ikke gi posisjon.', 'feil');
      return;
    }
    let forste = true;
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        set({ egenposisjon: { pos, noyaktighet: p.coords.accuracy, tid: p.timestamp } });
        if (forste) {
          forste = false;
          useStore.getState().vis({ pos, zoom: 15 });
        }
      },
      (e) => {
        useStore.getState().melding(`Fikk ikke posisjon: ${e.message}`, 'feil');
        if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
  };

  const lastNedKart = async () => {
    if (!r) return;
    const [[s, w], [n, e]] = r.merc.bounds;
    // Kartverket only (OSM's tile servers do not allow bulk download). Only overview levels
    // 8–11: Kartverket's terms say levels 12–20 contain Geovekst data that may not be copied
    // without special permission. Detail levels are cached as they are viewed.
    const lag = KARTLAG.find((k) => k.id === grunnkart && k.id !== 'osm') ?? KARTLAG[0];
    const fliser = fliserForOmrade(s, w, n, e, 8, 11);
    const ok = await useStore.getState().bekreft({
      tittel: 'Last ned oversiktskart for området?',
      tekst: `Laster ned ${fliser.length} kartfliser fra ${lag.navn} på oversiktsnivå (zoom 8–11) slik at kartet virker uten nett. Detaljnivåene lagres når de vises i kartet – zoom gjennom søksområdet mens dere har nett. Kartverkets vilkår krever løyve for å kopiere detaljnivåene (Geovekst-data).`,
      ja: 'Last ned',
      nei: 'Avbryt',
    });
    if (!ok) return;
    abort.current = new AbortController();
    setNedlasting({ ferdig: 0, totalt: fliser.length });
    const feil = await lastNedFliser(
      fliser.map((f) => flisUrl(lag, f)),
      (ferdig, totalt) => setNedlasting({ ferdig, totalt }),
      abort.current.signal,
    );
    setNedlasting(null);
    useStore
      .getState()
      .melding(
        feil ? `Oversiktskart lastet ned, men ${feil} fliser feilet.` : 'Oversiktskart er lastet ned. Detaljnivåene virker uten nett der dere har vist dem.',
        feil ? 'feil' : 'ok',
      );
  };

  return (
    <div className={`kartkontroller ${apen ? 'apen' : ''}`}>
      <button type="button" className="knapp liten" onClick={() => setApen(!apen)} aria-expanded={apen}>
        {apen ? 'Skjul kartlag' : 'Kartlag'}
      </button>
      {apen && (
        <div className="kk-innhold">
          <label>
            Grunnkart
            <select value={grunnkart} onChange={(e) => set({ grunnkart: e.target.value })}>
              {KARTLAG.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.navn}
                </option>
              ))}
            </select>
          </label>
          <div className="liten-tekst dempet">IPP og ringer vises i alle kartlag.</div>
          {LAG.map(([k, navn]) => (
            <label key={k} className="avkryss">
              <input type="checkbox" checked={visning[k]} onChange={(e) => set({ visning: { ...visning, [k]: e.target.checked } })} />
              {navn}
            </label>
          ))}
          <hr />
          {EKSTRA.map(([k, navn]) => (
            <label key={k} className="avkryss">
              <input type="checkbox" checked={visning[k]} onChange={(e) => set({ visning: { ...visning, [k]: e.target.checked } })} />
              {navn}
            </label>
          ))}
          {visning.sannsynlighet && (
            <div className="bandforklaring">
              {['25 %', '50 %', '75 %', '95 %'].map((t, i) => (
                <span key={t}>
                  <i className="farge" style={{ background: `rgba(${BANDFARGER[i].slice(0, 3).join(',')},${BANDFARGER[i][3] / 255 + 0.2})` }} /> {t}
                </span>
              ))}
            </div>
          )}
          <hr />
          <button type="button" className={`knapp liten ${egen ? 'hoved' : ''}`} onClick={vekslPosisjon}>
            {egen ? 'Skjul min posisjon' : 'Min posisjon'}
          </button>
          <button type="button" className="knapp liten" disabled={!r || !!nedlasting} onClick={() => void lastNedKart()}>
            Last ned oversiktskart
          </button>
          {nedlasting && (
            <div className="liten-tekst">
              <progress max={nedlasting.totalt} value={nedlasting.ferdig} /> {nedlasting.ferdig} / {nedlasting.totalt}{' '}
              <button type="button" className="knapp liten" onClick={() => abort.current?.abort()}>
                Avbryt
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

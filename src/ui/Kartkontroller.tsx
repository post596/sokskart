import { useEffect, useRef, useState } from 'react';
import { fliserForOmrade, flisUrl, KARTLAG, lastNedFliser, STRAVA_AKTIVITETER, STRAVA_FARGER, STRAVA_MAKS_ZOOM, stravaStandard, type StravaAktivitet, type StravaFarge } from '../services/kartfliser';
import { valgteKategorier } from '../data/stisok';
import { posisjonAktiv, startPosisjon, stoppPosisjon } from '../services/posisjon';
import { useStore, type Visning } from '../state/store';
import { BANDFARGER } from '../map/lag';
import { STIRESSURSER, type StiRessurs } from '../data/stisok';

const LAG: Array<[keyof Visning, string]> = [
  ['plankart', 'Plankart'],
  ['resultatkart', 'Resultatkart'],
  ['etterretningskart', 'Etterretningskart'],
];
const EKSTRA: Array<[keyof Visning, string]> = [
  ['sannsynlighet', 'Sannsynlighet (25/50/75/95 %)'],
  ['gangtid', 'Gangtid fra IPP'],
  ['alleLedelinjer', 'Alle ledelinjer'],
];
const FORSLAG: Array<[keyof Visning, string]> = [
  ['teigforslag', 'Teigforslag'],
  ['droneforslag', 'Droneområder'],
  ['poiforslag', 'Punktforslag (også utenfor Punkter)'],
];

export function Kartkontroller() {
  const visning = useStore((s) => s.visning);
  const grunnkart = useStore((s) => s.grunnkart);
  const linjeFilter = useStore((s) => s.linjeFilter);
  const stravaLag = useStore((s) => s.stravaLag);
  const kategorier = useStore((s) => s.aksjon.kategorier);
  const stravaAuto = stravaStandard(valgteKategorier(kategorier));
  const egen = useStore((s) => s.egenposisjon);
  const r = useStore((s) => s.resultat);
  const set = useStore((s) => s.set);
  const [apen, setApen] = useState(() => window.innerWidth > 900);
  const [nedlasting, setNedlasting] = useState<{ ferdig: number; totalt: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => stoppPosisjon(), []);

  const vekslPosisjon = () => (posisjonAktiv() ? stoppPosisjon() : startPosisjon());

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
          <div className="kk-tittel">Forslag i kartet</div>
          {FORSLAG.map(([k, navn]) => (
            <label key={k} className="avkryss">
              <input type="checkbox" checked={visning[k]} onChange={(e) => set({ visning: { ...visning, [k]: e.target.checked } })} />
              {navn}
            </label>
          ))}
          <label>
            Ledelinjer for
            <select value={linjeFilter} onChange={(e) => set({ linjeFilter: e.target.value as StiRessurs | 'alle' })}>
              <option value="alle">Alle ressurser</option>
              {STIRESSURSER.map((r) => (
                <option key={r.type} value={r.type}>
                  {r.navn}
                </option>
              ))}
            </select>
          </label>
          <div className="knapperad">
            <button
              type="button"
              className={`knapp liten ${linjeFilter === 'drone' && !visning.teigforslag ? 'hoved' : ''}`}
              title="Fremhev linjer der drone er anbefalt, vis droneområder og skjul teigforslag"
              onClick={() => set({ linjeFilter: 'drone', visning: { ...visning, droneforslag: true, teigforslag: false, poiforslag: false } })}
            >
              Bare drone
            </button>
            {(linjeFilter !== 'alle' || !visning.teigforslag || !visning.droneforslag) && (
              <button type="button" className="knapp liten" onClick={() => set({ linjeFilter: 'alle', visning: { ...visning, teigforslag: true, droneforslag: true } })}>
                Vis alle
              </button>
            )}
          </div>
          <hr />
          <label className="avkryss">
            <input type="checkbox" checked={visning.strava} onChange={(e) => set({ visning: { ...visning, strava: e.target.checked } })} />
            Strava-heatmap (mye brukte stier)
          </label>
          {visning.strava && (
            <>
              <label>
                Aktivitet
                <select
                  value={stravaLag.aktivitet ?? 'auto'}
                  onChange={(e) => set({ stravaLag: { ...stravaLag, aktivitet: e.target.value === 'auto' ? null : (e.target.value as StravaAktivitet) } })}
                >
                  <option value="auto">Etter kategori ({STRAVA_AKTIVITETER.find((x) => x.id === stravaAuto)?.navn.toLowerCase()})</option>
                  {STRAVA_AKTIVITETER.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.navn}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Farge
                <select value={stravaLag.farge} onChange={(e) => set({ stravaLag: { ...stravaLag, farge: e.target.value as StravaFarge } })}>
                  {STRAVA_FARGER.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.navn}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Synlighet
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.1}
                  value={stravaLag.opasitet}
                  onChange={(e) => set({ stravaLag: { ...stravaLag, opasitet: Number(e.target.value) } })}
                />
              </label>
              <details className="grunnlag">
                <summary>Om Strava-heatmap</summary>
                <ul>
                  <li>Viser hvor folk har logget turer i Strava det siste året. Sterk farge = mye brukt.</li>
                  <li>Avslører stier og gangveier som brukes mye, også de som mangler i OSM – nyttig ved søk etter turfolk.</li>
                  <li>Grov oppløsning (ca. 20 m, zoom {STRAVA_MAKS_ZOOM}); nærmere inn blir flisene forstørret.</li>
                  <li>Sier ikke om ferdsel er lovlig eller trygg (kan vise snarveier i bratt terreng).</li>
                  <li>Brukes ikke i beregningene og lagres ikke for bruk uten nett.</li>
                  <li>Strava kan stenge tilgangen. Tillatelse til annen bruk enn OSM bør avklares med Strava.</li>
                </ul>
              </details>
            </>
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

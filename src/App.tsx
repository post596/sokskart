import { useEffect, useState, type ReactNode } from 'react';
import { Kart } from './map/Kart';
import { useStore, type Fane } from './state/store';
import { AksjonFane } from './ui/faner/AksjonFane';
import { LedelinjerFane } from './ui/faner/LedelinjerFane';
import { PunkterFane } from './ui/faner/PunkterFane';
import { RessurserFane } from './ui/faner/RessurserFane';
import { StatistikkFane } from './ui/faner/StatistikkFane';
import { TeigerFane } from './ui/faner/TeigerFane';
import { SavnetFane } from './ui/faner/SavnetFane';
import { RegionerFane } from './ui/faner/RegionerFane';
import { TidslinjeFane } from './ui/faner/TidslinjeFane';
import { OrdreDialog } from './ui/Ordre';
import { Kartkontroller } from './ui/Kartkontroller';
import { Tidslinje } from './ui/Tidslinje';

const FANER: Array<[Fane, string]> = [
  ['aksjon', 'Aksjon'],
  ['savnet', 'Savnet'],
  ['ledelinjer', 'Ledelinjer'],
  ['teiger', 'Teiger'],
  ['regioner', 'Regioner'],
  ['punkter', 'Punkter'],
  ['ressurser', 'Ressurser'],
  ['tidslinje', 'Tidslinje'],
  ['statistikk', 'Statistikk'],
];

const INNHOLD: Record<Fane, () => ReactNode> = {
  aksjon: () => <AksjonFane />,
  savnet: () => <SavnetFane />,
  ledelinjer: () => <LedelinjerFane />,
  teiger: () => <TeigerFane />,
  regioner: () => <RegionerFane />,
  punkter: () => <PunkterFane />,
  ressurser: () => <RessurserFane />,
  tidslinje: () => <TidslinjeFane />,
  statistikk: () => <StatistikkFane />,
};

function Ordre() {
  const f = useStore((s) => s.ordreFor);
  return f ? <OrdreDialog key={`${f.type}:${f.id}`} /> : null;
}

function Modusbar() {
  const modus = useStore((s) => s.modus);
  const red = useStore((s) => s.redigererTeig);
  const set = useStore((s) => s.set);
  if (!modus && !red) return null;
  const tekst = red
    ? `Rediger ${red}: dra i hjørnene. Trykk «Ferdig» når du er ferdig.`
    : modus?.type === 'ipp'
      ? 'Klikk i kartet for å sette IPP'
      : modus?.type === 'punkt'
        ? 'Klikk der punktet skal stå'
        : modus?.type === 'region'
          ? 'Klikk hjørnene i regionen – dobbeltklikk eller klikk første hjørne for å avslutte'
          : 'Klikk hjørnene i teigen – dobbeltklikk eller klikk første hjørne for å avslutte';
  return (
    <div className="modusbar" role="status">
      <span>{tekst}</span>
      {red ? (
        <button type="button" className="knapp liten hoved" onClick={() => set({ redigererTeig: null })}>
          Ferdig
        </button>
      ) : (
        <button type="button" className="knapp liten" onClick={() => set({ modus: null })}>
          Avbryt
        </button>
      )}
    </div>
  );
}

function Meldinger() {
  const meldinger = useStore((s) => s.meldinger);
  const fjern = useStore((s) => s.fjernMelding);
  return (
    <div className="meldinger" aria-live="polite">
      {meldinger.map((m) => (
        <div key={m.id} className={`melding ${m.type}`} role={m.type === 'feil' ? 'alert' : 'status'}>
          <span>{m.tekst}</span>
          <button type="button" className="lukk" aria-label="Lukk" onClick={() => fjern(m.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function DialogBoks() {
  const d = useStore((s) => s.dialog);
  useEffect(() => {
    if (!d) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && d.svar(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [d]);
  if (!d) return null;
  return (
    <div className="dialog-bakgrunn">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-b">
        <h2 id="dlg-t">{d.tittel}</h2>
        <p id="dlg-b">{d.tekst}</p>
        <div className="knapperad hoyre">
          <button type="button" className="knapp" onClick={() => d.svar(false)} autoFocus>
            {d.nei}
          </button>
          <button type="button" className={`knapp ${d.fare ? 'fare' : 'hoved'}`} onClick={() => d.svar(true)}>
            {d.ja}
          </button>
        </div>
      </div>
    </div>
  );
}

function useNett(): boolean {
  const [paa, setPaa] = useState(() => navigator.onLine);
  useEffect(() => {
    const p = () => setPaa(true);
    const a = () => setPaa(false);
    window.addEventListener('online', p);
    window.addEventListener('offline', a);
    return () => {
      window.removeEventListener('online', p);
      window.removeEventListener('offline', a);
    };
  }, []);
  return paa;
}

export function App() {
  const fane = useStore((s) => s.fane);
  const set = useStore((s) => s.set);
  const navn = useStore((s) => s.aksjon.navn || s.aksjon.sarNr);
  const lastet = useStore((s) => s.lastet);
  const beregner = useStore((s) => s.beregner);
  const feil = useStore((s) => s.beregningFeil);
  const nett = useNett();

  return (
    <div className="app">
      <header className="topp">
        <div className="tittel">
          <h1>Søkskart</h1>
          <span className="aksjonsnavn">{navn || 'Ny aksjon'}</span>
        </div>
        <div className="status">
          {!nett && <span className="statusmerke av">Uten nett</span>}
          {beregner && <span className="statusmerke">Beregner …</span>}
          {feil && <span className="statusmerke av" title={feil}>Beregningsfeil</span>}
        </div>
        <p className="stotte">
          Støtteverktøy. Søksledelsen tar beslutningene – HRS sitt felles system for aksjonsstøtte er det offisielle systemet.
        </p>
      </header>
      <main className="hoved">
        <aside className="sidepanel">
          <nav className="faner" role="tablist" aria-label="Faner">
            {FANER.map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={fane === k} className={fane === k ? 'pa' : ''} onClick={() => set({ fane: k })}>
                {t}
              </button>
            ))}
          </nav>
          <div className="faneinnhold" role="tabpanel">
            {lastet ? INNHOLD[fane]() : <p className="dempet">Laster lagret aksjon …</p>}
          </div>
        </aside>
        <section className="kartkolonne" aria-label="Kart">
          <Kart />
          <Modusbar />
          <Kartkontroller />
          <Tidslinje />
        </section>
      </main>
      <Meldinger />
      <Ordre />
      <DialogBoks />
    </div>
  );
}

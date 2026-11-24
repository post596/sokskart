import { useEffect, useState } from 'react';
import { lokalTid, type PunktType } from '../domain/aksjon';
import type { Observasjonsklasse } from '../data/modellantakelser';
import { harKlasse, leggTilPunkt, PUNKTNAVN, type PunktUtkast } from '../state/handlinger';
import { useStore } from '../state/store';
import { Utm } from './felles';

export const KLASSER: Array<[Observasjonsklasse, string]> = [
  ['sikker', 'Sikker – sett av nær familie, nabo, kollega, god venn eller kamera / gjenstand sikkert identifisert'],
  ['sannsynlig', 'Sannsynlig – kan stemme med beskrivelsen'],
  ['mulig', 'Mulig – ikke spesifikk nok til å omprioritere'],
  ['usikker', 'Usikker – vag beskrivelse, kan ikke bekreftes'],
];

/** The order in the quick dialog: what is most often registered in the field first. */
const TYPER: PunktType[] = ['funn', 'obs', 'sp', 'poi'];

const HJELP: Record<PunktType, string> = {
  funn: 'Gjenstand som kan tilhøre den savnede (klær, utstyr, spor). Sikre og sannsynlige funn blir nytt utgangspunkt i sannsynlighetskartet.',
  obs: 'Observasjon, tips eller annen etterretning (vitne, telefon, kamera). Sikre og sannsynlige blir nytt utgangspunkt.',
  sp: 'Sperrepost / observasjonspost som hindrer at personen tar seg forbi.',
  poi: 'Sted som bør sjekkes (refleks), f.eks. en hytte eller bru.',
};

/** Dialog for a new point at a position chosen in the map (right-click, long-press or «+ Punkt»). */
export function NyttPunktDialog() {
  const ny = useStore((s) => s.nyttPunkt);
  const sone = useStore((s) => s.aksjon.sone);
  const set = useStore((s) => s.set);
  const [u, setU] = useState<PunktUtkast>({ type: 'funn', klasse: 'sannsynlig', tid: lokalTid(), tekst: '' });

  useEffect(() => {
    if (!ny) return;
    setU((x) => ({ ...x, tid: lokalTid(), tekst: '' }));
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && set({ nyttPunkt: null });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [ny, set]);

  if (!ny) return null;
  const lagre = () => {
    const id = leggTilPunkt(ny.pos, u);
    set({ nyttPunkt: null, valgt: { type: 'punkt', id } });
    useStore.getState().melding(`${id} er lagt til.`, 'ok');
  };

  return (
    <div className="dialog-bakgrunn">
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nytt-punkt-t"
        onSubmit={(e) => {
          e.preventDefault();
          lagre();
        }}
      >
        <h2 id="nytt-punkt-t">Nytt punkt</h2>
        <Utm pos={ny.pos} sone={sone} />
        <fieldset className="brikker" aria-label="Type">
          {TYPER.map((t) => (
            <button key={t} type="button" className={`brikke ${u.type === t ? 'pa' : ''}`} aria-pressed={u.type === t} onClick={() => setU({ ...u, type: t })}>
              {PUNKTNAVN[t]}
            </button>
          ))}
        </fieldset>
        <p className="liten-tekst dempet">{HJELP[u.type]}</p>
        {harKlasse(u.type) && (
          <label>
            Hvor sikkert er det?
            <select value={u.klasse} onChange={(e) => setU({ ...u, klasse: e.target.value as Observasjonsklasse })}>
              {KLASSER.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Beskrivelse / kilde
          <input
            value={u.tekst}
            onChange={(e) => setU({ ...u, tekst: e.target.value })}
            placeholder={u.type === 'funn' ? 'Hva, hvem fant det, identifisert av hvem' : 'Hvem, hva, hvordan verifisert'}
            autoFocus
          />
        </label>
        <label>
          Tidspunkt
          <input type="datetime-local" value={u.tid} onChange={(e) => setU({ ...u, tid: e.target.value })} />
        </label>
        <div className="knapperad hoyre">
          <button type="button" className="knapp" onClick={() => set({ nyttPunkt: null })}>
            Avbryt
          </button>
          <button type="submit" className="knapp hoved">
            Legg til
          </button>
        </div>
      </form>
    </div>
  );
}

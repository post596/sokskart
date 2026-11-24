import { useEffect, useState } from 'react';
import { aksjonsfilnavn, lagAksjonsfil } from '../domain/aksjon';
import { useStore } from '../state/store';
import { lastNed } from './felles';

/** «Start på nytt»: save the aksjon file first, then a new aksjon or delete everything. */
export function NullstillDialog() {
  const vis = useStore((s) => s.visNullstill);
  const set = useStore((s) => s.set);
  const [lagret, setLagret] = useState(false);
  const [arbeider, setArbeider] = useState(false);

  useEffect(() => {
    if (!vis) {
      setLagret(false);
      return;
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && set({ visNullstill: false });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [vis, set]);

  if (!vis) return null;

  const lagre = () => {
    const s = useStore.getState();
    lastNed(aksjonsfilnavn(s.aksjon, 'json'), JSON.stringify(lagAksjonsfil(s.aksjon, s.statistikk, s.osm)), 'application/json');
    s.endreAksjon(() => {}, 'Aksjonsfil lagret før «Start på nytt»');
    setLagret(true);
  };
  const kjor = async (valg: 'ny' | 'alt') => {
    setArbeider(true);
    try {
      await useStore.getState().nullstill(valg);
    } finally {
      setArbeider(false);
    }
  };

  return (
    <div className="dialog-bakgrunn">
      <div className="dialog nullstill" role="dialog" aria-modal="true" aria-labelledby="nullstill-t">
        <h2 id="nullstill-t">Start på nytt</h2>
        <p>Lagre aksjonen som fil først hvis dere trenger den senere. Det som slettes, kan ikke hentes tilbake.</p>
        <div className="knapperad">
          <button type="button" className="knapp" onClick={lagre} disabled={arbeider}>
            {lagret ? 'Lagret ✓ – lagre igjen' : 'Lagre aksjonsfil først'}
          </button>
        </div>
        <div className="nullstill-valg">
          <div>
            <button type="button" className="knapp hoved" onClick={() => void kjor('ny')} disabled={arbeider}>
              Ny aksjon
            </button>
            <p className="liten-tekst">
              Tømmer IPP, kategorier, teiger, punkter, GPS-spor, forslag, logg, hentede stier og høydedata. <b>Beholder</b> statistikken og nedlastede
              kart.
            </p>
          </div>
          <div>
            <button type="button" className="knapp fare" onClick={() => void kjor('alt')} disabled={arbeider}>
              Slett alt
            </button>
            <p className="liten-tekst">
              Som «Ny aksjon», og sletter <b>også</b> egen statistikk og alle nedlastede kartfliser på denne enheten. Appen virker fortsatt, men kart
              må lastes ned på nytt.
            </p>
          </div>
        </div>
        <div className="knapperad hoyre">
          <button type="button" className="knapp" onClick={() => set({ visNullstill: false })} disabled={arbeider} autoFocus>
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
}

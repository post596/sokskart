import { useEffect, useRef } from 'react';
import { timerMellom } from '../domain/aksjon';
import { byggKomponenter, vektetFart } from '../model/lpb';
import { standardVisning } from '../state/beregning';
import { useStore } from '../state/store';
import { fmtAvstand, fmtFart, fmtTimer } from './format';

/**
 * Time slider: shows where the person can be if they have walked t hours from the IPP,
 * along paths and over terrain. «Play» lets the lines grow from 0 to the chosen time.
 */
export function Tidslinje() {
  const a = useStore((s) => s.aksjon);
  const stat = useStore((s) => s.statistikk);
  const r = useStore((s) => s.resultat);
  const visningTimer = useStore((s) => s.visningTimer);
  const spiller = useStore((s) => s.spiller);
  const naa = useStore((s) => s.naa);
  const gangtidPaa = useStore((s) => s.visning.gangtid);
  const set = useStore((s) => s.set);
  const raf = useRef(0);

  const komps = byggKomponenter(stat, a.kategorier, a.terreng);
  const { v, mob } = vektetFart(komps);
  const siden = timerMellom(a.sistSett, new Date(naa));
  const maks = Math.max(1, Math.min(24, Math.ceil(Math.max(mob || 1, siden ?? 0))));
  const t = visningTimer ?? standardVisning();
  const folger = visningTimer == null;

  useEffect(() => {
    if (!spiller) return;
    const slutt = siden != null && siden > 0 ? Math.min(siden, mob) : Math.min(maks, Math.max(1, t));
    const start = performance.now();
    const varighet = 6000;
    const steg = (now: number) => {
      const f = Math.min(1, (now - start) / varighet);
      useStore.getState().set({ visningTimer: f * slutt });
      if (f < 1) raf.current = requestAnimationFrame(steg);
      else useStore.getState().set({ spiller: false });
    };
    raf.current = requestAnimationFrame(steg);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spiller]);

  if (!a.ipp || !gangtidPaa) return null;

  return (
    <div className="tidslinje" role="group" aria-label="Gangtid fra IPP">
      <div className="tid-topp">
        <b>Hvis personen har gått {fmtTimer(t)}</b>
        <span className="dempet">
          {' '}
          · {fmtFart(v)} ≈ {fmtAvstand(v * t * 1000)} langs sti
          {siden != null && siden > 0 ? ` · sist sett for ${fmtTimer(siden)} siden` : ' · tid sist sett ikke oppgitt'}
          {t > mob && ` · over mobilitetstid (${fmtTimer(mob)})`}
        </span>
      </div>
      <div className="tid-kontroll">
        <button
          type="button"
          className="knapp liten"
          aria-label={spiller ? 'Stopp' : 'Spill av'}
          onClick={() => set({ spiller: !spiller })}
          title="Vis hvordan ledelinjene og området vokser utover fra IPP"
        >
          {spiller ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={maks}
          step={1 / 12}
          value={Math.min(t, maks)}
          aria-label="Gått tid i timer"
          aria-valuetext={fmtTimer(t)}
          onChange={(e) => set({ visningTimer: Number(e.target.value), spiller: false })}
        />
        <button
          type="button"
          className={`knapp liten ${folger ? 'hoved' : ''}`}
          onClick={() => set({ visningTimer: null, spiller: false })}
          title="Følg tiden siden sist sett (begrenset av mobilitetstid)"
        >
          Nå
        </button>
      </div>
      {!r?.harHoyde && <div className="liten-tekst dempet">Uten høydedata regnes terrenget som flatt.</div>}
    </div>
  );
}

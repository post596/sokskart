import { useState } from 'react';
import { timerMellom } from '../domain/aksjon';
import { faseanbefaling, FASENAVN, type TeigOnske } from '../domain/fase';
import { prosent } from '../domain/pod';
import type { SokTeknikk } from '../data/modellantakelser';
import type { TeigForslag } from '../model/beregning';
import { arealPerTime, droneFlytid } from '../model/soketid';
import { mixRinger } from '../state/beregning';
import { leggTilTeig } from '../state/handlinger';
import { useStore } from '../state/store';
import { Modellmerke } from './felles';
import { fmtFlytid, fmtKm2, fmtTimer } from './format';

export function Teigforslag() {
  const a = useStore((s) => s.aksjon);
  const r = useStore((s) => s.resultat);
  const naa = useStore((s) => s.naa);
  const teigforslag = useStore((s) => s.teigforslag);
  const droneforslag = useStore((s) => s.droneforslag);
  const onske = useStore((s) => s.forslagOnske);
  const set = useStore((s) => s.set);
  const m = a.modell;
  const [teknikk, setTeknikk] = useState<SokTeknikk>(m.standardTeknikk);
  if (!a.ipp) return null;

  const R = r?.ringer ?? mixRinger();
  const timer = timerMellom(a.aksjonStart ?? a.ippSatt, new Date(naa));
  const anb = faseanbefaling({
    timer,
    grenser: m.fasegrenser,
    r25: R?.[0] ?? 1000,
    fotmannskap: a.ressurser.fotmannskap,
    mannskapPerLag: m.teknikker[m.standardTeknikk].mannskap,
    standardTeknikk: m.standardTeknikk,
  });
  const be = (teig: TeigOnske | null, drone: boolean) => {
    set({
      forslagOnske: {
        teig,
        drone: drone ? { antall: Math.max(1, a.ressurser.drone || 3) } : null,
      },
      ...(teig ? { teigforslag: [] } : {}),
      ...(drone ? { droneforslag: [] } : {}),
    });
  };
  const godkjenn = (f: TeigForslag, type: 'T' | 'D', liste: 'teigforslag' | 'droneforslag') => {
    const id = leggTilTeig(f.ring, type);
    useStore.getState().endreAksjon(
      () => {},
      `${id} godkjent fra forslag (${fmtKm2(f.arealKm2)}${type === 'T' ? `, ca. ${fmtTimer(f.timer)} ${m.teknikker[teknikk].navn.toLowerCase()}` : ''}, POA ${prosent(f.poa)})`,
    );
    const s = useStore.getState();
    set({ [liste]: s[liste].filter((x) => x !== f) } as Partial<ReturnType<typeof useStore.getState>>);
  };
  const t = m.teknikker[teknikk];

  return (
    <section className="boks forslag">
      <h3>
        Anbefaling nå: {FASENAVN[anb.fase]}
        {timer != null && <span className="dempet"> ({fmtTimer(Math.max(0, timer))} siden start)</span>}
      </h3>
      <p className="liten-tekst">{anb.tekst}</p>
      <div className="knapperad">
        {anb.knapp && anb.teig && (
          <button type="button" className="knapp hoved" disabled={!!onske} onClick={() => be(anb.teig, false)}>
            {anb.knapp}
          </button>
        )}
        <button type="button" className="knapp" disabled={!!onske} onClick={() => be(null, true)}>
          Foreslå droneområder
        </button>
      </div>
      <details>
        <summary>Andre forslag og søketeknikk</summary>
        <div className="rad">
          <label>
            Teigene dimensjoneres for
            <select value={teknikk} onChange={(e) => setTeknikk(e.target.value as SokTeknikk)}>
              {(Object.keys(m.teknikker) as SokTeknikk[]).map((k) => (
                <option key={k} value={k}>
                  {m.teknikker[k].navn} ({m.teknikker[k].mannskap} pers, {m.teknikker[k].avstandM} m, {String(m.teknikker[k].fartKmt).replace('.', ',')} km/t)
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="liten-tekst dempet">
          Maks {fmtTimer(m.maksSoketid)} søk og {String(m.maksTeigKm2).replace('.', ',')} km² per teig. Med {t.navn.toLowerCase()} rekker et lag ca.{' '}
          {fmtKm2((arealPerTime(t) * m.maksSoketid) / 1e6)} på {fmtTimer(m.maksSoketid)} i lett terreng – mindre i skog, myr og bratt. <Modellmerke />
        </p>
        <div className="knapperad">
          <button type="button" className="knapp liten" disabled={!!onske} onClick={() => be({ modus: 'navet', antall: 0, teknikk: 'finsok' }, false)}>
            Nærområdet (R25, finsøk)
          </button>
          <button type="button" className="knapp liten" disabled={!!onske} onClick={() => be({ modus: 'neste', antall: Math.max(1, Math.floor(a.ressurser.fotmannskap / t.mannskap)) || 3, teknikk }, false)}>
            Neste teiger for fotlagene
          </button>
          <button type="button" className="knapp liten" disabled={!!onske} onClick={() => be({ modus: 'sett', antall: 0, teknikk }, false)}>
            Teigsett for 75 %-sonen
          </button>
        </div>
      </details>
      {onske && <p className="liten-tekst">Lager forslag langs naturlige grenser …</p>}

      {teigforslag.length > 0 && (
        <>
          <div className="linje">
            <b>Teigforslag ({teigforslag.length})</b>
            <span className="knapperad">
              <button
                type="button"
                className="knapp liten hoved"
                onClick={() => {
                  for (const f of [...useStore.getState().teigforslag]) godkjenn(f, 'T', 'teigforslag');
                }}
              >
                Godkjenn alle
              </button>
              <button type="button" className="knapp liten" onClick={() => set({ teigforslag: [] })}>
                Forkast
              </button>
            </span>
          </div>
          <ol className="liste kompakt">
            {teigforslag.map((f, i) => (
              <li key={i}>
                <div className="linje">
                  <span>
                    <b>Forslag {i + 1}</b> · {fmtKm2(f.arealKm2)} · ca. {fmtTimer(f.timer)} · POA {prosent(f.poa)}
                  </span>
                  <span className="knapperad">
                    <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: f.ring })}>
                      Vis
                    </button>
                    <button type="button" className="knapp liten hoved" onClick={() => godkjenn(f, 'T', 'teigforslag')}>
                      Godkjenn
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <p className="liten-tekst dempet">Godkjente forslag blir faste teiger (T-nummer) i det felles teigsettet. Grensene kan redigeres etterpå.</p>
        </>
      )}

      {droneforslag.length > 0 && (
        <>
          <div className="linje">
            <b>Droneforslag ({droneforslag.length})</b>
            <button type="button" className="knapp liten" onClick={() => set({ droneforslag: [] })}>
              Forkast
            </button>
          </div>
          <ol className="liste kompakt">
            {droneforslag.map((f, i) => (
              <li key={i}>
                <div className="linje">
                  <span>
                    <b>Drone {i + 1}</b> · {fmtKm2(f.arealKm2)} · {fmtFlytid(droneFlytid(f.arealKm2, m))} · POA {prosent(f.poa)}
                  </span>
                  <span className="knapperad">
                    <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: f.ring })}>
                      Vis
                    </button>
                    <button type="button" className="knapp liten hoved" onClick={() => godkjenn(f, 'D', 'droneforslag')}>
                      Godkjenn
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <p className="liten-tekst dempet">
            Droneområder legges der drone virker best: åpent terreng, myr, vann og strandsone, bre og bratt terreng. Hvert område er maks{' '}
            {String(m.droneMaksKm2).replace('.', ',')} km² (ca. ett batteri med {m.sokebredde.drone} m søkebredde, {m.droneFartKmt} km/t og{' '}
            {m.droneBatteriMin} min flytid). <Modellmerke />
          </p>
        </>
      )}
    </section>
  );
}

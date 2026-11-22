import { useState } from 'react';
import { konsensus, MAKS_REGIONER, RESTEN } from '../../domain/mattson';
import { areaM2 } from '../../domain/geo';
import { prosent } from '../../domain/pod';
import { leggTilDeltaker, settVurdering, slettDeltaker, slettRegion } from '../../state/handlinger';
import { useStore } from '../../state/store';
import { Advarsel } from '../felles';
import { fmtKm2 } from '../format';

export function RegionerFane() {
  const a = useStore((s) => s.aksjon);
  const r = useStore((s) => s.resultat);
  const set = useStore((s) => s.set);
  const endre = useStore((s) => s.endreAksjon);
  const [nyDeltaker, setNyDeltaker] = useState('');
  const ids = a.regioner.map((x) => x.id);
  const k = ids.length ? konsensus(a.mattson.deltakere, a.mattson.vurdering, ids) : null;
  const kolonner = [...ids, RESTEN];
  const res = (id: string) => (id === RESTEN ? r?.restRegion : r?.regioner.find((x) => x.id === id));

  return (
    <div className="fane">
      <p className="dempet">
        Regioner er områder med tilnærmet lik POA, f.eks. et dalføre, et skogsområde eller et fjellplatå (veileder 7.5). Til sammen bør de dekke
        søksområdet, og det bør ikke være mer enn 20–30. POA fordeles med <b>Mattson konsensus</b>: hver i ILKO fordeler poeng (eller prosent) på
        regionene og «resten» utenfor, og snittet blir regionens POA. Modellen bestemmer fordelingen inne i hver region.
      </p>
      <div className="knapperad">
        <button
          type="button"
          className="knapp hoved"
          disabled={!a.ipp}
          onClick={() => {
            set({ modus: { type: 'region' }, redigererTeig: null });
            useStore.getState().melding('Klikk hjørnene i regionen. Dobbeltklikk eller klikk første hjørne for å avslutte.', 'info');
          }}
        >
          Tegn region
        </button>
      </div>
      {a.regioner.length > MAKS_REGIONER && <Advarsel>Det er {a.regioner.length} regioner. Veilederen anbefaler maks 20–30.</Advarsel>}
      {!a.regioner.length && <p className="dempet">Ingen regioner ennå.</p>}

      {a.regioner.length > 0 && (
        <>
          <h3>Regioner</h3>
          <ul className="liste">
            {a.regioner.map((reg) => {
              const x = res(reg.id);
              return (
                <li key={reg.id}>
                  <div className="linje">
                    <b>{reg.id}</b>
                    <input
                      className="kort-input"
                      aria-label={`Navn på ${reg.id}`}
                      value={reg.navn}
                      placeholder="Navn (f.eks. Visdalen)"
                      onChange={(e) =>
                        endre((y) => {
                          const z = y.regioner.find((q) => q.id === reg.id);
                          if (z) z.navn = e.target.value;
                        })
                      }
                    />
                    <span className="knapperad">
                      <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: reg.ring })}>
                        Vis
                      </button>
                      <button
                        type="button"
                        className="knapp liten"
                        onClick={async () => {
                          const ok = await useStore.getState().bekreft({ tittel: `Slette ${reg.id}?`, tekst: 'Regionen og vurderingene av den slettes.', ja: 'Slett', nei: 'Avbryt', fare: true });
                          if (ok) slettRegion(reg.id);
                        }}
                      >
                        Slett
                      </button>
                    </span>
                  </div>
                  <div className="dempet liten-tekst">
                    {fmtKm2(areaM2(reg.ring) / 1e6)}
                    {x && ` · modell ${prosent(x.modell)} · POA før søk ${prosent(x.poaFor)} · POA nå ${prosent(x.poaNa)}`}
                  </div>
                </li>
              );
            })}
          </ul>

          <h3>Mattson konsensus</h3>
          <div className="rad">
            <input className="bred" value={nyDeltaker} onChange={(e) => setNyDeltaker(e.target.value)} placeholder="Navn/rolle, f.eks. Innsatsleder" aria-label="Ny deltaker" />
            <button
              type="button"
              className="knapp"
              onClick={() => {
                leggTilDeltaker(nyDeltaker);
                setNyDeltaker('');
              }}
            >
              Legg til deltaker
            </button>
          </div>
          {a.mattson.deltakere.length > 0 && (
            <div className="tabellramme">
              <table className="stat mattson">
                <thead>
                  <tr>
                    <th>Deltaker</th>
                    {kolonner.map((c) => (
                      <th key={c}>{c === RESTEN ? 'Resten' : c}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {a.mattson.deltakere.map((d) => (
                    <tr key={d.id}>
                      <th scope="row">{d.navn}</th>
                      {kolonner.map((c) => (
                        <td key={c}>
                          <input
                            type="number"
                            min={0}
                            step={5}
                            aria-label={`${d.navn} ${c}`}
                            value={a.mattson.vurdering[d.id]?.[c] ?? ''}
                            onChange={(e) => settVurdering(d.id, c, Number(e.target.value) || 0)}
                            onBlur={() => endre(() => {}, `Mattson: ${d.navn} har vurdert regionene`)}
                          />
                          {k?.perDeltaker[d.id] && <div className="liten-tekst dempet">{prosent(k.perDeltaker[d.id][c], 0)}</div>}
                        </td>
                      ))}
                      <td>
                        <button type="button" className="knapp liten" aria-label={`Fjern ${d.navn}`} onClick={() => slettDeltaker(d.id)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Konsensus</th>
                    {kolonner.map((c) => (
                      <td key={c}>
                        <b>{k ? prosent(k.andeler[c]) : '–'}</b>
                      </td>
                    ))}
                    <td />
                  </tr>
                  {r && (
                    <tr className="dempet">
                      <th scope="row">Modellen</th>
                      {kolonner.map((c) => (
                        <td key={c}>{res(c) ? prosent(res(c)!.modell) : '–'}</td>
                      ))}
                      <td />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
          {k ? (
            <Advarsel type="info">
              Konsensus fra {k.antall} {k.antall === 1 ? 'deltaker' : 'deltakere'} styrer nå sannsynlighetskartet. Fjern vurderingene for å gå tilbake
              til modellen.
            </Advarsel>
          ) : (
            <p className="liten-tekst dempet">Uten vurderinger brukes modellens fordeling (raden «Modellen»).</p>
          )}
        </>
      )}
    </div>
  );
}

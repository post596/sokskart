import { useEffect, useRef, useState } from 'react';
import { lokalTid, type PunktType } from '../../domain/aksjon';
import type { Observasjonsklasse } from '../../data/modellantakelser';
import { harKlasse, hentPunktUtkast, leggTilPunkt, PUNKTNAVN, settPunktSjekket, settPunktUtkast, slettPunkt } from '../../state/handlinger';
import { useStore } from '../../state/store';
import { Utm, VisKnapp } from '../felles';
import { KLASSER } from '../NyttPunkt';
import { Poiforslag } from '../Poiforslag';
import { fmtTid } from '../format';

export function PunkterFane() {
  const a = useStore((s) => s.aksjon);
  const egen = useStore((s) => s.egenposisjon);
  const valgt = useStore((s) => s.valgt);
  const [u, setU] = useState(() => ({ ...hentPunktUtkast(), tid: hentPunktUtkast().tid || lokalTid() }));
  useEffect(() => settPunktUtkast(u), [u]);
  const listeRef = useRef<HTMLUListElement>(null);
  const valgtId = valgt?.type === 'punkt' ? valgt.id : null;
  useEffect(() => {
    if (valgtId) listeRef.current?.querySelector(`[data-id="${CSS.escape(valgtId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [valgtId]);

  return (
    <div className="fane">
      <p className="dempet">
        Observasjoner, etterretning og funn vekter sannsynlighetskartet. <b>Bare sikre og sannsynlige observasjoner og funn skal normalt føre til
        omprioritering</b> – IPP flyttes ikke. Sperreposter og reflekser vises i plankartet, observasjoner og funn i etterretningskartet.
      </p>
      <p className="liten-tekst dempet">
        Raskere i felt: <b>høyreklikk</b> eller <b>hold fingeren</b> på kartet, eller trykk «+ Punkt». Trykk på et punkt eller en ledelinje i kartet for å
        merke det som ferdig sjekket.
      </p>
      <div className="rad">
        <label>
          Type
          <select value={u.type} onChange={(e) => setU({ ...u, type: e.target.value as PunktType })}>
            {(Object.keys(PUNKTNAVN) as PunktType[]).map((t) => (
              <option key={t} value={t}>
                {PUNKTNAVN[t]}
              </option>
            ))}
          </select>
        </label>
        {harKlasse(u.type) && (
          <label>
            Klassifisering
            <select value={u.klasse} onChange={(e) => setU({ ...u, klasse: e.target.value as Observasjonsklasse })}>
              {KLASSER.map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="rad">
        <label className="bred">
          Tidspunkt
          <input type="datetime-local" value={u.tid} onChange={(e) => setU({ ...u, tid: e.target.value })} />
        </label>
        <button type="button" className="knapp" onClick={() => setU({ ...u, tid: lokalTid() })}>
          Nå
        </button>
      </div>
      <label>
        Beskrivelse / kilde
        <input value={u.tekst} onChange={(e) => setU({ ...u, tekst: e.target.value })} placeholder="Hvem, hva, hvordan verifisert, kontaktinfo til kilden" />
      </label>
      <div className="knapperad">
        <button type="button" className="knapp hoved" disabled={!a.ipp} onClick={() => useStore.getState().set({ modus: { type: 'punkt' } })}>
          Plasser i kart
        </button>
        <button
          type="button"
          className="knapp"
          disabled={!egen}
          title={egen ? '' : 'Slå på «Min posisjon» i kartet først'}
          onClick={() => {
            if (!egen) return;
            const id = leggTilPunkt(egen.pos, u);
            useStore.getState().melding(`${id} lagt til på min posisjon.`, 'ok');
            setU({ ...u, tekst: '', tid: lokalTid() });
          }}
        >
          Bruk min posisjon
        </button>
      </div>
      <Poiforslag />
      <ul className="liste" ref={listeRef}>
        {a.punkter
          .slice()
          .reverse()
          .map((p) => (
            <li key={p.id} data-id={p.id} className={valgtId === p.id ? 'valgt' : p.sjekket ? 'sjekket' : ''}>
              <div className="linje">
                <b>
                  {p.sjekket && '✓ '}
                  {p.id} · {PUNKTNAVN[p.type]}
                  {harKlasse(p.type) && ` (${p.klasse})`}
                </b>
                <span className="knapperad">
                  <VisKnapp pos={p.pos} zoom={15} />
                  {p.type !== 'sp' && (
                    <button
                      type="button"
                      className={`knapp liten ${p.sjekket ? '' : 'hoved'}`}
                      title={p.sjekket ? 'Fjern merket «ferdig sjekket»' : 'Merk som ferdig sjekket – senker sannsynligheten rundt punktet'}
                      onClick={() => settPunktSjekket(p.id, !p.sjekket)}
                    >
                      {p.sjekket ? 'Angre sjekket' : 'Sjekket'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="knapp liten"
                    title="Lag 5-punktsordre (oppdrag til mannskapet) for dette punktet"
                    onClick={() => useStore.getState().set({ ordreFor: { type: 'punkt', id: p.id } })}
                  >
                    5-punktsordre
                  </button>
                  <button
                    type="button"
                    className="knapp liten"
                    onClick={async () => {
                      const ok = await useStore.getState().bekreft({ tittel: `Slette ${p.id}?`, tekst: 'Punktet slettes fra aksjonen.', ja: 'Slett', nei: 'Avbryt', fare: true });
                      if (ok) slettPunkt(p.id);
                    }}
                  >
                    Slett
                  </button>
                </span>
              </div>
              <Utm pos={p.pos} sone={a.sone} />
              <div className="dempet liten-tekst">
                {fmtTid(p.tid)}
                {p.sjekket && ` · ferdig sjekket ${fmtTid(p.sjekket.tid)}${p.sjekket.av ? ` av ${p.sjekket.av}` : ''}`}
              </div>
              {p.tekst && <div className="liten-tekst">{p.tekst}</div>}
              {p.begrunnelse && (
                <details className="grunnlag">
                  <summary>Hvorfor foreslått</summary>
                  <ul>
                    <li>{p.begrunnelse.tekst}</li>
                    {p.begrunnelse.vurder && (
                      <li>
                        <b>Vurder:</b> {p.begrunnelse.vurder}
                      </li>
                    )}
                  </ul>
                </details>
              )}
            </li>
          ))}
      </ul>
      {!a.punkter.length && <p className="dempet">Ingen punkter ennå.</p>}
    </div>
  );
}

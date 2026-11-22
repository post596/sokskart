import { useEffect, useState } from 'react';
import { lokalTid, type PunktType } from '../../domain/aksjon';
import type { Observasjonsklasse } from '../../data/modellantakelser';
import { hentPunktUtkast, leggTilPunkt, PUNKTNAVN, settPunktUtkast, slettPunkt } from '../../state/handlinger';
import { useStore } from '../../state/store';
import { Utm, VisKnapp } from '../felles';
import { Poiforslag } from '../Poiforslag';
import { fmtTid } from '../format';

const KLASSER: Array<[Observasjonsklasse, string]> = [
  ['sikker', 'Sikker – sett av nær familie, nabo, kollega, god venn eller kamera'],
  ['sannsynlig', 'Sannsynlig – kan stemme med beskrivelsen'],
  ['mulig', 'Mulig – ikke spesifikk nok til å omprioritere'],
  ['usikker', 'Usikker – vag beskrivelse, kan ikke bekreftes'],
];

export function PunkterFane() {
  const a = useStore((s) => s.aksjon);
  const egen = useStore((s) => s.egenposisjon);
  const [u, setU] = useState(() => ({ ...hentPunktUtkast(), tid: hentPunktUtkast().tid || lokalTid() }));
  useEffect(() => settPunktUtkast(u), [u]);

  return (
    <div className="fane">
      <p className="dempet">
        Observasjoner, spor og funn vekter sannsynlighetskartet. <b>Bare sikre og sannsynlige observasjoner skal normalt føre til omprioritering</b> – IPP
        flyttes ikke. Sperreposter og reflekser vises i plankartet, observasjoner og funn i etterretningskartet.
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
        {u.type === 'obs' && (
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
      <ul className="liste">
        {a.punkter
          .slice()
          .reverse()
          .map((p) => (
            <li key={p.id}>
              <div className="linje">
                <b>
                  {p.id} · {PUNKTNAVN[p.type]}
                  {p.type === 'obs' && ` (${p.klasse})`}
                </b>
                <span className="knapperad">
                  <VisKnapp pos={p.pos} zoom={15} />
                  {(p.type === 'sp' || p.type === 'poi') && (
                    <button type="button" className="knapp liten" onClick={() => useStore.getState().set({ ordreFor: { type: 'punkt', id: p.id } })}>
                      Ordre
                    </button>
                  )}
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
              <div className="dempet liten-tekst">{fmtTid(p.tid)}</div>
              {p.tekst && <div className="liten-tekst">{p.tekst}</div>}
            </li>
          ))}
      </ul>
      {!a.punkter.length && <p className="dempet">Ingen punkter ennå.</p>}
    </div>
  );
}

import { useState } from 'react';
import { lokalTid, teigAkkPod, type Teig } from '../../domain/aksjon';
import { areaM2 } from '../../domain/geo';
import { oppdragsnavn, ORGANISASJONER, RESSURSTYPER } from '../../domain/naming';
import { POD_SKALA, podBetegnelse, prosent, TEIGFARGE_TEKST, TEIGFARGER, teigfarge, type Teigfarge } from '../../domain/pod';
import { registrerSok, settTeigStatus, slettSok, slettTeig } from '../../state/handlinger';
import { useStore } from '../../state/store';
import { fmtKm2, fmtTid, lesProsent } from '../format';

const TYPENAVN = { T: 'Teig', H: 'Helikoptersøk', D: 'Droneområde' } as const;

function SokSkjema({ teig }: { teig: Teig }) {
  const [org, setOrg] = useState('NFS');
  const [type, setType] = useState('Msk');
  const [enhet, setEnhet] = useState('');
  const [podValg, setPodValg] = useState('0.6');
  const [podEgen, setPodEgen] = useState('');
  const [tid, setTid] = useState(lokalTid());
  const pod = podValg === 'egen' ? lesProsent(podEgen) : Number(podValg);
  return (
    <form
      className="sokskjema"
      onSubmit={(e) => {
        e.preventDefault();
        if (pod == null) {
          useStore.getState().melding('Skriv POD som prosent, f.eks. 60.', 'feil');
          return;
        }
        registrerSok(teig.id, { tid, pod, org, ressurstype: type, enhet: enhet.trim(), merknad: '' });
        useStore.getState().melding(`Søk registrert i ${teig.id}.`, 'ok');
        setEnhet('');
      }}
    >
      <div className="rad">
        <label>
          Etat/org.
          <select value={org} onChange={(e) => setOrg(e.target.value)}>
            {ORGANISASJONER.map(([k, v]) => (
              <option key={k} value={k}>
                {k} – {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type ressurs
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(RESSURSTYPER).map(([k, v]) => (
              <option key={k} value={k}>
                {k} – {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Id
          <input value={enhet} onChange={(e) => setEnhet(e.target.value)} placeholder="21" />
        </label>
      </div>
      <div className="rad">
        <label>
          POD
          <select value={podValg} onChange={(e) => setPodValg(e.target.value)}>
            {POD_SKALA.map((k) => (
              <option key={k.betegnelse} value={String(k.standard)}>
                {k.betegnelse} ({prosent(k.standard, 0)})
              </option>
            ))}
            <option value="egen">Egen verdi …</option>
          </select>
        </label>
        {podValg === 'egen' && (
          <label>
            POD (%)
            <input inputMode="decimal" value={podEgen} onChange={(e) => setPodEgen(e.target.value)} placeholder="60" />
          </label>
        )}
        <label>
          Ferdig søkt
          <input type="datetime-local" value={tid} onChange={(e) => setTid(e.target.value)} />
        </label>
      </div>
      <div className="linje">
        <span className="dempet liten-tekst">Oppdrag: {oppdragsnavn(teig.id, org, type, enhet)}</span>
        <button type="submit" className="knapp hoved">
          Registrer søk
        </button>
      </div>
    </form>
  );
}

export function TeigerFane() {
  const a = useStore((s) => s.aksjon);
  const r = useStore((s) => s.resultat);
  const valgt = useStore((s) => s.valgtTeig);
  const red = useStore((s) => s.redigererTeig);
  const set = useStore((s) => s.set);
  const [ressurs, setRessurs] = useState<Record<string, string>>({});

  const tegn = (avgrensning: 'T' | 'H' | 'D') => {
    set({ modus: { type: 'teig', avgrensning }, redigererTeig: null });
    useStore.getState().melding('Klikk hjørnene i kartet. Dobbeltklikk eller klikk på første hjørne for å avslutte.', 'info');
  };

  return (
    <div className="fane">
      <p className="dempet">
        Tegn teiger (typisk 0,2–0,5 km², naturlig avgrenset langs ledelinjer). Alle aktører må bruke samme teigsett. POS = POA × POD, akkumulert POD =
        1 − (1 − POD₁)(1 − POD₂)…
      </p>
      <div className="knapperad">
        <button type="button" className="knapp hoved" disabled={!a.ipp} onClick={() => tegn('T')}>
          Tegn ny teig
        </button>
        <button type="button" className="knapp" disabled={!a.ipp} onClick={() => tegn('H')}>
          Helikoptersøk (H)
        </button>
        <button type="button" className="knapp" disabled={!a.ipp} onClick={() => tegn('D')}>
          Droneområde (D)
        </button>
      </div>
      <div className="forklaring">
        {(Object.keys(TEIGFARGER) as Teigfarge[]).map((f) => (
          <span key={f}>
            <i className="farge" style={{ background: TEIGFARGER[f] }} /> {TEIGFARGE_TEKST[f]}
          </span>
        ))}
      </div>
      {!a.teiger.length && <p className="dempet">Ingen teiger ennå.</p>}
      <ul className="liste">
        {a.teiger
          .slice()
          .reverse()
          .map((t) => {
            const st = r?.teiger.find((x) => x.id === t.id);
            const akk = teigAkkPod(t);
            const f = teigfarge(t.status, t.sok.map((s) => s.pod));
            const areal = areaM2(t.ring) / 1e6;
            const apen = valgt === t.id;
            return (
              <li key={t.id} className={apen ? 'valgt' : ''}>
                <div className="linje">
                  <button type="button" className="lenkeknapp" onClick={() => set({ valgtTeig: apen ? null : t.id })} aria-expanded={apen}>
                    <i className="farge" style={{ background: TEIGFARGER[f] }} /> <b>{t.id}</b> <span className="dempet">{TYPENAVN[t.type]}</span>
                  </button>
                  <span className="knapperad">
                    <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: t.ring })}>
                      Vis
                    </button>
                    <button
                      type="button"
                      className={`knapp liten ${red === t.id ? 'hoved' : ''}`}
                      onClick={() => set({ redigererTeig: red === t.id ? null : t.id, valgtTeig: t.id, modus: null })}
                    >
                      {red === t.id ? 'Ferdig' : 'Rediger'}
                    </button>
                    <button
                      type="button"
                      className="knapp liten"
                      onClick={async () => {
                        const ok = await useStore.getState().bekreft({ tittel: `Slette ${t.id}?`, tekst: 'Teigen og registrerte søk i den slettes.', ja: 'Slett', nei: 'Avbryt', fare: true });
                        if (ok) slettTeig(t.id);
                      }}
                    >
                      Slett
                    </button>
                  </span>
                </div>
                <div className="dempet liten-tekst">
                  {fmtKm2(areal)}
                  {(areal < 0.2 || areal > 0.5) && t.type === 'T' && <span title="Typisk teigstørrelse er 0,2–0,5 km²"> (utenfor 0,2–0,5)</span>} · POA nå{' '}
                  {st ? prosent(st.poaNa) : '–'}
                  {st && t.sok.length > 0 && ` (før søk ${prosent(st.poaFor)})`} · akk. POD {prosent(akk, 0)} ({podBetegnelse(akk)}) · {t.sok.length} søk
                </div>
                {apen && (
                  <div className="teigdetaljer">
                    <div className="rad">
                      <label>
                        Status
                        <select
                          value={t.status}
                          onChange={(e) => settTeigStatus(t.id, e.target.value as 'planlagt' | 'utdelt', ressurs[t.id] ?? t.utdelt?.ressurs ?? '')}
                        >
                          <option value="planlagt">Planlagt (blå)</option>
                          <option value="utdelt">Utdelt og startet (rød)</option>
                        </select>
                      </label>
                      <label>
                        Ressurs (org–type–id)
                        <input
                          value={ressurs[t.id] ?? t.utdelt?.ressurs ?? ''}
                          onChange={(e) => setRessurs({ ...ressurs, [t.id]: e.target.value })}
                          onBlur={() => t.status === 'utdelt' && settTeigStatus(t.id, 'utdelt', ressurs[t.id] ?? '')}
                          placeholder="NFS–Msk–21"
                        />
                      </label>
                    </div>
                    {t.utdelt && (
                      <p className="liten-tekst dempet">
                        Utdelt {fmtTid(t.utdelt.tid)}
                        {t.utdelt.ressurs && ` til ${t.utdelt.ressurs}`}
                      </p>
                    )}
                    {t.sok.length > 0 && (
                      <ul className="soklist">
                        {t.sok.map((s) => (
                          <li key={s.id}>
                            <span>
                              {oppdragsnavn(t.id, s.org, s.ressurstype, s.enhet)} · POD {prosent(s.pod, 0)} ({podBetegnelse(s.pod)}) · {fmtTid(s.tid)}
                            </span>
                            <button type="button" className="knapp liten" onClick={() => slettSok(t.id, s.id)} aria-label="Slett søk">
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <SokSkjema teig={t} />
                  </div>
                )}
              </li>
            );
          })}
      </ul>
    </div>
  );
}

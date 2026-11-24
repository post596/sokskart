import { useRef, useState } from 'react';
import { lokalTid, teigAkkPod, type Spor, type Teig } from '../../domain/aksjon';
import { areaM2 } from '../../domain/geo';
import { kvalitetssikring, KRAV_R50, KRAV_R75 } from '../../domain/kvalitet';
import { oppdragsnavn, ORGANISASJONER, RESSURSTYPER } from '../../domain/naming';
import { POD_SKALA, podBetegnelse, prosent, TEIGFARGE_TEKST, TEIGFARGER, teigfarge, type Teigfarge } from '../../domain/pod';
import { forenkle, lesGpx, ressursFraKode, tolkSporloggnavn } from '../../domain/sporimport';
import { computeZone, toUtm } from '../../domain/utm';
import { SPORRESSURSER, type SporRessurs } from '../../data/modellantakelser';
import { mixRinger } from '../../state/beregning';
import { dekningForTeig, type TeigDekning } from '../../state/dekning';
import { endreSpor, leggTilSpor, registrerSok, settTeigStatus, slettSok, slettSpor, slettTeig } from '../../state/handlinger';
import { useStore } from '../../state/store';
import { Advarsel, Modellmerke } from '../felles';
import { Teigforslag } from '../Teigforslag';
import { Grunnlag } from '../Grunnlag';
import { fmtAvstand, fmtFlytid, fmtKm2, fmtTid, fmtTimer, lesProsent } from '../format';
import { droneFlytid } from '../../model/soketid';

const TYPENAVN = { T: 'Teig', H: 'Helikoptersøk', D: 'Droneområde' } as const;

function SokSkjema({ teig, dekning }: { teig: Teig; dekning: TeigDekning | null }) {
  const [org, setOrg] = useState('NFS');
  const [type, setType] = useState('Msk');
  const [enhet, setEnhet] = useState('');
  const [podValg, setPodValg] = useState('0.6');
  const [podEgen, setPodEgen] = useState('');
  const [tid, setTid] = useState(lokalTid());
  const [spor, setSpor] = useState<string[]>([]);
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
        registrerSok(teig.id, { tid, pod, org, ressurstype: type, enhet: enhet.trim(), merknad: spor.length ? 'POD foreslått fra GPS-spor' : '', spor });
        useStore.getState().melding(`Søk registrert i ${teig.id}.`, 'ok');
        setEnhet('');
        setSpor([]);
      }}
    >
      {dekning && (
        <div className="dekning">
          <div>
            <b>GPS-spor i teigen:</b>{' '}
            {dekning.bidrag
              .map((b) => `${SPORRESSURSER.find((r) => r.type === b.spor.ressurs)?.navn ?? b.spor.ressurs} ${fmtAvstand(b.lengde)} (${b.bredde} m)`)
              .join(', ')}
          </div>
          <div>
            Dekning C = {dekning.C.toFixed(2).replace('.', ',')} → foreslått POD <b>{prosent(dekning.pod, 0)}</b> ({podBetegnelse(dekning.pod)}) <Modellmerke />
          </div>
          <button
            type="button"
            className="knapp liten"
            onClick={() => {
              setPodValg('egen');
              setPodEgen(String(Math.round(dekning.pod * 100)));
              setSpor(dekning.bidrag.map((b) => b.sporId));
              const s = dekning.bidrag[0].spor;
              const kode = SPORRESSURSER.find((r) => r.type === s.ressurs)?.kode;
              if (s.org) setOrg(s.org);
              if (kode && RESSURSTYPER[kode]) setType(kode);
              if (s.enhet) setEnhet(s.enhet);
              if (s.tid) setTid(lokalTid(new Date(s.tid)));
            }}
          >
            Bruk foreslått POD (kan justeres)
          </button>
        </div>
      )}
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
        <span className="dempet liten-tekst">
          Oppdrag: {oppdragsnavn(teig.id, org, type, enhet)}
          {spor.length > 0 && ` · bygger på ${spor.length} spor`}
        </span>
        <button type="submit" className="knapp hoved">
          Registrer søk
        </button>
      </div>
    </form>
  );
}

function Sporimport() {
  const a = useStore((s) => s.aksjon);
  const filRef = useRef<HTMLInputElement>(null);
  const importer = async (filer: FileList) => {
    const zone = a.ipp ? computeZone(a.ipp.lat, a.ipp.lng, a.sone) : 32;
    let n = 0;
    for (const f of Array.from(filer)) {
      const raa = lesGpx(await f.text());
      if (!raa.length) {
        useStore.getState().melding(`Fant ingen spor i ${f.name}.`, 'feil');
        continue;
      }
      const nye: Array<Omit<Spor, 'id' | 'importert'>> = raa.map((s) => {
        const navn = tolkSporloggnavn(s.navn);
        const pts = forenkle(s.pts, (p) => {
          const u = toUtm(p.lat, p.lng, zone);
          return [u.e, u.n];
        }, 3);
        const sisteTid = [...s.pts].reverse().find((p) => p.tid)?.tid ?? null;
        return {
          navn: s.navn || f.name,
          ressurs: (navn && ressursFraKode(navn.type)) || 'fotmannskap',
          org: navn?.org ?? '',
          enhet: navn?.id ?? '',
          avgrensning: navn?.avgrensning ?? '',
          pts: pts.map((p) => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })),
          tid: sisteTid,
        };
      });
      leggTilSpor(nye, f.name);
      n += nye.length;
    }
    if (n) useStore.getState().melding(`${n} spor importert. Kontroller ressurstypen – den styrer søkebredde og farge.`, 'ok');
  };
  return (
    <section>
      <h3>GPS-spor (resultatkart)</h3>
      <p className="liten-tekst dempet">
        Importer GPX fra mannskap, hund, drone og helikopter. Navn etter veilederen («T005–281345–RK–Drone–71») tolkes automatisk. Dekning C =
        søkebredde × lengde i teigen / areal, og foreslått POD = 1 − e<sup>−C</sup>. Søkebredder kan endres under Statistikk.
      </p>
      <div className="knapperad">
        <button type="button" className="knapp" onClick={() => filRef.current?.click()}>
          Importer GPX-spor
        </button>
        <input
          ref={filRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          multiple
          hidden
          onChange={async (e) => {
            const f = e.target.files;
            if (f?.length) await importer(f);
            e.target.value = '';
          }}
        />
      </div>
      {a.spor.length > 0 && (
        <ul className="liste">
          {a.spor.map((s) => (
            <li key={s.id}>
              <div className="linje">
                <b>
                  <i className="farge" style={{ background: SPORRESSURSER.find((r) => r.type === s.ressurs)?.farge }} /> {s.navn}
                </b>
                <span className="knapperad">
                  <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: s.pts })}>
                    Vis
                  </button>
                  <button type="button" className="knapp liten" onClick={() => slettSpor(s.id)}>
                    Slett
                  </button>
                </span>
              </div>
              <div className="rad">
                <label>
                  Ressurs
                  <select
                    value={s.ressurs}
                    onChange={(e) => endreSpor(s.id, (x) => void (x.ressurs = e.target.value as SporRessurs), `Spor «${s.navn}»: ressurstype satt til ${e.target.value}`)}
                  >
                    {SPORRESSURSER.map((r) => (
                      <option key={r.type} value={r.type}>
                        {r.navn}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Avgrensning
                  <input value={s.avgrensning} placeholder="T005" onChange={(e) => endreSpor(s.id, (x) => void (x.avgrensning = e.target.value.toUpperCase()))} />
                </label>
              </div>
              <div className="dempet liten-tekst">
                {s.pts.length} punkter{s.tid ? ` · ferdig ${fmtTid(s.tid)}` : ''}
                {s.org && ` · ${[s.org, s.enhet].filter(Boolean).join('–')}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Kvalitetssikring() {
  const a = useStore((s) => s.aksjon);
  const r = useStore((s) => s.resultat);
  const vis = useStore((s) => s.visKvalitet);
  const set = useStore((s) => s.set);
  if (!a.ipp || !a.teiger.length) return null;
  const R = r?.ringer ?? mixRinger();
  if (!R) return null;
  const zone = computeZone(a.ipp.lat, a.ipp.lng, a.sone);
  const xy = (p: { lat: number; lng: number }): [number, number] => {
    const u = toUtm(p.lat, p.lng, zone);
    return [u.e, u.n];
  };
  const rap = kvalitetssikring(
    a.teiger.map((t) => ({ id: t.id, ring: t.ring.map(xy), akkPod: teigAkkPod(t), poa: r?.teiger.find((x) => x.id === t.id)?.poaNa ?? 0 })),
    xy(a.ipp),
    R[1],
    R[2],
  );
  return (
    <section className="boks">
      <h3>Kvalitetssikring (veileder 7.5.2)</h3>
      <p className="liten-tekst">
        Krav ved avslutning uten funn: teiger som berører R50, skal ha POD over {prosent(KRAV_R50, 0)}, og teiger som berører R75, minst normal høy
        POD ({prosent(KRAV_R75, 0)}).
      </p>
      {rap.alleOppfylt ? (
        <p>
          <b>Alle teiger innenfor R75 oppfyller kravet.</b>
        </p>
      ) : (
        <ul className="ks-liste">
          {rap.ikkeOppfylt.map((t) => (
            <li key={t.id}>
              <button type="button" className="lenkeknapp" onClick={() => set({ valgtTeig: t.id })}>
                <b>{t.id}</b>
              </button>{' '}
              {t.iR50 ? 'berører R50' : 'berører R75'}: akk. POD {prosent(t.akkPod, 0)}, krav {t.iR50 ? '>' : '≥'} {prosent(t.krav!, 0)}
            </li>
          ))}
        </ul>
      )}
      {rap.hoyPoa.length > 0 && (
        <p className="liten-tekst">
          Markert høyere gjenstående POA: {rap.hoyPoa.map((t) => `${t.id} (${prosent(t.poa)})`).join(', ')} – vurder nytt søk. <Modellmerke />
        </p>
      )}
      {r && <p className="liten-tekst">POA nå utenfor alle teiger: {prosent(r.utenforTeiger)}.</p>}
      <label className="avkryss">
        <input type="checkbox" checked={vis} onChange={(e) => set({ visKvalitet: e.target.checked })} />
        Marker teiger som ikke oppfyller kravet i kartet
      </label>
    </section>
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
        Tegn teiger naturlig avgrenset langs ledelinjer (maks {String(a.modell.maksTeigKm2).replace('.', ',')} km² og {fmtTimer(a.modell.maksSoketid)} søk
        per teig). Alle aktører må bruke samme teigsett. POS = POA × POD, akkumulert POD = 1 − (1 − POD₁)(1 − POD₂)…
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
      <Teigforslag />
      <Kvalitetssikring />
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
            const dekning = apen ? dekningForTeig(t, a.spor, a.modell.sokebredde, a.sone) : null;
            return (
              <li key={t.id} className={apen ? 'valgt' : ''}>
                <div className="linje">
                  <button type="button" className="lenkeknapp" onClick={() => set({ valgtTeig: apen ? null : t.id })} aria-expanded={apen}>
                    <i className="farge" style={{ background: TEIGFARGER[f] }} /> <b>{t.id}</b>{' '}
                    <span className="dempet">{TYPENAVN[t.type]}</span>
                  </button>
                  <span className="knapperad">
                    <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: t.ring })}>
                      Vis
                    </button>
                    <button
                      type="button"
                      className="knapp liten"
                      title="Lag 5-punktsordre (oppdrag til mannskapet) for denne teigen"
                      onClick={() => set({ ordreFor: { type: 'teig', id: t.id } })}
                    >
                      5-punktsordre
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
                  {t.type === 'T' && areal > a.modell.maksTeigKm2 && <span className="feiltekst"> (over {String(a.modell.maksTeigKm2).replace('.', ',')} km²)</span>}
                  {st && t.type === 'T' && <> · ca. {fmtTimer(st.timer)} søk{st.timer > a.modell.maksSoketid && <span className="feiltekst"> (over {fmtTimer(a.modell.maksSoketid)})</span>}</>}
                  {t.type === 'D' && <> · {fmtFlytid(droneFlytid(areal, a.modell))}</>} · POA nå{' '}
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
                              {s.spor?.length ? ` · ${s.spor.length} spor` : ''}
                            </span>
                            <button type="button" className="knapp liten" onClick={() => slettSok(t.id, s.id)} aria-label="Slett søk">
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {t.grunnlag && <Grunnlag g={t.grunnlag} tittel="Hvorfor teigen ble foreslått" />}
                    <SokSkjema key={t.id} teig={t} dekning={dekning} />
                  </div>
                )}
              </li>
            );
          })}
      </ul>
      {!a.ipp && <Advarsel type="info">Sett IPP først.</Advarsel>}
      <Sporimport />
    </div>
  );
}

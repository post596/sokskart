import { useEffect, useRef } from 'react';
import { prosent } from '../../domain/pod';
import { settLinjeSjekket } from '../../state/handlinger';
import { LINJETYPE_FARGE, LINJETYPE_NAVN, type LinjeType } from '../../model/typer';
import { useStore } from '../../state/store';
import { Advarsel } from '../felles';
import { fmtAvstand, fmtTid, fmtTimer } from '../format';
import { hentStier } from './AksjonFane';
import { stisokAnbefaling, valgteKategorier } from '../../data/stisok';
import { Stisok } from '../Stisok';
import { lastNedLinjer } from '../linjeeksport';

export function LedelinjerFane() {
  const a = useStore((s) => s.aksjon);
  const osm = useStore((s) => s.osm);
  const r = useStore((s) => s.resultat);
  const status = useStore((s) => s.osmStatus);
  const valgt = useStore((s) => s.valgt);
  const K = a.modell.antallLedelinjer;
  const valgtId = valgt?.type === 'linje' ? valgt.id : null;
  const listeRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (valgtId) listeRef.current?.querySelector(`[data-id="${CSS.escape(valgtId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [valgtId]);
  const sjekkede = Object.entries(a.linjestatus);
  const kat = valgteKategorier(a.kategorier);
  const strava = useStore((s) => s.visning.strava);
  const turfolk = kat.some((k) => k === 'turgaer' || k === 'jeger' || k === 'plukker' || k === 'fisker');

  return (
    <div className="fane">
      <p className="dempet">
        Eikene i sykkelhjulet: stier, veier, elver, bekker, grøfter og kraftgater fra OpenStreetMap, og merkede ruter fra Turrutebasen
        (Kartverket). Rangert etter hvor mye sannsynlighet linja går
        gjennom. <b>Søk ledelinjer helt ut – også forbi R95 når tid og scenario tilsier det.</b> L-nummeret beholdes selv om rekkefølgen endres.
      </p>
      <p className="liten-tekst dempet">
        Hver linje får anbefalt ressurs og metode for stisøk (veileder 6.3). Ressursstatus føres i FAKS. I mørke er hund og drone med
        varmekamera lite påvirket, mens mannskapssøk bør gjentas i dagslys.
      </p>
      <div className="knapperad">
        <button type="button" className="knapp hoved" disabled={!a.ipp || status.henter} onClick={() => void hentStier()}>
          {status.henter ? 'Henter …' : osm ? 'Hent på nytt' : 'Hent stier og veier'}
        </button>
      </div>
      {status.feil && <Advarsel type="feil">{status.feil}</Advarsel>}
      {status.merknad && <Advarsel type="info">{status.merknad}</Advarsel>}
      {!osm && !status.henter && (
        <Advarsel type="info">Ingen ledelinjer hentet ennå. Sett IPP og trykk «Hent stier og veier» (krever nett). Resultatet lagres i aksjonen.</Advarsel>
      )}
      {osm && (
        <p className="liten-tekst dempet">
          {osm.linjer.length} linjer innen {fmtAvstand(osm.radiusM)} fra {osm.kilde}, hentet {fmtTid(osm.hentet)}. Mangler i OSM finnes – mannskaper kan
          oppdage ledelinjer som ikke er i kartet.
        </p>
      )}
      {osm && turfolk && !strava && (
        <Advarsel type="info">
          Turfolk følger ofte stier som brukes mye – også stier som mangler i OSM.{' '}
          <button type="button" className="knapp liten" onClick={() => useStore.getState().set({ visning: { ...useStore.getState().visning, strava: true } })}>
            Vis Strava-heatmap
          </button>
        </Advarsel>
      )}
      {osm && (
        <div className="knapperad">
          <span className="dempet liten-tekst">Alle stier og veier:</span>
          {(['kml', 'gpx'] as const).map((f) => (
            <button key={f} type="button" className="knapp liten" title="Alle hentede stier, veier, bekker og kraftgater, med mappe per type, L-nummer, status og anbefalt ressurs" onClick={() => lastNedLinjer(f, 'alle')}>
              {f.toUpperCase()}
            </button>
          ))}
          {r && (
            <>
              <span className="dempet liten-tekst">Prioriterte:</span>
              {(['kml', 'gpx'] as const).map((f) => (
                <button key={f} type="button" className="knapp liten" title="Ledelinjene med L-nummer" onClick={() => lastNedLinjer(f, 'prioriterte')}>
                  {f.toUpperCase()}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <div className="forklaring">
        {(Object.keys(LINJETYPE_NAVN) as LinjeType[]).map((t) => (
          <span key={t}>
            <i className="farge" style={{ background: LINJETYPE_FARGE[t] }} /> {LINJETYPE_NAVN[t]}
          </span>
        ))}
      </div>
      {r && osm && (
        <ol className="liste" ref={listeRef}>
          {r.linjer.slice(0, K).map((l) => {
            const ol = osm.linjer[l.i];
            const nr = a.lnummer[l.id] ?? '–';
            const st = a.linjestatus[l.id];
            return (
              <li key={l.id} data-id={l.id} className={valgtId === l.id ? 'valgt' : st ? 'sjekket' : ''}>
                <div className="linje">
                  <b>
                    <i className="farge" style={{ background: LINJETYPE_FARGE[l.type] }} /> {st && '✓ '}
                    {nr} {l.navn || LINJETYPE_NAVN[l.type]}
                  </b>
                  <span className="knapperad">
                    <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: ol.pts })}>
                      Vis
                    </button>
                    {st?.kilde !== 'spor' && (
                      <button
                        type="button"
                        className={`knapp liten ${st ? '' : 'hoved'}`}
                        title={st ? 'Fjern merket «ferdig sjekket»' : 'Merk som ferdig sjekket – senker sannsynligheten langs linja'}
                        onClick={() => settLinjeSjekket(l.id, !st)}
                      >
                        {st ? 'Angre sjekket' : 'Sjekket'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="knapp liten"
                      title="Lag 5-punktsordre (oppdrag til mannskapet) for denne ledelinja: Fra/Til i UTM, lengde, når personen kan ha nådd den, og hurtigsøk helt ut"
                      onClick={() => useStore.getState().set({ ordreFor: { type: 'linje', id: l.id } })}
                    >
                      5-punktsordre
                    </button>
                  </span>
                </div>
                <div className="dempet liten-tekst">
                  {LINJETYPE_NAVN[l.type]} · {fmtAvstand(l.lengdeM)} · {prosent(l.na)} av sannsynligheten langs linja
                  {l.for > l.na * 1.05 && ` (før søk ${prosent(l.for)})`}
                  {Number.isFinite(l.tMin) && ` · nås etter ${fmtTimer(l.tMin)}`}
                  {ol.kilde === 'turrutebasen' && ' · Turrutebasen'}
                  {st && (st.kilde === 'spor' ? ` · søkt (GPS-spor ${prosent(st.andel ?? 1, 0)})` : ` · ferdig sjekket ${fmtTid(st.tid)}${st.av ? ` av ${st.av}` : ''}`)}
                </div>
                {!st && <Stisok a={stisokAnbefaling(l.type, l.lengdeM, kat, a.modell)} />}
              </li>
            );
          })}
        </ol>
      )}
      {sjekkede.length > 0 && (
        <>
          <h3>Søkte og sjekkede ledelinjer ({sjekkede.length})</h3>
          <ul className="liste kompakt">
            {sjekkede.map(([id, st]) => (
              <li key={id} className={valgtId === id ? 'valgt' : 'sjekket'}>
                <div className="linje">
                  <span>
                    ✓ <b>{st.nr ?? LINJETYPE_NAVN[st.type]}</b> {st.navn && `«${st.navn}»`}{' '}
                    <span className="dempet liten-tekst">
                      {st.kilde === 'spor' ? `GPS-spor ${prosent(st.andel ?? 1, 0)}` : `sjekket ${fmtTid(st.tid)}${st.av ? ` av ${st.av}` : ''}`}
                    </span>
                  </span>
                  <span className="knapperad">
                    <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: st.pts })}>
                      Vis
                    </button>
                    {st.kilde === 'manuell' && (
                      <button type="button" className="knapp liten" onClick={() => settLinjeSjekket(id, false)}>
                        Angre
                      </button>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

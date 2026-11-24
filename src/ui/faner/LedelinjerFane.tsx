import { prosent } from '../../domain/pod';
import { LINJETYPE_FARGE, LINJETYPE_NAVN, type LinjeType } from '../../model/typer';
import { useStore } from '../../state/store';
import { Advarsel } from '../felles';
import { fmtAvstand, fmtTid, fmtTimer } from '../format';
import { hentStier } from './AksjonFane';

export function LedelinjerFane() {
  const a = useStore((s) => s.aksjon);
  const osm = useStore((s) => s.osm);
  const r = useStore((s) => s.resultat);
  const status = useStore((s) => s.osmStatus);
  const K = a.modell.antallLedelinjer;

  return (
    <div className="fane">
      <p className="dempet">
        Eikene i sykkelhjulet: stier, veier, elver, bekker, grøfter og kraftgater fra OpenStreetMap, og merkede ruter fra Turrutebasen
        (Kartverket). Rangert etter hvor mye sannsynlighet linja går
        gjennom. <b>Søk ledelinjer helt ut – også forbi R95 når tid og scenario tilsier det.</b> L-nummeret beholdes selv om rekkefølgen endres.
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
      <div className="forklaring">
        {(Object.keys(LINJETYPE_NAVN) as LinjeType[]).map((t) => (
          <span key={t}>
            <i className="farge" style={{ background: LINJETYPE_FARGE[t] }} /> {LINJETYPE_NAVN[t]}
          </span>
        ))}
      </div>
      {r && osm && (
        <ol className="liste">
          {r.linjer.slice(0, K).map((l) => {
            const ol = osm.linjer[l.i];
            const nr = a.lnummer[l.id] ?? '–';
            return (
              <li key={l.id}>
                <div className="linje">
                  <b>
                    <i className="farge" style={{ background: LINJETYPE_FARGE[l.type] }} /> {nr} {l.navn || LINJETYPE_NAVN[l.type]}
                  </b>
                  <span className="knapperad">
                    <button type="button" className="knapp liten" onClick={() => useStore.getState().vis({ bounds: ol.pts })}>
                      Vis
                    </button>
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
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

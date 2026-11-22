import { lokalTid } from '../domain/aksjon';
import { prosent } from '../domain/pod';
import { leggTilPunkt } from '../state/handlinger';
import { useStore } from '../state/store';
import { Modellmerke, Utm, VisKnapp } from './felles';
import { fmtAvstand, fmtTimer } from './format';
import { distanceM } from '../domain/geo';

/** Suggested points of interest for the chosen category (data/interessepunkter.ts). */
export function Poiforslag() {
  const a = useStore((s) => s.aksjon);
  const r = useStore((s) => s.resultat);
  const osm = useStore((s) => s.osm);
  if (!a.ipp || !r) return null;
  const liste = r.poiforslag.slice(0, 12);
  return (
    <section className="boks forslag">
      <h3>Foreslåtte interessepunkter</h3>
      <p className="liten-tekst">
        Steder i nærområdet som ofte er aktuelle for valgt savnetkategori, rangert etter sannsynligheten rundt punktet. Listen over punkttyper er en
        modellantakelse og bør kvalitetssikres. <Modellmerke />
      </p>
      {!osm && <p className="liten-tekst dempet">Hent stier og veier først (fanen Aksjon), så kan appen finne punkter i kartet.</p>}
      {osm && !liste.length && <p className="liten-tekst dempet">Fant ingen aktuelle punkter for kategorien innenfor beregningsområdet.</p>}
      <ol className="liste kompakt">
        {liste.map((p, i) => (
          <li key={i}>
            <div className="linje">
              <b>
                {i + 1}. {p.navn}
              </b>
              <span className="knapperad">
                <VisKnapp pos={p.pos} zoom={16} />
                <button
                  type="button"
                  className="knapp liten hoved"
                  onClick={() => {
                    const id = leggTilPunkt(p.pos, { type: 'poi', klasse: 'mulig', tid: lokalTid(), tekst: p.navn });
                    useStore.getState().melding(`${id} lagt til som refleks.`, 'ok');
                  }}
                >
                  Legg til som R
                </button>
              </span>
            </div>
            <Utm pos={p.pos} sone={a.sone} kompakt />
            <div className="dempet liten-tekst">
              {fmtAvstand(distanceM(a.ipp!, p.pos))} fra IPP · POA rundt punktet {prosent(p.poa)}
              {p.timer != null && ` · kan nås etter ${fmtTimer(p.timer)}`}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

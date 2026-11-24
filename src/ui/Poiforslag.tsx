import { PUNKTTYPENAVN } from '../data/interessepunkter';
import { lokalTid } from '../domain/aksjon';
import { distanceM } from '../domain/geo';
import { prosent } from '../domain/pod';
import type { PoiForslag } from '../model/beregning';
import { leggTilPunkt } from '../state/handlinger';
import { useStore } from '../state/store';
import { Modellmerke, Utm, VisKnapp } from './felles';
import { fmtAvstand, fmtTimer } from './format';

const SONE = ['25 %-sonen', '50 %-sonen', '75 %-sonen', '95 %-sonen'];

/** «Hut «Bua»» – the type is always shown, the name only when OSM has one. */
export function poiTittel(p: PoiForslag): string {
  const type = PUNKTTYPENAVN[p.type];
  return p.navn && p.navn !== type ? `${type} «${p.navn}»` : type;
}

/** Adds the suggestion as a refleks (R###) and keeps the reason on the point. */
export function leggTilPoi(p: PoiForslag): string {
  const g = p.grunnlag;
  const id = leggTilPunkt(p.pos, {
    type: 'poi',
    klasse: 'mulig',
    tid: lokalTid(),
    tekst: poiTittel(p),
    begrunnelse: { type: PUNKTTYPENAVN[p.type], tekst: g.begrunnelse.join(' '), vurder: g.vurder },
  });
  useStore.getState().melding(`${id} lagt til som refleks.`, 'ok');
  return id;
}

/** The reasons behind one suggestion, so the search leader can judge whether to send someone. */
export function PoiGrunnlagListe({ p }: { p: PoiForslag }) {
  const g = p.grunnlag;
  return (
    <ul>
      <li>
        <b>Hva:</b> {g.kildeTekst}.
      </li>
      <li>
        <b>Hvorfor for denne savnetkategorien:</b> {g.begrunnelse.join(' ')}{' '}
        {g.bidrag.length > 1 && <span className="dempet">({g.bidrag.map((b) => `${b.navn} ${prosent(b.andel, 0)}`).join(', ')})</span>}
      </li>
      <li>
        <b>Sannsynlighet:</b> {prosent(p.poa)} av sannsynligheten ligger innen ca. 150 m
        {g.sone != null ? `; punktet ligger i ${SONE[g.sone]}` : '; punktet ligger utenfor 95 %-sonen'}
        {p.timer != null && `; kan nås etter ca. ${fmtTimer(p.timer)} gange`}.
      </li>
      <li>
        <b>Vurder:</b> {g.vurder}
      </li>
      <li className="dempet">Grunnlag: {g.referanse}. Ikke kontrollert av fagpersoner.</li>
    </ul>
  );
}

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
        Steder i nærområdet som ofte er aktuelle for valgt savnetkategori, rangert etter sannsynligheten rundt punktet × hvor aktuell typen er for
        kategorien. Åpne «Hvorfor?» for grunnlaget før du sender noen. Listen over punkttyper er en modellantakelse og bør kvalitetssikres.{' '}
        <Modellmerke />
      </p>
      {!osm && <p className="liten-tekst dempet">Hent stier og veier først (fanen Aksjon), så kan appen finne punkter i kartet.</p>}
      {osm && !liste.length && <p className="liten-tekst dempet">Fant ingen aktuelle punkter for kategorien innenfor beregningsområdet.</p>}
      <ol className="liste kompakt">
        {liste.map((p, i) => (
          <li key={p.id}>
            <div className="linje">
              <b>
                {i + 1}. {poiTittel(p)}
              </b>
              <span className="knapperad">
                <VisKnapp pos={p.pos} zoom={16} />
                <button type="button" className="knapp liten hoved" onClick={() => leggTilPoi(p)}>
                  Legg til som R
                </button>
              </span>
            </div>
            <Utm pos={p.pos} sone={a.sone} kompakt />
            <div className="dempet liten-tekst">
              {fmtAvstand(distanceM(a.ipp!, p.pos))} fra IPP · POA rundt punktet {prosent(p.poa)}
              {p.timer != null && ` · kan nås etter ${fmtTimer(p.timer)}`}
            </div>
            <details className="grunnlag">
              <summary>Hvorfor?</summary>
              <PoiGrunnlagListe p={p} />
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

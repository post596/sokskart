import { grunnlagLinjer, type ForslagGrunnlag } from '../domain/grunnlag';
import { useStore } from '../state/store';
import { Modellmerke } from './felles';
import { fmtTid } from './format';

/** «Hvorfor dette forslaget?» – the numbers behind a teig or drone suggestion. */
export function Grunnlag({ g, tittel = 'Hvorfor dette forslaget?', apen = false }: { g: ForslagGrunnlag; tittel?: string; apen?: boolean }) {
  const lnummer = useStore((s) => s.aksjon.lnummer);
  return (
    <details className="grunnlag" open={apen}>
      <summary>{tittel}</summary>
      <ul>
        {grunnlagLinjer(g, lnummer).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      <p className="liten-tekst dempet">
        Beregnet {fmtTid(g.beregnet)} fra sannsynlighetskartet, OSM-data og høydedata. Søksleder vurderer. <Modellmerke />
      </p>
    </details>
  );
}

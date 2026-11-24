import { STIRESSURS_NAVN, stisokAnbefaling, valgteKategorier, type StisokAnbefaling } from '../data/stisok';
import type { LinjeType } from '../model/typer';
import { useStore } from '../state/store';
import { Modellmerke } from './felles';
import { fmtTimer } from './format';

/** Recommendation for searching one ledelinje, from the chosen categories and model settings. */
export function useStisok(type: LinjeType | undefined, lengdeM: number | undefined): StisokAnbefaling | null {
  const kategorier = useStore((s) => s.aksjon.kategorier);
  const m = useStore((s) => s.aksjon.modell);
  if (!type || lengdeM == null) return null;
  return stisokAnbefaling(type, lengdeM, valgteKategorier(kategorier), m);
}

export function fmtMinutter(min: number): string {
  return min < 60 ? `${Math.max(1, min)} min` : fmtTimer(min / 60);
}

/** «Anbefalt: Fotlag 1–3 … · ca. 35 min · alt.: Hund» with «Hvorfor?». */
export function Stisok({ a, apen = false }: { a: StisokAnbefaling; apen?: boolean }) {
  return (
    <div className="stisok liten-tekst">
      <div>
        <b>Anbefalt:</b> {a.primar.tekst} · ca. {fmtMinutter(a.minutter)} helt ut
        {a.alternativ.length > 0 && <span className="dempet"> · alt.: {a.alternativ.map((v) => STIRESSURS_NAVN[v.ressurs]).join(', ')}</span>}
      </div>
      <details className="grunnlag" open={apen}>
        <summary>Hvorfor?</summary>
        <ul>
          <li>Metode: {a.metode}.</li>
          {a.alternativ.map((v) => (
            <li key={v.ressurs}>Alternativ: {v.tekst}.</li>
          ))}
          {a.merknader.map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>Kilde: {a.kilder.join('; ')}.</li>
        </ul>
        <p className="liten-tekst dempet">
          Tiden gjelder hele linja med anbefalt ressurs (fart under Statistikk → Modellantakelser).{' '}
          {!a.verifisert && 'Deler av anbefalingen er søksfaglig praksis, ikke fra veilederen. '}Søksleder vurderer. <Modellmerke />
        </p>
      </details>
    </div>
  );
}

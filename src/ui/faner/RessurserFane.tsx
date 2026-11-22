import { aksjonsfilnavn } from '../../domain/aksjon';
import { lagGpx } from '../../domain/gpx';
import { RESSURSER, type RessursType } from '../../model/ressurser';
import { standardVisning } from '../../state/beregning';
import { useStore } from '../../state/store';
import { Advarsel, lastNed, Modellmerke, Utm, VisKnapp } from '../felles';
import { fmtAvstand, fmtTimer } from '../format';
import { distanceM } from '../../domain/geo';

export function RessurserFane() {
  const a = useStore((s) => s.aksjon);
  const r = useStore((s) => s.resultat);
  const osm = useStore((s) => s.osm);
  const visningTimer = useStore((s) => s.visningTimer);
  useStore((s) => s.naa);
  const endre = useStore((s) => s.endreAksjon);
  const t = visningTimer ?? standardVisning();
  const total = RESSURSER.reduce((s, x) => s + (a.ressurser[x.type] || 0), 0);

  return (
    <div className="fane">
      <p className="dempet">
        Oppgi hvor mange enheter dere har. Appen foreslår like mange punkter å sjekke, ut fra sannsynlighetskartet og hvor langt personen kan ha gått
        ({fmtTimer(t)}, styres med tidslinja i kartet). Bil får veier, ATV traktor- og skogsveier, drone IPP, ledelinjer og risikoområder,
        hundefører IPP (sporutgang) og områder med høy sannsynlighet. <Modellmerke />
      </p>
      <div className="ressursinput">
        {RESSURSER.map((x) => (
          <label key={x.type}>
            {x.navn}
            <input
              type="number"
              min={0}
              max={50}
              inputMode="numeric"
              value={a.ressurser[x.type] || 0}
              onChange={(e) =>
                endre((y) => {
                  y.ressurser[x.type as RessursType] = Math.max(0, Math.min(50, Math.floor(Number(e.target.value) || 0)));
                })
              }
            />
          </label>
        ))}
      </div>
      {!a.ipp && <Advarsel type="info">Sett IPP først.</Advarsel>}
      {a.ipp && !osm && total > 0 && (
        <Advarsel type="info">Hent stier og veier (fanen Aksjon) for å få forslag langs ledelinjer til bil, ATV, drone og fotmannskap.</Advarsel>
      )}
      {r && total > 0 && (
        <>
          <div className="knapperad">
            <button
              type="button"
              className="knapp"
              onClick={() =>
                lastNed(
                  aksjonsfilnavn(a, 'forslag.gpx'),
                  lagGpx(
                    `${a.navn || 'Søkskart'} – ressursforslag`,
                    r.forslag.map((f) => ({
                      navn: `${RESSURSER.find((x) => x.type === f.ressurs)?.kort} ${f.nr}`,
                      pos: f.pos,
                      beskrivelse: f.tekst,
                    })),
                    [],
                  ),
                  'application/gpx+xml',
                )
              }
            >
              Forslag som GPX
            </button>
          </div>
          {RESSURSER.filter((x) => a.ressurser[x.type] > 0).map((x) => {
            const liste = r.forslag.filter((f) => f.ressurs === x.type);
            return (
              <section key={x.type} className="ressursgruppe">
                <h3>
                  {x.navn} <span className="dempet">({liste.length} av {a.ressurser[x.type]})</span>
                </h3>
                {liste.length < a.ressurser[x.type] && (
                  <p className="liten-tekst dempet">
                    {x.type === 'bil'
                      ? 'Ikke flere veier innen rekkevidde.'
                      : x.type === 'atv'
                        ? 'Ikke flere traktor-/skogsveier innen rekkevidde.'
                        : 'Ikke flere egnede mål.'}
                  </p>
                )}
                <ol className="liste">
                  {liste.map((f) => (
                    <li key={`${f.ressurs}-${f.nr}`}>
                      <div className="linje">
                        <b>
                          {x.kort} {f.nr}: {f.tekst}
                          {f.linjeId && a.lnummer[f.linjeId] ? ` (${a.lnummer[f.linjeId]})` : ''}
                        </b>
                        <VisKnapp pos={f.pos} zoom={15} />
                      </div>
                      <Utm pos={f.pos} sone={a.sone} kompakt />
                      <div className="dempet liten-tekst">
                        {a.ipp && `${fmtAvstand(distanceM(a.ipp, f.pos))} fra IPP`}
                        {f.timer != null && f.type !== 'ipp' && ` · kan være nådd etter ${fmtTimer(f.timer)}`}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

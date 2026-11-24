import { useEffect, useState, type ReactNode } from 'react';
import { prosent } from '../domain/pod';
import { LINJETYPE_NAVN } from '../model/typer';
import { harKlasse, PUNKTNAVN, settLinjeSjekket, settPunktSjekket, slettPunkt } from '../state/handlinger';
import { useStore } from '../state/store';
import { Utm } from './felles';
import { fmtAvstand, fmtTid, fmtTimer } from './format';
import { leggTilPoi, PoiGrunnlagListe, poiTittel } from './Poiforslag';
import { Stisok, useStisok } from './Stisok';

/**
 * Card over the map for the object clicked in the map: a point, a ledelinje or a suggested
 * point of interest. Mark as checked, make an order, delete or add.
 */
export function Valgtkort() {
  const valgt = useStore((s) => s.valgt);
  const a = useStore((s) => s.aksjon);
  const osm = useStore((s) => s.osm);
  const r = useStore((s) => s.resultat);
  const set = useStore((s) => s.set);
  const [av, setAv] = useState('');
  const linjeValgt = valgt?.type === 'linje' ? valgt.id : null;
  const linjeType = linjeValgt ? (osm?.linjer.find((x) => x.id === linjeValgt)?.type ?? a.linjestatus[linjeValgt]?.type) : undefined;
  const linjeLengde = linjeValgt ? r?.linjer.find((x) => x.id === linjeValgt)?.lengdeM : undefined;
  const stisok = useStisok(linjeType, linjeLengde);

  useEffect(() => {
    setAv('');
    if (!valgt) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && set({ valgt: null });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [valgt, set]);

  if (!valgt) return null;
  const lukk = () => set({ valgt: null });
  const visIListe = (fane: 'punkter' | 'ledelinjer') => set({ fane });
  const avFelt = (
    <input className="kort-felt" value={av} onChange={(e) => setAv(e.target.value)} placeholder="Sjekket av (valgfritt)" aria-label="Sjekket av" />
  );
  const hint = <p className="liten-tekst dempet">Merk bare det som er sjekket i egne oppdrag – ikke det som er dekket av et registrert teigsøk (da telles det dobbelt).</p>;

  let innhold: ReactNode;
  if (valgt.type === 'punkt') {
    const p = a.punkter.find((x) => x.id === valgt.id);
    if (!p) return null;
    innhold = (
      <>
        <h3>
          {p.sjekket && '✓ '}
          {p.id} · {PUNKTNAVN[p.type]}
          {harKlasse(p.type) && ` (${p.klasse})`}
        </h3>
        {p.tekst && <p className="liten-tekst">{p.tekst}</p>}
        <Utm pos={p.pos} sone={a.sone} kompakt />
        <div className="dempet liten-tekst">{fmtTid(p.tid)}</div>
        {p.begrunnelse && (
          <p className="liten-tekst">
            <b>Hvorfor foreslått:</b> {p.begrunnelse.tekst} {p.begrunnelse.vurder && <i>Vurder: {p.begrunnelse.vurder}</i>}
          </p>
        )}
        {p.sjekket ? (
          <p className="liten-tekst ok-tekst">
            Ferdig sjekket {fmtTid(p.sjekket.tid)}
            {p.sjekket.av && ` av ${p.sjekket.av}`}. Sannsynligheten rundt punktet er senket.
          </p>
        ) : (
          p.type !== 'sp' && hint
        )}
        <div className="knapperad">
          {p.type !== 'sp' &&
            (p.sjekket ? (
              <button type="button" className="knapp liten" onClick={() => settPunktSjekket(p.id, false)}>
                Angre «sjekket»
              </button>
            ) : (
              <>
                {avFelt}
                <button type="button" className="knapp liten hoved" onClick={() => settPunktSjekket(p.id, true, av)}>
                  Merk som sjekket
                </button>
              </>
            ))}
          <button type="button" className="knapp liten" onClick={() => set({ ordreFor: { type: 'punkt', id: p.id } })}>
            5-punktsordre
          </button>
          <button type="button" className="knapp liten" onClick={() => visIListe('punkter')}>
            Vis i liste
          </button>
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
        </div>
      </>
    );
  } else if (valgt.type === 'linje') {
    const l = osm?.linjer.find((x) => x.id === valgt.id);
    const st = a.linjestatus[valgt.id];
    const info = r?.linjer.find((x) => x.id === valgt.id);
    const type = l?.type ?? st?.type;
    if (!type) return null;
    const nr = a.lnummer[valgt.id];
    const navn = l?.navn ?? st?.navn;
    innhold = (
      <>
        <h3>
          {st && '✓ '}
          {nr ? `${nr} ` : ''}
          {LINJETYPE_NAVN[type]}
          {navn && ` «${navn}»`}
        </h3>
        {info && (
          <div className="dempet liten-tekst">
            {fmtAvstand(info.lengdeM)} · {prosent(info.na)} av sannsynligheten langs linja
            {info.for > info.na * 1.05 && ` (før søk ${prosent(info.for)})`}
            {Number.isFinite(info.tMin) && ` · kan være nådd etter ${fmtTimer(info.tMin)}`}
          </div>
        )}
        {!nr && <p className="liten-tekst dempet">Linja er ikke blant de prioriterte ledelinjene (uten L-nummer).</p>}
        {!st && stisok && <Stisok a={stisok} />}
        {st ? (
          <p className="liten-tekst ok-tekst">
            {st.kilde === 'spor'
              ? `Søkt: GPS-spor følger ${prosent(st.andel ?? 1, 0)} av linja. Sporet har allerede senket sannsynligheten.`
              : `Ferdig sjekket ${fmtTid(st.tid)}${st.av ? ` av ${st.av}` : ''}. Sannsynligheten langs linja er senket.`}
          </p>
        ) : (
          hint
        )}
        <div className="knapperad">
          {st?.kilde === 'manuell' ? (
            <button type="button" className="knapp liten" onClick={() => settLinjeSjekket(valgt.id, false)}>
              Angre «sjekket»
            </button>
          ) : !st ? (
            <>
              {avFelt}
              <button type="button" className="knapp liten hoved" onClick={() => settLinjeSjekket(valgt.id, true, av)}>
                Merk som sjekket
              </button>
            </>
          ) : null}
          {l && (
            <button type="button" className="knapp liten" onClick={() => set({ ordreFor: { type: 'linje', id: valgt.id } })}>
              5-punktsordre
            </button>
          )}
          <button type="button" className="knapp liten" onClick={() => visIListe('ledelinjer')}>
            Vis i liste
          </button>
        </div>
      </>
    );
  } else {
    const p = r?.poiforslag.find((x) => x.id === valgt.id);
    if (!p) return null;
    innhold = (
      <>
        <h3>Forslag: {poiTittel(p)}</h3>
        <Utm pos={p.pos} sone={a.sone} kompakt />
        <div className="grunnlag liten-tekst">
          <PoiGrunnlagListe p={p} />
        </div>
        <div className="knapperad">
          <button
            type="button"
            className="knapp liten hoved"
            onClick={() => {
              const id = leggTilPoi(p);
              set({ valgt: { type: 'punkt', id } });
            }}
          >
            Legg til som R
          </button>
          <button
            type="button"
            className="knapp liten"
            title="Legg til som refleks og merk den som ferdig sjekket med én gang"
            onClick={() => {
              const id = leggTilPoi(p);
              settPunktSjekket(id, true, av);
              set({ valgt: { type: 'punkt', id } });
            }}
          >
            Legg til som sjekket
          </button>
          <button type="button" className="knapp liten" onClick={() => visIListe('punkter')}>
            Vis i liste
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="valgtkort" aria-label="Valgt i kartet">
      <button type="button" className="lukk" aria-label="Lukk" onClick={lukk}>
        ×
      </button>
      {innhold}
    </section>
  );
}

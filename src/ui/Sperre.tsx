import { useEffect, useState } from 'react';
import { SPERRE_RADIUS, type Punkt } from '../domain/aksjon';
import { sperreTekst } from '../domain/eksport';
import { areaM2 } from '../domain/geo';
import { prosent } from '../domain/pod';
import { settSperrefelt, settSperreRadius } from '../state/handlinger';
import { useStore } from '../state/store';
import { Modellmerke } from './felles';
import { fmtKm2, fmtTimer } from './format';

/** How a sperrepost works in the model: in time or too late, and how much lies behind it. */
export function SperreStatus({ p }: { p: Punkt }) {
  const r = useStore((s) => s.resultat);
  const m = useStore((s) => s.aksjon.modell);
  const st = r?.sperreposter.find((x) => x.id === p.id);
  const dekning = p.sperre?.felt ? `tegnet sperrefelt (${fmtKm2(areaM2(p.sperre.felt) / 1e6)})` : sperreTekst(p, m.sperrepostRadiusM);
  let virkning: string | null;
  let ok = false;
  if (!st) virkning = r ? 'Ikke beregnet (flere enn 8 sperreposter).' : null;
  else if (st.merknad === 'ipp') virkning = 'Dekningen omfatter IPP – posten virker ikke i modellen.';
  else if (st.merknad === 'utenfor') virkning = 'Utenfor beregningsområdet eller utilgjengelig – virker ikke i modellen.';
  else if (st.merknad === 'sent')
    virkning = `Satt opp for sent: personen kan ha vært forbi etter ca. ${fmtTimer(st.naaTimer ?? 0)}. Virker ikke i modellen.`;
  else {
    ok = true;
    virkning =
      `${st.andel >= 0.999 ? 'Virker' : `Virker for ${prosent(st.andel, 0)} av kategoriblandingen`}: senker sannsynligheten bak posten med ` +
      `${prosent(m.sperrepostPod, 0)} (satt opp før personen kunne nå den). Bak posten ligger nå ${prosent(st.bakAndel)} av sannsynligheten.`;
  }
  return (
    <div className="liten-tekst">
      <div>Dekning: {dekning}</div>
      {virkning && (
        <div className={ok ? 'ok-tekst' : 'dempet'}>
          {virkning} <Modellmerke />
        </div>
      )}
    </div>
  );
}

/** Coverage controls for a selected sperrepost: radius, draw a field, back to the circle. */
export function SperreKontroller({ p }: { p: Punkt }) {
  const m = useStore((s) => s.aksjon.modell);
  const set = useStore((s) => s.set);
  const r = p.sperre?.radiusM ?? m.sperrepostRadiusM;
  const [verdi, setVerdi] = useState(String(Math.round(r)));
  useEffect(() => setVerdi(String(Math.round(r))), [r]);
  const lagre = () => {
    const n = Number(verdi.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) settSperreRadius(p.id, n);
    else setVerdi(String(Math.round(r)));
  };
  if (p.sperre?.felt) {
    return (
      <>
        <p className="liten-tekst dempet">Dra i hjørnene i kartet for å justere sperrefeltet.</p>
        <div className="knapperad">
          <button type="button" className="knapp liten" onClick={() => settSperrefelt(p.id, null)}>
            Tilbake til sirkel
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <p className="liten-tekst dempet">Dra i håndtaket ↔ på sirkelen for å endre dekningen, eller tegn et sperrefelt, f.eks. tvers over dalen.</p>
      <div className="knapperad">
        <label className="kort-felt-label">
          Dekning (m)
          <input
            className="kort-felt"
            type="number"
            min={SPERRE_RADIUS.min}
            max={SPERRE_RADIUS.maks}
            step={5}
            inputMode="numeric"
            value={verdi}
            onChange={(e) => setVerdi(e.target.value)}
            onBlur={lagre}
            onKeyDown={(e) => e.key === 'Enter' && lagre()}
          />
        </label>
        <button type="button" className="knapp liten" onClick={() => set({ modus: { type: 'sperrefelt', id: p.id } })}>
          Tegn sperrefelt
        </button>
      </div>
    </>
  );
}

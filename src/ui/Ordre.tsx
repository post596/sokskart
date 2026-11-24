import { useMemo, useState } from 'react';
import { aksjonsfilnavn, type Ordretekster } from '../domain/aksjon';
import { areaM2 } from '../domain/geo';
import { lagFempunktsordre, omradeNavn, SOKSTYPER, standardOppdrag, standardSokstype, type OrdreKilde } from '../domain/ordre';
import { byggKomponenter, blandingRinger, vektetFart } from '../model/lpb';
import { LINJETYPE_NAVN } from '../model/typer';
import { useStore } from '../state/store';
import { kopier, lastNed, loggVedEndring } from './felles';

function useKilde(): OrdreKilde | null {
  const f = useStore((s) => s.ordreFor);
  const a = useStore((s) => s.aksjon);
  const r = useStore((s) => s.resultat);
  const osm = useStore((s) => s.osm);
  return useMemo(() => {
    if (!f) return null;
    if (f.type === 'teig') {
      const t = a.teiger.find((x) => x.id === f.id);
      if (!t) return null;
      return { type: 'teig', teig: t, arealKm2: areaM2(t.ring) / 1e6, poa: r?.teiger.find((x) => x.id === t.id)?.poaNa ?? null };
    }
    if (f.type === 'linje') {
      const li = r?.linjer.find((x) => x.id === f.id);
      const ol = osm?.linjer.find((x) => x.id === f.id);
      if (!ol) return null;
      return {
        type: 'linje',
        nr: a.lnummer[f.id] ?? 'Ledelinje',
        navn: ol.navn,
        typeNavn: LINJETYPE_NAVN[ol.type],
        lengdeM: li?.lengdeM ?? 0,
        pts: ol.pts,
        tNaadd: li && Number.isFinite(li.tMin) ? li.tMin : null,
        poa: li?.na ?? null,
      };
    }
    const p = a.punkter.find((x) => x.id === f.id);
    return p ? { type: 'punkt', punkt: p } : null;
  }, [f, a, r, osm]);
}

export function OrdreDialog() {
  const kilde = useKilde();
  const a = useStore((s) => s.aksjon);
  const stat = useStore((s) => s.statistikk);
  const set = useStore((s) => s.set);
  const endre = useStore((s) => s.endreAksjon);
  const [oppdrag, setOppdrag] = useState<string | null>(null);
  const [sokstype, setSokstype] = useState<string | null>(null);
  const [ressurs, setRessurs] = useState('');
  if (!kilde) return null;

  const komps = byggKomponenter(stat, a.kategorier, a.terreng);
  const tekst = lagFempunktsordre({
    aksjon: a,
    kategorier: komps.map((k) => k.navn).join(', '),
    ringer: komps.length ? blandingRinger(komps, a.modell.haleFaktor) : null,
    fart: komps.length ? vektetFart(komps) : null,
    observasjoner: a.punkter,
    kilde,
    oppdrag: oppdrag ?? standardOppdrag(kilde),
    sokstype: sokstype ?? standardSokstype(kilde),
    ressurs: ressurs.trim(),
    naa: new Date(),
  });
  const lukk = () => set({ ordreFor: null });
  const navn = omradeNavn(kilde);
  const ordrefelt = (k: keyof Ordretekster, tittel: string) => (
    <label key={k}>
      {tittel} <span className="dempet">(gjelder alle ordre i aksjonen)</span>
      <textarea rows={2} value={a.ordre[k]} onChange={(e) => endre((x) => void (x.ordre[k] = e.target.value))} {...loggVedEndring(`Ordre: ${tittel.toLowerCase()}`)} />
    </label>
  );

  return (
    <div className="dialog-bakgrunn" onKeyDown={(e) => e.key === 'Escape' && lukk()}>
      <div className="dialog bred" role="dialog" aria-modal="true" aria-labelledby="ordre-t">
        <h2 id="ordre-t">5-punktsordre – {navn}</h2>
        <div className="ordre">
          <div className="ordre-skjema">
            <label>
              Søksmetode
              <select value={sokstype ?? standardSokstype(kilde)} onChange={(e) => setSokstype(e.target.value)}>
                {SOKSTYPER.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Ressurs (org–type–id)
              <input value={ressurs} onChange={(e) => setRessurs(e.target.value)} placeholder="NFS–Msk–21" />
            </label>
            <label>
              Oppdrag – hva ledelsen ønsker å oppnå
              <textarea rows={2} value={oppdrag ?? standardOppdrag(kilde)} onChange={(e) => setOppdrag(e.target.value)} />
            </label>
            {ordrefelt('egneStyrker', 'Egne styrker')}
            {ordrefelt('varLysFore', 'Vær, lys og føre')}
            {ordrefelt('administrasjon', 'Administrasjon og forsyning')}
            {ordrefelt('ledelseSamband', 'Ledelse og samband')}
            <p className="liten-tekst dempet">
              Personopplysninger legges ikke inn i Søkskart. Ordren sier at de gis av ILKO – fyll dem eventuelt inn i teksten før den gis ut.
            </p>
          </div>
          <textarea className="ordretekst mono" readOnly value={tekst} aria-label="Ferdig 5-punktsordre" />
        </div>
        <div className="knapperad hoyre">
          <button type="button" className="knapp" onClick={lukk}>
            Lukk
          </button>
          <button
            type="button"
            className="knapp"
            onClick={() => {
              lastNed(aksjonsfilnavn(a, `ordre-${navn}.txt`), tekst, 'text/plain;charset=utf-8');
              endre(() => {}, `5-punktsordre for ${navn} lagret som fil`);
            }}
          >
            Lagre som tekst
          </button>
          <button
            type="button"
            className="knapp hoved"
            onClick={() => {
              void kopier(tekst, '5-punktsordre kopiert');
              endre(() => {}, `5-punktsordre for ${navn} kopiert${ressurs ? ` (${ressurs})` : ''}`);
            }}
          >
            Kopier
          </button>
        </div>
      </div>
    </div>
  );
}

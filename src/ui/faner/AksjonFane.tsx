import { useRef, useState } from 'react';
import { GRUPPENAVN, type Kategorigruppe } from '../../data/lpb-stats';
import { aksjonsfilnavn, lagAksjonsfil, lokalTid, timerMellom } from '../../domain/aksjon';
import { parsePosition } from '../../domain/coords';
import { lagGpx, type GpxPunkt, type GpxSpor } from '../../domain/gpx';
import { lagGeoJson, lagKml, type EksportInput, type EksportLinje } from '../../domain/eksport';
import { prosent } from '../../domain/pod';
import type { ZoneChoice } from '../../domain/utm';
import { byggKomponenter, blandingRinger, vektetFart } from '../../model/lpb';
import { LINJETYPE_NAVN } from '../../model/typer';
import type { OsmData } from '../../model/typer';
import { hentOsm } from '../../services/overpass';
import { fjernDuplikater, hentTurruter } from '../../services/turrutebasen';
import { useStore } from '../../state/store';
import { Advarsel, lastNed, loggVedEndring, Modellmerke, Utm, VisKnapp } from '../felles';
import { fmtAvstand, fmtFart, fmtKm2, fmtTid, fmtTimer } from '../format';

const SYKKELHJUL: Array<[string, string, string]> = [
  ['aksling', 'Akslingen', 'IPP er markert og søkt grundig'],
  ['navet', 'Navet', 'R25 – umiddelbart søk i nærområdet (finsøk hvis R25 < 300 m)'],
  ['eikene', 'Eikene', 'Ledelinjer hurtigsøkt – helt ut, også forbi R95 når tid og scenario tilsier det'],
  ['felgen', 'Felgen', 'Søksområde (R50/R75) og områdebegrensende tiltak (sperreposter)'],
  ['refleks', 'Refleksene', 'Punkter av interesse (POI) og risikoområder (usikker is, elv, vann, stup, skred)'],
];

export async function hentStier(): Promise<void> {
  const s = useStore.getState();
  const a = s.aksjon;
  if (!a.ipp) {
    s.melding('Sett IPP først.', 'info');
    return;
  }
  const komps = byggKomponenter(s.statistikk, a.kategorier, a.terreng);
  const R95 = komps.length ? blandingRinger(komps, a.modell.haleFaktor)[3] : 5000;
  const radius = Math.min(R95 * 1.2, a.modell.ledelinjeTakKm * 1000);
  s.set({ osmStatus: { henter: true, feil: null } });
  // ski tracks from Turrutebasen only when a ski category is chosen
  const medSki = a.kategorier.some((k) => k.key === 'langrenn' || k.key === 'alpin');
  const [osmR, trbR] = await Promise.allSettled([hentOsm(a.ipp, radius), hentTurruter(a.ipp, radius, medSki)]);
  const st = useStore.getState();
  const forrige = st.osm;
  if (osmR.status === 'rejected' && (trbR.status === 'rejected' || forrige)) {
    // keep what we already have rather than replacing it with less
    const feil = `${osmR.reason instanceof Error ? osmR.reason.message : String(osmR.reason)}${forrige ? ' Beholder stiene og veiene fra forrige henting.' : ''}`;
    st.set({ osmStatus: { henter: false, feil } });
    st.melding(feil, 'feil');
    return;
  }
  const osm: OsmData =
    osmR.status === 'fulfilled'
      ? osmR.value
      : { linjer: [], omrader: [], stup: [], punkter: [], senter: a.ipp, radiusM: radius, hentet: new Date().toISOString(), kilde: 'Turrutebasen' };
  let trbTekst = '';
  if (trbR.status === 'fulfilled') {
    const { beholdt, duplikater } = fjernDuplikater(trbR.value, osm.linjer);
    osm.linjer = [...osm.linjer, ...beholdt];
    trbTekst = `, ${beholdt.length} nye merkede ruter fra Turrutebasen (${duplikater} fantes i OSM)`;
  } else {
    st.melding(`Turrutebasen svarte ikke (${trbR.reason instanceof Error ? trbR.reason.message : trbR.reason}). Bruker bare OpenStreetMap.`, 'info');
  }
  const feil = osmR.status === 'rejected' ? `OpenStreetMap svarte ikke: ${osmR.reason instanceof Error ? osmR.reason.message : osmR.reason}` : null;
  st.set({ osm: { ...osm, hentet: new Date().toISOString() }, osmStatus: { henter: false, feil } });
  st.endreAksjon(() => {}, `Stier og veier hentet (${osm.linjer.length} ledelinjer innen ${fmtAvstand(radius)}${trbTekst})`);
  st.melding(`${osm.linjer.length} ledelinjer, ${osm.omrader.length} områder og ${osm.punkter.length} punkter hentet innen ${fmtAvstand(radius)}${trbTekst}.`, 'ok');
  // land cover and small POIs in a separate, optional request (keeps the first one light)
  st.set({ osmStatus: { henter: true, feil } });
  try {
    const areal = await hentOsm(a.ipp, radius, undefined, 'areal');
    const cur = useStore.getState();
    if (cur.osm) {
      cur.set({
        osm: { ...cur.osm, omrader: [...cur.osm.omrader, ...areal.omrader], punkter: [...cur.osm.punkter, ...areal.punkter], hentet: new Date().toISOString() },
        osmStatus: { henter: false, feil },
      });
      cur.endreAksjon(() => {}, `Arealtyper hentet (${areal.omrader.length} områder, ${areal.punkter.length} punkter)`);
    }
  } catch (e) {
    useStore.getState().set({ osmStatus: { henter: false, feil } });
    useStore.getState().melding(`Arealtyper (skog/åpent) ble ikke hentet: ${e instanceof Error ? e.message : e}. Teigforslag bruker bare stier og vann som grenser.`, 'info');
  }
}

export function lagMannskapsGpx(): void {
  const s = useStore.getState();
  const a = s.aksjon;
  const r = s.resultat;
  const pkt: GpxPunkt[] = [];
  if (a.ipp) pkt.push({ navn: 'IPP', pos: a.ipp, beskrivelse: a.navn || undefined });
  for (const p of a.punkter) pkt.push({ navn: p.id, pos: p.pos, beskrivelse: p.tekst || undefined });
  const spor: GpxSpor[] = a.teiger.map((t) => ({ navn: t.id, pts: t.ring, lukket: true }));
  if (r && s.osm) {
    for (const l of r.linjer.slice(0, a.modell.antallLedelinjer)) {
      const ol = s.osm.linjer[l.i];
      const nr = a.lnummer[l.id];
      if (ol && nr) spor.push({ navn: `${nr}${ol.navn ? ` ${ol.navn}` : ''}`, pts: ol.pts, beskrivelse: LINJETYPE_NAVN[ol.type] });
    }
  }
  lastNed(aksjonsfilnavn(a, 'gpx'), lagGpx(a.navn || a.sarNr || 'Søkskart', pkt, spor), 'application/gpx+xml');
}

function eksportInput(): EksportInput {
  const s = useStore.getState();
  const a = s.aksjon;
  const ledelinjer: EksportLinje[] = [];
  if (s.resultat && s.osm) {
    for (const l of s.resultat.linjer.slice(0, a.modell.antallLedelinjer)) {
      const ol = s.osm.linjer[l.i];
      const nr = a.lnummer[l.id];
      if (ol && nr) ledelinjer.push({ nr, navn: ol.navn, type: LINJETYPE_NAVN[ol.type], pts: ol.pts });
    }
  }
  return { aksjon: a, ringer: s.resultat?.ringer ?? null, ledelinjer };
}

function eksporter(format: 'geojson' | 'kml'): void {
  const i = eksportInput();
  if (format === 'geojson') lastNed(aksjonsfilnavn(i.aksjon, 'geojson'), lagGeoJson(i), 'application/geo+json');
  else lastNed(aksjonsfilnavn(i.aksjon, 'kml'), lagKml(i), 'application/vnd.google-earth.kml+xml');
  useStore.getState().endreAksjon(() => {}, `Eksportert som ${format === 'kml' ? 'KML' : 'GeoJSON'} (teiger, punkter, ledelinjer)`);
}

export function AksjonFane() {
  const a = useStore((s) => s.aksjon);
  const statistikk = useStore((s) => s.statistikk);
  const resultat = useStore((s) => s.resultat);
  const osmStatus = useStore((s) => s.osmStatus);
  const osm = useStore((s) => s.osm);
  const hoydeStatus = useStore((s) => s.hoydeStatus);
  const naa = useStore((s) => s.naa);
  const endre = useStore((s) => s.endreAksjon);
  const [ippTekst, setIppTekst] = useState('');
  const filRef = useRef<HTMLInputElement>(null);

  const komps = byggKomponenter(statistikk, a.kategorier, a.terreng);
  const ringer = komps.length ? blandingRinger(komps, a.modell.haleFaktor) : null;
  const fart = vektetFart(komps);
  const ikkeVerifisert = komps.filter((k) => !k.verifisert);
  const timer = timerMellom(a.sistSett, new Date(naa));

  const valgt = (key: string) => a.kategorier.find((k) => k.key === key);
  const vekslKategori = (key: string) =>
    endre((x) => {
      if (x.kategorier.some((k) => k.key === key)) x.kategorier = x.kategorier.filter((k) => k.key !== key);
      else x.kategorier.push({ key, vekt: 1 });
    }, 'Savnetkategori endret');

  const settIppFraTekst = () => {
    const r = parsePosition(ippTekst, a.sone);
    if (!r.ok) {
      useStore.getState().melding(r.error, 'feil');
      return;
    }
    void useStore.getState().settIpp(r.pos);
    setIppTekst('');
  };

  const grupper: Kategorigruppe[] = ['mental', 'barn', 'aktivitet'];

  return (
    <div className="fane">
      {ikkeVerifisert.length > 0 && (
        <Advarsel>
          <b>Statistikken er ikke kontrollert</b> for {ikkeVerifisert.map((k) => `«${k.navn}»`).join(', ')}. Tallene er plassholdere og må kontrolleres
          mot Lost Person Behavior før operativ bruk (fanen Statistikk).
        </Advarsel>
      )}

      <div className="rad">
        <label>
          Aksjon / sted
          <input value={a.navn} onChange={(e) => endre((x) => void (x.navn = e.target.value))} placeholder="F.eks. Spiterstulen" {...loggVedEndring('Aksjonsnavn')} />
        </label>
        <label>
          SAR-nummer
          <input value={a.sarNr} onChange={(e) => endre((x) => void (x.sarNr = e.target.value))} placeholder="SAR-nr." {...loggVedEndring('SAR-nummer')} />
        </label>
      </div>

      <fieldset className="kategorier">
        <legend>Savnetkategori (én eller flere)</legend>
        {grupper.map((g) => (
          <div key={g} className="kategorigruppe">
            <div className="dempet liten-tekst">{GRUPPENAVN[g]}</div>
            <div className="brikker">
              {statistikk
                .filter((s) => s.gruppe === g)
                .map((s) => (
                  <button
                    type="button"
                    key={s.key}
                    className={`brikke ${valgt(s.key) ? 'pa' : ''}`}
                    aria-pressed={!!valgt(s.key)}
                    onClick={() => vekslKategori(s.key)}
                  >
                    {s.navn}
                    {!s.verifisert && <span className="ikke-ok" title="Ikke verifisert"> !</span>}
                  </button>
                ))}
            </div>
          </div>
        ))}
        {a.kategorier.length > 1 && (
          <div className="vekter">
            <div className="liten-tekst">
              Vekting i blandingen (ILKO vurderer hva som skal vektlegges):
            </div>
            {a.kategorier.map((k) => {
              const s = statistikk.find((x) => x.key === k.key);
              const sum = a.kategorier.reduce((x, y) => x + y.vekt, 0);
              return (
                <label key={k.key} className="vekt">
                  <span>{s?.navn ?? k.key}</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={k.vekt}
                    onChange={(e) =>
                      endre((x) => {
                        const y = x.kategorier.find((z) => z.key === k.key);
                        if (y) y.vekt = Math.max(0, Number(e.target.value) || 0);
                      })
                    }
                  />
                  <span className="dempet">{sum > 0 ? prosent(k.vekt / sum, 0) : '–'}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="rad">
        <label>
          Terreng (statistikksett)
          <select value={a.terreng} onChange={(e) => endre((x) => void (x.terreng = e.target.value as 'fjell' | 'flatt'), 'Terreng endret')}>
            <option value="fjell">Fjell / kupert</option>
            <option value="flatt">Flatt</option>
          </select>
        </label>
        <label>
          UTM-sone
          <select value={a.sone} onChange={(e) => endre((x) => void (x.sone = e.target.value as ZoneChoice), 'UTM-sone endret')}>
            <option value="auto">Auto (som GPS)</option>
            <option value="32">32</option>
            <option value="33">33</option>
            <option value="35">35</option>
          </select>
        </label>
      </div>

      <div className="rad">
        <label className="bred">
          Sist sett / IPP-tidspunkt
          <input type="datetime-local" value={a.sistSett ?? ''} onChange={(e) => endre((x) => void (x.sistSett = e.target.value || null), 'Tidspunkt sist sett endret')} />
        </label>
        <button type="button" className="knapp" onClick={() => endre((x) => void (x.sistSett = lokalTid()), 'Tidspunkt sist sett satt til nå')}>
          Nå
        </button>
      </div>

      <div className="rad">
        <label className="bred">
          Søket startet (søksfasen regnes herfra)
          <input type="datetime-local" value={a.aksjonStart ? lokalTid(new Date(a.aksjonStart)) : ''} onChange={(e) => endre((x) => void (x.aksjonStart = e.target.value ? new Date(e.target.value).toISOString() : null), 'Tidspunkt for søkestart endret')} />
        </label>
        <button type="button" className="knapp" onClick={() => endre((x) => void (x.aksjonStart = new Date().toISOString()), 'Søkestart satt til nå')}>
          Nå
        </button>
      </div>

      <h3>IPP – initialt planleggingspunkt</h3>
      {a.ipp ? (
        <div className="boks">
          <Utm pos={a.ipp} sone={a.sone} />
          <div className="liten-tekst dempet">Satt {fmtTid(a.ippSatt)}. IPP flyttes normalt ikke underveis.</div>
        </div>
      ) : (
        <p className="dempet">Ikke satt. Klikk i kartet eller skriv inn posisjon.</p>
      )}
      <div className="rad">
        <input
          className="bred"
          value={ippTekst}
          onChange={(e) => setIppTekst(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && settIppFraTekst()}
          placeholder="32V 0463563 6833857 eller 61.6363, 8.3125"
          aria-label="IPP som UTM eller grader"
        />
        <button type="button" className="knapp" onClick={settIppFraTekst}>
          Sett
        </button>
      </div>
      <div className="rad">
        <button type="button" className="knapp hoved" onClick={() => useStore.getState().set({ modus: { type: 'ipp' } })}>
          {a.ipp ? 'Flytt IPP i kart' : 'Sett IPP i kart'}
        </button>
        <button type="button" className="knapp" disabled={!a.ipp || osmStatus.henter} onClick={() => void hentStier()}>
          {osmStatus.henter ? 'Henter stier …' : osm ? 'Hent stier og veier på nytt' : 'Hent stier og veier'}
        </button>
      </div>
      {osmStatus.feil && <Advarsel type="feil">{osmStatus.feil} Appen fortsetter uten ledelinjer.</Advarsel>}
      {hoydeStatus.henter && <p className="dempet liten-tekst">Henter høydedata fra Kartverket …</p>}
      {hoydeStatus.feil && <Advarsel type="info">{hoydeStatus.feil}</Advarsel>}

      {a.ipp && ringer && (
        <div className="boks">
          <h3>Situasjon</h3>
          <dl className="kv">
            <dt>Ringer</dt>
            <dd>
              R25 {fmtAvstand(ringer[0])} · R50 {fmtAvstand(ringer[1])} · R75 {fmtAvstand(ringer[2])} · R95 {fmtAvstand(ringer[3])}
              {komps.length > 1 && <span className="dempet"> (vektet blanding)</span>}
            </dd>
            <dt>Gangfart / mobilitet</dt>
            <dd>
              {fmtFart(fart.v)} · {fmtTimer(fart.mob)}
            </dd>
            <dt>Siden sist sett</dt>
            <dd>{timer == null ? 'ikke oppgitt' : fmtTimer(timer)}</dd>
            {timer != null && timer > 0 && (
              <>
                <dt>Mulig rekkevidde</dt>
                <dd>
                  {fmtAvstand(fart.v * Math.min(timer, fart.mob) * a.modell.effektivFremdrift * 1000)} i rett linje
                  {timer > fart.mob && ' (maks mobilitet nådd)'} <Modellmerke />
                </dd>
              </>
            )}
            {resultat && (
              <>
                <dt>50 % ligger i</dt>
                <dd>{fmtKm2(resultat.arealKm2[1])}</dd>
                <dt>75 % ligger i</dt>
                <dd>{fmtKm2(resultat.arealKm2[2])}</dd>
                {resultat.korridorAndel != null && (
                  <>
                    <dt>Nær ledelinjer</dt>
                    <dd>
                      {prosent(resultat.korridorAndel)} innen {a.modell.korridorM} m
                    </dd>
                  </>
                )}
                {resultat.sokt > 0 && (
                  <>
                    <dt>Søkt bort (POS)</dt>
                    <dd>{prosent(resultat.sokt)} av sannsynligheten</dd>
                  </>
                )}
                <dt>Terreng</dt>
                <dd>
                  {resultat.harHoyde ? 'Høydedata fra Kartverket brukes i gangtiden' : 'Uten høydedata (flatt terreng)'}
                  {osm ? ', stier og vann fra OSM' : ''}
                </dd>
              </>
            )}
          </dl>
        </div>
      )}

      {resultat && (
        <>
          <h3>Mest sannsynlige punkter</h3>
          <ol className="liste">
            {resultat.punkter.map((p, n) => (
              <li key={n}>
                <div className="linje">
                  <b>{n + 1}.</b> <Utm pos={p.pos} sone={a.sone} kompakt />
                  <VisKnapp pos={p.pos} zoom={15} />
                </div>
                <div className="dempet liten-tekst">
                  {fmtAvstand(p.avstandM)} fra IPP
                  {p.timer != null && ` · gangtid ${fmtTimer(p.timer)}`}
                  {osm ? (p.vedLedelinje ? ' · ved ledelinje' : ' · utenfor ledelinjer') : ''}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <h3>Sykkelhjulmodellen – førsteinnsats</h3>
      <ul className="sjekkliste">
        {SYKKELHJUL.map(([k, navn, tekst]) => (
          <li key={k}>
            <label>
              <input
                type="checkbox"
                checked={!!a.sykkelhjul[k]}
                onChange={(e) => endre((x) => void (x.sykkelhjul[k] = e.target.checked), `Sykkelhjul: ${navn} ${e.target.checked ? 'utført' : 'ikke utført'}`)}
              />
              <span>
                <b>{navn}</b> – {tekst}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="liten-tekst dempet">R95 skal ikke styre førsteinnsatsen. Etterretning trumfer alltid statistikk.</p>

      <h3>Aksjonsfil</h3>
      <div className="knapperad">
        <button
          type="button"
          className="knapp"
          onClick={() => {
            const s = useStore.getState();
            lastNed(aksjonsfilnavn(s.aksjon, 'json'), JSON.stringify(lagAksjonsfil(s.aksjon, s.statistikk, s.osm)), 'application/json');
          }}
        >
          Lagre aksjon (.json)
        </button>
        <button type="button" className="knapp" onClick={() => filRef.current?.click()}>
          Åpne aksjon
        </button>
        <input
          ref={filRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) await useStore.getState().importer(await f.text());
          }}
        />
        <button type="button" className="knapp" onClick={lagMannskapsGpx} disabled={!a.ipp}>
          GPX til mannskap
        </button>
        <button type="button" className="knapp" onClick={() => eksporter('kml')} disabled={!a.ipp} title="For import i FAKS eller andre kartverktøy">
          KML (FAKS)
        </button>
        <button type="button" className="knapp" onClick={() => eksporter('geojson')} disabled={!a.ipp} title="For import i FAKS eller andre kartverktøy">
          GeoJSON (FAKS)
        </button>
        <button
          type="button"
          className="knapp"
          onClick={async () => {
            const ok = await useStore.getState().bekreft({
              tittel: 'Ny aksjon',
              tekst: 'Den åpne aksjonen erstattes. Lagre den som fil først hvis du trenger den.',
              ja: 'Start ny aksjon',
              nei: 'Avbryt',
            });
            if (ok) useStore.getState().nyAksjon();
          }}
        >
          Ny aksjon
        </button>
        <button
          type="button"
          className="knapp fare"
          onClick={async () => {
            const ok = await useStore.getState().bekreft({
              tittel: 'Slette aksjonen helt?',
              tekst:
                'All aksjonsdata på denne enheten slettes: IPP, teiger, punkter, observasjoner, logg, hentede stier og høydedata, og egen statistikk. Dette kan ikke angres. Kartfliser og selve appen beholdes.',
              ja: 'Slett alt',
              nei: 'Avbryt',
              fare: true,
            });
            if (ok) {
              await useStore.getState().slettAksjonHelt();
              useStore.getState().melding('Aksjonen og alle lokale data er slettet.', 'ok');
            }
          }}
        >
          Slett aksjonen helt
        </button>
      </div>

      <p className="liten-tekst dempet">
        Aksjonsloggen ({a.logg.length} linjer) og tidslinja for observasjoner og søk ligger i fanen{' '}
        <button type="button" className="lenkeknapp understrek" onClick={() => useStore.getState().set({ fane: 'tidslinje' })}>
          Tidslinje
        </button>
        .
      </p>
    </div>
  );
}

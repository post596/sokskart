import { useRef } from 'react';
import type { Savnetprofil, Scenario } from '../../domain/aksjon';
import { byggKomponenter, blandingRinger, vektetFart } from '../../model/lpb';
import { settBilde } from '../../state/handlinger';
import { useStore } from '../../state/store';
import { Advarsel, loggVedEndring } from '../felles';
import { fmtAvstand, fmtFart, fmtTid, fmtTimer } from '../format';

const SCENARIO: Array<[Scenario, string]> = [
  ['ukjent', 'Ikke avklart'],
  ['mobil', 'Mobil (i bevegelse)'],
  ['i ro', 'I ro (skadet, sliten, gjemmer seg)'],
  ['livløs', 'Kan være livløs'],
];

/** Shrinks a photo to max 800 px (JPEG) so it fits comfortably in local storage. */
async function forminsk(fil: File): Promise<string> {
  const url = URL.createObjectURL(fil);
  try {
    const img = new Image();
    await new Promise<void>((ok, feil) => {
      img.onload = () => ok();
      img.onerror = () => feil(new Error('Kunne ikke lese bildet.'));
      img.src = url;
    });
    const s = Math.min(1, 800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SavnetFane() {
  const a = useStore((s) => s.aksjon);
  const stat = useStore((s) => s.statistikk);
  const bilde = useStore((s) => s.bilde);
  const endre = useStore((s) => s.endreAksjon);
  const filRef = useRef<HTMLInputElement>(null);
  const p = a.savnet;
  const komps = byggKomponenter(stat, a.kategorier, a.terreng);
  const R = komps.length ? blandingRinger(komps, a.modell.haleFaktor) : null;
  const f = vektetFart(komps);

  const felt = (k: keyof Savnetprofil, navn: string, flere = false, hint = '') => {
    const props = {
      value: p[k],
      placeholder: hint,
      onChange: (e: { target: { value: string } }) => endre((x) => void ((x.savnet as unknown as Record<string, string>)[k] = e.target.value)),
      ...loggVedEndring(`Savnetprofil: ${navn.toLowerCase()}`),
    };
    return (
      <label key={k}>
        {navn}
        {flere ? <textarea rows={2} {...props} /> : <input {...props} />}
      </label>
    );
  };

  return (
    <div className="fane">
      <Advarsel type="info">
        Opplysninger om den savnede er personopplysninger og kan være taushetsbelagte. De lagres bare på denne enheten og i aksjonsfiler dere selv
        eksporterer. Bildet lagres bare lokalt og tas ikke med i aksjonsfila.
      </Advarsel>
      <div className="rad">
        {felt('navn', 'Navn')}
        {felt('alder', 'Alder')}
      </div>
      {felt('beskrivelse', 'Beskrivelse / signalement', true, 'Høyde, kroppsbygning, hår, kjennetegn')}
      {felt('bekledning', 'Bekledning', true, 'Farger og type – viktig for søk fra luft og bakke')}
      {felt('utstyr', 'Utstyr', true, 'Sekk, telefon, lykt, ski, fiskestang …')}
      {felt('helse', 'Fysisk og psykisk helse', true, 'Diagnoser, medisiner, funksjonsnivå, selvmordsrisiko')}
      <label>
        Antatt scenario
        <select value={p.scenario} onChange={(e) => endre((x) => void (x.savnet.scenario = e.target.value as Scenario), `Savnetprofil: scenario satt til «${e.target.value}»`)}>
          {SCENARIO.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {felt('scenarioTekst', 'Hva tror vi har skjedd?', true, 'Gått seg bort, syk, skadet, gjennom isen …')}
      {felt('notater', 'Andre opplysninger', true)}

      <h3>Statistiske hovedpunkter</h3>
      <div className="boks">
        <dl className="kv">
          <dt>Kategori</dt>
          <dd>{komps.map((k) => `${k.navn}${komps.length > 1 ? ` (${Math.round(k.w * 100)} %)` : ''}`).join(', ') || '–'}</dd>
          {R && (
            <>
              <dt>Ringer</dt>
              <dd>
                R25 {fmtAvstand(R[0])} · R50 {fmtAvstand(R[1])} · R75 {fmtAvstand(R[2])} · R95 {fmtAvstand(R[3])}
              </dd>
              <dt>Gangfart</dt>
              <dd>
                {fmtFart(f.v)}, mobilitet {fmtTimer(f.mob)}
              </dd>
            </>
          )}
          <dt>Sist sett</dt>
          <dd>{fmtTid(a.sistSett)}</dd>
        </dl>
        {komps.some((k) => !k.verifisert) && <p className="liten-tekst">Statistikken er ikke kontrollert mot Lost Person Behavior.</p>}
      </div>

      <h3>Bilde (valgfritt)</h3>
      {bilde ? (
        <figure className="bilde">
          <img src={bilde} alt="Bilde av den savnede" />
        </figure>
      ) : (
        <p className="dempet">Ingen bilde.</p>
      )}
      <div className="knapperad">
        <button type="button" className="knapp" onClick={() => filRef.current?.click()}>
          {bilde ? 'Bytt bilde' : 'Legg inn bilde'}
        </button>
        {bilde && (
          <button type="button" className="knapp fare" onClick={() => void settBilde(null)}>
            Fjern bilde
          </button>
        )}
        <input
          ref={filRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const fil = e.target.files?.[0];
            e.target.value = '';
            if (!fil) return;
            try {
              await settBilde(await forminsk(fil));
            } catch (err) {
              useStore.getState().melding(err instanceof Error ? err.message : 'Kunne ikke lese bildet.', 'feil');
            }
          }}
        />
      </div>
    </div>
  );
}

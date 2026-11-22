import { useRef, useState } from 'react';
import { eksporterCsv, importerCsv } from '../../data/csv';
import { kopierStatistikk, valider, type LpbKategori, type Ringer, type Terreng } from '../../data/lpb-stats';
import { MODELL_FELT, SPORRESSURSER, STANDARD_MODELL, type Observasjonsklasse } from '../../data/modellantakelser';
import { useStore } from '../../state/store';
import { Advarsel, lastNed, Modellmerke } from '../felles';

const RFELT: Array<keyof Ringer> = ['r25', 'r50', 'r75', 'r95'];

export function StatistikkFane() {
  const stats = useStore((s) => s.statistikk);
  const settStat = useStore((s) => s.settStatistikk);
  const a = useStore((s) => s.aksjon);
  const endre = useStore((s) => s.endreAksjon);
  const [terreng, setTerreng] = useState<Terreng>(a.terreng);
  const filRef = useRef<HTMLInputElement>(null);
  const antallOk = stats.filter((s) => s.verifisert).length;

  const oppdater = (key: string, fn: (k: LpbKategori) => void) => {
    settStat(
      stats.map((s) => {
        if (s.key !== key) return s;
        const c = { ...s, fjell: { ...s.fjell }, flatt: { ...s.flatt } };
        fn(c);
        return c;
      }),
    );
  };
  const tall = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);

  return (
    <div className="fane">
      <Advarsel>
        <b>Tallene må kontrolleres mot tabellene i Lost Person Behavior (Koester).</b> Plassholderne er overtatt fra prototypen og er ikke slått opp i
        boka. Huk av «Verifisert» per kategori når tallene er kontrollert. {antallOk} av {stats.length} kategorier er verifisert.
      </Advarsel>
      <div className="rad">
        <label>
          Viser sett for
          <select value={terreng} onChange={(e) => setTerreng(e.target.value as Terreng)}>
            <option value="fjell">Fjell / kupert terreng</option>
            <option value="flatt">Flatt terreng</option>
          </select>
        </label>
      </div>
      <div className="tabellramme">
        <table className="stat">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>R25</th>
              <th>R50</th>
              <th>R75</th>
              <th>R95</th>
              <th title="Gangfart km/t">km/t</th>
              <th title="Mobilitetstid i timer">Mob. t</th>
              <th>Verifisert</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const feil = valider(s[terreng]);
              return (
                <tr key={s.key} className={s.verifisert ? '' : 'ikke-verifisert'}>
                  <th scope="row" title={s.kilde}>
                    {s.navn}
                    {feil.length > 0 && <div className="feiltekst">{feil.join(' ')}</div>}
                  </th>
                  {RFELT.map((f) => (
                    <td key={f}>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        value={s[terreng][f]}
                        aria-label={`${s.navn} ${f.toUpperCase()} km`}
                        onChange={(e) => oppdater(s.key, (c) => void (c[terreng][f] = tall(e.target.value)))}
                      />
                    </td>
                  ))}
                  <td>
                    <input type="number" step={0.1} min={0} value={s.gangfart} aria-label={`${s.navn} gangfart`} onChange={(e) => oppdater(s.key, (c) => void (c.gangfart = tall(e.target.value)))} />
                  </td>
                  <td>
                    <input type="number" step={1} min={0} value={s.mobilitet} aria-label={`${s.navn} mobilitet`} onChange={(e) => oppdater(s.key, (c) => void (c.mobilitet = tall(e.target.value)))} />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={s.verifisert}
                      aria-label={`${s.navn} verifisert`}
                      onChange={(e) => {
                        oppdater(s.key, (c) => {
                          c.verifisert = e.target.checked;
                          if (e.target.checked && c.kilde.startsWith('Plassholder')) c.kilde = 'Kontrollert mot Lost Person Behavior i appen';
                        });
                        endre(() => {}, `Statistikk: «${s.navn}» merket ${e.target.checked ? 'verifisert' : 'ikke verifisert'}`);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="liten-tekst dempet">R-verdier i km (avstand i rett linje fra IPP til funnsted).</p>
      <div className="knapperad">
        <button type="button" className="knapp" onClick={() => filRef.current?.click()}>
          Importer CSV
        </button>
        <input
          ref={filRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const r = importerCsv(await f.text(), stats);
            if (r.endret.length) settStat(r.stats);
            const m = useStore.getState().melding;
            if (r.endret.length) {
              m(`Importert: ${r.endret.join(', ')}.`, 'ok');
              endre(() => {}, `Statistikk importert fra CSV (${f.name}): ${r.endret.join(', ')}`);
            }
            for (const x of r.feil.slice(0, 4)) m(x, 'feil');
          }}
        />
        <button type="button" className="knapp" onClick={() => lastNed('lpb-statistikk.csv', eksporterCsv(stats), 'text/csv;charset=utf-8')}>
          Eksporter CSV (mal)
        </button>
        <button
          type="button"
          className="knapp"
          onClick={async () => {
            const ok = await useStore.getState().bekreft({
              tittel: 'Tilbakestille statistikken?',
              tekst: 'Alle tall settes tilbake til plassholderne fra prototypen, og ingen kategorier er lenger verifisert.',
              ja: 'Tilbakestill',
              nei: 'Avbryt',
              fare: true,
            });
            if (ok) settStat(kopierStatistikk());
          }}
        >
          Tilbakestill til plassholdere
        </button>
      </div>
      <p className="liten-tekst dempet">
        CSV-kolonner: kategori;terreng;r25;r50;r75;r95;gangfart;mobilitet;verifisert;kilde. Terreng kan være fjell, flatt eller tom (begge).
      </p>

      <h3>
        Modellantakelser <Modellmerke />
      </h3>
      <Advarsel type="info">
        Vektene under er forslag til hvordan sannsynlighetskartet og gangtiden regnes, <b>ikke fra HRS</b>. De gjelder denne aksjonen og lagres i
        aksjonsfila. Se docs/modell.md.
      </Advarsel>
      <div className="modellfelt">
        {MODELL_FELT.map((f) => (
          <label key={f.felt} title={f.hjelp}>
            {f.navn}
            <input
              type="number"
              step={f.steg}
              min={f.min}
              max={f.max}
              value={a.modell[f.felt]}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                endre((x) => void (x.modell[f.felt] = Math.min(f.max, Math.max(f.min, v))));
              }}
            />
          </label>
        ))}
        {(['sikker', 'sannsynlig', 'mulig', 'usikker'] as Observasjonsklasse[]).map((k) => (
          <label key={k}>
            Vekt for {k} observasjon
            <input
              type="number"
              step={0.5}
              min={0}
              max={50}
              value={a.modell.obsVekt[k]}
              onChange={(e) => endre((x) => void (x.modell.obsVekt[k] = Math.max(0, Number(e.target.value) || 0)))}
            />
          </label>
        ))}
        <label className="avkryss">
          <input type="checkbox" checked={a.modell.elvErBarriere} onChange={(e) => endre((x) => void (x.modell.elvErBarriere = e.target.checked))} />
          Elver er barrierer (bekker kan krysses)
        </label>
      </div>
      <h3>
        Søkebredde for GPS-spor (m) <Modellmerke />
      </h3>
      <p className="liten-tekst dempet">Effektiv søkebredde per spor. Brukes i dekning C = bredde × lengde / areal og foreslått POD = 1 − e^(−C).</p>
      <div className="modellfelt">
        {SPORRESSURSER.map((r) => (
          <label key={r.type}>
            {r.navn}
            <input
              type="number"
              step={5}
              min={1}
              max={1000}
              value={a.modell.sokebredde[r.type]}
              onChange={(e) => endre((x) => void (x.modell.sokebredde[r.type] = Math.max(1, Number(e.target.value) || 1)))}
              onBlur={(e) => endre(() => {}, `Søkebredde for ${r.navn.toLowerCase()} satt til ${e.target.value} m`)}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="knapp"
        onClick={() => endre((x) => void (x.modell = structuredClone(STANDARD_MODELL)), 'Modellantakelser tilbakestilt')}
      >
        Tilbakestill modellantakelser
      </button>
    </div>
  );
}

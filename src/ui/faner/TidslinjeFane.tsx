import { useState } from 'react';
import { aksjonsfilnavn, timerMellom } from '../../domain/aksjon';
import type { LatLng } from '../../domain/coords';
import { prosent } from '../../domain/pod';
import { sample, tilGrid } from '../../model/grid';
import type { BeregningResultat } from '../../model/beregning';
import { useStore } from '../../state/store';
import { lastNed, VisKnapp } from '../felles';
import { fmtFart, fmtTid, fmtTimer } from '../format';

type Hendelse = {
  tid: number;
  rad: 'sett' | 'obs' | 'sok' | 'funn';
  tittel: string;
  detalj: string;
  farge: string;
  pos?: LatLng;
  advarsel?: string;
};

const KLASSEFARGE: Record<string, string> = { sikker: '#7f1d1d', sannsynlig: '#dc2626', mulig: '#d97706', usikker: '#6b7280' };
const RADER: Array<[Hendelse['rad'], string]> = [
  ['sett', 'Sist sett'],
  ['obs', 'Observasjoner'],
  ['funn', 'Funn'],
  ['sok', 'Søk'],
];

/** Walking time (h at the person's speed) from the IPP to a position, if inside the grid. */
export function gangtidTil(r: BeregningResultat, pos: LatLng): number | null {
  const [x, y] = tilGrid(r.grid, pos);
  const t = sample(r.grid, r.T1, x, y);
  return Number.isFinite(t) ? t / r.fart.v : null;
}

function Tidsakse({ h, fra, til }: { h: Hendelse[]; fra: number; til: number }) {
  // sized for the side panel (≈ 400 px) so the text stays readable
  const W = 420;
  const radH = 30;
  const venstre = 104;
  const span = Math.max(1, til - fra);
  const x = (t: number) => venstre + ((t - fra) / span) * (W - venstre - 16);
  const timer = span / 3.6e6;
  const steg = timer <= 6 ? 1 : timer <= 24 ? 3 : 12;
  const ticks: number[] = [];
  const start = new Date(fra);
  start.setMinutes(0, 0, 0);
  for (let t = start.getTime(); t <= til; t += steg * 3.6e6) if (t >= fra) ticks.push(t);
  const H = RADER.length * radH + 28;
  return (
    <svg className="tidsakse" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tidslinje for observasjoner og søk">
      {RADER.map(([rad, navn], i) => (
        <g key={rad}>
          <line x1={venstre} x2={W - 16} y1={i * radH + 20} y2={i * radH + 20} stroke="#cbd5e1" />
          <text x={4} y={i * radH + 25} fontSize="12" fill="#334155">
            {navn}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={8} y2={H - 22} stroke="#e2e8f0" />
          <text x={x(t)} y={H - 6} fontSize="11" textAnchor="middle" fill="#475569">
            {String(new Date(t).getHours()).padStart(2, '0')}:00
          </text>
        </g>
      ))}
      <line x1={x(til)} x2={x(til)} y1={4} y2={H - 22} stroke="#c8102e" strokeDasharray="4 3" />
      {h.map((e, i) => {
        const rad = RADER.findIndex(([r]) => r === e.rad);
        return (
          <g key={i}>
            <circle cx={x(e.tid)} cy={rad * radH + 20} r={6.5} fill={e.farge} stroke={e.advarsel ? '#facc15' : '#fff'} strokeWidth={e.advarsel ? 4 : 2}>
              <title>{`${fmtTid(new Date(e.tid).toISOString())} ${e.tittel}`}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

export function TidslinjeFane() {
  const a = useStore((s) => s.aksjon);
  const r = useStore((s) => s.resultat);
  const naa = useStore((s) => s.naa);
  const [filter, setFilter] = useState('');

  const sistSett = a.sistSett ? new Date(a.sistSett).getTime() : null;
  const h: Hendelse[] = [];
  if (sistSett && Number.isFinite(sistSett)) h.push({ tid: sistSett, rad: 'sett', tittel: 'Sist sett (IPP)', detalj: '', farge: '#c8102e', pos: a.ipp ?? undefined });
  for (const p of a.punkter) {
    const t = new Date(p.tid).getTime();
    if (!Number.isFinite(t)) continue;
    if (p.type === 'obs' || p.type === 'funn') {
      let advarsel: string | undefined;
      let detalj = p.tekst;
      if (p.type === 'obs' && r && sistSett) {
        const behov = gangtidTil(r, p.pos);
        const tilgj = timerMellom(a.sistSett, new Date(t));
        if (behov != null && tilgj != null) {
          detalj = `${p.tekst ? p.tekst + ' · ' : ''}${fmtTimer(behov)} gange fra IPP, ${fmtTimer(Math.max(0, tilgj))} etter sist sett`;
          if (tilgj < 0) advarsel = 'Observasjonen er før tidspunktet sist sett.';
          else if (behov > tilgj * 1.05) {
            const kreves = r.fart.v * (behov / Math.max(tilgj, 0.01));
            advarsel = `Personen rekker ikke hit med kategoriens gangfart (krever ca. ${fmtFart(kreves)}). Vurder observasjonen, IPP eller tidspunktet.`;
          }
        }
      }
      h.push({
        tid: t,
        rad: p.type,
        tittel: `${p.id}${p.type === 'obs' ? ` (${p.klasse})` : ' – funn'}`,
        detalj,
        farge: p.type === 'obs' ? KLASSEFARGE[p.klasse] : '#0369a1',
        pos: p.pos,
        advarsel,
      });
    }
  }
  for (const t of a.teiger) {
    for (const s of t.sok) {
      const tid = new Date(s.tid).getTime();
      if (Number.isFinite(tid)) {
        h.push({ tid, rad: 'sok', tittel: `${[t.id, s.org, s.ressurstype, s.enhet].filter(Boolean).join('–')}`, detalj: `POD ${prosent(s.pod, 0)}`, farge: '#ea580c' });
      }
    }
  }
  h.sort((x, y) => x.tid - y.tid);
  const fra = h.length ? Math.min(h[0].tid, naa - 3.6e6) : naa - 3 * 3.6e6;
  const logg = a.logg
    .slice()
    .reverse()
    .filter((l) => !filter || l.tekst.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="fane">
      <p className="dempet">
        Tidslinje for sist sett, observasjoner, funn og søk (veileder 5.3). En gul ring betyr at observasjonen ikke stemmer med hvor langt personen kan
        ha gått.
      </p>
      {h.length ? <Tidsakse h={h} fra={fra} til={naa} /> : <p className="dempet">Ingen hendelser med tidspunkt ennå.</p>}
      <ol className="liste">
        {h.map((e, i) => (
          <li key={i}>
            <div className="linje">
              <b>
                <i className="farge" style={{ background: e.farge }} /> {fmtTid(new Date(e.tid).toISOString())} – {e.tittel}
              </b>
              {e.pos && <VisKnapp pos={e.pos} zoom={15} />}
            </div>
            {e.detalj && <div className="dempet liten-tekst">{e.detalj}</div>}
            {e.advarsel && <div className="varsel">{e.advarsel}</div>}
          </li>
        ))}
      </ol>

      <h3>Aksjonslogg ({a.logg.length})</h3>
      <div className="rad">
        <input className="bred" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer, f.eks. T003 eller IPP" aria-label="Filtrer loggen" />
        <button
          type="button"
          className="knapp"
          onClick={() =>
            lastNed(
              aksjonsfilnavn(a, 'logg.txt'),
              a.logg.map((l) => `${new Date(l.tid).toLocaleString('nb-NO')}\t${l.tekst}`).join('\r\n'),
              'text/plain;charset=utf-8',
            )
          }
        >
          Lagre logg (.txt)
        </button>
      </div>
      <ol className="logg">
        {logg.slice(0, 500).map((l, i) => (
          <li key={i}>
            <span className="mono dempet">{fmtTid(l.tid)}</span> {l.tekst}
          </li>
        ))}
      </ol>
    </div>
  );
}

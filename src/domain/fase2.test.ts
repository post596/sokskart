import { describe, expect, it } from 'vitest';
import { kvalitetssikring, overlapperSirkel, type XY } from './kvalitet';
import { dekning, forenkle, lengdeInnenfor, lesGpx, ressursFraKode, tolkSporloggnavn } from './sporimport';

const kvadrat = (x: number, y: number, s: number): XY[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

describe('kvalitetssikring (veileder 7.5.2)', () => {
  it('teig overlapper sirkel når et hjørne, en kant eller sentrum er innenfor', () => {
    expect(overlapperSirkel(kvadrat(-10, -10, 20), 0, 0, 5)).toBe(true); // centre inside
    expect(overlapperSirkel(kvadrat(90, -10, 20), 0, 0, 100)).toBe(true); // edge within r
    expect(overlapperSirkel(kvadrat(101, -10, 20), 0, 0, 100)).toBe(false);
  });
  it('krever > 95 % innenfor R50 og ≥ 50 % innenfor R75', () => {
    const r = kvalitetssikring(
      [
        { id: 'T001', ring: kvadrat(-100, -100, 200), akkPod: 0.96, poa: 0.1 },
        { id: 'T002', ring: kvadrat(400, 0, 200), akkPod: 0.6, poa: 0.1 },
        { id: 'T003', ring: kvadrat(-300, 0, 100), akkPod: 0.95, poa: 0.1 },
        { id: 'T004', ring: kvadrat(1500, 0, 100), akkPod: 0.4, poa: 0.1 },
        { id: 'T005', ring: kvadrat(5000, 0, 100), akkPod: 0, poa: 0.1 },
      ],
      [0, 0],
      500,
      1600,
    );
    const by = Object.fromEntries(r.teiger.map((t) => [t.id, t]));
    expect(by.T001).toMatchObject({ iR50: true, krav: 0.95, oppfylt: true });
    expect(by.T002).toMatchObject({ iR50: true, oppfylt: false }); // touches R50, only 60 %
    expect(by.T003).toMatchObject({ iR50: true, oppfylt: false }); // exactly 95 % is not > 95 %
    expect(by.T004).toMatchObject({ iR50: false, iR75: true, krav: 0.5, oppfylt: false });
    expect(by.T005).toMatchObject({ iR75: false, krav: null, oppfylt: true });
    expect(r.ikkeOppfylt.map((t) => t.id)).toEqual(['T002', 'T003', 'T004']);
    expect(r.alleOppfylt).toBe(false);
  });
  it('markerer teiger med markert høyere gjenstående POA', () => {
    const r = kvalitetssikring(
      [
        { id: 'A', ring: kvadrat(0, 0, 10), akkPod: 0, poa: 0.3 },
        { id: 'B', ring: kvadrat(0, 0, 10), akkPod: 0, poa: 0.05 },
        { id: 'C', ring: kvadrat(0, 0, 10), akkPod: 0, poa: 0.05 },
      ],
      [1e6, 1e6],
      1,
      2,
    );
    expect(r.hoyPoa.map((t) => t.id)).toEqual(['A']);
  });
});

describe('GPX-import', () => {
  const gpx = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">
    <trk><name>T005–281345–RK–Drone–71</name><trkseg>
      <trkpt lat="61.60" lon="8.40"><ele>1100</ele><time>2026-11-28T13:30:00Z</time></trkpt>
      <trkpt lon="8.41" lat="61.61"><time>2026-11-28T13:45:00Z</time></trkpt>
    </trkseg></trk>
    <rte><name>Rute &amp; mer</name><rtept lat="61.5" lon="8.5"/><rtept lat="61.6" lon="8.6"/></rte>
  </gpx>`;
  it('leser spor og ruter, også med byttet attributtrekkefølge og tid', () => {
    const s = lesGpx(gpx);
    expect(s).toHaveLength(2);
    expect(s[0].navn).toBe('T005–281345–RK–Drone–71');
    expect(s[0].pts[1]).toEqual({ lat: 61.61, lng: 8.41, tid: '2026-11-28T13:45:00Z' });
    expect(s[1].navn).toBe('Rute & mer');
  });
  it('tolker veilederens sporloggnavn', () => {
    expect(tolkSporloggnavn('T005–281345–RK–Drone–71')).toEqual({ avgrensning: 'T005', ddttmm: '281345', org: 'RK', type: 'Drone', id: '71' });
    expect(tolkSporloggnavn('L013-281345-P-HF-V30A')?.type).toBe('HF');
    expect(tolkSporloggnavn('Morgentur')).toBeNull();
    expect(ressursFraKode('HF')).toBe('hundefører');
    expect(ressursFraKode('Msk')).toBe('fotmannskap');
    expect(ressursFraKode('ATV')).toBe('motorisert');
  });
  it('forenkler rette strekk og beholder knekk', () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [1, 0.1],
      [2, 0],
      [3, 0.1],
      [4, 0],
      [4, 10],
    ];
    const f = forenkle(pts, (p) => p, 1);
    expect(f).toEqual([
      [0, 0],
      [4, 0],
      [4, 10],
    ]);
  });
});

describe('dekning og POD fra spor', () => {
  it('måler lengden av sporet som ligger inne i teigen', () => {
    const teig = kvadrat(0, 0, 100);
    expect(
      lengdeInnenfor(
        [
          [-50, 50],
          [150, 50],
        ],
        teig,
      ),
    ).toBeCloseTo(100, 0);
  });
  it('POD = 1 − e^(−C)', () => {
    // 3 crew tracks of 1000 m with 30 m sweep width in 0,1 km²: C = 0,9
    const d = dekning(
      [
        { sporId: 'a', bredde: 30, lengde: 1000 },
        { sporId: 'b', bredde: 30, lengde: 1000 },
        { sporId: 'c', bredde: 30, lengde: 1000 },
      ],
      100000,
    );
    expect(d.C).toBeCloseTo(0.9, 10);
    expect(d.pod).toBeCloseTo(1 - Math.exp(-0.9), 10);
    expect(dekning([], 0)).toEqual({ C: 0, pod: 0 });
  });
});

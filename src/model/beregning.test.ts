import { describe, expect, it } from 'vitest';
import { STANDARD_MODELL } from '../data/modellantakelser';
import { distanceM } from '../domain/geo';
import { fromUtm, toUtm } from '../domain/utm';
import { beregn, gridFor, type BeregningInput } from './beregning';
import type { Komponent } from './lpb';
import { rekkeviddeFaktor } from './sannsynlighet';
import { droneFlytid } from './soketid';
import type { OsmData } from './typer';

// IPP in Jotunheimen (near Spiterstulen)
const IPP = { lat: 61.6265, lng: 8.4006 };
const u0 = toUtm(IPP.lat, IPP.lng, 32);
const at = (de: number, dn: number) => {
  const g = fromUtm(32, u0.e + de, u0.n + dn);
  return { lat: g.lat, lng: g.lon };
};
const turgaer: Komponent = { key: 'turgaer', navn: 'Turgåer', w: 1, r: [700, 1900, 3600, 11300], v: 3, mob: 12, verifisert: false };
const m = { ...STANDARD_MODELL, rutenett: 160 };

const osm: OsmData = {
  linjer: [
    // trail eastwards from the IPP
    { id: 'w1', type: 'sti', navn: 'Stien', elv: false, pts: [at(0, 0), at(4000, 0), at(9000, 0)] },
    // a road far north
    { id: 'w2', type: 'vei', navn: 'Vegen', elv: false, pts: [at(-9000, 8000), at(9000, 8000)] },
  ],
  omrader: [{ id: 'w3', type: 'vann', navn: 'Tjønna', ringer: [[at(-3000, -3000), at(-1500, -3000), at(-1500, -1500), at(-3000, -1500), at(-3000, -3000)]] }],
  stup: [],
  punkter: [{ id: 'n4', type: 'hytte', navn: 'Hytta', pos: at(2000, 2000) }],
  senter: IPP,
  radiusM: 10000,
  hentet: '',
  kilde: 'test',
};

function input(over: Partial<BeregningInput> = {}): BeregningInput {
  return {
    ipp: IPP,
    sone: '32',
    komps: [turgaer],
    m,
    timerSidenSistSett: null,
    osm: null,
    osmVersjon: '0',
    hoyde: null,
    hoydeVersjon: '0',
    observasjoner: [],
    teiger: [],
    reflekser: [],
    visningTimer: null,
    merkatorBredde: 160,
    ...over,
  };
}

describe('rekkevidde', () => {
  it('er 1 innenfor og faller raskt utenfor', () => {
    expect(rekkeviddeFaktor(1, 2, 0.2)).toBe(1);
    expect(rekkeviddeFaktor(2.45, 2, 0.2)).toBeCloseTo(Math.exp(-1), 6);
    expect(rekkeviddeFaktor(4, 2, 0.2)).toBeLessThan(1e-6);
    expect(rekkeviddeFaktor(Infinity, 2, 0.2)).toBe(0);
  });
});

describe('beregning uten ledelinjer og tid', () => {
  const r = beregn(input());
  it('lager et rutenett tilpasset R95', () => {
    expect(r.grid.half).toBe(17000);
    expect(r.grid.n).toBe(161);
    expect(gridFor(IPP, '32', [turgaer], m).half).toBe(17000);
  });
  it('gir ringene for kategorien', () => {
    expect(r.ringer[0]).toBeCloseTo(700, 0);
    expect(r.ringer[3]).toBeCloseTo(11300, 0);
  });
  it('fordeler sannsynligheten omtrent som ringene (25 % innenfor R25 osv.)', () => {
    // the 50 % band of a radial distribution is about π·R50²
    const a50 = (Math.PI * 1.9 ** 2);
    expect(r.arealKm2[1] / a50).toBeGreaterThan(0.85);
    expect(r.arealKm2[1] / a50).toBeLessThan(1.15);
    expect(r.arealKm2[0]).toBeLessThan(r.arealKm2[1]);
    expect(r.arealKm2[2]).toBeLessThan(r.arealKm2[3]);
  });
  it('mest sannsynlige punkt ligger nær IPP', () => {
    expect(r.punkter[0].avstandM).toBeLessThan(800);
    expect(r.sokt).toBeCloseTo(0, 10);
  });
});

describe('ledelinjer, vann og gangtid', () => {
  const r = beregn(input({ osm, osmVersjon: '1' }));
  it('rangerer stien fra IPP over veien langt unna', () => {
    expect(r.linjer[0].id).toBe('w1');
    expect(r.linjer[0].na).toBeGreaterThan(r.linjer[1].na);
    expect(r.korridorAndel).toBeGreaterThan(0.05);
  });
  it('går raskere langs stien enn i terrenget', () => {
    const g = r.grid;
    const iE = Math.floor((u0.e + 4000 - g.west) / g.cell);
    const jN = Math.floor((g.north - (u0.n + 4000)) / g.cell);
    const j0 = Math.floor((g.north - u0.n) / g.cell);
    const i0 = Math.floor((u0.e - g.west) / g.cell);
    const paSti = r.T1[j0 * g.n + iE];
    const iTerreng = r.T1[jN * g.n + i0];
    expect(paSti).toBeLessThan(iTerreng);
    // 4 km along the trail at 1 km/h ≈ 4 h (grid discretisation allows a few %)
    expect(paSti).toBeGreaterThan(3.8);
    expect(paSti).toBeLessThan(4.4);
  });
  it('gir lav sannsynlighet i vannet', () => {
    const g = r.grid;
    const i = Math.floor((u0.e - 2250 - g.west) / g.cell);
    const j = Math.floor((g.north - (u0.n - 2250)) / g.cell);
    const i2 = Math.floor((u0.e + 2250 - g.west) / g.cell);
    expect(r.band[j * g.n + i]).not.toBe(0);
    expect(Number.isFinite(r.T1[j * g.n + i])).toBe(false);
    expect(Number.isFinite(r.T1[j * g.n + i2])).toBe(true);
  });
  it('har gangtid for hvert knekkpunkt på linjene', () => {
    expect(r.linjeStart[r.linjeStart.length - 1]).toBe(5);
    expect(r.linjeTider[0]).toBeLessThan(0.2);
  });
});

describe('søk og observasjoner', () => {
  const teig = { id: 'T001', ringer: [[at(-500, -500), at(500, -500), at(500, 500), at(-500, 500)]], pod: 0.6 };
  it('søk i en teig flytter sannsynligheten og gir POS = POA × POD', () => {
    const for0 = beregn(input({ teiger: [{ ...teig, pod: 0 }] }));
    const etter = beregn(input({ teiger: [teig] }));
    const poa = for0.teiger[0].poaFor;
    expect(poa).toBeGreaterThan(0.05);
    expect(etter.sokt).toBeCloseTo(poa * 0.6, 6);
    expect(etter.teiger[0].poaFor).toBeCloseTo(poa, 10);
    // POA now = remaining / (1 − POS)
    expect(etter.teiger[0].poaNa).toBeCloseTo((poa * 0.4) / (1 - poa * 0.6), 6);
  });
  const masseNaer = (rr: ReturnType<typeof beregn>, de: number, dn: number, radius: number) => {
    const g = rr.grid;
    let s = 0;
    for (let j = 0; j < g.n; j++) {
      for (let i = 0; i < g.n; i++) {
        const e = g.west + (i + 0.5) * g.cell;
        const nn = g.north - (j + 0.5) * g.cell;
        if (Math.hypot(e - (u0.e + de), nn - (u0.n + dn)) < radius) s += rr.post[j * g.n + i];
      }
    }
    return s;
  };

  it('sikker og sannsynlig blir nytt utgangspunkt også langt fra IPP (veileder 5.3)', () => {
    const pos = at(6000, -6000);
    const obs = (klasse: 'sikker' | 'sannsynlig' | 'mulig' | 'usikker') =>
      masseNaer(beregn(input({ observasjoner: [{ pos, timerSiden: 0.5, klasse }] })), 6000, -6000, 1500);
    const ingen = masseNaer(beregn(input()), 6000, -6000, 1500);
    const sikker = obs('sikker');
    const sannsynlig = obs('sannsynlig');
    const mulig = obs('mulig');
    // share w/(w + K) with K = 3: sikker 6/9, sannsynlig 3/6
    expect(sikker).toBeGreaterThan(0.6);
    expect(sikker).toBeLessThan(6 / 9 + ingen + 0.01);
    expect(sannsynlig).toBeGreaterThan(0.45);
    expect(sannsynlig).toBeLessThan(sikker);
    // mulig only weights locally: little effect where the probability is low
    expect(mulig).toBeLessThan(0.05);
    expect(mulig).toBeGreaterThan(ingen);
    expect(obs('usikker')).toBeCloseTo(ingen, 12);
    const r = beregn(input({ observasjoner: [{ pos, timerSiden: 0.5, klasse: 'sikker' }] }));
    expect(distanceM(r.punkter[0].pos, pos)).toBeLessThan(600);
  });

  it('mulig observasjon vekter lokalt nær IPP', () => {
    const pos = at(1500, -1500);
    const ingen = masseNaer(beregn(input()), 1500, -1500, 600);
    const mulig = masseNaer(beregn(input({ observasjoner: [{ pos, timerSiden: 0.5, klasse: 'mulig' }] })), 1500, -1500, 600);
    expect(mulig / ingen).toBeGreaterThan(1.3);
    expect(mulig / ingen).toBeLessThan(2.01);
  });

  it('spredningen rundt observasjonen øker med tiden siden den ble gjort', () => {
    const pos = at(6000, -6000);
    const fersk = masseNaer(beregn(input({ observasjoner: [{ pos, timerSiden: 0, klasse: 'sikker' }] })), 6000, -6000, 400);
    const gammel = masseNaer(beregn(input({ observasjoner: [{ pos, timerSiden: 3, klasse: 'sikker' }] })), 6000, -6000, 400);
    expect(fersk).toBeGreaterThan(gammel);
  });
});

describe('ferdig sjekket punkt og ledelinje', () => {
  it('et sjekket punkt fjerner POD × dekket andel av sannsynligheten i cella', () => {
    const uten = beregn(input());
    const g = uten.grid;
    // the centre of the cell about 600 m east of the IPP, so the 50 m disc stays inside it
    const i = Math.floor((u0.e + 600 - g.west) / g.cell);
    const j = Math.floor((g.north - u0.n) / g.cell);
    const de = g.west + (i + 0.5) * g.cell - u0.e;
    const dn = g.north - (j + 0.5) * g.cell - u0.n;
    const med = beregn(input({ innsats: { punkter: [at(de, dn)], linjer: [] } }));
    const k = j * g.n + i;
    const andel = (Math.PI * m.sjekketPunktM ** 2) / ((g.cell / g.k) ** 2);
    expect(med.sokt / (uten.post[k] * m.sjekketPunktPod * andel)).toBeCloseTo(1, 1);
    expect(med.post[k]).toBeLessThan(uten.post[k]);
  });
  it('en sjekket ledelinje senker sannsynligheten langs linja', () => {
    const r0 = beregn(input({ osm, osmVersjon: '1' }));
    const r1 = beregn(input({ osm, osmVersjon: '1', innsats: { punkter: [], linjer: [osm.linjer[0].pts] } }));
    const w1 = (r: typeof r0) => r.linjer.find((l) => l.id === 'w1')!.na;
    expect(w1(r1)).toBeLessThan(w1(r0) * 0.9);
    expect(r1.sokt).toBeGreaterThan(0.005);
  });
});

describe('GPS-spor', () => {
  // a foot team walked the trail w1 from the IPP 4 km east
  const spor = { id: 's1', ressurs: 'fotmannskap' as const, pts: [at(0, 5), at(4000, 5)], utelat: [] as string[] };
  const T001 = { id: 'T001', ringer: [[at(500, -500), at(2000, -500), at(2000, 500), at(500, 500)]], pod: 0 };
  it('senker sannsynligheten langs sporet og merker linja som søkt når sporet følger nok av den', () => {
    const uten = beregn(input({ osm, osmVersjon: '1' }));
    const med = beregn(input({ osm, osmVersjon: '1', innsats: { punkter: [], linjer: [], spor: [spor] } }));
    const w1 = (r: typeof uten) => r.linjer.find((l) => l.id === 'w1')!.na;
    expect(w1(med)).toBeLessThan(w1(uten));
    expect(med.sokt).toBeGreaterThan(0);
    // the track covers 4 of the 9 km of w1: below 70 %, so not marked
    expect(med.sporLinjer.find((l) => l.id === 'w1')).toBeUndefined();
    const hele = beregn(input({ osm, osmVersjon: '1', innsats: { punkter: [], linjer: [], spor: [{ ...spor, pts: [at(0, 5), at(9000, 5)] }] } }));
    expect(hele.sporLinjer.find((l) => l.id === 'w1')).toMatchObject({ spor: ['s1'] });
  });
  it('et spor koblet til et registrert søk i T001 virker ikke inne i T001, men utenfor', () => {
    const fritt = beregn(input({ osm, osmVersjon: '1', teiger: [T001], innsats: { punkter: [], linjer: [], spor: [spor] } }));
    const koblet = beregn(input({ osm, osmVersjon: '1', teiger: [T001], innsats: { punkter: [], linjer: [], spor: [{ ...spor, utelat: ['T001'] }] } }));
    const uten = beregn(input({ osm, osmVersjon: '1', teiger: [T001] }));
    // inside T001 the linked track removes nothing (POA before searches = prior share in T001)
    const tapI = (r: typeof uten) => r.teiger[0].poaFor - r.teiger[0].poaNa * (1 - r.sokt);
    expect(tapI(koblet)).toBeCloseTo(tapI(uten), 6);
    expect(tapI(fritt)).toBeGreaterThan(tapI(koblet) + 1e-4);
    // outside it still counts
    expect(koblet.sokt).toBeGreaterThan(0);
    expect(fritt.teiger[0].sporDekning).toBeGreaterThan(0);
  });
});

describe('søk i teig', () => {
  it('POS = POA før søk × POD, og POA utenfor teiger er resten', () => {
    const ring = [at(-3000, -3000), at(0, -3000), at(0, 3000), at(-3000, 3000)];
    const s = beregn(input({ teiger: [{ id: 'T001', ringer: [ring], pod: 0.5 }] }));
    expect(s.sokt).toBeCloseTo(0.5 * s.teiger[0].poaFor, 10);
    expect(s.utenforTeiger).toBeCloseTo(1 - s.teiger[0].poaNa, 10);
  });
});

describe('teig- og droneforslag', () => {
  it('foreslår teiger langs naturlige grenser innenfor maks søketid og areal', () => {
    const r = beregn(input({ osm, osmVersjon: '1', forslagOnske: { teig: { modus: 'neste', antall: 4, teknikk: 'grovsok' }, drone: null } }));
    expect(r.teigforslag).toHaveLength(4);
    for (const t of r.teigforslag) {
      expect(t.timer).toBeLessThanOrEqual(m.maksSoketid * 1.1);
      expect(t.arealKm2).toBeLessThanOrEqual(m.maksTeigKm2);
      expect(t.ring.length).toBeGreaterThan(4);
    }
    // sorted by probability
    expect(r.teigforslag[0].poa).toBeGreaterThanOrEqual(r.teigforslag[3].poa);
  });
  it('gir en begrunnelse med rang, soner, terreng og teknikk for hvert forslag', () => {
    const fase = { navn: 'Overgang', timer: 7, grunn: '3 lag' };
    const r = beregn(input({ osm, osmVersjon: '1', forslagOnske: { teig: { modus: 'neste', antall: 4, teknikk: 'grovsok', fase }, drone: null } }));
    const g = r.teigforslag.map((t) => t.grunnlag!);
    expect(g.map((x) => x.rang)).toEqual([1, 2, 3, 4]);
    expect(g.every((x) => x.antall === 4)).toBe(true);
    for (let i = 1; i < g.length; i++) expect(g[i].poaKum).toBeGreaterThanOrEqual(g[i - 1].poaKum);
    expect(g[3].poaKum).toBeCloseTo(r.teigforslag.reduce((s, t) => s + t.poa, 0), 4);
    for (const x of g) {
      expect(x.soner.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
      expect(x.teknikk?.navn).toContain('Grovsøk');
      expect(x.fase).toEqual(fase);
      expect(JSON.parse(JSON.stringify(x))).toEqual(x); // plain JSON
    }
    expect(r.teigforslag.every((t) => t.teknikk === 'grovsok')).toBe(true);
    // the trail runs east from the IPP: the best teig should contain it
    expect(g.some((x) => x.linjer.some((l) => l.id === 'w1'))).toBe(true);
  });
  it('finsøk av navet dekker R25', () => {
    const r = beregn(input({ forslagOnske: { teig: { modus: 'navet', antall: 0, teknikk: 'finsok' }, drone: null } }));
    const sum = r.teigforslag.reduce((s, t) => s + t.arealKm2, 0);
    expect(sum).toBeGreaterThan(Math.PI * 0.7 ** 2 * 0.8);
    expect(sum).toBeLessThan(Math.PI * 0.7 ** 2 * 1.3);
  });
  it('foreslår droneområder på 0,2–0,45 km² (ca. ett batteri)', () => {
    const r = beregn(input({ forslagOnske: { teig: null, drone: { antall: 3 } } }));
    expect(r.droneforslag.length).toBeGreaterThan(0);
    for (const d of r.droneforslag) {
      expect(d.arealKm2).toBeLessThanOrEqual(m.droneMaksKm2);
      expect(d.arealKm2).toBeGreaterThanOrEqual(0.06);
      expect(droneFlytid(d.arealKm2, m).batterier).toBe(1);
      expect(d.grunnlag?.drone?.batterier).toBe(1);
      expect(d.grunnlag?.drone?.effekt).toBeGreaterThanOrEqual(0.5);
    }
  });
  it('lager ingen forslag når de ikke er bedt om', () => {
    const r = beregn(input());
    expect(r.teigforslag).toEqual([]);
    expect(r.droneforslag).toEqual([]);
  });
});

describe('interessepunkter per kategori', () => {
  it('turgåer får hytta som forslag', () => {
    const r = beregn(input({ osm, osmVersjon: '1' }));
    expect(r.poiforslag.some((p) => p.type === 'hytte' && p.navn === 'Hytta')).toBe(true);
  });
  it('økt selvmordsrisiko prioriterer bru foran lekeplass', () => {
    const suicid: Komponent = { key: 'suicid', navn: 'Økt selvmordsrisiko', w: 1, r: [200, 600, 1800, 9000], v: 2, mob: 8, verifisert: false };
    const o: OsmData = {
      ...osm,
      punkter: [
        { id: 'b1', type: 'bru', navn: 'Brua', pos: at(300, 300) },
        { id: 'l1', type: 'lekeplass', navn: 'Leiken', pos: at(-300, -300) },
      ],
    };
    const r = beregn(input({ komps: [suicid], osm: o, osmVersjon: '2' }));
    expect(r.poiforslag[0].type).toBe('bru');
    expect(r.poiforslag.some((p) => p.type === 'lekeplass')).toBe(false);
  });
  it('forklarer hvorfor hvert punkt foreslås', () => {
    const r = beregn(input({ osm, osmVersjon: '1' }));
    const h = r.poiforslag.find((p) => p.type === 'hytte')!;
    expect(h.grunnlag.kilde).toBe('osm');
    expect(h.grunnlag.kildeTekst).toContain('Hytte');
    expect(h.grunnlag.bidrag[0]).toMatchObject({ kategori: 'turgaer', navn: 'Turgåer', andel: 1 });
    expect(h.grunnlag.begrunnelse[0]).toContain('turmål');
    expect(h.grunnlag.vurder).toContain('Punktsøk');
    expect(h.grunnlag.referanse).toContain('Veileder');
    expect(h.id).toMatch(/^hytte:/);
    // the lake gives a shore point with its own source
    const strand = r.poiforslag.find((p) => p.type === 'vann');
    if (strand) expect(strand.grunnlag.kilde).toBe('strand');
  });
  it('fordeler bidraget mellom flere kategorier', () => {
    const fisker: Komponent = { key: 'fisker', navn: 'Fisker', w: 0.5, r: [500, 1500, 3000, 9000], v: 2.5, mob: 10, verifisert: false };
    const r = beregn(input({ komps: [{ ...turgaer, w: 0.5 }, fisker], osm, osmVersjon: '1' }));
    const h = r.poiforslag.find((p) => p.type === 'hytte')!;
    expect(h.grunnlag.bidrag.reduce((s, b) => s + b.andel, 0)).toBeCloseTo(1, 2);
    expect(h.grunnlag.bidrag.map((b) => b.kategori)).toEqual(['turgaer', 'fisker']); // 0.5·1 vs 0.5·0.5
  });
  it('foreslår ikke punkter som allerede er registrert som refleks', () => {
    const r = beregn(input({ osm, osmVersjon: '1', reflekser: [{ id: 'R001', navn: 'Hytta', pos: at(2000, 2000) }] }));
    expect(r.poiforslag.some((p) => p.navn === 'Hytta')).toBe(false);
  });
});

describe('sperreposter', () => {
  // two lakes form a wall north–south at 2–3 km east, with a gap where the trail goes through
  const vegg = (gap: number): OsmData => ({
    ...osm,
    linjer: [osm.linjer[0]],
    omrader: [
      { id: 'n', type: 'vann', navn: '', ringer: [[at(2000, gap), at(3000, gap), at(3000, 17000), at(2000, 17000), at(2000, gap)]] },
      { id: 's', type: 'vann', navn: '', ringer: [[at(2000, -17000), at(3000, -17000), at(3000, -gap), at(2000, -gap), at(2000, -17000)]] },
    ],
    punkter: [],
  });
  const ost = (r: ReturnType<typeof beregn>) => {
    const g = r.grid;
    let s = 0;
    for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) if (g.west + (i + 0.5) * g.cell > g.cx + 3200) s += r.post[j * g.n + i];
    return s;
  };
  const odds = (p: number) => p / (1 - p);
  const post = (over: Partial<{ timerEtter: number; radiusM: number; felt: Array<{ lat: number; lng: number }>; pos: { lat: number; lng: number } }> = {}) => ({
    id: 'SP001',
    pos: at(2500, 0),
    timerEtter: 0,
    radiusM: 300,
    ...over,
  });

  it('senker sannsynligheten bak en post som var satt opp i tide med ca. 80 %', () => {
    const uten = beregn(input({ osm: vegg(300), osmVersjon: 'v300' }));
    const med = beregn(input({ osm: vegg(300), osmVersjon: 'v300', sperreposter: [post()] }));
    const ratio = odds(ost(med)) / odds(ost(uten));
    expect(ratio).toBeGreaterThan(0.18);
    expect(ratio).toBeLessThan(0.26);
    expect(med.sperreposter[0]).toMatchObject({ id: 'SP001', andel: 1 });
    expect(med.sperreposter[0].bakAndel).toBeGreaterThan(0);
    // the growth stops at the post: walking time behind it is not shown
    const g = med.grid;
    const k = Math.floor(g.n / 2) * g.n + Math.floor(g.n / 2) + Math.round(5000 / g.cell);
    expect(Number.isFinite(uten.T1[k])).toBe(true);
    expect(Number.isFinite(med.T1[k])).toBe(false);
  });

  it('virker ikke når den ble satt opp etter at personen kunne vært forbi', () => {
    const uten = beregn(input({ osm: vegg(300), osmVersjon: 'v300' }));
    const sent = beregn(input({ osm: vegg(300), osmVersjon: 'v300', sperreposter: [post({ timerEtter: 50 })] }));
    expect(sent.sperreposter[0].merknad).toBe('sent');
    expect(sent.sperreposter[0].naaTimer).toBeGreaterThan(0);
    expect(ost(sent)).toBeCloseTo(ost(uten), 9);
  });

  it('har liten effekt der personen lett går utenom (åpent terreng, utenfor stien)', () => {
    const uten = beregn(input({ osm: { ...osm, omrader: [] }, osmVersjon: 'aapen' }));
    const med = beregn(input({ osm: { ...osm, omrader: [] }, osmVersjon: 'aapen', sperreposter: [post({ pos: at(2500, 2500), radiusM: 100 })] }));
    expect(ost(med)).toBeGreaterThan(ost(uten) * 0.9);
  });

  it('en sikker observasjon bak posten virker fortsatt', () => {
    const obs = [{ pos: at(6000, 0), timerSiden: 1, klasse: 'sikker' as const }];
    const bare = beregn(input({ osm: vegg(300), osmVersjon: 'v300', sperreposter: [post()] }));
    const medObs = beregn(input({ osm: vegg(300), osmVersjon: 'v300', sperreposter: [post()], observasjoner: obs }));
    expect(ost(medObs)).toBeGreaterThan(ost(bare) * 2);
  });

  it('et tegnet felt tvers over dalen sperrer også der en liten sirkel gir omvei', () => {
    const sirkel = beregn(input({ osm: vegg(800), osmVersjon: 'v800', sperreposter: [post({ radiusM: 100 })] }));
    const felt = beregn(
      input({ osm: vegg(800), osmVersjon: 'v800', sperreposter: [post({ felt: [at(2000, -900), at(3000, -900), at(3000, 900), at(2000, 900)] })] }),
    );
    expect(ost(felt)).toBeLessThan(ost(sirkel) * 0.7);
  });

  it('en post ved IPP endrer ingenting', () => {
    const uten = beregn(input({ osm: vegg(300), osmVersjon: 'v300' }));
    const ved = beregn(input({ osm: vegg(300), osmVersjon: 'v300', sperreposter: [post({ pos: at(50, 0) })] }));
    expect(ved.sperreposter[0].merknad).toBe('ipp');
    expect(ost(ved)).toBeCloseTo(ost(uten), 9);
  });
});

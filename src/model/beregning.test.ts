import { describe, expect, it } from 'vitest';
import { STANDARD_MODELL } from '../data/modellantakelser';
import { distanceM } from '../domain/geo';
import { fromUtm, toUtm } from '../domain/utm';
import { beregn, gridFor, type BeregningInput } from './beregning';
import type { Komponent } from './lpb';
import { INGEN_RESSURSER } from './ressurser';
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
    ressurser: INGEN_RESSURSER,
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
  it('foreslår ikke punkter som allerede er registrert som refleks', () => {
    const r = beregn(input({ osm, osmVersjon: '1', reflekser: [{ id: 'R001', navn: 'Hytta', pos: at(2000, 2000) }] }));
    expect(r.poiforslag.some((p) => p.navn === 'Hytta')).toBe(false);
  });
});

describe('ressursforslag', () => {
  it('gir like mange forslag som enheter når det finnes nok mål, og følger reglene', () => {
    const r = beregn(
      input({
        osm,
        osmVersjon: '1',
        timerSidenSistSett: 2,
        visningTimer: 2,
        ressurser: { fotmannskap: 4, hundefører: 1, drone: 2, atv: 1, bil: 1 },
      }),
    );
    const av = (t: string) => r.forslag.filter((f) => f.ressurs === t);
    expect(av('fotmannskap')).toHaveLength(4);
    expect(av('drone')[0].type).toBe('ipp');
    expect(av('hundefører')[0].type).toBe('ipp');
    // no tractor roads in the data → no ATV suggestion
    expect(av('atv')).toHaveLength(0);
    // the road is 8 km north: 2 h × 3 km/h is not enough → no car suggestion either
    expect(av('bil')).toHaveLength(0);
    // trail suggestion for foot teams ends where the person could be after ≤ 2 h
    const sti = av('fotmannskap').find((f) => f.type === 'ledelinje');
    expect(sti).toBeDefined();
    expect(sti!.timer!).toBeLessThanOrEqual(2);
  });
});

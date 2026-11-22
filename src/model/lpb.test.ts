import { describe, expect, it } from 'vitest';
import { LPB_PLASSHOLDERE, valider } from '../data/lpb-stats';
import {
  blandingKumulativ,
  blandingRinger,
  byggKomponenter,
  kumulativ,
  ryddRinger,
  tetthet,
  vektetFart,
  type Komponent,
} from './lpb';

const HALE = 0.3;
const turgaer: Komponent = { key: 't', navn: 'T', w: 1, r: [700, 1900, 3600, 11300], v: 3, mob: 12, verifisert: false };
const dement: Komponent = { key: 'd', navn: 'D', w: 1, r: [300, 800, 1900, 8300], v: 1.5, mob: 12, verifisert: false };

/** Numerical integral of the density over the disc of radius D. */
function integrer(c: Komponent, D: number): number {
  const n = 20000;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const r = ((i + 0.5) / n) * D;
    s += tetthet(c, r, HALE) * 2 * Math.PI * r * (D / n);
  }
  return s;
}

describe('avstandsmodell for én kategori', () => {
  it('har 25/50/75/95 % innenfor R25/R50/R75/R95', () => {
    expect(kumulativ(turgaer, 700, HALE)).toBeCloseTo(0.25, 10);
    expect(kumulativ(turgaer, 1900, HALE)).toBeCloseTo(0.5, 10);
    expect(kumulativ(turgaer, 3600, HALE)).toBeCloseTo(0.75, 10);
    expect(kumulativ(turgaer, 11300, HALE)).toBeCloseTo(0.95, 10);
  });
  it('tettheten integrerer til den kumulative fordelingen', () => {
    for (const D of [500, 1900, 6000, 11300, 20000]) {
      expect(integrer(turgaer, D)).toBeCloseTo(kumulativ(turgaer, D, HALE), 3);
    }
  });
  it('går mot 100 % langt ute', () => {
    expect(kumulativ(turgaer, 11300 * 20, HALE)).toBeCloseTo(1, 6);
  });
});

describe('vektet blanding av kategorier', () => {
  it('én kategori gir sine egne ringer', () => {
    const r = blandingRinger([turgaer], HALE);
    expect(r[0]).toBeCloseTo(700, 3);
    expect(r[1]).toBeCloseTo(1900, 3);
    expect(r[2]).toBeCloseTo(3600, 3);
    expect(r[3]).toBeCloseTo(11300, 3);
  });
  it('blandingens ringer ligger mellom kategorienes', () => {
    const cs = [
      { ...turgaer, w: 0.5 },
      { ...dement, w: 0.5 },
    ];
    const r = blandingRinger(cs, HALE);
    expect(r[1]).toBeGreaterThan(800);
    expect(r[1]).toBeLessThan(1900);
    // the mixture CDF at its own R50 is exactly 50 %
    expect(blandingKumulativ(cs, r[1], HALE)).toBeCloseTo(0.5, 6);
  });
  it('vekter fart og mobilitet', () => {
    const f = vektetFart([
      { ...turgaer, w: 0.75 },
      { ...dement, w: 0.25 },
    ]);
    expect(f.v).toBeCloseTo(2.625, 10);
    expect(f.mob).toBeCloseTo(12, 10);
  });
  it('bygger komponenter med normaliserte vekter', () => {
    const cs = byggKomponenter(
      LPB_PLASSHOLDERE,
      [
        { key: 'dement', vekt: 2 },
        { key: 'fisker', vekt: 1 },
        { key: 'finnes-ikke', vekt: 5 },
      ],
      'fjell',
    );
    expect(cs.map((c) => c.key)).toEqual(['dement', 'fisker']);
    expect(cs[0].w).toBeCloseTo(2 / 3, 10);
    expect(cs[0].r).toEqual([300, 800, 1900, 8300]);
    expect(cs.every((c) => c.verifisert === false)).toBe(true);
  });
});

describe('validering av statistikk', () => {
  it('alle plassholdere er gyldige og merket ikke verifisert', () => {
    expect(LPB_PLASSHOLDERE).toHaveLength(16);
    for (const s of LPB_PLASSHOLDERE) {
      expect(valider(s.fjell)).toEqual([]);
      expect(s.verifisert).toBe(false);
    }
  });
  it('finner ringer som ikke øker', () => {
    expect(valider({ r25: 1, r50: 0.5, r75: 2, r95: 3 })).toHaveLength(1);
    expect(valider({ r25: 0, r50: 0.5, r75: 2, r95: 3 }).length).toBeGreaterThan(0);
  });
  it('rydder ugyldige ringer slik at modellen kan regne', () => {
    expect(ryddRinger({ r25: 2, r50: 1, r75: 1, r95: 4 })).toEqual([1000, 1001, 2000, 4000]);
  });
});

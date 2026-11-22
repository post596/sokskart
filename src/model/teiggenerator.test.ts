import { describe, expect, it } from 'vitest';
import { STANDARD_MODELL } from '../data/modellantakelser';
import { pointInRing, shoelace } from '../domain/geo';
import type { Grid } from './grid';
import { arealPerTime, cellSoketid } from './soketid';
import { genererTeiger, type GeneratorInput } from './teiggenerator';

// 3 × 3 km main grid with 100 m cells
function grid(): Grid {
  const n = 31;
  const cell = 100;
  const half = (n * cell) / 2;
  return { zone: 32, n, cell, half, cx: 500000, cy: 6800000, west: 500000 - half, north: 6800000 + half, k: 1 };
}

const grovsok = STANDARD_MODELL.teknikker.grovsok;

function input(over: Partial<GeneratorInput> = {}): GeneratorInput {
  const g = grid();
  const N = g.n * g.n;
  return {
    g,
    post: new Float64Array(N).fill(1 / N),
    maal: new Uint8Array(N).fill(1),
    opptatt: new Uint8Array(N),
    sokefaktor: new Float32Array(N).fill(1),
    arealtype: new Uint8Array(N),
    hoyde: null,
    linjer: [],
    teknikk: grovsok,
    maksTimer: 2,
    maksKm2: 0.9,
    minKm2: 0.05,
    fin: 25,
    ...over,
  };
}

describe('søketid', () => {
  it('3 personer, 25 m, 1,5 km/t søker ca. 0,23 km² på 2 timer i lett terreng', () => {
    expect(arealPerTime(grovsok) * 2).toBeCloseTo(225000, 6);
    expect(cellSoketid(225000, 1, grovsok)).toBeCloseTo(2, 10);
    expect(cellSoketid(225000, 0.5, grovsok)).toBeCloseTo(4, 10);
    expect(cellSoketid(1, 0, grovsok)).toBe(Infinity);
  });
});

describe('teiggenerator', () => {
  it('holder alle teiger under maks søketid og maks areal', () => {
    const t = genererTeiger(input());
    expect(t.length).toBeGreaterThanOrEqual(Math.ceil(9.61 / 0.225));
    for (const x of t) {
      expect(x.timer).toBeLessThanOrEqual(2.2);
      expect(x.arealKm2).toBeLessThanOrEqual(0.9);
    }
    // together they cover the whole area (no gaps, no overlap)
    const sum = t.reduce((s, x) => s + x.arealKm2, 0);
    expect(sum).toBeCloseTo(9.61, 1);
  });
  it('lager polygoner med riktig areal (ikke firkanter med rette hjørner)', () => {
    const t = genererTeiger(input());
    for (const x of t.slice(0, 5)) {
      const a = shoelace(x.ring) / 1e6;
      expect(Math.abs(a - x.arealKm2) / x.arealKm2).toBeLessThan(0.12);
      expect(x.ring.length).toBeGreaterThan(4);
    }
  });
  it('bruker en sti som grense: ingen teig krysser stien', () => {
    const g = grid();
    // a winding path from west to east through the middle
    const sti: Array<[number, number]> = [];
    for (let x = g.west; x <= g.west + 2 * g.half; x += 100) sti.push([x, g.cy + Math.sin((x - g.west) / 400) * 150]);
    const t = genererTeiger(input({ linjer: [sti] }));
    for (const x of t) {
      // a teig lies (almost) entirely on one side of the path
      let nord = 0;
      let sor = 0;
      for (const [px, py] of x.ring) {
        const ly = g.cy + Math.sin((px - g.west) / 400) * 150;
        if (py > ly + 40) nord++;
        else if (py < ly - 40) sor++;
      }
      expect(Math.min(nord, sor)).toBeLessThanOrEqual(1);
    }
  });
  it('tar ikke med celler som ikke kan søkes til fots, eller som alt er i teiger', () => {
    const g = grid();
    const N = g.n * g.n;
    const sokefaktor = new Float32Array(N).fill(1);
    const opptatt = new Uint8Array(N);
    for (let j = 0; j < g.n; j++) {
      for (let i = 0; i < 10; i++) sokefaktor[j * g.n + i] = 0; // steep strip in the west
      for (let i = 21; i < g.n; i++) opptatt[j * g.n + i] = 1; // existing teiger in the east
    }
    const t = genererTeiger(input({ sokefaktor, opptatt }));
    const sum = t.reduce((s, x) => s + x.arealKm2, 0);
    expect(sum).toBeCloseTo((11 * 31 * 0.01), 1);
    for (const x of t) for (const [px] of x.ring) expect(px).toBeGreaterThan(g.west + 9 * g.cell);
  });
  it('rangerer etter sannsynlighet', () => {
    const g = grid();
    const post = new Float64Array(g.n * g.n);
    post[15 * g.n + 15] = 1; // all probability in the centre cell
    const t = genererTeiger(input({ post }));
    // the 100 m cell may be split between neighbouring teiger
    expect(t.reduce((s, x) => s + x.poa, 0)).toBeCloseTo(1, 6);
    expect(t[0].poa).toBeGreaterThanOrEqual(0.25);
    const iTopp = t.filter((x) => x.poa > 0);
    expect(iTopp.some((x) => pointInRing(g.cx, g.cy, x.ring) || pointInRing(g.cx + 40, g.cy + 40, x.ring) || pointInRing(g.cx - 40, g.cy - 40, x.ring))).toBe(true);
    expect(t[t.length - 1].poa).toBe(0);
  });
  it('lager større droneområder bare der drone virker', () => {
    const g = grid();
    const N = g.n * g.n;
    const droneeffekt = new Float32Array(N);
    for (let j = 0; j < g.n; j++) for (let i = 0; i < 20; i++) droneeffekt[j * g.n + i] = 1; // open west, forest east
    const d = genererTeiger(input({ modus: 'drone', droneeffekt, maksKm2: 3, minKm2: 1 }));
    expect(d.length).toBeGreaterThanOrEqual(2);
    for (const x of d) {
      expect(x.arealKm2).toBeLessThanOrEqual(3.01);
      for (const [px] of x.ring) expect(px).toBeLessThan(g.west + 21 * g.cell);
    }
  });
});

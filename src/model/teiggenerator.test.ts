import { describe, expect, it } from 'vitest';
import { STANDARD_MODELL } from '../data/modellantakelser';
import { pointInRing, shoelace } from '../domain/geo';
import type { Grid } from './grid';
import { arealPerTime, cellSoketid, droneFlytid } from './soketid';
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
  it('drone: 0,45 km² tar ca. 25 min (ett batteri), 0,8 km² tar to', () => {
    const m = STANDARD_MODELL;
    expect(droneFlytid(0.45, m).minutter).toBeCloseTo(25, 6);
    expect(droneFlytid(0.45, m).batterier).toBe(1);
    expect(droneFlytid(0.8, m).minutter).toBeCloseTo(44.4, 1);
    expect(droneFlytid(0.8, m).batterier).toBe(2);
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
  it('i tungt terreng blir teigene små, men bryter aldri 2-timersgrensen', () => {
    const g = grid();
    const sokefaktor = new Float32Array(g.n * g.n).fill(0.2); // steep: 5 × slower
    const t = genererTeiger(input({ sokefaktor }));
    for (const x of t) {
      if (x.arealKm2 < 0.01) continue; // slivers
      expect(x.timer).toBeLessThanOrEqual(2.2);
    }
    expect(Math.max(...t.map((x) => x.arealKm2))).toBeLessThan(0.06);
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

describe('teiger går til naturlige grenser utenfor sonen (utvid)', () => {
  const g = grid();
  const N = g.n * g.n;
  // R25: circle with radius 500 m around the centre
  const sirkel = new Uint8Array(N);
  for (let j = 0; j < g.n; j++) {
    for (let i = 0; i < g.n; i++) {
      const x = g.west + (i + 0.5) * g.cell;
      const y = g.north - (j + 0.5) * g.cell;
      if (Math.hypot(x - g.cx, y - g.cy) <= 500) sirkel[j * g.n + i] = 1;
    }
  }
  const d = 700;
  const boks: Array<Array<[number, number]>> = [
    [[g.cx - d, g.cy - 1500], [g.cx - d, g.cy + 1500]],
    [[g.cx + d, g.cy - 1500], [g.cx + d, g.cy + 1500]],
    [[g.cx - 1500, g.cy - d], [g.cx + 1500, g.cy - d]],
    [[g.cx - 1500, g.cy + d], [g.cx + 1500, g.cy + d]],
  ];
  const alle = (t: ReturnType<typeof genererTeiger>) => t.flatMap((x) => x.ring);

  it('fortsetter ut over R25 til veiene rundt, men ikke forbi dem', () => {
    const t = genererTeiger(input({ maal: sirkel, linjer: boks, utvid: true }));
    const sum = t.reduce((s, x) => s + x.arealKm2, 0);
    // the box (1.4 × 1.4 km) instead of the circle (0.79 km²)
    expect(sum).toBeGreaterThan(1.5);
    expect(sum).toBeLessThan(2.1);
    for (const [x, y] of alle(t)) {
      expect(Math.abs(x - g.cx)).toBeLessThanOrEqual(d + 30);
      expect(Math.abs(y - g.cy)).toBeLessThanOrEqual(d + 30);
    }
    expect(t.some((x) => (x.utenforAndel ?? 0) > 0.2)).toBe(true);
  });

  it('kuttes ved sonen når det ikke finnes noen grense', () => {
    const t = genererTeiger(input({ maal: sirkel, utvid: true }));
    const sum = t.reduce((s, x) => s + x.arealKm2, 0);
    expect(sum).toBeGreaterThan(0.6);
    expect(sum).toBeLessThan(0.95);
    for (const [x, y] of alle(t)) expect(Math.hypot(x - g.cx, y - g.cy)).toBeLessThan(620); // 500 m + one 100 m cell diagonal
  });

  it('gir ikke teiger helt utenfor sonen', () => {
    // a single road through the middle: the zone is split, and the parts beyond the zone on
    // either side reach the grid edge, so both are cut at the circle
    const t = genererTeiger(input({ maal: sirkel, linjer: [[[g.cx, g.cy - 1500], [g.cx, g.cy + 1500]]], utvid: true }));
    for (const x of t) expect(x.utenforAndel ?? 0).toBeLessThan(1);
    for (const [x, y] of alle(t)) expect(Math.hypot(x - g.cx, y - g.cy)).toBeLessThan(620); // 500 m + one 100 m cell diagonal
  });

  it('uten utvid er det som før (kuttet langs sonen)', () => {
    const t = genererTeiger(input({ maal: sirkel, linjer: boks }));
    for (const [x, y] of alle(t)) expect(Math.hypot(x - g.cx, y - g.cy)).toBeLessThan(620); // 500 m + one 100 m cell diagonal
  });
});

describe('grenseceller langs mange stier', () => {
  it('holder søketiden under grensen også der mange stier møtes', () => {
    const g = grid();
    // a dense net of paths every 120 m in both directions: the boundary bands are a large share
    const linjer: Array<Array<[number, number]>> = [];
    for (let k = -12; k <= 12; k++) {
      linjer.push([[g.cx + k * 120, g.cy - 1500], [g.cx + k * 120, g.cy + 1500]]);
      linjer.push([[g.cx - 1500, g.cy + k * 120], [g.cx + 1500, g.cy + k * 120]]);
    }
    const t = genererTeiger(input({ linjer, teknikk: STANDARD_MODELL.teknikker.finsok }));
    expect(t.length).toBeGreaterThan(10);
    for (const x of t) expect(x.timer).toBeLessThanOrEqual(2.05);
  });
});

import { describe, expect, it } from 'vitest';
import { brattMaske, gangtid, helning, toblerFaktor, type Terreng } from './gangtid';
import type { Grid } from './grid';

function grid(n: number, cell: number): Grid {
  const half = (n * cell) / 2;
  return { zone: 32, n, cell, half, cx: 500000, cy: 6800000, west: 500000 - half, north: 6800000 + half, k: 1 };
}

function flat(n: number, fart = 1): Terreng {
  return { fart: new Float32Array(n * n).fill(fart), sti: new Uint8Array(n * n), hoyde: null };
}

const idx = (n: number, i: number, j: number) => j * n + i;

describe('Toblers gangfunksjon', () => {
  it('er 1 på flatt og raskest i svak nedoverbakke', () => {
    expect(toblerFaktor(0)).toBeCloseTo(1, 10);
    expect(toblerFaktor(-0.05)).toBeGreaterThan(1);
    expect(toblerFaktor(0.2)).toBeLessThan(toblerFaktor(-0.2));
  });
  it('gir ca. 6 km/t på flatt i originalformen', () => {
    // Tobler: W = 6·exp(−3.5·|S+0.05|) km/h; on flat ground ≈ 5.04 km/h
    expect(6 * Math.exp(-3.5 * 0.05)).toBeCloseTo(5.037, 3);
  });
});

describe('gangtid på flatt terreng', () => {
  const n = 101;
  const g = grid(n, 10);
  const c = idx(n, 50, 50);
  const T = gangtid(g, flat(n), [c], 35);

  it('er 0 i startcella', () => {
    expect(T[c]).toBe(0);
  });
  it('er avstand / fart i rette retninger (1 km/t, 500 m = 0,5 t)', () => {
    expect(T[idx(n, 100, 50)]).toBeCloseTo(0.5, 4);
    expect(T[idx(n, 50, 0)]).toBeCloseTo(0.5, 4);
  });
  it('har lite retningsfeil på skrå (16 naboer)', () => {
    // 45°: exact 500·√2 m = 0.7071 h; 30°-ish direction (dx 40, dy 23)
    expect(T[idx(n, 100, 100)]).toBeCloseTo(Math.SQRT2 * 0.5, 4);
    const exact = (Math.hypot(40, 23) * 10) / 1000;
    expect(Math.abs(T[idx(n, 90, 73)] - exact) / exact).toBeLessThan(0.03);
  });
  it('skalerer omvendt med farten', () => {
    const T2 = gangtid(g, flat(n, 0.5), [c], 35);
    expect(T2[idx(n, 100, 50)]).toBeCloseTo(1.0, 4);
  });
});

describe('sti, barrierer og helning', () => {
  it('går raskere langs sti enn i terrenget', () => {
    const n = 61;
    const g = grid(n, 10);
    const t = flat(n, 0.6);
    for (let i = 0; i < n; i++) {
      t.fart[idx(n, i, 30)] = 1;
      t.sti[idx(n, i, 30)] = 1;
    }
    const T = gangtid(g, t, [idx(n, 0, 30)], 35);
    const paaSti = T[idx(n, 60, 30)];
    expect(paaSti).toBeCloseTo(0.6, 3); // 600 m at 1 km/h
    // the same distance off the path takes 1/0.6 as long
    const T2 = gangtid(g, flat(n, 0.6), [idx(n, 0, 30)], 35);
    expect(T2[idx(n, 60, 30)]).toBeCloseTo(1.0, 3);
  });
  it('går rundt en vegg og gjennom åpningen', () => {
    const n = 41;
    const g = grid(n, 10);
    const t = flat(n);
    for (let j = 0; j < n; j++) if (j !== 35) t.fart[idx(n, 20, j)] = 0;
    const T = gangtid(g, t, [idx(n, 10, 20)], 35);
    const direct = (20 * 10) / 1000;
    expect(T[idx(n, 30, 20)]).toBeGreaterThan(direct * 1.5);
    expect(Number.isFinite(T[idx(n, 30, 20)])).toBe(true);
    // a closed wall makes the other side unreachable
    t.fart[idx(n, 20, 35)] = 0;
    const T2 = gangtid(g, t, [idx(n, 10, 20)], 35);
    expect(T2[idx(n, 30, 20)]).toBe(Number.POSITIVE_INFINITY);
  });
  it('går ikke diagonalt mellom to barrierer', () => {
    const n = 3;
    const g = grid(n, 10);
    const t = flat(n);
    t.fart[idx(n, 1, 0)] = 0;
    t.fart[idx(n, 0, 1)] = 0;
    t.fart[idx(n, 1, 2)] = 0;
    t.fart[idx(n, 2, 1)] = 0;
    t.fart[idx(n, 1, 1)] = 0;
    const T = gangtid(g, t, [idx(n, 0, 0)], 35);
    expect(T[idx(n, 2, 2)]).toBe(Number.POSITIVE_INFINITY);
  });
  it('bruker lengre tid oppover enn nedover, og stopper ved stup utenfor sti', () => {
    const n = 21;
    const g = grid(n, 10);
    const t = flat(n);
    t.hoyde = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t.hoyde[idx(n, i, j)] = i * 2; // 20 % slope eastwards
    const up = gangtid(g, t, [idx(n, 0, 10)], 35)[idx(n, 20, 10)];
    const down = gangtid(g, t, [idx(n, 20, 10)], 35)[idx(n, 0, 10)];
    expect(up).toBeGreaterThan(down);
    expect(up).toBeCloseTo(0.2 / toblerFaktor(0.2), 3);
    // 45° slope: blocked off path (also diagonally – the slope is the gradient, not the direction)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t.hoyde[idx(n, i, j)] = i * 10;
    const sl = helning(g, t.hoyde);
    expect(sl[idx(n, 10, 10)]).toBeCloseTo(45, 6);
    const steep = { ...t, fart: t.fart.slice() };
    expect(brattMaske(steep, sl, 35)).toBe(n * n);
    expect(gangtid(g, steep, [idx(n, 0, 10)], 35)[idx(n, 20, 10)]).toBe(Number.POSITIVE_INFINITY);
    // …but a path up the same slope is allowed
    const withPath = { ...t, fart: t.fart.slice(), sti: t.sti.slice() };
    for (let i = 0; i < n; i++) withPath.sti[idx(n, i, 10)] = 1;
    brattMaske(withPath, sl, 35);
    expect(Number.isFinite(gangtid(g, withPath, [idx(n, 0, 10)], 35)[idx(n, 20, 10)])).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { cellAreaKm2, type Grid } from './grid';
import { dekketAreal, leggTilDekning, leggTilFastPod, sveipLinje, sveipSkive } from './innsats';

/** Plain grid: n × n cells of `cell` m, scale factor 1, west/north at 0/n·cell. */
const grid = (n: number, cell: number, k = 1): Grid =>
  ({ n, cell, west: 0, north: n * cell, cx: (n * cell) / 2, cy: (n * cell) / 2, k, half: (n * cell) / 2, zone: 32 }) as unknown as Grid;

const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('søkt innsats: sveipet areal', () => {
  it('en skive med r = 50 m har areal π·50² og dekker ≈ 79 % av en 100 m-celle', () => {
    const g = grid(10, 100);
    const d = dekketAreal((legg) => sveipSkive(g, 450, 550, 50, legg));
    expect(sum(d) / (Math.PI * 50 * 50)).toBeCloseTo(1, 6);
    // centred in one cell
    expect(d.size).toBe(1);
    expect([...d.values()][0] / 1e4).toBeCloseTo(0.785, 1);
  });
  it('en korridor på 30 m til hver side har areal 2·30·L, også over flere celler', () => {
    const g = grid(40, 50);
    const d = dekketAreal((legg) => sveipLinje(g, [[100, 1000], [1600, 1000], [1600, 1600]], 30, legg));
    expect(sum(d) / (2 * 30 * 2100)).toBeCloseTo(1, 2);
  });
  it('tar hensyn til målestokkfaktoren (rutenett i UTM-meter)', () => {
    const g = grid(40, 50, 0.9996);
    const d = dekketAreal((legg) => sveipLinje(g, [[100, 1000], [1600, 1000]], 30, legg));
    // 1500 grid metres = 1500/0.9996 ground metres
    expect(sum(d) / (2 * 30 * (1500 / 0.9996))).toBeCloseTo(1, 2);
  });
  it('fast POD skaleres med dekket andel av cella', () => {
    const g = grid(10, 100);
    const igjen = new Float32Array(100).fill(1);
    leggTilFastPod(g, igjen, new Map([[5, 5000]]), 0.8); // half the cell covered
    expect(igjen[5]).toBeCloseTo(0.6, 6);
    leggTilFastPod(g, igjen, new Map([[5, 20000]]), 0.5); // more than the cell: capped
    expect(igjen[5]).toBeCloseTo(0.3, 6);
  });
  it('dekning C = sveipet areal / celleareal', () => {
    const g = grid(10, 100);
    const C = new Float32Array(100);
    leggTilDekning(g, C, new Map([[3, 2500]]));
    expect(C[3]).toBeCloseTo(2500 / (cellAreaKm2(g) * 1e6), 6);
  });
});

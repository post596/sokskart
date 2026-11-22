import { describe, expect, it } from 'vitest';
import { cellAreaKm2, cellIndex, cellX, cellY, fraGrid, lagGrid, lagMercatorIndeks, sample, tilGrid } from './grid';
import { forCellsInPolygon, glatt, rasterLinjer } from './raster';

const IPP = { lat: 61.6265, lng: 8.4006 };

describe('rutenett i UTM', () => {
  const g = lagGrid(IPP, 32, 5000, 100);
  it('har oddetall celler og IPP midt i midtcella', () => {
    expect(g.n).toBe(101);
    const c = cellIndex(g, g.cx, g.cy);
    expect(c).toBe(50 * 101 + 50);
    expect(cellX(g, 50)).toBeCloseTo(g.cx, 6);
    expect(cellY(g, 50)).toBeCloseTo(g.cy, 6);
  });
  it('regner om mellom grader og rutenett', () => {
    const [x, y] = tilGrid(g, IPP);
    const p = fraGrid(g, x, y);
    expect(p.lat).toBeCloseTo(IPP.lat, 9);
    expect(p.lng).toBeCloseTo(IPP.lng, 9);
  });
  it('gir -1 utenfor', () => {
    expect(cellIndex(g, g.west - 1, g.cy)).toBe(-1);
    expect(cellIndex(g, g.cx, g.north + 1)).toBe(-1);
  });
  it('celleareal er korrigert for målestokkfaktor', () => {
    expect(cellAreaKm2(g)).toBeCloseTo(((10000 / 101) / g.k) ** 2 / 1e6, 12);
  });
  it('bilineær sampling er eksakt for en lineær flate', () => {
    const f = new Float32Array(g.n * g.n);
    for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) f[j * g.n + i] = cellX(g, i) - g.west;
    expect(sample(g, f, g.west + 1234.5, g.cy)).toBeCloseTo(1234.5, 1);
  });
});

describe('Web Mercator-indeks', () => {
  it('peker hver piksel inne i rutenettet til riktig celle', () => {
    const g = lagGrid(IPP, 32, 5000, 51);
    const m = lagMercatorIndeks(g, 120);
    expect(m.width).toBe(120);
    expect(m.height).toBeGreaterThan(100);
    // the centre pixel is the IPP cell
    const mid = m.index[Math.floor(m.height / 2) * m.width + Math.floor(m.width / 2)];
    expect(mid).toBe(cellIndex(g, g.cx, g.cy));
    // corners of the bounding box fall outside the (rotated) grid square
    const inside = Array.from(m.index).filter((v) => v >= 0).length;
    expect(inside).toBeGreaterThan(0.9 * m.width * m.height);
    expect(inside).toBeLessThanOrEqual(m.width * m.height);
  });
});

describe('rasterisering', () => {
  const g = lagGrid(IPP, 32, 5000, 101);
  it('polygon dekker omtrent sitt areal', () => {
    const ring: Array<[number, number]> = [
      [g.cx - 1000, g.cy - 1000],
      [g.cx + 1000, g.cy - 1000],
      [g.cx + 1000, g.cy + 1000],
      [g.cx - 1000, g.cy + 1000],
    ];
    let n = 0;
    forCellsInPolygon(g, [ring], () => n++);
    const cellArea = g.cell * g.cell;
    expect((n * cellArea) / 4e6).toBeGreaterThan(0.9);
    expect((n * cellArea) / 4e6).toBeLessThan(1.1);
  });
  it('hull i polygon (partallsregel)', () => {
    const outer: Array<[number, number]> = [
      [g.cx - 1000, g.cy - 1000],
      [g.cx + 1000, g.cy - 1000],
      [g.cx + 1000, g.cy + 1000],
      [g.cx - 1000, g.cy + 1000],
    ];
    const hole: Array<[number, number]> = [
      [g.cx - 500, g.cy - 500],
      [g.cx + 500, g.cy - 500],
      [g.cx + 500, g.cy + 500],
      [g.cx - 500, g.cy + 500],
    ];
    let withHole = 0;
    forCellsInPolygon(g, [outer, hole], () => withHole++);
    let full = 0;
    forCellsInPolygon(g, [outer], () => full++);
    expect(withHole / full).toBeGreaterThan(0.7);
    expect(withHole / full).toBeLessThan(0.8);
  });
  it('linje markerer en sammenhengende korridor', () => {
    const out = new Uint8Array(g.n * g.n);
    rasterLinjer(g, [[[g.cx - 2000, g.cy], [g.cx + 2000, g.cy]]], 0, out);
    const j = Math.floor((g.north - g.cy) / g.cell);
    for (let i = Math.ceil((2000 - 2000 + g.half - 2000) / g.cell) + 1; i < Math.floor((g.half + 2000) / g.cell) - 1; i++) {
      expect(out[j * g.n + i]).toBe(1);
    }
  });
  it('glatting bevarer et jevnt felt', () => {
    const a = new Float64Array(25).fill(2);
    glatt(a, 5, 2);
    for (const v of a) expect(v).toBeCloseTo(2, 12);
  });
});

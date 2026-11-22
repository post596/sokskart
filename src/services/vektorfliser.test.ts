import { describe, expect, it } from 'vitest';
import type { OsmLinje } from '../model/typer';
// real z14 tile from tiles.openfreemap.org around Spiterstulen (22.11.2026), base64 via Vite
import flisUrl from './testdata/openfreemap-14-8574-4606.pbf?inline';
import { flisNr, fliserRundt, settSammenFragmenter, tilLatLng, tolkFlis } from './vektorfliser';

const flis = Uint8Array.from(atob(flisUrl.split(',')[1]), (c) => c.charCodeAt(0));

describe('vektorfliser (OpenFreeMap)', () => {
  it('finner riktig flis for Spiterstulen og regner hjørner tilbake', () => {
    expect(flisNr(61.6265, 8.4006, 14)).toEqual([8574, 4606]);
    const nw = tilLatLng(14, 8574, 4606, 0, 0, 4096);
    const se = tilLatLng(14, 8574, 4606, 4096, 4096, 4096);
    expect(nw.lat).toBeGreaterThan(61.6265);
    expect(se.lat).toBeLessThan(61.6265);
    expect(nw.lng).toBeLessThan(8.4006);
    expect(se.lng).toBeGreaterThan(8.4006);
  });
  it('lister fliser rundt et punkt', () => {
    const f = fliserRundt({ lat: 61.6265, lng: 8.4006 }, 2000);
    expect(f.length).toBeGreaterThanOrEqual(9);
    expect(f).toContainEqual([8574, 4606]);
  });
  it('tolker stier, bekker, vann, skog, myr og hytte fra en ekte flis', () => {
    const d = tolkFlis(flis, 14, 8574, 4606);
    const typer = new Set(d.linjer.map((l) => l.type));
    expect(typer.has('sti')).toBe(true);
    expect(typer.has('vann')).toBe(true);
    expect(typer.has('vei')).toBe(true);
    const omr = new Set(d.omrader.map((o) => o.type));
    expect(omr.has('vann')).toBe(true);
    expect(omr.has('skog')).toBe(true);
    expect(omr.has('myr')).toBe(true);
    expect(d.punkter.some((p) => p.type === 'hytte')).toBe(true);
    expect(d.punkter.some((p) => p.type === 'parkering')).toBe(true);
    // coordinates inside the tile
    for (const l of d.linjer) for (const p of l.pts) expect(Math.abs(p.lat - 61.62)).toBeLessThan(0.05);
  });
  it('kan hente bare arealtyper', () => {
    const d = tolkFlis(flis, 14, 8574, 4606, true);
    expect(d.linjer).toHaveLength(0);
    expect(d.omrader.length).toBeGreaterThan(0);
  });
  it('setter sammen fragmenter av samme vei over flisgrenser', () => {
    const l = (id: string, pts: Array<[number, number]>): OsmLinje => ({ id, type: 'sti', navn: '', elv: false, pts: pts.map(([lat, lng]) => ({ lat, lng })) });
    const r = settSammenFragmenter([
      l('t14/1/1/transportation/7:7', [
        [61.6, 8.4],
        [61.6, 8.41],
      ]),
      l('t14/2/1/transportation/7:7', [
        [61.6, 8.41005],
        [61.6, 8.42],
      ]),
      l('t14/2/1/transportation/9:9', [
        [61.7, 8.4],
        [61.7, 8.41],
      ]),
    ]);
    expect(r).toHaveLength(2);
    // the overlapping point at the tile edge is dropped
    expect(r.find((x) => x.pts.length === 3 && x.pts[2].lng === 8.42)).toBeDefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { OsmLinje } from '../model/typer';
import { byggSporring, linjetype, settSammenRinger, slaSammenLinjer, tolkSvar } from './overpass';

const p = (lat: number, lng: number) => ({ lat, lng });

describe('Overpass-spørring', () => {
  it('ber om stier, veier, vann, kraftgater, områder og POI innen radius', () => {
    const q = byggSporring(p(61.5, 8.5), 8000.4);
    expect(q).toContain('around:8000,61.500000,8.500000');
    for (const s of ['highway~', 'waterway~', 'power=line', 'natural~"^(water|wetland|glacier|cliff)$"', 'alpine_hut', 'natural=peak']) {
      expect(q).toContain(s);
    }
    expect(q).toContain('out geom');
  });
  it('klassifiserer linjetyper', () => {
    expect(linjetype({ highway: 'path' })).toBe('sti');
    expect(linjetype({ highway: 'track' })).toBe('traktorvei');
    expect(linjetype({ highway: 'residential' })).toBe('vei');
    expect(linjetype({ waterway: 'stream' })).toBe('vann');
    expect(linjetype({ power: 'line' })).toBe('kraft');
    expect(linjetype({ building: 'yes' })).toBeNull();
  });
});

describe('sammenslåing av veistykker', () => {
  const l = (id: string, pts: Array<[number, number]>, navn = '', type: OsmLinje['type'] = 'sti'): OsmLinje => ({
    id,
    type,
    navn,
    elv: false,
    pts: pts.map(([a, b]) => p(a, b)),
  });
  it('slår sammen stykker som møtes uten kryss, også motsatt vei', () => {
    const r = slaSammenLinjer([
      l('w1', [
        [0, 0],
        [0, 1],
      ]),
      l('w2', [
        [0, 2],
        [0, 1],
      ]),
      l('w3', [
        [0, 2],
        [0, 3],
      ]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].pts.map((q) => q.lng)).toEqual([0, 1, 2, 3]);
    expect(r[0].id.split('+').sort()).toEqual(['w1', 'w2', 'w3']);
  });
  it('stopper i kryss og slår ikke sammen ulike typer eller navn', () => {
    const r = slaSammenLinjer([
      l('a', [
        [0, 0],
        [0, 1],
      ]),
      l('b', [
        [0, 1],
        [0, 2],
      ]),
      l('c', [
        [0, 1],
        [1, 1],
      ]),
      l('d', [
        [0, 2],
        [0, 3],
      ], 'Storvegen'),
      l('e', [
        [0, 3],
        [0, 4],
      ], '', 'vei'),
    ]);
    expect(r).toHaveLength(5);
  });
});

describe('ringer fra multipolygon', () => {
  it('setter sammen åpne deler til en lukket ring', () => {
    const ringer = settSammenRinger([
      [p(0, 0), p(0, 1)],
      [p(1, 1), p(0, 1)],
      [p(1, 1), p(1, 0), p(0, 0)],
    ]);
    expect(ringer).toHaveLength(1);
    expect(ringer[0][0]).toEqual(ringer[0][ringer[0].length - 1]);
    expect(ringer[0]).toHaveLength(5);
  });
});

describe('tolking av Overpass-svar', () => {
  it('fordeler elementene på linjer, områder, stup og punkter', () => {
    const g = (pts: Array<[number, number]>) => pts.map(([lat, lon]) => ({ lat, lon }));
    const json = {
      elements: [
        { type: 'way' as const, id: 1, tags: { highway: 'path', name: 'Stien' }, geometry: g([[61, 8], [61.01, 8]]) },
        { type: 'way' as const, id: 2, tags: { waterway: 'river' }, geometry: g([[61, 8.1], [61.01, 8.1]]) },
        { type: 'way' as const, id: 3, tags: { natural: 'water', name: 'Tjønna' }, geometry: g([[61, 8], [61, 8.01], [61.01, 8.01], [61, 8]]) },
        { type: 'way' as const, id: 4, tags: { natural: 'cliff' }, geometry: g([[61, 8.2], [61.01, 8.2]]) },
        { type: 'node' as const, id: 5, lat: 61.2, lon: 8.3, tags: { natural: 'peak', name: 'Toppen' } },
        { type: 'way' as const, id: 6, tags: { tourism: 'alpine_hut', name: 'Hytta' }, geometry: g([[61, 8], [61, 8.002], [61.002, 8.002], [61, 8]]) },
        {
          type: 'relation' as const,
          id: 7,
          tags: { natural: 'wetland' },
          members: [
            { type: 'way', ref: 70, role: 'outer', geometry: g([[62, 8], [62, 8.1]]) },
            { type: 'way', ref: 71, role: 'outer', geometry: g([[62, 8.1], [62.1, 8.1], [62, 8]]) },
          ],
        },
      ],
    };
    const d = tolkSvar(json as unknown as Parameters<typeof tolkSvar>[0], p(61, 8), 5000, 'test');
    expect(d.linjer.map((x) => [x.type, x.navn, x.elv])).toEqual([
      ['sti', 'Stien', false],
      ['vann', '', true],
    ]);
    expect(d.omrader.map((o) => [o.id, o.type])).toEqual([
      ['w3', 'vann'],
      ['r7', 'myr'],
    ]);
    expect(d.stup).toHaveLength(1);
    expect(d.punkter.map((x) => [x.type, x.navn])).toEqual([
      ['topp', 'Toppen'],
      ['hytte', 'Hytta'],
    ]);
  });
});

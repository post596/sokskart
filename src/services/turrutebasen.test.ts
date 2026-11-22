import { describe, expect, it } from 'vitest';
import type { OsmLinje } from '../model/typer';
// real WFS response from wfs.geonorge.no (Fotrute near Spiterstulen, 22.11.2026)
import xml from './testdata/turrutebasen-fotrute.xml?raw';
import { fjernDuplikater, tolkTurGml, trbUrl } from './turrutebasen';

describe('Turrutebasen (WFS)', () => {
  it('bygger GetFeature med bbox i bredde/lengde-rekkefølge', () => {
    const u = new URL(trbUrl('Skiløype', 61.6, 8.35, 61.65, 8.45));
    expect(u.hostname).toBe('wfs.geonorge.no');
    expect(u.searchParams.get('typenames')).toBe('app:Skiløype');
    expect(u.searchParams.get('bbox')).toBe('61.60000,8.35000,61.65000,8.45000,urn:ogc:def:crs:EPSG::4258');
  });
  it('tolker GML til stier med rutenavn', () => {
    const l = tolkTurGml(xml, 'Fotrute');
    expect(l.length).toBeGreaterThanOrEqual(10);
    expect(l.every((x) => x.type === 'sti' && x.kilde === 'turrutebasen' && x.pts.length >= 2)).toBe(true);
    expect(l.some((x) => x.navn === 'Spiterstulen-Galdhøpiggen')).toBe(true);
    // coordinates are lat/lon near Spiterstulen
    const p = l[0].pts[0];
    expect(p.lat).toBeGreaterThan(61.5);
    expect(p.lat).toBeLessThan(61.8);
    expect(p.lng).toBeGreaterThan(8.2);
    expect(p.lng).toBeLessThan(8.6);
  });
});

describe('fjerning av stier som allerede finnes i OSM', () => {
  const linje = (id: string, pts: Array<[number, number]>, type: OsmLinje['type'] = 'sti'): OsmLinje => ({
    id,
    type,
    navn: '',
    elv: false,
    pts: pts.map(([lat, lng]) => ({ lat, lng })),
  });
  it('dropper en rute som ligger oppå en OSM-sti, men beholder en ny', () => {
    const osm = [linje('w1', [[61.6, 8.4], [61.61, 8.4]])];
    const trb = [
      linje('trb:a', [[61.6, 8.40012], [61.61, 8.40012]]), // ~6 m east of the OSM path
      linje('trb:b', [[61.6, 8.42], [61.61, 8.42]]), // ~1 km away
    ];
    const r = fjernDuplikater(trb, osm);
    expect(r.duplikater).toBe(1);
    expect(r.beholdt.map((x) => x.id)).toEqual(['trb:b']);
  });
  it('regner ikke bekker som stier', () => {
    const osm = [linje('w1', [[61.6, 8.4], [61.61, 8.4]], 'vann')];
    expect(fjernDuplikater([linje('trb:a', [[61.6, 8.4], [61.61, 8.4]])], osm).duplikater).toBe(0);
  });
});

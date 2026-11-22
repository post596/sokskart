import { describe, expect, it } from 'vitest';
import { lagGrid } from '../model/grid';
import { dekker, hoydeOmrade, wcsUrl } from './hoydedata';
import { fliserForOmrade, flisUrl, flisXY, KARTLAG } from './kartfliser';

describe('Kartverket høydedata (WCS)', () => {
  it('bygger GetCoverage-URL for riktig sone', () => {
    const u = new URL(wcsUrl(32, 462000, 6833000, 464000, 6835000, 100));
    expect(u.hostname).toBe('wcs.geonorge.no');
    expect(u.pathname).toBe('/skwms1/wcs.hoyde-dtm-nhm-25832');
    expect(u.searchParams.get('coverage')).toBe('nhm_dtm_topo_25832');
    expect(u.searchParams.get('bbox')).toBe('462000,6833000,464000,6835000');
    expect(u.searchParams.get('format')).toBe('GeoTIFF');
  });
  it('ber om et område med margin som dekker rutenettet', () => {
    const g = lagGrid({ lat: 61.6265, lng: 8.4006 }, 32, 17000, 301);
    const o = hoydeOmrade(g);
    expect(o.side).toBeGreaterThanOrEqual(2 * g.half);
    const r = { zone: 32 as const, west: o.west, north: o.north, cell: o.side / o.n, n: o.n, data: new Float32Array(0), hentet: '' };
    expect(dekker(r, g)).toBe(true);
    expect(dekker({ ...r, zone: 33 }, g)).toBe(false);
    expect(dekker(null, g)).toBe(false);
    // a slightly smaller grid (other category) reuses the raster
    expect(dekker(r, lagGrid({ lat: 61.6265, lng: 8.4006 }, 32, 15000, 301))).toBe(true);
  });
});

describe('kartfliser', () => {
  it('regner flisnummer (OSM-skjema)', () => {
    expect(flisXY(0, 0, 1)).toEqual([1, 1]);
    expect(flisXY(61.6265, 8.4006, 10)).toEqual([535, 287]);
  });
  it('lister fliser for et område', () => {
    const t = fliserForOmrade(61.5, 8.2, 61.7, 8.6, 10, 11);
    expect(t.length).toBeGreaterThan(2);
    expect(t.every((f) => f.z === 10 || f.z === 11)).toBe(true);
  });
  it('Kartverket bruker {z}/{y}/{x}', () => {
    expect(flisUrl(KARTLAG[0], { z: 10, x: 535, y: 287 })).toBe('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/10/287/535.png');
  });
});

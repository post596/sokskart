import { describe, expect, it } from 'vitest';
import proj4 from 'proj4';
import {
  computeZone,
  displayZone,
  formatUtm,
  fromUtm,
  latitudeBand,
  pointScale,
  standardZone,
  toUtm,
  utmRef14,
} from './utm';

/**
 * Reference values: computed with PROJ (proj4js, +proj=utm +datum=WGS84) for
 * well-known places. The same values must come out of our own Krüger implementation.
 */
const KNOWN = [
  { name: 'Galdhøpiggen', lat: 61.6363, lon: 8.3125, zone: 32, e: 463562.577, n: 6833857.053 },
  { name: 'Oslo rådhus', lat: 59.9119, lon: 10.7336, zone: 32, e: 596945.814, n: 6642868.929 },
  { name: 'Bergen (32V-unntaket)', lat: 60.3913, lon: 5.3221, zone: 32, e: 297353.933, n: 6700648.345 },
  { name: 'Bodø', lat: 67.2804, lon: 14.4049, zone: 33, e: 474351.684, n: 7462761.73 },
  { name: 'Tromsø (sone 33 tvunget)', lat: 69.6492, lon: 18.9553, zone: 33, e: 653421.188, n: 7731721.083 },
  { name: 'Vadsø', lat: 70.0744, lon: 29.7487, zone: 35, e: 604516.453, n: 7776527.571 },
  { name: 'Alta (sone 35 tvunget)', lat: 69.9689, lon: 23.2716, zone: 35, e: 357547.195, n: 7766761.375 },
  { name: 'Kirkenes (sone 35 tvunget)', lat: 69.7271, lon: 30.045, zone: 35, e: 617707.873, n: 7738375.416 },
];

describe('UTM WGS 84 – kjente punkter', () => {
  for (const p of KNOWN) {
    it(`geografisk → UTM: ${p.name}`, () => {
      const u = toUtm(p.lat, p.lon, p.zone);
      expect(u.e).toBeCloseTo(p.e, 2);
      expect(u.n).toBeCloseTo(p.n, 2);
    });
    it(`UTM → geografisk: ${p.name}`, () => {
      const g = fromUtm(p.zone, p.e, p.n);
      expect(g.lat).toBeCloseTo(p.lat, 7);
      expect(g.lon).toBeCloseTo(p.lon, 7);
    });
  }
});

describe('UTM mot PROJ i sone 32, 33 og 35', () => {
  const cases: Array<[number, number, number]> = [];
  // a grid across Norway for each zone, including far outside the zone's own strip
  for (const zone of [32, 33, 35]) {
    for (let lat = 58; lat <= 71; lat += 1.3) {
      for (let lon = 4.5; lon <= 31; lon += 2.7) cases.push([zone, lat, lon]);
    }
  }
  it('stemmer med PROJ på millimeter for alle punkter', () => {
    for (const [zone, lat, lon] of cases) {
      const [pe, pn] = proj4('EPSG:4326', `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`, [lon, lat]);
      // proj4js' own TM is accurate to mm only within ~10° of the central meridian
      if (Math.abs(lon - ((zone - 1) * 6 - 177)) > 10) continue;
      const u = toUtm(lat, lon, zone);
      expect(Math.abs(u.e - pe)).toBeLessThan(0.005);
      expect(Math.abs(u.n - pn)).toBeLessThan(0.005);
    }
  });
  it('går tur-retur uten tap', () => {
    for (const [zone, lat, lon] of cases) {
      const u = toUtm(lat, lon, zone);
      const g = fromUtm(zone, u.e, u.n);
      expect(g.lat).toBeCloseTo(lat, 9);
      expect(g.lon).toBeCloseTo(lon, 9);
    }
  });
});

describe('Soner og bånd', () => {
  it('bruker 32V-unntaket vest i Sør-Norge', () => {
    expect(standardZone(60.39, 5.32)).toBe(32);
    expect(standardZone(65.0, 5.32)).toBe(31);
  });
  it('bruker Svalbard-unntakene', () => {
    expect(standardZone(78.22, 15.65)).toBe(33); // Longyearbyen
    expect(standardZone(78.0, 25)).toBe(35);
  });
  it('auto viser det en GPS viser, tvungen sone overstyrer', () => {
    expect(displayZone(69.65, 18.96, 'auto')).toBe(34);
    expect(displayZone(69.65, 18.96, '33')).toBe(33);
  });
  it('beregningssone er alltid 32, 33 eller 35 (Kartverkets høydedata)', () => {
    expect(computeZone(69.65, 18.96, 'auto')).toBe(33);
    expect(computeZone(69.97, 23.27, 'auto')).toBe(35);
    expect(computeZone(69.73, 30.05, 'auto')).toBe(35);
    expect(computeZone(60.39, 5.32, 'auto')).toBe(32);
  });
  it('gir riktig breddebånd', () => {
    expect(latitudeBand(61.6)).toBe('V');
    expect(latitudeBand(69.6)).toBe('W');
    expect(latitudeBand(78.2)).toBe('X');
    expect(latitudeBand(-33.9)).toBe('H');
  });
});

describe('Formatering', () => {
  it('viser sone, bånd og 7+7 sifre', () => {
    const u = toUtm(61.6363, 8.3125, 32);
    expect(formatUtm(u)).toBe('32V 0463563 6833857');
    expect(utmRef14(u)).toBe('04635636833857');
    expect(utmRef14(u)).toHaveLength(14);
  });
});

describe('Målestokkfaktor', () => {
  it('er 0,9996 på sentralmeridianen og øker utover', () => {
    expect(pointScale(61, 9, 32)).toBeCloseTo(0.9996, 7);
    expect(pointScale(61, 12, 32)).toBeGreaterThan(0.9996);
  });
  it('stemmer med forholdet mellom kartavstand og avstand på ellipsoiden', () => {
    // a short east–west step along the 61° parallel, 3° from the central meridian
    const lat = 61;
    const dLon = 0.0005;
    const a = toUtm(lat, 12, 32);
    const b = toUtm(lat, 12 + dLon, 32);
    const grid = Math.hypot(b.e - a.e, b.n - a.n);
    const e2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);
    const phi = (lat * Math.PI) / 180;
    const Nphi = 6378137 / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const ground = Nphi * Math.cos(phi) * ((dLon * Math.PI) / 180);
    expect(pointScale(lat, 12 + dLon / 2, 32)).toBeCloseTo(grid / ground, 6);
  });
});

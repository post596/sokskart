import { describe, expect, it } from 'vitest';
import { areaM2, distToSegment, distanceM, lengthM, pointInRing, shoelace } from './geo';
import { fromUtm } from './utm';

const dms = (d: number, m: number, s: number) => Math.sign(d) * (Math.abs(d) + m / 60 + s / 3600);

describe('distanceM (Vincenty)', () => {
  it('stemmer med Vincentys eget testeksempel (Flinders Peak – Buninyong)', () => {
    const p = { lat: dms(-37, 57, 3.7203), lng: dms(144, 25, 29.5244) };
    const q = { lat: dms(-37, 39, 10.1561), lng: dms(143, 55, 35.3839) };
    expect(distanceM(p, q)).toBeCloseTo(54972.271, 2);
  });
  it('gir 0 for samme punkt', () => {
    expect(distanceM({ lat: 61, lng: 8 }, { lat: 61, lng: 8 })).toBe(0);
  });
  it('stemmer med UTM-avstand delt på målestokkfaktor for korte avstander', () => {
    // 1000 m north–south on the central meridian of zone 32: grid distance × 1/0.9996
    const a = fromUtm(32, 500000, 6800000);
    const b = fromUtm(32, 500000, 6801000);
    expect(distanceM({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon })).toBeCloseTo(1000 / 0.9996, 1);
  });
});

describe('lengthM', () => {
  it('summerer segmentene', () => {
    const a = fromUtm(32, 500000, 6800000);
    const b = fromUtm(32, 500000, 6801000);
    const c = fromUtm(32, 500000, 6802000);
    const pts = [a, b, c].map((g) => ({ lat: g.lat, lng: g.lon }));
    expect(lengthM(pts)).toBeCloseTo(2000 / 0.9996, 0);
  });
});

describe('areaM2', () => {
  it('gir 0,25 km² for et kvadrat på 500 × 500 m (rettet for målestokk)', () => {
    const corners = [
      [500000, 6800000],
      [500500, 6800000],
      [500500, 6800500],
      [500000, 6800500],
    ].map(([e, n]) => {
      const g = fromUtm(32, e, n);
      return { lat: g.lat, lng: g.lon };
    });
    // on the central meridian k = 0.9996, ground area = grid area / k²
    expect(areaM2(corners, 32)).toBeCloseTo(250000 / 0.9996 ** 2, -1);
  });
  it('gir 0 for færre enn tre hjørner', () => {
    expect(areaM2([{ lat: 61, lng: 8 }])).toBe(0);
  });
});

describe('plan geometri', () => {
  it('shoelace er uavhengig av omløpsretning', () => {
    const sq: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(shoelace(sq)).toBe(100);
    expect(shoelace([...sq].reverse())).toBe(100);
  });
  it('punkt i polygon', () => {
    const sq: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(pointInRing(5, 5, sq)).toBe(true);
    expect(pointInRing(15, 5, sq)).toBe(false);
  });
  it('avstand til linjestykke', () => {
    expect(distToSegment(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(distToSegment(-3, 4, 0, 0, 10, 0)).toBe(5);
  });
});

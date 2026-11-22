import { describe, expect, it } from 'vitest';
import { nyAksjon } from './aksjon';
import { distanceM } from './geo';
import { lagGeoJson, lagKml, sirkel } from './eksport';

function aksjon() {
  const a = nyAksjon();
  a.navn = 'Test & co';
  a.ipp = { lat: 61.6265, lng: 8.4006 };
  a.teiger.push({
    id: 'T001',
    type: 'T',
    navn: '',
    ring: [
      { lat: 61.62, lng: 8.4 },
      { lat: 61.625, lng: 8.4 },
      { lat: 61.625, lng: 8.41 },
    ],
    status: 'utdelt',
    utdelt: null,
    sok: [{ id: 's', tid: '', pod: 0.6, org: 'NFS', ressurstype: 'Msk', enhet: '21', merknad: '' }],
    opprettet: '',
  });
  a.punkter.push({ id: 'OBS001', type: 'obs', klasse: 'sikker', tid: '2026-11-22T10:00', tekst: 'Sett <ved> brua', pos: { lat: 61.63, lng: 8.41 } });
  return a;
}
const inp = () => ({
  aksjon: aksjon(),
  ringer: [700, 1900, 3600, 11300] as [number, number, number, number],
  ledelinjer: [{ nr: 'L001', navn: 'Stien', type: 'Sti', pts: [{ lat: 61.62, lng: 8.4 }, { lat: 61.63, lng: 8.4 }] }],
});

describe('sirkel', () => {
  it('har riktig radius og er lukket', () => {
    const c = sirkel({ lat: 61.6, lng: 8.4 }, 1000);
    expect(c[0]).toEqual(c[c.length - 1]);
    for (const p of c) expect(Math.abs(distanceM({ lat: 61.6, lng: 8.4 }, p) - 1000)).toBeLessThan(10);
  });
});

describe('GeoJSON-eksport', () => {
  const g = JSON.parse(lagGeoJson(inp()));
  it('er en FeatureCollection med IPP, fire ringer, teig, punkt og ledelinje', () => {
    expect(g.type).toBe('FeatureCollection');
    const navn = g.features.map((f: { properties: { name: string } }) => f.properties.name);
    expect(navn).toEqual(['IPP', 'R25', 'R50', 'R75', 'R95', 'T001', 'OBS001', 'L001']);
  });
  it('bruker [lengde, bredde] og lukkede polygoner', () => {
    const ipp = g.features[0];
    expect(ipp.geometry.coordinates).toEqual([8.4006, 61.6265]);
    const teig = g.features.find((f: { properties: { name: string } }) => f.properties.name === 'T001');
    const ring = teig.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(teig.properties.akkumulert_pod).toBe(0.6);
    expect(teig.properties.stroke).toBe('#ea580c'); // one search: orange
  });
});

describe('KML-eksport', () => {
  const k = lagKml(inp());
  it('har placemarks med navn og koordinater lengde,bredde', () => {
    expect(k).toContain('<name>T001</name>');
    expect(k).toContain('<name>L001</name>');
    expect(k).toContain('8.400600,61.626500,0');
    expect(k).toContain('<styleUrl>#teig-ettSok</styleUrl>');
  });
  it('escaper tekst', () => {
    expect(k).toContain('Test &amp; co');
    expect(k).toContain('Sett &lt;ved&gt; brua');
  });
});

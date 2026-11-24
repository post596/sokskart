import { describe, expect, it } from 'vitest';
import { nyAksjon } from './aksjon';
import { distanceM, motUrviser } from './geo';
import { lagGeoJson, lagKml, lagTeigGpx, lagTeigKml, sirkel, teigBeskrivelse, utmHjorner, type TeigEksport } from './eksport';

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

describe('ringretning', () => {
  const ccw = [
    { lat: 61.62, lng: 8.4 },
    { lat: 61.62, lng: 8.41 },
    { lat: 61.625, lng: 8.41 },
  ];
  it('snur ringer med klokka, men ikke mot klokka', () => {
    expect(motUrviser(ccw)).toBe(ccw);
    expect(motUrviser([...ccw].reverse())).toEqual(ccw);
  });
  it('GeoJSON-teiger er mot klokka uansett hvordan de ble tegnet', () => {
    // the test teig above runs clockwise (north, then east)
    const g = JSON.parse(lagGeoJson(inp()));
    const ring: number[][] = g.features.find((f: { properties: { name: string } }) => f.properties.name === 'T001').geometry.coordinates[0];
    let s = 0;
    for (let i = 1; i < ring.length; i++) s += (ring[i][0] - ring[i - 1][0]) * (ring[i][1] + ring[i - 1][1]);
    expect(s).toBeLessThan(0);
  });
});

describe('teiger og forslag til FAKS', () => {
  const t: TeigEksport = {
    navn: 'Forslag 1',
    type: 'teigforslag',
    ring: [
      { lat: 61.62, lng: 8.4 },
      { lat: 61.625, lng: 8.4 },
      { lat: 61.625, lng: 8.41 },
      { lat: 61.62, lng: 8.41 },
    ],
    arealKm2: 0.29,
    poa: 0.123,
    timer: 1.6,
    begrunnelse: 'Nr. 1/3, POA 12 %; sti <L003>',
  };
  const d: TeigEksport = { ...t, navn: 'Drone 1', type: 'droneforslag', timer: null, flytid: { minutter: 23, batterier: 1 } };
  it('KML har mapper, beskrivelse og ExtendedData', () => {
    const k = lagTeigKml('Aksjon', [
      { navn: 'Teigforslag', teiger: [t] },
      { navn: 'Droneforslag', teiger: [d] },
      { navn: 'Tom', teiger: [] },
    ]);
    expect(k.match(/<Folder>/g)).toHaveLength(2);
    expect(k).toContain('<Data name="areal_km2"><value>0.290</value></Data>');
    expect(k).toContain('<Data name="poa_prosent"><value>12.3</value></Data>');
    expect(k).toContain('<Data name="soketid_timer"><value>1.60</value></Data>');
    expect(k).toContain('<Data name="batterier"><value>1</value></Data>');
    expect(k).toContain('sti &lt;L003&gt;');
    expect(teigBeskrivelse(d)).toContain('ca. 23 min flytid, 1 batteri');
  });
  it('GPX har lukkede spor med beskrivelse', () => {
    const g = lagTeigGpx('Aksjon', [t, d]);
    expect(g.match(/<trk>/g)).toHaveLength(2);
    expect(g).toContain('<desc>Teigforslag 0,29 km² · POA 12 %');
    expect(g.match(/<trkpt/g)).toHaveLength(10);
  });
  it('UTM-hjørner: et kvadrat med mange punkter på kantene blir 4 hjørner', () => {
    const tett: { lat: number; lng: number }[] = [];
    for (let i = 0; i < 10; i++) tett.push({ lat: 61.62, lng: 8.4 + i * 0.001 });
    for (let i = 0; i < 10; i++) tett.push({ lat: 61.62 + i * 0.0005, lng: 8.41 });
    for (let i = 0; i < 10; i++) tett.push({ lat: 61.625, lng: 8.41 - i * 0.001 });
    for (let i = 0; i < 10; i++) tett.push({ lat: 61.625 - i * 0.0005, lng: 8.4 });
    const h = utmHjorner(tett, '32');
    expect(h).toHaveLength(4);
    for (const x of h) expect(x).toMatch(/^32V \d{7} \d{7}$/);
  });
  it('UTM-hjørner gir aldri flere enn maks', () => {
    const sirkelring = sirkel({ lat: 61.6, lng: 8.4 }, 400, 90).slice(0, -1);
    expect(utmHjorner(sirkelring, '32', 8).length).toBeLessThanOrEqual(8);
    expect(utmHjorner(sirkelring, '32', 8).length).toBeGreaterThanOrEqual(4);
  });
});

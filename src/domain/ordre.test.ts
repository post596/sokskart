import { describe, expect, it } from 'vitest';
import { nyAksjon, type Teig } from './aksjon';
import { lagFempunktsordre, standardOppdrag, standardSokstype } from './ordre';

const teig: Teig = {
  id: 'T003',
  type: 'T',
  navn: '',
  ring: [
    { lat: 61.62, lng: 8.4 },
    { lat: 61.625, lng: 8.4 },
    { lat: 61.625, lng: 8.41 },
  ],
  status: 'utdelt',
  utdelt: null,
  sok: [{ id: 's', tid: '2026-11-22T10:00', pod: 0.4, org: 'NFS', ressurstype: 'Msk', enhet: '21', merknad: '' }],
  opprettet: '',
};

describe('5-punktsordre (veileder 10.3.1)', () => {
  const a = nyAksjon();
  a.navn = 'Spiterstulen';
  a.sarNr = 'SAR-1';
  a.ipp = { lat: 61.6265, lng: 8.4006 };
  a.sone = '32';
  a.savnet = { ...a.savnet, navn: 'Ola', alder: '72', beskrivelse: 'Rød jakke', scenario: 'mobil', helse: 'Demens' };
  a.ordre.egneStyrker = '3 lag NFS';
  const tekst = lagFempunktsordre({
    aksjon: a,
    kategorier: 'Demens',
    ringer: [300, 800, 1900, 8300],
    fart: { v: 1.5, mob: 12 },
    observasjoner: [
      { id: 'OBS001', type: 'obs', klasse: 'sikker', tid: '2026-11-22T09:00', tekst: 'Sett på brua', pos: { lat: 61.63, lng: 8.41 } },
      { id: 'OBS002', type: 'obs', klasse: 'usikker', tid: '2026-11-22T09:30', tekst: 'Kanskje', pos: { lat: 61.64, lng: 8.42 } },
    ],
    kilde: { type: 'teig', teig, arealKm2: 0.31, poa: 0.12 },
    oppdrag: 'Søk T003',
    sokstype: standardSokstype({ type: 'teig', teig, arealKm2: 0.31, poa: 0.12 }),
    ressurs: 'NFS–Msk–22',
    naa: new Date('2026-11-22T11:00:00'),
  });
  it('har de fem punktene i riktig rekkefølge', () => {
    const idx = ['1. SITUASJON', '2. OPPDRAG', '3. UTFØRELSE', '4. ADMINISTRASJON OG FORSYNINGSTJENESTE', '5. LEDELSE OG SAMBAND'].map((h) => tekst.indexOf(h));
    expect(idx.every((v) => v >= 0)).toBe(true);
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
  });
  it('tar med savnetprofil, statistikk, IPP og bare sikre/sannsynlige observasjoner', () => {
    expect(tekst).toContain('Ola, 72 år');
    expect(tekst).toContain('Scenario: trolig i bevegelse (mobil)');
    expect(tekst).toContain('R25 300 m, R50 800 m, R75 1,9 km, R95 8,3 km');
    expect(tekst).toContain('IPP: 32V 0468222 6832719');
    expect(tekst).toContain('OBS001 sikker');
    expect(tekst).not.toContain('OBS002');
    expect(tekst).toContain('taushetsbelagte');
  });
  it('beskriver teigen med areal, POA, hjørner i UTM og tidligere søk', () => {
    expect(tekst).toContain('5-PUNKTSORDRE – T003–NFS–Msk–22');
    expect(tekst).toContain('Område: T003 (0,31 km², POA nå 12 %)');
    expect(tekst.match(/^ {3}\d\. 32V \d{7} \d{7}$/gm)).toHaveLength(3);
    expect(tekst).toContain('Tidligere søk i teigen: 40 % (NFS–Msk–21)');
    expect(tekst).toContain('14-sifret UTM');
  });
  it('har fornuftige standardvalg per kilde', () => {
    expect(standardSokstype({ type: 'punkt', punkt: { id: 'SP001', type: 'sp', klasse: 'mulig', tid: '', tekst: '', pos: { lat: 0, lng: 0 } } })).toBe('Sperrepost / observasjonspost');
    expect(standardOppdrag({ type: 'linje', nr: 'L002', navn: '', typeNavn: 'Sti', lengdeM: 1, pts: [], tNaadd: null, poa: null })).toContain('L002');
  });
});

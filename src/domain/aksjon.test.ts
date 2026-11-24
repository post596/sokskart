import { describe, expect, it } from 'vitest';
import { kopierStatistikk } from '../data/lpb-stats';
import { aksjonsfilnavn, lagAksjonsfil, lesAksjonsfil, nyAksjon, timerMellom } from './aksjon';
import { escXml, lagGpx } from './gpx';

describe('aksjonsfil', () => {
  it('kan lagres og leses tilbake uten tap', () => {
    const a = nyAksjon();
    a.navn = 'Test';
    a.ipp = { lat: 61.6, lng: 8.4 };
    a.teiger.push({
      id: 'T001',
      type: 'T',
      navn: '',
      ring: [
        { lat: 61.6, lng: 8.4 },
        { lat: 61.61, lng: 8.4 },
        { lat: 61.61, lng: 8.41 },
      ],
      status: 'utdelt',
      utdelt: null,
      sok: [{ id: 's1', tid: '2026-11-22T10:00', pod: 0.6, org: 'NFS', ressurstype: 'Msk', enhet: '21', merknad: '' }],
      opprettet: a.opprettet,
    });
    const tekst = JSON.stringify(lagAksjonsfil(a, kopierStatistikk(), null));
    const r = lesAksjonsfil(tekst);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fil.aksjon).toEqual(a);
      expect(r.fil.statistikk).toHaveLength(16);
    }
  });
  it('avviser ugyldige filer med norsk feilmelding', () => {
    expect(lesAksjonsfil('ikke json')).toEqual({ ok: false, feil: 'Fila er ikke gyldig JSON.' });
    const r = lesAksjonsfil('{"foo":1}');
    expect(r.ok).toBe(false);
    const ny = lesAksjonsfil(JSON.stringify({ format: 'sokskart-aksjon', versjon: 99, aksjon: {} }));
    expect(ny.ok).toBe(false);
  });
  it('hopper over teiger med ugyldig geometri', () => {
    const a = nyAksjon();
    const f = lagAksjonsfil(a, kopierStatistikk(), null) as unknown as { aksjon: { teiger: unknown[] } };
    f.aksjon.teiger = [{ id: 'T001', ring: [{ lat: 'x' }] }];
    const r = lesAksjonsfil(JSON.stringify(f));
    expect(r.ok && r.fil.aksjon.teiger.length === 0 && r.advarsler.length === 1).toBe(true);
  });
  it('fjerner regioner og Mattson fra gamle filer med ett varsel', () => {
    const f = lagAksjonsfil(nyAksjon(), kopierStatistikk(), null) as unknown as { aksjon: Record<string, unknown> };
    f.aksjon.regioner = [{ id: 'REGA', navn: '', ring: [] }];
    f.aksjon.mattson = { deltakere: [{ id: 'a', navn: 'IL' }], vurdering: {} };
    f.aksjon.seq = { T: 2, REG: 1 };
    const r = lesAksjonsfil(JSON.stringify(f));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const a = r.fil.aksjon as unknown as Record<string, unknown>;
      expect('regioner' in a).toBe(false);
      expect('mattson' in a).toBe(false);
      expect(r.fil.aksjon.seq).toEqual({ T: 2 });
      expect(r.advarsler).toHaveLength(1);
      // loading again (IndexedDB) gives no new warning
      const igjen = lesAksjonsfil(JSON.stringify(r.fil));
      expect(igjen.ok && igjen.advarsler.length).toBe(0);
    }
  });
  it('leser aksjonsfiler fra prototypen', () => {
    const proto = {
      state: {
        name: 'Gammel',
        cat: 'dement',
        lastSeen: '2026-11-22T08:00',
        zone: '32',
        ipp: { lat: 61.5, lng: 8.5 },
        teiger: [{ id: 'T001', pts: [[61.5, 8.5], [61.51, 8.5], [61.51, 8.51]], status: 'utdelt', searches: [{ pod: 60, res: 'Hund', t: '2026-11-22T09:00' }] }],
        points: [{ id: 'OBS001', type: 'obs', cls: 'sikker', t: '2026-11-22T09:30', txt: 'Sett', lat: 61.52, lng: 8.52 }],
        seq: { T: 1, OBS: 1 },
      },
      ways: [],
    };
    const r = lesAksjonsfil(JSON.stringify(proto));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const a = r.fil.aksjon;
      expect(a.navn).toBe('Gammel');
      expect(a.kategorier).toEqual([{ key: 'dement', vekt: 1 }]);
      expect(a.teiger[0].sok[0].pod).toBeCloseTo(0.6, 10);
      expect(a.punkter[0].klasse).toBe('sikker');
      expect(a.seq.T).toBe(1);
    }
  });
  it('lager trygge filnavn', () => {
    const a = nyAksjon();
    expect(aksjonsfilnavn(a, 'json')).toBe('aksjon.json');
    a.sarNr = 'SAR 2026/123 Ål';
    expect(aksjonsfilnavn(a, 'gpx')).toBe('SAR_2026_123_Ål.gpx');
  });
  it('regner timer siden sist sett', () => {
    expect(timerMellom('2026-11-22T08:00', new Date('2026-11-22T09:30'))).toBeCloseTo(1.5, 10);
    expect(timerMellom(null, new Date())).toBeNull();
    expect(timerMellom('tull', new Date())).toBeNull();
  });
});

describe('GPX', () => {
  it('skriver veipunkter og lukkede spor for teiger', () => {
    const g = lagGpx(
      'Aksjon <1>',
      [{ navn: 'IPP', pos: { lat: 61.6, lng: 8.4 }, beskrivelse: 'Bil & tursti' }],
      [
        {
          navn: 'T001',
          lukket: true,
          pts: [
            { lat: 61.6, lng: 8.4 },
            { lat: 61.61, lng: 8.4 },
            { lat: 61.61, lng: 8.41 },
          ],
        },
      ],
      new Date('2026-11-22T10:00:00Z'),
    );
    expect(g).toContain('<gpx version="1.1"');
    expect(g).toContain('<name>Aksjon &lt;1&gt;</name>');
    expect(g).toContain('<wpt lat="61.600000" lon="8.400000"><name>IPP</name><desc>Bil &amp; tursti</desc></wpt>');
    expect(g.match(/<trkpt/g)).toHaveLength(4);
    expect(g).toContain('<time>2026-11-22T10:00:00.000Z</time>');
  });
  it('escaper XML', () => {
    expect(escXml(`a<b>&"c'`)).toBe('a&lt;b&gt;&amp;&quot;c&apos;');
  });
});

import { describe, expect, it } from 'vitest';
import { grunnlagLinjer, kortBegrunnelse, medLnummer, type ForslagGrunnlag } from './grunnlag';

const g: ForslagGrunnlag = {
  rang: 2,
  antall: 5,
  poa: 0.082,
  poaKum: 0.19,
  arealKm2: 0.21,
  soner: [0, 0.6, 0.4, 0, 0],
  tMinTimer: 0.75,
  avstandM: 1240,
  arealtyper: [
    { navn: 'skog', andel: 0.6 },
    { navn: 'myr', andel: 0.3 },
  ],
  helningSnitt: 11.6,
  linjer: [{ id: 'w1', type: 'sti', navn: 'Stien', lengdeM: 450 }],
  poi: ['Hytte «Bua»'],
  teknikk: { navn: 'Grovsøk (kombinert mannskapssøk)', mannskap: 3, avstandM: 25, fartKmt: 1.5, sokefaktor: 0.72, timer: 1.6 },
  fase: { navn: 'Overgang til formell søksplanlegging', timer: 7, grunn: '15 fotmannskap / 3 per lag = 5 lag.' },
  beregnet: '2026-11-24T10:00:00Z',
};

describe('begrunnelse for teigforslag', () => {
  it('forklarer rang, POA, sone, gangtid, terreng, ledelinjer, teknikk og fase', () => {
    const t = grunnlagLinjer(g, { w1: 'L003' }).join('\n');
    expect(t).toContain('Nr. 2 av 5');
    expect(t).toContain('8,2 % av gjenværende sannsynlighet');
    expect(t).toContain('19 % sammen med forslagene foran');
    expect(t).toContain('60 % i 50 %-sonen, 40 % i 75 %-sonen');
    expect(t).toContain('1,2 km fra IPP');
    expect(t).toContain('45 min gange');
    expect(t).toContain('skog 60 %, myr 30 %');
    expect(t).toContain('snitthelning 12°');
    expect(t).toContain('L003 Sti «Stien» (450 m)');
    expect(t).toContain('Hytte «Bua»');
    expect(t).toContain('3 personer med grovsøk, 25 m mellom og 1,5 km/t');
    expect(t).toContain('senker farten til 72 %');
    expect(t).toContain('7 t siden start');
  });
  it('setter inn L-nummer og lager én kort linje for eksport', () => {
    expect(medLnummer(g, { w1: 'L007' }).linjer[0].nr).toBe('L007');
    const k = kortBegrunnelse(medLnummer(g, { w1: 'L007' }));
    expect(k).toContain('Nr. 2/5');
    expect(k).toContain('L007');
    expect(k.length).toBeLessThanOrEqual(300);
  });
  it('viser droneeffekt og batterier for droneområder', () => {
    const d = grunnlagLinjer({ ...g, teknikk: undefined, drone: { effekt: 0.86, minutter: 23, batterier: 1 } }).join('\n');
    expect(d).toContain('Droneeffekt i snitt 0,86');
    expect(d).toContain('1 batteri');
  });
});

import { describe, expect, it } from 'vitest';
import { faseanbefaling, sokefase } from './fase';

const G: [number, number] = [6, 12];
const base = { grenser: G, r25: 700, fotmannskap: 15, mannskapPerLag: 3, standardTeknikk: 'grovsok' as const };

describe('søksfase etter tid', () => {
  it('følger grensene 6 og 12 timer', () => {
    expect(sokefase(null, G)).toBe('forsteinnsats');
    expect(sokefase(2, G)).toBe('forsteinnsats');
    expect(sokefase(6, G)).toBe('overgang');
    expect(sokefase(11.9, G)).toBe('overgang');
    expect(sokefase(12, G)).toBe('formell');
  });
  it('førsteinnsats: ingen teiger, men finsøk av navet når R25 < 300 m', () => {
    expect(faseanbefaling({ ...base, timer: 1 }).teig).toBeNull();
    const navet = faseanbefaling({ ...base, timer: 1, r25: 200 });
    expect(navet.teig).toEqual({ modus: 'navet', antall: 0, teknikk: 'finsok' });
  });
  it('overgang: like mange teiger som fotlag', () => {
    const a = faseanbefaling({ ...base, timer: 7 });
    expect(a.teig).toEqual({ modus: 'neste', antall: 5, teknikk: 'grovsok' });
    expect(faseanbefaling({ ...base, timer: 7, fotmannskap: 0 }).teig?.antall).toBe(3);
  });
  it('formell: teigsett for 75 %-sonen', () => {
    expect(faseanbefaling({ ...base, timer: 13 }).teig?.modus).toBe('sett');
  });
});

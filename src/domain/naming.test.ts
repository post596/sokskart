import { describe, expect, it } from 'vitest';
import { datoTidsgruppe, nesteId, oppdragsnavn, regionId, sporloggnavn } from './naming';

describe('Navngiving etter veilederen', () => {
  it('gir T001, T002 … uten å endre originalen', () => {
    const a = nesteId({}, 'T');
    expect(a.id).toBe('T001');
    const b = nesteId(a.seq, 'T');
    expect(b.id).toBe('T002');
    expect(a.seq.T).toBe(1);
    expect(nesteId(b.seq, 'SP').id).toBe('SP001');
  });
  it('gir regioner REGA, REGB … REGZ, REGAA', () => {
    expect(regionId(0)).toBe('REGA');
    expect(regionId(1)).toBe('REGB');
    expect(regionId(25)).toBe('REGZ');
    expect(regionId(26)).toBe('REGAA');
  });
  it('oppdragsnavn som i veilederens eksempel', () => {
    expect(oppdragsnavn('T001', 'RK', 'Msk', '21')).toBe('T001–RK–Msk–21');
    expect(oppdragsnavn('L001', 'P', 'HF', 'V30A')).toBe('L001–P–HF–V30A');
  });
  it('dato-tidsgruppe og sporloggnavn som i veilederens eksempel', () => {
    const d = new Date(2026, 10, 28, 13, 45);
    expect(datoTidsgruppe(d)).toBe('281345');
    expect(sporloggnavn('T005', d, 'RK', 'Drone', '71')).toBe('T005–281345–RK–Drone–71');
  });
});

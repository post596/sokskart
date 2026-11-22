import { describe, expect, it } from 'vitest';
import { fmtAvstand, fmtFart, fmtKm2, fmtTid, fmtTimer, lesProsent } from './format';

describe('formatering av tall i grensesnittet', () => {
  it('avstand', () => {
    expect(fmtAvstand(847)).toBe('850 m');
    expect(fmtAvstand(1900)).toBe('1,9 km');
    expect(fmtAvstand(11300)).toBe('11 km');
    expect(fmtAvstand(Number.NaN)).toBe('–');
  });
  it('timer og minutter', () => {
    expect(fmtTimer(0.5)).toBe('30 min');
    expect(fmtTimer(1.0833)).toBe('1 t 05 min');
    expect(fmtTimer(12)).toBe('12 t');
    expect(fmtTimer(null)).toBe('–');
    expect(fmtTimer(Infinity)).toBe('–');
  });
  it('areal', () => {
    expect(fmtKm2(0.3141)).toBe('0,31 km²');
    expect(fmtKm2(4.06)).toBe('4,1 km²');
    expect(fmtKm2(26.4)).toBe('26 km²');
  });
  it('fart', () => {
    expect(fmtFart(3)).toBe('3,0 km/t');
  });
  it('tidspunkt', () => {
    expect(fmtTid('2026-11-22T10:05')).toBe('22.11. kl. 10:05');
    expect(fmtTid(null)).toBe('–');
  });
  it('leser POD som prosent eller andel', () => {
    expect(lesProsent('60')).toBeCloseTo(0.6, 10);
    expect(lesProsent('60 %')).toBeCloseTo(0.6, 10);
    expect(lesProsent('0,6')).toBeCloseTo(0.6, 10);
    expect(lesProsent('150')).toBeNull();
    expect(lesProsent('x')).toBeNull();
  });
});

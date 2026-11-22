import { describe, expect, it } from 'vitest';
import { akkumulertPod, gjenstaendePoa, podBetegnelse, pos, prosent, teigfarge } from './pod';

describe('POD, POA og POS (veileder kap. 6.1 og 7.5)', () => {
  it('veilederens eksempel: hund 50 % og mannskap 40 % gir 70 % akkumulert', () => {
    expect(akkumulertPod([0.5, 0.4])).toBeCloseTo(0.7, 10);
  });
  it('tre søk med normal høy POD (60 %) gir svært høy POD', () => {
    expect(akkumulertPod([0.6, 0.6, 0.6])).toBeCloseTo(0.936, 10);
    expect(akkumulertPod([0.7, 0.7, 0.7])).toBeGreaterThan(0.95);
  });
  it('ingen søk gir 0 i akkumulert POD', () => {
    expect(akkumulertPod([])).toBe(0);
  });
  it('POS = POA × POD (eksempel: 25 % × 40 % = 10 %)', () => {
    expect(pos(0.25, 0.4)).toBeCloseTo(0.1, 10);
  });
  it('gjenstående POA etter hund 50 % og søkekjede 70 % i R25 er 3,75 %', () => {
    const etterHund = gjenstaendePoa(0.25, 0.5);
    expect(etterHund).toBeCloseTo(0.125, 10);
    expect(gjenstaendePoa(etterHund, 0.7)).toBeCloseTo(0.0375, 10);
    expect(gjenstaendePoa(0.25, akkumulertPod([0.5, 0.7]))).toBeCloseTo(0.0375, 10);
  });
  it('klemmer ugyldige verdier til 0..1', () => {
    expect(akkumulertPod([1.5])).toBe(1);
    expect(akkumulertPod([-0.2, Number.NaN])).toBe(0);
  });
});

describe('POD-betegnelser', () => {
  it('følger tabellen i veilederen', () => {
    expect(podBetegnelse(0.96)).toBe('Svært høy');
    expect(podBetegnelse(0.95)).toBe('Høy');
    expect(podBetegnelse(0.75)).toBe('Høy');
    expect(podBetegnelse(0.6)).toBe('Normal høy');
    expect(podBetegnelse(0.5)).toBe('Normal høy');
    expect(podBetegnelse(0.3)).toBe('Normal lav');
    expect(podBetegnelse(0.1)).toBe('Lav');
  });
});

describe('Fargekoder for teiger', () => {
  it('blå planlagt, rød utdelt, oransje ett søk, gul flere søk, grønn > 95 %', () => {
    expect(teigfarge('planlagt', [])).toBe('planlagt');
    expect(teigfarge('utdelt', [])).toBe('utdelt');
    expect(teigfarge('utdelt', [0.6])).toBe('ettSok');
    expect(teigfarge('utdelt', [0.6, 0.6])).toBe('flereSok');
    expect(teigfarge('utdelt', [0.9, 0.7])).toBe('ferdig');
    expect(teigfarge('planlagt', [0.96])).toBe('ferdig');
  });
});

describe('prosent', () => {
  it('bruker desimalkomma', () => {
    expect(prosent(0.125)).toBe('13 %');
    expect(prosent(0.125, 1)).toBe('12,5 %');
    expect(prosent(0.0375)).toBe('3,8 %');
    expect(prosent(0.0375, 2)).toBe('3,75 %');
  });
});

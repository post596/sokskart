import { describe, expect, it } from 'vitest';
import { LINJETYPE_NAVN, type LinjeType } from '../model/typer';
import { STANDARD_MODELL } from './modellantakelser';
import { ressurserFor, stisokAnbefaling } from './stisok';
import { SOKSTYPER } from '../domain/ordre';

const m = STANDARD_MODELL;

describe('anbefalt ressurs for stisøk', () => {
  it('har anbefaling, kilde og gyldig metode for alle linjetyper', () => {
    for (const t of Object.keys(LINJETYPE_NAVN) as LinjeType[]) {
      const a = stisokAnbefaling(t, 1000, ['turgaer'], m);
      expect(a.primar.tekst.length).toBeGreaterThan(5);
      expect(a.kilder.length).toBeGreaterThan(0);
      expect((SOKSTYPER as readonly string[]).includes(a.metode)).toBe(true);
    }
  });

  it('følger veilederen per linjetype', () => {
    expect(stisokAnbefaling('sti', 1000, ['turgaer'], m).primar.ressurs).toBe('fotlag');
    expect(ressurserFor(stisokAnbefaling('sti', 1000, ['turgaer'], m))).toContain('hund');
    expect(stisokAnbefaling('traktorvei', 1000, ['turgaer'], m).primar.ressurs).toBe('atv');
    expect(stisokAnbefaling('vei', 1000, ['turgaer'], m).primar.ressurs).toBe('bil');
    expect(stisokAnbefaling('vann', 1000, ['turgaer'], m).primar.ressurs).toBe('drone');
    expect(stisokAnbefaling('jernbane', 1000, ['turgaer'], m).verifisert).toBe(false);
  });

  it('gir flanke ved økt selvmordsrisiko, demens og barn', () => {
    for (const k of ['suicid', 'dement', 'b46']) {
      const a = stisokAnbefaling('sti', 1000, [k], m);
      expect(a.flanke).toBe(true);
      expect(a.metode).toBe('Søk langs ledelinje med flanke');
    }
    // drone stays primary along a river, the flanking foot team becomes the first alternative
    const elv = stisokAnbefaling('vann', 1000, ['suicid'], m);
    expect(elv.primar.ressurs).toBe('drone');
    expect(elv.alternativ[0].tekst).toContain('flanke');
    expect(stisokAnbefaling('sti', 1000, ['turgaer'], m).flanke).toBe(false);
  });

  it('gir snøskuter på løyper og traktorveier for skiløpere', () => {
    expect(stisokAnbefaling('sti', 1000, ['langrenn'], m).primar.ressurs).toBe('snoskuter');
    expect(stisokAnbefaling('traktorvei', 1000, ['alpin'], m).primar.ressurs).toBe('snoskuter');
    expect(stisokAnbefaling('vei', 1000, ['langrenn'], m).primar.ressurs).toBe('bil');
  });

  it('regner tid for hele linja med farten til anbefalt ressurs', () => {
    // 3 km at 3 km/h (foot, no flank) = 60 min; with flank 1.5 km/h = 120 min
    expect(stisokAnbefaling('sti', 3000, ['turgaer'], m).minutter).toBe(60);
    expect(stisokAnbefaling('sti', 3000, ['suicid'], m).minutter).toBe(120);
    // 18 km/h drone over 3 km = 10 min
    expect(stisokAnbefaling('kraft', 3000, ['turgaer'], m).minutter).toBe(10);
  });
});

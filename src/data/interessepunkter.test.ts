import { describe, expect, it } from 'vitest';
import { INTERESSEPUNKTER, PUNKTBEGRUNNELSE, punktgrunn, PUNKTTYPENAVN, punktvekter, punktvekterMedBidrag, vurderPunkt, type PunktTypeKandidat } from './interessepunkter';

describe('interessepunkter: begrunnelser', () => {
  it('har begrunnelse og vurdering for alle typer som brukes', () => {
    const brukt = new Set(Object.values(INTERESSEPUNKTER).flatMap((v) => Object.keys(v))) as Set<PunktTypeKandidat>;
    for (const t of brukt) {
      expect(PUNKTBEGRUNNELSE[t].tekst.length).toBeGreaterThan(20);
      expect(vurderPunkt(t, null).length).toBeGreaterThan(10);
    }
    expect(Object.keys(PUNKTBEGRUNNELSE).sort()).toEqual(Object.keys(PUNKTTYPENAVN).sort());
  });
  it('bruker kategoriteksten der den finnes', () => {
    expect(punktgrunn('myr', 'plukker')).toContain('bærplukker');
    expect(punktgrunn('myr', 'turgaer')).toBe(PUNKTBEGRUNNELSE.myr.tekst);
  });
  it('punktvekter er summen av bidragene', () => {
    const k = [
      { key: 'suicid', w: 0.6 },
      { key: 'fisker', w: 0.4 },
    ];
    const b = punktvekterMedBidrag(k);
    expect(b.bru!.sum).toBeCloseTo(0.6 * 1 + 0.4 * 0.6, 10);
    expect(b.bru!.bidrag.map((x) => x.key)).toEqual(['suicid', 'fisker']);
    expect(punktvekter(k).bru).toBeCloseTo(b.bru!.sum, 10);
  });
  it('anbefaler drone over åpen myr når droneeffekten er høy', () => {
    expect(vurderPunkt('myr', 1)).toContain('Drone');
    expect(vurderPunkt('myr', 0.2)).not.toContain('Drone');
  });
});

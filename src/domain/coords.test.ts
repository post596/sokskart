import { describe, expect, it } from 'vitest';
import { formatDegrees, parsePosition } from './coords';

const near = (a: number, b: number, d = 1e-5) => Math.abs(a - b) < d;

describe('parsePosition', () => {
  it('leser UTM med sone og bånd', () => {
    const r = parsePosition('32V 0463563 6833857');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('utm');
      expect(near(r.pos.lat, 61.6363, 1e-4)).toBe(true);
      expect(near(r.pos.lng, 8.3125, 1e-4)).toBe(true);
    }
  });
  it('leser UTM uten bånd og uten innledende null', () => {
    const r = parsePosition('32 463563 6833857');
    expect(r.ok && near(r.pos.lat, 61.6363, 1e-4)).toBe(true);
  });
  it('leser 14-sifret referanse med sone', () => {
    const r = parsePosition('32V 04635636833857');
    expect(r.ok && near(r.pos.lng, 8.3125, 1e-4)).toBe(true);
  });
  it('krever sone når UTM skrives uten sone og sonen står på auto', () => {
    expect(parsePosition('0463563 6833857', 'auto').ok).toBe(false);
    const r = parsePosition('0463563 6833857', '32');
    expect(r.ok && near(r.pos.lat, 61.6363, 1e-4)).toBe(true);
  });
  it('leser desimalgrader med punktum og komma', () => {
    for (const s of ['61.6363, 8.3125', '61,6363 8,3125', '61.6363 8.3125', '61.6363;8.3125']) {
      const r = parsePosition(s);
      expect(r.ok, s).toBe(true);
      if (r.ok) {
        expect(r.kind).toBe('grader');
        expect(near(r.pos.lat, 61.6363)).toBe(true);
        expect(near(r.pos.lng, 8.3125)).toBe(true);
      }
    }
  });
  it('leser halvkulebokstaver og grader/minutter', () => {
    const a = parsePosition('N61.6363 E8.3125');
    expect(a.ok && near(a.pos.lat, 61.6363) && near(a.pos.lng, 8.3125)).toBe(true);
    const b = parsePosition("61°38.178'N 8°18.75'Ø");
    expect(b.ok && near(b.pos.lat, 61.6363) && near(b.pos.lng, 8.3125)).toBe(true);
  });
  it('avviser tull', () => {
    expect(parsePosition('').ok).toBe(false);
    expect(parsePosition('hytta ved vannet').ok).toBe(false);
    expect(parsePosition('95, 10').ok).toBe(false);
  });
});

describe('formatDegrees', () => {
  it('viser norsk desimalkomma og halvkule', () => {
    expect(formatDegrees({ lat: 61.6363, lng: 8.3125 })).toBe('61,63630° N 8,31250° Ø');
  });
});

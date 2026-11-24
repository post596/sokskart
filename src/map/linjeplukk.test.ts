import { describe, expect, it } from 'vitest';
import { avstandTilSegment, naermesteLinje } from './linjeplukk';

describe('linjeplukk', () => {
  it('måler avstand til segment, også forbi endene', () => {
    expect(avstandTilSegment([5, 3], [0, 0], [10, 0])).toBeCloseTo(3);
    expect(avstandTilSegment([-4, 3], [0, 0], [10, 0])).toBeCloseTo(5);
  });

  it('velger nærmeste linje innen toleransen', () => {
    const linjer = [
      { id: 'a', pts: [[0, 0], [100, 0]] as Array<[number, number]> },
      { id: 'b', pts: [[0, 10], [100, 10]] as Array<[number, number]> },
    ];
    expect(naermesteLinje([50, 7], linjer, 12)?.id).toBe('b');
    expect(naermesteLinje([50, 2], linjer, 12)?.id).toBe('a');
  });

  it('gir null utenfor toleransen', () => {
    const linjer = [{ id: 'a', pts: [[0, 0], [100, 0]] as Array<[number, number]> }];
    expect(naermesteLinje([50, 20], linjer, 12)).toBeNull();
    expect(naermesteLinje([130, 0], linjer, 12)).toBeNull();
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { hent, lagre, slett, slettAlt } from './lagring';

describe('lokal lagring (IndexedDB)', () => {
  it('lagrer, henter og sletter', async () => {
    expect(await lagre('aksjon', { navn: 'Test', tall: new Float32Array([1, 2]) })).toBe(true);
    const a = await hent<{ navn: string; tall: Float32Array }>('aksjon');
    expect(a?.navn).toBe('Test');
    expect(Array.from(a!.tall)).toEqual([1, 2]);
    await slett('aksjon');
    expect(await hent('aksjon')).toBeUndefined();
  });
  it('sletter alt', async () => {
    await lagre('a', 1);
    await lagre('b', 2);
    await slettAlt();
    expect(await hent('a')).toBeUndefined();
    expect(await hent('b')).toBeUndefined();
  });
});

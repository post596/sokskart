import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hent, lagre } from '../services/lagring';
import { startLagring, tomAksjonstilstand, useStore, vedNullstilling } from './store';

const vent = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Start på nytt', () => {
  afterEach(() => vi.unstubAllGlobals());
  startLagring();

  const fyllOpp = () => {
    useStore.getState().set({ lastet: true, fane: 'teiger', modus: { type: 'punkt' }, teigforslag: [{ ring: [], arealKm2: 1, timer: 1, poa: 0.1, score: 0.1 }] });
    useStore.getState().endreAksjon((a) => {
      a.navn = 'Gammel aksjon';
      a.ipp = { lat: 61.6, lng: 8.4 };
    }, 'IPP satt');
  };

  it('«Ny aksjon» tømmer aksjon, forslag og modus, beholder statistikk og lagrer den nye aksjonen', async () => {
    fyllOpp();
    const egen = useStore.getState().statistikk.map((k) => ({ ...k, navn: k.navn + ' (egen)' }));
    useStore.getState().settStatistikk(egen);
    const kalt = vi.fn();
    vedNullstilling(kalt);
    await useStore.getState().nullstill('ny');
    const s = useStore.getState();
    expect(kalt).toHaveBeenCalled();
    expect(s.aksjon.navn).toBe('');
    expect(s.aksjon.ipp).toBeNull();
    expect(s.teigforslag).toEqual([]);
    expect(s.modus).toBeNull();
    expect(s.fane).toBe('aksjon');
    expect(s.statistikk).toBe(egen);
    await vent(50);
    expect((await hent<{ id: string }>('aksjon'))?.id).toBe(s.aksjon.id);
  });

  it('«Slett alt» tømmer IndexedDB og kartbufferen, og ingenting skrives tilbake etterpå', async () => {
    const slettet: string[] = [];
    vi.stubGlobal('caches', { delete: async (n: string) => (slettet.push(n), true) });
    fyllOpp();
    await lagre('osm', { linjer: [] });
    await useStore.getState().nullstill('alt');
    expect(slettet).toEqual(['kartfliser']);
    await vent(600); // longer than the 400 ms save debounce
    expect(await hent('aksjon')).toBeUndefined();
    expect(await hent('osm')).toBeUndefined();
    expect(await hent('statistikk')).toBeUndefined();
    expect(useStore.getState().aksjon.ipp).toBeNull();
  });

  it('tomAksjonstilstand gir en ny aksjon hver gang', () => {
    expect(tomAksjonstilstand().aksjon.id).not.toBe(tomAksjonstilstand().aksjon.id);
  });
});

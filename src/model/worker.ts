/// <reference lib="webworker" />
import { beregn, type BeregningCache, type BeregningInput, type BeregningResultat } from './beregning';

export type TilWorker = { id: number; input: BeregningInput };
export type FraWorker = { id: number; ok: true; r: BeregningResultat } | { id: number; ok: false; feil: string };

const cache: BeregningCache = {};

self.onmessage = (e: MessageEvent<TilWorker>) => {
  const { id, input } = e.data;
  try {
    const r = beregn(input, cache);
    // T1 and the mercator index stay in the cache: send copies, transfer the rest
    const out: BeregningResultat = {
      ...r,
      T1: r.T1.slice(),
      merc: { ...r.merc, index: r.merc.index.slice(), fx: r.merc.fx.slice(), fy: r.merc.fy.slice() },
    };
    (self as unknown as Worker).postMessage({ id, ok: true, r: out } satisfies FraWorker, [
      out.T1.buffer,
      out.merc.index.buffer,
      out.merc.fx.buffer,
      out.merc.fy.buffer,
      out.band.buffer,
      out.post.buffer,
      out.linjeTider.buffer,
      out.linjeStart.buffer,
    ]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, feil: err instanceof Error ? err.message : String(err) } satisfies FraWorker);
  }
};

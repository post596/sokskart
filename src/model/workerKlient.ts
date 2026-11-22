import type { BeregningInput, BeregningResultat } from './beregning';
import type { FraWorker, TilWorker } from './worker';

/**
 * Runs the calculation in a Web Worker. Only the newest request matters: if several
 * arrive while one is running, the intermediate ones are dropped.
 */
export class Beregner {
  private worker: Worker;
  private seq = 0;
  private running = false;
  private pending: BeregningInput | null = null;
  private pendingResolve: Array<(r: BeregningResultat | null) => void> = [];
  private current: { id: number; resolve: Array<(r: BeregningResultat | null) => void> } | null = null;
  onFeil: (msg: string) => void = () => {};

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FraWorker>) => this.mottatt(e.data);
    this.worker.onerror = (e) => {
      this.onFeil(e.message || 'Beregningen feilet.');
      this.ferdig(null);
    };
  }

  beregn(input: BeregningInput): Promise<BeregningResultat | null> {
    return new Promise((resolve) => {
      if (this.running) {
        // drop the previous pending request (it resolves with the newest result)
        this.pending = input;
        this.pendingResolve.push(resolve);
        return;
      }
      this.start(input, [resolve]);
    });
  }

  private start(input: BeregningInput, resolve: Array<(r: BeregningResultat | null) => void>) {
    this.running = true;
    const id = ++this.seq;
    this.current = { id, resolve };
    this.worker.postMessage({ id, input } satisfies TilWorker);
  }

  private mottatt(m: FraWorker) {
    if (!this.current || m.id !== this.current.id) return;
    if (!m.ok) this.onFeil(m.feil);
    this.ferdig(m.ok ? m.r : null);
  }

  private ferdig(r: BeregningResultat | null) {
    const cur = this.current;
    this.current = null;
    this.running = false;
    if (this.pending) {
      const p = this.pending;
      const res = this.pendingResolve;
      this.pending = null;
      this.pendingResolve = [];
      // intermediate result is not delivered; everybody waits for the newest
      this.start(p, [...(cur?.resolve ?? []), ...res]);
      return;
    }
    cur?.resolve.forEach((f) => f(r));
  }

  avslutt() {
    this.worker.terminate();
  }
}

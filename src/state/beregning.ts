import { timerMellom } from '../domain/aksjon';
import { konsensus, RESTEN } from '../domain/mattson';
import { gridFor, type BeregningInput } from '../model/beregning';
import { blandingRinger, byggKomponenter, vektetFart } from '../model/lpb';
import { Beregner } from '../model/workerKlient';
import { dekker, hentHoyde } from '../services/hoydedata';
import { useStore } from './store';

/**
 * Glue between the store and the worker: rebuilds the input when something relevant
 * changes, fetches Kartverket elevation for the grid when needed, and stores the result.
 */
let beregner: Beregner | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let sisteInput = '';
let hoydeForsokt = '';

const versjon = (o: { hentet: string } | null) => (o ? o.hentet : '0');

export function lagInput(): BeregningInput | null {
  const s = useStore.getState();
  const a = s.aksjon;
  if (!a.ipp) return null;
  const komps = byggKomponenter(s.statistikk, a.kategorier, a.terreng);
  if (!komps.length) return null;
  const now = new Date(s.naa);
  const raw = timerMellom(a.sistSett, now);
  // quantise to 3 minutes so the clock does not trigger constant recalculation
  const timerSiden = raw == null ? null : Math.max(0, Math.round(raw * 20) / 20);
  const g = gridFor(a.ipp, a.sone, komps, a.modell);
  const hoyde = dekker(s.hoyde, g) ? s.hoyde : null;
  return {
    ipp: a.ipp,
    sone: a.sone,
    komps,
    m: a.modell,
    timerSidenSistSett: timerSiden,
    osm: s.osm,
    osmVersjon: versjon(s.osm),
    hoyde,
    hoydeVersjon: versjon(hoyde),
    observasjoner: a.punkter
      .filter((p) => p.type === 'obs')
      .map((p) => ({ pos: p.pos, timerSiden: Math.max(0, timerMellom(p.tid, now) ?? 0), klasse: p.klasse })),
    teiger: a.teiger.map((t) => ({ id: t.id, ringer: [t.ring], pod: 1 - t.sok.reduce((acc, x) => acc * (1 - x.pod), 1) })),
    reflekser: a.punkter.filter((p) => p.type === 'poi').map((p) => ({ id: p.id, navn: p.tekst, pos: p.pos })),
    regioner: a.regioner.map((r) => ({ id: r.id, ring: r.ring })),
    konsensus: konsensusListe(),
    ressurser: a.ressurser,
    visningTimer: s.visningTimer ?? standardVisning(),
    merkatorBredde: Math.min(1100, Math.max(400, Math.round(g.n * 2.2))),
  };
}

/** Mattson consensus aligned with the regions (+ rest), or null when nobody has assessed. */
export function konsensusListe(): number[] | null {
  const a = useStore.getState().aksjon;
  if (!a.regioner.length) return null;
  const ids = a.regioner.map((r) => r.id);
  const k = konsensus(a.mattson.deltakere, a.mattson.vurdering, ids);
  return k ? [...ids.map((id) => k.andeler[id]), k.andeler[RESTEN]] : null;
}

/** Default hours walked: time since last seen (capped by mobility), else 1 hour. */
export function standardVisning(): number {
  const s = useStore.getState();
  const a = s.aksjon;
  const komps = byggKomponenter(s.statistikk, a.kategorier, a.terreng);
  const { mob } = vektetFart(komps);
  const t = timerMellom(a.sistSett, new Date(s.naa));
  if (t == null || t <= 0) return 1;
  return Math.min(t, mob || t);
}

export function mixRinger(): [number, number, number, number] | null {
  const s = useStore.getState();
  const komps = byggKomponenter(s.statistikk, s.aksjon.kategorier, s.aksjon.terreng);
  return komps.length ? blandingRinger(komps, s.aksjon.modell.haleFaktor) : null;
}

async function kanskjeHentHoyde(): Promise<void> {
  const s = useStore.getState();
  const a = s.aksjon;
  if (!a.ipp || s.hoydeStatus.henter) return;
  const komps = byggKomponenter(s.statistikk, a.kategorier, a.terreng);
  if (!komps.length) return;
  const g = gridFor(a.ipp, a.sone, komps, a.modell);
  if (dekker(s.hoyde, g)) return;
  const key = `${g.zone}|${Math.round(g.cx)}|${Math.round(g.cy)}|${g.half}|${g.n}`;
  if (hoydeForsokt === key) return;
  hoydeForsokt = key;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    s.set({ hoydeStatus: { henter: false, feil: 'Uten nett: gangtid regnes uten høydedata (flatt terreng).' } });
    return;
  }
  s.set({ hoydeStatus: { henter: true, feil: null } });
  try {
    const h = await hentHoyde(g);
    useStore.getState().set({ hoyde: h, hoydeStatus: { henter: false, feil: null } });
  } catch (e) {
    useStore.getState().set({
      hoydeStatus: {
        henter: false,
        feil: `Fikk ikke hentet høydedata fra Kartverket (${e instanceof Error ? e.message : e}). Gangtid regnes som flatt terreng.`,
      },
    });
  }
}

/** Run the probability model again soon (debounced). */
export function planleggBeregning(forsinkelse = 250): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(kjor, forsinkelse);
}

async function kjor(): Promise<void> {
  void kanskjeHentHoyde();
  const input = lagInput();
  const s = useStore.getState();
  if (!input) {
    if (s.resultat) s.set({ resultat: null });
    sisteInput = '';
    return;
  }
  // skip when nothing changed (the big arrays are compared by version strings)
  const key = JSON.stringify({ ...input, osm: input.osmVersjon, hoyde: input.hoydeVersjon });
  if (key === sisteInput && s.resultat) return;
  sisteInput = key;
  beregner ??= new Beregner();
  beregner.onFeil = (msg) => useStore.getState().set({ beregningFeil: msg });
  s.set({ beregner: true });
  const r = await beregner.beregn(input);
  const cur = useStore.getState();
  if (r) {
    cur.set({ resultat: r, beregner: false, beregningFeil: null });
    tildelLnummer();
  } else cur.set({ beregner: false });
}

/** Gives the top ranked ledelinjer a fixed L number the first time they enter the top list. */
function tildelLnummer(): void {
  const s = useStore.getState();
  const r = s.resultat;
  if (!r) return;
  const topp = r.linjer.slice(0, s.aksjon.modell.antallLedelinjer).filter((l) => !s.aksjon.lnummer[l.id]);
  if (!topp.length) return;
  s.endreAksjon((a) => {
    let n = a.seq.L ?? 0;
    for (const l of topp) {
      n++;
      a.lnummer[l.id] = 'L' + String(n).padStart(3, '0');
    }
    a.seq.L = n;
  });
}

export function startBeregning(): void {
  let forrige: unknown[] = [];
  useStore.subscribe((s) => {
    const deps = [s.aksjon, s.statistikk, s.osm, s.hoyde, s.naa, s.visningTimer, s.lastet];
    if (deps.every((d, i) => d === forrige[i])) return;
    const kunTid = deps.every((d, i) => i === 5 || d === forrige[i]);
    forrige = deps;
    if (!s.lastet) return;
    // while the slider moves, wait until it settles before recomputing suggestions
    planleggBeregning(kunTid ? 500 : 250);
  });
  planleggBeregning(0);
}

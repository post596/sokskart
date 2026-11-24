import { timerMellom } from '../domain/aksjon';
import { LINJETYPE_NAVN, type LinjeType } from '../model/typer';
import { forenkleLinje } from './handlinger';
import { gridFor, type BeregningInput } from '../model/beregning';
import { blandingRinger, byggKomponenter, vektetFart } from '../model/lpb';
import { Beregner } from '../model/workerKlient';
import { dekker, hentHoyde } from '../services/hoydedata';
import { useStore, vedNullstilling } from './store';

/**
 * Glue between the store and the worker: rebuilds the input when something relevant
 * changes, fetches Kartverket elevation for the grid when needed, and stores the result.
 */
let beregner: Beregner | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let sisteInput = '';
let hoydeForsokt = '';
/** bumped when the aksjon is replaced: results of work started before are thrown away */
let generasjon = 0;

/** Forgets all computation state (new aksjon / «Start på nytt» / opening a file). */
export function nullstillBeregning(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  sisteInput = '';
  hoydeForsokt = '';
  generasjon++;
}
vedNullstilling(nullstillBeregning);

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
    // finds (funn) count like observations
    observasjoner: a.punkter
      .filter((p) => p.type === 'obs' || p.type === 'funn')
      .map((p) => ({ pos: p.pos, timerSiden: Math.max(0, timerMellom(p.tid, now) ?? 0), klasse: p.klasse })),
    innsats: {
      // a checked sperrepost says nothing about the area
      punkter: a.punkter.filter((p) => p.sjekket && p.type !== 'sp').map((p) => p.pos),
      linjer: Object.values(a.linjestatus)
        .filter((l) => l.kilde === 'manuell')
        .map((l) => l.pts),
      // a track already used for the POD of a registered teig search does not count again there
      spor: a.spor.map((s) => ({
        id: s.id,
        ressurs: s.ressurs,
        pts: s.pts,
        utelat: a.teiger.filter((t) => t.sok.some((x) => x.spor?.includes(s.id))).map((t) => t.id),
      })),
    },
    teiger: a.teiger.map((t) => ({ id: t.id, ringer: [t.ring], pod: 1 - t.sok.reduce((acc, x) => acc * (1 - x.pod), 1) })),
    reflekser: a.punkter.filter((p) => p.type === 'poi').map((p) => ({ id: p.id, navn: p.tekst, pos: p.pos })),
    ressurser: a.ressurser,
    visningTimer: s.visningTimer ?? standardVisning(),
    forslagOnske: s.forslagOnske,
    merkatorBredde: Math.min(1100, Math.max(400, Math.round(g.n * 2.2))),
  };
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
  const gen = generasjon;
  try {
    const h = await hentHoyde(g);
    if (gen !== generasjon) return;
    useStore.getState().set({ hoyde: h, hoydeStatus: { henter: false, feil: null } });
  } catch (e) {
    if (gen !== generasjon) return;
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
  // skip when nothing changed (the big arrays are compared by version strings; tracks never
  // change their points after import, so id, resource and length identify them)
  const key = JSON.stringify({
    ...input,
    osm: input.osmVersjon,
    hoyde: input.hoydeVersjon,
    innsats: input.innsats && { ...input.innsats, spor: input.innsats.spor?.map((s) => [s.id, s.ressurs, s.pts.length, s.utelat]) },
  });
  if (key === sisteInput && s.resultat) return;
  sisteInput = key;
  beregner ??= new Beregner();
  beregner.onFeil = (msg) => useStore.getState().set({ beregningFeil: msg });
  s.set({ beregner: true });
  const gen = generasjon;
  const r = await beregner.beregn(input);
  // the aksjon was replaced while computing: the result belongs to the old one
  if (gen !== generasjon) return;
  const cur = useStore.getState();
  if (r) {
    cur.set({ resultat: r, beregner: false, beregningFeil: null });
    if (input.forslagOnske) {
      // freeze the suggestions so accepting one does not reshuffle the rest
      cur.set({
        forslagOnske: null,
        ...(input.forslagOnske.teig ? { teigforslag: r.teigforslag } : {}),
        ...(input.forslagOnske.drone ? { droneforslag: r.droneforslag } : {}),
      });
      const n = (input.forslagOnske.teig ? r.teigforslag.length : 0) + (input.forslagOnske.drone ? r.droneforslag.length : 0);
      cur.melding(n ? `${n} forslag er klare. Godkjenn dem i fanen Teiger.` : 'Fant ingen områder å foreslå (alt er dekket av teiger, eller mangler sannsynlighet).', n ? 'ok' : 'info');
    }
    tildelLnummer();
    synkSporLinjer();
  } else cur.set({ beregner: false });
}

/**
 * Keeps the «searched by GPS track» status of ledelinjer in step with the latest result:
 * adds lines the tracks now follow, removes those they no longer do. Manual marks are
 * never touched. Writes (and logs) only when something changed.
 */
function synkSporLinjer(): void {
  const s = useStore.getState();
  const r = s.resultat;
  const osm = s.osm;
  if (!r || !osm) return;
  const a = s.aksjon;
  const na = new Map(r.sporLinjer.map((x) => [x.id, x]));
  const fjern = Object.entries(a.linjestatus).filter(([id, st]) => st.kilde === 'spor' && !na.has(id));
  const nye = r.sporLinjer.filter((x) => {
    const st = a.linjestatus[x.id];
    return !st || (st.kilde === 'spor' && (Math.abs((st.andel ?? 0) - x.andel) > 0.01 || (st.spor ?? []).join() !== x.spor.join()));
  });
  if (!fjern.length && !nye.length) return;
  const navn = (id: string, type: LinjeType, n: string) => `${a.lnummer[id] ?? LINJETYPE_NAVN[type]}${n ? ` «${n}»` : ''}`;
  const logg: string[] = [];
  s.endreAksjon((x) => {
    for (const [id, st] of fjern) {
      delete x.linjestatus[id];
      logg.push(`${navn(id, st.type, st.navn)}: ikke lenger dekket av GPS-spor`);
    }
    for (const n of nye) {
      const l = osm.linjer.find((o) => o.id === n.id);
      if (!l) continue;
      const fantes = x.linjestatus[n.id];
      x.linjestatus[n.id] = {
        tid: fantes?.tid ?? new Date().toISOString(),
        kilde: 'spor',
        pts: fantes?.pts ?? forenkleLinje(l.pts),
        ...(x.lnummer[n.id] ? { nr: x.lnummer[n.id] } : {}),
        navn: l.navn,
        type: l.type,
        spor: n.spor,
        andel: n.andel,
      };
      if (!fantes) logg.push(`${navn(n.id, l.type, l.navn)} merket som søkt: GPS-spor følger ${Math.round(n.andel * 100)} % av linja`);
    }
    const t = new Date().toISOString();
    for (const tekst of logg) x.logg.push({ tid: t, tekst });
  });
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
    const deps = [s.aksjon, s.statistikk, s.osm, s.hoyde, s.naa, s.visningTimer, s.lastet, s.forslagOnske];
    if (deps.every((d, i) => d === forrige[i])) return;
    const kunTid = deps.every((d, i) => i === 5 || d === forrige[i]);
    forrige = deps;
    if (!s.lastet) return;
    // while the slider moves, wait until it settles before recomputing suggestions
    planleggBeregning(s.forslagOnske ? 50 : kunTid ? 500 : 250);
  });
  planleggBeregning(0);
}

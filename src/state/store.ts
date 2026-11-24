import { create } from 'zustand';
import { kopierStatistikk, type LpbKategori } from '../data/lpb-stats';
import type { StiRessurs } from '../data/stisok';
import { harRegistrerteSok, lesAksjonsfil, nyAksjon, type Aksjon } from '../domain/aksjon';
import type { LatLng } from '../domain/coords';
import type { BeregningResultat, ForslagOnske, TeigForslag } from '../model/beregning';
import type { HoydeRaster, OsmData } from '../model/typer';
import { hent, lagre, slett, slettAlt } from '../services/lagring';

export type Fane = 'aksjon' | 'ledelinjer' | 'teiger' | 'punkter' | 'tidslinje' | 'statistikk';
/** punkt.hurtig: place first, then choose type and text in a dialog («+ Punkt» in the map) */
export type Modus = null | { type: 'ipp' } | { type: 'punkt'; hurtig?: boolean } | { type: 'teig'; avgrensning: 'T' | 'H' | 'D' };
export type OrdreFor = { type: 'teig' | 'linje' | 'punkt'; id: string };
/** what is selected in the map (shown in a card over the map) */
export type Valgt = { type: 'punkt' | 'linje' | 'poiforslag'; id: string };

export interface Melding {
  tekst: string;
  type: 'info' | 'feil' | 'ok';
  id: number;
}

export interface Dialog {
  tittel: string;
  tekst: string;
  ja: string;
  nei: string;
  fare?: boolean;
  svar: (ja: boolean) => void;
}

export interface Visning {
  sannsynlighet: boolean;
  gangtid: boolean;
  alleLedelinjer: boolean;
  plankart: boolean;
  resultatkart: boolean;
  etterretningskart: boolean;
  /** suggestions in the map */
  teigforslag: boolean;
  droneforslag: boolean;
  /** suggested points of interest also outside the Punkter tab */
  poiforslag: boolean;
}

export interface Egenposisjon {
  pos: LatLng;
  noyaktighet: number;
  tid: number;
}

interface State {
  lastet: boolean;
  aksjon: Aksjon;
  statistikk: LpbKategori[];
  osm: OsmData | null;
  /** feil: nothing usable was fetched; merknad: fetched, but with a caveat (e.g. fallback source). */
  osmStatus: { henter: boolean; feil: string | null; merknad?: string | null };
  hoyde: HoydeRaster | null;
  hoydeStatus: { henter: boolean; feil: string | null };
  resultat: BeregningResultat | null;
  beregner: boolean;
  beregningFeil: string | null;
  fane: Fane;
  modus: Modus;
  /** hours walked shown in the map (null: follow time since last seen) */
  visningTimer: number | null;
  spiller: boolean;
  visning: Visning;
  /** ledelinjer recommended for this resource are highlighted, the others toned down */
  linjeFilter: StiRessurs | 'alle';
  grunnkart: string;
  meldinger: Melding[];
  dialog: Dialog | null;
  naa: number;
  egenposisjon: Egenposisjon | null;
  fokus: { pos: LatLng; zoom?: number; n: number } | { bounds: LatLng[]; n: number } | null;
  valgtTeig: string | null;
  redigererTeig: string | null;
  ordreFor: OrdreFor | null;
  /** suggestions asked for (computed by the worker, then frozen below) */
  forslagOnske: ForslagOnske | null;
  teigforslag: TeigForslag[];
  droneforslag: TeigForslag[];
  visKvalitet: boolean;
  valgt: Valgt | null;
  /** position for a new point (dialog open) */
  nyttPunkt: { pos: LatLng } | null;
  /** the «Start på nytt» dialog is open */
  visNullstill: boolean;

  endreAksjon: (fn: (a: Aksjon) => void, logg?: string) => void;
  settStatistikk: (s: LpbKategori[]) => void;
  settOsm: (o: OsmData | null) => void;
  settHoyde: (h: HoydeRaster | null) => void;
  melding: (tekst: string, type?: Melding['type']) => void;
  fjernMelding: (id: number) => void;
  bekreft: (d: Omit<Dialog, 'svar'>) => Promise<boolean>;
  vis: (f: { pos: LatLng; zoom?: number } | { bounds: LatLng[] } | null) => void;
  set: (p: Partial<State>) => void;
  lastInn: () => Promise<void>;
  importer: (tekst: string) => Promise<boolean>;
  /** 'ny': new empty aksjon (keeps statistics and offline map tiles); 'alt': delete everything on this device */
  nullstill: (valg: 'ny' | 'alt') => Promise<void>;
  settIpp: (p: LatLng) => Promise<void>;
}

/** Everything that belongs to one aksjon (and its work in progress). Statistics, map view and settings are not included. */
type Aksjonstilstand = Pick<
  State,
  | 'aksjon'
  | 'osm'
  | 'osmStatus'
  | 'hoyde'
  | 'hoydeStatus'
  | 'resultat'
  | 'beregner'
  | 'beregningFeil'
  | 'fane'
  | 'modus'
  | 'visningTimer'
  | 'spiller'
  | 'egenposisjon'
  | 'valgtTeig'
  | 'redigererTeig'
  | 'ordreFor'
  | 'forslagOnske'
  | 'teigforslag'
  | 'droneforslag'
  | 'visKvalitet'
  | 'valgt'
  | 'nyttPunkt'
>;

/** A fresh, empty aksjon state. Used at start-up, when opening a file and by «Start på nytt». */
export function tomAksjonstilstand(): Aksjonstilstand {
  return {
    aksjon: nyAksjon(),
    osm: null,
    osmStatus: { henter: false, feil: null, merknad: null },
    hoyde: null,
    hoydeStatus: { henter: false, feil: null },
    resultat: null,
    beregner: false,
    beregningFeil: null,
    fane: 'aksjon',
    modus: null,
    visningTimer: null,
    spiller: false,
    egenposisjon: null,
    valgtTeig: null,
    redigererTeig: null,
    ordreFor: null,
    forslagOnske: null,
    teigforslag: [],
    droneforslag: [],
    visKvalitet: false,
    valgt: null,
    nyttPunkt: null,
  };
}

/**
 * Module-level work that must stop when the aksjon is replaced (pending computations,
 * height fetches, the geolocation watch, form drafts). Modules register here so the
 * store does not need to import them.
 */
const nullstillere: Array<() => void> = [];
export function vedNullstilling(fn: () => void): void {
  nullstillere.push(fn);
}
function kjorNullstillere(): void {
  for (const fn of nullstillere) {
    try {
      fn();
    } catch {
      /* a failing hook must not stop the reset */
    }
  }
}

let meldingId = 0;
let fokusN = 0;

export const useStore = create<State>()((set, get) => ({
  lastet: false,
  ...tomAksjonstilstand(),
  statistikk: kopierStatistikk(),
  visning: {
    sannsynlighet: true,
    gangtid: true,
    alleLedelinjer: true,
    plankart: true,
    resultatkart: true,
    etterretningskart: true,
    teigforslag: true,
    droneforslag: true,
    poiforslag: false,
  },
  linjeFilter: 'alle',
  grunnkart: 'topo',
  meldinger: [],
  dialog: null,
  naa: Date.now(),
  fokus: null,
  visNullstill: false,

  endreAksjon: (fn, logg) =>
    set((s) => {
      const a = structuredClone(s.aksjon);
      fn(a);
      const t = new Date().toISOString();
      a.endret = t;
      if (logg) a.logg.push({ tid: t, tekst: logg });
      if (a.logg.length > 2000) a.logg = a.logg.slice(-2000);
      return { aksjon: a };
    }),
  settStatistikk: (statistikk) => set({ statistikk }),
  settOsm: (osm) => set({ osm }),
  settHoyde: (hoyde) => set({ hoyde }),
  melding: (tekst, type = 'info') => {
    const id = ++meldingId;
    set((s) => ({ meldinger: [...s.meldinger.slice(-3), { tekst, type, id }] }));
    setTimeout(() => get().fjernMelding(id), type === 'feil' ? 9000 : 5000);
  },
  fjernMelding: (id) => set((s) => ({ meldinger: s.meldinger.filter((m) => m.id !== id) })),
  bekreft: (d) =>
    new Promise((resolve) => {
      set({
        dialog: {
          ...d,
          svar: (ja) => {
            set({ dialog: null });
            resolve(ja);
          },
        },
      });
    }),
  vis: (f) => set({ fokus: f ? { ...f, n: ++fokusN } : null }),
  set: (p) => set(p),

  lastInn: async () => {
    const [aksjon, statistikk, osm, hoyde] = await Promise.all([
      hent<Aksjon>('aksjon'),
      hent<LpbKategori[]>('statistikk'),
      hent<OsmData>('osm'),
      hent<HoydeRaster>('hoyde'),
    ]);
    // the photo of the missing person was removed from Søkskart; delete any old copy
    void slett('bilde');
    const p: Partial<State> = { lastet: true };
    if (aksjon) {
      // run through the importer to fill fields added in later versions
      const r = lesAksjonsfil(JSON.stringify({ format: 'sokskart-aksjon', versjon: 1, aksjon, statistikk: statistikk ?? [], osm: null }));
      if (r.ok) {
        p.aksjon = r.fil.aksjon;
        // show migration notes once the app is up
        setTimeout(() => r.advarsler.forEach((t) => get().melding(t, 'info')), 0);
      }
    }
    if (statistikk?.length) p.statistikk = statistikk;
    if (osm) p.osm = osm;
    if (hoyde) p.hoyde = hoyde;
    set(p);
  },

  importer: async (tekst) => {
    const r = lesAksjonsfil(tekst);
    if (!r.ok) {
      get().melding(r.feil, 'feil');
      return false;
    }
    if (get().aksjon.ipp || get().aksjon.teiger.length) {
      const ok = await get().bekreft({
        tittel: 'Åpne aksjon',
        tekst: 'Aksjonen som er åpen nå blir erstattet. Lagre den som fil først hvis du trenger den.',
        ja: 'Åpne',
        nei: 'Avbryt',
      });
      if (!ok) return false;
    }
    kjorNullstillere();
    set({ ...tomAksjonstilstand(), aksjon: r.fil.aksjon, statistikk: r.fil.statistikk, osm: r.fil.osm });
    get().endreAksjon(() => {}, 'Aksjon åpnet fra fil');
    for (const a of r.advarsler) get().melding(a, 'info');
    get().melding('Aksjonen er åpnet.', 'ok');
    return true;
  },

  nullstill: async (valg) => {
    // stop saving first, so an old save cannot land after the wipe
    await pauseLagring();
    kjorNullstillere();
    set({ ...tomAksjonstilstand(), visNullstill: false, ...(valg === 'alt' ? { statistikk: kopierStatistikk(), fokus: null } : {}) });
    if (valg === 'alt') {
      await slettAlt();
      await slettKartbuffer();
      fortsettLagring(false); // nothing is written back: the device stays empty
      get().melding('Alt er slettet fra denne enheten: aksjon, logg, stier, høydedata, egen statistikk og nedlastede kart.', 'ok');
    } else {
      fortsettLagring(true);
      get().melding('Ny aksjon startet. Statistikken og nedlastede kart er beholdt.', 'ok');
    }
  },

  settIpp: async (p) => {
    const s = get();
    if (s.aksjon.ipp) {
      const sok = harRegistrerteSok(s.aksjon);
      const ok = await s.bekreft({
        tittel: 'Flytte IPP?',
        tekst: sok
          ? 'Det er registrert søk i aksjonen. Veilederen sier at IPP normalt ikke flyttes underveis: statistikken bygger på IPP, og nye observasjoner skal vekte områder – ikke flytte IPP. Flytt bare hvis den første vurderingen var feil eller et funn tilsier nytt utgangspunkt.'
          : 'IPP flyttes normalt ikke underveis i en aksjon. Ringer, sannsynlighet og gangtid regnes på nytt fra det nye punktet.',
        ja: 'Flytt IPP',
        nei: 'Behold IPP',
        fare: sok,
      });
      if (!ok) return;
    }
    const flyttet = !!s.aksjon.ipp;
    s.endreAksjon(
      (a) => {
        a.ipp = { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) };
        a.ippSatt = new Date().toISOString();
        a.aksjonStart ??= a.ippSatt;
      },
      flyttet ? 'IPP flyttet' : 'IPP satt',
    );
    set({ modus: null });
    if (flyttet && s.osm) {
      s.melding('IPP er flyttet. Hent stier og veier på nytt hvis det nye punktet ligger langt fra det gamle.', 'info');
    }
  },
}));

// ---------------------------------------------------------------- persistence

let lagreTimer: ReturnType<typeof setTimeout> | null = null;
let forrige: { aksjon?: Aksjon; statistikk?: LpbKategori[]; osm?: OsmData | null; hoyde?: HoydeRaster | null } = {};
/** the save that is running now (awaited before a reset) */
let pagaende: Promise<void> | null = null;
let pause = false;

async function lagreNa(): Promise<void> {
  const cur = useStore.getState();
  const jobs: Promise<boolean>[] = [];
  if (cur.aksjon !== forrige.aksjon) jobs.push(lagre('aksjon', cur.aksjon));
  if (cur.statistikk !== forrige.statistikk) jobs.push(lagre('statistikk', cur.statistikk));
  if (cur.osm !== forrige.osm) jobs.push(lagre('osm', cur.osm));
  if (cur.hoyde !== forrige.hoyde) jobs.push(lagre('hoyde', cur.hoyde));
  forrige = { aksjon: cur.aksjon, statistikk: cur.statistikk, osm: cur.osm, hoyde: cur.hoyde };
  const ok = await Promise.all(jobs);
  if (ok.some((x) => !x)) cur.melding('Klarte ikke lagre lokalt på denne enheten. Lagre aksjonen som fil.', 'feil');
}

function kjorLagring(): Promise<void> {
  const p = lagreNa().finally(() => {
    if (pagaende === p) pagaende = null;
  });
  pagaende = p;
  return p;
}

export function startLagring(): void {
  useStore.subscribe((s) => {
    if (!s.lastet || pause) return;
    if (s.aksjon === forrige.aksjon && s.statistikk === forrige.statistikk && s.osm === forrige.osm && s.hoyde === forrige.hoyde) return;
    if (lagreTimer) clearTimeout(lagreTimer);
    lagreTimer = setTimeout(() => {
      lagreTimer = null;
      void kjorLagring();
    }, 400);
  });
}

/** Cancels a pending save and waits for one in progress. */
async function pauseLagring(): Promise<void> {
  pause = true;
  if (lagreTimer) clearTimeout(lagreTimer);
  lagreTimer = null;
  await pagaende;
}

/** Resumes saving. `skriv`: save the current state now; otherwise treat it as already saved. */
function fortsettLagring(skriv: boolean): void {
  const cur = useStore.getState();
  pause = false;
  if (skriv) {
    forrige = {};
    if (cur.lastet) void kjorLagring();
  } else {
    forrige = { aksjon: cur.aksjon, statistikk: cur.statistikk, osm: cur.osm, hoyde: cur.hoyde };
  }
}

/** Deletes the offline map tiles (service worker runtime cache, see vite.config.ts). */
async function slettKartbuffer(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await caches.delete(KARTBUFFER);
  } catch {
    /* ignore */
  }
}

/** Must match `cacheName` of the map tile runtime cache in vite.config.ts. */
export const KARTBUFFER = 'kartfliser';

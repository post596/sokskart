import { lokalTid, nyId, SPERRE_RADIUS, type Avgrensningstype, type Punkt, type PunktType, type Sok, type Spor } from '../domain/aksjon';
import { areaM2 } from '../domain/geo';
import { fmtKm2 } from '../ui/format';
import type { LatLng } from '../domain/coords';
import { medLnummer, type ForslagGrunnlag } from '../domain/grunnlag';
import { nesteId, type Prefiks } from '../domain/naming';
import { podBetegnelse, prosent } from '../domain/pod';
import { forenkle } from '../domain/sporimport';
import { computeZone, toUtm } from '../domain/utm';
import { LINJETYPE_NAVN } from '../model/typer';
import type { Observasjonsklasse } from '../data/modellantakelser';
import { useStore, vedNullstilling } from './store';

export interface PunktUtkast {
  type: PunktType;
  klasse: Observasjonsklasse;
  tid: string;
  tekst: string;
  begrunnelse?: Punkt['begrunnelse'];
}

const TOMT_UTKAST: PunktUtkast = { type: 'obs', klasse: 'sannsynlig', tid: '', tekst: '' };
let utkast: PunktUtkast = { ...TOMT_UTKAST };
export const settPunktUtkast = (u: PunktUtkast) => {
  utkast = u;
};
export const hentPunktUtkast = () => utkast;
// a half-written point (text) must not survive into a new aksjon
vedNullstilling(() => {
  utkast = { ...TOMT_UTKAST };
});

const PREFIKS: Record<PunktType, Prefiks> = { obs: 'OBS', sp: 'SP', poi: 'R', funn: 'F' };
export const PUNKTNAVN: Record<PunktType, string> = {
  obs: 'Observasjon / etterretning',
  sp: 'Sperrepost',
  poi: 'Interessepunkt (refleks)',
  funn: 'Funn av gjenstand',
};

/** Observations and finds have a class (sikker/sannsynlig/mulig/usikker) that drives the model. */
export const harKlasse = (t: PunktType) => t === 'obs' || t === 'funn';

export function leggTilPunkt(pos: LatLng, u: PunktUtkast = utkast): string {
  const s = useStore.getState();
  const { id, seq } = nesteId(s.aksjon.seq, PREFIKS[u.type]);
  s.endreAksjon(
    (a) => {
      a.seq = seq;
      a.punkter.push({
        id,
        type: u.type,
        klasse: u.klasse,
        tid: u.tid || lokalTid(),
        tekst: u.tekst.trim(),
        pos: { lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) },
        ...(u.begrunnelse ? { begrunnelse: u.begrunnelse } : {}),
      });
    },
    `${id}: ${PUNKTNAVN[u.type]}${harKlasse(u.type) ? ` (${u.klasse})` : ''} lagt til`,
  );
  s.set({ modus: null });
  return id;
}

export function slettPunkt(id: string): void {
  const s = useStore.getState();
  s.endreAksjon((a) => {
    a.punkter = a.punkter.filter((p) => p.id !== id);
  }, `${id} slettet`);
  if (s.valgt?.type === 'punkt' && s.valgt.id === id) s.set({ valgt: null });
}

/** Marks a point as checked (or removes the mark). Checked points lower the probability around them. */
export function settPunktSjekket(id: string, paa: boolean, av = ''): void {
  useStore.getState().endreAksjon(
    (a) => {
      const p = a.punkter.find((x) => x.id === id);
      if (!p) return;
      if (paa) p.sjekket = { tid: new Date().toISOString(), ...(av.trim() ? { av: av.trim() } : {}) };
      else delete p.sjekket;
    },
    paa ? `${id} merket som ferdig sjekket${av.trim() ? ` (${av.trim()})` : ''}` : `${id}: merket «ferdig sjekket» fjernet`,
  );
}

/** Line simplified to about 5 m in UTM, for storing with its status. */
export function forenkleLinje(pts: LatLng[]): LatLng[] {
  if (pts.length < 3) return pts.map((p) => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }));
  const z = computeZone(pts[0].lat, pts[0].lng, 'auto');
  return forenkle(
    pts,
    (p) => {
      const u = toUtm(p.lat, p.lng, z);
      return [u.e, u.n];
    },
    5,
  ).map((p) => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }));
}

/** Marks a ledelinje as checked by hand (or removes the mark). */
export function settLinjeSjekket(id: string, paa: boolean, av = ''): void {
  const s = useStore.getState();
  const l = s.osm?.linjer.find((x) => x.id === id);
  const status = s.aksjon.linjestatus[id];
  const nr = s.aksjon.lnummer[id];
  const navn = `${nr ?? (l ? LINJETYPE_NAVN[l.type] : 'Ledelinje')}${(l?.navn ?? status?.navn) ? ` «${l?.navn ?? status?.navn}»` : ''}`;
  if (paa && !l && !status) return;
  s.endreAksjon(
    (a) => {
      if (!paa) {
        delete a.linjestatus[id];
        return;
      }
      a.linjestatus[id] = {
        tid: new Date().toISOString(),
        ...(av.trim() ? { av: av.trim() } : {}),
        kilde: 'manuell',
        pts: l ? forenkleLinje(l.pts) : status!.pts,
        ...(nr ? { nr } : {}),
        navn: l?.navn ?? status?.navn ?? '',
        type: l?.type ?? status!.type,
      };
    },
    paa ? `${navn} merket som ferdig sjekket${av.trim() ? ` (${av.trim()})` : ''}` : `${navn}: merket «ferdig sjekket» fjernet`,
  );
}

export function leggTilTeig(ring: LatLng[], type: Avgrensningstype, fra?: { grunnlag?: ForslagGrunnlag; logg: string }): string {
  const s = useStore.getState();
  const { id, seq } = nesteId(s.aksjon.seq, type);
  s.endreAksjon(
    (a) => {
      a.seq = seq;
      a.teiger.push({
        id,
        type,
        navn: '',
        ring: ring.map((p) => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })),
        status: 'planlagt',
        utdelt: null,
        sok: [],
        opprettet: new Date().toISOString(),
        ...(fra?.grunnlag ? { grunnlag: medLnummer(fra.grunnlag, a.lnummer) } : {}),
      });
    },
    fra ? `${id} ${fra.logg}` : `${id} tegnet`,
  );
  s.set({ modus: null, valgtTeig: id, fane: 'teiger' });
  return id;
}

export function endreTeigRing(id: string, ring: LatLng[]): void {
  useStore.getState().endreAksjon((a) => {
    const t = a.teiger.find((x) => x.id === id);
    if (t) t.ring = ring.map((p) => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }));
  }, `${id} redigert`);
}

export function slettTeig(id: string): void {
  useStore.getState().endreAksjon((a) => {
    a.teiger = a.teiger.filter((t) => t.id !== id);
  }, `${id} slettet`);
}

export function settTeigStatus(id: string, status: 'planlagt' | 'utdelt', ressurs = ''): void {
  useStore.getState().endreAksjon(
    (a) => {
      const t = a.teiger.find((x) => x.id === id);
      if (!t) return;
      t.status = status;
      t.utdelt = status === 'utdelt' ? { tid: new Date().toISOString(), ressurs } : null;
    },
    status === 'utdelt' ? `${id} utdelt${ressurs ? ` til ${ressurs}` : ''}` : `${id} satt til planlagt`,
  );
}

export function registrerSok(id: string, sok: Omit<Sok, 'id'>): void {
  useStore.getState().endreAksjon(
    (a) => {
      const t = a.teiger.find((x) => x.id === id);
      if (!t) return;
      t.sok.push({ ...sok, id: nyId() });
      t.status = 'utdelt';
    },
    `${id}: søk registrert, POD ${prosent(sok.pod, 0)} (${podBetegnelse(sok.pod)})${sok.ressurstype ? `, ${[sok.org, sok.ressurstype, sok.enhet].filter(Boolean).join('–')}` : ''}`,
  );
}

export function slettSok(teigId: string, sokId: string): void {
  useStore.getState().endreAksjon((a) => {
    const t = a.teiger.find((x) => x.id === teigId);
    if (t) t.sok = t.sok.filter((s) => s.id !== sokId);
  }, `${teigId}: søk slettet`);
}

// ---------------------------------------------------------------- GPS tracks

export function leggTilSpor(spor: Array<Omit<Spor, 'id' | 'importert'>>, fil: string): void {
  const t = new Date().toISOString();
  useStore.getState().endreAksjon(
    (a) => {
      for (const s of spor) a.spor.push({ ...s, id: nyId(), importert: t });
    },
    `${spor.length} GPS-spor importert fra ${fil}`,
  );
}

export function endreSpor(id: string, fn: (s: Spor) => void, logg?: string): void {
  useStore.getState().endreAksjon((a) => {
    const s = a.spor.find((x) => x.id === id);
    if (s) fn(s);
  }, logg);
}

export function slettSpor(id: string): void {
  const navn = useStore.getState().aksjon.spor.find((s) => s.id === id)?.navn ?? id;
  useStore.getState().endreAksjon((a) => {
    a.spor = a.spor.filter((s) => s.id !== id);
  }, `GPS-spor «${navn}» slettet`);
}

/** Coverage radius of a sperrepost (m), rounded to 5 m within the limits. */
export function settSperreRadius(id: string, radiusM: number): void {
  const s = useStore.getState();
  const p = s.aksjon.punkter.find((x) => x.id === id);
  if (!p || p.type !== 'sp') return;
  const ny = Math.min(SPERRE_RADIUS.maks, Math.max(SPERRE_RADIUS.min, Math.round(radiusM / 5) * 5));
  const gammel = p.sperre?.radiusM ?? s.aksjon.modell.sperrepostRadiusM;
  if (ny === gammel && !p.sperre?.felt) return;
  s.endreAksjon(
    (a) => {
      const q = a.punkter.find((x) => x.id === id);
      if (q) q.sperre = { radiusM: ny };
    },
    `${id}: dekning ${p.sperre?.felt ? 'tegnet felt' : `${Math.round(gammel)} m`} → ${ny} m`,
  );
}

/** Drawn coverage field of a sperrepost, or null to go back to the circle. */
export function settSperrefelt(id: string, ring: LatLng[] | null): void {
  const s = useStore.getState();
  const p = s.aksjon.punkter.find((x) => x.id === id);
  if (!p || p.type !== 'sp') return;
  const felt = ring && ring.length >= 3 ? ring.map((q) => ({ lat: +q.lat.toFixed(6), lng: +q.lng.toFixed(6) })) : null;
  s.endreAksjon(
    (a) => {
      const q = a.punkter.find((x) => x.id === id);
      if (!q) return;
      if (felt) q.sperre = { ...(q.sperre?.radiusM != null ? { radiusM: q.sperre.radiusM } : {}), felt };
      else if (q.sperre?.radiusM != null) q.sperre = { radiusM: q.sperre.radiusM };
      else delete q.sperre;
    },
    felt ? `${id}: sperrefelt ${p.sperre?.felt ? 'endret' : 'tegnet'} (${fmtKm2(areaM2(felt) / 1e6)})` : `${id}: tilbake til sirkel som dekning`,
  );
}

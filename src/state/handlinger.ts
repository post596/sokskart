import { lokalTid, nyId, type Avgrensningstype, type PunktType, type Sok, type Spor } from '../domain/aksjon';
import type { LatLng } from '../domain/coords';
import { nesteId, regionId, type Prefiks } from '../domain/naming';
import { podBetegnelse, prosent } from '../domain/pod';
import type { Observasjonsklasse } from '../data/modellantakelser';
import { lagre } from '../services/lagring';
import { useStore } from './store';

export interface PunktUtkast {
  type: PunktType;
  klasse: Observasjonsklasse;
  tid: string;
  tekst: string;
}

let utkast: PunktUtkast = { type: 'obs', klasse: 'sannsynlig', tid: '', tekst: '' };
export const settPunktUtkast = (u: PunktUtkast) => {
  utkast = u;
};
export const hentPunktUtkast = () => utkast;

const PREFIKS: Record<PunktType, Prefiks> = { obs: 'OBS', sp: 'SP', poi: 'R', funn: 'F' };
export const PUNKTNAVN: Record<PunktType, string> = {
  obs: 'Observasjon/spor',
  sp: 'Sperrepost',
  poi: 'Refleks/POI',
  funn: 'Funn av gjenstand',
};

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
      });
    },
    `${id}: ${PUNKTNAVN[u.type]}${u.type === 'obs' ? ` (${u.klasse})` : ''} lagt til`,
  );
  s.set({ modus: null });
  return id;
}

export function slettPunkt(id: string): void {
  useStore.getState().endreAksjon((a) => {
    a.punkter = a.punkter.filter((p) => p.id !== id);
  }, `${id} slettet`);
}

export function leggTilTeig(ring: LatLng[], type: Avgrensningstype): string {
  const s = useStore.getState();
  const { id, seq } = nesteId(s.aksjon.seq, type);
  s.endreAksjon((a) => {
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
    });
  }, `${id} tegnet`);
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

// ---------------------------------------------------------------- regions and Mattson

export function leggTilRegion(ring: LatLng[]): string {
  const s = useStore.getState();
  const id = regionId(s.aksjon.regioner.length);
  s.endreAksjon(
    (a) => {
      a.regioner.push({ id, navn: '', ring: ring.map((p) => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })) });
    },
    `${id} tegnet`,
  );
  s.set({ modus: null, fane: 'regioner' });
  return id;
}

export function slettRegion(id: string): void {
  useStore.getState().endreAksjon((a) => {
    a.regioner = a.regioner.filter((r) => r.id !== id);
    for (const v of Object.values(a.mattson.vurdering)) delete v[id];
  }, `${id} slettet`);
}

export function leggTilDeltaker(navn: string): void {
  useStore.getState().endreAksjon((a) => {
    a.mattson.deltakere.push({ id: nyId(), navn: navn.trim() || `Deltaker ${a.mattson.deltakere.length + 1}` });
  }, `Mattson: deltaker «${navn.trim()}» lagt til`);
}

export function slettDeltaker(id: string): void {
  useStore.getState().endreAksjon((a) => {
    const d = a.mattson.deltakere.find((x) => x.id === id);
    a.mattson.deltakere = a.mattson.deltakere.filter((x) => x.id !== id);
    delete a.mattson.vurdering[id];
    if (d) a.logg.push({ tid: new Date().toISOString(), tekst: `Mattson: deltaker «${d.navn}» fjernet` });
  });
}

export function settVurdering(deltaker: string, region: string, verdi: number): void {
  useStore.getState().endreAksjon((a) => {
    a.mattson.vurdering[deltaker] ??= {};
    a.mattson.vurdering[deltaker][region] = Math.max(0, verdi);
  });
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

export async function settBilde(dataUrl: string | null): Promise<void> {
  const ok = await lagre('bilde', dataUrl);
  useStore.getState().set({ bilde: dataUrl });
  if (!ok) useStore.getState().melding('Klarte ikke lagre bildet på enheten.', 'feil');
  useStore.getState().endreAksjon(() => {}, dataUrl ? 'Bilde av savnede lagt inn (bare lokalt)' : 'Bilde av savnede fjernet');
}

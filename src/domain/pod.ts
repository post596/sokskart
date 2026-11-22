/**
 * POD/POA/POS as described in Nasjonal veileder for søk etter savnet person på land
 * (HRS 2022), kap. 6.1 and 7.5. All probabilities are fractions 0..1.
 */

export interface PodKlasse {
  /** Lower limit (inclusive) as a fraction. */
  min: number;
  betegnelse: string;
  /** Value used when the user picks the class instead of a number. */
  standard: number;
}

/** POD scale from the veileder (tabell kap. 6.1). */
export const POD_SKALA: PodKlasse[] = [
  { min: 0.95, betegnelse: 'Svært høy', standard: 0.96 },
  { min: 0.75, betegnelse: 'Høy', standard: 0.85 },
  { min: 0.5, betegnelse: 'Normal høy', standard: 0.6 },
  { min: 0.25, betegnelse: 'Normal lav', standard: 0.4 },
  { min: 0, betegnelse: 'Lav', standard: 0.15 },
];

/**
 * Class name for a POD. The table's limits are written ">95 %", "75–95 %" … "<25 %",
 * so exactly 95 % counts as Høy and anything above as Svært høy.
 */
export function podBetegnelse(pod: number): string {
  if (pod > 0.95) return 'Svært høy';
  if (pod >= 0.75) return 'Høy';
  if (pod >= 0.5) return 'Normal høy';
  if (pod >= 0.25) return 'Normal lav';
  return 'Lav';
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** PODakkumulert = 1 − (1 − POD₁)(1 − POD₂)… (assumes independent searches). */
export function akkumulertPod(pods: number[]): number {
  return 1 - pods.reduce((acc, p) => acc * (1 - clamp01(p)), 1);
}

/** POS = POA × POD */
export function pos(poa: number, pod: number): number {
  return clamp01(poa) * clamp01(pod);
}

/** Remaining POA in a segment after searching with a given (accumulated) POD. */
export function gjenstaendePoa(poa: number, pod: number): number {
  return clamp01(poa) * (1 - clamp01(pod));
}

export type TeigStatus = 'planlagt' | 'utdelt';

/** HRS colour codes for teiger/oppdrag (veileder kap. 10.8). */
export const TEIGFARGER = {
  planlagt: '#1d4ed8', // blå
  utdelt: '#dc2626', // rød
  ettSok: '#ea580c', // oransje
  flereSok: '#eab308', // gul
  ferdig: '#16a34a', // grønn
} as const;

export type Teigfarge = keyof typeof TEIGFARGER;

export function teigfarge(status: TeigStatus, pods: number[]): Teigfarge {
  if (pods.length && akkumulertPod(pods) > 0.95) return 'ferdig';
  if (pods.length >= 2) return 'flereSok';
  if (pods.length === 1) return 'ettSok';
  return status === 'utdelt' ? 'utdelt' : 'planlagt';
}

export const TEIGFARGE_TEKST: Record<Teigfarge, string> = {
  planlagt: 'Planlagt',
  utdelt: 'Utdelt og startet',
  ettSok: 'Ett søk',
  flereSok: 'Flere søk – vurder på nytt',
  ferdig: 'Svært høy POD (> 95 %)',
};

/** Track colours per resource (veileder kap. 10.6). */
export const SPORFARGER = {
  fotmannskap: '#dc2626', // rød
  hund: '#374151', // mørk grå
  hundefører: '#1d4ed8', // blå
  motorisert: '#16a34a', // grønn
} as const;

/** "12,5 %" – Norwegian decimal comma, one decimal below 10 %. */
export function prosent(v: number, decimals?: number): string {
  const p = v * 100;
  const d = decimals ?? (Math.abs(p) < 10 ? 1 : 0);
  return `${p.toFixed(d).replace('.', ',')} %`;
}

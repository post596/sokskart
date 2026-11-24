/**
 * Naming conventions from the veileder (kap. 10.5, tabell s. 69):
 * T### teig, L### ledelinje, R### punkt/refleks, H### helikoptersøk, D### drone,
 * SP### sperrepost. Observasjoner (OBS###) and funn (F###) follow the same pattern;
 * they are not named in the table.
 */

export type Prefiks = 'T' | 'L' | 'R' | 'H' | 'D' | 'SP' | 'OBS' | 'F';

export type Sekvens = Partial<Record<Prefiks, number>>;

export const løpenummer = (n: number) => String(n).padStart(3, '0');

/** Returns the next id and the updated sequence (pure). */
export function nesteId(seq: Sekvens, prefiks: Prefiks): { id: string; seq: Sekvens } {
  const n = (seq[prefiks] ?? 0) + 1;
  return { id: prefiks + løpenummer(n), seq: { ...seq, [prefiks]: n } };
}

/** Etat/organisasjon (veileder tabell s. 69), in the veileder's order. */
export const ORGANISASJONER: Array<[string, string]> = [
  ['P', 'Politi'],
  ['BV', 'Brannvesen'],
  ['F', 'Forsvaret'],
  ['NFS', 'Norsk Folkehjelp'],
  ['RK', 'Røde Kors'],
  ['NRH', 'Norske redningshunder'],
  ['NRO', 'Norsk Redningshund Organisasjon'],
  ['RO', 'Rovere'],
  ['LA', 'Luftambulanse'],
  ['RS', 'Redningsselskapet'],
  ['SF', 'Sivilforsvaret'],
  ['330', 'Redningshelikopter'],
  ['AN', 'Andre'],
];

/** Type ressurs (veileder tabell s. 69). */
export const RESSURSTYPER: Record<string, string> = {
  Msk: 'Mannskap',
  Ptr: 'Patrulje',
  Hund: 'Hund',
  HF: 'Hundefører',
  Heli: 'Helikopter',
  Drone: 'Drone',
  Båt: 'Båt',
  Bil: 'Bil',
  ATV: 'ATV',
  SS: 'Snøscooter',
  Fly: 'Fly',
  Tau: 'Taulag',
};

/**
 * «geografisk avgrensning» – «etat/org» – «type ressurs» – «id», e.g. T001–RK–Msk–21
 * (veileder kap. 10.5.6). Uses an en dash like the veileder.
 */
export function oppdragsnavn(avgrensning: string, org: string, type: string, id: string): string {
  return [avgrensning, org, type, id].filter((s) => s && s.trim()).join('–');
}

/** Date-time group DDTTMM: day, hour, minute (veileder kap. 10.6), local time. */
export function datoTidsgruppe(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getDate()) + p(d.getHours()) + p(d.getMinutes());
}

/** GPS log name «avgrensning» – «DDTTMM» – «org» – «type» – «id», e.g. T005–281345–RK–Drone–71. */
export function sporloggnavn(avgrensning: string, ferdig: Date, org: string, type: string, id: string): string {
  return [avgrensning, datoTidsgruppe(ferdig), org, type, id].filter((s) => s && s.trim()).join('–');
}

import type { SokTeknikk } from '../data/modellantakelser';

/**
 * Søksfase etter hvor lenge søket har pågått (veileder kap. 4 og 7.5):
 * - førsteinnsats normalt opptil 12 timer – sykkelhjulmodellen: IPP, nærområdet,
 *   ledelinjer og interessepunkter; ikke teigsett
 * - formell søksplanlegging normalt etter 6–24 timer – teiger, POD og POA
 * Grensene (standard 6 og 12 timer) er modellantakelser og kan endres.
 */
export type Sokefase = 'forsteinnsats' | 'overgang' | 'formell';

export const FASENAVN: Record<Sokefase, string> = {
  forsteinnsats: 'Førsteinnsats',
  overgang: 'Overgang til formell søksplanlegging',
  formell: 'Formell søksplanlegging',
};

export function sokefase(timer: number | null, grenser: [number, number]): Sokefase {
  if (timer == null || timer < grenser[0]) return 'forsteinnsats';
  if (timer < grenser[1]) return 'overgang';
  return 'formell';
}

export interface TeigOnske {
  modus: 'navet' | 'neste' | 'sett';
  antall: number;
  teknikk: SokTeknikk;
  /** why: search phase and the reason for this kind/number of teiger (shown per suggestion) */
  fase?: { navn: string; timer: number | null; grunn: string };
}

export interface Faseanbefaling {
  fase: Sokefase;
  tekst: string;
  /** the suggestion the app recommends now, or null (no teiger yet) */
  teig: TeigOnske | null;
  knapp: string | null;
}

export function faseanbefaling(p: {
  timer: number | null;
  grenser: [number, number];
  /** R25 in metres */
  r25: number;
  fotmannskap: number;
  mannskapPerLag: number;
  standardTeknikk: SokTeknikk;
}): Faseanbefaling {
  const fase = sokefase(p.timer, p.grenser);
  // no crew registered: suggest 3 teiger
  const lag = Math.max(1, Math.floor(p.fotmannskap / Math.max(1, p.mannskapPerLag)) || 3);
  const f = (grunn: string) => ({ navn: FASENAVN[fase], timer: p.timer, grunn });
  if (fase === 'forsteinnsats') {
    if (p.r25 < 300) {
      return {
        fase,
        tekst:
          'Sykkelhjulmodellen: søk IPP grundig, ledelinjer helt ut og interessepunkter. R25 er under 300 m, så nærområdet (navet) bør finsøkes umiddelbart. Ikke lag teigsett ennå.',
        teig: {
          modus: 'navet',
          antall: 0,
          teknikk: 'finsok',
          fase: f(`R25 er bare ${Math.round(p.r25)} m, så hele nærområdet (navet) deles i finsøksteiger og søkes umiddelbart.`),
        },
        knapp: 'Foreslå finsøksteiger i nærområdet',
      };
    }
    return {
      fase,
      tekst: 'Sykkelhjulmodellen: søk IPP grundig, ledelinjer helt ut, interessepunkter og sperreposter. Teiger trengs normalt ikke ennå.',
      teig: null,
      knapp: null,
    };
  }
  if (fase === 'overgang') {
    return {
      fase,
      tekst: `Søket har pågått en stund. Foreslå teiger der det er mest sannsynlighet igjen – like mange som tilgjengelige fotlag (${lag}).`,
      teig: {
        modus: 'neste',
        antall: lag,
        teknikk: p.standardTeknikk,
        fase: f(
          p.fotmannskap > 0
            ? `${p.fotmannskap} fotmannskap / ${p.mannskapPerLag} per lag = ${lag} lag, så de ${lag} teigene med mest sannsynlighet igjen i 50 %-sonen foreslås.`
            : `Ingen fotmannskap registrert under Ressurser, så de ${lag} teigene med mest sannsynlighet igjen i 50 %-sonen foreslås.`,
        ),
      },
      knapp: `Foreslå ${lag} neste teiger`,
    };
  }
  return {
    fase,
    tekst: 'Formell søksplanlegging: lag et felles teigsett for 75 %-sonen og prioriter etter POA. Bruk kvalitetssikringen.',
    teig: {
      modus: 'sett',
      antall: 0,
      teknikk: p.standardTeknikk,
      fase: f('Hele 75 %-sonen deles i et felles teigsett langs naturlige grenser, rangert etter sannsynlighet (veileder 7.5).'),
    },
    knapp: 'Foreslå teigsett for 75 %-sonen',
  };
}

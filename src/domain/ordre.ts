import { fmtAvstand, fmtFart, fmtKm2, fmtTid, fmtTimer } from '../ui/format';
import type { Aksjon, Punkt, Teig } from './aksjon';
import type { LatLng } from './coords';
import { utmHjorner } from './eksport';
import { prosent } from './pod';
import { formatLatLonUtm, type ZoneChoice } from './utm';

/** Søkemetoder from the veileder (kap. 6.3). */
export const SOKSTYPER = [
  'Søk langs ledelinje (uten flanke)',
  'Søk langs ledelinje med flanke',
  'Søk langs naturlige veivalg',
  'Grovsøk (kombinert mannskapssøk)',
  'Finsøk / søkekjede',
  'Punktsøk (refleks/POI)',
  'Sperrepost / observasjonspost',
  'Kompasskurssøk',
  'Søk i bygninger',
  'Hundesøk (grovsøk)',
  'Dronesøk',
  'Helikoptersøk',
] as const;

export type OrdreKilde =
  | { type: 'teig'; teig: Teig; arealKm2: number; poa: number | null }
  | { type: 'linje'; nr: string; navn: string; typeNavn: string; lengdeM: number; pts: LatLng[]; tNaadd: number | null; poa: number | null }
  | { type: 'punkt'; punkt: Punkt };

export interface OrdreInput {
  aksjon: Aksjon;
  kategorier: string;
  ringer: [number, number, number, number] | null;
  fart: { v: number; mob: number } | null;
  observasjoner: Punkt[];
  kilde: OrdreKilde;
  oppdrag: string;
  sokstype: string;
  ressurs: string;
  naa: Date;
}

export function omradeNavn(k: OrdreKilde): string {
  return k.type === 'teig' ? k.teig.id : k.type === 'linje' ? k.nr : k.punkt.id;
}

const utm = (p: LatLng, sone: ZoneChoice) => formatLatLonUtm(p.lat, p.lng, sone);

/** Text for a 5-punktsordre (veileder kap. 10.3.1), ready to copy. */
export function lagFempunktsordre(i: OrdreInput): string {
  const a = i.aksjon;
  const k = i.kilde;
  const L: string[] = [];
  const omr = omradeNavn(k);
  L.push(`5-PUNKTSORDRE – ${[omr, i.ressurs].filter(Boolean).join('–')}`);
  L.push(`${a.navn || 'Aksjon'}${a.sarNr ? ` (${a.sarNr})` : ''} · ${fmtTid(i.naa.toISOString())}`);
  L.push('Opplysningene er taushetsbelagte og skal ikke deles videre.');
  L.push('');
  L.push('1. SITUASJON');
  L.push('a) Den savnede');
  // personal details are never stored in Søkskart; ILKO gives them orally or from its own systems
  L.push('   Personopplysninger om den savnede (signalement, bekledning, helse) gis av ILKO.');
  L.push(`   Savnetkategori: ${i.kategorier || 'ikke valgt'}`);
  if (a.sistSett) L.push(`   Sist sett: ${fmtTid(a.sistSett)}`);
  if (a.ipp) L.push(`   IPP: ${utm(a.ipp, a.sone)}`);
  if (i.ringer) {
    L.push(
      `   Statistikk: R25 ${fmtAvstand(i.ringer[0])}, R50 ${fmtAvstand(i.ringer[1])}, R75 ${fmtAvstand(i.ringer[2])}, R95 ${fmtAvstand(i.ringer[3])}` +
        (i.fart ? `; gangfart ${fmtFart(i.fart.v)}, mobilitet ${fmtTimer(i.fart.mob)}` : ''),
    );
  }
  const obs = i.observasjoner.filter((o) => o.type === 'obs' && (o.klasse === 'sikker' || o.klasse === 'sannsynlig'));
  if (obs.length) {
    L.push('   Observasjoner (sikre/sannsynlige):');
    for (const o of obs) L.push(`   - ${o.id} ${o.klasse}, ${fmtTid(o.tid)}, ${utm(o.pos, a.sone)}${o.tekst ? ` – ${o.tekst}` : ''}`);
  }
  L.push(`b) Egne styrker: ${a.ordre.egneStyrker || '–'}`);
  L.push(`c) Vær, lys og føre: ${a.ordre.varLysFore || '–'}`);
  L.push('');
  L.push('2. OPPDRAG');
  L.push(`   ${i.oppdrag || '–'}`);
  L.push('');
  L.push('3. UTFØRELSE');
  L.push(`   Søksmetode: ${i.sokstype}`);
  if (i.ressurs) L.push(`   Ressurs: ${i.ressurs}`);
  if (k.type === 'teig') {
    L.push(`   Område: ${k.teig.id} (${fmtKm2(k.arealKm2)}${k.poa != null ? `, POA nå ${prosent(k.poa)}` : ''})`);
    L.push('   Hjørner (UTM, forenklet):');
    utmHjorner(k.teig.ring, a.sone, 16).forEach((t, n) => L.push(`   ${n + 1}. ${t}`));
    const pods = k.teig.sok.map((x) => `${prosent(x.pod, 0)} (${[x.org, x.ressurstype, x.enhet].filter(Boolean).join('–')})`);
    if (pods.length) L.push(`   Tidligere søk i teigen: ${pods.join(', ')}`);
  } else if (k.type === 'linje') {
    L.push(`   Ledelinje: ${k.nr} ${k.typeNavn}${k.navn ? ` «${k.navn}»` : ''}, ${fmtAvstand(k.lengdeM)}${k.poa != null ? `, ${prosent(k.poa)} av sannsynligheten langs linja` : ''}`);
    L.push(`   Fra: ${utm(k.pts[0], a.sone)}`);
    L.push(`   Til: ${utm(k.pts[k.pts.length - 1], a.sone)}`);
    if (k.tNaadd != null) L.push(`   Personen kan ha nådd linja etter ca. ${fmtTimer(k.tNaadd)} gange.`);
    L.push('   Søk ledelinja helt ut – også forbi R95 når tid og scenario tilsier det.');
  } else {
    const p = k.punkt;
    L.push(`   Punkt: ${p.id}${p.tekst ? ` – ${p.tekst}` : ''}`);
    L.push(`   Posisjon: ${utm(p.pos, a.sone)}`);
    if (p.type === 'sp') L.push('   Sperrepost: hindre at den savnede tar seg forbi punktet. Meld alle observasjoner av personer til ILKO.');
  }
  L.push('   Ved funn: meld nøyaktig posisjon (14-sifret UTM), savnedes tilstand og bistandsbehov til ILKO.');
  L.push('   Ressurser i søk avventer i terrenget til det er verifisert at det er savnede som er funnet.');
  L.push('');
  L.push('4. ADMINISTRASJON OG FORSYNINGSTJENESTE');
  L.push(`   ${a.ordre.administrasjon || '–'}`);
  L.push('   Lagre GPS-sporlogg navngitt «avgrensning–DDTTMM–org–type–id».');
  L.push('');
  L.push('5. LEDELSE OG SAMBAND');
  L.push(`   ${a.ordre.ledelseSamband || '–'}`);
  return L.join('\n');
}

/** Default text for «Oppdrag» depending on the source. */
export function standardOppdrag(k: OrdreKilde): string {
  if (k.type === 'teig') return `Søk ${k.teig.id} og meld resultat med estimert POD.`;
  if (k.type === 'linje') return `Hurtigsøk langs ${k.nr} helt ut og meld resultat.`;
  if (k.punkt.type === 'sp') return `Etabler sperrepost ved ${k.punkt.id}.`;
  return `Punktsøk ved ${k.punkt.id}.`;
}

export function standardSokstype(k: OrdreKilde): string {
  if (k.type === 'linje') return SOKSTYPER[0];
  if (k.type === 'punkt') return k.punkt.type === 'sp' ? SOKSTYPER[6] : SOKSTYPER[5];
  if (k.teig.type === 'H') return SOKSTYPER[11];
  if (k.teig.type === 'D') return SOKSTYPER[10];
  return SOKSTYPER[3];
}

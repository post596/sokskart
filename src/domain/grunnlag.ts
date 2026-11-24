import type { LinjeType } from '../model/typer';
import { LINJETYPE_NAVN } from '../model/typer';
import { fmtAvstand, fmtKm2, fmtTimer } from '../ui/format';
import { prosent } from './pod';

/**
 * Why a teig or drone area was suggested: the numbers behind the suggestion, computed in the
 * worker when the suggestion is made and kept on the teig when it is approved. Plain JSON
 * (rounded numbers, short arrays) so it can be stored and exported.
 */
export interface ForslagGrunnlag {
  /** 1-based rank among the suggestions of this request, and how many there were */
  rang: number;
  antall: number;
  /** share of the remaining probability inside, and cumulative with the ones ranked before */
  poa: number;
  poaKum: number;
  arealKm2: number;
  /** share of the area in the 25/50/75/95 % zones and outside */
  soner: [number, number, number, number, number];
  /** earliest arrival by walking (h at the person's speed), and distance from IPP (m) */
  tMinTimer: number | null;
  avstandM: number;
  /** largest land cover shares (from OSM) */
  arealtyper: Array<{ navn: string; andel: number }>;
  /** mean slope (degrees), null without elevation data */
  helningSnitt: number | null;
  /** ledelinjer inside (longest first); nr is the L number when it has one */
  linjer: Array<{ id: string; nr?: string; type: LinjeType; navn: string; lengdeM: number }>;
  /** points of interest inside */
  poi: string[];
  /** foot teiger: technique and the mean terrain factor on search speed */
  teknikk?: { navn: string; mannskap: number; avstandM: number; fartKmt: number; sokefaktor: number; timer: number };
  /** search phase when suggested, and why this many */
  fase?: { navn: string; timer: number | null; grunn: string };
  /** drone areas: mean drone effect (0..1), flight time and batteries */
  drone?: { effekt: number; minutter: number; batterier: number };
  /** share of the area covered by imported GPS tracks (1 − e^−C), when known */
  sporDekning?: number;
  beregnet: string;
}

const SONENAVN = ['25 %-sonen', '50 %-sonen', '75 %-sonen', '95 %-sonen', 'utenfor 95 %'];

const desimal = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
/** "Grovsøk (kombinert mannskapssøk)" → "grovsøk" */
const teknikkNavn = (navn: string) => navn.split(/\s*[(/]/)[0].trim().toLowerCase();

/** Fills in L numbers on the ledelinjer (the worker does not know them). */
export function medLnummer(g: ForslagGrunnlag, lnummer: Record<string, string>): ForslagGrunnlag {
  return { ...g, linjer: g.linjer.map((l) => (lnummer[l.id] ? { ...l, nr: lnummer[l.id] } : l)) };
}

function linjeTekst(l: ForslagGrunnlag['linjer'][number], lnummer: Record<string, string>): string {
  const nr = l.nr ?? lnummer[l.id];
  return `${nr ? `${nr} ` : ''}${LINJETYPE_NAVN[l.type]}${l.navn ? ` «${l.navn}»` : ''} (${fmtAvstand(l.lengdeM)})`;
}

function soneTekst(s: ForslagGrunnlag['soner']): string {
  const deler = s.map((a, i) => ({ a, i })).filter((x) => x.a >= 0.05);
  if (!deler.length) return 'utenfor sonene';
  return deler.map((x) => `${prosent(x.a, 0)} i ${SONENAVN[x.i]}`).join(', ');
}

/** The explanation as short lines, for the «Hvorfor dette forslaget?» panel and orders. */
export function grunnlagLinjer(g: ForslagGrunnlag, lnummer: Record<string, string> = {}): string[] {
  const L: string[] = [];
  L.push(
    `Nr. ${g.rang} av ${g.antall} etter sannsynlighet: ${prosent(g.poa)} av gjenværende sannsynlighet ligger her` +
      (g.rang > 1 ? ` (${prosent(g.poaKum)} sammen med forslagene foran).` : '.'),
  );
  L.push(`Sone: ${soneTekst(g.soner)}.`);
  L.push(
    `${g.avstandM < 1 ? 'IPP ligger i området' : `Nærmeste del er ${fmtAvstand(g.avstandM)} fra IPP`}` +
      (g.tMinTimer != null ? `; personen kan tidligst ha vært her etter ca. ${fmtTimer(g.tMinTimer)} gange.` : '.'),
  );
  const terreng = g.arealtyper.length ? g.arealtyper.map((a) => `${a.navn} ${prosent(a.andel, 0)}`).join(', ') : 'arealtype ukjent (ikke kartlagt i OSM)';
  L.push(`Terreng: ${terreng}${g.helningSnitt != null ? ` · snitthelning ${Math.round(g.helningSnitt)}°` : ''}.`);
  L.push(g.linjer.length ? `Ledelinjer inni: ${g.linjer.map((l) => linjeTekst(l, lnummer)).join(', ')}.` : 'Ingen ledelinjer inni.');
  if (g.poi.length) L.push(`Interessepunkter inni: ${g.poi.join(', ')}.`);
  if (g.teknikk) {
    const t = g.teknikk;
    const terrengFart =
      t.sokefaktor >= 1
        ? `stier og veier gjør søket litt raskere (${prosent(t.sokefaktor, 0)} av farten i lett terreng)`
        : `skog, myr og helning senker farten til ${prosent(t.sokefaktor, 0)} av farten i lett terreng`;
    L.push(
      `Søketid ca. ${fmtTimer(t.timer)} for ${t.mannskap} personer med ${teknikkNavn(t.navn)}, ${t.avstandM} m mellom og ${desimal(t.fartKmt)} km/t; ${terrengFart}.`,
    );
  }
  if (g.drone) {
    L.push(
      `Droneeffekt i snitt ${desimal(g.drone.effekt, 2)} (1 = åpent, myr, vann/strand, bratt; 0,2 = skog) · ` +
        `${fmtKm2(g.arealKm2)} gir ca. ${fmtTimer(g.drone.minutter / 60)} flytid, ${g.drone.batterier} ${g.drone.batterier === 1 ? 'batteri' : 'batterier'}.`,
    );
  }
  if (g.sporDekning != null) L.push(`GPS-spor dekker ca. ${prosent(g.sporDekning, 0)} av området.`);
  if (g.fase) L.push(`${g.fase.navn}${g.fase.timer != null ? ` (${fmtTimer(Math.max(0, g.fase.timer))} siden start)` : ''}: ${g.fase.grunn}`);
  return L;
}

/** One line (≤ 300 characters) for file exports. */
export function kortBegrunnelse(g: ForslagGrunnlag, lnummer: Record<string, string> = {}): string {
  const deler = [
    `Nr. ${g.rang}/${g.antall}, POA ${prosent(g.poa)}`,
    soneTekst(g.soner),
    g.tMinTimer != null ? `nås etter ca. ${fmtTimer(g.tMinTimer)}` : '',
    g.linjer.length ? `ledelinjer: ${g.linjer.slice(0, 3).map((l) => l.nr ?? lnummer[l.id] ?? LINJETYPE_NAVN[l.type]).join(', ')}` : '',
    g.poi.length ? `POI: ${g.poi.slice(0, 3).join(', ')}` : '',
    g.teknikk ? `ca. ${fmtTimer(g.teknikk.timer)} ${teknikkNavn(g.teknikk.navn)}` : '',
    g.drone ? `ca. ${Math.round(g.drone.minutter)} min drone, ${g.drone.batterier} batt.` : '',
  ].filter(Boolean);
  const t = deler.join('; ');
  return t.length > 300 ? t.slice(0, 297) + '…' : t;
}

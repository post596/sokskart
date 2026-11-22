import { valider, type LpbKategori, type Ringer, type Terreng } from './lpb-stats';

/**
 * CSV import/export for the LPB table. Columns (header required, any order):
 *   kategori;terreng;r25;r50;r75;r95;gangfart;mobilitet;verifisert;kilde
 * - kategori: key (e.g. "dement") or name (e.g. "Demens")
 * - terreng: fjell | flatt | begge (default begge)
 * - separator ; , or tab; decimal comma allowed when ; or tab is the separator
 * - verifisert: ja/nei/true/false/1/0 (default nei)
 */

export interface CsvResultat {
  stats: LpbKategori[];
  endret: string[];
  feil: string[];
}

const KOLONNER = ['kategori', 'terreng', 'r25', 'r50', 'r75', 'r95', 'gangfart', 'mobilitet', 'verifisert', 'kilde'] as const;

function splitLinje(linje: string, sep: string): string[] {
  const ut: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < linje.length; i++) {
    const ch = linje[i];
    if (q) {
      if (ch === '"' && linje[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      ut.push(cur);
      cur = '';
    } else cur += ch;
  }
  ut.push(cur);
  return ut.map((s) => s.trim());
}

const tall = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
const sant = (s: string) => /^(ja|j|true|sann|1|x|yes|y)$/i.test(s.trim());
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9æøå]/g, '');

export function importerCsv(tekst: string, gjeldende: LpbKategori[]): CsvResultat {
  const linjer = tekst
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'));
  const feil: string[] = [];
  if (linjer.length < 2) return { stats: gjeldende, endret: [], feil: ['Fila må ha en overskriftslinje og minst én rad.'] };

  const sep = linjer[0].includes(';') ? ';' : linjer[0].includes('\t') ? '\t' : ',';
  const hode = splitLinje(linjer[0], sep).map((h) => h.toLowerCase());
  const idx = Object.fromEntries(KOLONNER.map((k) => [k, hode.indexOf(k)])) as Record<(typeof KOLONNER)[number], number>;
  for (const k of ['kategori', 'r25', 'r50', 'r75', 'r95'] as const) {
    if (idx[k] < 0) feil.push(`Mangler kolonnen «${k}».`);
  }
  if (feil.length) return { stats: gjeldende, endret: [], feil };

  const stats = gjeldende.map((c) => ({ ...c, fjell: { ...c.fjell }, flatt: { ...c.flatt } }));
  const endret = new Set<string>();

  linjer.slice(1).forEach((linje, n) => {
    const rad = n + 2;
    const f = splitLinje(linje, sep);
    const get = (k: (typeof KOLONNER)[number]) => (idx[k] >= 0 ? (f[idx[k]] ?? '') : '');
    const navn = get('kategori');
    const kat = stats.find((s) => norm(s.key) === norm(navn) || norm(s.navn) === norm(navn));
    if (!kat) {
      feil.push(`Rad ${rad}: ukjent kategori «${navn}».`);
      return;
    }
    const r: Ringer = { r25: tall(get('r25')), r50: tall(get('r50')), r75: tall(get('r75')), r95: tall(get('r95')) };
    const v = valider(r);
    if (v.length) {
      feil.push(`Rad ${rad} (${kat.navn}): ${v.join(' ')}`);
      return;
    }
    const t = get('terreng').toLowerCase();
    const terreng: Terreng[] = t === 'fjell' ? ['fjell'] : t === 'flatt' ? ['flatt'] : ['fjell', 'flatt'];
    for (const tt of terreng) kat[tt] = { ...r };
    const gf = tall(get('gangfart'));
    if (get('gangfart') && Number.isFinite(gf) && gf > 0) kat.gangfart = gf;
    const mob = tall(get('mobilitet'));
    if (get('mobilitet') && Number.isFinite(mob) && mob > 0) kat.mobilitet = mob;
    if (idx.verifisert >= 0) kat.verifisert = sant(get('verifisert'));
    if (get('kilde')) kat.kilde = get('kilde');
    endret.add(kat.navn);
  });

  return { stats, endret: [...endret], feil };
}

const fmt = (v: number) => String(v).replace('.', ',');

export function eksporterCsv(stats: LpbKategori[]): string {
  const rader = [KOLONNER.join(';')];
  for (const s of stats) {
    for (const t of ['fjell', 'flatt'] as const) {
      const r = s[t];
      rader.push(
        [s.key, t, fmt(r.r25), fmt(r.r50), fmt(r.r75), fmt(r.r95), fmt(s.gangfart), fmt(s.mobilitet), s.verifisert ? 'ja' : 'nei', `"${s.kilde.replace(/"/g, '""')}"`].join(';'),
      );
    }
  }
  return rader.join('\r\n') + '\r\n';
}

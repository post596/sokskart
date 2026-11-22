/** Norwegian number formatting for the UI. All shown numbers go through here (tested). */

const komma = (s: string) => s.replace('.', ',');

/** 850 m · 1,9 km · 12 km */
export function fmtAvstand(m: number): string {
  if (!Number.isFinite(m)) return '–';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  if (m < 10000) return `${komma((m / 1000).toFixed(1))} km`;
  return `${Math.round(m / 1000)} km`;
}

/** 35 min · 1 t 05 min · 12 t */
export function fmtTimer(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return '–';
  if (h < 0) return `−${fmtTimer(-h)}`;
  const totMin = Math.round(h * 60);
  const t = Math.floor(totMin / 60);
  const min = totMin % 60;
  if (t === 0) return `${min} min`;
  if (min === 0) return `${t} t`;
  return `${t} t ${String(min).padStart(2, '0')} min`;
}

/** 0,32 km² · 4,1 km² · 26 km² */
export function fmtKm2(km2: number): string {
  if (!Number.isFinite(km2)) return '–';
  if (km2 < 1) return `${komma(km2.toFixed(2))} km²`;
  if (km2 < 10) return `${komma(km2.toFixed(1))} km²`;
  return `${Math.round(km2)} km²`;
}

/** 3,0 km/t */
export const fmtFart = (v: number) => `${komma(v.toFixed(1))} km/t`;

/** "22.11. kl. 10:05" from ISO or local datetime string */
export function fmtTid(s: string | null | undefined): string {
  if (!s) return '–';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '–';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}. kl. ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Parses "60", "60 %", "0,6" → 0.6 (numbers above 1 are percent). */
export function lesProsent(s: string): number | null {
  const v = Number(s.replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(v) || v < 0) return null;
  const f = v > 1 ? v / 100 : v;
  return f > 1 ? null : f;
}

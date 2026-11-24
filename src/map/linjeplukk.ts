/**
 * Picks the line nearest to a click, in screen pixels. Used when the click did not land on a
 * drawn line: lines hidden («Alle ledelinjer» off), lines under a teig polygon, or a tap on the
 * path in the base map.
 */
export type Px = [number, number];

export interface PlukkLinje {
  id: string;
  pts: Px[];
}

/** Distance from p to segment ab. */
export function avstandTilSegment(p: Px, a: Px, b: Px): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** The nearest line within `tolPx`, or null. */
export function naermesteLinje(p: Px, linjer: PlukkLinje[], tolPx: number): { id: string; d: number } | null {
  let best: { id: string; d: number } | null = null;
  for (const l of linjer) {
    const pts = l.pts;
    if (pts.length < 2) continue;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      // quick reject on the segment's bounding box
      if (p[0] < Math.min(a[0], b[0]) - tolPx || p[0] > Math.max(a[0], b[0]) + tolPx) continue;
      if (p[1] < Math.min(a[1], b[1]) - tolPx || p[1] > Math.max(a[1], b[1]) + tolPx) continue;
      const d = avstandTilSegment(p, a, b);
      if (d <= tolPx && (!best || d < best.d)) best = { id: l.id, d };
    }
  }
  return best;
}

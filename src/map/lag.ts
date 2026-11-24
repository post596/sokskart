import L from 'leaflet';
import type { LatLng } from '../domain/coords';
import { bilineaer, type MercatorIndeks } from '../model/grid';

/** Colours for the 25/50/75/95 % bands (darkest = most probable), RGBA. */
export const BANDFARGER: Array<[number, number, number, number]> = [
  [127, 0, 0, 165],
  [215, 48, 31, 135],
  [252, 141, 89, 105],
  [253, 204, 138, 80],
];

/** A canvas positioned like an image overlay (Leaflet's SVGOverlay accepts any element). */
export function lagCanvasOverlay(merc: MercatorIndeks, pane: string): { layer: L.Layer; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = merc.width;
  canvas.height = merc.height;
  const b = merc.bounds;
  const layer = L.svgOverlay(canvas as unknown as SVGElement, L.latLngBounds(b[0], b[1]), { pane, interactive: false });
  return { layer, canvas };
}

export function tegnSannsynlighet(canvas: HTMLCanvasElement, merc: MercatorIndeks, band: Int8Array): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(merc.width, merc.height);
  const d = img.data;
  for (let p = 0; p < merc.index.length; p++) {
    const c = merc.index[p];
    if (c < 0) continue;
    const b = band[c];
    if (b < 0) continue;
    const col = BANDFARGER[b];
    d[p * 4] = col[0];
    d[p * 4 + 1] = col[1];
    d[p * 4 + 2] = col[2];
    d[p * 4 + 3] = col[3];
  }
  ctx.putImageData(img, 0, 0);
}

/** Contour step (hours) for a given maximum time shown. */
export function konturSteg(tMax: number): number {
  if (tMax <= 1.5) return 0.25;
  if (tMax <= 4) return 0.5;
  if (tMax <= 10) return 1;
  return 2;
}

/**
 * Area the person can have reached within tMax hours of walking (violet), with
 * contour lines every konturSteg() hours and a strong line at the frontier.
 */
export function tegnGangtid(canvas: HTMLCanvasElement, merc: MercatorIndeks, T1: Float32Array, v: number, tMax: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: W, height: H, index, fx, fy } = merc;
  const n = Math.round(Math.sqrt(T1.length));
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const steg = konturSteg(tMax);
  const tid = new Float32Array(W * H).fill(Number.POSITIVE_INFINITY);
  for (let p = 0; p < index.length; p++) {
    if (index[p] >= 0) tid[p] = bilineaer(T1, n, fx[p], fy[p]) / v;
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const t = tid[p];
      if (!(t <= tMax)) continue;
      // edge detection against right and lower neighbour
      const tr = x + 1 < W ? tid[p + 1] : t;
      const tb = y + 1 < H ? tid[p + W] : t;
      const kant = !(tr <= tMax) || !(tb <= tMax) || (x > 0 && !(tid[p - 1] <= tMax)) || (y > 0 && !(tid[p - W] <= tMax));
      const kontur = Math.floor(t / steg) !== Math.floor(Math.min(tr, tMax) / steg) || Math.floor(t / steg) !== Math.floor(Math.min(tb, tMax) / steg);
      const o = p * 4;
      if (kant) {
        d[o] = 76;
        d[o + 1] = 29;
        d[o + 2] = 149;
        d[o + 3] = 255;
      } else if (kontur) {
        d[o] = 109;
        d[o + 1] = 40;
        d[o + 2] = 217;
        d[o + 3] = 170;
      } else {
        d[o] = 139;
        d[o + 1] = 92;
        d[o + 2] = 246;
        d[o + 3] = Math.round(30 + 40 * (t / tMax));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export interface RekkeviddeData {
  linjer: LatLng[][];
  /** true for paths and roads (drawn wider than streams and power lines) */
  bred: boolean[];
  /** lines filtered out in the map (not drawn) */
  skjul?: boolean[];
  /** hours at 1 km/h per vertex, concatenated */
  tider: Float32Array;
  start: Uint32Array;
  v: number;
  tMax: number;
}

/**
 * Ledelinjer «growing» outwards from the IPP: draws the part of every line the person
 * can have reached within tMax hours, and a dot where they would be at that time.
 */
export class Rekkeviddelinjer extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private data: RekkeviddeData | null = null;
  private raf = 0;

  settData(d: RekkeviddeData | null) {
    this.data = d;
    this.planlegg();
  }

  onAdd(map: L.Map) {
    this.canvas = L.DomUtil.create('canvas', 'rekkevidde-canvas') as HTMLCanvasElement;
    this.canvas.style.pointerEvents = 'none';
    map.getPane('rekkevidde')!.appendChild(this.canvas);
    map.on('moveend zoomend resize', this.planlegg, this);
    map.on('zoomstart', this.skjul, this);
    this.planlegg();
    return this;
  }

  onRemove(map: L.Map) {
    map.off('moveend zoomend resize', this.planlegg, this);
    map.off('zoomstart', this.skjul, this);
    this.canvas?.remove();
    this.canvas = null;
    return this;
  }

  private skjul() {
    if (this.canvas) this.canvas.style.visibility = 'hidden';
  }

  private planlegg() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.tegn());
  }

  private tegn() {
    const map = this._map;
    const cv = this.canvas;
    if (!map || !cv) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.x * dpr;
    cv.height = size.y * dpr;
    cv.style.width = `${size.x}px`;
    cv.style.height = `${size.y}px`;
    const tl = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(cv, tl);
    cv.style.visibility = 'visible';
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    const d = this.data;
    if (!d) return;
    const front: Array<[number, number]> = [];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const brede: Array<[number, number, number, number]> = [];
    const smale: Array<[number, number, number, number]> = [];
    for (let i = 0; i < d.linjer.length; i++) {
      if (d.skjul?.[i]) continue;
      const pts = d.linjer[i];
      const s = d.start[i];
      const segs = d.bred[i] ? brede : smale;
      let prevP: L.Point | null = null;
      let prevT = Infinity;
      for (let k = 0; k < pts.length; k++) {
        const t = d.tider[s + k] / d.v;
        const ll = pts[k];
        const p = map.latLngToContainerPoint([ll.lat, ll.lng]);
        if (k > 0 && prevP) {
          const aOk = prevT <= d.tMax;
          const bOk = t <= d.tMax;
          if (aOk && bOk) segs.push([prevP.x, prevP.y, p.x, p.y]);
          else if (aOk !== bOk && Number.isFinite(prevT) && Number.isFinite(t)) {
            const f = (d.tMax - prevT) / (t - prevT);
            const x = aOk ? prevP.x + (p.x - prevP.x) * f : p.x + (prevP.x - p.x) * (1 - f);
            const y = aOk ? prevP.y + (p.y - prevP.y) * f : p.y + (prevP.y - p.y) * (1 - f);
            if (aOk) segs.push([prevP.x, prevP.y, x, y]);
            else segs.push([x, y, p.x, p.y]);
            if (d.bred[i]) front.push([x, y]);
          }
        }
        prevP = p;
        prevT = t;
      }
    }
    const strek = (segs: Array<[number, number, number, number]>, w: number, col: string) => {
      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (const [x0, y0, x1, y1] of segs) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    };
    // streams and power lines thin, paths and roads with a white casing on top
    strek(smale, 2, 'rgba(109,40,217,0.75)');
    strek(brede, 5, 'rgba(255,255,255,0.9)');
    strek(brede, 3, '#6d28d9');
    const r = front.length > 60 ? 4 : 5.5;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#fde047';
    for (const [x, y] of front) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

export function divIkon(html: string, className: string, size?: [number, number]): L.DivIcon {
  return L.divIcon({ html, className, iconSize: size ?? undefined, iconAnchor: size ? [size[0] / 2, size[1] / 2] : undefined });
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

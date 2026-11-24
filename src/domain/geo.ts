import type { LatLng } from './coords';
import { pointScale, toUtm, type UtmZone } from './utm';

const A = 6378137;
const F = 1 / 298.257223563;
const B = A * (1 - F);
const RAD = Math.PI / 180;

/**
 * Geodesic distance on the WGS 84 ellipsoid (Vincenty's inverse formula), in metres.
 * Falls back to a spherical estimate for nearly antipodal points.
 */
export function distanceM(p: LatLng, q: LatLng): number {
  const L = (q.lng - p.lng) * RAD;
  const U1 = Math.atan((1 - F) * Math.tan(p.lat * RAD));
  const U2 = Math.atan((1 - F) * Math.tan(q.lat * RAD));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  let lambda = L;
  for (let i = 0; i < 200; i++) {
    const sinL = Math.sin(lambda);
    const cosL = Math.cos(lambda);
    const sinSigma = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinSigma === 0) return 0;
    const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    const sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma;
    const cos2Alpha = 1 - sinAlpha * sinAlpha;
    const cos2SigmaM = cos2Alpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha : 0;
    const C = (F / 16) * cos2Alpha * (4 + F * (4 - 3 * cos2Alpha));
    const prev = lambda;
    lambda =
      L +
      (1 - C) *
        F *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
    if (Math.abs(lambda - prev) < 1e-12) {
      const u2 = (cos2Alpha * (A * A - B * B)) / (B * B);
      const AA = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
      const BB = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
      const dSigma =
        BB *
        sinSigma *
        (cos2SigmaM +
          (BB / 4) *
            (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
              (BB / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
      return B * AA * (sigma - dSigma);
    }
  }
  // no convergence: haversine on the mean sphere
  const R = 6371008.8;
  const dLat = (q.lat - p.lat) * RAD;
  const dLng = (q.lng - p.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * RAD) * Math.cos(q.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of a polyline in metres. */
export function lengthM(pts: LatLng[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += distanceM(pts[i - 1], pts[i]);
  return s;
}

/** Planar shoelace area of a ring given in projected metres (always positive). */
export function shoelace(xy: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    s += (xy[j][0] + xy[i][0]) * (xy[j][1] - xy[i][1]);
  }
  return Math.abs(s) / 2;
}

/**
 * The ring counter-clockwise (lng = x, lat = y), as KML and GeoJSON (RFC 7946) expect for
 * outer rings. Generated teiger run clockwise; drawn ones can go either way.
 */
export function motUrviser(ring: LatLng[]): LatLng[] {
  let s = 0;
  // Σ (x₂ − x₁)(y₂ + y₁) over the edges is positive for a clockwise ring
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[i].lng - ring[j].lng) * (ring[i].lat + ring[j].lat);
  return s > 0 ? ring.slice().reverse() : ring;
}

/**
 * True ground area of a polygon (m²). Projects to UTM, takes the planar area and
 * divides by the squared point scale factor at the centroid.
 */
export function areaM2(ring: LatLng[], zone?: UtmZone): number {
  if (ring.length < 3) return 0;
  const z = zone ?? toUtm(ring[0].lat, ring[0].lng).zone;
  const xy = ring.map((p) => {
    const u = toUtm(p.lat, p.lng, z);
    return [u.e, u.n] as [number, number];
  });
  const c = ring.reduce((a, p) => ({ lat: a.lat + p.lat / ring.length, lng: a.lng + p.lng / ring.length }), {
    lat: 0,
    lng: 0,
  });
  const k = pointScale(c.lat, c.lng, z);
  return shoelace(xy) / (k * k);
}

/** Point in polygon (even–odd rule) for projected coordinates. */
export function pointInRing(x: number, y: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from point to segment in projected metres. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

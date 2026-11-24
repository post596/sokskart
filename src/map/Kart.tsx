import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { useEffect, useRef } from 'react';
import { teigAkkPod } from '../domain/aksjon';
import type { LatLng } from '../domain/coords';
import { formatLatLonUtm, toUtm } from '../domain/utm';
import { TEIGFARGER, teigfarge } from '../domain/pod';
import { LINJETYPE_FARGE, LINJETYPE_NAVN } from '../model/typer';
import { KARTLAG } from '../services/kartfliser';
import { VEKTOR_ATTRIBUSJON } from '../services/vektorfliser';
import { mixRinger, standardVisning } from '../state/beregning';
import { endreTeigRing, leggTilPunkt, leggTilTeig } from '../state/handlinger';
import { kvalitetssikring } from '../domain/kvalitet';
import { SPORRESSURSER } from '../data/modellantakelser';
import { useStore, type Valgt } from '../state/store';
import { fmtAvstand, fmtTimer } from '../ui/format';
import { poiTittel } from '../ui/Poiforslag';
import { divIkon, esc, lagCanvasOverlay, Rekkeviddelinjer, tegnGangtid, tegnSannsynlighet } from './lag';
import { naermesteLinje, type PlukkLinje, type Px } from './linjeplukk';

const RINGFARGER = ['#7f1d1d', '#b91c1c', '#ea580c', '#a16207'];
const PUNKTFARGE = {
  obs: { sikker: '#7f1d1d', sannsynlig: '#dc2626', mulig: '#d97706', usikker: '#6b7280' },
  sp: '#0f766e',
  poi: '#7c3aed',
  funn: '#0369a1',
} as const;

const toLL = (p: LatLng): L.LatLngTuple => [p.lat, p.lng];

/**
 * Click on a map object: select it (card over the map). While placing something (modus)
 * the click is left to the map, so drawing and placing are not disturbed.
 */
function velg(e: L.LeafletEvent, v: Valgt): void {
  const s = useStore.getState();
  if (s.modus || s.redigererTeig) return;
  L.DomEvent.stopPropagation(e as L.LeafletMouseEvent);
  s.set({ valgt: v });
}

/**
 * The ledelinje nearest to a click (in pixels), also when lines are hidden or lie under a teig
 * polygon, so a tap on the path in the base map selects it.
 */
function plukkLinje(map: L.Map, ll: L.LatLng): string | null {
  const s = useStore.getState();
  const grov = window.matchMedia?.('(pointer: coarse)').matches;
  const b = map.getBounds().pad(0.1);
  const linjer: PlukkLinje[] = [];
  const legg = (id: string, pts: LatLng[]) => {
    let s0 = 90;
    let n0 = -90;
    let w0 = 180;
    let e0 = -180;
    for (const q of pts) {
      s0 = Math.min(s0, q.lat);
      n0 = Math.max(n0, q.lat);
      w0 = Math.min(w0, q.lng);
      e0 = Math.max(e0, q.lng);
    }
    if (!b.intersects(L.latLngBounds([s0, w0], [n0, e0]))) return;
    linjer.push({ id, pts: pts.map((q) => { const c = map.latLngToContainerPoint([q.lat, q.lng]); return [c.x, c.y] as Px; }) });
  };
  const ider = new Set<string>();
  for (const l of s.osm?.linjer ?? []) {
    legg(l.id, l.pts);
    ider.add(l.id);
  }
  for (const [id, st] of Object.entries(s.aksjon.linjestatus)) if (!ider.has(id)) legg(id, st.pts);
  const p = map.latLngToContainerPoint(ll);
  return naermesteLinje([p.x, p.y], linjer, grov ? 14 : 7)?.id ?? null;
}

export function Kart() {
  const el = useRef<HTMLDivElement>(null);
  const coordRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const grupper = useRef<Record<string, L.LayerGroup>>({});
  const grunn = useRef<L.TileLayer | null>(null);
  const sann = useRef<{ layer: L.Layer; canvas: HTMLCanvasElement; merc: unknown } | null>(null);
  const gang = useRef<{ layer: L.Layer; canvas: HTMLCanvasElement; merc: unknown } | null>(null);
  const rekk = useRef<Rekkeviddelinjer | null>(null);
  const teigLag = useRef<Map<string, L.Polygon>>(new Map());
  const redigerer = useRef<string | null>(null);
  const linjeRenderer = useRef<L.Canvas | null>(null);

  const aksjon = useStore((s) => s.aksjon);
  const statistikk = useStore((s) => s.statistikk);
  const resultat = useStore((s) => s.resultat);
  const osm = useStore((s) => s.osm);
  const visning = useStore((s) => s.visning);
  const grunnkart = useStore((s) => s.grunnkart);
  const modus = useStore((s) => s.modus);
  const fokus = useStore((s) => s.fokus);
  const visningTimer = useStore((s) => s.visningTimer);
  const naa = useStore((s) => s.naa);
  const egenpos = useStore((s) => s.egenposisjon);
  const valgtTeig = useStore((s) => s.valgtTeig);
  const redigererTeig = useStore((s) => s.redigererTeig);
  const visKvalitet = useStore((s) => s.visKvalitet);
  const teigforslag = useStore((s) => s.teigforslag);
  const fane = useStore((s) => s.fane);
  const droneforslag = useStore((s) => s.droneforslag);
  const valgt = useStore((s) => s.valgt);

  // ------------------------------------------------------------ init
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const a = useStore.getState().aksjon;
    const map = L.map(el.current, {
      center: a.ipp ? toLL(a.ipp) : [64.5, 13],
      zoom: a.ipp ? 13 : 5,
      zoomControl: true,
      preferCanvas: false,
    });
    mapRef.current = map;
    const panes: Array<[string, number]> = [
      ['sannsynlighet', 350],
      ['gangtid', 360],
      ['linjer', 390],
      ['rekkevidde', 395],
      ['teiger', 405],
      ['valgt', 415],
      ['ringer', 420],
    ];
    for (const [p, z] of panes) {
      map.createPane(p);
      map.getPane(p)!.style.zIndex = String(z);
      if (p !== 'teiger') map.getPane(p)!.style.pointerEvents = p === 'linjer' ? 'auto' : 'none';
    }
    const grov = window.matchMedia?.('(pointer: coarse)').matches;
    // thin lines must be easy to tap: the canvas renderer hit-tests within `tolerance` px
    linjeRenderer.current = L.canvas({ pane: 'linjer', padding: 0.3, tolerance: grov ? 12 : 5 });
    for (const g of ['ringer', 'alleLinjer', 'spor', 'topp', 'sjekket', 'teigforslag', 'teiger', 'ks', 'plan', 'etterretning', 'punkter', 'valgt', 'egen']) {
      grupper.current[g] = L.layerGroup().addTo(map);
    }
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    rekk.current = new Rekkeviddelinjer();

    try {
      (map.pm as unknown as { setLang: (l: string) => void }).setLang('no');
    } catch {
      /* language not available */
    }
    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15, allowSelfIntersection: false } as L.PM.GlobalOptions);

    const visKoord = (ll: L.LatLng) => {
      if (coordRef.current) {
        const sone = useStore.getState().aksjon.sone;
        coordRef.current.textContent = `UTM ${formatLatLonUtm(ll.lat, ll.lng, sone)}`;
      }
    };
    if (grov) map.on('move', () => visKoord(map.getCenter()));
    else map.on('mousemove', (e: L.LeafletMouseEvent) => visKoord(e.latlng));
    visKoord(map.getCenter());

    map.on('click', (e: L.LeafletMouseEvent) => {
      const s = useStore.getState();
      const m = s.modus;
      const pos = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (m?.type === 'ipp') void s.settIpp(pos);
      else if (m?.type === 'punkt') {
        if (m.hurtig) s.set({ modus: null, nyttPunkt: { pos } });
        else {
          const id = leggTilPunkt(pos);
          s.melding(`${id} er lagt til.`, 'ok');
        }
      } else if (!m && !s.redigererTeig) {
        // a click that missed the drawn objects: nearest ledelinje within a few pixels, else deselect
        const id = plukkLinje(map, e.latlng);
        s.set({ valgt: id ? { type: 'linje', id } : null });
      }
    });
    // right-click, or long-press on touch screens: new point here (funn, observasjon, …)
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      const s = useStore.getState();
      if (s.modus || s.redigererTeig) return;
      e.originalEvent?.preventDefault?.();
      s.set({ nyttPunkt: { pos: { lat: e.latlng.lat, lng: e.latlng.lng } } });
    });
    map.on('pm:create', (e: { layer: L.Layer }) => {
      const s = useStore.getState();
      const m = s.modus;
      const poly = e.layer as L.Polygon;
      const ll = (poly.getLatLngs()[0] as L.LatLng[]).map((p) => ({ lat: p.lat, lng: p.lng }));
      poly.remove();
      if (m?.type === 'teig' && ll.length >= 3) {
        const id = leggTilTeig(ll, m.avgrensning);
        s.melding(`${id} er tegnet. Registrer status og søk i fanen Teiger.`, 'ok');
      } else s.set({ modus: null });
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ------------------------------------------------------------ base map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const def = KARTLAG.find((k) => k.id === grunnkart) ?? KARTLAG[0];
    grunn.current?.remove();
    let feil = 0;
    let varslet = false;
    const t = L.tileLayer(def.url, { maxZoom: def.maxZoom, attribution: def.attribution, crossOrigin: true });
    t.on('tileerror', () => {
      feil++;
      if (feil >= 6 && !varslet) {
        varslet = true;
        useStore
          .getState()
          .melding(`Kartflisene fra ${def.navn} lastes ikke (ingen nett eller tjenesten svarer ikke). Bytt grunnkart, eller last ned kart for området på forhånd.`, 'feil');
      }
    });
    t.on('tileload', () => {
      feil = 0;
    });
    t.addTo(map);
    grunn.current = t;
  }, [grunnkart]);

  // ------------------------------------------------------------ IPP and rings (all map layers)
  useEffect(() => {
    const g = grupper.current.ringer;
    if (!g) return;
    g.clearLayers();
    const ipp = aksjon.ipp;
    if (!ipp) return;
    const R = resultat?.ringer ?? mixRinger();
    const navn = ['R25', 'R50', 'R75', 'R95'];
    R?.forEach((r, i) => {
      L.circle(toLL(ipp), {
        radius: r,
        color: RINGFARGER[i],
        weight: 2.5,
        fill: false,
        dashArray: i === 3 ? '10 7' : undefined,
        interactive: false,
        pane: 'ringer',
      }).addTo(g);
      L.marker([ipp.lat + r / 110540, ipp.lng], {
        icon: divIkon(`<span>${navn[i]} · ${fmtAvstand(r)}</span>`, 'ringetikett'),
        interactive: false,
        pane: 'ringer',
      }).addTo(g);
    });
    // straight-line reach (prototype): speed × min(time, mobility) × effective progress
    if (resultat && aksjon.sistSett) {
      const t = (naa - new Date(aksjon.sistSett).getTime()) / 3.6e6;
      if (t > 0) {
        const r = resultat.fart.v * Math.min(t, resultat.fart.mob) * aksjon.modell.effektivFremdrift * 1000;
        L.circle(toLL(ipp), { radius: r, color: '#334155', weight: 1.5, dashArray: '2 7', fill: false, interactive: false, pane: 'ringer' }).addTo(g);
        L.marker([ipp.lat - r / 110540, ipp.lng], {
          icon: divIkon(`<span>Mulig rekkevidde i rett linje ${fmtAvstand(r)}</span>`, 'ringetikett svak'),
          interactive: false,
          pane: 'ringer',
        }).addTo(g);
      }
    }
    L.marker(toLL(ipp), { icon: divIkon('IPP', 'ipp-ikon', [38, 38]), zIndexOffset: 1000 })
      .bindTooltip(`IPP ${formatLatLonUtm(ipp.lat, ipp.lng, aksjon.sone)}`, { direction: 'top', offset: [0, -16] })
      .addTo(g);
  }, [aksjon.ipp, aksjon.sone, aksjon.sistSett, aksjon.modell.effektivFremdrift, resultat, statistikk, aksjon.kategorier, aksjon.terreng, naa]);

  // ------------------------------------------------------------ probability bands
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!resultat || !visning.sannsynlighet || !aksjon.ipp) {
      if (sann.current) {
        sann.current.layer.remove();
        sann.current = null;
      }
      return;
    }
    if (!sann.current || sann.current.merc !== resultat.merc) {
      sann.current?.layer.remove();
      const o = lagCanvasOverlay(resultat.merc, 'sannsynlighet');
      sann.current = { ...o, merc: resultat.merc };
      o.layer.addTo(map);
    }
    tegnSannsynlighet(sann.current.canvas, resultat.merc, resultat.band);
  }, [resultat, visning.sannsynlighet, aksjon.ipp]);

  // ------------------------------------------------------------ walking time («the lines expand»)
  const tVis = visningTimer ?? standardVisning();
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const paa = !!(resultat && visning.gangtid && aksjon.ipp);
    if (!paa) {
      gang.current?.layer.remove();
      gang.current = null;
      rekk.current?.remove();
      return;
    }
    if (!gang.current || gang.current.merc !== resultat!.merc) {
      gang.current?.layer.remove();
      const o = lagCanvasOverlay(resultat!.merc, 'gangtid');
      gang.current = { ...o, merc: resultat!.merc };
      o.layer.addTo(map);
    }
    tegnGangtid(gang.current.canvas, resultat!.merc, resultat!.T1, resultat!.fart.v, tVis);
    if (rekk.current) {
      if (!map.hasLayer(rekk.current)) rekk.current.addTo(map);
      rekk.current.settData(
        osm && osm.linjer.length + 1 === resultat!.linjeStart.length
          ? {
              linjer: osm.linjer.map((l) => l.pts),
              bred: osm.linjer.map((l) => l.type === 'sti' || l.type === 'traktorvei' || l.type === 'vei'),
              tider: resultat!.linjeTider,
              start: resultat!.linjeStart,
              v: resultat!.fart.v,
              tMax: tVis,
            }
          : null,
      );
    }
  }, [resultat, visning.gangtid, aksjon.ipp, tVis, osm]);

  // ------------------------------------------------------------ attribution for fallback sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !osm) return;
    const tekster = [osm.kilde.includes('OpenFreeMap') ? VEKTOR_ATTRIBUSJON : '', osm.linjer.some((l) => l.kilde === 'turrutebasen') ? 'Turrutebasen © Kartverket' : ''].filter(Boolean);
    for (const t of tekster) map.attributionControl.addAttribution(t);
    return () => {
      for (const t of tekster) map.attributionControl.removeAttribution(t);
    };
  }, [osm]);

  // ------------------------------------------------------------ all ledelinjer
  useEffect(() => {
    const g = grupper.current.alleLinjer;
    if (!g) return;
    g.clearLayers();
    if (!osm || !visning.alleLedelinjer) return;
    for (const l of osm.linjer) {
      L.polyline(l.pts.map(toLL), {
        color: LINJETYPE_FARGE[l.type],
        weight: l.type === 'vei' ? 3 : 2.2,
        opacity: 0.8,
        dashArray: l.type === 'sti' ? '6 4' : l.type === 'kraft' ? '1 6' : undefined,
        renderer: linjeRenderer.current ?? undefined,
      })
        .bindTooltip(`${LINJETYPE_NAVN[l.type]}${l.navn ? `: ${esc(l.navn)}` : ''}`, { sticky: true })
        .on('click', (e) => velg(e, { type: 'linje', id: l.id }))
        .addTo(g);
    }
  }, [osm, visning.alleLedelinjer]);

  // ------------------------------------------------------------ prioritised ledelinjer (plankart)
  useEffect(() => {
    const g = grupper.current.topp;
    if (!g) return;
    g.clearLayers();
    if (!resultat || !osm || !visning.plankart) return;
    const K = aksjon.modell.antallLedelinjer;
    resultat.linjer.slice(0, K).forEach((li, n) => {
      const l = osm.linjer[li.i];
      if (!l) return;
      const nr = aksjon.lnummer[l.id] ?? '';
      L.polyline(l.pts.map(toLL), { color: '#fde047', weight: 10, opacity: 0.7, interactive: false, renderer: linjeRenderer.current ?? undefined }).addTo(g);
      const pl = L.polyline(l.pts.map(toLL), { color: LINJETYPE_FARGE[l.type], weight: 3.5, renderer: linjeRenderer.current ?? undefined });
      pl.bindTooltip(`${nr} ${LINJETYPE_NAVN[l.type]}${l.navn ? ` «${esc(l.navn)}»` : ''}`, {
        permanent: n < 6 && !aksjon.linjestatus[l.id],
        className: 'linjeetikett',
        direction: 'center',
      });
      pl.on('click', (e) => velg(e, { type: 'linje', id: l.id }));
      pl.addTo(g);
    });
  }, [resultat, osm, visning.plankart, aksjon.lnummer, aksjon.linjestatus, aksjon.modell.antallLedelinjer]);

  // ------------------------------------------------------------ ledelinjer marked as searched (plankart)
  useEffect(() => {
    const g = grupper.current.sjekket;
    if (!g) return;
    g.clearLayers();
    if (!visning.plankart) return;
    for (const [id, st] of Object.entries(aksjon.linjestatus)) {
      const pts = st.pts.map(toLL);
      L.polyline(pts, { color: '#ffffff', weight: 9, opacity: 0.85, interactive: false, renderer: linjeRenderer.current ?? undefined }).addTo(g);
      L.polyline(pts, { color: '#4b5563', weight: 4, dashArray: '8 6', renderer: linjeRenderer.current ?? undefined })
        .bindTooltip(
          `✓ ${esc(st.nr ?? LINJETYPE_NAVN[st.type])}${st.navn ? ` «${esc(st.navn)}»` : ''} – ${st.kilde === 'spor' ? 'søkt (GPS-spor)' : 'ferdig sjekket'}`,
          { permanent: true, direction: 'center', className: 'linjeetikett sjekket' },
        )
        .on('click', (e) => velg(e, { type: 'linje', id }))
        .addTo(g);
    }
  }, [aksjon.linjestatus, visning.plankart]);

  // ------------------------------------------------------------ highlight of the selected object
  useEffect(() => {
    const g = grupper.current.valgt;
    if (!g) return;
    g.clearLayers();
    if (!valgt) return;
    if (valgt.type === 'linje') {
      const pts = osm?.linjer.find((l) => l.id === valgt.id)?.pts ?? aksjon.linjestatus[valgt.id]?.pts;
      // own pane above the reach lines and teiger, so the selection is always visible
      if (pts) {
        L.polyline(pts.map(toLL), { color: '#ffffff', weight: 13, opacity: 0.95, interactive: false, pane: 'valgt' }).addTo(g);
        L.polyline(pts.map(toLL), { color: '#0284c7', weight: 6, opacity: 1, interactive: false, pane: 'valgt' }).addTo(g);
      }
    } else {
      const pos =
        valgt.type === 'punkt' ? aksjon.punkter.find((p) => p.id === valgt.id)?.pos : resultat?.poiforslag.find((p) => p.id === valgt.id)?.pos;
      if (pos) L.circleMarker(toLL(pos), { radius: 22, color: '#0284c7', weight: 4, fill: false, interactive: false, pane: 'valgt' }).addTo(g);
    }
  }, [valgt, osm, aksjon.linjestatus, aksjon.punkter, resultat]);

  // ------------------------------------------------------------ teiger
  useEffect(() => {
    const map = mapRef.current;
    const g = grupper.current.teiger;
    if (!map || !g) return;
    // finishing an edit: save the geometry before redrawing
    if (redigerer.current && redigerer.current !== redigererTeig) {
      const lay = teigLag.current.get(redigerer.current);
      if (lay) {
        lay.pm.disable();
        const ll = (lay.getLatLngs()[0] as L.LatLng[]).map((p) => ({ lat: p.lat, lng: p.lng }));
        const id = redigerer.current;
        redigerer.current = null;
        endreTeigRing(id, ll);
        return;
      }
      redigerer.current = null;
    }
    g.clearLayers();
    teigLag.current.clear();
    const visPlan = visning.plankart;
    const visRes = visning.resultatkart;
    for (const t of aksjon.teiger) {
      const pods = t.sok.map((s) => s.pod);
      const f = teigfarge(t.status, pods);
      const sokt = pods.length > 0;
      if ((sokt && !visRes && !visPlan) || (!sokt && !visPlan)) continue;
      const col = TEIGFARGER[f];
      const valgt = t.id === valgtTeig;
      const poly = L.polygon(t.ring.map(toLL), {
        color: col,
        weight: valgt ? 4.5 : 2.8,
        fillColor: col,
        fillOpacity: valgt ? 0.22 : 0.12,
        pane: 'teiger',
        dashArray: t.type === 'T' ? undefined : '8 5',
      });
      const akk = teigAkkPod(t);
      poly.bindTooltip(`${t.id}${sokt ? ` · ${Math.round(akk * 100)} %` : ''}`, { permanent: true, direction: 'center', className: 'teigetikett' });
      poly.on('click', (e) => {
        const s = useStore.getState();
        // while placing or drawing, the click belongs to the map (a point may be placed inside a teig)
        if (s.modus || s.redigererTeig) return;
        L.DomEvent.stopPropagation(e);
        // a ledelinje inside the teig wins when the click is right on it
        const linje = plukkLinje(map, e.latlng);
        if (linje) s.set({ valgt: { type: 'linje', id: linje } });
        else s.set({ valgtTeig: t.id, fane: 'teiger' });
      });
      poly.addTo(g);
      teigLag.current.set(t.id, poly);
      if (t.id === redigererTeig) {
        poly.pm.enable({ allowSelfIntersection: false, snappable: true });
        redigerer.current = t.id;
      }
    }
  }, [aksjon.teiger, visning.plankart, visning.resultatkart, valgtTeig, redigererTeig]);

  // ------------------------------------------------------------ GPS tracks (resultatkart)
  useEffect(() => {
    const g = grupper.current.spor;
    if (!g) return;
    g.clearLayers();
    if (!visning.resultatkart) return;
    for (const s of aksjon.spor) {
      const r = SPORRESSURSER.find((x) => x.type === s.ressurs);
      L.polyline(s.pts.map(toLL), { color: r?.farge ?? '#dc2626', weight: 3, opacity: 0.9, renderer: linjeRenderer.current ?? undefined })
        .bindTooltip(`${esc(s.navn)} (${r?.navn ?? s.ressurs})`, { sticky: true })
        .addTo(g);
    }
  }, [aksjon.spor, visning.resultatkart]);

  // ------------------------------------------------------------ suggested teiger and drone areas
  useEffect(() => {
    const g = grupper.current.teigforslag;
    if (!g) return;
    g.clearLayers();
    teigforslag.forEach((f, i) => {
      L.polygon(f.ring.map(toLL), { color: '#334155', weight: 2.5, dashArray: '6 5', fillColor: '#64748b', fillOpacity: 0.12, pane: 'teiger' })
        .bindTooltip(`Forslag ${i + 1}`, { permanent: true, direction: 'center', className: 'forslagetikett' })
        .addTo(g);
    });
    droneforslag.forEach((f, i) => {
      L.polygon(f.ring.map(toLL), { color: '#0e7490', weight: 2.5, dashArray: '10 6', fillColor: '#0e7490', fillOpacity: 0.1, pane: 'teiger' })
        .bindTooltip(`Drone ${i + 1}`, { permanent: true, direction: 'center', className: 'forslagetikett' })
        .addTo(g);
    });
  }, [teigforslag, droneforslag]);

  // ------------------------------------------------------------ suggested points of interest (Punkter tab)
  useEffect(() => {
    const g = grupper.current.teigforslag;
    if (!g || fane !== 'punkter' || !resultat) return;
    const lag = L.layerGroup().addTo(g);
    resultat.poiforslag.slice(0, 12).forEach((p, i) => {
      L.marker(toLL(p.pos), { icon: divIkon(`<span>?${i + 1}</span>`, 'poiforslagikon') })
        .bindTooltip(`Forslag ${i + 1}: ${esc(poiTittel(p))}<br>${esc(p.grunnlag.vurder)}`)
        .on('click', (e) => velg(e, { type: 'poiforslag', id: p.id }))
        .addTo(lag);
    });
    return () => {
      lag.remove();
    };
  }, [fane, resultat]);

  // ------------------------------------------------------------ quality assurance highlight
  useEffect(() => {
    const g = grupper.current.ks;
    if (!g) return;
    g.clearLayers();
    if (!visKvalitet || !aksjon.ipp || !resultat) return;
    const zone = resultat.grid.zone;
    const xy = (p: LatLng): [number, number] => {
      const u = toUtm(p.lat, p.lng, zone);
      return [u.e, u.n];
    };
    const rap = kvalitetssikring(
      aksjon.teiger.map((t) => ({ id: t.id, ring: t.ring.map(xy), akkPod: teigAkkPod(t), poa: resultat.teiger.find((x) => x.id === t.id)?.poaNa ?? 0 })),
      xy(aksjon.ipp),
      resultat.ringer[1],
      resultat.ringer[2],
    );
    for (const k of rap.ikkeOppfylt) {
      const t = aksjon.teiger.find((x) => x.id === k.id);
      if (!t) continue;
      L.polygon(t.ring.map(toLL), { color: '#b91c1c', weight: 6, dashArray: '4 6', fill: false, pane: 'teiger', interactive: false }).addTo(g);
    }
  }, [visKvalitet, aksjon.teiger, aksjon.ipp, resultat]);

  // ------------------------------------------------------------ drawing mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (modus?.type === 'teig') {
      const col = '#1d4ed8';
      map.pm.enableDraw('Polygon', { snappable: true, finishOn: 'dblclick', templineStyle: { color: col }, hintlineStyle: { color: col, dashArray: '5 5' }, pathOptions: { color: col } } as L.PM.DrawModeOptions);
      map.doubleClickZoom.disable();
    } else {
      map.pm.disableDraw();
      map.doubleClickZoom.enable();
    }
    map.getContainer().classList.toggle('sikte', !!modus);
  }, [modus]);

  // ------------------------------------------------------------ points: plankart (SP, R) and etterretningskart (OBS, F)
  useEffect(() => {
    const plan = grupper.current.plan;
    const ett = grupper.current.etterretning;
    if (!plan || !ett) return;
    plan.clearLayers();
    ett.clearLayers();
    for (const p of aksjon.punkter) {
      const erEtt = p.type === 'obs' || p.type === 'funn';
      if (erEtt ? !visning.etterretningskart : !visning.plankart) continue;
      const col = p.type === 'obs' ? PUNKTFARGE.obs[p.klasse] : PUNKTFARGE[p.type];
      const m = L.marker(toLL(p.pos), {
        icon: divIkon(`<span style="background:${col}">${p.sjekket ? '✓ ' : ''}${esc(p.id)}</span>`, `punktikon${p.sjekket ? ' sjekket' : ''}`),
      }).bindTooltip(
        `${esc(p.id)}${erEtt ? ` (${p.klasse})` : ''}${p.tekst ? ` – ${esc(p.tekst)}` : ''}${p.sjekket ? '<br>✓ Ferdig sjekket' : ''}<br>${formatLatLonUtm(p.pos.lat, p.pos.lng, aksjon.sone)}`,
      );
      m.on('click', (e) => velg(e, { type: 'punkt', id: p.id }));
      m.addTo(erEtt ? ett : plan);
    }
  }, [aksjon.punkter, aksjon.sone, visning.plankart, visning.etterretningskart]);

  // ------------------------------------------------------------ most probable points
  useEffect(() => {
    const g = grupper.current.punkter;
    if (!g) return;
    g.clearLayers();
    if (!resultat || !visning.plankart) return;
    resultat.punkter.forEach((p, n) => {
      L.marker(toLL(p.pos), { icon: divIkon(String(n + 1), 'toppunkt', [28, 28]) })
        .bindTooltip(
          `Punkt ${n + 1}: ${formatLatLonUtm(p.pos.lat, p.pos.lng, aksjon.sone)}<br>${fmtAvstand(p.avstandM)} fra IPP${p.timer != null ? ` · gangtid ${fmtTimer(p.timer)}` : ''}`,
        )
        .addTo(g);
    });
  }, [resultat, visning.plankart, aksjon.sone]);


  // ------------------------------------------------------------ own position
  useEffect(() => {
    const g = grupper.current.egen;
    if (!g) return;
    g.clearLayers();
    if (!egenpos) return;
    L.circle(toLL(egenpos.pos), { radius: egenpos.noyaktighet, color: '#2563eb', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(g);
    L.marker(toLL(egenpos.pos), { icon: divIkon('', 'egenpos', [18, 18]) })
      .bindTooltip(`Min posisjon ${formatLatLonUtm(egenpos.pos.lat, egenpos.pos.lng, aksjon.sone)} (±${Math.round(egenpos.noyaktighet)} m)`)
      .addTo(g);
  }, [egenpos, aksjon.sone]);

  // ------------------------------------------------------------ focus requests
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fokus) return;
    if ('bounds' in fokus) {
      if (fokus.bounds.length) map.fitBounds(L.latLngBounds(fokus.bounds.map(toLL)), { padding: [40, 40], maxZoom: 16 });
    } else map.setView(toLL(fokus.pos), fokus.zoom ?? Math.max(map.getZoom(), 14));
  }, [fokus]);

  // zoom to the IPP the first time it is set
  const harIpp = !!aksjon.ipp;
  useEffect(() => {
    const map = mapRef.current;
    const ipp = useStore.getState().aksjon.ipp;
    if (!map || !ipp) return;
    const R = mixRinger();
    const r = R ? R[2] * 1.3 : 3000;
    map.fitBounds(L.latLng(ipp.lat, ipp.lng).toBounds(r * 2), { padding: [20, 20] });
  }, [harIpp]);

  return (
    <div className="kartomrade">
      <div ref={el} className="kart" role="application" aria-label="Kart" />
      <div ref={coordRef} className="koordinat mono" aria-live="off" />
      <div className="sentrumskors" aria-hidden="true" />
      {aksjon.ipp && !modus && (
        <button
          type="button"
          className="knapp kartknapp"
          title="Nytt punkt: funn, observasjon/etterretning, sperrepost eller interessepunkt. Du kan også høyreklikke eller holde fingeren på kartet."
          onClick={() => useStore.getState().set({ modus: { type: 'punkt', hurtig: true }, valgt: null })}
        >
          + Punkt
        </button>
      )}
    </div>
  );
}

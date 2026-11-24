import { useStore, vedNullstilling } from '../state/store';

/**
 * The device's own position (GPS), shown in the map. Kept outside React so «Start på nytt»
 * can stop it.
 */
let watch: number | null = null;

export const posisjonAktiv = () => watch != null;

export function stoppPosisjon(): void {
  if (watch != null && typeof navigator !== 'undefined' && 'geolocation' in navigator) navigator.geolocation.clearWatch(watch);
  watch = null;
  if (useStore.getState().egenposisjon) useStore.getState().set({ egenposisjon: null });
}
vedNullstilling(stoppPosisjon);

export function startPosisjon(): void {
  if (watch != null) return;
  if (!('geolocation' in navigator)) {
    useStore.getState().melding('Denne enheten kan ikke gi posisjon.', 'feil');
    return;
  }
  let forste = true;
  watch = navigator.geolocation.watchPosition(
    (p) => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      useStore.getState().set({ egenposisjon: { pos, noyaktighet: p.coords.accuracy, tid: p.timestamp } });
      if (forste) {
        forste = false;
        useStore.getState().vis({ pos, zoom: 15 });
      }
    },
    (e) => {
      useStore.getState().melding(`Fikk ikke posisjon: ${e.message}`, 'feil');
      stoppPosisjon();
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
  );
}

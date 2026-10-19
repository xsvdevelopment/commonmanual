import { useEffect, useState } from 'react';

export async function api(path, opts) {
  const res = await fetch('/api' + path, opts);
  // The service worker marks answers it served from this device's saved copy.
  if (res.headers.get('X-CommonManual-Offline')) dispatchEvent(new Event('openbay:offline'));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { body });
  return body;
}

export const qs = (o) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString();

// Fetch-on-change hook: { data, error, loading }.
export function useApi(path) {
  const [state, set] = useState({ data: null, error: null, loading: !!path });
  useEffect(() => {
    if (!path) return set({ data: null, error: null, loading: false });
    let live = true;
    set((s) => ({ ...s, loading: true, error: null }));
    api(path)
      .then((data) => live && set({ data, error: null, loading: false }))
      .catch((error) => live && set({ data: null, error, loading: false }));
    return () => { live = false; };
  }, [path]);
  return state;
}

// Hash routing: #/v/2013/FORD/F-150%20SUPER%20CREW
export function useRoute() {
  const read = () => {
    const [p, query = ''] = location.hash.replace(/^#/, '').split('?');
    return { parts: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(query) };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (...parts) => { location.hash = '/' + parts.map(encodeURIComponent).join('/'); };
export const vehicleHref = (year, make, model) =>
  '#/v/' + [year, make, model || '_'].map(encodeURIComponent).join('/');

// True while the browser is offline or the last answer came from the saved copy.
export function useOffline() {
  const [off, setOff] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  useEffect(() => {
    const down = () => setOff(true);
    const up = () => setOff(false);
    addEventListener('offline', down);
    addEventListener('openbay:offline', down);
    addEventListener('online', up);
    return () => { removeEventListener('offline', down); removeEventListener('openbay:offline', down); removeEventListener('online', up); };
  }, []);
  return off;
}

// Everything a vehicle page can show, fetched once so the service worker keeps a copy.
export const vehicleEndpoints = ({ year, make, model }) => [
  `/kb?${qs({ year, make, model })}`,
  `/oem?${qs({ make })}`,
  ...(model ? ['recalls', 'complaints', 'bulletins', 'epa'].map((k) => `/vehicle/${k}?${qs({ year, make, model })}`) : [`/models?${qs({ year, make })}`]),
];

export function usePref(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s === null ? initial : JSON.parse(s); } catch { return initial; }
  });
  const set = (x) => { setV(x); try { localStorage.setItem(key, JSON.stringify(x)); } catch {} };
  return [v, set];
}

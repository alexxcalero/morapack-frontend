const BASE = "https://1inf54-981-5e.inf.pucp.edu.pe";
const ENDPOINT = `${BASE}/api/planesDeVuelo/obtenerTodos`;

let _cache = null;
let _lastFetch = 0;
const TTL = 30_000;

export async function fetchVuelos({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache && (now - _lastFetch) < TTL) {
    return _cache;
  }
  const res = await fetch(ENDPOINT);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fetchVuelos ${res.status} ${text}`);
  }
  const data = await res.json();
  _cache = Array.isArray(data) ? data : [];
  _lastFetch = Date.now();
  return _cache;
}

export function getCachedFlights() {
  return _cache || [];
}

export function clearFlightsCache() {
  _cache = null;
  _lastFetch = 0;
}

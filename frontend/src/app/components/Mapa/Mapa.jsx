"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import HoraActual from "./HoraActual";
import SimulationControls from "./SimulationControls";
import { subscribe, getSimMs } from "../../../lib/simTime";
import { fetchVuelos, getCachedFlights } from "../../../lib/vuelos";
import { Plane } from "lucide-react";
import ReactDOMServer from "react-dom/server";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const iconUrls = {
  red: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  blue: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  green: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  violet: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png",
  orange: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
};

const BlueIcon = L.icon({ iconUrl: iconUrls.blue, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
const GreenIcon = L.icon({ iconUrl: iconUrls.green, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
const OrangeIcon = L.icon({ iconUrl: iconUrls.orange, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
const RedIcon = L.icon({ iconUrl: iconUrls.red, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
const UnknownIcon = L.icon({ iconUrl: iconUrls.violet, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });

function parseDMSString(s) {
  if (!s) return NaN;
  const parts = String(s).trim().split(/[-\s:°"’'′]+/).filter(Boolean);
  const deg = parseFloat(parts[0] || 0) || 0;
  const min = parseFloat(parts[1] || 0) || 0;
  const sec = parseFloat(parts[2] || 0) || 0;
  return Math.abs(deg) + min / 60 + sec / 3600;
}
function containsDirectionLetter(str) { if (!str) return null; const m = String(str).match(/[NnSsEeWw]/); return m ? m[0].toUpperCase() : null; }
const southCountries = new Set(["peru", "perú", "chile", "argentina", "uruguay", "paraguay", "bolivia", "brasil", "brazil", "ecuador"]);
function normalizeCountryName(name) { if (!name) return ""; return String(name).trim().toLowerCase(); }

function parseCoord(raw, { isLat = false, airport = null } = {}) {
  if (raw == null) return NaN;
  const str = String(raw).trim();
  const dir = containsDirectionLetter(str);
  if (dir) {
    const cleaned = str.replace(/[NnSsEeWw]/g, "").trim();
    const isDMS = /[0-9]+[-\s:]+[0-9]+/.test(cleaned);
    const value = isDMS ? parseDMSString(cleaned) : parseFloat(cleaned.replace(",", "."));
    if (Number.isNaN(value)) return NaN;
    return (dir === "S" || dir === "W") ? -Math.abs(value) : Math.abs(value);
  }
  const maybeNumeric = parseFloat(str.replace(",", "."));
  const looksLikePlainNumber = /^[+\-]?\d+(\.\d+)?$/.test(str.replace(",", "."));
  if (!Number.isNaN(maybeNumeric) && looksLikePlainNumber) {
    const hasSign = /^[+\-]/.test(str.trim());
    if (hasSign) return maybeNumeric;
    const countryName = normalizeCountryName(airport?.pais?.nombre ?? airport?.country ?? "");
    const continentId = airport?.pais?.continente?.id ?? airport?.continentId ?? null;
    if (!isLat) {
      if (continentId === 1 || String(countryName).includes("america")) return -Math.abs(maybeNumeric);
      return maybeNumeric;
    }
    if (isLat) {
      if (southCountries.has(countryName)) return -Math.abs(maybeNumeric);
      return maybeNumeric;
    }
  }
  if (/[0-9]+-[0-9]+(-[0-9]+)?/.test(str) || /[0-9]+\s+[0-9]+/.test(str)) {
    const dec = parseDMSString(str);
    if (Number.isNaN(dec)) return NaN;
    const countryName = normalizeCountryName(airport?.pais?.nombre ?? airport?.country ?? "");
    if (!isLat) {
      if (airport?.pais?.continente?.id === 1 || String(countryName).includes("america")) return -Math.abs(dec);
      return dec;
    } else {
      if (southCountries.has(countryName)) return -Math.abs(dec);
      return dec;
    }
  }
  const cleaned = str.replace(/[^\d\-\+.,]/g, "").replace(",", "."), pf = parseFloat(cleaned);
  return Number.isNaN(pf) ? NaN : pf;
}

function parseBackendTime(s) {
  if (!s) return null;
  const t = String(s).trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:Z)?([+\-]?\d+)?$/);
  if (!m) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, datePart, timePart, offStr] = m;
  const off = offStr ? parseInt(offStr, 10) : 0;
  const [y, mo, day] = datePart.split("-").map(x => parseInt(x, 10));
  const [hh, mm, ss] = timePart.split(":").map(x => parseInt(x, 10));
  const utcMillis = Date.UTC(y, mo - 1, day, hh - off, mm, ss);
  return new Date(utcMillis);
}

const planeIconCache = {};
function getPlaneIcon(color) {
  if (planeIconCache[color]) return planeIconCache[color];
  const svgHtml = ReactDOMServer.renderToString(<Plane color={color} size={20} strokeWidth={2.5} />);
  const icon = L.divIcon({ html: svgHtml, className: "", iconAnchor: [10, 10] });
  planeIconCache[color] = icon;
  return icon;
}

export default function Mapa() {
  const mapRef = useRef(null);
  const [rawAirports, setRawAirports] = useState(null);
  const [rawVuelos, setRawVuelos] = useState(null);

  // No inicialices initSim aquí: HoraActual es quien controla startMs.
  // Suscripción global a tiempo de simulación
  const [nowMs, setNowMs] = useState(() => getSimMs());
  useEffect(() => {
    const unsub = subscribe(ms => setNowMs(ms));
    return () => unsub();
  }, []);

  // cargar aeropuertos (unchanged)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/aeropuertos");
        if (!res.ok) throw new Error("fetch aeropuertos " + res.status);
        const data = await res.json();
        if (!mounted) return;
        setRawAirports(data);
        setTimeout(() => {
          if (mapRef.current && Array.isArray(data) && data.length) {
            const pts = data
              .map(a => {
                const lat = parseCoord(a.latitud ?? a.lat ?? a.latitude, { isLat: true, airport: a });
                const lon = parseCoord(a.longitud ?? a.lon ?? a.longitude, { isLat: false, airport: a });
                return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
              })
              .filter(Boolean);
            try { if (pts.length) mapRef.current.fitBounds(pts, { padding: [30, 30] }); } catch (e) { }
          }
        }, 120);
      } catch (err) {
        console.error("fetch aeropuertos:", err);
        if (mounted) setRawAirports([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // cargar vuelos usando fetchVuelos (cache central) y refrescar periódicamente
  useEffect(() => {
    let mounted = true;
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchVuelos({ force: false });
        if (!mounted || cancelled) return;
        setRawVuelos(data);
      } catch (err) {
        console.error("fetchVuelos error:", err);
        if (mounted) setRawVuelos([]);
      }
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => { mounted = false; cancelled = true; clearInterval(iv); };
  }, []);

  const airports = useMemo(() => {
    if (!Array.isArray(rawAirports)) return [];
    return rawAirports.map(a => {
      const lat = parseCoord(a.latitud ?? a.lat ?? a.latitude, { isLat: true, airport: a });
      const lon = parseCoord(a.longitud ?? a.lon ?? a.longitude, { isLat: false, airport: a });
      const capacidadMaxima = a.capacidadMaxima ?? a.capacidad ?? null;
      const capacidadOcupada = a.capacidadOcupada ?? 0;
      const porcentaje = (typeof capacidadMaxima === "number" && capacidadMaxima > 0) ? Math.round((capacidadOcupada / capacidadMaxima) * 100) : null;
      return { id: a.id, codigo: a.codigo ?? a.abreviatura ?? "", ciudad: a.ciudad ?? "", pais: a.pais?.nombre ?? "", lat, lon, capacidadMaxima, capacidadOcupada, porcentaje, raw: a };
    }).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
  }, [rawAirports]);

  const airportsById = useMemo(() => {
    const map = {};
    for (const a of airports) map[a.id] = a;
    return map;
  }, [airports]);

  const vuelos = useMemo(() => {
    if (!Array.isArray(rawVuelos)) return [];
    return rawVuelos.map(p => {
      const origenAirport = p.ciudadOrigen && airportsById[p.ciudadOrigen] ? airportsById[p.ciudadOrigen] : null;
      const destinoAirport = p.ciudadDestino && airportsById[p.ciudadDestino] ? airportsById[p.ciudadDestino] : null;
      const latOrigen = origenAirport ? origenAirport.lat : parseCoord(p.latitudOrigen, { isLat: true, airport: p });
      const lonOrigen = origenAirport ? origenAirport.lon : parseCoord(p.longitudOrigen, { isLat: false, airport: p });
      const latDestino = destinoAirport ? destinoAirport.lat : parseCoord(p.latitudDestino, { isLat: true, airport: p });
      const lonDestino = destinoAirport ? destinoAirport.lon : parseCoord(p.longitudDestino, { isLat: false, airport: p });
      const horaOrigen = parseBackendTime(p.horaOrigen ?? p.horaOrigenStr ?? "") || null;
      const horaDestino = parseBackendTime(p.horaDestino ?? p.horaDestinoStr ?? "") || null;
      return {
        raw: p,
        idTramo: p.idTramo ?? p.id ?? null,
        latOrigen, lonOrigen, latDestino, lonDestino,
        horaOrigen, horaDestino,
        ciudadOrigenId: p.ciudadOrigen, ciudadDestinoId: p.ciudadDestino,
        ciudadOrigenName: origenAirport?.ciudad, ciudadDestinoName: destinoAirport?.ciudad
      };
    }).filter(v =>
      Number.isFinite(v.latOrigen) && Number.isFinite(v.lonOrigen) &&
      Number.isFinite(v.latDestino) && Number.isFinite(v.lonDestino) &&
      v.horaOrigen instanceof Date && !isNaN(v.horaOrigen.getTime()) &&
      v.horaDestino instanceof Date && !isNaN(v.horaDestino.getTime())
    );
  }, [rawVuelos, airportsById]);

  const calcularPosicion = (vuelo, nowMsLocal) => {
    const latA = vuelo.latOrigen; const lonA = vuelo.lonOrigen; const latB = vuelo.latDestino; const lonB = vuelo.lonDestino;
    const inicio = vuelo.horaOrigen; const fin = vuelo.horaDestino;
    const ahora = new Date(nowMsLocal ?? getSimMs());
    const total = fin - inicio;
    if (!isFinite(total) || total === 0) return { lat: latB, lon: lonB, progreso: 1 };
    let t = (ahora - inicio) / total; t = Math.max(0, Math.min(1, t));
    return { lat: latA + (latB - latA) * t, lon: lonA + (lonB - lonA) * t, progreso: t };
  };

  function pickIconAirport(a) {
    const city = String(a.ciudad ?? "").toLowerCase(); const code = String(a.codigo ?? "").toLowerCase();
    if (city.includes("lima") || code === "spim" || code === "spjc") return BlueIcon;
    if (city.includes("brus") || city.includes("brussels") || code.startsWith("eb")) return BlueIcon;
    if (city.includes("baku") || code === "gyd" || code === "ubbb") return BlueIcon;
    const pct = a.porcentaje; if (pct == null) return UnknownIcon; if (pct <= 60) return GreenIcon; if (pct <= 85) return OrangeIcon; return RedIcon;
  }

  const center = airports.length ? [airports[0].lat, airports[0].lon] : [-12.0464, -77.0428];

  return (
    <div style={{ width: "100%", height: "90vh", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 1400, display: "flex", gap: 12, alignItems: "center", pointerEvents: "auto" }}>
        <HoraActual startStr={null} style={{ position: "relative" }} />
        <SimulationControls startStr={null} />
      </div>

      <MapContainer center={center} zoom={airports.length ? 3 : 3} style={{ width: "100%", height: "100%" }}
        whenCreated={(map) => { mapRef.current = map; setTimeout(() => map.invalidateSize(), 50); }}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {airports.map(a => (
          <Marker key={`ap-${a.id}`} position={[a.lat, a.lon]} icon={pickIconAirport(a)}>
            <Popup>
              <div style={{ minWidth: 200 }}>
                <strong>{a.ciudad} {a.codigo ? `— ${a.codigo}` : ""}</strong>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{a.pais}</div>
                <div style={{ marginTop: 8, fontSize: 13 }}><strong>Capacidad:</strong> {a.capacidadMaxima ?? "N/D"}</div>
                <div style={{ marginTop: 4, fontSize: 13 }}><strong>Ocupada:</strong> {a.capacidadOcupada ?? "N/D"}</div>
                <div style={{ marginTop: 6, fontSize: 12 }}>Lat: {a.lat.toFixed(5)}, Lon: {a.lon.toFixed(5)}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {vuelos.map(v => {
          const pos = calcularPosicion(v, nowMs);
          if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;
          const color = pos.progreso < 0.75 ? "#22c55e" : pos.progreso < 1 ? "#f59e0b" : "#ef4444";
          const icono = getPlaneIcon(color);
          return (
            <Marker key={`vu-${v.idTramo}`} position={[pos.lat, pos.lon]} icon={icono}>
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <strong>Vuelo {String(v.idTramo)}</strong><br />
                  {v.ciudadOrigenName || v.ciudadOrigenId} → {v.ciudadDestinoName || v.ciudadDestinoId}<br />
                  Progreso: {(pos.progreso * 100).toFixed(1)}%<br />
                  Inicio: {v.horaOrigen.toISOString()}<br />
                  Fin: {v.horaDestino.toISOString()}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {vuelos.length <= 150 && vuelos.map(v => (
          <Polyline key={`poly-${v.idTramo}`} positions={[[v.latOrigen, v.lonOrigen], [v.latDestino, v.lonDestino]]} weight={1} dashArray="5,6" />
        ))}

      </MapContainer>
    </div>
  );
}

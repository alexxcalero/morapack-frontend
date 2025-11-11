"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import HoraActual from "./HoraActual";
import SimulationControls from "./SimulationControls";
import { subscribe, getSimMs, setSimMs, setSpeed } from "../../../lib/simTime"; // ← añade setSpeed
import { fetchVuelos, getCachedFlights } from "../../../lib/vuelos";
import { Plane, Menu } from "lucide-react";
import ReactDOMServer from "react-dom/server";
import PanelCatalogos from "./PanelCatalogos";
import PanelVueloDetalle from "./PanelVueloDetalle";
import PanelAeropuertoDetalle from "./PanelAeropuertoDetalle";

// URL base del backend (misma usada en SimulationControls)
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

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

// ✅ Parser para "yyyy-MM-dd HH:mm (UTC±hh:mm)"
function parsePlanificadorTime(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  // 2025-01-02 03:00 (UTC+00:00)  | offset opcional
  const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?:\s*\(UTC([+\-]\d{2}):(\d{2})\))?$/);
  if (!m) {
    const d = new Date(t.replace(/\s*\(UTC[^\)]+\)\s*$/, "")); // fallback sin el sufijo
    return isNaN(d.getTime()) ? null : d;
  }
  const [, datePart, hhStr, mmStr, offHStr = "+00", offMStr = "00"] = m;
  const [y, mo, day] = datePart.split("-").map(x => parseInt(x, 10));
  const hh = parseInt(hhStr, 10), mm = parseInt(mmStr, 10);
  const offH = parseInt(offHStr, 10), offM = parseInt(offMStr, 10);
  // Interpretar como hora local del huso y convertir a UTC (restar offset)
  const utcMillis = Date.UTC(y, mo - 1, day, hh - offH, mm - offM, 0);
  return new Date(utcMillis);
}

const planeIconCache = {};
function getPlaneIcon(color, rotation = 0) {
  // Tamaño más grande para facilitar el click
  const iconSize = [44, 44]; // ancho, alto
  const cacheKey = `${color}-${rotation}-${iconSize.join('x')}`;
  if (planeIconCache[cacheKey]) return planeIconCache[cacheKey];

  // El SVG del avión dentro de un "hitbox" circular invisible
  const svgHtml = ReactDOMServer.renderToString(
    <div
      style={{
        width: iconSize[0],
        height: iconSize[1],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: 'pointer',
        // El rotate se aplica al avión, no al hitbox
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          // Fondo transparente que sí recibe el click
          background: 'rgba(0,0,0,0)',
        }}
      />
      <div
        style={{
          transform: `rotate(${rotation}deg)`,
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none' // evita bloquear el click del contenedor
        }}
      >
        <Plane color={color} size={26} strokeWidth={2.4} />
      </div>
    </div>
  );

  const icon = L.divIcon({
    html: svgHtml,
    className: 'plane-icon',
    iconSize,
    iconAnchor: [iconSize[0] / 2, iconSize[1] / 2], // centro
  });
  planeIconCache[cacheKey] = icon;
  return icon;
}

// Función para calcular el ángulo entre dos puntos
function calcularAngulo(latOrigen, lonOrigen, latDestino, lonDestino) {
  const dLon = lonDestino - lonOrigen;
  const y = Math.sin(dLon * Math.PI / 180) * Math.cos(latDestino * Math.PI / 180);
  const x = Math.cos(latOrigen * Math.PI / 180) * Math.sin(latDestino * Math.PI / 180) -
    Math.sin(latOrigen * Math.PI / 180) * Math.cos(latDestino * Math.PI / 180) * Math.cos(dLon * Math.PI / 180);
  let angulo = Math.atan2(y, x) * 180 / Math.PI;
  // Ajustar para que 0° apunte al norte
  angulo = (angulo + 320) % 360;
  return angulo;
}

// ⭐ Curva geodésica (gran círculo) entre dos coordenadas
function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }
function greatCirclePoints(lat1, lon1, lat2, lon2, segments = 64) {
  const φ1 = toRad(lat1), λ1 = toRad(lon1);
  const φ2 = toRad(lat2), λ2 = toRad(lon2); // ✅ FIX: usar lon2, no lonDestino

  const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
  const sinφ2 = Math.sin(φ2), cosφ2 = Math.cos(φ2);
  const Δλ = λ2 - λ1;

  const hav = Math.sin((φ2 - φ1) / 2) ** 2 + cosφ1 * cosφ2 * Math.sin(Δλ / 2) ** 2;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(hav))); // distancia angular

  if (d === 0 || !isFinite(d)) return [[lat1, lon1], [lat2, lon2]];

  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);

    const x = A * cosφ1 * Math.cos(λ1) + B * cosφ2 * Math.cos(λ2);
    const y = A * cosφ1 * Math.sin(λ1) + B * cosφ2 * Math.sin(λ2);
    const z = A * sinφ1 + B * sinφ2;

    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);

    points.push([toDeg(φ), toDeg(λ)]);
  }
  return points;
}

// ⭐ Rumbo desde una posición a otra (0° = Norte, horario)
function calcularRumboActual(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x); // -π..π
  const brng = (toDeg(θ) + 360) % 360; // 0..360, 0=N
  return brng;
}

// Normaliza rotación asegurando rango 0..360
function aplicarOffsetRotacion(heading) {
  return (heading + PLANE_ICON_OFFSET_DEG + 360) % 360;
}

const PLANE_ICON_OFFSET_DEG = -45; // Offset manual (ajústalo): - Si el icono apunta al ESTE (derecha) pon -90 - Si apunta al NORTE ya usa 0 - Si apunta al NORDESTE (45°) prueba -45 o -135
// Activar debug para ver líneas de heading reales
const DEBUG_HEADING = false;

export default function Mapa() {
  const mapRef = useRef(null);
  const [rawAirports, setRawAirports] = useState(null);
  const [rawVuelos, setRawVuelos] = useState(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [vueloSeleccionado, setVueloSeleccionado] = useState(null);
  const [vueloDetalleCompleto, setVueloDetalleCompleto] = useState(null);
  const [aeropuertoDetalle, setAeropuertoDetalle] = useState(null);
  const [horizonte, setHorizonte] = useState(null); // ← nuevo

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

  // 🔁 Cargar vuelos desde el planificador (último ciclo) y refrescar periódicamente
  useEffect(() => {
    let mounted = true;
    let cancelled = false;

    async function loadUltimoCiclo() {
      try {
        const res = await fetch(`${API_BASE}/api/planificador/vuelos-ultimo-ciclo`);
        if (!mounted || cancelled) return;
        if (!res.ok) {
          console.warn("vuelos-ultimo-ciclo HTTP", res.status);
          setRawVuelos([]);
          return;
        }
        const data = await res.json();
        // Guardar horizonte (inicio / fin) para sincronizar simulación
        setHorizonte(data?.horizonte || null);
        const vuelos = Array.isArray(data?.vuelos) ? data.vuelos : [];
        console.log('✈️ Vuelos procesados:', vuelos.length); // Debug
        setRawVuelos(vuelos);
      } catch (err) {
        console.error("fetch vuelos-ultimo-ciclo:", err);
        if (mounted) setRawVuelos([]);
      }
    }

    loadUltimoCiclo();
    const iv = setInterval(loadUltimoCiclo, 30_000);
    return () => { mounted = false; cancelled = true; clearInterval(iv); };
  }, []);

  // ⏱ Sincronizar hora de simulación con el inicio del horizonte si está fuera de rango
  useEffect(() => {
    if (!horizonte?.inicio) return;
    const inicio = parsePlanificadorTime(horizonte.inicio);
    const fin = horizonte?.fin ? parsePlanificadorTime(horizonte.fin) : null;
    if (!inicio) return;
    const msInicio = inicio.getTime();
    const msFin = fin ? fin.getTime() : msInicio + 4 * 60 * 60 * 1000;
    if (nowMs < msInicio || nowMs > msFin) {
      setSimMs(msInicio);
    }
  }, [horizonte, nowMs]);

  // ⚡ Ajustar la velocidad para “recorrer” el horizonte (≈4h) en ~2 minutos reales
  useEffect(() => {
    if (!horizonte?.inicio || !horizonte?.fin) return;
    const ini = parsePlanificadorTime(horizonte.inicio);
    const fin = parsePlanificadorTime(horizonte.fin);
    if (!ini || !fin) return;
    const spanMs = Math.max(0, fin.getTime() - ini.getTime());     // ~ 4h
    const realCycleMs = 120_000;                                    // ~ 2 min reales
    if (spanMs > 0) {
      const speed = Math.max(1, Math.round(spanMs / realCycleMs));  // ≈120x
      setSpeed(speed);
    }
  }, [horizonte]);

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

  // Mapear respuesta de /api/planificador/vuelos-ultimo-ciclo al formato usado por el mapa
  const vuelos = useMemo(() => {
    if (!Array.isArray(rawVuelos)) return [];

    return rawVuelos.map(p => {
      // origen/destino vienen como objetos { id, codigo, ciudad, pais }
      const origenAirport = p.origen?.id && airportsById[p.origen.id] ? airportsById[p.origen.id] : null;
      const destinoAirport = p.destino?.id && airportsById[p.destino.id] ? airportsById[p.destino.id] : null;

      const latOrigen = origenAirport?.lat;
      const lonOrigen = origenAirport?.lon;
      const latDestino = destinoAirport?.lat;
      const lonDestino = destinoAirport?.lon;

      // horas estilo "yyyy-MM-dd HH:mm (UTC±hh:mm)"
      const horaOrigen = parsePlanificadorTime(p.horaSalida) || null;
      const horaDestino = parsePlanificadorTime(p.horaLlegada) || null;

      // ✅ Calcular capacidad ocupada sumando cantidades de envíos asignados
      const enviosAsignados = Array.isArray(p.enviosAsignados) ? p.enviosAsignados : [];
      const capacidadOcupada = enviosAsignados.reduce((sum, e) => {
        const cant = e.cantidad ?? e.cantidadAsignada ?? 0;
        return sum + cant;
      }, 0);

      return {
        raw: { ...p, capacidadOcupada }, // sobrescribir con valor calculado
        idTramo: p.id ?? p.vueloBaseId ?? null,
        latOrigen, lonOrigen, latDestino, lonDestino,
        horaOrigen, horaDestino,
        ciudadOrigenId: p.origen?.id, ciudadDestinoId: p.destino?.id,
        ciudadOrigenName: p.origen?.ciudad, ciudadDestinoName: p.destino?.ciudad
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

  // Limita la cantidad de vuelos renderizados (ahora TODOS los activos, priorizando con envíos)
  const vuelosFiltrados = useMemo(() => {
    if (!Array.isArray(vuelos)) return [];
    const ahoraMs = nowMs;
    const list = vuelos
      .map(v => {
        if (!(v.horaOrigen instanceof Date) || !(v.horaDestino instanceof Date)) return null;
        if (ahoraMs < v.horaOrigen.getTime()) return null;      // antes de salir
        if (ahoraMs >= v.horaDestino.getTime()) return null;    // ya llegó

        const pos = calcularPosicion(v, ahoraMs);
        if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;

        const tieneEnvios = Array.isArray(v.raw?.enviosAsignados) && v.raw.enviosAsignados.length > 0;

        const heading = calcularRumboActual(pos.lat, pos.lon, v.latDestino, v.lonDestino);
        const rotation = aplicarOffsetRotacion(heading);
        return { ...v, pos, heading, rotation, tieneEnvios };
      })
      .filter(Boolean);

    // Priorizar los que tienen envíos
    list.sort((a, b) => {
      if (a.tieneEnvios === b.tieneEnvios) return a.idTramo - b.idTramo;
      return a.tieneEnvios ? -1 : 1;
    });

    // Mantener límite alto para performance, pero después de ordenar (asegura incluir todos con envíos)
    const MAX = 400;
    return list.slice(0, MAX);
  }, [vuelos, nowMs]);

  // Solo vuelos en el aire que sí tienen envíos (para el catálogo)
  const vuelosConEnvios = useMemo(() => {
    return vuelosFiltrados.filter(v => v.tieneEnvios);
  }, [vuelosFiltrados]);

  const vuelosFiltradosCount = vuelosFiltrados.length; // (sin cambios en lógica de auto-avance)

  // ✅ Auto-avance: si no hay vuelos visibles aún, adelantar al primer vuelo (con o sin envíos)
  useEffect(() => {
    if (!horizonte?.inicio || !horizonte?.fin) return;
    if (!Array.isArray(rawVuelos) || rawVuelos.length === 0) return;
    if (vuelosFiltradosCount > 0) return;

    const ini = parsePlanificadorTime(horizonte.inicio);
    const fin = parsePlanificadorTime(horizonte.fin);
    if (!ini || !fin) return;

    // Tomar el primer vuelo (con o sin envíos)
    const startsAll = rawVuelos
      .map(p => parsePlanificadorTime(p.horaSalida))
      .filter(Boolean)
      .map(d => d.getTime());

    if (startsAll.length === 0) return;

    const earliest = Math.min(...startsAll);
    const targetMs = Math.min(
      Math.max(earliest + 20 * 60 * 1000, ini.getTime()), // 20 min luego de la primera salida
      fin.getTime() - 60 * 1000
    );

    if (Number.isFinite(targetMs) && Math.abs(nowMs - targetMs) > 5000) {
      setSimMs(targetMs);
    }
  }, [horizonte, rawVuelos, vuelosFiltradosCount, nowMs]);

  // ✅ Polylines para TODOS los vuelos (con límite para performance)
  const polylines = useMemo(() => {
    if (!Array.isArray(vuelos) || vuelos.length === 0) return [];
    if (vuelos.length > 300) return []; // evita sobrecarga si hay demasiados
    return vuelos.map(v => [[v.latOrigen, v.lonOrigen], [v.latDestino, v.lonDestino]]);
  }, [vuelos]);

  // Envíos en circulación (sigue igual, usa vuelosFiltrados que ya incluye todos; solo añade los que realmente tienen envíos)
  const enviosEnCirculacion = useMemo(() => {
    const items = [];
    for (const v of vuelosFiltrados || []) {
      if (!v.tieneEnvios) continue;
      const asign = Array.isArray(v.raw?.enviosAsignados) ? v.raw.enviosAsignados : [];
      asign.forEach(a => {
        const envioId = a.envioId ?? a.id ?? a.envio_id;
        const cantidad = a.cantidad ?? a.cantidadAsignada ?? a.qty ?? 0;
        items.push({
          envioId,
          cantidad,
          vueloId: v.idTramo,
          origen: v.ciudadOrigenName || v.raw?.origen?.codigo || v.raw?.origen?.ciudad || "",
          destino: v.ciudadDestinoName || v.raw?.destino?.codigo || v.raw?.destino?.ciudad || ""
        });
      });
    }
    const map = new Map();
    for (const it of items) {
      if (!map.has(it.envioId)) map.set(it.envioId, { ...it });
      else map.get(it.envioId).cantidad += it.cantidad;
    }
    return Array.from(map.values());
  }, [vuelosFiltrados]);

  // ✅ Mover handleSelectVuelo arriba (se usará luego en handleSelectEnvio)
  const handleSelectVuelo = useCallback((vueloData) => {
    console.log('📍 Vuelo seleccionado - datos recibidos:', vueloData);

    // Buscar en vuelosFiltrados primero (que ya tienen pos calculada)
    let vueloCompleto = vuelosFiltrados.find(v =>
      v.idTramo === vueloData.id ||
      v.idTramo === vueloData.idTramo ||
      v.raw.id === vueloData.id
    );

    // Si no se encuentra en filtrados, buscar en vuelos completos
    if (!vueloCompleto) {
      const vueloBase = vuelos.find(v =>
        v.idTramo === vueloData.id ||
        v.idTramo === vueloData.idTramo ||
        v.raw.id === vueloData.id
      );

      if (vueloBase) {
        const pos = calcularPosicion(vueloBase, nowMs);
        const heading = calcularRumboActual(pos.lat, pos.lon, vueloBase.latDestino, vueloBase.lonDestino);
        vueloCompleto = { ...vueloBase, pos, heading, rotation: aplicarOffsetRotacion(heading) };
      }
    }

    if (!vueloCompleto) {
      console.warn('⚠️ No se encontró el vuelo en la lista', vueloData);
      return;
    }

    console.log('✅ Vuelo encontrado:', vueloCompleto);

    const { pos } = vueloCompleto;

    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) {
      console.warn('⚠️ Posición inválida del vuelo');
      return;
    }

    // ⭐ IMPORTANTE: Actualizar estados ANTES de verificar mapRef
    const detalleParaPanel = {
      ...vueloCompleto,
      pos: { ...pos },
      timestamp: Date.now()
    };

    console.log('🔧 Estableciendo vueloDetalleCompleto:', detalleParaPanel);
    setVueloDetalleCompleto(detalleParaPanel);
    setVueloSeleccionado(vueloCompleto.idTramo);

    // Acercar el mapa al vuelo (si existe)
    if (mapRef.current) {
      console.log('✅ Moviendo mapa a:', [pos.lat, pos.lon]);
      try {
        mapRef.current.setView([pos.lat, pos.lon], 6, {
          animate: true,
          duration: 1.5
        });
      } catch (error) {
        console.error('❌ Error al mover el mapa:', error);
      }

      // Quitar selección después de 10 segundos (pero mantener el panel)
      setTimeout(() => {
        setVueloSeleccionado(null);
      }, 10000);
    } else {
      console.warn('⚠️ mapRef.current es null, pero el panel debería mostrarse igual');
    }
  }, [vuelos, vuelosFiltrados, nowMs, calcularPosicion]);

  // Callback para seleccionar vuelo desde el panel
  const handleSelectEnvio = useCallback((envio) => {
    const envioId = typeof envio === "object" ? (envio.envioId ?? envio.id) : envio;
    const v = vuelosFiltrados.find(x =>
      Array.isArray(x.raw?.enviosAsignados) &&
      x.raw.enviosAsignados.some(a => (a.envioId ?? a.id) === envioId)
    );
    if (v) {
      handleSelectVuelo({ id: v.idTramo, idTramo: v.idTramo, ...v.raw });
    } else {
      console.warn("Envio no encontrado en vuelos en circulación", envioId);
    }
  }, [vuelosFiltrados, handleSelectVuelo]);

  // ⭐ Eliminar rutasDinamicas anteriores y usar una sola ruta para vuelo seleccionado
  // const rutasDinamicas = useMemo(() => { ... });  // ← eliminado

  const selectedRuta = useMemo(() => {
    if (!vueloSeleccionado) return null;
    const v =
      vuelosFiltrados.find(x => x.idTramo === vueloSeleccionado) ||
      vuelos.find(x => x.idTramo === vueloSeleccionado);
    if (!v) return null;
    const pos = calcularPosicion(v, nowMs);
    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;
    const positions = greatCirclePoints(pos.lat, pos.lon, v.latDestino, v.lonDestino, 64);

    // Calcular rumbo usando el segundo punto de la curva si existe para mayor precisión
    let heading = calcularRumboActual(
      pos.lat,
      pos.lon,
      positions[1] ? positions[1][0] : v.latDestino,
      positions[1] ? positions[1][1] : v.lonDestino
    );
    heading = aplicarOffsetRotacion(heading);
    return { idTramo: v.idTramo, positions, heading, capacidadMax: v.raw?.capacidadMaxima || 300, capacidadOcupada: v.raw?.capacidadOcupada || 0 };
  }, [vueloSeleccionado, vuelosFiltrados, vuelos, nowMs, calcularPosicion]);

  // Callback para seleccionar vuelo desde el panel
  const handleSelectVueloPanel = useCallback((vueloData) => {
    console.log('📍 Vuelo seleccionado - datos recibidos:', vueloData);

    // Buscar en vuelosFiltrados primero (que ya tienen pos calculada)
    let vueloCompleto = vuelosFiltrados.find(v =>
      v.idTramo === vueloData.id ||
      v.idTramo === vueloData.idTramo ||
      v.raw.id === vueloData.id
    );

    // Si no se encuentra en filtrados, buscar en vuelos completos
    if (!vueloCompleto) {
      const vueloBase = vuelos.find(v =>
        v.idTramo === vueloData.id ||
        v.idTramo === vueloData.idTramo ||
        v.raw.id === vueloData.id
      );

      if (vueloBase) {
        const pos = calcularPosicion(vueloBase, nowMs);
        const heading = calcularRumboActual(pos.lat, pos.lon, vueloBase.latDestino, vueloBase.lonDestino);
        vueloCompleto = { ...vueloBase, pos, heading, rotation: aplicarOffsetRotacion(heading) };
      }
    }

    if (!vueloCompleto) {
      console.warn('⚠️ No se encontró el vuelo en la lista', vueloData);
      return;
    }

    console.log('✅ Vuelo encontrado:', vueloCompleto);

    const { pos } = vueloCompleto;

    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) {
      console.warn('⚠️ Posición inválida del vuelo');
      return;
    }

    // ⭐ IMPORTANTE: Actualizar estados ANTES de verificar mapRef
    const detalleParaPanel = {
      ...vueloCompleto,
      pos: { ...pos },
      timestamp: Date.now()
    };

    console.log('🔧 Estableciendo vueloDetalleCompleto:', detalleParaPanel);
    setVueloDetalleCompleto(detalleParaPanel);
    setVueloSeleccionado(vueloCompleto.idTramo);

    // Acercar el mapa al vuelo (si existe)
    if (mapRef.current) {
      console.log('✅ Moviendo mapa a:', [pos.lat, pos.lon]);
      try {
        mapRef.current.setView([pos.lat, pos.lon], 6, {
          animate: true,
          duration: 1.5
        });
      } catch (error) {
        console.error('❌ Error al mover el mapa:', error);
      }

      // Quitar selección después de 10 segundos (pero mantener el panel)
      setTimeout(() => {
        setVueloSeleccionado(null);
      }, 10000);
    } else {
      console.warn('⚠️ mapRef.current es null, pero el panel debería mostrarse igual');
    }
  }, [vuelos, vuelosFiltrados, nowMs, calcularPosicion]);

  // Callback para cerrar el panel de detalle
  const handleCerrarDetalle = useCallback(() => {
    console.log('🔒 Cerrando panel de detalle');
    setVueloDetalleCompleto(null);
    setVueloSeleccionado(null);
  }, []);

  // Callback para seleccionar aeropuerto
  const handleSelectAeropuerto = useCallback((a) => {
    setVueloDetalleCompleto(null); // cerrar panel vuelo si estaba abierto
    setAeropuertoDetalle(a);
  }, []);
  const handleCerrarAeropuerto = useCallback(() => setAeropuertoDetalle(null), []);

  return (
    <div style={{ width: "100%", height: "90vh", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 1400, display: "flex", gap: 12, alignItems: "center", pointerEvents: "auto" }}>
        <HoraActual startStr={null} style={{ position: "relative" }} />
        <SimulationControls startStr={null} />
      </div>

      {/* ⭐ Botón de Catálogos en el centro izquierdo - solo visible cuando el panel está cerrado */}
      {!panelAbierto && (
        <button
          onClick={() => setPanelAbierto(true)}
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1400,
            padding: "20px 14px",
            background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
            color: "white",
            border: "none",
            borderRadius: "0 16px 16px 0",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            fontWeight: 700,
            fontSize: 13,
            boxShadow: "3px 0 12px rgba(25, 118, 210, 0.4)",
            pointerEvents: "auto",
            transition: "all 0.3s ease",
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            letterSpacing: "0.5px"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.paddingLeft = "18px";
            e.currentTarget.style.paddingRight = "18px";
            e.currentTarget.style.boxShadow = "4px 0 16px rgba(25, 118, 210, 0.6)";
            e.currentTarget.style.background = "linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.paddingLeft = "14px";
            e.currentTarget.style.paddingRight = "14px";
            e.currentTarget.style.boxShadow = "3px 0 12px rgba(25, 118, 210, 0.4)";
            e.currentTarget.style.background = "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)";
          }}
        >
          <Menu size={22} style={{ transform: "rotate(90deg)" }} />
          <span>CATÁLOGOS</span>
        </button>
      )}

      {/* Panel lateral de catálogos con callback */}
      <PanelCatalogos
        isOpen={panelAbierto}
        onClose={() => setPanelAbierto(false)}
        onSelectVuelo={handleSelectVuelo}
        onSelectEnvio={handleSelectEnvio}
        envios={enviosEnCirculacion}
        vuelosConEnvios={vuelosConEnvios} // ← nuevo prop solo con vuelos que tienen pedidos
      />

      {/* ⭐ Panel de detalle del vuelo seleccionado */}
      {(vueloDetalleCompleto || aeropuertoDetalle) && (
        vueloDetalleCompleto ? (
          <PanelVueloDetalle
            vuelo={vueloDetalleCompleto}
            onClose={handleCerrarDetalle}
          />
        ) : (
          <PanelAeropuertoDetalle
            aeropuerto={aeropuertoDetalle}
            onClose={handleCerrarAeropuerto}
          />
        )
      )}

      <MapContainer
        center={center}
        zoom={airports.length ? 3 : 3}
        minZoom={2}
        maxZoom={18}
        style={{ width: "100%", height: "100%" }}
        worldCopyJump={true}
        maxBounds={[[-85, -Infinity], [85, Infinity]]}
        maxBoundsViscosity={1.0}
        whenCreated={(map) => {
          console.log('🗺️ Mapa creado, asignando mapRef');
          mapRef.current = map;
          setTimeout(() => map.invalidateSize(), 50);
        }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          noWrap={false}
        />

        {airports.map(a => (
          <Marker
            key={`ap-${a.id}`}
            position={[a.lat, a.lon]}
            icon={pickIconAirport(a)}
            eventHandlers={{ click: () => handleSelectAeropuerto(a) }}
          >
            <Tooltip
              direction="top"
              offset={[0, -10]}
              opacity={0.95}
              permanent={false}
            >
              <div style={{
                background: '#ffffff',
                color: '#0f172a',
                padding: '6px 8px',
                borderRadius: 6,
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                border: '1px solid #e2e8f0',
                fontSize: 12,
                fontWeight: 600
              }}>
                {a.ciudad}{a.codigo ? ` (${a.codigo})` : ""}
                {a.porcentaje != null && (
                  <div style={{ fontSize: 11, fontWeight: 500, marginTop: 2 }}>
                    Capacidad: {a.capacidadOcupada}/{a.capacidadMaxima} ({a.porcentaje}%)
                  </div>
                )}
              </div>
            </Tooltip>
          </Marker>
        ))}

        {/* Renderiza solo los vuelos filtrados */}
        {vuelosFiltrados.map(v => {
          const { pos } = v;
          if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;
          const isSelected = vueloSeleccionado === v.idTramo;

          // Capacidad y color por capacidad
          const capacidadMax = v.raw?.capacidadMaxima || 300;
          const capacidadOcupada = v.raw?.capacidadOcupada || 0;
          const capacidadPct = capacidadMax > 0 ? Math.round((capacidadOcupada / capacidadMax) * 100) : 0;
          const color = isSelected
            ? "#2563eb"
            : capacidadPct <= 60 ? "#10b981" : capacidadPct <= 85 ? "#f59e0b" : "#dc2626";

          // Usar rotación calculada (rumbo actual - 90°)
          const icono = getPlaneIcon(color, v.rotation ?? 0);

          return (
            <Marker
              key={`vu-${v.idTramo}`}
              position={[pos.lat, pos.lon]}
              icon={icono}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent.stopPropagation();
                  handleSelectVuelo({
                    id: v.idTramo,
                    idTramo: v.idTramo,
                    ...v.raw
                  });
                }
              }}
            >
              {/* Debug: línea corta indicando heading aplicado */}
              {DEBUG_HEADING && (
                <Polyline
                  positions={[
                    [v.pos.lat, v.pos.lon],
                    [
                      v.pos.lat + 0.6 * Math.cos((v.heading) * Math.PI / 180),
                      v.pos.lon + 0.6 * Math.sin((v.heading) * Math.PI / 180)
                    ]
                  ]}
                  pathOptions={{ color: 'black', weight: 2 }}
                />
              )}
              <Tooltip
                direction="top"
                offset={[0, -8]}
                opacity={0.95}
                permanent={false}
              >
                <div style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  padding: '8px 10px',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                  border: '1px solid #e2e8f0',
                  minWidth: 160
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: isSelected ? '#2563eb' : '#1976d2' }}>
                    ✈️ Vuelo #{v.idTramo}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4, color: '#475569' }}>
                    {v.ciudadOrigenName || "?"} → {v.ciudadDestinoName || "?"}
                  </div>
                  <div style={{
                    fontSize: 10,
                    marginBottom: 6,
                    paddingBottom: 6,
                    borderBottom: '1px solid #e2e8f0',
                    color: '#64748b'
                  }}>
                    Progreso: <strong style={{ color }}>{(pos.progreso * 100).toFixed(1)}%</strong>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>
                    Capacidad: <strong style={{ color: '#0f172a' }}>{capacidadOcupada}/{capacidadMax}</strong>
                  </div>
                  <div style={{
                    width: '100%',
                    height: 4,
                    background: '#e2e8f0',
                    borderRadius: 2,
                    overflow: 'hidden',
                    marginTop: 4
                  }}>
                    <div style={{
                      width: `${capacidadPct}%`,
                      height: '100%',
                      background: capacidadPct <= 60 ? '#10b981' : capacidadPct <= 85 ? '#f59e0b' : '#dc2626',
                      transition: 'width .3s',
                      borderRadius: 2
                    }} />
                  </div>
                  <div style={{ fontSize: 9, marginTop: 2, textAlign: 'right', color: '#64748b' }}>
                    {capacidadPct}%
                  </div>
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* ⭐ Ruta restante solo del vuelo seleccionado */}
        {selectedRuta && (
          <Polyline
            key={`ruta-seleccionada-${selectedRuta.idTramo}`}
            positions={selectedRuta.positions}
            weight={4}
            color="#2563eb"
            opacity={0.8}
            dashArray="8,4"
            lineJoin="round"
            lineCap="round"
          />
        )}

        {/* Polylines completas referencia (gris tenue) */}
        {polylines.length > 0 && polylines.map((positions, idx) => (
          <Polyline
            key={`poly-${idx}`}
            positions={positions}
            weight={1}
            dashArray="5,6"
            opacity={0.25}
            color="#94a3b8"
          />
        ))}

      </MapContainer>
    </div>
  );
}

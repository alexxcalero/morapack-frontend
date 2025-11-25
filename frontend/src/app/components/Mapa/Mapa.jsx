"use client";

import { useEffect, useRef, useState, useMemo, useCallback, memo, Fragment } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import HoraActual from "./HoraActual";
import SimulationControls from "./SimulationControls";
import { subscribe, getSimMs, setSimMs, setSpeed, initSim, isRunning, getSpeed } from "../../../lib/simTime"; // ← añade setSpeed e initSim
import { fetchVuelos, getCachedFlights } from "../../../lib/vuelos";
import { Plane, Menu } from "lucide-react";
import ReactDOMServer from "react-dom/server";
import PanelCatalogos from "./PanelCatalogos";
import PanelVueloDetalle from "./PanelVueloDetalle";
import PanelAeropuertoDetalle from "./PanelAeropuertoDetalle";
import ResumenSimulacion from "./ResumenSimulacion";
import useWebSocket from "../../../lib/useWebSocket";
import { obtenerRutasEnvio, obtenerEnviosPendientes } from "../../../lib/envios";

// URL base del backend (misma usada en SimulationControls)
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

// ⚡ OPTIMIZACIÓN: Usar Canvas renderer para mejor performance con muchos elementos
const canvasRenderer = L.canvas({ padding: 0.5, tolerance: 10 });

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

// Controlador para realizar flyTo desde dentro del contexto del mapa
function SmoothFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const { lat, lon, zoom = 6 } = target;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    try {
      if (typeof map.stop === 'function') map.stop();
      // Acercamiento instantáneo sin animación
      if (typeof map.setView === 'function') {
        map.setView([lat, lon], zoom, { animate: false });
      }
    } catch (e) {
      console.error('❌ setView error:', e);
    }
  }, [target, map]);
  return null;
}

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
  // Interpretar como hora local del huso y convertir a UTC de forma correcta
  const sign = offH >= 0 ? 1 : -1;
  const offsetMinutes = Math.abs(offH) * 60 + (offM || 0);
  const totalOffsetMs = sign * offsetMinutes * 60 * 1000;
  const localUtcMs = Date.UTC(y, mo - 1, day, hh, mm, 0);
  const utcMillis = localUtcMs - totalOffsetMs;
  return new Date(utcMillis);
}

// ⚡ OPTIMIZACIÓN: Cache más agresivo con iconos pre-renderizados
const planeIconCache = {};
const ICON_SIZE = [28, 28]; // Tamaño aumentado para mejor visibilidad

function getPlaneIcon(color, rotation = 0) {
  // Redondear rotación a múltiplos de 10° para MÁS cache hits
  const roundedRotation = Math.round(rotation / 10) * 10;
  const cacheKey = `${color}-${roundedRotation}`;
  if (planeIconCache[cacheKey]) return planeIconCache[cacheKey];

  // SVG simple y optimizado (sin elementos extra)
  const svgHtml = ReactDOMServer.renderToString(
    <div
      style={{
        width: ICON_SIZE[0],
        height: ICON_SIZE[1],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `rotate(${roundedRotation}deg)`,
        cursor: 'pointer',
      }}
    >
      <Plane color={color} size={18} strokeWidth={2.5} />
    </div>
  );

  const icon = L.divIcon({
    html: svgHtml,
    className: 'plane-icon',
    iconSize: ICON_SIZE,
    iconAnchor: [ICON_SIZE[0] / 2, ICON_SIZE[1] / 2],
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
  const [dynamicAirports, setDynamicAirports] = useState(null); // ← aeropuertos desde /vuelos-ultimo-ciclo
  const [localAirportCapacities, setLocalAirportCapacities] = useState({}); // ← capacidades locales calculadas
  const [aeropuertoCapacidades, setAeropuertoCapacidades] = useState(null); // ← capacidades y envíos desde /obtenerCapacidades
  const [rawVuelos, setRawVuelos] = useState(null);
  const [vuelosCache, setVuelosCache] = useState([]); // ← NUEVO: caché local de vuelos
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [vueloSeleccionado, setVueloSeleccionado] = useState(null);
  const [vueloDetalleCompleto, setVueloDetalleCompleto] = useState(null);
  const [aeropuertoDetalle, setAeropuertoDetalle] = useState(null);
  const [aeropuertoSeleccionado, setAeropuertoSeleccionado] = useState(null);
  const [horizonte, setHorizonte] = useState(null); // ← nuevo
  const [soloConEnvios, setSoloConEnvios] = useState(false); // ← filtro de vuelos con envíos
  const [flyTarget, setFlyTarget] = useState(null);
  const [navegando, setNavegando] = useState(false);

  // Estados para visualizar rutas de envíos
  const [rutasEnvioSeleccionado, setRutasEnvioSeleccionado] = useState(null);

  // Estados para el resumen de simulación
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [datosResumen, setDatosResumen] = useState({
    enviosEntregados: 0,
    productosEntregados: 0,
    tiempoSimulacion: 0
  });
  const yaSeDetuvoRef = useRef(false);
  const fechaInicioSimRef = useRef(null);
  const fechaFinSimRef = useRef(null);
  const [simulacionIniciada, setSimulacionIniciada] = useState(false);

  // No inicialices initSim aquí: HoraActual es quien controla startMs.
  // Suscripción global a tiempo de simulación
  const [nowMs, setNowMs] = useState(() => getSimMs());
  useEffect(() => {
    const unsub = subscribe(ms => setNowMs(ms));
    return () => unsub();
  }, []);

  // 🔌 WebSocket: Actualizaciones en tiempo real del planificador (manteniendo polling como fallback)
  const { connected: wsConnected, error: wsError, usingSockJS } = useWebSocket({
    topic: '/topic/planificacion',
    enabled: true,
    onMessage: useCallback((message) => {
      if (message?.tipo === 'update_ciclo') {
        // Refrescar de inmediato los datos del último ciclo
        (async () => {
          try {
            const res = await fetch(`${API_BASE}/api/planificador/vuelos-ultimo-ciclo`);
            if (!res.ok) return;
            const data = await res.json();
            setHorizonte(data?.horizonte || null);
            const vuelosNuevos = Array.isArray(data?.vuelos) ? data.vuelos : [];
            if (Array.isArray(data?.aeropuertos)) {
              setDynamicAirports(data.aeropuertos);
              // Aplicar solo DECREMENTOS del planificador (envíos entregados)
              setLocalAirportCapacities(prevLocal => {
                const newLocal = { ...prevLocal };
                data.aeropuertos.forEach(aeropuerto => {
                  const id = aeropuerto.id ?? aeropuerto.idAeropuerto;
                  if (id != null) {
                    const capacidadPlanificador = aeropuerto.capacidadOcupada ?? 0;
                    const capacidadActual = prevLocal[id] ?? capacidadPlanificador;
                    // Solo aplicar si el planificador reporta MENOS capacidad (entrega)
                    if (capacidadPlanificador < capacidadActual) {
                      newLocal[id] = capacidadPlanificador;
                    }
                    // Si no existe en prevLocal, inicializar con valor del planificador
                    if (!(id in prevLocal)) {
                      newLocal[id] = capacidadPlanificador;
                    }
                  }
                });
                return newLocal;
              });
            }
            setVuelosCache(prev => {
              console.log('🔄 [WS] Actualizando cache. Anterior:', prev.length, 'vuelos');
              console.log('🔄 [WS] Vuelos nuevos del planificador:', vuelosNuevos.length);
              // Preferir vuelos inyectados (__deRutaEnvio) sobre los que llegan del planificador
              const ahoraSimulacion = getSimMs();
              const margenSeguridad = 5 * 60 * 1000;
              const prevMap = new Map();
              for (const v of prev) prevMap.set(v.id, v);
              const resultado = [];
              // 1. Mantener todos los vuelos inyectados vigentes (aunque exista planner)
              for (const v of prev) {
                const llegada = parsePlanificadorTime(v.horaLlegada);
                const vigente = llegada && llegada.getTime() > (ahoraSimulacion - margenSeguridad);
                if (v.__deRutaEnvio && vigente) resultado.push(v);
              }
              // 2. Agregar vuelos nuevos del planificador solo si no hay uno inyectado con mismo id
              for (const v of vuelosNuevos) {
                if (prevMap.has(v.id) && prevMap.get(v.id).__deRutaEnvio) continue; // hay inyectado, descartar planner
                const llegada = parsePlanificadorTime(v.horaLlegada);
                const vigente = llegada && llegada.getTime() > (ahoraSimulacion - margenSeguridad);
                if (!vigente) continue;
                // preservar historial si existía
                const anterior = prevMap.get(v.id);
                let historial = [];
                if (anterior) {
                  if (Array.isArray(anterior.__historialEnviosCompletos)) historial = [...anterior.__historialEnviosCompletos];
                  else if (Array.isArray(anterior.enviosAsignados) && anterior.enviosAsignados.length > 0) historial = [...anterior.enviosAsignados];
                }
                let enviosAsignados = Array.isArray(v.enviosAsignados) && v.enviosAsignados.length > 0 ? v.enviosAsignados : historial;
                resultado.push({
                  ...v,
                  enviosAsignados,
                  __tuvoEnvios: enviosAsignados.length > 0,
                  __historialEnviosCompletos: historial
                });
              }
              // 3. Mantener vuelos previos no inyectados que siguen vigentes y que no fueron reemplazados por nuevos
              for (const v of prev) {
                if (v.__deRutaEnvio) continue; // ya incluidos
                if (vuelosNuevos.find(x => x.id === v.id)) continue; // reemplazado
                const llegada = parsePlanificadorTime(v.horaLlegada);
                const vigente = llegada && llegada.getTime() > (ahoraSimulacion - margenSeguridad);
                if (vigente) resultado.push(v);
              }
              console.log(`✅ [WS] Cache actualizado: ${resultado.length} vuelos (${resultado.filter(v => v.__deRutaEnvio).length} inyectados)`);
              return resultado;
            });
            setRawVuelos(vuelosNuevos);
          } catch (e) {
            console.error('WS refresh error:', e);
          }
        })();
      }
    }, [])
  });

  useEffect(() => {
    if (wsConnected) console.log('🟢 WebSocket conectado', usingSockJS ? '(usando SockJS fallback)' : '(nativo)');
    if (wsError) {
      console.log('🔴 WebSocket error:', wsError);
      if (wsError.includes('backend no actualizado')) {
        console.log('💡 Solución: Reinicia el backend Spring Boot para cargar el endpoint /ws-planificacion-sockjs');
      }
    }
  }, [wsConnected, wsError, usingSockJS]);

  // cargar aeropuertos (unchanged)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/aeropuertos/obtenerTodos`);
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

  //  Cargar vuelos desde el planificador (último ciclo) y refrescar periódicamente
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
        setHorizonte(data?.horizonte || null);
        const vuelosNuevos = Array.isArray(data?.vuelos) ? data.vuelos : [];

        // ✅ NUEVO: Actualizar aeropuertos dinámicos con capacidades desde backend
        if (Array.isArray(data?.aeropuertos)) {
          setDynamicAirports(data.aeropuertos);
          // Aplicar solo DECREMENTOS del planificador (envíos entregados)
          setLocalAirportCapacities(prevLocal => {
            const newLocal = { ...prevLocal };
            data.aeropuertos.forEach(aeropuerto => {
              const id = aeropuerto.id ?? aeropuerto.idAeropuerto;
              if (id != null) {
                const capacidadPlanificador = aeropuerto.capacidadOcupada ?? 0;
                const capacidadActual = prevLocal[id] ?? capacidadPlanificador;
                // Solo aplicar si el planificador reporta MENOS capacidad (entrega)
                if (capacidadPlanificador < capacidadActual) {
                  newLocal[id] = capacidadPlanificador;
                }
                // Si no existe en prevLocal, inicializar con valor del planificador
                if (!(id in prevLocal)) {
                  newLocal[id] = capacidadPlanificador;
                }
              }
            });
            return newLocal;
          });
        }

        // ✅ FUSIONAR: Preservar vuelos del cache que aún están volando
        setVuelosCache(prev => {
          console.log('🔄 [Polling] Actualizando cache. Anterior:', prev.length, 'vuelos');
          console.log('🔄 [Polling] Vuelos nuevos del planificador:', vuelosNuevos.length);
          // Nueva lógica: Reemplazar vuelos planificador por inyectados si existen con mismo id
          const ahoraSimulacion = getSimMs();
          const margenSeguridad = 5 * 60 * 1000;
          const prevMap = new Map();
          for (const v of prev) prevMap.set(v.id, v);
          const resultado = [];
          // 1. Mantener inyectados vigentes
          for (const v of prev) {
            const llegada = parsePlanificadorTime(v.horaLlegada);
            const vigente = llegada && llegada.getTime() > (ahoraSimulacion - margenSeguridad);
            if (v.__deRutaEnvio && vigente) resultado.push(v);
          }
          // 2. Agregar vuelos nuevos del planificador si no existe inyectado
          for (const v of vuelosNuevos) {
            if (prevMap.has(v.id) && prevMap.get(v.id).__deRutaEnvio) continue;
            const llegada = parsePlanificadorTime(v.horaLlegada);
            const vigente = llegada && llegada.getTime() > (ahoraSimulacion - margenSeguridad);
            if (!vigente) continue;
            const anterior = prevMap.get(v.id);
            let historial = [];
            if (anterior) {
              if (Array.isArray(anterior.__historialEnviosCompletos)) historial = [...anterior.__historialEnviosCompletos];
              else if (Array.isArray(anterior.enviosAsignados) && anterior.enviosAsignados.length > 0) historial = [...anterior.enviosAsignados];
            }
            let enviosAsignados = Array.isArray(v.enviosAsignados) && v.enviosAsignados.length > 0 ? v.enviosAsignados : historial;
            resultado.push({
              ...v,
              enviosAsignados,
              __tuvoEnvios: enviosAsignados.length > 0,
              __historialEnviosCompletos: historial
            });
          }
          // 3. Mantener previos no inyectados vigentes y no reemplazados
          for (const v of prev) {
            if (v.__deRutaEnvio) continue;
            if (vuelosNuevos.find(x => x.id === v.id)) continue;
            const llegada = parsePlanificadorTime(v.horaLlegada);
            const vigente = llegada && llegada.getTime() > (ahoraSimulacion - margenSeguridad);
            if (vigente) resultado.push(v);
          }
          console.log(`✅ [Polling] Cache actualizado: ${resultado.length} vuelos (${resultado.filter(v => v.__deRutaEnvio).length} inyectados)`);
          return resultado;
        }); setRawVuelos(vuelosNuevos);
        console.log('✈️ Vuelos procesados:', vuelosNuevos.length);
      } catch (err) {
        console.error("fetch vuelos-ultimo-ciclo:", err);
        if (mounted) setRawVuelos([]);
      }
    }

    // Carga inicial inmediata
    loadUltimoCiclo();

    // ⚠️ IMPORTANTE: Solo usar polling si WebSocket no está conectado
    // Esto evita actualizaciones redundantes y reduce carga
    let iv = null;

    // Esperar 2 segundos para que WebSocket intente conectar
    const checkTimeout = setTimeout(() => {
      if (!wsConnected) {
        console.log('⏱️ WebSocket no conectado, activando polling cada 30s como fallback');
        iv = setInterval(loadUltimoCiclo, 30_000);
      } else {
        console.log('✅ WebSocket conectado, polling desactivado');
      }
    }, 2000);

    // Escuchar inicio explícito del planificador para refrescar inmediatamente
    const onPlanificadorIniciado = () => {
      // Refresco inmediato y un par de reintentos rápidos para capturar datos recientes
      loadUltimoCiclo();
      setTimeout(loadUltimoCiclo, 1500);
      setTimeout(loadUltimoCiclo, 3500);
    };
    try { window.addEventListener('planificador:iniciado', onPlanificadorIniciado); } catch { }

    return () => {
      mounted = false; cancelled = true;
      clearTimeout(checkTimeout);
      if (iv) clearInterval(iv);
      try { window.removeEventListener('planificador:iniciado', onPlanificadorIniciado); } catch { }
    };
  }, [wsConnected]);

  // ⏱ La hora simulada es la principal: no forzar ajustes de rango.
  // La inicialización/auto-avance se maneja por efectos dedicados más abajo.

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
      console.log('⚡ Estableciendo velocidad de simulación:', speed + 'x');
      setSpeed(speed);
      if (!isRunning()) {
        initSim({ startMs: getSimMs(), stepMs: 1000, speed });
      }
    }
  }, [horizonte]);

  // 🎯 Detectar fin de simulación y mostrar resumen
  useEffect(() => {
    if (!horizonte?.inicio || !horizonte?.fin) return;
    if (!isRunning()) {
      yaSeDetuvoRef.current = false;
      return;
    }

    const ini = parsePlanificadorTime(horizonte.inicio);
    const fin = parsePlanificadorTime(horizonte.fin);
    if (!ini || !fin) return;

    // Guardar fechas de referencia
    if (!fechaInicioSimRef.current) fechaInicioSimRef.current = ini;
    if (!fechaFinSimRef.current) fechaFinSimRef.current = fin;

    const checkFin = async () => {
      const simMs = getSimMs();
      const finMs = fin.getTime();

      // Si la simulación llegó al fin y aún no se detuvo
      if (simMs >= finMs && !yaSeDetuvoRef.current) {
        yaSeDetuvoRef.current = true;
        console.log('🎯 Simulación finalizada - Generando resumen...');

        try {
          // Detener simulación en el backend
          const detenerRes = await fetch(`${API_BASE}/api/simulacion/detener`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
          });

          if (!detenerRes.ok) {
            console.warn('⚠️ Error al detener simulación:', detenerRes.status);
          }

          // Limpiar caché de vuelos al detener
          setVuelosCache([]);
          setRawVuelos([]);
          setLocalAirportCapacities({}); // Resetear capacidades locales
          console.log('🧹 Caché de vuelos y capacidades limpiado al finalizar simulación');

          // Obtener estadísticas de envíos desde el backend
          const enviosRes = await fetch(`${API_BASE}/api/envios/obtenerTodos`);
          if (enviosRes.ok) {
            const envios = await enviosRes.json();
            const enviosArray = Array.isArray(envios) ? envios : [];

            // Filtrar envíos entregados (estado ENTREGADO o estado 3)
            const entregados = enviosArray.filter(e =>
              e.estado === 'ENTREGADO' ||
              e.estado === 3 ||
              e.estadoEnvio?.nombre === 'ENTREGADO' ||
              e.estadoEnvio?.id === 3
            );

            // Calcular total de productos (suma de cantidades)
            const totalProductos = entregados.reduce((sum, e) => {
              const cantidad = e.cantidad ?? e.cantidadProductos ?? e.numeroProductos ?? 1;
              return sum + cantidad;
            }, 0);

            // Calcular tiempo de simulación
            const tiempoSimulacion = finMs - ini.getTime();

            setDatosResumen({
              enviosEntregados: entregados.length,
              productosEntregados: totalProductos,
              tiempoSimulacion
            });

            setMostrarResumen(true);

            console.log('📊 Resumen generado:', {
              envios: entregados.length,
              productos: totalProductos,
              tiempo: tiempoSimulacion
            });
          } else {
            console.warn('⚠️ Error al obtener envíos:', enviosRes.status);
          }
        } catch (error) {
          console.error('❌ Error al generar resumen:', error);
        }
      }
    };

    const interval = setInterval(checkFin, 2000); // Verificar cada 2 segundos
    return () => clearInterval(interval);
  }, [horizonte, nowMs]);

  // Resetear estado cuando se inicia nueva simulación
  useEffect(() => {
    if (isRunning()) {
      yaSeDetuvoRef.current = false;
      fechaInicioSimRef.current = null;
      fechaFinSimRef.current = null;
      setMostrarResumen(false);
    } else {
      // Si la simulación se detiene (manualmente o por error), limpiar caché y capacidades
      setVuelosCache([]);
      setRawVuelos([]);
      setLocalAirportCapacities({}); // Resetear capacidades locales
      console.log('🧹 Caché de vuelos y capacidades limpiado al detener simulación');
    }
  }, [horizonte?.inicio]); // Cuando cambia el horizonte, es una nueva simulación

  // ✅ Aeropuertos base (sin capacidades dinámicas calculadas)
  // Detectar aeropuertos principales (ilimitados): Lima, Bruselas, Bakú
  const esAeropuertoPrincipal = useCallback((a) => {
    const ciudad = String(a.ciudad ?? a.raw?.ciudad ?? "").toLowerCase();
    const codigo = String(a.codigo ?? a.abreviatura ?? a.raw?.codigo ?? "").toLowerCase();
    return (
      ciudad.includes("lima") ||
      ciudad.includes("brus") || // Brussels / Bruselas
      ciudad.includes("baku") ||
      codigo === "spim" ||
      codigo === "spjc" ||
      codigo.startsWith("eb") || // EBBR, etc.
      codigo === "gyd" ||
      codigo === "ubbb"
    );
  }, []);

  const airportsBase = useMemo(() => {
    if (!Array.isArray(rawAirports)) return [];

    // Crear mapa de capacidades dinámicas desde backend (para capacidadMaxima)
    const dynamicMap = {};
    if (Array.isArray(dynamicAirports)) {
      dynamicAirports.forEach(a => {
        const id = a.id ?? a.idAeropuerto;
        if (id != null) {
          dynamicMap[id] = {
            capacidadMaxima: a.capacidadMaxima ?? a.capacidad ?? null
          };
        }
      });
    }

    return rawAirports.map(a => {
      const lat = parseCoord(a.latitud ?? a.lat ?? a.latitude, { isLat: true, airport: a });
      const lon = parseCoord(a.longitud ?? a.lon ?? a.longitude, { isLat: false, airport: a });

      // Usar capacidades locales calculadas (incrementadas con aterrizajes)
      const dynamic = dynamicMap[a.id] || {};
      const ilimitado = esAeropuertoPrincipal(a);
      const capacidadMaxima = ilimitado ? null : (dynamic.capacidadMaxima ?? a.capacidadMaxima ?? a.capacidad ?? null);
      const capacidadOcupada = ilimitado ? 0 : (localAirportCapacities[a.id] ?? a.capacidadOcupada ?? 0);

      return {
        id: a.id,
        codigo: a.codigo ?? a.abreviatura ?? "",
        ciudad: a.ciudad ?? "",
        pais: a.pais?.nombre ?? "",
        lat,
        lon,
        capacidadMaxima,
        capacidadOcupada,
        ilimitado,
        raw: a
      };
    }).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
  }, [rawAirports, dynamicAirports, localAirportCapacities, esAeropuertoPrincipal]); const airportsById = useMemo(() => {
    const map = {};
    for (const a of airportsBase) map[a.id] = a;
    return map;
  }, [airportsBase]);

  // Mapear respuesta usando vuelosCache en lugar de rawVuelos
  const vuelos = useMemo(() => {
    if (!Array.isArray(vuelosCache)) return [];

    console.log(`🔄 Procesando ${vuelosCache.length} vuelos del cache (incluye inyectados desde rutas)`);

    return vuelosCache.map(p => {
      // origen/destino vienen como objetos { id, codigo, ciudad, pais }
      const origenAirport = p.origen?.id && airportsById[p.origen.id] ? airportsById[p.origen.id] : null;
      const destinoAirport = p.destino?.id && airportsById[p.destino.id] ? airportsById[p.destino.id] : null;

      // Para vuelos inyectados desde rutas, las coordenadas ya vienen parseadas
      const latOrigen = p.__deRutaEnvio && Number.isFinite(p.latOrigen) ? p.latOrigen : origenAirport?.lat;
      const lonOrigen = p.__deRutaEnvio && Number.isFinite(p.lonOrigen) ? p.lonOrigen : origenAirport?.lon;
      const latDestino = p.__deRutaEnvio && Number.isFinite(p.latDestino) ? p.latDestino : destinoAirport?.lat;
      const lonDestino = p.__deRutaEnvio && Number.isFinite(p.lonDestino) ? p.lonDestino : destinoAirport?.lon;

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
        raw: {
          ...p,
          capacidadOcupada,
          __enviosPlanificados: p.__enviosPlanificados || [],
          __historialEnviosCompletos: p.__historialEnviosCompletos || [],
          __tuvoEnvios: p.__tuvoEnvios || false
        },
        idTramo: p.id ?? p.vueloBaseId ?? null,
        latOrigen, lonOrigen, latDestino, lonDestino,
        horaOrigen, horaDestino,
        ciudadOrigenId: p.origen?.id, ciudadDestinoId: p.destino?.id,
        ciudadOrigenName: p.origen?.ciudad, ciudadDestinoName: p.destino?.ciudad,
        __deRutaEnvio: p.__deRutaEnvio || false
      };
    }).filter(v =>
      Number.isFinite(v.latOrigen) && Number.isFinite(v.lonOrigen) &&
      Number.isFinite(v.latDestino) && Number.isFinite(v.lonDestino) &&
      v.horaOrigen instanceof Date && !isNaN(v.horaOrigen.getTime()) &&
      v.horaDestino instanceof Date && !isNaN(v.horaDestino.getTime())
    );
  }, [vuelosCache, airportsById]); // ← cambiar rawVuelos por vuelosCache


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

  // ✅ Usar aeropuertos con capacidades actualizadas desde el backend
  // El backend envía las capacidades reales cuando los aviones aterrizan y descargan
  const airports = useMemo(() => {
    if (!Array.isArray(airportsBase)) return [];

    // Simplemente calcular el porcentaje con los datos que ya vienen del backend
    return airportsBase.map(a => {
      const porcentaje = a.ilimitado
        ? null
        : ((typeof a.capacidadMaxima === "number" && a.capacidadMaxima > 0)
          ? Math.round((a.capacidadOcupada / a.capacidadMaxima) * 100)
          : null);

      return {
        ...a,
        porcentaje
      };
    });
  }, [airportsBase]);

  const center = airports.length ? [airports[0].lat, airports[0].lon] : [-12.0464, -77.0428];

  // ⚡ OPTIMIZACIÓN: Throttle de actualización de posiciones (cada ~100ms en lugar de cada frame)
  const [throttledNowMs, setThrottledNowMs] = useState(nowMs);
  useEffect(() => {
    const delay = navegando ? 300 : 100;
    const timer = setTimeout(() => setThrottledNowMs(nowMs), delay);
    return () => clearTimeout(timer);
  }, [nowMs, navegando]);

  // Renderizar TODOS los vuelos activos sin límite
  const vuelosFiltrados = useMemo(() => {
    if (!Array.isArray(vuelos)) return [];
    const ahoraMs = throttledNowMs;
    const BUFFER_MS = 2 * 60 * 1000; // 2 minutos extra tras llegada
    const list = vuelos.map(v => {
      if (!(v.horaOrigen instanceof Date) || !(v.horaDestino instanceof Date)) return null;
      if (ahoraMs < v.horaOrigen.getTime()) return null;
      // Permitir que el vuelo siga visible hasta 2 minutos después de la llegada
      if (ahoraMs >= v.horaDestino.getTime() + BUFFER_MS) return null;

      const pos = calcularPosicion(v, ahoraMs);
      if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;

      // Considerar tanto envíos actuales como historial para determinar si tiene envíos
      const enviosActuales = Array.isArray(v.raw?.enviosAsignados) && v.raw.enviosAsignados.length > 0;
      const historialEnvios = Array.isArray(v.raw?.__historialEnviosCompletos) && v.raw.__historialEnviosCompletos.length > 0;
      const tieneEnvios = enviosActuales || historialEnvios || v.raw?.__tuvoEnvios;

      const heading = calcularRumboActual(pos.lat, pos.lon, v.latDestino, v.lonDestino);
      const rotation = aplicarOffsetRotacion(heading);
      return { ...v, pos, heading, rotation, tieneEnvios };
    }).filter(Boolean);

    // Priorizar los que tienen envíos (para mejor visualización)
    list.sort((a, b) => {
      if (a.tieneEnvios === b.tieneEnvios) return a.idTramo - b.idTramo;
      return a.tieneEnvios ? -1 : 1;
    });

    if (soloConEnvios) {
      // Mostrar vuelos que tienen o tuvieron envíos (incluye historial)
      return list.filter(v => v.tieneEnvios);
    }
    return list;
  }, [vuelos, throttledNowMs, calcularPosicion, soloConEnvios]);

  // Solo vuelos en el aire que sí tienen envíos (para el catálogo)
  const vuelosConEnvios = useMemo(() => {
    return vuelosFiltrados.filter(v => v.tieneEnvios);
  }, [vuelosFiltrados]); // ← ya depende de vuelosFiltrados que incluye nowMs

  // 🛬 Detectar aterrizajes e incrementar capacidades de aeropuertos
  const vuelosAterrizadosRef = useRef(new Set()); // Trackear vuelos ya procesados

  useEffect(() => {
    const ahoraMs = throttledNowMs;

    vuelos.forEach(vuelo => {
      if (!vuelo.horaDestino || !vuelo.ciudadDestinoId) return;

      const vueloId = vuelo.idTramo;
      const llegadaMs = vuelo.horaDestino.getTime();

      // Si el avión ya llegó y no lo hemos procesado
      if (ahoraMs >= llegadaMs && !vuelosAterrizadosRef.current.has(vueloId)) {
        vuelosAterrizadosRef.current.add(vueloId);

        // Incrementar capacidad del aeropuerto destino con la carga del avión
        const capacidadCarga = vuelo.raw?.capacidadOcupada || 0;

        if (capacidadCarga > 0) {
          setLocalAirportCapacities(prev => {
            const aeropuertoId = vuelo.ciudadDestinoId;
            const capacidadActual = prev[aeropuertoId] || 0;
            return {
              ...prev,
              [aeropuertoId]: capacidadActual + capacidadCarga
            };
          });

          console.log(`🛬 Avión ${vueloId} aterrizó en aeropuerto ${vuelo.ciudadDestinoId} con ${capacidadCarga} productos`);
        }
      }
    });
  }, [vuelos, throttledNowMs]);

  // Limpiar tracking de aterrizajes cuando cambia el horizonte o se detiene simulación
  useEffect(() => {
    vuelosAterrizadosRef.current.clear();
  }, [horizonte?.inicio]);

  // ✅ Auto-avance: SOLO se ejecuta una vez al inicio cuando no hay vuelos en el aire
  // ⚠️ NO debe depender del filtro soloConEnvios ni de vuelosFiltrados
  const autoAvanceEjecutadoRef = useRef(false);

  useEffect(() => {
    // Solo ejecutar una vez por horizonte
    if (autoAvanceEjecutadoRef.current) return;
    if (!horizonte?.inicio || !horizonte?.fin) return;
    if (!Array.isArray(rawVuelos) || rawVuelos.length === 0) return;

    const ini = parsePlanificadorTime(horizonte.inicio);
    const fin = parsePlanificadorTime(horizonte.fin);
    if (!ini || !fin) return;

    // Verificar si HAY vuelos en el aire AHORA (en el tiempo actual de simulación)
    const simActualMs = getSimMs();
    const vuelosEnAire = rawVuelos.filter(v => {
      const salida = parsePlanificadorTime(v.horaSalida);
      const llegada = parsePlanificadorTime(v.horaLlegada);
      if (!salida || !llegada) return false;
      return simActualMs >= salida.getTime() && simActualMs < llegada.getTime();
    });

    console.log('🔍 Auto-avance - Tiempo simulación actual:', simActualMs, new Date(simActualMs).toISOString());
    console.log('🔍 Auto-avance - Vuelos en el aire ahora:', vuelosEnAire.length);

    // Si ya hay vuelos en el aire, no hacer auto-avance
    if (vuelosEnAire.length > 0) {
      console.log('✅ Ya hay vuelos en el aire, no se necesita auto-avance');
      autoAvanceEjecutadoRef.current = true;
      return;
    }

    // Si no hay vuelos en el aire, adelantar al primer vuelo DENTRO del horizonte de simulación
    const inicioMs = ini.getTime();
    const finMs = fin.getTime();
    console.log('🔍 Auto-avance - Horizonte:', new Date(inicioMs).toISOString(), 'a', new Date(finMs).toISOString());

    const startsAll = rawVuelos
      .map(p => parsePlanificadorTime(p.horaSalida))
      .filter(Boolean)
      .map(d => d.getTime());

    console.log('🔍 Auto-avance - Total de vuelos:', startsAll.length);
    if (startsAll.length > 0) {
      console.log('🔍 Auto-avance - Primer vuelo absoluto:', new Date(Math.min(...startsAll)).toISOString());
    }

    // Filtrar vuelos que estén DENTRO del horizonte de simulación
    const vuelosDentroHorizonte = startsAll.filter(t => t >= inicioMs && t <= finMs);
    console.log('🔍 Auto-avance - Vuelos dentro del horizonte:', vuelosDentroHorizonte.length);

    if (vuelosDentroHorizonte.length > 0) {
      console.log('🔍 Auto-avance - Primer vuelo en horizonte:', new Date(Math.min(...vuelosDentroHorizonte)).toISOString());
    }

    const vuelosFuturos = vuelosDentroHorizonte.filter(t => t >= inicioMs);
    console.log('🔍 Auto-avance - Vuelos futuros (desde inicio):', vuelosFuturos.length);

    if (vuelosFuturos.length === 0) {
      console.log('⚠️ No hay vuelos futuros dentro del horizonte para hacer auto-avance');
      autoAvanceEjecutadoRef.current = true;
      return;
    }

    const earliest = Math.min(...vuelosFuturos);
    const targetMs = Math.min(
      Math.max(earliest + 20 * 60 * 1000, inicioMs), // 20 min después de la primera salida, pero no antes del inicio
      finMs - 60 * 1000
    );

    if (Number.isFinite(targetMs) && Math.abs(inicioMs - targetMs) > 5000) {
      console.log('⏩ Auto-avance: adelantando a', new Date(targetMs).toISOString(), '(desde', new Date(inicioMs).toISOString() + ')');
      setSimMs(targetMs);
      if (!isRunning()) {
        const currentSpeed = getSpeed() || 1;
        initSim({ startMs: targetMs, stepMs: 1000, speed: currentSpeed });
      }
      autoAvanceEjecutadoRef.current = true;
      // Señalar que la simulación realmente inició (después del auto-avance)
      console.log('🚀 Activando simulacionIniciada = true');
      setSimulacionIniciada(true);
    }
  }, [horizonte, rawVuelos]); // ← NO incluir nowMs, soloConEnvios, ni vuelosFiltrados

  // ✅ Resetear el flag de auto-avance cuando cambia el horizonte
  useEffect(() => {
    autoAvanceEjecutadoRef.current = false;
    setSimulacionIniciada(false);
  }, [horizonte?.inicio]);
  // ⭐ OPTIMIZACIÓN: Eliminamos polylines para mejorar rendimiento
  // Solo mostramos la ruta del vuelo seleccionado (ver selectedRuta más abajo)

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
  const handleSelectVuelo = useCallback((vueloData, shouldZoom = false) => {
    console.log('📍 Vuelo seleccionado - datos recibidos:', vueloData);

    // Cerrar panel de aeropuerto y deseleccionar aeropuerto
    setAeropuertoDetalle(null);
    setAeropuertoSeleccionado(null);

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

    // Acercar el mapa al vuelo solo si se indica (cuando viene del catálogo)
    if (shouldZoom && Number.isFinite(pos.lat) && Number.isFinite(pos.lon)) {
      console.log('✅ Configurando zoom a vuelo:', [pos.lat, pos.lon]);
      setFlyTarget({ lat: pos.lat, lon: pos.lon, zoom: 6, t: Date.now() });
      // Limpiar flyTarget después del zoom para evitar re-renders
      setTimeout(() => setFlyTarget(null), 100);
    }
  }, [vuelos, vuelosFiltrados, nowMs, calcularPosicion]);

  // Callback para seleccionar vuelo desde el panel
  const handleSelectEnvio = useCallback((envio) => {
    const envioObj = typeof envio === "object" ? envio : { envioId: envio };
    const normalizeId = (x) => (x == null ? null : String(x));

    // 1) Si viene vueloId desde el catálogo, usarlo directamente (más confiable y rápido)
    const targetVueloIdStr = normalizeId(envioObj.vueloId);
    if (targetVueloIdStr) {
      // Buscar primero en vuelos mapeados (vuelos con pos calculada al pedirlos)
      let v = vuelos.find(vu => normalizeId(vu.raw?.id) === targetVueloIdStr || normalizeId(vu.idTramo) === targetVueloIdStr);
      if (!v) {
        // Buscar en el cache crudo del último ciclo
        const vc = vuelosCache.find(vu => normalizeId(vu.id) === targetVueloIdStr);
        if (vc) {
          handleSelectVuelo({ id: vc.id, idTramo: vc.id, ...vc }, true);
          return;
        }
      } else {
        handleSelectVuelo({ id: v.idTramo, idTramo: v.idTramo, ...v.raw }, true);
        return;
      }
    }

    // 2) Fallback: buscar por envioId dentro de los vuelos (en mapeados y crudos)
    const envioId = envioObj.envioId ?? envioObj.id;
    if (envioId != null) {
      const vMap = vuelos.find(x => Array.isArray(x.raw?.enviosAsignados) && x.raw.enviosAsignados.some(a => normalizeId(a.envioId ?? a.id) === normalizeId(envioId)));
      if (vMap) {
        handleSelectVuelo({ id: vMap.idTramo, idTramo: vMap.idTramo, ...vMap.raw }, true);
        return;
      }

      const vCache = vuelosCache.find(x => Array.isArray(x.enviosAsignados) && x.enviosAsignados.some(a => normalizeId(a.envioId ?? a.id) === normalizeId(envioId)));
      if (vCache) {
        handleSelectVuelo({ id: vCache.id, idTramo: vCache.id, ...vCache }, true);
        return;
      }
    }

    console.warn("No se pudo localizar el vuelo para el envío", envioObj);
  }, [vuelos, vuelosCache, handleSelectVuelo]);

  // Callback para cuando se cargan envíos con rutas
  const handleEnviosLoaded = useCallback((enviosList) => {
    console.log('🎬 handleEnviosLoaded llamado con', enviosList?.length, 'envíos');
    if (!Array.isArray(enviosList) || enviosList.length === 0) {
      console.log('⚠️ handleEnviosLoaded: lista vacía o inválida');
      return;
    }

    // Mapear envíos planificados por ID de vuelo
    const planificadosPorVuelo = new Map(); // vueloId -> array de envíos resumidos
    for (const envio of enviosList) {
      if (!Array.isArray(envio.vuelosInfo)) continue;
      for (const vInfo of envio.vuelosInfo) {
        const vueloId = vInfo.id;
        if (!vueloId) continue;
        const arr = planificadosPorVuelo.get(vueloId) || [];
        arr.push({
          envioId: envio.id,
          cantidad: envio.numProductos ?? 0,
          cliente: envio.cliente ?? 'N/D',
          origen: vInfo.ciudadOrigen?.nombre ?? vInfo.ciudadOrigen?.ciudad ?? envio.aeropuertoOrigen?.ciudad ?? null,
          destino: vInfo.ciudadDestino?.nombre ?? vInfo.ciudadDestino?.ciudad ?? envio.aeropuertoDestino?.ciudad ?? null,
          horaSalidaPlan: vInfo.horaSalida instanceof Date ? vInfo.horaSalida : null,
          horaLlegadaPlan: vInfo.horaLlegada instanceof Date ? vInfo.horaLlegada : null
        });
        planificadosPorVuelo.set(vueloId, arr);
      }
    }

    // Construir vuelos a inyectar que aún NO existen en el cache
    console.log('🏗️ Construyendo vuelos desde envíos...');
    const vuelosDeEnvios = [];
    const idsVistos = new Set();
    for (const envio of enviosList) {
      if (!Array.isArray(envio.vuelosInfo)) continue;
      for (const vInfo of envio.vuelosInfo) {
        const id = vInfo.id;
        if (!id || idsVistos.has(id)) continue;
        idsVistos.add(id);

        const origen = vInfo.ciudadOrigen;
        const destino = vInfo.ciudadDestino;
        let latOrigen, lonOrigen, latDestino, lonDestino;
        let ciudadOrigenId, ciudadDestinoId;

        if (typeof origen === 'object' && origen !== null) {
          ciudadOrigenId = origen.id;
          latOrigen = parseCoord(origen.latitud ?? origen.lat, { isLat: true, airport: origen });
          lonOrigen = parseCoord(origen.longitud ?? origen.lon, { isLat: false, airport: origen });
        } else {
          ciudadOrigenId = origen;
        }
        if (typeof destino === 'object' && destino !== null) {
          ciudadDestinoId = destino.id;
          latDestino = parseCoord(destino.latitud ?? destino.lat, { isLat: true, airport: destino });
          lonDestino = parseCoord(destino.longitud ?? destino.lon, { isLat: false, airport: destino });
        } else {
          ciudadDestinoId = destino;
        }

        // Normalizar origen/destino como objetos completos para compatibilidad
        // Si solo tenemos ID, buscar en airportsById para obtener la ciudad
        let origenObj, destinoObj;

        if (typeof origen === 'object' && origen !== null) {
          // Intentar obtener ciudad del objeto, si no existe buscar en airportsById
          const ciudadOrigen = origen.ciudad ?? origen.nombre;
          if (ciudadOrigen && ciudadOrigenId && airportsById[ciudadOrigenId]) {
            origenObj = { id: ciudadOrigenId, ciudad: ciudadOrigen, codigo: origen.codigo ?? airportsById[ciudadOrigenId].codigo };
          } else if (ciudadOrigenId && airportsById[ciudadOrigenId]) {
            const apt = airportsById[ciudadOrigenId];
            origenObj = { id: ciudadOrigenId, ciudad: apt.ciudad, codigo: apt.codigo };
          } else {
            origenObj = { id: ciudadOrigenId, ciudad: ciudadOrigen, codigo: origen.codigo };
          }
        } else if (ciudadOrigenId && airportsById[ciudadOrigenId]) {
          const apt = airportsById[ciudadOrigenId];
          origenObj = { id: ciudadOrigenId, ciudad: apt.ciudad, codigo: apt.codigo };
        } else {
          origenObj = { id: ciudadOrigenId, ciudad: null, codigo: null };
        }

        if (typeof destino === 'object' && destino !== null) {
          const ciudadDestino = destino.ciudad ?? destino.nombre;
          if (ciudadDestino && ciudadDestinoId && airportsById[ciudadDestinoId]) {
            destinoObj = { id: ciudadDestinoId, ciudad: ciudadDestino, codigo: destino.codigo ?? airportsById[ciudadDestinoId].codigo };
          } else if (ciudadDestinoId && airportsById[ciudadDestinoId]) {
            const apt = airportsById[ciudadDestinoId];
            destinoObj = { id: ciudadDestinoId, ciudad: apt.ciudad, codigo: apt.codigo };
          } else {
            destinoObj = { id: ciudadDestinoId, ciudad: ciudadDestino, codigo: destino.codigo };
          }
        } else if (ciudadDestinoId && airportsById[ciudadDestinoId]) {
          const apt = airportsById[ciudadDestinoId];
          destinoObj = { id: ciudadDestinoId, ciudad: apt.ciudad, codigo: apt.codigo };
        } else {
          destinoObj = { id: ciudadDestinoId, ciudad: null, codigo: null };
        }

        // Para vuelos inyectados, los envíos planificados SE CONSIDERAN como transportados
        // porque están confirmados en las rutas de envíos del backend
        const enviosPlanificados = planificadosPorVuelo.get(id) || [];
        const enviosAsignadosFormat = enviosPlanificados.map(ep => ({
          envioId: ep.envioId,
          id: ep.envioId,
          cantidad: ep.cantidad,
          cantidadAsignada: ep.cantidad,
          cliente: ep.cliente,
          origen: ep.origen,
          destino: ep.destino
        }));

        const vueloObj = {
          id,
          idTramo: id,
          vueloBaseId: id,
          // Estructura compatible con planificador: origen/destino como objetos
          origen: origenObj,
          destino: destinoObj,
          // Fechas en formato string para parsePlanificadorTime
          horaSalida: vInfo.horaSalida instanceof Date
            ? vInfo.horaSalida.toISOString().slice(0, 16).replace('T', ' ') + ' (UTC+00:00)'
            : null,
          horaLlegada: vInfo.horaLlegada instanceof Date
            ? vInfo.horaLlegada.toISOString().slice(0, 16).replace('T', ' ') + ' (UTC+00:00)'
            : null,
          // Coordenadas ya parseadas
          latOrigen,
          lonOrigen,
          latDestino,
          lonDestino,
          capacidadMaxima: 300,
          capacidadOcupada: enviosPlanificados.reduce((sum, e) => sum + (e.cantidad || 0), 0),
          enviosAsignados: enviosAsignadosFormat,
          __deRutaEnvio: true,
          __historialEnviosCompletos: [],
          __tuvoEnvios: true,
          __enviosPlanificados: [] // Vacío porque ya están en enviosAsignados
        };
        console.log(`🔍 Vuelo inyectado #${id}:`, {
          origen: origenObj,
          destino: destinoObj,
          coords: { latOrigen, lonOrigen, latDestino, lonDestino },
          horaSalida: vueloObj.horaSalida,
          horaLlegada: vueloObj.horaLlegada,
          enviosCount: enviosAsignadosFormat.length
        });
        vuelosDeEnvios.push(vueloObj);
      }
    }

    console.log(`✈️ Total vuelos construidos: ${vuelosDeEnvios.length}`);

    // Actualizar/integrar en cache
    setVuelosCache(prev => {
      console.log(`📊 Cache actual antes de inyectar: ${prev.length} vuelos`);
      console.log('🔍 Vuelos en cache actual:', prev.map(v => `#${v.id} (${v.__deRutaEnvio ? 'inyectado' : 'planner'})`));
      const idsExistentes = new Set(prev.map(v => v.id || v.idTramo));
      let huboCambios = false;
      const actualizados = prev.map(v => {
        const vid = v.id || v.idTramo;
        const extra = planificadosPorVuelo.get(vid);
        if (extra && extra.length > 0) {
          // Si el vuelo viene del planificador (no inyectado), fusionar envíos
          // Si ya es inyectado, preservar sus enviosAsignados
          const yaAsignados = new Set((v.enviosAsignados || []).map(e => e.envioId ?? e.id));
          const nuevosParaAsignar = extra.filter(e => !yaAsignados.has(e.envioId));

          if (nuevosParaAsignar.length > 0) {
            huboCambios = true;
            const nuevosEnvios = nuevosParaAsignar.map(ep => ({
              envioId: ep.envioId,
              id: ep.envioId,
              cantidad: ep.cantidad,
              cantidadAsignada: ep.cantidad,
              cliente: ep.cliente,
              origen: ep.origen,
              destino: ep.destino
            }));

            const capacidadSumada = nuevosParaAsignar.reduce((sum, e) => sum + (e.cantidad || 0), 0);

            return {
              ...v,
              enviosAsignados: [...(v.enviosAsignados || []), ...nuevosEnvios],
              capacidadOcupada: (v.capacidadOcupada || 0) + capacidadSumada,
              __tuvoEnvios: true
            };
          }
        }
        return v;
      });

      const nuevos = vuelosDeEnvios.filter(v => !idsExistentes.has(v.id));
      console.log(`🆕 Vuelos nuevos a inyectar: ${nuevos.length} de ${vuelosDeEnvios.length} totales`);
      console.log('🔑 IDs ya existentes:', Array.from(idsExistentes));
      console.log('🔑 IDs de vuelos a inyectar:', vuelosDeEnvios.map(v => v.id));

      if (nuevos.length > 0) {
        console.log(`📦 Inyectando ${nuevos.length} vuelos nuevos desde rutas de envíos al cache`);
        console.log('✈️ Vuelos inyectados:', nuevos.map(v => `#${v.id} ${v.origen.ciudad} → ${v.destino.ciudad}`));
        huboCambios = true;
        const resultado = [...actualizados, ...nuevos];
        console.log(`✅ Cache actualizado: ${resultado.length} vuelos totales`);
        return resultado;
      }
      if (huboCambios) {
        console.log('🔄 Actualizados vuelos existentes con envíos planificados');
        console.log(`✅ Cache actualizado: ${actualizados.length} vuelos totales`);
        return actualizados;
      }
      console.log('⏭️ Sin cambios en cache');
      return prev; // sin cambios
    });
  }, [airportsById]);

  // 🆕 Inyección automática de vuelos desde rutas de envíos (ahora después de definir handleEnviosLoaded)
  // ⚠️ CAMBIO: No usar ref, sino verificar si hay vuelos inyectados en el cache
  useEffect(() => {
    if (!airportsById || Object.keys(airportsById).length === 0) {
      console.log('⏳ Esperando que aeropuertos estén listos...');
      return;
    }

    // Verificar si ya hay vuelos inyectados en el cache
    const vuelosInyectados = vuelosCache.filter(v => v.__deRutaEnvio);
    console.log('🔍 Verificando inyección automática:', {
      vuelosInyectadosEnCache: vuelosInyectados.length,
      totalVuelosEnCache: vuelosCache.length,
      airportsCount: Object.keys(airportsById).length
    });

    if (vuelosInyectados.length > 0) {
      console.log(`✅ Ya hay ${vuelosInyectados.length} vuelos inyectados en cache, no es necesario reinyectar`);
      return;
    }

    console.log('🚀 No hay vuelos inyectados en cache, iniciando inyección automática...');

    (async () => {
      try {
        console.log('📡 Obteniendo envíos pendientes...');
        const pendientes = await obtenerEnviosPendientes();
        console.log(`📦 Envíos obtenidos: ${pendientes?.length || 0}`);

        if (!Array.isArray(pendientes) || pendientes.length === 0) {
          console.log('⚠️ No hay envíos pendientes para inyectar');
          return;
        }

        const BUFFER_MS = 5 * 60 * 1000;
        const ahora = getSimMs();
        const activos = pendientes.filter(envio => {
          if (!Array.isArray(envio.vuelosInfo) || envio.vuelosInfo.length === 0) return true;
          let maxArrival = 0;
          for (const v of envio.vuelosInfo) {
            const raw = v.horaLlegada || v.horaDestino || v.horaFin;
            const d = raw instanceof Date ? raw : (parsePlanificadorTime(raw) || parseBackendTime(raw) || (raw ? new Date(raw) : null));
            if (!d || isNaN(d.getTime())) continue;
            const hasOffset = /\(UTC[+\-]\d{2}:\d{2}\)/.test(String(raw));
            const SIM_OFFSET_MINUTES = -5 * 60;
            const arrivalMs = hasOffset ? (d.getTime() + SIM_OFFSET_MINUTES * 60 * 1000) : d.getTime();
            if (arrivalMs > maxArrival) maxArrival = arrivalMs;
          }
          if (maxArrival === 0) return true;
          return ahora <= maxArrival + BUFFER_MS;
        });

        console.log(`✂️ Filtrados ${activos.length} envíos activos de ${pendientes.length} totales`);

        activos.sort((a, b) => {
          const fa = a.fechaIngreso ? new Date(a.fechaIngreso).getTime() : 0;
          const fb = b.fechaIngreso ? new Date(b.fechaIngreso).getTime() : 0;
          return fa - fb;
        });

        console.log('🎯 Llamando a handleEnviosLoaded con', activos.length, 'envíos activos');
        handleEnviosLoaded(activos);
        console.log(`🚀 ¡Inyección completada! ${activos.length} envíos procesados`);
      } catch (e) {
        console.error('❌ Error inyectando envíos iniciales:', e);
      }
    })();
  }, [airportsById, vuelosCache, handleEnviosLoaded]);

  // 🆕 Callback para seleccionar ruta de envío completo
  const handleSelectRutaEnvio = useCallback(async (envio) => {
    console.log('📦 Ruta de envío seleccionada:', envio);

    try {
      // Cerrar otros paneles
      setVueloSeleccionado(null);
      setVueloDetalleCompleto(null);
      setAeropuertoDetalle(null);
      setAeropuertoSeleccionado(null);

      // Obtener rutas completas del envío
      const rutasCompletas = await obtenerRutasEnvio(envio.id);

      if (!rutasCompletas || !rutasCompletas.rutas || rutasCompletas.rutas.length === 0) {
        console.warn('No se encontraron rutas para el envío', envio.id);
        setRutasEnvioSeleccionado(null);
        return;
      }

      // Buscar si el envío está en algún vuelo actual
      let vueloActual = null;
      for (const v of vuelos) {
        if (Array.isArray(v.raw?.enviosAsignados) && v.raw.enviosAsignados.some(e => e.envioId === envio.id || e.id === envio.id)) {
          vueloActual = v;
          break;
        }
      }

      if (vueloActual) {
        // Seleccionar el avión y mostrar solo el tramo actual
        setVueloSeleccionado(vueloActual.idTramo);
        setVueloDetalleCompleto(vueloActual);
        setRutasEnvioSeleccionado(null); // No mostrar ruta completa
        // Zoom al avión
        if (Number.isFinite(vueloActual.latOrigen) && Number.isFinite(vueloActual.lonOrigen)) {
          setFlyTarget({ lat: vueloActual.latOrigen, lon: vueloActual.lonOrigen, zoom: 6 });
        }
        return;
      }

      // Si no está en vuelo, mostrar la ruta completa (todos los tramos)
      setRutasEnvioSeleccionado(rutasCompletas);

      // Zoom al primer aeropuerto origen
      if (rutasCompletas.aeropuertoOrigen) {
        const lat = rutasCompletas.aeropuertoOrigen.latitud;
        const lon = rutasCompletas.aeropuertoOrigen.longitud;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setFlyTarget({ lat, lon, zoom: 6 });
        }
      }
    } catch (error) {
      console.error('Error al obtener rutas del envío:', error);
      setRutasEnvioSeleccionado(null);
    }
  }, [vuelos]);

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

    // Cerrar panel de aeropuerto y deseleccionar aeropuerto
    setAeropuertoDetalle(null);
    setAeropuertoSeleccionado(null);

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

    // Acercar el mapa al vuelo usando flyTarget (consistente con aeropuertos)
    if (Number.isFinite(pos.lat) && Number.isFinite(pos.lon)) {
      console.log('✅ Configurando zoom a vuelo:', [pos.lat, pos.lon]);
      setFlyTarget({ lat: pos.lat, lon: pos.lon, zoom: 6, t: Date.now() });
      // Limpiar flyTarget después del zoom para evitar re-renders
      setTimeout(() => setFlyTarget(null), 100);
    }
  }, [vuelos, vuelosFiltrados, nowMs, calcularPosicion]);

  // Callback para cerrar el panel de detalle
  const handleCerrarDetalle = useCallback(() => {
    console.log('🔒 Cerrando panel de detalle');
    setVueloDetalleCompleto(null);
    setVueloSeleccionado(null);
  }, []);

  // Callback para seleccionar aeropuerto
  const handleSelectAeropuerto = useCallback((aeropuerto, shouldZoom = false) => {
    console.log('🏢 Aeropuerto seleccionado:', aeropuerto);
    setVueloDetalleCompleto(null); // cerrar panel vuelo si estaba abierto
    setVueloSeleccionado(null); // deseleccionar vuelo
    setAeropuertoDetalle(aeropuerto);
    setAeropuertoSeleccionado(aeropuerto?.id ?? null);

    // Acercar el mapa al aeropuerto solo si se indica (cuando viene del catálogo)
    const lat = Number(aeropuerto.lat);
    const lon = Number(aeropuerto.lon);
    if (shouldZoom && Number.isFinite(lat) && Number.isFinite(lon)) {
      setFlyTarget({ lat, lon, zoom: 6, t: Date.now() });
      // Limpiar flyTarget después del zoom para evitar re-renders
      setTimeout(() => setFlyTarget(null), 100);
    } else if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn('⚠️ Coordenadas inválidas para aeropuerto seleccionado:', aeropuerto);
    }
  }, []);
  const handleCerrarAeropuerto = useCallback(() => setAeropuertoDetalle(null), []);

  // Cargar capacidades y envíos de aeropuertos
  const cargarCapacidadesAeropuertos = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/aeropuertos/obtenerCapacidades`);
      if (!res.ok) {
        console.error('❌ Error al cargar capacidades de aeropuertos:', res.status);
        return;
      }
      const data = await res.json();
      console.log('✅ Capacidades de aeropuertos cargadas:', data);
      setAeropuertoCapacidades(data);
    } catch (error) {
      console.error('❌ Error al cargar capacidades de aeropuertos:', error);
    }
  }, []);

  // Debug rápido para diagnosticar error appendChild: verificar cantidades y coordenadas
  useEffect(() => {
    try {
      if (Array.isArray(rawAirports)) {
        const invalidA = rawAirports.filter(a => !Number.isFinite(parseFloat(a.latitud ?? a.lat ?? a.latitude)) || !Number.isFinite(parseFloat(a.longitud ?? a.lon ?? a.longitude)));
        if (invalidA.length) console.warn('[DBG] Aeropuertos con coords inválidas:', invalidA.map(a => a.id));
      }
      if (Array.isArray(vuelosFiltrados)) {
        const invalidV = vuelosFiltrados.filter(v => !v.pos || !Number.isFinite(v.pos.lat) || !Number.isFinite(v.pos.lon));
        if (invalidV.length) console.warn('[DBG] Vuelos con coords inválidas:', invalidV.map(v => v.idTramo));
      }
      console.log('[DBG] Conteos -> aeropuertos:', (rawAirports || []).length, 'vuelosFiltrados:', (vuelosFiltrados || []).length);
    } catch (e) { /* noop */ }
  }, [rawAirports, vuelosFiltrados]);

  return (
    <div style={{ width: "100%", height: "90vh", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 1400, display: "flex", gap: 12, alignItems: "center", pointerEvents: "auto" }}>
        <HoraActual simulacionIniciada={simulacionIniciada} startStr={null} style={{ position: "relative" }} />
        <SimulationControls startStr={null} />
      </div>

      {/* ✅ Botón de filtro: Solo vuelos con envíos */}
      <button
        onClick={() => setSoloConEnvios(!soloConEnvios)}
        style={{
          position: "absolute",
          top: 10,
          right: 20,
          zIndex: 1400,
          padding: "10px 16px",
          background: soloConEnvios ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "linear-gradient(135deg, #64748b 0%, #475569 100%)",
          color: "white",
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 13,
          boxShadow: soloConEnvios ? "0 4px 12px rgba(16, 185, 129, 0.4)" : "0 4px 12px rgba(0,0,0,0.15)",
          pointerEvents: "auto",
          transition: "all 0.3s ease",
          display: "flex",
          alignItems: "center",
          gap: 8
        }}
        title={soloConEnvios ? "Mostrando solo vuelos con envíos" : "Mostrando todos los vuelos"}
      >
        <span style={{ fontSize: 16 }}>📦</span>
        <span>{soloConEnvios ? "Solo con Envíos" : "Todos los Vuelos"}</span>
      </button>

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
        onSelectVuelo={handleSelectVueloPanel}
        onSelectEnvio={handleSelectEnvio}
        onSelectAeropuerto={(a) => handleSelectAeropuerto(a, true)}
        onSelectRutaEnvio={handleSelectRutaEnvio}
        aeropuertos={airports}
        vuelosCache={vuelosCache}
        envios={enviosEnCirculacion}
        vuelosConEnvios={vuelosConEnvios}
        selectedVuelo={vueloDetalleCompleto}
        onEnviosLoaded={handleEnviosLoaded}
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
            vuelosEnTransito={vuelosFiltrados}
            aeropuertoCapacidades={aeropuertoCapacidades}
            onClose={handleCerrarAeropuerto}
            onRefresh={cargarCapacidadesAeropuertos}
          />
        )
      )}

      {rawAirports !== null && (
        <MapContainer
          center={center}
          zoom={airports.length ? 3 : 3}
          minZoom={2}
          maxZoom={18}
          zoomAnimation={true}
          fadeAnimation={true}
          markerZoomAnimation={true}
          style={{ width: "100%", height: "100%" }}
          worldCopyJump={true}
          maxBounds={[[-85, -Infinity], [85, Infinity]]}
          maxBoundsViscosity={1.0}
          preferCanvas={true}
          renderer={canvasRenderer}
          whenCreated={(map) => {
            console.log('🗺️ Mapa creado con Canvas renderer para optimización');
            mapRef.current = map;
            setTimeout(() => map.invalidateSize(), 50);
            try {
              map.on('movestart', () => setNavegando(true));
              map.on('zoomstart', () => setNavegando(true));
              map.on('moveend', () => setNavegando(false));
              map.on('zoomend', () => setNavegando(false));
            } catch { }
          }}
        >
          {/* Controlador de vuelo suave al target seleccionado */}
          <SmoothFlyTo target={flyTarget} />
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            noWrap={false}
            updateWhenIdle={true}
            keepBuffer={2}
          />

          {/* 📦 Rutas de envío completas (todas las partes y sus vuelos) */}
          {rutasEnvioSeleccionado && rutasEnvioSeleccionado.rutas && rutasEnvioSeleccionado.rutas.map((ruta, rutaIdx) => {
            // Colores diferenciados por parte
            const coloresPorParte = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
            const colorRuta = coloresPorParte[rutaIdx % coloresPorParte.length];

            return ruta.vuelos.map((vuelo, vueloIdx) => {
              // Encontrar aeropuertos origen y destino
              const origenAirport = airportsById[vuelo.ciudadOrigen];
              const destinoAirport = airportsById[vuelo.ciudadDestino];

              if (!origenAirport || !destinoAirport) return null;

              const positions = greatCirclePoints(
                origenAirport.lat,
                origenAirport.lon,
                destinoAirport.lat,
                destinoAirport.lon,
                64
              );

              return (
                <Polyline
                  key={`envio-ruta-${rutasEnvioSeleccionado.envioId}-parte-${rutaIdx}-vuelo-${vueloIdx}`}
                  positions={positions}
                  pathOptions={{
                    color: colorRuta,
                    weight: 3,
                    opacity: 0.7,
                    dashArray: '10,10',
                  }}
                />
              );
            });
          })}

          {airports.map(a => {
            const isSelected = aeropuertoSeleccionado === a.id;
            return (
              <Fragment key={`ap-frag-${a.id}`}>
                <Marker
                  key={`ap-${a.id}`}
                  position={[a.lat, a.lon]}
                  icon={pickIconAirport(a)}
                  zIndexOffset={isSelected ? 800 : 0}
                  eventHandlers={{ click: () => handleSelectAeropuerto(a, false) }}
                >
                  <Tooltip
                    direction="top"
                    offset={[0, -10]}
                    opacity={0.95}
                    permanent={false}
                  >
                    <div style={{
                      background: '#fff',
                      color: '#0f172a',
                      padding: '6px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600
                    }}>
                      {a.ciudad}{a.codigo ? ` (${a.codigo})` : ""}
                      {a.porcentaje != null && (
                        <div style={{ fontSize: 10, marginTop: 2 }}>
                          {a.capacidadOcupada}/{a.capacidadMaxima} ({a.porcentaje}%)
                        </div>
                      )}
                    </div>
                  </Tooltip>
                </Marker>
                {isSelected && (
                  <CircleMarker
                    key={`ap-hl-${a.id}`}
                    center={[a.lat, a.lon]}
                    radius={14}
                    pathOptions={{ color: '#2563eb', weight: 3, fill: false, dashArray: '6,4' }}
                  />
                )}
              </Fragment>
            );
          })}

          {/* Renderiza solo los vuelos filtrados */}
          {vuelosFiltrados.map(v => {
            const { pos } = v;
            if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;
            const isSelected = vueloSeleccionado === v.idTramo;

            // Capacidad y color por capacidad
            const capacidadMax = v.raw?.capacidadMaxima || 300;
            // Calcular capacidad ocupada usando historial si no hay envíos actuales
            let capacidadOcupada = Array.isArray(v.raw?.enviosAsignados) && v.raw.enviosAsignados.length > 0
              ? v.raw.enviosAsignados.reduce((sum, e) => sum + (e.cantidad ?? e.cantidadAsignada ?? 0), 0)
              : (Array.isArray(v.raw?.__historialEnviosCompletos) && v.raw.__historialEnviosCompletos.length > 0
                ? v.raw.__historialEnviosCompletos.reduce((sum, e) => sum + (e.cantidad ?? e.cantidadAsignada ?? 0), 0)
                : 0);
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
                  opacity={0.9}
                  permanent={false}
                >
                  <div style={{
                    background: '#fff',
                    color: '#0f172a',
                    padding: '6px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    minWidth: 140
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 3, color: isSelected ? '#2563eb' : '#1976d2' }}>
                      ✈️ #{v.idTramo}
                    </div>
                    <div style={{ fontSize: 10, marginBottom: 2 }}>
                      {v.ciudadOrigenName || "?"} → {v.ciudadDestinoName || "?"}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {(pos.progreso * 100).toFixed(0)}% • {capacidadOcupada}/{capacidadMax}
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}

          {/* ⭐ Ruta completa del envío si no está en vuelo */}
          {rutasEnvioSeleccionado && rutasEnvioSeleccionado.rutas && rutasEnvioSeleccionado.rutas.length > 0 && (
            <Polyline
              key={`ruta-envio-${rutasEnvioSeleccionado.id}`}
              positions={rutasEnvioSeleccionado.rutas.map(r => [r.latOrigen, r.lonOrigen]).concat([[rutasEnvioSeleccionado.rutas[rutasEnvioSeleccionado.rutas.length - 1].latDestino, rutasEnvioSeleccionado.rutas[rutasEnvioSeleccionado.rutas.length - 1].lonDestino]])}
              weight={4}
              color="#2563eb"
              opacity={0.8}
              dashArray="8,4"
              lineJoin="round"
              lineCap="round"
            />
          )}
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

        </MapContainer>
      )}

      {/* 🎯 Modal de resumen de simulación */}
      <ResumenSimulacion
        isOpen={mostrarResumen}
        onClose={() => setMostrarResumen(false)}
        enviosEntregados={datosResumen.enviosEntregados}
        productosEntregados={datosResumen.productosEntregados}
        tiempoSimulacion={datosResumen.tiempoSimulacion}
      />
    </div>
  );
}

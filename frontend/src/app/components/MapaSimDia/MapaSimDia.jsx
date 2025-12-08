"use client";

import { useEffect, useRef, useState, useMemo, useCallback, Fragment } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import HoraActual from "./HoraActual";
import { subscribe, getSimMs, isRunning } from "../../../lib/simTime";
import { fetchVuelos, getCachedFlights } from "../../../lib/vuelos";
import { Plane, Menu } from "lucide-react";
import ReactDOMServer from "react-dom/server";
import SimulationControlsDia from "./SimulationControls";
import PanelCatalogos from "./PanelCatalogos";
import PanelVueloDetalle from "./PanelVueloDetalle";
import PanelAeropuertoDetalle from "./PanelAeropuertoDetalle";

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

// ✅ ÍCONOS PERSONALIZADOS PARA ALMACENES (respuesta a retroalimentación del profesor)
// Almacén Principal: Edificio industrial con estrella (Lima, Bruselas, Bakú)
const AlmacenPrincipalIcon = L.divIcon({
  className: '',
  html: `
    <div style="position: relative; width: 32px; height: 32px; background: transparent; border: none;">
      <svg viewBox="0 0 24 24" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <!-- Almacén industrial -->
        <rect x="2" y="8" width="20" height="14" rx="1" fill="#1e40af" stroke="#1e3a8a" stroke-width="1"/>
        <!-- Techo de almacén (forma industrial) -->
        <path d="M1 8 L12 2 L23 8" fill="none" stroke="#1e3a8a" stroke-width="1.5"/>
        <rect x="2" y="4" width="20" height="4" fill="#3b82f6"/>
        <!-- Puerta de carga -->
        <rect x="8" y="13" width="8" height="9" fill="#60a5fa" stroke="#1e3a8a" stroke-width="0.5"/>
        <!-- Líneas de puerta de garaje -->
        <line x1="8" y1="15" x2="16" y2="15" stroke="#1e3a8a" stroke-width="0.5"/>
        <line x1="8" y1="17" x2="16" y2="17" stroke="#1e3a8a" stroke-width="0.5"/>
        <line x1="8" y1="19" x2="16" y2="19" stroke="#1e3a8a" stroke-width="0.5"/>
        <!-- Cajas apiladas (símbolo de almacén) -->
        <rect x="3" y="14" width="4" height="3" fill="#fbbf24" stroke="#f59e0b" stroke-width="0.3"/>
        <rect x="17" y="14" width="4" height="3" fill="#fbbf24" stroke="#f59e0b" stroke-width="0.3"/>
        <rect x="4" y="11" width="3" height="3" fill="#fcd34d" stroke="#f59e0b" stroke-width="0.3"/>
        <!-- Estrella (indica principal) -->
        <polygon points="12,0 13,3 16,3 13.5,5 14.5,8 12,6 9.5,8 10.5,5 8,3 11,3" fill="#fbbf24" stroke="#f59e0b" stroke-width="0.3"/>
      </svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 30],
  popupAnchor: [0, -30]
});

// Función para crear ícono de almacén intermedio con color según capacidad
const createAlmacenIntermedioIcon = (color) => {
  const colors = {
    green: { fill: '#16a34a', stroke: '#15803d', light: '#4ade80', box: '#86efac' },
    orange: { fill: '#ea580c', stroke: '#c2410c', light: '#fb923c', box: '#fdba74' },
    red: { fill: '#dc2626', stroke: '#b91c1c', light: '#f87171', box: '#fca5a5' },
    violet: { fill: '#7c3aed', stroke: '#6d28d9', light: '#a78bfa', box: '#c4b5fd' }
  };
  const c = colors[color] || colors.green;

  return L.divIcon({
    className: '',
    html: `
      <div style="position: relative; width: 28px; height: 28px; background: transparent; border: none;">
        <svg viewBox="0 0 20 20" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
          <!-- Almacén pequeño -->
          <rect x="2" y="6" width="16" height="12" rx="1" fill="${c.fill}" stroke="${c.stroke}" stroke-width="0.8"/>
          <!-- Techo -->
          <rect x="2" y="4" width="16" height="3" fill="${c.light}"/>
          <!-- Puerta de carga -->
          <rect x="6" y="10" width="8" height="8" fill="${c.light}" stroke="${c.stroke}" stroke-width="0.4"/>
          <!-- Líneas de puerta -->
          <line x1="6" y1="12" x2="14" y2="12" stroke="${c.stroke}" stroke-width="0.4"/>
          <line x1="6" y1="14" x2="14" y2="14" stroke="${c.stroke}" stroke-width="0.4"/>
          <line x1="6" y1="16" x2="14" y2="16" stroke="${c.stroke}" stroke-width="0.4"/>
          <!-- Cajas -->
          <rect x="2.5" y="11" width="3" height="2.5" fill="${c.box}" stroke="${c.stroke}" stroke-width="0.2"/>
          <rect x="14.5" y="11" width="3" height="2.5" fill="${c.box}" stroke="${c.stroke}" stroke-width="0.2"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
    popupAnchor: [0, -26]
  });
};

// Íconos de almacén intermedio por estado de capacidad
const AlmacenIntermedioGreenIcon = createAlmacenIntermedioIcon('green');
const AlmacenIntermedioOrangeIcon = createAlmacenIntermedioIcon('orange');
const AlmacenIntermedioRedIcon = createAlmacenIntermedioIcon('red');
const AlmacenIntermedioUnknownIcon = createAlmacenIntermedioIcon('violet');// Controlador para realizar flyTo desde dentro del contexto del mapa
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

function containsDirectionLetter(str) {
  if (!str) return null;
  const m = String(str).match(/[NnSsEeWw]/);
  return m ? m[0].toUpperCase() : null;
}

const southCountries = new Set(["peru", "perú", "chile", "argentina", "uruguay", "paraguay", "bolivia", "brasil", "brazil", "ecuador"]);

function normalizeCountryName(name) {
  if (!name) return "";
  return String(name).trim().toLowerCase();
}

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

function parsePlanificadorTime(s) {
  if (!s || typeof s !== "string") return null;

  const t = s.trim();

  // 2025-01-02 03:00 (UTC+00:00)  | offset opcional
  const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?:\s*\(UTC([+\-]\d{2}):(\d{2})\))?$/);

  if (!m) {
    const d = new Date(t.replace(/\s*\(UTC[^\)]+\)\s*$/, ""));// fallback sin el sufijo
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

export default function MapaSimDiaria() {
  const mapRef = useRef(null);
  const fechaInicioSimRef = useRef(null);
  const [rawAirports, setRawAirports] = useState(null);
  const [aeropuertoSeleccionado, setAeropuertoSeleccionado] = useState(null);
  const [dynamicAirports, setDynamicAirports] = useState(null); // ← aeropuertos desde /vuelos-ultimo-ciclo
  const [rawVuelos, setRawVuelos] = useState(null);
  const [vuelosCache, setVuelosCache] = useState([]); // ← NUEVO: caché local de vuelos
  const [vueloSeleccionado, setVueloSeleccionado] = useState(null);
  const [soloConEnvios, setSoloConEnvios] = useState(false);
  const [horizonte, setHorizonte] = useState(null); // ← nuevo
  const [navegando, setNavegando] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [vueloDetalleCompleto, setVueloDetalleCompleto] = useState(null);
  const [aeropuertoDetalle, setAeropuertoDetalle] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);

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
        setHorizonte(data?.horizonte || null);
        const vuelosNuevos = Array.isArray(data?.vuelos) ? data.vuelos : [];

        // ✅ NUEVO: Actualizar aeropuertos dinámicos con capacidades desde backend
        if (Array.isArray(data?.aeropuertos)) {
          setDynamicAirports(data.aeropuertos);
        }

        // ✅ FUSIONAR: Preservar vuelos del cache que aún están volando
        setVuelosCache(prev => {
          // ⚠️ IMPORTANTE: Usar tiempo de SIMULACIÓN, no tiempo real del sistema
          const ahoraSimulacion = getSimMs();
          const margenSeguridad = 5 * 60 * 1000; // 5 minutos de margen para evitar desapariciones abruptas

          // Mantener vuelos antiguos que aún NO han llegado a destino (según tiempo de simulación)
          const vuelosVigentes = prev.filter(v => {
            const llegada = parsePlanificadorTime(v.horaLlegada);
            // Mantener si la hora de llegada aún no ha pasado (con margen de seguridad)
            return llegada && llegada.getTime() > (ahoraSimulacion - margenSeguridad);
          });

          // Crear mapa de IDs de vuelos nuevos
          const idsNuevos = new Set(vuelosNuevos.map(v => v.id));

          // Mantener vuelos antiguos que NO están en el nuevo array (y aún están volando)
          const vuelosAntiguos = vuelosVigentes.filter(v => !idsNuevos.has(v.id));

          // Memoria local: historial de vuelos que alguna vez tuvieron envíos (preservar objetos completos)
          const historialEnvios = {};
          // Cargar historial previo (preservar objetos de envío, no solo IDs)
          for (const v of prev) {
            if (Array.isArray(v.__historialEnviosCompletos)) {
              historialEnvios[v.id] = [...v.__historialEnviosCompletos];
            } else if (Array.isArray(v.enviosAsignados) && v.enviosAsignados.length > 0) {
              historialEnvios[v.id] = [...v.enviosAsignados];
            }
          }

          // Marcar en los vuelos nuevos si alguna vez tuvieron envíos asignados
          const vuelosNuevosMarcados = vuelosNuevos.map(v => {
            let __tuvoEnvios = false;
            let __historialEnviosCompletos = historialEnvios[v.id] || [];
            let __historialEnviosIds = new Set(__historialEnviosCompletos.map(e => e.envioId ?? e.id ?? e.envio_id));

            if (Array.isArray(v.enviosAsignados) && v.enviosAsignados.length > 0) {
              __tuvoEnvios = true;
              // Agregar nuevos envíos al historial si no están ya
              for (const e of v.enviosAsignados) {
                const eId = e.envioId ?? e.id ?? e.envio_id;
                if (!__historialEnviosIds.has(eId)) {
                  __historialEnviosCompletos.push(e);
                  __historialEnviosIds.add(eId);
                }
              }
            } else if (__historialEnviosCompletos.length > 0) {
              __tuvoEnvios = true;
            }
            return {
              ...v,
              __tuvoEnvios,
              __historialEnvios: Array.from(__historialEnviosIds),
              __historialEnviosCompletos
            };
          });

          // Combinar: nuevos + antiguos que siguen volando
          const resultado = [...vuelosNuevosMarcados, ...vuelosAntiguos];

          if (vuelosAntiguos.length > 0) {
            console.log(`🔄 Caché actualizado: ${vuelosNuevos.length} nuevos + ${vuelosAntiguos.length} anteriores = ${resultado.length} total`);
            console.log(`✈️ Vuelos antiguos mantenidos:`, vuelosAntiguos.map(v => `#${v.id} (llega: ${v.horaLlegada})`));
          }

          // Log de vuelos con historial de envíos
          const vuelosConHistorial = resultado.filter(v => v.__historialEnviosCompletos?.length > 0);
          if (vuelosConHistorial.length > 0) {
            console.log(`📦 Vuelos con historial de envíos:`, vuelosConHistorial.map(v => `#${v.id} (${v.__historialEnviosCompletos.length} envíos históricos, ${v.enviosAsignados?.length || 0} actuales)`));
          }

          return resultado;
        });

        setRawVuelos(vuelosNuevos);
        console.log('✈️ Vuelos procesados:', vuelosNuevos.length);
      } catch (err) {
        console.error("fetch vuelos-ultimo-ciclo:", err);
        if (mounted) setRawVuelos([]);
      }
    }

    loadUltimoCiclo();
    const iv = setInterval(loadUltimoCiclo, 10_000); // consultar vuelos-ultimo-ciclo cada 10 seg
    // Escuchar inicio explícito del planificador para refrescar inmediatamente
    const onPlanificadorIniciado = () => {
      // Refresco inmediato y un par de reintentos rápidos para capturar datos recientes
      loadUltimoCiclo();
      setTimeout(loadUltimoCiclo, 1500);
      setTimeout(loadUltimoCiclo, 3500);
    };
    try { window.addEventListener('planificador:iniciado', onPlanificadorIniciado); } catch { }

    return () => {
      mounted = false; cancelled = true; clearInterval(iv);
      try { window.removeEventListener('planificador:iniciado', onPlanificadorIniciado); } catch { }
    };
  }, []);

  // Resetear estado cuando se inicia nueva simulación
  useEffect(() => {
    if (isRunning()) {
      fechaInicioSimRef.current = null;
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

  // GRAFICAR aeropuertos dinámicos
  const airportsBase = useMemo(() => {
    if (!Array.isArray(rawAirports)) return [];

    // Crear mapa de capacidades dinámicas desde backend
    const dynamicMap = {};
    if (Array.isArray(dynamicAirports)) {
      dynamicAirports.forEach(a => {
        const id = a.id ?? a.idAeropuerto;
        if (id != null) {
          dynamicMap[id] = {
            capacidadOcupada: a.capacidadOcupada ?? 0,
            capacidadMaxima: a.capacidadMaxima ?? a.capacidad ?? null
          };
        }
      });
    }

    return rawAirports.map(a => {
      const lat = parseCoord(a.latitud ?? a.lat ?? a.latitude, { isLat: true, airport: a });
      const lon = parseCoord(a.longitud ?? a.lon ?? a.longitude, { isLat: false, airport: a });

      // Usar capacidades dinámicas del backend si existen, sino usar estáticas
      const dynamic = dynamicMap[a.id] || {};
      const ilimitado = esAeropuertoPrincipal(a);
      const capacidadMaxima = ilimitado ? null : (dynamic.capacidadMaxima ?? a.capacidadMaxima ?? a.capacidad ?? null);
      const capacidadOcupada = ilimitado ? 0 : (dynamic.capacidadOcupada ?? a.capacidadOcupada ?? 0);

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
  }, [rawAirports, dynamicAirports, esAeropuertoPrincipal]);

  const airportsById = useMemo(() => {
    const map = {};
    for (const a of airportsBase) map[a.id] = a;
    return map;
  }, [airportsBase]);

  // Mapear respuesta usando vuelosCache en lugar de rawVuelos
  const vuelos = useMemo(() => {
    if (!Array.isArray(vuelosCache)) return [];

    return vuelosCache.map(p => {
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
        raw: { ...p, capacidadOcupada },
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
    const city = String(a.ciudad ?? "").toLowerCase();
    const code = String(a.codigo ?? "").toLowerCase();

    // ✅ Almacenes principales (Lima, Bruselas, Bakú) - Ícono de edificio grande con estrella
    if (city.includes("lima") || code === "spim" || code === "spjc")
      return AlmacenPrincipalIcon;
    if (city.includes("brus") || city.includes("brussels") || code.startsWith("eb"))
      return AlmacenPrincipalIcon;
    if (city.includes("baku") || code === "gyd" || code === "ubbb")
      return AlmacenPrincipalIcon;

    // ✅ Almacenes intermedios/oficinas de paso - Ícono de edificio según capacidad
    const pct = a.porcentaje;
    if (pct == null) return AlmacenIntermedioUnknownIcon;
    if (pct < 50) return AlmacenIntermedioGreenIcon;
    if (pct < 80) return AlmacenIntermedioOrangeIcon;
    return AlmacenIntermedioRedIcon;
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

  const center = airports.length ?
    [airports[0].lat, airports[0].lon] : [-12.0464, -77.0428];

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

      const tieneEnvios = Array.isArray(v.raw?.enviosAsignados) && v.raw.enviosAsignados.length > 0;

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
      // Mostrar vuelos que tienen o tuvieron envíos durante el buffer
      return list.filter(v => v.tieneEnvios || v.raw?.__tuvoEnvios);
    }
    return list;
  }, [vuelos, throttledNowMs, calcularPosicion, soloConEnvios]);

  // Solo vuelos en el aire que sí tienen envíos (para el catálogo)
  const vuelosConEnvios = useMemo(() => {
    return vuelosFiltrados.filter(v => v.tieneEnvios);
  }, [vuelosFiltrados]); // ← ya depende de vuelosFiltrados que incluye nowMs

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
  const handleSelectAeropuerto = useCallback((a, shouldZoom = false) => {
    console.log('🏢 Aeropuerto seleccionado:', a);
    setVueloDetalleCompleto(null); // cerrar panel vuelo si estaba abierto
    setVueloSeleccionado(null); // deseleccionar vuelo
    setAeropuertoDetalle(a);
    setAeropuertoSeleccionado(a?.id ?? null);

    // Acercar el mapa al aeropuerto solo si se indica (cuando viene del catálogo)
    const lat = Number(a.lat);
    const lon = Number(a.lon);
    if (shouldZoom && Number.isFinite(lat) && Number.isFinite(lon)) {
      setFlyTarget({ lat, lon, zoom: 6, t: Date.now() });
      // Limpiar flyTarget después del zoom para evitar re-renders
      setTimeout(() => setFlyTarget(null), 100);
    } else if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn('⚠️ Coordenadas inválidas para aeropuerto seleccionado:', a);
    }
  }, []);
  const handleCerrarAeropuerto = useCallback(() => setAeropuertoDetalle(null), []);


  return (
    <div style={{ width: "100%", height: "90vh", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 1400, display: "flex", gap: 12, alignItems: "center", pointerEvents: "auto" }}>
        <HoraActual style={{ position: "relative" }} />
        <SimulationControlsDia />
      </div>

      {/* ✅ Botón de filtro: Solo vuelos con envíos */}
      <button
        onClick={() => setSoloConEnvios(!soloConEnvios)}
        className="btn-envios"
        style={{
          background: soloConEnvios ?
            "linear-gradient(135deg, #10b981 0%, #059669 100%)" :
            "linear-gradient(135deg, #64748b 0%, #475569 100%)",
          boxShadow: soloConEnvios ?
            "0 4px 12px rgba(16, 185, 129, 0.4)" :
            "0 4px 12px rgba(0,0,0,0.15)",
        }}
        title={soloConEnvios ?
          "Mostrando solo vuelos con envíos" :
          "Mostrando todos los vuelos"}
      >
        <span style={{ fontSize: 16 }}>📦</span>
        <span>{soloConEnvios ?
          "Solo con Envíos" :
          "Todos los Vuelos"}
        </span>
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
        aeropuertos={airports}
        vuelosCache={vuelosCache}
        envios={enviosEnCirculacion}
        vuelosConEnvios={vuelosConEnvios}
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
            onClose={handleCerrarAeropuerto}
          />
        )
      )}

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
            : capacidadPct < 50 ? "#10b981" : capacidadPct < 80 ? "#f59e0b" : "#dc2626";

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
    </div>
  );
}

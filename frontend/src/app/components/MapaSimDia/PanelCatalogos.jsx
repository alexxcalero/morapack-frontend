'use client';

import { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import { X, Package, Plane, MapPin, Search, Route, Loader2 } from 'lucide-react';
import { subscribe, getSimMs } from '../../../lib/simTime';
import { obtenerEnviosPendientes, obtenerEnviosPlanificadosConRutas, buscarEnviosPorId } from '../../../lib/envios';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

// Función para parsear fechas del backend
// ✅ Parser para backend tipo:
// "2025-01-01 03:34:00Z-5"  | "2025-01-01 03:34:00Z+2" | "2025-01-01 03:34:00" | ISO normal
function parseBackendTime(s) {
    if (!s) return null;
    const t = String(s).trim();

    // Caso A: "YYYY-MM-DD HH:mm:ssZ-5" o "YYYY-MM-DD HH:mm:ssZ+2"
    const m = t.match(
        /^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:Z)?([+\-]?\d+)?$/
    );

    if (m) {
        const [, datePart, hhStr, mmStr, ssStr, offStr] = m;
        const [y, mo, day] = datePart.split("-").map((x) => parseInt(x, 10));
        const hh = parseInt(hhStr, 10);
        const mm = parseInt(mmStr, 10);
        const ss = parseInt(ssStr, 10);

        // offStr = -5, +2, etc. (horas)
        const offH = offStr ? parseInt(offStr, 10) : 0;

        // Interpreto la hora como "hora local expresada en UTC±offH"
        // Para pasar a UTC real: UTC = (horaLocal - offH)
        const utcMillis = Date.UTC(y, mo - 1, day, hh - offH, mm, ss);
        return new Date(utcMillis);
    }

    // Caso B: cualquier otro formato que Date entienda (ISO, etc.)
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

// ✅ Parser para planificador tipo:
// "YYYY-MM-DD HH:mm" o "YYYY-MM-DD HH:mm:ss" opcional
// con "(UTC-05:00)" opcional
function parsePlanificadorTime(s) {
    if (!s || typeof s !== "string") return null;

    const t = s.trim();
    const m = t.match(
        /^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?(?:\s*\(UTC([+\-]\d{2}):(\d{2})\))?$/
    );

    if (!m) {
        // quita "(UTC...)" si existe y deja que Date intente
        const d = new Date(t.replace(/\s*\(UTC[^\)]+\)\s*$/, ""));
        return isNaN(d.getTime()) ? null : d;
    }

    const [, datePart, hhStr, mmStr, ssStr = "0", offHStr = "+00", offMStr = "00"] = m;

    const [y, mo, day] = datePart.split("-").map((x) => parseInt(x, 10));
    const hh = parseInt(hhStr, 10);
    const mm = parseInt(mmStr, 10);
    const ss = parseInt(ssStr, 10) || 0;

    const offH = parseInt(offHStr, 10);
    const offM = parseInt(offMStr, 10);

    const sign = offH >= 0 ? 1 : -1;
    const offsetMinutes = Math.abs(offH) * 60 + (offM || 0);
    const totalOffsetMs = sign * offsetMinutes * 60 * 1000;

    const localAsUtcMs = Date.UTC(y, mo - 1, day, hh, mm, ss);
    const utcMillis = localAsUtcMs - totalOffsetMs;
    return new Date(utcMillis);
}



// Componente optimizado para items de aeropuerto
const AeropuertoItem = memo(({ item, onSelect }) => {
    const ilimitado = item?.ilimitado === true;
    const porcentaje = !ilimitado && item.capacidadMaxima > 0
        ? Math.round((item.capacidadOcupada / item.capacidadMaxima) * 100)
        : 0;
    const color = porcentaje < 50 ? '#10b981' : porcentaje < 80 ? '#f59e0b' : '#ef4444';
    const paisTexto = typeof item?.pais === 'string'
        ? item.pais
        : (item?.pais?.nombre || item?.raw?.pais?.nombre || 'N/A');

    return (
        <div
            onClick={() => {
                if (typeof onSelect === "function") onSelect(item);
            }}
            style={{
                padding: '12px',
                borderBottom: '1px solid #e5e7eb',
                background: '#fafafa',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fafafa'}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <MapPin size={16} color="#1976d2" />
                <span style={{ fontWeight: 700, color: '#1976d2', fontSize: 14 }}>
                    {item.ciudad || 'N/A'} ({item.codigo || 'N/A'})
                </span>
            </div>

            <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>
                {paisTexto}
            </div>

            {!ilimitado && (
                <>
                    <div style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>
                        Capacidad: {item.capacidadOcupada || 0} / {item.capacidadMaxima || 'N/D'}
                    </div>
                    <div style={{
                        width: '100%',
                        height: 6,
                        background: '#e5e7eb',
                        borderRadius: 3,
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${porcentaje}%`,
                            height: '100%',
                            background: color,
                            transition: 'width 0.3s ease',
                            borderRadius: 3
                        }} />
                    </div>
                    <div style={{ fontSize: 10, marginTop: 2, textAlign: 'right', color }}>
                        {porcentaje}%
                    </div>
                </>
            )}
        </div>
    );
});

AeropuertoItem.displayName = 'AeropuertoItem';

// Componente optimizado para items de vuelo
const VueloItem = memo(({ item, index, aeropuertos, onSelect }) => {
    const origenNombre = item.origen?.ciudad
        ? `${item.origen.ciudad}${item.origen.codigo ? ` (${item.origen.codigo})` : ''}`
        : (() => {
            const ap = aeropuertos.find(a => a.id === (item.ciudadOrigen ?? item.origen?.id));
            return ap ? `${ap.ciudad} (${ap.codigo})` : `ID ${item.ciudadOrigen ?? item.origen?.id ?? "?"}`;
        })();

    const destinoNombre = item.destino?.ciudad
        ? `${item.destino.ciudad}${item.destino.codigo ? ` (${item.destino.codigo})` : ''}`
        : (() => {
            const ap = aeropuertos.find(a => a.id === (item.ciudadDestino ?? item.destino?.id));
            return ap ? `${ap.ciudad} (${ap.codigo})` : `ID ${item.ciudadDestino ?? item.destino?.id ?? "?"}`;
        })();

    const horaInicio =
        parsePlanificadorTime(item.horaSalida) ||
        parseBackendTime(item.horaSalida) ||
        parseBackendTime(item.horaOrigen);

    const horaFin =
        parsePlanificadorTime(item.horaLlegada) ||
        parseBackendTime(item.horaLlegada) ||
        parseBackendTime(item.horaDestino);


    const formatearFecha = (fecha) => {
        if (!fecha) return 'N/A';
        return fecha.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Calcular capacidad ocupada usando historial si no hay envíos actuales
    let enviosActuales = Array.isArray(item.enviosAsignados) ? item.enviosAsignados : [];
    let historialEnvios = Array.isArray(item.__historialEnviosCompletos) ? item.__historialEnviosCompletos : [];
    let capacidadOcupada = enviosActuales.length > 0
        ? enviosActuales.reduce((sum, e) => sum + (e.cantidad ?? e.cantidadAsignada ?? 0), 0)
        : historialEnvios.reduce((sum, e) => sum + (e.cantidad ?? e.cantidadAsignada ?? 0), 0);
    const capacidadPct = item.capacidadMaxima > 0
        ? Math.round((capacidadOcupada / item.capacidadMaxima) * 100)
        : 0;

    return (
        <div
            key={item.id || index}
            onClick={() => {
                if (typeof onSelect === "function") onSelect(item);
            }}
            style={{
                padding: '12px',
                borderBottom: '1px solid #e5e7eb',
                fontSize: 13,
                background: '#fafafa',
                cursor: 'pointer',
                transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fafafa'}
        >
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#1976d2', fontSize: 14 }}>
                ✈️ Vuelo #{item.id || item.idTramo}
            </div>

            <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
                <span style={{ color: '#16a34a' }}>{origenNombre}</span>
                {' → '}
                <span style={{ color: '#dc2626' }}>{destinoNombre}</span>
            </div>

            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                <div>🛫 Salida: {formatearFecha(horaInicio)}</div>
                <div>🛬 Llegada: {formatearFecha(horaFin)}</div>
            </div>

            <div style={{ fontSize: 11, color: '#374151' }}>
                Capacidad: {capacidadOcupada} / {item.capacidadMaxima || 'N/D'} ({capacidadPct}%)
            </div>
        </div>
    );
});

VueloItem.displayName = 'VueloItem';

// Componente para envío agrupado
const EnvioItem = memo(({ envio, onSelect }) => {
    return (
        <button
            onClick={() => {
                if (typeof onSelect === "function") onSelect(envio);
            }}
            style={{
                width: '100%',
                textAlign: 'left',
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#1976d2';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#e2e8f0';
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    Envío #{envio.envioId}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                    {envio.origen || '?'} → {envio.destino || '?'}
                </div>
                <div style={{ fontSize: 11, color: '#475569' }}>
                    Cantidad: <strong>{envio.cantidad}</strong>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1e40af', fontWeight: 700 }}>
                <Plane size={16} />
                #{envio.vueloId}
            </div>
        </button>
    );
});

EnvioItem.displayName = 'EnvioItem';

// Componente para envío pendiente (con rutas completas)
const EnvioPendienteItem = memo(({ envio, onSelect, aeropuertos = [], vuelosMap, selectedVuelo = null }) => {
    const findAeropuertoById = (id) => {
        if (id == null) return null;
        return aeropuertos.find(a => String(a.id) === String(id)) || null;
    };
    const resolveAeropuertoNombre = (ap, fallbackLabel = 'Desconocido') => {
        if (!ap && ap !== 0) return `${fallbackLabel} desconocido`;
        if (typeof ap === 'string') return ap;
        if (typeof ap === 'number') {
            const f = findAeropuertoById(ap);
            return f ? `${f.ciudad} (${f.codigo})` : `${fallbackLabel} ID ${ap}`;
        }
        if (ap?.ciudad) return `${ap.ciudad}${ap.codigo ? ` (${ap.codigo})` : ''}`;
        if (ap?.codigo) return `(${ap.codigo})`;
        if (ap?.id != null) {
            const f = findAeropuertoById(ap.id);
            return f ? `${f.ciudad} (${f.codigo})` : `${fallbackLabel} ID ${ap.id}`;
        }
        return `${fallbackLabel} desconocido`;
    };
    const formatShort = (s) => {
        if (!s) return 'N/A';
        // Si ya es un objeto Date, usarlo directamente
        if (s instanceof Date) {
            return s.toLocaleString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        }
        // Si es string, intentar parsearlo
        const baseDate = parsePlanificadorTime(s) || parseBackendTime(s) || new Date(s);
        if (!baseDate || isNaN(baseDate.getTime())) return String(s);
        return baseDate.toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };
    // Local helper: encontrar un vuelo consistente en el mapa usando múltiples posibles IDs
    const getVueloFromMap = (v) => {
        const candidates = [v?.id, v?.idTramo, v?.idVuelo, v?.planDeVueloId]
            .filter(x => x != null)
            .map(x => String(x).trim());
        // 1) Preferir el vuelo actualmente seleccionado si coincide por ID
        if (selectedVuelo && candidates.length) {
            const selIds = [selectedVuelo?.idTramo, selectedVuelo?.id, selectedVuelo?.raw?.id, selectedVuelo?.raw?.idTramo]
                .filter(x => x != null)
                .map(x => String(x).trim());
            if (candidates.some(k => selIds.includes(k))) return selectedVuelo;
        }
        // 2) Buscar en el mapa por claves directas
        if (vuelosMap) {
            for (const k of candidates) {
                const m = vuelosMap.get(k);
                if (m) return m;
            }
            // 3) Fallback: escanear por coincidencia de cualquiera de los IDs conocidos
            for (const [, m] of vuelosMap) {
                const ids = [m?.idTramo, m?.id, m?.raw?.id, m?.raw?.idTramo]
                    .filter(x => x != null)
                    .map(x => String(x).trim());
                if (candidates.some(k => ids.includes(k))) return m;
            }
        }
        return null;
    };
    // Mejorar origen/destino: soportar string, objeto, o nulo
    const origenNombre = resolveAeropuertoNombre(envio.aeropuertoOrigen, 'Origen');
    const destinoNombre = resolveAeropuertoNombre(envio.aeropuertoDestino, 'Destino');

    const tieneRuta = envio.totalVuelos > 0;

    // Mostrar info de vuelos si tiene ruta
    // Preferir 'envio.vuelosInfo' si ya viene simplificado desde la API de catálogo
    let vuelosInfo = [];
    if (Array.isArray(envio.vuelosInfo) && envio.vuelosInfo.length > 0) {
        vuelosInfo = envio.vuelosInfo.map(v => {
            const origenV = resolveAeropuertoNombre(v.ciudadOrigen, 'Origen');
            const destinoV = resolveAeropuertoNombre(v.ciudadDestino, 'Destino');
            // Intentar tomar hora desde mapa de vuelos (inyectado vía prop) para consistencia
            const match = getVueloFromMap(v);
            let horaSalidaDate = match?.horaOrigen;
            let horaLlegadaDate = match?.horaDestino;
            return {
                id: v.id,
                origen: origenV,
                destino: destinoV,
                horaSalida: formatShort(horaSalidaDate || v.horaSalida),
                horaLlegada: formatShort(horaLlegadaDate || v.horaLlegada)
            };
        });
    } else if (Array.isArray(envio.parteAsignadas)) {
        envio.parteAsignadas.forEach(parte => {
            if (Array.isArray(parte.vuelosRuta)) {
                parte.vuelosRuta.forEach(vr => {
                    const vuelo = vr.planDeVuelo || vr;
                    if (!vuelo) return;
                    const origenV = resolveAeropuertoNombre(vuelo.ciudadOrigen, 'Origen');
                    const destinoV = resolveAeropuertoNombre(vuelo.ciudadDestino, 'Destino');
                    const vueloMapMatch = getVueloFromMap(vuelo);
                    vuelosInfo.push({
                        id: vuelo.id,
                        origen: origenV,
                        destino: destinoV,
                        horaSalida: formatShort(vueloMapMatch?.horaOrigen || vuelo.horaSalida || vuelo.horaOrigen),
                        horaLlegada: formatShort(vueloMapMatch?.horaDestino || vuelo.horaLlegada || vuelo.horaDestino)
                    });
                });
            }
        });
    }

    return (
        <div
            onClick={() => {
                if (typeof onSelect === "function") onSelect(envio);
            }}
            style={{
                padding: '12px',
                borderBottom: '1px solid #e5e7eb',
                background: tieneRuta ? '#fafafa' : '#fef3c7',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = tieneRuta ? '#f0f0f0' : '#fde68a'}
            onMouseLeave={(e) => e.currentTarget.style.background = tieneRuta ? '#fafafa' : '#fef3c7'}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Route size={16} color={tieneRuta ? '#1976d2' : '#f59e0b'} />
                <span style={{ fontWeight: 700, color: tieneRuta ? '#1976d2' : '#f59e0b', fontSize: 14 }}>
                    Envío #{envio.id}
                </span>
                {envio.idEnvioPorAeropuerto && (
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                        (#{envio.idEnvioPorAeropuerto})
                    </span>
                )}
                {!tieneRuta && (
                    <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginLeft: 'auto' }}>
                        ⏳ Sin ruta
                    </span>
                )}
            </div>

            <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
                <span style={{ color: '#16a34a' }}>{origenNombre}</span>
                {' → '}
                <span style={{ color: '#dc2626' }}>{destinoNombre}</span>
            </div>

            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                Cliente: <strong style={{ color: '#374151' }}>{envio.cliente || 'N/A'}</strong>
            </div>

            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#374151' }}>
                <div>
                    📦 {envio.numProductos} productos
                </div>
                {tieneRuta ? (
                    <>
                        <div>
                            ✈️ {envio.totalVuelos} vuelo{envio.totalVuelos !== 1 ? 's' : ''}
                        </div>
                        {envio.totalPartes > 1 && (
                            <div>
                                🔀 {envio.totalPartes} partes
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ color: '#f59e0b', fontWeight: 500 }}>
                        Esperando planificación
                    </div>
                )}
            </div>

            {/* Mostrar info de vuelos si tiene ruta */}
            {tieneRuta && vuelosInfo.length > 0 && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#e5e7eb', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: '#111827' }}>Vuelos de la ruta</div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {vuelosInfo.map((v, idx) => (
                            <li key={v.id || idx} style={{ fontSize: 12, marginBottom: 4, color: '#1f2937' }}>
                                ✈️ <b>#{v.id}</b>: {v.origen} → {v.destino} <span style={{ color: '#111827' }}>[{v.horaSalida} - {v.horaLlegada}]</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
});

EnvioPendienteItem.displayName = 'EnvioPendienteItem';

function parseMysqlLocalWithOffset(localStr, offsetHours) {
  if (!localStr && localStr !== 0) return null;
  const t = String(localStr).trim();

  // soporta: "2025-12-19 22:08:00" o "2025-12-19 22:08:00.000000"
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;

  const [, y, mo, d, hh, mm, ss = "0"] = m;
  const off = Number(offsetHours || 0);

  // UTC = local - off
  const utcMs = Date.UTC(+y, +mo - 1, +d, +hh - off, +mm, +ss);
  return new Date(utcMs);
}

export default function PanelCatalogos({
    isOpen,
    onClose,
    onSelectVuelo,
    onSelectEnvio,
    onSelectAeropuerto,
    onSelectRutaEnvio,
    aeropuertos: aeropuertosProp = [],
    vuelosCache = [],
    vuelosConEnvios = [],
    envios: enviosProp = null,
    selectedVuelo = null,
    onEnviosLoaded = null,
    cicloActual = 0 // 🔄 Contador de ciclos para refrescar envíos
}) {
    const [catalogoActivo, setCatalogoActivo] = useState('vuelos');
    const [aeropuertos, setAeropuertos] = useState(aeropuertosProp);
    // Usar siempre vuelosCache si está disponible
    const [vuelos, setVuelos] = useState(vuelosCache);

    // Estados de búsqueda
    const [busquedaAeropuerto, setBusquedaAeropuerto] = useState('');
    const [busquedaVuelo, setBusquedaVuelo] = useState('');
    const [busquedaEnvio, setBusquedaEnvio] = useState('');
    const [busquedaRutaEnvio, setBusquedaRutaEnvio] = useState('');

    // Estado para resultados de búsqueda del backend (sin límite)
    const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
    const [buscandoEnBackend, setBuscandoEnBackend] = useState(false);
    const busquedaTimeoutRef = useRef(null);

    // Estado para envíos pendientes (con rutas)
    const [enviosPendientes, setEnviosPendientes] = useState([]);

    // Sincronizar con vuelosCache cuando cambie
    useEffect(() => {
        setVuelos(vuelosCache);
    }, [vuelosCache]);

    // ✅ Sincronizar aeropuertos con prop (ya vienen procesados desde Mapa)
    useEffect(() => {
        setAeropuertos(aeropuertosProp);
    }, [aeropuertosProp]);

    const [envios, setEnvios] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [nowMs, setNowMs] = useState(() => getSimMs());
    // Ref estable para tiempo de simulación para evitar re-crear intervalos
    const simTimeRef = useRef(nowMs);

    function sanitizeRutas(lista, currentMs) {
        if (!Array.isArray(lista)) return [];

        const BUFFER_MS = 2 * 60 * 1000; // opcional: 2 min

        return lista.filter(envio => {
            const info = envio?.vuelosInfo;
            if (!Array.isArray(info) || info.length === 0) return true;

            let maxArrival = null;

            for (const v of info) {
                const raw = v.horaLlegada || v.horaDestino || v.horaFin;
                const d =
                    parsePlanificadorTime(raw) ||
                    parseBackendTime(raw) ||
                    (raw ? new Date(raw) : null);

                if (!d || isNaN(d.getTime())) continue;

                const ms = d.getTime();
                if (maxArrival == null || ms > maxArrival) maxArrival = ms;
            }

            if (maxArrival == null) return true;

            // Mantener visible hasta que pase la llegada final (+ buffer)
            return currentMs <= (maxArrival + BUFFER_MS);
        });
    }



    // ⚡ OPTIMIZACIÓN: Cache de datos para evitar recálculos
    const datosCache = useRef({ aeropuertos: [], vuelos: [], lastFetch: 0 });
    // ⚠️ Flag para evitar llamadas duplicadas
    const cargandoEnviosRef = useRef(false);
    // 📦 Guardar los vuelos del último fetch para inyectarlos al mapa
    const vuelosConEnviosRef = useRef([]);

    // 🔄 CARGA INICIAL ELIMINADA - El Mapa.jsx ya hace la carga inicial
    // Esto evita llamadas duplicadas al endpoint

    // ✈️ Cargar envíos PLANIFICADOS CON RUTAS cuando se abre el catálogo de rutas
    // Este endpoint devuelve los envíos CON sus vuelos, ideal para mostrar aviones con envíos
    // 🔄 También refresca cuando cambia cicloActual (nuevo ciclo del planificador)
    useEffect(() => {
        if (isOpen && catalogoActivo === 'rutasEnvios') {
            // ⚠️ Evitar llamadas duplicadas
            if (cargandoEnviosRef.current) return;

            const cargarEnviosPlanificados = async () => {
                cargandoEnviosRef.current = true;
                setCargando(true);
                try {
                    // ✈️ Usar el nuevo endpoint que devuelve envíos CON vuelos
                    const { envios, vuelos, cantidadEnvios, cantidadVuelos } = await obtenerEnviosPlanificadosConRutas(100);

                    console.log(`✈️ Catálogo (ciclo ${cicloActual}): ${cantidadEnvios} envíos, ${cantidadVuelos} vuelos únicos`);

                    // Convertir envíos al formato esperado por el catálogo
                    const enviosProcesados = envios.map(envio => {
                        const partes = envio.parteAsignadas || [];
                        const totalVuelos = partes.reduce((sum, p) => sum + (p.vuelosRuta?.length || 0), 0);

                        // Construir vuelosInfo para compatibilidad
                        const vuelosInfo = [];
                        for (const parte of partes) {
                            for (const v of (parte.vuelosRuta || [])) {
                                vuelosInfo.push({
                                    id: v.id,
                                    ciudadOrigen: v.ciudadOrigen,
                                    ciudadDestino: v.ciudadDestino,
                                    horaSalida: v.horaSalida,
                                    horaLlegada: v.horaLlegada
                                });
                            }
                        }

                        return {
                            id: envio.id,
                            idEnvioPorAeropuerto: envio.idEnvioPorAeropuerto,
                            numProductos: envio.numProductos,
                            cliente: envio.cliente,
                            fechaIngreso: envio.fechaIngreso,
                            aeropuertoDestino: envio.aeropuertoDestino,
                            aeropuertoOrigen: partes[0]?.aeropuertoOrigen || null,
                            totalPartes: partes.length,
                            totalVuelos,
                            vuelosInfo,
                            parteAsignadas: partes
                        };
                    });
                    console.log("🕒 SIM now:", new Date(simTimeRef.current).toString(), simTimeRef.current);
                    console.log("📦 enviosProcesados sample:", enviosProcesados?.[0]);
                    console.log("✈️ sample vuelosInfo:", enviosProcesados?.[0]?.vuelosInfo?.[0]);

                    const sanitized = sanitizeRutas(enviosProcesados, simTimeRef.current);
                    // Ordenar por fecha de entrada (ascendente: las más antiguas primero)
                    const ordenados = sanitized.sort((a, b) => {
                        const fechaA = a.fechaIngreso ? new Date(a.fechaIngreso).getTime() : 0;
                        const fechaB = b.fechaIngreso ? new Date(b.fechaIngreso).getTime() : 0;
                        return fechaA - fechaB;
                    });
                    setEnviosPendientes(ordenados);
                    datosCache.current.lastFetch = Date.now();

                    // 📦 Guardar los vuelos para inyectar al mapa
                    vuelosConEnviosRef.current = vuelos;

                    // Notificar al padre sobre los envíos Y vuelos cargados
                    if (onEnviosLoaded && typeof onEnviosLoaded === 'function') {
                        onEnviosLoaded(ordenados, vuelos);
                    }
                } catch (error) {
                    console.error('Error al cargar envíos planificados:', error);
                } finally {
                    setCargando(false);
                    cargandoEnviosRef.current = false;
                }
            };
            cargarEnviosPlanificados();
        }
    }, [isOpen, catalogoActivo, cicloActual]); // 🔄 Agregar cicloActual como dependencia

    // ⚠️ REFRESCO PERIÓDICO DESHABILITADO para evitar OOM
    // El usuario puede refrescar manualmente si necesita datos actualizados
    /*
    useEffect(() => {
        if (!(isOpen && catalogoActivo === 'rutasEnvios')) return;
        const interval = setInterval(async () => {
            try {
                const pendientes = await obtenerEnviosPendientes();
                const sanitized = sanitizeRutas(pendientes, simTimeRef.current);
                // Ordenar por fecha de entrada (ascendente: las más antiguas primero)
                const ordenados = sanitized.sort((a, b) => {
                    const fechaA = a.fechaIngreso ? new Date(a.fechaIngreso).getTime() : 0;
                    const fechaB = b.fechaIngreso ? new Date(b.fechaIngreso).getTime() : 0;
                    return fechaA - fechaB;
                });
                setEnviosPendientes(ordenados);
                // Notificar al padre sobre los envíos actualizados
                if (onEnviosLoaded && typeof onEnviosLoaded === 'function') {
                    onEnviosLoaded(ordenados);
                }
            } catch (e) {
                console.error('Error refrescando rutas de envíos:', e);
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [isOpen, catalogoActivo]);
    */

    // ✅ Suscribirse al tiempo de simulación para actualización en tiempo real
    useEffect(() => {
        const unsub = subscribe(ms => { setNowMs(ms); simTimeRef.current = ms; });
        return () => unsub();
    }, []);

    // El catálogo ya no debe cargar vuelos del backend, solo usar vuelosCache
    const cargarVuelos = useCallback(async () => {
        setVuelos(vuelosCache);
    }, [vuelosCache]);

    // ✅ Extraer envíos desde vuelosCache, usando historial si no hay actuales
    const extraerEnvios = useCallback((vuelosData) => {
        const items = [];
        const BUFFER_MS = 2 * 60 * 1000; // 2 minutos extra tras llegada
        for (const v of vuelosData || []) {
            // filtrar por ventana temporal del vuelo
            const hIni = parsePlanificadorTime(v.horaSalida) || parseBackendTime(v.horaSalida) || parseBackendTime(v.horaOrigen);
            const hFin = parsePlanificadorTime(v.horaLlegada) || parseBackendTime(v.horaLlegada) || parseBackendTime(v.horaDestino);

            if (!hIni || !hFin) continue;
            const ini = hIni.getTime();
            const fin = hFin.getTime();
            // incluir solo envíos de vuelos activos: ini <= nowMs < fin + BUFFER_MS
            if (!(nowMs >= ini && nowMs < fin + BUFFER_MS)) continue;

            let enviosActuales = Array.isArray(v.enviosAsignados) ? v.enviosAsignados : [];
            let historialEnvios = Array.isArray(v.__historialEnviosCompletos) ? v.__historialEnviosCompletos : [];
            let enviosMostrar = enviosActuales.length > 0
                ? enviosActuales.map(a => ({
                    envioId: a.envioId ?? a.id ?? a.envio_id,
                    cantidad: a.cantidad ?? a.cantidadAsignada ?? 0,
                    vueloId: v.id,
                    origen: v.origen?.ciudad || v.origen?.codigo || '?',
                    destino: v.destino?.ciudad || v.destino?.codigo || '?'
                }))
                : historialEnvios.map(a => ({
                    envioId: a.envioId ?? a.id ?? a.envio_id,
                    cantidad: a.cantidad ?? a.cantidadAsignada ?? 0,
                    vueloId: v.id,
                    origen: v.origen?.ciudad || v.origen?.codigo || '?',
                    destino: v.destino?.ciudad || v.destino?.codigo || '?'
                }));
            enviosMostrar.forEach(e => items.push(e));
        }
        return items;
    }, [nowMs]);

    // ⚡ OPTIMIZACIÓN: Cargar datos SOLO cuando sea necesario
    useEffect(() => {
        if (!isOpen) return;

        const cargarDatos = async () => {
            // Aeropuertos ya vienen como prop, solo cargar vuelos si es necesario
            if (catalogoActivo === 'aeropuertos') {
                // No hacer nada, aeropuertos ya están sincronizados
                return;
            }

            // Solo mostrar loading si el cache está vacío
            const tieneCache = datosCache.current.vuelos.length > 0;

            if (!tieneCache) setCargando(true);

            try {
                if (catalogoActivo === 'vuelos' || catalogoActivo === 'envios') {
                    await cargarVuelos();
                }
            } finally {
                setCargando(false);
            }
        };

        cargarDatos();
    }, [catalogoActivo, isOpen, cargarVuelos]);

    // ✅ Actualizar envíos cuando cambien los vuelos o el tiempo (si usamos fuente interna)
    useEffect(() => {
        if (catalogoActivo === 'envios') {
            setEnvios(extraerEnvios(vuelos));
        }
    }, [vuelos, catalogoActivo, extraerEnvios]);

    // ✅ Fuente de envíos a mostrar: en la pestaña 'envios', usar siempre el historial extraído
    const enviosFuente = useMemo(() => {
        if (catalogoActivo === 'envios') {
            return envios;
        }
        if (Array.isArray(enviosProp)) return enviosProp;
        return envios;
    }, [catalogoActivo, enviosProp, envios]);

    // ⚡ OPTIMIZACIÓN: Memoizar filtrado de envíos
    const enviosFiltrados = useMemo(() => {
        if (!busquedaEnvio.trim()) return enviosFuente;

        const termino = busquedaEnvio.toLowerCase().trim();
        return enviosFuente.filter(e => {
            const envioId = String(e.envioId || '');
            const vueloId = String(e.vueloId || '');
            const origen = (e.origen || '').toLowerCase();
            const destino = (e.destino || '').toLowerCase();

            return envioId.includes(termino) ||
                vueloId.includes(termino) ||
                origen.includes(termino) ||
                destino.includes(termino);
        });
    }, [enviosFuente, busquedaEnvio]);

    // ✅ Agrupar envíos por avión (vueloId) para mejor experiencia
    const enviosAgrupados = useMemo(() => {
        const map = new Map();
        for (const e of enviosFiltrados) {
            const key = e.vueloId ?? 'sinVuelo';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(e);
        }
        return Array.from(map.entries()).map(([vueloId, items]) => ({
            vueloId,
            items,
            totalCantidad: items.reduce((s, i) => s + (i.cantidad || 0), 0)
        }));
    }, [enviosFiltrados]);

    // Mapa de vuelos para obtener horas ya parseadas (consistencia con PanelVueloDetalle)
    const vuelosMap = useMemo(() => {
        const m = new Map();
        (vuelos || []).forEach(v => {
            const keys = [v?.idTramo, v?.id, v?.raw?.id, v?.raw?.idTramo]
                .filter(x => x != null)
                .map(x => String(x).trim());
            keys.forEach(k => m.set(k, v));
        });
        return m;
    }, [vuelos]);

    // ✅ Recargar datos cada 30 segundos (solo vuelos, aeropuertos se actualizan automáticamente desde Mapa)
    useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => {
            if (catalogoActivo === 'vuelos' || catalogoActivo === 'envios') {
                cargarVuelos();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [isOpen, catalogoActivo, cargarVuelos]);

    const calcularProgreso = useCallback((horaInicio, horaFin) => {
        if (!horaInicio || !horaFin) return 0;
        const inicio = horaInicio.getTime();
        const fin = horaFin.getTime();
        const total = fin - inicio;
        if (total === 0) return 100;
        const transcurrido = nowMs - inicio;
        return Math.max(0, Math.min(100, (transcurrido / total) * 100));
    }, [nowMs]);

    // ⚡ OPTIMIZACIÓN: Memoizar filtrado de aeropuertos
    const aeropuertosFiltrados = useMemo(() => {
        if (!busquedaAeropuerto.trim()) return aeropuertos;

        const termino = busquedaAeropuerto.toLowerCase().trim();
        return aeropuertos.filter(a => {
            const codigo = (a.codigo || '').toLowerCase();
            const ciudad = (a.ciudad || '').toLowerCase();
            const pais = typeof a.pais === 'string' ? a.pais.toLowerCase() : (a.pais?.nombre || '').toLowerCase();
            const id = String(a.id || '');

            return codigo.includes(termino) ||
                ciudad.includes(termino) ||
                pais.includes(termino) ||
                id.includes(termino);
        });
    }, [aeropuertos, busquedaAeropuerto]);

    // ⚡ OPTIMIZACIÓN: Memoizar filtrado de vuelos activos
    const vuelosActivos = useMemo(() => {
        const BUFFER_MS = 2 * 60 * 1000; // 2 min

        const activos = (vuelos || []).filter((v) => {
            const hIni = parsePlanificadorTime(v.horaSalida) || parseBackendTime(v.horaSalida) || parseBackendTime(v.horaOrigen);
            const hFin = parsePlanificadorTime(v.horaLlegada) || parseBackendTime(v.horaLlegada) || parseBackendTime(v.horaDestino);

            if (!hIni || !hFin) return false;

            const ini = hIni.getTime();
            const fin = hFin.getTime();

            return nowMs >= ini && nowMs < fin + BUFFER_MS;
        });
        if ((vuelos || []).length) {
            const v0 = (vuelos || [])[0];
            console.log("DEBUG vuelo[0] horas:", v0.horaSalida, v0.horaLlegada);
            console.log("DEBUG parse:", parsePlanificadorTime(v0.horaSalida), parsePlanificadorTime(v0.horaLlegada));
        }

        if (!busquedaVuelo.trim()) return activos;

        const termino = busquedaVuelo.toLowerCase().trim();
        return activos.filter((v) => {
            const id = String(v.id || v.idTramo || "");
            const origenCiudad = (v.origen?.ciudad || "").toLowerCase();
            const origenCodigo = (v.origen?.codigo || "").toLowerCase();
            const destinoCiudad = (v.destino?.ciudad || "").toLowerCase();
            const destinoCodigo = (v.destino?.codigo || "").toLowerCase();

            return (
                id.includes(termino) ||
                origenCiudad.includes(termino) ||
                origenCodigo.includes(termino) ||
                destinoCiudad.includes(termino) ||
                destinoCodigo.includes(termino)
            );
        });
    }, [vuelos, nowMs, busquedaVuelo]);


    // 🔍 Búsqueda en backend con debounce para envíos por ID
    useEffect(() => {
        // Limpiar timeout anterior
        if (busquedaTimeoutRef.current) {
            clearTimeout(busquedaTimeoutRef.current);
        }

        const query = busquedaRutaEnvio.trim();

        // Si no hay búsqueda, limpiar resultados y mostrar los 100 iniciales
        if (!query) {
            setResultadosBusqueda([]);
            setBuscandoEnBackend(false);
            return;
        }

        // Debounce: esperar 400ms después de que el usuario deje de escribir
        setBuscandoEnBackend(true);
        busquedaTimeoutRef.current = setTimeout(async () => {
            try {
                console.log(`🔍 Buscando envíos con ID: ${query}`);
                const resultado = await buscarEnviosPorId(query);
                // buscarEnviosPorId devuelve { envios: [], cantidadEncontrados }
                const enviosEncontrados = resultado.envios || [];
                console.log(`✅ Encontrados ${enviosEncontrados.length} envíos`);
                setResultadosBusqueda(enviosEncontrados);
            } catch (error) {
                console.error('Error buscando envíos:', error);
                setResultadosBusqueda([]);
            } finally {
                setBuscandoEnBackend(false);
            }
        }, 400);

        return () => {
            if (busquedaTimeoutRef.current) {
                clearTimeout(busquedaTimeoutRef.current);
            }
        };
    }, [busquedaRutaEnvio]);

    // ⚡ OPTIMIZACIÓN: Usar resultados del backend si hay búsqueda, sino los 100 iniciales
    const enviosPendientesFiltrados = useMemo(() => {
        // Si hay búsqueda activa, usar resultados del backend
        if (busquedaRutaEnvio.trim()) {
            return resultadosBusqueda;
        }
        // Sin búsqueda, mostrar los 100 envíos iniciales
        return enviosPendientes;
    }, [enviosPendientes, busquedaRutaEnvio, resultadosBusqueda]);

    const catalogos = [
        { id: 'aeropuertos', nombre: 'Aeropuertos' },
        { id: 'vuelos', nombre: 'Vuelos Activos' },
        { id: 'envios', nombre: 'Envíos Activos' },
        { id: 'rutasEnvios', nombre: 'Rutas de Envíos' }
    ];

    const renderContenido = () => {
        if (cargando) {
            return (
                <div style={{
                    padding: 40,
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: 14
                }}>
                    Cargando datos...
                </div>
            );
        }

        if (catalogoActivo === 'aeropuertos') {
            if (aeropuertosFiltrados.length === 0) {
                return (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: 14
                    }}>
                        {busquedaAeropuerto.trim() ? 'No se encontraron aeropuertos' : 'No hay aeropuertos disponibles'}
                    </div>
                );
            }
            return aeropuertosFiltrados.map((item, idx) => (
                <AeropuertoItem
                    key={item.id || idx}
                    item={item}
                    onSelect={onSelectAeropuerto}
                />
            ));
        }

        if (catalogoActivo === 'vuelos') {
            if (vuelosActivos.length === 0) {
                return (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: 14
                    }}>
                        {busquedaVuelo.trim() ? 'No se encontraron vuelos' : 'No hay vuelos activos en este momento'}
                    </div>
                );
            }
            return vuelosActivos.map((item, idx) => {
                return (
                    <VueloItem
                        key={item.id || idx}
                        item={item}
                        index={idx}
                        aeropuertos={aeropuertos}
                        onSelect={onSelectVuelo}
                    />
                );
            });
        }

        if (catalogoActivo === 'envios') {
            if (enviosFiltrados.length === 0) {
                return (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: 14
                    }}>
                        {busquedaEnvio.trim() ? 'No se encontraron envíos' : 'No hay envíos en circulación'}
                    </div>
                );
            }
            // Render agrupado por avión
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px' }}>
                    {enviosAgrupados.map(grp => (
                        <div key={`grp-${grp.vueloId}`} style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            background: '#fff',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a', fontWeight: 700 }}>
                                    <Plane size={16} color="#1e40af" /> Avión #{grp.vueloId}
                                </div>
                                <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                                    {grp.items.length} envíos • Total: {grp.totalCantidad}
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px' }}>
                                {grp.items.map(envio => (
                                    <EnvioItem key={`${envio.envioId}-${envio.vueloId}`} envio={envio} onSelect={onSelectEnvio} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        if (catalogoActivo === 'rutasEnvios') {
            // Mostrar indicador de búsqueda en progreso
            if (buscandoEnBackend) {
                return (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12
                    }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Buscando envío #{busquedaRutaEnvio.trim()}...</span>
                        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                    </div>
                );
            }

            if (enviosPendientesFiltrados.length === 0) {
                return (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: 14
                    }}>
                        {busquedaRutaEnvio.trim()
                            ? `No se encontró el envío #${busquedaRutaEnvio.trim()}`
                            : 'No hay envíos pendientes'}
                    </div>
                );
            }

            return (
                <>
                    {busquedaRutaEnvio.trim() && (
                        <div style={{
                            padding: '8px 12px',
                            background: '#dbeafe',
                            borderBottom: '1px solid #93c5fd',
                            fontSize: 12,
                            color: '#1e40af',
                            fontWeight: 500
                        }}>
                            🔍 Encontrados {enviosPendientesFiltrados.length} envío(s) con ID "{busquedaRutaEnvio.trim()}"
                        </div>
                    )}
                    {enviosPendientesFiltrados.map((item, idx) => (
                        <EnvioPendienteItem
                            key={item.id || idx}
                            envio={item}
                            aeropuertos={aeropuertos}
                            onSelect={onSelectRutaEnvio}
                            vuelosMap={vuelosMap}
                            selectedVuelo={selectedVuelo}
                        />
                    ))}
                </>
            );
        }

        return null;
    };

    if (!isOpen) return null;

    const datosCount = catalogoActivo === 'aeropuertos' ? aeropuertosFiltrados.length :
        catalogoActivo === 'vuelos' ? vuelosActivos.length :
            catalogoActivo === 'rutasEnvios' ? enviosPendientesFiltrados.length :
                enviosFiltrados.length;

    return (
        <div
            style={{
                position: 'fixed',
                top: 80,
                left: 20,
                width: 380,
                maxHeight: 'calc(100vh - 100px)',
                background: 'white',
                borderRadius: 12,
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                zIndex: 2000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                pointerEvents: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Cabecera con pestañas */}
            <div style={{
                borderBottom: '2px solid #e5e7eb',
                background: '#f9fafb'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: '1px solid #e5e7eb'
                }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>Catálogos</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            display: 'flex',
                            alignItems: 'center',
                            color: '#6b7280',
                            borderRadius: 4
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Pestañas */}
                <div style={{ display: 'flex', gap: 0 }}>
                    {catalogos.map((catalogo) => (
                        <button
                            key={catalogo.id}
                            onClick={() => setCatalogoActivo(catalogo.id)}
                            style={{
                                flex: 1,
                                padding: '10px 8px',
                                border: 'none',
                                background: catalogoActivo === catalogo.id ? 'white' : 'transparent',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: catalogoActivo === catalogo.id ? 600 : 500,
                                color: catalogoActivo === catalogo.id ? '#1976d2' : '#6b7280',
                                borderBottom: catalogoActivo === catalogo.id ? '2px solid #1976d2' : '2px solid transparent',
                                transition: 'all 0.2s',
                                textAlign: 'center'
                            }}
                        >
                            {catalogo.nombre}
                        </button>
                    ))}
                </div>
            </div>

            {/* Contador de registros */}
            <div style={{
                padding: '8px 16px',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontSize: 12,
                color: '#6b7280'
            }}>
                {cargando ? 'Cargando...' : `${datosCount} registro${datosCount !== 1 ? 's' : ''}`}
            </div>

            {/* Buscador */}
            <div style={{
                padding: '12px 16px',
                background: 'white',
                borderBottom: '1px solid #e5e7eb'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#f9fafb',
                    borderRadius: 8,
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb'
                }}>
                    <Search size={16} color="#6b7280" />
                    <input
                        type="text"
                        placeholder={
                            catalogoActivo === 'aeropuertos' ? 'Buscar por código, ciudad, país...' :
                                catalogoActivo === 'vuelos' ? 'Buscar por ID, origen, destino...' :
                                    catalogoActivo === 'rutasEnvios' ? 'Buscar cualquier envío por ID (ej: 12345, 123...)' :
                                        'Buscar por ID de envío, vuelo...'
                        }
                        value={
                            catalogoActivo === 'aeropuertos' ? busquedaAeropuerto :
                                catalogoActivo === 'vuelos' ? busquedaVuelo :
                                    catalogoActivo === 'rutasEnvios' ? busquedaRutaEnvio :
                                        busquedaEnvio
                        }
                        onChange={(e) => {
                            if (catalogoActivo === 'aeropuertos') setBusquedaAeropuerto(e.target.value);
                            else if (catalogoActivo === 'vuelos') setBusquedaVuelo(e.target.value);
                            else if (catalogoActivo === 'rutasEnvios') setBusquedaRutaEnvio(e.target.value);
                            else setBusquedaEnvio(e.target.value);
                        }}
                        style={{
                            flex: 1,
                            border: 'none',
                            background: 'transparent',
                            outline: 'none',
                            fontSize: 13,
                            color: '#111827'
                        }}
                    />
                    {((catalogoActivo === 'aeropuertos' && busquedaAeropuerto) ||
                        (catalogoActivo === 'vuelos' && busquedaVuelo) ||
                        (catalogoActivo === 'envios' && busquedaEnvio) ||
                        (catalogoActivo === 'rutasEnvios' && busquedaRutaEnvio)) && (
                            <button
                                onClick={() => {
                                    if (catalogoActivo === 'aeropuertos') setBusquedaAeropuerto('');
                                    else if (catalogoActivo === 'vuelos') setBusquedaVuelo('');
                                    else if (catalogoActivo === 'rutasEnvios') setBusquedaRutaEnvio('');
                                    else setBusquedaEnvio('');
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: '#6b7280',
                                    borderRadius: 4
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#111827'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                            >
                                <X size={14} />
                            </button>
                        )}
                </div>
            </div>

            {/* Contenido scrollable */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                maxHeight: 'calc(100vh - 280px)'
            }}>
                {renderContenido()}
            </div>
        </div>
    );
}

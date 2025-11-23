'use client';

import { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import { X, Package, Plane, MapPin } from 'lucide-react';
import { subscribe, getSimMs } from '../../../lib/simTime';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

// Función para parsear fechas del backend
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

// ✅ Parser para "yyyy-MM-dd HH:mm (UTC±hh:mm)" del planificador
function parsePlanificadorTime(s) {
    if (!s || typeof s !== "string") return null;
    const t = s.trim();
    const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?:\s*\(UTC([+\-]\d{2}):(\d{2})\))?$/);
    if (!m) {
        const d = new Date(t.replace(/\s*\(UTC[^\)]+\)\s*$/, ""));
        return isNaN(d.getTime()) ? null : d;
    }
    const [, datePart, hhStr, mmStr, offHStr = "+00", offMStr = "00"] = m;
    const [y, mo, day] = datePart.split("-").map(x => parseInt(x, 10));
    const hh = parseInt(hhStr, 10), mm = parseInt(mmStr, 10);
    const offH = parseInt(offHStr, 10), offM = parseInt(offMStr, 10);
    // Convertir correctamente hora local del huso a UTC
    const sign = offH >= 0 ? 1 : -1;
    const offsetMinutes = Math.abs(offH) * 60 + (offM || 0);
    const totalOffsetMs = sign * offsetMinutes * 60 * 1000;
    const localUtcMs = Date.UTC(y, mo - 1, day, hh, mm, 0);
    const utcMillis = localUtcMs - totalOffsetMs;
    return new Date(utcMillis);
}

// Componente optimizado para items de aeropuerto
const AeropuertoItem = memo(({ item, onSelect }) => {
    const ilimitado = item?.ilimitado === true;
    const porcentaje = !ilimitado && item.capacidadMaxima > 0
        ? Math.round((item.capacidadOcupada / item.capacidadMaxima) * 100)
        : 0;
    const color = porcentaje <= 60 ? '#10b981' : porcentaje <= 85 ? '#f59e0b' : '#ef4444';
    const paisTexto = typeof item?.pais === 'string'
        ? item.pais
        : (item?.pais?.nombre || item?.raw?.pais?.nombre || 'N/A');

    return (
        <div
            onClick={() => onSelect && onSelect(item)}
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

    const horaInicio = parsePlanificadorTime(item.horaSalida) || parseBackendTime(item.horaOrigen);
    const horaFin = parsePlanificadorTime(item.horaLlegada) || parseBackendTime(item.horaDestino);

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
            onClick={() => onSelect(item)}
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
            onClick={() => onSelect(envio)}
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

export default function PanelCatalogos({
    isOpen,
    onClose,
    onSelectVuelo,
    onSelectEnvio,
    onSelectAeropuerto,
    aeropuertos: aeropuertosProp = [],
    vuelosCache = [],
    vuelosConEnvios = [],
    envios: enviosProp = null
}) {
    const [catalogoActivo, setCatalogoActivo] = useState('vuelos');
    const [aeropuertos, setAeropuertos] = useState(aeropuertosProp);
    // Usar siempre vuelosCache si está disponible
    const [vuelos, setVuelos] = useState(vuelosCache);

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

    // ⚡ OPTIMIZACIÓN: Cache de datos para evitar recálculos
    const datosCache = useRef({ aeropuertos: [], vuelos: [], lastFetch: 0 });

    // ✅ Suscribirse al tiempo de simulación para actualización en tiempo real
    useEffect(() => {
        const unsub = subscribe(ms => setNowMs(ms));
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
            const hIni = parsePlanificadorTime(v.horaSalida) || parseBackendTime(v.horaOrigen);
            const hFin = parsePlanificadorTime(v.horaLlegada) || parseBackendTime(v.horaDestino);
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

    // ✅ Agrupar envíos por avión (vueloId) para mejor experiencia
    const enviosAgrupados = useMemo(() => {
        const map = new Map();
        for (const e of enviosFuente) {
            const key = e.vueloId ?? 'sinVuelo';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(e);
        }
        return Array.from(map.entries()).map(([vueloId, items]) => ({
            vueloId,
            items,
            totalCantidad: items.reduce((s, i) => s + (i.cantidad || 0), 0)
        }));
    }, [enviosFuente]);

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

    // ⚡ OPTIMIZACIÓN: Memoizar filtrado de vuelos activos
    const vuelosActivos = useMemo(() => {
        return vuelos.filter(v => {
            const hIni = parsePlanificadorTime(v.horaSalida) || parseBackendTime(v.horaOrigen);
            const hFin = parsePlanificadorTime(v.horaLlegada) || parseBackendTime(v.horaDestino);
            if (!hIni || !hFin) return false;
            const ini = hIni.getTime();
            const fin = hFin.getTime();
            return nowMs >= ini && nowMs < fin;
        });
    }, [vuelos, nowMs]);

    const catalogos = [
        { id: 'aeropuertos', nombre: 'Aeropuertos' },
        { id: 'vuelos', nombre: 'Vuelos Activos' },
        { id: 'envios', nombre: 'Envíos Activos' }
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
            if (aeropuertos.length === 0) {
                return (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: 14
                    }}>
                        No hay aeropuertos disponibles
                    </div>
                );
            }
            return aeropuertos.map((item, idx) => (
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
                        No hay vuelos activos en este momento
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
            if (enviosFuente.length === 0) {
                return (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: 14
                    }}>
                        No hay envíos en circulación
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

        return null;
    };

    if (!isOpen) return null;

    const datosCount = catalogoActivo === 'aeropuertos' ? aeropuertos.length :
        catalogoActivo === 'vuelos' ? vuelosActivos.length :
            enviosFuente.length;

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

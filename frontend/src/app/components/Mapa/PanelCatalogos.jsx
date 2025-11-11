'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { X, Package, Plane } from 'lucide-react';
import { getSimMs } from '../../../lib/simTime';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

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
    const utcMillis = Date.UTC(y, mo - 1, day, hh - offH, mm - offM, 0);
    return new Date(utcMillis);
}

// Componente optimizado para items de vuelo
const VueloItem = memo(({ item, index, aeropuertos, progreso, onSelect }) => {
    // ✅ Usar origen/destino del planificador si existen
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

    // ✅ Soportar horaSalida/horaLlegada del planificador
    const horaInicio = parsePlanificadorTime(item.horaSalida) || parseBackendTime(item.horaOrigen);
    const horaFin = parsePlanificadorTime(item.horaLlegada) || parseBackendTime(item.horaDestino);

    const formatearFecha = (fecha) => {
        if (!fecha) return 'N/A';
        return fecha.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

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
                <div>🛫 Inicio: {formatearFecha(horaInicio)}</div>
                <div>🛬 Fin: {formatearFecha(horaFin)}</div>
            </div>

            <div style={{ marginBottom: 4 }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4
                }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                        Progreso:
                    </span>
                    <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: progreso < 50 ? '#16a34a' : progreso < 75 ? '#f59e0b' : '#dc2626'
                    }}>
                        {progreso.toFixed(1)}%
                    </span>
                </div>

                <div style={{
                    width: '100%',
                    height: 8,
                    background: '#e5e7eb',
                    borderRadius: 4,
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${progreso}%`,
                        height: '100%',
                        background: progreso < 50 ? '#22c55e' : progreso < 75 ? '#f59e0b' : '#ef4444',
                        transition: 'width 0.3s ease',
                        borderRadius: 4
                    }} />
                </div>
            </div>

            <div style={{ fontSize: 11, marginTop: 6, color: '#9ca3af' }}>
                Capacidad: {item.capacidadMaxima || 'N/D'}
            </div>
        </div>
    );
});

VueloItem.displayName = 'VueloItem';

export default function PanelCatalogos({
    isOpen,
    onClose,
    onSelectVuelo,
    onSelectEnvio,
    envios = []
}) {
    const [catalogoActivo, setCatalogoActivo] = useState('aeropuertos');
    const [datos, setDatos] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [aeropuertos, setAeropuertos] = useState([]);

    // ✅ Solo pestañas soportadas; los otros endpoints 404 se eliminan
    const catalogos = [
        { id: 'aeropuertos', nombre: 'Aeropuertos', endpoint: '/api/aeropuertos' },
        { id: 'vuelos', nombre: 'Vuelos Activos', endpoint: '/api/planificador/vuelos-ultimo-ciclo' }
    ];

    // Cargar aeropuertos para resolver nombres de ciudades
    useEffect(() => {
        const cargarAeropuertos = async () => {
            try {
                const response = await fetch('/api/aeropuertos');
                if (response.ok) {
                    const data = await response.json();
                    setAeropuertos(data);
                }
            } catch (error) {
                console.error('Error cargando aeropuertos:', error);
            }
        };
        cargarAeropuertos();
    }, []);

    const cargarDatos = async (catalogoId) => {
        setCargando(true);
        const catalogo = catalogos.find(c => c.id === catalogoId);
        try {
            const url = catalogoId === 'aeropuertos'
                ? catalogo.endpoint
                : `${API_BASE}${catalogo.endpoint}`;

            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 404) {
                    // ✅ Silenciar 404 y mostrar vacío
                    setDatos([]);
                    return;
                }
                throw new Error('Error al cargar datos');
            }

            const data = await response.json();
            // ✅ Mapear respuesta de vuelos-ultimo-ciclo
            if (catalogoId === 'vuelos') {
                setDatos(Array.isArray(data?.vuelos) ? data.vuelos : []);
            } else {
                setDatos(data);
            }
        } catch (error) {
            console.warn('Catálogo no disponible:', catalogoId, error?.message);
            setDatos([]);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        if (isOpen && catalogoActivo) {
            cargarDatos(catalogoActivo);
        }
    }, [catalogoActivo, isOpen]);

    const calcularProgreso = useCallback((horaInicio, horaFin) => {
        if (!horaInicio || !horaFin) return 0;
        const ahora = getSimMs();
        const inicio = horaInicio.getTime();
        const fin = horaFin.getTime();
        const total = fin - inicio;
        if (total === 0) return 100;
        const transcurrido = ahora - inicio;
        return Math.max(0, Math.min(100, (transcurrido / total) * 100));
    }, []);

    const handleSelectVuelo = useCallback((vuelo) => {
        if (onSelectVuelo) {
            onSelectVuelo(vuelo);
        }
    }, [onSelectVuelo]);

    const handleSelectEnvio = useCallback((envio) => {
        if (onSelectEnvio) {
            onSelectEnvio(envio);
        }
    }, [onSelectEnvio]);

    const renderItem = (item, index) => {
        if (catalogoActivo === 'aeropuertos') {
            return (
                <div key={item.id || index} style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{item.ciudad || 'N/A'} ({item.codigo || 'N/A'})</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{item.pais?.nombre || 'N/A'}</div>
                    <div style={{ fontSize: 11, marginTop: 3, color: '#9ca3af' }}>
                        Cap: {item.capacidadMaxima || 'N/D'} | Ocup: {item.capacidadOcupada || 0}
                    </div>
                </div>
            );
        }

        if (catalogoActivo === 'vuelos') {
            // ✅ Mostrar solo vuelos con envíos
            const tieneEnvios = Array.isArray(item.enviosAsignados) && item.enviosAsignados.length > 0;
            if (!tieneEnvios) return null;

            const horaInicio = parsePlanificadorTime(item.horaSalida) || parseBackendTime(item.horaOrigen);
            const horaFin = parsePlanificadorTime(item.horaLlegada) || parseBackendTime(item.horaDestino);
            if (!horaInicio || !horaFin) return null;

            const progreso = calcularProgreso(horaInicio, horaFin);
            // Antes: if (progreso <= 0 || progreso >= 100) return null;
            if (progreso >= 100) return null; // permitir progreso 0

            return (
                <VueloItem
                    key={item.id || index}
                    item={item}
                    index={index}
                    aeropuertos={aeropuertos}
                    progreso={progreso}
                    onSelect={handleSelectVuelo}
                />
            );
        }

        return null;
    };

    if (!isOpen) return null;

    // ✅ Contador solo de vuelos con envíos y activos
    const datosVisibles = catalogoActivo === 'vuelos'
        ? datos.filter(item => {
            const tieneEnvios = Array.isArray(item.enviosAsignados) && item.enviosAsignados.length > 0;
            if (!tieneEnvios) return false;
            const hIni = parsePlanificadorTime(item.horaSalida) || parseBackendTime(item.horaOrigen);
            const hFin = parsePlanificadorTime(item.horaLlegada) || parseBackendTime(item.horaDestino);
            if (!hIni || !hFin) return false;
            const p = calcularProgreso(hIni, hFin);
            return p < 100; // permitir 0
        })
        : datos;

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
                zIndex: 1300,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                pointerEvents: 'auto' // ⭐ Permitir clics solo en el panel
            }}
            onClick={(e) => e.stopPropagation()} // ⭐ Evitar que los clics se propaguen al mapa
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
                            onMouseEnter={(e) => {
                                if (catalogoActivo !== catalogo.id) {
                                    e.currentTarget.style.background = '#f3f4f6';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (catalogoActivo !== catalogo.id) {
                                    e.currentTarget.style.background = 'transparent';
                                }
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
                {cargando ? 'Cargando...' : `${datosVisibles.length} registro${datosVisibles.length !== 1 ? 's' : ''}`}
            </div>

            {/* Contenido */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                maxHeight: 'calc(100vh - 280px)'
            }}>
                {cargando ? (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: 14
                    }}>
                        Cargando datos...
                    </div>
                ) : datosVisibles.length === 0 ? (
                    <div style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: 14
                    }}>
                        {catalogoActivo === 'vuelos' ? 'No hay vuelos activos en este momento' : 'No hay datos disponibles'}
                    </div>
                ) : (
                    datosVisibles.map((item, index) => renderItem(item, index))
                )}
            </div>

            {/* Envíos en circulación - Nueva sección */}
            <div style={{
                padding: '16px',
                borderTop: '1px solid #e5e7eb',
                background: '#f9fafb',
                fontSize: 14
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Package size={18} color="#1e40af" />
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        Envíos en circulación ({envios.length})
                    </span>
                </div>

                {envios.length === 0 ? (
                    <div style={{
                        fontSize: 13,
                        color: '#64748b',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: 12
                    }}>
                        No hay envíos en vuelo por ahora.
                    </div>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {envios.map((e) => (
                            <li key={e.envioId}>
                                <button
                                    onClick={() => handleSelectEnvio(e)}
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
                                        gap: 10
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                            Envío #{e.envioId}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>
                                            {e.origen || '?'} → {e.destino || '?'}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#475569' }}>
                                            Cantidad en vuelo: <strong>{e.cantidad}</strong>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1e40af', fontWeight: 700 }}>
                                        <Plane size={16} />
                                        #{e.vueloId}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

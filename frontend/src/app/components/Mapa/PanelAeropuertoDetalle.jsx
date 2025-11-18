'use client';

import { X, Package, Building2, Plane } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';

export default function PanelAeropuertoDetalle({ aeropuerto, vuelosEnTransito = [], onClose }) {
    if (!aeropuerto) return null;

    // ✅ Calcular envíos en tránsito hacia este aeropuerto
    const enviosEnTransito = useMemo(() => {
        if (!Array.isArray(vuelosEnTransito) || !aeropuerto.id) return [];

        const envios = [];
        vuelosEnTransito.forEach(vuelo => {
            // Solo contar vuelos que van hacia este aeropuerto
            if (vuelo.ciudadDestinoId !== aeropuerto.id) return;

            // Extraer envíos asignados a este vuelo
            const asignados = Array.isArray(vuelo.raw?.enviosAsignados) ? vuelo.raw.enviosAsignados : [];
            asignados.forEach(envio => {
                envios.push({
                    envioId: envio.envioId ?? envio.id,
                    cantidad: envio.cantidad ?? envio.cantidadAsignada ?? 0,
                    vueloId: vuelo.idTramo,
                    ciudadOrigen: vuelo.ciudadOrigenName,
                    progreso: vuelo.pos?.progreso ? (vuelo.pos.progreso * 100).toFixed(1) : 0
                });
            });
        });
        return envios;
    }, [vuelosEnTransito, aeropuerto.id]);

    const ilimitado = aeropuerto?.ilimitado === true;
    const capacidadMax = aeropuerto.capacidadMaxima ?? aeropuerto.raw?.capacidadMaxima ?? null;
    const ocupada = aeropuerto.capacidadOcupada ?? aeropuerto.raw?.capacidadOcupada ?? 0;
    const porcentaje = capacidadMax ? Math.round((ocupada / capacidadMax) * 100) : null;

    return (
        <div
            style={{
                position: 'fixed',
                top: '50%',
                right: 20,
                transform: 'translateY(-50%)',
                width: 400,
                maxHeight: 'calc(100vh - 120px)',
                background: '#ffffff',
                color: '#111827',
                borderRadius: 14,
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                zIndex: 1400,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                fontFamily: 'system-ui'
            }}
        >
            <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Building2 size={20} color="#1976d2" />
                    <h3 style={{ margin: 0, fontSize: 16 }}>{aeropuerto.ciudad} {aeropuerto.codigo ? `(${aeropuerto.codigo})` : ''}</h3>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 6,
                        borderRadius: 6
                    }}
                >
                    <X size={18} />
                </button>
            </div>

            <div style={{ padding: 16, overflowY: 'auto' }}>
                {/* Ajustes de colores internos */}
                <section style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>UBICACIÓN</div>
                    <div style={{ fontSize: 13, color: '#0f172a' }}>
                        País: <strong>{aeropuerto.pais || 'N/D'}</strong><br />
                        Ciudad: <strong>{aeropuerto.ciudad || 'N/D'}</strong><br />
                        Lat: {aeropuerto.lat != null ? aeropuerto.lat.toFixed(5) : 'N/D'} / Lon: {aeropuerto.lon != null ? aeropuerto.lon.toFixed(5) : 'N/D'}
                    </div>
                </section>

                {!ilimitado && (
                    <section style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>CAPACIDAD</div>
                        <div style={{ fontSize: 13, marginBottom: 8, color: '#0f172a' }}>
                            Máxima: <strong>{capacidadMax ?? 'N/D'}</strong><br />
                            Ocupada: <strong>{ocupada ?? 'N/D'}</strong>
                        </div>
                        {porcentaje != null && (
                            <>
                                <div style={{
                                    width: '100%', height: 10, background: '#e2e8f0',
                                    borderRadius: 6, overflow: 'hidden', marginBottom: 6
                                }}>
                                    <div style={{
                                        width: `${porcentaje}%`,
                                        height: '100%',
                                        background: porcentaje < 60 ? '#10b981' : porcentaje < 85 ? '#f59e0b' : '#dc2626',
                                        transition: 'width .3s', borderRadius: 6
                                    }} />
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{porcentaje}% ocupado</div>
                            </>
                        )}
                    </section>
                )}

                {!ilimitado && (
                    <section style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Plane size={14} /> ENVÍOS EN TRÁNSITO HACIA ESTE AEROPUERTO
                        </div>
                        {enviosEnTransito.length === 0 && (
                            <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                                No hay envíos en tránsito hacia este aeropuerto.
                            </div>
                        )}
                        {enviosEnTransito.length > 0 && (
                            <>
                                <div style={{ fontSize: 12, marginBottom: 8, color: '#0f172a', fontWeight: 600 }}>
                                    Total: {enviosEnTransito.length} envío(s) en {vuelosEnTransito.filter(v => v.ciudadDestinoId === aeropuerto.id).length} vuelo(s)
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                                    {enviosEnTransito.map((e, idx) => (
                                        <div key={idx} style={{
                                            border: '1px solid #e2e8f0',
                                            background: '#f8fafc',
                                            padding: '8px 10px',
                                            borderRadius: 8
                                        }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                                                📦 Envío #{e.envioId}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#475569' }}>
                                                Cantidad: <strong>{e.cantidad}</strong> unidades
                                            </div>
                                            <div style={{ fontSize: 11, color: '#475569' }}>
                                                Desde: <strong>{e.ciudadOrigen || 'N/D'}</strong>
                                            </div>
                                            <div style={{ fontSize: 11, color: '#475569' }}>
                                                Vuelo: <strong>#{e.vueloId}</strong>
                                            </div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                                Progreso: <strong style={{ color: '#2563eb' }}>{e.progreso}%</strong>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}

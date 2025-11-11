'use client';

import { X, Package, Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function PanelAeropuertoDetalle({ aeropuerto, onClose }) {
    if (!aeropuerto) return null;

    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);

    // Placeholder: intenta obtener pedidos/envíos relativos al aeropuerto
    useEffect(() => {
        let cancel = false;
        async function load() {
            setLoading(true);
            try {
                // Ajustar endpoint real según backend
                const res = await fetch(`/api/envios?destino=${aeropuerto.id}`);
                if (!res.ok) throw new Error('envios fetch');
                const data = await res.json();
                if (!cancel) setPedidos(Array.isArray(data) ? data.slice(0, 25) : []);
            } catch {
                if (!cancel) setPedidos([]);
            } finally {
                if (!cancel) setLoading(false);
            }
        }
        load();
        return () => { cancel = true; };
    }, [aeropuerto.id]);

    const capacidadMax = aeropuerto.capacidadMaxima ?? aeropuerto.raw?.capacidadMaxima ?? null;
    const ocupada = aeropuerto.capacidadOcupada ?? aeropuerto.raw?.capacidadOcupada ?? 0;
    const porcentaje = capacidadMax ? Math.round((ocupada / capacidadMax) * 100) : null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 80,
                right: 20,
                width: 400,
                maxHeight: 'calc(100vh - 120px)',
                background: '#ffffff',
                color: '#111827',               // ← texto principal oscuro
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
                        Lat: {aeropuerto.lat.toFixed(5)} / Lon: {aeropuerto.lon.toFixed(5)}
                    </div>
                </section>

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

                <section style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Package size={14} /> PEDIDOS / ENVÍOS
                    </div>
                    {loading && <div style={{ fontSize: 12 }}>Cargando pedidos...</div>}
                    {!loading && pedidos.length === 0 && <div style={{ fontSize: 12, color: '#6b7280' }}>No hay pedidos para este aeropuerto.</div>}
                    {!loading && pedidos.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {pedidos.map((p, idx) => (
                                <div key={idx} style={{
                                    border: '1px solid #e5e7eb',
                                    background: '#f9fafb',
                                    padding: '8px 10px',
                                    borderRadius: 8
                                }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.codigo || `Pedido #${p.id}`}</div>
                                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                                        Cantidad: {p.cantidad ?? p.unidades ?? 'N/D'}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                                        Destino: {p.destinoCodigo || p.destino || aeropuerto.codigo || 'N/D'}
                                    </div>
                                    {p.fechaIngreso && (
                                        <div style={{ fontSize: 11, color: '#6b7280' }}>
                                            Ingreso: {String(p.fechaIngreso).slice(0, 19).replace('T', ' ')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>RAW</div>
                    <pre style={{
                        whiteSpace: 'pre-wrap',
                        background: '#f1f5f9',
                        padding: 10,
                        fontSize: 11,
                        borderRadius: 8,
                        maxHeight: 180,
                        overflow: 'auto',
                        color: '#0f172a',
                        lineHeight: 1.3
                    }}>{JSON.stringify(aeropuerto.raw, null, 2)}</pre>
                </section>
            </div>
        </div>
    );
}

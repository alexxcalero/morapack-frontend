"use client";

import React from 'react';
import { X, CheckCircle2, Truck, Clock, Package, TrendingUp } from 'lucide-react';

function fmtElapsed(ms) {
    if (ms == null || ms < 0) return "0min";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    // Formato: 1h 20min, 2h, 5min, etc.
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
}

export default function ModalResumen({ isOpen, onClose, resumen, esDetenida = false, realElapsed, simNow, fechaInicio }) {
    if (!isOpen) return null;

    // Formatear fechas
    function formatearFecha(fechaIso) {
        if (!fechaIso) return 'N/A';
        const d = new Date(fechaIso);
        if (isNaN(d.getTime())) return 'N/A';
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const anio = d.getFullYear();
        const hora = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dia}-${mes}-${anio} ${hora}:${min}`;
    }

    // Formatear fecha/hora simulada (Date)
    function formatearFechaSimulada(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime?.())) return 'N/A';
        const dia = String(dateObj.getDate()).padStart(2, '0');
        const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
        const anio = dateObj.getFullYear();
        const hora = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        return `${dia}-${mes}-${anio} ${hora}:${min}`;
    }

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    maxWidth: '420px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        background: esDetenida
                            ? 'linear-gradient(135deg, #f59e0b 0%, #dc2626 100%)'
                            : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                        padding: '24px',
                        borderTopLeftRadius: '16px',
                        borderTopRightRadius: '16px',
                        color: 'white',
                        position: 'relative',
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: 'none',
                            borderRadius: '8px',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    >
                        <X size={20} />
                    </button>

                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
                        🎯 Resumen de Simulación
                    </h2>
                </div>

                {/* Content */}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ fontSize: '15px', color: '#334155', fontWeight: 600, marginBottom: 6 }}>
                        Fecha de Inicio: <span style={{ fontWeight: 400 }}>{formatearFecha(fechaInicio)}</span>
                    </div>
                    <div style={{ fontSize: '15px', color: '#334155', fontWeight: 600, marginBottom: 6 }}>
                        Fecha de Fin: <span style={{ fontWeight: 400 }}>{formatearFechaSimulada(simNow)}</span>
                    </div>
                    <div style={{ fontSize: '15px', color: '#334155', fontWeight: 600, marginBottom: 6 }}>
                        Duración de la simulación en tiempo real: <span style={{ fontWeight: 400 }}>{fmtElapsed(realElapsed)}</span>
                    </div>
                    <div style={{ fontSize: '15px', color: '#334155', fontWeight: 600, marginBottom: 6 }}>
                        Cantidad de ciclos realizados: <span style={{ fontWeight: 400 }}>
                            {(() => {
                                if (typeof resumen?.totalCiclosCompletados === 'number' && resumen.totalCiclosCompletados > 0) {
                                    return resumen.totalCiclosCompletados + ' ciclos';
                                } else if (typeof resumen?.cicloActual === 'number' && resumen.cicloActual > 0) {
                                    return resumen.cicloActual + ' ciclos';
                                } else {
                                    return 'N/A';
                                }
                            })()}
                        </span>
                    </div>
                    <div style={{ fontSize: '15px', color: '#334155', fontWeight: 600, marginBottom: 6 }}>
                        Cantidad de Pedidos Procesados: <span style={{ fontWeight: 400 }}>{resumen?.pedidosCompletados ?? resumen?.totalPedidos ?? 'N/A'} pedidos</span>
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '16px 24px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                    }}
                >
                    <button
                        onClick={() => {
                            // Descargar el reporte desde el backend remoto
                            fetch('https://1inf54-981-5e.inf.pucp.edu.pe/api/planificador/descargar-reporte')
                                .then(async (res) => {
                                    if (!res.ok) throw new Error('No se pudo descargar el reporte');
                                    const blob = await res.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    // Intenta obtener el nombre del archivo del header
                                    const disposition = res.headers.get('content-disposition');
                                    let filename = 'reporte-ultima-planificacion.txt';
                                    if (disposition && disposition.indexOf('filename=') !== -1) {
                                        filename = disposition.split('filename=')[1].replace(/"/g, '').trim();
                                    }
                                    a.download = filename;
                                    document.body.appendChild(a);
                                    a.click();
                                    setTimeout(() => {
                                        window.URL.revokeObjectURL(url);
                                        document.body.removeChild(a);
                                    }, 100);
                                })
                                .catch(() => {
                                    alert('No se pudo descargar el reporte.');
                                });
                        }}
                        style={{
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            padding: '10px 18px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
                    >
                        Descargar última planificación
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            padding: '10px 24px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#2563eb'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#3b82f6'}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

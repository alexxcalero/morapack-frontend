"use client";

import React from 'react';
import { X, CheckCircle2, Truck, Clock, Package, TrendingUp } from 'lucide-react';

export default function ModalResumen({ isOpen, onClose, resumen, esDetenida = false }) {
    if (!isOpen) return null;

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
                    maxWidth: '600px',
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

                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
                        🎯 Resumen de Simulación
                    </h2>
                    <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                        {esDetenida ? 'Simulación detenida manualmente' : 'Simulación completada exitosamente'}
                    </p>
                </div>

                {/* Content */}
                <div style={{ padding: '24px' }}>
                    {/* Estadísticas principales */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '16px',
                            marginBottom: '24px',
                        }}
                    >
                        {/* Total de envíos */}
                        <div
                            style={{
                                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                                padding: '20px',
                                borderRadius: '12px',
                                border: '2px solid #bae6fd',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <Package size={24} color="#0284c7" />
                                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                                    Total de envíos
                                </span>
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: 700, color: '#0284c7' }}>
                                {resumen?.totalEnvios || 0}
                            </div>
                        </div>

                        {/* Envíos entregados */}
                        <div
                            style={{
                                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                padding: '20px',
                                borderRadius: '12px',
                                border: '2px solid #bbf7d0',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <CheckCircle2 size={24} color="#16a34a" />
                                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                                    Entregados
                                </span>
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: 700, color: '#16a34a' }}>
                                {resumen?.enviosEntregados || 0}
                            </div>
                        </div>

                        {/* En tránsito */}
                        <div
                            style={{
                                background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
                                padding: '20px',
                                borderRadius: '12px',
                                border: '2px solid #fde047',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <Truck size={24} color="#ca8a04" />
                                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                                    En tránsito
                                </span>
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: 700, color: '#ca8a04' }}>
                                {resumen?.enviosEnTransito || 0}
                            </div>
                        </div>

                        {/* Pendientes */}
                        <div
                            style={{
                                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                                padding: '20px',
                                borderRadius: '12px',
                                border: '2px solid #fecaca',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <Clock size={24} color="#dc2626" />
                                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                                    Pendientes
                                </span>
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: 700, color: '#dc2626' }}>
                                {resumen?.enviosPendientes || 0}
                            </div>
                        </div>
                    </div>

                    {/* Progreso */}
                    <div
                        style={{
                            background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                            padding: '20px',
                            borderRadius: '12px',
                            border: '2px solid #e9d5ff',
                            marginBottom: '24px',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <TrendingUp size={24} color="#9333ea" />
                            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                                Porcentaje completado
                            </span>
                        </div>

                        {/* Barra de progreso */}
                        <div
                            style={{
                                width: '100%',
                                height: '32px',
                                backgroundColor: '#f3e8ff',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                marginBottom: '8px',
                                position: 'relative',
                            }}
                        >
                            <div
                                style={{
                                    width: `${resumen?.porcentajeCompletado || 0}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #9333ea 0%, #c084fc 100%)',
                                    transition: 'width 0.5s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: '12px',
                                }}
                            >
                                <span style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>
                                    {(resumen?.porcentajeCompletado || 0).toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Duración */}
                    <div
                        style={{
                            background: '#f8fafc',
                            padding: '16px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            textAlign: 'center',
                        }}
                    >
                        <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>
                            Duración de la simulación
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
                            ⏱️ {resumen?.duracionSimulacion || 'N/A'}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '16px 24px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
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

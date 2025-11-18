"use client";

import React from "react";
import { X, Package, Clock, CheckCircle } from "lucide-react";

export default function ResumenSimulacion({
    isOpen,
    onClose,
    enviosEntregados,
    productosEntregados,
    tiempoSimulacion
}) {
    if (!isOpen) return null;

    const formatTiempo = (ms) => {
        if (!ms || ms < 0) return "00:00:00";
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = s % 60;
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(h)}:${pad(m)}:${pad(ss)}`;
    };

    const overlay = {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(4px)"
    };

    const modal = {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: 20,
        padding: "32px",
        maxWidth: 500,
        width: "90%",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
        color: "white",
        position: "relative",
        animation: "slideIn 0.3s ease-out"
    };

    const header = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 24
    };

    const title = {
        fontSize: 24,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 12
    };

    const closeBtn = {
        background: "rgba(255, 255, 255, 0.2)",
        border: "none",
        borderRadius: 8,
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.2s"
    };

    const statBox = {
        background: "rgba(255, 255, 255, 0.15)",
        borderRadius: 12,
        padding: "20px",
        marginBottom: 16,
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.2)"
    };

    const statLabel = {
        fontSize: 13,
        fontWeight: 600,
        opacity: 0.9,
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        gap: 8,
        textTransform: "uppercase",
        letterSpacing: "0.5px"
    };

    const statValue = {
        fontSize: 36,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums"
    };

    const button = {
        width: "100%",
        padding: "14px 24px",
        background: "rgba(255, 255, 255, 0.9)",
        color: "#667eea",
        border: "none",
        borderRadius: 12,
        fontWeight: 700,
        fontSize: 15,
        cursor: "pointer",
        transition: "all 0.2s",
        marginTop: 8
    };

    return (
        <>
            <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
            <div style={overlay} onClick={onClose}>
                <div style={modal} onClick={(e) => e.stopPropagation()}>
                    <div style={header}>
                        <div style={title}>
                            <CheckCircle size={32} />
                            <span>Simulación Finalizada</span>
                        </div>
                        <button
                            style={closeBtn}
                            onClick={onClose}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div style={statBox}>
                        <div style={statLabel}>
                            <Package size={16} />
                            Envíos Entregados
                        </div>
                        <div style={statValue}>{enviosEntregados.toLocaleString()}</div>
                    </div>

                    <div style={statBox}>
                        <div style={statLabel}>
                            <Package size={16} />
                            Total de Productos Entregados
                        </div>
                        <div style={statValue}>{productosEntregados.toLocaleString()}</div>
                    </div>

                    <div style={statBox}>
                        <div style={statLabel}>
                            <Clock size={16} />
                            Tiempo de Simulación
                        </div>
                        <div style={statValue}>{formatTiempo(tiempoSimulacion)}</div>
                    </div>

                    <button
                        style={button}
                        onClick={onClose}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = "white";
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 8px 20px rgba(0, 0, 0, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(255, 255, 255, 0.9)";
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "none";
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </>
    );
}

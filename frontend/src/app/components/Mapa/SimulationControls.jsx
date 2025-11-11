"use client";

import React, { useEffect, useState, useMemo } from "react";

// URL base del backend (configurable por env NEXT_PUBLIC_BACKEND_URL)
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

export default function SimulationControls({ startStr = null }) {
    const [estado, setEstado] = useState({ activo: false, cargando: false });
    const [fechaInicio, setFechaInicio] = useState(""); // ← fecha inicio editable

    // ✅ Calcular fecha fin automáticamente (+7 días)
    const fechaFin = useMemo(() => {
        if (!fechaInicio) return "";
        try {
            const fecha = new Date(fechaInicio);
            if (isNaN(fecha.getTime())) return "";
            fecha.setDate(fecha.getDate() + 7);
            return fecha.toISOString().slice(0, 16); // formato "YYYY-MM-DDTHH:mm"
        } catch {
            return "";
        }
    }, [fechaInicio]);

    const fetchEstado = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/planificador/estado`);
            const json = await res.json();
            setEstado({
                activo: Boolean(json?.planificadorActivo),
                cargando: false
            });
        } catch {
            setEstado(s => ({ ...s, cargando: false }));
        }
    };

    useEffect(() => {
        fetchEstado();
        const iv = setInterval(fetchEstado, 10000);
        return () => clearInterval(iv);
    }, []);

    const iniciar = async () => {
        setEstado(s => ({ ...s, cargando: true }));
        try {
            await fetch(`${API_BASE}/api/planificador/iniciar`, { method: "POST" });
        } finally {
            fetchEstado();
        }
    };

    const detener = async () => {
        setEstado(s => ({ ...s, cargando: true }));
        try {
            await fetch(`${API_BASE}/api/planificador/detener`, { method: "POST" });
        } finally {
            fetchEstado();
        }
    };

    const btnStyle = {
        padding: "8px 16px",
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer",
    };

    const inputStyle = {
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid #cbd5e1",
        fontSize: 13,
        fontWeight: 500,
        color: "#475569",
        minWidth: 160,
    };

    return (
        <div
            style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                background: "rgba(255,255,255,0.95)",
                padding: "10px 12px",
                borderRadius: 12,
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                color: "black",
            }}
            role="group"
            aria-label="Controles de simulación"
        >
            {/* ✅ Rango de simulación semanal (7 días) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                    Fecha Inicio
                </label>
                <input
                    type="datetime-local"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    style={inputStyle}
                    title="Fecha de inicio de la simulación"
                />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                    Fecha Fin (7 días)
                </label>
                <input
                    type="datetime-local"
                    value={fechaFin}
                    disabled
                    style={{
                        ...inputStyle,
                        background: "#f1f5f9",
                        cursor: "not-allowed",
                        opacity: 0.8,
                    }}
                    title="Fecha fin calculada automáticamente (+7 días)"
                />
            </div>

            <button
                type="button"
                onClick={iniciar}
                disabled={estado.cargando || estado.activo}
                style={{
                    ...btnStyle,
                    border: "none",
                    background: estado.activo ? "#94a3b8" : "#3b82f6",
                    color: "white",
                }}
                title={estado.activo ? "Ya está iniciado" : "Iniciar planificador"}
            >
                {estado.cargando ? "..." : "Iniciar"}
            </button>

            <button
                type="button"
                onClick={detener}
                disabled={estado.cargando || !estado.activo}
                style={{
                    ...btnStyle,
                    border: "none",
                    background: !estado.activo ? "#94a3b8" : "#6b7280",
                    color: "white",
                }}
                title={!estado.activo ? "No está en ejecución" : "Detener planificador"}
            >
                {estado.cargando ? "..." : "■ Detener"}
            </button>
        </div>
    );
}

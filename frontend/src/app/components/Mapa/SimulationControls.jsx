"use client";

import React, { useEffect, useState, useMemo } from "react";

// URL base del backend (configurable por env NEXT_PUBLIC_BACKEND_URL)
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

export default function SimulationControls({ startStr = null }) {
    const [estado, setEstado] = useState({ activo: false, cargando: false });
    const [iniciando, setIniciando] = useState(false); // ← estado separado para iniciar sin bloquear UI
    const [fechaInicio, setFechaInicio] = useState(""); // ← fecha inicio editable

    // ✅ Calcular fecha fin automáticamente (+7 días)
    const fechaFin = useMemo(() => {
        if (!fechaInicio) return "";
        try {
            // Parsear la fecha como hora local, no UTC
            const [datePart, timePart] = fechaInicio.split('T');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hour, minute] = (timePart || '00:00').split(':').map(Number);

            const fecha = new Date(year, month - 1, day, hour, minute);
            if (isNaN(fecha.getTime())) return "";

            fecha.setDate(fecha.getDate() + 7);

            // Formatear de vuelta a datetime-local
            const y = fecha.getFullYear();
            const m = String(fecha.getMonth() + 1).padStart(2, '0');
            const d = String(fecha.getDate()).padStart(2, '0');
            const h = String(fecha.getHours()).padStart(2, '0');
            const min = String(fecha.getMinutes()).padStart(2, '0');

            return `${y}-${m}-${d}T${h}:${min}`;
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

    const limpiar = async () => {
        if (estado.activo) {
            alert("Detén la simulación antes de limpiar.");
            return;
        }
        setEstado(s => ({ ...s, cargando: true }));
        try {
            const res = await fetch(`${API_BASE}/api/planificador/limpiar-planificacion`, { method: "POST" });
            if (res.ok) alert("✅ Simulación limpiada correctamente.");
            else alert("❌ Error al limpiar simulación.");
        } catch (err) {
            console.error("Error limpiar:", err);
            alert("❌ Error de conexión.");
        } finally {
            fetchEstado();
        }
    };

    const iniciar = async () => {
        if (!fechaInicio) {
            alert("Por favor ingresa una fecha de inicio.");
            return;
        }
        setIniciando(true); // ← no bloquea la UI global, solo el botón
        try {
            // Primero limpiar la simulación anterior
            await fetch(`${API_BASE}/api/planificador/limpiar-planificacion`, { method: "POST" });

            // Parsear fecha como hora local
            const [datePart, timePart] = fechaInicio.split('T');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hour, minute] = (timePart || '00:00').split(':').map(Number);

            const inicio = new Date(year, month - 1, day, hour, minute);
            // Compensar la diferencia horaria (-05:00) agregando 5 horas para que
            // la "Fecha / Hora simulada" coincida con la ingresada por el usuario.
            // El usuario ingresa hora local, pero el motor interno interpreta en UTC.
            // Ajustamos aquí para alinear la visualización posterior.
            inicio.setHours(inicio.getHours() + 5);
            const fin = new Date(inicio);
            fin.setDate(fin.getDate() + 7);

            // Formatear para el backend en formato ISO con T (YYYY-MM-DDTHH:mm:ss)
            const formatoBackend = (d) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const h = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                const sec = String(d.getSeconds()).padStart(2, '0');
                return `${y}-${m}-${day}T${h}:${min}:${sec}`;
            };

            const body = {
                fechaInicio: formatoBackend(inicio),
                fechaFin: formatoBackend(fin)
            };

            await fetch(`${API_BASE}/api/planificador/iniciar-simulacion-semanal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            // Notificar al mapa para que refresque inmediatamente los vuelos (evitar esperar el polling)
            try { window.dispatchEvent(new Event('planificador:iniciado')); } catch { }

            // Actualizar estado inmediatamente sin esperar el polling
            setEstado({ activo: true, cargando: false });
        } finally {
            setIniciando(false);
            // fetchEstado se ejecutará en el próximo ciclo del polling
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
                disabled={iniciando || estado.activo || !fechaInicio}
                style={{
                    ...btnStyle,
                    border: "none",
                    background: estado.activo || !fechaInicio || iniciando ? "#94a3b8" : "#3b82f6",
                    color: "white",
                    cursor: estado.activo || !fechaInicio || iniciando ? "not-allowed" : "pointer",
                }}
                title={estado.activo ? "Simulación en ejecución - Detén primero para reiniciar" : !fechaInicio ? "Ingresa fecha de inicio" : "Iniciar planificador"}
            >
                {iniciando ? "Iniciando..." : estado.activo ? "En ejecución" : "Iniciar"}
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

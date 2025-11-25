"use client";

import { useEffect, useState } from "react";
import { X, Plane, Package, Users, Clock, MapPin } from "lucide-react";
import { subscribe, getSimMs } from "../../../lib/simTime";

export default function PanelVueloDetalle({ vuelo, onClose }) {
    const [nowMs, setNowMs] = useState(() => getSimMs());
    useEffect(() => { const u = subscribe(ms => setNowMs(ms)); return () => u(); }, []);
    if (!vuelo) return null;

    // Envíos realmente transportados (actuales o históricos completados)
    let enviosAsignados = Array.isArray(vuelo.raw?.enviosAsignados) && vuelo.raw.enviosAsignados.length > 0
        ? vuelo.raw.enviosAsignados
        : (Array.isArray(vuelo.raw?.__historialEnviosCompletos) && vuelo.raw.__historialEnviosCompletos.length > 0
            ? vuelo.raw.__historialEnviosCompletos
            : []);

    // Envíos planificados (provenientes de rutas) que aún no aparecen como transportados
    const planificadosRaw = Array.isArray(vuelo.raw?.__enviosPlanificados) ? vuelo.raw.__enviosPlanificados : [];
    const idsYaTransportados = new Set(enviosAsignados.map(e => (e.envioId ?? e.id))); // evitar duplicados
    const enviosPlanificados = planificadosRaw.filter(e => !idsYaTransportados.has(e.envioId));

    console.log(`✈️ Vuelo #${vuelo?.idTramo}: ${enviosAsignados.length} transportados, ${enviosPlanificados.length} planificados`);

    const capacidadMax = vuelo.raw?.capacidadMaxima ?? 300;
    // Calcular capacidad ocupada usando historial si no hay envíos actuales
    let capacidadOcupada = Array.isArray(vuelo.raw?.enviosAsignados) && vuelo.raw.enviosAsignados.length > 0
        ? vuelo.raw.enviosAsignados.reduce((sum, e) => sum + (e.cantidad ?? e.cantidadAsignada ?? 0), 0)
        : (Array.isArray(vuelo.raw?.__historialEnviosCompletos) && vuelo.raw.__historialEnviosCompletos.length > 0
            ? vuelo.raw.__historialEnviosCompletos.reduce((sum, e) => sum + (e.cantidad ?? e.cantidadAsignada ?? 0), 0)
            : 0);
    const capacidadPct = capacidadMax > 0 ? Math.round((capacidadOcupada / capacidadMax) * 100) : 0;
    const progreso = Math.max(0, Math.min(100, ((vuelo.pos?.progreso ?? 0) * 100)));

    // Estilos base mejorados para legibilidad
    const labelStyle = {
        fontSize: 11,
        fontWeight: 600,
        color: "#475569", // más oscuro (antes #64748b)
        textTransform: "uppercase",
        letterSpacing: "0.5px",
    };

    const valueStyle = {
        fontSize: 14,
        fontWeight: 600,
        color: "#0f172a", // mucho más oscuro (antes #1e293b)
    };

    const sectionTitleStyle = {
        fontSize: 13,
        fontWeight: 700,
        color: "#1e293b", // más oscuro
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: "2px solid #e2e8f0",
    };

    return (
        <div style={{
            position: "fixed",
            right: 20,
            top: "50%",
            transform: "translateY(-50%)",
            width: 380,
            maxHeight: "85vh",
            background: "#ffffff", // fondo blanco sólido para mejor contraste
            borderRadius: 16,
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            zIndex: 1500,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
        }}>
            {/* Header */}
            <div style={{
                background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Plane size={24} color="white" />
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
                            Vuelo #{vuelo?.idTramo || "?"}
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 2 }}>
                            {vuelo?.ciudadOrigenName || "?"} → {vuelo?.ciudadDestinoName || "?"}
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: "rgba(255,255,255,0.2)",
                        border: "none",
                        borderRadius: 8,
                        padding: 8,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.3)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
                >
                    <X size={20} color="white" />
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                {/* Progreso */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Progreso del vuelo</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#1976d2" }}>{progreso.toFixed(1)}%</span>
                    </div>
                    <div style={{ width: "100%", height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{
                            width: `${progreso}%`, height: "100%",
                            background: "linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)"
                        }} />
                    </div>
                </div>

                {/* Capacidad */}
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <Users size={16} color="#1976d2" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1976d2" }}>Capacidad</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: 12 }}>
                        <span>Ocupada</span>
                        <strong>{capacidadOcupada} / {capacidadMax} ({capacidadPct}%)</strong>
                    </div>
                </div>

                {/* Envíos asignados */}
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <Package size={16} color="#1976d2" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1976d2" }}>
                            Envíos transportados ({enviosAsignados.length})
                        </span>
                    </div>

                    {enviosAsignados.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", padding: "12px 0" }}>
                            No hay envíos asignados a este vuelo
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {enviosAsignados.map((e, idx) => (
                                <div key={idx} style={{ background: "white", borderRadius: 8, border: "1px solid #e2e8f0", padding: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Envío #{e.envioId ?? e.id ?? (idx + 1)}</span>
                                        <span style={{ fontSize: 11, background: "#dbeafe", color: "#1e40af", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>
                                            {e.cantidad ?? e.cantidadAsignada ?? 0} u
                                        </span>
                                    </div>
                                    {(e.origen || vuelo.ciudadOrigenName) && (
                                        <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                                            <MapPin size={14} /> Origen: {e.origen ?? vuelo.ciudadOrigenName}
                                        </div>
                                    )}
                                    {(e.destino || vuelo.ciudadDestinoName) && (
                                        <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                                            <MapPin size={14} /> Destino: {e.destino ?? vuelo.ciudadDestinoName}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {enviosPlanificados.length > 0 && (
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: 12, marginTop: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <Package size={16} color="#0d9488" />
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#0d9488" }}>
                                Envíos planificados próximos ({enviosPlanificados.length})
                            </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {enviosPlanificados.map((e, idx) => (
                                <div key={idx} style={{ background: "white", borderRadius: 8, border: "1px solid #e2e8f0", padding: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Envío #{e.envioId}</span>
                                        <span style={{ fontSize: 11, background: "#ccfbf1", color: "#0d9488", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>
                                            {e.cantidad} u
                                        </span>
                                    </div>
                                    {(e.origen) && (
                                        <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                                            <MapPin size={14} /> Origen: {e.origen}
                                        </div>
                                    )}
                                    {(e.destino) && (
                                        <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                                            <MapPin size={14} /> Destino: {e.destino}
                                        </div>
                                    )}
                                    {(e.horaSalidaPlan || e.horaLlegadaPlan) && (
                                        <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
                                            {e.horaSalidaPlan && <span>Salida: {e.horaSalidaPlan.toLocaleString()} </span>}
                                            {e.horaLlegadaPlan && <span>· Llegada: {e.horaLlegadaPlan.toLocaleString()}</span>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Horarios */}
                <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <Clock size={16} color="#1976d2" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1976d2" }}>Horarios</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                            <span>Salida</span>
                            <strong>{vuelo.horaOrigen?.toLocaleString() ?? "N/A"}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                            <span>Llegada</span>
                            <strong>{vuelo.horaDestino?.toLocaleString() ?? "N/A"}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

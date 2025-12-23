"use client";

import React, { useEffect, useState, useRef } from "react";
import { PlusCircle, PlayCircle } from "lucide-react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import { setSimMs, getSimMs } from "../../../lib/simTime";

const API_BASE =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://1inf54-981-5e.inf.pucp.edu.pe";

const ENVIO_GET_URL = (fecha) => `${API_BASE}/api/envios/obtenerTodosFecha/${fecha}`;
const CLEAR_MAP_URL = `${API_BASE}/api/planificador/limpiar-planificacion`;
const INICIAR_OPS_DIARIAS_URL = `${API_BASE}/api/planificador/iniciar-operaciones-diarias`;
const REINICIAR_OPS_DIARIAS_URL = `${API_BASE}/api/planificador/reiniciar-simulacion-dia`;
const RESET_RELOJ_URL = `${API_BASE}/api/simulacion-dia/reloj/reset`;
const ENVIO_LECTURA_ARCHIVO_URL = `${API_BASE}/api/envios/lecturaArchivo`;
const ENVIO_ESTADOS_URL = `${API_BASE}/api/envios/conteo-por-estado`;
const DETENER_URL = `${API_BASE}/api/planificador/detener`;

function msToDatetimeLocal(ms) {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function parseInputToMs(inputVal) {
    if (!inputVal) return null;
    const d = new Date(inputVal);
    if (isNaN(d.getTime())) return null;
    return d.getTime();
}

function formatFechaParam(ms) {
    const date = new Date(ms ?? Date.now());
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

// Convierte datetime-local (local) a ISO UTC sin 'Z' (yyyy-MM-ddTHH:mm:ss)
function toUtcIsoWithoutZ(localDatetimeStr) {
    if (!localDatetimeStr) return null;

    const normalized =
        localDatetimeStr.length === 16
            ? `${localDatetimeStr}:00`
            : localDatetimeStr;

    const localDate = new Date(normalized);
    if (isNaN(localDate.getTime())) return null;

    // toISOString() ya lo convierte a UTC, solo quitamos la 'Z' de final
    return localDate.toISOString().slice(0, 19);
}

export default function SimulationControlsDia({ startStr = null, airports = [] }) {
    const [simMs, setSimMsState] = useState(() => getSimMs() || Date.now());
    const [fechaInicio, setFechaInicio] = useState(() => msToDatetimeLocal(getSimMs() || Date.now()));

    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({
        fechaIngreso: msToDatetimeLocal(getSimMs() || Date.now()),
        husoHorarioDestino: "-5",
        aeropuertoDestinoId: "",
        aeropuertoOrigenId: "",
        numProductos: "",
        cliente: "",
    });

    const ESTADOS_DEFAULT = {
        PLANIFICADO: 0,
        EN_RUTA: 0,
        FINALIZADO: 0,
        ENTREGADO: 0,
        NULL: 0,
    };

    const [estadoCounts, setEstadoCounts] = useState(() => ({
        ...ESTADOS_DEFAULT,
        total: 0,
    }));

    const [counts, setCounts] = useState({ total: 0, inTransit: 0, waiting: 0 });
    const [enviosCache, setEnviosCache] = useState([]);

    // 🔒 overlay de bloqueo mientras se limpia el mapa (sincronizado vía STOMP)
    const [isClearing, setIsClearing] = useState(false);

    // 🎹 qué teclado está activo: "numProductos" | "cliente" | null
    const [activeKeypad, setActiveKeypad] = useState(null);

    const fileInputRef = useRef(null);
    const [isUploadingFile, setIsUploadingFile] = useState(false);


    async function refreshEstadoCounts() {
        try {
            const r = await fetch(ENVIO_ESTADOS_URL);
            if (!r.ok) throw new Error("conteo-por-estado " + r.status);

            const data = await r.json().catch(() => ({}));
            if (data?.estado !== "éxito") throw new Error(data?.mensaje || "respuesta inválida");

            const conteos = data?.conteos || {};
            const merged = { ...ESTADOS_DEFAULT, ...conteos };

            const total =
                typeof data?.totalEnvios === "number"
                    ? data.totalEnvios
                    : Object.values(merged).reduce((a, b) => a + Number(b || 0), 0);

            setEstadoCounts({ ...merged, total });
        } catch (err) {
            console.error("[conteo-por-estado] error:", err);
            setEstadoCounts({ ...ESTADOS_DEFAULT, total: 0 });
        }
    }

    useEffect(() => {
        let mounted = true;

        const run = async () => {
            if (!mounted) return;
            await refreshEstadoCounts();
        };

        run();
        const iv = setInterval(run, 3_000);

        const onIniciado = () => run();
        window.addEventListener("planificador:iniciado", onIniciado);

        return () => {
            mounted = false;
            clearInterval(iv);
            window.removeEventListener("planificador:iniciado", onIniciado);
        };
    }, []);


    async function uploadArchivoEnvios(file) {
        if (!file) return;

        setIsUploadingFile(true);
        try {
            const fd = new FormData();
            fd.append("arch", file); // 👈 IMPORTANTE: "arch" como en @RequestParam("arch")

            const resp = await fetch(ENVIO_LECTURA_ARCHIVO_URL, {
                method: "POST",
                body: fd,
            });

            if (!resp.ok) {
                const txt = await resp.text().catch(() => null);
                throw new Error("HTTP " + resp.status + (txt ? " - " + txt : ""));
            }

            const data = await resp.json().catch(() => ({}));
            console.log("[lecturaArchivo] respuesta:", data);

            alert(
                `✅ Archivo cargado.\n` +
                `Envios cargados: ${data.enviosCargados ?? "n/d"}\n` +
                `Errores: ${data.errores ?? "n/d"}\n` +
                `Tiempo(s): ${data.tiempoEjecucionSegundos ?? "n/d"}`
            );            
        } catch (err) {
            console.error("[lecturaArchivo] error:", err);
            alert("❌ Error cargando archivo: " + (err.message || err));
        } finally {
            setIsUploadingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = ""; // para permitir re-subir el mismo archivo
        }
    }

    const iniciar = async () => {
        if (!fechaInicio) {
            alert("Por favor ingresa una fecha de inicio.");
            return;
        }
        console.log(`🚀 [FRONTEND] Iniciando simulación a las ${new Date().toLocaleTimeString()}`);
        try {
            // Pequeña pausa para asegurar que la BD se sincronice
            await new Promise(resolve => setTimeout(resolve, 500));

            // Parsear fecha como hora local
            const [datePart, timePart] = fechaInicio.split('T');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hour, minute] = (timePart || '00:00').split(':').map(Number);

            const inicio = new Date(year, month - 1, day, hour, minute);
            // Compensar la diferencia horaria (-05:00) agregando 5 horas para que
            // la "Fecha / Hora simulada" coincida con la ingresada por el usuario.
            // El usuario ingresa hora local, pero el motor interno interpreta en UTC.
            // Ajustamos aquí para alinear la visualización posterior.
            inicio.setHours(inicio.getHours());

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
            };

            await fetch(`${API_BASE}/api/planificador/reiniciar-simulacion-dia`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            // Notificar al mapa para que refresque inmediatamente los vuelos (evitar esperar el polling)
            try { window.dispatchEvent(new Event('planificador:iniciado')); } catch { }

        } finally {
        }
    };

    useEffect(() => {
        computeCounts(enviosCache, simMs);
    }, [enviosCache, simMs]);

    const aeropuertoDestino = airports.find(
        (a) => String(a.id) === String(form.aeropuertoDestinoId)
    );
    const codigoAeropuertoDestino = aeropuertoDestino?.codigo;

    // 📦 Refresco periódico de envíos, usando la fecha del reloj (simMs)
    useEffect(() => {
        let mounted = true;

        async function refreshEnvios() {
            try {
                const fechaParam = formatFechaParam(getSimMs() || Date.now());
                const r = await fetch(ENVIO_GET_URL(fechaParam));
                if (!r.ok) throw new Error("envios " + r.status);
                const data = await r.json();
                if (!mounted) return;
                setEnviosCache(data || []);
                computeCounts(data || []);
            } catch (err) {
                console.error("fetch envios:", err);
                if (!mounted) return;
                setEnviosCache([]);
                setCounts({ total: 0, inTransit: 0, waiting: 0 });
            }
        }

        refreshEnvios();
        const iv = setInterval(refreshEnvios, 30_000);

        return () => {
            mounted = false;
            clearInterval(iv);
        };
    }, []);

    function computeCounts(envios, nowMs) {
        const now = nowMs ?? getSimMs() ?? Date.now();
        let total = envios.length;
        let inTransit = 0;
        let waiting = 0;

        for (const e of envios) {
            let ms = null;
            try {
                ms = e.fechaIngreso ? new Date(e.fechaIngreso).getTime() : null;
            } catch {
                ms = null;
            }

            if (ms == null) {
                waiting++;
                continue;
            }
            if (ms <= now) {
                inTransit++;
            } else {
                waiting++;
            }
        }

        setCounts({ total, inTransit, waiting });
    }

    const onApplyInput = async () => {
        const isoUtc = toUtcIsoWithoutZ(fechaInicio);
        if (!isoUtc) {
            alert("Fecha/hora inválida.");
            return;
        }

        try {
            const resp = await fetch(RESET_RELOJ_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fechaInicio: isoUtc }),
            });

            if (!resp.ok) {
                const txt = await resp.text().catch(() => null);
                throw new Error("HTTP " + resp.status + (txt ? " - " + txt : ""));
            }

            const data = await resp.json();

            if (data.estado !== "éxito") {
                alert("Error al reiniciar reloj de simulación: " + (data.mensaje || "Desconocido"));
                return;
            }

            if (typeof data.simMs === "number") {
                setSimMs(data.simMs);
                setSimMsState(data.simMs);
                setFechaInicio(msToDatetimeLocal(data.simMs));
            }

            /* const resp2 = await fetch(DETENER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            if (!resp2.ok) {
                const txt = await resp.text().catch(() => null);
                throw new Error("HTTP " + resp.status + (txt ? " - " + txt : ""));
            }

            const resp3 = await fetch(REINICIAR_OPS_DIARIAS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fechaInicio: isoUtc }),
            });

            if (!resp3.ok) {
                const txt = await resp.text().catch(() => null);
                throw new Error("HTTP " + resp.status + (txt ? " - " + txt : ""));
            } */

            if (typeof window !== "undefined") {
                try {
                    window.dispatchEvent(new Event("planificador:iniciado"));
                } catch {
                    // no-op
                }
            }

            alert("Reloj de simulación reiniciado correctamente.");
        } catch (err) {
            console.error("Error al reiniciar reloj de simulación:", err);
            alert("Error al reiniciar reloj de simulación: " + (err.message || err));
        }
    };

    // ---- Add Envio handlers ----
    const openAdd = () => {
        const nowMs = getSimMs() || Date.now();
        setForm({
            fechaIngreso: msToDatetimeLocal(nowMs),
            husoHorarioDestino: "-5",
            aeropuertoDestinoId: airports.length ? airports[0].id : "",
            aeropuertoOrigenId: "",
            numProductos: "",
            cliente: "",
        });
        setActiveKeypad(null);
        setShowAdd(true);
    };

    const handleFormChange = (k, v) =>
        setForm((prev) => ({
            ...prev,
            [k]: v,
        }));

    // 🔢 Teclado numérico (1..999) para numProductos
    const handleNumKeypadPress = (key) => {
        setForm((prev) => {
            let current = String(prev.numProductos ?? "");

            if (key === "DEL") {
                current = current.slice(0, -1);
            } else if (key === "CLR") {
                current = "";
            } else if (key === "OK") {
                setActiveKeypad(null);
                return prev;
            } else if (typeof key === "number") {
                current = current + String(key);
            }

            current = current.replace(/\D+/g, "");

            if (current === "") {
                return { ...prev, numProductos: "" };
            }

            let n = Number(current);
            if (Number.isNaN(n) || n < 1) n = 1;
            if (n > 999) n = 999;

            return { ...prev, numProductos: String(n) };
        });
    };

    // 🎹 Teclado numérico para código de cliente
    const handleClienteKeypadPress = (key) => {
        setForm((prev) => {
            let current = String(prev.cliente ?? "");

            if (key === "DEL") {
                current = current.slice(0, -1);
            } else if (key === "CLR") {
                current = "";
            } else if (key === "OK") {
                setActiveKeypad(null);
                return prev;
            } else if (typeof key === "number") {
                current = current + String(key);
            }

            current = current.replace(/\D+/g, "");

            if (current.length > 10) {
                current = current.slice(0, 10);
            }

            return { ...prev, cliente: current };
        });
    };

    // 📨 Enviar nuevo envío: usa el reloj backend para fechaAparicion
    async function submitNewEnvio(e) {
        e.preventDefault();
        if (!form.aeropuertoDestinoId) {
            alert("Selecciona un aeropuerto destino.");
            return;
        }

        const num = parseInt(form.numProductos, 10);
        if (Number.isNaN(num) || num < 1 || num > 999) {
            alert("Número de productos debe estar entre 1 y 999.");
            return;
        }

        const aeropuertoDestino = airports.find(
            (a) => String(a.id) === String(form.aeropuertoDestinoId)
        );
        if (!aeropuertoDestino || !aeropuertoDestino.codigo) {
            alert("No se encontró el aeropuerto destino o no tiene código configurado.");
            return;
        }

        const codigoAeropuertoDestino = aeropuertoDestino.codigo;

        const payload = {
            codigoAeropuertoDestino,
            numProductos: num,
            cliente: form.cliente || "",
            // 👀 fechaAparicion se toma en backend desde RelojSimulacionDiaService
        };

        try {
            const r = await fetch(INICIAR_OPS_DIARIAS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!r.ok) {
                const txt = await r.text().catch(() => null);
                throw new Error("HTTP " + r.status + (txt ? " - " + txt : ""));
            }

            const data = await r.json();

            if (data.estado !== "éxito") {
                alert("Error al iniciar operaciones diarias: " + (data.mensaje || "Desconocido"));
                return;
            }

            alert(
                `Envío creado (id: ${data.envioCreado?.id ?? "n/d"}). Planificador iniciado: ${data.planificadorIniciado ? "Sí" : "No"
                }`
            );

            setShowAdd(false);
            setActiveKeypad(null);

            // Refrescar envíos de la fecha actual
            // (puedes optimizar esto si quieres)
            try {
                const fechaParam = formatFechaParam(getSimMs() || Date.now());
                const r2 = await fetch(ENVIO_GET_URL(fechaParam));
                if (r2.ok) {
                    const data2 = await r2.json();
                    setEnviosCache(data2 || []);
                    computeCounts(data2 || []);
                }
            } catch {
                // no-op
            }
        } catch (err) {
            console.error("error iniciar operaciones diarias:", err);
            alert("Error al iniciar operaciones diarias: " + (err.message || err));
        }
    }

    // 🔔 Hook STOMP: control de limpieza + reloj de simulación día a día
    useEffect(() => {
        const wsUrl =
            process.env.NEXT_PUBLIC_BACKEND_WS_URL ||
            "https://1inf54-981-5e.inf.pucp.edu.pe/ws-planificacion-sockjs";

        const socket = new SockJS(wsUrl);
        const client = new Client({
            webSocketFactory: () => socket,
            reconnectDelay: 5000,
            debug: () => { },
        });

        client.onConnect = () => {
            // Canal de control (limpiar mapa, etc.)
            client.subscribe("/topic/simulacion-control", (message) => {
                try {
                    const body = JSON.parse(message.body);
                    if (body.tipo === "clear_map_start") {
                        setIsClearing(true);
                    } else if (body.tipo === "clear_map_end") {
                        setIsClearing(false);
                    }
                    if (body.tipo === "resumen_envios_dia") {
                        setCounts({
                            total: body.total ?? 0,
                            inTransit: body.enVuelo ?? 0,
                            waiting: body.enEspera ?? 0,
                        });
                    }
                } catch (e) {
                    console.error("Error parseando control:", e);
                }
            });

            // Canal de reloj de simulación día a día
            client.subscribe("/topic/sim-time-dia", (message) => {
                try {
                    const body = JSON.parse(message.body);
                    if (body.tipo === "sim_time_dia" && typeof body.simMs === "number") {
                        setSimMs(body.simMs);      // actualiza store global
                        setSimMsState(body.simMs); // actualiza estado local (para mostrar el reloj)
                    }
                } catch (e) {
                    console.error("Error parseando sim-time-dia:", e);
                }
            });

        };

        client.activate();

        return () => {
            client.deactivate();
        };
    }, []);

    async function onClearMap() {
        const ok = window.confirm(
            "¿Seguro que deseas limpiar la simulación del mapa?\n" +
            "- Se reinicia la capacidad ocupada de todos los aeropuertos\n" +
            "- Se reinicia la capacidad ocupada de todos los vuelos\n" +
            "- Se eliminan las asignaciones actuales de los envíos (pero los envíos se mantienen)"
        );

        if (!ok) return;

        // Bloqueo inmediato local, por si el mensaje STOMP tarda
        setIsClearing(true);

        try {
            const resp = await fetch(CLEAR_MAP_URL, {
                method: "POST",
            });

            if (!resp.ok) {
                const txt = await resp.text().catch(() => null);
                throw new Error("HTTP " + resp.status + (txt ? " - " + txt : ""));
            }

            // OJO: aquí ya NO tocamos el reloj ni initSim,
            // el reloj lo maneja exclusivamente el backend.

            setEnviosCache([]);
            setCounts({ total: 0, inTransit: 0, waiting: 0 });

            if (typeof window !== "undefined") {
                try {
                    window.dispatchEvent(new Event("planificador:iniciado"));
                } catch {
                    // no-op
                }
            }

            alert("Mapa limpiado correctamente.");
        } catch (err) {
            console.error("Error al limpiar mapa:", err);
            alert("Error al limpiar mapa: " + (err.message || err));
        } finally {
            setIsClearing(false);
        }
    }

    return (
        <>
            {/* 🔒 Overlay de bloqueo: cubre toda la pantalla del navegador (esta pestaña) */}
            {isClearing && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15,23,42,0.35)",
                        zIndex: 4000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backdropFilter: "blur(2px)",
                    }}
                >
                    <div
                        style={{
                            background: "#ffffff",
                            padding: "16px 24px",
                            borderRadius: 10,
                            boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 10,
                            minWidth: 260,
                        }}
                    >
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                border: "3px solid #d1d5db",
                                borderTopColor: "#2563eb",
                                animation: "spin 0.9s linear infinite",
                            }}
                        />
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                            Limpiando mapa...
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                color: "#6b7280",
                                textAlign: "center",
                            }}
                        >
                            Por favor espera mientras se reinicia la simulación en todos los
                            usuarios.
                        </div>
                    </div>
                    <style jsx>{`
            @keyframes spin {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
                </div>
            )}

            <div
                style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    background: "rgba(255,255,255,0.95)",
                    padding: "8px 12px",
                    borderRadius: 8,
                    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.12)",
                    minWidth: 540,
                    color: "black",
                }}
                role="group"
                aria-label="Controles de simulación"
            >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                        type="button"
                        onClick={onClearMap}
                        className="btn-clear flex items-center gap-2"
                        disabled={isClearing}
                        style={{
                            opacity: isClearing ? 0.6 : 1,
                            cursor: isClearing ? "wait" : "pointer",
                        }}
                    >
                        Limpiar Mapa
                    </button>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                        type="button"
                        onClick={openAdd}
                        aria-expanded={showAdd}
                        className="btn-green flex items-center gap-2"
                        disabled={isClearing}
                        style={{
                            opacity: isClearing ? 0.6 : 1,
                            cursor: isClearing ? "not-allowed" : "pointer",
                        }}
                    >
                        <PlusCircle size={18} />
                        Envío
                    </button>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>
                        Total Envíos: <b>{estadoCounts.total ?? 0}</b>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, auto)", gap: "4px 14px" }}>
                        {[
                            
                            { k: "PLANIFICADO", label: "Planificado" },
                            { k: "EN_RUTA", label: "En ruta" },
                            { k: "FINALIZADO", label: "Finalizado" },
                            { k: "NULL", label: "Sin estado" },
                        ].map(({ k, label }) => (
                            <div
                                key={k}
                                style={{ marginLeft: 6, fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" }}
                                title={k}
                            >
                                {label}: <b style={{ opacity: 1 }}>{estadoCounts?.[k] ?? 0}</b>
                            </div>
                        ))}
                    </div>



                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        marginLeft: "auto",
                    }}
                >
                    <div
                        style={{ display: "flex", flexDirection: "column", gap: 6 }}
                    >
                        <label style={{ fontSize: 12, opacity: 0.85 }}>Fecha / Hora</label>
                        <input
                            type="datetime-local"
                            value={fechaInicio}
                            onChange={(e) => setFechaInicio(e.target.value)}
                            style={{
                                padding: "6px 8px",
                                borderRadius: 6,
                                border: "1px solid #ddd",
                            }}
                            disabled={isClearing}
                        />
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button
                            type="button"
                            onClick={onApplyInput}
                            className="btn-primary flex items-center gap-2"
                            disabled={isClearing}
                            style={{
                                opacity: isClearing ? 0.6 : 1,
                                cursor: isClearing ? "not-allowed" : "pointer",
                            }}
                        >
                            <PlayCircle size={18} /> Iniciar
                        </button>
                    </div>
                </div>

                {showAdd ? (
                    <form
                        onSubmit={submitNewEnvio}
                        style={{
                            position: "absolute",
                            top: 60,
                            left: 12,
                            zIndex: 2000,
                            background: "#fff",
                            padding: 12,
                            borderRadius: 8,
                            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                flexDirection: "column",
                                minWidth: 320,
                            }}
                        >
                            <label style={{ fontSize: 12, opacity: 0.8 }}>
                                Aeropuerto destino
                            </label>
                            <select
                                value={form.aeropuertoDestinoId}
                                onChange={(e) =>
                                    handleFormChange("aeropuertoDestinoId", e.target.value)
                                }
                                required
                            >
                                <option value="">-- seleccionar --</option>
                                {airports.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.ciudad ?? a.nombre} {a.codigo ? `— ${a.codigo}` : ""}
                                    </option>
                                ))}
                            </select>

                            {/* 🧩 Campo: Número de productos + su teclado justo debajo */}
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                }}
                            >
                                <label style={{ fontSize: 12, opacity: 0.8 }}>
                                    Número de productos
                                </label>
                                <input
                                    type="text"
                                    value={form.numProductos}
                                    readOnly
                                    onClick={() => setActiveKeypad("numProductos")}
                                    onFocus={() => setActiveKeypad("numProductos")}
                                    placeholder="Ingresar cantidad"
                                    style={{
                                        padding: "6px 8px",
                                        borderRadius: 6,
                                        border: "1px solid #d4d4d8",
                                        cursor: "pointer",
                                        backgroundColor:
                                            activeKeypad === "numProductos" ? "#eef2ff" : "white",
                                    }}
                                />

                                {activeKeypad === "numProductos" && (
                                    <div
                                        style={{
                                            marginTop: 6,
                                            display: "grid",
                                            gridTemplateColumns: "repeat(3, 1fr)",
                                            gap: 4,
                                        }}
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => handleNumKeypadPress(n)}
                                                style={{
                                                    padding: "8px 0",
                                                    borderRadius: 6,
                                                    border: "1px solid #d4d4d8",
                                                    background: "#f5f5f5",
                                                    cursor: "pointer",
                                                    fontWeight: 500,
                                                    fontSize: 14,
                                                }}
                                            >
                                                {n}
                                            </button>
                                        ))}

                                        <button
                                            type="button"
                                            onClick={() => handleNumKeypadPress(0)}
                                            style={{
                                                padding: "8px 0",
                                                borderRadius: 6,
                                                border: "1px solid #d4d4d8",
                                                background: "#f5f5f5",
                                                cursor: "pointer",
                                                fontWeight: 500,
                                                fontSize: 14,
                                                gridColumn: "1 / 2",
                                            }}
                                        >
                                            0
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleNumKeypadPress("DEL")}
                                            style={{
                                                padding: "8px 0",
                                                borderRadius: 6,
                                                border: "1px solid #fecaca",
                                                background: "#fee2e2",
                                                cursor: "pointer",
                                                fontWeight: 500,
                                                fontSize: 13,
                                                gridColumn: "2 / 3",
                                            }}
                                        >
                                            ⌫
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleNumKeypadPress("CLR")}
                                            style={{
                                                padding: "8px 0",
                                                borderRadius: 6,
                                                border: "1px solid #fee2e2",
                                                background: "#fef2f2",
                                                cursor: "pointer",
                                                fontWeight: 500,
                                                fontSize: 13,
                                                gridColumn: "3 / 4",
                                            }}
                                        >
                                            CLR
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleNumKeypadPress("OK")}
                                            style={{
                                                marginTop: 4,
                                                padding: "6px 0",
                                                borderRadius: 6,
                                                border: "1px solid #bfdbfe",
                                                background: "#dbeafe",
                                                cursor: "pointer",
                                                fontWeight: 600,
                                                fontSize: 13,
                                                color: "#1d4ed8",
                                                gridColumn: "1 / 4",
                                            }}
                                        >
                                            OK
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 🧩 Campo: Código de cliente + su teclado justo debajo */}
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    marginTop: 8,
                                }}
                            >
                                <label style={{ fontSize: 12, opacity: 0.8 }}>
                                    Código de cliente
                                </label>
                                <input
                                    type="text"
                                    value={form.cliente}
                                    readOnly
                                    onClick={() => setActiveKeypad("cliente")}
                                    onFocus={() => setActiveKeypad("cliente")}
                                    placeholder="Ingresar cliente"
                                    style={{
                                        padding: "6px 8px",
                                        borderRadius: 6,
                                        border: "1px solid #d4d4d8",
                                        cursor: "pointer",
                                        backgroundColor:
                                            activeKeypad === "cliente" ? "#eef2ff" : "white",
                                    }}
                                />

                                {activeKeypad === "cliente" && (
                                    <div
                                        style={{
                                            marginTop: 6,
                                            display: "grid",
                                            gridTemplateColumns: "repeat(3, 1fr)",
                                            gap: 4,
                                        }}
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => handleClienteKeypadPress(n)}
                                                style={{
                                                    padding: "8px 0",
                                                    borderRadius: 6,
                                                    border: "1px solid #d4d4d8",
                                                    background: "#f5f5f5",
                                                    cursor: "pointer",
                                                    fontWeight: 500,
                                                    fontSize: 14,
                                                }}
                                            >
                                                {n}
                                            </button>
                                        ))}

                                        <button
                                            type="button"
                                            onClick={() => handleClienteKeypadPress(0)}
                                            style={{
                                                padding: "8px 0",
                                                borderRadius: 6,
                                                border: "1px solid #d4d4d8",
                                                background: "#f5f5f5",
                                                cursor: "pointer",
                                                fontWeight: 500,
                                                fontSize: 14,
                                                gridColumn: "1 / 2",
                                            }}
                                        >
                                            0
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleClienteKeypadPress("DEL")}
                                            style={{
                                                padding: "8px 0",
                                                borderRadius: 6,
                                                border: "1px solid #fecaca",
                                                background: "#fee2e2",
                                                cursor: "pointer",
                                                fontWeight: 500,
                                                fontSize: 13,
                                                gridColumn: "2 / 3",
                                            }}
                                        >
                                            ⌫
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleClienteKeypadPress("CLR")}
                                            style={{
                                                padding: "8px 0",
                                                borderRadius: 6,
                                                border: "1px solid #fee2e2",
                                                background: "#fef2f2",
                                                cursor: "pointer",
                                                fontWeight: 500,
                                                fontSize: 13,
                                                gridColumn: "3 / 4",
                                            }}
                                        >
                                            CLR
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleClienteKeypadPress("OK")}
                                            style={{
                                                marginTop: 4,
                                                padding: "6px 0",
                                                borderRadius: 6,
                                                border: "1px solid #bfdbfe",
                                                background: "#dbeafe",
                                                cursor: "pointer",
                                                fontWeight: 600,
                                                fontSize: 13,
                                                color: "#1d4ed8",
                                                gridColumn: "1 / 4",
                                            }}
                                        >
                                            OK
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between", // 👈 separa izquierda vs derecha
                                    gap: 8,
                                    marginTop: 10,
                                    width: "100%",
                                }}
                            >
                                {/* input hidden para elegir archivo */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".txt"
                                    style={{ display: "none" }}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) uploadArchivoEnvios(f);
                                    }}
                                />

                                {/* ✅ IZQUIERDA: Cargar archivo */}
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isClearing || isUploadingFile}
                                        style={{
                                            padding: "6px 12px",
                                            opacity: (isClearing || isUploadingFile) ? 0.7 : 1,
                                            cursor: (isClearing || isUploadingFile) ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        {isUploadingFile ? "Cargando..." : "Cargar archivo"}
                                    </button>
                                </div>

                                {/* ✅ DERECHA: Cancelar + Crear envío */}
                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                    <button
                                        type="button"
                                        className="btn-outline"
                                        onClick={() => {
                                            setShowAdd(false);
                                            setActiveKeypad(null);
                                        }}
                                        style={{ padding: "6px 12px" }}
                                        disabled={isClearing || isUploadingFile}
                                    >
                                        Cancelar
                                    </button>

                                    <button
                                        type="submit"
                                        className="btn-accent"
                                        style={{
                                            padding: "6px 12px",
                                            background: "#22c55e",
                                            color: "#fff",
                                            borderRadius: 6,
                                        }}
                                        disabled={isClearing || isUploadingFile}
                                    >
                                        Crear envío
                                    </button>
                                </div>
                            </div>


                        </div>
                    </form>
                ) : null}
            </div>
        </>
    );
}

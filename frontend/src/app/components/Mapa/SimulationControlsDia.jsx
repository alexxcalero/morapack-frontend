"use client";
import React, { useEffect, useState } from "react";
import { PlusCircle } from "lucide-react";
import {
    initSim,
    setSpeed,
    getSpeed,
    setSimMs,
    getSimMs,
    subscribe,
    parseSpanishDatetime,
} from "../../../lib/simTime";

const API_BASE = "https://1inf54-981-5e.inf.pucp.edu.pe/api";
const ENVIO_INSERT_URL = `${API_BASE}/envios/insertar`;
const ENVIO_GET_URL = `${API_BASE}/envios/obtenerTodos`;
const AIRPORTS_URL = "/api/aeropuertos";

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

export default function SimulationControlsDia({ startStr = "31/12/2024, 2:04:00 p. m." }) {
    useEffect(() => {
        const parsed = parseSpanishDatetime(startStr);
        initSim({ startMs: parsed ? parsed.getTime() : Date.now(), stepMs: 1000, speed: 1 });
    }, [startStr]);

    const [speedLocal, setSpeedLocal] = useState(() => getSpeed() || 1);
    const [simMs, setSimMsState] = useState(() => getSimMs());
    const [inputDt, setInputDt] = useState(() => msToDatetimeLocal(getSimMs()));

    const [showAdd, setShowAdd] = useState(false);
    const [airports, setAirports] = useState([]);
    const [form, setForm] = useState({
        fechaIngreso: msToDatetimeLocal(getSimMs()),
        husoHorarioDestino: "-5",
        aeropuertoDestinoId: "",
        aeropuertoOrigenId: "",
        numProductos: 1,
        cliente: "",
    });

    const [counts, setCounts] = useState({ total: 0, inTransit: 0, waiting: 0 });
    const [enviosCache, setEnviosCache] = useState([]);

    useEffect(() => {
        const unsub = subscribe((ms) => {
            setSimMsState(ms);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        setSpeed(Number(speedLocal));
    }, [speedLocal]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const r = await fetch(AIRPORTS_URL);
                if (!r.ok) throw new Error("aeropuertos " + r.status);
                const data = await r.json();
                if (!mounted) return;
                setAirports(data || []);
            } catch (err) {
                console.error("fetch airports:", err);
                setAirports([]);
            }
        })();
        return () => (mounted = false);
    }, []);

    useEffect(() => {
        let mounted = true;
        async function refreshEnvios() {
            try {
                const r = await fetch(ENVIO_GET_URL);
                if (!r.ok) throw new Error("envios " + r.status);
                const data = await r.json();
                if (!mounted) return;
                setEnviosCache(data || []);
                computeCounts(data || []);
            } catch (err) {
                console.error("fetch envios:", err);
                setEnviosCache([]);
                setCounts({ total: 0, inTransit: 0, waiting: 0 });
            }
        }
        refreshEnvios();
        const iv = setInterval(refreshEnvios, 30_000);
        return () => { mounted = false; clearInterval(iv); };
    }, []);

    function computeCounts(envios) {
        const now = new Date(getSimMs()).getTime();
        let total = envios.length;
        let inTransit = 0;
        let waiting = 0;
        for (const e of envios) {
            let ms = null;
            try {
                ms = e.fechaIngreso ? new Date(e.fechaIngreso).getTime() : null;
            } catch { ms = null; }
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

    const onApplyInput = () => {
        const ms = parseInputToMs(inputDt);
        if (!ms) {
            alert("Fecha/hora inválida.");
            return;
        }
        initSim({ startMs: ms, stepMs: 1000, speed: Number(speedLocal) || 1 });
        setSimMsState(ms);
        setInputDt(msToDatetimeLocal(ms));
    };

    const onSetNow = () => {
        const now = Date.now();
        setSimMs(now);
        setInputDt(msToDatetimeLocal(now));
    };

    const onTogglePause = () => {
        const current = getSpeed();
        if (!current || Number(current) === 0) {
            setSpeedLocal(1);
        } else {
            setSpeedLocal(0);
        }
    };

    // ---- Add Envio handlers ----
    const openAdd = () => {
        setForm({
            fechaIngreso: msToDatetimeLocal(getSimMs()),
            husoHorarioDestino: "-5",
            aeropuertoDestinoId: airports.length ? airports[0].id : "",
            aeropuertoOrigenId: "", // opcional
            numProductos: 1,
            cliente: "",
        });
        setShowAdd(true);
    };

    const handleFormChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    async function submitNewEnvio(e) {
        e.preventDefault();
        if (!form.fechaIngreso || !form.aeropuertoDestinoId) {
            alert("Rellena fecha y aeropuerto destino.");
            return;
        }

        const fd = new FormData();
        const f = form.fechaIngreso.length === 16 ? `${form.fechaIngreso}:00` : form.fechaIngreso;
        fd.append("fechaIngreso", f);
        fd.append("husoHorarioDestino", String(form.husoHorarioDestino));
        fd.append("aeropuertoDestino.id", String(form.aeropuertoDestinoId));
        if (form.aeropuertoOrigenId) fd.append("aeropuertoOrigen.id", String(form.aeropuertoOrigenId));
        fd.append("numProductos", String(form.numProductos));
        fd.append("cliente", String(form.cliente || ""));

        try {
            const r = await fetch(ENVIO_INSERT_URL, {
                method: "POST",
                body: fd,
            });

            if (!r.ok) {
                const txt = await r.text().catch(() => null);
                throw new Error("HTTP " + r.status + (txt ? " - " + txt : ""));
            }

            const saved = await r.json();
            const newCache = [saved, ...enviosCache];
            setEnviosCache(newCache);
            computeCounts(newCache);
            setShowAdd(false);
            alert("Envío creado (id: " + (saved.id || "n/d") + ")");
        } catch (err) {
            console.error("error insert envio:", err);
            alert("Error al insertar envío: " + (err.message || err));
        }
    }

    // UI:
    return (
        <div
            style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                background: "rgba(255,255,255,0.95)",
                padding: "8px 12px",
                borderRadius: 8,
                boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                minWidth: 520,
                color: "black",
            }}
            role="group"
            aria-label="Controles de simulación"
        >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                    type="button"
                    onClick={openAdd}
                    aria-expanded={showAdd}
                    className="btn-primary flex items-center gap-2"
                >
                    <PlusCircle size={18} />
                    Envío
                </button>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Total</div>
                    <div style={{ fontWeight: 700 }}>{counts.total}</div>
                </div>
                <div style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>En vuelo</div>
                    <div style={{ fontWeight: 700, color: "#f59e0b" }}>{counts.inTransit}</div>
                </div>
                <div style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>En espera</div>
                    <div style={{ fontWeight: 700, color: "#64748b" }}>{counts.waiting}</div>
                </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginLeft: "auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, opacity: 0.85 }}>Velocidad</label>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={speedLocal}
                        onChange={(e) => setSpeedLocal(Number(e.target.value))}
                        aria-label="Velocidad simulación"
                    />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, opacity: 0.85 }}>Simulación</label>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={onTogglePause} style={{ padding: "6px 10px" }}>
                            {Number(getSpeed()) === 0 ? "Continuar" : "Pausar"}
                        </button>
                        <button type="button" onClick={onSetNow} style={{ padding: "6px 10px" }}>Ahora</button>
                    </div>
                </div>
            </div>

            {showAdd ? (
                <form onSubmit={submitNewEnvio} style={{ position: "absolute", top: 60, left: 12, zIndex: 2000, background: "#fff", padding: 12, borderRadius: 8, boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}>
                    <div style={{ display: "flex", gap: 8, flexDirection: "column", minWidth: 320 }}>
                        <label style={{ fontSize: 12, opacity: 0.8 }}>Fecha y hora (ingreso)</label>
                        <input type="datetime-local" value={form.fechaIngreso} onChange={(e) => handleFormChange("fechaIngreso", e.target.value)} required />
                        <label style={{ fontSize: 12, opacity: 0.8 }}>Aeropuerto destino</label>
                        <select value={form.aeropuertoDestinoId} onChange={(e) => handleFormChange("aeropuertoDestinoId", e.target.value)} required>
                            <option value="">-- seleccionar --</option>
                            {airports.map(a => <option key={a.id} value={a.id}>{a.ciudad ?? a.nombre} {a.codigo ? `— ${a.codigo}` : ""}</option>)}
                        </select>
                        <label style={{ fontSize: 12, opacity: 0.8 }}>Aeropuerto origen (opcional)</label>
                        <select value={form.aeropuertoOrigenId} onChange={(e) => handleFormChange("aeropuertoOrigenId", e.target.value)}>
                            <option value="">-- ninguno --</option>
                            {airports.map(a => <option key={a.id} value={a.id}>{a.ciudad ?? a.nombre} {a.codigo ? `— ${a.codigo}` : ""}</option>)}
                        </select>
                        <label style={{ fontSize: 12, opacity: 0.8 }}>Número de productos</label>
                        <input type="number" min={1} value={form.numProductos} onChange={(e) => handleFormChange("numProductos", Number(e.target.value))} />
                        <label style={{ fontSize: 12, opacity: 0.8 }}>Cliente</label>
                        <input type="text" value={form.cliente} onChange={(e) => handleFormChange("cliente", e.target.value)} />
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => setShowAdd(false)} style={{ padding: "6px 12px" }}>Cancelar</button>
                            <button type="submit" style={{ padding: "6px 12px", background: "#22c55e", color: "#fff", borderRadius: 6 }}>Crear envío</button>
                        </div>
                    </div>
                </form>
            ) : null}
        </div>
    );
}

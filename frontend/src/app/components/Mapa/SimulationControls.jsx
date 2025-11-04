"use client";

import React, { useEffect, useState } from "react";
import {
    initSim,
    setSpeed,
    getSpeed,
    setSimMs,
    getSimMs,
    subscribe,
    parseSpanishDatetime,
} from "../../../lib/simTime";

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

export default function SimulationControls({ startStr = "31/12/2024, 2:04:00 p. m." }) {
    useEffect(() => {
        const parsed = parseSpanishDatetime(startStr);
        initSim({ startMs: parsed ? parsed.getTime() : Date.now(), stepMs: 1000, speed: 1 });
    }, [startStr]);

    const [speedLocal, setSpeedLocal] = useState(() => getSpeed() || 1);
    const [simMs, setSimMsState] = useState(() => getSimMs());
    const [inputDt, setInputDt] = useState(() => msToDatetimeLocal(getSimMs()));

    useEffect(() => {
        const unsub = subscribe((ms) => {
            setSimMsState(ms);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        setSpeed(Number(speedLocal));
    }, [speedLocal]);

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

    const simDate = new Date(simMs || Date.now());
    const simTimeStr = simDate.toLocaleString();

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
                minWidth: 420,
                color: "black",
            }}
            role="group"
            aria-label="Controles de simulación"
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Hora simulada</div>
                <div style={{ fontWeight: 700 }}>{simTimeStr}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.85 }}>Iniciar en (fecha y hora)</label>
                <input
                    type="datetime-local"
                    value={inputDt}
                    onChange={(e) => setInputDt(e.target.value)}
                    style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={onApplyInput} className="btn-primary">Aplicar fecha</button>
                    <button type="button" onClick={onSetNow} className="btn-secondary">Ahora</button>
                </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, opacity: 0.85 }}>Velocidad</label>
                    <input
                        type="range"
                        min={0}
                        max={999}
                        step={10}
                        value={speedLocal}
                        onChange={(e) => setSpeedLocal(Number(e.target.value))}
                        aria-label="Velocidad simulación"
                    />
                    <input
                        type="number"
                        value={Number(speedLocal).toFixed(1)}
                        onChange={(e) => {
                            let v = Number(e.target.value);
                            if (Number.isNaN(v)) v = 0;
                            setSpeedLocal(v);
                        }}
                        style={{ width: 64, padding: "4px 6px", borderRadius: 6, border: "1px solid #ddd" }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={onTogglePause} className="btn-ghost">
                            {Number(getSpeed()) === 0 ? "Continuar" : "Pausar"}
                        </button>
                    </div>
            </div>
        </div>
    );
}

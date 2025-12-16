// src/app/components/Mapa/HoraActual.jsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { getSimMs, initSim, isRunning, getSpeed, subscribe } from "../../../lib/simTime";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

function fmtDate(d) {
  if (!d) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hours = Math.floor(absOffset / 60);
  const minutes = absOffset % 60;
  const tz = `UTC${sign}${pad(hours)}:${pad(minutes)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} (${tz})`;
}

function fmtElapsed(ms) {
  if (ms == null || ms < 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}

export default function HoraActual({ simulacionIniciada = false, onRealElapsed }) {
  const [realNow, setRealNow] = useState(() => new Date());
  const [simNow, setSimNow] = useState(null);
  const [realElapsed, setRealElapsed] = useState(0);
  const [simElapsed, setSimElapsed] = useState(0);
  const [activo, setActivo] = useState(false);

  const realStartRef = useRef(null);
  const simStartRef = useRef(null);
  const rafRef = useRef(null);
  const inicializadoRef = useRef(false);

  // ✅ SIMPLIFICADO: Activar contadores cuando simulacionIniciada cambia a true
  useEffect(() => {
    if (simulacionIniciada && !inicializadoRef.current) {
      // Esperar un momento para que simTime tenga datos válidos
      const timer = setTimeout(() => {
        const ms = getSimMs();
        console.log('✅ Inicializando contadores - simMs:', ms, new Date(ms).toISOString());
        realStartRef.current = Date.now();
        simStartRef.current = ms;
        setRealElapsed(0);
        setSimElapsed(0);
        setSimNow(new Date(ms));
        setActivo(true);
        inicializadoRef.current = true;
      }, 500); // Pequeño delay para asegurar que simTime está listo

      return () => clearTimeout(timer);
    }

    if (!simulacionIniciada) {
      // Reset cuando se detiene
      inicializadoRef.current = false;
      setActivo(false);
      setSimNow(null);
      setRealElapsed(0);
      setSimElapsed(0);
    }
  }, [simulacionIniciada]);

  // Suscribirse a cambios en simTime para detectar saltos (auto-avance)
  useEffect(() => {
    let lastMs = null;

    const unsub = subscribe((newSimMs) => {
      // Detectar salto grande (auto-avance inicial)
      if (lastMs != null && inicializadoRef.current) {
        const diff = Math.abs(newSimMs - lastMs);
        if (diff > 3600000) { // > 1 hora = salto
          console.log('🔄 Salto detectado - reiniciando simStart:', newSimMs);
          simStartRef.current = newSimMs;
          setSimElapsed(0);
        }
      }
      lastMs = newSimMs;
    });

    return unsub;
  }, []);

  // Poll estado planificador (backup)
  const fetchEstado = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/planificador/estado-simple`);
      const j = await r.json();
      const nuevoActivo = !!j?.planificadorActivo;

      // Si el backend dice activo pero no hemos inicializado, hacerlo ahora
      if (nuevoActivo && !inicializadoRef.current) {
        const ms = getSimMs();
        console.log('✅ Inicializando contadores desde polling - simMs:', ms);
        realStartRef.current = Date.now();
        simStartRef.current = ms;
        setRealElapsed(0);
        setSimElapsed(0);
        setSimNow(new Date(ms));
        setActivo(true);
        inicializadoRef.current = true;

        // Asegurar que el ticker está corriendo
        if (!isRunning()) {
          const speed = getSpeed() || 1;
          initSim({ startMs: ms, stepMs: 1000, speed });
        }
      } else if (!nuevoActivo && inicializadoRef.current) {
        // Backend inactivo - resetear
        inicializadoRef.current = false;
        setActivo(false);
      }
    } catch { /* ignorar */ }
  }, []);

  useEffect(() => {
    fetchEstado();
    const iv = setInterval(fetchEstado, 5000);
    return () => clearInterval(iv);
  }, [fetchEstado]);

  // Reloj que actualiza todos los valores
  useEffect(() => {
    const tick = () => {
      const nowRealMs = Date.now();
      setRealNow(new Date(nowRealMs));

      if (inicializadoRef.current) {
        const simMs = getSimMs();
        setSimNow(new Date(simMs));

        if (simStartRef.current != null) {
          setSimElapsed(simMs - simStartRef.current);
        }
        if (realStartRef.current != null) {
          const elapsed = nowRealMs - realStartRef.current;
          setRealElapsed(elapsed);
          if (typeof onRealElapsed === 'function') {
            onRealElapsed(elapsed);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [onRealElapsed]);

  const box = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "rgba(255,255,255,0.95)",
    padding: "12px 16px",
    borderRadius: 14,
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
    fontFamily: "system-ui,sans-serif",
    minWidth: 270
  };
  const label = { fontSize: 11, fontWeight: 600, letterSpacing: ".5px", color: "#64748b", textTransform: "uppercase" };
  const val = { fontSize: 14, fontWeight: 600, color: "#0f172a", fontVariantNumeric: "tabular-nums" };
  const elapsedStyle = active => ({
    fontSize: 13, fontWeight: 600,
    color: active ? "#0f172a" : "#64748b",
    fontVariantNumeric: "tabular-nums"
  });

  return (
    <div style={box}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={label}>Fecha / Hora real</span>
        <span style={val}>{fmtDate(realNow)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={label}>Fecha / Hora simulada</span>
        <span style={val}>{simNow ? fmtDate(simNow) : "-"}</span>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={label}>Transcurrido real</span>
          <span style={elapsedStyle(activo)}>
            {fmtElapsed(realElapsed)} {!activo && realElapsed > 0 && "(pausado)"}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={label}>Transcurrido sim.</span>
          <span style={elapsedStyle(activo)}>
            {fmtElapsed(simElapsed)} {!activo && simElapsed > 0 && "(pausado)"}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "right" }}>
        Estado: {activo ? "En ejecución" : "Detenido"}
      </div>
    </div>
  );
}

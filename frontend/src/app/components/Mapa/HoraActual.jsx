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

export default function HoraActual({ simulacionIniciada = false }) {
  const [realNow, setRealNow] = useState(() => new Date());
  const [simNow, setSimNow] = useState(null);
  const [realElapsed, setRealElapsed] = useState(0);
  const [simElapsed, setSimElapsed] = useState(0);
  const [activo, setActivo] = useState(false);
  const [contadoresActivados, setContadoresActivados] = useState(false);

  const realStartRef = useRef(null);
  const simStartRef = useRef(null);
  const rafRef = useRef(null);
  const lastSimMsRef = useRef(null);
  const contadoresActivadosRef = useRef(false); // ← Ref para acceder en RAF loop

  // Activar contadores cuando la simulación realmente inicia (después del auto-avance)
  useEffect(() => {
    console.log('🔍 Verificando activación de contadores:', {
      simulacionIniciada,
      activo,
      contadoresActivados
    });

    if (simulacionIniciada && activo && !contadoresActivados) {
      const ms = getSimMs();
      realStartRef.current = Date.now();
      simStartRef.current = ms;
      setRealElapsed(0);
      setSimElapsed(0);
      setSimNow(new Date(ms)); // Mostrar fecha/hora simulada AHORA
      setContadoresActivados(true);
      contadoresActivadosRef.current = true; // ← Actualizar el ref también
      console.log('✅ Contadores activados - simStart:', ms, new Date(ms).toISOString());
    }
  }, [simulacionIniciada, activo]); // ← Quitar contadoresActivados de las dependencias

  // Resetear contadores cuando cambia la simulación
  useEffect(() => {
    if (!activo) {
      setContadoresActivados(false);
      contadoresActivadosRef.current = false; // ← Resetear el ref también
    }
  }, [activo]);

  // Suscribirse a cambios en simTime para detectar reinicios
  useEffect(() => {
    const unsub = subscribe((newSimMs) => {
      // Detectar un salto grande en el tiempo (reinicio de simulación)
      if (lastSimMsRef.current != null && activo) {
        const diff = Math.abs(newSimMs - lastSimMsRef.current);
        // Si hay un salto mayor a 1 hora, es el auto-avance
        if (diff > 3600000) {
          console.log('🔄 Reinicio detectado en simTime - Nuevo inicio:', newSimMs, new Date(newSimMs).toISOString());

          // Si no están activados los contadores, activarlos ahora (es el auto-avance inicial)
          if (!contadoresActivadosRef.current) {
            realStartRef.current = Date.now();
            simStartRef.current = newSimMs;
            setRealElapsed(0);
            setSimElapsed(0);
            setSimNow(new Date(newSimMs));
            setContadoresActivados(true);
            contadoresActivadosRef.current = true; // ← Actualizar el ref también
            console.log('✅ Contadores activados por auto-avance - simStart:', newSimMs, new Date(newSimMs).toISOString());
          } else {
            // Si ya están activados, solo reiniciar el punto de inicio
            simStartRef.current = newSimMs;
            setSimElapsed(0);
          }
        }
      }
      lastSimMsRef.current = newSimMs;
    });
    return unsub;
  }, [activo]);

  // Poll estado planificador (usando endpoint ligero para evitar cargar 43K+ envíos)
  const fetchEstado = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/planificador/estado-simple`);
      const j = await r.json();
      const nuevoActivo = !!j?.planificadorActivo;

      setActivo(prev => {
        if (prev !== nuevoActivo) {
          if (nuevoActivo) {
            // inicio simulación - NO inicializar contadores aún, esperar auto-avance
            const ms = getSimMs();
            console.log('⏰ Simulación backend iniciada - Esperando auto-avance...');
            // ✅ CRÍTICO: Asegurar que el ticker de simTime está corriendo
            if (!isRunning()) {
              const speed = getSpeed() || 1;
              initSim({ startMs: ms, stepMs: 1000, speed });
              console.log('⏰ Ticker de simulación iniciado - speed:', speed);
            }
          } else {
            // Detener: resetear contadores y limpiar simNow
            setContadoresActivados(false);
            setSimNow(null);
          }
        }
        return nuevoActivo;
      });
    } catch { /* ignorar */ }
  }, []);

  useEffect(() => {
    fetchEstado();
    const iv = setInterval(fetchEstado, 5000);
    return () => clearInterval(iv);
  }, [fetchEstado]);

  // Reloj real suave
  useEffect(() => {
    const tick = () => {
      const nowRealMs = Date.now();
      // actualizar real cada frame (suave)
      setRealNow(new Date(nowRealMs));

      // Mostrar hora simulada SOLO si los contadores están activados
      const simMs = getSimMs();
      if (contadoresActivadosRef.current) { // ← Usar el ref en lugar del estado
        setSimNow(new Date(simMs));

        // Calcular transcurrido sim
        if (simStartRef.current != null) {
          const elapsed = simMs - simStartRef.current;
          setSimElapsed(elapsed);
          // Log para debug cada 5 segundos
          if (Math.floor(nowRealMs / 5000) !== Math.floor((nowRealMs - 16) / 5000)) {
            console.log('⏱️ simMs:', simMs, 'simStart:', simStartRef.current, 'elapsed:', elapsed, 'formatted:', fmtElapsed(elapsed));
          }
        }

        // El transcurrido real solo avanza cuando activo y contadores activados
        if (realStartRef.current != null) {
          setRealElapsed(nowRealMs - realStartRef.current);
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
  }, []); // ← Sin dependencias, solo se ejecuta una vez

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

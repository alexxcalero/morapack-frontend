// src/app/components/Mapa/HoraActual.jsx
"use client";

import React, { useEffect, useState, useRef } from "react";
import { initSim, subscribe, getSimMs, parseSpanishDatetime } from "../../../lib/simTime";

/**
 * parseBackendTime: convierte "2025-01-01 03:34:00Z-5" -> Date (instante UTC correcto)
 * Si la cadena no coincide, intenta Date(t) como fallback.
 */
function parseBackendTime(s) {
  if (!s) return null;
  const t = String(s).trim();
  // Pattern: YYYY-MM-DD HH:MM:SS Z? offset?
  const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:Z)?([+\-]?\d+)?$/);
  if (!m) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, datePart, timePart, offStr] = m;
  const off = offStr ? parseInt(offStr, 10) : 0;
  const [y, mo, day] = datePart.split("-").map(x => parseInt(x, 10));
  const [hh, mm, ss] = timePart.split(":").map(x => parseInt(x, 10));
  // Convertir según convención usada anteriormente:
  const utcMillis = Date.UTC(y, mo - 1, day, hh - off, mm, ss);
  return new Date(utcMillis);
}

export default function HoraActual({
  startStr = null,
  locale = undefined,
  showUtc = true,
  style = {}
}) {
  const [statusMsg, setStatusMsg] = useState("");

  // ⭐ Nuevos refs para anclar inicios y poder calcular transcurridos
  const simStartRef = useRef(null);
  const realStartRef = useRef(null);

  // ⭐ Reloj de tiempo real
  const [realNowMs, setRealNowMs] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setRealNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function decideStart() {
      try {
        // 1) Si startStr se pasó explícito -> usarlo (2h antes)
        if (startStr) {
          const parsed = parseSpanishDatetime(startStr);
          const startMs = parsed ? parsed.getTime() : Date.now();
          initSim({ startMs, stepMs: 1000, speed: 1 });
          // ⭐ Anclar inicios
          simStartRef.current = startMs;
          realStartRef.current = Date.now();
          if (mounted) setStatusMsg(`Sim. iniciada: ${new Date(startMs).toLocaleString()}`);
          return;
        }

        // 2) startStr no proporcionado -> iniciar 2h antes de ahora
        const fallback = Date.now() - 2 * 60 * 60 * 1000;
        initSim({ startMs: fallback, stepMs: 1000, speed: 1 });
        // ⭐ Anclar inicios
        simStartRef.current = fallback;
        realStartRef.current = Date.now();
        if (mounted) setStatusMsg("Sim. iniciada (ahora -2h)");
      } catch (err) {
        console.error("HoraActual decideStart error:", err);
      }
    }

    decideStart();
    return () => { mounted = false; };
    // startStr es dependencia por si quieres forzar cambio
  }, [startStr]);

  // Suscripción al tiempo de simulación
  const [nowMs, setNowMs] = useState(() => getSimMs());
  useEffect(() => {
    const unsub = subscribe((ms) => {
      setNowMs(ms);
      // ⭐ Si no tenemos anclado inicio simulado (por ejemplo, si otro componente llamó initSim)
      if (simStartRef.current == null) simStartRef.current = ms;
      if (realStartRef.current == null) realStartRef.current = Date.now();
    });
    return () => unsub();
  }, []);

  // Formateadores
  const localeToUse = locale || (typeof navigator !== "undefined" ? navigator.language : "es-PE");
  const now = new Date(nowMs);
  const realNow = new Date(realNowMs);

  const dateStr = now.toLocaleDateString(localeToUse, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString(localeToUse, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const realDateStr = realNow.toLocaleDateString(localeToUse, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const realTimeStr = realNow.toLocaleTimeString(localeToUse, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const tzOffsetMin = -now.getTimezoneOffset();
  const tzSign = tzOffsetMin >= 0 ? "+" : "-";
  const tzHours = Math.floor(Math.abs(tzOffsetMin) / 60);
  const tzMins = Math.abs(tzOffsetMin) % 60;
  const tzStr = `UTC${tzSign}${String(tzHours).padStart(2, "0")}:${String(tzMins).padStart(2, "0")}`;
  const utcStr = new Date(now.getTime() + now.getTimezoneOffset() * 60000).toISOString().replace("T", " ").split(".")[0];

  // ⭐ Formatear duración (DD d HH:MM:SS)
  function formatDuration(ms) {
    let s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); const sec = s - m * 60;
    return `${String(d).padStart(2, "0")}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  const simElapsedStr = simStartRef.current != null ? formatDuration(nowMs - simStartRef.current) : "—";
  const realElapsedStr = realStartRef.current != null ? formatDuration(realNowMs - realStartRef.current) : "—";

  const baseStyle = {
    position: "relative",
    right: 0,
    top: 0,
    zIndex: 1200,
    background: "rgba(255,255,255,0.95)",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    padding: "8px 12px",
    minWidth: 260,
    fontFamily: "Inter, Roboto, Arial, sans-serif",
    fontSize: 13,
    color: "#111",
    ...style,
  };

  return (
    <div style={baseStyle} aria-live="polite" role="status">
      {/* Momento SIMULADO (fecha y hora con segundos) */}
      <div style={{ fontWeight: 700, color: "#0f172a" }}>Simulación</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>{dateStr}</div>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
      </div>

      {/* Momento ACTUAL (tiempo real) */}
      <div style={{ marginTop: 6, fontWeight: 700, color: "#0f172a" }}>Tiempo real</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>{realDateStr}</div>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>{realTimeStr}</div>
      </div>

      {/* Transcurridos */}
      <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ opacity: 0.8 }}>Transcurrido sim.</div>
          <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{simElapsedStr}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
          <div style={{ opacity: 0.8 }}>Transcurrido real</div>
          <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{realElapsedStr}</div>
        </div>
      </div>

      {/* Zona UTC / estado (opcional) */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, opacity: 0.85 }}>
        <div>{tzStr}</div>
        {showUtc ? <div style={{ opacity: 0.9 }}>UTC: {utcStr}</div> : null}
      </div>
      {statusMsg ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{statusMsg}</div> : null}
    </div>
  );
}

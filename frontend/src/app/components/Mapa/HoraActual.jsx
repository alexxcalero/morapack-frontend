// src/app/components/Mapa/HoraActual.jsx
"use client";

import React, { useEffect, useState } from "react";
import { initSim, subscribe, getSimMs, parseSpanishDatetime } from "../../../lib/simTime";
import { fetchVuelos, getCachedFlights } from "../../../lib/vuelos";

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

  useEffect(() => {
    let mounted = true;

    async function decideStart() {
      try {
        // 1) Si startStr se pasó explícito -> usarlo (2h antes)
        if (startStr) {
          const parsed = parseSpanishDatetime(startStr);
          const startMs = parsed ? parsed.getTime() - 2 * 60 * 60 * 1000 : Date.now() - 2 * 60 * 60 * 1000;
          initSim({ startMs, stepMs: 1000, speed: 1 });
          if (mounted) setStatusMsg(`Sim. iniciada: ${new Date(startMs).toLocaleString()}`);
          return;
        }

        // 2) startStr no proporcionado -> buscar TODOS los vuelos y tomar la fecha mínima
        setStatusMsg("Obteniendo vuelos para determinar inicio...");
        const vuelos = await fetchVuelos({ force: false });

        if (!Array.isArray(vuelos) || vuelos.length === 0) {
          const fallback = Date.now() - 2 * 60 * 60 * 1000;
          initSim({ startMs: fallback, stepMs: 1000, speed: 1 });
          if (mounted) setStatusMsg("No hay vuelos: sim. iniciada (ahora -2h)");
          return;
        }

        // parsear todas las horas de salida y quedarnos con la mínima
        const parsedPairs = vuelos
          .map(v => {
            const s = v.horaOrigen ?? v.horaOrigenStr ?? v.hora_salida ?? v.hora_salida_local ?? "";
            const d = parseBackendTime(s);
            return { raw: v, d };
          })
          .filter(x => x.d instanceof Date && !isNaN(x.d.getTime()));

        if (!parsedPairs.length) {
          const fallback = Date.now() - 2 * 60 * 60 * 1000;
          initSim({ startMs: fallback, stepMs: 1000, speed: 1 });
          if (mounted) setStatusMsg("No se pudieron parsear horas: sim. iniciada (ahora -2h)");
          return;
        }

        // encontrar la mínima (la fecha más temprana)
        let min = parsedPairs[0];
        for (let i = 1; i < parsedPairs.length; i++) {
          if (parsedPairs[i].d.getTime() < min.d.getTime()) min = parsedPairs[i];
        }

        const startMs = min.d.getTime() - 2 * 60 * 60 * 1000; // 2 horas antes
        initSim({ startMs, stepMs: 1000, speed: 1 });
        if (mounted) setStatusMsg(`Sim. iniciada 2h antes del vuelo mínimo (id ${min.raw.idTramo ?? min.raw.id ?? "?"}): ${new Date(startMs).toLocaleString()}`);
      } catch (err) {
        console.error("HoraActual decideStart error:", err);
        const fallback = Date.now() - 2 * 60 * 60 * 1000;
        try { initSim({ startMs: fallback, stepMs: 1000, speed: 1 }); } catch (e) {}
        if (mounted) setStatusMsg("Error al obtener vuelos: sim iniciada (fallback)");
      }
    }

    decideStart();
    return () => { mounted = false; };
    // startStr es dependencia por si quieres forzar cambio
  }, [startStr]);

  const [nowMs, setNowMs] = useState(() => getSimMs());
  useEffect(() => {
    const unsub = subscribe((ms) => setNowMs(ms));
    return () => unsub();
  }, []);

  const now = new Date(nowMs);

  const localeToUse = locale || (typeof navigator !== "undefined" ? navigator.language : "es-PE");
  const timeStr = now.toLocaleTimeString(localeToUse, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString(localeToUse, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

  const tzOffsetMin = -now.getTimezoneOffset();
  const tzSign = tzOffsetMin >= 0 ? "+" : "-";
  const tzHours = Math.floor(Math.abs(tzOffsetMin) / 60);
  const tzMins = Math.abs(tzOffsetMin) % 60;
  const tzStr = `UTC${tzSign}${String(tzHours).padStart(2, "0")}:${String(tzMins).padStart(2, "0")}`;

  const utcStr = new Date(now.getTime() + now.getTimezoneOffset() * 60000).toISOString().replace("T", " ").split(".")[0];

  const baseStyle = {
    position: "relative",
    right: 0,
    top: 0,
    zIndex: 1200,
    background: "rgba(255,255,255,0.95)",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    padding: "8px 12px",
    minWidth: 220,
    fontFamily: "Inter, Roboto, Arial, sans-serif",
    fontSize: 13,
    color: "#111",
    ...style,
  };

  return (
    <div style={baseStyle} aria-live="polite" role="status">
      <div style={{ fontSize: 12, opacity: 0.85 }}>{dateStr}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, lineHeight: 1 }}>{timeStr}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, opacity: 0.85 }}>
        <div>{tzStr}</div>
        {showUtc ? <div style={{ opacity: 0.9 }}>UTC: {utcStr}</div> : null}
      </div>
      {statusMsg ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{statusMsg}</div> : null}
    </div>
  );
}

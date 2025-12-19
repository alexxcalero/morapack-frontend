// src/app/components/Mapa/HoraActual.jsx
"use client";

import React, { useEffect, useState } from "react";
import { subscribe, initSim } from "../../../lib/simTime";

const LIMA_SIM_START_DATE = new Date(Date.now());
const SIM_START_DIA_MS = LIMA_SIM_START_DATE.getTime();

export default function HoraActual({
  locale = undefined,
  showUtc = true,
  style = {},
}) {
  const [nowMs, setNowMs] = useState(() => SIM_START_DIA_MS);

  useEffect(() => {
    // Inicializar la simulación día a día en tiempo real
    if (typeof initSim === "function") {
      initSim({
        startMs: SIM_START_DIA_MS,
        speed: 1,          // 1x: avanza al mismo ritmo que el tiempo real
      });
    }

    // Suscribirse a las actualizaciones del tiempo simulado
    const unsub = subscribe((ms) => setNowMs(ms));
    return () => unsub();
  }, []);

  const now = new Date(nowMs || Date.now());
  const localeToUse =
    locale || (typeof navigator !== "undefined" ? navigator.language : "es-PE");

  // ✅ Hora y fecha forzadas a Lima (aunque tu PC tenga otra zona)
  const timeStr = new Intl.DateTimeFormat(localeToUse, {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);

  const dateStr = new Intl.DateTimeFormat(localeToUse, {
    timeZone: "America/Lima",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(now);

  // ✅ Lima fijo
  const tzStr = "UTC-05:00";

  // ✅ UTC real
  const utcStr = new Intl.DateTimeFormat(localeToUse, {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);


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
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginTop: 4,
          lineHeight: 1,
        }}
      >
        {timeStr}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 12,
          opacity: 0.85,
        }}
      >
        <div>{tzStr}</div>
        {showUtc ? <div style={{ opacity: 0.9 }}>UTC: {utcStr}</div> : null}
      </div>
    </div>
  );
}

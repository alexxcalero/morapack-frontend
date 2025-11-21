// src/app/components/Mapa/HoraActual.jsx
"use client";

import React, { useEffect, useState } from "react";
import { subscribe, getSimMs } from "../../../lib/simTime";

export default function HoraActual({
  locale = undefined,
  showUtc = true,
  style = {},
}) {
  const [nowMs, setNowMs] = useState(() => getSimMs());

  useEffect(() => {
    const unsub = subscribe((ms) => setNowMs(ms));
    return () => unsub();
  }, []);

  const now = new Date(nowMs || Date.now());
  const localeToUse =
    locale || (typeof navigator !== "undefined" ? navigator.language : "es-PE");
  const timeStr = now.toLocaleTimeString(localeToUse, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateStr = now.toLocaleDateString(localeToUse, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const tzOffsetMin = -now.getTimezoneOffset();
  const tzSign = tzOffsetMin >= 0 ? "+" : "-";
  const tzHours = Math.floor(Math.abs(tzOffsetMin) / 60);
  const tzMins = Math.abs(tzOffsetMin) % 60;
  const tzStr = `UTC${tzSign}${String(tzHours).padStart(2, "0")}:${String(
    tzMins
  ).padStart(2, "0")}`;

  const utcStr = new Date(
    now.getTime() + now.getTimezoneOffset() * 60000
  )
    .toISOString()
    .replace("T", " ")
    .split(".")[0];

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

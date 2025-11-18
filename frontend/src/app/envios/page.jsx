import React from "react";
import TablaEnvios from "../components/Tablas/TablaEnvios";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Envíos | MoraPack",
};

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";
const URL = `${API_BASE}/api/envios/obtenerTodos`;

export default async function Page() {
  let data = [];
  try {
    const res = await fetch(URL, { cache: "no-store" });
    if (!res.ok) {
      console.error("Error al obtener envios:", res.status);
    } else {
      data = await res.json();
    }
  } catch (err) {
    console.error("Fallo fetch envios:", err);
  }

  const initialRows = (data || []).map((e) => {
    const parteAsignadas = Array.isArray(e.parteAsignadas) ? e.parteAsignadas : [];
    const cantidadAsignada = parteAsignadas.reduce((s, p) => s + (p.cantidad ?? 0), 0);
    const restante = Math.max(0, (e.numProductos ?? 0) - cantidadAsignada);

    let estado = "pendiente";
    if (cantidadAsignada >= (e.numProductos ?? 0) && (e.numProductos ?? 0) > 0) estado = "entregado";
    else if (parteAsignadas.length > 0) estado = "en tránsito";

    const destino = e.aeropuertoDestino
      ? `${e.aeropuertoDestino.codigo ?? ""} — ${e.aeropuertoDestino.ciudad ?? ""}`
      : "N/D";

    const origen = e.aeropuertoOrigen
      ? `${e.aeropuertoOrigen.codigo ?? ""} — ${e.aeropuertoOrigen.ciudad ?? ""}`
      : (Array.isArray(e.aeropuertosOrigen) && e.aeropuertosOrigen.length > 0 ?
        `${e.aeropuertosOrigen.length} origen(es)` : "N/D");

    const fechaRaw = e.zonedFechaIngreso ?? e.fechaIngreso ?? null;

    return {
      id_envio: e.id,
      origen,
      destino,
      fechaRaw,
      fecha: fechaRaw,
      numProductos: e.numProductos ?? 0,
      parteAsignadas,
      cantidadAsignada,
      restante,
      estado,
      raw: e,
    };
  });

  return (
    <main style={{ padding: 16 }}>
      <TablaEnvios initialRows={initialRows} />
    </main>
  );
}

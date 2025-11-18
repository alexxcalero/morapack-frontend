import React from "react";
import TablaAeropuertos from "../components/Tablas/TablaAeropuertos";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Aeropuertos | MoraPack",
};

export default async function Page() {
  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

  let data = [];
  try {
    const res = await fetch(`${API_BASE}/api/aeropuertos/obtenerTodos`);
    if (!res.ok) {
      console.error("Error al obtener aeropuertos:", res.status);
    } else {
      data = await res.json();
    }
  } catch (err) {
    console.error("Fallo fetch aeropuertos:", err);
  }

  const initialRows = (data || []).map((a) => ({
    id: a.id,
    pais: a.pais?.nombre ?? "",
    codigo: a.codigo,
    husoHorario: a.husoHorario,
    capacidadMaxima: a.capacidadMaxima,
    capacidadOcupada: a.capacidadOcupada,
    ciudad: a.ciudad,
    abreviatura: a.abreviatura,
    estado: a.estado,
    longitud: a.longitud,
    latitud: a.latitud,
  }));

  return (
    <main style={{ padding: 16 }}>
      <TablaAeropuertos initialRows={initialRows} />
    </main>
  );
}

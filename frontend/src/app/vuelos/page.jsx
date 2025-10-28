import React from "react";
import TablaVuelos from "../components/Tablas/TablaVuelos";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vuelos | MoraPack",
};

const URL_PLANES = "https://1inf54-981-5e.inf.pucp.edu.pe/api/planesDeVuelo/obtenerTodos";
const URL_AIRPORTS_INTERNAL = (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000") + "/api/aeropuertos";

function normalizeHora(raw) {
  if (!raw) return null;
  if (/\d{4}-\d{2}-\d{2}T.*[+-]\d{2}:\d{2}/.test(raw)) return raw;

  const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})Z([+-]?\d+)$/);
  if (!m) {
    return raw.replace(" ", "T");
  }

  const date = m[1];
  const time = m[2];
  const off = m[3];
  const num = parseInt(off, 10);
  const sign = num >= 0 ? "+" : "-";
  const hh = String(Math.abs(num)).padStart(2, "0");
  const isoOffset = `${sign}${hh}:00`;
  return `${date}T${time}${isoOffset}`;
}

export default async function Page() {
  let planes = [];
  let airports = [];

  try {
    const [rPlanes, rAirports] = await Promise.all([
      fetch(URL_PLANES, { cache: "no-store" }),
      fetch(URL_AIRPORTS_INTERNAL, { cache: "no-store" }),
    ]);

    if (rPlanes.ok) planes = await rPlanes.json();
    else console.error("Error al obtener planesDeVuelo:", rPlanes.status);

    if (rAirports.ok) airports = await rAirports.json();
    else console.error("Error al obtener aeropuertos (proxy):", rAirports.status);
  } catch (err) {
    console.error("Error fetch en page vuelos:", err);
  }

  const airportMap = (airports || []).reduce((acc, a) => {
    const id = a.id ?? a.idAeropuerto ?? null;
    if (id != null) {
      acc[id] = {
        ciudad: a.ciudad ?? a.nombre ?? a.city ?? "",
        codigo: a.codigo ?? "",
        raw: a,
      };
    }
    return acc;
  }, {});

  const initialRows = (planes || []).map((p) => {
    const idTramo = p.idTramo ?? p.id ?? null;
    const origenId = p.ciudadOrigen ?? p.ciudadOrigenId ?? null;
    const destinoId = p.ciudadDestino ?? p.ciudadDestinoId ?? null;

    const origenInfo = airportMap[origenId] ?? {};
    const destinoInfo = airportMap[destinoId] ?? {};

    const ciudadOrigenDisplay =
      origenInfo.ciudad && origenInfo.codigo ? 
      `${origenInfo.ciudad} — ${origenInfo.codigo}` : origenInfo.ciudad || origenInfo.codigo || `ID ${origenId ?? "N/D"}`;

    const ciudadDestinoDisplay =
      destinoInfo.ciudad && destinoInfo.codigo ? 
      `${destinoInfo.ciudad} — ${destinoInfo.codigo}` : destinoInfo.ciudad || destinoInfo.codigo || `ID ${destinoId ?? "N/D"}`;

    const horaSalidaISO = normalizeHora(p.horaOrigen ?? p.horaOrigenLocal ?? p.hora_salida ?? null);
    const horaLlegadaISO = normalizeHora(p.horaDestino ?? p.horaDestinoLocal ?? p.hora_llegada ?? null);

    return {
      idTramo,
      ciudadOrigenId: origenId,
      ciudadDestinoId: destinoId,
      ciudadOrigenDisplay,
      ciudadDestinoDisplay,
      hora_salida: horaSalidaISO,
      hora_llegada: horaLlegadaISO,
      capacidad: p.capacidadMaxima ?? p.capacidad ?? null,
      estado: p.estado ?? null,
      raw: p,
    };
  });

  return (
    <main style={{ padding: 16 }}>
      <TablaVuelos initialRows={initialRows} />
    </main>
  );
}

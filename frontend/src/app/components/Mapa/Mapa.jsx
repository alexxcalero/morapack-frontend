"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const iconUrls = {
  red: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  blue: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  green: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  violet: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png",
  orange: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
};

const BlueIcon = L.icon({ iconUrl: iconUrls.blue, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
const GreenIcon = L.icon({ iconUrl: iconUrls.green, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
const OrangeIcon = L.icon({ iconUrl: iconUrls.orange, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
const RedIcon = L.icon({ iconUrl: iconUrls.red, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
const UnknownIcon = L.icon({ iconUrl: iconUrls.violet, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });

function parseDMSString(s) {
  if (!s || typeof s !== "string") return NaN;
  const parts = s.trim().split(/[-\s:]+/).filter(Boolean);
  const deg = parseFloat(parts[0] ?? 0) || 0;
  const min = parseFloat(parts[1] ?? 0) || 0;
  const sec = parseFloat(parts[2] ?? 0) || 0;
  return Math.abs(deg) + min / 60 + sec / 3600;
}

function containsDirectionLetter(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/[NnSsEeWw]/);
  return m ? m[0].toUpperCase() : null;
}

const southCountries = new Set([
  "peru", "perú", "chile", "argentina", "uruguay", "paraguay",
  "bolivia", "brasil", "brazil", "ecuador",
]);

function normalizeCountryName(name) {
  if (!name) return "";
  return String(name).trim().toLowerCase();
}

function parseCoord(raw, { isLat = false, airport = null } = {}) {
  if (raw == null) return NaN;
  const str = String(raw).trim();

  const dir = containsDirectionLetter(str);
  if (dir) {
    const cleaned = str.replace(/[NnSsEeWw]/g, "").trim();
    const isDMS = /[0-9]+[-\s:]+[0-9]+/.test(cleaned);
    const value = isDMS ? parseDMSString(cleaned) : parseFloat(cleaned.replace(",", "."));
    if (Number.isNaN(value)) return NaN;
    if (dir === "S" || dir === "W") return -Math.abs(value);
    return Math.abs(value);
  }

  const maybeNumeric = parseFloat(str.replace(",", "."));
  const looksLikePlainNumber = /^[+-]?\d+(\.\d+)?$/.test(str.replace(",", "."));
  if (!Number.isNaN(maybeNumeric) && looksLikePlainNumber) {
    const hasSign = /^[+-]/.test(str.trim());
    if (hasSign) return maybeNumeric;

    const countryName = normalizeCountryName(airport?.pais?.nombre ?? airport?.country ?? "");
    const continentId = airport?.pais?.continente?.id ?? airport?.continentId ?? null;

    if (!isLat) {
      if (continentId === 1 || String(countryName).includes("america")) {
        return -Math.abs(maybeNumeric);
      }
      return maybeNumeric;
    }

    if (isLat) {
      if (southCountries.has(countryName)) {
        return -Math.abs(maybeNumeric);
      }
      return maybeNumeric;
    }
  }

  if (/[0-9]+-[0-9]+(-[0-9]+)?/.test(str) || /[0-9]+\s+[0-9]+/.test(str)) {
    const dec = parseDMSString(str);
    if (Number.isNaN(dec)) return NaN;
    const countryName = normalizeCountryName(airport?.pais?.nombre ?? airport?.country ?? "");
    const continentId = airport?.pais?.continente?.id ?? airport?.continentId ?? null;

    if (!isLat) {
      if (continentId === 1 || String(countryName).includes("america")) {
        return -Math.abs(dec);
      }
      return dec;
    } else {
      if (southCountries.has(countryName)) {
        return -Math.abs(dec);
      }
      return dec;
    }
  }

  const cleaned = str.replace(/[^\d\-\+.,]/g, "").replace(",", ".");
  const pf = parseFloat(cleaned);
  return Number.isNaN(pf) ? NaN : pf;
}

export default function Mapa() {
  const mapRef = useRef(null);
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const mapHeight = "90vh";

  useEffect(() => {
    async function loadAirports() {
      setLoading(true);
      try {
        const res = await fetch("/api/aeropuertos");
        if (!res.ok) throw new Error("Error al obtener aeropuertos: " + res.status);
        const data = await res.json();

        const normalized = data
          .map((a) => {
            const latRaw = a.latitud ?? a.lat ?? a.latitude ?? null;
            const lonRaw = a.longitud ?? a.lon ?? a.longitude ?? null;

            const lat = parseCoord(latRaw, { isLat: true, airport: a });
            const lon = parseCoord(lonRaw, { isLat: false, airport: a });

            const capacidadMaxima = a.capacidadMaxima ?? a.capacidad ?? null;
            const capacidadOcupada = a.capacidadOcupada ?? a.capacidadOcupada ?? a.capacidadOcupada ?? 0;

            const porcentaje = (typeof capacidadMaxima === "number" && capacidadMaxima > 0)
              ? Math.round(( (capacidadOcupada ?? 0) / capacidadMaxima) * 100)
              : null;

            return {
              id: a.id ?? null,
              codigo: a.codigo ?? a.abreviatura ?? "",
              ciudad: a.ciudad ?? a.nombre ?? "",
              pais: (a.pais && a.pais.nombre) || "",
              continenteId: (a.pais && a.pais.continente && a.pais.continente.id) || null,
              lat,
              lon,
              capacidadMaxima,
              capacidadOcupada,
              porcentaje,
              raw: a,
            };
          })
          .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));

        setAirports(normalized);

        setTimeout(() => {
          if (mapRef.current && normalized.length > 0) {
            const bounds = normalized.map((p) => [p.lat, p.lon]);
            try {
              mapRef.current.fitBounds(bounds, { padding: [50, 50] });
            } catch (e) {}
          }
        }, 120);
      } catch (err) {
        console.error("Fallo al cargar aeropuertos en Mapa:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAirports();
  }, []);

  function pickIcon(a) {
    const city = String(a.ciudad ?? "").toLowerCase();
    const code = String(a.codigo ?? "").toLowerCase();

    if (city.includes("lima") || code === "spim" || code === "spjc") return BlueIcon;
    if (city.includes("brus") || city.includes("brussels") || code.startsWith("eb")) return BlueIcon;
    if (city.includes("baku") || code === "gyd" || code === "ubbb") return BlueIcon;

    const pct = a.porcentaje;
    if (pct == null) return UnknownIcon;
    if (pct <= 60) return GreenIcon;
    if (pct <= 85) return OrangeIcon;
    return RedIcon;
  }

  return (
    <div style={{ width: "100%", height: mapHeight, overflow: "hidden" }}>
      <MapContainer
        center={airports.length ? [airports[0].lat, airports[0].lon] : [-12.0464, -77.0428]}
        zoom={airports.length ? 3 : 3}
        style={{ width: "100%", height: "100%" }}
        whenCreated={(mapInstance) => {
          mapRef.current = mapInstance;
          setTimeout(() => mapInstance.invalidateSize(), 50);
        }}
      >
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {airports.map((a) => (
          <Marker key={String(a.id) + a.codigo} position={[a.lat, a.lon]} icon={pickIcon(a)}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <strong style={{ display: "block", marginBottom: 6 }}>
                  {a.ciudad} {a.codigo ? `— ${a.codigo}` : ""}
                </strong>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{a.pais}</div>

                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <strong>Capacidad almacén:</strong>{" "}
                  {a.capacidadMaxima != null ? a.capacidadMaxima : "N/D"}
                </div>

                <div style={{ marginTop: 4, fontSize: 13 }}>
                  <strong>Ocupado:</strong>{" "}
                  {a.capacidadOcupada != null ? a.capacidadOcupada : "N/D"}
                </div>

                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <strong>% ocupación:</strong>{" "}
                  {a.porcentaje != null ? `${a.porcentaje}%` : "N/D"}
                </div>

                <div style={{ marginTop: 6, fontSize: 12 }}>
                  Lat: {a.lat.toFixed(5)}, Lon: {a.lon.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

      </MapContainer>
    </div>
  );
}
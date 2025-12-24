import MapaClient from "../components/Mapa/MapaClient";

export const metadata = {
  title: "Simulación Colapso | MoraPack",
};

export default function SimulacionColapso() {
  return (
    <main>
      <MapaClient tipoSimulacion="colapso" />
    </main>
  );
}

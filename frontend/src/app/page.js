import MapaClient from "./components/Mapa/MapaClient";

export const metadata = {
  title: "Simulación Diaria | MoraPack",
};

export default function Home() {
  return (
    <main>
      <MapaClient />
    </main>
  );
}

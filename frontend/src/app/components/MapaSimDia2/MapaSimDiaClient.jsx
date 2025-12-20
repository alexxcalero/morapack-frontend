// frontend/src/app/components/MapaSimDia/MapaSimDiaClient.jsx
"use client";
import dynamic from "next/dynamic";

const MapaSimDia = dynamic(() => import("./MapaSimDia"), { ssr: false });
export default MapaSimDia;

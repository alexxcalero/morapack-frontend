"use client";

import dynamic from "next/dynamic";

const Mapa = dynamic(() => import("./Mapa"), {
  ssr: false,
});

export default function MapaClient(props) {
  return <Mapa {...props} />;
}

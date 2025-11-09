"use client";

import dynamic from "next/dynamic";

const Mapa = dynamic(() => import("./MapaSimDiaria"), {
  ssr: false,
});

export default Mapa;

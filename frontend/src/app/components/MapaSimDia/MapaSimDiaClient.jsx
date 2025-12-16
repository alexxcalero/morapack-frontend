"use client";

import dynamic from "next/dynamic";

const Mapa = dynamic(() => import("./MapaSimDia"), {
  ssr: false,
});

export default Mapa;

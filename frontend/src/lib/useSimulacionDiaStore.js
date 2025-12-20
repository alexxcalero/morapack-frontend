/* // src/app/lib/useSimulacionDiaStore.js
"use client";

import { useEffect, useState, useRef } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

export function useSimulacionDiaStore() {
  const [simState, setSimState] = useState({
    ciclo: 0,
    simMs: 0,
    aeropuertos: [],
    vuelos: [],
    envios: [],
  });

  const clientRef = useRef(null);

  useEffect(() => {
    // Primero verificar variable específica de WebSocket, luego variable general, luego fallback
    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_WS_SOCKJS_URL
      || process.env.NEXT_PUBLIC_BACKEND_URL
      || "https://1inf54-981-5e.inf.pucp.edu.pe";

    // Formar la cadena completa del endpoint
    const wsUrl = baseUrl.includes('/ws-planificacion-sockjs')
      ? baseUrl
      : `${baseUrl}/ws-planificacion-sockjs`;

    const socket = new SockJS(wsUrl);
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      debug: () => {},
    });

    client.onConnect = () => {
      client.subscribe("/topic/simulacion-dia", (message) => {
        try {
          const body = JSON.parse(message.body);

          if (body.tipo === "sim_dia_snapshot") {
            setSimState((prev) => {
              // opcional: ignorar snapshots atrasados
              if (body.ciclo < prev.ciclo) return prev;
              return {
                ciclo: body.ciclo,
                simMs: body.simMs,
                aeropuertos: body.aeropuertos || [],
                vuelos: body.vuelos || [],
                envios: body.envios || [],
              };
            });
          }
        } catch (e) {
          console.error("Error parseando snapshot simulacion-dia:", e);
        }
      });
    };

    client.activate();
    clientRef.current = client;

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, []);

  return simState;
}
 */

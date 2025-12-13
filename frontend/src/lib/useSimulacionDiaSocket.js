// src/lib/useSimulacionDiaSocket.js
"use client";

import { useEffect } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

export function useSimulacionDiaSocket(onPayload) {
  useEffect(() => {
    const wsUrl =
      process.env.NEXT_PUBLIC_BACKEND_WS_URL ||
      "https://1inf54-981-5e.inf.pucp.edu.pe/ws-planificacion";

    const socket = new SockJS(wsUrl);

    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      debug: () => {}, // o console.log si quieres
    });

    client.onConnect = () => {
      client.subscribe("/topic/simulacion-dia", (message) => {
        try {
          const body = JSON.parse(message.body);
          // Puede ser array de vuelos o objeto {vuelos, aeropuertos, ...}
          if (onPayload) {
            onPayload(body);
          }
        } catch (e) {
          console.error("Error parseando mensaje simulacion-dia:", e);
        }
      });
    };

    client.activate();

    return () => {
      client.deactivate();
    };
  }, [onPayload]);
}

// src/lib/useSimulacionDiaSocket.js
"use client";

import { useEffect } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

export function useSimulacionDiaSocket(onPayload) {
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
      debug: () => { }, // o console.log si quieres
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

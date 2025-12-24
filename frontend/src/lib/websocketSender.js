// src/lib/websocketSender.js
"use client";

import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

let clientInstance = null;
let isConnecting = false;
let connectionPromise = null;

/**
 * Obtiene o crea una instancia del cliente STOMP para enviar mensajes
 * @returns {Promise<Client>} Cliente STOMP conectado
 */
async function getStompClient() {
  if (clientInstance?.connected) {
    return clientInstance;
  }

  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  isConnecting = true;
  connectionPromise = new Promise((resolve, reject) => {
    let brokerURL;
    try {
      const apiUrl = new URL(API_BASE);
      const wsScheme = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      brokerURL = `${wsScheme}//${apiUrl.host}/ws-planificacion`;
    } catch (_) {
      brokerURL = API_BASE.startsWith('https')
        ? API_BASE.replace(/^https?:\/\//, 'wss://') + '/ws-planificacion'
        : API_BASE.replace(/^http?:\/\//, 'ws://') + '/ws-planificacion';
    }

    const client = new Client({
      brokerURL,
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {}, // Sin logs
      onConnect: () => {
        console.log('✅ [WS Sender] Cliente conectado para envío de mensajes');
        clientInstance = client;
        isConnecting = false;
        resolve(client);
      },
      onStompError: (frame) => {
        console.warn('⚠️ [WS Sender] Error STOMP, intentando SockJS...');
        // Fallback a SockJS
        try {
          client.deactivate();
        } catch (_) {}

        const sockJsUrl = `${API_BASE}/ws-planificacion-sockjs`;
        const sockClient = new Client({
          webSocketFactory: () => new SockJS(sockJsUrl),
          reconnectDelay: 5000,
          heartbeatIncoming: 10000,
          heartbeatOutgoing: 10000,
          debug: () => {},
          onConnect: () => {
            console.log('✅ [WS Sender] Cliente SockJS conectado');
            clientInstance = sockClient;
            isConnecting = false;
            resolve(sockClient);
          },
          onStompError: (errFrame) => {
            console.error('❌ [WS Sender] Error en SockJS:', errFrame);
            isConnecting = false;
            connectionPromise = null;
            reject(new Error('No se pudo conectar al WebSocket'));
          },
          onWebSocketError: (ev) => {
            console.error('❌ [WS Sender] Error WebSocket SockJS:', ev);
            isConnecting = false;
            connectionPromise = null;
            reject(new Error('No se pudo conectar al WebSocket'));
          }
        });
        sockClient.activate();
      },
      onWebSocketError: (ev) => {
        console.warn('⚠️ [WS Sender] WebSocket nativo falló, intentando SockJS...');
        try {
          client.deactivate();
        } catch (_) {}

        const sockJsUrl = `${API_BASE}/ws-planificacion-sockjs`;
        const sockClient = new Client({
          webSocketFactory: () => new SockJS(sockJsUrl),
          reconnectDelay: 5000,
          heartbeatIncoming: 10000,
          heartbeatOutgoing: 10000,
          debug: () => {},
          onConnect: () => {
            console.log('✅ [WS Sender] Cliente SockJS conectado');
            clientInstance = sockClient;
            isConnecting = false;
            resolve(sockClient);
          },
          onStompError: (errFrame) => {
            console.error('❌ [WS Sender] Error en SockJS:', errFrame);
            isConnecting = false;
            connectionPromise = null;
            reject(new Error('No se pudo conectar al WebSocket'));
          },
          onWebSocketError: (errEv) => {
            console.error('❌ [WS Sender] Error WebSocket SockJS:', errEv);
            isConnecting = false;
            connectionPromise = null;
            reject(new Error('No se pudo conectar al WebSocket'));
          }
        });
        sockClient.activate();
      }
    });

    client.activate();
  });

  return connectionPromise;
}

/**
 * Envía un mensaje al backend a través de WebSocket
 * @param {string} destination - Destino STOMP (ej: '/app/aeropuerto/capacidad')
 * @param {Object} payload - Objeto a enviar (se serializa a JSON)
 * @returns {Promise<boolean>} true si se envió correctamente, false en caso contrario
 */
export async function sendWebSocketMessage(destination, payload) {
  try {
    const client = await getStompClient();

    if (!client?.connected) {
      console.warn('⚠️ [WS Sender] Cliente no conectado, reintentando...');
      clientInstance = null;
      connectionPromise = null;
      const newClient = await getStompClient();
      if (!newClient?.connected) {
        console.error('❌ [WS Sender] No se pudo conectar después del reintento');
        return false;
      }
    }

    client.publish({
      destination,
      body: JSON.stringify(payload)
    });

    console.log(`📤 [WS Sender] Mensaje enviado a ${destination}:`, payload);
    return true;
  } catch (error) {
    console.error('❌ [WS Sender] Error al enviar mensaje:', error);
    return false;
  }
}

/**
 * Notifica al backend que un vuelo despegó de un aeropuerto
 * @param {number} aeropuertoId - ID del aeropuerto de origen
 * @param {number} vueloId - ID del vuelo
 * @param {number} capacidadOcupada - Capacidad ocupada que se está retirando
 * @returns {Promise<boolean>}
 */
export async function notificarDespegue(aeropuertoId, vueloId, capacidadOcupada) {
  return sendWebSocketMessage('/app/aeropuerto/despegue', {
    tipo: 'despegue',
    aeropuertoId,
    vueloId,
    capacidadOcupada,
    timestamp: new Date().toISOString()
  });
}

/**
 * Notifica al backend que un vuelo aterrizó en un aeropuerto
 * @param {number} aeropuertoId - ID del aeropuerto de destino
 * @param {number} vueloId - ID del vuelo
 * @param {number} capacidadOcupada - Capacidad ocupada que se está agregando
 * @returns {Promise<boolean>}
 */
export async function notificarAterrizaje(aeropuertoId, vueloId, capacidadOcupada) {
  return sendWebSocketMessage('/app/aeropuerto/aterrizaje', {
    tipo: 'aterrizaje',
    aeropuertoId,
    vueloId,
    capacidadOcupada,
    timestamp: new Date().toISOString()
  });
}

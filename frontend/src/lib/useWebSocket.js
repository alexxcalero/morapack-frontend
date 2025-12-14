// src/lib/useWebSocket.js
"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

/**
 * Hook para conectar al WebSocket del backend con fallback automático a SockJS
 * @param {Object} options
 * @param {string} options.topic - Topic STOMP (ej: '/topic/planificacion')
 * @param {Function} options.onMessage - Callback con el mensaje recibido
 * @param {boolean} options.enabled - Activar conexión
 */
export default function useWebSocket({ topic, onMessage, enabled = true }) {
    const clientRef = useRef(null);
    const subscriptionRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState(null);
    const [usingSockJS, setUsingSockJS] = useState(false);
    const reconnectTimeoutRef = useRef(null);
    const failedNativeRef = useRef(false);

    const connect = useCallback(() => {
        if (!enabled) return;
        if (clientRef.current?.connected) return;

        // Si ya falló nativo, ir directo a SockJS
        if (failedNativeRef.current) {
            console.log('[WS] Usando SockJS directamente (nativo falló previamente)');
            connectWithSockJS();
            return;
        }

        // Intentar primero WebSocket nativo
        let brokerURL;
        try {
            const apiUrl = new URL(API_BASE);
            const wsScheme = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            brokerURL = `${wsScheme}//${apiUrl.host}/ws-planificacion-sockjs`;
        } catch (_) {
            brokerURL = API_BASE.startsWith('https')
                ? API_BASE.replace(/^https?:\/\//, 'wss://') + '/ws-planificacion-sockjs'
                : API_BASE.replace(/^http?:\/\//, 'ws://') + '/ws-planificacion-sockjs';
        }

        console.log('[WS] Intentando conexión nativa →', brokerURL);
        const client = new Client({
            brokerURL,
            reconnectDelay: 5000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            debug: (str) => {
                // Comentado para ruido mínimo
                // console.log('[STOMP]', str);
            },
            onConnect: () => {
                console.log('🟢 [WS] Conectado con WebSocket nativo');
                setConnected(true);
                setError(null);
                setUsingSockJS(false);
                if (topic) {
                    subscriptionRef.current = client.subscribe(topic, (message) => {
                        try {
                            const data = JSON.parse(message.body);
                            if (onMessage) onMessage(data);
                        } catch (e) {
                            console.error('WS parse error:', e);
                        }
                    });
                }
            },
            onDisconnect: () => setConnected(false),
            onStompError: (frame) => {
                setError(frame.headers['message'] || 'STOMP error');
                setConnected(false);
            },
            onWebSocketError: (ev) => {
                console.warn('⚠️ [WS] WebSocket nativo falló, intentando SockJS fallback...');
                failedNativeRef.current = true;
                setError('WebSocket error - intentando SockJS');
                setConnected(false);
                // Desactivar cliente nativo y probar SockJS
                if (clientRef.current) {
                    try { clientRef.current.deactivate(); } catch (_) { }
                    clientRef.current = null;
                }
                setTimeout(() => connectWithSockJS(), 500);
            }
        });

        clientRef.current = client;
        client.activate();
    }, [enabled, topic, onMessage]);

    const connectWithSockJS = useCallback(() => {
        if (!enabled) return;
        if (clientRef.current?.connected) return;

        const sockJsUrl = `${API_BASE}/ws-planificacion-sockjs`;
        console.log('[WS] Conectando con SockJS →', sockJsUrl);

        const client = new Client({
            webSocketFactory: () => new SockJS(sockJsUrl),
            reconnectDelay: 5000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            debug: (str) => {
                // Comentado para ruido mínimo
                // console.log('[STOMP-SockJS]', str);
            },
            onConnect: () => {
                console.log('🟢 [WS] Conectado con SockJS fallback');
                setConnected(true);
                setError(null);
                setUsingSockJS(true);
                if (topic) {
                    subscriptionRef.current = client.subscribe(topic, (message) => {
                        try {
                            const data = JSON.parse(message.body);
                            if (onMessage) onMessage(data);
                        } catch (e) {
                            console.error('WS parse error:', e);
                        }
                    });
                }
            },
            onDisconnect: () => setConnected(false),
            onStompError: (frame) => {
                setError(frame.headers['message'] || 'STOMP error');
                setConnected(false);
            },
            onWebSocketError: (ev) => {
                console.error('❌ [WS] SockJS también falló', ev?.message || ev);
                console.error('🔧 Verifica que el backend esté reiniciado con el endpoint /ws-planificacion-sockjs');
                setError('WebSocket y SockJS fallaron - backend no actualizado?');
                setConnected(false);
            }
        });

        clientRef.current = client;
        client.activate();
    }, [enabled, topic, onMessage]);

    const disconnect = useCallback(() => {
        if (subscriptionRef.current) {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
        }
        if (clientRef.current) {
            clientRef.current.deactivate();
            clientRef.current = null;
        }
        setConnected(false);
    }, []);

    const reconnect = useCallback(() => {
        disconnect();
        reconnectTimeoutRef.current = setTimeout(connect, 1000);
    }, [connect, disconnect]);

    useEffect(() => {
        if (enabled) connect(); else disconnect();
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            disconnect();
        };
    }, [enabled, connect, disconnect]);

    return { connected, error, reconnect, usingSockJS };
}

// src/lib/useWebSocket.js
"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://1inf54-981-5e.inf.pucp.edu.pe";

/**
 * Hook para conectar al WebSocket del backend
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
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        if (!enabled) return;
        if (clientRef.current?.connected) return;

        const client = new Client({
            brokerURL: `${API_BASE.replace(/^http/, 'ws')}/ws-planificacion`,
            reconnectDelay: 5000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            onConnect: () => {
                setConnected(true);
                setError(null);
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
            onWebSocketError: () => {
                setError('WebSocket error');
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

    return { connected, error, reconnect };
}

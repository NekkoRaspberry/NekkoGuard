import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config } from '@/config/env';
import { RealtimeContext, type RealtimeContextValue, type RealtimeState } from './RealtimeContext';

/**
 * Keeps one WebSocket open to the backend's ASGI WebSocket endpoint.
 * The backend protocol is: client sends "ping", server answers "pong!".
 * That is used here as a live connectivity heartbeat — nothing else is exchanged.
 */
const PING = 'ping';
const PONG = 'pong!';
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

const INITIAL_STATE: RealtimeState = { status: 'connecting', latencyMs: null, lastPongAt: null };

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RealtimeState>(INITIAL_STATE);
  const [generation, setGeneration] = useState(0);
  const attemptRef = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let pingTimer: number | undefined;
    let pongTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let pingSentAt = 0;
    let disposed = false;

    const clearTimers = () => {
      window.clearInterval(pingTimer);
      window.clearTimeout(pongTimer);
      window.clearTimeout(reconnectTimer);
    };

    const sendPing = () => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      pingSentAt = performance.now();
      socket.send(PING);
      window.clearTimeout(pongTimer);
      // No answer in time → treat the connection as dead and let onclose reconnect.
      pongTimer = window.setTimeout(() => socket?.close(), PONG_TIMEOUT_MS);
    };

    const scheduleReconnect = () => {
      const delay = Math.min(RECONNECT_MIN_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };

    function connect() {
      if (disposed) return;
      setState((prev) => ({ ...prev, status: 'connecting' }));

      try {
        socket = new WebSocket(config.wsUrl);
      } catch {
        setState((prev) => ({ ...prev, status: 'disconnected' }));
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        attemptRef.current = 0;
        setState((prev) => ({ ...prev, status: 'connected' }));
        sendPing();
        pingTimer = window.setInterval(sendPing, PING_INTERVAL_MS);
      };

      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data !== PONG) return;
        window.clearTimeout(pongTimer);
        const now = Date.now();
        setState({ status: 'connected', latencyMs: performance.now() - pingSentAt, lastPongAt: now });
      };

      socket.onclose = () => {
        clearTimers();
        socket = null;
        if (disposed) return;
        setState((prev) => ({ ...prev, status: 'disconnected', latencyMs: null }));
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimers();
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [generation]);

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    setGeneration((value) => value + 1);
  }, []);

  const value = useMemo<RealtimeContextValue>(() => ({ ...state, reconnect }), [state, reconnect]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

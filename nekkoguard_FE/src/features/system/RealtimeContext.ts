import { createContext } from 'react';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface RealtimeState {
  status: RealtimeStatus;
  /** Round-trip time of the last ping → pong exchange. */
  latencyMs: number | null;
  /** When the last pong was received (epoch ms). */
  lastPongAt: number | null;
}

export interface RealtimeContextValue extends RealtimeState {
  /** Close and reopen the socket immediately. */
  reconnect: () => void;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

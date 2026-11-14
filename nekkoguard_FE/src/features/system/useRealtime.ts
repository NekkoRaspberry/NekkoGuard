import { useContext } from 'react';
import { RealtimeContext, type RealtimeContextValue } from './RealtimeContext';

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used inside <RealtimeProvider>.');
  }
  return context;
}

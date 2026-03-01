import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getLastSyncTimestamp } from '../services/settings';
import { setGlobalSyncTimestamp } from '../services/item';

interface SyncContextType {
  lastSyncTimestamp: number;
  refreshTimestamp: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number>(0);

  const refreshTimestamp = async () => {
    try {
      const timestamp = await getLastSyncTimestamp();
      setLastSyncTimestamp(timestamp);
      setGlobalSyncTimestamp(timestamp);
    } catch (error) {
      console.error('Failed to refresh sync timestamp:', error);
    }
  };

  // Load timestamp on mount
  useEffect(() => {
    refreshTimestamp();
  }, []);

  return (
    <SyncContext.Provider value={{ lastSyncTimestamp, refreshTimestamp }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

import api from './api';

/**
 * Settings Service
 * Provides access to global application settings
 */

export interface LastSyncTimestampResponse {
  success: boolean;
  data: {
    timestamp: number;
  };
}

/**
 * Get the last Excel sync timestamp
 * Used for image cache busting across all clients
 */
export async function getLastSyncTimestamp(): Promise<number> {
  try {
    const response = await api.get<LastSyncTimestampResponse>('/settings/last-sync-timestamp');
    if (response.data.success) {
      return response.data.data.timestamp;
    }
    return 0;
  } catch (error) {
    console.error('Failed to fetch last sync timestamp:', error);
    return 0;
  }
}

import { getDb } from '../config/database.ts';

/**
 * Settings Repository
 * Manages global application settings stored in the database
 * Settings are shared across all users and sessions
 */

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export class SettingsRepository {
  /**
   * Get a setting value by key
   */
  async getSetting(key: string): Promise<string | null> {
    const db = getDb();
    const result = db.query<[string]>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key]
    );
    return result.length > 0 ? result[0][0] : null;
  }

  /**
   * Set a setting value
   */
  async setSetting(key: string, value: string): Promise<void> {
    const db = getDb();
    db.query(
      `INSERT INTO app_settings (key, value, updated_at) 
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET 
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  }

  /**
   * Get the last Excel sync timestamp
   * Used for image cache busting
   */
  async getLastSyncTimestamp(): Promise<number> {
    const value = await this.getSetting('last_sync_timestamp');
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * Set the last Excel sync timestamp
   * Called after successful Excel sync
   */
  async setLastSyncTimestamp(timestamp: number): Promise<void> {
    await this.setSetting('last_sync_timestamp', timestamp.toString());
  }
}

export const settingsRepository = new SettingsRepository();

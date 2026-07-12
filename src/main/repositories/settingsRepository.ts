import type { PublicDisplaySettings } from '@shared/types';
import type { AppDatabase } from '../services/db';
import { json, normalizePublicDisplaySettings, now, parseJson, type Row } from './repositoryUtils';

export class SettingsRepository {
  constructor(private readonly database: AppDatabase) {}

  getPublicDisplaySettings(): PublicDisplaySettings {
    const row = this.database.sqlite.prepare('SELECT value FROM app_settings WHERE key = ?').get('public_display') as Row | undefined;
    return normalizePublicDisplaySettings(parseJson<Partial<PublicDisplaySettings>>(row?.value, {}));
  }

  savePublicDisplaySettings(input: PublicDisplaySettings): PublicDisplaySettings {
    const settings = normalizePublicDisplaySettings(input);
    this.database.sqlite
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run('public_display', json(settings), now());
    return settings;
  }
}

import type { Campaign, CreateCampaignInput } from '@shared/types';
import type { AppDatabase } from '../services/db';
import { id, now, rowToCampaign, type Row } from './repositoryUtils';

/** Выполняет только CRUD кампаний; каскадное удаление зависимых данных обеспечивает SQLite. */
export class CampaignRepository {
  constructor(private readonly database: AppDatabase) {}

  list(): Campaign[] {
    return this.database.sqlite
      .prepare('SELECT * FROM campaigns ORDER BY updated_at DESC, name ASC')
      .all()
      .map((row) => rowToCampaign(row as Row));
  }

  create(input: CreateCampaignInput): Campaign {
    const timestamp = now();
    const campaign: Campaign = {
      id: id(),
      name: input.name.trim() || 'Новая кампания',
      notes: input.notes?.trim() ?? '',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.database.sqlite
      .prepare('INSERT INTO campaigns (id, name, notes, created_at, updated_at) VALUES (@id, @name, @notes, @createdAt, @updatedAt)')
      .run(campaign);
    return campaign;
  }

  delete(idToDelete: string): void {
    this.database.sqlite.prepare('DELETE FROM campaigns WHERE id = ?').run(idToDelete);
  }
}

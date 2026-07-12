import type { PlayerCharacter, SavePlayerInput } from '@shared/types';
import type { AppDatabase } from '../services/db';
import { clamp, id, now, rowToPlayer, touchCampaign, type Row } from './repositoryUtils';

/** Сохраняет минимальную локальную модель персонажа, общую для ручного ввода и LSS-импорта. */
export class PlayerRepository {
  constructor(private readonly database: AppDatabase) {}

  list(campaignId: string): PlayerCharacter[] {
    return this.database.sqlite
      .prepare('SELECT * FROM player_characters WHERE campaign_id = ? ORDER BY active DESC, name ASC')
      .all(campaignId)
      .map((row) => rowToPlayer(row as Row));
  }

  save(input: SavePlayerInput): PlayerCharacter {
    const timestamp = now();
    const existing = input.id ? (this.database.sqlite.prepare('SELECT * FROM player_characters WHERE id = ?').get(input.id) as Row | undefined) : undefined;
    const player: PlayerCharacter = {
      id: input.id || id(),
      campaignId: input.campaignId,
      name: input.name.trim() || 'Безымянный герой',
      level: clamp(input.level, 1, 20),
      armorClass: clamp(input.armorClass, 1, 40),
      maxHp: clamp(input.maxHp, 1, 999),
      initiativeMod: clamp(input.initiativeMod, -20, 30),
      passivePerception: clamp(input.passivePerception, 1, 40),
      active: input.active,
      imageUrl: input.imageUrl?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      createdAt: existing ? String(existing.created_at) : timestamp,
      updatedAt: timestamp
    };

    this.database.sqlite
      .prepare(
        `
        INSERT INTO player_characters (id, campaign_id, name, level, armor_class, max_hp, initiative_mod, passive_perception, active, image_url, notes, created_at, updated_at)
        VALUES (@id, @campaignId, @name, @level, @armorClass, @maxHp, @initiativeMod, @passivePerception, @active, @imageUrl, @notes, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, level = excluded.level, armor_class = excluded.armor_class, max_hp = excluded.max_hp,
          initiative_mod = excluded.initiative_mod, passive_perception = excluded.passive_perception, active = excluded.active,
          image_url = excluded.image_url, notes = excluded.notes, updated_at = excluded.updated_at
      `
      )
      .run({ ...player, active: player.active ? 1 : 0 });
    touchCampaign(this.database, player.campaignId);
    return player;
  }

  delete(idToDelete: string): void {
    const row = this.database.sqlite.prepare('SELECT campaign_id FROM player_characters WHERE id = ?').get(idToDelete) as Row | undefined;
    this.database.sqlite.prepare('DELETE FROM player_characters WHERE id = ?').run(idToDelete);
    if (row) touchCampaign(this.database, String(row.campaign_id));
  }
}

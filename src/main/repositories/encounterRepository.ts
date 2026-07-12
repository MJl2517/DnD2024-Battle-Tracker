import type {
  Encounter,
  EncounterCreatureGroup,
  EncounterLair,
  EncounterPlayerSetting,
  SaveEncounterGroupInput,
  SaveEncounterInput,
  SaveEncounterLairInput,
  SaveEncounterPlayerSettingInput
} from '@shared/types';
import { clampEncounterQuantity, normalizeGroupInput, normalizeHitPointMode } from '@shared/combat';
import type { AppDatabase } from '../services/db';
import type { CreatureRepository } from './creatureRepository';
import {
  clamp,
  id,
  now,
  rowToEncounter,
  rowToEncounterGroup,
  rowToEncounterLair,
  rowToEncounterPlayerSetting,
  toEncounterGroupParams,
  toEncounterLairParams,
  toEncounterPlayerSettingParams,
  touchCampaign,
  type Row
} from './repositoryUtils';

/**
 * Управляет заготовкой энкаунтера: группами NPC, участвующими игроками и единственным логовом.
 * Методы сохранения нормализуют числа до записи, чтобы better-sqlite3 не получил undefined или boolean.
 */
export class EncounterRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly creatures: CreatureRepository
  ) {}
  saveEncounter(input: SaveEncounterInput): Encounter {
    const timestamp = now();
    const existing = input.id ? (this.database.sqlite.prepare('SELECT * FROM encounters WHERE id = ?').get(input.id) as Row | undefined) : undefined;
    const encounter = {
      id: input.id || id(),
      campaignId: input.campaignId,
      name: input.name.trim() || 'Новый энкаунтер',
      notes: input.notes?.trim() ?? '',
      createdAt: existing ? String(existing.created_at) : timestamp,
      updatedAt: timestamp
    };

    this.database.sqlite
      .prepare(
        `
        INSERT INTO encounters (id, campaign_id, name, notes, created_at, updated_at)
        VALUES (@id, @campaignId, @name, @notes, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `
      )
      .run(encounter);
    touchCampaign(this.database, encounter.campaignId);
    return {
      ...encounter,
      groups: this.listGroups(encounter.id),
      playerSettings: this.listPlayerSettings(encounter.id),
      lair: this.getLair(encounter.id)
    };
  }

  deleteEncounter(idToDelete: string): void {
    const row = this.database.sqlite.prepare('SELECT campaign_id FROM encounters WHERE id = ?').get(idToDelete) as Row | undefined;
    this.database.sqlite.prepare('DELETE FROM encounters WHERE id = ?').run(idToDelete);
    if (row) touchCampaign(this.database, String(row.campaign_id));
  }

  saveEncounterGroup(input: SaveEncounterGroupInput): EncounterCreatureGroup {
    const normalized = normalizeGroupInput({
      ...input,
      quantity: input.quantity,
      initiativeMode: input.initiativeMode
    });
    const template = this.creatures.get(input.templateId);
    const encounter = this.getRow(input.encounterId);
    const timestamp = now();
    const existing = input.id
      ? (this.database.sqlite.prepare('SELECT * FROM encounter_creature_groups WHERE id = ?').get(input.id) as Row | undefined)
      : undefined;
    const group: EncounterCreatureGroup = {
      id: input.id || id(),
      encounterId: input.encounterId,
      templateId: input.templateId,
      displayName: input.displayName?.trim() || template.name,
      quantity: clampEncounterQuantity(normalized.quantity),
      initiativeMode: normalized.initiativeMode,
      initiativeAdvantage: Boolean(input.initiativeAdvantage),
      initiativeOverride: input.initiativeOverride == null ? null : clamp(input.initiativeOverride, -99, 99),
      hpMode: normalizeHitPointMode(input.hpMode, input.hpOverride),
      hpOverride: input.hpOverride == null ? null : clamp(input.hpOverride, 1, 9999),
      isAlly: Boolean(input.isAlly),
      createdAt: existing ? String(existing.created_at) : timestamp,
      updatedAt: timestamp
    };

    this.database.sqlite
      .prepare(
        `
        INSERT INTO encounter_creature_groups (
          id, encounter_id, template_id, display_name, quantity, initiative_mode,
          initiative_advantage, initiative_override, hp_mode, hp_override, is_ally, created_at, updated_at
        ) VALUES (
          @id, @encounterId, @templateId, @displayName, @quantity, @initiativeMode,
          @initiativeAdvantage, @initiativeOverride, @hpMode, @hpOverride, @isAlly, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          template_id = excluded.template_id,
          display_name = excluded.display_name,
          quantity = excluded.quantity,
          initiative_mode = excluded.initiative_mode,
          initiative_advantage = excluded.initiative_advantage,
          initiative_override = excluded.initiative_override,
          hp_mode = excluded.hp_mode,
          hp_override = excluded.hp_override,
          is_ally = excluded.is_ally,
          updated_at = excluded.updated_at
      `
      )
      .run(toEncounterGroupParams(group));
    touchCampaign(this.database, String(encounter.campaign_id));
    return group;
  }

  saveEncounterPlayerSetting(input: SaveEncounterPlayerSettingInput): EncounterPlayerSetting {
    const encounter = this.getRow(input.encounterId);
    const player = this.database.sqlite.prepare('SELECT * FROM player_characters WHERE id = ?').get(input.playerId) as Row | undefined;
    if (!player) throw new Error('Игрок не найден.');
    if (String(player.campaign_id) !== String(encounter.campaign_id)) throw new Error('Игрок не входит в кампанию энкаунтера.');

    const timestamp = now();
    const existing = this.database.sqlite
      .prepare('SELECT * FROM encounter_player_settings WHERE encounter_id = ? AND player_id = ?')
      .get(input.encounterId, input.playerId) as Row | undefined;
    const setting: EncounterPlayerSetting = {
      id: existing ? String(existing.id) : id(),
      encounterId: input.encounterId,
      playerId: input.playerId,
      participating: input.participating ?? (existing ? Boolean(existing.participating) : true),
      initiativeAdvantage: Boolean(input.initiativeAdvantage),
      initiativeOverride: input.initiativeOverride == null ? null : clamp(input.initiativeOverride, -99, 99),
      createdAt: existing ? String(existing.created_at) : timestamp,
      updatedAt: timestamp
    };

    this.database.sqlite
      .prepare(
        `
        INSERT INTO encounter_player_settings (
          id, encounter_id, player_id, participating, initiative_advantage, initiative_override, created_at, updated_at
        ) VALUES (
          @id, @encounterId, @playerId, @participating, @initiativeAdvantage, @initiativeOverride, @createdAt, @updatedAt
        )
        ON CONFLICT(encounter_id, player_id) DO UPDATE SET
          participating = excluded.participating,
          initiative_advantage = excluded.initiative_advantage,
          initiative_override = excluded.initiative_override,
          updated_at = excluded.updated_at
      `
      )
      .run(toEncounterPlayerSettingParams(setting));
    touchCampaign(this.database, String(encounter.campaign_id));
    return setting;
  }

  saveEncounterLair(input: SaveEncounterLairInput): EncounterLair {
    const encounter = this.getRow(input.encounterId);
    if (input.templateId) {
      const template = this.creatures.get(input.templateId);
      if (template.campaignId !== String(encounter.campaign_id)) {
        throw new Error('Существо не входит в кампанию энкаунтера.');
      }
    }

    const timestamp = now();
    const existing = this.getLair(input.encounterId);
    const lair: EncounterLair = {
      id: existing?.id ?? id(),
      encounterId: input.encounterId,
      templateId: input.templateId ?? null,
      name: input.name.trim() || 'Логово',
      initiative: 20,
      description: input.description?.trim() ?? '',
      html: input.html ?? '',
      effects: input.effects ?? [],
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    this.database.sqlite
      .prepare(
        `
        INSERT INTO encounter_lairs (
          id, encounter_id, template_id, name, initiative, description, html, effects_json, created_at, updated_at
        ) VALUES (
          @id, @encounterId, @templateId, @name, @initiative, @description, @html, @effectsJson, @createdAt, @updatedAt
        )
        ON CONFLICT(encounter_id) DO UPDATE SET
          template_id = excluded.template_id,
          name = excluded.name,
          initiative = 20,
          description = excluded.description,
          html = excluded.html,
          effects_json = excluded.effects_json,
          updated_at = excluded.updated_at
      `
      )
      .run(toEncounterLairParams(lair));
    touchCampaign(this.database, String(encounter.campaign_id));
    return lair;
  }

  deleteEncounterLair(encounterId: string): void {
    const encounter = this.getRow(encounterId);
    this.database.sqlite.prepare('DELETE FROM encounter_lairs WHERE encounter_id = ?').run(encounterId);
    touchCampaign(this.database, String(encounter.campaign_id));
  }

  deleteEncounterGroup(idToDelete: string): void {
    const row = this.database.sqlite
      .prepare(
        `
        SELECT e.campaign_id
        FROM encounter_creature_groups g
        JOIN encounters e ON e.id = g.encounter_id
        WHERE g.id = ?
      `
      )
      .get(idToDelete) as Row | undefined;
    this.database.sqlite.prepare('DELETE FROM encounter_creature_groups WHERE id = ?').run(idToDelete);
    if (row) touchCampaign(this.database, String(row.campaign_id));
  }

  list(campaignId: string): Encounter[] {
    return this.database.sqlite
      .prepare('SELECT * FROM encounters WHERE campaign_id = ? ORDER BY updated_at DESC, name ASC')
      .all(campaignId)
      .map((row) => row as Row)
      .map((row) => rowToEncounter(row, this.listGroups(String(row.id)), this.listPlayerSettings(String(row.id)), this.getLair(String(row.id))));
  }

  listGroups(encounterId: string): EncounterCreatureGroup[] {
    return this.database.sqlite
      .prepare('SELECT * FROM encounter_creature_groups WHERE encounter_id = ? ORDER BY created_at ASC')
      .all(encounterId)
      .map((row) => rowToEncounterGroup(row as Row));
  }

  listPlayerSettings(encounterId: string): EncounterPlayerSetting[] {
    return this.database.sqlite
      .prepare('SELECT * FROM encounter_player_settings WHERE encounter_id = ? ORDER BY created_at ASC')
      .all(encounterId)
      .map((row) => rowToEncounterPlayerSetting(row as Row));
  }

  getLair(encounterId: string): EncounterLair | null {
    const row = this.database.sqlite.prepare('SELECT * FROM encounter_lairs WHERE encounter_id = ?').get(encounterId) as Row | undefined;
    return row ? rowToEncounterLair(row) : null;
  }

  getRow(encounterId: string): Row {
    const row = this.database.sqlite.prepare('SELECT * FROM encounters WHERE id = ?').get(encounterId) as Row | undefined;
    if (!row) throw new Error('Энкаунтер не найден.');
    return row;
  }
}

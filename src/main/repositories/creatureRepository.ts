import type { AbilityBlock, CreatureTemplate, SaveCreatureTemplateInput } from '@shared/types';
import type { AppDatabase } from '../services/db';
import { clamp, id, now, rowToCreature, toCreatureParams, touchCampaign, type Row } from './repositoryUtils';

const DEFAULT_ABILITIES: AbilityBlock = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

/** Хранит нормализованные и редактируемые локальные копии статблоков существ. */
export class CreatureRepository {
  constructor(private readonly database: AppDatabase) {}
  saveCreature(input: SaveCreatureTemplateInput): CreatureTemplate {
    const timestamp = now();
    const existing = input.id ? (this.database.sqlite.prepare('SELECT * FROM creature_templates WHERE id = ?').get(input.id) as Row | undefined) : undefined;
    const creature: CreatureTemplate = {
      ...input,
      id: input.id || id(),
      name: input.name.trim() || input.originalName.trim() || 'Безымянное существо',
      originalName: input.originalName.trim(),
      armorClass: clamp(input.armorClass, 1, 40),
      initiativeMod: clamp(input.initiativeMod, -20, 30),
      initiativeScore: clamp(input.initiativeScore, 0, 40),
      hitPoints: clamp(input.hitPoints, 1, 9999),
      xp: Math.max(0, Math.round(input.xp || 0)),
      proficiencyBonus: clamp(input.proficiencyBonus, 0, 20),
      abilities: input.abilities ?? DEFAULT_ABILITIES,
      savingThrows: input.savingThrows ?? {},
      traits: input.traits ?? [],
      actions: input.actions ?? [],
      lairName: input.lairName?.trim() ?? '',
      lairDescription: input.lairDescription ?? '',
      lairHtml: input.lairHtml ?? '',
      lairEffects: input.lairEffects ?? [],
      notes: input.notes ?? '',
      createdAt: existing ? String(existing.created_at) : timestamp,
      updatedAt: timestamp
    };

    this.database.sqlite
      .prepare(
        `
        INSERT INTO creature_templates (
          id, campaign_id, name, original_name, size, creature_type, alignment,
          armor_class, initiative_mod, initiative_score, hit_points, hit_dice, speeds,
          abilities_json, saving_throws_json, skills, vulnerabilities, resistances,
          immunities, condition_immunities, senses, languages, challenge_rating, xp,
          proficiency_bonus, traits_json, actions_json, image_url, token_url, lair_name, lair_description, lair_html, lair_effects_json, source_url, notes,
          created_at, updated_at
        ) VALUES (
          @id, @campaignId, @name, @originalName, @size, @creatureType, @alignment,
          @armorClass, @initiativeMod, @initiativeScore, @hitPoints, @hitDice, @speeds,
          @abilitiesJson, @savingThrowsJson, @skills, @vulnerabilities, @resistances,
          @immunities, @conditionImmunities, @senses, @languages, @challengeRating, @xp,
          @proficiencyBonus, @traitsJson, @actionsJson, @imageUrl, @tokenUrl, @lairName, @lairDescription, @lairHtml, @lairEffectsJson, @sourceUrl, @notes,
          @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          original_name = excluded.original_name,
          size = excluded.size,
          creature_type = excluded.creature_type,
          alignment = excluded.alignment,
          armor_class = excluded.armor_class,
          initiative_mod = excluded.initiative_mod,
          initiative_score = excluded.initiative_score,
          hit_points = excluded.hit_points,
          hit_dice = excluded.hit_dice,
          speeds = excluded.speeds,
          abilities_json = excluded.abilities_json,
          saving_throws_json = excluded.saving_throws_json,
          skills = excluded.skills,
          vulnerabilities = excluded.vulnerabilities,
          resistances = excluded.resistances,
          immunities = excluded.immunities,
          condition_immunities = excluded.condition_immunities,
          senses = excluded.senses,
          languages = excluded.languages,
          challenge_rating = excluded.challenge_rating,
          xp = excluded.xp,
          proficiency_bonus = excluded.proficiency_bonus,
          traits_json = excluded.traits_json,
          actions_json = excluded.actions_json,
          image_url = excluded.image_url,
          token_url = excluded.token_url,
          lair_name = excluded.lair_name,
          lair_description = excluded.lair_description,
          lair_html = excluded.lair_html,
          lair_effects_json = excluded.lair_effects_json,
          source_url = excluded.source_url,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `
      )
      .run(toCreatureParams(creature));
    touchCampaign(this.database, creature.campaignId);
    return creature;
  }

  deleteCreature(idToDelete: string): void {
    const row = this.database.sqlite.prepare('SELECT campaign_id FROM creature_templates WHERE id = ?').get(idToDelete) as Row | undefined;
    this.database.sqlite.prepare('DELETE FROM creature_templates WHERE id = ?').run(idToDelete);
    if (row) touchCampaign(this.database, String(row.campaign_id));
  }

  list(campaignId: string): CreatureTemplate[] {
    return this.database.sqlite
      .prepare('SELECT * FROM creature_templates WHERE campaign_id = ? ORDER BY updated_at DESC, name ASC')
      .all(campaignId)
      .map((row) => rowToCreature(row as Row));
  }

  get(creatureId: string): CreatureTemplate {
    const row = this.database.sqlite.prepare('SELECT * FROM creature_templates WHERE id = ?').get(creatureId) as Row | undefined;
    if (!row) throw new Error('Существо не найдено.');
    return rowToCreature(row);
  }
}

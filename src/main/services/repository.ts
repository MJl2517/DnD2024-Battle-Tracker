import { randomUUID } from 'node:crypto';
import type { AppDatabase } from './db';
import { extractLairEffects, parseNextDndMonster, parseNextDndSpell, parseRuleholderMonster, parseRuleholderSpell, parseTtgClubMonster, parseTtgClubSpell } from './ruleholderParser';
import {
  assignTurnOrder,
  calculateExperience,
  clampEncounterQuantity,
  normalizeHitPointMode,
  normalizeGroupInput,
  normalizeHp,
  rollHitDiceExpression,
  rollInitiative,
  rollInitiativeWithAdvantage,
  tickTimedEffects,
  toPublicCombatants
} from '@shared/combat';
import { CONCENTRATION_STATUS_ID, UNCONSCIOUS_DEPENDENCY_STATUS_IDS, addStatusEffects, removeStatusEffects } from '@shared/statusEffects';
import type {
  AbilityBlock,
  Campaign,
  CampaignDetail,
  CompleteCombatOptions,
  CombatXpAward,
  CombatEffect,
  CombatSession,
  Combatant,
  CombatantPatch,
  CompleteCombatResult,
  CreatureFeature,
  CreatureTemplate,
  Encounter,
  EncounterCreatureGroup,
  EncounterLair,
  EncounterPlayerSetting,
  PlayerCharacter,
  PublicFeatureCard,
  PublicCombatView,
  SaveCreatureTemplateInput,
  SaveEncounterGroupInput,
  SaveEncounterInput,
  SaveEncounterLairInput,
  SaveEncounterPlayerSettingInput,
  SavePlayerInput,
  SavingThrowBlock,
  SpellCard
} from '@shared/types';

type Row = Record<string, unknown>;

const DEFAULT_ABILITIES: AbilityBlock = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10
};

export class TrackerRepository {
  private readonly spellCache = new Map<string, SpellCard>();
  private readonly dismissedXpAwardSessionIds = new Set<string>();
  private readonly publicFeatureCards = new Map<string, PublicFeatureCard>();

  constructor(private readonly database: AppDatabase) {}

  listCampaigns(): Campaign[] {
    return this.database.sqlite
      .prepare('SELECT * FROM campaigns ORDER BY updated_at DESC, name ASC')
      .all()
      .map((row) => row as Row)
      .map(rowToCampaign);
  }

  createCampaign(input: { name: string; notes?: string }): Campaign {
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

  deleteCampaign(idToDelete: string): void {
    this.database.sqlite.prepare('DELETE FROM campaigns WHERE id = ?').run(idToDelete);
  }

  getCampaignDetail(campaignId: string): CampaignDetail {
    const campaignRow = this.database.sqlite.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as Row | undefined;
    if (!campaignRow) throw new Error('Кампания не найдена.');

    const players = this.listPlayers(campaignId);
    const creatures = this.listCreatures(campaignId);
    const encounters = this.listEncounters(campaignId);
    const activeSession = this.getActiveSession(campaignId);

    return {
      campaign: rowToCampaign(campaignRow),
      players,
      creatures,
      encounters,
      activeSession
    };
  }

  savePlayer(input: SavePlayerInput): PlayerCharacter {
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
      notes: input.notes?.trim() ?? '',
      createdAt: existing ? String(existing.created_at) : timestamp,
      updatedAt: timestamp
    };

    this.database.sqlite
      .prepare(
        `
        INSERT INTO player_characters (
          id, campaign_id, name, level, armor_class, max_hp, initiative_mod,
          passive_perception, active, notes, created_at, updated_at
        ) VALUES (
          @id, @campaignId, @name, @level, @armorClass, @maxHp, @initiativeMod,
          @passivePerception, @active, @notes, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          level = excluded.level,
          armor_class = excluded.armor_class,
          max_hp = excluded.max_hp,
          initiative_mod = excluded.initiative_mod,
          passive_perception = excluded.passive_perception,
          active = excluded.active,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `
      )
      .run({ ...player, active: player.active ? 1 : 0 });
    touchCampaign(this.database, player.campaignId);
    return player;
  }

  deletePlayer(idToDelete: string): void {
    const row = this.database.sqlite.prepare('SELECT campaign_id FROM player_characters WHERE id = ?').get(idToDelete) as Row | undefined;
    this.database.sqlite.prepare('DELETE FROM player_characters WHERE id = ?').run(idToDelete);
    if (row) touchCampaign(this.database, String(row.campaign_id));
  }

  async importRuleholderCreature(campaignId: string, url: string): Promise<CreatureTemplate> {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLocaleLowerCase('en').replace(/^www\./, '');
    if (hostname !== 'ruleholder.com' && hostname !== 'next.dnd.su' && hostname !== 'new.ttg.club') {
      throw new Error('Импорт сейчас поддерживает ссылки ruleholder.com, next.dnd.su и new.ttg.club.');
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'user-agent': 'DnD-2024-Battle-Tracker/0.1'
      }
    });
    if (!response.ok) {
      throw new Error(`${hostname === 'next.dnd.su' ? 'DnD.su' : hostname === 'new.ttg.club' ? 'TTG Club' : 'Ruleholder'} вернул HTTP ${response.status}.`);
    }

    const html = await response.text();
    const parsed =
      hostname === 'next.dnd.su'
        ? parseNextDndMonster(html, parsedUrl.toString())
        : hostname === 'new.ttg.club'
          ? parseTtgClubMonster(html, parsedUrl.toString())
          : parseRuleholderMonster(html, parsedUrl.toString());
    return this.saveCreature({ ...parsed, campaignId });
  }

  async fetchRuleholderSpell(href: string): Promise<SpellCard> {
    const url = normalizeSpellUrl(href);
    const cached = this.spellCache.get(url);
    if (cached) return cached;

    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLocaleLowerCase('en').replace(/^www\./, '');
    const response = await fetch(url, {
      headers: {
        'user-agent': 'DnD-2024-Battle-Tracker/0.1'
      }
    });
    if (!response.ok) {
      throw new Error(`${hostname === 'next.dnd.su' ? 'DnD.su' : hostname === 'new.ttg.club' ? 'TTG Club' : 'Ruleholder'} вернул HTTP ${response.status} для заклинания.`);
    }

    const html = await response.text();
    const spell =
      hostname === 'next.dnd.su'
        ? parseNextDndSpell(html, url)
        : hostname === 'new.ttg.club'
          ? parseTtgClubSpell(html, url)
          : parseRuleholderSpell(html, url);
    this.spellCache.set(url, spell);
    return spell;
  }

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
      groups: this.listEncounterGroups(encounter.id),
      playerSettings: this.listEncounterPlayerSettings(encounter.id),
      lair: this.getEncounterLair(encounter.id)
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
    const template = this.getCreature(input.templateId);
    const encounter = this.getEncounterRow(input.encounterId);
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
      createdAt: existing ? String(existing.created_at) : timestamp,
      updatedAt: timestamp
    };

    this.database.sqlite
      .prepare(
        `
        INSERT INTO encounter_creature_groups (
          id, encounter_id, template_id, display_name, quantity, initiative_mode,
          initiative_advantage, initiative_override, hp_mode, hp_override, created_at, updated_at
        ) VALUES (
          @id, @encounterId, @templateId, @displayName, @quantity, @initiativeMode,
          @initiativeAdvantage, @initiativeOverride, @hpMode, @hpOverride, @createdAt, @updatedAt
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
          updated_at = excluded.updated_at
      `
      )
      .run(toEncounterGroupParams(group));
    touchCampaign(this.database, String(encounter.campaign_id));
    return group;
  }

  saveEncounterPlayerSetting(input: SaveEncounterPlayerSettingInput): EncounterPlayerSetting {
    const encounter = this.getEncounterRow(input.encounterId);
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
    const encounter = this.getEncounterRow(input.encounterId);
    if (input.templateId) {
      const template = this.getCreature(input.templateId);
      if (template.campaignId !== String(encounter.campaign_id)) {
        throw new Error('Существо не входит в кампанию энкаунтера.');
      }
    }

    const timestamp = now();
    const existing = this.getEncounterLair(input.encounterId);
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
    const encounter = this.getEncounterRow(encounterId);
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

  startCombat(encounterId: string): CombatSession {
    const encounter = this.saveEncounter({
      id: encounterId,
      campaignId: String(this.getEncounterRow(encounterId).campaign_id),
      name: String(this.getEncounterRow(encounterId).name),
      notes: String(this.getEncounterRow(encounterId).notes)
    });
    const campaignId = encounter.campaignId;
    const playerSettingById = new Map(this.listEncounterPlayerSettings(encounterId).map((setting) => [setting.playerId, setting]));
    const players = this.listPlayers(campaignId).filter((player) => player.active && (playerSettingById.get(player.id)?.participating ?? true));
    const groups = this.listEncounterGroups(encounterId);
    const timestamp = now();
    const sessionId = id();

    const combatants: Combatant[] = [];
    for (const player of players) {
      const setting = playerSettingById.get(player.id);
      combatants.push({
        id: id(),
        sessionId,
        templateId: null,
        playerId: player.id,
        name: player.name,
        side: 'player',
        armorClass: player.armorClass,
        baseArmorClass: player.armorClass,
        maxHp: player.maxHp,
        baseMaxHp: player.maxHp,
        currentHp: player.maxHp,
        temporaryHp: 0,
        initiative: setting?.initiativeOverride ?? rollPreparedInitiative(player.initiativeMod, Boolean(setting?.initiativeAdvantage)),
        initiativeMod: player.initiativeMod,
        initiativeGroupId: null,
        initiativeMode: 'individual',
        turnOrder: combatants.length,
        effects: [],
        publicNotes: '',
        snapshot: player,
        defeated: false,
        escaped: false,
        visible: true
      });
    }

    if (encounter.lair) {
      combatants.push({
        id: id(),
        sessionId,
        templateId: encounter.lair.templateId,
        playerId: null,
        name: encounter.lair.name,
        side: 'npc',
        armorClass: 0,
        baseArmorClass: 0,
        maxHp: 1,
        baseMaxHp: 1,
        currentHp: 1,
        temporaryHp: 0,
        initiative: 20,
        initiativeMod: 0,
        initiativeGroupId: encounter.lair.id,
        initiativeMode: 'individual',
        turnOrder: combatants.length,
        effects: [],
        publicNotes: encounter.lair.description,
        snapshot: encounter.lair,
        defeated: false,
        escaped: false,
        visible: true
      });
    }

    for (const group of groups) {
      const template = this.getCreature(group.templateId);
      const sharedInitiative =
        group.initiativeMode === 'group' ? group.initiativeOverride ?? rollPreparedInitiative(template.initiativeMod, group.initiativeAdvantage) : null;
      for (let index = 0; index < group.quantity; index += 1) {
        const suffix = group.quantity > 1 ? ` ${index + 1}` : '';
        const maxHp = rollEncounterGroupHitPoints(group, template);
        combatants.push({
          id: id(),
          sessionId,
          templateId: template.id,
          playerId: null,
          name: `${group.displayName}${suffix}`,
          side: 'npc',
          armorClass: template.armorClass,
          baseArmorClass: template.armorClass,
          maxHp,
          baseMaxHp: maxHp,
          currentHp: maxHp,
          temporaryHp: 0,
          initiative: sharedInitiative ?? group.initiativeOverride ?? rollPreparedInitiative(template.initiativeMod, group.initiativeAdvantage),
          initiativeMod: template.initiativeMod,
          initiativeGroupId: group.initiativeMode === 'group' ? group.id : null,
          initiativeMode: group.initiativeMode,
          turnOrder: combatants.length,
          effects: [],
          publicNotes: '',
          snapshot: template,
          defeated: false,
          escaped: false,
          visible: true
        });
      }
    }

    const orderedCombatants = assignTurnOrder(combatants);
    const activeCombatantId = orderedCombatants[0]?.id ?? null;

    this.database.sqlite.transaction(() => {
      this.database.sqlite
        .prepare('UPDATE combat_sessions SET status = ?, ended_at = ? WHERE campaign_id = ? AND status = ?')
        .run('completed', timestamp, campaignId, 'active');
      this.database.sqlite
        .prepare(
          `
          INSERT INTO combat_sessions (
            id, campaign_id, encounter_id, round, status, active_combatant_id,
            total_xp, xp_per_player, started_at, ended_at
          ) VALUES (?, ?, ?, 1, 'active', ?, 0, 0, ?, NULL)
        `
        )
        .run(sessionId, campaignId, encounterId, activeCombatantId, timestamp);

      const statement = this.database.sqlite.prepare(
        `
        INSERT INTO combatants (
          id, session_id, template_id, player_id, name, side, armor_class, base_armor_class,
          max_hp, base_max_hp, current_hp, temporary_hp, initiative, initiative_mod, initiative_group_id, initiative_mode,
          turn_order, effects_json, public_notes, snapshot_json, defeated, escaped, visible
        ) VALUES (
          @id, @sessionId, @templateId, @playerId, @name, @side, @armorClass, @baseArmorClass,
          @maxHp, @baseMaxHp, @currentHp, @temporaryHp, @initiative, @initiativeMod, @initiativeGroupId, @initiativeMode,
          @turnOrder, @effectsJson, @publicNotes, @snapshotJson, @defeated, @escaped, @visible
        )
      `
      );
      for (const combatant of orderedCombatants) {
        statement.run(toCombatantParams(combatant));
      }
    })();

    return this.getCombatSession(sessionId);
  }

  getCombatSession(sessionId: string): CombatSession {
    const sessionRow = this.database.sqlite.prepare('SELECT * FROM combat_sessions WHERE id = ?').get(sessionId) as Row | undefined;
    if (!sessionRow) throw new Error('Бой не найден.');
    return this.rowToCombatSession(sessionRow);
  }

  updateCombatant(idToUpdate: string, patch: CombatantPatch): CombatSession {
    const current = this.database.sqlite.prepare('SELECT * FROM combatants WHERE id = ?').get(idToUpdate) as Row | undefined;
    if (!current) throw new Error('Участник боя не найден.');

    const values: Record<string, unknown> = { id: idToUpdate };
    const updates: string[] = [];
    const set = (column: string, key: string, value: unknown): void => {
      updates.push(`${column} = @${key}`);
      values[key] = value;
    };

    let defeatedAfterPatch: boolean | null = null;
    let currentHpForWrite: number | undefined;
    let maxHpForWrite: number | undefined;
    let temporaryHpForWrite: number | undefined;
    let effectsForWrite: CombatEffect[] | undefined = patch.effects;

    if (patch.armorClass !== undefined) set('armor_class', 'armorClass', clamp(Math.round(patch.armorClass), 0, 60));
    if (patch.maxHp !== undefined) {
      maxHpForWrite = clamp(Math.round(patch.maxHp), 1, 9999);
      set('max_hp', 'maxHp', maxHpForWrite);
    }
    if (patch.currentHp !== undefined) {
      currentHpForWrite = normalizeHp(patch.currentHp, maxHpForWrite ?? Number(current.max_hp));
      if (patch.defeated === undefined) {
        defeatedAfterPatch = currentHpForWrite <= 0;
        set('defeated', 'defeated', defeatedAfterPatch ? 1 : 0);
      }
    } else if (maxHpForWrite !== undefined) {
      currentHpForWrite = normalizeHp(Number(current.current_hp), maxHpForWrite);
    }
    if (patch.temporaryHp !== undefined) {
      temporaryHpForWrite = clamp(Math.round(patch.temporaryHp), 0, 9999);
    }
    if (patch.initiative !== undefined) set('initiative', 'initiative', Math.round(patch.initiative));
    if (patch.turnOrder !== undefined) set('turn_order', 'turnOrder', Math.max(0, Math.round(patch.turnOrder)));
    if (patch.publicNotes !== undefined) set('public_notes', 'publicNotes', patch.publicNotes);
    if (patch.defeated !== undefined) {
      defeatedAfterPatch = patch.defeated;
      set('defeated', 'defeatedPatch', patch.defeated ? 1 : 0);
      if (patch.defeated) set('escaped', 'escapedForDefeated', 0);
    }
    if (patch.escaped !== undefined) {
      set('escaped', 'escaped', patch.escaped ? 1 : 0);
      if (patch.escaped) set('defeated', 'defeatedForEscaped', 0);
    }
    if (patch.visible !== undefined) set('visible', 'visible', patch.visible ? 1 : 0);

    if (defeatedAfterPatch === true && Number(current.max_hp) > 0) {
      currentHpForWrite = 0;
      temporaryHpForWrite = 0;
      effectsForWrite = addStatusEffects(
        removeStatusEffects(effectsForWrite ?? parseJson<CombatEffect[]>(current.effects_json, []), [CONCENTRATION_STATUS_ID]),
        UNCONSCIOUS_DEPENDENCY_STATUS_IDS,
        id
      );
    }
    if (currentHpForWrite !== undefined) set('current_hp', 'currentHp', currentHpForWrite);
    if (temporaryHpForWrite !== undefined) set('temporary_hp', 'temporaryHp', temporaryHpForWrite);
    if (effectsForWrite !== undefined) set('effects_json', 'effectsJson', json(effectsForWrite));

    if (updates.length) {
      this.database.sqlite.prepare(`UPDATE combatants SET ${updates.join(', ')} WHERE id = @id`).run(values);
    }

    return this.getCombatSession(String(current.session_id));
  }

  reorderCombatants(sessionId: string, orderedIds: string[]): CombatSession {
    this.database.sqlite.transaction(() => {
      const statement = this.database.sqlite.prepare('UPDATE combatants SET turn_order = ? WHERE id = ? AND session_id = ?');
      orderedIds.forEach((combatantId, index) => statement.run(index, combatantId, sessionId));
    })();
    return this.getCombatSession(sessionId);
  }

  setActiveCombatant(sessionId: string, combatantId: string): CombatSession {
    const exists = this.database.sqlite
      .prepare('SELECT id FROM combatants WHERE id = ? AND session_id = ?')
      .get(combatantId, sessionId) as Row | undefined;
    if (!exists) throw new Error('Участник не входит в этот бой.');

    this.database.sqlite.prepare('UPDATE combat_sessions SET active_combatant_id = ? WHERE id = ?').run(combatantId, sessionId);
    return this.getCombatSession(sessionId);
  }

  advanceTurn(sessionId: string): CombatSession {
    return this.moveTurn(sessionId, 1);
  }

  retreatTurn(sessionId: string): CombatSession {
    return this.moveTurn(sessionId, -1);
  }

  endRound(sessionId: string): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (!session.combatants.length) return session;

    const ordered = [...session.combatants].sort((a, b) => a.turnOrder - b.turnOrder);
    this.database.sqlite.transaction(() => {
      this.tickSessionTimedEffects(sessionId, 1);
      this.database.sqlite
        .prepare('UPDATE combat_sessions SET active_combatant_id = ?, round = ? WHERE id = ?')
        .run(ordered[0].id, session.round + 1, sessionId);
    })();
    return this.getCombatSession(sessionId);
  }

  advanceRound(sessionId: string): CombatSession {
    return this.shiftRound(sessionId, 1);
  }

  retreatRound(sessionId: string): CombatSession {
    return this.shiftRound(sessionId, -1);
  }

  private moveTurn(sessionId: string, direction: 1 | -1): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (!session.combatants.length) return session;

    const ordered = [...session.combatants].sort((a, b) => a.turnOrder - b.turnOrder);
    const currentIndex = Math.max(
      0,
      ordered.findIndex((combatant) => combatant.id === session.activeCombatantId)
    );
    if (direction === -1 && session.round <= 1 && currentIndex === 0) {
      return session;
    }

    const nextIndex =
      direction === 1
        ? currentIndex + 1 >= ordered.length
          ? 0
          : currentIndex + 1
        : currentIndex - 1 < 0
          ? ordered.length - 1
          : currentIndex - 1;
    const nextRound =
      direction === 1 && nextIndex === 0
        ? session.round + 1
        : direction === -1 && currentIndex === 0
          ? Math.max(1, session.round - 1)
          : session.round;

    this.database.sqlite.transaction(() => {
      if (nextRound > session.round) this.tickSessionTimedEffects(sessionId, nextRound - session.round);
      this.database.sqlite
        .prepare('UPDATE combat_sessions SET active_combatant_id = ?, round = ? WHERE id = ?')
        .run(ordered[nextIndex].id, nextRound, sessionId);
    })();
    return this.getCombatSession(sessionId);
  }

  private shiftRound(sessionId: string, direction: 1 | -1): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (!session.combatants.length) return session;
    const nextRound = Math.max(1, session.round + direction);
    if (nextRound === session.round) return session;

    this.database.sqlite.transaction(() => {
      if (nextRound > session.round) this.tickSessionTimedEffects(sessionId, nextRound - session.round);
      this.database.sqlite.prepare('UPDATE combat_sessions SET round = ? WHERE id = ?').run(nextRound, sessionId);
    })();
    return this.getCombatSession(sessionId);
  }

  private tickSessionTimedEffects(sessionId: string, rounds: number): void {
    const rows = this.database.sqlite.prepare('SELECT id, effects_json FROM combatants WHERE session_id = ?').all(sessionId) as Row[];
    const statement = this.database.sqlite.prepare('UPDATE combatants SET effects_json = ? WHERE id = ?');
    for (const row of rows) {
      const effects = parseJson<CombatEffect[]>(row.effects_json, []);
      const nextEffects = tickTimedEffects(effects, rounds);
      if (json(nextEffects) !== json(effects)) {
        statement.run(json(nextEffects), String(row.id));
      }
    }
  }

  completeCombat(sessionId: string, options: CompleteCombatOptions = { defeatedGiveXp: true, escapedXpMode: 'none' }): CompleteCombatResult {
    const session = this.getCombatSession(sessionId);
    const participatingPlayers = session.combatants.filter((combatant) => combatant.side === 'player').map(() => ({ active: true }));
    const result = calculateExperience(session.combatants, participatingPlayers, options);
    const endedAt = now();

    this.database.sqlite
      .prepare(
        `
        UPDATE combat_sessions
        SET status = 'completed', total_xp = ?, xp_per_player = ?, ended_at = ?
        WHERE id = ?
      `
      )
      .run(result.totalXp, result.xpPerPlayer, endedAt, sessionId);

    return {
      session: this.getCombatSession(sessionId),
      defeatedNpcCount: result.defeatedNpcCount,
      escapedNpcCount: result.escapedNpcCount,
      activePlayerCount: result.playerCount,
      xpAward: result
    };
  }

  getPlayerView(campaignId: string): PublicCombatView {
    const session = this.getActiveSession(campaignId);
    const featureCard = this.publicFeatureCards.get(campaignId) ?? null;
    return session
      ? { round: session.round, combatants: toPublicCombatants(session.combatants, session.activeCombatantId), featureCard }
      : { round: 1, combatants: [], featureCard, xpAward: this.getLatestCompletedXpAward(campaignId) };
  }

  showPublicFeatureCard(campaignId: string, card: PublicFeatureCard): void {
    this.publicFeatureCards.set(campaignId, card);
  }

  dismissPublicFeatureCard(campaignId: string): void {
    this.publicFeatureCards.delete(campaignId);
  }

  dismissCombatXpAward(sessionId: string): string {
    const session = this.getCombatSession(sessionId);
    this.dismissedXpAwardSessionIds.add(sessionId);
    return session.campaignId;
  }

  private getLatestCompletedXpAward(campaignId: string): CombatXpAward | null {
    const session = this.getLatestCompletedSession(campaignId);
    if (!session || session.endedAt == null) return null;
    if (this.dismissedXpAwardSessionIds.has(session.id)) return null;
    const playerCount = session.combatants.filter((combatant) => combatant.side === 'player').length;
    const defeatedNpcCount = session.combatants.filter(
      (combatant) => combatant.side === 'npc' && !combatant.escaped && (combatant.defeated || combatant.currentHp <= 0)
    ).length;
    const escapedNpcCount = session.combatants.filter((combatant) => combatant.side === 'npc' && combatant.escaped).length;
    return {
      totalXp: session.totalXp,
      xpPerPlayer: session.xpPerPlayer,
      playerCount,
      defeatedNpcCount,
      escapedNpcCount,
      customPool: false
    };
  }

  private listPlayers(campaignId: string): PlayerCharacter[] {
    return this.database.sqlite
      .prepare('SELECT * FROM player_characters WHERE campaign_id = ? ORDER BY active DESC, name ASC')
      .all(campaignId)
      .map((row) => row as Row)
      .map(rowToPlayer);
  }

  private listCreatures(campaignId: string): CreatureTemplate[] {
    return this.database.sqlite
      .prepare('SELECT * FROM creature_templates WHERE campaign_id = ? ORDER BY updated_at DESC, name ASC')
      .all(campaignId)
      .map((row) => row as Row)
      .map(rowToCreature);
  }

  private listEncounters(campaignId: string): Encounter[] {
    return this.database.sqlite
      .prepare('SELECT * FROM encounters WHERE campaign_id = ? ORDER BY updated_at DESC, name ASC')
      .all(campaignId)
      .map((row) => row as Row)
      .map((row) =>
        rowToEncounter(row, this.listEncounterGroups(String(row.id)), this.listEncounterPlayerSettings(String(row.id)), this.getEncounterLair(String(row.id)))
      );
  }

  private listEncounterGroups(encounterId: string): EncounterCreatureGroup[] {
    return this.database.sqlite
      .prepare('SELECT * FROM encounter_creature_groups WHERE encounter_id = ? ORDER BY created_at ASC')
      .all(encounterId)
      .map((row) => row as Row)
      .map(rowToEncounterGroup);
  }

  private listEncounterPlayerSettings(encounterId: string): EncounterPlayerSetting[] {
    return this.database.sqlite
      .prepare('SELECT * FROM encounter_player_settings WHERE encounter_id = ? ORDER BY created_at ASC')
      .all(encounterId)
      .map((row) => row as Row)
      .map(rowToEncounterPlayerSetting);
  }

  private getEncounterLair(encounterId: string): EncounterLair | null {
    const row = this.database.sqlite.prepare('SELECT * FROM encounter_lairs WHERE encounter_id = ?').get(encounterId) as Row | undefined;
    return row ? rowToEncounterLair(row) : null;
  }

  private getCreature(creatureId: string): CreatureTemplate {
    const row = this.database.sqlite.prepare('SELECT * FROM creature_templates WHERE id = ?').get(creatureId) as Row | undefined;
    if (!row) throw new Error('Существо не найдено.');
    return rowToCreature(row);
  }

  private getEncounterRow(encounterId: string): Row {
    const row = this.database.sqlite.prepare('SELECT * FROM encounters WHERE id = ?').get(encounterId) as Row | undefined;
    if (!row) throw new Error('Энкаунтер не найден.');
    return row;
  }

  private getActiveSession(campaignId: string): CombatSession | null {
    const row = this.database.sqlite
      .prepare("SELECT * FROM combat_sessions WHERE campaign_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
      .get(campaignId) as Row | undefined;
    return row ? this.rowToCombatSession(row) : null;
  }

  private getLatestCompletedSession(campaignId: string): CombatSession | null {
    const row = this.database.sqlite
      .prepare("SELECT * FROM combat_sessions WHERE campaign_id = ? AND status = 'completed' ORDER BY ended_at DESC, started_at DESC LIMIT 1")
      .get(campaignId) as Row | undefined;
    return row ? this.rowToCombatSession(row) : null;
  }

  private rowToCombatSession(row: Row): CombatSession {
    const lair = this.getEncounterLair(String(row.encounter_id));
    const combatants = this.database.sqlite
      .prepare('SELECT * FROM combatants WHERE session_id = ? ORDER BY turn_order ASC, initiative DESC')
      .all(String(row.id))
      .map((combatantRow) => combatantRow as Row)
      .map(rowToCombatant)
      .map((combatant) => hydrateLairCombatant(combatant, lair));

    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      encounterId: String(row.encounter_id),
      round: Number(row.round),
      status: row.status === 'completed' ? 'completed' : 'active',
      activeCombatantId: row.active_combatant_id ? String(row.active_combatant_id) : null,
      totalXp: Number(row.total_xp),
      xpPerPlayer: Number(row.xp_per_player),
      startedAt: String(row.started_at),
      endedAt: row.ended_at ? String(row.ended_at) : null,
      combatants
    };
  }
}

function rowToCampaign(row: Row): Campaign {
  return {
    id: String(row.id),
    name: String(row.name),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToPlayer(row: Row): PlayerCharacter {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    name: String(row.name),
    level: Number(row.level),
    armorClass: Number(row.armor_class),
    maxHp: Number(row.max_hp),
    initiativeMod: Number(row.initiative_mod),
    passivePerception: Number(row.passive_perception),
    active: Boolean(row.active),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToCreature(row: Row): CreatureTemplate {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    name: String(row.name),
    originalName: String(row.original_name ?? ''),
    size: String(row.size ?? ''),
    creatureType: String(row.creature_type ?? ''),
    alignment: String(row.alignment ?? ''),
    armorClass: Number(row.armor_class),
    initiativeMod: Number(row.initiative_mod),
    initiativeScore: Number(row.initiative_score),
    hitPoints: Number(row.hit_points),
    hitDice: String(row.hit_dice ?? ''),
    speeds: String(row.speeds ?? ''),
    abilities: parseJson<AbilityBlock>(row.abilities_json, DEFAULT_ABILITIES),
    savingThrows: parseJson<SavingThrowBlock>(row.saving_throws_json, {}),
    skills: String(row.skills ?? ''),
    vulnerabilities: String(row.vulnerabilities ?? ''),
    resistances: String(row.resistances ?? ''),
    immunities: String(row.immunities ?? ''),
    conditionImmunities: String(row.condition_immunities ?? ''),
    senses: String(row.senses ?? ''),
    languages: String(row.languages ?? ''),
    challengeRating: String(row.challenge_rating ?? ''),
    xp: Number(row.xp),
    proficiencyBonus: Number(row.proficiency_bonus),
    traits: parseJson<CreatureFeature[]>(row.traits_json, []),
    actions: parseJson<CreatureFeature[]>(row.actions_json, []),
    imageUrl: String(row.image_url ?? ''),
    tokenUrl: String(row.token_url ?? ''),
    lairName: String(row.lair_name ?? ''),
    lairDescription: String(row.lair_description ?? ''),
    lairHtml: String(row.lair_html ?? ''),
    lairEffects: parseJson<CreatureFeature[]>(row.lair_effects_json, []),
    sourceUrl: String(row.source_url ?? ''),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToEncounter(row: Row, groups: EncounterCreatureGroup[], playerSettings: EncounterPlayerSetting[], lair: EncounterLair | null): Encounter {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    name: String(row.name),
    notes: String(row.notes ?? ''),
    groups,
    playerSettings,
    lair,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToEncounterGroup(row: Row): EncounterCreatureGroup {
  return {
    id: String(row.id),
    encounterId: String(row.encounter_id),
    templateId: String(row.template_id),
    displayName: String(row.display_name),
    quantity: Number(row.quantity),
    initiativeMode: row.initiative_mode === 'group' ? 'group' : 'individual',
    initiativeAdvantage: Boolean(row.initiative_advantage),
    initiativeOverride: row.initiative_override == null ? null : Number(row.initiative_override),
    hpMode: normalizeHitPointMode(row.hp_mode === 'random' || row.hp_mode === 'fixed' ? row.hp_mode : 'average', row.hp_override == null ? null : Number(row.hp_override)),
    hpOverride: row.hp_override == null ? null : Number(row.hp_override),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToEncounterPlayerSetting(row: Row): EncounterPlayerSetting {
  return {
    id: String(row.id),
    encounterId: String(row.encounter_id),
    playerId: String(row.player_id),
    participating: row.participating == null ? true : Boolean(row.participating),
    initiativeAdvantage: Boolean(row.initiative_advantage),
    initiativeOverride: row.initiative_override == null ? null : Number(row.initiative_override),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToEncounterLair(row: Row): EncounterLair {
  const description = String(row.description ?? '');
  const html = String(row.html ?? '');
  const effects = parseJson<CreatureFeature[]>(row.effects_json, []);
  return {
    id: String(row.id),
    encounterId: String(row.encounter_id),
    templateId: row.template_id ? String(row.template_id) : null,
    name: String(row.name),
    initiative: 20,
    description,
    html,
    effects: effects.length ? effects : extractLairEffects(html, description),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function toEncounterGroupParams(group: EncounterCreatureGroup): Record<string, unknown> {
  return {
    ...group,
    initiativeAdvantage: group.initiativeAdvantage ? 1 : 0
  };
}

function toEncounterPlayerSettingParams(setting: EncounterPlayerSetting): Record<string, unknown> {
  return {
    ...setting,
    participating: setting.participating ? 1 : 0,
    initiativeAdvantage: setting.initiativeAdvantage ? 1 : 0
  };
}

function toEncounterLairParams(lair: EncounterLair): Record<string, unknown> {
  return {
    ...lair,
    effectsJson: json(lair.effects)
  };
}

function rollEncounterGroupHitPoints(group: EncounterCreatureGroup, template: CreatureTemplate): number {
  if (group.hpMode === 'fixed' && group.hpOverride != null) return group.hpOverride;
  if (group.hpMode === 'random') return rollHitDiceExpression(template.hitDice, template.hitPoints);
  return template.hitPoints;
}

function rollPreparedInitiative(modifier: number, advantage: boolean): number {
  return advantage ? rollInitiativeWithAdvantage(modifier) : rollInitiative(modifier);
}

function rowToCombatant(row: Row): Combatant {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    templateId: row.template_id ? String(row.template_id) : null,
    playerId: row.player_id ? String(row.player_id) : null,
    name: String(row.name),
    side: row.side === 'player' ? 'player' : 'npc',
    armorClass: Number(row.armor_class),
    baseArmorClass: Number(row.base_armor_class ?? row.armor_class),
    maxHp: Number(row.max_hp),
    baseMaxHp: Number(row.base_max_hp ?? row.max_hp),
    currentHp: Number(row.current_hp),
    temporaryHp: Number(row.temporary_hp ?? 0),
    initiative: Number(row.initiative),
    initiativeMod: Number(row.initiative_mod),
    initiativeGroupId: row.initiative_group_id ? String(row.initiative_group_id) : null,
    initiativeMode: row.initiative_mode === 'group' ? 'group' : 'individual',
    turnOrder: Number(row.turn_order),
    effects: parseJson<CombatEffect[]>(row.effects_json, []),
    publicNotes: String(row.public_notes ?? ''),
    snapshot: parseJson<Combatant['snapshot']>(row.snapshot_json, null),
    defeated: Boolean(row.defeated),
    escaped: Boolean(row.escaped),
    visible: Boolean(row.visible)
  };
}

function hydrateLairCombatant(combatant: Combatant, lair: EncounterLair | null): Combatant {
  if (!lair || combatant.snapshot) return combatant;
  const isStoredLair = combatant.initiativeGroupId === lair.id;
  const looksLikeLair = combatant.templateId === lair.templateId && combatant.name === lair.name && combatant.initiative === 20 && combatant.maxHp === 1;
  if (!isStoredLair && !looksLikeLair) return combatant;

  return {
    ...combatant,
    templateId: lair.templateId,
    initiativeGroupId: lair.id,
    publicNotes: combatant.publicNotes || lair.description,
    snapshot: lair
  };
}

function toCreatureParams(creature: CreatureTemplate): Record<string, unknown> {
  return {
    ...creature,
    abilitiesJson: json(creature.abilities),
    savingThrowsJson: json(creature.savingThrows),
    traitsJson: json(creature.traits),
    actionsJson: json(creature.actions),
    lairEffectsJson: json(creature.lairEffects)
  };
}

function toCombatantParams(combatant: Combatant): Record<string, unknown> {
  return {
    ...combatant,
    baseArmorClass: combatant.baseArmorClass ?? combatant.armorClass,
    baseMaxHp: combatant.baseMaxHp ?? combatant.maxHp,
    effectsJson: json(combatant.effects),
    snapshotJson: combatant.snapshot ? json(combatant.snapshot) : null,
    defeated: combatant.defeated ? 1 : 0,
    escaped: combatant.escaped ? 1 : 0,
    visible: combatant.visible ? 1 : 0
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function id(): string {
  return randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function touchCampaign(database: AppDatabase, campaignId: string): void {
  database.sqlite.prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?').run(now(), campaignId);
}

function normalizeSpellUrl(href: string): string {
  const url = new URL(href, 'https://ruleholder.com');
  const hostname = url.hostname.toLocaleLowerCase('en').replace(/^www\./, '');
  if ((hostname !== 'ruleholder.com' && hostname !== 'next.dnd.su' && hostname !== 'new.ttg.club') || !url.pathname.startsWith('/spells/')) {
    throw new Error('Поддерживаются только ссылки на заклинания Ruleholder, next.dnd.su и TTG Club.');
  }
  url.hash = '';
  url.search = '';
  return url.toString();
}

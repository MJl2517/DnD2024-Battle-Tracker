import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const playerCharacters = sqliteTable('player_characters', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  name: text('name').notNull(),
  level: integer('level').notNull(),
  armorClass: integer('armor_class').notNull(),
  maxHp: integer('max_hp').notNull(),
  initiativeMod: integer('initiative_mod').notNull(),
  passivePerception: integer('passive_perception').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const creatureTemplates = sqliteTable('creature_templates', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  name: text('name').notNull(),
  originalName: text('original_name').notNull(),
  size: text('size').notNull(),
  creatureType: text('creature_type').notNull(),
  alignment: text('alignment').notNull(),
  armorClass: integer('armor_class').notNull(),
  initiativeMod: integer('initiative_mod').notNull(),
  initiativeScore: integer('initiative_score').notNull(),
  hitPoints: integer('hit_points').notNull(),
  hitDice: text('hit_dice').notNull(),
  speeds: text('speeds').notNull(),
  abilitiesJson: text('abilities_json').notNull(),
  savingThrowsJson: text('saving_throws_json').notNull(),
  skills: text('skills').notNull(),
  vulnerabilities: text('vulnerabilities').notNull(),
  resistances: text('resistances').notNull(),
  immunities: text('immunities').notNull(),
  conditionImmunities: text('condition_immunities').notNull(),
  senses: text('senses').notNull(),
  languages: text('languages').notNull(),
  challengeRating: text('challenge_rating').notNull(),
  xp: integer('xp').notNull(),
  proficiencyBonus: integer('proficiency_bonus').notNull(),
  traitsJson: text('traits_json').notNull(),
  actionsJson: text('actions_json').notNull(),
  imageUrl: text('image_url').notNull(),
  tokenUrl: text('token_url').notNull().default(''),
  lairName: text('lair_name').notNull().default(''),
  lairDescription: text('lair_description').notNull().default(''),
  lairHtml: text('lair_html').notNull().default(''),
  lairEffectsJson: text('lair_effects_json').notNull().default('[]'),
  sourceUrl: text('source_url').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const encounters = sqliteTable('encounters', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  name: text('name').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const encounterCreatureGroups = sqliteTable('encounter_creature_groups', {
  id: text('id').primaryKey(),
  encounterId: text('encounter_id').notNull(),
  templateId: text('template_id').notNull(),
  displayName: text('display_name').notNull(),
  quantity: integer('quantity').notNull(),
  initiativeMode: text('initiative_mode').notNull(),
  initiativeAdvantage: integer('initiative_advantage', { mode: 'boolean' }).notNull().default(false),
  initiativeOverride: integer('initiative_override'),
  hpMode: text('hp_mode').notNull().default('average'),
  hpOverride: integer('hp_override'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const encounterPlayerSettings = sqliteTable('encounter_player_settings', {
  id: text('id').primaryKey(),
  encounterId: text('encounter_id').notNull(),
  playerId: text('player_id').notNull(),
  participating: integer('participating', { mode: 'boolean' }).notNull().default(true),
  initiativeAdvantage: integer('initiative_advantage', { mode: 'boolean' }).notNull().default(false),
  initiativeOverride: integer('initiative_override'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const encounterLairs = sqliteTable('encounter_lairs', {
  id: text('id').primaryKey(),
  encounterId: text('encounter_id').notNull(),
  templateId: text('template_id'),
  name: text('name').notNull(),
  initiative: integer('initiative').notNull().default(20),
  description: text('description').notNull().default(''),
  html: text('html').notNull().default(''),
  effectsJson: text('effects_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const combatSessions = sqliteTable('combat_sessions', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  encounterId: text('encounter_id').notNull(),
  round: integer('round').notNull(),
  status: text('status').notNull(),
  activeCombatantId: text('active_combatant_id'),
  totalXp: integer('total_xp').notNull(),
  xpPerPlayer: integer('xp_per_player').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at')
});

export const combatants = sqliteTable('combatants', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  templateId: text('template_id'),
  playerId: text('player_id'),
  name: text('name').notNull(),
  side: text('side').notNull(),
  armorClass: integer('armor_class').notNull(),
  baseArmorClass: integer('base_armor_class').notNull().default(0),
  maxHp: integer('max_hp').notNull(),
  baseMaxHp: integer('base_max_hp').notNull().default(1),
  currentHp: integer('current_hp').notNull(),
  temporaryHp: integer('temporary_hp').notNull().default(0),
  initiative: integer('initiative').notNull(),
  initiativeMod: integer('initiative_mod').notNull(),
  initiativeGroupId: text('initiative_group_id'),
  initiativeMode: text('initiative_mode').notNull(),
  turnOrder: integer('turn_order').notNull(),
  effectsJson: text('effects_json').notNull(),
  publicNotes: text('public_notes').notNull().default(''),
  snapshotJson: text('snapshot_json'),
  defeated: integer('defeated', { mode: 'boolean' }).notNull(),
  escaped: integer('escaped', { mode: 'boolean' }).notNull().default(false),
  visible: integer('visible', { mode: 'boolean' }).notNull()
});

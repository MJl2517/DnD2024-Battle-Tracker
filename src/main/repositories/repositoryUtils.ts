import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../services/db';
import { normalizeHitPointMode, rollHitDiceExpression, rollInitiative, rollInitiativeWithAdvantage, rollInitiativeWithDisadvantage } from '@shared/combat';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS } from '@shared/types';
import type {
  AbilityBlock,
  Campaign,
  CombatEffect,
  Combatant,
  CreatureFeature,
  CreatureTemplate,
  Encounter,
  EncounterCreatureGroup,
  EncounterLair,
  EncounterPlayerSetting,
  PlayerCharacter,
  PublicDisplaySettings,
  SavingThrowBlock
} from '@shared/types';
import { extractLairEffects } from '../services/ruleholderParser';
import { normalizeConditionImmunities } from '@shared/conditionNames';

export type Row = Record<string, unknown>;

const DEFAULT_ABILITIES: AbilityBlock = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10
};
export function rowToCampaign(row: Row): Campaign {
  return {
    id: String(row.id),
    name: String(row.name),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function rowToPlayer(row: Row): PlayerCharacter {
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
    alertInitiativeSwap: Boolean(row.alert_initiative_swap),
    imageUrl: String(row.image_url ?? ''),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function rowToCreature(row: Row): CreatureTemplate {
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
    conditionImmunities: normalizeConditionImmunities(String(row.condition_immunities ?? '')),
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

export function rowToEncounter(row: Row, groups: EncounterCreatureGroup[], playerSettings: EncounterPlayerSetting[], lair: EncounterLair | null): Encounter {
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

export function rowToEncounterGroup(row: Row): EncounterCreatureGroup {
  return {
    id: String(row.id),
    encounterId: String(row.encounter_id),
    templateId: String(row.template_id),
    displayName: String(row.display_name),
    quantity: Number(row.quantity),
    initiativeMode: row.initiative_mode === 'group' ? 'group' : 'individual',
    initiativeAdvantage: Boolean(row.initiative_advantage),
    initiativeDisadvantage: Boolean(row.initiative_disadvantage),
    initiativeOverride: row.initiative_override == null ? null : Number(row.initiative_override),
    hpMode: normalizeHitPointMode(
      row.hp_mode === 'random' || row.hp_mode === 'fixed' ? row.hp_mode : 'average',
      row.hp_override == null ? null : Number(row.hp_override)
    ),
    hpOverride: row.hp_override == null ? null : Number(row.hp_override),
    isAlly: Boolean(row.is_ally),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function rowToEncounterPlayerSetting(row: Row): EncounterPlayerSetting {
  return {
    id: String(row.id),
    encounterId: String(row.encounter_id),
    playerId: String(row.player_id),
    participating: row.participating == null ? true : Boolean(row.participating),
    initiativeAdvantage: Boolean(row.initiative_advantage),
    initiativeDisadvantage: Boolean(row.initiative_disadvantage),
    initiativeOverride: row.initiative_override == null ? null : Number(row.initiative_override),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function rowToEncounterLair(row: Row): EncounterLair {
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

export function toEncounterGroupParams(group: EncounterCreatureGroup): Record<string, unknown> {
  return {
    ...group,
    initiativeAdvantage: group.initiativeAdvantage ? 1 : 0,
    initiativeDisadvantage: group.initiativeDisadvantage ? 1 : 0,
    isAlly: group.isAlly ? 1 : 0
  };
}

export function toEncounterPlayerSettingParams(setting: EncounterPlayerSetting): Record<string, unknown> {
  return {
    ...setting,
    participating: setting.participating ? 1 : 0,
    initiativeAdvantage: setting.initiativeAdvantage ? 1 : 0,
    initiativeDisadvantage: setting.initiativeDisadvantage ? 1 : 0
  };
}

export function toEncounterLairParams(lair: EncounterLair): Record<string, unknown> {
  return {
    ...lair,
    effectsJson: json(lair.effects)
  };
}

export function rollEncounterGroupHitPoints(group: EncounterCreatureGroup, template: CreatureTemplate): number {
  if (group.hpMode === 'fixed' && group.hpOverride != null) return group.hpOverride;
  if (group.hpMode === 'random') return rollHitDiceExpression(template.hitDice, template.hitPoints);
  return template.hitPoints;
}

export function rollPreparedInitiative(modifier: number, advantage: boolean, disadvantage = false): number {
  if (advantage && disadvantage) return rollInitiative(modifier);
  if (advantage) return rollInitiativeWithAdvantage(modifier);
  if (disadvantage) return rollInitiativeWithDisadvantage(modifier);
  return rollInitiative(modifier);
}

/** Преобразует плоскую SQLite-строку в доменную модель и восстанавливает JSON-поля. */
export function rowToCombatant(row: Row): Combatant {
  const storedSnapshot = parseJson<Combatant['snapshot']>(row.snapshot_json, null);
  const snapshot =
    storedSnapshot && 'conditionImmunities' in storedSnapshot
      ? {
          ...storedSnapshot,
          conditionImmunities: normalizeConditionImmunities(storedSnapshot.conditionImmunities)
        }
      : storedSnapshot;

  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    templateId: row.template_id ? String(row.template_id) : null,
    playerId: row.player_id ? String(row.player_id) : null,
    name: String(row.name),
    side: row.side === 'player' ? 'player' : 'npc',
    isAlly: Boolean(row.is_ally),
    armorClass: Number(row.armor_class),
    baseArmorClass: Number(row.base_armor_class ?? row.armor_class),
    maxHp: Number(row.max_hp),
    baseMaxHp: Number(row.base_max_hp ?? row.max_hp),
    currentHp: Number(row.current_hp),
    temporaryHp: Number(row.temporary_hp ?? 0),
    initiative: Number(row.initiative),
    initiativeRoll: row.initiative_roll == null ? Number(row.initiative) - Number(row.initiative_mod) : Number(row.initiative_roll),
    initiativeSwapUsed: Boolean(row.initiative_swap_used),
    initiativeMod: Number(row.initiative_mod),
    initiativeGroupId: row.initiative_group_id ? String(row.initiative_group_id) : null,
    initiativeMode: row.initiative_mode === 'group' ? 'group' : 'individual',
    turnOrder: Number(row.turn_order),
    effects: parseJson<CombatEffect[]>(row.effects_json, []),
    publicNotes: String(row.public_notes ?? ''),
    publicNameVisible: Boolean(row.public_name_visible ?? row.side === 'player'),
    snapshot,
    defeated: Boolean(row.defeated),
    escaped: Boolean(row.escaped),
    visible: Boolean(row.visible)
  };
}

export function hydrateLairCombatant(combatant: Combatant, lair: EncounterLair | null): Combatant {
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

export function toCreatureParams(creature: CreatureTemplate): Record<string, unknown> {
  return {
    ...creature,
    abilitiesJson: json(creature.abilities),
    savingThrowsJson: json(creature.savingThrows),
    traitsJson: json(creature.traits),
    actionsJson: json(creature.actions),
    lairEffectsJson: json(creature.lairEffects)
  };
}

/** Подготавливает только поддерживаемые SQLite-типы; boolean сохраняются как 0/1, объекты как JSON. */
export function toCombatantParams(combatant: Combatant): Record<string, unknown> {
  return {
    ...combatant,
    baseArmorClass: combatant.baseArmorClass ?? combatant.armorClass,
    baseMaxHp: combatant.baseMaxHp ?? combatant.maxHp,
    initiativeRoll: combatant.initiativeRoll ?? combatant.initiative - combatant.initiativeMod,
    initiativeSwapUsed: combatant.initiativeSwapUsed ? 1 : 0,
    effectsJson: json(combatant.effects),
    snapshotJson: combatant.snapshot ? json(combatant.snapshot) : null,
    publicNameVisible: combatant.publicNameVisible ? 1 : 0,
    isAlly: combatant.isAlly ? 1 : 0,
    defeated: combatant.defeated ? 1 : 0,
    escaped: combatant.escaped ? 1 : 0,
    visible: combatant.visible ? 1 : 0
  };
}

/** Безопасно читает исторические JSON-поля и возвращает запасное значение при повреждённых данных. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizePublicDisplaySettings(input: Partial<PublicDisplaySettings>): PublicDisplaySettings {
  return {
    showEnemyArmorClass: input.showEnemyArmorClass ?? DEFAULT_PUBLIC_DISPLAY_SETTINGS.showEnemyArmorClass,
    showEnemySpeeds: input.showEnemySpeeds ?? DEFAULT_PUBLIC_DISPLAY_SETTINGS.showEnemySpeeds,
    hideCreatureNames: input.hideCreatureNames ?? DEFAULT_PUBLIC_DISPLAY_SETTINGS.hideCreatureNames
  };
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function id(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function touchCampaign(database: AppDatabase, campaignId: string): void {
  database.sqlite.prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?').run(now(), campaignId);
}

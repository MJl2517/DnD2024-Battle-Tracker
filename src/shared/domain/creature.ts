import type { Timestamped } from './common';

export interface AbilityBlock {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface SavingThrowBlock {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

export interface CreatureFeature {
  id: string;
  name: string;
  section: string;
  description: string;
  html?: string;
}

export interface SpellCard {
  url: string;
  name: string;
  originalName: string;
  source: string;
  level: string;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  target: string;
  area: string;
  save: string;
  damage: string;
  components: string;
  description: string;
  descriptionHtml: string;
}

export interface CreatureTemplate extends Timestamped {
  id: string;
  campaignId: string;
  name: string;
  originalName: string;
  size: string;
  creatureType: string;
  alignment: string;
  armorClass: number;
  initiativeMod: number;
  initiativeScore: number;
  hitPoints: number;
  hitDice: string;
  speeds: string;
  abilities: AbilityBlock;
  savingThrows: SavingThrowBlock;
  skills: string;
  vulnerabilities: string;
  resistances: string;
  immunities: string;
  conditionImmunities: string;
  senses: string;
  languages: string;
  challengeRating: string;
  xp: number;
  proficiencyBonus: number;
  traits: CreatureFeature[];
  actions: CreatureFeature[];
  imageUrl: string;
  tokenUrl: string;
  lairName: string;
  lairDescription: string;
  lairHtml: string;
  lairEffects: CreatureFeature[];
  sourceUrl: string;
  notes: string;
}

export interface SaveCreatureTemplateInput extends Omit<CreatureTemplate, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
}

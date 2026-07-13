import type { HitPointMode, InitiativeMode, Timestamped } from './common';
import type { CreatureFeature } from './creature';

/** Подготовленная сцена, которая ещё не содержит текущих хитов и результатов инициативы. */
export interface Encounter extends Timestamped {
  id: string;
  campaignId: string;
  name: string;
  notes: string;
  groups: EncounterCreatureGroup[];
  playerSettings: EncounterPlayerSetting[];
  lair: EncounterLair | null;
}

/** Настройки создания одного или нескольких одинаковых NPC при старте боя. */
export interface EncounterCreatureGroup extends Timestamped {
  id: string;
  encounterId: string;
  templateId: string;
  displayName: string;
  quantity: number;
  initiativeMode: InitiativeMode;
  initiativeAdvantage: boolean;
  initiativeDisadvantage: boolean;
  initiativeOverride: number | null;
  hpMode: HitPointMode;
  hpOverride: number | null;
  isAlly: boolean;
}

export interface EncounterPlayerSetting extends Timestamped {
  id: string;
  encounterId: string;
  playerId: string;
  participating: boolean;
  initiativeAdvantage: boolean;
  initiativeDisadvantage: boolean;
  initiativeOverride: number | null;
}

/** Единственное логово энкаунтера; его инициатива закреплена типом и правилами на значении 20. */
export interface EncounterLair extends Timestamped {
  id: string;
  encounterId: string;
  templateId: string | null;
  name: string;
  initiative: 20;
  description: string;
  html: string;
  effects: CreatureFeature[];
}

export interface SaveEncounterInput {
  id?: string;
  campaignId: string;
  name: string;
  notes?: string;
}

export interface SaveEncounterGroupInput {
  id?: string;
  encounterId: string;
  templateId: string;
  displayName?: string;
  quantity: number;
  initiativeMode: InitiativeMode;
  initiativeAdvantage?: boolean;
  initiativeDisadvantage?: boolean;
  initiativeOverride?: number | null;
  hpMode?: HitPointMode;
  hpOverride?: number | null;
  isAlly?: boolean;
}

export interface SaveEncounterPlayerSettingInput {
  encounterId: string;
  playerId: string;
  participating?: boolean;
  initiativeAdvantage?: boolean;
  initiativeDisadvantage?: boolean;
  initiativeOverride?: number | null;
}

export interface SaveEncounterLairInput {
  encounterId: string;
  templateId?: string | null;
  name: string;
  description?: string;
  html?: string;
  effects?: CreatureFeature[];
}

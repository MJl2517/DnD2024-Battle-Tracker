import type { Campaign } from './campaign';
import type { CombatSide, CombatStatus, InitiativeMode } from './common';
import type { CreatureTemplate } from './creature';
import type { Encounter, EncounterLair } from './encounter';
import type { PlayerCharacter } from './player';
import type { PublicDisplaySettings } from './settings';

/** Состояние или пользовательский эффект, сохранённый непосредственно на участнике боя. */
export interface CombatEffect {
  id: string;
  label: string;
  public: boolean;
  statusId?: string;
  timed?: boolean;
  durationRounds?: number;
  remainingRounds?: number;
}

/** Полный снимок активной или завершённой боевой сессии для мастерского интерфейса. */
export interface CombatSession {
  id: string;
  campaignId: string;
  encounterId: string;
  round: number;
  status: CombatStatus;
  activeCombatantId: string | null;
  totalXp: number;
  xpPerPlayer: number;
  xpAllyCount: number;
  startedAt: string;
  endedAt: string | null;
  combatants: Combatant[];
}

/**
 * Конкретный участник боя, отделённый от редактируемого шаблона.
 * `snapshot` фиксирует статблок на момент старта, поэтому дальнейшая правка бестиария не меняет текущий бой.
 */
export interface Combatant {
  id: string;
  sessionId: string;
  templateId: string | null;
  playerId: string | null;
  name: string;
  side: CombatSide;
  isAlly: boolean;
  armorClass: number;
  baseArmorClass: number;
  maxHp: number;
  baseMaxHp: number;
  currentHp: number;
  temporaryHp: number;
  initiative: number;
  initiativeMod: number;
  initiativeGroupId: string | null;
  initiativeMode: InitiativeMode;
  turnOrder: number;
  effects: CombatEffect[];
  publicNotes: string;
  publicNameVisible: boolean;
  snapshot: CreatureTemplate | PlayerCharacter | EncounterLair | null;
  defeated: boolean;
  escaped: boolean;
  visible: boolean;
}

/**
 * Безопасная проекция участника для второго монитора.
 * Хиты NPC здесь отсутствуют; `hpSignal` нужен только для запуска анимации изменения без раскрытия значения.
 */
export interface PublicCombatant {
  id: string;
  name: string;
  side: CombatSide;
  isAlly?: boolean;
  armorClass: number;
  initiative: number;
  turnOrder: number;
  effects: CombatEffect[];
  publicNameVisible: boolean;
  bloodied: boolean;
  defeated: boolean;
  escaped: boolean;
  visible: boolean;
  isCurrent: boolean;
  speeds?: string;
  resistances?: string;
  immunities?: string;
  tokenUrl?: string;
  currentHp?: number;
  maxHp?: number;
  temporaryHp?: number;
  hpSignal?: number;
}

export interface PublicFeatureCard {
  id: string;
  sourceName: string;
  sourceType: 'creature' | 'lair';
  featureName: string;
  section: string;
  description: string;
  html?: string;
  imageUrl?: string;
  tokenUrl?: string;
}

/** Единственный пакет данных, который публичное окно может получить от main-процесса. */
export interface PublicCombatView {
  round: number;
  combatants: PublicCombatant[];
  settings: PublicDisplaySettings;
  featureCard?: PublicFeatureCard | null;
  xpAward?: CombatXpAward | null;
}

export interface CampaignDetail {
  campaign: Campaign;
  players: PlayerCharacter[];
  creatures: CreatureTemplate[];
  encounters: Encounter[];
  activeSession: CombatSession | null;
}

/** Разрешённые частичные изменения участника; все ограничения применяются повторно в main-процессе. */
export interface CombatantPatch {
  armorClass?: number;
  maxHp?: number;
  currentHp?: number;
  temporaryHp?: number;
  initiative?: number;
  turnOrder?: number;
  effects?: CombatEffect[];
  publicNotes?: string;
  publicNameVisible?: boolean;
  defeated?: boolean;
  escaped?: boolean;
  visible?: boolean;
}

export type EscapedXpMode = 'none' | 'full' | 'half';

/** Выбор мастера для расчёта опыта перед окончательным завершением боя. */
export interface CompleteCombatOptions {
  defeatedGiveXp: boolean;
  escapedXpMode: EscapedXpMode;
  customXpPool?: number;
  xpAdjustment?: number;
  shareXpWithAllies?: boolean;
  xpAllyIds?: string[];
}

export interface CombatXpAward {
  totalXp: number;
  xpPerPlayer: number;
  playerCount: number;
  allyRecipientCount: number;
  recipientCount: number;
  defeatedNpcCount: number;
  escapedNpcCount: number;
  customPool: boolean;
  xpAdjustment: number;
}

export interface CompleteCombatResult {
  session: CombatSession;
  defeatedNpcCount: number;
  escapedNpcCount: number;
  activePlayerCount: number;
  xpAward: CombatXpAward;
}

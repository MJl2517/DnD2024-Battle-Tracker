import type { Campaign, CreateCampaignInput } from '../domain/campaign';
import type {
  AddCombatantsToCombatInput,
  CampaignDetail,
  CombatInitiativeEntry,
  CombatantPatch,
  CombatSession,
  CompleteCombatOptions,
  CompleteCombatResult,
  PublicCombatView,
  PublicFeatureCard
} from '../domain/combat';
import type { CreatureTemplate, SaveCreatureTemplateInput, SpellCard } from '../domain/creature';
import type {
  Encounter,
  EncounterCreatureGroup,
  EncounterLair,
  EncounterPlayerSetting,
  SaveEncounterGroupInput,
  SaveEncounterInput,
  SaveEncounterLairInput,
  SaveEncounterPlayerSettingInput
} from '../domain/encounter';
import type { PlayerCharacter, SavePlayerInput } from '../domain/player';
import type { PublicDisplaySettings } from '../domain/settings';
import type { AppUpdateStatus } from '../domain/update';

/**
 * Стабильный API, который preload безопасно публикует в renderer как window.dndTracker.
 * При добавлении метода нужно одновременно зарегистрировать канал, main-обработчик и preload-вызов;
 * соответствие этих трёх частей контролируется контрактным тестом.
 */
export interface TrackerApi {
  listCampaigns: () => Promise<Campaign[]>;
  createCampaign: (input: CreateCampaignInput) => Promise<Campaign>;
  deleteCampaign: (id: string) => Promise<void>;
  getCampaignDetail: (campaignId: string) => Promise<CampaignDetail>;
  savePlayer: (input: SavePlayerInput) => Promise<PlayerCharacter>;
  deletePlayer: (id: string) => Promise<void>;
  importRuleholderCreature: (campaignId: string, url: string) => Promise<CreatureTemplate>;
  fetchRuleholderSpell: (href: string) => Promise<SpellCard>;
  saveCreature: (input: SaveCreatureTemplateInput) => Promise<CreatureTemplate>;
  deleteCreature: (id: string) => Promise<void>;
  saveEncounter: (input: SaveEncounterInput) => Promise<Encounter>;
  deleteEncounter: (id: string) => Promise<void>;
  saveEncounterGroup: (input: SaveEncounterGroupInput) => Promise<EncounterCreatureGroup>;
  deleteEncounterGroup: (id: string) => Promise<void>;
  saveEncounterPlayerSetting: (input: SaveEncounterPlayerSettingInput) => Promise<EncounterPlayerSetting>;
  saveEncounterLair: (input: SaveEncounterLairInput) => Promise<EncounterLair>;
  deleteEncounterLair: (encounterId: string) => Promise<void>;
  startCombat: (encounterId: string) => Promise<CombatSession>;
  prepareCombat: (encounterId: string) => Promise<CombatSession>;
  confirmCombatInitiative: (sessionId: string, entries: CombatInitiativeEntry[]) => Promise<CombatSession>;
  beginInitiativeExchange: (sessionId: string, sourceCombatantId: string, entries: CombatInitiativeEntry[]) => Promise<CombatSession>;
  swapCombatInitiative: (sessionId: string, sourceCombatantId: string, targetCombatantId: string) => Promise<CombatSession>;
  cancelInitiativeExchange: (sessionId: string) => Promise<CombatSession>;
  onCombatPreparation: (callback: (session: CombatSession | null) => void) => () => void;
  cancelCombatPreparation: (sessionId: string) => Promise<void>;
  addCombatantsToCombat: (input: AddCombatantsToCombatInput) => Promise<CombatSession>;
  getCombatSession: (sessionId: string) => Promise<CombatSession>;
  updateCombatant: (id: string, patch: CombatantPatch) => Promise<CombatSession>;
  reorderCombatants: (sessionId: string, orderedIds: string[]) => Promise<CombatSession>;
  setActiveCombatant: (sessionId: string, combatantId: string) => Promise<CombatSession>;
  advanceTurn: (sessionId: string) => Promise<CombatSession>;
  retreatTurn: (sessionId: string) => Promise<CombatSession>;
  endRound: (sessionId: string) => Promise<CombatSession>;
  advanceRound: (sessionId: string) => Promise<CombatSession>;
  retreatRound: (sessionId: string) => Promise<CombatSession>;
  completeCombat: (sessionId: string, options: CompleteCombatOptions) => Promise<CompleteCombatResult>;
  dismissCombatXpAward?: (sessionId: string) => Promise<void>;
  showPublicFeatureCard: (campaignId: string, card: PublicFeatureCard) => Promise<void>;
  dismissPublicFeatureCard: (campaignId: string) => Promise<void>;
  openPlayerWindow: (campaignId: string) => Promise<void>;
  getPlayerView: (campaignId: string) => Promise<PublicCombatView>;
  onPlayerView: (callback: (view: PublicCombatView) => void) => () => void;
  getPublicDisplaySettings: () => Promise<PublicDisplaySettings>;
  savePublicDisplaySettings: (settings: PublicDisplaySettings) => Promise<PublicDisplaySettings>;
  getUpdateStatus: () => Promise<AppUpdateStatus>;
  checkForUpdates: () => Promise<AppUpdateStatus>;
  downloadUpdate: () => Promise<AppUpdateStatus>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void;
}

export type InitiativeMode = 'individual' | 'group';
export type CombatSide = 'player' | 'npc';
export type CombatStatus = 'active' | 'completed';
export type HitPointMode = 'average' | 'fixed' | 'random';

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface Campaign extends Timestamped {
  id: string;
  name: string;
  notes: string;
}

export interface PlayerCharacter extends Timestamped {
  id: string;
  campaignId: string;
  name: string;
  level: number;
  armorClass: number;
  maxHp: number;
  initiativeMod: number;
  passivePerception: number;
  active: boolean;
  imageUrl: string;
  notes: string;
}

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

export interface Encounter extends Timestamped {
  id: string;
  campaignId: string;
  name: string;
  notes: string;
  groups: EncounterCreatureGroup[];
  playerSettings: EncounterPlayerSetting[];
  lair: EncounterLair | null;
}

export interface EncounterCreatureGroup extends Timestamped {
  id: string;
  encounterId: string;
  templateId: string;
  displayName: string;
  quantity: number;
  initiativeMode: InitiativeMode;
  initiativeAdvantage: boolean;
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
  initiativeOverride: number | null;
}

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

export interface CombatEffect {
  id: string;
  label: string;
  public: boolean;
  statusId?: string;
  timed?: boolean;
  durationRounds?: number;
  remainingRounds?: number;
}

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

export interface PublicDisplaySettings {
  showEnemyArmorClass: boolean;
  showEnemySpeeds: boolean;
  hideCreatureNames: boolean;
}

export const DEFAULT_PUBLIC_DISPLAY_SETTINGS: PublicDisplaySettings = {
  showEnemyArmorClass: true,
  showEnemySpeeds: true,
  hideCreatureNames: false
};

export interface PublicCombatView {
  round: number;
  combatants: PublicCombatant[];
  settings: PublicDisplaySettings;
  featureCard?: PublicFeatureCard | null;
  xpAward?: CombatXpAward | null;
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

export interface CampaignDetail {
  campaign: Campaign;
  players: PlayerCharacter[];
  creatures: CreatureTemplate[];
  encounters: Encounter[];
  activeSession: CombatSession | null;
}

export interface CreateCampaignInput {
  name: string;
  notes?: string;
}

export interface SavePlayerInput {
  id?: string;
  campaignId: string;
  name: string;
  level: number;
  armorClass: number;
  maxHp: number;
  initiativeMod: number;
  passivePerception: number;
  active: boolean;
  imageUrl?: string;
  notes?: string;
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

export interface SaveCreatureTemplateInput extends Omit<CreatureTemplate, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
}

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

export type UpdateStatusKind = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface AppUpdateStatus {
  status: UpdateStatusKind;
  currentVersion: string;
  version?: string;
  releaseName?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  canInstall?: boolean;
  releaseUrl?: string;
  message?: string;
}

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

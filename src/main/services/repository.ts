import type { AppDatabase } from './db';
import { ImportService } from '../importers/importService';
import { CampaignRepository } from '../repositories/campaignRepository';
import { CombatRepository } from '../repositories/combatRepository';
import { CreatureRepository } from '../repositories/creatureRepository';
import { EncounterRepository } from '../repositories/encounterRepository';
import { PlayerRepository } from '../repositories/playerRepository';
import type {
  Campaign,
  CampaignDetail,
  CombatSession,
  CombatantPatch,
  CompleteCombatOptions,
  CompleteCombatResult,
  CreatureTemplate,
  Encounter,
  EncounterCreatureGroup,
  EncounterLair,
  EncounterPlayerSetting,
  PlayerCharacter,
  PublicCombatView,
  PublicDisplaySettings,
  PublicFeatureCard,
  SaveCreatureTemplateInput,
  SaveEncounterGroupInput,
  SaveEncounterInput,
  SaveEncounterLairInput,
  SaveEncounterPlayerSettingInput,
  SavePlayerInput,
  SpellCard
} from '@shared/types';

/**
 * Совместимый фасад слоя данных для IPC.
 * Он не содержит SQL и правил игры: каждый вызов передаётся специализированному репозиторию или сервису.
 */
export class TrackerRepository {
  private readonly campaigns: CampaignRepository;
  private readonly combat: CombatRepository;
  private readonly creatures: CreatureRepository;
  private readonly encounters: EncounterRepository;
  private readonly players: PlayerRepository;
  private readonly importer = new ImportService();

  constructor(database: AppDatabase) {
    this.campaigns = new CampaignRepository(database);
    this.creatures = new CreatureRepository(database);
    this.encounters = new EncounterRepository(database, this.creatures);
    this.players = new PlayerRepository(database);
    this.combat = new CombatRepository(database);
  }

  listCampaigns(): Campaign[] {
    return this.campaigns.list();
  }

  createCampaign(input: { name: string; notes?: string }): Campaign {
    return this.campaigns.create(input);
  }

  deleteCampaign(id: string): void {
    this.campaigns.delete(id);
  }

  getCampaignDetail(campaignId: string): CampaignDetail {
    return this.combat.getCampaignDetail(campaignId);
  }

  savePlayer(input: SavePlayerInput): PlayerCharacter {
    return this.players.save(input);
  }

  deletePlayer(id: string): void {
    this.players.delete(id);
  }

  async importRuleholderCreature(campaignId: string, url: string): Promise<CreatureTemplate> {
    const parsed = await this.importer.importCreature(url);
    return this.creatures.saveCreature({ ...parsed, campaignId });
  }

  fetchRuleholderSpell(href: string): Promise<SpellCard> {
    return this.importer.importSpell(href);
  }

  saveCreature(input: SaveCreatureTemplateInput): CreatureTemplate {
    return this.creatures.saveCreature(input);
  }

  deleteCreature(id: string): void {
    this.creatures.deleteCreature(id);
  }

  saveEncounter(input: SaveEncounterInput): Encounter {
    return this.encounters.saveEncounter(input);
  }

  deleteEncounter(id: string): void {
    this.encounters.deleteEncounter(id);
  }

  saveEncounterGroup(input: SaveEncounterGroupInput): EncounterCreatureGroup {
    return this.encounters.saveEncounterGroup(input);
  }

  deleteEncounterGroup(id: string): void {
    this.encounters.deleteEncounterGroup(id);
  }

  saveEncounterPlayerSetting(input: SaveEncounterPlayerSettingInput): EncounterPlayerSetting {
    return this.encounters.saveEncounterPlayerSetting(input);
  }

  saveEncounterLair(input: SaveEncounterLairInput): EncounterLair {
    return this.encounters.saveEncounterLair(input);
  }

  deleteEncounterLair(encounterId: string): void {
    this.encounters.deleteEncounterLair(encounterId);
  }

  startCombat(encounterId: string): CombatSession {
    return this.combat.startCombat(encounterId);
  }

  getCombatSession(sessionId: string): CombatSession {
    return this.combat.getCombatSession(sessionId);
  }

  updateCombatant(id: string, patch: CombatantPatch): CombatSession {
    return this.combat.updateCombatant(id, patch);
  }

  reorderCombatants(sessionId: string, orderedIds: string[]): CombatSession {
    return this.combat.reorderCombatants(sessionId, orderedIds);
  }

  setActiveCombatant(sessionId: string, combatantId: string): CombatSession {
    return this.combat.setActiveCombatant(sessionId, combatantId);
  }

  advanceTurn(sessionId: string): CombatSession {
    return this.combat.advanceTurn(sessionId);
  }

  retreatTurn(sessionId: string): CombatSession {
    return this.combat.retreatTurn(sessionId);
  }

  endRound(sessionId: string): CombatSession {
    return this.combat.endRound(sessionId);
  }

  advanceRound(sessionId: string): CombatSession {
    return this.combat.advanceRound(sessionId);
  }

  retreatRound(sessionId: string): CombatSession {
    return this.combat.retreatRound(sessionId);
  }

  completeCombat(sessionId: string, options?: CompleteCombatOptions): CompleteCombatResult {
    return this.combat.completeCombat(sessionId, options);
  }

  getPlayerView(campaignId: string): PublicCombatView {
    return this.combat.getPlayerView(campaignId);
  }

  showPublicFeatureCard(campaignId: string, card: PublicFeatureCard): void {
    this.combat.showPublicFeatureCard(campaignId, card);
  }

  dismissPublicFeatureCard(campaignId: string): void {
    this.combat.dismissPublicFeatureCard(campaignId);
  }

  dismissCombatXpAward(sessionId: string): string {
    return this.combat.dismissCombatXpAward(sessionId);
  }

  getPublicDisplaySettings(): PublicDisplaySettings {
    return this.combat.getPublicDisplaySettings();
  }

  savePublicDisplaySettings(input: PublicDisplaySettings): PublicDisplaySettings {
    return this.combat.savePublicDisplaySettings(input);
  }
}

import { contextBridge, ipcRenderer } from 'electron';
import type {
  CombatantPatch,
  CompleteCombatOptions,
  CreateCampaignInput,
  PublicFeatureCard,
  PublicCombatView,
  SaveCreatureTemplateInput,
  SaveEncounterGroupInput,
  SaveEncounterInput,
  SaveEncounterLairInput,
  SaveEncounterPlayerSettingInput,
  SavePlayerInput,
  TrackerApi
} from '@shared/types';

const api: TrackerApi = {
  listCampaigns: () => ipcRenderer.invoke('campaign:list'),
  createCampaign: (input: CreateCampaignInput) => ipcRenderer.invoke('campaign:create', input),
  deleteCampaign: (id: string) => ipcRenderer.invoke('campaign:delete', id),
  getCampaignDetail: (campaignId: string) => ipcRenderer.invoke('campaign:detail', campaignId),
  savePlayer: (input: SavePlayerInput) => ipcRenderer.invoke('player:save', input),
  deletePlayer: (id: string) => ipcRenderer.invoke('player:delete', id),
  importRuleholderCreature: (campaignId: string, url: string) => ipcRenderer.invoke('creature:import-ruleholder', campaignId, url),
  fetchRuleholderSpell: (href: string) => ipcRenderer.invoke('spell:fetch-ruleholder', href),
  saveCreature: (input: SaveCreatureTemplateInput) => ipcRenderer.invoke('creature:save', input),
  deleteCreature: (id: string) => ipcRenderer.invoke('creature:delete', id),
  saveEncounter: (input: SaveEncounterInput) => ipcRenderer.invoke('encounter:save', input),
  deleteEncounter: (id: string) => ipcRenderer.invoke('encounter:delete', id),
  saveEncounterGroup: (input: SaveEncounterGroupInput) => ipcRenderer.invoke('encounter-group:save', input),
  deleteEncounterGroup: (id: string) => ipcRenderer.invoke('encounter-group:delete', id),
  saveEncounterPlayerSetting: (input: SaveEncounterPlayerSettingInput) => ipcRenderer.invoke('encounter-player:save', input),
  saveEncounterLair: (input: SaveEncounterLairInput) => ipcRenderer.invoke('encounter-lair:save', input),
  deleteEncounterLair: (encounterId: string) => ipcRenderer.invoke('encounter-lair:delete', encounterId),
  startCombat: (encounterId: string) => ipcRenderer.invoke('combat:start', encounterId),
  getCombatSession: (sessionId: string) => ipcRenderer.invoke('combat:get', sessionId),
  updateCombatant: (id: string, patch: CombatantPatch) => ipcRenderer.invoke('combatant:update', id, patch),
  reorderCombatants: (sessionId: string, orderedIds: string[]) => ipcRenderer.invoke('combatant:reorder', sessionId, orderedIds),
  setActiveCombatant: (sessionId: string, combatantId: string) => ipcRenderer.invoke('combatant:set-active', sessionId, combatantId),
  advanceTurn: (sessionId: string) => ipcRenderer.invoke('combat:advance-turn', sessionId),
  retreatTurn: (sessionId: string) => ipcRenderer.invoke('combat:retreat-turn', sessionId),
  endRound: (sessionId: string) => ipcRenderer.invoke('combat:end-round', sessionId),
  advanceRound: (sessionId: string) => ipcRenderer.invoke('combat:advance-round', sessionId),
  retreatRound: (sessionId: string) => ipcRenderer.invoke('combat:retreat-round', sessionId),
  completeCombat: (sessionId: string, options: CompleteCombatOptions) => ipcRenderer.invoke('combat:complete', sessionId, options),
  dismissCombatXpAward: (sessionId: string) => ipcRenderer.invoke('combat:dismiss-xp-award', sessionId),
  showPublicFeatureCard: (campaignId: string, card: PublicFeatureCard) => ipcRenderer.invoke('player-window:show-feature-card', campaignId, card),
  dismissPublicFeatureCard: (campaignId: string) => ipcRenderer.invoke('player-window:dismiss-feature-card', campaignId),
  openPlayerWindow: (campaignId: string) => ipcRenderer.invoke('player-window:open', campaignId),
  getPlayerView: (campaignId: string) => ipcRenderer.invoke('player-window:view', campaignId),
  onPlayerView: (callback: (view: PublicCombatView) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, view: PublicCombatView): void => callback(view);
    ipcRenderer.on('player:view', listener);
    return () => ipcRenderer.removeListener('player:view', listener);
  }
};

contextBridge.exposeInMainWorld('dndTracker', api);

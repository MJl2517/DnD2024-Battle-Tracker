import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type {
  AddCombatantsToCombatInput,
  AppUpdateStatus,
  CombatInitiativeEntry,
  CombatantPatch,
  CompleteCombatOptions,
  CreateCampaignInput,
  PublicDisplaySettings,
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
  listCampaigns: () => ipcRenderer.invoke(IPC_CHANNELS.campaign.list),
  createCampaign: (input: CreateCampaignInput) => ipcRenderer.invoke(IPC_CHANNELS.campaign.create, input),
  deleteCampaign: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.campaign.delete, id),
  getCampaignDetail: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.campaign.detail, campaignId),
  savePlayer: (input: SavePlayerInput) => ipcRenderer.invoke(IPC_CHANNELS.player.save, input),
  deletePlayer: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.player.delete, id),
  importRuleholderCreature: (campaignId: string, url: string) => ipcRenderer.invoke(IPC_CHANNELS.creature.import, campaignId, url),
  fetchRuleholderSpell: (href: string) => ipcRenderer.invoke(IPC_CHANNELS.creature.fetchSpell, href),
  saveCreature: (input: SaveCreatureTemplateInput) => ipcRenderer.invoke(IPC_CHANNELS.creature.save, input),
  deleteCreature: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.creature.delete, id),
  saveEncounter: (input: SaveEncounterInput) => ipcRenderer.invoke(IPC_CHANNELS.encounter.save, input),
  deleteEncounter: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.encounter.delete, id),
  saveEncounterGroup: (input: SaveEncounterGroupInput) => ipcRenderer.invoke(IPC_CHANNELS.encounter.saveGroup, input),
  deleteEncounterGroup: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.encounter.deleteGroup, id),
  saveEncounterPlayerSetting: (input: SaveEncounterPlayerSettingInput) => ipcRenderer.invoke(IPC_CHANNELS.encounter.savePlayer, input),
  saveEncounterLair: (input: SaveEncounterLairInput) => ipcRenderer.invoke(IPC_CHANNELS.encounter.saveLair, input),
  deleteEncounterLair: (encounterId: string) => ipcRenderer.invoke(IPC_CHANNELS.encounter.deleteLair, encounterId),
  startCombat: (encounterId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.start, encounterId),
  prepareCombat: (encounterId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.prepare, encounterId),
  confirmCombatInitiative: (sessionId: string, entries: CombatInitiativeEntry[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.combat.confirmInitiative, sessionId, entries),
  beginInitiativeExchange: (sessionId: string, sourceCombatantId: string, entries: CombatInitiativeEntry[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.combat.beginInitiativeExchange, sessionId, sourceCombatantId, entries),
  swapCombatInitiative: (sessionId: string, sourceCombatantId: string, targetCombatantId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.combat.swapInitiative, sessionId, sourceCombatantId, targetCombatantId),
  cancelInitiativeExchange: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.cancelInitiativeExchange, sessionId),
  onCombatPreparation: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, session: import('@shared/types').CombatSession | null): void => callback(session);
    ipcRenderer.on(IPC_CHANNELS.combat.preparationEvent, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.combat.preparationEvent, listener);
  },
  cancelCombatPreparation: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.cancelPreparation, sessionId),
  addCombatantsToCombat: (input: AddCombatantsToCombatInput) => ipcRenderer.invoke(IPC_CHANNELS.combat.addCombatants, input),
  getCombatSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.get, sessionId),
  updateCombatant: (id: string, patch: CombatantPatch) => ipcRenderer.invoke(IPC_CHANNELS.combat.updateCombatant, id, patch),
  reorderCombatants: (sessionId: string, orderedIds: string[]) => ipcRenderer.invoke(IPC_CHANNELS.combat.reorderCombatants, sessionId, orderedIds),
  setActiveCombatant: (sessionId: string, combatantId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.setActiveCombatant, sessionId, combatantId),
  advanceTurn: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.advanceTurn, sessionId),
  retreatTurn: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.retreatTurn, sessionId),
  endRound: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.endRound, sessionId),
  advanceRound: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.advanceRound, sessionId),
  retreatRound: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.retreatRound, sessionId),
  completeCombat: (sessionId: string, options: CompleteCombatOptions) => ipcRenderer.invoke(IPC_CHANNELS.combat.complete, sessionId, options),
  dismissCombatXpAward: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.combat.dismissXpAward, sessionId),
  showPublicFeatureCard: (campaignId: string, card: PublicFeatureCard) => ipcRenderer.invoke(IPC_CHANNELS.playerWindow.showFeatureCard, campaignId, card),
  dismissPublicFeatureCard: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.playerWindow.dismissFeatureCard, campaignId),
  openPlayerWindow: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.playerWindow.open, campaignId),
  getPlayerView: (campaignId: string) => ipcRenderer.invoke(IPC_CHANNELS.playerWindow.view, campaignId),
  getPublicDisplaySettings: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getPublicDisplay),
  savePublicDisplaySettings: (settings: PublicDisplaySettings) => ipcRenderer.invoke(IPC_CHANNELS.settings.savePublicDisplay, settings),
  onPlayerView: (callback: (view: PublicCombatView) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, view: PublicCombatView): void => callback(view);
    ipcRenderer.on(IPC_CHANNELS.playerWindow.viewEvent, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.playerWindow.viewEvent, listener);
  },
  getUpdateStatus: () => ipcRenderer.invoke(IPC_CHANNELS.update.getStatus),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.update.check),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.update.download),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.update.install),
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus): void => callback(status);
    ipcRenderer.on(IPC_CHANNELS.update.statusEvent, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.update.statusEvent, listener);
  }
};

contextBridge.exposeInMainWorld('dndTracker', api);

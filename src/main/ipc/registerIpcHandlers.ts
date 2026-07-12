import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type {
  CombatantPatch,
  CompleteCombatOptions,
  CreateCampaignInput,
  PublicDisplaySettings,
  PublicFeatureCard,
  SaveCreatureTemplateInput,
  SaveEncounterGroupInput,
  SaveEncounterInput,
  SaveEncounterLairInput,
  SaveEncounterPlayerSettingInput,
  SavePlayerInput
} from '@shared/types';
import type { TrackerRepository } from '../services/repository';
import type { AppUpdater } from '../update/appUpdater';
import type { WindowManager } from '../windows/windowManager';

type IpcDependencies = { repository: TrackerRepository; updater: AppUpdater; windows: WindowManager };

function handle<TArgs extends unknown[], TResult>(channel: string, handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult | Promise<TResult>): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      return await handler(event, ...(args as TArgs));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
    }
  });
}

/**
 * Регистрирует все IPC-команды из общего реестра каналов.
 * После команд, меняющих бой, свежая публичная модель сразу отправляется второму окну.
 */
export function registerIpcHandlers({ repository, updater, windows }: IpcDependencies): void {
  const broadcast = (campaignId: string): void => windows.broadcastPlayerView(repository.getPlayerView(campaignId));

  handle(IPC_CHANNELS.update.getStatus, () => updater.getStatus());
  handle(IPC_CHANNELS.update.check, () => updater.check());
  handle(IPC_CHANNELS.update.download, () => updater.download());
  handle(IPC_CHANNELS.update.install, () => updater.install());

  handle(IPC_CHANNELS.settings.getPublicDisplay, () => repository.getPublicDisplaySettings());
  handle(IPC_CHANNELS.settings.savePublicDisplay, (_event, input: PublicDisplaySettings) => {
    const settings = repository.savePublicDisplaySettings(input);
    const campaignId = windows.getPlayerWindowCampaignId();
    if (campaignId) broadcast(campaignId);
    return settings;
  });

  handle(IPC_CHANNELS.campaign.list, () => repository.listCampaigns());
  handle(IPC_CHANNELS.campaign.create, (_event, input: CreateCampaignInput) => repository.createCampaign(input));
  handle(IPC_CHANNELS.campaign.delete, (_event, id: string) => repository.deleteCampaign(id));
  handle(IPC_CHANNELS.campaign.detail, (_event, campaignId: string) => repository.getCampaignDetail(campaignId));

  handle(IPC_CHANNELS.player.save, (_event, input: SavePlayerInput) => {
    const player = repository.savePlayer(input);
    broadcast(player.campaignId);
    return player;
  });
  handle(IPC_CHANNELS.player.delete, (_event, id: string) => repository.deletePlayer(id));

  handle(IPC_CHANNELS.creature.import, (_event, campaignId: string, url: string) => repository.importRuleholderCreature(campaignId, url));
  handle(IPC_CHANNELS.creature.fetchSpell, (_event, href: string) => repository.fetchRuleholderSpell(href));
  handle(IPC_CHANNELS.creature.save, (_event, input: SaveCreatureTemplateInput) => repository.saveCreature(input));
  handle(IPC_CHANNELS.creature.delete, (_event, id: string) => repository.deleteCreature(id));

  handle(IPC_CHANNELS.encounter.save, (_event, input: SaveEncounterInput) => repository.saveEncounter(input));
  handle(IPC_CHANNELS.encounter.delete, (_event, id: string) => repository.deleteEncounter(id));
  handle(IPC_CHANNELS.encounter.saveGroup, (_event, input: SaveEncounterGroupInput) => repository.saveEncounterGroup(input));
  handle(IPC_CHANNELS.encounter.deleteGroup, (_event, id: string) => repository.deleteEncounterGroup(id));
  handle(IPC_CHANNELS.encounter.savePlayer, (_event, input: SaveEncounterPlayerSettingInput) => repository.saveEncounterPlayerSetting(input));
  handle(IPC_CHANNELS.encounter.saveLair, (_event, input: SaveEncounterLairInput) => repository.saveEncounterLair(input));
  handle(IPC_CHANNELS.encounter.deleteLair, (_event, encounterId: string) => repository.deleteEncounterLair(encounterId));

  handle(IPC_CHANNELS.combat.start, (_event, encounterId: string) => withBroadcast(repository.startCombat(encounterId), broadcast));
  handle(IPC_CHANNELS.combat.get, (_event, sessionId: string) => repository.getCombatSession(sessionId));
  handle(IPC_CHANNELS.combat.updateCombatant, (_event, id: string, patch: CombatantPatch) => withBroadcast(repository.updateCombatant(id, patch), broadcast));
  handle(IPC_CHANNELS.combat.reorderCombatants, (_event, sessionId: string, ids: string[]) =>
    withBroadcast(repository.reorderCombatants(sessionId, ids), broadcast)
  );
  handle(IPC_CHANNELS.combat.setActiveCombatant, (_event, sessionId: string, id: string) =>
    withBroadcast(repository.setActiveCombatant(sessionId, id), broadcast)
  );
  handle(IPC_CHANNELS.combat.advanceTurn, (_event, sessionId: string) => withBroadcast(repository.advanceTurn(sessionId), broadcast));
  handle(IPC_CHANNELS.combat.retreatTurn, (_event, sessionId: string) => withBroadcast(repository.retreatTurn(sessionId), broadcast));
  handle(IPC_CHANNELS.combat.endRound, (_event, sessionId: string) => withBroadcast(repository.endRound(sessionId), broadcast));
  handle(IPC_CHANNELS.combat.advanceRound, (_event, sessionId: string) => withBroadcast(repository.advanceRound(sessionId), broadcast));
  handle(IPC_CHANNELS.combat.retreatRound, (_event, sessionId: string) => withBroadcast(repository.retreatRound(sessionId), broadcast));
  handle(IPC_CHANNELS.combat.complete, (_event, sessionId: string, options: CompleteCombatOptions) => {
    const result = repository.completeCombat(sessionId, options);
    broadcast(result.session.campaignId);
    return result;
  });
  handle(IPC_CHANNELS.combat.dismissXpAward, (_event, sessionId: string) => broadcast(repository.dismissCombatXpAward(sessionId)));

  handle(IPC_CHANNELS.playerWindow.open, (_event, campaignId: string) => {
    windows.openPlayerWindow(campaignId);
    setTimeout(() => broadcast(campaignId), 200);
  });
  handle(IPC_CHANNELS.playerWindow.view, (_event, campaignId: string) => repository.getPlayerView(campaignId));
  handle(IPC_CHANNELS.playerWindow.showFeatureCard, (_event, campaignId: string, card: PublicFeatureCard) => {
    repository.showPublicFeatureCard(campaignId, card);
    broadcast(campaignId);
  });
  handle(IPC_CHANNELS.playerWindow.dismissFeatureCard, (_event, campaignId: string) => {
    repository.dismissPublicFeatureCard(campaignId);
    broadcast(campaignId);
  });
}

function withBroadcast<T extends { campaignId: string }>(value: T, broadcast: (campaignId: string) => void): T {
  broadcast(value.campaignId);
  return value;
}

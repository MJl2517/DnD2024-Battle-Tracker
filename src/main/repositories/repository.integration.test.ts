import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppDatabase } from '../services/db';
import { openAppDatabase, openMemoryDatabase } from '../services/db';
import { TrackerRepository } from '../services/repository';
import { INCAPACITATED_STATUS_ID, PRONE_STATUS_ID, UNCONSCIOUS_STATUS_ID } from '@shared/statusEffects';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS } from '@shared/types';

let database: AppDatabase | null = null;
let temporaryDirectory = '';

afterEach(() => {
  database?.sqlite.close();
  database = null;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = '';
});

describe('TrackerRepository integration', () => {
  it('persists a campaign and runs an encounter through combat completion', () => {
    database = openMemoryDatabase();
    const repository = new TrackerRepository(database);
    const campaign = repository.createCampaign({ name: 'Integration campaign' });
    const player = repository.savePlayer({
      campaignId: campaign.id,
      name: 'Hero',
      level: 3,
      armorClass: 16,
      maxHp: 28,
      initiativeMod: 2,
      passivePerception: 13,
      active: true
    });
    const creature = repository.saveCreature(creatureInput(campaign.id));
    const encounter = repository.saveEncounter({ campaignId: campaign.id, name: 'Test encounter' });
    const playerSetting = repository.saveEncounterPlayerSetting({
      encounterId: encounter.id,
      playerId: player.id,
      participating: true,
      initiativeAdvantage: true,
      initiativeDisadvantage: true
    });
    const creatureGroup = repository.saveEncounterGroup({
      encounterId: encounter.id,
      templateId: creature.id,
      quantity: 1,
      initiativeMode: 'individual',
      initiativeAdvantage: true,
      initiativeDisadvantage: true
    });
    expect(playerSetting).toMatchObject({ initiativeAdvantage: false, initiativeDisadvantage: true });
    expect(creatureGroup).toMatchObject({ initiativeAdvantage: false, initiativeDisadvantage: true });

    const preparation = repository.prepareCombat(encounter.id);
    expect(preparation.status).toBe('preparing');
    expect(preparation.combatants.map((combatant) => combatant.name).sort()).toEqual(['Hero', 'Training dummy']);
    expect(repository.getCampaignDetail(campaign.id).activeSession).toBeNull();
    expect(repository.getPlayerView(campaign.id).combatants).toEqual([]);

    const hero = preparation.combatants.find((combatant) => combatant.playerId === player.id)!;
    const enemyBeforeStart = preparation.combatants.find((combatant) => combatant.templateId === creature.id)!;
    const session = repository.confirmCombatInitiative(preparation.id, [
      { combatantId: hero.id, initiative: 12 },
      { combatantId: enemyBeforeStart.id, initiative: 18 }
    ]);
    expect(session.status).toBe('active');
    expect(session.combatants[0].id).toBe(enemyBeforeStart.id);
    expect(repository.getPlayerView(campaign.id).combatants).toHaveLength(2);

    const withReinforcements = repository.addCombatantsToCombat({
      sessionId: session.id,
      groups: [
        {
          templateId: creature.id,
          quantity: 2,
          initiativeRoll: 20,
          initiativeBonus: 3,
          initiativeAdvantage: true,
          hpMode: 'fixed',
          hpOverride: 17
        }
      ]
    });
    const reinforcements = withReinforcements.combatants.filter((combatant) => combatant.templateId === creature.id && combatant.id !== enemyBeforeStart.id);
    expect(reinforcements).toHaveLength(2);
    expect(reinforcements.every((combatant) => combatant.initiative === 23 && combatant.initiativeMod === 3)).toBe(true);
    expect(reinforcements.every((combatant) => combatant.maxHp === 17 && combatant.currentHp === 17)).toBe(true);
    expect(withReinforcements.activeCombatantId).toBe(session.activeCombatantId);

    const enemy = session.combatants.find((combatant) => combatant.templateId === creature.id);
    expect(enemy).toBeDefined();
    const completed = repository.completeCombat(repository.updateCombatant(enemy!.id, { defeated: true, currentHp: 0 }).id, {
      defeatedGiveXp: true,
      escapedXpMode: 'none'
    });

    expect(completed.xpAward.totalXp).toBe(50);
    expect(completed.xpAward.xpPerPlayer).toBe(50);
    expect(repository.getCampaignDetail(campaign.id).activeSession).toBeNull();
  });

  it('creates the expected schema without requiring a user database', () => {
    database = openMemoryDatabase();
    const tables = database.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(['campaigns', 'player_characters', 'creature_templates', 'encounters', 'combat_sessions', 'combatants'])
    );
  });

  it('synchronizes and resets the turn timer only when turn timing changes', () => {
    database = openMemoryDatabase();
    const repository = new TrackerRepository(database);
    repository.savePublicDisplaySettings({
      ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
      turnTimerEnabled: true,
      turnTimerSeconds: 60,
      skipNpcTurnTimer: true
    });
    const campaign = repository.createCampaign({ name: 'Timer campaign' });
    const player = repository.savePlayer({
      campaignId: campaign.id,
      name: 'Timed hero',
      level: 3,
      armorClass: 16,
      maxHp: 28,
      initiativeMod: 2,
      passivePerception: 13,
      active: true
    });
    const creature = repository.saveCreature(creatureInput(campaign.id));
    const encounter = repository.saveEncounter({ campaignId: campaign.id, name: 'Timer encounter' });
    repository.saveEncounterPlayerSetting({ encounterId: encounter.id, playerId: player.id, participating: true });
    repository.saveEncounterGroup({ encounterId: encounter.id, templateId: creature.id, quantity: 1, initiativeMode: 'individual' });

    const preparation = repository.prepareCombat(encounter.id);
    const hero = preparation.combatants.find((combatant) => combatant.playerId === player.id)!;
    const enemy = preparation.combatants.find((combatant) => combatant.templateId === creature.id)!;
    const started = repository.confirmCombatInitiative(preparation.id, [
      { combatantId: hero.id, initiative: 20 },
      { combatantId: enemy.id, initiative: 10 }
    ]);

    expect(started.activeCombatantId).toBe(hero.id);
    expect(started.turnTimerDeadlineAt).not.toBeNull();
    expect(repository.getPlayerView(campaign.id).turnTimerDeadlineAt).toBe(started.turnTimerDeadlineAt);

    const unchanged = repository.updateCombatant(hero.id, { currentHp: hero.currentHp - 1 });
    expect(unchanged.turnTimerDeadlineAt).toBe(started.turnTimerDeadlineAt);
    expect(repository.setActiveCombatant(started.id, hero.id).turnTimerDeadlineAt).toBe(started.turnTimerDeadlineAt);

    const paused = repository.toggleTurnTimerPause(started.id);
    expect(paused.turnTimerDeadlineAt).toBeNull();
    expect(paused.turnTimerPausedRemainingMs).toBeGreaterThan(58_000);
    expect(paused.turnTimerPausedRemainingMs).toBeLessThanOrEqual(60_000);
    expect(repository.getPlayerView(campaign.id).turnTimerPausedRemainingMs).toBe(paused.turnTimerPausedRemainingMs);
    expect(new TrackerRepository(database).getCombatSession(started.id).turnTimerPausedRemainingMs).toBe(paused.turnTimerPausedRemainingMs);

    const resumed = repository.toggleTurnTimerPause(started.id);
    expect(resumed.turnTimerPausedRemainingMs).toBeNull();
    expect(resumed.turnTimerDeadlineAt).not.toBeNull();

    const pausedAgain = repository.toggleTurnTimerPause(started.id);
    expect(pausedAgain.turnTimerPausedRemainingMs).not.toBeNull();
    const enemyTurn = repository.advanceTurn(started.id);
    expect(enemyTurn.activeCombatantId).toBe(enemy.id);
    expect(enemyTurn.turnTimerDeadlineAt).toBeNull();
    expect(enemyTurn.turnTimerPausedRemainingMs).toBeNull();

    const returnedToHero = repository.retreatTurn(started.id);
    expect(returnedToHero.activeCombatantId).toBe(hero.id);
    expect(returnedToHero.turnTimerDeadlineAt).not.toBeNull();
    expect(returnedToHero.turnTimerPausedRemainingMs).toBeNull();

    database.sqlite.prepare('UPDATE combat_sessions SET turn_timer_deadline_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', started.id);
    expect(repository.advanceRound(started.id).turnTimerDeadlineAt).not.toBe('2000-01-01T00:00:00.000Z');

    const beforeDisplayOnlyChange = repository.getCombatSession(started.id).turnTimerDeadlineAt;
    repository.savePublicDisplaySettings({
      ...repository.getPublicDisplaySettings(),
      showEnemyArmorClass: false
    });
    expect(repository.getCombatSession(started.id).turnTimerDeadlineAt).toBe(beforeDisplayOnlyChange);

    repository.savePublicDisplaySettings({
      ...repository.getPublicDisplaySettings(),
      turnTimerSeconds: 90
    });
    const resetDeadline = repository.getCombatSession(started.id).turnTimerDeadlineAt;
    expect(resetDeadline).not.toBe(beforeDisplayOnlyChange);
    expect(Date.parse(resetDeadline!) - Date.now()).toBeGreaterThan(88_000);
  });

  it('normalizes timer defaults from settings saved by an older version', () => {
    database = openMemoryDatabase();
    database.sqlite
      .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('public_display', JSON.stringify({ showEnemyArmorClass: false }), new Date().toISOString());

    const settings = new TrackerRepository(database).getPublicDisplaySettings();
    expect(settings).toEqual({
      ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
      showEnemyArmorClass: false
    });
  });

  it('does not assign immune conditions manually or after defeat', () => {
    database = openMemoryDatabase();
    const repository = new TrackerRepository(database);
    const campaign = repository.createCampaign({ name: 'Condition immunity campaign' });
    const creature = repository.saveCreature({
      ...creatureInput(campaign.id),
      conditionImmunities: 'Распластанность'
    });
    const encounter = repository.saveEncounter({ campaignId: campaign.id, name: 'Condition immunity encounter' });
    repository.saveEncounterGroup({
      encounterId: encounter.id,
      templateId: creature.id,
      quantity: 1,
      initiativeMode: 'individual'
    });

    const preparation = repository.prepareCombat(encounter.id);
    const enemy = preparation.combatants.find((combatant) => combatant.templateId === creature.id)!;
    const updated = repository.updateCombatant(enemy.id, {
      currentHp: 0,
      defeated: true,
      effects: [{ id: 'attempted-prone', label: 'Опрокинутый', public: true, statusId: PRONE_STATUS_ID }]
    });
    const defeatedEnemy = updated.combatants.find((combatant) => combatant.id === enemy.id)!;
    const statusIds = defeatedEnemy.effects.map((effect) => effect.statusId);

    expect(statusIds).toContain(UNCONSCIOUS_STATUS_ID);
    expect(statusIds).toContain(INCAPACITATED_STATUS_ID);
    expect(statusIds).not.toContain(PRONE_STATUS_ID);
  });

  it('exchanges Alert initiative only with a player or allied NPC during preparation', () => {
    database = openMemoryDatabase();
    const repository = new TrackerRepository(database);
    const campaign = repository.createCampaign({ name: 'Alert campaign' });
    const alertPlayer = repository.savePlayer({
      campaignId: campaign.id,
      name: 'Alert hero',
      level: 5,
      armorClass: 16,
      maxHp: 35,
      initiativeMod: 4,
      passivePerception: 14,
      active: true,
      alertInitiativeSwap: true
    });
    const allyPlayer = repository.savePlayer({
      campaignId: campaign.id,
      name: 'Ally hero',
      level: 5,
      armorClass: 17,
      maxHp: 42,
      initiativeMod: 1,
      passivePerception: 12,
      active: true
    });
    const creature = repository.saveCreature(creatureInput(campaign.id));
    const encounter = repository.saveEncounter({ campaignId: campaign.id, name: 'Alert encounter' });
    repository.saveEncounterPlayerSetting({ encounterId: encounter.id, playerId: alertPlayer.id, participating: true });
    repository.saveEncounterPlayerSetting({ encounterId: encounter.id, playerId: allyPlayer.id, participating: true });
    repository.saveEncounterGroup({ encounterId: encounter.id, templateId: creature.id, displayName: 'Enemy', quantity: 1, initiativeMode: 'individual' });
    repository.saveEncounterGroup({
      encounterId: encounter.id,
      templateId: creature.id,
      displayName: 'Friendly NPC',
      quantity: 1,
      initiativeMode: 'individual',
      isAlly: true
    });

    const preparation = repository.prepareCombat(encounter.id);
    const source = preparation.combatants.find((combatant) => combatant.playerId === alertPlayer.id)!;
    const playerTarget = preparation.combatants.find((combatant) => combatant.playerId === allyPlayer.id)!;
    const enemy = preparation.combatants.find((combatant) => combatant.name === 'Enemy')!;
    const friendlyNpc = preparation.combatants.find((combatant) => combatant.name === 'Friendly NPC')!;
    const entries = preparation.combatants.map((combatant, index) => ({
      combatantId: combatant.id,
      roll: 10 + index,
      initiative: 10 + index + combatant.initiativeMod
    }));

    repository.beginInitiativeExchange(preparation.id, source.id, entries);
    const prompt = repository.getPlayerView(campaign.id).initiativeExchange;
    expect(prompt?.candidates.map((candidate) => candidate.combatantId)).toEqual(expect.arrayContaining([playerTarget.id, friendlyNpc.id]));
    expect(prompt?.candidates.map((candidate) => candidate.combatantId)).not.toContain(enemy.id);

    const sourceBefore = repository.getCombatSession(preparation.id).combatants.find((combatant) => combatant.id === source.id)!.initiative;
    const targetBefore = repository.getCombatSession(preparation.id).combatants.find((combatant) => combatant.id === friendlyNpc.id)!.initiative;
    const swapped = repository.swapCombatInitiative(preparation.id, source.id, friendlyNpc.id);
    expect(swapped.combatants.find((combatant) => combatant.id === source.id)?.initiative).toBe(targetBefore);
    expect(swapped.combatants.find((combatant) => combatant.id === friendlyNpc.id)?.initiative).toBe(sourceBefore);
    expect(repository.getPlayerView(campaign.id).initiativeExchange).toBeNull();
    expect(() => repository.beginInitiativeExchange(preparation.id, source.id, entries)).toThrow('уже использовал обмен инициативой');
  });

  it('opens a legacy database without deleting existing campaigns', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'dnd-tracker-legacy-'));
    const filePath = join(temporaryDirectory, 'dnd-2024-battle-tracker.sqlite');
    const legacy = new Database(filePath);
    legacy.exec(`
      CREATE TABLE campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO campaigns VALUES ('legacy-campaign', 'Старая кампания', 'Не удалять', '2025-01-01', '2025-01-01');
    `);
    legacy.close();

    database = openAppDatabase(temporaryDirectory);
    const campaign = database.sqlite.prepare('SELECT name, notes FROM campaigns WHERE id = ?').get('legacy-campaign') as { name: string; notes: string };
    const newTable = database.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'combat_sessions'").get();
    const combatSessionColumns = database.sqlite.prepare('PRAGMA table_info(combat_sessions)').all() as Array<{ name: string }>;

    expect(campaign).toEqual({ name: 'Старая кампания', notes: 'Не удалять' });
    expect(newTable).toBeDefined();
    expect(combatSessionColumns.map((column) => column.name)).toEqual(expect.arrayContaining(['turn_timer_deadline_at', 'turn_timer_paused_remaining_ms']));
  });
});

function creatureInput(campaignId: string) {
  return {
    campaignId,
    name: 'Training dummy',
    originalName: 'Training Dummy',
    size: 'Средний',
    creatureType: 'Конструкт',
    alignment: 'Без мировоззрения',
    armorClass: 10,
    initiativeMod: 0,
    initiativeScore: 10,
    hitPoints: 10,
    hitDice: '2d8+1',
    speeds: '0 футов',
    abilities: { str: 10, dex: 10, con: 10, int: 1, wis: 1, cha: 1 },
    savingThrows: {},
    skills: '',
    vulnerabilities: '',
    resistances: '',
    immunities: '',
    conditionImmunities: '',
    senses: '',
    languages: '',
    challengeRating: '1/4',
    xp: 50,
    proficiencyBonus: 2,
    traits: [],
    actions: [],
    imageUrl: '',
    tokenUrl: '',
    lairName: '',
    lairDescription: '',
    lairHtml: '',
    lairEffects: [],
    sourceUrl: '',
    notes: ''
  };
}

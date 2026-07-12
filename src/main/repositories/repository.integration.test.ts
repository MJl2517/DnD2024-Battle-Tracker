import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppDatabase } from '../services/db';
import { openAppDatabase, openMemoryDatabase } from '../services/db';
import { TrackerRepository } from '../services/repository';

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
    repository.saveEncounterPlayerSetting({ encounterId: encounter.id, playerId: player.id, participating: true });
    repository.saveEncounterGroup({ encounterId: encounter.id, templateId: creature.id, quantity: 1, initiativeMode: 'individual' });

    const session = repository.startCombat(encounter.id);
    expect(session.combatants.map((combatant) => combatant.name).sort()).toEqual(['Hero', 'Training dummy']);

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

    expect(campaign).toEqual({ name: 'Старая кампания', notes: 'Не удалять' });
    expect(newTable).toBeDefined();
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

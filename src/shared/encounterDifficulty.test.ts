import { describe, expect, it } from 'vitest';
import { calculateEncounterDifficulty } from './encounterDifficulty';
import type { CreatureTemplate, EncounterCreatureGroup, EncounterPlayerSetting, PlayerCharacter } from './types';

describe('calculateEncounterDifficulty', () => {
  it('uses only participating players and hostile creatures', () => {
    const result = calculateEncounterDifficulty(
      [player('p1', 3), player('p2', 3), player('p3', 10)],
      [setting('p3', false)],
      [group('enemy', 2, false), group('ally', 1, true)],
      [creature('enemy', 225, '1'), creature('ally', 10000, '13')]
    );

    expect(result.partySize).toBe(2);
    expect(result.enemyXp).toBe(450);
    expect(result.budgets.map((budget) => budget.xp)).toEqual([300, 450, 800]);
    expect(result.difficulty).toBe('medium');
    expect(result.hasAllies).toBe(true);
  });

  it('falls back to challenge rating xp when imported xp is missing', () => {
    const result = calculateEncounterDifficulty([player('p1', 1)], [], [group('enemy', 1, false)], [creature('enemy', 0, '1/4')]);

    expect(result.enemyXp).toBe(50);
    expect(result.difficulty).toBe('low');
    expect(result.missingXpGroups).toBe(0);
  });
});

function player(id: string, level: number): PlayerCharacter {
  return { id, campaignId: 'campaign', name: id, level, armorClass: 10, maxHp: 10, initiativeMod: 0, passivePerception: 10, active: true, imageUrl: '', notes: '', createdAt: '', updatedAt: '' };
}

function setting(playerId: string, participating: boolean): EncounterPlayerSetting {
  return { id: playerId, encounterId: 'encounter', playerId, participating, initiativeAdvantage: false, initiativeOverride: null, createdAt: '', updatedAt: '' };
}

function group(templateId: string, quantity: number, isAlly: boolean): EncounterCreatureGroup {
  return { id: templateId, encounterId: 'encounter', templateId, displayName: templateId, quantity, initiativeMode: 'individual', initiativeAdvantage: false, initiativeOverride: null, hpMode: 'average', hpOverride: null, isAlly, createdAt: '', updatedAt: '' };
}

function creature(id: string, xp: number, challengeRating: string): CreatureTemplate {
  return {
    id, campaignId: 'campaign', name: id, originalName: '', size: '', creatureType: '', alignment: '', armorClass: 10, initiativeMod: 0, initiativeScore: 10,
    hitPoints: 10, hitDice: '', speeds: '', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, savingThrows: {}, skills: '',
    vulnerabilities: '', resistances: '', immunities: '', conditionImmunities: '', senses: '', languages: '', challengeRating, xp, proficiencyBonus: 2,
    traits: [], actions: [], imageUrl: '', tokenUrl: '', lairName: '', lairDescription: '', lairHtml: '', lairEffects: [], sourceUrl: '', notes: '', createdAt: '', updatedAt: ''
  };
}

import { describe, expect, it } from 'vitest';
import {
  assignTurnOrder,
  calculateExperience,
  clampEncounterQuantity,
  describeInitiativeMode,
  getVisibleEffects,
  isBloodied,
  normalizeGroupInput,
  normalizeHitPointMode,
  normalizeHp,
  rollHitDiceExpression,
  rollInitiative,
  rollInitiativeWithAdvantage,
  rollInitiativeWithDisadvantage,
  sortCombatants,
  tickTimedEffects,
  toPublicCombatants
} from './combat';
import type { Combatant, CreatureTemplate, PlayerCharacter } from './types';

describe('combat logic', () => {
  it('rolls initiative as d20 plus modifier', () => {
    expect(rollInitiative(3, { d20: () => 14 })).toBe(17);
  });

  it('rolls initiative with advantage as the best of two d20 rolls', () => {
    const rolls = [4, 16];
    expect(rollInitiativeWithAdvantage(2, { d20: () => rolls.shift() ?? 1 })).toBe(18);
  });

  it('rolls initiative with disadvantage as the worst of two d20 rolls', () => {
    const rolls = [16, 4];
    expect(rollInitiativeWithDisadvantage(2, { d20: () => rolls.shift() ?? 1 })).toBe(6);
  });

  it('sorts by initiative, modifier, then turn order', () => {
    const result = sortCombatants([
      combatant({ id: 'slow', name: 'Slow', initiative: 12, initiativeMod: 5, turnOrder: 0 }),
      combatant({ id: 'fast', name: 'Fast', initiative: 18, initiativeMod: 1, turnOrder: 1 }),
      combatant({ id: 'tie', name: 'Tie', initiative: 12, initiativeMod: 7, turnOrder: 2 })
    ]);

    expect(result.map((item) => item.id)).toEqual(['fast', 'tie', 'slow']);
  });

  it('assigns stable turn order after sorting', () => {
    const result = assignTurnOrder([combatant({ id: 'second', initiative: 10, turnOrder: 4 }), combatant({ id: 'first', initiative: 20, turnOrder: 3 })]);
    expect(result.map(({ id, turnOrder }) => ({ id, turnOrder }))).toEqual([
      { id: 'first', turnOrder: 0 },
      { id: 'second', turnOrder: 1 }
    ]);
  });

  it('marks a living creature as bloodied at half hp or below', () => {
    expect(isBloodied(10, 20)).toBe(true);
    expect(isBloodied(11, 20)).toBe(false);
    expect(isBloodied(0, 20)).toBe(false);
  });

  it('normalizes hp, encounter quantity and group modes', () => {
    expect(normalizeHp(25.7, 20)).toBe(20);
    expect(normalizeHp(Number.NaN, 20)).toBe(0);
    expect(clampEncounterQuantity(120)).toBe(99);
    expect(normalizeGroupInput({ quantity: 0, initiativeMode: 'individual' })).toEqual({ quantity: 1, initiativeMode: 'individual' });
  });

  it('normalizes and describes combat modes', () => {
    expect(describeInitiativeMode('group')).toBe('Группой');
    expect(describeInitiativeMode('individual')).toBe('Каждому отдельно');
    expect(normalizeHitPointMode('random')).toBe('random');
    expect(normalizeHitPointMode('average', 42)).toBe('fixed');
    expect(normalizeHitPointMode(undefined)).toBe('average');
  });

  it('returns only public effects', () => {
    expect(
      getVisibleEffects([
        { id: 'public', label: 'Public', public: true },
        { id: 'private', label: 'Private', public: false }
      ])
    ).toEqual([{ id: 'public', label: 'Public', public: true }]);
  });

  it('rolls hit dice expressions with modifiers', () => {
    const rolls = [4, 5, 6];
    const result = rollHitDiceExpression('3d8 + 6', 20, {
      die: () => rolls.shift() ?? 1
    });

    expect(result).toBe(21);
  });

  it('falls back to average hp when hit dice are missing', () => {
    expect(rollHitDiceExpression('', 17)).toBe(17);
  });

  it('hides exact npc hp in the public view', () => {
    const view = toPublicCombatants(
      [
        combatant({
          id: 'npc',
          name: 'Mephit',
          side: 'npc',
          initiative: 18,
          currentHp: 8,
          maxHp: 17,
          effects: [{ id: 'burning', label: 'Горит', public: true }]
        }),
        combatant({ id: 'pc', name: 'Arden', side: 'player', initiative: 12, currentHp: 22, maxHp: 31 })
      ],
      'npc'
    );

    expect(view[0]).not.toHaveProperty('currentHp');
    expect(view[0].bloodied).toBe(true);
    expect(view[0].publicNameVisible).toBe(false);
    expect(view[0].effects).toHaveLength(1);
    expect(view[1].currentHp).toBe(22);
  });

  it('calculates xp from defeated npcs and active players', () => {
    const result = calculateExperience(
      [
        combatant({ side: 'npc', currentHp: 0, defeated: true, snapshot: creature({ xp: 50 }) }),
        combatant({ side: 'npc', currentHp: 0, defeated: false, escaped: true, snapshot: creature({ xp: 100 }) }),
        combatant({ side: 'npc', currentHp: 12, defeated: false, snapshot: creature({ xp: 200 }) })
      ],
      [player({ active: true }), player({ active: true }), player({ active: false })]
    );

    expect(result.totalXp).toBe(50);
    expect(result.xpPerPlayer).toBe(25);
    expect(result.defeatedNpcCount).toBe(1);
  });

  it('does not award xp for allied creatures', () => {
    const result = calculateExperience(
      [
        combatant({ side: 'npc', isAlly: true, currentHp: 0, defeated: true, snapshot: creature({ xp: 200 }) }),
        combatant({ side: 'npc', isAlly: false, currentHp: 0, defeated: true, snapshot: creature({ xp: 50 }) })
      ],
      [player({ active: true })]
    );

    expect(result.totalXp).toBe(50);
    expect(result.defeatedNpcCount).toBe(1);
  });

  it('shares xp with selected allied creatures', () => {
    const ally = combatant({ id: 'ally', side: 'npc', isAlly: true });
    const result = calculateExperience(
      [ally, combatant({ id: 'enemy', side: 'npc', currentHp: 0, defeated: true, snapshot: creature({ xp: 100 }) })],
      [player({ active: true }), player({ active: true })],
      { defeatedGiveXp: true, escapedXpMode: 'none', shareXpWithAllies: true, xpAllyIds: [ally.id] }
    );

    expect(result.totalXp).toBe(100);
    expect(result.playerCount).toBe(2);
    expect(result.allyRecipientCount).toBe(1);
    expect(result.recipientCount).toBe(3);
    expect(result.xpPerPlayer).toBe(33);
  });

  it('applies xp bonus or penalty to the total pool', () => {
    const bonus = calculateExperience(
      [combatant({ side: 'npc', currentHp: 0, defeated: true, snapshot: creature({ xp: 50 }) })],
      [player({ active: true }), player({ active: true })],
      { defeatedGiveXp: true, escapedXpMode: 'none', xpAdjustment: 25 }
    );
    const penalty = calculateExperience(
      [combatant({ side: 'npc', currentHp: 0, defeated: true, snapshot: creature({ xp: 50 }) })],
      [player({ active: true }), player({ active: true })],
      { defeatedGiveXp: true, escapedXpMode: 'none', xpAdjustment: -75 }
    );

    expect(bonus.totalXp).toBe(75);
    expect(bonus.xpPerPlayer).toBe(37);
    expect(bonus.xpAdjustment).toBe(25);
    expect(penalty.totalXp).toBe(0);
    expect(penalty.xpPerPlayer).toBe(0);
    expect(penalty.xpAdjustment).toBe(-75);
  });

  it('ticks timed effects and removes expired ones', () => {
    const result = tickTimedEffects([
      { id: 'slow', label: 'Slow', public: true, timed: true, durationRounds: 3, remainingRounds: 3 },
      { id: 'expired', label: 'Expired', public: true, timed: true, durationRounds: 1, remainingRounds: 1 },
      { id: 'custom', label: 'Custom', public: true }
    ]);

    expect(result).toEqual([
      { id: 'slow', label: 'Slow', public: true, timed: true, durationRounds: 3, remainingRounds: 2 },
      { id: 'custom', label: 'Custom', public: true }
    ]);
  });
});

function combatant(overrides: Partial<Combatant>): Combatant {
  return {
    id: 'id',
    sessionId: 'session',
    templateId: null,
    playerId: null,
    name: 'Combatant',
    side: 'npc',
    armorClass: 10,
    baseArmorClass: 10,
    maxHp: 20,
    baseMaxHp: 20,
    currentHp: 20,
    temporaryHp: 0,
    initiative: 10,
    initiativeMod: 0,
    initiativeGroupId: null,
    initiativeMode: 'individual',
    turnOrder: 0,
    effects: [],
    publicNotes: '',
    publicNameVisible: false,
    snapshot: creature({}),
    defeated: false,
    escaped: false,
    visible: true,
    ...overrides,
    isAlly: overrides.isAlly ?? false
  };
}

function creature(overrides: Partial<CreatureTemplate>): CreatureTemplate {
  const timestamp = '2026-01-01T00:00:00.000Z';
  return {
    id: 'creature',
    campaignId: 'campaign',
    name: 'Creature',
    originalName: '',
    size: '',
    creatureType: '',
    alignment: '',
    armorClass: 10,
    initiativeMod: 0,
    initiativeScore: 10,
    hitPoints: 20,
    hitDice: '',
    speeds: '30 футов',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    savingThrows: {},
    skills: '',
    vulnerabilities: '',
    resistances: '',
    immunities: '',
    conditionImmunities: '',
    senses: '',
    languages: '',
    challengeRating: '',
    xp: 0,
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
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function player(overrides: Partial<PlayerCharacter>): PlayerCharacter {
  const timestamp = '2026-01-01T00:00:00.000Z';
  return {
    id: 'player',
    campaignId: 'campaign',
    name: 'Player',
    level: 1,
    armorClass: 15,
    maxHp: 20,
    initiativeMod: 0,
    passivePerception: 10,
    active: true,
    imageUrl: '',
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
    alertInitiativeSwap: overrides.alertInitiativeSwap ?? false
  };
}

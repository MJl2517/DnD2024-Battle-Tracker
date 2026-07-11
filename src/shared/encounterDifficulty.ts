import type { CreatureTemplate, EncounterCreatureGroup, EncounterPlayerSetting, PlayerCharacter } from './types';

export type EncounterDifficultyKey = 'below-low' | 'low' | 'medium' | 'high';
export type EncounterBudgetKey = 'low' | 'medium' | 'high';

export interface EncounterDifficultyBudget {
  key: EncounterBudgetKey;
  label: string;
  xp: number;
  description: string;
}

export interface EncounterDifficultyResult {
  ok: boolean;
  message: string;
  partySize: number;
  averageLevel: number;
  levelSummary: string;
  enemyXp: number;
  difficulty: EncounterDifficultyKey;
  difficultyLabel: string;
  budgets: EncounterDifficultyBudget[];
  hasAllies: boolean;
  missingXpGroups: number;
}

const XP_BY_LEVEL: Record<number, Record<EncounterBudgetKey, number>> = {
  1: { low: 50, medium: 75, high: 100 },
  2: { low: 100, medium: 150, high: 200 },
  3: { low: 150, medium: 225, high: 400 },
  4: { low: 250, medium: 375, high: 500 },
  5: { low: 500, medium: 750, high: 1100 },
  6: { low: 600, medium: 1000, high: 1400 },
  7: { low: 750, medium: 1300, high: 1700 },
  8: { low: 1000, medium: 1700, high: 2100 },
  9: { low: 1300, medium: 2000, high: 2600 },
  10: { low: 1600, medium: 2300, high: 3100 },
  11: { low: 1900, medium: 2900, high: 4100 },
  12: { low: 2200, medium: 3700, high: 4700 },
  13: { low: 2600, medium: 4200, high: 5400 },
  14: { low: 2900, medium: 4900, high: 6200 },
  15: { low: 3300, medium: 5400, high: 7800 },
  16: { low: 3800, medium: 6100, high: 9800 },
  17: { low: 4500, medium: 7200, high: 11700 },
  18: { low: 5000, medium: 8700, high: 14200 },
  19: { low: 5500, medium: 10700, high: 17200 },
  20: { low: 6400, medium: 13200, high: 22000 }
};

const XP_BY_CR: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000
};

const BUDGET_META: Array<Pick<EncounterDifficultyBudget, 'key' | 'label' | 'description'>> = [
  { key: 'low', label: 'Низкая', description: 'Создаёт напряжение, но группа обычно побеждает без потерь.' },
  { key: 'medium', label: 'Средняя', description: 'Без лечения и ресурсов бой может стать опасным; слабые герои могут выйти из строя.' },
  { key: 'high', label: 'Высокая', description: 'Потенциально смертельная сцена, требующая тактики и существенных ресурсов.' }
];

export function calculateEncounterDifficulty(
  players: PlayerCharacter[],
  playerSettings: EncounterPlayerSetting[],
  groups: EncounterCreatureGroup[],
  creatures: CreatureTemplate[]
): EncounterDifficultyResult {
  const settingByPlayerId = new Map(playerSettings.map((setting) => [setting.playerId, setting]));
  const members = players.filter((player) => {
    const participating = settingByPlayerId.get(player.id)?.participating ?? true;
    return player.active && participating && player.level >= 1 && player.level <= 20;
  });
  const levels = members.map((player) => player.level);
  const hasAllies = groups.some((group) => group.isAlly);
  const creatureById = new Map(creatures.map((creature) => [creature.id, creature]));
  let missingXpGroups = 0;
  const enemyXp = groups.reduce((total, group) => {
    if (group.isAlly) return total;
    const creature = creatureById.get(group.templateId);
    const xp = creature ? getCreatureDifficultyXp(creature) : 0;
    if (xp <= 0) missingXpGroups += 1;
    return total + xp * Math.max(1, group.quantity);
  }, 0);

  if (!levels.length) {
    return {
      ok: false,
      message: 'В энкаунтере нет участвующих персонажей с уровнем от 1 до 20.',
      partySize: 0,
      averageLevel: 0,
      levelSummary: '',
      enemyXp,
      difficulty: 'below-low',
      difficultyLabel: 'Нет данных',
      budgets: [],
      hasAllies,
      missingXpGroups
    };
  }

  const budgets = BUDGET_META.map((meta) => ({
    ...meta,
    xp: levels.reduce((sum, level) => sum + XP_BY_LEVEL[level][meta.key], 0)
  }));
  const low = budgets[0].xp;
  const medium = budgets[1].xp;
  const high = budgets[2].xp;
  const difficulty: EncounterDifficultyKey = enemyXp < low ? 'below-low' : enemyXp < medium ? 'low' : enemyXp < high ? 'medium' : 'high';
  const difficultyLabel = difficulty === 'below-low' ? 'Ниже низкой' : difficulty === 'low' ? 'Низкая' : difficulty === 'medium' ? 'Средняя' : 'Высокая';

  return {
    ok: true,
    message: '',
    partySize: levels.length,
    averageLevel: Math.round((levels.reduce((sum, level) => sum + level, 0) / levels.length) * 10) / 10,
    levelSummary: buildLevelSummary(levels),
    enemyXp,
    difficulty,
    difficultyLabel,
    budgets,
    hasAllies,
    missingXpGroups
  };
}

function getCreatureDifficultyXp(creature: CreatureTemplate): number {
  if (creature.xp > 0) return creature.xp;
  const cr = normalizeChallengeRating(creature.challengeRating);
  return cr ? XP_BY_CR[cr] ?? 0 : 0;
}

function normalizeChallengeRating(value: string): string {
  const match = value.trim().match(/(?:^|\s)(1\/8|1\/4|1\/2|(?:[12]?\d|30))(?:\s|$|\()/);
  return match?.[1] ?? '';
}

function buildLevelSummary(levels: number[]): string {
  return [...new Set(levels)]
    .sort((left, right) => left - right)
    .map((level) => `${level} ур. × ${levels.filter((value) => value === level).length}`)
    .join(', ');
}

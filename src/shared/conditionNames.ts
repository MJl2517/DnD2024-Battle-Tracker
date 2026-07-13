import { STATUS_EFFECTS } from './statusEffects';

const STATUS_LABEL_BY_ID = new Map(STATUS_EFFECTS.map((status) => [status.id, status.label]));

/**
 * Сайты используют разные русские переводы одних и тех же английских состояний.
 * В словаре алиас всегда указывает на системный id, а итоговое название берётся из
 * STATUS_EFFECTS. Благодаря этому импорт не разойдётся с названиями в интерфейсе.
 */
const CONDITION_ALIAS_TO_STATUS_ID: Record<string, string> = {
  unconscious: 'unconscious',
  'без сознания': 'unconscious',
  бессознательный: 'unconscious',

  incapacitated: 'incapacitated',
  'выход из строя': 'incapacitated',
  недееспособный: 'incapacitated',

  deafened: 'deafened',
  глухота: 'deafened',
  оглохший: 'deafened',

  grappled: 'grappled',
  захват: 'grappled',
  схваченный: 'grappled',

  frightened: 'frightened',
  испуг: 'frightened',
  испуганный: 'frightened',

  invisible: 'invisible',
  невидимость: 'invisible',
  невидимый: 'invisible',

  restrained: 'restrained',
  обездвиженность: 'restrained',
  опутанный: 'restrained',

  charmed: 'charmed',
  обворожение: 'charmed',
  очарованный: 'charmed',

  petrified: 'petrified',
  окаменение: 'petrified',
  окаменевший: 'petrified',

  poisoned: 'poisoned',
  отравление: 'poisoned',
  отравленный: 'poisoned',

  paralyzed: 'paralyzed',
  паралич: 'paralyzed',
  парализованный: 'paralyzed',

  prone: 'prone',
  распластанность: 'prone',
  'лежащий ничком': 'prone',
  опрокинутый: 'prone',

  blinded: 'blinded',
  слепота: 'blinded',
  ослеплённый: 'blinded',
  ослепленный: 'blinded',

  exhaustion: 'exhaustion',
  утомление: 'exhaustion',
  истощение: 'exhaustion',
  истощённый: 'exhaustion',
  истощенный: 'exhaustion',

  stunned: 'stunned',
  шок: 'stunned',
  ошеломлённый: 'stunned',
  ошеломленный: 'stunned'
};

/** Приводит переводы состояний разных источников к названиям, используемым приложением. */
export function normalizeConditionImmunities(value: string): string {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const sourceName of splitConditionNames(value)) {
    const alias = normalizeAlias(sourceName);
    const statusId = CONDITION_ALIAS_TO_STATUS_ID[alias];
    const normalizedName = (statusId && STATUS_LABEL_BY_ID.get(statusId)) || sourceName;
    const duplicateKey = normalizedName.toLocaleLowerCase('ru');
    if (seen.has(duplicateKey)) continue;

    seen.add(duplicateKey);
    result.push(normalizedName);
  }

  return result.join(', ');
}

/** Возвращает системные id состояний, к которым существо невосприимчиво. */
export function getConditionImmunityStatusIds(value: string): ReadonlySet<string> {
  const statusIds = new Set<string>();

  for (const rawPart of splitConditionNames(value)) {
    const statusId = CONDITION_ALIAS_TO_STATUS_ID[normalizeAlias(rawPart)];
    if (statusId) statusIds.add(statusId);
  }

  return statusIds;
}

function splitConditionNames(value: string): string[] {
  return value
    .split(/\s*[,;]\s*|\s+и\s+/iu)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeAlias(value: string): string {
  return value
    .replace(/\[[^\n]*\]/gu, '')
    .replace(/\s*\([^)]*\)\s*$/gu, '')
    .replace(/[.!]+$/gu, '')
    .trim()
    .toLocaleLowerCase('ru');
}

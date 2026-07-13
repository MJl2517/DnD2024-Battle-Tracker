import { describe, expect, it } from 'vitest';
import { getConditionImmunityStatusIds, normalizeConditionImmunities } from './conditionNames';

describe('normalizeConditionImmunities', () => {
  it('normalizes Ruleholder condition names', () => {
    expect(
      normalizeConditionImmunities(
        'Без сознания, Выход из строя, Глухота, Захват, Испуг, Невидимость, Обездвиженность, Обворожение, Окаменение, Отравление, Паралич, Распластанность, Слепота, Утомление, Шок'
      )
    ).toBe(
      'Бессознательный, Недееспособный, Оглохший, Схваченный, Испуганный, Невидимый, Опутанный, Очарованный, Окаменевший, Отравленный, Парализованный, Опрокинутый, Ослеплённый, Истощение, Ошеломлённый'
    );
  });

  it('normalizes TTG Club aliases and removes duplicates', () => {
    expect(normalizeConditionImmunities('Истощённый; Лежащий ничком; Оглохший; Deafened')).toBe('Истощение, Опрокинутый, Оглохший');
  });

  it('preserves unknown conditions', () => {
    expect(normalizeConditionImmunities('Отравление, Особое состояние')).toBe('Отравленный, Особое состояние');
  });

  it('returns status ids for aliases from different sources', () => {
    expect([...getConditionImmunityStatusIds('Распластанность, Оглохший, Stunned')]).toEqual(['prone', 'deafened', 'stunned']);
  });
});

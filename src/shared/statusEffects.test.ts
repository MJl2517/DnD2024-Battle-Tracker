import { describe, expect, it } from 'vitest';
import {
  INCAPACITATED_STATUS_ID,
  PRONE_STATUS_ID,
  UNCONSCIOUS_DEPENDENCY_STATUS_IDS,
  UNCONSCIOUS_STATUS_ID,
  addStatusEffects,
  expandStatusEffectIds,
  removeStatusEffects
} from './statusEffects';
import type { CombatEffect } from './types';

describe('status effects', () => {
  it('expands unconscious into its dependent statuses', () => {
    expect(expandStatusEffectIds(UNCONSCIOUS_STATUS_ID)).toEqual([UNCONSCIOUS_STATUS_ID, INCAPACITATED_STATUS_ID, PRONE_STATUS_ID]);
  });

  it('adds defeated statuses without duplicating existing effects', () => {
    let counter = 0;
    const effects: CombatEffect[] = [{ id: 'existing-prone', label: 'Prone', public: true, statusId: PRONE_STATUS_ID }];

    const nextEffects = addStatusEffects(effects, UNCONSCIOUS_DEPENDENCY_STATUS_IDS, () => `effect-${++counter}`);

    expect(nextEffects.map((effect) => effect.statusId)).toEqual([PRONE_STATUS_ID, UNCONSCIOUS_STATUS_ID, INCAPACITATED_STATUS_ID]);
    expect(nextEffects).toHaveLength(3);
  });

  it('removes status effects by status id and keeps custom effects', () => {
    const effects: CombatEffect[] = [
      { id: 'concentration', label: 'Concentration', public: true, statusId: 'concentrating' },
      { id: 'custom', label: 'Custom', public: true }
    ];

    expect(removeStatusEffects(effects, ['concentrating'])).toEqual([{ id: 'custom', label: 'Custom', public: true }]);
  });

  it('does not add conditions blocked by immunity', () => {
    const nextEffects = addStatusEffects([], UNCONSCIOUS_DEPENDENCY_STATUS_IDS, () => 'effect', new Set([PRONE_STATUS_ID]));

    expect(nextEffects.map((effect) => effect.statusId)).toEqual([UNCONSCIOUS_STATUS_ID, INCAPACITATED_STATUS_ID]);
  });
});

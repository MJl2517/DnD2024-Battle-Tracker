import type { CombatEffect } from '@shared/types';
import { CONCENTRATION_STATUS_ID } from '@shared/statusEffects';

export function isConcentrating(effects: CombatEffect[]): boolean {
  return effects.some((effect) => effect.statusId === CONCENTRATION_STATUS_ID);
}

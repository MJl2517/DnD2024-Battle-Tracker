import type { Combatant, CombatantPatch } from '@shared/types';

export function formatHitPoints(currentHp: number, maxHp: number, temporaryHp = 0): string {
  const temp = Math.max(0, Math.round(temporaryHp));
  return temp > 0 ? `${currentHp}(+${temp})/${maxHp}` : `${currentHp}/${maxHp}`;
}

/** Списывает урон сначала с временных хитов и возвращает минимальный patch для сохранения через IPC. */
export function applyDamageToHitPoints(combatant: Combatant, amount: number): Pick<CombatantPatch, 'currentHp' | 'temporaryHp'> {
  const damage = Math.max(0, Math.round(amount));
  const temporaryDamage = Math.min(combatant.temporaryHp, damage);
  const remainingDamage = damage - temporaryDamage;
  return {
    temporaryHp: combatant.temporaryHp - temporaryDamage,
    currentHp: combatant.currentHp - remainingDamage
  };
}

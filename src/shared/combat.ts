import type {
  Combatant,
  CombatEffect,
  CompleteCombatOptions,
  EncounterCreatureGroup,
  HitPointMode,
  InitiativeMode,
  PlayerCharacter,
  PublicCombatant,
  CombatXpAward
} from './types';

export interface RollSource {
  d20: () => number;
}

export interface DieRollSource {
  die: (sides: number) => number;
}

export const randomRollSource: RollSource = {
  d20: () => Math.floor(Math.random() * 20) + 1
};

export const randomDieRollSource: DieRollSource = {
  die: (sides: number) => Math.floor(Math.random() * sides) + 1
};

/** Бросает инициативу. Источник случайности передаётся отдельно, чтобы правило было детерминированно в тестах. */
export function rollInitiative(modifier: number, source: RollSource = randomRollSource): number {
  return source.d20() + modifier;
}

/** Реализует преимущество: бросаются два d20, после чего к лучшему результату добавляется модификатор. */
export function rollInitiativeWithAdvantage(modifier: number, source: RollSource = randomRollSource): number {
  return Math.max(source.d20(), source.d20()) + modifier;
}

/** Бросок с помехой: бросаются два d20, к модификатору прибавляется худший результат. */
export function rollInitiativeWithDisadvantage(modifier: number, source: RollSource = randomRollSource): number {
  return Math.min(source.d20(), source.d20()) + modifier;
}

/** Возвращает признак «Окровавлен», не считая существ с нулевыми хитами. */
export function isBloodied(currentHp: number, maxHp: number): boolean {
  return maxHp > 0 && currentHp > 0 && currentHp <= Math.floor(maxHp / 2);
}

/** Ограничивает текущие хиты диапазоном от нуля до актуального максимума. */
export function normalizeHp(value: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, Number.isFinite(value) ? Math.round(value) : 0));
}

/**
 * Формирует стабильный порядок инициативы.
 * При равенстве сначала сравнивается модификатор, затем ручной порядок и только потом имя.
 */
export function sortCombatants<T extends Pick<Combatant, 'initiative' | 'initiativeMod' | 'turnOrder' | 'name'>>(combatants: T[]): T[] {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.initiativeMod !== a.initiativeMod) return b.initiativeMod - a.initiativeMod;
    if (a.turnOrder !== b.turnOrder) return a.turnOrder - b.turnOrder;
    return a.name.localeCompare(b.name, 'ru');
  });
}

export function assignTurnOrder<T extends Combatant>(combatants: T[]): T[] {
  return sortCombatants(combatants).map((combatant, index) => ({
    ...combatant,
    turnOrder: index
  }));
}

export function getVisibleEffects(effects: CombatEffect[]): CombatEffect[] {
  return effects.filter((effect) => effect.public);
}

/** Уменьшает длительность временных эффектов и удаляет завершившиеся, не меняя постоянные состояния. */
export function tickTimedEffects(effects: CombatEffect[], rounds = 1): CombatEffect[] {
  const elapsedRounds = Math.max(0, Math.round(rounds));
  if (elapsedRounds <= 0) return effects;

  return effects.flatMap((effect) => {
    if (!effect.timed || typeof effect.remainingRounds !== 'number') return [effect];
    const remainingRounds = Math.max(0, Math.round(effect.remainingRounds) - elapsedRounds);
    return remainingRounds > 0 ? [{ ...effect, remainingRounds }] : [];
  });
}

/**
 * Строит безопасную модель для экрана игроков.
 * Точные хиты NPC намеренно не копируются; игроки получают только публичные эффекты и сигналы состояния.
 */
export function toPublicCombatants(combatants: Combatant[], activeCombatantId: string | null): PublicCombatant[] {
  return sortCombatants(combatants)
    .filter((combatant) => combatant.visible)
    .map((combatant) => {
      const snapshot = combatant.snapshot && 'speeds' in combatant.snapshot ? combatant.snapshot : null;
      const base: PublicCombatant = {
        id: combatant.id,
        name: combatant.name,
        side: combatant.side,
        isAlly: combatant.isAlly,
        armorClass: combatant.armorClass,
        initiative: combatant.initiative,
        turnOrder: combatant.turnOrder,
        effects: getVisibleEffects(combatant.effects),
        publicNameVisible: combatant.publicNameVisible,
        bloodied: isBloodied(combatant.currentHp, combatant.maxHp),
        defeated: combatant.defeated || combatant.currentHp <= 0,
        escaped: combatant.escaped,
        visible: combatant.visible,
        isCurrent: combatant.id === activeCombatantId,
        hpSignal: combatant.currentHp + combatant.temporaryHp
      };

      if (combatant.side === 'player') {
        base.currentHp = combatant.currentHp;
        base.maxHp = combatant.maxHp;
        base.temporaryHp = combatant.temporaryHp;
        if (combatant.snapshot && 'imageUrl' in combatant.snapshot) {
          base.tokenUrl = combatant.snapshot.imageUrl;
        }
      }

      if (snapshot) {
        base.speeds = snapshot.speeds;
        base.resistances = snapshot.resistances;
        base.immunities = snapshot.immunities;
        base.tokenUrl = snapshot.tokenUrl || snapshot.imageUrl;
      }

      return base;
    });
}

/**
 * Считает итоговый пул опыта и делит его между участниками с округлением вниз.
 * Союзники становятся получателями только по явному выбору мастера и сами опыт в пул не добавляют.
 */
export function calculateExperience(
  combatants: Array<Pick<Combatant, 'id' | 'side' | 'isAlly' | 'currentHp' | 'defeated' | 'escaped' | 'snapshot'>>,
  participatingPlayers: Pick<PlayerCharacter, 'active'>[],
  options: CompleteCombatOptions = { defeatedGiveXp: true, escapedXpMode: 'none' }
): CombatXpAward {
  const defeatedNpcs = combatants.filter(
    (combatant) => combatant.side === 'npc' && !combatant.isAlly && !combatant.escaped && (combatant.defeated || combatant.currentHp <= 0)
  );
  const escapedNpcs = combatants.filter((combatant) => combatant.side === 'npc' && !combatant.isAlly && combatant.escaped);
  const customPool = typeof options.customXpPool === 'number';
  const baseTotalXp = customPool
    ? Math.max(0, Math.round(options.customXpPool ?? 0))
    : [...(options.defeatedGiveXp ? defeatedNpcs : []), ...escapedNpcs].reduce((sum, combatant) => {
        const xp = combatant.snapshot && 'xp' in combatant.snapshot ? combatant.snapshot.xp : 0;
        if (combatant.escaped && options.escapedXpMode === 'none') return sum;
        if (combatant.escaped && options.escapedXpMode === 'half') return sum + Math.floor(xp / 2);
        return sum + xp;
      }, 0);
  const xpAdjustment = Math.round(options.xpAdjustment ?? 0);
  const totalXp = Math.max(0, baseTotalXp + xpAdjustment);
  const activePlayerCount = participatingPlayers.filter((player) => player.active).length;
  const selectedAllyIds = new Set(options.shareXpWithAllies ? (options.xpAllyIds ?? []) : []);
  const allyRecipientCount = combatants.filter((combatant) => combatant.side === 'npc' && combatant.isAlly && selectedAllyIds.has(combatant.id)).length;
  const recipientCount = activePlayerCount + allyRecipientCount;

  return {
    totalXp,
    xpPerPlayer: recipientCount > 0 ? Math.floor(totalXp / recipientCount) : 0,
    playerCount: activePlayerCount,
    allyRecipientCount,
    recipientCount,
    defeatedNpcCount: defeatedNpcs.length,
    escapedNpcCount: escapedNpcs.length,
    customPool,
    xpAdjustment
  };
}

export function describeInitiativeMode(mode: InitiativeMode): string {
  return mode === 'group' ? 'Группой' : 'Каждому отдельно';
}

export function normalizeHitPointMode(mode: HitPointMode | undefined, hpOverride?: number | null): HitPointMode {
  if (hpOverride != null) return 'fixed';
  return mode === 'fixed' || mode === 'random' ? mode : 'average';
}

/** Разбирает запись вида 5d8+10 и бросает каждый куб; некорректная запись заменяется средним значением. */
export function rollHitDiceExpression(expression: string, fallback: number, source: DieRollSource = randomDieRollSource): number {
  const normalized = expression.replace(/\s+/g, '');
  const match = normalized.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return Math.max(1, Math.round(fallback));

  const count = Math.max(1, Math.min(999, Number(match[1])));
  const sides = Math.max(1, Math.min(999, Number(match[2])));
  const modifier = match[3] ? Number(match[3]) : 0;
  let total = modifier;
  for (let index = 0; index < count; index += 1) {
    total += source.die(sides);
  }

  return Math.max(1, total);
}

export function clampEncounterQuantity(quantity: number): number {
  return Math.max(1, Math.min(99, Math.round(quantity || 1)));
}

export function normalizeGroupInput<T extends Pick<EncounterCreatureGroup, 'quantity' | 'initiativeMode'>>(group: T): T {
  return {
    ...group,
    quantity: clampEncounterQuantity(group.quantity),
    initiativeMode: group.initiativeMode === 'group' ? 'group' : 'individual'
  };
}

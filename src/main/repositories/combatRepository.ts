import type { AppDatabase } from '../services/db';
import { CreatureRepository } from './creatureRepository';
import { EncounterRepository } from './encounterRepository';
import { PlayerRepository } from './playerRepository';
import { SettingsRepository } from './settingsRepository';
import {
  clamp,
  hydrateLairCombatant,
  id,
  json,
  now,
  parseJson,
  rollEncounterGroupHitPoints,
  rollPreparedInitiative,
  rowToCampaign,
  rowToCombatant,
  toCombatantParams,
  type Row
} from './repositoryUtils';
import { assignTurnOrder, calculateExperience, normalizeHp, rollHitDiceExpression, tickTimedEffects, toPublicCombatants } from '@shared/combat';
import {
  CONCENTRATION_STATUS_ID,
  INCAPACITATED_STATUS_ID,
  UNCONSCIOUS_DEPENDENCY_STATUS_IDS,
  addStatusEffects,
  removeStatusEffects
} from '@shared/statusEffects';
import type {
  AddCombatantsToCombatInput,
  CampaignDetail,
  CombatInitiativeEntry,
  CompleteCombatOptions,
  CombatXpAward,
  CombatEffect,
  CombatSession,
  Combatant,
  CombatantPatch,
  CompleteCombatResult,
  PublicFeatureCard,
  PublicCombatView,
  PublicDisplaySettings,
  InitiativeExchangePrompt
} from '@shared/types';
import { getConditionImmunityStatusIds } from '@shared/conditionNames';

/**
 * Хранилище активного боя и публичного представления.
 * Все изменения сессии выполняются здесь, чтобы переход хода, эффекты и запись SQLite оставались согласованными.
 */
export class CombatRepository {
  private readonly dismissedXpAwardSessionIds = new Set<string>();
  private readonly publicFeatureCards = new Map<string, PublicFeatureCard>();
  private readonly initiativeExchangeSources = new Map<string, string>();
  private readonly creatures: CreatureRepository;
  private readonly encounters: EncounterRepository;
  private readonly players: PlayerRepository;
  private readonly settings: SettingsRepository;

  constructor(private readonly database: AppDatabase) {
    this.creatures = new CreatureRepository(database);
    this.encounters = new EncounterRepository(database, this.creatures);
    this.players = new PlayerRepository(database);
    this.settings = new SettingsRepository(database);
  }

  getPublicDisplaySettings(): PublicDisplaySettings {
    return this.settings.getPublicDisplaySettings();
  }

  savePublicDisplaySettings(input: PublicDisplaySettings): PublicDisplaySettings {
    const previous = this.settings.getPublicDisplaySettings();
    const saved = this.settings.savePublicDisplaySettings(input);
    if (turnTimerSettingsChanged(previous, saved)) {
      this.resetActiveTurnTimers(saved);
    }
    return saved;
  }
  getCampaignDetail(campaignId: string): CampaignDetail {
    const campaignRow = this.database.sqlite.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as Row | undefined;
    if (!campaignRow) throw new Error('Кампания не найдена.');

    const players = this.players.list(campaignId);
    const creatures = this.creatures.list(campaignId);
    const encounters = this.encounters.list(campaignId);
    const activeSession = this.getActiveSession(campaignId);

    return {
      campaign: rowToCampaign(campaignRow),
      players,
      creatures,
      encounters,
      activeSession
    };
  }

  /** Создаёт снимки всех участников и атомарно заменяет предыдущий активный бой кампании. */
  startCombat(encounterId: string): CombatSession {
    return this.createCombat(encounterId, 'active');
  }

  /** Создаёт черновик боя с бросками, который ещё не виден игрокам. */
  prepareCombat(encounterId: string): CombatSession {
    return this.createCombat(encounterId, 'preparing');
  }

  private createCombat(encounterId: string, status: 'preparing' | 'active'): CombatSession {
    const encounter = this.encounters.saveEncounter({
      id: encounterId,
      campaignId: String(this.encounters.getRow(encounterId).campaign_id),
      name: String(this.encounters.getRow(encounterId).name),
      notes: String(this.encounters.getRow(encounterId).notes)
    });
    const campaignId = encounter.campaignId;
    const playerSettingById = new Map(this.encounters.listPlayerSettings(encounterId).map((setting) => [setting.playerId, setting]));
    const players = this.players.list(campaignId).filter((player) => player.active && (playerSettingById.get(player.id)?.participating ?? true));
    const groups = this.encounters.listGroups(encounterId);
    const timestamp = now();
    const sessionId = id();

    const combatants: Combatant[] = [];
    for (const player of players) {
      const setting = playerSettingById.get(player.id);
      combatants.push({
        id: id(),
        sessionId,
        templateId: null,
        playerId: player.id,
        name: player.name,
        side: 'player',
        isAlly: false,
        armorClass: player.armorClass,
        baseArmorClass: player.armorClass,
        maxHp: player.maxHp,
        baseMaxHp: player.maxHp,
        currentHp: player.maxHp,
        temporaryHp: 0,
        initiative:
          setting?.initiativeOverride ??
          rollPreparedInitiative(player.initiativeMod, Boolean(setting?.initiativeAdvantage), Boolean(setting?.initiativeDisadvantage)),
        initiativeMod: player.initiativeMod,
        initiativeGroupId: null,
        initiativeMode: 'individual',
        turnOrder: combatants.length,
        effects: [],
        publicNotes: '',
        publicNameVisible: true,
        snapshot: player,
        defeated: false,
        escaped: false,
        visible: true
      });
    }

    if (encounter.lair) {
      combatants.push({
        id: id(),
        sessionId,
        templateId: encounter.lair.templateId,
        playerId: null,
        name: encounter.lair.name,
        side: 'npc',
        isAlly: false,
        armorClass: 0,
        baseArmorClass: 0,
        maxHp: 1,
        baseMaxHp: 1,
        currentHp: 1,
        temporaryHp: 0,
        initiative: 20,
        initiativeMod: 0,
        initiativeGroupId: encounter.lair.id,
        initiativeMode: 'individual',
        turnOrder: combatants.length,
        effects: [],
        publicNotes: encounter.lair.description,
        publicNameVisible: false,
        snapshot: encounter.lair,
        defeated: false,
        escaped: false,
        visible: true
      });
    }

    for (const group of groups) {
      const template = this.creatures.get(group.templateId);
      const sharedInitiative =
        group.initiativeMode === 'group'
          ? (group.initiativeOverride ?? rollPreparedInitiative(template.initiativeMod, group.initiativeAdvantage, group.initiativeDisadvantage))
          : null;
      for (let index = 0; index < group.quantity; index += 1) {
        const suffix = group.quantity > 1 ? ` ${index + 1}` : '';
        const maxHp = rollEncounterGroupHitPoints(group, template);
        combatants.push({
          id: id(),
          sessionId,
          templateId: template.id,
          playerId: null,
          name: `${group.displayName}${suffix}`,
          side: 'npc',
          isAlly: group.isAlly,
          armorClass: template.armorClass,
          baseArmorClass: template.armorClass,
          maxHp,
          baseMaxHp: maxHp,
          currentHp: maxHp,
          temporaryHp: 0,
          initiative:
            sharedInitiative ??
            group.initiativeOverride ??
            rollPreparedInitiative(template.initiativeMod, group.initiativeAdvantage, group.initiativeDisadvantage),
          initiativeMod: template.initiativeMod,
          initiativeGroupId: group.initiativeMode === 'group' ? group.id : null,
          initiativeMode: group.initiativeMode,
          turnOrder: combatants.length,
          effects: [],
          publicNotes: '',
          publicNameVisible: false,
          snapshot: template,
          defeated: false,
          escaped: false,
          visible: true
        });
      }
    }

    const orderedCombatants = assignTurnOrder(combatants);
    const activeCombatantId = orderedCombatants[0]?.id ?? null;
    const turnTimerDeadlineAt = status === 'active' ? createTurnTimerDeadline(this.getPublicDisplaySettings(), orderedCombatants[0], timestamp) : null;

    this.database.sqlite.transaction(() => {
      if (status === 'active') {
        this.database.sqlite
          .prepare(
            'UPDATE combat_sessions SET status = ?, ended_at = ?, turn_timer_deadline_at = NULL, turn_timer_paused_remaining_ms = NULL WHERE campaign_id = ? AND status = ?'
          )
          .run('completed', timestamp, campaignId, 'active');
      }
      // Повторный бросок полностью заменяет прежний незапущенный черновик кампании.
      this.database.sqlite.prepare("DELETE FROM combat_sessions WHERE campaign_id = ? AND status = 'preparing'").run(campaignId);
      this.database.sqlite
        .prepare(
          `
          INSERT INTO combat_sessions (
            id, campaign_id, encounter_id, round, status, active_combatant_id,
            total_xp, xp_per_player, xp_ally_count, started_at, ended_at, turn_timer_deadline_at
          ) VALUES (?, ?, ?, 1, ?, ?, 0, 0, 0, ?, NULL, ?)
        `
        )
        .run(sessionId, campaignId, encounterId, status, activeCombatantId, timestamp, turnTimerDeadlineAt);

      const statement = this.database.sqlite.prepare(
        `
        INSERT INTO combatants (
          id, session_id, template_id, player_id, name, side, is_ally, armor_class, base_armor_class,
          max_hp, base_max_hp, current_hp, temporary_hp, initiative, initiative_roll, initiative_swap_used, initiative_mod, initiative_group_id, initiative_mode,
          turn_order, effects_json, public_notes, public_name_visible, snapshot_json, defeated, escaped, visible
        ) VALUES (
          @id, @sessionId, @templateId, @playerId, @name, @side, @isAlly, @armorClass, @baseArmorClass,
          @maxHp, @baseMaxHp, @currentHp, @temporaryHp, @initiative, @initiativeRoll, @initiativeSwapUsed, @initiativeMod, @initiativeGroupId, @initiativeMode,
          @turnOrder, @effectsJson, @publicNotes, @publicNameVisible, @snapshotJson, @defeated, @escaped, @visible
        )
      `
      );
      for (const combatant of orderedCombatants) {
        statement.run(toCombatantParams(combatant));
      }
    })();

    return this.getCombatSession(sessionId);
  }

  /**
   * Фиксирует отредактированную инициативу и только после этого делает бой активным.
   * Порядок и статус меняются одной транзакцией, поэтому публичное окно не увидит промежуточные значения.
   */
  confirmCombatInitiative(sessionId: string, entries: CombatInitiativeEntry[]): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (session.status !== 'preparing') throw new Error('Подготовка инициативы уже завершена.');

    const initiativeById = new Map(entries.map((entry) => [entry.combatantId, clamp(Math.round(entry.initiative), -100, 200)]));
    const ordered = assignTurnOrder(
      session.combatants.map((combatant) => ({ ...combatant, initiative: initiativeById.get(combatant.id) ?? combatant.initiative }))
    );
    const timestamp = now();
    const turnTimerDeadlineAt = createTurnTimerDeadline(this.getPublicDisplaySettings(), ordered[0], timestamp);

    this.database.sqlite.transaction(() => {
      this.database.sqlite
        .prepare(
          "UPDATE combat_sessions SET status = 'completed', ended_at = ?, turn_timer_deadline_at = NULL, turn_timer_paused_remaining_ms = NULL WHERE campaign_id = ? AND status = 'active'"
        )
        .run(timestamp, session.campaignId);
      const rollById = new Map(entries.map((entry) => [entry.combatantId, entry.roll]));
      const updateCombatant = this.database.sqlite.prepare(
        'UPDATE combatants SET initiative = ?, initiative_roll = COALESCE(?, initiative_roll), turn_order = ? WHERE id = ? AND session_id = ?'
      );
      for (const combatant of ordered)
        updateCombatant.run(combatant.initiative, rollById.get(combatant.id) ?? null, combatant.turnOrder, combatant.id, sessionId);
      this.database.sqlite
        .prepare(
          "UPDATE combat_sessions SET status = 'active', round = 1, active_combatant_id = ?, started_at = ?, ended_at = NULL, turn_timer_deadline_at = ?, turn_timer_paused_remaining_ms = NULL WHERE id = ?"
        )
        .run(ordered[0]?.id ?? null, timestamp, turnTimerDeadlineAt, sessionId);
    })();

    this.initiativeExchangeSources.delete(sessionId);

    return this.getCombatSession(sessionId);
  }

  /** Открывает выбор обмена и сначала сохраняет все ручные правки инициативы из мастерской модалки. */
  beginInitiativeExchange(sessionId: string, sourceCombatantId: string, entries: CombatInitiativeEntry[]): CombatSession {
    const session = this.syncPreparedInitiative(sessionId, entries);
    this.assertExchangeSource(session, sourceCombatantId);
    if (!this.getExchangeCandidates(session, sourceCombatantId).length) {
      throw new Error('Нет доступных союзников для обмена инициативой.');
    }
    this.initiativeExchangeSources.set(sessionId, sourceCombatantId);
    return this.getCombatSession(sessionId);
  }

  /** Меняет именно итоговые значения инициативы, сохраняя исходные броски d20 для понятного отображения формулы. */
  swapCombatInitiative(sessionId: string, sourceCombatantId: string, targetCombatantId: string): CombatSession {
    const session = this.getCombatSession(sessionId);
    this.assertExchangeSource(session, sourceCombatantId);
    if (this.initiativeExchangeSources.get(sessionId) !== sourceCombatantId) {
      throw new Error('Выбор обмена инициативой уже закрыт.');
    }
    const target = this.getExchangeCandidates(session, sourceCombatantId).find((candidate) => candidate.id === targetCombatantId);
    if (!target) throw new Error('С этим существом нельзя обменяться инициативой.');
    const source = session.combatants.find((combatant) => combatant.id === sourceCombatantId)!;
    const swapped = assignTurnOrder(
      session.combatants.map((combatant) => {
        if (combatant.id === source.id) return { ...combatant, initiative: target.initiative };
        if (combatant.id === target.id) return { ...combatant, initiative: source.initiative };
        return combatant;
      })
    );

    this.database.sqlite.transaction(() => {
      const update = this.database.sqlite.prepare(
        'UPDATE combatants SET initiative = ?, initiative_swap_used = CASE WHEN id = ? THEN 1 ELSE initiative_swap_used END, turn_order = ? WHERE id = ? AND session_id = ?'
      );
      for (const combatant of swapped) update.run(combatant.initiative, source.id, combatant.turnOrder, combatant.id, sessionId);
    })();
    this.initiativeExchangeSources.delete(sessionId);
    return this.getCombatSession(sessionId);
  }

  cancelInitiativeExchange(sessionId: string): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (session.status !== 'preparing') throw new Error('Подготовка инициативы уже завершена.');
    this.initiativeExchangeSources.delete(sessionId);
    return session;
  }

  /** Удаляет незапущенный бой при закрытии модалки мастером. */
  cancelCombatPreparation(sessionId: string): void {
    this.initiativeExchangeSources.delete(sessionId);
    this.database.sqlite.prepare("DELETE FROM combat_sessions WHERE id = ? AND status = 'preparing'").run(sessionId);
  }

  /**
   * Добавляет NPC в активную сессию по локальному статблоку и заново вычисляет порядок инициативы.
   * Текущий участник не меняется: мастер продолжает тот же ход, даже если новый NPC оказался выше в списке.
   */
  addCombatantsToCombat(input: AddCombatantsToCombatInput): CombatSession {
    const session = this.getCombatSession(input.sessionId);
    if (session.status !== 'active') throw new Error('Добавлять существ можно только в активный бой.');

    if (!input.groups.length) throw new Error('Добавьте хотя бы одно существо.');
    if (input.groups.reduce((sum, group) => sum + Math.max(0, Math.round(group.quantity)), 0) > 100) {
      throw new Error('За один раз можно добавить не более 100 существ.');
    }

    const usedNames = new Set(session.combatants.map((combatant) => combatant.name));
    const added: Combatant[] = [];

    for (const group of input.groups) {
      const template = this.creatures.get(group.templateId);
      if (template.campaignId !== session.campaignId) throw new Error('Статблок принадлежит другой кампании.');

      const quantity = clamp(Math.round(group.quantity), 1, 50);
      const initiativeRoll = clamp(Math.round(group.initiativeRoll), 1, 20);
      const initiativeBonus = clamp(Math.round(group.initiativeBonus), -50, 50);
      const initiative = initiativeRoll + initiativeBonus;
      const initiativeGroupId = quantity > 1 ? id() : null;

      for (let index = 0; index < quantity; index += 1) {
        let suffix = quantity > 1 ? index + 1 : 0;
        let name = suffix ? `${template.name} ${suffix}` : template.name;
        while (usedNames.has(name)) {
          suffix = Math.max(2, suffix + 1);
          name = `${template.name} ${suffix}`;
        }
        usedNames.add(name);
        const maxHp =
          group.hpMode === 'random'
            ? rollHitDiceExpression(template.hitDice, template.hitPoints)
            : group.hpMode === 'fixed' && group.hpOverride != null
              ? clamp(Math.round(group.hpOverride), 1, 9999)
              : Math.max(1, Math.round(template.hitPoints));

        added.push({
          id: id(),
          sessionId: session.id,
          templateId: template.id,
          playerId: null,
          name,
          side: 'npc',
          isAlly: false,
          armorClass: template.armorClass,
          baseArmorClass: template.armorClass,
          maxHp,
          baseMaxHp: maxHp,
          currentHp: maxHp,
          temporaryHp: 0,
          initiative,
          initiativeMod: initiativeBonus,
          initiativeGroupId,
          initiativeMode: quantity > 1 ? 'group' : 'individual',
          turnOrder: session.combatants.length + added.length,
          effects: [],
          publicNotes: '',
          publicNameVisible: false,
          snapshot: template,
          defeated: false,
          escaped: false,
          visible: true
        });
      }
    }
    const ordered = assignTurnOrder([...session.combatants, ...added]);

    this.database.sqlite.transaction(() => {
      const insert = this.database.sqlite.prepare(
        `
        INSERT INTO combatants (
          id, session_id, template_id, player_id, name, side, is_ally, armor_class, base_armor_class,
          max_hp, base_max_hp, current_hp, temporary_hp, initiative, initiative_roll, initiative_swap_used, initiative_mod, initiative_group_id, initiative_mode,
          turn_order, effects_json, public_notes, public_name_visible, snapshot_json, defeated, escaped, visible
        ) VALUES (
          @id, @sessionId, @templateId, @playerId, @name, @side, @isAlly, @armorClass, @baseArmorClass,
          @maxHp, @baseMaxHp, @currentHp, @temporaryHp, @initiative, @initiativeRoll, @initiativeSwapUsed, @initiativeMod, @initiativeGroupId, @initiativeMode,
          @turnOrder, @effectsJson, @publicNotes, @publicNameVisible, @snapshotJson, @defeated, @escaped, @visible
        )
      `
      );
      for (const combatant of added) insert.run(toCombatantParams(combatant));

      const updateOrder = this.database.sqlite.prepare('UPDATE combatants SET turn_order = ? WHERE id = ? AND session_id = ?');
      for (const combatant of ordered) updateOrder.run(combatant.turnOrder, combatant.id, session.id);
    })();

    return this.getCombatSession(session.id);
  }

  getCombatSession(sessionId: string): CombatSession {
    const sessionRow = this.database.sqlite.prepare('SELECT * FROM combat_sessions WHERE id = ?').get(sessionId) as Row | undefined;
    if (!sessionRow) throw new Error('Бой не найден.');
    return this.rowToCombatSession(sessionRow);
  }

  /**
   * Частично обновляет участника боя и поддерживает связанные правила.
   * При поражении хиты обнуляются, концентрация снимается, а обязательные состояния добавляются автоматически.
   */
  updateCombatant(idToUpdate: string, patch: CombatantPatch): CombatSession {
    const current = this.database.sqlite.prepare('SELECT * FROM combatants WHERE id = ?').get(idToUpdate) as Row | undefined;
    if (!current) throw new Error('Участник боя не найден.');

    const values: Record<string, unknown> = { id: idToUpdate };
    const updates: string[] = [];
    const set = (column: string, key: string, value: unknown): void => {
      updates.push(`${column} = @${key}`);
      values[key] = value;
    };

    let defeatedAfterPatch: boolean | null = null;
    let currentHpForWrite: number | undefined;
    let maxHpForWrite: number | undefined;
    let temporaryHpForWrite: number | undefined;
    const snapshot = parseJson<Combatant['snapshot']>(current.snapshot_json, null);
    const immuneStatusIds = getConditionImmunityStatusIds(snapshot && 'conditionImmunities' in snapshot ? snapshot.conditionImmunities : '');
    let effectsForWrite: CombatEffect[] | undefined = patch.effects ? removeStatusEffects(patch.effects, [...immuneStatusIds]) : undefined;

    if (patch.armorClass !== undefined) set('armor_class', 'armorClass', clamp(Math.round(patch.armorClass), 0, 60));
    if (patch.maxHp !== undefined) {
      maxHpForWrite = clamp(Math.round(patch.maxHp), 1, 9999);
      set('max_hp', 'maxHp', maxHpForWrite);
    }
    if (patch.currentHp !== undefined) {
      currentHpForWrite = normalizeHp(patch.currentHp, maxHpForWrite ?? Number(current.max_hp));
      if (patch.defeated === undefined) {
        defeatedAfterPatch = currentHpForWrite <= 0;
        set('defeated', 'defeated', defeatedAfterPatch ? 1 : 0);
      }
    } else if (maxHpForWrite !== undefined) {
      currentHpForWrite = normalizeHp(Number(current.current_hp), maxHpForWrite);
    }
    if (patch.temporaryHp !== undefined) {
      temporaryHpForWrite = clamp(Math.round(patch.temporaryHp), 0, 9999);
    }
    if (patch.initiative !== undefined) set('initiative', 'initiative', Math.round(patch.initiative));
    if (patch.turnOrder !== undefined) set('turn_order', 'turnOrder', Math.max(0, Math.round(patch.turnOrder)));
    if (patch.publicNotes !== undefined) set('public_notes', 'publicNotes', patch.publicNotes);
    if (patch.publicNameVisible !== undefined) set('public_name_visible', 'publicNameVisible', patch.publicNameVisible ? 1 : 0);
    if (patch.defeated !== undefined) {
      defeatedAfterPatch = patch.defeated;
      set('defeated', 'defeatedPatch', patch.defeated ? 1 : 0);
      if (patch.defeated) set('escaped', 'escapedForDefeated', 0);
    }
    if (patch.escaped !== undefined) {
      set('escaped', 'escaped', patch.escaped ? 1 : 0);
      if (patch.escaped) set('defeated', 'defeatedForEscaped', 0);
    }
    if (patch.visible !== undefined) set('visible', 'visible', patch.visible ? 1 : 0);

    if (defeatedAfterPatch === true && Number(current.max_hp) > 0) {
      currentHpForWrite = 0;
      temporaryHpForWrite = 0;
      effectsForWrite = addStatusEffects(
        removeStatusEffects(effectsForWrite ?? parseJson<CombatEffect[]>(current.effects_json, []), [CONCENTRATION_STATUS_ID]),
        UNCONSCIOUS_DEPENDENCY_STATUS_IDS,
        id,
        immuneStatusIds
      );
    }
    if (currentHpForWrite !== undefined) set('current_hp', 'currentHp', currentHpForWrite);
    if (temporaryHpForWrite !== undefined) set('temporary_hp', 'temporaryHp', temporaryHpForWrite);
    if (effectsForWrite !== undefined) set('effects_json', 'effectsJson', json(effectsForWrite));

    if (updates.length) {
      this.database.sqlite.prepare(`UPDATE combatants SET ${updates.join(', ')} WHERE id = @id`).run(values);
    }

    return this.getCombatSession(String(current.session_id));
  }

  reorderCombatants(sessionId: string, orderedIds: string[]): CombatSession {
    this.database.sqlite.transaction(() => {
      const statement = this.database.sqlite.prepare('UPDATE combatants SET turn_order = ? WHERE id = ? AND session_id = ?');
      orderedIds.forEach((combatantId, index) => statement.run(index, combatantId, sessionId));
    })();
    return this.getCombatSession(sessionId);
  }

  setActiveCombatant(sessionId: string, combatantId: string): CombatSession {
    const exists = this.database.sqlite.prepare('SELECT id FROM combatants WHERE id = ? AND session_id = ?').get(combatantId, sessionId) as Row | undefined;
    if (!exists) throw new Error('Участник не входит в этот бой.');

    const session = this.getCombatSession(sessionId);
    if (session.activeCombatantId === combatantId) return session;
    const nextCombatant = session.combatants.find((combatant) => combatant.id === combatantId);
    const deadline = session.status === 'active' ? createTurnTimerDeadline(this.getPublicDisplaySettings(), nextCombatant) : null;
    this.database.sqlite
      .prepare('UPDATE combat_sessions SET active_combatant_id = ?, turn_timer_deadline_at = ?, turn_timer_paused_remaining_ms = NULL WHERE id = ?')
      .run(combatantId, deadline, sessionId);
    return this.getCombatSession(sessionId);
  }

  advanceTurn(sessionId: string): CombatSession {
    return this.moveTurn(sessionId, 1);
  }

  retreatTurn(sessionId: string): CombatSession {
    return this.moveTurn(sessionId, -1);
  }

  endRound(sessionId: string): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (!session.combatants.length) return session;

    const ordered = [...session.combatants].sort((a, b) => a.turnOrder - b.turnOrder);
    const deadline = createTurnTimerDeadline(this.getPublicDisplaySettings(), ordered[0]);
    this.database.sqlite.transaction(() => {
      this.tickSessionTimedEffects(sessionId, 1);
      this.database.sqlite
        .prepare(
          'UPDATE combat_sessions SET active_combatant_id = ?, round = ?, turn_timer_deadline_at = ?, turn_timer_paused_remaining_ms = NULL WHERE id = ?'
        )
        .run(ordered[0].id, session.round + 1, deadline, sessionId);
    })();
    return this.getCombatSession(sessionId);
  }

  advanceRound(sessionId: string): CombatSession {
    return this.shiftRound(sessionId, 1);
  }

  retreatRound(sessionId: string): CombatSession {
    return this.shiftRound(sessionId, -1);
  }

  /**
   * При паузе сохраняет остаток в базе, а при продолжении превращает его
   * обратно в абсолютный дедлайн. Оба окна поэтому остаются синхронными без
   * ежесекундных IPC-сообщений, а пауза переживает перезапуск приложения.
   */
  toggleTurnTimerPause(sessionId: string): CombatSession {
    const session = this.getCombatSession(sessionId);
    const settings = this.getPublicDisplaySettings();
    const activeCombatant = session.combatants.find((combatant) => combatant.id === session.activeCombatantId);
    if (session.status !== 'active' || !settings.turnTimerEnabled || !activeCombatant) return session;
    if (settings.skipNpcTurnTimer && activeCombatant.side === 'npc') return session;

    if (session.turnTimerPausedRemainingMs !== null) {
      const deadline = new Date(Date.now() + Math.max(0, session.turnTimerPausedRemainingMs)).toISOString();
      this.database.sqlite
        .prepare('UPDATE combat_sessions SET turn_timer_deadline_at = ?, turn_timer_paused_remaining_ms = NULL WHERE id = ?')
        .run(deadline, sessionId);
    } else {
      const parsedDeadline = session.turnTimerDeadlineAt ? Date.parse(session.turnTimerDeadlineAt) : Number.NaN;
      const remainingMilliseconds = Number.isFinite(parsedDeadline) ? Math.max(0, parsedDeadline - Date.now()) : settings.turnTimerSeconds * 1000;
      this.database.sqlite
        .prepare('UPDATE combat_sessions SET turn_timer_deadline_at = NULL, turn_timer_paused_remaining_ms = ? WHERE id = ?')
        .run(remainingMilliseconds, sessionId);
    }

    return this.getCombatSession(sessionId);
  }

  private moveTurn(sessionId: string, direction: 1 | -1): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (!session.combatants.length) return session;

    const ordered = [...session.combatants].sort((a, b) => a.turnOrder - b.turnOrder);
    const currentIndex = Math.max(
      0,
      ordered.findIndex((combatant) => combatant.id === session.activeCombatantId)
    );
    if (direction === -1 && session.round <= 1 && currentIndex === 0) {
      return session;
    }

    const nextIndex =
      direction === 1 ? (currentIndex + 1 >= ordered.length ? 0 : currentIndex + 1) : currentIndex - 1 < 0 ? ordered.length - 1 : currentIndex - 1;
    const nextRound =
      direction === 1 && nextIndex === 0 ? session.round + 1 : direction === -1 && currentIndex === 0 ? Math.max(1, session.round - 1) : session.round;
    const deadline = createTurnTimerDeadline(this.getPublicDisplaySettings(), ordered[nextIndex]);

    this.database.sqlite.transaction(() => {
      if (nextRound > session.round) this.tickSessionTimedEffects(sessionId, nextRound - session.round);
      this.database.sqlite
        .prepare(
          'UPDATE combat_sessions SET active_combatant_id = ?, round = ?, turn_timer_deadline_at = ?, turn_timer_paused_remaining_ms = NULL WHERE id = ?'
        )
        .run(ordered[nextIndex].id, nextRound, deadline, sessionId);
    })();
    return this.getCombatSession(sessionId);
  }

  /** Перемещает номер раунда целиком; при движении вперёд также уменьшает таймеры эффектов. */
  private shiftRound(sessionId: string, direction: 1 | -1): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (!session.combatants.length) return session;
    const nextRound = Math.max(1, session.round + direction);
    if (nextRound === session.round) return session;

    const activeCombatant = session.combatants.find((combatant) => combatant.id === session.activeCombatantId);
    const deadline = createTurnTimerDeadline(this.getPublicDisplaySettings(), activeCombatant);
    this.database.sqlite.transaction(() => {
      if (nextRound > session.round) this.tickSessionTimedEffects(sessionId, nextRound - session.round);
      this.database.sqlite
        .prepare('UPDATE combat_sessions SET round = ?, turn_timer_deadline_at = ?, turn_timer_paused_remaining_ms = NULL WHERE id = ?')
        .run(nextRound, deadline, sessionId);
    })();
    return this.getCombatSession(sessionId);
  }

  /** Обновляет все временные эффекты одной транзакцией вместе с переходом хода или раунда. */
  private tickSessionTimedEffects(sessionId: string, rounds: number): void {
    const rows = this.database.sqlite.prepare('SELECT id, effects_json FROM combatants WHERE session_id = ?').all(sessionId) as Row[];
    const statement = this.database.sqlite.prepare('UPDATE combatants SET effects_json = ? WHERE id = ?');
    for (const row of rows) {
      const effects = parseJson<CombatEffect[]>(row.effects_json, []);
      const nextEffects = tickTimedEffects(effects, rounds);
      if (json(nextEffects) !== json(effects)) {
        statement.run(json(nextEffects), String(row.id));
      }
    }
  }

  /** Завершает сессию, сохраняет начисленный опыт и возвращает готовую модель итоговой модалки. */
  completeCombat(sessionId: string, options: CompleteCombatOptions = { defeatedGiveXp: true, escapedXpMode: 'none' }): CompleteCombatResult {
    const session = this.getCombatSession(sessionId);
    const participatingPlayers = session.combatants.filter((combatant) => combatant.side === 'player').map(() => ({ active: true }));
    const result = calculateExperience(session.combatants, participatingPlayers, options);
    const endedAt = now();

    this.database.sqlite
      .prepare(
        `
        UPDATE combat_sessions
        SET status = 'completed', total_xp = ?, xp_per_player = ?, xp_ally_count = ?, ended_at = ?,
            turn_timer_deadline_at = NULL, turn_timer_paused_remaining_ms = NULL
        WHERE id = ?
      `
      )
      .run(result.totalXp, result.xpPerPlayer, result.allyRecipientCount, endedAt, sessionId);

    return {
      session: this.getCombatSession(sessionId),
      defeatedNpcCount: result.defeatedNpcCount,
      escapedNpcCount: result.escapedNpcCount,
      activePlayerCount: result.playerCount,
      xpAward: result
    };
  }

  /** Собирает только разрешённые для игроков данные активного или последнего завершённого боя. */
  getPlayerView(campaignId: string): PublicCombatView {
    const session = this.getActiveSession(campaignId);
    const featureCard = this.publicFeatureCards.get(campaignId) ?? null;
    const settings = this.getPublicDisplaySettings();
    const preparingSession = this.getPreparingSession(campaignId);
    const initiativeExchange = preparingSession ? this.getInitiativeExchangePrompt(preparingSession) : null;
    return session
      ? {
          round: session.round,
          combatants: toPublicCombatants(session.combatants, session.activeCombatantId),
          settings,
          turnTimerDeadlineAt: session.turnTimerDeadlineAt,
          turnTimerPausedRemainingMs: session.turnTimerPausedRemainingMs,
          featureCard,
          initiativeExchange
        }
      : {
          round: 1,
          combatants: [],
          settings,
          turnTimerDeadlineAt: null,
          turnTimerPausedRemainingMs: null,
          featureCard,
          initiativeExchange,
          xpAward: this.getLatestCompletedXpAward(campaignId)
        };
  }

  private syncPreparedInitiative(sessionId: string, entries: CombatInitiativeEntry[]): CombatSession {
    const session = this.getCombatSession(sessionId);
    if (session.status !== 'preparing') throw new Error('Подготовка инициативы уже завершена.');
    const entryById = new Map(entries.map((entry) => [entry.combatantId, entry]));
    const ordered = assignTurnOrder(
      session.combatants.map((combatant) => ({
        ...combatant,
        initiative: clamp(Math.round(entryById.get(combatant.id)?.initiative ?? combatant.initiative), -100, 200)
      }))
    );
    this.database.sqlite.transaction(() => {
      const update = this.database.sqlite.prepare(
        'UPDATE combatants SET initiative = ?, initiative_roll = COALESCE(?, initiative_roll), turn_order = ? WHERE id = ? AND session_id = ?'
      );
      for (const combatant of ordered) {
        update.run(combatant.initiative, entryById.get(combatant.id)?.roll ?? null, combatant.turnOrder, combatant.id, sessionId);
      }
    })();
    return this.getCombatSession(sessionId);
  }

  private assertExchangeSource(session: CombatSession, sourceCombatantId: string): void {
    if (session.status !== 'preparing') throw new Error('Обмен инициативой доступен только перед началом боя.');
    const source = session.combatants.find((combatant) => combatant.id === sourceCombatantId);
    const playerSnapshot = source?.snapshot && 'alertInitiativeSwap' in source.snapshot ? source.snapshot : null;
    if (!source || source.side !== 'player' || !playerSnapshot?.alertInitiativeSwap) {
      throw new Error('У персонажа нет черты «Бдительный: Обмен Инициативой».');
    }
    if (source.initiativeSwapUsed) throw new Error('Этот персонаж уже использовал обмен инициативой.');
    if (this.isIncapacitated(source)) throw new Error('Недееспособный персонаж не может обмениваться инициативой.');
  }

  private getExchangeCandidates(session: CombatSession, sourceCombatantId: string): Combatant[] {
    return session.combatants.filter(
      (combatant) =>
        combatant.id !== sourceCombatantId && (combatant.side === 'player' || combatant.isAlly) && !combatant.defeated && !this.isIncapacitated(combatant)
    );
  }

  private isIncapacitated(combatant: Combatant): boolean {
    return combatant.effects.some((effect) => effect.statusId === INCAPACITATED_STATUS_ID);
  }

  private getInitiativeExchangePrompt(session: CombatSession): InitiativeExchangePrompt | null {
    const sourceCombatantId = this.initiativeExchangeSources.get(session.id);
    if (!sourceCombatantId) return null;
    const source = session.combatants.find((combatant) => combatant.id === sourceCombatantId);
    if (!source) return null;
    return {
      sessionId: session.id,
      sourceCombatantId,
      sourceName: source.name,
      sourceInitiative: source.initiative,
      candidates: this.getExchangeCandidates(session, sourceCombatantId).map((candidate) => ({
        combatantId: candidate.id,
        name: candidate.name,
        initiative: candidate.initiative,
        side: candidate.side,
        isAlly: candidate.isAlly
      }))
    };
  }

  showPublicFeatureCard(campaignId: string, card: PublicFeatureCard): void {
    this.publicFeatureCards.set(campaignId, card);
  }

  dismissPublicFeatureCard(campaignId: string): void {
    this.publicFeatureCards.delete(campaignId);
  }

  dismissCombatXpAward(sessionId: string): string {
    const session = this.getCombatSession(sessionId);
    this.dismissedXpAwardSessionIds.add(sessionId);
    return session.campaignId;
  }

  private getLatestCompletedXpAward(campaignId: string): CombatXpAward | null {
    const session = this.getLatestCompletedSession(campaignId);
    if (!session || session.endedAt == null) return null;
    if (this.dismissedXpAwardSessionIds.has(session.id)) return null;
    const playerCount = session.combatants.filter((combatant) => combatant.side === 'player').length;
    const defeatedNpcCount = session.combatants.filter(
      (combatant) => combatant.side === 'npc' && !combatant.isAlly && !combatant.escaped && (combatant.defeated || combatant.currentHp <= 0)
    ).length;
    const escapedNpcCount = session.combatants.filter((combatant) => combatant.side === 'npc' && !combatant.isAlly && combatant.escaped).length;
    return {
      totalXp: session.totalXp,
      xpPerPlayer: session.xpPerPlayer,
      playerCount,
      allyRecipientCount: session.xpAllyCount,
      recipientCount: playerCount + session.xpAllyCount,
      defeatedNpcCount,
      escapedNpcCount,
      xpAdjustment: 0,
      customPool: false
    };
  }

  private getActiveSession(campaignId: string): CombatSession | null {
    const row = this.database.sqlite
      .prepare("SELECT * FROM combat_sessions WHERE campaign_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
      .get(campaignId) as Row | undefined;
    return row ? this.rowToCombatSession(row) : null;
  }

  private getPreparingSession(campaignId: string): CombatSession | null {
    const row = this.database.sqlite
      .prepare("SELECT * FROM combat_sessions WHERE campaign_id = ? AND status = 'preparing' ORDER BY started_at DESC LIMIT 1")
      .get(campaignId) as Row | undefined;
    return row ? this.rowToCombatSession(row) : null;
  }

  private getLatestCompletedSession(campaignId: string): CombatSession | null {
    const row = this.database.sqlite
      .prepare("SELECT * FROM combat_sessions WHERE campaign_id = ? AND status = 'completed' ORDER BY ended_at DESC, started_at DESC LIMIT 1")
      .get(campaignId) as Row | undefined;
    return row ? this.rowToCombatSession(row) : null;
  }

  /** Перезапускает таймеры активных сессий после изменения глобальных настроек таймера. */
  private resetActiveTurnTimers(settings: PublicDisplaySettings): void {
    const rows = this.database.sqlite
      .prepare(
        `
        SELECT sessions.id, combatants.side
        FROM combat_sessions AS sessions
        LEFT JOIN combatants ON combatants.id = sessions.active_combatant_id
        WHERE sessions.status = 'active'
      `
      )
      .all() as Row[];
    const timestamp = now();
    const update = this.database.sqlite.prepare('UPDATE combat_sessions SET turn_timer_deadline_at = ?, turn_timer_paused_remaining_ms = NULL WHERE id = ?');

    this.database.sqlite.transaction(() => {
      for (const row of rows) {
        const activeCombatant = row.side === 'player' ? ({ side: 'player' } as const) : row.side === 'npc' ? ({ side: 'npc' } as const) : undefined;
        update.run(createTurnTimerDeadline(settings, activeCombatant, timestamp), String(row.id));
      }
    })();
  }

  private rowToCombatSession(row: Row): CombatSession {
    const lair = this.encounters.getLair(String(row.encounter_id));
    const combatants = this.database.sqlite
      .prepare('SELECT * FROM combatants WHERE session_id = ? ORDER BY turn_order ASC, initiative DESC')
      .all(String(row.id))
      .map((combatantRow) => combatantRow as Row)
      .map(rowToCombatant)
      .map((combatant) => hydrateLairCombatant(combatant, lair));

    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      encounterId: String(row.encounter_id),
      round: Number(row.round),
      status: row.status === 'completed' ? 'completed' : row.status === 'preparing' ? 'preparing' : 'active',
      activeCombatantId: row.active_combatant_id ? String(row.active_combatant_id) : null,
      totalXp: Number(row.total_xp),
      xpPerPlayer: Number(row.xp_per_player),
      xpAllyCount: Number(row.xp_ally_count ?? 0),
      startedAt: String(row.started_at),
      endedAt: row.ended_at ? String(row.ended_at) : null,
      turnTimerDeadlineAt: row.turn_timer_deadline_at ? String(row.turn_timer_deadline_at) : null,
      turnTimerPausedRemainingMs:
        row.turn_timer_paused_remaining_ms === null || row.turn_timer_paused_remaining_ms === undefined
          ? null
          : Math.max(0, Number(row.turn_timer_paused_remaining_ms)),
      combatants
    };
  }
}

function turnTimerSettingsChanged(previous: PublicDisplaySettings, next: PublicDisplaySettings): boolean {
  return (
    previous.turnTimerEnabled !== next.turnTimerEnabled ||
    previous.turnTimerSeconds !== next.turnTimerSeconds ||
    previous.skipNpcTurnTimer !== next.skipNpcTurnTimer
  );
}

/** Вычисляет абсолютный срок хода, общий для мастерского и публичного окон. */
function createTurnTimerDeadline(settings: PublicDisplaySettings, combatant: Pick<Combatant, 'side'> | undefined, startedAt = now()): string | null {
  if (!settings.turnTimerEnabled || !combatant) return null;
  if (settings.skipNpcTurnTimer && combatant.side === 'npc') return null;
  return new Date(Date.parse(startedAt) + settings.turnTimerSeconds * 1000).toISOString();
}

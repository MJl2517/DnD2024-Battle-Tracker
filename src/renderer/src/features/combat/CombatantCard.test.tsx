import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Combatant, CreatureTemplate } from '@shared/types';
import { INCAPACITATED_STATUS_ID, PRONE_STATUS_ID, UNCONSCIOUS_STATUS_ID } from '@shared/statusEffects';
import { CombatantCard } from './CombatantCard';

const callbacks = {
  onSetActive: vi.fn(),
  onDamage: vi.fn(),
  onHeal: vi.fn(),
  onDefeated: vi.fn(),
  onEscaped: vi.fn(),
  onEffects: vi.fn(),
  onPublicNameVisible: vi.fn(),
  onStats: vi.fn()
};

beforeEach(() => {
  Object.values(callbacks).forEach((callback) => callback.mockClear());
});

function creatureSnapshot(conditionImmunities: string): CreatureTemplate {
  return {
    id: 'creature',
    campaignId: 'campaign',
    name: 'Тестовое существо',
    originalName: 'Test Creature',
    size: 'Средний',
    creatureType: 'Жижа',
    alignment: 'Без мировоззрения',
    armorClass: 15,
    initiativeMod: 2,
    initiativeScore: 12,
    hitPoints: 20,
    hitDice: '3d8 + 6',
    speeds: '30 футов',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    savingThrows: {},
    skills: '',
    vulnerabilities: '',
    resistances: '',
    immunities: '',
    conditionImmunities,
    senses: '',
    languages: '',
    challengeRating: '1',
    xp: 200,
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function combatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'combatant',
    sessionId: 'session',
    playerId: null,
    templateId: null,
    name: 'Тестовое существо',
    side: 'npc',
    isAlly: false,
    armorClass: 15,
    baseArmorClass: 15,
    maxHp: 20,
    baseMaxHp: 20,
    currentHp: 20,
    temporaryHp: 0,
    initiative: 12,
    initiativeMod: 2,
    initiativeGroupId: null,
    initiativeMode: 'individual',
    turnOrder: 0,
    effects: [],
    publicNotes: '',
    publicNameVisible: false,
    snapshot: null,
    defeated: false,
    escaped: false,
    visible: true,
    ...overrides
  };
}

function cardProps(currentCombatant: Combatant) {
  return {
    ...callbacks,
    combatant: currentCombatant,
    campaignId: 'campaign',
    index: 0,
    active: false,
    busy: false,
    showNameVisibilityControl: false
  };
}

describe('CombatantCard compact mode', () => {
  it('скрывает редактор эффектов, но оставляет назначенные эффекты, хиты и действия', () => {
    render(
      <CombatantCard
        {...cardProps(
          combatant({
            effects: [{ id: 'effect', label: 'Испытание героя', public: true }]
          })
        )}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть карточку: Тестовое существо' }));

    expect(screen.queryByLabelText('Состояния и эффекты')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Активные состояния и эффекты')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать эффект Испытание героя' })).toBeInTheDocument();
    expect(screen.getByLabelText('Управление хитами')).toBeInTheDocument();
    expect(screen.getByLabelText('Действия карточки')).toBeInTheDocument();
  });

  it('автоматически сворачивается после поражения существа', async () => {
    const { rerender } = render(<CombatantCard {...cardProps(combatant())} />);

    rerender(<CombatantCard {...cardProps(combatant({ defeated: true, currentHp: 0 }))} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Раскрыть карточку: Тестовое существо' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Состояния и эффекты')).not.toBeInTheDocument();
    expect(screen.getByText('Побеждён')).toBeInTheDocument();
  });

  it('блокирует невосприимчивое состояние и не добавляет его после поражения', () => {
    render(<CombatantCard {...cardProps(combatant({ snapshot: creatureSnapshot('Распластанность') }))} />);

    fireEvent.click(screen.getByRole('button', { name: 'Выбрать эффект' }));
    expect(screen.getByRole('option', { name: /Опрокинутый/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Побеждён' }));
    const assignedEffects = callbacks.onEffects.mock.calls[0]?.[0];
    const assignedStatusIds = assignedEffects.map((effect: { statusId?: string }) => effect.statusId);

    expect(assignedStatusIds).toContain(UNCONSCIOUS_STATUS_ID);
    expect(assignedStatusIds).toContain(INCAPACITATED_STATUS_ID);
    expect(assignedStatusIds).not.toContain(PRONE_STATUS_ID);
  });
});

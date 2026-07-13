import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Combatant } from '@shared/types';
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
});

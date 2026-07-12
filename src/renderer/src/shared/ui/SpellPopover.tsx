import type { SpellCard } from '@shared/types';
import { positionAnchoredPopover, type PopoverAnchor } from '../lib/popover';
export function SpellPopover({
  state,
  onMouseEnter,
  onMouseLeave
}: {
  state: { spell: SpellCard | null; anchor: PopoverAnchor; loading: boolean; error?: string };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): JSX.Element {
  const width = Math.min(500, window.innerWidth - 48);
  const maxHeight = Math.min(560, window.innerHeight - 48);
  const { left, top } = positionAnchoredPopover(state.anchor, width, maxHeight, 24, 10);
  const popoverProps = {
    className: 'spell-popover',
    style: { left, top },
    onMouseEnter,
    onMouseLeave
  };

  if (state.loading) {
    return <aside {...popoverProps}>Загрузка заклинания...</aside>;
  }

  if (state.error || !state.spell) {
    return <aside {...popoverProps}>{state.error ?? 'Заклинание не найдено.'}</aside>;
  }

  const spell = state.spell;
  return (
    <aside {...popoverProps}>
      <header className="spell-popover-header">
        <div>
          <h3>{spell.name}</h3>
          {spell.originalName && <p>{spell.originalName}</p>}
        </div>
        {spell.source && <span>{spell.source}</span>}
      </header>
      <dl className="spell-popover-grid">
        <SpellMeta label="Уровень" value={spell.level} />
        <SpellMeta label="Школа" value={spell.school} />
        <SpellMeta label="Время" value={spell.castingTime} />
        <SpellMeta label="Дистанция" value={spell.range} />
        <SpellMeta label="Длительность" value={spell.duration} />
        <SpellMeta label="Цель" value={spell.target} />
        <SpellMeta label="Область" value={spell.area} />
        <SpellMeta label="Испытание" value={spell.save} />
        <SpellMeta label="Урон" value={spell.damage} />
        <SpellMeta label="Компоненты" value={spell.components} wide />
      </dl>
      <div className="spell-popover-text" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml }} />
    </aside>
  );
}

function SpellMeta({ label, value, wide = false }: { label: string; value: string; wide?: boolean }): JSX.Element | null {
  if (!value) return null;
  return (
    <div className={wide ? 'wide' : ''}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

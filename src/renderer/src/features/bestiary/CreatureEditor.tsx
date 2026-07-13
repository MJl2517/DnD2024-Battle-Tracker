import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Save, Skull, Trash2 } from 'lucide-react';
import type { AbilityBlock, CreatureFeature, SaveCreatureTemplateInput } from '@shared/types';
import { ImageUrlInput } from '../../shared/ui/ImageUrlInput';
import { HoldDeleteButton } from '../../shared/ui/HoldDeleteButton';
import { clientId } from '../../shared/lib/ids';
import { readNumber } from '../../shared/lib/numbers';
export function CreatureEditor({
  draft,
  busy,
  onDraft,
  onSave,
  onDelete
}: {
  draft: SaveCreatureTemplateInput;
  busy: boolean;
  onDraft: (creature: SaveCreatureTemplateInput) => void;
  onSave: (event: FormEvent) => Promise<void>;
  onDelete?: () => Promise<void>;
}): JSX.Element {
  useEffect(() => {
    function handleWheel(event: WheelEvent): void {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLTextAreaElement)) return;
      if (!activeElement.closest('.stat-editor')) return;
      if (activeElement.scrollHeight <= activeElement.clientHeight) return;

      event.preventDefault();
      event.stopPropagation();
      activeElement.scrollTop += event.deltaY;
    }

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  return (
    <div className="panel stat-editor">
      <div className="panel-title split">
        <div className="panel-title inline-title">
          <Skull size={22} />
          <h2>Статблок NPC</h2>
        </div>
        {onDelete && <HoldDeleteButton label="Удалить статблок NPC" disabled={busy} onConfirm={onDelete} />}
      </div>
      <form className="stat-editor-form" onSubmit={(event) => void onSave(event)}>
        <div className="stat-editor-sections">
          <StatEditorSection title="Основное" description="Имя, размер и тип существа" defaultOpen>
            <div className="form-grid">
              <label>
                Имя
                <input value={draft.name} onChange={(event) => onDraft({ ...draft, name: event.target.value })} placeholder="Например: Паровой мефит" />
              </label>
              <label>
                Оригинал
                <input
                  value={draft.originalName}
                  onChange={(event) => onDraft({ ...draft, originalName: event.target.value })}
                  placeholder="Например: Steam Mephit"
                />
              </label>
              <label>
                Размер
                <input value={draft.size} onChange={(event) => onDraft({ ...draft, size: event.target.value })} placeholder="Например: Небольшой или Средний" />
              </label>
              <label>
                Тип
                <input
                  value={draft.creatureType}
                  onChange={(event) => onDraft({ ...draft, creatureType: event.target.value })}
                  placeholder="Например: Элементаль, Гуманоид, Дракон"
                />
              </label>
            </div>
          </StatEditorSection>

          <StatEditorSection title="Боевые параметры" description="КД, хиты, скорость, инициатива и опыт" defaultOpen>
            <div className="form-grid">
              <label>
                КД
                <input
                  type="number"
                  value={draft.armorClass}
                  onChange={(event) => onDraft({ ...draft, armorClass: readNumber(event.target.value, 10) })}
                  placeholder="Например: 15"
                />
              </label>
              <label>
                Хиты
                <input
                  type="number"
                  value={draft.hitPoints}
                  onChange={(event) => onDraft({ ...draft, hitPoints: readNumber(event.target.value, 1) })}
                  placeholder="Среднее значение, например: 81"
                />
              </label>
              <label>
                Кубы хитов
                <input
                  value={draft.hitDice}
                  onChange={(event) => onDraft({ ...draft, hitDice: event.target.value })}
                  placeholder="Формула кубов: 18d8 или 23d12 + 46"
                />
              </label>
              <label>
                Инициатива
                <input
                  type="number"
                  value={draft.initiativeMod}
                  onChange={(event) => onDraft({ ...draft, initiativeMod: readNumber(event.target.value, 0) })}
                  placeholder="Модификатор, например: 2 или -1"
                />
              </label>
              <label className="wide">
                Скорость
                <input
                  value={draft.speeds}
                  onChange={(event) => onDraft({ ...draft, speeds: event.target.value })}
                  placeholder="Через запятую: 30 футов, полёт 60 футов, плавание 30 футов"
                />
              </label>
              <label>
                КО
                <input
                  value={draft.challengeRating}
                  onChange={(event) => onDraft({ ...draft, challengeRating: event.target.value })}
                  placeholder="Обычная дробь или число: 1/4, 3, 15"
                />
              </label>
              <label>
                ПО
                <input
                  type="number"
                  value={draft.xp}
                  onChange={(event) => onDraft({ ...draft, xp: readNumber(event.target.value, 0) })}
                  placeholder="Опыт числом: 50, 3900, 13000"
                />
              </label>
            </div>
          </StatEditorSection>

          <StatEditorSection title="Характеристики" description="СИЛ, ЛВК, ВЫН, ИНТ, МДР и ХАР" defaultOpen={false}>
            <AbilityEditor abilities={draft.abilities} onChange={(abilities) => onDraft({ ...draft, abilities })} />
          </StatEditorSection>

          <StatEditorSection title="Навыки и защиты" description="Навыки, устойчивости и невосприимчивости" defaultOpen={false}>
            <div className="form-grid">
              <label className="wide">
                Навыки
                <input
                  value={draft.skills}
                  onChange={(event) => onDraft({ ...draft, skills: event.target.value })}
                  placeholder="Через запятую: Внимание +4, Скрытность +8"
                />
              </label>
              <label className="wide">
                Устойчивости
                <input
                  value={draft.resistances}
                  onChange={(event) => onDraft({ ...draft, resistances: event.target.value })}
                  placeholder="Через запятую: Огонь, Холод; дробящий от немагических атак"
                />
              </label>
              <label className="wide">
                Невосприимчивость к урону
                <input
                  value={draft.immunities}
                  onChange={(event) => onDraft({ ...draft, immunities: event.target.value })}
                  placeholder="Через запятую: Кислота, Огонь, Яд"
                />
              </label>
              <label className="wide">
                Невосприимчивость к состояниям
                <input
                  value={draft.conditionImmunities}
                  onChange={(event) => onDraft({ ...draft, conditionImmunities: event.target.value })}
                  placeholder="Через запятую: Глухота, Испуг, Обворожение, Слепота"
                />
              </label>
            </div>
          </StatEditorSection>

          <StatEditorSection title="Медиа" description="Изображение и токен для экранов боя" defaultOpen={false}>
            <div className="form-grid">
              <label className="wide">
                Изображение
                <ImageUrlInput value={draft.imageUrl} onChange={(imageUrl) => onDraft({ ...draft, imageUrl })} placeholder="URL портрета существа" />
              </label>
              <label className="wide">
                Токен
                <ImageUrlInput
                  value={draft.tokenUrl}
                  onChange={(tokenUrl) => onDraft({ ...draft, tokenUrl })}
                  placeholder="URL круглого токена, если он есть"
                />
              </label>
            </div>
          </StatEditorSection>

          <StatEditorSection title="Особенности" description="Пассивные свойства, заклинания и правила существа" defaultOpen={false}>
            <FeatureListEditor
              section="Особенности"
              addLabel="Добавить особенность"
              emptyLabel="Особенности пока не добавлены"
              features={draft.traits}
              onChange={(traits) => onDraft({ ...draft, traits })}
            />
          </StatEditorSection>

          <StatEditorSection title="Действия" description="Атаки, реакции и активные возможности" defaultOpen={false}>
            <FeatureListEditor
              section="Действия"
              addLabel="Добавить действие"
              emptyLabel="Действия пока не добавлены"
              features={draft.actions}
              onChange={(actions) => onDraft({ ...draft, actions })}
            />
          </StatEditorSection>
        </div>

        <div className="form-actions stat-editor-actions">
          <button className="button primary" type="submit" disabled={busy}>
            <Save size={19} />
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}

export function StatEditorSection({
  title,
  description,
  defaultOpen,
  children
}: {
  title: string;
  description: string;
  defaultOpen: boolean;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details className="stat-editor-section" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="stat-editor-section-summary">
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <ChevronDown size={20} />
      </summary>
      <div className="stat-editor-section-body">{children}</div>
    </details>
  );
}

export function FeatureListEditor({
  features,
  section,
  addLabel,
  emptyLabel,
  defaultName,
  onChange
}: {
  features: CreatureFeature[];
  section: string;
  addLabel: string;
  emptyLabel: string;
  defaultName?: string;
  onChange: (features: CreatureFeature[]) => void;
}): JSX.Element {
  const nextDefaultName = defaultName ?? (section === 'Действия' ? 'Новое действие' : 'Новая особенность');

  function updateFeature(index: number, patch: Partial<Pick<CreatureFeature, 'name' | 'description'>>): void {
    onChange(
      features.map((feature, featureIndex) =>
        featureIndex === index
          ? {
              ...feature,
              ...patch,
              section,
              html: patch.name !== undefined || patch.description !== undefined ? '' : feature.html
            }
          : feature
      )
    );
  }

  function moveFeature(index: number, direction: -1 | 1): void {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= features.length) return;

    const nextFeatures = [...features];
    const [feature] = nextFeatures.splice(index, 1);
    nextFeatures.splice(nextIndex, 0, feature);
    onChange(nextFeatures);
  }

  function removeFeature(index: number): void {
    onChange(features.filter((_, featureIndex) => featureIndex !== index));
  }

  function addFeature(): void {
    onChange([
      ...features,
      {
        id: `${section}-${clientId()}`.replace(/\s+/g, '-').toLocaleLowerCase('ru'),
        name: nextDefaultName,
        section,
        description: '',
        html: ''
      }
    ]);
  }

  return (
    <div className="feature-editor">
      <div className="feature-editor-list">
        {features.length ? (
          features.map((feature, index) => (
            <article className="feature-editor-card" key={feature.id || `${section}-${index}`}>
              <div className="feature-editor-card-header">
                <strong>{index + 1}</strong>
                <div className="feature-editor-tools">
                  <button
                    className="icon-button feature-editor-button"
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveFeature(index, -1)}
                    aria-label="Поднять выше"
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    className="icon-button feature-editor-button"
                    type="button"
                    disabled={index === features.length - 1}
                    onClick={() => moveFeature(index, 1)}
                    aria-label="Опустить ниже"
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button className="icon-button danger feature-editor-button" type="button" onClick={() => removeFeature(index)} aria-label="Удалить элемент">
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
              <div className="feature-editor-fields">
                <label>
                  Название
                  <input value={feature.name} onChange={(event) => updateFeature(index, { name: event.target.value })} placeholder={nextDefaultName} />
                </label>
                <label>
                  Описание
                  <textarea
                    value={feature.description}
                    onChange={(event) => updateFeature(index, { description: event.target.value })}
                    placeholder="Описание способности"
                  />
                </label>
              </div>
            </article>
          ))
        ) : (
          <div className="feature-editor-empty">{emptyLabel}</div>
        )}
      </div>
      <button className="button secondary feature-editor-add" type="button" onClick={addFeature}>
        <Plus size={18} />
        {addLabel}
      </button>
    </div>
  );
}

function AbilityEditor({ abilities, onChange }: { abilities: AbilityBlock; onChange: (abilities: AbilityBlock) => void }): JSX.Element {
  const labels: Array<[keyof AbilityBlock, string]> = [
    ['str', 'СИЛ'],
    ['dex', 'ЛВК'],
    ['con', 'ВЫН'],
    ['int', 'ИНТ'],
    ['wis', 'МДР'],
    ['cha', 'ХАР']
  ];
  return (
    <div className="ability-grid wide">
      {labels.map(([key, label]) => (
        <label key={key}>
          {label}
          <input type="number" value={abilities[key]} onChange={(event) => onChange({ ...abilities, [key]: readNumber(event.target.value, 10) })} />
        </label>
      ))}
    </div>
  );
}

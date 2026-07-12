import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Info, Plus, UploadCloud } from 'lucide-react';
import type { CampaignDetail, CreatureTemplate, SaveCreatureTemplateInput } from '@shared/types';
import { HoldDeleteButton } from '../../shared/ui/HoldDeleteButton';
import { PanelTitle } from '../../shared/ui/PanelTitle';
import { emptyCreature } from './model/creatureFactory';

import { CreatureEditor } from './CreatureEditor';

const api = window.dndTracker;
export function LibraryPanel({
  detail,
  busy,
  run,
  onRefresh
}: {
  detail: CampaignDetail;
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [url, setUrl] = useState('https://ruleholder.com/monsters/steam-mephit');
  const [importInfoOpen, setImportInfoOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(detail.creatures[0]?.id ?? '');
  const [draft, setDraft] = useState<SaveCreatureTemplateInput>(() => detail.creatures[0] ?? emptyCreature(detail.campaign.id));
  const [creatureSearch, setCreatureSearch] = useState('');
  const [creatureSearchOpen, setCreatureSearchOpen] = useState(false);
  const creatureSearchRef = useRef<HTMLDivElement | null>(null);
  const filteredCreatures = useMemo(() => {
    const query = creatureSearch.trim().toLocaleLowerCase('ru');
    if (!query) return detail.creatures;
    return detail.creatures.filter((creature) => {
      const haystack = [creature.name, creature.originalName, creature.creatureType, creature.challengeRating].join(' ').toLocaleLowerCase('ru');
      return haystack.includes(query);
    });
  }, [creatureSearch, detail.creatures]);

  useEffect(() => {
    const selected = detail.creatures.find((creature) => creature.id === selectedId) ?? detail.creatures[0];
    setDraft(selected ? { ...selected } : emptyCreature(detail.campaign.id));
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    // Selection changes are handled by selectCreature; this effect synchronizes refreshed library data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.creatures, detail.campaign.id]);

  useEffect(() => {
    function closeOnOutsidePointer(event: globalThis.PointerEvent): void {
      if (!creatureSearchRef.current?.contains(event.target as Node)) setCreatureSearchOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  function selectCreature(creature: CreatureTemplate): void {
    setSelectedId(creature.id);
    setDraft({ ...creature });
    setCreatureSearch('');
    setCreatureSearchOpen(false);
  }

  async function importCreature(event: FormEvent): Promise<void> {
    event.preventDefault();
    const creature = await run(() => api.importRuleholderCreature(detail.campaign.id, url));
    if (creature) {
      setSelectedId(creature.id);
      setDraft({ ...creature });
      await onRefresh();
    }
  }

  async function pasteImportUrl(): Promise<void> {
    try {
      const text = await navigator.clipboard?.readText?.();
      if (text?.trim()) setUrl(text.trim());
    } catch {
      // Clipboard access can be denied by the OS; keep the current URL in that case.
    }
  }

  async function saveCreature(event: FormEvent): Promise<void> {
    event.preventDefault();
    const saved = await run(() => api.saveCreature(draft));
    if (saved) {
      setSelectedId(saved.id);
      setDraft({ ...saved });
      await onRefresh();
    }
  }

  return (
    <section className="panel-grid library-layout">
      <div className="panel">
        <div className="import-header">
          <PanelTitle icon={<UploadCloud size={22} />} title="Импорт NPC" />
          <button
            className="icon-button import-info-button"
            type="button"
            aria-label="Ресурсы для импорта"
            aria-expanded={importInfoOpen}
            onClick={() => setImportInfoOpen((current) => !current)}
          >
            <Info size={18} />
          </button>
          {importInfoOpen && (
            <div className="import-info-popover">
              <h3>Ресурсы импорта</h3>
              <a href="https://ruleholder.com/monsters" target="_blank" rel="noreferrer">
                Ruleholder Monsters
              </a>
              <a href="https://next.dnd.su/bestiary/" target="_blank" rel="noreferrer">
                DnD.su Next Bestiary
              </a>
              <a href="https://new.ttg.club/bestiary" target="_blank" rel="noreferrer">
                TTG Club Bestiary
              </a>
            </div>
          )}
        </div>
        <form className="import-form" onSubmit={(event) => void importCreature(event)}>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Ruleholder, next.dnd.su или new.ttg.club/bestiary/..." />
          <div className="import-actions">
            <button className="button secondary" type="button" disabled={busy} onClick={() => void pasteImportUrl()}>
              <ClipboardPaste size={19} />
              Вставить из буфера
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              <UploadCloud size={19} />
              Импорт
            </button>
          </div>
        </form>
        <div className={`library-search ${creatureSearchOpen && creatureSearch.trim() ? 'open' : ''}`} ref={creatureSearchRef}>
          <input
            value={creatureSearch}
            onChange={(event) => {
              setCreatureSearch(event.target.value);
              setCreatureSearchOpen(true);
            }}
            onFocus={() => setCreatureSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setCreatureSearchOpen(false);
            }}
            placeholder="Найти статблок"
            aria-label="Поиск статблоков"
          />
          {creatureSearchOpen && creatureSearch.trim() && (
            <div className="custom-select-menu library-search-menu" role="listbox" aria-label="Найденные статблоки">
              {filteredCreatures.length ? (
                filteredCreatures.map((creature) => (
                  <button className="custom-select-option library-search-option" type="button" key={creature.id} onClick={() => selectCreature(creature)}>
                    <span className="custom-select-option-content">
                      <span>
                        <strong>{creature.name}</strong>
                        <small>
                          КД {creature.armorClass} · Хиты {creature.hitPoints} · КО {creature.challengeRating || '-'}
                        </small>
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="custom-select-empty">Статблок не найден</div>
              )}
            </div>
          )}
        </div>
        <div className="list-stack compact-list library-creature-list">
          <button className="entity-card ghost" type="button" onClick={() => setDraft(emptyCreature(detail.campaign.id))}>
            <Plus size={20} />
            Новый NPC вручную
          </button>
          {detail.creatures.map((creature) => (
            <article className={`entity-card selectable ${creature.id === selectedId ? 'active' : ''}`} key={creature.id}>
              <button type="button" className="entity-card-main" onClick={() => selectCreature(creature)}>
                <h3>{creature.name}</h3>
                <p>
                  КД {creature.armorClass} · Хиты {creature.hitPoints} · КО {creature.challengeRating || '-'}
                </p>
              </button>
              <HoldDeleteButton
                label="статблок NPC"
                iconOnly
                disabled={busy}
                onConfirm={async () => {
                  await run(() => api.deleteCreature(creature.id));
                  if (creature.id === selectedId) {
                    setSelectedId('');
                    setDraft(emptyCreature(detail.campaign.id));
                  }
                  await onRefresh();
                }}
              />
            </article>
          ))}
        </div>
      </div>

      <CreatureEditor
        draft={draft}
        busy={busy}
        onDraft={setDraft}
        onSave={saveCreature}
        onDelete={
          draft.id
            ? async () => {
                await run(() => api.deleteCreature(String(draft.id)));
                setSelectedId('');
                setDraft(emptyCreature(detail.campaign.id));
                await onRefresh();
              }
            : undefined
        }
      />
    </section>
  );
}

export { FeatureListEditor, StatEditorSection } from './CreatureEditor';

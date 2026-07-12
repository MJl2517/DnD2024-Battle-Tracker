import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardPaste, Info, Save, Swords, UploadCloud, Users } from 'lucide-react';
import type { CampaignDetail, PlayerCharacter } from '@shared/types';
import { HoldDeleteButton } from '../../shared/ui/HoldDeleteButton';
import { ImageUrlInput } from '../../shared/ui/ImageUrlInput';
import { readNumber, signed } from '../../shared/lib/numbers';
import { importPlayerFromLss } from './model/lssImporter';
import { emptyPlayer } from './model/playerFactory';

const api = window.dndTracker;
export function PlayersPanel({
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
  const [draft, setDraft] = useState(() => emptyPlayer(detail.campaign.id));
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [importInfoOpen, setImportInfoOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const lssFileInputRef = useRef<HTMLInputElement | null>(null);
  const playerImportRef = useRef<HTMLDivElement | null>(null);
  const playerFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => setDraft(emptyPlayer(detail.campaign.id)), [detail.campaign.id]);

  useEffect(() => {
    function closeOnOutsidePointer(event: globalThis.PointerEvent): void {
      if (!playerImportRef.current?.contains(event.target as Node)) {
        setImportInfoOpen(false);
        setImportMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    function handlePlayerNumberWheel(event: WheelEvent): void {
      const input = document.activeElement;
      if (!(input instanceof HTMLInputElement)) return;
      if (!playerFormRef.current?.contains(input) || input.type !== 'number') return;

      event.preventDefault();
      event.stopPropagation();
      const step = event.deltaY < 0 ? 1 : -1;

      setDraft((current) => {
        switch (input.name) {
          case 'level':
            return { ...current, level: Math.max(1, current.level + step) };
          case 'armorClass':
            return { ...current, armorClass: Math.max(0, current.armorClass + step) };
          case 'maxHp':
            return { ...current, maxHp: Math.max(1, current.maxHp + step) };
          case 'initiativeMod':
            return { ...current, initiativeMod: current.initiativeMod + step };
          case 'passivePerception':
            return { ...current, passivePerception: Math.max(1, current.passivePerception + step) };
          default:
            return current;
        }
      });
    }

    window.addEventListener('wheel', handlePlayerNumberWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handlePlayerNumberWheel, { capture: true });
  }, []);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(() => api.savePlayer(draft));
    setDraft(emptyPlayer(detail.campaign.id));
    setImportMessage('');
    setImportError('');
    await onRefresh();
  }

  function applyLssImport(payload: unknown): void {
    const imported = importPlayerFromLss(payload, detail.campaign.id);
    setDraft(imported);
    setImportError('');
    setImportMessage(`Импортирован персонаж: ${imported.name}. Проверьте поля и нажмите “Сохранить”.`);
  }

  async function importLssFiles(fileList: FileList | null | undefined): Promise<void> {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    try {
      const players: PlayerCharacter[] = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          players.push(importPlayerFromLss(JSON.parse(await file.text()), detail.campaign.id));
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (!players.length) {
        throw new Error(errors.join('\n') || 'Не удалось прочитать LSS JSON.');
      }

      if (files.length === 1 && players.length === 1) {
        setDraft(players[0]);
        setImportError(errors.join('\n'));
        setImportMessage(`Импортирован персонаж: ${players[0].name}. Проверьте поля и нажмите “Сохранить”.`);
        return;
      }

      let savedCount = 0;
      for (const player of players) {
        const saved = await run(() => api.savePlayer(player));
        if (saved) savedCount += 1;
      }

      setDraft(emptyPlayer(detail.campaign.id));
      setImportError(errors.join('\n'));
      setImportMessage(`Пакетный импорт LSS: сохранено персонажей ${savedCount} из ${players.length}.`);
      await onRefresh();
    } catch (err) {
      setImportMessage('');
      setImportError(err instanceof Error ? err.message : 'Не удалось прочитать LSS JSON.');
    } finally {
      setImportMenuOpen(false);
      if (lssFileInputRef.current) lssFileInputRef.current.value = '';
    }
  }

  async function importLssFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard?.readText?.();
      if (!text?.trim()) throw new Error('Буфер обмена пуст или недоступен.');
      applyLssImport(JSON.parse(text));
      setImportMenuOpen(false);
    } catch (err) {
      setImportMessage('');
      setImportError(err instanceof Error ? err.message : 'Не удалось импортировать LSS JSON из буфера.');
    }
  }

  return (
    <section className="panel-grid two-columns players-layout">
      <div className="panel player-editor-panel">
        <div className="panel-title split" ref={playerImportRef}>
          <div className="panel-title inline-title player-title">
            <Users size={22} />
            <h2>{draft.id ? 'Редактировать игрока' : 'Добавить игрока'}</h2>
            <button
              className="icon-button import-info-button"
              type="button"
              aria-label="Как импортировать персонажей из LSS"
              aria-expanded={importInfoOpen}
              onClick={() => setImportInfoOpen((current) => !current)}
            >
              <Info size={18} />
            </button>
            {importInfoOpen && (
              <div className="import-info-popover player-import-info-popover">
                <h3>Импорт Long Story Short</h3>
                <p>В LSS откройте персонажа, найдите экспорт/сохранение персонажа и выгрузите JSON-файл.</p>
                <p>Один файл заполнит форму для проверки. Несколько выбранных JSON-файлов будут сохранены в кампанию сразу.</p>
                <p>Если в JSON есть портрет, аватар или image URL, он попадёт в поле арта персонажа.</p>
              </div>
            )}
          </div>
          <div className="player-import-actions">
            <input
              ref={lssFileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              multiple
              onChange={(event) => void importLssFiles(event.target.files)}
            />
            <div className={`player-import-dropdown ${importMenuOpen ? 'open' : ''}`}>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                aria-expanded={importMenuOpen}
                onClick={() => setImportMenuOpen((current) => !current)}
              >
                <UploadCloud size={18} />
                Импорт LSS
                <ChevronDown size={17} />
              </button>
              {importMenuOpen && (
                <div className="player-import-menu">
                  <button className="player-import-menu-item" type="button" onClick={() => lssFileInputRef.current?.click()}>
                    <UploadCloud size={18} />
                    <span>
                      <strong>Выбрать JSON-файлы</strong>
                      <small>Один файл для проверки или несколько для пакетного импорта</small>
                    </span>
                  </button>
                  <button className="player-import-menu-item" type="button" onClick={() => void importLssFromClipboard()}>
                    <ClipboardPaste size={18} />
                    <span>
                      <strong>Вставить из буфера</strong>
                      <small>Заполнит форму одним персонажем из JSON</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {importMessage && (
          <div className="notice player-import-notice">
            <Info size={18} />
            {importMessage}
          </div>
        )}
        {importError && (
          <div className="notice error player-import-notice">
            <Info size={18} />
            {importError}
          </div>
        )}
        <form ref={playerFormRef} className="form-grid player-form" onSubmit={(event) => void save(event)}>
          <label>
            Имя
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            Уровень
            <input name="level" type="number" value={draft.level} onChange={(event) => setDraft({ ...draft, level: readNumber(event.target.value, 1) })} />
          </label>
          <label>
            КД
            <input
              name="armorClass"
              type="number"
              value={draft.armorClass}
              onChange={(event) => setDraft({ ...draft, armorClass: readNumber(event.target.value, 10) })}
            />
          </label>
          <label>
            Хиты
            <input name="maxHp" type="number" value={draft.maxHp} onChange={(event) => setDraft({ ...draft, maxHp: readNumber(event.target.value, 1) })} />
          </label>
          <label>
            Инициатива
            <input
              name="initiativeMod"
              type="number"
              value={draft.initiativeMod}
              onChange={(event) => setDraft({ ...draft, initiativeMod: readNumber(event.target.value, 0) })}
            />
          </label>
          <label>
            Пасс. восприятие
            <input
              name="passivePerception"
              type="number"
              value={draft.passivePerception}
              onChange={(event) => setDraft({ ...draft, passivePerception: readNumber(event.target.value, 10) })}
            />
          </label>
          <label className={`wide player-active-toggle ${draft.active ? 'active' : ''}`}>
            <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
            <span className="player-active-mark" aria-hidden="true">
              <Swords size={17} />
            </span>
            <span>
              <strong>Активен в боях</strong>
              <small>{draft.active ? 'Персонаж добавляется в энкаунтеры и бои' : 'Персонаж хранится в кампании, но не участвует в боях'}</small>
            </span>
          </label>
          <label className="wide">
            Арт персонажа
            <ImageUrlInput value={draft.imageUrl} onChange={(imageUrl) => setDraft({ ...draft, imageUrl })} placeholder="URL портрета или аватара персонажа" />
          </label>
          <label className="wide player-notes-field">
            Заметки
            <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </label>
          <div className="form-actions wide">
            <button className="button primary" type="submit" disabled={busy}>
              <Save size={19} />
              Сохранить
            </button>
            {draft.id && (
              <button className="button secondary" type="button" onClick={() => setDraft(emptyPlayer(detail.campaign.id))}>
                Сброс
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="list-stack player-list-scroll">
        {detail.players.map((player) => (
          <article
            className={`entity-card selectable player-list-card ${draft.id === player.id ? 'active' : ''} ${player.active ? '' : 'inactive-player'}`}
            key={player.id}
          >
            <button type="button" className="player-list-main player-list-button" onClick={() => setDraft({ ...player })}>
              {player.imageUrl ? (
                <img className="player-list-avatar" src={player.imageUrl} alt="" />
              ) : (
                <span className="player-list-avatar empty">{player.name.slice(0, 1) || '?'}</span>
              )}
              <div>
                <div className="player-list-name-row">
                  <h3>{player.name}</h3>
                  {!player.active && <span className="inactive-player-badge">Не активен в боях</span>}
                </div>
                <p>
                  Уровень {player.level} · КД {player.armorClass} · Хиты {player.maxHp} · инициатива {signed(player.initiativeMod)}
                </p>
              </div>
            </button>
            <div className="card-actions">
              <HoldDeleteButton label="Удалить игрока" compact disabled={busy} onConfirm={() => run(() => api.deletePlayer(player.id)).then(onRefresh)} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Play, Plus, Shield } from 'lucide-react';
import type { CreatureTemplate, Encounter, EncounterCreatureGroup, EncounterPlayerSetting, HitPointMode, InitiativeMode, PlayerCharacter } from '@shared/types';
import { describeInitiativeMode } from '@shared/combat';
import { calculateEncounterDifficulty } from '@shared/encounterDifficulty';
import { CustomSelect, SearchableSelect, type SelectOption } from '../../shared/ui/Select';
import { HoldDeleteButton } from '../../shared/ui/HoldDeleteButton';
import { readNumber, signed } from '../../shared/lib/numbers';
import { EncounterDifficultyScale, EncounterLairEditor, EncounterQuantityControl, InitiativeSettingControls } from './EncounterDetails';

const api = window.dndTracker;
function describeHitPointMode(group: EncounterCreatureGroup, template: CreatureTemplate | undefined): string {
  if (group.hpMode === 'fixed') return `${group.hpOverride ?? template?.hitPoints ?? '-'}`;
  if (group.hpMode === 'random') return template?.hitDice ? `случайно (${template.hitDice})` : `случайно (${template?.hitPoints ?? '-'})`;
  return `${template?.hitPoints ?? '-'} средние`;
}

function saveLairFromTemplate(encounterId: string, template: CreatureTemplate): Promise<unknown> {
  return api.saveEncounterLair({
    encounterId,
    templateId: template.id,
    name: template.lairName || `Логово: ${template.name}`,
    description: template.lairDescription,
    html: template.lairHtml,
    effects: template.lairEffects
  });
}
export function EncounterBuilder({
  encounter,
  creatures,
  players,
  busy,
  run,
  onRefresh,
  onDelete,
  onStart
}: {
  encounter: Encounter;
  creatures: CreatureTemplate[];
  players: PlayerCharacter[];
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  onRefresh: () => Promise<void>;
  onDelete: () => Promise<void>;
  onStart: () => Promise<void>;
}): JSX.Element {
  const [templateId, setTemplateId] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [initiativeMode, setInitiativeMode] = useState<InitiativeMode>('individual');
  const [hpMode, setHpMode] = useState<HitPointMode>('average');
  const [hpOverride, setHpOverride] = useState('');
  const [isAlly, setIsAlly] = useState(false);
  const [addLairWithCreature, setAddLairWithCreature] = useState(false);
  const templateById = useMemo(() => new Map(creatures.map((creature) => [creature.id, creature])), [creatures]);
  const selectedTemplate = templateById.get(templateId);
  const playerSettingById = useMemo(() => new Map(encounter.playerSettings.map((setting) => [setting.playerId, setting])), [encounter.playerSettings]);
  const canAddGroup = Boolean(templateId && (hpMode !== 'fixed' || hpOverride.trim()));
  const canAddLairFromTemplate = Boolean(selectedTemplate?.lairDescription || selectedTemplate?.lairHtml || selectedTemplate?.lairName);
  const difficulty = useMemo(
    () => calculateEncounterDifficulty(players, encounter.playerSettings, encounter.groups, creatures),
    [creatures, encounter.groups, encounter.playerSettings, players]
  );
  const creatureOptions = useMemo<SelectOption[]>(
    () =>
      creatures.map((creature) => ({
        value: creature.id,
        label: creature.name,
        description: [
          creature.challengeRating ? `КО ${creature.challengeRating}` : '',
          creature.hitPoints ? `Хиты ${creature.hitPoints}` : '',
          creature.hitDice ? creature.hitDice : ''
        ]
          .filter(Boolean)
          .join(' · ')
      })),
    [creatures]
  );

  useEffect(() => {
    if (templateId && !templateById.has(templateId)) {
      setTemplateId('');
      setTemplateSearch('');
    }
  }, [templateById, templateId]);

  useEffect(() => {
    const selected = templateById.get(templateId);
    if (selected && templateSearch !== selected.name) {
      setTemplateSearch(selected.name);
    }
  }, [templateById, templateId, templateSearch]);

  useEffect(() => {
    if (encounter.lair || !canAddLairFromTemplate) {
      setAddLairWithCreature(false);
    }
  }, [canAddLairFromTemplate, encounter.lair]);

  async function addGroup(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canAddGroup) return;
    const selected = templateById.get(templateId);
    await run(() =>
      api.saveEncounterGroup({
        encounterId: encounter.id,
        templateId,
        quantity,
        initiativeMode,
        hpMode,
        hpOverride: hpMode === 'fixed' && hpOverride.trim() ? readNumber(hpOverride, 1) : null,
        isAlly
      })
    );
    if (addLairWithCreature && selected && !encounter.lair) {
      await run(() => saveLairFromTemplate(encounter.id, selected));
    }
    setTemplateId('');
    setTemplateSearch('');
    setQuantity(1);
    setHpMode('average');
    setHpOverride('');
    setIsAlly(false);
    setAddLairWithCreature(false);
    await onRefresh();
  }

  async function addLair(): Promise<void> {
    if (encounter.lair) return;
    const selected = templateById.get(templateId);
    if (addLairWithCreature && selected && canAddLairFromTemplate) {
      await run(() => saveLairFromTemplate(encounter.id, selected));
      setAddLairWithCreature(false);
      await onRefresh();
      return;
    }

    await run(() =>
      api.saveEncounterLair({
        encounterId: encounter.id,
        templateId: null,
        name: 'Логово',
        description: 'Логово действует на инициативе 20.',
        html: '',
        effects: []
      })
    );
    await onRefresh();
  }

  async function saveGroupInitiative(
    group: EncounterCreatureGroup,
    patch: Partial<Pick<EncounterCreatureGroup, 'quantity' | 'initiativeAdvantage' | 'initiativeOverride' | 'isAlly'>>
  ): Promise<void> {
    await run(() =>
      api.saveEncounterGroup({
        id: group.id,
        encounterId: group.encounterId,
        templateId: group.templateId,
        displayName: group.displayName,
        quantity: patch.quantity ?? group.quantity,
        initiativeMode: group.initiativeMode,
        initiativeAdvantage: patch.initiativeAdvantage ?? group.initiativeAdvantage,
        initiativeOverride: patch.initiativeOverride === undefined ? group.initiativeOverride : patch.initiativeOverride,
        hpMode: group.hpMode,
        hpOverride: group.hpOverride,
        isAlly: patch.isAlly ?? group.isAlly
      })
    );
    await onRefresh();
  }

  async function savePlayerInitiative(
    player: PlayerCharacter,
    setting: EncounterPlayerSetting | undefined,
    patch: Partial<Pick<EncounterPlayerSetting, 'participating' | 'initiativeAdvantage' | 'initiativeOverride'>>
  ): Promise<void> {
    await run(() =>
      api.saveEncounterPlayerSetting({
        encounterId: encounter.id,
        playerId: player.id,
        participating: patch.participating ?? setting?.participating ?? true,
        initiativeAdvantage: patch.initiativeAdvantage ?? setting?.initiativeAdvantage ?? false,
        initiativeOverride: patch.initiativeOverride === undefined ? (setting?.initiativeOverride ?? null) : patch.initiativeOverride
      })
    );
    await onRefresh();
  }

  return (
    <>
      <div className="encounter-sticky-header">
        <div className="panel-title split">
          <div>
            <h2>{encounter.name}</h2>
            <p>{encounter.groups.length} групп NPC</p>
          </div>
          <div className="toolbar-actions">
            <HoldDeleteButton label="Удалить энкаунтер" disabled={busy} onConfirm={onDelete} />
            <button className="button primary" type="button" disabled={busy || !encounter.groups.length} onClick={() => void onStart()}>
              <Play size={20} />
              Начать бой
            </button>
          </div>
        </div>
        <EncounterDifficultyScale result={difficulty} />
      </div>
      <form className="form-grid" onSubmit={(event) => void addGroup(event)}>
        <label className="wide">
          NPC
          <SearchableSelect
            value={templateId}
            search={templateSearch}
            onSearchChange={setTemplateSearch}
            onChange={(value) => {
              setTemplateId(value);
              setTemplateSearch(templateById.get(value)?.name ?? '');
            }}
            options={creatureOptions}
            placeholder="Выберите NPC"
            searchPlaceholder="Найти NPC"
            ariaLabel="Выбрать NPC"
          />
        </label>
        <label>
          Количество
          <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(readNumber(event.target.value, 1))} />
        </label>
        <label>
          Хиты
          <CustomSelect
            value={hpMode}
            onChange={(value) => setHpMode(value as HitPointMode)}
            options={[
              { value: 'average', label: 'Средние из статблока' },
              { value: 'random', label: 'Случайно по кубам', description: templateById.get(templateId)?.hitDice || 'Нужны кубы хитов' },
              { value: 'fixed', label: 'Ручное значение' }
            ]}
            placeholder="Выберите режим хитов"
            ariaLabel="Выбрать режим хитов"
          />
        </label>
        {hpMode === 'fixed' && (
          <label>
            Значение хитов
            <input value={hpOverride} onChange={(event) => setHpOverride(event.target.value.replace(/[^\d]/g, ''))} placeholder="например 27" />
          </label>
        )}
        <label className="wide">
          Инициатива
          <CustomSelect
            value={initiativeMode}
            onChange={(value) => setInitiativeMode(value as InitiativeMode)}
            options={[
              { value: 'individual', label: 'Каждому отдельно' },
              { value: 'group', label: 'Группой' }
            ]}
            placeholder="Выберите режим инициативы"
            ariaLabel="Выбрать режим инициативы"
          />
        </label>
        <label className={`wide ally-toggle-row ${isAlly ? 'active' : ''}`}>
          <input type="checkbox" checked={isAlly} onChange={(event) => setIsAlly(event.target.checked)} />
          <span className="ally-toggle-mark" aria-hidden="true">
            <Shield size={18} />
          </span>
          <span>
            <strong>Союзник</strong>
            <small>Существо сражается на стороне игроков и не учитывается при начислении опыта</small>
          </span>
        </label>
        {canAddLairFromTemplate && !encounter.lair && (
          <label className={`wide lair-checkbox-row ${addLairWithCreature ? 'active' : ''}`}>
            <input type="checkbox" checked={addLairWithCreature} onChange={(event) => setAddLairWithCreature(event.target.checked)} />
            <span className="lair-checkbox-mark">
              <Shield size={17} />
            </span>
            <span className="lair-checkbox-copy">
              <strong>Добавить логово существа</strong>
              <small>{selectedTemplate?.lairName || selectedTemplate?.name || 'Логово существа'}</small>
            </span>
          </label>
        )}
        <div className="form-actions wide">
          <button className="button secondary" type="submit" disabled={busy || !canAddGroup}>
            <Plus size={19} />
            Добавить NPC
          </button>
          <button className="button secondary" type="button" disabled={busy || Boolean(encounter.lair)} onClick={() => void addLair()}>
            <Shield size={19} />
            {addLairWithCreature ? 'Добавить логово существа' : 'Добавить логово'}
          </button>
        </div>
      </form>

      <div className="encounter-roster">
        <section className="encounter-roster-section players">
          <div className="section-heading">
            <span>Игроки кампании</span>
            <strong>{players.filter((player) => player.active && (playerSettingById.get(player.id)?.participating ?? true)).length}</strong>
          </div>
          <div className="list-stack">
            {players
              .filter((player) => player.active)
              .map((player) => {
                const setting = playerSettingById.get(player.id);
                const participating = setting?.participating ?? true;
                return (
                  <article className={`entity-card player-roster-card ${participating ? '' : 'not-participating'}`} key={player.id}>
                    <div>
                      <h3>{player.name}</h3>
                      <p>
                        Уровень {player.level} · КД {player.armorClass} · Хиты {player.maxHp} · инициатива {signed(player.initiativeMod)}
                      </p>
                    </div>
                    <div className="roster-card-actions">
                      <label className={`participation-toggle ${participating ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={participating}
                          disabled={busy}
                          onChange={(event) => void savePlayerInitiative(player, setting, { participating: event.target.checked })}
                        />
                        <span>Участвует в бою</span>
                      </label>
                      <InitiativeSettingControls
                        advantage={setting?.initiativeAdvantage ?? false}
                        override={setting?.initiativeOverride ?? null}
                        baseInitiative={player.initiativeMod}
                        busy={busy || !participating}
                        onAdvantageChange={(initiativeAdvantage) => void savePlayerInitiative(player, setting, { initiativeAdvantage })}
                        onOverrideSave={(initiativeOverride) => void savePlayerInitiative(player, setting, { initiativeOverride })}
                      />
                    </div>
                  </article>
                );
              })}
            {players.filter((player) => player.active).length === 0 && <div className="roster-empty">Нет активных игроков</div>}
          </div>
        </section>

        {encounter.lair && (
          <section className="encounter-roster-section lair">
            <div className="section-heading">
              <span>Логово</span>
              <strong>1</strong>
            </div>
            <EncounterLairEditor lair={encounter.lair} busy={busy} run={run} onRefresh={onRefresh} />
          </section>
        )}

        <section className="encounter-roster-section">
          <div className="section-heading">
            <span>NPC группы</span>
            <strong>{encounter.groups.length}</strong>
          </div>
          <div className="list-stack">
            {encounter.groups.map((group) => {
              const template = templateById.get(group.templateId);
              return (
                <article className={`entity-card encounter-npc-card ${group.isAlly ? 'ally' : ''}`} key={group.id}>
                  <div>
                    <div className="encounter-npc-name-row">
                      <h3>{group.displayName}</h3>
                      {group.isAlly && (
                        <span className="ally-badge">
                          <Shield size={14} />
                          Союзник
                        </span>
                      )}
                    </div>
                    <p>
                      {group.quantity} шт. · {describeInitiativeMode(group.initiativeMode)} · Хиты {describeHitPointMode(group, template)}
                    </p>
                  </div>
                  <div className="roster-card-actions">
                    <EncounterQuantityControl quantity={group.quantity} busy={busy} onSave={(quantity) => void saveGroupInitiative(group, { quantity })} />
                    <label className={`participation-toggle ally-card-toggle ${group.isAlly ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={group.isAlly}
                        disabled={busy}
                        onChange={(event) => void saveGroupInitiative(group, { isAlly: event.target.checked })}
                      />
                      <span>Союзник</span>
                    </label>
                    <InitiativeSettingControls
                      advantage={group.initiativeAdvantage}
                      override={group.initiativeOverride}
                      baseInitiative={template?.initiativeMod ?? 0}
                      busy={busy}
                      onAdvantageChange={(initiativeAdvantage) => void saveGroupInitiative(group, { initiativeAdvantage })}
                      onOverrideSave={(initiativeOverride) => void saveGroupInitiative(group, { initiativeOverride })}
                    />
                    <HoldDeleteButton
                      label="группу NPC"
                      iconOnly
                      disabled={busy}
                      onConfirm={() => run(() => api.deleteEncounterGroup(group.id)).then(onRefresh)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

import { type FormEvent, useEffect, useState } from 'react';
import { Plus, Swords } from 'lucide-react';
import type { CampaignDetail } from '@shared/types';
import { HoldDeleteButton } from '../../shared/ui/HoldDeleteButton';
import { InlineEmpty, PanelTitle } from '../../shared/ui/PanelTitle';

import { EncounterBuilder } from './EncounterBuilder';

const api = window.dndTracker;

export function EncountersPanel({
  detail,
  busy,
  run,
  onRefresh,
  onStart
}: {
  detail: CampaignDetail;
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T | undefined>;
  onRefresh: () => Promise<void>;
  onStart: () => void;
}): JSX.Element {
  const [encounterName, setEncounterName] = useState('Новый энкаунтер');
  const [selectedId, setSelectedId] = useState(detail.encounters[0]?.id ?? '');
  const selected = detail.encounters.find((encounter) => encounter.id === selectedId) ?? detail.encounters[0] ?? null;

  useEffect(() => {
    if (!selectedId && detail.encounters[0]) setSelectedId(detail.encounters[0].id);
  }, [detail.encounters, selectedId]);

  async function createEncounter(event: FormEvent): Promise<void> {
    event.preventDefault();
    const encounter = await run(() => api.saveEncounter({ campaignId: detail.campaign.id, name: encounterName }));
    if (encounter) {
      setSelectedId(encounter.id);
      setEncounterName('Новый энкаунтер');
      await onRefresh();
    }
  }

  return (
    <section className="panel-grid encounter-layout">
      <div className="panel">
        <PanelTitle icon={<Swords size={22} />} title="Энкаунтеры" />
        <form className="compact-form roomy" onSubmit={(event) => void createEncounter(event)}>
          <input value={encounterName} onChange={(event) => setEncounterName(event.target.value)} />
          <button className="icon-button" type="submit" disabled={busy} aria-label="Создать энкаунтер">
            <Plus size={18} />
          </button>
        </form>
        <div className="list-stack compact-list">
          {detail.encounters.map((encounter) => (
            <article className={`entity-card selectable ${encounter.id === selected?.id ? 'active' : ''}`} key={encounter.id}>
              <button type="button" className="entity-card-main" onClick={() => setSelectedId(encounter.id)}>
                <h3>{encounter.name}</h3>
                <p>{encounter.groups.reduce((sum, group) => sum + group.quantity, 0)} существ</p>
              </button>
              <HoldDeleteButton
                label="энкаунтер"
                iconOnly
                disabled={busy}
                onConfirm={async () => {
                  await run(() => api.deleteEncounter(encounter.id));
                  if (encounter.id === selectedId) setSelectedId('');
                  await onRefresh();
                }}
              />
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        {selected ? (
          <EncounterBuilder
            encounter={selected}
            creatures={detail.creatures}
            players={detail.players}
            busy={busy}
            run={run}
            onRefresh={onRefresh}
            onDelete={async () => {
              await run(() => api.deleteEncounter(selected.id));
              setSelectedId('');
              await onRefresh();
            }}
            onStart={async () => {
              const session = await run(() => api.startCombat(selected.id));
              if (session) {
                await onRefresh();
                onStart();
              }
            }}
          />
        ) : (
          <InlineEmpty title="Создайте энкаунтер" />
        )}
      </div>
    </section>
  );
}

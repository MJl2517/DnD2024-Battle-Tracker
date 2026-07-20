import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Campaign } from '@shared/types';
import { HoldDeleteButton } from '../../shared/ui/HoldDeleteButton';

export function CampaignSwitcher({
  campaigns,
  selectedId,
  busy,
  onSelect,
  onCreate,
  onDelete
}: {
  campaigns: Campaign[];
  selectedId: string;
  busy: boolean;
  onSelect: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState('');

  return (
    <section className="rail-section">
      <p className="section-label">Кампании</p>
      <div className="campaign-list">
        {campaigns.map((campaign) => (
          <article className={`campaign-card ${campaign.id === selectedId ? 'active' : ''}`} key={campaign.id}>
            <button type="button" className="campaign-select" onClick={() => void onSelect(campaign.id)}>
              {campaign.name}
            </button>
            <HoldDeleteButton label="кампанию" iconOnly disabled={busy} onConfirm={() => onDelete(campaign.id)} />
          </article>
        ))}
      </div>
      <form
        className="compact-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void onCreate(name.trim()).then(() => setName(''));
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Новая кампания" />
        <button className="icon-button" type="submit" disabled={busy} aria-label="Создать кампанию">
          <Plus size={18} />
        </button>
      </form>
    </section>
  );
}

export function EmptyCampaignState({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => Promise<void> }): JSX.Element {
  const [name, setName] = useState('Ильмарен');
  return (
    <section className="empty-state">
      <div>
        <p className="eyebrow">Старт</p>
        <h2>Создайте профиль кампании</h2>
      </div>
      <form
        className="hero-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate(name);
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button className="button primary" type="submit" disabled={busy}>
          <Plus size={20} />
          Создать
        </button>
      </form>
    </section>
  );
}

export function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: JSX.Element; label: string }): JSX.Element {
  return (
    <button className={`tab-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

import { RefreshCw, Shield, UserRound, X } from 'lucide-react';
import type { InitiativeExchangePrompt } from '@shared/types';

export function InitiativeExchangeModal({
  prompt,
  busy,
  publicView = false,
  onSelect,
  onCancel
}: {
  prompt: InitiativeExchangePrompt;
  busy: boolean;
  publicView?: boolean;
  onSelect: (combatantId: string) => void;
  onCancel?: () => void;
}): JSX.Element {
  return (
    <div className={`initiative-exchange-backdrop ${publicView ? 'public' : ''}`} role="presentation">
      <section className="initiative-exchange-modal" role="dialog" aria-modal="true" aria-labelledby="initiative-exchange-title">
        <header className="initiative-exchange-header">
          <span className="initiative-exchange-icon">
            <RefreshCw size={publicView ? 34 : 26} />
          </span>
          <div>
            <p className="eyebrow">Бдительный — Обмен Инициативой</p>
            <h2 id="initiative-exchange-title">{prompt.sourceName}: выберите союзника</h2>
            <p>
              Текущая инициатива: <strong>{prompt.sourceInitiative}</strong>. Нажмите на согласного участника для обмена.
            </p>
          </div>
          {onCancel && (
            <button className="icon-button" type="button" disabled={busy} onClick={onCancel} aria-label="Отменить обмен">
              <X size={22} />
            </button>
          )}
        </header>
        <div className={`initiative-exchange-grid ${prompt.candidates.length > 20 ? 'many' : ''}`}>
          {prompt.candidates.map((candidate) => (
            <button
              className="initiative-exchange-candidate"
              type="button"
              key={candidate.combatantId}
              disabled={busy}
              onClick={() => onSelect(candidate.combatantId)}
            >
              <span>{candidate.side === 'player' ? <UserRound size={20} /> : <Shield size={20} />}</span>
              <strong>{candidate.name}</strong>
              <small>{candidate.side === 'player' ? 'Игрок' : 'Союзник'}</small>
              <b>{candidate.initiative}</b>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

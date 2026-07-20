import { createPortal } from 'react-dom';
import { ChevronRight, Dices, Plus, Shield, Skull, Users, X } from 'lucide-react';
import type { CombatXpAward } from '@shared/types';
import { signed } from '../lib/numbers';
import { Stat } from './Stat';
import { useModalFocus } from './useModalFocus';

export function XpAwardModal({ award, onClose, publicView = false }: { award: CombatXpAward; onClose?: () => void; publicView?: boolean }): JSX.Element {
  const modalRef = useModalFocus<HTMLElement>(onClose, Boolean(onClose));
  return createPortal(
    <div className={`modal-backdrop ${publicView ? 'public' : ''}`} role="presentation">
      <section
        ref={modalRef}
        tabIndex={-1}
        className={`app-modal xp-award-modal ${publicView ? 'public' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="xp-award-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Награда за бой</p>
            <h2 id="xp-award-title">Опыт начислен</h2>
          </div>
          {onClose && (
            <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
              <X size={20} />
            </button>
          )}
        </header>
        <div className="xp-award-total">
          <span>{award.xpPerPlayer}</span>
          <strong>ПО каждому участнику боя</strong>
        </div>
        <div className="xp-award-grid">
          <Stat icon={<Dices size={18} />} label="Общий пул" value={award.totalXp} />
          <Stat icon={<Users size={18} />} label="Игроков" value={award.playerCount} />
          {award.allyRecipientCount > 0 && <Stat icon={<Shield size={18} />} label="Союзников" value={award.allyRecipientCount} />}
          <Stat icon={<Users size={18} />} label="Получателей" value={award.recipientCount} />
          <Stat icon={<Skull size={18} />} label="Побеждено" value={award.defeatedNpcCount} />
          <Stat icon={<ChevronRight size={18} />} label="Сбежало" value={award.escapedNpcCount} />
          {award.xpAdjustment !== 0 && <Stat icon={<Plus size={18} />} label="Бонус/штраф" value={signed(award.xpAdjustment)} />}
        </div>
      </section>
    </div>,
    document.body
  );
}

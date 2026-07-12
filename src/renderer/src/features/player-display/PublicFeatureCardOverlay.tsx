import { useEffect, useRef, useState } from 'react';
import { Swords } from 'lucide-react';
import type { PublicFeatureCard, SpellCard } from '@shared/types';
import { anchorFromElement, getSpellHref, getSpellLink, type PopoverAnchor } from '../../shared/lib/popover';
import { SpellPopover } from '../../shared/ui/SpellPopover';

const api = window.dndTracker;

/** Показывает выбранную мастером способность и загружает вложенные карточки заклинаний по наведению. */
export function PublicFeatureCardOverlay({ card }: { card: PublicFeatureCard }): JSX.Element {
  const image = card.tokenUrl || card.imageUrl;
  const [spellPopover, setSpellPopover] = useState<{ spell: SpellCard | null; anchor: PopoverAnchor; loading: boolean; error?: string } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function showSpellCard(href: string, anchor: PopoverAnchor): Promise<void> {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setSpellPopover({ spell: null, anchor, loading: true });
    if (typeof api.fetchRuleholderSpell !== 'function') {
      setSpellPopover({ spell: null, anchor, loading: false, error: 'API заклинаний ещё не загружен. Перезапустите dev-версию приложения.' });
      return;
    }
    try {
      const spell = await api.fetchRuleholderSpell(href);
      setSpellPopover({ spell, anchor, loading: false });
    } catch (err) {
      setSpellPopover({ spell: null, anchor, loading: false, error: err instanceof Error ? err.message : 'Не удалось загрузить заклинание.' });
    }
  }

  function scheduleHideSpellCard(): void {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setSpellPopover(null), 220);
  }

  function cancelHideSpellCard(): void {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }

  useEffect(() => () => cancelHideSpellCard(), []);

  return (
    <aside className="public-feature-overlay" aria-live="polite">
      <section className="public-feature-card">
        <header className="public-feature-header">
          {image ? (
            <img src={image} alt="" />
          ) : (
            <span className="public-feature-icon">
              <Swords size={54} />
            </span>
          )}
          <div>
            <p>{card.sourceType === 'lair' ? 'Эффект логова' : card.sourceName}</p>
            <h2>{card.featureName}</h2>
            <span>{card.section}</span>
          </div>
        </header>
        <div
          className="public-feature-body"
          onMouseOver={(event) => {
            const link = getSpellLink(event.target);
            const href = link?.getAttribute('href');
            if (link && href) void showSpellCard(href, anchorFromElement(link));
          }}
          onMouseLeave={scheduleHideSpellCard}
          onClick={(event) => {
            if (getSpellHref(event.target)) event.preventDefault();
          }}
        >
          {card.html ? <div className="feature-html" dangerouslySetInnerHTML={{ __html: card.html }} /> : <p>{card.description}</p>}
        </div>
        {spellPopover && <SpellPopover state={spellPopover} onMouseEnter={cancelHideSpellCard} onMouseLeave={scheduleHideSpellCard} />}
      </section>
    </aside>
  );
}

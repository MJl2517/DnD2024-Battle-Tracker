import { useEffect, useRef, useState } from 'react';
import { EyeOff, MonitorUp, Shield, X } from 'lucide-react';
import type { CreatureFeature, CreatureTemplate, EncounterLair, PublicFeatureCard, SpellCard } from '@shared/types';
import { SpellPopover } from '../../shared/ui/SpellPopover';
import { anchorFromElement, getSpellHref, getSpellLink, type PopoverAnchor } from '../../shared/lib/popover';

const api = window.dndTracker;
export function StatblockPreview({ creature, campaignId }: { creature: CreatureTemplate; campaignId: string }): JSX.Element {
  const [spellPopover, setSpellPopover] = useState<{ spell: SpellCard | null; anchor: PopoverAnchor; loading: boolean; error?: string } | null>(null);
  const [publicFeatureError, setPublicFeatureError] = useState('');
  const [shownPublicFeatureId, setShownPublicFeatureId] = useState('');
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function showSpellCard(href: string, anchor: PopoverAnchor): Promise<void> {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setSpellPopover({ spell: null, anchor, loading: true });
    if (typeof api.fetchRuleholderSpell !== 'function') {
      setSpellPopover({
        spell: null,
        anchor,
        loading: false,
        error: 'API заклинаний ещё не загружен. Остановите dev-версию через Ctrl+C и запустите npm.cmd run dev заново.'
      });
      return;
    }
    try {
      const spell = await api.fetchRuleholderSpell(href);
      setSpellPopover({ spell, anchor, loading: false });
    } catch (err) {
      setSpellPopover({
        spell: null,
        anchor,
        loading: false,
        error: err instanceof Error ? err.message : 'Не удалось загрузить заклинание.'
      });
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

  async function showFeatureOnPlayerScreen(feature: CreatureFeature): Promise<void> {
    setPublicFeatureError('');
    if (typeof api.showPublicFeatureCard !== 'function') {
      setPublicFeatureError('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
      return;
    }

    const card: PublicFeatureCard = {
      id: `${creature.id}-${feature.id}-${Date.now()}`,
      sourceName: creature.name,
      sourceType: 'creature',
      featureName: feature.name,
      section: feature.section,
      description: feature.description,
      html: feature.html,
      imageUrl: creature.imageUrl,
      tokenUrl: creature.tokenUrl
    };

    try {
      await api.showPublicFeatureCard(campaignId, card);
      setShownPublicFeatureId(feature.id);
    } catch (err) {
      setPublicFeatureError(err instanceof Error ? err.message : 'Не удалось показать способность на экране игроков.');
    }
  }

  async function dismissFeatureOnPlayerScreen(): Promise<void> {
    setPublicFeatureError('');
    if (typeof api.dismissPublicFeatureCard !== 'function') {
      setPublicFeatureError('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
      return;
    }

    try {
      await api.dismissPublicFeatureCard(campaignId);
      setShownPublicFeatureId('');
    } catch (err) {
      setPublicFeatureError(err instanceof Error ? err.message : 'Не удалось скрыть карточку с экрана игроков.');
    }
  }

  async function toggleFeatureOnPlayerScreen(feature: CreatureFeature): Promise<void> {
    if (shownPublicFeatureId === feature.id) {
      await dismissFeatureOnPlayerScreen();
      return;
    }

    await showFeatureOnPlayerScreen(feature);
  }

  return (
    <div
      className="statblock-preview"
      onMouseOver={(event) => {
        const link = getSpellLink(event.target);
        const href = link?.getAttribute('href');
        if (link && href) void showSpellCard(href, anchorFromElement(link));
      }}
      onMouseLeave={scheduleHideSpellCard}
      onClick={(event) => {
        if (getSpellHref(event.target)) {
          event.preventDefault();
        }
      }}
    >
      <div className="statblock-public-toolbar">
        <span>Публичная карточка способности</span>
        <button className="button mini secondary" type="button" onClick={() => void dismissFeatureOnPlayerScreen()}>
          <X size={15} />
          Скрыть с экрана игроков
        </button>
      </div>
      {publicFeatureError && <div className="notice error compact-notice">{publicFeatureError}</div>}
      <div className="statblock-grid">
        <span>Скорость: {creature.speeds || '-'}</span>
        <span>Устойчивости: {creature.resistances || '-'}</span>
        <span>Иммунитеты: {creature.immunities || '-'}</span>
        <span>Чувства: {creature.senses || '-'}</span>
      </div>
      <div className="feature-columns">
        {[...creature.traits, ...creature.actions].map((feature) => (
          <section className="feature-block" key={feature.id}>
            <div className="feature-block-header">
              <h4>{feature.name}</h4>
              <button
                className={`feature-show-button ${shownPublicFeatureId === feature.id ? 'active' : ''}`}
                type="button"
                onClick={() => void toggleFeatureOnPlayerScreen(feature)}
              >
                {shownPublicFeatureId === feature.id ? <EyeOff size={15} /> : <MonitorUp size={15} />}
                {shownPublicFeatureId === feature.id ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            {feature.html ? <div className="feature-html" dangerouslySetInnerHTML={{ __html: feature.html }} /> : <p>{feature.description}</p>}
          </section>
        ))}
      </div>
      {spellPopover && <SpellPopover state={spellPopover} onMouseEnter={cancelHideSpellCard} onMouseLeave={scheduleHideSpellCard} />}
    </div>
  );
}

export function LairStatblockPreview({ lair, campaignId }: { lair: EncounterLair; campaignId: string }): JSX.Element {
  const [publicFeatureError, setPublicFeatureError] = useState('');
  const [shownPublicFeatureId, setShownPublicFeatureId] = useState('');
  const effects = lair.effects.length
    ? lair.effects
    : [
        {
          id: 'lair-description',
          name: 'Описание логова',
          section: 'Логово',
          description: lair.description,
          html: lair.html
        }
      ];

  async function showFeatureOnPlayerScreen(effect: CreatureFeature): Promise<void> {
    setPublicFeatureError('');
    if (typeof api.showPublicFeatureCard !== 'function') {
      setPublicFeatureError('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
      return;
    }

    const card: PublicFeatureCard = {
      id: `${lair.id}-${effect.id}-${Date.now()}`,
      sourceName: lair.name,
      sourceType: 'lair',
      featureName: effect.name,
      section: effect.section || 'Логово',
      description: effect.description,
      html: effect.html
    };

    try {
      await api.showPublicFeatureCard(campaignId, card);
      setShownPublicFeatureId(effect.id);
    } catch (err) {
      setPublicFeatureError(err instanceof Error ? err.message : 'Не удалось показать эффект логова на экране игроков.');
    }
  }

  async function dismissFeatureOnPlayerScreen(): Promise<void> {
    setPublicFeatureError('');
    if (typeof api.dismissPublicFeatureCard !== 'function') {
      setPublicFeatureError('Desktop API устарел. Полностью остановите dev-версию и запустите npm.cmd run dev заново.');
      return;
    }

    try {
      await api.dismissPublicFeatureCard(campaignId);
      setShownPublicFeatureId('');
    } catch (err) {
      setPublicFeatureError(err instanceof Error ? err.message : 'Не удалось скрыть карточку с экрана игроков.');
    }
  }

  async function toggleFeatureOnPlayerScreen(effect: CreatureFeature): Promise<void> {
    if (shownPublicFeatureId === effect.id) {
      await dismissFeatureOnPlayerScreen();
      return;
    }

    await showFeatureOnPlayerScreen(effect);
  }

  return (
    <div className="statblock-preview lair-statblock-preview">
      <div className="lair-statblock-header">
        <div>
          <h4>{lair.name}</h4>
          <p>Инициатива {lair.initiative}</p>
        </div>
        <Shield size={28} />
      </div>
      <div className="statblock-public-toolbar">
        <span>Публичная карточка эффекта</span>
        <button className="button mini secondary" type="button" onClick={() => void dismissFeatureOnPlayerScreen()}>
          <X size={15} />
          Скрыть с экрана игроков
        </button>
      </div>
      {publicFeatureError && <div className="notice error compact-notice">{publicFeatureError}</div>}
      <div className="feature-columns lair-feature-columns">
        {effects.map((effect) => (
          <section className="feature-block lair-feature-block" key={effect.id}>
            <div className="feature-block-header">
              <h4>{effect.name}</h4>
              <button
                className={`feature-show-button ${shownPublicFeatureId === effect.id ? 'active' : ''}`}
                type="button"
                onClick={() => void toggleFeatureOnPlayerScreen(effect)}
              >
                {shownPublicFeatureId === effect.id ? <EyeOff size={15} /> : <MonitorUp size={15} />}
                {shownPublicFeatureId === effect.id ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            {effect.html ? (
              <div className="feature-html" dangerouslySetInnerHTML={{ __html: effect.html }} />
            ) : (
              <p>{effect.description || 'Описание эффекта не найдено.'}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

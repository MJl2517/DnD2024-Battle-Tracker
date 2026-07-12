import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Dices, LogOut, Shield, Skull } from 'lucide-react';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS, type PublicCombatant, type PublicCombatView, type PublicDisplaySettings } from '@shared/types';
import { InlineEmpty } from '../../shared/ui/PanelTitle';
import { StatusEffectChip } from '../../shared/ui/StatusEffectChip';
import { isConcentrating } from '../../shared/lib/combatEffects';
import { XpAwardModal } from '../../shared/ui/XpAwardModal';
import { formatHitPoints } from '../combat/model/hitPoints';
import { PublicFeatureCardOverlay } from './PublicFeatureCardOverlay';

const api = window.dndTracker;
const PLAYER_CARD_STEP = 730;
const PLAYER_CARD_CENTER = 365;
const PLAYER_SLIDER_REPEAT = 11;
const PLAYER_SLIDER_MIDDLE_REPEAT = Math.floor(PLAYER_SLIDER_REPEAT / 2);
const PLAYER_ORDER_ROW_STEP = 148;
const PLAYER_ORDER_ROW_CENTER = 74;

type PublicHpEvent = {
  id: string;
  combatantId: string;
  amount: number;
  kind: 'damage' | 'healing';
};
/**
 * Read-only экран второго монитора.
 * Он получает уже очищенную публичную модель и не имеет методов изменения боя или доступа к точным хитам NPC.
 */
export function PlayerDisplay(): JSX.Element {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const campaignId = params.get('campaignId') ?? '';
  const [view, setView] = useState<PublicCombatView>({ round: 1, combatants: [], settings: DEFAULT_PUBLIC_DISPLAY_SETTINGS });
  const [introAnimating, setIntroAnimating] = useState(false);
  const [hpEvents, setHpEvents] = useState<Record<string, PublicHpEvent>>({});
  const playerViewInitializedRef = useRef(false);
  const hadCombatRef = useRef(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousActiveIdRef = useRef<string | null>(null);
  const sliderCycleOffsetRef = useRef(PLAYER_SLIDER_MIDDLE_REPEAT);
  const previousHpSignalRef = useRef<Record<string, number>>({});
  const hpEventTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const combatants = view.combatants;
  const publicSettings = view.settings ?? DEFAULT_PUBLIC_DISPLAY_SETTINGS;
  const activeIndex = Math.max(
    0,
    combatants.findIndex((combatant) => combatant.isCurrent)
  );
  const sliderTrack = buildPlayerSliderTrack(combatants);
  const sliderVirtualIndex = combatants.length ? sliderCycleOffsetRef.current * combatants.length + activeIndex : 0;
  const orderTrack = buildPlayerOrderTrack(combatants, activeIndex, view.round);

  useEffect(() => {
    if (!campaignId) return undefined;

    function applyPlayerView(nextView: PublicCombatView): void {
      const hadCombat = hadCombatRef.current;
      const hasCombat = nextView.combatants.length > 0;
      const nextActiveId = nextView.combatants.find((combatant) => combatant.isCurrent)?.id ?? null;
      const nextHpSignals = readPublicHpSignals(nextView.combatants);

      if (!hasCombat || !hadCombat) {
        sliderCycleOffsetRef.current = PLAYER_SLIDER_MIDDLE_REPEAT;
      } else {
        const previousActiveId = previousActiveIdRef.current;
        const previousIndex = previousActiveId ? nextView.combatants.findIndex((combatant) => combatant.id === previousActiveId) : -1;
        const nextIndex = nextActiveId ? nextView.combatants.findIndex((combatant) => combatant.id === nextActiveId) : -1;
        const count = nextView.combatants.length;

        if (count > 1 && previousIndex >= 0 && nextIndex >= 0) {
          if (previousIndex === count - 1 && nextIndex === 0) {
            sliderCycleOffsetRef.current += 1;
          } else if (previousIndex === 0 && nextIndex === count - 1) {
            sliderCycleOffsetRef.current -= 1;
          }
        }

        if (sliderCycleOffsetRef.current <= 0 || sliderCycleOffsetRef.current >= PLAYER_SLIDER_REPEAT - 1) {
          sliderCycleOffsetRef.current = PLAYER_SLIDER_MIDDLE_REPEAT;
        }
      }

      if (playerViewInitializedRef.current && hadCombat && hasCombat) {
        const previousSignals = previousHpSignalRef.current;
        const nextEvents: PublicHpEvent[] = [];

        for (const combatant of nextView.combatants) {
          const previousSignal = previousSignals[combatant.id];
          const nextSignal = nextHpSignals[combatant.id];
          if (previousSignal === undefined || nextSignal === undefined || previousSignal === nextSignal) continue;

          const delta = nextSignal - previousSignal;
          nextEvents.push({
            id: `${combatant.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            combatantId: combatant.id,
            amount: Math.abs(delta),
            kind: delta < 0 ? 'damage' : 'healing'
          });
        }

        if (nextEvents.length > 0) {
          setHpEvents((current) => {
            const updated = { ...current };
            for (const event of nextEvents) {
              updated[event.combatantId] = event;
              if (hpEventTimersRef.current[event.combatantId]) {
                clearTimeout(hpEventTimersRef.current[event.combatantId]);
              }
              hpEventTimersRef.current[event.combatantId] = setTimeout(() => {
                setHpEvents((latest) => {
                  if (latest[event.combatantId]?.id !== event.id) return latest;
                  const rest = { ...latest };
                  delete rest[event.combatantId];
                  return rest;
                });
                delete hpEventTimersRef.current[event.combatantId];
              }, 1250);
            }
            return updated;
          });
        }
      }

      setView(nextView);

      if (playerViewInitializedRef.current && !hadCombat && hasCombat) {
        if (introTimerRef.current) clearTimeout(introTimerRef.current);
        setIntroAnimating(true);
        introTimerRef.current = setTimeout(() => setIntroAnimating(false), 2400);
      }

      hadCombatRef.current = hasCombat;
      previousActiveIdRef.current = nextActiveId;
      previousHpSignalRef.current = nextHpSignals;
      playerViewInitializedRef.current = true;
    }

    void api.getPlayerView(campaignId).then(applyPlayerView);
    const unsubscribe = api.onPlayerView(applyPlayerView);
    return () => {
      unsubscribe();
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      Object.values(hpEventTimersRef.current).forEach(clearTimeout);
      hpEventTimersRef.current = {};
    };
  }, [campaignId]);

  return (
    <main className="player-screen">
      <header className="player-header">
        <div>
          <p className="eyebrow">Экран игроков</p>
          <h1>Боевой порядок</h1>
        </div>
        <Dices size={44} />
      </header>
      {combatants.length === 0 ? (
        <section className="player-empty-panel">
          <InlineEmpty title="Бой ещё не начат" />
        </section>
      ) : (
        <section className={`player-board ${introAnimating ? 'intro' : ''}`}>
          {introAnimating && (
            <div className="initiative-intro-banner">
              <Dices size={34} />
              <span>Инициатива брошена</span>
            </div>
          )}
          <div className="player-slider-pane">
            <div className="player-slider-window">
              <div
                className="player-slider-track"
                style={{ transform: `translateX(calc(50% - ${sliderVirtualIndex * PLAYER_CARD_STEP + PLAYER_CARD_CENTER}px))` }}
              >
                {sliderTrack.map((item, index) => (
                  <PlayerInitiativeCard
                    combatant={item.combatant}
                    hpEvent={hpEvents[item.combatant.id]}
                    introIndex={index % Math.max(1, combatants.length)}
                    key={item.key}
                    settings={publicSettings}
                  />
                ))}
              </div>
            </div>
          </div>

          <aside className="player-order-pane">
            <div className="player-order-header">
              <span>Инициатива</span>
              <strong>Раунд {view.round}</strong>
            </div>
            <div className="player-order-window">
              <div
                className="player-order-track"
                style={{ transform: `translateY(-${orderTrack.currentIndex * PLAYER_ORDER_ROW_STEP + PLAYER_ORDER_ROW_CENTER}px)` }}
              >
                {orderTrack.items.map((item, index) => (
                  <PlayerOrderRow
                    hpEvent={item.round === view.round ? hpEvents[item.combatant.id] : undefined}
                    item={item}
                    introIndex={index}
                    key={item.key}
                    settings={publicSettings}
                  />
                ))}
              </div>
            </div>
          </aside>
        </section>
      )}
      {view.featureCard && <PublicFeatureCardOverlay card={view.featureCard} />}
      {view.xpAward && <XpAwardModal award={view.xpAward} publicView />}
    </main>
  );
}

interface PlayerOrderTrackItem {
  key: string;
  combatant: PublicCombatant;
  turnNumber: number;
  round: number;
  roundStart: boolean;
  current: boolean;
}

function buildPlayerSliderTrack(combatants: PublicCombatant[]): Array<{ key: string; combatant: PublicCombatant }> {
  if (!combatants.length) return [];

  return Array.from({ length: PLAYER_SLIDER_REPEAT }, (_, repeatIndex) =>
    combatants.map((combatant) => ({
      key: `${repeatIndex}-${combatant.id}`,
      combatant
    }))
  ).flat();
}

function readPublicHpSignals(combatants: PublicCombatant[]): Record<string, number> {
  return Object.fromEntries(
    combatants
      .map((combatant) => {
        const signal =
          typeof combatant.hpSignal === 'number'
            ? combatant.hpSignal
            : typeof combatant.currentHp === 'number'
              ? combatant.currentHp + (combatant.temporaryHp ?? 0)
              : undefined;
        return signal === undefined ? null : [combatant.id, signal];
      })
      .filter((entry): entry is [string, number] => Boolean(entry))
  );
}

function buildPlayerOrderTrack(
  combatants: PublicCombatant[],
  activeIndex: number,
  currentRound: number
): { items: PlayerOrderTrackItem[]; currentIndex: number } {
  if (!combatants.length) return { items: [], currentIndex: 0 };

  const items: PlayerOrderTrackItem[] = [];
  const safeRound = Math.max(1, currentRound);
  const rounds = Array.from({ length: safeRound + 4 }, (_, index) => index + 1);

  for (const round of rounds) {
    combatants.forEach((combatant, index) => {
      items.push({
        key: `${round}-${combatant.id}`,
        combatant,
        turnNumber: (round - 1) * combatants.length + index + 1,
        round,
        roundStart: index === 0,
        current: round === safeRound && combatant.isCurrent
      });
    });
  }

  return {
    items,
    currentIndex: (safeRound - 1) * combatants.length + activeIndex
  };
}

function getPublicCombatantMeta(combatant: PublicCombatant, settings: PublicDisplaySettings, includeInitiative = false): string[] {
  const isEnemy = combatant.side === 'npc' && !combatant.isAlly;
  const parts = includeInitiative ? [`Иниц. ${combatant.initiative}`] : [];

  if (!isEnemy || settings.showEnemyArmorClass) {
    parts.push(`КД ${combatant.armorClass}`);
  }

  if (combatant.side === 'player' && combatant.currentHp !== undefined && combatant.maxHp !== undefined) {
    parts.push(`Хиты ${formatHitPoints(combatant.currentHp, combatant.maxHp, combatant.temporaryHp)}`);
  }

  if (isEnemy && settings.showEnemySpeeds && combatant.speeds) {
    parts.push(combatant.speeds);
  }

  return parts;
}

function getPublicCombatantName(combatant: PublicCombatant, settings: PublicDisplaySettings): string {
  if (combatant.side === 'npc' && !combatant.isAlly && settings.hideCreatureNames && !combatant.publicNameVisible) {
    return 'Существо';
  }
  return combatant.name;
}

function FloatingHpEvent({ event, compact = false }: { event: PublicHpEvent; compact?: boolean }): JSX.Element {
  const prefix = event.kind === 'damage' ? '-' : '+';
  return (
    <span className={`floating-hp-event ${event.kind} ${compact ? 'compact' : ''}`} key={event.id} aria-hidden="true">
      {prefix}
      {event.amount}
    </span>
  );
}

function PlayerOrderRow({
  hpEvent,
  item,
  introIndex,
  settings
}: {
  hpEvent?: PublicHpEvent;
  item: PlayerOrderTrackItem;
  introIndex: number;
  settings: PublicDisplaySettings;
}): JSX.Element {
  const combatant = item.combatant;
  const publicName = getPublicCombatantName(combatant, settings);
  const meta = getPublicCombatantMeta(combatant, settings, true);
  return (
    <article
      className={`player-order-row ${item.current ? 'current' : ''} ${combatant.isAlly ? 'ally' : ''} ${combatant.bloodied ? 'bloodied' : ''} ${combatant.defeated ? 'defeated' : ''} ${combatant.escaped ? 'escaped' : ''} ${item.roundStart ? 'round-start' : ''} ${isConcentrating(combatant.effects) ? 'concentrating' : ''} ${hpEvent ? `hp-event ${hpEvent.kind}` : ''}`}
      style={{ '--intro-index': introIndex % Math.max(1, item.round === 1 ? 12 : 6) } as CSSProperties}
    >
      {hpEvent && <FloatingHpEvent compact event={hpEvent} />}
      {combatant.defeated && (
        <span className="death-mark small" aria-hidden="true">
          <Skull size={28} />
        </span>
      )}
      {combatant.escaped && (
        <span className="escaped-mark small" aria-hidden="true">
          <LogOut size={22} />
          Сбежал
        </span>
      )}
      {combatant.defeated && <span className="blood-trail" aria-hidden="true" />}
      {item.roundStart && <span className="player-round-marker">Раунд {item.round}</span>}
      <span className="player-order-turn">{item.turnNumber}</span>
      {combatant.tokenUrl ? (
        <img className="player-order-token" src={combatant.tokenUrl} alt="" />
      ) : (
        <span className="player-order-token empty">{combatant.initiative}</span>
      )}
      <div>
        <div className="public-combatant-name-row">
          <h3>{publicName}</h3>
          {combatant.isAlly && (
            <span className="ally-badge public">
              <Shield size={16} />
              Союзник
            </span>
          )}
        </div>
        <p>{meta.join(' · ')}</p>
        {combatant.effects.length > 0 && (
          <div className="player-order-effects">
            {combatant.effects.map((effect) => (
              <StatusEffectChip effect={effect} key={effect.id} />
            ))}
          </div>
        )}
      </div>
      {combatant.defeated ? (
        <span className="player-order-badge death">Пал</span>
      ) : combatant.escaped ? (
        <span className="player-order-badge">Сбежал</span>
      ) : (
        combatant.bloodied && <span className="player-order-badge">Окров.</span>
      )}
    </article>
  );
}

function PlayerInitiativeCard({
  combatant,
  hpEvent,
  introIndex,
  settings
}: {
  combatant: PublicCombatant;
  hpEvent?: PublicHpEvent;
  introIndex: number;
  settings: PublicDisplaySettings;
}): JSX.Element {
  const publicName = getPublicCombatantName(combatant, settings);
  const meta = getPublicCombatantMeta(combatant, settings);
  return (
    <article
      className={`player-card ${combatant.isCurrent ? 'current' : ''} ${combatant.isAlly ? 'ally' : ''} ${combatant.bloodied ? 'bloodied' : ''} ${combatant.defeated ? 'defeated' : ''} ${combatant.escaped ? 'escaped' : ''} ${isConcentrating(combatant.effects) ? 'concentrating' : ''} ${hpEvent ? `hp-event ${hpEvent.kind}` : ''}`}
      style={{ '--intro-index': introIndex } as CSSProperties}
    >
      {hpEvent && <FloatingHpEvent event={hpEvent} />}
      {combatant.defeated && (
        <span className="death-mark" aria-hidden="true">
          <Skull size={54} />
        </span>
      )}
      {combatant.escaped && (
        <span className="escaped-mark" aria-hidden="true">
          <LogOut size={46} />
          Сбежал
        </span>
      )}
      {combatant.defeated && <span className="blood-trail" aria-hidden="true" />}
      <div className="player-visual">
        {combatant.tokenUrl ? <img className="player-token" src={combatant.tokenUrl} alt="" /> : <div className="player-init">{combatant.initiative}</div>}
        {combatant.tokenUrl && <div className="player-token-init">{combatant.initiative}</div>}
      </div>
      <div className="player-info">
        <div className="public-combatant-name-row">
          <h2>{publicName}</h2>
          {combatant.isAlly && (
            <span className="ally-badge public">
              <Shield size={18} />
              Союзник
            </span>
          )}
        </div>
        {meta.length > 0 && <p>{meta.join(' · ')}</p>}
        <div className="chip-row">
          {combatant.defeated ? (
            <span className="chip muted-chip">Пал</span>
          ) : combatant.escaped ? (
            <span className="chip muted-chip">Сбежал</span>
          ) : (
            combatant.bloodied && <span className="chip danger-chip">Окровавлен</span>
          )}
          {combatant.effects.map((effect) => (
            <StatusEffectChip effect={effect} key={effect.id} />
          ))}
        </div>
      </div>
    </article>
  );
}

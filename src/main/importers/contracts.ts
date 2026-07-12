import type { SpellCard } from '@shared/types';
import type { ParsedCreatureTemplate } from '../services/ruleholderParser';

/** Контракт адаптера одного источника: сеть общая, а DOM/JSON каждого сайта разбирается независимо. */
export interface CreatureSourceAdapter {
  readonly hostname: string;
  readonly displayName: string;
  parseCreature(html: string, sourceUrl: string): ParsedCreatureTemplate;
  parseSpell(html: string, sourceUrl: string): SpellCard;
}

import { z } from 'zod';
import type { SpellCard } from '@shared/types';
import type { ParsedCreatureTemplate } from '../services/ruleholderParser';
import type { CreatureSourceAdapter } from './contracts';
import { nextDndAdapter } from './nextDnd/adapter';
import { ruleholderAdapter } from './ruleholder/adapter';
import { ttgClubAdapter } from './ttgClub/adapter';

const sourceUrlSchema = z.string().url('Укажите корректную ссылку на статблок.');
const adapters: CreatureSourceAdapter[] = [ruleholderAdapter, nextDndAdapter, ttgClubAdapter];

/**
 * Единая точка входа для импорта статблоков и заклинаний.
 * Сервис проверяет адрес, выбирает адаптер по домену и кэширует заклинания на время работы приложения.
 */
export class ImportService {
  private readonly spellCache = new Map<string, SpellCard>();

  async importCreature(rawUrl: string): Promise<ParsedCreatureTemplate> {
    const { url, adapter } = this.resolveSource(rawUrl);
    const html = await this.fetchHtml(url, adapter, false);
    return adapter.parseCreature(html, url.toString());
  }

  /** Загружает карточку заклинания тем же адаптером, которому принадлежит исходная ссылка. */
  async importSpell(href: string): Promise<SpellCard> {
    const { url, adapter } = this.resolveSource(new URL(href, 'https://ruleholder.com').toString());
    if (!url.pathname.startsWith('/spells/')) {
      throw new Error('Поддерживаются только ссылки на заклинания Ruleholder, next.dnd.su и TTG Club.');
    }
    url.hash = '';
    url.search = '';
    const normalizedUrl = url.toString();
    const cached = this.spellCache.get(normalizedUrl);
    if (cached) return cached;

    const html = await this.fetchHtml(url, adapter, true);
    const spell = adapter.parseSpell(html, normalizedUrl);
    this.spellCache.set(normalizedUrl, spell);
    return spell;
  }

  private resolveSource(rawUrl: string): { url: URL; adapter: CreatureSourceAdapter } {
    const parsed = sourceUrlSchema.safeParse(rawUrl);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Некорректная ссылка.');
    const url = new URL(parsed.data);
    const hostname = url.hostname.toLocaleLowerCase('en').replace(/^www\./, '');
    const adapter = adapters.find((candidate) => candidate.hostname === hostname);
    if (!adapter) throw new Error('Импорт сейчас поддерживает ссылки ruleholder.com, next.dnd.su и new.ttg.club.');
    return { url, adapter };
  }

  private async fetchHtml(url: URL, adapter: CreatureSourceAdapter, spell: boolean): Promise<string> {
    const response = await fetch(url, { headers: { 'user-agent': 'DnD-2024-Battle-Tracker/0.2' } });
    if (!response.ok) throw new Error(`${adapter.displayName} вернул HTTP ${response.status}${spell ? ' для заклинания' : ''}.`);
    return response.text();
  }
}

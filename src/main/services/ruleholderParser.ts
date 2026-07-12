import { load } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { AbilityBlock, CreatureFeature, SaveCreatureTemplateInput, SavingThrowBlock, SpellCard } from '@shared/types';

export type ParsedCreatureTemplate = Omit<SaveCreatureTemplateInput, 'campaignId'>;

const ABILITY_LABELS: Record<string, keyof AbilityBlock> = {
  СИЛ: 'str',
  ЛОВ: 'dex',
  ЛВК: 'dex',
  ТЕЛ: 'con',
  ВЫН: 'con',
  ИНТ: 'int',
  МДР: 'wis',
  ХАР: 'cha'
};

const DEFAULT_ABILITIES: AbilityBlock = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10
};

/** Разбирает серверный HTML Ruleholder в единую редактируемую модель статблока. */
export function parseRuleholderMonster(html: string, sourceUrl: string): ParsedCreatureTemplate {
  const $ = load(html);
  const statblock = $('.statblock.npc').first();

  if (!statblock.length) {
    throw new Error('Не найден statblock NPC на странице Ruleholder.');
  }

  const statblockRoot = statblock.get(0);
  if (!statblockRoot) {
    throw new Error('Не удалось прочитать statblock NPC.');
  }

  const name = normalizeText(statblock.find('.statblock-title').first().text()) || extractTitle($('title').text());
  const originalName = normalizeText($('#entity-original-name').first().text()) || extractOriginalName($('title').text()) || name;
  const tags = normalizeText(statblock.find('.statblock-tags').first().text());
  const { size, creatureType, alignment } = parseTags(tags);
  const header = readStatblockPairs($, statblockRoot);
  const { mod: initiativeMod, score: initiativeScore } = parseInitiative(header.get('Инициатива') ?? '');
  const { hp, hitDice } = parseHitPoints(header.get('ПЗ') ?? '');
  const { challengeRating, xp, proficiencyBonus } = parseChallenge(header.get('КО') ?? '');
  const { abilities, savingThrows } = parseAbilities($, statblockRoot);
  const sections = parseFeatures($, statblockRoot);
  const images = extractRuleholderImages(html);
  const lair = extractLairBlock($);

  return {
    name,
    originalName,
    size,
    creatureType,
    alignment,
    armorClass: parseFirstNumber(header.get('КБ') ?? '', 10),
    initiativeMod,
    initiativeScore,
    hitPoints: hp,
    hitDice,
    speeds: header.get('Скорость') ?? '',
    abilities,
    savingThrows,
    skills: header.get('Навыки') ?? '',
    vulnerabilities: header.get('Уязвимость') ?? '',
    resistances: header.get('Устойчивость') ?? '',
    immunities: header.get('Невосприимчивость') ?? '',
    conditionImmunities: header.get('Невосприимчивость к состояниям') ?? '',
    senses: header.get('Восприятие') ?? header.get('Чувства') ?? '',
    languages: header.get('Языки') ?? '',
    challengeRating,
    xp,
    proficiencyBonus,
    traits: sections.traits,
    actions: sections.actions,
    imageUrl: images.imageUrl,
    tokenUrl: images.tokenUrl,
    lairName: lair.name,
    lairDescription: lair.description,
    lairHtml: lair.html,
    lairEffects: lair.effects,
    sourceUrl,
    notes: ''
  };
}

/** Извлекает карточку заклинания Ruleholder для всплывающей подсказки в статблоке. */
export function parseRuleholderSpell(html: string, sourceUrl: string): SpellCard {
  const $ = load(html);
  const titleText = $('title').first().text();
  const name = normalizeText($('h1').not('.sr-only').first().text()) || extractTitle(titleText);
  const metadata = readSpellMetadata($);
  const descriptionRoot = $('article .rich-content').first();
  const descriptionHtml = sanitizeFeatureHtml(descriptionRoot.html() ?? '');
  const description = normalizeText(descriptionRoot.text());

  if (!name || !description) {
    throw new Error('Не удалось распознать страницу заклинания Ruleholder.');
  }

  return {
    url: sourceUrl,
    name,
    originalName: normalizeText($('#entity-original-name').first().text()) || extractOriginalName(titleText),
    source: normalizeText($('.rh-source-tag').first().text()),
    level: metadata.get('Круг') ?? '',
    school: metadata.get('Школа магии') ?? '',
    castingTime: metadata.get('Время сотворения') ?? '',
    range: metadata.get('Дистанция') ?? '',
    duration: metadata.get('Длительность') ?? '',
    target: metadata.get('Цель') ?? '',
    area: metadata.get('Область действия') ?? '',
    save: metadata.get('Испытание') ?? '',
    damage: metadata.get('Урон') ?? '',
    components: metadata.get('Компоненты') ?? '',
    description,
    descriptionHtml
  };
}

function readStatblockPairs($: ReturnType<typeof load>, root: AnyNode): Map<string, string> {
  const pairs = new Map<string, string>();
  $(root)
    .find('dl > div')
    .each((_, node) => {
      const key = normalizeText($(node).find('dt').first().text());
      const value = normalizeText($(node).find('dd').first().text());
      if (key && value && !pairs.has(key)) {
        pairs.set(key, value);
      }
    });
  return pairs;
}

function readSpellMetadata($: ReturnType<typeof load>): Map<string, string> {
  const pairs = new Map<string, string>();
  $('.rh-detail-metadata-grid > div').each((_, node) => {
    const key = normalizeText($(node).find('dt').first().text());
    const value = normalizeText($(node).find('dd').first().text());
    if (key && value) {
      pairs.set(key, value);
    }
  });
  return pairs;
}

function parseAbilities($: ReturnType<typeof load>, root: AnyNode): { abilities: AbilityBlock; savingThrows: SavingThrowBlock } {
  const abilities: AbilityBlock = { ...DEFAULT_ABILITIES };
  const savingThrows: SavingThrowBlock = {};

  $(root)
    .find('.abilities tbody tr')
    .each((_, row) => {
      const label = normalizeText($(row).find('th').first().text());
      const key = ABILITY_LABELS[label];
      if (!key) return;

      const cells = $(row).find('td');
      const score = parseFirstNumber($(cells[0]).text(), 10);
      const save = parseSignedNumber($(cells[2]).text());
      abilities[key] = score;
      savingThrows[key] = save;
    });

  return { abilities, savingThrows };
}

function parseFeatures($: ReturnType<typeof load>, root: AnyNode): { traits: CreatureFeature[]; actions: CreatureFeature[] } {
  const traits: CreatureFeature[] = [];
  const actions: CreatureFeature[] = [];

  $(root)
    .find('.statblock-actions')
    .each((sectionIndex, section) => {
      const sectionTitle = normalizeText($(section).find('.statblock-actions-title').first().text()) || 'Действия';
      const bucket = sectionTitle.toLocaleLowerCase('ru').includes('особ') ? traits : actions;

      $(section)
        .find('.statblock-action')
        .each((featureIndex, feature) => {
          const name = normalizeText($(feature).find('.name').first().text()).replace(/\.$/, '') || `${sectionTitle} ${featureIndex + 1}`;
          const description = normalizeText($(feature).text().replace(name, ''));
          bucket.push({
            id: slugify(`${sectionIndex}-${featureIndex}-${name}`),
            name,
            section: sectionTitle,
            description,
            html: sanitizeFeatureHtml($(feature).html() ?? '')
          });
        });
    });

  return { traits, actions };
}

function extractLairBlock($: ReturnType<typeof load>): { name: string; description: string; html: string; effects: CreatureFeature[] } {
  const heading = $('h2,h3')
    .filter((_, node) => normalizeText($(node).text()).toLocaleLowerCase('ru').includes('логов'))
    .first();

  if (!heading.length) {
    return { name: '', description: '', html: '', effects: [] };
  }

  const chunks: string[] = [];
  const texts: string[] = [];
  let current = heading.next();

  while (current.length) {
    if (current.is('h2')) break;
    if (current.is('script,style,nav')) {
      current = current.next();
      continue;
    }

    const html = $.html(current);
    const text = normalizeText(current.text());
    if (html) chunks.push(html);
    if (text) texts.push(text);
    current = current.next();
  }

  const rawHtml = chunks.join('\n');
  const description = normalizeText(texts.join(' '));

  return {
    name: normalizeText(heading.text()),
    description,
    html: sanitizeFeatureHtml(rawHtml),
    effects: extractLairEffects(rawHtml, description)
  };
}

export function extractLairEffects(rawHtml: string, fallbackDescription: string): CreatureFeature[] {
  if (!rawHtml.trim()) return fallbackDescription ? [lairEffect(0, 'Эффект логова', fallbackDescription, '')] : [];

  const $ = load(`<div data-root="true">${rawHtml}</div>`, null, false);
  const candidates = $('[data-root]')
    .find('p,li')
    .filter((_, node) => Boolean(normalizeText($(node).text())));
  const nodes = candidates.length ? candidates.toArray() : $('[data-root]').children().toArray();
  const effects: CreatureFeature[] = [];

  nodes.forEach((node, index) => {
    const text = normalizeText($(node).text());
    if (!text) return;

    const explicitName = normalizeText($(node).find('strong,b,h3,h4,.name').first().text()).replace(/\.$/, '');
    const inferredName = explicitName || inferEffectName(text, index);
    const description = explicitName ? normalizeText(text.replace(explicitName, '').replace(/^\./, '')) : text;
    effects.push(lairEffect(index, inferredName, description, sanitizeFeatureHtml($.html(node) ?? '')));
  });

  return effects.length ? effects : [lairEffect(0, 'Эффект логова', fallbackDescription, sanitizeFeatureHtml(rawHtml))];
}

function lairEffect(index: number, name: string, description: string, html: string): CreatureFeature {
  const effectName = name.trim() || `Эффект логова ${index + 1}`;
  return {
    id: slugify(`lair-${index}-${effectName}`) || `lair-${index}`,
    name: effectName,
    section: 'Логово',
    description: normalizeText(description),
    html
  };
}

function inferEffectName(text: string, index: number): string {
  const sentence = text.split(/[.!?]/)[0]?.trim() ?? '';
  if (sentence.length >= 4 && sentence.length <= 54) return sentence;
  return `Эффект логова ${index + 1}`;
}

export function sanitizeFeatureHtml(rawHtml: string): string {
  const $ = load(`<div data-root="true">${rawHtml}</div>`, null, false);
  $('script,style,iframe,object,embed,img,svg').remove();
  $('[data-root] *').each((_, node) => {
    const element = node as AnyNode & { attribs?: Record<string, string> };
    if (!element.attribs) return;

    for (const attribute of Object.keys(element.attribs)) {
      const value = element.attribs[attribute] ?? '';
      const isSafeHref =
        attribute === 'href' &&
        (value.startsWith('/') ||
          value.startsWith('https://ruleholder.com/') ||
          value.startsWith('https://next.dnd.su/') ||
          value.startsWith('https://new.ttg.club/') ||
          value.startsWith('https://dnd.su/'));
      const isPresentation = attribute === 'class';
      const isSafeData =
        attribute === 'data-name' ||
        attribute === 'data-ref-color' ||
        attribute === 'data-reference-type' ||
        attribute === 'data-reference-key' ||
        attribute === 'data-roll-type' ||
        attribute === 'data-roll-formula' ||
        attribute === 'data-roll-damage-types';
      if (!isSafeHref && !isPresentation && !isSafeData) {
        delete element.attribs[attribute];
      }
    }
  });
  return $('[data-root]').html() ?? '';
}

export function cleanElementText(element: ReturnType<ReturnType<typeof load>>): string {
  const clone = element.clone();
  clone.find('sup,script,style,svg,.svg').remove();
  return normalizeText(clone.text().replace(/\?/g, ''));
}

export function parseTags(tags: string): { size: string; creatureType: string; alignment: string } {
  const [kind = '', ...commaParts] = tags
    .split(',')
    .map((part) => normalizeText(part))
    .filter(Boolean);
  const { size, type } = parseCreatureKind(kind);
  const alignment = commaParts.length ? commaParts[commaParts.length - 1] : '';
  const subtypeParts = commaParts.slice(0, -1);

  return {
    size,
    creatureType: [type, ...subtypeParts].filter(Boolean).join(', '),
    alignment
  };
}

function parseCreatureKind(kind: string): { size: string; type: string } {
  const sizePattern = '(?:Крошечный|Маленький|Небольшой|Средний|Большой|Огромный|Громадный)';
  const match = kind.match(new RegExp(`^(${sizePattern}(?:\\s+или\\s+${sizePattern})*)\\s+(.+)$`, 'i'));
  if (!match) {
    const [size = '', ...typeParts] = kind.split(/\s+/);
    return { size, type: typeParts.join(' ') };
  }

  return {
    size: normalizeText(match[1]),
    type: normalizeText(match[2])
  };
}

export function parseInitiative(value: string): { mod: number; score: number } {
  const mod = parseSignedNumber(value);
  const scoreMatch = value.match(/\(([-+]?\d+)\)/);
  return {
    mod,
    score: scoreMatch ? Number(scoreMatch[1]) : 10 + mod
  };
}

export function parseHitPoints(value: string): { hp: number; hitDice: string } {
  const hp = parseFirstNumber(value, 1);
  const diceMatch = value.match(/\(([^)]+)\)/);
  return {
    hp,
    hitDice: diceMatch ? diceMatch[1].trim() : ''
  };
}

function parseChallenge(value: string): { challengeRating: string; xp: number; proficiencyBonus: number } {
  const challengeRating = normalizeText(value.split('(')[0] ?? '');
  const xpMatch = value.replace(/\s/g, '').match(/\(([\d,.]+)ПО/i);
  const proficiencyMatch = value.match(/БУ\s*([-+]?\d+)/i);
  return {
    challengeRating,
    xp: xpMatch ? Number(xpMatch[1].replace(/[,.]/g, '')) : 0,
    proficiencyBonus: proficiencyMatch ? Number(proficiencyMatch[1]) : 0
  };
}

export function parseFirstNumber(value: string, fallback: number): number {
  const match = value.match(/[-+]?\d+/);
  return match ? Number(match[0]) : fallback;
}

export function parseSignedNumber(value: string): number {
  const match = value.match(/[-+]\d+|\b\d+\b/);
  return match ? Number(match[0]) : 0;
}

export function normalizeText(value: string): string {
  return value
    .replace(/&thinsp;/g, ' ')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function slugify(value: string): string {
  return value
    .toLocaleLowerCase('ru')
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function extractTitle(title: string): string {
  return normalizeText(title.split('|')[0]?.split('/')[0] ?? '');
}

function extractOriginalName(title: string): string {
  const match = title.match(/\/\s*([^|]+)/);
  return match ? normalizeText(match[1]) : '';
}

export function parseBracketedTitle(value: string): { name: string; originalName: string } {
  const match = value.match(/^(.+?)\s*\[([^\]]+)\]/);
  if (!match) {
    return { name: normalizeText(value), originalName: extractOriginalName(value) };
  }

  return {
    name: normalizeText(match[1]),
    originalName: normalizeText(match[2])
  };
}

function extractRuleholderImages(html: string): { imageUrl: string; tokenUrl: string } {
  const urls = extractMediaUrls(html);
  const imageUrl = urls.find((url) => /\/portraits?\//i.test(url)) ?? urls[0] ?? '';
  const tokenUrl = urls.find((url) => /\/(?:tokens?|tokenized)\//i.test(url) || /(?:^|[-_/])tokens?(?:[-_.?/]|$)/i.test(url)) ?? '';

  return { imageUrl, tokenUrl };
}

function extractMediaUrls(html: string): string[] {
  const urls = new Set<string>();
  const normalizedHtml = html.replace(/\\u002F/g, '/');
  const mediaPattern = /https:\\?\/\\?\/media\.ruleholder\.com\\?\/images\\?\/[^"'\\\s)<]+/g;
  for (const match of normalizedHtml.matchAll(mediaPattern)) {
    addMediaUrl(urls, match[0]);
  }

  const encodedPattern = /url=([^&"']+)/g;
  for (const match of normalizedHtml.matchAll(encodedPattern)) {
    try {
      addMediaUrl(urls, decodeURIComponent(match[1]));
    } catch {
      continue;
    }
  }

  return [...urls];
}

function addMediaUrl(urls: Set<string>, value: string): void {
  const clean = value
    .replace(/\\/g, '')
    .replace(/&amp;.*/, '')
    .replace(/[),]+$/, '');
  if (clean.startsWith('https://media.ruleholder.com/images/')) {
    urls.add(clean);
  }
}

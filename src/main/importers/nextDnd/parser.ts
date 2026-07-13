import { load } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { AbilityBlock, CreatureFeature, SavingThrowBlock, SpellCard } from '@shared/types';
import { normalizeConditionImmunities } from '@shared/conditionNames';
import {
  cleanElementText,
  escapeAttribute,
  escapeHtml,
  extractLairEffects,
  extractTitle,
  normalizeText,
  parseBracketedTitle,
  parseFirstNumber,
  parseHitPoints,
  parseInitiative,
  parseSignedNumber,
  parseTags,
  sanitizeFeatureHtml,
  slugify,
  type ParsedCreatureTemplate
} from '../../services/ruleholderParser';

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

const DEFAULT_ABILITIES: AbilityBlock = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

/** Разбирает HTML Next D&D, сохраняя ссылки на заклинания и отдельные эффекты логова. */
export function parseNextDndMonster(html: string, sourceUrl: string): ParsedCreatureTemplate {
  const $ = load(html);
  const card = $('.card__category-bestiary').first();

  if (!card.length) {
    throw new Error('Не найдена карточка NPC на странице next.dnd.su.');
  }

  const titleText =
    normalizeText(card.find('.card-title [data-copy]').first().attr('data-copy') ?? card.find('.card-title').first().text()) || extractTitle($('title').text());
  const { name, originalName } = parseBracketedTitle(titleText);
  const tagText = cleanElementText(card.find('.size-type-alignment').first());
  const { size, creatureType, alignment } = parseTags(tagText);
  const params = readNextDndParams($, card);
  const initiativeText = cleanElementText(card.find('.subsection-initiative').first()) || params.get('Инициатива') || '';
  const { mod: initiativeMod, score: initiativeScore } = parseInitiative(initiativeText);
  const hitPoints = parseFirstNumber(
    card
      .find('li')
      .filter((_, node) => cleanElementText($(node).find('strong').first()) === 'Хиты')
      .first()
      .find('[data-type="middle"]')
      .first()
      .text(),
    0
  );
  const hitDice = parseNextDndHitDice($, card) || parseHitPoints(params.get('Хиты') ?? '').hitDice;
  const challenge = parseNextDndChallenge(params.get('Опасность') ?? '');
  const { abilities, savingThrows } = parseNextDndAbilities($, card);
  const immunities = splitNextDndImmunities(params.get('Иммунитеты') ?? '');
  const sections = parseNextDndFeatures($, card, sourceUrl);
  const images = extractNextDndImages($, sourceUrl);
  const lair = extractNextDndLairBlock($, card);

  return {
    name,
    originalName,
    size,
    creatureType,
    alignment,
    armorClass: parseFirstNumber(cleanElementText(card.find('.subsection-ac').first()) || params.get('Класс Защиты') || params.get('КД') || '', 10),
    initiativeMod,
    initiativeScore,
    hitPoints: hitPoints || parseHitPoints(params.get('Хиты') ?? '').hp,
    hitDice,
    speeds: params.get('Скорость') ?? '',
    abilities,
    savingThrows,
    skills: params.get('Навыки') ?? '',
    vulnerabilities: params.get('Уязвимости') ?? '',
    resistances: params.get('Сопротивления') ?? params.get('Устойчивости') ?? '',
    immunities: immunities.damage || params.get('Невосприимчивость') || '',
    conditionImmunities: normalizeConditionImmunities(immunities.conditions || params.get('Иммунитеты к состояниям') || ''),
    senses: params.get('Чувства') ?? params.get('Восприятие') ?? '',
    languages: params.get('Языки') ?? '',
    challengeRating: challenge.challengeRating,
    xp: challenge.xp,
    proficiencyBonus: challenge.proficiencyBonus,
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

export function parseNextDndSpell(html: string, sourceUrl: string): SpellCard {
  const $ = load(html);
  const card = $('.card__category-spells').first();

  if (!card.length) {
    throw new Error('Не найдена карточка заклинания на странице next.dnd.su.');
  }

  const titleText =
    normalizeText(card.find('.card-title [data-copy]').first().attr('data-copy') ?? card.find('.card-title').first().text()) || extractTitle($('title').text());
  const { name, originalName } = parseBracketedTitle(titleText);
  const metadata = readNextDndSpellMetadata($, card);
  const descriptionRoot = card.find('li.subsection.desc').first();
  const descriptionHtml = renderNextDndRichHtml($, descriptionRoot, sourceUrl);
  const description = normalizeText(descriptionRoot.text());

  if (!name || !description) {
    throw new Error('Не удалось распознать страницу заклинания next.dnd.su.');
  }

  return {
    url: sourceUrl,
    name,
    originalName,
    source: normalizeText(card.find('.source-plaque[title]').first().attr('title') ?? ''),
    level: metadata.get('Уровень') ?? '',
    school: metadata.get('Школа') ?? '',
    castingTime: metadata.get('Время сотворения') ?? '',
    range: metadata.get('Дистанция') ?? '',
    duration: metadata.get('Длительность') ?? '',
    target: metadata.get('Цель') ?? '',
    area: metadata.get('Область') ?? '',
    save: metadata.get('Испытание') ?? metadata.get('Спасбросок') ?? '',
    damage: metadata.get('Урон') ?? '',
    components: metadata.get('Компоненты') ?? '',
    description,
    descriptionHtml
  };
}

function readNextDndParams($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>): Map<string, string> {
  const pairs = new Map<string, string>();
  root.find('ul.params-bestiary > li').each((_, node) => {
    const item = $(node);
    if (item.hasClass('article-body__monster__section') || item.hasClass('abilities') || item.hasClass('size-type-alignment')) return;
    const key = cleanElementText(item.find('strong').first());
    if (!key || pairs.has(key)) return;
    const value = cleanNextDndParamValue(item);
    if (value) pairs.set(key, value);
  });
  return pairs;
}

function cleanNextDndParamValue(item: ReturnType<ReturnType<typeof load>>): string {
  const clone = item.clone();
  clone.children('strong').first().remove();
  clone.find('sup,script,style,svg,.svg,.icon-dice,.rolled-hits,.monster__treasure-roll-result').remove();
  return normalizeText(clone.text().replace(/\?/g, ''));
}

function parseNextDndAbilities(
  $: ReturnType<typeof load>,
  root: ReturnType<ReturnType<typeof load>>
): { abilities: AbilityBlock; savingThrows: SavingThrowBlock } {
  const abilities: AbilityBlock = { ...DEFAULT_ABILITIES };
  const savingThrows: SavingThrowBlock = {};

  root.find('li.abilities .stat-pair-row').each((_, row) => {
    const label = normalizeText($(row).find('.title').first().text());
    const key = ABILITY_LABELS[label];
    if (!key) return;

    abilities[key] = parseFirstNumber($(row).find('.value').first().text(), 10);
    savingThrows[key] = parseSignedNumber($(row).find('.save').first().text());
  });

  return { abilities, savingThrows };
}

function parseNextDndFeatures(
  $: ReturnType<typeof load>,
  root: ReturnType<ReturnType<typeof load>>,
  sourceUrl: string
): { traits: CreatureFeature[]; actions: CreatureFeature[] } {
  const traits: CreatureFeature[] = [];
  const actions: CreatureFeature[] = [];

  root.find('.article-body__monster__section').each((sectionIndex, section) => {
    const sectionTitle = normalizeText($(section).find('.article-body__monster__section-title').first().text()) || 'Действия';
    const bucket = sectionTitle.toLocaleLowerCase('ru').includes('особ') ? traits : actions;

    $(section)
      .find('.article-body__feature, .article-body__monster-attack, .article-body__monster-save-effect')
      .each((featureIndex, feature) => {
        const name = cleanElementText(
          $(feature)
            .find('.article-body__feature-name, .article-body__monster-attack__name, .article-body__monster-save-effect__name, [data-monster-block]')
            .first()
        ).replace(/\.$/, '');
        const fallbackName = `${sectionTitle} ${featureIndex + 1}`;
        const featureName = name || fallbackName;
        const content = $(feature).clone();
        content
          .find('.article-body__feature-name, .article-body__monster-attack__name, .article-body__monster-save-effect__name, [data-monster-block]')
          .first()
          .remove();
        const description = normalizeText(content.text().replace(/^\s*[.:]\s*/, ''));
        const html = renderNextDndFeatureHtml($, content, sourceUrl);

        bucket.push({
          id: slugify(`${sectionIndex}-${featureIndex}-${featureName}`),
          name: featureName,
          section: sectionTitle,
          description,
          html
        });
      });
  });

  return { traits, actions };
}

function extractNextDndLairBlock(
  $: ReturnType<typeof load>,
  root: ReturnType<ReturnType<typeof load>>
): { name: string; description: string; html: string; effects: CreatureFeature[] } {
  const heading = root
    .find('.article-body__header_small_underlined,h2,h3')
    .filter((_, node) => normalizeText($(node).text()).toLocaleLowerCase('ru').includes('логов'))
    .first();

  if (!heading.length) {
    return { name: '', description: '', html: '', effects: [] };
  }

  const chunks: string[] = [];
  const effectChunks: string[] = [];
  const texts: string[] = [];
  let current = heading.next();

  while (current.length) {
    const text = normalizeText(current.text());
    if (current.is('.article-body__header_small_underlined,h2,h3,.comments,.card__footer') && text) break;
    if (current.is('script,style,nav')) {
      current = current.next();
      continue;
    }

    const html = $.html(current);
    if (html) chunks.push(html);
    if (html && current.is('ul,ol,li')) effectChunks.push(html);
    if (text) texts.push(text);
    current = current.next();
  }

  const rawHtml = chunks.join('\n');
  const effectHtml = effectChunks.join('\n');
  const description = normalizeText(texts.join(' '));

  return {
    name: normalizeText(heading.text()),
    description,
    html: sanitizeFeatureHtml(rawHtml),
    effects: extractLairEffects(effectHtml || rawHtml, description)
  };
}

function parseNextDndHitDice($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>): string {
  const hitPointsRow = root
    .find('ul.params-bestiary > li')
    .filter((_, node) => cleanElementText($(node).find('strong').first()) === 'Хиты')
    .first();
  const count = normalizeText(hitPointsRow.find('[data-type="throw"]').first().text());
  const sides = normalizeText(hitPointsRow.find('[data-type="dice"]').first().text());
  const action = normalizeText(hitPointsRow.find('[data-type="action"]').first().text());
  const bonus = normalizeText(hitPointsRow.find('[data-type="bonus"]').first().text());
  if (!count || !sides) return '';
  return `${count}d${sides}${bonus ? ` ${action || '+'} ${bonus}` : ''}`;
}

function parseNextDndChallenge(value: string): { challengeRating: string; xp: number; proficiencyBonus: number } {
  const challengeRating = normalizeText(value.split('(')[0] ?? '');
  const compact = value.replace(/[\s\u00a0\u202f&thinsp;]+/g, '');
  const xpMatch = compact.match(/\(([\d,.]+)опыта/i);
  const proficiencyMatch = value.match(/БВ\s*([-+]?\d+)/i);
  return {
    challengeRating,
    xp: xpMatch ? Number(xpMatch[1].replace(/[,.]/g, '')) : 0,
    proficiencyBonus: proficiencyMatch ? Number(proficiencyMatch[1]) : 0
  };
}

function splitNextDndImmunities(value: string): { damage: string; conditions: string } {
  const [damage = '', conditions = ''] = value.split(';').map((part) => normalizeText(part.replace(/\?/g, '')));
  return { damage, conditions };
}

function extractNextDndImages($: ReturnType<typeof load>, sourceUrl: string): { imageUrl: string; tokenUrl: string } {
  const urls: string[] = [];
  $('[data-src], img[src]').each((_, node) => {
    const value = $(node).attr('data-src') || $(node).attr('src') || '';
    if (!value || /favicon|thumbnail/i.test(value)) return;
    try {
      urls.push(new URL(value, sourceUrl).toString());
    } catch {
      // Ignore malformed gallery/image links.
    }
  });

  const uniqueUrls = [...new Set(urls)];
  const imageUrl = uniqueUrls.find((url) => /\/gallery\/bestiary\//i.test(url)) ?? uniqueUrls[0] ?? '';
  const tokenUrl = uniqueUrls.find((url) => /(?:^|[-_/])tokens?(?:[-_.?/]|$)|tokenized/i.test(url)) ?? '';
  return { imageUrl, tokenUrl };
}

function readNextDndSpellMetadata($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>): Map<string, string> {
  const pairs = new Map<string, string>();
  const schoolLevel = root.find('.params-spells .school_level').first();
  if (schoolLevel.length) {
    const parts = normalizeText(schoolLevel.text())
      .split(',')
      .map((part) => normalizeText(part))
      .filter(Boolean);
    if (parts[0]) pairs.set('Уровень', parts[0]);
    if (parts[1]) pairs.set('Школа', parts[1]);
  }

  root.find('.params-spells > li').each((_, node) => {
    const item = $(node);
    if (item.hasClass('school_level') || item.hasClass('subsection')) return;

    const key = normalizeText(item.find('strong').first().text()).replace(/:$/, '');
    if (!key || pairs.has(key)) return;

    const clone = item.clone();
    clone.find('strong').first().remove();
    const value = normalizeText(clone.text());
    if (value) pairs.set(key, value);
  });

  return pairs;
}

function renderNextDndFeatureHtml($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>, sourceUrl: string): string {
  const inline = renderNextDndInlineChildren($, root.contents().toArray(), sourceUrl)
    .replace(/^\s*[.:]\s*/, '')
    .trim();
  return inline ? sanitizeFeatureHtml(`<p>${inline}</p>`) : '';
}

function renderNextDndRichHtml($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>, sourceUrl: string): string {
  if (!root.length) return '';

  const blocks: string[] = [];
  root.children().each((_, node) => {
    const element = $(node);
    if (element.is('script,style,nav,.card__footer')) return;

    if (element.is('ul,ol')) {
      const tag = element.is('ol') ? 'ol' : 'ul';
      const items = element
        .children('li')
        .toArray()
        .map((item) => renderNextDndInlineChildren($, $(item).contents().toArray(), sourceUrl).trim())
        .filter(Boolean)
        .map((item) => `<li>${item}</li>`)
        .join('');
      if (items) blocks.push(`<${tag}>${items}</${tag}>`);
      return;
    }

    const inline = renderNextDndInlineChildren($, element.contents().toArray(), sourceUrl)
      .replace(/^\s*[.:]\s*/, '')
      .trim();
    if (inline) blocks.push(`<p>${inline}</p>`);
  });

  if (!blocks.length) {
    const inline = renderNextDndInlineChildren($, root.contents().toArray(), sourceUrl)
      .replace(/^\s*[.:]\s*/, '')
      .trim();
    if (inline) blocks.push(`<p>${inline}</p>`);
  }

  return sanitizeFeatureHtml(blocks.join(''));
}

function renderNextDndInlineChildren($: ReturnType<typeof load>, nodes: AnyNode[], sourceUrl: string): string {
  return normalizeInlineHtml(nodes.map((node) => renderNextDndInlineNode($, node, sourceUrl)).join(''));
}

function renderNextDndInlineNode($: ReturnType<typeof load>, node: AnyNode, sourceUrl: string): string {
  if (node.type === 'text') {
    return escapeHtml('data' in node ? String(node.data).replace(/\s+/g, ' ') : '');
  }

  if (node.type !== 'tag') return '';

  const element = $(node);
  const tagName = String(node.name ?? '').toLocaleLowerCase('en');
  if (['script', 'style', 'svg', 'sup'].includes(tagName)) return '';
  if (tagName === 'br') return '<br>';

  const content = renderNextDndInlineChildren($, element.contents().toArray(), sourceUrl);
  if (!content) return '';

  if (tagName === 'strong' || tagName === 'b') return `<strong>${content}</strong>`;
  if (tagName === 'em' || tagName === 'i') return `<em>${content}</em>`;
  if (tagName === 'a') {
    const href = element.attr('href') ?? '';
    const dataName = normalizeText(element.attr('data-name') ?? element.attr('title') ?? element.text());
    try {
      const url = new URL(href, sourceUrl);
      url.hash = '';
      if (url.hostname === 'next.dnd.su' && url.pathname.startsWith('/spells/')) {
        url.search = '';
        return `<a href="${escapeAttribute(url.toString())}" data-name="${escapeAttribute(dataName)}">${content}</a>`;
      }
      return `<a href="${escapeAttribute(url.toString())}" data-name="${escapeAttribute(dataName)}">${content}</a>`;
    } catch {
      return content;
    }
  }

  return content;
}

function normalizeInlineHtml(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .trim();
}

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

export function parseNextDndMonster(html: string, sourceUrl: string): ParsedCreatureTemplate {
  const $ = load(html);
  const card = $('.card__category-bestiary').first();

  if (!card.length) {
    throw new Error('Не найдена карточка NPC на странице next.dnd.su.');
  }

  const titleText = normalizeText(card.find('.card-title [data-copy]').first().attr('data-copy') ?? card.find('.card-title').first().text()) || extractTitle($('title').text());
  const { name, originalName } = parseBracketedTitle(titleText);
  const tagText = cleanElementText(card.find('.size-type-alignment').first());
  const { size, creatureType, alignment } = parseTags(tagText);
  const params = readNextDndParams($, card);
  const initiativeText = cleanElementText(card.find('.subsection-initiative').first()) || params.get('Инициатива') || '';
  const { mod: initiativeMod, score: initiativeScore } = parseInitiative(initiativeText);
  const hitPoints = parseFirstNumber(card.find('li').filter((_, node) => cleanElementText($(node).find('strong').first()) === 'Хиты').first().find('[data-type="middle"]').first().text(), 0);
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
    conditionImmunities: immunities.conditions || params.get('Иммунитеты к состояниям') || '',
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

export function parseTtgClubMonster(html: string, sourceUrl: string): ParsedCreatureTemplate {
  const data = extractTtgBestiaryData(html);
  const name = localizedName(data.name);
  const originalName = normalizeText(data.name?.eng ?? '');
  const { size, creatureType, alignment } = parseTags(normalizeText(data.header ?? ''));
  const { damage, conditions } = splitTtgImmunity(normalizeText(data.immunity ?? ''));
  const challenge = parseTtgChallenge(normalizeText(data.cr ?? ''));
  const features = parseTtgFeatures(data);
  const lair = parseTtgLair(data.lair);

  return {
    name,
    originalName,
    size,
    creatureType,
    alignment,
    armorClass: parseFirstNumber(String(data.ac ?? ''), 10),
    initiativeMod: parseSignedNumber(String(data.initiative?.value ?? '')),
    initiativeScore: parseFirstNumber(String(data.initiative?.label ?? ''), 10),
    hitPoints: Number(data.hit?.hit ?? 1),
    hitDice: normalizeDiceExpression(String(data.hit?.formula ?? '')),
    speeds: normalizeText(data.speed ?? ''),
    abilities: parseTtgAbilities(data.abilities),
    savingThrows: parseTtgSavingThrows(data.abilities),
    skills: parseTtgSkills(data.skills),
    vulnerabilities: normalizeText(data.vulnerability ?? ''),
    resistances: normalizeText(data.resistance ?? ''),
    immunities: damage,
    conditionImmunities: conditions,
    senses: normalizeText(data.sense ?? ''),
    languages: normalizeText(data.languages ?? ''),
    challengeRating: challenge.challengeRating,
    xp: challenge.xp,
    proficiencyBonus: challenge.proficiencyBonus,
    traits: features.traits,
    actions: features.actions,
    imageUrl: '',
    tokenUrl: '',
    lairName: lair.name,
    lairDescription: lair.description,
    lairHtml: lair.html,
    lairEffects: lair.effects,
    sourceUrl,
    notes: ''
  };
}

export function parseTtgClubSpell(html: string, sourceUrl: string): SpellCard {
  const data = extractTtgSpellData(html);
  const descriptionParts = normalizeTtgTextParts(data.description);
  const upperParts = normalizeTtgTextParts(data.upper);
  const descriptionHtml = [
    ...descriptionParts.map((part) => `<p>${renderTtgInline(part)}</p>`),
    ...upperParts.map((part) => `<p><strong>Накладывание более высокой ячейкой.</strong> ${renderTtgInline(part)}</p>`)
  ].join('');
  const description = stripTtgMarkup([...descriptionParts, ...upperParts].join(' '));

  if (!localizedName(data.name) || !description) {
    throw new Error('Не удалось распознать страницу заклинания TTG Club.');
  }

  return {
    url: sourceUrl,
    name: localizedName(data.name),
    originalName: normalizeText(String(data.name?.eng ?? '')),
    source: formatTtgSpellSource(data.source),
    level: formatTtgSpellLevel(data.level),
    school: normalizeText(String(data.school ?? '')),
    castingTime: normalizeText(String(data.castingTime ?? '')),
    range: normalizeText(String(data.range ?? '')),
    duration: normalizeText(String(data.duration ?? '')),
    target: normalizeText(String(data.target ?? '')),
    area: normalizeText(String(data.area ?? '')),
    save: normalizeText(String(data.save ?? data.savingThrow ?? '')),
    damage: normalizeText(String(data.damage ?? '')),
    components: formatTtgSpellComponents(data.components),
    description,
    descriptionHtml: sanitizeFeatureHtml(descriptionHtml)
  };
}

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

export function parseNextDndSpell(html: string, sourceUrl: string): SpellCard {
  const $ = load(html);
  const card = $('.card__category-spells').first();

  if (!card.length) {
    throw new Error('Не найдена карточка заклинания на странице next.dnd.su.');
  }

  const titleText = normalizeText(card.find('.card-title [data-copy]').first().attr('data-copy') ?? card.find('.card-title').first().text()) || extractTitle($('title').text());
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

function parseNextDndAbilities($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>): { abilities: AbilityBlock; savingThrows: SavingThrowBlock } {
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

function parseNextDndFeatures($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>, sourceUrl: string): { traits: CreatureFeature[]; actions: CreatureFeature[] } {
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
        content.find('.article-body__feature-name, .article-body__monster-attack__name, .article-body__monster-save-effect__name, [data-monster-block]').first().remove();
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

function extractNextDndLairBlock($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>): { name: string; description: string; html: string; effects: CreatureFeature[] } {
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
  const [damage = '', conditions = ''] = value
    .split(';')
    .map((part) => normalizeText(part.replace(/\?/g, '')));
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

function extractTtgBestiaryData(html: string): Record<string, any> {
  return extractTtgNuxtData(html, 'bestiary-', 'Не удалось распознать статблок TTG Club.');
}

function extractTtgSpellData(html: string): Record<string, any> {
  return extractTtgNuxtData(html, 'spell-', 'Не удалось распознать страницу заклинания TTG Club.');
}

function extractTtgNuxtData(html: string, keyPrefix: string, errorMessage: string): Record<string, any> {
  const $ = load(html);
  const payloadText = $('#__NUXT_DATA__').first().text();
  if (!payloadText) {
    throw new Error('Не найдены данные Nuxt на странице TTG Club.');
  }

  const payload = JSON.parse(payloadText) as unknown[];
  const root = resolveNuxtPayload(payload) as Record<string, any>;
  const data = root?.data && typeof root.data === 'object' ? (root.data as Record<string, any>) : {};
  const entry = Object.entries(data).find(([key, value]) => key.startsWith(keyPrefix) && value && typeof value === 'object' && !key.startsWith('rating-'))?.[1];

  if (!entry || typeof entry !== 'object') {
    throw new Error(errorMessage);
  }

  return entry as Record<string, any>;
}

function resolveNuxtPayload(payload: unknown[]): unknown {
  const cache = new Map<number, unknown>();

  function resolveIndex(index: number): unknown {
    if (!Number.isInteger(index) || index < 0 || index >= payload.length) return undefined;
    if (cache.has(index)) return cache.get(index);

    const value = payload[index];
    if (value && typeof value === 'object') {
      const placeholder: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
      cache.set(index, placeholder);
    }

    const resolved = resolveValue(value);
    cache.set(index, resolved);
    return resolved;
  }

  function resolveValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      const [tag, ref] = value;
      if ((tag === 'Reactive' || tag === 'ShallowReactive') && typeof ref === 'number') {
        return resolveIndex(ref);
      }
      if (tag === 'Set') return [];
      if (tag === 'Map') return {};
      return value.map((item) => (typeof item === 'number' ? resolveIndex(item) : resolveValue(item)));
    }

    if (value && typeof value === 'object') {
      const object: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        object[key] = typeof item === 'number' ? resolveIndex(item) : resolveValue(item);
      }
      return object;
    }

    return value;
  }

  return resolveIndex(0);
}

function parseTtgAbilities(value: unknown): AbilityBlock {
  const abilities: AbilityBlock = { ...DEFAULT_ABILITIES };
  const source = value && typeof value === 'object' ? (value as Record<string, any>) : {};
  abilities.str = Number(source.str?.value ?? abilities.str);
  abilities.dex = Number(source.dex?.value ?? abilities.dex);
  abilities.con = Number(source.con?.value ?? abilities.con);
  abilities.int = Number(source.int?.value ?? abilities.int);
  abilities.wis = Number(source.wis?.value ?? abilities.wis);
  abilities.cha = Number(source.cha?.value ?? source.chr?.value ?? abilities.cha);
  return abilities;
}

function parseTtgSavingThrows(value: unknown): SavingThrowBlock {
  const source = value && typeof value === 'object' ? (value as Record<string, any>) : {};
  return {
    str: parseSignedNumber(String(source.str?.sav ?? '')),
    dex: parseSignedNumber(String(source.dex?.sav ?? '')),
    con: parseSignedNumber(String(source.con?.sav ?? '')),
    int: parseSignedNumber(String(source.int?.sav ?? '')),
    wis: parseSignedNumber(String(source.wis?.sav ?? '')),
    cha: parseSignedNumber(String(source.cha?.sav ?? source.chr?.sav ?? ''))
  };
}

function parseTtgSkills(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((skill) => {
      const item = skill && typeof skill === 'object' ? (skill as Record<string, unknown>) : {};
      const label = normalizeText(String(item.label ?? ''));
      const bonus = normalizeText(String(item.value ?? ''));
      return label && bonus ? `${label} ${bonus}` : label;
    })
    .filter(Boolean)
    .join(', ');
}

function parseTtgFeatures(data: Record<string, any>): { traits: CreatureFeature[]; actions: CreatureFeature[] } {
  const traits = ttgFeatureList(data.traits, 'Особенности');
  const actions = [
    ...ttgFeatureList(data.actions, 'Действия'),
    ...ttgFeatureList(data.bonusActions, 'Бонусные действия'),
    ...ttgFeatureList(data.reactions, 'Реакции'),
    ...ttgFeatureList(data.legendary?.actions, 'Легендарные действия')
  ];
  return { traits, actions };
}

function ttgFeatureList(value: unknown, section: string): CreatureFeature[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((feature, index) => ttgFeature(feature, section, index))
    .filter((feature): feature is CreatureFeature => Boolean(feature?.name || feature?.description));
}

function ttgFeature(value: unknown, section: string, index: number): CreatureFeature | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const name = localizedName(item.name) || `${section} ${index + 1}`;
  const parts = normalizeTtgTextParts(item.description);
  const description = stripTtgMarkup(parts.join(' '));
  if (!name && !description) return null;

  return {
    id: slugify(`${section}-${index}-${name}`) || `${section}-${index}`,
    name,
    section,
    description,
    html: renderTtgHtml(parts)
  };
}

function ttgTextFeature(value: string, name: string, section: string, idSuffix: string): CreatureFeature {
  return {
    id: slugify(`${section}-${idSuffix}-${name}`) || `${section}-${idSuffix}`,
    name,
    section,
    description: stripTtgMarkup(value),
    html: `<p>${renderTtgInline(value)}</p>`
  };
}

function parseTtgLair(value: unknown): { name: string; description: string; html: string; effects: CreatureFeature[] } {
  if (!value || typeof value !== 'object') return { name: '', description: '', html: '', effects: [] };
  const lair = value as Record<string, unknown>;
  const name = localizedName(lair.name);
  const descriptionParts = normalizeTtgTextParts(lair.description);
  const endingParts = normalizeTtgTextParts(lair.ending);
  const effectValues = Array.isArray(lair.effects) ? lair.effects : [];
  const descriptionFeatures = descriptionParts.map((part, index) => ttgTextFeature(part, index === 0 ? 'Описание логова' : 'Свойства логова', 'Логово', `description-${index}`));
  const effects = effectValues
    .map((effect, index) => ttgFeature(effect, 'Логово', index))
    .filter((feature): feature is CreatureFeature => Boolean(feature?.name || feature?.description));
  const endingFeatures = endingParts.map((part, index) => ttgTextFeature(part, 'Окончание эффектов', 'Логово', `ending-${index}`));
  const effectHtml = effects.map((effect) => `<p><strong>${escapeHtml(effect.name)}</strong>. ${effect.html}</p>`);
  const html = [...descriptionParts.map((part) => `<p>${renderTtgInline(part)}</p>`), ...effectHtml, ...endingParts.map((part) => `<p>${renderTtgInline(part)}</p>`)].join('');
  const allEffects = [...descriptionFeatures, ...effects, ...endingFeatures].filter((feature): feature is CreatureFeature => Boolean(feature.description || feature.html));

  return {
    name,
    description: stripTtgMarkup([...descriptionParts, ...effects.map((effect) => `${effect.name}. ${effect.description}`), ...endingParts].join(' ')),
    html,
    effects: allEffects
  };
}

function parseTtgChallenge(value: string): { challengeRating: string; xp: number; proficiencyBonus: number } {
  const challengeRating = normalizeText(value.split('(')[0] ?? '');
  const xpMatch = value.replace(/\s+/g, '').match(/Опыт([\d,.]+)/i);
  const proficiencyMatch = value.match(/Б[МВУ]\s*([-+]?\d+)/i);
  return {
    challengeRating,
    xp: xpMatch ? Number(xpMatch[1].replace(/[,.]/g, '')) : 0,
    proficiencyBonus: proficiencyMatch ? Number(proficiencyMatch[1]) : 0
  };
}

function splitTtgImmunity(value: string): { damage: string; conditions: string } {
  const [damage = '', conditions = ''] = value.split(';').map((part) => titleCaseRu(normalizeText(part)));
  return { damage, conditions };
}

function normalizeTtgTextParts(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((part) => normalizeText(String(part ?? ''))).filter(Boolean);
  const text = normalizeText(String(value ?? ''));
  return text ? [text] : [];
}

function localizedName(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return normalizeText(value);
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return normalizeText(String(object.rus ?? object.label ?? object.name ?? object.eng ?? ''));
  }
  return '';
}

function normalizeDiceExpression(value: string): string {
  return normalizeText(value).replace(/[кК]/g, 'd');
}

function renderTtgHtml(parts: string[]): string {
  return parts.map((part) => `<p>${renderTtgInline(part)}</p>`).join('');
}

function stripTtgMarkup(value: string): string {
  return normalizeText(
    value.replace(/\{@(?:i|b|roll|spell|glossary)\s+([^{}]+)\}/g, (_, content: string) => {
      return normalizeText(String(content).split('|')[0] ?? '');
    })
  );
}

function renderTtgInline(value: string): string {
  return escapeHtml(value).replace(/\{@(i|b|roll|spell|glossary)\s+([^{}]+)\}/g, (_, tag: string, rawContent: string) => {
    const content = String(rawContent);
    const [label = '', ...metaParts] = content.split('|');
    const meta = metaParts.join('|');
    const cleanLabel = escapeHtml(normalizeText(label));
    const url = meta.match(/url:([^|]+)/)?.[1];

    if (tag === 'i') return `<em>${cleanLabel}</em>`;
    if (tag === 'b') return `<strong>${cleanLabel}</strong>`;
    if (tag === 'roll') return `<span class="dice-roll">${cleanLabel}</span>`;
    if (tag === 'spell' && url) return `<a href="https://new.ttg.club/spells/${escapeAttribute(url)}" data-name="${escapeAttribute(normalizeText(label))}">${cleanLabel}</a>`;
    if (tag === 'glossary' && url) return `<a href="https://new.ttg.club/glossary/${escapeAttribute(url)}" data-name="${escapeAttribute(normalizeText(label))}">${cleanLabel}</a>`;
    return cleanLabel;
  });
}

function formatTtgSpellLevel(value: unknown): string {
  const level = Number(value);
  if (!Number.isFinite(level)) return normalizeText(String(value ?? ''));
  return level === 0 ? 'Заговор' : `${level}-й уровень`;
}

function formatTtgSpellComponents(value: unknown): string {
  if (!value || typeof value !== 'object') return normalizeText(String(value ?? ''));
  const components = value as Record<string, unknown>;
  const result: string[] = [];
  if (components.v) result.push('Вербальный');
  if (components.s) result.push('Соматический');
  if (components.m) {
    const material = normalizeText(String(components.m));
    result.push(material && material !== 'true' ? `Материальный (${material})` : 'Материальный');
  }
  return result.join(', ');
}

function formatTtgSpellSource(value: unknown): string {
  if (!value || typeof value !== 'object') return normalizeText(String(value ?? ''));
  const source = value as Record<string, unknown>;
  const name = source.name && typeof source.name === 'object' ? (source.name as Record<string, unknown>) : {};
  const label = normalizeText(String(name.label ?? name.rus ?? ''));
  const group = source.group && typeof source.group === 'object' ? (source.group as Record<string, unknown>) : {};
  const groupLabel = normalizeText(String(group.label ?? group.rus ?? ''));
  return [label, groupLabel].filter(Boolean).join(' ');
}

function titleCaseRu(value: string): string {
  return value ? `${value[0].toLocaleUpperCase('ru')}${value.slice(1)}` : '';
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

function readNextDndSpellMetadata($: ReturnType<typeof load>, root: ReturnType<ReturnType<typeof load>>): Map<string, string> {
  const pairs = new Map<string, string>();
  const schoolLevel = root.find('.params-spells .school_level').first();
  if (schoolLevel.length) {
    const parts = normalizeText(schoolLevel.text()).split(',').map((part) => normalizeText(part)).filter(Boolean);
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
  const inline = renderNextDndInlineChildren($, root.contents().toArray(), sourceUrl).replace(/^\s*[.:]\s*/, '').trim();
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

    const inline = renderNextDndInlineChildren($, element.contents().toArray(), sourceUrl).replace(/^\s*[.:]\s*/, '').trim();
    if (inline) blocks.push(`<p>${inline}</p>`);
  });

  if (!blocks.length) {
    const inline = renderNextDndInlineChildren($, root.contents().toArray(), sourceUrl).replace(/^\s*[.:]\s*/, '').trim();
    if (inline) blocks.push(`<p>${inline}</p>`);
  }

  return sanitizeFeatureHtml(blocks.join(''));
}

function renderNextDndInlineChildren($: ReturnType<typeof load>, nodes: AnyNode[], sourceUrl: string): string {
  return normalizeInlineHtml(
    nodes
      .map((node) => renderNextDndInlineNode($, node, sourceUrl))
      .join('')
  );
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

function sanitizeFeatureHtml(rawHtml: string): string {
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

function cleanElementText(element: ReturnType<ReturnType<typeof load>>): string {
  const clone = element.clone();
  clone.find('sup,script,style,svg,.svg').remove();
  return normalizeText(clone.text().replace(/\?/g, ''));
}

function parseTags(tags: string): { size: string; creatureType: string; alignment: string } {
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

function parseInitiative(value: string): { mod: number; score: number } {
  const mod = parseSignedNumber(value);
  const scoreMatch = value.match(/\(([-+]?\d+)\)/);
  return {
    mod,
    score: scoreMatch ? Number(scoreMatch[1]) : 10 + mod
  };
}

function parseHitPoints(value: string): { hp: number; hitDice: string } {
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

function parseFirstNumber(value: string, fallback: number): number {
  const match = value.match(/[-+]?\d+/);
  return match ? Number(match[0]) : fallback;
}

function parseSignedNumber(value: string): number {
  const match = value.match(/[-+]\d+|\b\d+\b/);
  return match ? Number(match[0]) : 0;
}

function normalizeText(value: string): string {
  return value.replace(/&thinsp;/g, ' ').replace(/\u00a0|\u202f/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase('ru')
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function extractTitle(title: string): string {
  return normalizeText(title.split('|')[0]?.split('/')[0] ?? '');
}

function extractOriginalName(title: string): string {
  const match = title.match(/\/\s*([^|]+)/);
  return match ? normalizeText(match[1]) : '';
}

function parseBracketedTitle(value: string): { name: string; originalName: string } {
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
  const clean = value.replace(/\\/g, '').replace(/&amp;.*/, '').replace(/[),]+$/, '');
  if (clean.startsWith('https://media.ruleholder.com/images/')) {
    urls.add(clean);
  }
}

import { load } from 'cheerio';
import { z } from 'zod';
import type { AbilityBlock, CreatureFeature, SavingThrowBlock, SpellCard } from '@shared/types';
import {
  escapeAttribute,
  escapeHtml,
  normalizeText,
  parseFirstNumber,
  parseSignedNumber,
  parseTags,
  sanitizeFeatureHtml,
  slugify,
  type ParsedCreatureTemplate
} from '../../services/ruleholderParser';

const DEFAULT_ABILITIES: AbilityBlock = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
type TtgRecord = Record<string, unknown>;
type TtgLocalizedName = { rus?: unknown; eng?: unknown };
type TtgBestiaryData = TtgRecord & {
  name?: TtgLocalizedName;
  initiative?: TtgRecord;
  hit?: TtgRecord;
  legendary?: TtgRecord;
};
type TtgSpellData = TtgRecord & { name?: TtgLocalizedName };
const nuxtPayloadSchema = z.array(z.unknown());

/**
 * Разбирает сериализованный Nuxt payload TTG Club.
 * Данные сначала проверяются как unknown через Zod, поскольку структура внешнего сайта не является доверенным контрактом.
 */
export function parseTtgClubMonster(html: string, sourceUrl: string): ParsedCreatureTemplate {
  const data = extractTtgBestiaryData(html);
  const name = localizedName(data.name);
  const originalName = normalizeText(String(data.name?.eng ?? ''));
  const { size, creatureType, alignment } = parseTags(normalizeText(String(data.header ?? '')));
  const { damage, conditions } = splitTtgImmunity(normalizeText(String(data.immunity ?? '')));
  const challenge = parseTtgChallenge(normalizeText(String(data.cr ?? '')));
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
    speeds: normalizeText(String(data.speed ?? '')),
    abilities: parseTtgAbilities(data.abilities),
    savingThrows: parseTtgSavingThrows(data.abilities),
    skills: parseTtgSkills(data.skills),
    vulnerabilities: normalizeText(String(data.vulnerability ?? '')),
    resistances: normalizeText(String(data.resistance ?? '')),
    immunities: damage,
    conditionImmunities: conditions,
    senses: normalizeText(String(data.sense ?? '')),
    languages: normalizeText(String(data.languages ?? '')),
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

/** Преобразует данные заклинания TTG Club в общую карточку подсказки. */
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

function extractTtgBestiaryData(html: string): TtgBestiaryData {
  return extractTtgNuxtData(html, 'bestiary-', 'Не удалось распознать статблок TTG Club.') as TtgBestiaryData;
}

function extractTtgSpellData(html: string): TtgSpellData {
  return extractTtgNuxtData(html, 'spell-', 'Не удалось распознать страницу заклинания TTG Club.') as TtgSpellData;
}

function extractTtgNuxtData(html: string, keyPrefix: string, errorMessage: string): TtgRecord {
  const $ = load(html);
  const payloadText = $('#__NUXT_DATA__').first().text();
  if (!payloadText) {
    throw new Error('Не найдены данные Nuxt на странице TTG Club.');
  }

  const parsedPayload = nuxtPayloadSchema.safeParse(JSON.parse(payloadText));
  if (!parsedPayload.success) throw new Error('Данные Nuxt на странице TTG Club имеют неизвестный формат.');
  const root = asTtgRecord(resolveNuxtPayload(parsedPayload.data));
  const data = asTtgRecord(root.data);
  const entry = Object.entries(data).find(([key, value]) => key.startsWith(keyPrefix) && value && typeof value === 'object' && !key.startsWith('rating-'))?.[1];

  if (!entry || typeof entry !== 'object') {
    throw new Error(errorMessage);
  }

  return entry as TtgRecord;
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
  const source = asTtgRecord(value);
  abilities.str = Number(asTtgRecord(source.str).value ?? abilities.str);
  abilities.dex = Number(asTtgRecord(source.dex).value ?? abilities.dex);
  abilities.con = Number(asTtgRecord(source.con).value ?? abilities.con);
  abilities.int = Number(asTtgRecord(source.int).value ?? abilities.int);
  abilities.wis = Number(asTtgRecord(source.wis).value ?? abilities.wis);
  abilities.cha = Number(asTtgRecord(source.cha).value ?? asTtgRecord(source.chr).value ?? abilities.cha);
  return abilities;
}

function parseTtgSavingThrows(value: unknown): SavingThrowBlock {
  const source = asTtgRecord(value);
  return {
    str: parseSignedNumber(String(asTtgRecord(source.str).sav ?? '')),
    dex: parseSignedNumber(String(asTtgRecord(source.dex).sav ?? '')),
    con: parseSignedNumber(String(asTtgRecord(source.con).sav ?? '')),
    int: parseSignedNumber(String(asTtgRecord(source.int).sav ?? '')),
    wis: parseSignedNumber(String(asTtgRecord(source.wis).sav ?? '')),
    cha: parseSignedNumber(String(asTtgRecord(source.cha).sav ?? asTtgRecord(source.chr).sav ?? ''))
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

function parseTtgFeatures(data: TtgBestiaryData): { traits: CreatureFeature[]; actions: CreatureFeature[] } {
  const traits = ttgFeatureList(data.traits, 'Особенности');
  const actions = [
    ...ttgFeatureList(data.actions, 'Действия'),
    ...ttgFeatureList(data.bonusActions, 'Бонусные действия'),
    ...ttgFeatureList(data.reactions, 'Реакции'),
    ...ttgFeatureList(asTtgRecord(data.legendary).actions, 'Легендарные действия')
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
  const descriptionFeatures = descriptionParts.map((part, index) =>
    ttgTextFeature(part, index === 0 ? 'Описание логова' : 'Свойства логова', 'Логово', `description-${index}`)
  );
  const effects = effectValues
    .map((effect, index) => ttgFeature(effect, 'Логово', index))
    .filter((feature): feature is CreatureFeature => Boolean(feature?.name || feature?.description));
  const endingFeatures = endingParts.map((part, index) => ttgTextFeature(part, 'Окончание эффектов', 'Логово', `ending-${index}`));
  const effectHtml = effects.map((effect) => `<p><strong>${escapeHtml(effect.name)}</strong>. ${effect.html}</p>`);
  const html = [
    ...descriptionParts.map((part) => `<p>${renderTtgInline(part)}</p>`),
    ...effectHtml,
    ...endingParts.map((part) => `<p>${renderTtgInline(part)}</p>`)
  ].join('');
  const allEffects = [...descriptionFeatures, ...effects, ...endingFeatures].filter((feature): feature is CreatureFeature =>
    Boolean(feature.description || feature.html)
  );

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
    if (tag === 'spell' && url)
      return `<a href="https://new.ttg.club/spells/${escapeAttribute(url)}" data-name="${escapeAttribute(normalizeText(label))}">${cleanLabel}</a>`;
    if (tag === 'glossary' && url)
      return `<a href="https://new.ttg.club/glossary/${escapeAttribute(url)}" data-name="${escapeAttribute(normalizeText(label))}">${cleanLabel}</a>`;
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

function asTtgRecord(value: unknown): TtgRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as TtgRecord) : {};
}

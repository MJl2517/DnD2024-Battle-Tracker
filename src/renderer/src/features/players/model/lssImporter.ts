import type { PlayerCharacter } from '@shared/types';

type UnknownRecord = Record<string, unknown>;
type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

const LSS_SKILL_LABELS: Record<string, string> = {
  acrobatics: 'Акробатика',
  'animal handling': 'Уход за животными',
  arcana: 'Магия',
  athletics: 'Атлетика',
  deception: 'Обман',
  history: 'История',
  insight: 'Проницательность',
  intimidation: 'Запугивание',
  investigation: 'Анализ',
  medicine: 'Медицина',
  nature: 'Природа',
  perception: 'Внимательность',
  performance: 'Выступление',
  persuasion: 'Убеждение',
  religion: 'Религия',
  'sleight of hand': 'Ловкость рук',
  stealth: 'Скрытность',
  survival: 'Выживание'
};

/**
 * Проверяет неизвестный JSON от Long Story Short и переводит только поддерживаемые поля в модель игрока.
 * Лишние данные листа намеренно игнорируются, чтобы импорт не расширял схему приложения случайными полями.
 */
export function importPlayerFromLss(payload: unknown, campaignId: string): PlayerCharacter {
  const raw = getLssRaw(payload);
  const info = recordValue(raw.info);
  const vitality = recordValue(raw.vitality);
  const stats = normalizeLssStats(recordValue(raw.stats));
  const level = Math.max(1, numberValue(fieldValue(info, 'level', 1), 1));
  const proficiency = numberValue(fieldValue(raw, 'proficiency', 0), proficiencyBonus(level));
  const skills = prepareLssSkills(recordValue(raw.skills), stats, proficiency);
  const textSections = prepareLssTextSections(recordValue(raw.text));
  const timestamp = new Date().toISOString();
  const name = stringValue(pathValue(raw, ['name', 'value'], fieldValue(raw, 'name', 'Без имени')), 'Без имени').trim() || 'Без имени';
  const baseMaxHp = numberValue(fieldValue(vitality, 'hp-max', 0), 0);
  const maxHpBonus = numberValue(fieldValue(vitality, 'hp-max-bonus', 0), 0);
  const maxHp = baseMaxHp ? baseMaxHp + maxHpBonus : numberValue(fieldValue(vitality, 'hp-current', 0), 0);
  const imageUrl = extractLssImageUrl(raw);

  return {
    id: '',
    campaignId,
    name,
    level,
    armorClass: numberValue(fieldValue(vitality, 'ac', 10), 10),
    maxHp: Math.max(1, maxHp || 1),
    initiativeMod: numberValue(fieldValue(vitality, 'initiative', stats.dex.modifier), stats.dex.modifier),
    passivePerception: skills.perception?.passive ?? 10 + stats.wis.modifier,
    active: true,
    alertInitiativeSwap: false,
    imageUrl,
    notes: buildLssNotes(textSections),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function getLssRaw(payload: unknown): UnknownRecord {
  let raw: unknown = isRecord(payload) && 'data' in payload ? payload.data : payload;

  if (typeof raw === 'string') {
    raw = JSON.parse(raw);
  }

  if (!isRecord(raw)) {
    throw new Error('Long Story Short JSON не содержит данных персонажа.');
  }

  return raw;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordValue(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function fieldValue(container: unknown, key: string, fallback: unknown = ''): unknown {
  const record = recordValue(container);
  const value = record[key];

  if (isRecord(value) && 'value' in value) {
    return value.value ?? fallback;
  }

  return value ?? fallback;
}

function pathValue(obj: unknown, path: string[], fallback: unknown = ''): unknown {
  let current: unknown = obj;

  for (const key of path) {
    if (!isRecord(current)) return fallback;
    current = current[key];
  }

  return current ?? fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function abilityModifier(score: unknown): number {
  return Math.floor((numberValue(score, 10) - 10) / 2);
}

function normalizeLssStats(stats: UnknownRecord): Record<AbilityKey, { score: number; modifier: number }> {
  const result = {} as Record<AbilityKey, { score: number; modifier: number }>;
  const keys: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  for (const key of keys) {
    const stat = recordValue(stats[key]);
    const score = numberValue(stat.score, 10);
    result[key] = { score, modifier: abilityModifier(score) };
  }

  return result;
}

function proficiencyBonus(level: number): number {
  return Math.ceil((Number(level) || 1) / 4) + 1;
}

function lssProficiencyMultiplier(item: UnknownRecord): number {
  for (const key of ['isProf', 'proficient', 'prof']) {
    if (!(key in item)) continue;
    const value = item[key];
    if (typeof value === 'boolean') return value ? 1 : 0;
    return Number(value) || 0;
  }

  return 0;
}

function prepareLssSkills(
  rawSkills: UnknownRecord,
  stats: Record<AbilityKey, { score: number; modifier: number }>,
  proficiency: number
): Record<string, { label: string; value: number; passive: number; isProficient: boolean }> {
  const result: Record<string, { label: string; value: number; passive: number; isProficient: boolean }> = {};

  for (const [key, rawSkill] of Object.entries(rawSkills)) {
    const skill = recordValue(rawSkill);
    const baseStat = stringValue(skill.baseStat) as AbilityKey;
    const statMod = stats[baseStat]?.modifier ?? 0;
    const profMultiplier = lssProficiencyMultiplier(skill);
    const value = statMod + Math.floor(proficiency * profMultiplier);
    result[key] = {
      label: LSS_SKILL_LABELS[key] ?? key,
      value,
      passive: value + 10,
      isProficient: profMultiplier > 0
    };
  }

  return result;
}

function tiptapToText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(tiptapToText).filter(Boolean).join('\n');
  if (!isRecord(node)) return '';
  if (node.type === 'text') return stringValue(node.text);

  const content = Array.isArray(node.content) ? node.content.map(tiptapToText).filter(Boolean) : [];
  if (node.type === 'paragraph' || node.type === 'heading') {
    return content.join('').trim();
  }

  return content.join('\n').trim();
}

function readLssTextSection(section: unknown): string {
  const record = recordValue(section);
  const valueRecord = recordValue(record.value);
  return tiptapToText(valueRecord.data ?? record.data ?? record.value ?? '').trim();
}

function prepareLssTextSections(text: UnknownRecord): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, section] of Object.entries(text)) {
    const body = readLssTextSection(section);
    if (body) result[key] = body;
  }

  return result;
}

function buildLssNotes(textSections: Record<string, string>): string {
  const namedNotes = Object.entries(textSections)
    .filter(([key]) => /^notes-\d+$/i.test(key) && key !== 'notes-1')
    .sort(([left], [right]) => left.localeCompare(right, 'ru', { numeric: true }))
    .map(([key, value]) => `Заметки ${key.replace('notes-', '')}:\n${value}`);

  return [
    textSections.background && `Предыстория:\n${textSections.background}`,
    textSections.personality && `Черты характера:\n${textSections.personality}`,
    textSections.trait && `Черты характера:\n${textSections.trait}`,
    textSections.ideals && `Идеалы:\n${textSections.ideals}`,
    textSections.ideal && `Идеалы:\n${textSections.ideal}`,
    textSections.bonds && `Привязанности:\n${textSections.bonds}`,
    textSections.bond && `Привязанности:\n${textSections.bond}`,
    textSections.flaws && `Слабости:\n${textSections.flaws}`,
    textSections.flaw && `Слабости:\n${textSections.flaw}`,
    textSections['notes-1'] && `Заметки:\n${textSections['notes-1']}`,
    ...namedNotes
  ]
    .filter(Boolean)
    .join('\n\n');
}

function extractLssImageUrl(raw: UnknownRecord): string {
  const directPaths = [
    ['image'],
    ['avatar'],
    ['portrait'],
    ['photo'],
    ['picture'],
    ['art'],
    ['token'],
    ['info', 'image'],
    ['info', 'avatar'],
    ['info', 'portrait'],
    ['info', 'photo'],
    ['info', 'picture'],
    ['info', 'art'],
    ['profile', 'image'],
    ['profile', 'avatar'],
    ['profile', 'portrait'],
    ['appearance', 'image'],
    ['appearance', 'avatar'],
    ['appearance', 'portrait']
  ];

  for (const path of directPaths) {
    const url = imageUrlFromUnknown(pathValue(raw, path));
    if (url) return url;
  }

  return findImageUrlByKey(raw);
}

function imageUrlFromUnknown(value: unknown): string {
  if (typeof value === 'string') return isUsableImageUrl(value) ? value.trim() : '';
  if (!isRecord(value)) return '';

  for (const key of ['webp', 'jpeg', 'jpg', 'png', 'url', 'src', 'href', 'path', 'value', 'data']) {
    const url = imageUrlFromUnknown(value[key]);
    if (url) return url;
  }

  return '';
}

function findImageUrlByKey(record: UnknownRecord, depth = 0): string {
  if (depth > 4) return '';

  for (const [key, value] of Object.entries(record)) {
    if (isImageLikeKey(key)) {
      const directUrl = imageUrlFromUnknown(value);
      if (directUrl) return directUrl;
    }

    if (isRecord(value)) {
      const nestedUrl = findImageUrlByKey(value, depth + 1);
      if (nestedUrl) return nestedUrl;
    }
  }

  return '';
}

function isImageLikeKey(key: string): boolean {
  return /avatar|portrait|image|token|photo|picture|art|illustration/i.test(key);
}

function isUsableImageUrl(value: string): boolean {
  const clean = value.trim();
  return /^https?:\/\//i.test(clean) || /^data:image\//i.test(clean);
}

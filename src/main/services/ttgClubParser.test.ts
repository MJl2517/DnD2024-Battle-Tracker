import { describe, expect, it } from 'vitest';
import { parseTtgClubMonster, parseTtgClubSpell } from '../importers/ttgClub/parser';

describe('parseTtgClubMonster', () => {
  it('extracts TTG Club Nuxt bestiary data and lair effects', () => {
    const creature = parseTtgClubMonster(fixtureFromCreature(ttgCreature), 'https://new.ttg.club/bestiary/adult-green-dragon-mm');

    expect(creature.name).toBe('Взрослый зелёный дракон');
    expect(creature.originalName).toBe('Adult Green Dragon');
    expect(creature.size).toBe('Огромный');
    expect(creature.creatureType).toBe('дракон (цветной)');
    expect(creature.alignment).toBe('законопослушный злой');
    expect(creature.armorClass).toBe(19);
    expect(creature.initiativeMod).toBe(11);
    expect(creature.initiativeScore).toBe(21);
    expect(creature.hitPoints).toBe(207);
    expect(creature.hitDice).toBe('18d12 + 90');
    expect(creature.speeds).toBe('40 фт., летая 80 фт. , плавая 40 фт.');
    expect(creature.abilities.str).toBe(23);
    expect(creature.savingThrows.wis).toBe(7);
    expect(creature.skills).toContain('Внимательность +12');
    expect(creature.immunities).toBe('Ядовитый');
    expect(creature.conditionImmunities).toBe('Отравленный');
    expect(creature.challengeRating).toBe('15');
    expect(creature.xp).toBe(13000);
    expect(creature.proficiencyBonus).toBe(5);
    expect(creature.traits[0].name).toBe('Амфибия');
    expect(creature.actions.some((action) => action.name === 'Ядовитое дыхание (перезарядка 5-6)')).toBe(true);
    expect(creature.actions.find((action) => action.name === 'Использование заклинаний')?.html).toContain('https://new.ttg.club/spells/mind-spike-phb');
    expect(creature.lairName).toBe('Логова зелёных драконов');
    expect(creature.lairEffects).toHaveLength(5);
    expect(creature.lairEffects[0].name).toBe('Описание логова');
    expect(creature.lairEffects[1].name).toBe('Свойства логова');
    expect(creature.lairEffects[2].name).toBe('Звери шпионы');
    expect(creature.lairEffects[3].name).toBe('Ядовитые заросли');
    expect(creature.lairEffects[4].name).toBe('Окончание эффектов');
  });
  it('extracts TTG Club spell cards', () => {
    const spell = parseTtgClubSpell(fixtureFromTtgData('spell-mind-spike-phb', ttgSpell), 'https://new.ttg.club/spells/mind-spike-phb');

    expect(spell.name).toBe('Пронзание разума');
    expect(spell.originalName).toBe('Mind Spike');
    expect(spell.source).toBe('PHB Basic');
    expect(spell.level).toBe('2-й уровень');
    expect(spell.school).toBe('Прорицание');
    expect(spell.castingTime).toBe('Действие');
    expect(spell.range).toBe('120 футов');
    expect(spell.duration).toBe('Концентрация, до 1 часа');
    expect(spell.components).toBe('Соматический');
    expect(spell.description).toContain('псионической энергии');
    expect(spell.descriptionHtml).toContain('3к8');
    expect(spell.descriptionHtml).toContain('Накладывание более высокой ячейкой');
  });
});

function fixtureFromCreature(creature: Record<string, unknown>): string {
  return fixtureFromTtgData('bestiary-adult-green-dragon-mm', creature);
}

function fixtureFromTtgData(key: string, value: Record<string, unknown>): string {
  const payload: unknown[] = [null];

  function ref(value: unknown): number {
    const index = payload.length;
    payload.push(null);

    if (Array.isArray(value)) {
      payload[index] = value.map(ref);
    } else if (value && typeof value === 'object') {
      payload[index] = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ref(item)]));
    } else {
      payload[index] = value;
    }

    return index;
  }

  const rootIndex = ref({
    data: {
      [key]: value
    }
  });
  payload[0] = ['ShallowReactive', rootIndex];

  return `<!doctype html><html><body><script type="application/json" id="__NUXT_DATA__">${JSON.stringify(payload)}</script></body></html>`;
}

const ttgCreature = {
  url: 'adult-green-dragon-mm',
  header: 'Огромный дракон (цветной), законопослушный злой',
  initiative: { label: '21', value: '+11' },
  hit: { hit: 207, formula: '18к12 + 90', text: null },
  speed: ' 40 фт., летая 80 фт. , плавая 40 фт.',
  abilities: {
    str: { value: 23, mod: '+6', sav: '+6' },
    dex: { value: 12, mod: '+1', sav: '+6' },
    con: { value: 21, mod: '+5', sav: '+5' },
    int: { value: 18, mod: '+4', sav: '+4' },
    wis: { value: 15, mod: '+2', sav: '+7' },
    chr: { value: 18, mod: '+4', sav: '+4' }
  },
  skills: [
    { label: 'Обман', value: '+9' },
    { label: 'Внимательность', value: '+12' }
  ],
  vulnerability: '',
  resistance: '',
  immunity: 'ядовитый; отравленный',
  sense: 'слепое зрение 60 фт., тёмное зрение 120 фт., пассивная внимательность 22',
  languages: 'общий, драконий',
  traits: [{ name: { rus: 'Амфибия' }, description: ['Дракон может дышать воздухом и водой.'] }],
  actions: [
    { name: { rus: 'Мультиатака' }, description: ['Дракон совершает 3 атаки Разрыванием.'] },
    { name: { rus: 'Ядовитое дыхание (перезарядка 5-6)' }, description: ['{@i Спасбросок Телосложения:} Сл. 18.'] },
    {
      name: { rus: 'Использование заклинаний' },
      description: ['{@b По желанию:} {@spell Пронзание разума [Mind Spike]|url:mind-spike-phb}']
    }
  ],
  reactions: [],
  bonusActions: [],
  legendary: {
    actions: [{ name: { rus: 'Наскок' }, description: ['Дракон перемещается на расстояние до половины своей скорости.'] }],
    count: '3 (4 в логове)'
  },
  lair: {
    name: 'Логова зелёных драконов',
    description: ['Зелёные драконы селятся в древних лесах.', 'Местность с логовом дракона искажается.'],
    effects: [
      { name: { rus: 'Звери шпионы' }, description: ['Крошечные звери понимают драконий язык.'] },
      { name: { rus: 'Ядовитые заросли' }, description: ['Обычные растения отравляют воздух.'] }
    ],
    ending: ['Если дракон умирает, эффекты прекращаются.']
  },
  section: {
    name: { rus: 'Зелёные драконы', eng: 'Green Dragons' }
  },
  name: { rus: 'Взрослый зелёный дракон', eng: 'Adult Green Dragon' },
  source: { name: { label: 'MM', rus: 'Бестиарий', eng: 'Monster Manual' } },
  ac: '19',
  cr: '15 (Опыт 13000 или 15000 в логове; БМ +5)'
};

const ttgSpell = {
  url: 'mind-spike-phb',
  name: { rus: 'Пронзание разума', eng: 'Mind Spike' },
  level: 2,
  school: 'Прорицание',
  castingTime: 'Действие',
  range: '120 футов ',
  duration: 'Концентрация, до 1 часа',
  components: { v: false, s: true, m: null },
  description: ['Вы вонзаете шип псионической энергии в разум 1 существа. Цель получает {@roll 3к8} урона психической энергией.'],
  upper: ['Урон увеличивается на {@roll 1к8} за каждый уровень ячейки выше 2.'],
  source: {
    name: { label: 'PHB', rus: 'Книга игрока', eng: 'Player Handbook' },
    group: { label: 'Basic', rus: 'Официальные источники' }
  }
};

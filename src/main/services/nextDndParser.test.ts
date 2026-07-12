import { describe, expect, it } from 'vitest';
import { parseNextDndMonster, parseNextDndSpell } from '../importers/nextDnd/parser';

describe('parseNextDndMonster', () => {
  it('extracts next.dnd.su statblock fields and lair effects', () => {
    const creature = parseNextDndMonster(fixture, 'https://next.dnd.su/bestiary/21163-adult-green-dragon/');

    expect(creature.name).toBe('Взрослый зелёный дракон');
    expect(creature.originalName).toBe('Adult Green Dragon');
    expect(creature.size).toBe('Огромный');
    expect(creature.creatureType).toBe('Дракон (Цветной)');
    expect(creature.alignment).toBe('Принципиальный Злой');
    expect(creature.armorClass).toBe(19);
    expect(creature.initiativeMod).toBe(11);
    expect(creature.initiativeScore).toBe(21);
    expect(creature.hitPoints).toBe(207);
    expect(creature.hitDice).toBe('18d12 + 90');
    expect(creature.speeds).toBe('40 футов, Плавания 40 футов, Полёта 80 футов');
    expect(creature.abilities.str).toBe(23);
    expect(creature.savingThrows.dex).toBe(6);
    expect(creature.skills).toContain('Восприятие +12');
    expect(creature.immunities).toBe('Яд');
    expect(creature.conditionImmunities).toBe('Отравленный');
    expect(creature.challengeRating).toBe('15');
    expect(creature.xp).toBe(13000);
    expect(creature.proficiencyBonus).toBe(5);
    expect(creature.traits[0].name).toBe('Амфибия');
    expect(creature.actions.some((action) => action.name === 'Ядовитое дыхание (Перезарядка 5–6)')).toBe(true);
    const spellcasting = creature.actions.find((action) => action.name === 'Сотворение заклинаний');
    expect(spellcasting?.html).toContain('https://next.dnd.su/spells/10581-mind-spike');
    expect(spellcasting?.html).not.toContain('article-body__feature-name');
    expect(creature.imageUrl).toBe('https://next.dnd.su/gallery/bestiary/21163_1_1756198789.png');
    expect(creature.lairName).toBe('Логова зелёных драконов');
    expect(creature.lairEffects).toHaveLength(2);
    expect(creature.lairEffects[0].name).toBe('Животные-шпионы');
    expect(creature.lairEffects[1].name).toBe('Ядовитая чаща');
  });
  it('extracts next.dnd.su spell cards', () => {
    const spell = parseNextDndSpell(spellFixture, 'https://next.dnd.su/spells/10581-mind-spike/');

    expect(spell.name).toBe('Пронзание разума');
    expect(spell.originalName).toBe('Mind Spike');
    expect(spell.level).toBe('2 уровень');
    expect(spell.school).toBe('Прорицание');
    expect(spell.castingTime).toBe('Действие');
    expect(spell.range).toBe('120 футов');
    expect(spell.components).toBe('C');
    expect(spell.duration).toContain('Концентрация');
    expect(spell.descriptionHtml).toContain('Психического урона');
    expect(spell.descriptionHtml).toContain('Используя ячейку');
  });
});

const fixture = `
<!doctype html>
<html lang="ru">
  <head><title>Взрослый зелёный дракон / Бестиарий D&D 5 / </title></head>
  <body>
    <div class="paper-1 card active card__group-classic card__category-bestiary typoable">
      <div class="card__header">
        <h2 class="card-title">
          <span data-copy="Взрослый зелёный дракон [Adult Green Dragon]">Взрослый зелёный дракон [Adult Green Dragon]</span>
        </h2>
      </div>
      <div class="card__body new-article">
        <ul class="params card__article-body params-bestiary">
          <li class="size-type-alignment">Огромный<sup>?</sup> Дракон (Цветной), Принципиальный Злой</li>
          <li class="article-body__monster__armor-class-and-initiative">
            <span class="subsection-ac"><strong>Класс Защиты</strong> 19</span>
            <span class="subsection-initiative"><strong>Инициатива</strong> +11 (<span class="value">21</span>)</span>
          </li>
          <li><strong>Хиты</strong> <span data-type="middle">207</span> (<span data-type="throw">18</span>к<span data-type="dice">12</span> <span data-type="action">+</span> <span data-type="bonus">90</span>)</li>
          <li><strong>Скорость</strong> <strong>40 футов</strong>, Плавания <strong>40 футов</strong>, Полёта <strong>80 футов</strong></li>
          <li class="abilities">
            <div class="stat-pair">
              <div class="stat-pair-row"><div class="title">СИЛ</div><div class="value">23</div><div class="mod">+6</div><div class="save">+6</div></div>
              <div class="stat-pair-row"><div class="title">ЛОВ</div><div class="value">12</div><div class="mod">+1</div><div class="save">+6</div></div>
              <div class="stat-pair-row"><div class="title">ТЕЛ</div><div class="value">21</div><div class="mod">+5</div><div class="save">+5</div></div>
            </div>
            <div class="stat-pair">
              <div class="stat-pair-row"><div class="title">ИНТ</div><div class="value">18</div><div class="mod">+4</div><div class="save">+4</div></div>
              <div class="stat-pair-row"><div class="title">МДР</div><div class="value">15</div><div class="mod">+2</div><div class="save">+7</div></div>
              <div class="stat-pair-row"><div class="title">ХАР</div><div class="value">18</div><div class="mod">+4</div><div class="save">+4</div></div>
            </div>
          </li>
          <li class="skills"><strong>Навыки</strong> <span>Восприятие <strong>+12</strong></span>, <span>Обман <strong>+9</strong></span></li>
          <li><strong>Иммунитеты</strong> Яд; <strong>Отравленный</strong><sup><a href="/glossary/poisoned">?</a></sup></li>
          <li><strong>Чувства</strong> Тёмное зрение <strong>120 футов</strong>, пассивное Восприятие <strong>22</strong></li>
          <li><strong>Языки</strong> Общий, Драконий</li>
          <li><strong>Опасность</strong> 15 (13&thinsp;000 опыта или 15&thinsp;000 опыта в Логове; БВ +5)</li>
          <li class="article-body__monster__section">
            <h3 class="article-body__monster__section-title">Особенности</h3>
            <div class="article-body__monster__section-body">
              <p class="article-body__feature"><span class="article-body__feature-name" title="Amphibious">Амфибия</span>. Взрослый зеленый дракон может дышать как воздухом, так и под водой.</p>
            </div>
          </li>
          <li class="article-body__monster__section">
            <h3 class="article-body__monster__section-title">Действия</h3>
            <div class="article-body__monster__section-body">
              <p class="article-body__feature"><span class="article-body__feature-name" title="Multiattack">Мультиатака</span>. Дракон совершает три атаки.</p>
              <p class="article-body__monster-save-effect"><span class="article-body__monster-save-effect__name" title="Poison Breath">Ядовитое дыхание (Перезарядка 5–6)</span>. Спасбросок Телосложения: Сл 18.</p>
              <p class="article-body__feature monster__spellcasting">
                <span class="article-body__feature-name" title="Spellcasting">Сотворение заклинаний</span>.
                <a href="/spells/10581-mind-spike" data-name="Пронзание разума [Mind Spike]">Пронзание разума</a>
              </p>
            </div>
          </li>
          <h3 class="article-body__header_small_underlined">Логова зелёных драконов</h3>
          <p class="article-body__any-left">Местность логова изменяется из-за присутствия дракона.</p>
          <ul class="article-body__list-unordered"><li><b>Животные-шпионы</b>. Животные Маленького размера понимают Драконий.</li></ul>
          <ul class="article-body__list-unordered"><li><b>Ядовитая чаща</b>. Обычные растения отравляют воздух.</li></ul>
        </ul>
      </div>
    </div>
    <div data-src="/gallery/bestiary/21163_1_1756198789.png" class="gallery-card shown">
      <img src="/gallery/bestiary/21163_1_1756198789_s.png" class="gallery-image" />
    </div>
  </body>
</html>
`;

const spellFixture = `
<!doctype html>
<html lang="ru">
  <body>
    <div class="paper-1 card active card__group-classic card__category-spells typoable">
      <div class="card__header">
        <h2 class="card-title">
          <span data-copy="Пронзание разума [Mind Spike]">Пронзание разума [Mind Spike]</span>
          <span class="source-plaque" title="Player's Handbook 2024"></span>
        </h2>
      </div>
      <div class="card__body new-article">
        <ul class="params card__article-body params-spells">
          <li class="school_level"><a href="/mechanics/spellcasting#level">2 уровень</a>, <a href="/mechanics/spellcasting#school">Прорицание</a></li>
          <li class="cast_time"><strong><a href="/mechanics/spellcasting#cast-time">Время сотворения</a>:</strong> <a href="/glossary/magic">Действие</a></li>
          <li class="range"><strong><a href="/mechanics/spellcasting#range">Дистанция</a>:</strong> 120 футов</li>
          <li class="components"><strong><a href="/mechanics/spellcasting#components">Компоненты</a>:</strong> C</li>
          <li class="duration"><strong><a href="/mechanics/spellcasting#duration">Длительность</a>:</strong> <a href="/glossary/concentration">Концентрация</a>, вплоть до 1 часа</li>
          <li class="subsection desc">
            <div itemprop="description">
              <p class="article-body__any-left">Цель получает 3к8 Психического урона.</p>
            </div>
            <div itemprop="spell__higher-levels">
              <span class="spell__higher-levels__head">Используя ячейку заклинания большего уровня. </span>
              <p class="article-body__any-left">Урон увеличивается на 1к8.</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </body>
</html>
`;

import { describe, expect, it } from 'vitest';
import { parseRuleholderMonster, parseRuleholderSpell } from './ruleholderParser';

describe('parseRuleholderMonster', () => {
  it('extracts core Ruleholder statblock fields', () => {
    const creature = parseRuleholderMonster(fixture, 'https://ruleholder.com/monsters/steam-mephit');

    expect(creature.name).toBe('Паровой мефит');
    expect(creature.originalName).toBe('Steam Mephit');
    expect(creature.size).toBe('Небольшой');
    expect(creature.creatureType).toBe('Элементаль');
    expect(creature.armorClass).toBe(10);
    expect(creature.initiativeMod).toBe(0);
    expect(creature.hitPoints).toBe(17);
    expect(creature.hitDice).toBe('5d6');
    expect(creature.speeds).toBe('30 футов, полёт 30 футов');
    expect(creature.immunities).toBe('Огонь, Яд');
    expect(creature.conditionImmunities).toBe('Отравленный, Истощение');
    expect(creature.challengeRating).toBe('1/4');
    expect(creature.xp).toBe(50);
    expect(creature.proficiencyBonus).toBe(2);
    expect(creature.actions[0].name).toBe('Когти');
    expect(creature.imageUrl).toContain('media.ruleholder.com/images/portraits/steam-mephit.webp');
    expect(creature.tokenUrl).toContain('media.ruleholder.com/images/tokens/steam-mephit.webp');
  });

  it('preserves spell links inside npc actions', () => {
    const creature = parseRuleholderMonster(spellcastingFixture, 'https://ruleholder.com/monsters/thri-kreen-psion');
    const spellcasting = creature.actions.find((action) => action.name === 'Заклинания');

    expect(spellcasting?.html).toContain('/spells/synaptic-static');
    expect(spellcasting?.html).toContain('data-ref-color="spell"');
  });

  it('parses compound sizes and comma-separated creature subtypes', () => {
    const creature = parseRuleholderMonster(compoundSizeFixture, 'https://ruleholder.com/monsters/mage');

    expect(creature.size).toBe('Средний или Небольшой');
    expect(creature.creatureType).toBe('Гуманоид, волшебник');
    expect(creature.alignment).toBe('Нейтральный');
  });

  it('keeps damage and condition immunities in separate fields', () => {
    const creature = parseRuleholderMonster(gelatinousCubeFixture, 'https://ruleholder.com/monsters/gelatinous-cube');

    expect(creature.immunities).toBe('Кислота');
    expect(creature.conditionImmunities).toBe('Оглохший, Испуганный, Очарованный, Опрокинутый, Ослеплённый, Истощение');
  });

  it('extracts lair text from Ruleholder lore sections', () => {
    const creature = parseRuleholderMonster(lairFixture, 'https://ruleholder.com/monsters/adult-green-dragon');

    expect(creature.lairName).toBe('Логова зелёных драконов');
    expect(creature.lairDescription).toContain('Животные-шпионы');
    expect(creature.lairHtml).toContain('Ядовитая чаща');
    expect(creature.lairEffects).toHaveLength(2);
    expect(creature.lairEffects[0].name).toBe('Животные-шпионы');
    expect(creature.lairEffects[1].name).toBe('Ядовитая чаща');
  });
});

describe('parseRuleholderSpell', () => {
  it('extracts spell card metadata and description', () => {
    const spell = parseRuleholderSpell(spellFixture, 'https://ruleholder.com/spells/synaptic-static');

    expect(spell.name).toBe('Синаптический шум');
    expect(spell.originalName).toBe('Synaptic Static');
    expect(spell.source).toBe('PHB');
    expect(spell.level).toBe('5-й круг');
    expect(spell.school).toBe('Очарование');
    expect(spell.range).toBe('120 футов');
    expect(spell.damage).toBe('8d6 Психический');
    expect(spell.description).toContain('всплеск психической энергии');
    expect(spell.descriptionHtml).toContain('8d6 Психического урона');
  });
});

const fixture = `
<!doctype html>
<html lang="ru">
  <head>
    <title>Паровой мефит / Steam Mephit | Ruleholder</title>
    <link rel="preload" as="image" imageSrcSet="/_next/image?url=https%3A%2F%2Fmedia.ruleholder.com%2Fimages%2Fportraits%2Fsteam-mephit.webp&amp;w=640&amp;q=75 640w" />
    <link rel="preload" as="image" imageSrcSet="/_next/image?url=https%3A%2F%2Fmedia.ruleholder.com%2Fimages%2Ftokens%2Fsteam-mephit.webp&amp;w=256&amp;q=75 256w" />
  </head>
  <body>
    <span id="entity-original-name">Steam Mephit</span>
    <section class="statblock npc rules-2024">
      <h2 class="statblock-title">Паровой мефит</h2>
      <span class="statblock-tags">Небольшой Элементаль, Нейтральный Злой</span>
      <div class="statblock-header">
        <dl>
          <div><dt>КБ</dt><dd><span>10</span></dd></div>
          <div><dt>Инициатива</dt><dd><span>+0 (10)</span></dd></div>
          <div><dt>ПЗ</dt><dd><span>17</span><span> (5d6)</span></dd></div>
          <div><dt>Скорость</dt><dd><span>30 футов, полёт 30 футов</span></dd></div>
        </dl>
        <div class="abilities">
          <table><tbody>
            <tr><th>СИЛ</th><td class="score">5</td><td>-3</td><td>-3</td></tr>
            <tr><th>ЛВК</th><td class="score">11</td><td>+0</td><td>+0</td></tr>
            <tr><th>ВЫН</th><td class="score">10</td><td>+0</td><td>+0</td></tr>
          </tbody></table>
          <table><tbody>
            <tr><th>ИНТ</th><td class="score">11</td><td>+0</td><td>+0</td></tr>
            <tr><th>МДР</th><td class="score">10</td><td>+0</td><td>+0</td></tr>
            <tr><th>ХАР</th><td class="score">12</td><td>+1</td><td>+1</td></tr>
          </tbody></table>
        </div>
        <dl>
          <div><dt>Навыки</dt><dd><span>Скрытность +2</span></dd></div>
          <div><dt>Невосприимчивость</dt><dd><span>Огонь, Яд</span></dd></div>
          <div><dt>Невосприимчивость к состояниям</dt><dd><span>Отравление, Утомление</span></dd></div>
          <div><dt>Восприятие</dt><dd><span>Ночное зрение 60 футов</span></dd></div>
          <div><dt>Языки</dt><dd><span>Подводный, Игнан</span></dd></div>
          <div><dt>КО</dt><dd><span>1/4 (50 ПО; БУ +2)</span></dd></div>
        </dl>
      </div>
      <section class="statblock-actions trait">
        <h3 class="statblock-actions-title">Особенности</h3>
        <div class="statblock-action"><p><span class="name">Расплывчатая форма</span> Атаки совершаются с помехой.</p></div>
      </section>
      <section class="statblock-actions action">
        <h3 class="statblock-actions-title">Действия</h3>
        <div class="statblock-action"><p><span class="name">Когти</span> +2 к попаданию.</p></div>
      </section>
    </section>
  </body>
</html>
`;

const lairFixture = fixture.replace(
  '</body>',
  `
    <h2>Логова зелёных драконов</h2>
    <section class="content-embed">
      <p><strong>Животные-шпионы.</strong> Птицы и звери следят за чужаками.</p>
      <p><strong>Ядовитая чаща.</strong> Растения в логове источают яд.</p>
    </section>
  </body>`
);

const gelatinousCubeFixture = fixture
  .replace('Паровой мефит / Steam Mephit', 'Желатиновый куб / Gelatinous Cube')
  .replace('Steam Mephit', 'Gelatinous Cube')
  .replace('Паровой мефит', 'Желатиновый куб')
  .replace('<span>Огонь, Яд</span>', '<span>Кислота</span>')
  .replace('<span>Отравление, Утомление</span>', '<span>Глухота, Испуг, Обворожение, Распластанность, Слепота, Утомление</span>');

const spellcastingFixture = `
<!doctype html>
<html lang="ru">
  <head><title>Три-крин псионик / Thri-kreen Psion | Ruleholder</title></head>
  <body>
    <span id="entity-original-name">Thri-kreen Psion</span>
    <section class="statblock npc rules-2024">
      <h2 class="statblock-title">Три-крин псионик</h2>
      <span class="statblock-tags">Средний Монстр, Нейтральный</span>
      <div class="statblock-header">
        <dl>
          <div><dt>КБ</dt><dd>16</dd></div>
          <div><dt>Инициатива</dt><dd>+2 (12)</dd></div>
          <div><dt>ПЗ</dt><dd>149 (23d8 + 46)</dd></div>
          <div><dt>Скорость</dt><dd>40 футов, полёт 20 футов</dd></div>
          <div><dt>КО</dt><dd>8 (3 900 ПО; БУ +3)</dd></div>
        </dl>
        <div class="abilities">
          <table><tbody>
            <tr><th>СИЛ</th><td>18</td><td>+4</td><td>+7</td></tr>
            <tr><th>ЛВК</th><td>15</td><td>+2</td><td>+5</td></tr>
            <tr><th>ВЫН</th><td>14</td><td>+2</td><td>+5</td></tr>
          </tbody></table>
          <table><tbody>
            <tr><th>ИНТ</th><td>19</td><td>+4</td><td>+7</td></tr>
            <tr><th>МДР</th><td>12</td><td>+1</td><td>+1</td></tr>
            <tr><th>ХАР</th><td>11</td><td>+0</td><td>+0</td></tr>
          </tbody></table>
        </div>
      </div>
      <section class="statblock-actions action">
        <h3 class="statblock-actions-title">Действия</h3>
        <div class="statblock-action">
          <p><span class="name">Заклинания</span>Три-крин псионик сотворяет одно из описанных ниже заклинаний.</p>
          <p><strong>1/в день:</strong> <a class="content-ref" data-ref-color="spell" href="/spells/synaptic-static">Синаптический шум</a></p>
        </div>
      </section>
    </section>
  </body>
</html>
`;

const compoundSizeFixture = `
<!doctype html>
<html lang="ru">
  <head><title>Маг / Mage | Ruleholder</title></head>
  <body>
    <span id="entity-original-name">Mage</span>
    <section class="statblock npc rules-2024">
      <h2 class="statblock-title">Маг</h2>
      <span class="statblock-tags">Средний или Небольшой Гуманоид, волшебник, Нейтральный</span>
      <div class="statblock-header">
        <dl>
          <div><dt>КБ</dt><dd>12</dd></div>
          <div><dt>Инициатива</dt><dd>+2 (12)</dd></div>
          <div><dt>ПЗ</dt><dd>40 (9d8)</dd></div>
          <div><dt>Скорость</dt><dd>30 футов</dd></div>
          <div><dt>КО</dt><dd>6 (2 300 ПО; БУ +3)</dd></div>
        </dl>
      </div>
      <section class="statblock-actions action">
        <h3 class="statblock-actions-title">Действия</h3>
        <div class="statblock-action"><p><span class="name">Посох</span> +4 к попаданию.</p></div>
      </section>
    </section>
  </body>
</html>
`;

const spellFixture = `
<!doctype html>
<html lang="ru">
  <head><title>Синаптический шум / Synaptic Static | Ruleholder</title></head>
  <body>
    <span id="entity-original-name">Synaptic Static</span>
    <span class="rh-source-tag">PHB</span>
    <article>
      <section class="rh-elevated-surface p-6">
        <dl class="rh-detail-metadata-grid">
          <div><dt>Круг</dt><dd>5-й круг</dd></div>
          <div><dt>Школа магии</dt><dd>Очарование</dd></div>
          <div><dt>Время сотворения</dt><dd>Действие</dd></div>
          <div><dt>Дистанция</dt><dd>120 футов</dd></div>
          <div><dt>Длительность</dt><dd>Мгновенное</dd></div>
          <div><dt>Цель</dt><dd>1 Существо</dd></div>
          <div><dt>Область действия</dt><dd>Сфера, 20 футов</dd></div>
          <div><dt>Испытание</dt><dd>Интеллект</dd></div>
          <div><dt>Урон</dt><dd>8d6 Психический</dd></div>
          <div><dt>Компоненты</dt><dd>Жестовый, Словесный</dd></div>
        </dl>
        <div class="rich-content">
          <p>Вы вызываете всплеск психической энергии. Цель получает <span class="dice-roll">8d6 Психического урона</span>.</p>
        </div>
      </section>
    </article>
  </body>
</html>
`;

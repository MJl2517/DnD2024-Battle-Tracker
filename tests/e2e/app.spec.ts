import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let app: ElectronApplication;
let page: Page;
let userDataPath: string;

test.beforeEach(async () => {
  userDataPath = await mkdtemp(join(tmpdir(), 'dnd-tracker-e2e-'));
  app = await electron.launch({ args: ['.', `--user-data-dir=${userDataPath}`] });
  page = await app.firstWindow();
});

test.afterEach(async () => {
  await app.close();
  await rm(userDataPath, { recursive: true, force: true });
});

async function createCampaign(): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Создайте профиль кампании' })).toBeVisible();
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('Ильмарен', { exact: true }).first()).toBeVisible();
}

test('creates a campaign without touching the real user database', async () => {
  await createCampaign();
  await expect(page.getByRole('button', { name: 'Бой', exact: true })).toBeVisible();
});

test('runs an encounter, synchronizes the player window and awards xp', async ({ browserName }) => {
  void browserName; // Деструктуризация fixture обязательна для Playwright, браузер в Electron-тесте не запускается.
  await createCampaign();

  await page.evaluate(async () => {
    const api = window.dndTracker;
    const campaign = (await api.listCampaigns())[0];
    const player = await api.savePlayer({
      campaignId: campaign.id,
      name: 'Тестовый герой',
      level: 3,
      armorClass: 16,
      maxHp: 28,
      initiativeMod: 20,
      passivePerception: 13,
      active: true
    });
    const creature = await api.saveCreature({
      campaignId: campaign.id,
      name: 'Учебный противник',
      originalName: 'Training Enemy',
      size: 'Средний',
      creatureType: 'Конструкт',
      alignment: 'Без мировоззрения',
      armorClass: 10,
      initiativeMod: 2,
      initiativeScore: 12,
      hitPoints: 10,
      hitDice: '2d8+1',
      speeds: '30 футов',
      abilities: { str: 10, dex: 10, con: 10, int: 1, wis: 1, cha: 1 },
      savingThrows: {},
      skills: '',
      vulnerabilities: '',
      resistances: '',
      immunities: '',
      conditionImmunities: '',
      senses: '',
      languages: '',
      challengeRating: '1/4',
      xp: 50,
      proficiencyBonus: 2,
      traits: [{ id: 'training-trait', name: 'Учебная особенность', description: 'Описание для публичной карточки.', html: '', section: 'Особенности' }],
      actions: [],
      imageUrl: '',
      tokenUrl: '',
      lairName: '',
      lairDescription: '',
      lairHtml: '',
      lairEffects: [],
      sourceUrl: '',
      notes: ''
    });
    const encounter = await api.saveEncounter({ campaignId: campaign.id, name: 'Сквозной тест' });
    await api.saveEncounterPlayerSetting({ encounterId: encounter.id, playerId: player.id, participating: true, initiativeOverride: 28 });
    await api.saveEncounterGroup({
      encounterId: encounter.id,
      templateId: creature.id,
      quantity: 1,
      initiativeMode: 'individual',
      initiativeOverride: 9
    });
    await api.saveEncounterGroup({
      encounterId: encounter.id,
      templateId: creature.id,
      displayName: 'Учебный союзник',
      quantity: 1,
      initiativeMode: 'individual',
      initiativeOverride: 8,
      isAlly: true
    });
    await api.savePublicDisplaySettings({
      ...(await api.getPublicDisplaySettings()),
      turnTimerEnabled: true,
      turnTimerSeconds: 60,
      skipNpcTurnTimer: true
    });
  });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Экран игроков' })).toBeVisible();

  await page.getByRole('button', { name: 'Энкаунтеры', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && window.scrollY === 0)).toBe(true);
  const encounterPanel = page.locator('.encounter-layout > .panel').nth(1);
  const stickyHeader = encounterPanel.locator('.encounter-sticky-header');
  const difficultyPanel = stickyHeader.locator('.encounter-difficulty-panel');
  await expect(difficultyPanel).toHaveClass(/collapsed/);
  await expect(difficultyPanel.locator('.difficulty-scale')).toBeVisible();
  await expect(stickyHeader.getByText('Оценка сложности', { exact: true })).toBeHidden();
  await expect(difficultyPanel.locator('.difficulty-warning-dot')).toBeVisible();
  await stickyHeader.getByRole('button', { name: 'Развернуть оценку сложности' }).click();
  await expect(difficultyPanel).not.toHaveClass(/collapsed/);
  await expect(stickyHeader.getByText('Оценка сложности', { exact: true })).toBeVisible();
  await expect(stickyHeader.getByText(/В сцене есть союзники/)).toBeVisible();
  await stickyHeader.getByRole('button', { name: 'Свернуть оценку сложности' }).click();
  await expect(difficultyPanel.locator('.difficulty-warning-dot')).toBeHidden();
  await stickyHeader.getByRole('button', { name: 'Развернуть оценку сложности' }).click();
  const encounterPanelBox = await encounterPanel.boundingBox();
  const initialHeaderBox = await stickyHeader.boundingBox();
  if (!encounterPanelBox || !initialHeaderBox) throw new Error('Не удалось определить положение закреплённого блока энкаунтера.');
  expect(Math.abs(initialHeaderBox.y - encounterPanelBox.y)).toBeLessThanOrEqual(1);

  await encounterPanel.evaluate((panel) => {
    const filler = document.createElement('div');
    filler.dataset.e2eScrollFiller = 'true';
    filler.style.height = '1600px';
    panel.append(filler);
    panel.scrollTop = panel.scrollHeight;
  });
  await expect.poll(() => encounterPanel.evaluate((panel) => panel.scrollHeight > panel.clientHeight && panel.scrollTop > 0)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(async () => Math.round((await stickyHeader.boundingBox())?.y ?? -1)).toBe(Math.round(initialHeaderBox.y));
  await expect(stickyHeader.getByRole('button', { name: 'Бросить инициативу' })).toBeVisible();
  await expect(stickyHeader.getByText('Оценка сложности', { exact: true })).toBeVisible();
  await encounterPanel.evaluate((panel) => {
    panel.querySelector('[data-e2e-scroll-filler]')?.remove();
    panel.scrollTop = 0;
  });
  await page.evaluate(async () => {
    const api = window.dndTracker;
    const campaign = (await api.listCampaigns())[0];
    const encounter = (await api.getCampaignDetail(campaign.id)).encounters[0];
    const allyGroup = encounter.groups.find((group) => group.isAlly);
    if (allyGroup) await api.deleteEncounterGroup(allyGroup.id);
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Бросить инициативу' })).toBeVisible();

  const playerWindowPromise = app.waitForEvent('window');
  await page.getByRole('button', { name: 'Экран игроков' }).click();
  const playerPage = await playerWindowPromise;
  await playerPage.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: 'Бросить инициативу' }).click();
  const initiativeDialog = page.getByRole('dialog', { name: 'Порядок инициативы' });
  await expect(initiativeDialog).toBeVisible();
  await expect(playerPage.getByText('Бой ещё не начат')).toBeVisible();

  const heroRoll = initiativeDialog.getByRole('spinbutton', { name: 'Бросок инициативы: Тестовый герой' });
  const enemyRoll = initiativeDialog.getByRole('spinbutton', { name: 'Бросок инициативы: Учебный противник' });
  await heroRoll.fill('1');
  await enemyRoll.fill('20');
  await enemyRoll.blur();
  await expect(initiativeDialog.locator('.initiative-setup-card').first()).toContainText('Учебный противник');
  await heroRoll.fill('8');
  await enemyRoll.fill('7');
  await enemyRoll.press('Enter');
  await expect(initiativeDialog.locator('.initiative-setup-card').first()).toContainText('Тестовый герой');
  await initiativeDialog.getByRole('button', { name: 'Начать бой' }).click();
  await expect(page.getByRole('heading', { name: 'Боевой порядок' })).toBeVisible();
  await expect(playerPage.getByText('Тестовый герой', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('timer', { name: /До конца хода/ })).toBeVisible();
  await expect(playerPage.getByRole('timer', { name: /До конца хода/ })).toBeVisible();
  await playerPage.waitForTimeout(1_500);

  await page.getByRole('button', { name: 'Поставить таймер хода на паузу' }).click();
  await expect(page.getByRole('timer', { name: /Таймер на паузе, осталось/ })).toBeVisible();
  await expect(playerPage.getByRole('timer', { name: /Таймер на паузе, осталось/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Продолжить таймер хода' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить таймер хода' }).click();
  await expect(page.getByRole('timer', { name: /До конца хода/ })).toBeVisible();
  await expect(playerPage.getByRole('timer', { name: /До конца хода/ })).toBeVisible();

  await page.getByRole('button', { name: 'Добавить существо' }).click();
  const addCombatantDialog = page.getByRole('dialog', { name: 'Добавить существ' });
  await expect(addCombatantDialog.getByRole('textbox', { name: 'Выбрать существо из бестиария' })).toBeVisible();
  await expect(addCombatantDialog.getByText('Бросок инициативы')).toBeVisible();
  await addCombatantDialog.getByRole('button', { name: 'Закрыть' }).click();

  await expect(page).toHaveScreenshot('master-combat.png', { animations: 'disabled', maxDiffPixels: 1_000 });
  await expect(playerPage).toHaveScreenshot('player-display.png', { animations: 'disabled', maxDiffPixels: 1_000 });

  await page.getByRole('button', { name: 'Следующий ход' }).click();
  await expect(page.getByRole('timer', { name: 'Ход без ограничения времени' })).toBeVisible();
  await expect(playerPage.getByRole('timer', { name: 'Ход без ограничения времени' })).toBeVisible();
  await page.getByRole('button', { name: 'Ход назад' }).click();
  await expect(page.getByRole('timer', { name: /До конца хода/ })).toBeVisible();

  const combatWorkspace = page.locator('.combat-workspace');
  const combatHeader = page.locator('.combat-sticky-header');
  await page.locator('.combat-layout').evaluate((layout) => {
    const filler = document.createElement('div');
    filler.dataset.e2eCombatScrollFiller = 'true';
    filler.style.height = '1600px';
    layout.append(filler);
  });
  await combatWorkspace.evaluate((workspace) => {
    workspace.scrollTop = workspace.scrollHeight;
  });
  await expect.poll(() => combatWorkspace.evaluate((workspace) => workspace.scrollTop > 0)).toBe(true);
  await expect(combatHeader).toHaveClass(/is-stuck/);
  await expect.poll(() => page.evaluate(() => Boolean(document.elementFromPoint(window.innerWidth / 2, 1)?.closest('.combat-sticky-header')))).toBe(true);
  await expect(combatHeader.getByRole('button', { name: 'Следующий ход' })).toBeVisible();
  await page.locator('[data-e2e-combat-scroll-filler]').evaluate((filler) => filler.remove());
  await combatWorkspace.evaluate((workspace) => {
    workspace.scrollTop = 0;
  });
  await page.waitForTimeout(100);
  await combatWorkspace.evaluate((workspace) => {
    workspace.scrollTop = 0;
  });
  await expect.poll(() => combatWorkspace.evaluate((workspace) => workspace.scrollTop)).toBe(0);

  await page.getByRole('button', { name: 'Добавить существо' }).click();
  const reinforcementDialog = page.getByRole('dialog', { name: 'Добавить существ' });
  const creatureSearch = reinforcementDialog.getByRole('textbox', { name: 'Выбрать существо из бестиария' });
  await creatureSearch.fill('Учебный противник');
  await creatureSearch.press('Enter');
  await reinforcementDialog.getByLabel('Количество').fill('2');
  await reinforcementDialog.getByLabel('Бросок инициативы').fill('20');
  await reinforcementDialog.getByLabel('Бонус к инициативе').fill('3');
  await reinforcementDialog.getByText('Преимущество', { exact: true }).click();
  await reinforcementDialog.getByRole('button', { name: 'Способ определения хитов' }).click();
  await page.getByRole('option', { name: /Указать вручную/ }).click();
  await reinforcementDialog.getByLabel('Хиты каждого существа').fill('17');
  await reinforcementDialog.getByRole('button', { name: 'Подтвердить' }).click();
  const queuedCreature = reinforcementDialog.getByRole('button', { name: /Учебный противник.*2 шт/ });
  await expect(queuedCreature).toBeVisible();
  await queuedCreature.click();
  await expect(reinforcementDialog.getByLabel('Количество')).toHaveValue('2');
  await expect(reinforcementDialog.getByRole('button', { name: 'Преимущество', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(reinforcementDialog.getByLabel('Хиты каждого существа')).toHaveValue('17');
  await expect(reinforcementDialog).toHaveScreenshot('add-combatants-modal.png', { animations: 'disabled' });
  await reinforcementDialog.getByRole('button', { name: 'Добавить в бой' }).click();
  await expect(page.getByText('Учебный противник 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Учебный противник 2', { exact: true })).toBeVisible();

  await page.evaluate(async () => {
    const api = window.dndTracker;
    const campaign = (await api.listCampaigns())[0];
    const session = (await api.getCampaignDetail(campaign.id)).activeSession;
    const enemy = session?.combatants.find((combatant) => combatant.side === 'npc');
    if (!enemy) throw new Error('В тестовом бою не найден NPC.');
    await api.updateCombatant(enemy.id, { currentHp: 0, defeated: true });
  });

  await page.getByRole('button', { name: 'Следующий ход' }).click();
  await page.getByRole('button', { name: 'Завершить бой' }).click();
  await expect(page.getByRole('heading', { name: 'Настройки опыта' })).toBeVisible();
  await page.getByRole('button', { name: 'Применить' }).click();
  const masterAward = page.getByRole('dialog', { name: 'Опыт начислен' });
  const publicAward = playerPage.getByRole('dialog', { name: 'Опыт начислен' });
  await expect(masterAward.getByText('50', { exact: true })).toBeVisible();
  await expect(publicAward.getByText('50', { exact: true })).toBeVisible();
});

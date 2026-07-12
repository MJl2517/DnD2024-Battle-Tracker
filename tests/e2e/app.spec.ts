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
      initiativeMod: -20,
      initiativeScore: 0,
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
  });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Экран игроков' })).toBeVisible();

  await page.getByRole('button', { name: 'Энкаунтеры', exact: true }).click();
  const encounterPanel = page.locator('.encounter-layout > .panel').nth(1);
  const stickyHeader = encounterPanel.locator('.encounter-sticky-header');
  const difficultyPanel = stickyHeader.locator('.encounter-difficulty-panel');
  await stickyHeader.getByRole('button', { name: 'Свернуть оценку сложности' }).click();
  await expect(difficultyPanel).toHaveClass(/collapsed/);
  await expect(difficultyPanel.locator('.difficulty-scale')).toBeVisible();
  await expect(stickyHeader.getByText('Оценка сложности', { exact: true })).toBeHidden();
  await stickyHeader.getByRole('button', { name: 'Развернуть оценку сложности' }).click();
  await expect(difficultyPanel).not.toHaveClass(/collapsed/);
  await expect(stickyHeader.getByText('Оценка сложности', { exact: true })).toBeVisible();
  const initialHeaderBox = await stickyHeader.boundingBox();
  if (!initialHeaderBox) throw new Error('Не удалось определить положение закреплённого блока энкаунтера.');

  await encounterPanel.evaluate((panel) => {
    const filler = document.createElement('div');
    filler.dataset.e2eScrollFiller = 'true';
    filler.style.height = '1600px';
    panel.append(filler);
    panel.scrollTop = panel.scrollHeight;
  });
  await expect.poll(async () => Math.round((await stickyHeader.boundingBox())?.y ?? -1)).toBe(Math.round(initialHeaderBox.y));
  await expect(stickyHeader.getByRole('button', { name: 'Начать бой' })).toBeVisible();
  await expect(stickyHeader.getByText('Оценка сложности', { exact: true })).toBeVisible();
  await encounterPanel.evaluate((panel) => {
    panel.querySelector('[data-e2e-scroll-filler]')?.remove();
    panel.scrollTop = 0;
  });
  await page.getByRole('button', { name: 'Бой', exact: true }).click();

  const playerWindowPromise = app.waitForEvent('window');
  await page.getByRole('button', { name: 'Экран игроков' }).click();
  const playerPage = await playerWindowPromise;
  await playerPage.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: 'Старт' }).click();
  await expect(page.getByRole('heading', { name: 'Боевой порядок' })).toBeVisible();
  await expect(playerPage.getByText('Тестовый герой', { exact: true }).first()).toBeVisible();
  await playerPage.waitForTimeout(1_500);

  await expect(page).toHaveScreenshot('master-combat.png', { animations: 'disabled' });
  await expect(playerPage).toHaveScreenshot('player-display.png', { animations: 'disabled', maxDiffPixels: 1_000 });

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

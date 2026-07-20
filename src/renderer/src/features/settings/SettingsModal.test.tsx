import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PUBLIC_DISPLAY_SETTINGS, type PublicDisplaySettings } from '@shared/types';
import { SettingsModal } from './SettingsModal';

const api = window.dndTracker;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUpdateStatus).mockResolvedValue({ status: 'idle', currentVersion: 'dev' });
  vi.mocked(api.getReleaseHistory).mockResolvedValue([
    {
      version: '0.3.0',
      tagName: 'v0.3.0',
      name: 'Таймер хода',
      notes: '- Добавлена пауза таймера',
      publishedAt: '2026-07-19T10:00:00.000Z',
      prerelease: false
    }
  ]);
  vi.mocked(api.getPublicDisplaySettings).mockResolvedValue(DEFAULT_PUBLIC_DISPLAY_SETTINGS);
  vi.mocked(api.savePublicDisplaySettings).mockImplementation(async (settings) => settings);
});

describe('SettingsModal turn timer settings', () => {
  it('enables the timer and keeps dependent controls disabled until then', async () => {
    render(<SettingsModal onClose={() => undefined} />);

    const enabled = await screen.findByRole('checkbox', { name: 'Включить таймер хода' });
    const seconds = screen.getByRole('spinbutton', { name: 'Секунд на ход' });
    const skipNpc = screen.getByRole('checkbox', { name: 'Не учитывать таймер для монстров' });
    expect(seconds).toBeDisabled();
    expect(skipNpc).toBeDisabled();

    fireEvent.click(enabled);

    await waitFor(() =>
      expect(api.savePublicDisplaySettings).toHaveBeenCalledWith({
        ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
        turnTimerEnabled: true
      })
    );
    expect(seconds).toBeEnabled();
    expect(skipNpc).toBeEnabled();
  });

  it('clamps seconds to the supported range before saving', async () => {
    const enabledSettings: PublicDisplaySettings = {
      ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
      turnTimerEnabled: true
    };
    vi.mocked(api.getPublicDisplaySettings).mockResolvedValue(enabledSettings);
    render(<SettingsModal onClose={() => undefined} />);

    const seconds = await screen.findByRole('spinbutton', { name: 'Секунд на ход' });
    fireEvent.change(seconds, { target: { value: '2' } });
    fireEvent.blur(seconds);

    await waitFor(() =>
      expect(api.savePublicDisplaySettings).toHaveBeenCalledWith({
        ...enabledSettings,
        turnTimerSeconds: 5
      })
    );
  });

  it('changes focused seconds with the wheel and prevents page scrolling', async () => {
    const enabledSettings: PublicDisplaySettings = {
      ...DEFAULT_PUBLIC_DISPLAY_SETTINGS,
      turnTimerEnabled: true
    };
    vi.mocked(api.getPublicDisplaySettings).mockResolvedValue(enabledSettings);
    render(<SettingsModal onClose={() => undefined} />);

    const seconds = await screen.findByRole('spinbutton', { name: 'Секунд на ход' });
    seconds.focus();
    const wheelWasNotCanceled = fireEvent.wheel(seconds, { deltaY: -100 });

    expect(wheelWasNotCanceled).toBe(false);
    expect(seconds).toHaveValue(61);
    fireEvent.blur(seconds);
    await waitFor(() =>
      expect(api.savePublicDisplaySettings).toHaveBeenCalledWith({
        ...enabledSettings,
        turnTimerSeconds: 61
      })
    );
  });

  it('opens release history from the update settings', async () => {
    render(<SettingsModal onClose={() => undefined} />);

    fireEvent.click(await screen.findByRole('button', { name: 'История версий' }));

    const historyDialog = await screen.findByRole('dialog', { name: 'История версий' });
    expect(within(historyDialog).getByText('Таймер хода')).toBeVisible();
    expect(within(historyDialog).getByText('Добавлена пауза таймера')).toBeVisible();
    expect(api.getReleaseHistory).toHaveBeenCalledOnce();
  });

  it('downloads an available update and starts the installer with one action', async () => {
    vi.mocked(api.getUpdateStatus).mockResolvedValue({
      status: 'available',
      currentVersion: '0.3.0',
      version: '0.3.1',
      canInstall: true
    });
    vi.mocked(api.downloadUpdate).mockResolvedValue({
      status: 'downloaded',
      currentVersion: '0.3.0',
      version: '0.3.1',
      canInstall: true,
      percent: 100
    });
    vi.mocked(api.installUpdate).mockResolvedValue({
      status: 'installing',
      currentVersion: '0.3.0',
      version: '0.3.1',
      canInstall: true
    });

    render(<SettingsModal onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Скачать и установить' }));

    await waitFor(() => expect(api.downloadUpdate).toHaveBeenCalledOnce());
    await waitFor(() => expect(api.installUpdate).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'Запускаем установщик...' })).toBeDisabled();
  });
});

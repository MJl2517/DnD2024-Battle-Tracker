import { describe, expect, it } from 'vitest';
import { getUserFacingErrorMessage } from './errors';

describe('getUserFacingErrorMessage', () => {
  it('removes Electron IPC details', () => {
    expect(
      getUserFacingErrorMessage(
        new Error("Error invoking remote method 'combat:begin-initiative-exchange': Error: Нет доступных союзников для обмена инициативой.")
      )
    ).toBe('Нет доступных союзников для обмена инициативой.');
  });

  it('uses a fallback for an empty error', () => {
    expect(getUserFacingErrorMessage('', 'Понятная ошибка')).toBe('Понятная ошибка');
  });
});

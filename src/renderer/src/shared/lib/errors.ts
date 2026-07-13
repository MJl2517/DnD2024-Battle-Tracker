/** Убирает служебную обёртку Electron IPC, оставляя понятное пользователю сообщение. */
export function getUserFacingErrorMessage(error: unknown, fallback = 'Не удалось выполнить действие.'): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const message = rawMessage
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/iu, '')
    .replace(/^Error:\s*/iu, '')
    .trim();

  return message || fallback;
}

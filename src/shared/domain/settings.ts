export interface PublicDisplaySettings {
  showEnemyArmorClass: boolean;
  showEnemySpeeds: boolean;
  hideCreatureNames: boolean;
  turnTimerEnabled: boolean;
  turnTimerSeconds: number;
  skipNpcTurnTimer: boolean;
}

export const DEFAULT_PUBLIC_DISPLAY_SETTINGS: PublicDisplaySettings = {
  showEnemyArmorClass: true,
  showEnemySpeeds: true,
  hideCreatureNames: false,
  turnTimerEnabled: false,
  turnTimerSeconds: 60,
  skipNpcTurnTimer: false
};

export interface PublicDisplaySettings {
  showEnemyArmorClass: boolean;
  showEnemySpeeds: boolean;
  hideCreatureNames: boolean;
}

export const DEFAULT_PUBLIC_DISPLAY_SETTINGS: PublicDisplaySettings = {
  showEnemyArmorClass: true,
  showEnemySpeeds: true,
  hideCreatureNames: false
};

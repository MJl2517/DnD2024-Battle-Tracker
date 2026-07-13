import type { PlayerCharacter } from '@shared/types';

export function emptyPlayer(campaignId: string): PlayerCharacter {
  const timestamp = new Date().toISOString();
  return {
    id: '',
    campaignId,
    name: '',
    level: 1,
    armorClass: 15,
    maxHp: 20,
    initiativeMod: 0,
    passivePerception: 10,
    active: true,
    alertInitiativeSwap: false,
    imageUrl: '',
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

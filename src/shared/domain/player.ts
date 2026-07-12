import type { Timestamped } from './common';

export interface PlayerCharacter extends Timestamped {
  id: string;
  campaignId: string;
  name: string;
  level: number;
  armorClass: number;
  maxHp: number;
  initiativeMod: number;
  passivePerception: number;
  active: boolean;
  imageUrl: string;
  notes: string;
}

export interface SavePlayerInput {
  id?: string;
  campaignId: string;
  name: string;
  level: number;
  armorClass: number;
  maxHp: number;
  initiativeMod: number;
  passivePerception: number;
  active: boolean;
  imageUrl?: string;
  notes?: string;
}

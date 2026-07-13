export type InitiativeMode = 'individual' | 'group';
export type CombatSide = 'player' | 'npc';
export type CombatStatus = 'preparing' | 'active' | 'completed';
export type HitPointMode = 'average' | 'fixed' | 'random';

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

import { parseTtgClubMonster, parseTtgClubSpell } from './parser';
import type { CreatureSourceAdapter } from '../contracts';

export const ttgClubAdapter: CreatureSourceAdapter = {
  hostname: 'new.ttg.club',
  displayName: 'TTG Club',
  parseCreature: parseTtgClubMonster,
  parseSpell: parseTtgClubSpell
};

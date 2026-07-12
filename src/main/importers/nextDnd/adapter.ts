import { parseNextDndMonster, parseNextDndSpell } from './parser';
import type { CreatureSourceAdapter } from '../contracts';

export const nextDndAdapter: CreatureSourceAdapter = {
  hostname: 'next.dnd.su',
  displayName: 'DnD.su',
  parseCreature: parseNextDndMonster,
  parseSpell: parseNextDndSpell
};

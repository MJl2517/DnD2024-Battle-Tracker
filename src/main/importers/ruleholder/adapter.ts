import { parseRuleholderMonster, parseRuleholderSpell } from '../../services/ruleholderParser';
import type { CreatureSourceAdapter } from '../contracts';

export const ruleholderAdapter: CreatureSourceAdapter = {
  hostname: 'ruleholder.com',
  displayName: 'Ruleholder',
  parseCreature: parseRuleholderMonster,
  parseSpell: parseRuleholderSpell
};

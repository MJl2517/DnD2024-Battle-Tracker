import { describe, expect, it } from 'vitest';
import { importPlayerFromLss } from './lssImporter';

describe('LSS player importer', () => {
  it('maps only fields supported by the tracker', () => {
    const player = importPlayerFromLss(
      {
        data: {
          name: { value: 'Лира' },
          info: { level: { value: 5 } },
          vitality: {
            ac: { value: 17 },
            'hp-max': { value: 40 },
            'hp-max-bonus': { value: 3 },
            initiative: { value: 4 }
          },
          stats: {
            dex: { score: { value: 18 } },
            wis: { score: { value: 14 } }
          },
          avatar: { value: 'https://example.com/lira.webp' }
        }
      },
      'campaign'
    );

    expect(player).toMatchObject({
      campaignId: 'campaign',
      name: 'Лира',
      level: 5,
      armorClass: 17,
      maxHp: 43,
      initiativeMod: 4,
      imageUrl: 'https://example.com/lira.webp',
      active: true,
      alertInitiativeSwap: false
    });
  });

  it('rejects payloads without character data', () => {
    expect(() => importPlayerFromLss([], 'campaign')).toThrow('не содержит данных персонажа');
  });
});

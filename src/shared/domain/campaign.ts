import type { Timestamped } from './common';

export interface Campaign extends Timestamped {
  id: string;
  name: string;
  notes: string;
}

export interface CreateCampaignInput {
  name: string;
  notes?: string;
}

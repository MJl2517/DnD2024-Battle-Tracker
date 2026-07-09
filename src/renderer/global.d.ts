import type { TrackerApi } from '@shared/types';

declare global {
  interface Window {
    dndTracker: TrackerApi;
  }
}

export {};

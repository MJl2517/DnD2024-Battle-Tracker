export type UpdateStatusKind = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'installing' | 'error';

export interface AppUpdateStatus {
  status: UpdateStatusKind;
  currentVersion: string;
  isPackaged?: boolean;
  version?: string;
  releaseName?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  canInstall?: boolean;
  releaseUrl?: string;
  message?: string;
}

/** Безопасное представление GitHub Release для renderer без исходного HTML. */
export interface AppRelease {
  version: string;
  tagName: string;
  name: string;
  notes: string;
  publishedAt?: string;
  url?: string;
  prerelease: boolean;
}

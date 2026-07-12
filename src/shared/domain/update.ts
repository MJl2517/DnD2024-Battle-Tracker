export type UpdateStatusKind = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface AppUpdateStatus {
  status: UpdateStatusKind;
  currentVersion: string;
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

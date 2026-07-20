import { History, RefreshCw, Sparkles, X } from 'lucide-react';
import type { AppRelease } from '@shared/types';
import { useModalFocus } from '../../shared/ui/useModalFocus';

export function ReleaseHistoryModal({
  mode,
  releases,
  currentVersion,
  loading = false,
  error = '',
  onRetry,
  onClose
}: {
  mode: 'whats-new' | 'history';
  releases: AppRelease[];
  currentVersion: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onClose: () => void;
}): JSX.Element {
  const whatsNew = mode === 'whats-new';
  const modalRef = useModalFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop release-history-backdrop" role="presentation">
      <section
        ref={modalRef}
        tabIndex={-1}
        className={`app-modal release-history-modal ${whatsNew ? 'whats-new' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-history-title"
      >
        <header className="modal-header release-history-header">
          <div className="release-history-heading">
            {whatsNew ? <Sparkles size={25} /> : <History size={25} />}
            <div>
              <p className="eyebrow">{whatsNew ? `Установлена версия ${currentVersion}` : 'DnD 2024 Battle Tracker'}</p>
              <h2 id="release-history-title">{whatsNew ? 'Что нового' : 'История версий'}</h2>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть историю версий" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="release-history-content">
          {loading && (
            <div className="release-history-state" role="status">
              <RefreshCw className="spin" size={24} />
              <strong>Загружаем изменения из GitHub...</strong>
            </div>
          )}

          {!loading && error && (
            <div className="notice error release-history-error">
              <div>
                <strong>Не удалось загрузить историю версий</strong>
                <span>{error}</span>
              </div>
              {onRetry && (
                <button className="button secondary" type="button" onClick={onRetry}>
                  <RefreshCw size={17} />
                  Повторить
                </button>
              )}
            </div>
          )}

          {!loading && !error && releases.length === 0 && (
            <div className="release-history-state">
              <History size={24} />
              <strong>Опубликованных версий пока нет</strong>
            </div>
          )}

          {!loading && releases.length > 0 && (
            <div className="release-list">
              {releases.map((release) => (
                <article className="release-card" key={release.tagName}>
                  <header className="release-card-header">
                    <div>
                      <div className="release-version-line">
                        <strong>v{release.version}</strong>
                        {release.version === currentVersion && <span className="release-current-badge">Текущая</span>}
                        {release.prerelease && <span className="release-prerelease-badge">Предварительная</span>}
                      </div>
                      <h3>{release.name}</h3>
                    </div>
                    {release.publishedAt && <time dateTime={release.publishedAt}>{formatReleaseDate(release.publishedAt)}</time>}
                  </header>
                  <ReleaseNotes notes={release.notes} />
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="release-history-footer">
          <button className="button primary" type="button" onClick={onClose}>
            {whatsNew ? 'Понятно' : 'Закрыть'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ReleaseNotes({ notes }: { notes: string }): JSX.Element {
  const blocks = notes
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="release-notes">
      {blocks.map((line, index) => {
        if (/^#{1,6}\s+/.test(line)) {
          return <h4 key={`${index}-${line}`}>{cleanMarkdown(line.replace(/^#{1,6}\s+/, ''))}</h4>;
        }
        if (/^[-*]\s+/.test(line)) {
          return (
            <div className="release-note-item" key={`${index}-${line}`}>
              <span aria-hidden="true" />
              <p>{cleanMarkdown(line.replace(/^[-*]\s+/, ''))}</p>
            </div>
          );
        }
        return <p key={`${index}-${line}`}>{cleanMarkdown(line)}</p>;
      })}
    </div>
  );
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .trim();
}

function formatReleaseDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed);
}

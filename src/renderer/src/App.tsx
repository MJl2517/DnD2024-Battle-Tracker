import { Swords } from 'lucide-react';
import { MasterApp, PlayerDisplay } from './features/application/TrackerApplication';

/** Выбирает мастерский или публичный интерфейс по hash текущего Electron-окна. */
export function App(): JSX.Element {
  if (!window.dndTracker) return <MissingElectronApi />;
  return window.location.hash.startsWith('#/player') ? <PlayerDisplay /> : <MasterApp />;
}

function MissingElectronApi(): JSX.Element {
  return (
    <main className="startup-error">
      <section>
        <Swords size={46} />
        <h1>Приложение открыто без desktop-оболочки</h1>
        <p>
          База данных, импорт NPC и экран игроков работают через Electron API. Запустите приложение командой <code>npm.cmd run dev</code> из папки проекта, а не
          открывайте адрес Vite напрямую в браузере.
        </p>
      </section>
    </main>
  );
}

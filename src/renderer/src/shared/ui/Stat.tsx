import { Edit3 } from 'lucide-react';

export function Stat({ icon, label, value, onClick }: { icon: JSX.Element; label: string; value: string | number; onClick?: () => void }): JSX.Element {
  const content = (
    <>
      {icon}
      {label} {value}
    </>
  );

  if (onClick) {
    return (
      <button className="stat-pill stat-pill-button" type="button" onClick={onClick} title={`Нажмите, чтобы настроить ${label}`}>
        {content}
        <Edit3 size={13} />
      </button>
    );
  }

  return <span className="stat-pill">{content}</span>;
}

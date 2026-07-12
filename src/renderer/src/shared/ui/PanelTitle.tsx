import { Dices } from 'lucide-react';

export function PanelTitle({ icon, title }: { icon: JSX.Element; title: string }): JSX.Element {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

export function InlineEmpty({ title }: { title: string }): JSX.Element {
  return (
    <div className="inline-empty">
      <Dices size={36} />
      <h2>{title}</h2>
    </div>
  );
}

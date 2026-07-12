import { useRef } from 'react';
import { UploadCloud } from 'lucide-react';

export function ImageUrlInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadLocalImage(file: File | undefined): Promise<void> {
    if (!file) return;
    onChange(await readFileAsDataUrl(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="local-image-field">
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => void loadLocalImage(event.target.files?.[0])} />
      <button className="button secondary" type="button" onClick={() => fileInputRef.current?.click()}>
        <UploadCloud size={18} />
        Загрузить
      </button>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Не удалось прочитать файл изображения.')));
    reader.readAsDataURL(file);
  });
}

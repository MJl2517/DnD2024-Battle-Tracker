import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * Стилизованный select с портальным меню.
 * Портал не даёт карточкам и overflow-контейнерам перекрыть список возле нижней границы окна.
 */
export function CustomSelect({
  value,
  onChange,
  onSelect,
  selectedValues,
  options,
  placeholder,
  ariaLabel,
  disabled = false
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  selectedValues?: string[];
  options: SelectOption[];
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = options.find((option) => option.value === value);

  function updateMenuPosition(): void {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const gap = 6;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, Math.min(340, (openUp ? spaceAbove : spaceBelow) - gap));

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      right: 'auto',
      top: openUp ? 'auto' : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : 'auto',
      width: rect.width,
      maxHeight,
      zIndex: 1001
    });
  }

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    function closeOnOutsidePointer(event: globalThis.PointerEvent): void {
      if (!(event.target instanceof Node)) return;
      const inTrigger = rootRef.current?.contains(event.target) ?? false;
      const inMenu = menuRef.current?.contains(event.target) ?? false;
      if (!inTrigger && !inMenu) {
        setOpen(false);
      }
    }
    function handleViewportChange(): void {
      updateMenuPosition();
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open]);

  function choose(nextValue: string): void {
    if (onSelect) onSelect(nextValue);
    else onChange(nextValue);
    setOpen(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  return (
    <div className={`custom-select ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        className="custom-select-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        {selected ? <CustomSelectOption option={selected} /> : <span className="custom-select-placeholder">{placeholder}</span>}
        <ChevronDown size={18} />
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} className="custom-select-menu" style={menuStyle} role="listbox" aria-label={ariaLabel}>
            {options.length ? (
              options.map((option) => (
                <button
                  className={`custom-select-option ${(selectedValues ?? [value]).includes(option.value) ? 'selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={(selectedValues ?? [value]).includes(option.value)}
                  aria-disabled={option.disabled}
                  disabled={option.disabled}
                  title={option.disabledReason}
                  key={option.value}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    choose(option.value);
                  }}
                  onClick={() => choose(option.value)}
                >
                  <CustomSelectOption option={option} />
                </button>
              ))
            ) : (
              <div className="custom-select-empty">Нет вариантов</div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

/** Поисковая версия select: фильтрует варианты и закрывает меню сразу после выбора. */
export function SearchableSelect({
  value,
  search,
  onSearchChange,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  ariaLabel,
  disabled = false
}: {
  value: string;
  search: string;
  onSearchChange: (value: string) => void;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  ariaLabel: string;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const filteredOptions = normalizedSearch
    ? options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('ru').includes(normalizedSearch))
    : options;

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsidePointer(event: globalThis.PointerEvent): void {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  function choose(option: SelectOption): void {
    onChange(option.value);
    onSearchChange(option.label);
    setOpen(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  return (
    <div className={`custom-select searchable-select ${open ? 'open' : ''}`} ref={rootRef}>
      <div className="searchable-select-control">
        <input
          value={search}
          placeholder={selected ? placeholder : searchPlaceholder}
          aria-label={ariaLabel}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onSearchChange(event.target.value);
            if (value) onChange('');
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && filteredOptions[0]) {
              event.preventDefault();
              choose(filteredOptions[0]);
            }
          }}
        />
        <button
          className="searchable-select-toggle"
          type="button"
          aria-label="Открыть список NPC"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown size={18} />
        </button>
      </div>
      {open && (
        <div className="custom-select-menu searchable-select-menu" role="listbox" aria-label={ariaLabel}>
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onClick={() => choose(option)}
              >
                <CustomSelectOption option={option} />
              </button>
            ))
          ) : (
            <div className="custom-select-empty">NPC не найден</div>
          )}
        </div>
      )}
    </div>
  );
}

function CustomSelectOption({ option }: { option: SelectOption }): JSX.Element {
  return (
    <span className="custom-select-option-content">
      {option.icon && <img src={option.icon} alt="" />}
      <span>
        <strong>{option.label}</strong>
        {(option.disabledReason || option.description) && <small>{option.disabledReason || option.description}</small>}
      </span>
    </span>
  );
}

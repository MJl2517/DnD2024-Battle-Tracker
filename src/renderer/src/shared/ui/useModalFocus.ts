import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Удерживает клавиатурный фокус внутри верхнего модального окна.
 * После закрытия возвращает фокус на кнопку, которая открыла окно.
 */
export function useModalFocus<T extends HTMLElement>(onClose?: () => void, closeOnEscape = true): RefObject<T> {
  const modalRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return undefined;
    const modalElement = modal;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = Array.from(modalElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    (focusable[0] ?? modalElement).focus();

    function isTopModal(): boolean {
      const modals = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
      return modals.at(-1) === modalElement;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (!isTopModal()) return;

      if (event.key === 'Escape' && closeOnEscape && closeRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const available = Array.from(modalElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
      );
      if (!available.length) {
        event.preventDefault();
        modalElement.focus();
        return;
      }

      const first = available[0];
      const last = available[available.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [closeOnEscape]);

  return modalRef;
}

export type PopoverAnchor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function getSpellHref(target: EventTarget | null): string | null {
  return getSpellLink(target)?.getAttribute('href') ?? null;
}

export function getSpellLink(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest<HTMLAnchorElement>('a[href*="/spells/"]') : null;
}

export function anchorFromElement(element: Element): PopoverAnchor {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
}

/**
 * Размещает подсказку рядом с исходным элементом и переворачивает её вверх при нехватке места снизу.
 * Координаты дополнительно ограничиваются viewport, поэтому длинная карточка не улетает за экран.
 */
export function positionAnchoredPopover(anchor: PopoverAnchor, width: number, maxHeight: number, margin: number, gap: number): { left: number; top: number } {
  const viewportRight = window.innerWidth - margin;
  const viewportBottom = window.innerHeight - margin;
  const preferredLeft = anchor.left;
  const fallbackLeft = anchor.right - width;
  const left = Math.min(Math.max(margin, preferredLeft + width > viewportRight ? fallbackLeft : preferredLeft), Math.max(margin, viewportRight - width));
  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - maxHeight - gap;
  const hasRoomBelow = belowTop + maxHeight <= viewportBottom;
  const hasRoomAbove = aboveTop >= margin;
  const preferredTop = hasRoomBelow || !hasRoomAbove ? belowTop : aboveTop;
  return { left, top: Math.min(Math.max(margin, preferredTop), Math.max(margin, viewportBottom - maxHeight)) };
}

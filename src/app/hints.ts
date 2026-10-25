const MAX_WIDTH_PX = 220; // the popup wraps here; shorter texts stay narrower
const SHOW_DELAY_MS = 350;
const EDGE_PX = 8; // minimum distance from the window edge
const GAP_PX = 6; // distance from the element

/**
 * Replaces native `title` tooltips with a narrow, wrapped popup: browsers stretch native tooltips to the
 * full width of the text. Works by delegation, so elements created later are covered too. The `title`
 * attribute stays in the markup (and works without scripts) until the pointer first reaches the element.
 * Not shown for touch, where there is no hover.
 */
export function installHints(): void {
  const popup = document.createElement('div');
  popup.id = 'hint';
  popup.setAttribute('role', 'tooltip');
  popup.style.maxWidth = `${MAX_WIDTH_PX}px`;
  document.body.appendChild(popup);

  let current: HTMLElement | null = null;
  let timer = 0;

  const hide = () => {
    window.clearTimeout(timer);
    current = null;
    popup.style.display = 'none';
  };

  const show = (el: HTMLElement) => {
    popup.textContent = el.dataset.tip ?? '';
    popup.style.display = 'block';
    const r = el.getBoundingClientRect();
    const w = popup.offsetWidth;
    const h = popup.offsetHeight;
    const x = Math.max(EDGE_PX, Math.min(r.left, window.innerWidth - w - EDGE_PX));
    const below = r.bottom + GAP_PX;
    const y = below + h > window.innerHeight - EDGE_PX ? Math.max(EDGE_PX, r.top - h - GAP_PX) : below;
    popup.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  /** The nearest element with a tooltip; a native `title` is moved to `data-tip` so the browser does not draw its own. */
  const tipped = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>('[title], [data-tip]');
    if (el && el.hasAttribute('title')) {
      el.dataset.tip = el.title;
      el.removeAttribute('title');
    }
    return el;
  };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = tipped(e.target);
    if (el === current) return;
    hide();
    if (!el) return;
    current = el;
    timer = window.setTimeout(() => show(el), SHOW_DELAY_MS);
  });
  document.addEventListener('focusin', (e) => {
    const el = tipped(e.target);
    hide();
    if (el) {
      current = el;
      show(el);
    }
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide);
  document.addEventListener('keydown', hide);
  document.addEventListener('scroll', hide, true);
  document.documentElement.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
}

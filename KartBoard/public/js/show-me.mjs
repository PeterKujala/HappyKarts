import { helpTopic } from './help-topics.mjs';

const STORAGE_KEY = 'kartboard-show-me';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** @param {string} [method] */
export function isMutationRequest(method) {
  return MUTATING.has(String(method || 'GET').toUpperCase());
}

/**
 * While Show me is on, writes never reach the network.
 * @param {() => boolean} isShowMe
 * @param {typeof fetch} [baseFetch]
 */
export function createGuardedFetch(isShowMe, baseFetch = globalThis.fetch.bind(globalThis)) {
  return (input, init = {}) => {
    const method = init && init.method ? init.method : 'GET';
    if (isShowMe() && isMutationRequest(method)) {
      return Promise.resolve(new Response(JSON.stringify({
        error: { code: 'SHOW_ME', message: 'Show me mode does not change KartBoard.' }
      }), { status: 403, headers: { 'content-type': 'application/json' } }));
    }
    return baseFetch(input, init);
  };
}

/**
 * Keeps Tab inside the open explanation.
 * @param {KeyboardEvent} event
 * @param {ParentNode} container
 */
export function trapTab(event, container) {
  if (event.key !== 'Tab') return false;
  const focusable = [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(element => !('disabled' in element && element.disabled) && element.getAttribute('hidden') === null);
  if (!focusable.length) return false;
  const first = /** @type {HTMLElement} */ (focusable[0]);
  const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
  const active = /** @type {Document} */ (container.ownerDocument).activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/** @param {Document} [doc] */
export function createShowMe(doc = document) {
  let active = false;
  let lastFocus = null;
  /** @type {(active: boolean) => void} */
  let onToggle = () => {};
  const dialog = /** @type {HTMLDialogElement | null} */ (doc.getElementById('showMeDialog'));
  const title = doc.getElementById('showMeTitle');
  const happens = doc.getElementById('showMeHappens');
  const when = doc.getElementById('showMeWhen');
  const caveat = doc.getElementById('showMeCaveat');
  const closeButton = /** @type {HTMLButtonElement | null} */ (doc.getElementById('showMeClose'));
  const toggle = doc.getElementById('showMeToggle');
  const banner = doc.getElementById('showMeBanner');

  function persist() {
    try { doc.defaultView?.localStorage?.setItem(STORAGE_KEY, active ? '1' : '0'); }
    catch { /* private mode */ }
  }

  function apply() {
    doc.body.classList.toggle('show-me', active);
    if (banner) banner.hidden = !active;
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(active));
      toggle.classList.toggle('lime', active);
    }
  }

  function explain(key) {
    const topic = helpTopic(key) || helpTopic('unknown');
    if (!dialog || !topic || !title || !happens || !when || !caveat) return;
    title.textContent = topic.title;
    happens.textContent = topic.happens;
    when.textContent = topic.when;
    caveat.textContent = topic.caveat;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    closeButton?.focus();
  }

  function blockControl(event) {
    if (!active) return;
    if (event.target instanceof Element && event.target.closest('#showMeDialog, #showMeToggle')) return;
    const control = event.target instanceof Element ? event.target.closest('[data-help]') : null;
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== 'click') explain(control.dataset.help || '');
  }

  doc.addEventListener('pointerdown', blockControl, true);
  doc.addEventListener('click', blockControl, true);
  doc.addEventListener('submit', event => {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const form = event.target instanceof HTMLElement ? event.target : null;
    const keyed = /** @type {HTMLElement | null} */ (form?.querySelector('[data-help]') || null);
    const key = form?.dataset?.help || keyed?.dataset.help || 'access-code';
    explain(key);
  }, true);
  dialog?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
      return;
    }
    trapTab(event, dialog);
  });
  dialog?.addEventListener('close', () => lastFocus?.focus?.());
  closeButton?.addEventListener('click', () => dialog.close());
  toggle?.addEventListener('click', () => {
    active = !active;
    persist();
    apply();
    onToggle(active);
  });
  doc.addEventListener('pointerdown', event => {
    if (!active || !(event.target instanceof Element)) return;
    if (event.target.closest('#showMeDialog, #showMeToggle')) return;
    if (event.target.closest('[data-help]')) lastFocus = /** @type {HTMLElement} */ (event.target.closest('[data-help]'));
  }, true);

  return {
    get active() { return active; },
    restore() {
      try { active = doc.defaultView?.localStorage?.getItem(STORAGE_KEY) === '1'; }
      catch { active = false; }
      apply();
      return active;
    },
    explain,
    set onToggle(fn) { onToggle = typeof fn === 'function' ? fn : () => {}; }
  };
}

import { $ } from './dom.js';

let timer;

/**
 * @param {string} message
 * @param {{ undo?: () => void, action?: () => void, actionLabel?: string }} [options]
 */
export function showToast(message, options = {}) {
  const { undo, action, actionLabel } = options;
  const toast = $('#toast');
  toast.replaceChildren();
  const label = document.createElement('span');
  label.textContent = message;
  toast.append(label);
  const run = action || undo;
  if (run) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = actionLabel || 'Undo';
    button.addEventListener('click', () => { run(); hideToast(); });
    toast.append(button);
  }
  toast.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(hideToast, run ? 5000 : 2200);
}

function hideToast() { $('#toast')?.classList.remove('show'); }

import { $ } from './dom.js';

let timer;

export function showToast(message, { undo } = {}) {
  const toast = $('#toast');
  toast.replaceChildren();
  const label = document.createElement('span');
  label.textContent = message;
  toast.append(label);
  if (undo) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'toast-action';
    action.textContent = 'Undo';
    action.addEventListener('click', () => { undo(); hideToast(); });
    toast.append(action);
  }
  toast.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(hideToast, undo ? 3200 : 2200);
}

function hideToast() { $('#toast')?.classList.remove('show'); }

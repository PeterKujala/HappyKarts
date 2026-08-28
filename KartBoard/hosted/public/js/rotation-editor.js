import { $$, button } from './dom.js';
import { copyRotation, duplicateClassItem } from './selectors.js';

export function renderRotationEditor({ container, items, onChange, onEdit, allowDuplicate = true, showMoveButtons = false, onMinimumReached }) {
  container.replaceChildren(...items.map((item, index) => createTile(item, index)));
  $$('.setup-class', container).forEach(tile => bindPointerReorder(tile, container, items, onChange));

  function createTile(item, index) {
    const tile = document.createElement('div');
    tile.className = 'setup-class';
    tile.dataset.itemId = item.id;
    tile.setAttribute('aria-label', `${item.name} — drag to reorder`);

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';
    const name = document.createElement('div');
    name.className = 'setup-class-name';
    name.textContent = item.name;
    tile.append(handle, name);

    if (showMoveButtons) {
      const moves = document.createElement('div');
      moves.className = 'move-tools';
      const up = button({ text: '↑', className: 'tool-button', label: `Move ${item.name} up` });
      const down = button({ text: '↓', className: 'tool-button', label: `Move ${item.name} down` });
      up.disabled = index === 0;
      down.disabled = index === items.length - 1;
      up.addEventListener('click', () => onChange(move(items, index, index - 1)));
      down.addEventListener('click', () => onChange(move(items, index, index + 1)));
      moves.append(up, down);
      tile.append(moves);
    }

    const tools = document.createElement('div');
    tools.className = 'class-tools';
    if (onEdit) {
      const edit = button({ text: '✎', className: 'tool-button edit-class', label: `Rename ${item.name}`, title: 'Rename' });
      edit.addEventListener('click', () => onEdit(item));
      tools.append(edit);
    }
    if (allowDuplicate) {
      const duplicate = button({ text: '⧉', className: 'tool-button duplicate', label: `Duplicate ${item.name}`, title: 'Duplicate' });
      duplicate.addEventListener('click', () => {
        const next = copyRotation(items);
        next.splice(index + 1, 0, duplicateClassItem(item));
        onChange(next);
      });
      tools.append(duplicate);
    }
    const remove = button({ text: '×', className: 'tool-button remove', label: `Remove ${item.name}`, title: 'Remove' });
    remove.addEventListener('click', () => {
      if (items.length === 1) return onMinimumReached?.();
      onChange(items.filter(candidate => candidate.id !== item.id));
    });
    tools.append(remove);
    tile.append(tools);
    return tile;
  }
}

function bindPointerReorder(tile, container, items, onChange) {
  tile.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    const rect = tile.getBoundingClientRect();
    const ghost = tile.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.append(ghost);
    tile.classList.add('drag-placeholder');
    container.classList.add('drag-active');
    const startX = event.clientX;
    const startY = event.clientY;
    const siblings = $$('.setup-class', container);
    const horizontalLayout = siblings.length > 1 && Math.abs(siblings[0].getBoundingClientRect().top - siblings[1].getBoundingClientRect().top) < 4;
    const listeners = new AbortController();
    let finished = false;

    const move = pointer => {
      ghost.style.transform = `translate3d(${pointer.clientX - startX}px, ${pointer.clientY - startY}px, 0) scale(1.02)`;
      const target = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest('.setup-class:not(.drag-ghost)');
      if (!target || target === tile || target.parentElement !== container) return;
      const targetRect = target.getBoundingClientRect();
      const placeAfter = horizontalLayout
        ? pointer.clientX > targetRect.left + targetRect.width / 2
        : pointer.clientY > targetRect.top + targetRect.height / 2;
      container.insertBefore(tile, placeAfter ? target.nextSibling : target);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      listeners.abort();
      ghost.remove();
      tile.classList.remove('drag-placeholder');
      container.classList.remove('drag-active');
      const byId = new Map(items.map(item => [item.id, item]));
      const reordered = $$('.setup-class', container).map(element => byId.get(element.dataset.itemId)).filter(Boolean);
      onChange(copyRotation(reordered));
    };

    window.addEventListener('pointermove', move, { signal: listeners.signal });
    window.addEventListener('pointerup', finish, { signal: listeners.signal, once: true });
    window.addEventListener('pointercancel', finish, { signal: listeners.signal, once: true });
    window.addEventListener('blur', finish, { signal: listeners.signal, once: true });
  });
}

function move(items, from, to) {
  if (to < 0 || to >= items.length || from === to) return copyRotation(items);
  const next = copyRotation(items);
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

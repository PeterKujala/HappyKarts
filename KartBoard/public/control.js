import { KartBoardApi } from './js/api.js';
import { $, $$, button, setText } from './js/dom.js';
import { copyRotation, createClassItem, formatClock, remainingMs, rotationItems, scheduleNames, statusCopy } from './js/selectors.js';
import { renderRotationEditor } from './js/rotation-editor.js';
import { showToast } from './js/toast.js';

const api = new KartBoardApi();
const COMMON_CLASSES = Object.freeze(['Cadet P', 'Cadet', 'Junior P', 'Junior', 'Senior Restricted', 'Senior Open', '4SS', 'TaG 125']);
let state;
let liveDraft = [];
let liveEditing = false;
let liveBaseRevision = 0;
let setupDraft = [];
let setupBaseRevision = 0;
let editingSetupId = null;

initialize();

async function initialize() {
  try {
    await api.verifyCompatibility();
    render(await api.getState());
    api.subscribe({ onState: render, onConnectionChange: connected => document.body.classList.toggle('disconnected', !connected) });
  } catch (error) {
    showToast(error.message);
    document.body.classList.add('disconnected');
  }
}

function render(nextState) {
  state = nextState;
  const schedule = scheduleNames(state);
  const copy = statusCopy(state);
  setText('#venue', state.venue); setText('#dayLabel', state.dayLabel);
  setText('#current', schedule.current); setText('#next', schedule.next); setText('#then', schedule.then); setText('#status', copy[0]);
  if (document.activeElement !== $('#noticeInput')) $('#noticeInput').value = state.notice;
  const labels = { ready: 'Start first session', running: 'Start next session', paused: 'Resume session', changeover: 'Start next session', break: 'Resume with current class', finished: 'Start a new day' };
  setText('#mainActionLabel', labels[state.status] || 'Start next session');
  $('#pause').textContent = state.status === 'paused' ? 'Resume' : 'Pause';
  $('#pause').disabled = !['running', 'paused'].includes(state.status);
  $('[data-action="addMinute"]').disabled = !['running', 'paused'].includes(state.status);
  $('#edit').disabled = !['ready', 'finished'].includes(state.status);
  if (!liveEditing) renderLockedRotation();
  tick();
}

function tick() { if (state) setText('#timer', formatClock(remainingMs(state))); }
setInterval(tick, 250);

async function dispatch(action, payload, { expectedRevision, successMessage = 'Updated' } = {}) {
  try {
    const next = await api.dispatch(action, payload, { expectedRevision });
    render(next);
    if (successMessage) showToast(successMessage);
    return true;
  } catch (error) {
    showToast(error.code === 'REVISION_CONFLICT' ? 'Another controller changed KartBoard. Cancel and reopen editing.' : error.message);
    return false;
  }
}

function renderLockedRotation() {
  const container = $('#rotation');
  container.classList.remove('editing');
  container.replaceChildren(...rotationItems(state).map((item, index) => {
    const tile = document.createElement('div');
    tile.className = `rotation-item ${item.id === state.currentClass?.id ? 'current' : ''}`;
    tile.dataset.itemId = item.id;
    const number = document.createElement('span'); number.className = 'rotation-number'; number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span'); name.textContent = item.name;
    const edit = button({ text: '⠿', className: 'rotation-edit-trigger', label: 'Change running order', title: 'Change running order' });
    edit.addEventListener('click', event => { event.stopPropagation(); enterLiveEdit(); });
    tile.append(number, name, edit);
    bindLongPress(tile);
    return tile;
  }));
}

function bindLongPress(tile) {
  let timer;
  let startX = 0;
  let startY = 0;
  const cancel = () => { clearTimeout(timer); tile.classList.remove('press-held'); };
  tile.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    startX = event.clientX; startY = event.clientY; tile.classList.add('press-held');
    timer = setTimeout(() => { cancel(); navigator.vibrate?.(35); enterLiveEdit(); }, 600);
  });
  tile.addEventListener('pointermove', event => { if (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => tile.addEventListener(type, cancel));
  tile.addEventListener('contextmenu', event => event.preventDefault());
}

function enterLiveEdit() {
  if (liveEditing) return;
  liveEditing = true; liveBaseRevision = state.revision; liveDraft = copyRotation(rotationItems(state));
  $('#rotationCard').classList.add('edit-mode'); $('#editHint').hidden = true; $('#cancelRotation').hidden = false;
  $('#saveRotation').hidden = false; $('#inlineAdd').hidden = false; $('#rotationHelp').hidden = false;
  renderLiveEditor();
}

function renderLiveEditor() {
  $('#rotation').classList.add('editing');
  renderRotationEditor({
    container: $('#rotation'), items: liveDraft,
    onChange: items => { liveDraft = items; renderLiveEditor(); },
    onMinimumReached: () => showToast('At least one class is required.')
  });
  renderClassChoices($('#inlineClassChips'), liveDraft, item => { liveDraft.push(item); renderLiveEditor(); });
}

function closeLiveEdit() {
  liveEditing = false; $('#rotationCard').classList.remove('edit-mode'); $('#editHint').hidden = false;
  $('#cancelRotation').hidden = true; $('#saveRotation').hidden = true; $('#inlineAdd').hidden = true; $('#rotationHelp').hidden = true;
  renderLockedRotation();
}

$('#cancelRotation').addEventListener('click', closeLiveEdit);
$('#saveRotation').addEventListener('click', async () => {
  const saved = await dispatch('updateRotation', { rotation: liveDraft }, { expectedRevision: liveBaseRevision, successMessage: '' });
  if (saved) { closeLiveEdit(); showToast('Running order updated'); }
});

function addLiveCustom() {
  const input = $('#inlineCustomClass');
  const name = input.value.trim();
  if (!name) return;
  liveDraft.push(createClassItem(name)); input.value = ''; renderLiveEditor();
}
$('#inlineAddCustom').addEventListener('click', addLiveCustom);
$('#inlineCustomClass').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addLiveCustom(); } });

function openDaySetup() {
  setupDraft = copyRotation(rotationItems(state)); setupBaseRevision = state.revision;
  $('#setupVenue').value = state.venue; $('#setupDay').value = state.dayLabel; $('#setupMinutes').value = state.sessionMinutes;
  renderDaySetup(); $('#setup').showModal();
}

function renderDaySetup() {
  setText('#classCount', `${setupDraft.length} ${setupDraft.length === 1 ? 'class' : 'classes'}`);
  renderRotationEditor({
    container: $('#setupRotation'), items: setupDraft, showMoveButtons: true,
    onChange: items => { setupDraft = items; renderDaySetup(); },
    onEdit: item => openClassEditor(item.id),
    onMinimumReached: () => showToast('At least one class is required.')
  });
  renderClassChoices($('#classChips'), setupDraft, item => { setupDraft.push(item); renderDaySetup(); });
  setText('#previewCurrent', setupDraft[0]?.name || 'No classes yet'); setText('#previewNext', setupDraft[1]?.name || '—');
}

function renderClassChoices(container, activeItems, onAdd) {
  const activeNames = new Set(activeItems.map(item => item.name.toLocaleLowerCase()));
  const available = COMMON_CLASSES.filter(name => !activeNames.has(name.toLocaleLowerCase()));
  if (!available.length) {
    const message = document.createElement('span'); message.className = 'all-added'; message.textContent = 'All standard classes are already included';
    container.replaceChildren(message); return;
  }
  container.replaceChildren(...available.map(name => {
    const add = button({ text: `+ ${name}`, className: 'class-chip' });
    add.addEventListener('click', () => onAdd(createClassItem(name)));
    return add;
  }));
}

function addSetupCustom() {
  const input = $('#customClass'); const name = input.value.trim();
  if (!name) return;
  setupDraft.push(createClassItem(name)); input.value = ''; renderDaySetup();
}

function openClassEditor(id) {
  editingSetupId = id;
  $('#editClassName').value = setupDraft.find(item => item.id === id)?.name || '';
  $('#editClass').showModal(); requestAnimationFrame(() => $('#editClassName').select());
}

$('#edit').addEventListener('click', openDaySetup);
$('#closeSetup').addEventListener('click', () => $('#setup').close());
$('#cancelSetup').addEventListener('click', () => $('#setup').close());
$('#addCustom').addEventListener('click', addSetupCustom);
$('#customClass').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addSetupCustom(); } });
$('#closeEditClass').addEventListener('click', () => $('#editClass').close());
$('#cancelEditClass').addEventListener('click', () => $('#editClass').close());
$('#editClassForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#editClassName').value.trim();
  if (!name) return;
  setupDraft = setupDraft.map(item => item.id === editingSetupId ? { ...item, name } : item);
  renderDaySetup(); $('#editClass').close();
});
$('#setupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const saved = await dispatch('configure', { venue: $('#setupVenue').value, dayLabel: $('#setupDay').value, sessionMinutes: Number($('#setupMinutes').value), rotation: setupDraft }, { expectedRevision: setupBaseRevision, successMessage: '' });
  if (saved) { $('#setup').close(); showToast('Practice day configured'); }
});

$('#mainAction').addEventListener('click', () => {
  if (['ready', 'finished'].includes(state.status)) return dispatch('start');
  if (['paused', 'break'].includes(state.status)) return dispatch('resume');
  return dispatch('next');
});
$('#pause').addEventListener('click', () => dispatch(state.status === 'paused' ? 'resume' : 'pause'));
$$('[data-action]').forEach(control => control.addEventListener('click', () => dispatch(control.dataset.action)));
$('#openBoard').addEventListener('click', () => window.open('/board.html', 'kartboard_public', 'popup,width=1280,height=780'));
$('#noticeForm').addEventListener('submit', event => { event.preventDefault(); dispatch('notice', { notice: $('#noticeInput').value }); });

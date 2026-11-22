const TOKEN_KEY = 'kartboard-admin-token';
const headers = () => {
  const token = sessionStorage.getItem(TOKEN_KEY) || '';
  /** @type {Record<string, string>} */
  const result = { 'Content-Type': 'application/json', 'X-KartBoard-Request': '1' };
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
};

const errorBox = /** @type {HTMLElement} */ (document.querySelector('#adminError'));
const reveal = /** @type {HTMLElement} */ (document.querySelector('#reveal'));
const revealCode = /** @type {HTMLInputElement} */ (document.querySelector('#revealCode'));
const revealLabel = /** @type {HTMLElement} */ (document.querySelector('#revealLabel'));
const copyState = /** @type {HTMLElement} */ (document.querySelector('#copyState'));
const list = /** @type {HTMLElement} */ (document.querySelector('#codeList'));
const adminToken = /** @type {HTMLInputElement} */ (document.querySelector('#adminToken'));
const codeName = /** @type {HTMLInputElement} */ (document.querySelector('#codeName'));

adminToken.value = sessionStorage.getItem(TOKEN_KEY) || '';
document.querySelector('#saveToken').addEventListener('click', () => {
  sessionStorage.setItem(TOKEN_KEY, adminToken.value.trim());
  load();
});
document.querySelector('#createForm').addEventListener('submit', async event => {
  event.preventDefault();
  const name = codeName.value.trim();
  const created = await send('api/admin/codes', { method: 'POST', body: JSON.stringify({ name }) });
  if (!created) return;
  codeName.value = '';
  showCode(created.name, created.code, 'New code');
  await load();
});
document.querySelector('#copyCode').addEventListener('click', async () => {
  const value = revealCode.value;
  try {
    await navigator.clipboard.writeText(value);
    copyState.textContent = 'Copied.';
  } catch {
    revealCode.focus();
    revealCode.select();
    copyState.textContent = 'Select the code and copy it.';
  }
});
document.querySelector('#hideCode').addEventListener('click', () => {
  reveal.hidden = true;
  revealCode.value = '';
  copyState.textContent = '';
});

load();

async function load() {
  errorBox.textContent = '';
  const body = await send('api/admin/codes');
  if (!body) return;
  if (!body.codes.length) {
    list.textContent = 'No access codes yet.';
    return;
  }
  const table = document.createElement('table');
  table.className = 'code-table';
  table.innerHTML = '<thead><tr><th>Name</th><th>Code</th><th>Created</th><th>Last used</th><th></th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const code of body.codes) {
    const row = document.createElement('tr');
    row.append(cell(code.name), codeCell(code.code), cell(when(code.createdAt)), cell(when(code.lastUsedAt)));
    const actions = document.createElement('td');
    actions.className = 'code-actions';
    if (code.source === 'managed') {
      actions.append(actionButton('New code', () => regenerate(code.name)), actionButton('Revoke', () => revoke(code.name)));
    } else {
      const note = document.createElement('span');
      note.className = 'seed-note';
      note.textContent = 'From the KARTBOARD_USERS secret. Generate a code with this name to replace it.';
      actions.append(note);
    }
    row.append(actions);
    tbody.append(row);
  }
  table.append(tbody);
  list.replaceChildren(table);
}

async function regenerate(name) {
  const created = await send('api/admin/codes/regenerate', { method: 'POST', body: JSON.stringify({ name }) });
  if (!created) return;
  showCode(created.name, created.code, 'Replacement code');
  await load();
}

async function revoke(name) {
  if (!confirm(`Revoke the code for ${name}? Devices using it will need a new code.`)) return;
  const removed = await send('api/admin/codes/revoke', { method: 'POST', body: JSON.stringify({ name }) });
  if (!removed) return;
  await load();
}

function showCode(name, code, label) {
  reveal.hidden = false;
  revealLabel.textContent = `${label} for ${name}. It stays in the list below.`;
  revealCode.value = code;
  copyState.textContent = '';
  revealCode.focus();
  revealCode.select();
}

async function send(path, options = {}) {
  let response;
  try {
    response = await fetch(new URL(path, window.location.href), {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: headers()
    });
  } catch {
    errorBox.textContent = 'Cannot reach KartBoard.';
    return null;
  }
  let body = null;
  try { body = await response.json(); }
  catch { body = null; }
  if (!response.ok) {
    errorBox.textContent = body?.error?.message || 'KartBoard could not complete that.';
    return null;
  }
  errorBox.textContent = '';
  return body;
}

function cell(text) {
  const item = document.createElement('td');
  item.textContent = text;
  return item;
}

function codeCell(code) {
  const item = document.createElement('td');
  if (!code) {
    item.className = 'seed-note';
    item.textContent = 'Hidden — regenerate to view';
    return item;
  }
  const row = document.createElement('div');
  row.className = 'code-row';
  const input = document.createElement('input');
  input.className = 'reveal-code';
  input.readOnly = true;
  input.type = 'text';
  input.value = code;
  input.setAttribute('aria-label', 'Access code');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'button';
  toggle.textContent = 'Hide';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    const hide = input.type === 'text';
    input.type = hide ? 'password' : 'text';
    toggle.textContent = hide ? 'Show' : 'Hide';
    toggle.setAttribute('aria-pressed', String(hide));
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'button';
  copy.textContent = 'Copy';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = 'Copied';
    } catch {
      input.type = 'text';
      input.focus();
      input.select();
      copy.textContent = 'Select';
    }
  });
  row.append(input, toggle, copy);
  item.append(row);
  return item;
}

function actionButton(text, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function when(value) {
  if (typeof value !== 'number' || !value) return '—';
  return new Date(value).toLocaleString();
}

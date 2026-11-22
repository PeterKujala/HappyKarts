export function createCodeGate(root, { onSubmit }) {
  const input = /** @type {HTMLInputElement} */ (root.querySelector('#accessCode'));
  const error = /** @type {HTMLElement} */ (root.querySelector('#pinError'));
  const form = /** @type {HTMLFormElement} */ (root.querySelector('#pinForm'));

  input.addEventListener('input', () => {
    const cleaned = input.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
    if (cleaned !== input.value) input.value = cleaned;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';
    const code = input.value.trim().toLowerCase();
    if (!/^[a-z0-9]{4,32}$/.test(code)) {
      error.textContent = 'Enter the access code you were given.';
      input.focus();
      return;
    }
    const failed = await onSubmit(code);
    if (failed) {
      input.value = '';
      error.textContent = failed;
      input.focus();
    }
  });

  return {
    open() {
      root.hidden = false;
      document.querySelector('.control-wrap')?.setAttribute('inert', '');
      error.textContent = '';
      input.focus();
    },
    close() {
      root.hidden = true;
      input.value = '';
      document.querySelector('.control-wrap')?.removeAttribute('inert');
    }
  };
}

import { button } from './dom.js';

export function createPinGate(root, { onSubmit }) {
  const names = root.querySelector('#pinNames');
  const dots = root.querySelector('#pinDots');
  const pad = root.querySelector('#pinPad');
  const error = root.querySelector('#pinError');
  const form = root.querySelector('#pinForm');
  let selected = '';
  let pin = '';

  pad.replaceChildren(...['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map(key => {
    const keyButton = button({ text: key === 'clear' ? 'Clear' : key === 'back' ? '⌫' : key, className: 'button', label: key === 'back' ? 'Delete digit' : key === 'clear' ? 'Clear PIN' : key });
    keyButton.addEventListener('click', () => {
      if (key === 'clear') pin = '';
      else if (key === 'back') pin = pin.slice(0, -1);
      else if (pin.length < 8) pin += key;
      renderPin();
    });
    return keyButton;
  }));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';
    if (!selected) { error.textContent = 'Choose your name.'; return; }
    const failed = await onSubmit(selected, pin);
    if (failed) {
      pin = '';
      renderPin();
      error.textContent = failed;
    }
  });

  function renderPin() { dots.textContent = pin ? '•'.repeat(pin.length) : 'Enter PIN'; }

  return {
    open(users) {
      root.hidden = false;
      document.querySelector('.control-wrap')?.setAttribute('inert', '');
      names.replaceChildren(...users.map(name => {
        const choice = button({ text: name, className: 'button' });
        choice.type = 'button';
        choice.addEventListener('click', () => {
          selected = name;
          for (const item of names.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === choice));
        });
        return choice;
      }));
      if (users.length === 1) names.querySelector('button')?.click();
      if (!users.length) error.textContent = 'No controller PINs yet. On the KartBoard computer run: node scripts/manage-users.mjs add';
      renderPin();
    },
    close() {
      root.hidden = true;
      pin = '';
      document.querySelector('.control-wrap')?.removeAttribute('inert');
    }
  };
}

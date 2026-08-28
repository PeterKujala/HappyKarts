import { KartBoardApi } from './js/api.js';
import { $, setText } from './js/dom.js';
import { formatClock, remainingMs, scheduleNames, statusCopy } from './js/selectors.js';

const api = new KartBoardApi();
let state;

initialize();

async function initialize() {
  try {
    await api.verifyCompatibility();
    render(await api.getState());
    api.subscribe({ onState: render, onConnectionChange: connected => document.body.classList.toggle('disconnected', !connected) });
  } catch {
    document.body.classList.add('disconnected');
  }
}

function render(nextState) {
  state = nextState;
  const schedule = scheduleNames(state);
  const copy = statusCopy(state);
  setText('#venue', state.venue); setText('#dayLabel', state.dayLabel);
  setText('#current', schedule.current); setText('#next', schedule.next); setText('#then', schedule.then);
  setText('#stateLabel', state.status === 'running' ? 'On track now' : copy[0]);
  setText('#notice', state.notice);
  $('#notice').classList.toggle('visible', Boolean(state.notice));
  const overlayVisible = !['running', 'paused'].includes(state.status);
  $('#overlay').classList.toggle('visible', overlayVisible);
  setText('#overlayTitle', copy[0]); setText('#overlayCopy', copy[1]);
  setText('#overlayEyebrow', state.status === 'finished' ? state.venue : 'Practice update');
  tick();
}

function tick() {
  if (!state) return;
  setText('#timer', formatClock(remainingMs(state)));
  setText('#localTime', new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date()));
}

setInterval(tick, 250);

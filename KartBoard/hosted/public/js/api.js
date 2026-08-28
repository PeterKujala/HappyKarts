const EXPECTED_API_VERSION = 3;

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export class KartBoardApi {
  #controlKey = '';
  #revision = null;

  constructor({ controller = false } = {}) {
    if (!controller) return;
    const url = new URL(window.location.href);
    const supplied = url.searchParams.get('key');
    if (supplied) {
      sessionStorage.setItem('kartboard-control-key', supplied);
      url.searchParams.delete('key');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    this.#controlKey = sessionStorage.getItem('kartboard-control-key') || '';
  }

  async verifyCompatibility() {
    const meta = await this.#json('/api/meta');
    if (meta.apiVersion !== EXPECTED_API_VERSION) {
      throw new ApiError('SERVER_VERSION_MISMATCH', 'KartBoard Server is out of date. Close it and restart KartBoard.');
    }
    return meta;
  }

  async getState() {
    const state = await this.#json('/api/state');
    this.#revision = state.revision;
    return state;
  }

  async authenticateController() {
    if (!this.#controlKey) {
      this.#controlKey = window.prompt('Enter the Kart Board controller access code')?.trim() || '';
    }
    if (!this.#controlKey) throw new ApiError('CONTROL_AUTH_REQUIRED', 'A controller access code is required.');
    try {
      await this.#json('/api/control-session', { method: 'POST', headers: this.#controlHeaders() });
      sessionStorage.setItem('kartboard-control-key', this.#controlKey);
    } catch (error) {
      sessionStorage.removeItem('kartboard-control-key');
      this.#controlKey = '';
      throw error;
    }
  }

  async dispatch(action, payload, { expectedRevision } = {}) {
    return this.#json('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...this.#controlHeaders() },
      body: JSON.stringify({ action, payload, expectedRevision })
    });
  }

  subscribe({ onState, onConnectionChange }) {
    let stopped = false;
    let connected = true;
    let timeout;
    const poll = async () => {
      try {
        const headers = this.#revision === null ? {} : { 'If-None-Match': `"kartboard-${this.#revision}"` };
        const response = await fetch('/api/state', { headers });
        if (response.status === 304) {
          if (!connected) onConnectionChange?.(true);
          connected = true;
        } else if (response.ok) {
          const state = await response.json();
          this.#revision = state.revision;
          onState(state);
          if (!connected) onConnectionChange?.(true);
          connected = true;
        } else {
          throw new Error('Polling failed');
        }
      } catch {
        if (connected) onConnectionChange?.(false);
        connected = false;
      } finally {
        if (!stopped) timeout = setTimeout(poll, document.hidden ? 5000 : 1250);
      }
    };
    timeout = setTimeout(poll, 1250);
    return () => { stopped = true; clearTimeout(timeout); };
  }

  #controlHeaders() { return this.#controlKey ? { 'X-KartBoard-Key': this.#controlKey } : {}; }

  async #json(url, options) {
    let response;
    try { response = await fetch(url, options); }
    catch { throw new ApiError('NETWORK_ERROR', 'Cannot reach Kart Board. Check your internet connection.'); }
    let body;
    try { body = await response.json(); }
    catch { body = null; }
    if (!response.ok) {
      const error = body?.error;
      throw new ApiError(error?.code || 'REQUEST_FAILED', error?.message || error || 'KartBoard could not complete the update.', response.status);
    }
    return body;
  }
}

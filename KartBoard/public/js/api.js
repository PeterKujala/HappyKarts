const EXPECTED_API_VERSION = 2;
const CONTROLLER_HEADERS = { 'Content-Type': 'application/json', 'X-KartBoard-Request': '1' };

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export class KartBoardApi {
  session() { return this.#json('api/session'); }

  login(name, pin) {
    return this.#json('api/login', { method: 'POST', headers: CONTROLLER_HEADERS, body: JSON.stringify({ name, pin }) });
  }

  logout() {
    return this.#json('api/logout', { method: 'POST', headers: CONTROLLER_HEADERS, body: '{}' });
  }

  async verifyCompatibility() {
    const meta = await this.#json('api/meta');
    if (meta.apiVersion !== EXPECTED_API_VERSION) {
      throw new ApiError('SERVER_VERSION_MISMATCH', 'KartBoard Server is out of date. Close it and restart KartBoard.');
    }
    return meta;
  }

  getState() { return this.#json('api/state'); }

  /**
   * @param {string} action
   * @param {object} [payload]
   * @param {{ expectedRevision?: number }} [options]
   */
  dispatch(action, payload, options = {}) {
    const { expectedRevision } = options;
    return this.#json('api/action', {
      method: 'POST', headers: CONTROLLER_HEADERS,
      body: JSON.stringify({ action, payload, expectedRevision })
    });
  }

  subscribe({ onState, onConnectionChange }) {
    const source = new EventSource(new URL('api/events', window.location.href));
    source.addEventListener('state', event => onState(JSON.parse(event.data)));
    source.onopen = () => onConnectionChange?.(true);
    source.onerror = () => onConnectionChange?.(false);
    return () => source.close();
  }

  async #json(url, options) {
    let response;
    try { response = await fetch(new URL(url, window.location.href), { cache: 'no-store', credentials: 'same-origin', ...options }); }
    catch { throw new ApiError('NETWORK_ERROR', 'Cannot reach KartBoard. Check the connection and try again.'); }
    let body;
    try { body = await response.json(); }
    catch { body = null; }
    if (!response.ok) {
      const error = body?.error;
      throw new ApiError(error?.code || 'REQUEST_FAILED', error?.message || 'KartBoard could not complete the update.', response.status);
    }
    return body;
  }
}

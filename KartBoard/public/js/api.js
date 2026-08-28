const EXPECTED_API_VERSION = 2;

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export class KartBoardApi {
  async verifyCompatibility() {
    const meta = await this.#json('/api/meta');
    if (meta.apiVersion !== EXPECTED_API_VERSION) {
      throw new ApiError('SERVER_VERSION_MISMATCH', 'KartBoard Server is out of date. Close it and restart KartBoard.');
    }
    return meta;
  }

  getState() { return this.#json('/api/state'); }

  async dispatch(action, payload, { expectedRevision } = {}) {
    return this.#json('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, expectedRevision })
    });
  }

  subscribe({ onState, onConnectionChange }) {
    const source = new EventSource('/api/events');
    source.addEventListener('state', event => onState(JSON.parse(event.data)));
    source.onopen = () => onConnectionChange?.(true);
    source.onerror = () => onConnectionChange?.(false);
    return () => source.close();
  }

  async #json(url, options) {
    let response;
    try { response = await fetch(url, options); }
    catch { throw new ApiError('NETWORK_ERROR', 'Cannot reach KartBoard Server. Check that it is running.'); }
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

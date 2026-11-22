class SseHub {
  constructor({ heartbeatMs = 20_000 } = {}) {
    this.clients = new Set();
    this.heartbeatMs = heartbeatMs;
    this.heartbeat = null;
  }

  subscribe(initialState) {
    const encoder = new TextEncoder();
    /** @type {{ enqueue: (text: string) => void, close: () => void } | undefined} */
    let client;
    const stream = new ReadableStream({
      start: controller => {
        client = {
          enqueue: text => {
            try { controller.enqueue(encoder.encode(text)); }
            catch { this.#drop(client); }
          },
          close: () => { try { controller.close(); } catch { /* already closed */ } }
        };
        this.clients.add(client);
        client.enqueue('retry: 1500\n\n');
        client.enqueue(`event: state\ndata: ${JSON.stringify(initialState)}\n\n`);
        this.#ensureHeartbeat();
      },
      cancel: () => { if (client) this.#drop(client); }
    });
    return stream;
  }

  publish(state) {
    const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
    for (const client of this.clients) client.enqueue(payload);
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const client of [...this.clients]) client.close();
    this.clients.clear();
  }

  #drop(client) {
    this.clients.delete(client);
    if (!this.clients.size && this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  #ensureHeartbeat() {
    if (this.heartbeat || !this.heartbeatMs) return;
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) client.enqueue(': keepalive\n\n');
    }, this.heartbeatMs);
    this.heartbeat.unref?.();
  }
}

module.exports = { SseHub };

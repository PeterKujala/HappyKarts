class SseHub {
  constructor({ heartbeatMs = 20_000 } = {}) {
    this.clients = new Set();
    this.heartbeat = setInterval(() => this.#heartbeat(), heartbeatMs);
    this.heartbeat.unref?.();
  }

  subscribe(req, res, initialState) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    this.clients.add(res);
    this.#write(res, 'state', initialState);
    const cleanup = () => this.clients.delete(res);
    req.on('close', cleanup);
    res.on('error', cleanup);
  }

  publish(state) { for (const client of this.clients) this.#write(client, 'state', state); }
  close() { clearInterval(this.heartbeat); for (const client of this.clients) client.end(); this.clients.clear(); }
  #heartbeat() { for (const client of this.clients) { try { client.write(': keepalive\n\n'); } catch { this.clients.delete(client); } } }
  #write(client, event, value) { try { client.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`); } catch { this.clients.delete(client); } }
}

module.exports = { SseHub };

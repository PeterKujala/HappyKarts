const { toPublicState } = require('../domain/state');

class BoardCoordinator {
  constructor({ repository, events, now = Date.now }) {
    this.repository = repository;
    this.events = events;
    this.now = now;
    this.state = null;
    this.ready = Promise.resolve().then(() => this.#load());
  }

  async #load() {
    this.state = await this.repository.load();
  }

  async read() {
    await this.ready;
    return present(this.state);
  }

  async commit(mutate) {
    await this.ready;
    const next = mutate(this.state);
    this.state = next;
    const view = present(this.state);
    await this.repository.save(this.state);
    this.events.publish(view);
    return view;
  }
}

function present(state) {
  return { ...toPublicState(state), updatedBy: typeof state?.updatedBy === 'string' ? state.updatedBy : '' };
}

module.exports = { BoardCoordinator, present };

const { DomainError } = require('../domain/errors');
const { CONTROLLER_HEADER, CONTROLLER_HEADER_VALUE } = require('../http/constants');

function assertMutatingRequest(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new DomainError('UNSUPPORTED_MEDIA', 'Changes must be sent as JSON.', 415);
  }
  if ((request.headers.get(CONTROLLER_HEADER) || '') !== CONTROLLER_HEADER_VALUE) {
    throw new DomainError('CROSS_ORIGIN', 'KartBoard blocked a request that did not come from the controller.', 403);
  }
  const expected = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected) {
    throw new DomainError('CROSS_ORIGIN', 'KartBoard blocked a request from another site.', 403);
  }
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') {
    throw new DomainError('CROSS_ORIGIN', 'KartBoard blocked a request from another site.', 403);
  }
}

module.exports = { assertMutatingRequest };

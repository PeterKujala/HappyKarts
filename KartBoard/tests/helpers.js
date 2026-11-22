const { hashPin } = require('../src/auth/users');
const { CONTROLLER_HEADER, CONTROLLER_HEADER_VALUE } = require('../src/http/constants');

async function controllerUser(name = 'KAC', pin = '2468') {
  return hashPin(pin, { name, iterations: 1_000 });
}

function mutationHeaders(url, cookie) {
  const headers = {
    'content-type': 'application/json',
    [CONTROLLER_HEADER]: CONTROLLER_HEADER_VALUE,
    origin: new URL(url).origin
  };
  if (cookie) headers.cookie = cookie;
  return headers;
}

async function loginRequest(appOrFetch, url, { name = 'KAC', pin = '2468' } = {}) {
  const response = await appOrFetch(new Request(url, {
    method: 'POST',
    headers: mutationHeaders(url),
    body: JSON.stringify({ name, pin })
  }));
  return response;
}

module.exports = { controllerUser, mutationHeaders, loginRequest };

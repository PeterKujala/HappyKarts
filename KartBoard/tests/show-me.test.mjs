import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HELP_TOPICS, topicComplete } from '../public/js/help-topics.mjs';
import { createGuardedFetch, isMutationRequest } from '../public/js/show-me.mjs';

const root = path.join(import.meta.dirname, '..');

test('show me mode does not send mutation requests', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const blocked = createGuardedFetch(() => true, fetchImpl);
  for (const target of ['/api/action', '/api/login', '/api/logout', '/api/admin/codes', '/api/admin/codes/revoke']) {
    const response = await blocked(target, { method: 'POST', body: '{}' });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'SHOW_ME');
  }
  assert.equal(calls.length, 0);
  const open = createGuardedFetch(() => false, fetchImpl);
  await open('/api/action', { method: 'POST' });
  await open('/api/state');
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET']);
  assert.equal(isMutationRequest('DELETE'), true);
  assert.equal(isMutationRequest('GET'), false);
  const control = fs.readFileSync(path.join(root, 'public/control.js'), 'utf8');
  assert.match(control, /createGuardedFetch\(\(\) => showMe\.active\)/);
  assert.match(control, /if \(showMe\.active\) return false/);
});

test('every controller control has show-me help and sign-in is code only', () => {
  const html = fs.readFileSync(path.join(root, 'public/control.html'), 'utf8');
  const tags = html.match(/<(button|input|textarea|select|a)\b[^>]*>/gi) || [];
  assert.ok(tags.length > 10);
  const keys = new Set();
  for (const tag of tags) {
    const help = /data-help="([^"]+)"/.exec(tag);
    assert.ok(help, `missing data-help on ${tag}`);
    keys.add(help[1]);
  }
  for (const file of ['public/control.js', 'public/js/rotation-editor.js', 'public/js/pin-gate.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const call of buttonCalls(source)) {
      const help = /help:\s*'([^']+)'/.exec(call);
      assert.ok(help, `button() is missing help in ${file}: ${call}`);
      keys.add(help[1]);
    }
    for (const match of source.matchAll(/dataset\.help = '([^']+)'/g)) keys.add(match[1]);
  }
  for (const key of keys) {
    assert.equal(topicComplete(HELP_TOPICS[key]), true, key);
    for (const field of ['title', 'happens', 'when', 'caveat']) assert.equal(typeof HELP_TOPICS[key][field], 'string');
  }
  const banned = /choose your name|pick your name|who[’']s controlling|pinNames|pin-names|Enter PIN/i;
  for (const file of ['public/control.html', 'public/help.html', 'public/control.js', 'public/js/pin-gate.js', 'public/js/help-topics.mjs']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), banned, file);
  }
  assert.match(html, /Enter your access code/);
  assert.match(html, /id="accessCode"/);
  assert.match(html, /inputmode="text"/);
  assert.doesNotMatch(html, /<(select|input)[^>]*name="name"/);
  assert.match(fs.readFileSync(path.join(root, 'public/control.js'), 'utf8'), /Signed in as /);
  assert.match(fs.readFileSync(path.join(root, 'public/js/show-me.mjs'), 'utf8'), /showModal/);
  assert.match(fs.readFileSync(path.join(root, 'public/js/show-me.mjs'), 'utf8'), /Escape/);
  assert.match(fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8'), /min-height:\s*44px/);
});

function buttonCalls(source) {
  const calls = [];
  const token = 'button({';
  let index = 0;
  while ((index = source.indexOf(token, index)) !== -1) {
    const end = source.indexOf('})', index);
    if (end < 0) break;
    calls.push(source.slice(index, end + 2));
    index = end + 2;
  }
  return calls;
}

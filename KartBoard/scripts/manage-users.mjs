import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { hashPin, UserRegistry, assertName, assertPin, DEFAULT_ITERATIONS } = require('../src/auth/users.js');

const root = path.resolve(import.meta.dirname, '..');
const file = process.env.KARTBOARD_USERS_FILE || path.join(root, 'kartboard-users.json');
const [command, ...rest] = process.argv.slice(2);
const nameFlag = flag(rest, '--name');

if (command === 'add') await add(nameFlag || rest[0]);
else if (command === 'remove') remove(nameFlag || rest[0]);
else if (command === 'list') list();
else if (command === 'export') process.stdout.write(readStore());
else usage();

function usage() {
  console.log(`Usage:
  node scripts/manage-users.mjs add --name "Russell"
  node scripts/manage-users.mjs remove --name "Russell"
  node scripts/manage-users.mjs list
  node scripts/manage-users.mjs export | npx wrangler secret put KARTBOARD_USERS

PIN is read from KARTBOARD_PIN or prompted. It is not accepted as an argument.`);
  process.exit(command ? 1 : 0);
}

async function add(rawName) {
  if (!rawName) usage();
  const name = assertName(rawName);
  const pin = await promptPin();
  assertPin(pin);
  const store = load();
  if (store.users.some(user => user.name === name)) throw new Error(`${name} is already registered. Remove them first to change the PIN.`);
  for (const user of store.users) {
    const registry = new UserRegistry([user]);
    if (await registry.authenticate(user.name, pin)) throw new Error('That PIN is already used by another controller.');
  }
  const record = await hashPin(pin, { name, iterations: DEFAULT_ITERATIONS });
  store.users.push(record);
  save(store);
  console.error(`Added ${name}. Upload with: node scripts/manage-users.mjs export | npx wrangler secret put KARTBOARD_USERS`);
}

function remove(rawName) {
  if (!rawName) usage();
  const name = assertName(rawName);
  const store = load();
  const next = store.users.filter(user => user.name !== name);
  if (next.length === store.users.length) throw new Error(`${name} is not registered.`);
  save({ users: next });
  console.error(`Removed ${name}.`);
}

function list() {
  const names = load().users.map(user => user.name);
  console.log(names.length ? names.join('\n') : 'No controllers registered.');
}

async function promptPin() {
  if (process.env.KARTBOARD_PIN) return process.env.KARTBOARD_PIN.trim();
  const rl = createInterface({ input: stdin, output: stdout });
  try { return (await rl.question('PIN (4-8 digits): ')).trim(); }
  finally { rl.close(); }
}

function load() {
  if (!existsSync(file)) return { users: [] };
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed.users)) throw new Error('User file must contain a users array.');
  return parsed;
}

function save(store) {
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

function readStore() {
  return existsSync(file) ? readFileSync(file) : '{"users":[]}\n';
}

function flag(args, key) {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : '';
}

import { env } from 'cloudflare:workers';
import { createDefaultState, DomainError, KartBoardState, migrateState, reduceState } from '@/lib/domain';

const ROW_ID = 1;
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS kartboard_state (
  id INTEGER PRIMARY KEY,
  revision INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

async function ensureStateRow() {
  await env.DB.prepare(CREATE_TABLE_SQL).run();
  const initial = createDefaultState();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO kartboard_state (id, revision, state_json, updated_at) VALUES (?, ?, ?, ?)',
  ).bind(ROW_ID, initial.revision, JSON.stringify(initial), initial.updatedAt).run();
}

export async function loadState(): Promise<KartBoardState> {
  await ensureStateRow();
  const row = await env.DB.prepare(
    'SELECT state_json FROM kartboard_state WHERE id = ?',
  ).bind(ROW_ID).first<{ state_json: string }>();
  if (!row) throw new DomainError('STATE_UNAVAILABLE', 'Kart Board state is unavailable.', 503);
  try { return migrateState(JSON.parse(row.state_json)); }
  catch { throw new DomainError('STATE_CORRUPT', 'Kart Board state could not be read.', 503); }
}

export async function applyAction(action: unknown, payload: Record<string, unknown>, expectedRevision?: unknown) {
  const current = await loadState();
  if (Number.isInteger(expectedRevision) && expectedRevision !== current.revision) {
    throw new DomainError('REVISION_CONFLICT', 'Kart Board was changed by another controller. Refresh and try again.', 409);
  }
  const next = reduceState(current, action, payload, Date.now());
  const result = await env.DB.prepare(
    'UPDATE kartboard_state SET revision = ?, state_json = ?, updated_at = ? WHERE id = ? AND revision = ?',
  ).bind(next.revision, JSON.stringify(next), next.updatedAt, ROW_ID, current.revision).run();
  if (result.meta.changes !== 1) {
    throw new DomainError('REVISION_CONFLICT', 'Kart Board was changed by another controller. Refresh and try again.', 409);
  }
  return next;
}

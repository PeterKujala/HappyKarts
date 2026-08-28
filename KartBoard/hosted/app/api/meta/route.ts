import { ACTION_NAMES, API_VERSION, SCHEMA_VERSION } from '@/lib/domain';
import { json } from '@/lib/http';

export async function GET() {
  return json({ apiVersion: API_VERSION, schemaVersion: SCHEMA_VERSION, actions: ACTION_NAMES, hosted: true, pollingIntervalMs: 1250 });
}

import { RecordedSession } from '../types/schema';

export function exportToJson(session: RecordedSession): string {
  return JSON.stringify(session, null, 2);
}

export function importFromJson(jsonString: string): RecordedSession {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    throw new Error(`Invalid JSON format: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Parsed JSON is not a valid object');
  }

  if (typeof parsed.sessionId !== 'string') {
    throw new Error('Missing required session metadata: sessionId must be a string');
  }

  if (!parsed.metadata || typeof parsed.metadata !== 'object') {
    throw new Error('Missing required session metadata: metadata object is required');
  }

  const { startUrl, startedAt, viewport } = parsed.metadata;
  if (typeof startUrl !== 'string' || typeof startedAt !== 'number') {
    throw new Error('Missing required session metadata: startUrl and startedAt are required');
  }

  if (!viewport || typeof viewport.width !== 'number' || typeof viewport.height !== 'number') {
    throw new Error('Missing required session metadata: viewport dimensions are required');
  }

  if (!Array.isArray(parsed.events)) {
    throw new Error('Invalid session format: events must be an array');
  }

  return parsed as RecordedSession;
}

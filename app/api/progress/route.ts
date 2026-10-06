import { getChatGPTUser } from '../../chatgpt-auth';
import { progressDb, memoryStore } from '../../../db/store';
import plan from '../../plan.json';

export const dynamic = 'force-dynamic';

const ids = new Map<string, string>([
  ...plan.topics.map(t => [t.id, 'topic'] as [string, string]),
  ...plan.tasks.map(t => [t.id, 'task'] as [string, string]),
]);

const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET() {
  const user = await getChatGPTUser();
  const userId = user?.userId || 'learner';

  try {
    const db = await progressDb();
    if (db) {
      const rows = (await db
        .prepare('SELECT item_id, payload FROM study_progress WHERE user_id = ?')
        .bind(userId)
        .all()) as { results?: Array<{ item_id: string; payload: string }> };
      const list = rows?.results || [];
      return reply({
        progress: Object.fromEntries(list.map((r: { item_id: string; payload: string }) => [r.item_id, JSON.parse(r.payload)])),
      });
    }

    // Fallback: in-memory store for Node / Vercel
    return reply({
      progress: Object.fromEntries(
        Array.from(memoryStore.entries()).map(([k, v]) => [k, JSON.parse(v.payload)])
      ),
    });
  } catch (e) {
    console.error('Progress load failed', e);
    // Return empty progress so client can fallback to localStorage seamlessly
    return reply({ progress: {} });
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  const userId = user?.userId || 'learner';

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return reply({ error: 'This request is not allowed.' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('id' in body) ||
    typeof body.id !== 'string' ||
    !('value' in body) ||
    !body.value ||
    typeof body.value !== 'object'
  ) {
    return reply({ error: 'Invalid study item.' }, 400);
  }

  const itemId = body.id;
  let kind: string;

  if (itemId.startsWith('__') && itemId.endsWith('__')) {
    kind = 'meta';
  } else if (ids.has(itemId)) {
    kind = ids.get(itemId)!;
    const value = body.value as Record<string, unknown>;
    const allowed =
      kind === 'topic'
        ? [
            'lesson',
            'practice',
            'pyqs',
            'revision',
            'notes',
            'confidence',
            'pyqAttempted',
            'pyqCorrect',
            'keyPoints',
            'doubtText',
            'doubtResolved',
            'lastStudied',
          ]
        : ['done', 'hours', 'notes', 'rescheduledDate', 'originalDate'];

    if (Object.keys(value).some(k => !allowed.includes(k))) {
      return reply({ error: 'Unknown progress field.' }, 400);
    }

    for (const [k, v] of Object.entries(value)) {
      if (k === 'notes' || k === 'keyPoints' || k === 'doubtText') {
        if (typeof v !== 'string' || v.length > 2000) {
          return reply({ error: `${k} must be 2,000 characters or fewer.` }, 400);
        }
      } else if (k === 'hours') {
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 24)) {
          return reply({ error: 'Enter hours between 0 and 24.' }, 400);
        }
      } else if (k === 'confidence') {
        if (v !== null && !['low', 'medium', 'high', 'mastered'].includes(v as string)) {
          return reply({ error: 'Invalid confidence rating.' }, 400);
        }
      } else if (k === 'pyqAttempted' || k === 'pyqCorrect') {
        if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || (v as number) < 0)) {
          return reply({ error: 'Invalid question count.' }, 400);
        }
      } else if (k === 'rescheduledDate' || k === 'originalDate' || k === 'lastStudied') {
        if (v !== null && typeof v !== 'string') {
          return reply({ error: 'Invalid date string.' }, 400);
        }
      } else if (typeof v !== 'boolean') {
        return reply({ error: 'Completion must be checked or unchecked.' }, 400);
      }
    }
  } else {
    return reply({ error: 'Unknown study item.' }, 400);
  }

  try {
    const db = await progressDb();
    if (db) {
      await db
        .prepare(
          'INSERT INTO study_progress (user_id,item_id,kind,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at'
        )
        .bind(userId, itemId, kind, JSON.stringify(body.value), new Date().toISOString())
        .run();
    } else {
      memoryStore.set(itemId, { itemId, payload: JSON.stringify(body.value) });
    }
    return reply({ ok: true });
  } catch (e) {
    console.error('Progress save failed', e);
    // If saving to server fails on Vercel, still acknowledge OK because the client saved to localStorage
    return reply({ ok: true, fallback: true });
  }
}

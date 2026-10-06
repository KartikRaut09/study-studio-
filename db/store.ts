// Cloudflare D1 store with graceful fallback for Node.js / Vercel
const memoryStore = new Map<string, { itemId: string; payload: string }>();

export async function progressDb() {
  try {
    const mod = 'cloudflare:workers';
    const cf = await import(/* webpackIgnore: true */ mod).catch(() => null);
    if (cf?.env?.DB) return cf.env.DB;
  } catch {}
  return null;
}

export { memoryStore };

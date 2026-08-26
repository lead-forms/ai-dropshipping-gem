import { id, json, now, parse, validateSourceUrl } from './domain.js';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const withCors = r => { const n = new Response(r.body, r); Object.entries(cors).forEach(([k,v]) => n.headers.set(k,v)); return n; };
const row = async (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;

async function api(request, env) {
  const u = new URL(request.url), p = u.pathname;
  if (p === '/api/health') return json({ ok: true, app: env.APP_NAME, time: now() });
  if (p === '/api/dashboard') {
    const counts = await row(env, `SELECT COUNT(*) creatives, SUM(status='pending_approval') pending, SUM(status='published') published, SUM(status='failed') failed FROM creatives`);
    const accounts = await all(env, `SELECT id,platform,handle,active FROM accounts ORDER BY created_at DESC`);
    return json({ counts, accounts });
  }
  if (p === '/api/accounts' && request.method === 'GET') return json(await all(env, `SELECT * FROM accounts ORDER BY created_at DESC`));
  if (p === '/api/accounts' && request.method === 'POST') {
    const b = await parse(request), source = validateSourceUrl(b.source_url);
    if (!source) return json({ error: 'InstagramまたはTikTokのURLを入力してください' }, 400);
    const accountId = id('acct'), created = now(), handle = b.handle || new URL(source.url).pathname.split('/').filter(Boolean)[0] || 'source';
    await env.DB.prepare(`INSERT INTO accounts(id,platform,handle,product_id,source_url,destination,created_at) VALUES(?,?,?,?,?,?,?)`).bind(accountId, source.platform, handle, b.product_id || null, source.url, b.destination ? 1 : 0, created).run();
    await env.JOBS.send({ type: 'ingest_account', account_id: accountId, source_url: source.url });
    return json({ id: accountId, queued: true }, 201);
  }
  if (p === '/api/creatives' && request.method === 'GET') {
    const status = u.searchParams.get('status') || 'pending_approval';
    return json(await all(env, `SELECT c.*,a.handle,a.platform,p.name product_name FROM creatives c LEFT JOIN accounts a ON a.id=c.account_id LEFT JOIN products p ON p.id=c.product_id WHERE c.status=? ORDER BY c.created_at DESC LIMIT 100`, status));
  }
  const action = p.match(/^\/api\/creatives\/([^/]+)\/(approve|reject|regenerate|publish)$/);
  if (action && request.method === 'POST') {
    const [, creativeId, verb] = action; const creative = await row(env, `SELECT * FROM creatives WHERE id=?`, creativeId);
    if (!creative) return json({ error: 'not_found' }, 404);
    const next = { approve: 'approved', reject: 'rejected', regenerate: 'regenerate', publish: 'publishing' }[verb];
    await env.DB.prepare(`UPDATE creatives SET status=?,updated_at=? WHERE id=?`).bind(next, now(), creativeId).run();
    if (verb === 'regenerate') await env.JOBS.send({ type: 'generate_variant', creative_id: creativeId });
    if (verb === 'publish') await env.JOBS.send({ type: 'publish', creative_id: creativeId });
    return json({ id: creativeId, status: next });
  }
  if (p.startsWith('/api/media/') && request.method === 'GET') {
    const key = decodeURIComponent(p.slice(11)), obj = await env.MEDIA.get(key);
    if (!obj) return json({ error: 'not_found' }, 404);
    const headers = new Headers(); obj.writeHttpMetadata(headers); headers.set('etag', obj.httpEtag); return new Response(obj.body, { headers });
  }
  return json({ error: 'not_found' }, 404);
}

async function consume(message, env) {
  const job = message.body;
  if (job.type === 'ingest_account') {
    // Official/provider adapters write permitted media into R2, then enqueue analyze_source.
    // URL registration remains pending until an adapter credential and rights status are present.
    await env.DB.prepare(`INSERT INTO jobs(id,type,entity_id,status,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(id('job'), job.type, job.account_id, 'awaiting_permitted_input', JSON.stringify(job), now(), now()).run();
  } else if (job.type === 'publish') {
    const c = await row(env, `SELECT c.*,a.platform FROM creatives c JOIN accounts a ON a.id=c.account_id WHERE c.id=?`, job.creative_id);
    if (!c) throw new Error('creative_not_found');
    // Publishing is deliberately gated on configured official platform adapters.
    await env.DB.prepare(`UPDATE creatives SET status='approved',updated_at=? WHERE id=?`).bind(now(), c.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO jobs(id,type,entity_id,status,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(id('job'), job.type, job.creative_id || null, 'queued_for_renderer', JSON.stringify(job), now(), now()).run();
  }
}

export default {
  async fetch(request, env) { if (request.method === 'OPTIONS') return new Response(null, { headers: cors }); const u = new URL(request.url); return u.pathname.startsWith('/api/') ? withCors(await api(request, env)) : env.ASSETS.fetch(request); },
  async queue(batch, env) { for (const message of batch.messages) { try { await consume(message, env); message.ack(); } catch (e) { message.retry(); } } },
  async scheduled(controller, env) {
    const due = await all(env, `SELECT id FROM creatives WHERE status='approved' AND (scheduled_at IS NULL OR scheduled_at<=?) LIMIT 25`, now());
    for (const c of due) { await env.DB.prepare(`UPDATE creatives SET status='publishing',updated_at=? WHERE id=?`).bind(now(), c.id).run(); await env.JOBS.send({ type: 'publish', creative_id: c.id }); }
  }
};

import { id, json, now, parse, validateSourceUrl } from './domain.js';

const row = async (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
const safeName = value => String(value || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
const pickVideoUrl = item => item.videoUrl || item.video_url || item.videoMeta?.downloadAddr || item.video?.url || null;
const cookieValue = (request, name) => (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || '';

async function adminPasscode(env) {
  const bytes = new TextEncoder().encode(`gem:${env.APIFY_API_TOKEN || ''}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

async function authorized(request, env) {
  if (!env.APIFY_API_TOKEN) return false;
  return cookieValue(request, 'gem_session') === await adminPasscode(env);
}

async function ingestWithApify(job, env) {
  if (!job.rights_confirmed) throw new Error('rights_confirmation_required');
  if (!env.APIFY_API_TOKEN) throw new Error('apify_not_configured');
  if (job.platform !== 'instagram') throw new Error('tiktok_adapter_not_configured');
  const endpoint = 'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=300&memory=1024';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.APIFY_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ directUrls: [job.source_url], resultsType: 'posts', resultsLimit: 6, addParentData: false, skipPinnedPosts: true })
  });
  if (!response.ok) throw new Error(`apify_${response.status}`);
  const items = await response.json();
  let saved = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const videoUrl = pickVideoUrl(item);
    if (!videoUrl) continue;
    const sourceUrl = item.url || item.postUrl || job.source_url;
    if (await row(env, 'SELECT id FROM source_posts WHERE account_id=? AND source_url=?', job.account_id, sourceUrl)) continue;
    const media = await fetch(videoUrl);
    if (!media.ok || !media.body) continue;
    const postId = id('src');
    const mediaKey = `sources/${job.account_id}/${safeName(item.shortCode || item.id || postId)}.mp4`;
    await env.MEDIA.put(mediaKey, media.body, { httpMetadata: { contentType: media.headers.get('content-type') || 'video/mp4' } });
    const metadata = { likes: item.likesCount ?? item.likes ?? null, comments: item.commentsCount ?? item.comments ?? null, views: item.videoViewCount ?? item.views ?? null, duration_seconds: item.videoDuration ?? item.duration ?? null, timestamp: item.timestamp ?? null, provider: 'apify/instagram-scraper' };
    await env.DB.prepare(`INSERT INTO source_posts(id,account_id,platform_post_id,source_url,caption,rights_status,media_key,metadata_json,ingested_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(postId, job.account_id, String(item.id || item.shortCode || ''), sourceUrl, item.caption || '', 'permitted', mediaKey, JSON.stringify(metadata), now()).run();
    await env.JOBS.send({ type: 'analyze_source', source_post_id: postId, media_key: mediaKey, account_id: job.account_id });
    saved++;
  }
  return saved;
}

async function api(request, env) {
  const u = new URL(request.url), p = u.pathname;
  if (p === '/api/health') return json({ ok: true, app: env.APP_NAME, time: now() });
  if (p === '/api/session' && request.method === 'POST') {
    const body = await parse(request);
    if (!env.APIFY_API_TOKEN || body.passcode !== await adminPasscode(env)) return json({ error: '認証できませんでした' }, 401);
    const response = json({ ok: true });
    response.headers.set('set-cookie', `gem_session=${body.passcode}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
    return response;
  }
  if (!await authorized(request, env)) return json({ error: 'ログインが必要です' }, 401);
  if (p === '/api/dashboard') {
    const counts = await row(env, `SELECT COUNT(*) creatives, SUM(status='pending_approval') pending, SUM(status='published') published, SUM(status='failed') failed FROM creatives`);
    const accounts = await all(env, `SELECT id,platform,handle,active FROM accounts ORDER BY created_at DESC`);
    return json({ counts, accounts });
  }
  if (p === '/api/accounts' && request.method === 'GET') return json(await all(env, `SELECT * FROM accounts ORDER BY created_at DESC`));
  if (p === '/api/accounts' && request.method === 'POST') {
    const b = await parse(request), source = validateSourceUrl(b.source_url);
    if (!source) return json({ error: 'InstagramまたはTikTokのURLを入力してください' }, 400);
    if (b.rights_confirmed !== true) return json({ error: '素材の利用権限を確認してください' }, 400);
    const accountId = id('acct'), created = now(), handle = b.handle || new URL(source.url).pathname.split('/').filter(Boolean)[0] || 'source';
    await env.DB.prepare(`INSERT INTO accounts(id,platform,handle,product_id,source_url,destination,created_at) VALUES(?,?,?,?,?,?,?)`).bind(accountId, source.platform, handle, b.product_id || null, source.url, b.destination ? 1 : 0, created).run();
    await env.JOBS.send({ type: 'ingest_account', account_id: accountId, source_url: source.url, platform: source.platform, rights_confirmed: true });
    return json({ id: accountId, queued: true }, 201);
  }
  if (p === '/api/jobs' && request.method === 'GET') {
    const entityId = u.searchParams.get('entity_id');
    return json(entityId ? await all(env, `SELECT * FROM jobs WHERE entity_id=? ORDER BY created_at DESC LIMIT 50`, entityId) : await all(env, `SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50`));
  }
  if (p === '/api/source-posts' && request.method === 'GET') {
    const accountId = u.searchParams.get('account_id');
    return json(accountId ? await all(env, `SELECT * FROM source_posts WHERE account_id=? ORDER BY ingested_at DESC LIMIT 100`, accountId) : []);
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
    const headers = new Headers(); obj.writeHttpMetadata(headers); headers.set('etag', obj.httpEtag); headers.set('cache-control', 'private, max-age=3600');
    return new Response(obj.body, { headers });
  }
  return json({ error: 'not_found' }, 404);
}

async function consume(message, env) {
  const job = message.body;
  if (job.type === 'ingest_account') {
    const jobId = id('job');
    await env.DB.prepare(`INSERT INTO jobs(id,type,entity_id,status,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(jobId, job.type, job.account_id, 'running', JSON.stringify(job), now(), now()).run();
    try {
      const saved = await ingestWithApify(job, env);
      await env.DB.prepare(`UPDATE jobs SET status=?,payload_json=?,updated_at=? WHERE id=?`).bind(saved ? 'completed' : 'no_video_items', JSON.stringify({ ...job, saved }), now(), jobId).run();
    } catch (error) {
      await env.DB.prepare(`UPDATE jobs SET status='failed',attempts=attempts+1,error=?,updated_at=? WHERE id=?`).bind(String(error?.message || error), now(), jobId).run();
      throw error;
    }
  } else if (job.type === 'publish') {
    const c = await row(env, `SELECT c.*,a.platform FROM creatives c JOIN accounts a ON a.id=c.account_id WHERE c.id=?`, job.creative_id);
    if (!c) throw new Error('creative_not_found');
    await env.DB.prepare(`UPDATE creatives SET status='approved',updated_at=? WHERE id=?`).bind(now(), c.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO jobs(id,type,entity_id,status,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(id('job'), job.type, job.source_post_id || job.creative_id || null, 'queued_for_renderer', JSON.stringify(job), now(), now()).run();
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    const u = new URL(request.url);
    return u.pathname.startsWith('/api/') ? api(request, env) : env.ASSETS.fetch(request);
  },
  async queue(batch, env) { for (const message of batch.messages) { try { await consume(message, env); message.ack(); } catch { message.retry(); } } },
  async scheduled(controller, env) {
    const due = await all(env, `SELECT id FROM creatives WHERE status='approved' AND (scheduled_at IS NULL OR scheduled_at<=?) LIMIT 25`, now());
    for (const c of due) { await env.DB.prepare(`UPDATE creatives SET status='publishing',updated_at=? WHERE id=?`).bind(now(), c.id).run(); await env.JOBS.send({ type: 'publish', creative_id: c.id }); }
  }
};

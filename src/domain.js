export const now = () => new Date().toISOString();
export const id = (prefix = 'id') => `${prefix}_${crypto.randomUUID()}`;
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
export const parse = async request => { try { return await request.json(); } catch { return {}; } };

export function validateSourceUrl(value) {
  let u; try { u = new URL(value); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  if (!['instagram.com', 'tiktok.com'].some(x => host === x || host.endsWith(`.${x}`))) return null;
  return { url: u.toString(), platform: host.includes('instagram') ? 'instagram' : 'tiktok' };
}

export function buildRecipe(clips, angle = 'demonstration') {
  const patterns = {
    problem: ['Hook','Problem','Demonstration','Benefit','CTA'],
    demonstration: ['Hook','使用開始','使用中','Benefit','CTA'],
    before_after: ['Before','商品アップ','Demonstration','After','CTA'],
    benefit: ['Hook','Benefit','Demonstration','Benefit','CTA']
  };
  const wanted = patterns[angle] || patterns.demonstration;
  const unused = [...clips];
  return wanted.map((tag, position) => {
    let i = unused.findIndex(c => (c.tags || []).includes(tag));
    if (i < 0) i = 0;
    const clip = unused.splice(i, 1)[0];
    if (!clip) return null;
    return { clip_id: clip.id, position, role: tag, duration_ms: Math.min(2400, clip.end_ms - clip.start_ms) };
  }).filter(Boolean);
}

export function qaCreative(recipe, durationMs, distinctSources) {
  const failures = [];
  if (recipe.length < 3) failures.push('insufficient_clips');
  if (distinctSources < 2) failures.push('requires_multiple_sources');
  if (durationMs < 7000 || durationMs > 15000) failures.push('duration_out_of_range');
  return { passed: failures.length === 0, failures, duration_ms: durationMs, distinct_sources: distinctSources };
}

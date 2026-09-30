import { parseJson } from '../db/index.js';
import { id, now } from '../lib/util.js';

/**
 * Publishing adapters. Each channel uses one adapter:
 *   simulated – marks the post as published (demo / training mode)
 *   webhook   – POSTs the post to a URL (Zapier, Make, n8n, Buffer, or a
 *               custom integration) which then posts to the real platform.
 * Native platform APIs can be added as new adapters with the same signature.
 */
const ADAPTERS = {
  async simulated(post) {
    return { external_id: `sim_${post.id.slice(4, 12)}` };
  },
  async webhook(post, channel) {
    const url = channel.config?.webhook_url;
    if (!url) throw new Error('Webhook URL is not configured for this channel');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: channel.platform, handle: channel.handle, caption: post.caption, media_url: post.media_url, publish_at: post.publish_at, post_id: post.id }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return { external_id: data.id || data.external_id || id('ext') };
  },
};

const MAX_ATTEMPTS = 3;

export async function publishPost({ db, engine }, post) {
  const channel = parseJson(db.get('SELECT * FROM channels WHERE id = ?', post.channel_id), 'config');
  db.run(`UPDATE scheduled_posts SET status = 'publishing', attempts = attempts + 1 WHERE id = ?`, post.id);
  try {
    if (!channel?.active) throw new Error('Channel is disconnected');
    const adapter = ADAPTERS[channel.adapter];
    if (!adapter) throw new Error(`Unknown adapter ${channel.adapter}`);
    const result = await adapter(post, channel);
    db.run(`UPDATE scheduled_posts SET status = 'published', published_at = ?, external_id = ?, last_error = NULL WHERE id = ?`, now(), result.external_id, post.id);
    if (post.idea_id) {
      const remaining = db.get(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE idea_id = ? AND status IN ('queued','publishing')`, post.idea_id).n;
      if (!remaining) db.run(`UPDATE content_ideas SET status = 'published', updated_at = ? WHERE id = ?`, now(), post.idea_id);
    }
    const fresh = db.get('SELECT * FROM scheduled_posts WHERE id = ?', post.id);
    engine.logSystemRun(post.org_id, 'Auto-publisher', 'post.published', `Published to ${channel.platform} (${channel.handle})`, 5);
    engine.emit(post.org_id, 'post.published', { post: fresh, channel });
    return fresh;
  } catch (err) {
    const attempts = db.get('SELECT attempts FROM scheduled_posts WHERE id = ?', post.id).attempts;
    const failed = attempts >= MAX_ATTEMPTS;
    // Retry a few times (5 minutes apart) before declaring failure.
    db.run(`UPDATE scheduled_posts SET status = ?, last_error = ?, publish_at = ? WHERE id = ?`,
      failed ? 'failed' : 'queued', err.message, failed ? post.publish_at : new Date(Date.now() + 5 * 60_000).toISOString(), post.id);
    const fresh = db.get('SELECT * FROM scheduled_posts WHERE id = ?', post.id);
    if (failed) engine.emit(post.org_id, 'post.failed', { post: fresh, channel });
    return fresh;
  }
}

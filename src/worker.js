// SURA CHAT staging API. Intentionally separate from the Sharika infrastructure.
// Authentication, room membership and public Moments are backed by dedicated SURA D1.
// Payments, gifting, salary and admin mutations remain disabled.
// Voice token issuance is opt-in, requires a private RealtimeKit key, and fails closed.

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Cloudflare Workers WebCrypto currently rejects PBKDF2 iterations above 100,000.
// This is a staging credential format; production should migrate to Argon2id.
const PASSWORD_ITERATIONS = 100000;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
// Opt-in heartbeat rollout, ONLY after the additive D1 migration and client update.
const PRESENCE_TTL_MS = 3 * 60 * 1000;
const presenceTrackingEnabled = env => env.PRESENCE_TTL_ENABLED === 'true';
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function b64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
function randomString(bytes = 32) { return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function randomPublicId() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  // Seven numeric digits, no leading zeros. Password PINs remain eight digits.
  return String(1000000 + (values[0] % 9000000));
}

function publicIdIsSupported(id) { return /^\d{7}$/.test(id) || /^(?:SC)?\d{8}$/.test(id); }

// An alias is retained for old links; public responses always return the
// canonical users.public_id after migration. No UUID or room FK changes.
async function findPublicUser(env, publicId, fields = 'u.id, u.public_id') {
  if (!publicIdIsSupported(publicId)) return null;
  const legacy = publicId.startsWith('SC') ? publicId : `SC${publicId}`;
  return env.DB.prepare(`SELECT ${fields} FROM users AS u
    LEFT JOIN user_public_id_aliases AS a ON a.user_id = u.id
    WHERE (u.public_id IN (?, ?) OR a.legacy_public_id IN (?, ?)) AND u.status = 'active'
    LIMIT 1`).bind(publicId, legacy, publicId, legacy).first();
}
async function sha256(input) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input))));
}
async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, 256));
}
function equalBytes(a, b) {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return mismatch === 0;
}

async function readJson(request) {
  if (!request.body) throw new HttpError(400, 'invalid_json');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new HttpError(413, 'body_too_large');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'invalid_json'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new HttpError(400, 'invalid_json');
  return value;
}

async function rateLimit(request, env, namespace, actorKey) {
  const limiter = namespace.startsWith('room') ? env.ROOM_RL : env.AUTH_RL;
  if (!limiter) throw new HttpError(503, 'rate_limit_unavailable');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await limiter.limit({ key: `${namespace}:${actorKey || ip}` });
  if (!success) throw new HttpError(429, 'rate_limited');
}

async function issueSession(env, userId) {
  const token = randomString();
  const tokenHash = await sha256(token);
  await env.DB.prepare('INSERT INTO auth_sessions(token_sha256, user_id, expires_at_ms) VALUES(?, ?, ?)')
    .bind(tokenHash, userId, Date.now() + SESSION_LIFETIME_MS).run();
  return token;
}

async function currentUser(request, env) {
  const match = /^Bearer ([\w-]{40,64})$/.exec(request.headers.get('Authorization') || '');
  if (!match) throw new HttpError(401, 'login_required');
  const tokenHash = await sha256(match[1]);
  const user = await env.DB.prepare(`SELECT u.id, u.public_id, u.display_name, u.country_code, u.bio, u.avatar_key, c.email_normalized
    FROM auth_sessions AS s JOIN users AS u ON u.id = s.user_id
    JOIN user_credentials AS c ON c.user_id = u.id
    WHERE s.token_sha256 = ? AND s.expires_at_ms > ? AND s.revoked_at_ms IS NULL AND u.status = 'active'`)
    .bind(tokenHash, Date.now()).first();
  if (!user) throw new HttpError(401, 'session_expired');
  return user;
}

// The SURA economy is not enabled for writes. Read-only ledger views must be
// scoped to the authenticated account and must never infer a demo balance.
async function readMyWallets(request, env) {
  const me = await currentUser(request, env);
  const { results: balances } = await env.DB.prepare(`SELECT w.wallet_type,
      w.currency, COALESCE(SUM(l.amount_units), 0) AS balance_units,
      COUNT(l.id) AS ledger_entries
    FROM wallets w LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
    WHERE w.user_id = ?
    GROUP BY w.id, w.wallet_type, w.currency
    ORDER BY CASE w.wallet_type WHEN 'main' THEN 1
      WHEN 'salary' THEN 2 WHEN 'seller' THEN 3 ELSE 4 END`).bind(me.id).all();
  const { results: history } = await env.DB.prepare(`SELECT w.wallet_type, l.amount_units,
      l.operation, l.created_at
    FROM wallet_ledger l JOIN wallets w ON w.id = l.wallet_id
    WHERE w.user_id = ?
    ORDER BY l.created_at DESC, l.id DESC LIMIT 20`).bind(me.id).all();
  const safeAmount = value => Number.isSafeInteger(Number(value)) ? Number(value) : null;
  return json({
    wallets: (balances || []).map(r => ({
      wallet_type: r.wallet_type, currency: r.currency,
      balance_units: safeAmount(r.balance_units),
      ledger_entries: safeAmount(r.ledger_entries)
    })),
    entries: (history || []).map(r => ({
      wallet_type: r.wallet_type, amount_units: safeAmount(r.amount_units),
      operation: r.operation, created_at: r.created_at
    })),
    transactions_enabled: false
  });
}

// Social counts are derived from real SURA follows; they do not represent CP or gifts.
async function readSocialCounts(env, userId) {
  const row = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM user_follows WHERE followed_user_id = ?) AS followers,
      (SELECT COUNT(*) FROM user_follows WHERE follower_user_id = ?) AS following`)
    .bind(userId, userId).first();
  return { followers: Number(row?.followers || 0), following: Number(row?.following || 0) };
}
async function readMySocial(request, env) {
  const me = await currentUser(request, env);
  return json({ social: await readSocialCounts(env, me.id) });
}

// Public profiles expose no email, session, wallet or private moderation data.
async function memberProfile(request, env, publicId) {
  const me = await currentUser(request, env);
  const user = await findPublicUser(env, publicId,
    'u.id, u.public_id, u.display_name, u.country_code, u.bio, u.avatar_key');
  if (!user) throw new HttpError(404, 'member_not_found');
  const blockedByMe = user.id !== me.id && await isUserBlocked(env, me.id, user.id);
  const following = user.id !== me.id && !blockedByMe && Boolean(await env.DB.prepare(
    'SELECT 1 FROM user_follows WHERE follower_user_id = ? AND followed_user_id = ?'
  ).bind(me.id, user.id).first());
  const social = await readSocialCounts(env, user.id);
  const { id: _internalUserId, ...publicInfo } = user;
  return json({ user: { ...publicInfo, public_id: user.public_id.replace(/^SC(?=\d+$)/, ''),
    blocked_by_me: blockedByMe, is_following: following, social } });
}

// Block prevents direct messaging and hides blocked users' posts/messages.
async function isUserBlocked(env, actorId, peerId) {
  return Boolean(await env.DB.prepare('SELECT 1 FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?')
    .bind(actorId, peerId).first());
}
async function usersHaveBlockedEachOther(env, actorId, peerId) {
  return Boolean(await env.DB.prepare(`SELECT 1 FROM user_blocks WHERE
    (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?) LIMIT 1`)
    .bind(actorId, peerId, peerId, actorId).first());
}
async function updateMyBlocks(request, env) {
  const me = await currentUser(request, env);
  await rateLimit(request, env, 'room-user-block', me.id);
  const data = await readJson(request);
  const id = String(data.public_id || '').trim();
  if (!publicIdIsSupported(id) || typeof data.blocked !== 'boolean') throw new HttpError(400, 'invalid_block');
  const target = await findPublicUser(env, id);
  if (!target) throw new HttpError(404, 'member_not_found');
  if (target.id === me.id) throw new HttpError(400, 'cannot_block_self');
  if (data.blocked) {
    await env.DB.prepare('INSERT OR IGNORE INTO user_blocks (blocker_user_id, blocked_user_id, created_at_ms) VALUES (?, ?, ?)')
      .bind(me.id, target.id, Date.now()).run();
    // A block removes existing follows in both directions, not just the UI.
    await env.DB.prepare('DELETE FROM user_follows WHERE (follower_user_id = ? AND followed_user_id = ?) OR (follower_user_id = ? AND followed_user_id = ?)')
      .bind(me.id, target.id, target.id, me.id).run();
  } else {
    await env.DB.prepare('DELETE FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?')
      .bind(me.id, target.id).run();
  }
  return json({ success: true, public_id: id.replace(/^SC(?=\d+$)/, ''), blocked: data.blocked });
}
async function listMyBlocks(request, env) {
  const me = await currentUser(request, env);
  const { results } = await env.DB.prepare(`SELECT u.public_id, u.display_name, b.created_at_ms
    FROM user_blocks b JOIN users u ON u.id = b.blocked_user_id
    WHERE b.blocker_user_id = ? ORDER BY b.created_at_ms DESC LIMIT 100`).bind(me.id).all();
  return json({ blocked_users: (results || []).map(row => ({
    ...row, public_id: row.public_id.replace(/^SC(?=\d+$)/, '')
  })) });
}


/** Follow is private to the member and works only for active, unblocked SURA accounts.
 * No gift, CP, coins, follower rewards or fake friend counts are involved.
 */
async function updateMyFollowing(request, env) {
  const me = await currentUser(request, env);
  await rateLimit(request, env, 'room-user-follow', me.id);
  const data = await readJson(request);
  const publicId = String(data.public_id || '').trim();
  if (!publicIdIsSupported(publicId) || typeof data.follow !== 'boolean') throw new HttpError(400, 'invalid_follow');
  const peer = await findPublicUser(env, publicId, 'u.id, u.public_id, u.status');
  if (!peer || peer.status !== 'active') throw new HttpError(404, 'member_not_found');
  if (peer.id === me.id) throw new HttpError(400, 'cannot_follow_self');
  if (data.follow && await usersHaveBlockedEachOther(env, me.id, peer.id))
    throw new HttpError(403, 'member_blocked');
  if (data.follow) {
    await env.DB.prepare('INSERT OR IGNORE INTO user_follows (follower_user_id, followed_user_id, created_at_ms) VALUES (?, ?, ?)')
      .bind(me.id, peer.id, Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM user_follows WHERE follower_user_id = ? AND followed_user_id = ?')
      .bind(me.id, peer.id).run();
  }
  return json({ success: true, public_id: peer.public_id.replace(/^SC(?=\d+$)/, ''), following: data.follow });
}
async function listMyFollowing(request, env) {
  const me = await currentUser(request, env);
  const { results } = await env.DB.prepare(`SELECT u.public_id, u.display_name, u.country_code,
      u.avatar_key, f.created_at_ms FROM user_follows f
    JOIN users u ON u.id = f.followed_user_id
    WHERE f.follower_user_id = ? AND u.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM user_blocks b
        WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
           OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?))
    ORDER BY f.created_at_ms DESC, u.public_id ASC LIMIT 100`)
    .bind(me.id, me.id, me.id).all();
  return json({ following: (results || []).map(r => ({
    ...r, public_id: r.public_id.replace(/^SC(?=\d+$)/, '')
  })) });
}


async function listMyFollowers(request, env) {
  const me = await currentUser(request, env);
  const { results } = await env.DB.prepare(`SELECT u.public_id, u.display_name, u.country_code,
      u.avatar_key, f.created_at_ms FROM user_follows f
    JOIN users u ON u.id = f.follower_user_id
    WHERE f.followed_user_id = ? AND u.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM user_blocks b
        WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
           OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?))
    ORDER BY f.created_at_ms DESC, u.public_id ASC LIMIT 100`)
    .bind(me.id, me.id, me.id).all();
  return json({ followers: (results || []).map(r => ({
    ...r, public_id: r.public_id.replace(/^SC(?=\d+$)/, '')
  })) });
}

async function reportMember(request, env) {
  const me = await currentUser(request, env);
  await rateLimit(request, env, 'room-user-report', me.id);
  const data = await readJson(request);
  const id = String(data.public_id || '').trim();
  const reason = String(data.reason || '').trim();
  const details = String(data.details || '').trim();
  const contextType = String(data.context_type || 'profile').trim();
  const contextId = String(data.context_id || '').trim();
  if (!publicIdIsSupported(id) ||
      !['harassment','spam','impersonation','hate','sexual_content','violence','other'].includes(reason) ||
      !['profile','message','moment','room'].includes(contextType) ||
      details.length > 500 || contextId.length > 128 ||
      /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(details + contextId))
    throw new HttpError(400, 'invalid_report');
  const target = await findPublicUser(env, id);
  if (!target || target.id === me.id) throw new HttpError(400, 'invalid_report_target');
  const recent = await env.DB.prepare(`SELECT 1 FROM user_reports
    WHERE reporter_user_id = ? AND target_user_id = ? AND created_at_ms > ? LIMIT 1`)
    .bind(me.id, target.id, Date.now() - 15 * 60 * 1000).first();
  if (recent) throw new HttpError(429, 'report_cooldown');
  const reportId = crypto.randomUUID();
  const saved = await env.DB.prepare(`INSERT INTO user_reports
    (id, reporter_user_id, target_user_id, reason, details, context_type, context_id, status, created_at_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`)
    .bind(reportId, me.id, target.id, reason, details, contextType, contextId, Date.now()).run();
  if (saved.meta?.changes !== 1) throw new HttpError(503, 'report_not_saved');
  return json({ submitted: true, report_id: reportId }, 201);
}


/**
 * Report review is explicitly opt-in. The operator sets SURA_MODERATOR_IDS
 * as comma-separated canonical public IDs in the dedicated SURA Worker.
 * Never accept staff/admin privileges from a client payload or from a
 * room-owner permission, and never fall back to a public/default ID.
 */
function mayReviewReports(user, env) {
  const id = String(user.public_id || '').replace(/^SC(?=\d+$)/, '');
  const ids = String(env.SURA_MODERATOR_IDS || '').split(',').map(v => v.trim());
  return /^(?:[0-9]{7}|[0-9]{8})$/.test(id) && ids.includes(id);
}
async function requireReportModerator(request, env) {
  const user = await currentUser(request, env);
  if (!mayReviewReports(user, env)) throw new HttpError(403, 'moderator_required');
  return user;
}
function mayEditLiveEvents(user, env) {
  const id = String(user.public_id || '').replace(/^SC(?=\d+$)/, '');
  const permitted = String(env.SURA_EVENT_ADMIN_IDS || '').split(',').map(v => v.trim());
  return /^[0-9]{7,8}$/.test(id) && permitted.includes(id);
}
async function requireLiveEventEditor(request, env) {
  const me = await currentUser(request, env);
  if (!mayEditLiveEvents(me, env)) throw new HttpError(403, 'event_editor_required');
  return me;
}
async function reportStaffAccess(request, env) {
  const me = await currentUser(request, env);
  return json({ moderator: mayReviewReports(me, env), event_editor: mayEditLiveEvents(me, env) });
}
async function listMyReports(request, env) {
  const me = await currentUser(request, env);
  const { results } = await env.DB.prepare(`SELECT r.id, r.reason, r.context_type, r.status, r.created_at_ms,
    u.public_id AS target_public_id
    FROM user_reports r JOIN users u ON u.id = r.target_user_id
    WHERE r.reporter_user_id = ? ORDER BY r.created_at_ms DESC LIMIT 40`).bind(me.id).all();
  return json({ reports: (results || []).map(r => ({
    id: r.id, reason: r.reason, context_type: r.context_type,
    status: r.status, created_at_ms: r.created_at_ms,
    target_public_id: r.target_public_id.replace(/^SC(?=\d+$)/, '')
  })) });
}
async function listReviewQueue(request, env, url) {
  await requireReportModerator(request, env);
  const status = url.searchParams.get('status') || 'open';
  if (!['open','reviewing','resolved','dismissed'].includes(status))
    throw new HttpError(400, 'invalid_report_status');
  const { results } = await env.DB.prepare(`SELECT r.id, r.reason, r.details, r.context_type,
    r.context_id, r.status, r.created_at_ms, r.review_note, r.reviewed_at_ms,
    target.public_id AS target_public_id, target.display_name AS target_name,
    reporter.public_id AS reporter_public_id, reporter.display_name AS reporter_name
    FROM user_reports r JOIN users target ON target.id = r.target_user_id
    JOIN users reporter ON reporter.id = r.reporter_user_id
    WHERE r.status = ? ORDER BY r.created_at_ms DESC LIMIT 30`).bind(status).all();
  return json({ status, reports: (results || []).map(r => ({
    ...r, target_public_id: r.target_public_id.replace(/^SC(?=\d+$)/, ''),
    reporter_public_id: r.reporter_public_id.replace(/^SC(?=\d+$)/, '')
  })) });
}
async function reviewReport(request, env, reportId) {
  const moderator = await requireReportModerator(request, env);
  await rateLimit(request, env, 'room-staff-report-review', moderator.id);
  const data = await readJson(request);
  const status = String(data.status || '');
  const note = String(data.note || '').trim();
  if (!['reviewing','resolved','dismissed'].includes(status) || note.length > 500 ||
      /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(note))
    throw new HttpError(400, 'invalid_report_review');
  const changed = await env.DB.prepare(`UPDATE user_reports
    SET status = ?, review_note = ?, reviewed_by_user_id = ?, reviewed_at_ms = ?
    WHERE id = ? AND status IN ('open','reviewing')`)
    .bind(status, note, moderator.id, Date.now(), reportId).run();
  if (changed.meta?.changes !== 1) throw new HttpError(409, 'report_not_open');
  return json({ updated: true, report_id: reportId, status });
}

// Only the two authenticated participants can read their conversation.
async function directConversation(request, env, publicId, url) {
  const me = await currentUser(request, env);
  const peer = await findPublicUser(env, publicId,
    'u.id, u.public_id, u.display_name, u.avatar_key');
  if (!peer || peer.id === me.id) throw new HttpError(404, 'conversation_not_found');
  if (await usersHaveBlockedEachOther(env, me.id, peer.id)) throw new HttpError(403, 'conversation_blocked');
  const rawBefore = url.searchParams.get('before');
  const before = rawBefore === null ? Number.MAX_SAFE_INTEGER : Number(rawBefore);
  if (!Number.isSafeInteger(before) || before < 1) throw new HttpError(400, 'invalid_cursor');
  const { results } = await env.DB.prepare(`SELECT id, sender_user_id, body, created_at_ms
    FROM direct_messages WHERE id < ? AND
      ((sender_user_id = ? AND recipient_user_id = ?) OR
       (sender_user_id = ? AND recipient_user_id = ?))
    ORDER BY id DESC LIMIT 50`).bind(before, me.id, peer.id, peer.id, me.id).all();
  const rows = results || [];
  return json({ peer: { public_id: peer.public_id.replace(/^SC(?=\d+$)/, ''), display_name: peer.display_name, avatar_key: peer.avatar_key },
    messages: rows.map(row => ({ id: row.id, body: row.body, created_at_ms: row.created_at_ms,
      mine: row.sender_user_id === me.id })).reverse(),
    next_before: rows.length === 50 ? rows[rows.length - 1].id : null });
}

async function directInbox(request, env) {
  const me = await currentUser(request, env);
  const { results } = await env.DB.prepare(`WITH peers AS (
    SELECT CASE WHEN sender_user_id = ? THEN recipient_user_id ELSE sender_user_id END AS peer_id,
      MAX(id) AS latest_id FROM direct_messages
    WHERE sender_user_id = ? OR recipient_user_id = ?
    GROUP BY peer_id ORDER BY latest_id DESC LIMIT 40
  ) SELECT u.public_id, u.display_name, u.avatar_key, m.body AS last_message,
      m.created_at_ms AS last_created_at_ms, m.sender_user_id = ? AS last_sent_by_me
    FROM peers p JOIN users u ON u.id = p.peer_id
    JOIN direct_messages m ON m.id = p.latest_id
    WHERE u.status = 'active' AND NOT EXISTS (
      SELECT 1 FROM user_blocks b WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
      OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
    ) ORDER BY m.id DESC`)
    .bind(me.id, me.id, me.id, me.id, me.id, me.id).all();
  return json({ conversations: (results || []).map(row => ({ ...row,
    public_id: row.public_id.replace(/^SC(?=\d+$)/, '') })) });
}

async function sendDirectMessage(request, env, publicId) {
  const me = await currentUser(request, env);
  await rateLimit(request, env, 'room-dm-ip');
  await rateLimit(request, env, 'room-dm-account', me.id);
  const peer = await findPublicUser(env, publicId);
  if (!peer) throw new HttpError(404, 'member_not_found');
  if (peer.id === me.id) throw new HttpError(400, 'cannot_message_self');
  if (await usersHaveBlockedEachOther(env, me.id, peer.id)) throw new HttpError(403, 'conversation_blocked');
  const data = await readJson(request);
  const body = String(data.message ?? '').trim();
  if (!body || body.length > 500 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(body))
    throw new HttpError(400, 'invalid_message');
  const now = Date.now();
  const last = await env.DB.prepare('SELECT created_at_ms FROM direct_messages WHERE sender_user_id = ? ORDER BY id DESC LIMIT 1')
    .bind(me.id).first();
  if (last && now - last.created_at_ms < 750) throw new HttpError(429, 'message_too_fast');
  const inserted = await env.DB.prepare(`INSERT INTO direct_messages
    (sender_user_id, recipient_user_id, body, created_at_ms) VALUES (?, ?, ?, ?)`)
    .bind(me.id, peer.id, body, now).run();
  if (inserted.meta?.changes !== 1) throw new HttpError(503, 'message_not_saved');
  return json({ sent: true }, 201);
}

async function updateMyProfile(request, env) {
  const user = await currentUser(request, env);
  await rateLimit(request, env, 'profile-update');
  const data = await readJson(request);
  const displayName = String(data.display_name ?? '').trim();
  const bio = String(data.bio ?? '').trim();
  const countryCode = data.country_code === undefined ? user.country_code : String(data.country_code ?? '').trim().toUpperCase();
  if ((countryCode && !/^[A-Z]{2}$/.test(countryCode)) || displayName.length < 2 || displayName.length > 40 || bio.length > 160 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(displayName + bio)) {
    throw new HttpError(400, 'invalid_profile');
  }
  await env.DB.prepare('UPDATE users SET display_name = ?, bio = ?, country_code = ? WHERE id = ?')
    .bind(displayName, bio, countryCode || null, user.id).run();
  return json({ user: { public_id: user.public_id.replace(/^SC(?=\d+$)/, ''), display_name: displayName,
    country_code: countryCode || null, bio, avatar_key: user.avatar_key } });
}

async function readImage(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'image/webp' || !request.body) {
    throw new HttpError(415, 'webp_required');
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256000) throw new HttpError(413, 'avatar_too_large');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  const ascii = start => String.fromCharCode(...bytes.slice(start, start + 4));
  if (size < 20 || ascii(0) !== 'RIFF' || ascii(8) !== 'WEBP' ||
    !['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12))) throw new HttpError(400, 'invalid_avatar');
  return bytes;
}

async function uploadMyAvatar(request, env) {
  const user = await currentUser(request, env);
  await rateLimit(request, env, 'profile-avatar');
  if (!env.MEDIA) throw new HttpError(503, 'media_unavailable');
  const image = await readImage(request);
  const key = `avatars/${user.id}/${crypto.randomUUID()}.webp`;
  await env.MEDIA.put(key, image, { httpMetadata: { contentType: 'image/webp' } });
  await env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, user.id).run();
  return json({ avatar_key: key, avatar_url: `/api/v1/users/${user.public_id.replace(/^SC(?=\d+$)/, '')}/avatar?v=${encodeURIComponent(key)}` });
}

async function getAvatar(env, publicId) {
  const user = await findPublicUser(env, publicId, 'u.avatar_key');
  if (!user?.avatar_key || !env.MEDIA) throw new HttpError(404, 'avatar_not_found');
  const file = await env.MEDIA.get(user.avatar_key);
  if (!file) throw new HttpError(404, 'avatar_not_found');
  return new Response(file.body, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' } });
}

async function signup(request, env) {
  await rateLimit(request, env, 'signup');
  const data = await readJson(request);
  const email = String(data.email || '').trim().toLowerCase();
  const password = data.password;
  const displayName = String(data.display_name || '').trim();
  const country = String(data.country_code || '').trim().toUpperCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,20}$/.test(email) ||
      // New accounts use strong passwords with no email OTP. Legacy eight-digit
      // PINs remain valid for existing logins but are no longer issued.
      typeof password !== 'string' || password.length < 10 || password.length > 64 ||
      !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) ||
      /[\x00-\x1F\x7F]/.test(password) ||
      displayName.length < 2 || displayName.length > 40 ||
      (country && !/^[A-Z]{2}$/.test(country))) throw new HttpError(400, 'invalid_signup');
  if (await env.DB.prepare('SELECT 1 FROM user_credentials WHERE email_normalized = ?').bind(email).first()) {
    throw new HttpError(409, 'account_exists');
  }
  const userId = crypto.randomUUID();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashPassword(password, salt);
  let publicId;
  for (let attempt = 0; attempt < 5; attempt++) {
    publicId = randomPublicId();
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users(id, public_id, display_name, country_code) VALUES(?, ?, ?, ?)')
          .bind(userId, publicId, displayName, country || null),
        env.DB.prepare('INSERT INTO user_credentials(user_id, email_normalized, salt_b64, password_hash_b64, iterations) VALUES(?, ?, ?, ?, ?)')
          .bind(userId, email, b64(salt), b64(passwordHash), PASSWORD_ITERATIONS),
      ]);
      break;
    } catch (error) {
      if (!/UNIQUE constraint/i.test(String(error))) throw error;
      if (await env.DB.prepare('SELECT 1 FROM user_credentials WHERE email_normalized = ?').bind(email).first()) {
        throw new HttpError(409, 'account_exists');
      }
      if (attempt === 4) throw new HttpError(503, 'public_id_unavailable');
    }
  }
  const token = await issueSession(env, userId);
  return json({ user: { public_id: publicId, display_name: displayName, country_code: country || null, bio: '', avatar_key: null }, token, token_type: 'Bearer', expires_in: SESSION_LIFETIME_MS / 1000 }, 201);
}

async function login(request, env) {
  await rateLimit(request, env, 'login');
  const data = await readJson(request);
  const email = String(data.email || '').trim().toLowerCase();
  const password = data.password;
  if (typeof password !== 'string' || password.length > 128 || email.length > 256) throw new HttpError(400, 'invalid_login');
  // In addition to IP throttling, protect a single account from guesses
  // distributed across IPs. Hash the email so no address enters limiter keys.
  if (email) await rateLimit(request, env, 'login-account', await sha256(email));
  const credential = await env.DB.prepare(`SELECT c.user_id, c.salt_b64, c.password_hash_b64, c.iterations,
      u.public_id, u.display_name, u.country_code, u.bio, u.avatar_key, u.status
      FROM user_credentials AS c JOIN users AS u ON u.id = c.user_id WHERE c.email_normalized = ?`)
    .bind(email).first();
  // Both unknown accounts and incorrect passwords take a PBKDF2 verification.
  const salt = credential ? unb64(credential.salt_b64) : new Uint8Array(16);
  const actual = await hashPassword(password, salt, credential?.iterations ?? PASSWORD_ITERATIONS);
  const expected = credential ? unb64(credential.password_hash_b64) : new Uint8Array(32);
  if (!credential || credential.status !== 'active' || !equalBytes(actual, expected)) throw new HttpError(401, 'invalid_credentials');
  const token = await issueSession(env, credential.user_id);
  return json({ user: { public_id: credential.public_id.replace(/^SC(?=\d+$)/, ''), display_name: credential.display_name,
    country_code: credential.country_code, bio: credential.bio, avatar_key: credential.avatar_key }, token, token_type: 'Bearer', expires_in: SESSION_LIFETIME_MS / 1000 });
}

// A signed-in user can strengthen a legacy eight-digit PIN without email OTP.
// Both operations require the current password and are per-account rate limited.
// Existing logins and legacy sign-up PINs remain compatible during staging.
async function verifyCurrentPassword(request, env, password, purpose) {
  const me = await currentUser(request, env);
  await rateLimit(request, env, purpose, me.id);
  if (typeof password !== 'string' || !password || password.length > 128)
    throw new HttpError(400, 'invalid_current_password');
  const credential = await env.DB.prepare(`SELECT salt_b64, password_hash_b64, iterations
    FROM user_credentials WHERE user_id = ?`).bind(me.id).first();
  if (!credential) throw new HttpError(401, 'session_expired');
  const actual = await hashPassword(password, unb64(credential.salt_b64), credential.iterations);
  if (!equalBytes(actual, unb64(credential.password_hash_b64)))
    throw new HttpError(401, 'invalid_current_password');
  return { me, credential };
}
async function changeMyPassword(request, env) {
  const data = await readJson(request);
  const newPassword = data.new_password;
  if (typeof newPassword !== 'string' || newPassword.length < 10 ||
      newPassword.length > 64 || !/[A-Za-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) || /[\x00-\x1F\x7F]/.test(newPassword))
    throw new HttpError(400, 'weak_new_password');
  const { me, credential } = await verifyCurrentPassword(request, env, data.current_password, 'auth-password-change');
  if (String(data.current_password) === newPassword)
    throw new HttpError(400, 'password_unchanged');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashPassword(newPassword, salt);
  // Compare-and-swap prevents an old verification from overwriting a later
  // credential change triggered in another session.
  const updated = await env.DB.prepare(`UPDATE user_credentials
    SET salt_b64 = ?, password_hash_b64 = ?, iterations = ?
    WHERE user_id = ? AND password_hash_b64 = ?`)
    .bind(b64(salt), b64(passwordHash), PASSWORD_ITERATIONS, me.id, credential.password_hash_b64).run();
  if (updated.meta?.changes !== 1) throw new HttpError(409, 'password_changed_elsewhere');
  // Leave the requesting session alive; revoke other phones immediately.
  const tokenHash = await sha256(request.headers.get('Authorization').slice(7));
  await env.DB.prepare(`UPDATE auth_sessions SET revoked_at_ms = ?
    WHERE user_id = ? AND token_sha256 <> ? AND revoked_at_ms IS NULL`)
    .bind(Date.now(), me.id, tokenHash).run();
  return json({ password_changed: true, other_sessions_revoked: true });
}
async function revokeOtherSessions(request, env) {
  const data = await readJson(request);
  const { me } = await verifyCurrentPassword(request, env, data.current_password, 'auth-session-revoke');
  const tokenHash = await sha256(request.headers.get('Authorization').slice(7));
  const result = await env.DB.prepare(`UPDATE auth_sessions SET revoked_at_ms = ?
    WHERE user_id = ? AND token_sha256 <> ? AND revoked_at_ms IS NULL`)
    .bind(Date.now(), me.id, tokenHash).run();
  return json({ other_sessions_revoked: true, count: Number(result.meta?.changes || 0) });
}

// Show only the signed-in member's active session count. No session hashes,
 // client IPs or persistent device identifiers are ever returned.
async function readActiveSessions(request, env) {
  const me = await currentUser(request, env);
  const row = await env.DB.prepare(`SELECT COUNT(*) AS active_sessions
    FROM auth_sessions
    WHERE user_id = ? AND expires_at_ms > ? AND revoked_at_ms IS NULL`)
    .bind(me.id, Date.now()).first();
  const activeSessions = Number(row?.active_sessions);
  if (!Number.isSafeInteger(activeSessions) || activeSessions < 1) throw new HttpError(401, 'session_expired');
  return json({ active_sessions: activeSessions, other_sessions: activeSessions - 1 });
}

async function createRoom(request, env) {
  const user = await currentUser(request, env);
  await rateLimit(request, env, 'rooms-create');
  const data = await readJson(request);
  const name = String(data.name || '').trim();
  const seatCount = Number(data.seat_count ?? 8);
  const country = String(data.country_code || user.country_code || '').toUpperCase();
  if (name.length < 3 || name.length > 64 || ![4, 8, 12, 16].includes(seatCount) || (country && !/^[A-Z]{2}$/.test(country))) {
    throw new HttpError(400, 'invalid_room');
  }
  const roomId = crypto.randomUUID();
  const statements = [
    env.DB.prepare('INSERT INTO rooms(id, owner_user_id, name, country_code, seat_count) VALUES(?, ?, ?, ?, ?)')
      .bind(roomId, user.id, name, country || null, seatCount),
    env.DB.prepare('INSERT INTO room_memberships(room_id, user_id, permission) VALUES(?, ?, ?)')
      .bind(roomId, user.id, 'owner'),
  ];
  for (let seat = 1; seat <= seatCount; seat++) {
    statements.push(env.DB.prepare('INSERT INTO room_seats(room_id, seat_number) VALUES(?, ?)').bind(roomId, seat));
  }
  statements.push(env.DB.prepare('INSERT INTO room_audit_events(id, room_id, actor_user_id, action) VALUES(?, ?, ?, ?)')
    .bind(crypto.randomUUID(), roomId, user.id, 'create'));
  await env.DB.batch(statements);
  return json({ room: { id: roomId, name, seat_count: seatCount, country_code: country || null }, message: 'room_created_no_auto_seat' }, 201);
}

function voiceConfigured(env) {
  return env.VOICE_ENABLED === 'true' && Boolean(env.RTK_API_TOKEN && env.RTK_ACCOUNT_ID && env.RTK_APP_ID);
}

async function realtimeApi(env, method, path, data) {
  if (!voiceConfigured(env)) throw new HttpError(503, 'voice_not_configured');
  let response;
  try {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.RTK_ACCOUNT_ID)}/realtime/kit/${encodeURIComponent(env.RTK_APP_ID)}${path}`;
    response = await (env.RTK_FETCH || fetch)(endpoint, {
      method,
      headers: { Authorization: `Bearer ${env.RTK_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new HttpError(503, 'voice_provider_unavailable');
  }
  if (!response.ok) throw new HttpError(503, 'voice_provider_unavailable');
  let payload;
  try { payload = await response.json(); } catch { throw new HttpError(503, 'voice_provider_invalid_response'); }
  if (payload.success !== true) throw new HttpError(503, 'voice_provider_invalid_response');
  return payload.data ?? {};
}

async function revokeVoiceParticipant(env, roomId, userId) {
  const participant = await env.DB.prepare(`SELECT p.participant_id, m.meeting_id FROM room_voice_participants p
    JOIN room_voice_meetings m ON m.room_id = p.room_id
    WHERE p.room_id = ? AND p.user_id = ?`).bind(roomId, userId).first();
  if (!participant) return;
  if (!voiceConfigured(env)) throw new HttpError(503, 'voice_revocation_unavailable');
  // Deleting the participant invalidates ALL its tokens and kicks an active session.
  await realtimeApi(env, 'DELETE', `/meetings/${encodeURIComponent(participant.meeting_id)}/participants/${encodeURIComponent(participant.participant_id)}`);
  await env.DB.prepare('DELETE FROM room_voice_participants WHERE room_id = ? AND user_id = ? AND participant_id = ?')
    .bind(roomId, userId, participant.participant_id).run();
}

async function voiceEligibility(request, env, roomId) {
  const user = await currentUser(request, env);
  const row = await env.DB.prepare(`SELECT r.status, m.user_id AS joined_user_id, m.left_at,
    (SELECT seat_number FROM room_seats WHERE room_id = r.id AND user_id = ?) AS my_seat,
    EXISTS(SELECT 1 FROM room_bans WHERE room_id = r.id AND user_id = ?) AS banned
    FROM rooms r LEFT JOIN room_memberships m ON m.room_id = r.id AND m.user_id = ?
    WHERE r.id = ?`).bind(user.id, user.id, user.id, roomId).first();
  if (!row) throw new HttpError(404, 'room_not_found');
  if (row.banned || !row.joined_user_id || row.left_at || row.status === 'closed') throw new HttpError(403, 'join_room_first');
  return { user, role: row.my_seat === null ? 'listener' : 'speaker', seat: row.my_seat };
}

async function voiceToken(request, env, roomId) {
  const { user, role, seat } = await voiceEligibility(request, env, roomId);
  await rateLimit(request, env, 'room-voice');
  if (!voiceConfigured(env)) throw new HttpError(503, 'voice_not_configured');

  let saved = await env.DB.prepare('SELECT meeting_id FROM room_voice_meetings WHERE room_id = ?')
    .bind(roomId).first();
  if (!saved) {
    const newMeeting = await realtimeApi(env, 'POST', '/meetings', {
      title: `SURA CHAT room ${roomId}`, record_on_start: false, live_stream_on_start: false, persist_chat: false,
    });
    if (!/^[0-9a-f-]{36}$/i.test(newMeeting.id || '')) throw new HttpError(503, 'voice_provider_invalid_response');
    await env.DB.prepare('INSERT OR IGNORE INTO room_voice_meetings(room_id, meeting_id) VALUES(?, ?)')
      .bind(roomId, newMeeting.id).run();
    saved = await env.DB.prepare('SELECT meeting_id FROM room_voice_meetings WHERE room_id = ?').bind(roomId).first();
  }
  await revokeVoiceParticipant(env, roomId, user.id);
  const participant = await realtimeApi(env, 'POST', `/meetings/${encodeURIComponent(saved.meeting_id)}/participants`, {
    name: user.display_name,
    custom_participant_id: `${user.id}-${randomString(6)}`,
    preset_name: role === 'speaker' ? 'sura_voice_speaker' : 'sura_voice_listener',
    token: { expires_on: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
  });
  if (!/^[0-9a-f-]{36}$/i.test(participant.id || '') || typeof participant.token !== 'string' || !participant.token) {
    throw new HttpError(503, 'voice_provider_invalid_response');
  }

  // Re-check membership and seat AFTER the network call. If permissions changed,
  // immediately delete this participant before handing out its token.
  const fresh = await voiceEligibility(request, env, roomId).catch(() => null);
  if (!fresh || fresh.role !== role || fresh.seat !== seat) {
    await realtimeApi(env, 'DELETE', `/meetings/${encodeURIComponent(saved.meeting_id)}/participants/${encodeURIComponent(participant.id)}`);
    throw new HttpError(409, 'voice_permissions_changed');
  }
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO room_voice_participants(room_id, user_id, participant_id, role)
    SELECT ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM room_memberships WHERE room_id = ? AND user_id = ? AND left_at IS NULL
    )`).bind(roomId, user.id, participant.id, role, roomId, user.id).run();
  if (inserted.meta?.changes !== 1) {
    await realtimeApi(env, 'DELETE', `/meetings/${encodeURIComponent(saved.meeting_id)}/participants/${encodeURIComponent(participant.id)}`);
    throw new HttpError(409, 'voice_token_retry');
  }
  return json({ token: participant.token, role, seat, expires_in: 900 });
}


/**
 * Room membership heartbeat. Fail open for legacy schema until the operator
 * applies the additive migration AND explicitly enables PRESENCE_TTL_ENABLED.
 * A rejected/expired user must rejoin; this endpoint never creates a room.
 */
async function roomHeartbeat(request, env, roomId) {
  const { user } = await activeChatMembership(request, env, roomId);
  await rateLimit(request, env, 'room-presence', user.id);
  if (!presenceTrackingEnabled(env)) return json({ active: true, tracking: false });
  const now = Date.now();
  const touched = await env.DB.prepare('UPDATE room_memberships SET last_seen_at_ms = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL AND last_seen_at_ms >= ?')
    .bind(now, roomId, user.id, now - PRESENCE_TTL_MS).run();
  if (touched.meta?.changes !== 1) throw new HttpError(403, 'join_room_first');
  await pruneRoomPresence(env, roomId);
  return json({ active: true, tracking: true, heartbeat_interval_seconds: 25, ttl_seconds: 180 });
}

/**
 * Reclaim seats of clients that crash/disconnect. Limited work per heartbeat
 * prevents a single request from revoking many RTC participants.
 * RTC revoke comes first; on failure keep membership/seat so stale audio
 * cannot silently outlive the database cleanup.
 */
async function pruneRoomPresence(env, roomId) {
  if (!presenceTrackingEnabled(env)) return 0;
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  const { results } = await env.DB.prepare(
    'SELECT user_id FROM room_memberships WHERE room_id = ? AND left_at IS NULL AND last_seen_at_ms < ? ORDER BY last_seen_at_ms LIMIT 8'
  ).bind(roomId, cutoff).all();
  let cleaned = 0;
  for (const { user_id } of results || []) {
    try {
      await revokeVoiceParticipant(env, roomId, user_id);
    } catch (error) {
      console.error(JSON.stringify({ event: 'sura_presence_voice_revoke_failed', room_id: roomId, name: error?.name }));
      continue;
    }
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE room_seats SET user_id = NULL, updated_at = datetime('now') WHERE room_id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM room_memberships WHERE room_id = ? AND user_id = ? AND left_at IS NULL AND last_seen_at_ms < ?)"
      ).bind(roomId, user_id, roomId, user_id, cutoff),
      env.DB.prepare(
        "UPDATE room_memberships SET left_at = datetime('now') WHERE room_id = ? AND user_id = ? AND left_at IS NULL AND last_seen_at_ms < ?"
      ).bind(roomId, user_id, cutoff)
    ]);
    cleaned++;
  }
  return cleaned;
}

async function roomAction(request, env, roomId, action, seatNumber = null) {
  const user = await currentUser(request, env);
  await rateLimit(request, env, 'room-actions');
  const room = await env.DB.prepare('SELECT id, owner_user_id, status, seat_count FROM rooms WHERE id = ?').bind(roomId).first();
  if (!room || (action === 'join' && room.status === 'closed')) throw new HttpError(404, 'room_not_found');
  const member = await env.DB.prepare('SELECT left_at FROM room_memberships WHERE room_id = ? AND user_id = ?')
    .bind(roomId, user.id).first();

  if (action === 'join') {
    if (await env.DB.prepare('SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?').bind(roomId, user.id).first()) {
      throw new HttpError(403, 'room_blocked');
    }
    if (room.status === 'locked' && room.owner_user_id !== user.id) throw new HttpError(403, 'room_locked');
    if (presenceTrackingEnabled(env)) await pruneRoomPresence(env, roomId);
    const joinedAt = Date.now();
    const membershipWrite = presenceTrackingEnabled(env)
      ? env.DB.prepare(`INSERT INTO room_memberships(room_id,user_id,permission,chat_since_id,last_seen_at_ms)
        VALUES(?,?,'member',(SELECT COALESCE(MAX(id),0) FROM room_messages WHERE room_id = ?),?)
        ON CONFLICT(room_id,user_id) DO UPDATE SET left_at = NULL,
          joined_at = datetime('now'), chat_since_id = excluded.chat_since_id,
          last_seen_at_ms = excluded.last_seen_at_ms`).bind(roomId, user.id, roomId, joinedAt)
      : env.DB.prepare(`INSERT INTO room_memberships(room_id,user_id,permission,chat_since_id)
        VALUES(?,?,'member',(SELECT COALESCE(MAX(id),0) FROM room_messages WHERE room_id = ?))
        ON CONFLICT(room_id,user_id) DO UPDATE SET left_at = NULL,
          joined_at = datetime('now'), chat_since_id = excluded.chat_since_id`).bind(roomId, user.id, roomId);
    await env.DB.batch([
      membershipWrite,
      env.DB.prepare('INSERT INTO room_audit_events(id, room_id, actor_user_id, action) VALUES(?, ?, ?, ?)')
        .bind(crypto.randomUUID(), roomId, user.id, 'join'),
      env.DB.prepare(`INSERT INTO room_messages(room_id, sender_user_id, kind, body, created_at_ms)
        VALUES(?, NULL, 'join', ?, ?)`).bind(roomId, `${user.display_name} joined the room`, joinedAt),
    ]);
    return json({ joined: true, seat: null });
  }

  if (!member || member.left_at) throw new HttpError(403, 'join_room_first');
  if (action === 'leave' || action === 'stand') {
    await revokeVoiceParticipant(env, roomId, user.id);
    const statements = [env.DB.prepare('UPDATE room_seats SET user_id = NULL, updated_at = datetime(\'now\') WHERE room_id = ? AND user_id = ?')
      .bind(roomId, user.id)];
    if (action === 'leave') statements.push(env.DB.prepare('UPDATE room_memberships SET left_at = datetime(\'now\') WHERE room_id = ? AND user_id = ?').bind(roomId, user.id));
    statements.push(env.DB.prepare('INSERT INTO room_audit_events(id, room_id, actor_user_id, action) VALUES(?, ?, ?, ?)')
      .bind(crypto.randomUUID(), roomId, user.id, action));
    await env.DB.batch(statements);
    return json({ success: true, seat: null });
  }
  if (action === 'sit') {
    // An expired membership must rejoin before it can acquire a seat.
    if (presenceTrackingEnabled(env)) {
      const recent = await env.DB.prepare('SELECT 1 AS active FROM room_memberships WHERE room_id = ? AND user_id = ? AND left_at IS NULL AND last_seen_at_ms >= ?')
        .bind(roomId, user.id, Date.now() - PRESENCE_TTL_MS).first();
      if (!recent) throw new HttpError(403, 'join_room_first');
    }
    if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > room.seat_count) throw new HttpError(400, 'invalid_seat');
    const alreadySeated = await env.DB.prepare('SELECT seat_number FROM room_seats WHERE room_id = ? AND user_id = ?').bind(roomId, user.id).first();
    if (alreadySeated) throw new HttpError(409, 'stand_before_changing_seat');
    const result = await env.DB.prepare(`UPDATE room_seats SET user_id = ?, updated_at = datetime('now')
      WHERE room_id = ? AND seat_number = ? AND user_id IS NULL AND is_locked = 0
      AND EXISTS(SELECT 1 FROM room_memberships WHERE room_id = ? AND user_id = ? AND left_at IS NULL)`)
      .bind(user.id, roomId, seatNumber, roomId, user.id).run();
    if (result.meta?.changes !== 1) throw new HttpError(409, 'seat_unavailable');
    await env.DB.prepare('INSERT INTO room_audit_events(id, room_id, actor_user_id, action, seat_number) VALUES(?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), roomId, user.id, 'sit', seatNumber).run();
    return json({ success: true, seat: seatNumber });
  }
  throw new HttpError(404, 'not_found');
}

async function activeChatMembership(request, env, roomId) {
  const user = await currentUser(request, env);
  const freshness = presenceTrackingEnabled(env)
    ? ' AND m.last_seen_at_ms >= ' + Math.floor(Date.now() - PRESENCE_TTL_MS)
    : '';
  const membership = await env.DB.prepare(`SELECT m.chat_since_id FROM room_memberships m
    JOIN rooms r ON r.id = m.room_id
    WHERE m.room_id = ? AND m.user_id = ? AND m.left_at IS NULL AND r.status != 'closed' ${freshness}
    AND NOT EXISTS (SELECT 1 FROM room_bans b WHERE b.room_id = ? AND b.user_id = ?)`)
    .bind(roomId, user.id, roomId, user.id).first();
  if (!membership) throw new HttpError(403, 'join_room_first');
  return { user, membership };
}

async function roomChat(request, env, roomId, after = 0) {
  const { membership, user } = await activeChatMembership(request, env, roomId);
  const { results } = await env.DB.prepare(`SELECT m.id, m.kind, m.body, m.created_at_ms,
    u.public_id AS sender_public_id, u.display_name AS sender_name
    FROM room_messages m LEFT JOIN users u ON u.id = m.sender_user_id
    WHERE m.room_id = ? AND m.id > ? AND m.id > ?
    AND (m.sender_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
      (b.blocker_user_id = ? AND b.blocked_user_id = m.sender_user_id) OR
      (b.blocker_user_id = m.sender_user_id AND b.blocked_user_id = ?)))
    ORDER BY m.id LIMIT 50`)
    .bind(roomId, after, membership.chat_since_id, user.id, user.id).all();
  return json({ messages: (results ?? []).map(row => ({ ...row,
    sender_public_id: row.sender_public_id?.replace(/^SC(?=\d+$)/, '') ?? null })) });
}

async function sendRoomChat(request, env, roomId) {
  const { user } = await activeChatMembership(request, env, roomId);
  await rateLimit(request, env, 'room-chat');
  const data = await readJson(request);
  const body = String(data.message ?? '').trim();
  if (!body || body.length > 280 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(body)) throw new HttpError(400, 'invalid_message');
  const now = Date.now();
  const result = await env.DB.prepare(`INSERT INTO room_messages(room_id, sender_user_id, kind, body, created_at_ms)
    SELECT ?, ?, 'message', ?, ? WHERE EXISTS (
      SELECT 1 FROM room_memberships WHERE room_id = ? AND user_id = ? AND left_at IS NULL
    )`).bind(roomId, user.id, body, now, roomId, user.id).run();
  if (result.meta?.changes !== 1) throw new HttpError(403, 'join_room_first');
  // Messages are ephemeral: keep bounded volume and a 24-hour maximum lifetime.
  await env.DB.prepare(`DELETE FROM room_messages WHERE room_id = ? AND
    (created_at_ms < ? OR id NOT IN (SELECT id FROM room_messages WHERE room_id = ? ORDER BY id DESC LIMIT 500))`)
    .bind(roomId, now - 86400000, roomId).run();
  return json({ sent: true }, 201);
}

// Moments are a durable, user-authored social feed. Never accept a client-supplied
// author ID; profile names and seven-digit IDs are resolved from the user table.
async function listMoments(request, env, url) {
  const me = await currentUser(request, env);
  const beforeRaw = url.searchParams.get('before');
  const before = beforeRaw === null ? Number.MAX_SAFE_INTEGER : Number(beforeRaw);
  const author = url.searchParams.get('author') || '';
  if (!Number.isSafeInteger(before) || before < 1 ||
      (author && !/^[0-9]{7,8}$/.test(author))) throw new HttpError(400, 'invalid_moments_filter');
  const limit = Math.min(pageSize(url.searchParams.get('limit')), 20);
  let authorId = null;
  if (author) {
    const user = await findPublicUser(env, author);
    if (!user) throw new HttpError(404, 'member_not_found');
    authorId = user.id;
  }
  const { results } = await env.DB.prepare(`SELECT m.id, m.body, m.created_at_ms,
    u.public_id AS author_public_id, u.display_name AS author_name, u.avatar_key AS author_avatar_key
    FROM moments m JOIN users u ON u.id = m.author_user_id
    WHERE m.id < ? AND u.status = 'active' AND (? IS NULL OR m.author_user_id = ?)
    AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
      (b.blocker_user_id = ? AND b.blocked_user_id = m.author_user_id) OR
      (b.blocker_user_id = m.author_user_id AND b.blocked_user_id = ?))
    ORDER BY m.id DESC LIMIT ?`).bind(before, authorId, authorId, me.id, me.id, limit).all();
  const posts = (results || []).map(row => ({ ...row,
    author_public_id: row.author_public_id.replace(/^SC(?=\d+$)/, '') }));
  return json({ moments: posts, next_before: posts.length === limit ? posts[posts.length - 1].id : null });
}

async function createMoment(request, env) {
  const user = await currentUser(request, env);
  await rateLimit(request, env, 'room-moments');
  const data = await readJson(request);
  const body = String(data.body ?? '').trim();
  if (!body || body.length > 500 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(body)) {
    throw new HttpError(400, 'invalid_moment');
  }
  // An additional per-account cooldown prevents rapid posting via multiple IPs.
  const latest = await env.DB.prepare('SELECT created_at_ms FROM moments WHERE author_user_id = ? ORDER BY id DESC LIMIT 1')
    .bind(user.id).first();
  const now = Date.now();
  if (latest && now - latest.created_at_ms < 15000) throw new HttpError(429, 'moment_cooldown');
  const inserted = await env.DB.prepare('INSERT INTO moments(author_user_id, body, created_at_ms) VALUES(?, ?, ?)')
    .bind(user.id, body, now).run();
  if (inserted.meta?.changes !== 1) throw new HttpError(500, 'moment_not_saved');
  return json({ created: true }, 201);
}


/**
 * Daily progress is derived from existing authenticated SURA records, not
 * client-side guesses or synthetic gifts. Resets every day at 00:00 UTC.
 * Completing a task never creates a coin credit: rewards are disabled.
 */
async function readMyDailyProgress(request, env) {
  const me = await currentUser(request, env);
  const now = Date.now();
  const startMs = Math.floor(now / 86400000) * 86400000;
  const nextResetMs = startMs + 86400000;
  const startSql = new Date(startMs).toISOString().slice(0, 19).replace('T', ' ');
  const row = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM room_audit_events e
      WHERE e.actor_user_id = ? AND e.action = 'join' AND e.created_at >= ?) AS room_joins,
    (SELECT COUNT(*) FROM room_audit_events e
      WHERE e.actor_user_id = ? AND e.action = 'sit' AND e.created_at >= ?) AS seat_sits,
    (SELECT COUNT(*) FROM moments m
      WHERE m.author_user_id = ? AND m.created_at_ms >= ?) AS moments,
    (SELECT COUNT(*) FROM direct_messages d
      WHERE d.sender_user_id = ? AND d.created_at_ms >= ?) AS messages,
    (SELECT COUNT(*) FROM user_follows f
      WHERE f.follower_user_id = ? AND f.created_at_ms >= ?) AS new_follows`)
    .bind(me.id, startSql, me.id, startSql, me.id, startMs, me.id, startMs, me.id, startMs).first();
  const task = (id, label, field) => {
    const count = Number(row?.[field] || 0);
    return { id, label, progress: count, target: 1, completed: count >= 1 };
  };
  return json({ reset_at_ms: nextResetMs, timezone: 'UTC', rewards_enabled: false, tasks: [
    task('room_visit', 'Enter a voice room', 'room_joins'),
    task('seat_join', 'Take a room seat', 'seat_sits'),
    task('moment_post', 'Publish a Moment', 'moments'),
    task('private_message', 'Send a private message', 'messages'),
    task('follow_member', 'Follow a member', 'new_follows'),
  ] });
}

async function listLiveEvents(request, env, url) {
  const me = await currentUser(request, env);
  const country = String(url.searchParams.get('country') || me.country_code || '').toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) throw new HttpError(400, 'invalid_event_country');
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT id, title, body, country_code,
      start_at_ms, end_at_ms
    FROM sura_live_events
    WHERE status = 'published' AND end_at_ms > ?
      AND (? = '' OR country_code = '' OR country_code = ?)
    ORDER BY start_at_ms ASC, id ASC LIMIT 30`)
    .bind(now, country, country).all();
  return json({ events: results || [], as_of_ms: now });
}

async function listStaffLiveEvents(request, env) {
  await requireLiveEventEditor(request, env);
  const { results } = await env.DB.prepare(`SELECT id, title, body, country_code,
      start_at_ms, end_at_ms, status, updated_at_ms
    FROM sura_live_events ORDER BY updated_at_ms DESC LIMIT 100`).all();
  return json({ events: results || [] });
}

/**
 * Staff event publishing is explicitly allowlisted by SURA_EVENT_ADMIN_IDS.
 * No default admin, no cross-app credentials, no wallet or gift writes.
 */
async function saveLiveEvent(request, env) {
  const actor = await requireLiveEventEditor(request, env);
  await rateLimit(request, env, 'event-editor', actor.id);
  const data = await readJson(request);
  const id = data.id === undefined ? crypto.randomUUID() : String(data.id);
  const updating = data.id !== undefined;
  const title = String(data.title || '').trim();
  const body = String(data.body || '').trim();
  const country = String(data.country_code || '').trim().toUpperCase();
  const start = Number(data.start_at_ms);
  const end = Number(data.end_at_ms);
  const status = String(data.status || 'draft');
  const now = Date.now();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    title.length < 3 || title.length > 80 || body.length > 600 ||
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(title + body) ||
    (country && !/^[A-Z]{2}$/.test(country)) ||
    !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start ||
    start < now - 366 * 86400000 || end > now + 366 * 86400000 ||
    !['draft', 'published', 'hidden'].includes(status)) throw new HttpError(400, 'invalid_event');
  const write = updating
    ? env.DB.prepare(`UPDATE sura_live_events SET title = ?, body = ?, country_code = ?,
      start_at_ms = ?, end_at_ms = ?, status = ?, updated_at_ms = ? WHERE id = ?`)
      .bind(title, body, country, start, end, status, now, id)
    : env.DB.prepare(`INSERT INTO sura_live_events
      (id, title, body, country_code, start_at_ms, end_at_ms, status,
       author_user_id, created_at_ms, updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, title, body, country, start, end, status, actor.id, now, now);
  const audit = env.DB.prepare(`INSERT INTO admin_audit_log
    (id, actor_user_id, action, target_type, target_id)
    VALUES (?, ?, ?, 'sura_live_event', ?)`)
    .bind(crypto.randomUUID(), actor.id, updating ? 'update_event' : 'create_event', id);
  // D1 batch executes atomically: event and audit log succeed or fail together.
  const results = await env.DB.batch([write, audit]);
  if (results?.[0]?.meta?.changes !== 1) throw new HttpError(404, 'event_not_found');
  return json({ saved: true, id, status }, updating ? 200 : 201);
}

async function listRooms(request, env, url) {
  const limit = pageSize(url.searchParams.get('limit'));
  const offsetText = url.searchParams.get('offset');
  const offset = offsetText === null ? 0 : Number(offsetText);
  if (offsetText !== null && (!/^(0|[1-9]\d{0,3})$/.test(offsetText) || offset > 5000))
    throw new HttpError(400, 'invalid_room_offset');
  const scope = url.searchParams.get('scope') || 'all';
  const country = url.searchParams.get('country')?.toUpperCase() || '';
  const homeCountry = url.searchParams.get('home_country')?.toUpperCase() || '';
  const search = String(url.searchParams.get('q') || '').trim();
  const sort = url.searchParams.get('sort') === 'popular' ? 'popular' : 'new';
  // Conditional SQL keeps the older database usable until migration is applied.
  const presencePredicate = presenceTrackingEnabled(env)
    ? ' AND m.last_seen_at_ms >= ' + Math.floor(Date.now() - PRESENCE_TTL_MS)
    : '';
  if (!['all', 'mine', 'history'].includes(scope) ||
    (country && !/^[A-Z]{2}$/.test(country)) || (homeCountry && !/^[A-Z]{2}$/.test(homeCountry)) || search.length > 64) {
    throw new HttpError(400, 'invalid_room_filter');
  }
  const user = scope === 'all' ? null : await currentUser(request, env);
  const rows = await env.DB.prepare(`SELECT r.id, r.name, r.country_code, r.seat_count, r.theme_key, r.created_at,
    (SELECT COUNT(*) FROM room_memberships m WHERE m.room_id = r.id AND m.left_at IS NULL ${presencePredicate}) AS active_count
    FROM rooms r ${user ? 'JOIN room_memberships mine ON mine.room_id = r.id AND mine.user_id = ?' : ''}
    WHERE r.status != 'closed' ${user ? (scope === 'history' ? 'AND mine.left_at IS NOT NULL' : 'AND mine.left_at IS NULL') : ''}
    AND (? = '' OR r.country_code = ?)
    AND (? = '' OR instr(lower(r.name), lower(?)) > 0)
    ORDER BY CASE WHEN r.country_code = ? THEN 0 ELSE 1 END,
      ${sort === 'popular' ? 'active_count DESC,' : ''} r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`)
    .bind(...(user ? [user.id] : []), country, country, search, search, homeCountry, limit + 1, offset).all();
  const fetched = rows.results ?? [];
  const hasMore = fetched.length > limit;
  const rooms = fetched.slice(0, limit);
  return json({ rooms, count: rooms.length, has_more: hasMore, next_offset: hasMore ? offset + limit : null });
}

/**
 * Read-only rankings from real room join audit events, not gifts or coins.
 * Closed rooms are excluded and repeat joins count as repeat entries.
 */
async function roomActivityRanking(request, env, url) {
  const period = url.searchParams.get('period') || 'weekly';
  const country = String(url.searchParams.get('country') || '').trim().toUpperCase();
  const windows = { daily: '-1 day', weekly: '-7 days', monthly: '-30 days' };
  if (!Object.prototype.hasOwnProperty.call(windows, period) ||
      (country && !/^[A-Z]{2}$/.test(country))) throw new HttpError(400, 'invalid_rank_filter');
  const cutoff = windows[period]; // fixed server whitelist; no SQL from input
  const { results } = await env.DB.prepare(`SELECT r.id, r.name, r.country_code, r.seat_count,
      COUNT(e.id) AS join_events, COUNT(DISTINCT e.actor_user_id) AS unique_visitors
    FROM rooms r
    LEFT JOIN room_audit_events e ON e.room_id = r.id AND e.action = 'join'
      AND e.created_at >= datetime('now', '${cutoff}')
    WHERE r.status != 'closed' AND (? = '' OR r.country_code = ?)
    GROUP BY r.id
    ORDER BY join_events DESC, unique_visitors DESC, r.created_at DESC
    LIMIT 20`).bind(country, country).all();
  return json({ period, metric: 'room_entries', rooms: (results || []).map(r => ({
    id: r.id, name: r.name, country_code: r.country_code,
    seat_count: r.seat_count, join_events: Number(r.join_events || 0),
    unique_visitors: Number(r.unique_visitors || 0)
  })) });
}

async function moderationContext(request, env, roomId, ownerOnly = false) {
  const user = await currentUser(request, env);
  await rateLimit(request, env, 'room-moderation');
  const room = await env.DB.prepare(`SELECT id, owner_user_id, name, announcement,
    seat_count, status FROM rooms WHERE id = ?`).bind(roomId).first();
  if (!room) throw new HttpError(404, 'room_not_found');
  const isOwner = room.owner_user_id === user.id;
  const membership = await env.DB.prepare(`SELECT permission, left_at FROM room_memberships
    WHERE room_id = ? AND user_id = ?`).bind(roomId, user.id).first();
  if (!isOwner && (ownerOnly || membership?.permission !== 'admin' || membership.left_at)) {
    throw new HttpError(403, 'room_moderator_required');
  }
  return { user, room, isOwner };
}

function moderationLog(env, roomId, actorId, action, targetId = null, seatNumber = null) {
  return env.DB.prepare(`INSERT INTO room_moderation_events
    (id, room_id, actor_user_id, target_user_id, action, seat_number) VALUES(?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), roomId, actorId, targetId, action, seatNumber);
}

async function getRoomManagement(request, env, roomId) {
  const { user, room, isOwner } = await moderationContext(request, env, roomId);
  const members = await env.DB.prepare(`SELECT u.public_id, u.display_name, m.permission, m.joined_at
    FROM room_memberships m JOIN users u ON u.id = m.user_id
    WHERE m.room_id = ? AND m.left_at IS NULL ORDER BY m.joined_at`)
    .bind(roomId).all();
  const bans = await env.DB.prepare(`SELECT u.public_id, u.display_name
    FROM room_bans b JOIN users u ON u.id = b.user_id WHERE b.room_id = ? ORDER BY b.created_at DESC`)
    .bind(roomId).all();
  return json({ room, my_permission: isOwner ? 'owner' : 'admin',
    members: members.results ?? [], bans: bans.results ?? [], my_id: user.public_id });
}

async function updateRoomSettings(request, env, roomId) {
  const { user, room } = await moderationContext(request, env, roomId, true);
  const data = await readJson(request);
  const name = data.name === undefined ? room.name : String(data.name).trim();
  const announcement = data.announcement === undefined ? room.announcement : String(data.announcement).trim();
  const status = data.status === undefined ? room.status : String(data.status);
  const seatCount = data.seat_count === undefined ? room.seat_count : Number(data.seat_count);
  if (name.length < 3 || name.length > 64 || announcement.length > 400 ||
    !['open','locked'].includes(status) || ![4,8,12,16].includes(seatCount)) {
    throw new HttpError(400, 'invalid_room_settings');
  }
  // The conditional UPDATE keeps an occupied seat beyond a shrink boundary safe.
  const result = await env.DB.prepare(`UPDATE rooms SET name = ?, announcement = ?, status = ?, seat_count = ?
    WHERE id = ? AND NOT EXISTS
      (SELECT 1 FROM room_seats WHERE room_id = ? AND seat_number > ? AND user_id IS NOT NULL)`)
    .bind(name, announcement, status, seatCount, roomId, roomId, seatCount).run();
  if (result.meta?.changes !== 1) throw new HttpError(409, 'occupied_seats_prevent_resize');
  if (seatCount > room.seat_count) {
    const additions = [];
    for (let number = room.seat_count + 1; number <= seatCount; number++) {
      additions.push(env.DB.prepare('INSERT OR IGNORE INTO room_seats(room_id, seat_number) VALUES(?, ?)')
        .bind(roomId, number));
    }
    await env.DB.batch(additions);
  } else if (seatCount < room.seat_count) {
    await env.DB.prepare('DELETE FROM room_seats WHERE room_id = ? AND seat_number > ? AND user_id IS NULL')
      .bind(roomId, seatCount).run();
  }
  await moderationLog(env, roomId, user.id, 'update_settings').run();
  return json({ room: { id: roomId, name, announcement, status, seat_count: seatCount } });
}

async function setSeatLock(request, env, roomId, number, locked) {
  const { user, room } = await moderationContext(request, env, roomId);
  if (!Number.isInteger(number) || number < 1 || number > room.seat_count) throw new HttpError(400, 'invalid_seat');
  const result = await env.DB.prepare(`UPDATE room_seats SET is_locked = ?, updated_at = datetime('now')
    WHERE room_id = ? AND seat_number = ? AND user_id IS NULL`)
    .bind(locked ? 1 : 0, roomId, number).run();
  if (result.meta?.changes !== 1) throw new HttpError(409, 'seat_occupied_or_missing');
  await moderationLog(env, roomId, user.id, locked ? 'lock_seat' : 'unlock_seat', null, number).run();
  return json({ success: true, seat_number: number, is_locked: locked });
}

async function setRoomAdmin(request, env, roomId) {
  const { user } = await moderationContext(request, env, roomId, true);
  const data = await readJson(request);
  const publicId = String(data.public_id || '').trim();
  if (!publicIdIsSupported(publicId) || typeof data.enabled !== 'boolean') throw new HttpError(400, 'invalid_moderator');
  const legacy = publicId.startsWith('SC') ? publicId : `SC${publicId}`;
  const member = await env.DB.prepare(`SELECT u.id, m.permission FROM users u
    JOIN room_memberships m ON m.user_id = u.id
    LEFT JOIN user_public_id_aliases a ON a.user_id = u.id
    WHERE (u.public_id IN (?, ?) OR a.legacy_public_id IN (?, ?)) AND m.room_id = ? AND m.left_at IS NULL`)
    .bind(publicId, legacy, publicId, legacy, roomId).first();
  if (!member || member.id === user.id || member.permission === 'owner') throw new HttpError(404, 'eligible_member_not_found');
  const permission = data.enabled ? 'admin' : 'member';
  await env.DB.batch([
    env.DB.prepare('UPDATE room_memberships SET permission = ? WHERE room_id = ? AND user_id = ?')
      .bind(permission, roomId, member.id),
    moderationLog(env, roomId, user.id, data.enabled ? 'assign_admin' : 'remove_admin', member.id),
  ]);
  return json({ success: true, public_id: publicId, permission });
}

async function moderateMember(request, env, roomId, action) {
  const { user, room, isOwner } = await moderationContext(request, env, roomId);
  const data = await readJson(request);
  const publicId = String(data.public_id || '').trim();
  if (!publicIdIsSupported(publicId)) throw new HttpError(400, 'invalid_member');
  const legacy = publicId.startsWith('SC') ? publicId : `SC${publicId}`;
  const target = await env.DB.prepare(`SELECT u.id, m.permission, m.left_at
    FROM users u LEFT JOIN room_memberships m ON m.user_id = u.id AND m.room_id = ?
    LEFT JOIN user_public_id_aliases a ON a.user_id = u.id
    WHERE u.public_id IN (?, ?) OR a.legacy_public_id IN (?, ?)`)
    .bind(roomId, publicId, legacy, publicId, legacy).first();
  if (!target) throw new HttpError(404, 'member_not_found');
  if (target.id === room.owner_user_id || target.id === user.id) throw new HttpError(403, 'protected_room_member');
  if (!isOwner && target.permission === 'admin') throw new HttpError(403, 'cannot_moderate_admin');
  if (action === 'unblock') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM room_bans WHERE room_id = ? AND user_id = ?').bind(roomId, target.id),
      moderationLog(env, roomId, user.id, 'unblock', target.id),
    ]);
    return json({ success: true, public_id: publicId, blocked: false });
  }
  if (!target.permission || target.left_at) throw new HttpError(404, 'active_member_not_found');
  await revokeVoiceParticipant(env, roomId, target.id);
  const statements = [
    env.DB.prepare('UPDATE room_seats SET user_id = NULL, updated_at = datetime(\'now\') WHERE room_id = ? AND user_id = ?')
      .bind(roomId, target.id),
    env.DB.prepare(`UPDATE room_memberships SET left_at = datetime('now'), permission = 'member'
      WHERE room_id = ? AND user_id = ?`).bind(roomId, target.id),
  ];
  if (action === 'block') statements.push(env.DB.prepare(`INSERT INTO room_bans
    (room_id, user_id, banned_by_user_id) VALUES(?, ?, ?)
    ON CONFLICT(room_id, user_id) DO UPDATE SET banned_by_user_id = excluded.banned_by_user_id,
      created_at = datetime('now')`).bind(roomId, target.id, user.id));
  statements.push(moderationLog(env, roomId, user.id, action, target.id));
  await env.DB.batch(statements);
  return json({ success: true, public_id: publicId, blocked: action === 'block' });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function pageSize(value) {
  const n = Number(value ?? 20);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 50) : 20;
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (request.method === 'POST') {
        if (path === '/api/v1/auth/signup') return await signup(request, env);
        if (path === '/api/v1/auth/login') return await login(request, env);
        if (path === '/api/v1/auth/change-password') return await changeMyPassword(request, env);
        if (path === '/api/v1/auth/revoke-other-sessions') return await revokeOtherSessions(request, env);
        if (path === '/api/v1/me/profile') return await updateMyProfile(request, env);
        if (path === '/api/v1/me/avatar') return await uploadMyAvatar(request, env);
        if (path === '/api/v1/me/blocks') return await updateMyBlocks(request, env);
        if (path === '/api/v1/me/following') return await updateMyFollowing(request, env);
        if (path === '/api/v1/reports') return await reportMember(request, env);
        const reportReviewMatch = /^\/api\/v1\/staff\/reports\/([0-9a-f-]{36})\/review$/i.exec(path);
        if (reportReviewMatch) return await reviewReport(request, env, reportReviewMatch[1]);
        if (path === '/api/v1/auth/logout') {
          await currentUser(request, env);
          await env.DB.prepare('UPDATE auth_sessions SET revoked_at_ms = ? WHERE token_sha256 = ?')
            .bind(Date.now(), await sha256(request.headers.get('Authorization').slice(7))).run();
          return json({ success: true });
        }
        if (path === '/api/v1/rooms') return await createRoom(request, env);
        if (path === '/api/v1/moments') return await createMoment(request, env);
        if (path === '/api/v1/staff/events') return await saveLiveEvent(request, env);
        const dmPostMatch = /^\/api\/v1\/messages\/([0-9]{7,8})$/.exec(path);
        if (dmPostMatch) return await sendDirectMessage(request, env, dmPostMatch[1]);
        const chatPostMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/messages$/i.exec(path);
        if (chatPostMatch) return await sendRoomChat(request, env, chatPostMatch[1]);
        const voiceTokenMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/voice\/token$/i.exec(path);
        if (voiceTokenMatch) return await voiceToken(request, env, voiceTokenMatch[1]);
        const settingsMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/settings$/i.exec(path);
        if (settingsMatch) return await updateRoomSettings(request, env, settingsMatch[1]);
        const moderatorMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/moderators$/i.exec(path);
        if (moderatorMatch) return await setRoomAdmin(request, env, moderatorMatch[1]);
        const memberModerationMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/(kick|block|unblock)$/i.exec(path);
        if (memberModerationMatch) return await moderateMember(request, env, memberModerationMatch[1], memberModerationMatch[2]);
        const lockSeatMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/seats\/([0-9]{1,2})\/(lock|unlock)$/i.exec(path);
        if (lockSeatMatch) return await setSeatLock(request, env, lockSeatMatch[1], Number(lockSeatMatch[2]), lockSeatMatch[3] === 'lock');
        const heartbeatMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/heartbeat$/i.exec(path);
        if (heartbeatMatch) return await roomHeartbeat(request, env, heartbeatMatch[1]);
        const roomActionMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/(join|leave|stand)$/i.exec(path);
        if (roomActionMatch) return await roomAction(request, env, roomActionMatch[1], roomActionMatch[2]);
        const seatMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/seats\/([0-9]{1,2})$/i.exec(path);
        if (seatMatch) return await roomAction(request, env, seatMatch[1], 'sit', Number(seatMatch[2]));
        return json({ error: 'writes_disabled', message: 'Coin, gift, salary, payment and global admin changes are disabled.' }, 403);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);

      if (path === '/' || path === '/health') {
        const result = await env.DB.prepare('SELECT 1 AS ok').first();
        return json({ app: 'SURA CHAT', environment: 'staging', status: result?.ok === 1 ? 'ok' : 'degraded', database: result?.ok === 1 ? 'connected' : 'error', media: env.MEDIA ? 'bound' : 'unavailable', voice: voiceConfigured(env) ? 'realtimekit_enabled' : 'realtimekit_config_required', transactions: 'disabled' }, result?.ok === 1 ? 200 : 503);
      }

      if (path === '/api/v1/auth/sessions') return await readActiveSessions(request, env);
      if (path === '/api/v1/me/blocks') return await listMyBlocks(request, env);
      if (path === '/api/v1/me/social') return await readMySocial(request, env);
      if (path === '/api/v1/me/following') return await listMyFollowing(request, env);
      if (path === '/api/v1/me/followers') return await listMyFollowers(request, env);
      if (path === '/api/v1/me/reports') return await listMyReports(request, env);
      if (path === '/api/v1/staff/access') return await reportStaffAccess(request, env);
      if (path === '/api/v1/staff/reports') return await listReviewQueue(request, env, url);
      if (path === '/api/v1/me/wallets') return await readMyWallets(request, env);
      if (path === '/api/v1/me/daily') return await readMyDailyProgress(request, env);
      if (path === '/api/v1/events') return await listLiveEvents(request, env, url);
      if (path === '/api/v1/staff/events') return await listStaffLiveEvents(request, env);
      if (path === '/api/v1/me') {
        const user = await currentUser(request, env);
        return json({ user: { public_id: user.public_id.replace(/^SC(?=\d+$)/, ''), display_name: user.display_name,
          country_code: user.country_code, email: user.email_normalized, bio: user.bio, avatar_key: user.avatar_key } });
      }

      const memberProfileMatch = /^\/api\/v1\/users\/([0-9]{7,8})$/i.exec(path);
      if (memberProfileMatch) return await memberProfile(request, env, memberProfileMatch[1]);
      const memberAvatarMatch = /^\/api\/v1\/users\/([0-9]{7,8})\/avatar$/i.exec(path);
      if (memberAvatarMatch) return await getAvatar(env, memberAvatarMatch[1]);

      const voiceEligibilityMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/voice\/status$/i.exec(path);
      if (voiceEligibilityMatch) {
        const permission = await voiceEligibility(request, env, voiceEligibilityMatch[1]);
        return json({ configured: voiceConfigured(env), role: permission.role, seat: permission.seat });
      }

      if (path === '/api/v1/config') {
        const { results } = await env.DB.prepare('SELECT setting_key, setting_value FROM public_settings ORDER BY setting_key').all();
        const settings = Object.fromEntries((results ?? []).map(r => [r.setting_key, JSON.parse(r.setting_value)]));
        return json({ app: 'SURA CHAT', design: 'Royal Premium', seats_per_row: 4, allowed_seat_counts: [4, 8, 12, 16], settings });
      }

      if (path === '/api/v1/rooms') {
        return await listRooms(request, env, url);
      }
      if (path === '/api/v1/rankings/rooms') return await roomActivityRanking(request, env, url);
      if (path === '/api/v1/moments') return await listMoments(request, env, url);
      if (path === '/api/v1/messages/threads') return await directInbox(request, env);
      const dmGetMatch = /^\/api\/v1\/messages\/([0-9]{7,8})$/.exec(path);
      if (dmGetMatch) return await directConversation(request, env, dmGetMatch[1], url);

      const manageMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/manage$/i.exec(path);
      if (manageMatch) return await getRoomManagement(request, env, manageMatch[1]);

      const roomSeatsMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/seats$/i.exec(path);
      if (roomSeatsMatch) {
        const room = await env.DB.prepare('SELECT id, name, seat_count, status, announcement FROM rooms WHERE id = ?').bind(roomSeatsMatch[1]).first();
        if (!room) throw new HttpError(404, 'room_not_found');
        const { results } = await env.DB.prepare(`SELECT s.seat_number, s.is_locked, u.public_id, u.display_name, u.avatar_key
          FROM room_seats AS s LEFT JOIN users AS u ON u.id = s.user_id
          WHERE s.room_id = ? AND s.seat_number <= ? ORDER BY s.seat_number`)
          .bind(room.id, room.seat_count).all();
        return json({ room: { id: room.id, name: room.name, seat_count: room.seat_count, status: room.status, announcement: room.announcement }, seats: (results ?? []).map(seat => ({ ...seat, public_id: seat.public_id ? String(seat.public_id).replace(/^SC(?=\d+$)/, '') : null })) });
      }

      const roomChatMatch = /^\/api\/v1\/rooms\/([0-9a-f-]{36})\/messages$/i.exec(path);
      if (roomChatMatch) {
        const after = Number(url.searchParams.get('after') ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, 'invalid_cursor');
        return await roomChat(request, env, roomChatMatch[1], after);
      }

      if (path === '/api/v1/gifts') {
        const category = url.searchParams.get('category');
        const limit = pageSize(url.searchParams.get('limit'));
        const stmt = category && /^[a-z_]{2,24}$/.test(category)
          ? env.DB.prepare('SELECT id, name, category, price_coins, media_key, audio_key, cp_eligible FROM gifts WHERE active = 1 AND category = ? ORDER BY price_coins LIMIT ?').bind(category, limit)
          : env.DB.prepare('SELECT id, name, category, price_coins, media_key, audio_key, cp_eligible FROM gifts WHERE active = 1 ORDER BY price_coins LIMIT ?').bind(limit);
        const { results } = await stmt.all();
        return json({ gifts: results ?? [], count: results?.length ?? 0 });
      }

      return json({ error: 'not_found' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.code }, error.status);
      // Never leak D1 errors or infrastructure details to clients.
      console.error(JSON.stringify({ event: 'sura_api_error', name: error?.name, message: error?.message }));
      return json({ error: 'server_error' }, 500);
    }
  },
};

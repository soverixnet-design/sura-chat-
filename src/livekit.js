// Opt-in Oracle RTC provider. All secrets stay server-side.
// Every WebSocket handshake MUST pass the Nginx authorization subrequest.
const te = new TextEncoder();
const td = new TextDecoder();
export class LivekitError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new LivekitError(status, code); };
const enc = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const dec = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
const pack = value => enc(te.encode(JSON.stringify(value)));
export function livekitConfigured(env) {
  return env.LIVEKIT_ENABLED === 'true' && env.LIVEKIT_URL === 'wss://sura-live.sharika.app' &&
    typeof env.LIVEKIT_API_KEY === 'string' && env.LIVEKIT_API_KEY.length >= 12 &&
    typeof env.LIVEKIT_API_SECRET === 'string' && env.LIVEKIT_API_SECRET.length >= 32;
}
async function key(env, usage) {
  return crypto.subtle.importKey('raw', te.encode(env.LIVEKIT_API_SECRET), {name:'HMAC',hash:'SHA-256'},false,[usage]);
}
export async function signLivekit(env, claims, ttl = 120) {
  if (!livekitConfigured(env)) fail(503,'livekit_not_configured');
  const now = Math.floor(Date.now()/1000);
  const payload = { ...claims, iss:env.LIVEKIT_API_KEY, iat:now, nbf:now-5, exp:now+ttl };
  const input = pack({alg:'HS256',typ:'JWT'})+'.'+pack(payload);
  return input+'.'+enc(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env,'sign'),te.encode(input))));
}
export async function verifyLivekit(env, token) {
  if (!livekitConfigured(env)) fail(503,'livekit_not_configured');
  try {
    if (typeof token !== 'string' || token.length > 8192) throw Error();
    const parts=token.split('.');
    if(parts.length!==3 || parts.some(p=>!p || !/^[A-Za-z0-9_-]+$/.test(p))) throw Error();
    const header=JSON.parse(td.decode(dec(parts[0])));
    if(header.alg!=='HS256') throw Error();
    if(!await crypto.subtle.verify('HMAC',await key(env,'verify'),dec(parts[2]),te.encode(parts[0]+'.'+parts[1]))) throw Error();
    const claims=JSON.parse(td.decode(dec(parts[1]))), now=Math.floor(Date.now()/1000);
    if(claims.iss!==env.LIVEKIT_API_KEY || !Number.isFinite(claims.exp) || claims.exp<=now || !Number.isFinite(claims.nbf) || claims.nbf>now) throw Error();
    return claims;
  } catch { fail(401,'invalid_rtc_token'); }
}
async function roomApi(env, method, room, identity) {
  const token=await signLivekit(env,{video:{roomAdmin:true,room}},30);
  let r;
  try {
    r=await (env.LIVEKIT_FETCH || fetch)('https://sura-live.sharika.app/twirp/livekit.RoomService/'+method,{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({room,identity}),signal:AbortSignal.timeout(10000)
    });
  } catch { fail(503,'livekit_unavailable'); }
  if(r.ok) return;
  // Removing a disconnected participant is idempotent; arbitrary 404/proxy errors aren't.
  let body; try {body=await r.json();} catch { fail(503,'livekit_unavailable'); }
  if(r.status===404 && body.code==='not_found') return;
  fail(503,'livekit_unavailable');
}
export async function revokeLivekit(env, roomId, userId) {
  if(env.LIVEKIT_ENABLED!=='true') return;
  if(!livekitConfigured(env)) fail(503,'livekit_not_configured');
  const row=await env.DB.prepare('SELECT identity FROM sura_livekit_participants WHERE room_id = ? AND user_id = ?').bind(roomId,userId).first();
  if(!row) return;
  // Deny reconnect BEFORE kicking the current socket. Keep the row on failure
  // so the operation can retry; do not silently claim a successful demotion.
  await env.DB.prepare("UPDATE sura_livekit_participants SET status = 'revoking' WHERE room_id = ? AND user_id = ? AND identity = ?").bind(roomId,userId,row.identity).run();
  await roomApi(env,'RemoveParticipant','sura-'+roomId,row.identity);
  await env.DB.prepare('DELETE FROM sura_livekit_participants WHERE room_id = ? AND user_id = ? AND identity = ?').bind(roomId,userId,row.identity).run();
}
export async function issueLivekit(env, roomId, permission, recheck) {
  if(!livekitConfigured(env)) fail(503,'livekit_not_configured');
  await revokeLivekit(env,roomId,permission.user.id);
  const identity=crypto.randomUUID();
  const fresh=await recheck();
  if(!fresh || fresh.role!==permission.role || fresh.seat!==permission.seat) fail(409,'voice_permissions_changed');
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO sura_livekit_participants(room_id,user_id,identity,role,status)
    SELECT ?,?,?,?,'active' WHERE EXISTS (SELECT 1 FROM room_memberships WHERE room_id = ? AND user_id = ? AND left_at IS NULL)`)
    .bind(roomId,permission.user.id,identity,permission.role,roomId,permission.user.id).run();
  if(result.meta?.changes!==1) fail(409,'voice_token_retry');
  const token=await signLivekit(env,{sub:identity,name:permission.user.display_name,video:{
    roomJoin:true,room:'sura-'+roomId,canSubscribe:true,canPublish:permission.role==='speaker',
    canPublishData:false,canPublishSources:['microphone'],canUpdateOwnMetadata:false
  }});
  return {provider:'livekit',url:env.LIVEKIT_URL,token,role:permission.role,seat:permission.seat,expires_in:120};
}
export async function authorizeLivekit(env, token) {
  const claims=await verifyLivekit(env,token);
  if(!/^[0-9a-f-]{36}$/i.test(claims.sub||'') || claims.video?.roomJoin!==true || !/^sura-[0-9a-f-]{36}$/i.test(claims.video?.room||'')) fail(403,'rtc_access_denied');
  const roomId=claims.video.room.slice(5);
  const row=await env.DB.prepare(`SELECT p.role, m.left_at, r.status AS room_status, u.status AS user_status,
    (SELECT seat_number FROM room_seats WHERE room_id = p.room_id AND user_id = p.user_id) AS seat,
    EXISTS(SELECT 1 FROM room_bans WHERE room_id = p.room_id AND user_id = p.user_id) AS banned
    FROM sura_livekit_participants p JOIN room_memberships m ON m.room_id = p.room_id AND m.user_id = p.user_id
    JOIN rooms r ON r.id = p.room_id JOIN users u ON u.id = p.user_id
    WHERE p.identity = ? AND p.room_id = ? AND p.status = 'active'`).bind(claims.sub,roomId).first();
  if(!row || row.left_at || row.room_status==='closed' || row.user_status!=='active' || row.banned) fail(403,'rtc_access_denied');
  const speaker=row.seat!=null;
  if((row.role==='speaker')!==speaker || claims.video.canPublish!==speaker || claims.video.canPublishData!==false ||
     !Array.isArray(claims.video.canPublishSources) || claims.video.canPublishSources.some(s=>s!=='microphone')) fail(403,'rtc_permissions_changed');
  return true;
}

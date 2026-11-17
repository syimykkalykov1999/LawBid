/**
 * OWN CODE — the hotline matching scripts (owner row 87, question 11,
 * approved 16.11 ~19:35 CT: «no ready library exists, keep it small,
 * documented, fully tested»). Searched before writing: jambonz, Open Match,
 * Nakama, FreeSWITCH mod_callcenter, Asterisk app_queue — none is a
 * JavaScript / Valkey skills router. Ideas taken (no code): FreeSWITCH
 * `longest-idle-agent`, Twilio TaskRouter reservations with a timeout, Open
 * Match tickets × pools. Tests: hotline-match.lua.spec.ts (real Valkey).
 *
 * Why Lua: «find a free attorney AND reserve him» must be ONE step, or two
 * clients get the same attorney (and one attorney two clients).
 *
 * Every key is passed in KEYS[] and carries the same `{hl}` hash tag, so a
 * script runs on one Valkey shard (redis-lua-slots.spec.ts).
 *
 * State strings (one HASH field per person / request, no per-entity keys):
 *   attorney  (lst)  i idle · n on the line, not taking calls · p paused ·
 *                    o|<req> offered · b|<req> in a call
 *   request   (rst)  s searching · q queued · o|<lawyer> offered ·
 *                    c|<lawyer> connected (absent = over)
 *   off  SET   requests whose client left («Сообщите, когда появится адвокат»)
 *   rqd  ZSET  "<req>|<lawyer>" pairs the attorney already skipped (expiry)
 *   dl   ZSET  "o|<req>" → the offer's deadline (ms)
 *   rcl  HASH  request → client id (an attorney never gets his own request)
 *   b:<bucket> ZSET attorney → idle since (longest idle first; stale entries
 *              are skipped by state and cleaned by the caller)
 *   q:<bucket> ZSET request → ORIGINAL request time (oldest first, FIFO)
 */

/** KEYS 1..7 of the three matching scripts, in this order. */
export const FIXED_KEYS = 7;

const IDLE_ALIVE = `
local function idle(lw, now)
  return redis.call('HGET', KEYS[1], lw) == 'i'
    and tonumber(redis.call('ZSCORE', KEYS[2], lw) or '0') > now
end
local function skipped(req, lw)
  return redis.call('ZSCORE', KEYS[5], req .. '|' .. lw) ~= false
end
local function online(req)
  return redis.call('SISMEMBER', KEYS[4], req) == 0
end
local function reserve(req, lw, deadline)
  redis.call('HSET', KEYS[1], lw, 'o|' .. req)
  redis.call('HSET', KEYS[3], req, 'o|' .. lw)
  redis.call('ZADD', KEYS[6], deadline, 'o|' .. req)
end
`;

/**
 * A request looks for the longest-idle attorney in its buckets (one per
 * language). Found: reserve both. Not found: the request waits in every
 * bucket queue under its ORIGINAL time (unless that queue is full).
 * KEYS: FIXED, n buckets, n queues. ARGV: req, now, deadline, n, created,
 * maxQueue (0 = none). Returns {'offer', lawyer} | {'queued',''} |
 * {'full',''} | {'skip', state}.
 */
export const MATCH_REQUEST_LUA = `${IDLE_ALIVE}
local req = ARGV[1]
local now = tonumber(ARGV[2])
local n = tonumber(ARGV[4])
local st = redis.call('HGET', KEYS[3], req)
if st ~= 's' and st ~= 'q' then return {'skip', st or ''} end
local client = redis.call('HGET', KEYS[7], req)
if online(req) then
  local best, bestScore = nil, nil
  for i = 1, n do
    local bk = KEYS[FIXED + i]
    local page = redis.call('ZRANGE', bk, 0, 199, 'WITHSCORES')
    for j = 1, #page, 2 do
      local lw, sc = page[j], tonumber(page[j + 1])
      if bestScore and sc >= bestScore then break end
      if lw ~= client and idle(lw, now) and not skipped(req, lw) then
        best, bestScore = lw, sc
        break
      end
    end
  end
  if best then
    reserve(req, best, ARGV[3])
    for i = 1, n do
      local qk = KEYS[FIXED + n + i]
      redis.call('ZREM', qk, req)
    end
    return {'offer', best}
  end
end
if st == 'q' then return {'queued', ''} end
local max = tonumber(ARGV[6])
local added = 0
for i = 1, n do
  local qk = KEYS[FIXED + n + i]
  if max <= 0 or redis.call('ZCARD', qk) < max then
    redis.call('ZADD', qk, 'NX', ARGV[5], req)
    added = added + 1
  end
end
if added == 0 then return {'full', ''} end
redis.call('HSET', KEYS[3], req, 'q')
return {'queued', ''}
`.replace(/FIXED/g, String(FIXED_KEYS));

/**
 * An attorney became free (joined the line, skipped / missed an offer, ended
 * a call): the OLDEST ONLINE request across all his queues gets him (owner
 * rule 1 — offline subscribers are not notified while somebody online
 * waits). None: he becomes idle in every bucket, scored `idleScore`.
 * KEYS: FIXED, m buckets, m queues. ARGV: lawyer, now, deadline, m, idleScore.
 * Returns {'offer', req} | {'idle',''} | {'skip', state} | {'dead',''}.
 */
export const FREE_LAWYER_LUA = `${IDLE_ALIVE}
local lw = ARGV[1]
local now = tonumber(ARGV[2])
local m = tonumber(ARGV[4])
local st = redis.call('HGET', KEYS[1], lw)
if st ~= 'i' then return {'skip', st or ''} end
if not idle(lw, now) then return {'dead', ''} end
local best, bestScore = nil, nil
for i = 1, m do
  local qk = KEYS[FIXED + m + i]
  local page = redis.call('ZRANGE', qk, 0, 49, 'WITHSCORES')
  for j = 1, #page, 2 do
    local r, sc = page[j], tonumber(page[j + 1])
    if bestScore and sc >= bestScore then break end
    if redis.call('HGET', KEYS[3], r) ~= 'q' then
      redis.call('ZREM', qk, r)
    elseif online(r) and not skipped(r, lw)
      and redis.call('HGET', KEYS[7], r) ~= lw then
      best, bestScore = r, sc
      break
    end
  end
end
if best then
  reserve(best, lw, ARGV[3])
  for i = 1, m do
    local qk = KEYS[FIXED + m + i]
    redis.call('ZREM', qk, best)
  end
  return {'offer', best}
end
for i = 1, m do
  local bk = KEYS[FIXED + i]
  redis.call('ZADD', bk, ARGV[5], lw)
end
return {'idle', ''}
`.replace(/FIXED/g, String(FIXED_KEYS));

/**
 * Batch pass for one bucket (bursts: 1000 waiting + 1100 attorneys joining
 * at once): pairs the oldest online requests with the longest-idle attorneys
 * until either side runs out or `limit` pairs. KEYS: FIXED, bucket, queue.
 * ARGV: now, deadline, limit. Returns a flat list req1, lawyer1, req2, …
 */
export const PAIR_BUCKET_LUA = `${IDLE_ALIVE}
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[3])
local bk = KEYS[FIXED + 1]
local qk = KEYS[FIXED + 2]
local out = {}
local reqs = redis.call('ZRANGE', qk, 0, 499)
local lawyers = redis.call('ZRANGE', bk, 0, 499)
local used = {}
for _, r in ipairs(reqs) do
  if #out >= limit * 2 then break end
  if redis.call('HGET', KEYS[3], r) ~= 'q' then
    redis.call('ZREM', qk, r)
  elseif online(r) then
    local client = redis.call('HGET', KEYS[7], r)
    for _, lw in ipairs(lawyers) do
      if not used[lw] and lw ~= client and idle(lw, now)
        and not skipped(r, lw) then
        used[lw] = true
        reserve(r, lw, ARGV[2])
        redis.call('ZREM', qk, r)
        redis.call('ZREM', bk, lw)
        table.insert(out, r)
        table.insert(out, lw)
        break
      end
    end
  end
end
return out
`.replace(/FIXED/g, String(FIXED_KEYS));

/** «Взять»: idempotent. KEYS: lst, rst, dl. ARGV: req, lawyer, now.
 * Returns ok | already | late | gone. */
export const ACCEPT_LUA = `
local req, lw = ARGV[1], ARGV[2]
local rs = redis.call('HGET', KEYS[2], req)
if rs == 'c|' .. lw then return 'already' end
if rs ~= 'o|' .. lw then return 'gone' end
local d = redis.call('ZSCORE', KEYS[3], 'o|' .. req)
if d and tonumber(d) < tonumber(ARGV[3]) then return 'late' end
redis.call('HSET', KEYS[2], req, 'c|' .. lw)
redis.call('HSET', KEYS[1], lw, 'b|' .. req)
redis.call('ZREM', KEYS[3], 'o|' .. req)
return 'ok'
`;

/**
 * An offer ends without «Взять». mode: declined | timeout | conflict (the
 * pair is remembered, the request searches again under its original time),
 * offline (the attorney left: no memory, his state is dropped). KEYS: lst,
 * rst, dl, rqd. ARGV: req, lawyer, mode, rqdExpiry. Returns ok | gone.
 */
export const RELEASE_LUA = `
local req, lw, mode = ARGV[1], ARGV[2], ARGV[3]
if redis.call('HGET', KEYS[2], req) ~= 'o|' .. lw then return 'gone' end
redis.call('ZREM', KEYS[3], 'o|' .. req)
redis.call('HSET', KEYS[2], req, 's')
if mode ~= 'offline' then
  redis.call('ZADD', KEYS[4], ARGV[4], req .. '|' .. lw)
end
if redis.call('HGET', KEYS[1], lw) == 'o|' .. req then
  if mode == 'offline' then
    redis.call('HDEL', KEYS[1], lw)
  else
    redis.call('HSET', KEYS[1], lw, 'i')
  end
end
return 'ok'
`;

/** A connected call ended (either side, idempotent). KEYS: lst, rst. ARGV:
 * req, lawyer, next (i | n | x = drop). Returns ok | gone. */
export const END_CALL_LUA = `
local req, lw = ARGV[1], ARGV[2]
if redis.call('HGET', KEYS[2], req) ~= 'c|' .. lw then return 'gone' end
redis.call('HDEL', KEYS[2], req)
if redis.call('HGET', KEYS[1], lw) == 'b|' .. req then
  if ARGV[3] == 'x' then
    redis.call('HDEL', KEYS[1], lw)
  else
    redis.call('HSET', KEYS[1], lw, ARGV[3])
  end
end
return 'ok'
`;

/**
 * The client cancels / leaves / expires (not a connected call). An offered
 * attorney is freed. KEYS: lst, rst, dl, off, ntf, n queues. ARGV: req, n.
 * Returns {'cancelled', freedLawyer or ''} | {'connected', lawyer} | {'gone',''}.
 */
export const CANCEL_LUA = `
local req = ARGV[1]
local n = tonumber(ARGV[2])
local rs = redis.call('HGET', KEYS[2], req)
if not rs then return {'gone', ''} end
local kind = string.sub(rs, 1, 2)
if kind == 'c|' then return {'connected', string.sub(rs, 3)} end
local freed = ''
if kind == 'o|' then
  freed = string.sub(rs, 3)
  redis.call('ZREM', KEYS[3], 'o|' .. req)
  if redis.call('HGET', KEYS[1], freed) == 'o|' .. req then
    redis.call('HSET', KEYS[1], freed, 'i')
  else
    freed = ''
  end
end
redis.call('HDEL', KEYS[2], req)
redis.call('SREM', KEYS[4], req)
redis.call('ZREM', KEYS[5], req)
for i = 1, n do
  local qk = KEYS[5 + i]
  redis.call('ZREM', qk, req)
end
return {'cancelled', freed}
`;

/** The attorney is on the line (join or heartbeat after a gap). KEYS: lst,
 * alive. ARGV: lawyer, expiry, accepting (1/0). Returns new | <state>. */
export const LAWYER_ON_LUA = `
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
local s = redis.call('HGET', KEYS[1], ARGV[1])
if not s then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[3] == '1' and 'i' or 'n')
  return 'new'
end
return s
`;

/** The attorney left the line. A call or an offer keeps its state (the
 * caller ends / releases it). KEYS: lst, alive. ARGV: lawyer.
 * Returns {'off',''} | {'b|', req} | {'o|', req}. */
export const LAWYER_OFF_LUA = `
local s = redis.call('HGET', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
if not s then return {'off', ''} end
local kind = string.sub(s, 1, 2)
if kind == 'b|' or kind == 'o|' then return {kind, string.sub(s, 3)} end
redis.call('HDEL', KEYS[1], ARGV[1])
return {'off', ''}
`;

/** Compare-and-set of one attorney's state. KEYS: lst. ARGV: lawyer, from,
 * to. Returns 1 when changed. */
export const CAS_LUA = `
if redis.call('HGET', KEYS[1], ARGV[1]) ~= ARGV[2] then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1
`;

/** The waiting client tapped «Сообщите, когда появится адвокат» and left:
 * the entry stays in its queues with its time, as OFFLINE. KEYS: rst, off.
 * ARGV: req. Returns 1 | 0 (not waiting). */
export const GO_OFFLINE_LUA = `
if redis.call('HGET', KEYS[1], ARGV[1]) ~= 'q' then return 0 end
redis.call('SADD', KEYS[2], ARGV[1])
return 1
`;

/** «Позвонить сейчас»: an offline entry becomes ONLINE again with its
 * ORIGINAL time (double taps are fine). KEYS: rst, off, ntf. ARGV: req.
 * Returns 1 | 0 (the request is over). */
export const CLAIM_LUA = `
if redis.call('HGET', KEYS[1], ARGV[1]) ~= 'q' then return 0 end
redis.call('SREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
return 1
`;

/**
 * Owner rule 2: only when a bucket has free attorneys and NO online entry,
 * notify offline entries, oldest first: ceil(free × pct / 100) minus the
 * notices still open, at most `budget` (the per-second rate), never inside
 * the client's night window. KEYS: lst, alive, rst, off, ntf, nq (req →
 * "offsetMin,startMin,endMin"), natt (req → notices sent), bucket, queue.
 * ARGV: now, pct, claimExpiry, budget. Returns {free, outstanding, req…}.
 */
export const NOTIFY_PICK_LUA = `
local now = tonumber(ARGV[1])
local free = 0
for _, lw in ipairs(redis.call('ZRANGE', KEYS[8], 0, 499)) do
  if redis.call('HGET', KEYS[1], lw) == 'i'
    and tonumber(redis.call('ZSCORE', KEYS[2], lw) or '0') > now then
    free = free + 1
  end
end
local out = {free, 0}
if free == 0 then return out end
local function quiet(r)
  local spec = redis.call('HGET', KEYS[6], r)
  if not spec then return false end
  local off, s, e = string.match(spec, '(-?%d+),(%d+),(%d+)')
  off, s, e = tonumber(off), tonumber(s), tonumber(e)
  if s == e then return false end
  local mins = (math.floor(now / 60000) + off) % 1440
  if s < e then return mins >= s and mins < e end
  return mins >= s or mins < e
end
local outstanding, picks = 0, {}
for _, r in ipairs(redis.call('ZRANGE', KEYS[9], 0, 999)) do
  if redis.call('HGET', KEYS[3], r) == 'q' then
    if redis.call('SISMEMBER', KEYS[4], r) == 0 then
      return out
    end
    local open = redis.call('ZSCORE', KEYS[5], r)
    if open and tonumber(open) > now then
      outstanding = outstanding + 1
    elseif not quiet(r) then
      table.insert(picks, r)
    end
  end
end
out[2] = outstanding
local want = math.ceil(free * tonumber(ARGV[2]) / 100) - outstanding
want = math.min(want, tonumber(ARGV[4]))
for i = 1, math.min(want, #picks) do
  redis.call('ZADD', KEYS[5], ARGV[3], picks[i])
  redis.call('HINCRBY', KEYS[7], picks[i], 1)
  table.insert(out, picks[i])
end
return out
`;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

const MAX_NAME_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 500;
const MAX_BODY_BYTES = 4096;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 9;
const PASSWORD_ITERATIONS = 100000;
const PAGE_SIZE = 50;
const RATE_WINDOW_SECONDS = 3600;
const RATE_LIMITS = { write: 20, manage: 10, like: 60 };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function normalizedText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
  if (!normalized || normalized.length > maxLength) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
}

function visibleText(value) {
  return typeof value === "string"
    && /[\p{L}\p{N}]/u.test(value.replace(/[\u200B-\u200D\u2060\uFEFF\s\p{P}\p{S}]/gu, ""));
}

function validPassword(value) {
  return typeof value === "string"
    && value.length >= MIN_PASSWORD_LENGTH
    && value.length <= MAX_PASSWORD_LENGTH
    && /^[\x21-\x7E]+$/.test(value);
}

function rateLimitKey(request, action, now = Date.now()) {
  const hourBucket = Math.floor(now / (RATE_WINDOW_SECONDS * 1000));
  return `guestbook:${action}:${request.headers.get("CF-Connecting-IP") || "unknown"}:${hourBucket}`;
}

async function enforceRateLimit(request, env, action, now = Date.now()) {
  if (!env.GUESTBOOK_LIMITER) {
    return jsonResponse({ error: "방명록 요청 제한 설정이 아직 연결되지 않았습니다." }, 503);
  }
  const key = rateLimitKey(request, action, now);
  const current = Number(await env.GUESTBOOK_LIMITER.get(key) || 0);
  if (current >= RATE_LIMITS[action]) {
    const error = action === "write"
      ? "한 시간에 방명록을 20번까지 남길 수 있습니다."
      : action === "manage"
        ? "수정·삭제는 한 시간에 10번까지 시도할 수 있습니다."
        : "공감은 한 시간에 60번까지 누를 수 있습니다.";
    return jsonResponse({ error }, 429);
  }
  await env.GUESTBOOK_LIMITER.put(key, String(current + 1), { expirationTtl: RATE_WINDOW_SECONDS * 2 });
  return null;
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { response: jsonResponse({ error: "JSON 형식으로 요청해주세요." }, 415) };
  }
  const lengthHeader = request.headers.get("Content-Length");
  const length = lengthHeader === null ? NaN : Number(lengthHeader);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return { response: jsonResponse({ error: "요청이 너무 큽니다." }, 413) };
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return { response: jsonResponse({ error: "요청이 너무 큽니다." }, 413) };
    }
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { response: jsonResponse({ error: "올바른 JSON 요청이 아닙니다." }, 400) };
    }
    return { value };
  } catch {
    return { response: jsonResponse({ error: "올바른 JSON 요청이 아닙니다." }, 400) };
  }
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i += 1) result[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return result;
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, key, 256,
  );
  return new Uint8Array(bits);
}

async function createPasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesToHex(salt), hash: bytesToHex(await hashPassword(password, salt)) };
}

async function verifyPassword(password, saltHex, hashHex) {
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  if (!salt || !expected || expected.length !== 32) return false;
  const actual = await hashPassword(password, salt);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected[i] ^ actual[i];
  return mismatch === 0;
}

async function handleGet(request, env) {
  try {
    const beforeId = new URL(request.url).searchParams.get("beforeId");
    const cursor = beforeId === null ? null : Number(beforeId);
    if (beforeId !== null && (!Number.isSafeInteger(cursor) || cursor < 1)) {
      return jsonResponse({ error: "페이지 커서를 확인해주세요." }, 400);
    }
    const query = cursor === null
      ? env.DB.prepare("SELECT id, name, message, created_at, likes, password_hash FROM guestbook_entries ORDER BY id DESC LIMIT ?").bind(PAGE_SIZE + 1)
      : env.DB.prepare("SELECT id, name, message, created_at, likes, password_hash FROM guestbook_entries WHERE id < ? ORDER BY id DESC LIMIT ?").bind(cursor, PAGE_SIZE + 1);
    const result = await query.all();
    const hasMore = result.results.length > PAGE_SIZE;
    const rows = result.results.slice(0, PAGE_SIZE);
    return jsonResponse({
      entries: rows.map((row) => ({
        id: row.id,
        name: row.name,
        message: row.message,
        createdAt: `${row.created_at}Z`,
        likes: row.likes,
        canManage: Boolean(row.password_hash),
      })),
      nextBeforeId: hasMore && rows.length ? rows[rows.length - 1].id : null,
    });
  } catch {
    return jsonResponse({ error: "방명록을 불러오지 못했습니다." }, 500);
  }
}

async function handlePost(request, env, payload) {
  const name = normalizedText(payload.name, MAX_NAME_LENGTH);
  const message = normalizedText(payload.message, MAX_MESSAGE_LENGTH);
  if (!name || /[\r\n\t]/.test(name) || !visibleText(name) || !message || !visibleText(message) || !validPassword(payload.password)) {
    return jsonResponse({ error: "이름은 1~40자, 메시지는 1~500자, 비밀번호는 영문·숫자·기호 4~9자로 입력해주세요." }, 400);
  }
  const limited = await enforceRateLimit(request, env, "write");
  if (limited) return limited;
  try {
    const credential = await createPasswordHash(payload.password);
    const row = await env.DB.prepare(
      "INSERT INTO guestbook_entries (name, message, password_salt, password_hash) VALUES (?, ?, ?, ?) RETURNING id, name, message, created_at, likes",
    ).bind(name, message, credential.salt, credential.hash).first();
    return jsonResponse({ entry: {
      id: row.id, name: row.name, message: row.message, createdAt: `${row.created_at}Z`,
      likes: row.likes, canManage: true,
    } }, 201);
  } catch {
    return jsonResponse({ error: "방명록을 등록하지 못했습니다. 잠시 후 다시 시도해주세요." }, 500);
  }
}

async function handleManage(request, env, method, payload) {
  const id = Number(payload.id);
  if (!Number.isSafeInteger(id) || id < 1 || !validPassword(payload.password)) {
    return jsonResponse({ error: "방명록 번호와 영문·숫자·기호 4~9자 비밀번호를 확인해주세요." }, 400);
  }
  const message = method === "PATCH" ? normalizedText(payload.message, MAX_MESSAGE_LENGTH) : null;
  if (method === "PATCH" && (!message || !visibleText(message))) return jsonResponse({ error: "메시지는 보이는 글자를 포함해 1~500자로 입력해주세요." }, 400);
  const limited = await enforceRateLimit(request, env, "manage");
  if (limited) return limited;
  try {
    const entry = await env.DB.prepare(
      "SELECT password_salt, password_hash FROM guestbook_entries WHERE id = ?",
    ).bind(id).first();
    if (!entry || !entry.password_salt || !entry.password_hash) {
      return jsonResponse({ error: "이 방명록은 수정하거나 삭제할 수 없습니다." }, 404);
    }
    if (!await verifyPassword(payload.password, entry.password_salt, entry.password_hash)) {
      return jsonResponse({ error: "비밀번호가 일치하지 않습니다." }, 403);
    }
    if (method === "DELETE") {
      const deleted = await env.DB.prepare("DELETE FROM guestbook_entries WHERE id = ? RETURNING id").bind(id).first();
      return deleted ? jsonResponse({ deleted: true, id }) : jsonResponse({ error: "방명록을 찾을 수 없습니다." }, 404);
    }
    const updated = await env.DB.prepare(
      "UPDATE guestbook_entries SET message = ? WHERE id = ? RETURNING id, name, message, created_at, likes",
    ).bind(message, id).first();
    if (!updated) return jsonResponse({ error: "방명록을 찾을 수 없습니다." }, 404);
    return jsonResponse({ entry: {
      id: updated.id, name: updated.name, message: updated.message, createdAt: `${updated.created_at}Z`,
      likes: updated.likes, canManage: true,
    } });
  } catch {
    return jsonResponse({ error: "요청을 처리하지 못했습니다." }, 500);
  }
}

async function handleLike(request, env, payload) {
  const id = Number(payload.id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonResponse({ error: "방명록 번호를 확인해주세요." }, 400);
  const limited = await enforceRateLimit(request, env, "like");
  if (limited) return limited;
  try {
    const row = await env.DB.prepare(
      "UPDATE guestbook_entries SET likes = likes + 1 WHERE id = ? RETURNING id, likes",
    ).bind(id).first();
    return row ? jsonResponse({ id: row.id, likes: row.likes }) : jsonResponse({ error: "방명록을 찾을 수 없습니다." }, 404);
  } catch {
    return jsonResponse({ error: "공감을 등록하지 못했습니다." }, 500);
  }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/guestbook") return jsonResponse({ error: "요청한 경로를 찾을 수 없습니다." }, 404);
  if (!env.DB) return jsonResponse({ error: "방명록 데이터베이스가 아직 연결되지 않았습니다." }, 503);
  if (request.method === "GET") return handleGet(request, env);
  if (!["POST", "PATCH", "DELETE"].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...JSON_HEADERS, Allow: "GET, POST, PATCH, DELETE" } });
  }
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  if (request.method === "POST" && parsed.value.action === "like") return handleLike(request, env, parsed.value);
  if (request.method === "POST") return handlePost(request, env, parsed.value);
  return handleManage(request, env, request.method, parsed.value);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
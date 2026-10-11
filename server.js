const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Pool } = require("pg");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const PROBLEMS_FILE = path.join(ROOT, "problems.json");
const DATA_DIR = path.resolve(process.env.OJ_DATA_DIR || ROOT);
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const DATABASE_URL = process.env.DATABASE_URL || "";
const JUDGE_URL = (process.env.JUDGE0_URL || "").replace(/\/+$/, "");
const JUDGE_KEY = process.env.JUDGE0_API_KEY || "";
const ADMIN_REGISTRATION_PASSWORD = process.env.ADMIN_REGISTRATION_PASSWORD || "";
const SECURE_COOKIE = process.env.COOKIE_SECURE === "true";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);
const LANGUAGES = {
  c: { id: 50, name: "C17" },
  cpp: { id: 54, name: "C++17" },
  python: { id: 71, name: "Python 3" },
  javascript: { id: 63, name: "JavaScript" }
};
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};
const recentSubmissions = new Map();
const sessions = new Map();
let storeQueue = Promise.resolve();
const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
  : null;
if (pool) {
  pool.on("error", (error) => {
    console.error("PostgreSQL idle client error:", error.message);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function readJson(request, maxBytes = 48 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let oversized = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (oversized) return;
      body += chunk;
      oversized = Buffer.byteLength(body, "utf8") > maxBytes;
    });
    request.on("end", () => {
      if (oversized) {
        reject(new Error(`请求内容过大，最多允许 ${Math.floor(maxBytes / 1024)} KB。`));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("请求内容不是有效的 JSON。"));
      }
    });
    request.on("error", reject);
  });
}

function normalizeOutput(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

async function judgeCase(languageId, sourceCode, testCase) {
  const headers = { "Content-Type": "application/json" };
  if (JUDGE_KEY) headers["X-Auth-Token"] = JUDGE_KEY;

  const createResponse = await fetch(
    `${JUDGE_URL}/submissions?base64_encoded=false&wait=false`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        language_id: languageId,
        source_code: sourceCode,
        stdin: testCase.input,
        expected_output: testCase.output,
        cpu_time_limit: 2,
        memory_limit: 128000
      }),
      signal: AbortSignal.timeout(15_000)
    }
  );
  if (!createResponse.ok) {
    throw new Error(`评测服务创建任务失败（HTTP ${createResponse.status}）。`);
  }
  const created = await createResponse.json();
  if (!created.token) throw new Error("评测服务未返回任务编号。");

  const resultUrl = `${JUDGE_URL}/submissions/${encodeURIComponent(created.token)}?base64_encoded=false&fields=status,time,memory,stdout,compile_output,message`;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const resultResponse = await fetch(resultUrl, {
      headers: JUDGE_KEY ? { "X-Auth-Token": JUDGE_KEY } : {},
      signal: AbortSignal.timeout(10_000)
    });
    if (!resultResponse.ok) {
      throw new Error(`评测服务查询失败（HTTP ${resultResponse.status}）。`);
    }
    const result = await resultResponse.json();
    if (result.status && result.status.id > 2) return result;
  }
  throw new Error("评测超时，请检查评测服务后重试。");
}

function readFileStore(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error(`数据文件读取失败：${path.basename(filePath)}`);
  }
}

function storeTable(filePath) {
  if (filePath === USERS_FILE) return "users";
  if (filePath === SUBMISSIONS_FILE) return "submissions";
  throw new Error("Unknown data store.");
}

async function readStore(filePath) {
  if (!pool) return readFileStore(filePath);
  const table = storeTable(filePath);
  const order = table === "submissions" ? "DESC" : "ASC";
  const result = await pool.query(`SELECT payload FROM oj_${table} ORDER BY created_at ${order}`);
  return result.rows.map((row) => row.payload);
}

async function replaceDatabaseRows(client, table, rows) {
  const ids = rows.map((row) => row.id);
  await client.query(`DELETE FROM oj_${table} WHERE NOT (id = ANY($1::text[]))`, [ids]);
  if (!rows.length) return;
  if (table === "users") {
    await client.query(
      `INSERT INTO oj_users (id, username_key, created_at, payload)
       SELECT id, username_key, created_at, payload
       FROM jsonb_to_recordset($1::jsonb) AS item(id text, username_key text, created_at timestamptz, payload jsonb)
       ON CONFLICT (id) DO UPDATE SET username_key = EXCLUDED.username_key, created_at = EXCLUDED.created_at, payload = EXCLUDED.payload`,
      [JSON.stringify(rows.map((row) => ({
        id: row.id,
        username_key: row.username.toLocaleLowerCase(),
        created_at: row.createdAt,
        payload: row
      })))]
    );
    return;
  }
  await client.query(
    `INSERT INTO oj_submissions (id, user_id, created_at, payload)
     SELECT id, user_id, created_at, payload
     FROM jsonb_to_recordset($1::jsonb) AS item(id text, user_id text, created_at timestamptz, payload jsonb)
     ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, created_at = EXCLUDED.created_at, payload = EXCLUDED.payload`,
    [JSON.stringify(rows.map((row) => ({
      id: row.id,
      user_id: row.userId,
      created_at: row.createdAt,
      payload: row
    })))]
  );
}

async function updateDatabaseStore(filePath, update) {
  const table = storeTable(filePath);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(732781021)");
    const order = table === "submissions" ? "DESC" : "ASC";
    const result = await client.query(`SELECT payload FROM oj_${table} ORDER BY created_at ${order}`);
    const currentRows = result.rows.map((row) => row.payload);
    const updated = await update(currentRows);
    if (updated.write !== false) await replaceDatabaseRows(client, table, updated.rows);
    await client.query("COMMIT");
    return updated.value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function updateFileStore(filePath, update) {
  const operation = storeQueue.then(async () => {
    const rows = readFileStore(filePath);
    const result = await update(rows);
    if (result.write !== false) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(result.rows), { encoding: "utf8", mode: 0o600 });
      fs.renameSync(tempPath, filePath);
    }
    return result.value;
  });
  storeQueue = operation.catch(() => {});
  return operation;
}

function updateStore(filePath, update) {
  return pool ? updateDatabaseStore(filePath, update) : updateFileStore(filePath, update);
}

async function initializeDatabase() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oj_users (
      id text PRIMARY KEY,
      username_key text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL,
      payload jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oj_submissions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      created_at timestamptz NOT NULL,
      payload jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS oj_submissions_user_created_idx
      ON oj_submissions (user_id, created_at DESC);
  `);
  for (const filePath of [USERS_FILE, SUBMISSIONS_FILE]) {
    const table = storeTable(filePath);
    const count = await pool.query(`SELECT COUNT(*)::int AS count FROM oj_${table}`);
    if (count.rows[0].count === 0) {
      const legacyRows = readFileStore(filePath);
      if (legacyRows.length) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(732781021)");
          const currentCount = await client.query(`SELECT COUNT(*)::int AS count FROM oj_${table}`);
          if (currentCount.rows[0].count === 0) {
            await replaceDatabaseRows(client, table, legacyRows);
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
    }
  }
  console.log("PostgreSQL database is ready.");
}

function safeUser(user) {
  return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}

function readCookie(request, name) {
  const cookieHeader = request.headers.cookie || "";
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    }
  }
  return null;
}

async function currentUser(request) {
  const token = readCookie(request, "ll_oj_session");
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const session = sessions.get(tokenHash);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(tokenHash);
    return null;
  }
  const user = (await readStore(USERS_FILE)).find((row) => row.id === session.userId);
  return user ? safeUser(user) : null;
}

function setSessionCookie(response, token, maxAge) {
  const secure = SECURE_COOKIE ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `ll_oj_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
  );
}

function createSession(response, user) {
  for (const [hash, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(hash);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  sessions.set(tokenHash, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
  setSessionCookie(response, token, Math.floor(SESSION_TTL_MS / 1000));
}

function clearSession(request, response) {
  const token = readCookie(request, "ll_oj_session");
  if (token) {
    sessions.delete(crypto.createHash("sha256").update(token).digest("hex"));
  }
  setSessionCookie(response, "", 0);
}

async function requireUser(request, response) {
  const user = await currentUser(request);
  if (!user) {
    sendJson(response, 401, { error: "请先登录后再继续。" });
    return null;
  }
  return user;
}

async function requireAdmin(request, response) {
  const user = await requireUser(request, response);
  if (user && user.role !== "admin") {
    sendJson(response, 403, { error: "此操作仅管理员可用。" });
    return null;
  }
  return user;
}

function verifySameOrigin(request, response) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    if (new URL(origin).host === request.headers.host) return true;
  } catch {
    // A malformed Origin is rejected below.
  }
  sendJson(response, 403, { error: "请求来源无效，请刷新页面后重试。" });
  return false;
}

function checkNamedRateLimit(request, name, limit, windowMs = 60_000) {
  const key = `${name}:${request.socket.remoteAddress || "local"}`;
  const now = Date.now();
  const recent = (recentSubmissions.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  recentSubmissions.set(key, recent);
  return true;
}

function registrationCodeMatches(candidate) {
  if (!ADMIN_REGISTRATION_PASSWORD || typeof candidate !== "string") return false;
  const configuredHash = crypto.createHash("sha256").update(ADMIN_REGISTRATION_PASSWORD).digest();
  const candidateHash = crypto.createHash("sha256").update(candidate).digest();
  return crypto.timingSafeEqual(configuredHash, candidateHash);
}

async function registerAccount(request, response) {
  if (!verifySameOrigin(request, response)) return;
  if (!checkNamedRateLimit(request, "register", 5)) {
    sendJson(response, 429, { error: "注册请求过于频繁，请稍后再试。" });
    return;
  }
  let payload;
  try {
    payload = await readJson(request, 12 * 1024);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    sendJson(response, 400, { error: "注册参数无效。" });
    return;
  }
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const role = payload.role;
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
    sendJson(response, 400, { error: "用户名需为 3–24 个字母、数字、汉字、下划线或连字符。" });
    return;
  }
  if (password.length < 10 || password.length > 128) {
    sendJson(response, 400, { error: "密码长度需为 10–128 个字符。" });
    return;
  }
  if (role !== "student" && role !== "admin") {
    sendJson(response, 400, { error: "请选择学生或管理员角色。" });
    return;
  }
  if (role === "admin" && !registrationCodeMatches(payload.adminCode)) {
    sendJson(response, 403, {
      error: ADMIN_REGISTRATION_PASSWORD
        ? "管理员注册口令不正确。"
        : "管理员注册暂未启用，请由站点所有者配置注册口令。"
    });
    return;
  }

  const salt = crypto.randomBytes(16);
  const passwordHash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  let createdUser;
  try {
    createdUser = await updateStore(USERS_FILE, (users) => {
      if (users.some((user) => user.username.toLocaleLowerCase() === username.toLocaleLowerCase())) {
        return { write: false, rows: users, value: null };
      }
      const user = {
        id: crypto.randomUUID(),
        username,
        role,
        salt: salt.toString("hex"),
        passwordHash: passwordHash.toString("hex"),
        createdAt: new Date().toISOString()
      };
      return { rows: [...users, user], value: user };
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "账户无法保存，请检查服务器数据目录。" });
    return;
  }
  if (!createdUser) {
    sendJson(response, 409, { error: "该用户名已被使用。" });
    return;
  }
  createSession(response, createdUser);
  sendJson(response, 201, { user: safeUser(createdUser) });
}

async function loginAccount(request, response) {
  if (!verifySameOrigin(request, response)) return;
  if (!checkNamedRateLimit(request, "login", 10)) {
    sendJson(response, 429, { error: "登录尝试过于频繁，请一分钟后重试。" });
    return;
  }
  let payload;
  try {
    payload = await readJson(request, 12 * 1024);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    sendJson(response, 400, { error: "登录参数无效。" });
    return;
  }
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (username.length > 24 || password.length > 128) {
    sendJson(response, 400, { error: "用户名或密码格式无效。" });
    return;
  }
  let users;
  try {
    users = await readStore(USERS_FILE);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "账户数据读取失败。" });
    return;
  }
  const user = users.find((row) => row.username.toLocaleLowerCase() === username.toLocaleLowerCase());
  const salt = user ? Buffer.from(user.salt, "hex") : Buffer.alloc(16);
  const actualHash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const expectedHash = user ? Buffer.from(user.passwordHash, "hex") : Buffer.alloc(64);
  if (!user || !crypto.timingSafeEqual(actualHash, expectedHash)) {
    sendJson(response, 401, { error: "用户名或密码不正确。" });
    return;
  }
  createSession(response, user);
  sendJson(response, 200, { user: safeUser(user) });
}

async function handleSubmission(request, response, user) {
  if (!JUDGE_URL) {
    sendJson(response, 503, {
      error: "尚未配置评测服务。请在启动前设置 JUDGE0_URL；评测代码会发送至你配置的 Judge0 服务。"
    });
    return;
  }
  if (!checkNamedRateLimit(request, "submit", 5)) {
    sendJson(response, 429, { error: "提交过于频繁，请稍后再试。" });
    return;
  }

  let payload;
  try {
    payload = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  if (!payload || typeof payload !== "object") {
    sendJson(response, 400, { error: "提交参数无效。" });
    return;
  }
  const { problemId, language, code } = payload;
  if (typeof code !== "string" || !code.trim() || Buffer.byteLength(code, "utf8") > 32 * 1024) {
    sendJson(response, 400, { error: "代码不能为空且不能超过 32 KB。" });
    return;
  }
  if (!Object.hasOwn(LANGUAGES, language)) {
    sendJson(response, 400, { error: "暂不支持所选编程语言。" });
    return;
  }

  let problems;
  try {
    problems = JSON.parse(fs.readFileSync(PROBLEMS_FILE, "utf8"));
  } catch {
    sendJson(response, 500, { error: "题库读取失败。" });
    return;
  }
  const problem = problems.find((item) => item.id === problemId);
  if (!problem || !Array.isArray(problem.tests) || problem.tests.length === 0) {
    sendJson(response, 404, { error: "题目不存在或尚无测试数据。" });
    return;
  }

  try {
    const results = [];
    let failedIndex = -1;
    for (let index = 0; index < problem.tests.length; index += 1) {
      const result = await judgeCase(LANGUAGES[language].id, code, problem.tests[index]);
      results.push(result);
      if (
        result.status.id !== 3 ||
        normalizeOutput(result.stdout || "") !== normalizeOutput(problem.tests[index].output)
      ) {
        failedIndex = index;
        break;
      }
    }
    const firstFailure = failedIndex >= 0 ? results[failedIndex] : null;
    const verdict = !firstFailure
      ? "Accepted"
      : firstFailure.status.id === 6
        ? "Compilation Error"
        : firstFailure.status.id === 5
          ? "Time Limit Exceeded"
          : firstFailure.status.id >= 7 && firstFailure.status.id <= 12
            ? "Runtime Error"
            : "Wrong Answer";
    const responseBody = {
      verdict,
      passed: failedIndex < 0 ? results.length : failedIndex,
      total: problem.tests.length,
      time: firstFailure ? firstFailure.time : results.reduce((sum, item) => sum + Number(item.time || 0), 0),
      memory: firstFailure ? firstFailure.memory : Math.max(...results.map((item) => Number(item.memory || 0))),
      failedCase: failedIndex < 0 ? null : failedIndex + 1,
      compileOutput: firstFailure && firstFailure.compile_output
        ? firstFailure.compile_output.slice(0, 4000)
        : null
    };
    const submission = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      problemId: problem.id,
      title: problem.title,
      language: LANGUAGES[language].name,
      verdict,
      passed: failedIndex < 0 ? results.length : failedIndex,
      total: problem.tests.length,
      createdAt: new Date().toISOString()
    };
    await updateStore(SUBMISSIONS_FILE, (submissions) => ({
      rows: [submission, ...submissions].slice(0, 5000),
      value: undefined
    }));
    sendJson(response, 200, responseBody);
  } catch (error) {
    console.error("Submission processing failed:", error);
    if (!response.headersSent) {
      sendJson(response, 502, { error: error.message || "无法连接评测服务。" });
    }
  }
}

async function handleAdminOverview(response) {
  try {
    const users = await readStore(USERS_FILE);
    const submissions = await readStore(SUBMISSIONS_FILE);
    sendJson(response, 200, {
      students: users.filter((user) => user.role === "student").length,
      admins: users.filter((user) => user.role === "admin").length,
      submissions: submissions.length,
      accepted: submissions.filter((item) => item.verdict === "Accepted").length,
      latestUsers: users
        .slice()
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 10)
        .map(safeUser)
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "管理员数据读取失败。" });
  }
}

function sendProblemList(response) {
  try {
    const problems = JSON.parse(fs.readFileSync(PROBLEMS_FILE, "utf8"));
    sendJson(response, 200, problems.map(({ tests, ...publicProblem }) => publicProblem));
  } catch (error) {
    console.error("Problem catalogue could not be loaded:", error);
    sendJson(response, 500, { error: "题库读取失败。" });
  }
}

async function handleLocalResult(request, response, user) {
  if (!verifySameOrigin(request, response)) return;
  let payload;
  try {
    payload = await readJson(request, 8 * 1024);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    sendJson(response, 400, { error: "评测记录格式无效。" });
    return;
  }
  const { problemId, language, verdict, passed, total, time, failedCase } = payload;
  const problem = JSON.parse(fs.readFileSync(PROBLEMS_FILE, "utf8"))
    .find((item) => item.id === problemId);
  if (
    !problem ||
    !Object.hasOwn(LANGUAGES, language) ||
    !["Accepted", "Wrong Answer", "Compilation Error", "Runtime Error", "Time Limit Exceeded"].includes(verdict) ||
    !Number.isInteger(passed) ||
    !Number.isInteger(total) ||
    total !== problem.tests.length ||
    passed < 0 ||
    passed > total ||
    (verdict === "Accepted" && passed !== total) ||
    (verdict !== "Accepted" && passed >= total) ||
    (time !== undefined && (!Number.isFinite(time) || time < 0 || time > 60)) ||
    (failedCase !== null && failedCase !== undefined && (!Number.isInteger(failedCase) || failedCase < 1 || failedCase > total))
  ) {
    sendJson(response, 400, { error: "评测记录内容无效。" });
    return;
  }
  const submission = {
    id: crypto.randomUUID(),
    userId: user.id,
    username: user.username,
    problemId: problem.id,
    title: problem.title,
    language: LANGUAGES[language].name,
    verdict,
    passed,
    total,
    evaluationSource: "本机评测（用户设备）",
    createdAt: new Date().toISOString()
  };
  try {
    await updateStore(SUBMISSIONS_FILE, (submissions) => ({
      rows: [submission, ...submissions].slice(0, 5000),
      value: undefined
    }));
    sendJson(response, 201, { submission: (({ userId, ...publicSubmission }) => publicSubmission)(submission) });
  } catch (error) {
    console.error("Local evaluation report could not be stored:", error);
    sendJson(response, 500, { error: "评测已完成，但无法保存记录，请检查服务器数据目录。" });
  }
}

function serveStatic(request, response) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && request.url === "/api/status") {
      sendJson(response, 200, {
        judgeConfigured: Boolean(JUDGE_URL),
        adminRegistrationEnabled: Boolean(ADMIN_REGISTRATION_PASSWORD),
        languages: Object.entries(LANGUAGES).map(([id, item]) => ({ id, name: item.name }))
      });
      return;
    }
    if (request.method === "GET" && request.url === "/api/me") {
      const user = await currentUser(request);
      sendJson(response, 200, { user });
      return;
    }
    if (request.method === "POST" && request.url === "/api/register") {
      await registerAccount(request, response);
      return;
    }
    if (request.method === "POST" && request.url === "/api/login") {
      await loginAccount(request, response);
      return;
    }
    if (request.method === "POST" && request.url === "/api/logout") {
      if (!verifySameOrigin(request, response)) return;
      clearSession(request, response);
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && request.url === "/api/problems") {
      sendProblemList(response);
      return;
    }
    if (request.method === "GET" && request.url.startsWith("/api/local-tests?")) {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!checkNamedRateLimit(request, "local-tests", 30)) {
        sendJson(response, 429, { error: "评测数据请求过于频繁，请稍后再试。" });
        return;
      }
      const problemId = new URL(request.url, "http://localhost").searchParams.get("problemId");
      const problem = JSON.parse(fs.readFileSync(PROBLEMS_FILE, "utf8"))
        .find((item) => item.id === problemId);
      if (!problem) {
        sendJson(response, 404, { error: "题目不存在。" });
        return;
      }
      sendJson(response, 200, { tests: problem.tests });
      return;
    }
    if (request.method === "GET" && request.url === "/api/submissions") {
      const user = await requireUser(request, response);
      if (!user) return;
      const submissions = (await readStore(SUBMISSIONS_FILE))
        .filter((submission) => submission.userId === user.id)
        .slice(0, 100)
        .map(({ userId, ...submission }) => submission);
      sendJson(response, 200, submissions);
      return;
    }
    if (request.method === "GET" && request.url === "/api/admin/overview") {
      if (!await requireAdmin(request, response)) return;
      await handleAdminOverview(response);
      return;
    }
    if (request.method === "POST" && request.url === "/api/submit") {
      if (!verifySameOrigin(request, response)) return;
      const user = await requireUser(request, response);
      if (!user) return;
      await handleSubmission(request, response, user);
      return;
    }
    if (request.method === "POST" && request.url === "/api/local-result") {
      const user = await requireUser(request, response);
      if (!user) return;
      await handleLocalResult(request, response, user);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "不支持此请求方式。" });
      return;
    }
    serveStatic(request, response);
  } catch (error) {
    console.error("Request failed:", error);
    if (!response.headersSent) sendJson(response, 500, { error: "服务器发生错误，请检查服务日志。" });
  }
});

async function startServer() {
  await initializeDatabase();
  server.listen(PORT, HOST, () => {
    console.log(`天南地北艳姐最美OJ已启动：http://${HOST}:${PORT}`);
    if (!pool) console.log("使用本地 JSON 文件保存账户和提交记录。");
    if (!JUDGE_URL) console.log("评测服务未配置；设置 JUDGE0_URL 后可启用真实评测。");
    if (!ADMIN_REGISTRATION_PASSWORD) console.log("管理员注册已关闭；设置 ADMIN_REGISTRATION_PASSWORD 后启用。");
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
    if (pool) void pool.end();
  });
}

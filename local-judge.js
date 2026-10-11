const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const HOST = "127.0.0.1";
const PORT = Number(process.env.LOCAL_JUDGE_PORT || 4174);
const WEB_ORIGIN = process.env.OJ_WEB_ORIGIN || "";
const PAIRING_TOKEN = crypto.randomBytes(32).toString("base64url");
const MAX_BODY_BYTES = 40 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const TEST_TIMEOUT_MS = 3000;
const recentEvaluations = [];
let evaluationInProgress = false;
const LANGUAGES = {
  c: {
    id: 50,
    name: "C17",
    extension: ".c",
    compiler: process.env.C_COMPILER || (process.platform === "win32" ? "gcc.exe" : "gcc"),
    args: (source, output) => ["-std=c17", "-O2", "-pipe", source, "-o", output]
  },
  cpp: {
    id: 54,
    name: "C++17",
    extension: ".cpp",
    compiler: process.env.CPP_COMPILER || (process.platform === "win32" ? "g++.exe" : "g++"),
    args: (source, output) => ["-std=c++17", "-O2", "-pipe", source, "-o", output]
  },
  python: {
    id: 71,
    name: "Python 3",
    extension: ".py",
    compiler: process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python.exe" : "python3"),
    args: (source) => ["-I", source]
  },
  javascript: {
    id: 63,
    name: "JavaScript",
    extension: ".js",
    compiler: process.execPath,
    args: (source) => [source]
  }
};

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("提交内容太大（上限 40 KB）。"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("请求内容不是有效的 JSON。"));
      }
    });
    request.on("error", reject);
  });
}

function sendCommand(command, args, stdin, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    let outputLimited = false;
    let spawnError = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd: path.dirname(args[args.length - 1] || command),
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH || "",
        SystemRoot: process.env.SystemRoot || "",
        WINDIR: process.env.WINDIR || "",
        TMP: process.env.TMP || os.tmpdir(),
        TEMP: process.env.TEMP || os.tmpdir(),
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8"
      }
    });
    const stop = (reason) => {
      if (reason === "timeout") timedOut = true;
      if (reason === "output") outputLimited = true;
      child.kill("SIGKILL");
    };
    const collect = (target, chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        stop("output");
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.on("error", (error) => {
      spawnError = error.code === "ENOENT"
        ? `找不到运行环境：${command}。请安装对应语言工具链并确保命令位于 PATH 中。`
        : error.message;
    });
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
        outputLimited,
        spawnError
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

function normalizeOutput(output) {
  return output.replace(/\r\n/g, "\n").trim();
}

async function evaluate(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { httpStatus: 400, body: { error: "提交参数无效。" } };
  }
  const { language, code, tests } = payload;
  if (!Object.hasOwn(LANGUAGES, language)) {
    return { httpStatus: 400, body: { error: "不支持所选编程语言。" } };
  }
  if (typeof code !== "string" || !code.trim() || Buffer.byteLength(code, "utf8") > 32 * 1024) {
    return { httpStatus: 400, body: { error: "源代码不能为空且不能超过 32 KB。" } };
  }
  if (!Array.isArray(tests) || tests.length < 1 || tests.length > 30) {
    return { httpStatus: 400, body: { error: "评测测试点数量无效。" } };
  }
  if (tests.some((test) => (
    !test || typeof test.input !== "string" || typeof test.output !== "string" ||
    Buffer.byteLength(test.input, "utf8") > 32 * 1024 ||
    Buffer.byteLength(test.output, "utf8") > 32 * 1024
  ))) {
    return { httpStatus: 400, body: { error: "测试输入或标准输出格式无效。" } };
  }

  const languageInfo = LANGUAGES[language];
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "liangliang-oj-"));
  try {
    const sourcePath = path.join(workDir, `submission${languageInfo.extension}`);
    const binaryPath = path.join(workDir, process.platform === "win32" ? "submission.exe" : "submission");
    await fs.writeFile(sourcePath, code, { encoding: "utf8", mode: 0o600 });

    if (language === "c" || language === "cpp") {
      const compilation = await sendCommand(
        languageInfo.compiler,
        languageInfo.args(sourcePath, binaryPath),
        "",
        15_000
      );
      if (compilation.spawnError) {
        return { httpStatus: 200, body: { verdict: "Runtime Error", passed: 0, total: tests.length, failedCase: 1, compileOutput: compilation.spawnError } };
      }
      if (compilation.timedOut) {
        return { httpStatus: 200, body: { verdict: "Compilation Error", passed: 0, total: tests.length, failedCase: 1, compileOutput: "编译超时。" } };
      }
      if (compilation.outputLimited) {
        return { httpStatus: 200, body: { verdict: "Compilation Error", passed: 0, total: tests.length, failedCase: 1, compileOutput: "编译器输出超过 64 KB。" } };
      }
      if (compilation.exitCode !== 0) {
        return {
          httpStatus: 200,
          body: {
            verdict: "Compilation Error",
            passed: 0,
            total: tests.length,
            failedCase: 1,
            compileOutput: (compilation.stderr || compilation.stdout).slice(0, 4000)
          }
        };
      }
    }

    let time = 0;
    for (let index = 0; index < tests.length; index += 1) {
      const args = language === "c" || language === "cpp"
        ? [binaryPath]
        : languageInfo.args(sourcePath);
      const startedAt = performance.now();
      const result = await sendCommand(
        language === "c" || language === "cpp" ? binaryPath : languageInfo.compiler,
        language === "c" || language === "cpp" ? [] : args,
        tests[index].input,
        TEST_TIMEOUT_MS
      );
      if (result.spawnError) {
        return { httpStatus: 200, body: { verdict: "Runtime Error", passed: index, total: tests.length, failedCase: index + 1, compileOutput: result.spawnError } };
      }
      if (result.timedOut) {
        return { httpStatus: 200, body: { verdict: "Time Limit Exceeded", passed: index, total: tests.length, failedCase: index + 1, time: TEST_TIMEOUT_MS / 1000 } };
      }
      if (result.outputLimited) {
        return { httpStatus: 200, body: { verdict: "Runtime Error", passed: index, total: tests.length, failedCase: index + 1, compileOutput: "程序输出超过 64 KB。" } };
      }
      if (result.exitCode !== 0) {
        return { httpStatus: 200, body: { verdict: "Runtime Error", passed: index, total: tests.length, failedCase: index + 1, compileOutput: result.stderr.slice(0, 4000) || null } };
      }
      time += (performance.now() - startedAt) / 1000;
      if (normalizeOutput(result.stdout) !== normalizeOutput(tests[index].output)) {
        return { httpStatus: 200, body: { verdict: "Wrong Answer", passed: index, total: tests.length, failedCase: index + 1, time } };
      }
    }
    return { httpStatus: 200, body: { verdict: "Accepted", passed: tests.length, total: tests.length, time } };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function corsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", WEB_ORIGIN);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Local-Judge-Token");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
  response.setHeader("Vary", "Origin");
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (!WEB_ORIGIN || origin !== WEB_ORIGIN) {
    json(response, 403, { error: "网页来源与本地评测器配置不匹配。" });
    return;
  }
  corsHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/api/status") {
    if (request.headers["x-local-judge-token"] !== PAIRING_TOKEN) {
      json(response, 401, { error: "请输入本地评测器配对口令。" });
      return;
    }
    json(response, 200, { ready: true, languages: Object.keys(LANGUAGES) });
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/evaluate") {
    json(response, 404, { error: "本地评测接口不存在。" });
    return;
  }
  if (request.headers["x-local-judge-token"] !== PAIRING_TOKEN) {
    json(response, 401, { error: "本地评测器配对口令不正确。" });
    return;
  }
  const now = Date.now();
  while (recentEvaluations.length && now - recentEvaluations[0] >= 60_000) {
    recentEvaluations.shift();
  }
  if (evaluationInProgress || recentEvaluations.length >= 5) {
    json(response, 429, { error: "本机评测器正忙或提交过于频繁，请稍后再试。" });
    return;
  }
  let payload;
  try {
    payload = await readBody(request);
  } catch (error) {
    if (!response.destroyed) json(response, 400, { error: error.message });
    return;
  }
  evaluationInProgress = true;
  recentEvaluations.push(now);
  try {
    const result = await evaluate(payload);
    json(response, result.httpStatus, result.body);
  } catch (error) {
    console.error("Local judge error:", error);
    if (!response.headersSent) json(response, 500, { error: "本地评测发生错误，请检查本地评测器终端。" });
  } finally {
    evaluationInProgress = false;
  }
});

server.listen(PORT, HOST, () => {
  console.log(`本地评测器已启动：http://${HOST}:${PORT}`);
  console.log(`允许的 OJ 网站来源：${WEB_ORIGIN || "未配置（当前拒绝所有来源）"}`);
  console.log(`Pairing token: ${PAIRING_TOKEN}`);
  console.log("提醒：此轻量评测器不提供操作系统级沙箱，只运行你自己的代码。");
});

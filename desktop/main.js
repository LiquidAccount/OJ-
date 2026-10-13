const { app, BrowserWindow, clipboard, dialog, ipcMain, shell, utilityProcess } = require("electron");
const { autoUpdater } = require("electron-updater");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

let serverProcess;
let judgeProcess;
let judgePairingToken = "";
let judgeStartup;
let updateCheckPromise;
let updaterWindow;
let autoUpdatesConfigured = false;
let updateCheckTimer;
let lastUpdateStatus = { state: "idle", message: "尚未检查更新。", version: "" };
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function sendUpdateStatus(window, status) {
  lastUpdateStatus = { ...lastUpdateStatus, ...status };
  if (window && !window.isDestroyed()) window.webContents.send("oj:update-status", lastUpdateStatus);
}

function downloadPendingUpdate(window, version) {
  updaterWindow = window;
  sendUpdateStatus(window, { state: "downloading", message: "正在下载更新…", version });
  return autoUpdater.downloadUpdate()
    .then(() => true)
    .catch((error) => {
      console.error("Update download failed:", error);
      sendUpdateStatus(window, { state: "error", message: `下载更新失败：${error.message}` });
      return false;
    });
}

function installPendingUpdate() {
  app.isQuitting = true;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}

async function checkForUpdates(window) {
  updaterWindow = window;
  if (!app.isPackaged) {
    sendUpdateStatus(window, { state: "unavailable", message: "开发模式不检查更新。" });
    return false;
  }
  if (updateCheckPromise) return updateCheckPromise;
  sendUpdateStatus(window, { state: "checking", message: "正在检查更新…" });
  updateCheckPromise = autoUpdater.checkForUpdates()
    .then(() => true)
    .catch((error) => {
      console.error("Update check failed:", error);
      sendUpdateStatus(window, { state: "error", message: `检查更新失败：${error.message}` });
      return false;
    })
    .finally(() => { updateCheckPromise = null; });
  return updateCheckPromise;
}

function setupAutoUpdates(window) {
  if (!app.isPackaged) return;
  updaterWindow = window;
  if (autoUpdatesConfigured) return;
  autoUpdatesConfigured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus(updaterWindow, { state: "checking", message: "正在检查更新…" });
  });
  autoUpdater.on("update-not-available", () => {
    sendUpdateStatus(updaterWindow, { state: "current", message: "当前已是最新版本。" });
  });  autoUpdater.on("update-available", async (info) => {
    sendUpdateStatus(updaterWindow, {
      state: "available",
      message: `发现新版本 ${info.version}，可在顶部提示条中下载，也可以稍后退出软件时自动安装。`,
      version: info.version
    });
    if (!updaterWindow || updaterWindow.isDestroyed() || updaterWindow.isFocused()) return;
    const answer = await dialog.showMessageBox(updaterWindow, {
      type: "info",
      title: "发现软件更新",
      message: `发现新版本 ${info.version}。`,
      detail: "现在下载更新吗？下载完成后可以立即重启安装，也可以稍后退出软件时自动安装。",
      buttons: ["下载更新", "稍后"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (answer.response !== 0) {
      sendUpdateStatus(updaterWindow, { state: "deferred", message: `已暂缓下载 ${info.version}，可在顶部提示条中重新下载。` });
      return;
    }
    await downloadPendingUpdate(updaterWindow, info.version);
  });
  autoUpdater.on("download-progress", (progress) => {
    updaterWindow?.setProgressBar(Math.max(0, Math.min(progress.percent, 100)) / 100);
    sendUpdateStatus(updaterWindow, {
      state: "downloading",
      message: `正在下载更新：${Math.round(progress.percent)}%（完成后可立即重启安装）`,
      percent: progress.percent
    });
  });
  autoUpdater.on("update-downloaded", async (info) => {
    updaterWindow?.setProgressBar(-1);
    sendUpdateStatus(updaterWindow, {
      state: "downloaded",
      message: `版本 ${info.version} 已下载完成。点击“立即重启安装”，或直接退出软件后自动安装。`,
      version: info.version,
      percent: 100
    });
    if (!updaterWindow || updaterWindow.isDestroyed() || updaterWindow.isFocused()) return;
    const answer = await dialog.showMessageBox(updaterWindow, {
      type: "info",
      title: "更新已准备就绪",
      message: `版本 ${info.version} 已下载完成。`,
      detail: "立即重启软件并安装更新，还是稍后安装？选择稍后会在退出软件时自动安装。",
      buttons: ["立即重启安装", "稍后"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (answer.response === 0) installPendingUpdate();
  });
  autoUpdater.on("error", (error) => {
    updaterWindow?.setProgressBar(-1);
    console.error("Auto-update error:", error);
    sendUpdateStatus(updaterWindow, { state: "error", message: `自动更新失败：${error.message}` });
  });
  updateCheckTimer = setInterval(() => {
    if (updaterWindow && !updaterWindow.isDestroyed() && !app.isQuitting) {
      void checkForUpdates(updaterWindow);
    }
  }, UPDATE_CHECK_INTERVAL_MS);
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const { port } = listener.address();
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function getAdminRegistrationPassword() {
  if (process.env.ADMIN_REGISTRATION_PASSWORD) return process.env.ADMIN_REGISTRATION_PASSWORD;
  const passwordPath = path.join(app.getPath("userData"), "admin-registration-password.txt");
  try {
    return fs.readFileSync(passwordPath, "utf8").trim();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const password = crypto.randomBytes(24).toString("base64url");
    fs.mkdirSync(path.dirname(passwordPath), { recursive: true });
    fs.writeFileSync(passwordPath, password, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return password;
  }
}

function serverLogSummary(logs) {
  const trimmed = logs.trim();
  return trimmed ? `\n服务日志：\n${trimmed.slice(-400)}` : "";
}

async function waitForServer(port, readLogs) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    if (!serverProcess || (serverProcess.exitCode !== null && serverProcess.exitCode !== undefined)) {
      throw new Error(`OJ 后端服务提前退出。${serverLogSummary(readLogs())}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`OJ 后端服务启动超时。${lastError ? ` ${lastError.message}` : ""}${serverLogSummary(readLogs())}`);
}

function runCommand(command, args, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`${command} 执行超时。`));
    }, timeoutMs);
    const finish = (error, code = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ error, code, output });
    };
    child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });
    child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => finish(code === 0 ? null : new Error(`${command} 退出，代码 ${code}。`), code));
  });
}

async function findCommand(command, args = ["--version"]) {
  const result = await runCommand(command, args, 8_000);
  return !result.error && result.code === 0;
}

async function toolchainStatus() {
  const gcc = await findCommand("gcc.exe");
  const gpp = await findCommand("g++.exe");
  const python = await findCommand("python.exe");
  return {
    gcc,
    gpp,
    python,
    javascript: true,
    complete: gcc && gpp && python
  };
}

function toolchainEnvironment() {
  const env = { ...process.env };
  const msysBin = "C:\\msys64\\ucrt64\\bin";
  if (fs.existsSync(path.join(msysBin, "gcc.exe")) && fs.existsSync(path.join(msysBin, "g++.exe"))) {
    env.PATH = `${msysBin}${path.delimiter}${env.PATH || ""}`;
    env.C_COMPILER = path.join(msysBin, "gcc.exe");
    env.CPP_COMPILER = path.join(msysBin, "g++.exe");
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath("home"), "AppData", "Local");
  const pythonRoot = path.join(localAppData, "Programs", "Python");
  try {
    const versionDirectory = fs.readdirSync(pythonRoot)
      .filter((name) => /^Python\d+$/i.test(name))
      .sort()
      .reverse()
      .find((name) => fs.existsSync(path.join(pythonRoot, name, "python.exe")));
    if (versionDirectory) {
      const pythonDir = path.join(pythonRoot, versionDirectory);
      env.PATH = `${pythonDir}${path.delimiter}${env.PATH || ""}`;
      env.PYTHON_EXECUTABLE = path.join(pythonDir, "python.exe");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return env;
}

function startLocalJudge(origin) {
  if (judgeProcess && judgePairingToken) return Promise.resolve(judgePairingToken);
  if (judgeStartup) return judgeStartup;
  judgeStartup = new Promise((resolve, reject) => {
    const runnerPath = path.join(app.getAppPath(), "local-judge.js");
    judgeProcess = utilityProcess.fork(runnerPath, [], {
      cwd: app.getAppPath(),
      env: { ...toolchainEnvironment(), OJ_WEB_ORIGIN: origin },
      stdio: "pipe",
      serviceName: "YYZM OJ local evaluator"
    });
    let logs = "";
    const timer = setTimeout(() => {
      judgeProcess?.kill();
      judgeProcess = null;
      judgeStartup = null;
      reject(new Error("本地评测器启动超时。"));
    }, 15_000);
    judgeProcess.stdout.on("data", (chunk) => {
      logs += chunk.toString();
      const match = logs.match(/Pairing token:\s*([A-Za-z0-9_-]+)/);
      if (!match) return;
      clearTimeout(timer);
      judgePairingToken = match[1];
      judgeStartup = null;
      resolve(judgePairingToken);
    });
    judgeProcess.stderr.on("data", (chunk) => console.error(`[OJ evaluator] ${chunk.toString().trimEnd()}`));
    judgeProcess.once("exit", (code) => {
      const error = new Error(`本地评测器已退出（代码 ${code}）。`);
      judgeProcess = null;
      judgePairingToken = "";
      clearTimeout(timer);
      judgeStartup = null;
      reject(error);
    });
  });
  return judgeStartup;
}

function installWithWinget(packageId, extraArgs = []) {
  return runCommand("winget.exe", [
    "install", "--exact", "--id", packageId, "--source", "winget",
    "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity",
    ...extraArgs
  ]);
}

async function installToolchains() {
  if (!(await findCommand("winget.exe", ["--version"]))) {
    throw new Error("未检测到 winget。请从 Microsoft Store 安装“应用安装程序”，或从软件内查看手动安装链接。");
  }
  const status = await toolchainStatus();
  const details = [];
  if (!status.python) {
    const pythonResult = await installWithWinget("Python.Python.3.13", ["--scope", "user"]);
    if (pythonResult.error) details.push(`Python：${pythonResult.output || pythonResult.error.message}`);
  }
  if (!status.gcc || !status.gpp) {
    const msysResult = await installWithWinget("MSYS2.MSYS2");
    if (msysResult.error) {
      details.push(`MSYS2：${msysResult.output || msysResult.error.message}`);
    } else {
      const bashPath = "C:\\msys64\\usr\\bin\\bash.exe";
      if (fs.existsSync(bashPath)) {
        const gccResult = await runCommand(bashPath, [
          "-lc", "pacman -S --noconfirm mingw-w64-ucrt-x86_64-gcc"
        ]);
        if (gccResult.error) details.push(`GCC：${gccResult.output || gccResult.error.message}`);
      } else {
        details.push("已安装 MSYS2，但没有找到默认路径 C:\\msys64\\usr\\bin\\bash.exe。");
      }
    }
  }
  const updated = await toolchainStatus();
  return { status: updated, details };
}

async function createWindow() {
  const port = await availablePort();
  const appPath = app.getAppPath();
  const adminPassword = getAdminRegistrationPassword();
  const appDataPath = app.getPath("userData");
  const titleSyncAdminKeyPath = path.join(appDataPath, "desktop-title-sync.key");
  const titleSyncAdminKey = fs.existsSync(titleSyncAdminKeyPath)
    ? fs.readFileSync(titleSyncAdminKeyPath, "utf8").trim()
    : "";
  const adminPasswordNoticePath = path.join(appDataPath, ".admin-code-shown");
  const showAdminPasswordNotice = app.isPackaged && !fs.existsSync(adminPasswordNoticePath);
  let finishOnboarding;
  const onboardingReady = new Promise((resolve) => { finishOnboarding = resolve; });

  serverProcess = utilityProcess.fork(path.join(appPath, "server.js"), [], {
    cwd: appPath,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      OJ_DATA_DIR: appDataPath,
      ADMIN_REGISTRATION_PASSWORD: adminPassword,
      OJ_TITLE_SYNC_URL: "https://liangliang-oj-title-sync.yyzm.workers.dev",
      OJ_TITLE_SYNC_ADMIN_KEY: titleSyncAdminKey,
      DATABASE_URL: "",
      COOKIE_SECURE: ""
    },
    stdio: "pipe",
    serviceName: "YYZM OJ local server"
  });
  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (!app.isQuitting && code !== 0) {
      dialog.showErrorBox("OJ 服务已停止", `本地服务意外退出（代码 ${code}）。请重新打开软件。`);
    }
  });
  let serverLogs = "";
  const collectServerLogs = (chunk) => {
    serverLogs = `${serverLogs}${chunk.toString()}`.slice(-4000);
  };
  serverProcess.stdout.on("data", collectServerLogs);
  serverProcess.stderr.on("data", (chunk) => {
    collectServerLogs(chunk);
    console.error(`[OJ server] ${chunk.toString().trimEnd()}`);
  });

  try {
    await waitForServer(port, () => serverLogs);
  } catch (error) {
    serverProcess?.kill();
    serverProcess = null;
    throw error;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#101823",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(appPath, "desktop", "preload.js")
    }
  });
  ipcMain.removeHandler("oj:initialize");
  ipcMain.removeHandler("oj:toolchain-status");
  ipcMain.removeHandler("oj:check-for-updates");
  ipcMain.handle("oj:initialize", async () => {
    await onboardingReady;
    const tools = await toolchainStatus();
    if (!tools.complete && app.isPackaged) {
      const answer = await dialog.showMessageBox(window, {
        type: "info",
        title: "配置本地评测环境",
        message: `评测工具检查：GCC ${tools.gcc ? "已就绪" : "缺少"}，G++ ${tools.gpp ? "已就绪" : "缺少"}，Python ${tools.python ? "已就绪" : "缺少"}。`,
        detail: "是否尝试使用 winget 自动下载并安装缺少的工具？下载可能较大。也可以稍后再配置；JavaScript 评测无需额外工具。",
        buttons: ["尝试自动安装", "稍后", "查看安装说明"],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      });
      if (answer.response === 0) {
        try {
          const installed = await installToolchains();
          if (installed.details.length) {
            await dialog.showMessageBox(window, {
              type: "warning",
              title: "部分工具安装未完成",
              message: "本地评测器仍可使用已安装的语言。",
              detail: installed.details.join("\n\n"),
              buttons: ["继续"]
            });
          }
        } catch (error) {
          await dialog.showMessageBox(window, {
            type: "error",
            title: "自动安装失败",
            message: error.message,
            buttons: ["继续"]
          });
        }
      } else if (answer.response === 2) {
        await shell.openExternal("https://github.com/msys2/msys2-installer/releases");
        await shell.openExternal("https://www.python.org/downloads/windows/");
      }
    }
    const token = await startLocalJudge(`http://127.0.0.1:${port}`);
    return {
      token,
      tools: await toolchainStatus(),
      packaged: app.isPackaged,
      version: app.getVersion()
    };
  });
  ipcMain.handle("oj:toolchain-status", () => toolchainStatus());
  ipcMain.handle("oj:check-for-updates", () => checkForUpdates(window));
  ipcMain.handle("oj:update-state", () => lastUpdateStatus);
  ipcMain.handle("oj:download-update", () => downloadPendingUpdate(window, lastUpdateStatus.version));
  ipcMain.handle("oj:install-update", () => {
    if (lastUpdateStatus.state !== "downloaded") return false;
    installPendingUpdate();
    return true;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.once("ready-to-show", () => window.show());
  await window.loadURL(`http://127.0.0.1:${port}`);
  setupAutoUpdates(window);
  if (app.isPackaged) {
    void onboardingReady.then(() => {
      setTimeout(() => void checkForUpdates(window), 5_000);
    });
  }

  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: "detach" });
  } else if (showAdminPasswordNotice) {
    clipboard.writeText(adminPassword);
    await dialog.showMessageBox(window, {
      type: "info",
      title: "首次启动 - 管理员注册口令",
      message: "已为这台电脑生成管理员注册口令，并复制到剪贴板。",
      detail: `请先保存此口令，再到软件内注册管理员账号。口令文件保存在：\n${path.join(appDataPath, "admin-registration-password.txt")}\n\n当前口令：${adminPassword}`,
      buttons: ["我已保存"]
    });
    fs.writeFileSync(adminPasswordNoticePath, new Date().toISOString(), { encoding: "utf8", mode: 0o600 });
  }
  finishOnboarding();
  return window;
}

app.isQuitting = false;

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error("Desktop app startup failed:", error);
    dialog.showErrorBox("无法启动 OJ", error.message);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch((error) => {
      console.error("Desktop app window could not be reopened:", error);
      dialog.showErrorBox("无法启动 OJ", error.message);
    });
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  judgeProcess?.kill();
  serverProcess?.kill();
});

app.on("window-all-closed", () => {
  app.quit();
});

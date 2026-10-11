const pageContent = document.querySelector("#page-content");
const toast = document.querySelector("#toast");
const labels = {
  home: "首页",
  problems: "题库",
  training: "训练",
  contests: "比赛",
  submissions: "提交记录",
  discuss: "讨论",
  ranking: "排行榜",
  admin: "管理后台"
};
const state = {
  page: "home",
  problems: [],
  selectedProblem: null,
  search: "",
  difficulty: "全部难度",
  language: "cpp",
  codeByLanguage: {},
  currentUser: null,
  mySubmissions: null,
  adminOverview: null,
  authMode: "login",
  adminRegistrationEnabled: false,
  localJudgeConnected: false,
  judgeConfigured: false,
  localPairingToken: sessionStorage.getItem("ll-local-judge-token") || ""
};
let toastTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function setPage(page) {
  if (page === "admin" && state.currentUser?.role !== "admin") {
    showToast("管理后台仅管理员可访问。");
    return;
  }
  state.page = page;
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === page);
  });
  document.querySelector("#breadcrumb-current").textContent = labels[page] || "首页";
  document.querySelector("#sidebar").classList.remove("sidebar-open");
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (page === "submissions") loadSubmissions();
  if (page === "admin") loadAdminOverview();
}

function render() {
  const views = {
    home: renderHome,
    problems: renderProblems,
    training: renderTraining,
    contests: renderContests,
    submissions: renderSubmissions,
    discuss: renderDiscuss,
    ranking: renderRanking,
    admin: renderAdmin
  };
  pageContent.innerHTML = (views[state.page] || renderHome)();
}

function renderHome() {
  const submissions = state.mySubmissions || [];
  const solved = new Set(submissions.filter((item) => item.verdict === "Accepted").map((item) => item.problemId));
  const recommended = state.problems.slice(0, 3);
  return `
    <section class="welcome-row">
      <div><p class="eyebrow"><span class="eyebrow-line"></span> YOUR PERSONAL CODING ARENA</p>
        <h1>每一次思考，<span>都有回响。</span></h1>
        <p class="welcome-copy">欢迎${state.currentUser ? `回来，${escapeHtml(state.currentUser.username)}` : "来到练习空间"}。挑一道喜欢的题，继续你的编程冒险。</p>
        <button class="button button-primary" data-page="problems">开始刷题 <span>→</span></button>
      </div>
      <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
        <div class="hero-chip"><span>01</span><b>&lt;/&gt;</b><small>THINK<br>IN CODE</small></div>
        <span class="spark spark-a">✦</span><span class="spark spark-b">✳</span><span class="spark spark-c">·</span>
      </div>
    </section>
    <section class="stat-grid">
      <article class="stat-card"><div class="stat-icon purple">▤</div><div class="stat-label">题库题目</div><div class="stat-value">${state.problems.length}<small> 道</small></div><div class="stat-note">从基础开始，稳步进阶</div></article>
      <article class="stat-card"><div class="stat-icon green">✓</div><div class="stat-label">已通过</div><div class="stat-value">${solved.size}<small> 道</small></div><div class="stat-note">每道题，都是新进步</div></article>
      <article class="stat-card"><div class="stat-icon amber">⌁</div><div class="stat-label">提交次数</div><div class="stat-value">${submissions.length}<small> 次</small></div><div class="stat-note">试错也是成长的一部分</div></article>
      <article class="stat-card"><div class="stat-icon blue">◷</div><div class="stat-label">今日目标</div><div class="stat-value">${solved.size ? "继续" : "1"}<small>${solved.size ? "保持节奏" : " 道题"}</small></div><div class="stat-note">不用着急，按自己的节奏来</div></article>
    </section>
    <div class="content-grid">
      <section class="panel problem-panel"><div class="section-heading"><div><p class="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>推荐练习</h2></div><button class="text-button" data-page="problems">全部题目 <span>→</span></button></div>
        <div class="mini-problem-list">${recommended.length ? recommended.map(problemRow).join("") : emptyState("题目正在准备中")}</div>
      </section>
      <aside class="panel side-panel"><div class="section-heading"><div><p class="eyebrow">A LITTLE NOTE</p><h2>今日寄语</h2></div><span class="note-spark">✦</span></div>
        <div class="quote-mark">“</div><blockquote>代码不只是答案，<br>更是你思考的轨迹。</blockquote>
        <div class="note-footer"><span class="note-dot"></span> 写下今天的第一行代码</div>
      </aside>
    </div>
    <section class="bottom-banner"><div><span class="banner-icon">✳</span><div><strong>今天想练点什么？</strong><p>挑选一个主题，开启专注训练时间。</p></div></div><button class="button button-quiet" data-page="training">探索训练计划 <span>→</span></button></section>`;
}

function problemRow(problem) {
  const difficultyClass = difficultyTone(problem.difficulty);
  return `<button class="problem-row" data-problem="${escapeHtml(problem.id)}">
    <span class="problem-status"></span><span class="problem-id">${escapeHtml(problem.id)}</span>
    <span class="problem-title">${escapeHtml(problem.title)}<small>考点：${escapeHtml((problem.knowledgePoints || []).join("、") || problem.category)}</small></span>
    <span class="difficulty ${difficultyClass}">${escapeHtml(problem.difficulty)}</span><span class="row-arrow">↗</span></button>`;
}

function difficultyTone(difficulty) {
  return difficulty === "入门" ? "easy"
    : difficulty === "基础" ? "medium"
      : difficulty === "进阶" ? "advanced"
        : difficulty === "困难" ? "hard"
          : "hell";
}

function renderProblems() {
  const filtered = state.problems.filter((problem) => {
    const text = `${problem.id} ${problem.title} ${problem.category} ${problem.background || ""} ${(problem.knowledgePoints || []).join(" ")}`.toLowerCase();
    return text.includes(state.search.toLowerCase()) &&
      (state.difficulty === "全部难度" || problem.difficulty === state.difficulty);
  });
  const detail = state.selectedProblem ? renderProblemDetail(state.selectedProblem) : "";
  return `<div class="page-heading"><div><p class="eyebrow">PROBLEM SET</p><h1>题库 <span class="heading-count">${state.problems.length}</span></h1><p>从一道题开始，把想法变成答案。</p></div></div>
    <section class="panel problem-list-panel">
      <div class="toolbar"><label class="search-box"><span>⌕</span><input id="problem-search" value="${escapeHtml(state.search)}" placeholder="搜索题目、编号或标签..." aria-label="搜索题目"></label>
        <select id="difficulty-filter" aria-label="按难度筛选">${["全部难度", "入门", "基础", "进阶", "困难", "地狱"].map((level) => `<option ${state.difficulty === level ? "selected" : ""}>${level}</option>`).join("")}</select>
        <span class="result-count">共 ${filtered.length} 道题</span></div>
      <div class="table-head"><span>状态</span><span>题目</span><span>难度</span><span>分类</span><span>通过率</span><span></span></div>
      <div class="problem-table">${filtered.map((problem) => {
        const rate = problem.attempts ? Math.round(problem.accepted / problem.attempts * 100) : 0;
        const difficultyClass = difficultyTone(problem.difficulty);
        const knowledge = (problem.knowledgePoints || []).map((point) => `<i class="knowledge-chip">${escapeHtml(point)}</i>`).join("");
        return `<button class="table-row" data-problem="${escapeHtml(problem.id)}"><span class="problem-status"></span><span class="table-title"><b>${escapeHtml(problem.id)}</b><span class="table-main">${escapeHtml(problem.title)}<small class="knowledge-list">${knowledge || `<i class="knowledge-chip">${escapeHtml(problem.category)}</i>`}</small></span></span><span><i class="difficulty ${difficultyClass}">${escapeHtml(problem.difficulty)}</i></span><span class="table-muted">${escapeHtml(problem.category)}</span><span class="rate-cell"><span class="rate-track"><i style="width:${rate}%"></i></span>${rate}%</span><span class="row-arrow">↗</span></button>`;
      }).join("") || emptyState("没有找到匹配的题目")}</div>
    </section>${detail}`;
}

function renderProblemDetail(problem) {
  const starterCode = {
    c: "#include <stdio.h>\n\nint main(void) {\n    // 在这里编写你的解法\n    return 0;\n}\n",
    cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在这里编写你的解法\n    return 0;\n}\n",
    python: "# 在这里编写你的解法\n",
    javascript: "// 在这里编写你的解法\n"
  };
  return `<section class="panel detail-panel" id="problem-detail">
    <div class="detail-top"><div><button class="back-button" data-action="close-problem">← 返回题目列表</button><p class="eyebrow">${escapeHtml(problem.id)} · ${escapeHtml(problem.category)}</p><h2>${escapeHtml(problem.title)}</h2><div class="detail-knowledge">${(problem.knowledgePoints || []).map((point) => `<span class="knowledge-chip">${escapeHtml(point)}</span>`).join("")}</div></div><span class="difficulty ${difficultyTone(problem.difficulty)}">${escapeHtml(problem.difficulty)}</span></div>
    <div class="statement">${problem.background ? `<h3>实际背景</h3><p>${escapeHtml(problem.background)}</p>` : ""}<h3>题目描述</h3><p>${escapeHtml(problem.description)}</p><h3>输入格式</h3><p>${escapeHtml(problem.input)}</p><h3>输出格式</h3><p>${escapeHtml(problem.output)}</p>
      <h3>样例</h3>${problem.examples.map((example, index) => `<div class="example-grid"><div><label>输入 ${index + 1}</label><pre>${escapeHtml(example.input || "(无输入)")}</pre></div><div><label>输出 ${index + 1}</label><pre>${escapeHtml(example.output)}</pre></div></div>`).join("")}
    </div>
    <div class="editor-heading"><div><h3>提交代码</h3><span>${state.judgeConfigured ? "使用网站评测服务" : state.localJudgeConnected ? "代码将在你的电脑上运行" : "连接本机评测器后即可在自己的电脑运行"}</span></div><div class="editor-controls"><button class="button button-outline local-connect-button" id="local-judge-config">${state.localJudgeConnected ? "本机评测器已连接 · 设置" : "连接本机评测器"}</button><select id="language-select" aria-label="编程语言"><option value="c" ${state.language === "c" ? "selected" : ""}>C17</option><option value="cpp" ${state.language === "cpp" ? "selected" : ""}>C++17</option><option value="python" ${state.language === "python" ? "selected" : ""}>Python 3</option><option value="javascript" ${state.language === "javascript" ? "selected" : ""}>JavaScript</option></select></div></div>
    <div class="editor-wrap"><div class="editor-gutter">${Array.from({ length: 9 }, (_, index) => `<span>${index + 1}</span>`).join("")}</div><textarea id="code-editor" spellcheck="false" aria-label="代码编辑器">${escapeHtml(state.codeByLanguage[state.language] ?? starterCode[state.language])}</textarea></div>
    <div class="submit-row"><span class="editor-hint">⌘/Ctrl + Enter 快速提交 · 最大 32 KB</span><button class="button button-primary" id="submit-code">提交评测 <span>→</span></button></div>
    <div id="submission-result"></div></section>`;
}

function renderTraining() {
  const tracks = [
    ["入门", "入门热身", "从输入输出和简单规则开始，打好编程基础。", "purple"],
    ["基础", "基础应用", "练习条件、循环和数组，把常见问题拆解清楚。", "green"],
    ["进阶", "进阶挑战", "通过数组处理和模拟题训练综合分析能力。", "amber"],
    ["困难", "困难挑战", "综合运用数据结构与算法，解决更复杂的问题。", "blue"],
    ["地狱", "地狱挑战", "挑战高阶图论、数据结构与复杂算法问题。", "purple"]
  ];
  return `<div class="page-heading"><div><p class="eyebrow">BUILD YOUR HABIT</p><h1>训练</h1><p>给自己一个小目标，循序渐进地练习。</p></div></div><div class="training-grid">
    ${tracks.map(([difficulty, title, text, color], index) => {
      const count = state.problems.filter((problem) => problem.difficulty === difficulty).length;
      return `<article class="panel training-card"><div class="training-number ${color}">${String(index + 1).padStart(2, "0")}</div><h2>${title}</h2><p>${text}</p><div class="training-card-footer"><span>${count} 道题 · 按难度分级</span><button class="button button-outline" data-page="problems" data-difficulty="${difficulty}">开始练习 →</button></div></article>`;
    }).join("")}
  </div>`;
}

function renderContests() {
  return `<div class="page-heading"><div><p class="eyebrow">FRIENDLY CHALLENGES</p><h1>比赛</h1><p>在轻量挑战中，试试把所学串起来。</p></div><span class="pill pill-muted">个人空间</span></div>
    <section class="panel empty-panel"><div class="empty-illustration">⚑</div><h2>专属比赛，即将开放</h2><p>目前这里还没有安排比赛。你可以先从题库开始练习，准备好后再来挑战。</p><button class="button button-primary" data-page="problems">去题库看看 <span>→</span></button></section>`;
}

function renderSubmissions() {
  if (!state.currentUser) {
    return `<section class="panel empty-panel"><div class="empty-illustration">⌁</div><h2>登录后查看个人记录</h2><p>每个账号的提交记录和解题进度彼此隔离。</p><button class="button button-primary" data-auth="login">登录 / 注册</button></section>`;
  }
  const history = state.mySubmissions;
  if (history === null) return `<section class="panel empty-panel"><span class="spinner"></span><p>正在读取提交记录…</p></section>`;
  return `<div class="page-heading"><div><p class="eyebrow">YOUR CODE JOURNEY</p><h1>提交记录</h1><p>每次尝试都会留下进步的痕迹。</p></div></div>
    <section class="panel history-panel"><div class="history-head"><span>题目</span><span>语言</span><span>结果</span><span>提交时间</span></div>
    ${history.length ? history.map((item) => `<div class="history-row"><span><b>${escapeHtml(item.problemId)}</b> ${escapeHtml(item.title)}</span><span>${escapeHtml(item.language)}${item.evaluationSource ? `<small class="history-source">${escapeHtml(item.evaluationSource)}</small>` : ""}</span><span class="${item.verdict === "Accepted" ? "verdict-ok" : "verdict-other"}">${escapeHtml(item.verdict)}</span><span>${escapeHtml(new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false }))}</span></div>`).join("") : emptyState("还没有提交记录。完成一道题后，记录会显示在这里。")}</section>`;
}

function renderDiscuss() {
  return `<div class="page-heading"><div><p class="eyebrow">SHARE WHAT YOU LEARN</p><h1>讨论</h1><p>记录思路、整理问题，让每次思考都能沉淀下来。</p></div></div>
    <section class="panel empty-panel"><div class="empty-illustration">▧</div><h2>给灵感留个位置</h2><p>当前是本地个人版，讨论区暂不保存或公开帖子。你可以先在笔记里记录解题思路。</p><button class="button button-outline" data-page="problems">挑一道题开始 →</button></section>`;
}

function renderRanking() {
  const solved = new Set((state.mySubmissions || []).filter((item) => item.verdict === "Accepted").map((item) => item.problemId)).size;
  return `<div class="page-heading"><div><p class="eyebrow">JUST FOR FUN</p><h1>排行榜</h1><p>这里只和昨天的自己比较。</p></div></div>
    <section class="panel ranking-panel"><div class="ranking-header"><span class="ranking-medal">✦</span><div><p>个人练习榜</p><h2>${state.currentUser ? escapeHtml(state.currentUser.username) : "游客"}</h2></div><strong>${solved}<small> 题通过</small></strong></div><div class="ranking-progress"><div><span>题目进度</span><span>${solved} / ${state.problems.length}</span></div><div class="progress-track"><i style="width:${state.problems.length ? Math.min(100, solved / state.problems.length * 100) : 0}%"></i></div></div><p class="ranking-footnote">${state.currentUser ? "这里只展示当前账号的解题进度。" : "登录后即可查看个人解题进度。"}</p></section>`;
}

function renderAdmin() {
  if (state.currentUser?.role !== "admin") {
    return `<section class="panel empty-panel"><h2>需要管理员权限</h2><p>请使用管理员账号登录。</p></section>`;
  }
  if (!state.adminOverview) {
    return `<section class="panel empty-panel"><span class="spinner"></span><p>正在读取管理数据…</p></section>`;
  }
  const overview = state.adminOverview;
  return `<div class="page-heading"><div><p class="eyebrow">SITE ADMINISTRATION</p><h1>管理后台</h1><p>查看账号和评测使用概况。</p></div><span class="pill pill-muted">管理员</span></div>
    <section class="stat-grid">
      <article class="stat-card"><div class="stat-icon purple">♙</div><div class="stat-label">学生账号</div><div class="stat-value">${overview.students}</div></article>
      <article class="stat-card"><div class="stat-icon amber">⚙</div><div class="stat-label">管理员账号</div><div class="stat-value">${overview.admins}</div></article>
      <article class="stat-card"><div class="stat-icon blue">⌁</div><div class="stat-label">累计提交</div><div class="stat-value">${overview.submissions}</div></article>
      <article class="stat-card"><div class="stat-icon green">✓</div><div class="stat-label">通过次数</div><div class="stat-value">${overview.accepted}</div></article>
    </section>
    <section class="panel admin-users"><div class="section-heading"><div><p class="eyebrow">RECENT ACCOUNTS</p><h2>最近注册的账号</h2></div></div>
      <div class="history-head admin-user-head"><span>用户名</span><span>角色</span><span>注册时间</span></div>
      ${overview.latestUsers.map((user) => `<div class="history-row admin-user-row"><span>${escapeHtml(user.username)}</span><span>${user.role === "admin" ? "管理员" : "学生"}</span><span>${escapeHtml(new Date(user.createdAt).toLocaleString("zh-CN", { hour12: false }))}</span></div>`).join("") || emptyState("暂无账号")}
    </section><p class="ranking-footnote">本机评测的提交记录由用户设备报告，不能作为防作弊或正式成绩依据。</p>`;
}

function renderAuthModal() {
  const registering = state.authMode === "register";
  return `<div class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button class="auth-close" data-auth-close aria-label="关闭">×</button>
    <p class="eyebrow">YOUR PERSONAL CODING ARENA</p>
    <h2 id="auth-title">${registering ? "创建练习账号" : "欢迎回来"}</h2>
    <p class="auth-description">${registering ? "创建学生账号即可开始提交与保存进度。" : "登录后即可提交代码并查看个人记录。"}</p>
    <form id="auth-form">
      <label class="auth-field">用户名<input name="username" required minlength="3" maxlength="24" autocomplete="username" placeholder="3–24 个字符"></label>
      <label class="auth-field">密码<input name="password" required minlength="10" maxlength="128" type="password" autocomplete="${registering ? "new-password" : "current-password"}" placeholder="${registering ? "至少 10 个字符" : "输入密码"}"></label>
      ${registering ? `<label class="auth-field">账号角色<select name="role"><option value="student">学生</option><option value="admin">管理员</option></select></label>
      <label class="auth-field admin-code-field" hidden>管理员注册口令<input name="adminCode" type="text" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" placeholder="输入站点所有者设置的口令"></label>
      <p class="auth-help">${state.adminRegistrationEnabled ? "管理员注册需要站点所有者配置的专属口令。" : "管理员注册当前关闭；学生仍可正常注册。"}</p>` : ""}
      <p class="auth-error" id="auth-error" role="alert"></p>
      <button class="button button-primary auth-submit" type="submit">${registering ? "注册并登录" : "登录"}</button>
    </form>
    <button class="auth-switch" data-auth="${registering ? "login" : "register"}">${registering ? "已有账号？去登录" : "还没有账号？注册"}</button>
  </div>`;
}

function renderLocalJudgeModal() {
  return `<div class="auth-dialog local-judge-dialog" role="dialog" aria-modal="true" aria-labelledby="local-judge-title">
    <button class="auth-close" data-local-judge-close aria-label="关闭">×</button>
    <p class="eyebrow">RUN ON YOUR COMPUTER</p>
    <h2 id="local-judge-title">连接本机评测器</h2>
    <p class="auth-description">先在自己的电脑启动本地评测器，再粘贴终端显示的一次性配对口令。</p>
    <ol class="local-judge-steps">
      <li>安装 Node.js 18.17 或更高版本，以及要使用语言的工具链。</li>
      <li>下载/克隆此 OJ 项目，在项目目录打开 PowerShell。</li>
      <li>设置站点来源并运行本地评测器。页面来源：<code>${escapeHtml(window.location.origin)}</code></li>
    </ol>
    <div class="local-command"><code>$env:OJ_WEB_ORIGIN = '${escapeHtml(window.location.origin)}'</code><code>npm run local-judge</code></div>
    <form id="local-judge-form">
      <label class="auth-field">终端显示的一次性配对口令<input name="pairingToken" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="粘贴本地评测器终端中的配对口令"></label>
      <p class="auth-error" id="local-judge-error" role="alert"></p>
      <button class="button button-primary auth-submit" type="submit">安全连接本机评测器</button>
    </form>
    ${state.localJudgeConnected ? `<button class="auth-switch" data-local-judge-disconnect>断开本机评测器</button>` : ""}
    <p class="local-judge-warning">安全提示：本机评测器会在你的电脑上运行提交的程序，不是操作系统沙箱；只提交你信任的代码。本机模式结果由客户端报告，不能作为防作弊的正式成绩。</p>
  </div>`;
}

function openLocalJudgeModal() {
  const modal = document.querySelector("#auth-modal");
  modal.innerHTML = renderLocalJudgeModal();
  modal.hidden = false;
  const input = modal.querySelector('[name="pairingToken"]');
  input.value = state.localPairingToken;
  input.focus();
}

function openAuth(mode = "login") {
  state.authMode = mode;
  const modal = document.querySelector("#auth-modal");
  modal.innerHTML = renderAuthModal();
  modal.hidden = false;
  if (mode === "register") {
    modal.querySelector('[name="role"]').addEventListener("change", (event) => {
      modal.querySelector(".admin-code-field").hidden = event.target.value !== "admin";
    });
  }
  modal.querySelector('[name="username"]').focus();
}

function closeAuth() {
  const modal = document.querySelector("#auth-modal");
  modal.hidden = true;
  modal.innerHTML = "";
}

function updateAccountUI() {
  const user = state.currentUser;
  const label = user ? user.username : "游客";
  document.querySelector("#profile-avatar").textContent = label.slice(0, 1).toUpperCase();
  document.querySelector("#profile-name").textContent = label;
  document.querySelector("#profile-role").textContent = user
    ? (user.role === "admin" ? "管理员" : "学生账号")
    : "请登录后提交";
  document.querySelector("#top-avatar").textContent = label.slice(0, 1).toUpperCase();
  const action = document.querySelector("#profile-action");
  action.textContent = user ? "退出" : "登录";
  action.dataset.auth = user ? "" : "login";
  action.dataset.logout = user ? "true" : "false";
  const topAction = document.querySelector("#top-auth-action");
  topAction.textContent = user ? "退出登录" : "登录 / 注册";
  topAction.dataset.auth = user ? "" : "login";
  topAction.dataset.logout = user ? "true" : "false";
  const adminLink = document.querySelector(".admin-nav");
  adminLink.hidden = user?.role !== "admin";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('[type="submit"]');
  const errorBox = form.querySelector("#auth-error");
  submit.disabled = true;
  errorBox.textContent = "";
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await requestJson(state.authMode === "register" ? "/api/register" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    state.currentUser = result.user;
    state.mySubmissions = [];
    state.adminOverview = null;
    state.codeByLanguage = {};
    updateAccountUI();
    closeAuth();
    await loadSubmissions(false);
    render();
    if (state.currentUser.role === "admin" && state.page === "admin") loadAdminOverview();
    showToast(state.currentUser.role === "admin" ? "管理员账号已登录。" : "登录成功，开始练习吧。");
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    if (submit.isConnected) submit.disabled = false;
  }
}

async function handleLocalJudgeSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const token = new FormData(form).get("pairingToken").trim();
  const errorBox = form.querySelector("#local-judge-error");
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  errorBox.textContent = "";
  try {
    const response = await fetch("http://127.0.0.1:4174/api/status", {
      headers: { "X-Local-Judge-Token": token },
      signal: AbortSignal.timeout(3000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "无法连接本机评测器。");
    state.localPairingToken = token;
    state.localJudgeConnected = true;
    sessionStorage.setItem("ll-local-judge-token", token);
    closeAuth();
    updateJudgeStatus();
    render();
    showToast("本机评测器已连接。");
  } catch (error) {
    errorBox.textContent = error.name === "TypeError"
      ? "浏览器未能访问本机评测器。请确认程序已启动，且网站来源与 OJ_WEB_ORIGIN 完全一致。"
      : error.message;
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

function updateJudgeStatus() {
  const label = document.querySelector("#judge-status-text");
  const dot = document.querySelector("#judge-dot");
  label.textContent = state.judgeConfigured
    ? "评测服务已连接"
    : state.localJudgeConnected
      ? "本机评测器已连接"
      : "可连接本机评测";
  dot.classList.toggle("online", state.judgeConfigured || state.localJudgeConnected);
}

async function evaluateLocally(problem, language, code) {
  const testData = await requestJson(`/api/local-tests?problemId=${encodeURIComponent(problem.id)}`);
  const response = await fetch("http://127.0.0.1:4174/api/evaluate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Local-Judge-Token": state.localPairingToken
    },
    body: JSON.stringify({ language, code, tests: testData.tests }),
    signal: AbortSignal.timeout(120_000)
  });
  const result = await response.json();
  if (response.status === 401) {
    state.localJudgeConnected = false;
    state.localPairingToken = "";
    sessionStorage.removeItem("ll-local-judge-token");
    updateJudgeStatus();
    throw new Error("本机评测器配对已失效，请重新连接。");
  }
  if (!response.ok) throw new Error(result.error || "本机评测失败。");
  return result;
}

async function logout() {
  try {
    await requestJson("/api/logout", { method: "POST" });
    state.currentUser = null;
    state.mySubmissions = null;
    state.adminOverview = null;
    state.codeByLanguage = {};
    if (state.page === "admin") state.page = "home";
    updateAccountUI();
    setPage(state.page);
    showToast("已安全退出。");
  } catch (error) {
    showToast(error.message);
  }
}

async function loadSubmissions(showErrors = true) {
  if (!state.currentUser) {
    state.mySubmissions = null;
    return;
  }
  try {
    state.mySubmissions = await requestJson("/api/submissions");
    if (state.page === "submissions") render();
  } catch (error) {
    if (showErrors) showToast(error.message);
  }
}

async function loadAdminOverview() {
  try {
    state.adminOverview = await requestJson("/api/admin/overview");
    if (state.page === "admin") render();
  } catch (error) {
    showToast(error.message);
  }
}

function saveLocalResult(problemId, language, result) {
  return requestJson("/api/local-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      problemId,
      language,
      verdict: result.verdict,
      passed: result.passed,
      total: result.total,
      time: result.time,
      failedCase: result.failedCase ?? null
    })
  });
}

function emptyState(message) {
  return `<div class="empty-state"><span>✳</span><p>${escapeHtml(message)}</p></div>`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

async function submitCode() {
  const codeEditor = document.querySelector("#code-editor");
  const button = document.querySelector("#submit-code");
  const resultContainer = document.querySelector("#submission-result");
  if (!codeEditor || !button || !state.selectedProblem) return;
  if (!state.currentUser) {
    openAuth("login");
    showToast("请登录后提交代码。");
    return;
  }
  const code = codeEditor.value;
  if (!code.trim()) {
    showToast("先写一点代码再提交吧。");
    return;
  }
  const language = document.querySelector("#language-select").value;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> 评测中...';
  resultContainer.innerHTML = `<div class="submission-message pending-result"><span class="spinner"></span>正在运行测试数据，请稍候。</div>`;
  try {
    let result;
    if (!state.judgeConfigured) {
      if (!state.localJudgeConnected) {
        openLocalJudgeModal();
        throw new Error("先连接本机评测器，再提交代码。");
      }
      result = await evaluateLocally(state.selectedProblem, language, code);
      await saveLocalResult(state.selectedProblem.id, language, result);
    } else {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: state.selectedProblem.id, language, code })
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败，请稍后重试。");
    }
    const accepted = result.verdict === "Accepted";
    resultContainer.innerHTML = `<div class="submission-message ${accepted ? "accepted-result" : "failed-result"}">
      <div><strong>${accepted ? "✓ " : "× "}${escapeHtml(result.verdict)}</strong><span>${result.passed} / ${result.total} 个测试点通过</span></div>
      ${result.failedCase ? `<p>失败测试点：${result.failedCase}</p>` : ""}
      ${result.compileOutput ? `<pre>${escapeHtml(result.compileOutput)}</pre>` : ""}
      <small>评测时间 ${escapeHtml(String(result.time ?? "-"))} s · 内存 ${escapeHtml(String(result.memory ?? "-"))} KB</small></div>`;
    showToast(accepted ? "恭喜通过！" : "评测完成，继续加油。");
    await loadSubmissions(false);
  } catch (error) {
    resultContainer.innerHTML = `<div class="submission-message failed-result"><strong>评测未完成</strong><p>${escapeHtml(error.message)}</p></div>`;
  } finally {
    const currentButton = document.querySelector("#submit-code");
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.innerHTML = '提交评测 <span>→</span>';
    }
  }
}

document.addEventListener("click", (event) => {
  const authButton = event.target.closest("[data-auth]");
  if (authButton && authButton.dataset.auth) {
    openAuth(authButton.dataset.auth);
    return;
  }
  if (event.target.closest("[data-auth-close]")) {
    closeAuth();
    return;
  }
  if (event.target.closest("#local-judge-config")) {
    openLocalJudgeModal();
    return;
  }
  if (event.target.closest("[data-local-judge-close]")) {
    closeAuth();
    return;
  }
  if (event.target.id === "auth-modal") {
    closeAuth();
    return;
  }
  if (event.target.closest("[data-local-judge-disconnect]")) {
    state.localJudgeConnected = false;
    state.localPairingToken = "";
    sessionStorage.removeItem("ll-local-judge-token");
    closeAuth();
    updateJudgeStatus();
    render();
    showToast("已断开本机评测器。");
    return;
  }
  if (event.target.closest("[data-logout='true']")) {
    logout();
    return;
  }
  const pageLink = event.target.closest("[data-page]");
  if (pageLink) {
    event.preventDefault();
    if (pageLink.dataset.difficulty) {
      state.difficulty = pageLink.dataset.difficulty;
      state.search = "";
    }
    setPage(pageLink.dataset.page);
    return;
  }
  const problemButton = event.target.closest("[data-problem]");
  if (problemButton) {
    state.selectedProblem = state.problems.find((problem) => problem.id === problemButton.dataset.problem) || null;
    if (state.selectedProblem) {
      render();
      document.querySelector("#problem-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }
  if (event.target.closest('[data-action="close-problem"]')) {
    state.selectedProblem = null;
    render();
    return;
  }
  if (event.target.closest("#submit-code")) submitCode();
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "auth-form") handleAuthSubmit(event);
  if (event.target.id === "local-judge-form") handleLocalJudgeSubmit(event);
});

document.addEventListener("input", (event) => {
  if (event.target.id === "problem-search") {
    const cursor = event.target.selectionStart;
    state.search = event.target.value;
    render();
    const input = document.querySelector("#problem-search");
    input.focus();
    input.setSelectionRange(cursor, cursor);
  }
  if (event.target.id === "code-editor") {
    state.codeByLanguage[state.language] = event.target.value;
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "difficulty-filter") {
    state.difficulty = event.target.value;
    render();
  }
  if (event.target.id === "language-select") {
    const editor = document.querySelector("#code-editor");
    if (editor) state.codeByLanguage[state.language] = editor.value;
    state.language = event.target.value;
    render();
    document.querySelector("#problem-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#auth-modal").hidden) closeAuth();
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && document.querySelector("#code-editor")) {
    event.preventDefault();
    submitCode();
  }
});

document.querySelector("#mobile-menu").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("sidebar-open");
});

async function initialize() {
  try {
    const [problemResponse, statusResponse, meResponse] = await Promise.all([
      fetch("/api/problems"),
      fetch("/api/status"),
      fetch("/api/me")
    ]);
    if (!problemResponse.ok || !statusResponse.ok || !meResponse.ok) throw new Error("服务暂不可用");
    state.problems = await problemResponse.json();
    const status = await statusResponse.json();
    state.currentUser = (await meResponse.json()).user;
    state.adminRegistrationEnabled = status.adminRegistrationEnabled;
    state.judgeConfigured = status.judgeConfigured;
    updateAccountUI();
    if (state.localPairingToken && !state.judgeConfigured) {
      try {
        const response = await fetch("http://127.0.0.1:4174/api/status", {
          headers: { "X-Local-Judge-Token": state.localPairingToken },
          signal: AbortSignal.timeout(2500)
        });
        state.localJudgeConnected = response.ok;
      } catch {
        state.localJudgeConnected = false;
        state.localPairingToken = "";
        sessionStorage.removeItem("ll-local-judge-token");
      }
    }
    if (state.currentUser) await loadSubmissions(false);
    document.querySelector("#problem-count").textContent = String(state.problems.length).padStart(2, "0");
    updateJudgeStatus();
    render();
  } catch {
    document.querySelector("#judge-status-text").textContent = "服务连接失败";
    document.querySelector("#judge-dot").classList.add("offline");
    pageContent.innerHTML = `<section class="panel empty-panel"><div class="empty-illustration">!</div><h2>无法连接到本地服务</h2><p>请回到项目目录启动服务：npm start</p></section>`;
  }
}

initialize();

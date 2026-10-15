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
  ranking: null,
  contests: null,
  contestLeaderboards: {},
  activeContestId: null,
  selectedSubmissionId: null,
  adminOverview: null,
  siteSettings: { siteTitle: "哎呀我去做会OJ", anime: null, deepseekConfigured: false },
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
  if (page === "ranking") loadRanking();
  if (page === "contests") loadContests();
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
  mountCodeEditor();
}

function updateSiteBrand() {
  const siteTitle = state.siteSettings.siteTitle || "哎呀我去做会OJ";
  document.title = siteTitle;
  document.querySelectorAll("[data-site-title]").forEach((element) => {
    element.textContent = siteTitle;
  });
  document.querySelectorAll("[data-site-mark]").forEach((element) => {
    element.textContent = Array.from(siteTitle.trim())[0] || "OJ";
  });
  document.querySelector(".brand")?.setAttribute("aria-label", `${siteTitle}首页`);
}

const dailyQuotes = [
  "代码不只是答案，更是你思考的轨迹。",
  "先把问题拆小，复杂的事就有了入口。",
  "每一次调试，都是更接近理解的一步。",
  "不用一次写对，重要的是持续发现问题。",
  "清晰的思路，胜过匆忙敲下的代码。",
  "今天多懂一点，明天就能走得更远。",
  "遇到难题先别怕，试着把它分成几步。",
  "错误不是终点，它在告诉你该往哪里看。",
  "把想法讲清楚，往往就找到了解法。",
  "认真完成的小练习，也会积累成大进步。",
  "先理解数据，再决定怎样处理它。",
  "好程序不仅能运行，也让人读得明白。",
  "卡住时换个角度，答案也许就在旁边。",
  "每行代码都在练习，每次练习都算数。",
  "把大目标拆成今天能完成的一小步。",
  "耐心检查边界，细节常常决定成败。",
  "写下第一版，再让它变得更好。",
  "算法是工具，解决真实问题才是目的。",
  "一次只解决一个问题，进度就会向前。",
  "坚持复盘今天，明天就少绕一点弯路。",
  "从样例开始推演，让抽象变得具体。",
  "愿意尝试新方法，就是成长的开始。",
  "学会求助，也学会解释自己已经尝试了什么。",
  "把失败的测试点变成下一次的提示。",
  "先保证正确，再思考如何更快。",
  "每个熟练的人，都曾从基础开始。",
  "写代码需要灵感，也需要一点点耐心。",
  "今天解决一个小问题，就是很好的进展。",
  "多问一句为什么，理解就会更扎实。",
  "保持好奇，下一道题会带来新的发现。"
];

function dailyQuote(date = new Date()) {
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  const index = ((dayNumber % dailyQuotes.length) + dailyQuotes.length) % dailyQuotes.length;
  return dailyQuotes[index];
}

function solvedProblemIds() {
  return new Set((state.mySubmissions || [])
    .filter((submission) => submission.verdict === "Accepted")
    .map((submission) => submission.problemId));
}

function renderHome() {
  const submissions = state.mySubmissions || [];
  const solved = solvedProblemIds();
  const recommended = state.problems.slice(0, 3);
  const level = state.currentUser?.level || 1;
  const experience = state.currentUser?.experience || 0;
  const levelProgress = state.currentUser?.progressPercent || 0;
  return `
    <section class="welcome-row">
      <div><p class="eyebrow"><span class="eyebrow-line"></span> YOUR PERSONAL CODING ARENA</p>
        <h1>${escapeHtml(state.siteSettings.siteTitle)}</h1>
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
    ${state.currentUser ? `<section class="panel xp-summary"><div><span class="level-badge">Lv.${level}</span><div><strong>${experience.toLocaleString()} EXP</strong><small>下一等级还需 ${state.currentUser.xpToNextLevel.toLocaleString()} EXP</small></div></div><div class="xp-track"><i style="width:${levelProgress}%"></i></div></section>` : ""}
    <div class="content-grid">
      <section class="panel problem-panel"><div class="section-heading"><div><p class="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>推荐练习</h2></div><button class="text-button" data-page="problems">全部题目 <span>→</span></button></div>
        <div class="mini-problem-list">${recommended.length ? recommended.map((problem) => problemRow(problem, solved)).join("") : emptyState("题目正在准备中")}</div>
      </section>
      <aside class="panel side-panel"><div class="section-heading"><div><p class="eyebrow">A LITTLE NOTE</p><h2>今日寄语</h2></div><span class="note-spark">✦</span></div>
        <div class="quote-mark">“</div><blockquote>${escapeHtml(dailyQuote())}</blockquote>
        <div class="note-footer"><span class="note-dot"></span> 写下今天的第一行代码</div>
      </aside>
    </div>
    ${renderAnimeRecommendation()}
    <section class="bottom-banner"><div><span class="banner-icon">✳</span><div><strong>今天想练点什么？</strong><p>挑选一个主题，开启专注训练时间。</p></div></div><button class="button button-quiet" data-page="training">探索训练计划 <span>→</span></button></section>`;
}

function animeSourceName(anime) {
  if (anime.sourceName) return anime.sourceName;
  if (typeof anime.sourceUrl === "string") {
    if (anime.sourceUrl.includes("douban.com")) return "豆瓣电影";
    if (anime.sourceUrl.includes("anilist.co")) return "AniList";
  }
  return "动漫资料库";
}

function animePosterSrc(anime) {
  return `/api/anime/poster?url=${encodeURIComponent(anime.imageUrl)}`;
}

function renderAnimeRecommendation() {
  const anime = state.siteSettings.anime;
  if (!anime) {
    return `<section class="panel anime-recommendation"><div class="section-heading"><div><p class="eyebrow">ANIME PICK</p><h2>本周日漫推荐</h2></div><span class="note-spark">✦</span></div><p class="anime-empty">管理员还没有设置动漫推荐，敬请期待。</p></section>`;
  }
  const sourceName = animeSourceName(anime);
  const poster = anime.imageUrl
    ? `<a class="anime-poster-link" href="${escapeHtml(anime.sourceUrl || anime.imageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在 ${escapeHtml(sourceName)} 查看 ${escapeHtml(anime.title)}"><img class="anime-poster" src="${escapeHtml(animePosterSrc(anime))}" alt="${escapeHtml(anime.title)} 海报" loading="lazy" referrerpolicy="no-referrer"></a>`
    : `<div class="anime-poster anime-poster-placeholder"><span>✦</span><small>海报暂不可用</small></div>`;
  const sourceLink = anime.sourceUrl
    ? `<a href="${escapeHtml(anime.sourceUrl)}" target="_blank" rel="noopener noreferrer">海报与作品资料：${escapeHtml(sourceName)} →</a>`
    : "";
  const attribution = anime.imageUrl
    ? `海报与作品资料来自 ${escapeHtml(sourceName)}，由本机服务转发以规避防盗链。推荐文章由 DeepSeek AI 生成。`
    : "本次未能获取作品海报与资料。推荐文章由 DeepSeek AI 生成。";
  return `<section class="panel anime-recommendation"><div class="section-heading"><div><p class="eyebrow">ANIME PICK · AI RECOMMENDATION</p><h2>${escapeHtml(anime.requestedTitle || anime.title)}</h2></div><span class="pill pill-muted">日漫推荐</span></div>
    <div class="anime-recommendation-body">${poster}
      <div class="anime-article"><p class="anime-original-title">${escapeHtml(anime.title)}</p><p>${escapeHtml(anime.article).split("\n").join("<br>")}</p>${sourceLink}</div></div>
    <p class="anime-attribution">${attribution}</p></section>`;
}

function problemRow(problem, solved = solvedProblemIds()) {
  const difficultyClass = difficultyTone(problem.difficulty);
  const isSolved = solved.has(problem.id);
  return `<button class="problem-row" data-problem="${escapeHtml(problem.id)}">
    <span class="problem-status${isSolved ? " solved" : ""}"${isSolved ? ' aria-label="已通过" title="已通过"' : ' aria-hidden="true"'}>${isSolved ? "✓ 已通过" : ""}</span><span class="problem-id">${escapeHtml(problem.id)}</span>
    <span class="problem-title">${escapeHtml(problem.title)}<small>考点：${escapeHtml((problem.knowledgePoints || []).join("、") || problem.category)} · 系数 ${problem.difficultyCoefficient} · 首通 +${problem.difficultyCoefficient * 10} EXP</small></span>
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
  const solved = solvedProblemIds();
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
        const knowledge = [...(problem.knowledgePoints || []).map((point) => `<i class="knowledge-chip">${escapeHtml(point)}</i>`), `<i class="knowledge-chip">难度系数 ${problem.difficultyCoefficient}</i>`].join("");
        const isSolved = solved.has(problem.id);
        return `<button class="table-row" data-problem="${escapeHtml(problem.id)}"><span class="problem-status${isSolved ? " solved" : ""}"${isSolved ? ' aria-label="已通过" title="已通过"' : ' aria-hidden="true"'}>${isSolved ? "✓ 已通过" : ""}</span><span class="table-title"><b>${escapeHtml(problem.id)}</b><span class="table-main">${escapeHtml(problem.title)}<small class="knowledge-list">${knowledge || `<i class="knowledge-chip">${escapeHtml(problem.category)}</i>`}</small></span></span><span><i class="difficulty ${difficultyClass}">${escapeHtml(problem.difficulty)}</i></span><span class="table-muted">${escapeHtml(problem.category)}</span><span class="rate-cell"><span class="rate-track"><i style="width:${rate}%"></i></span>${rate}%</span><span class="row-arrow">↗</span></button>`;
      }).join("") || emptyState("没有找到匹配的题目")}</div>
    </section>${detail}`;
}

const STARTER_CODE = {
  c: "#include <stdio.h>\n\nint main(void) {\n    // 在这里编写你的解法\n    return 0;\n}\n",
  cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在这里编写你的解法\n    return 0;\n}\n",
  python: "# 在这里编写你的解法\n",
  javascript: "// 在这里编写你的解法\n"
};

function renderProblemDetail(problem) {
  return `<section class="panel detail-panel" id="problem-detail">
    <div class="detail-top"><div><button class="back-button" data-action="close-problem">← 返回题目列表</button><p class="eyebrow">${escapeHtml(problem.id)} · ${escapeHtml(problem.category)}</p><h2>${escapeHtml(problem.title)}</h2><div class="detail-knowledge">${(problem.knowledgePoints || []).map((point) => `<span class="knowledge-chip">${escapeHtml(point)}</span>`).join("")}<span class="knowledge-chip">难度系数 ${problem.difficultyCoefficient} · 首次通过 +${problem.difficultyCoefficient * 10} EXP</span></div></div><span class="difficulty ${difficultyTone(problem.difficulty)}">${escapeHtml(problem.difficulty)}</span></div>
    <div class="statement">${problem.background ? `<h3>实际背景</h3><p>${escapeHtml(problem.background)}</p>` : ""}<h3>题目描述</h3><p>${escapeHtml(problem.description)}</p><h3>输入格式</h3><p>${escapeHtml(problem.input)}</p><h3>输出格式</h3><p>${escapeHtml(problem.output)}</p>
      <h3>样例</h3>${problem.examples.map((example, index) => `<div class="example-grid"><div><label>输入 ${index + 1}</label><pre>${escapeHtml(example.input || "(无输入)")}</pre></div><div><label>输出 ${index + 1}</label><pre>${escapeHtml(example.output)}</pre></div></div>`).join("")}
    </div>
    <div class="editor-heading"><div><h3>提交代码</h3><span>${state.judgeConfigured ? "使用网站评测服务" : state.localJudgeConnected ? "代码将在你的电脑上运行" : "连接本机评测器后即可在自己的电脑运行"}</span></div><div class="editor-controls"><button class="button button-outline local-connect-button" id="local-judge-config">${state.localJudgeConnected ? "本机评测器已连接 · 设置" : "连接本机评测器"}</button><select id="language-select" aria-label="编程语言"><option value="c" ${state.language === "c" ? "selected" : ""}>C17</option><option value="cpp" ${state.language === "cpp" ? "selected" : ""}>C++17</option><option value="python" ${state.language === "python" ? "selected" : ""}>Python 3</option><option value="javascript" ${state.language === "javascript" ? "selected" : ""}>JavaScript</option></select></div></div>
    <div class="editor-actions"><button class="button button-outline" id="editor-rename" type="button" title="Ctrl+Shift+R">重命名同名变量</button><button class="button button-outline" id="editor-select-word" type="button" title="Ctrl+D">找下一个相同词</button><span class="editor-hint">光标停在括号上会高亮配对括号 · Ctrl+F 查找 · Ctrl+/ 注释</span></div>
    <div class="editor-wrap"><div id="code-editor" class="code-editor-host" aria-label="代码编辑器"></div></div>
    <section class="self-test-panel"><div class="self-test-heading"><div><strong>自测</strong><small>仅在本机运行，不会保存为正式提交</small></div><button class="button button-outline" id="run-self-test" type="button">运行自测</button></div><label class="self-test-input-label" for="self-test-input">自定义输入（已填入第一组样例，可自行修改）</label><textarea id="self-test-input" spellcheck="false">${escapeHtml(problem.examples?.[0]?.input || "")}</textarea><div id="self-test-result" aria-live="polite"></div></section>
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
  const admin = state.currentUser?.role === "admin";
  const problems = state.problems.map((problem) =>
    `<option value="${escapeHtml(problem.id)}">${escapeHtml(problem.id)} · ${escapeHtml(problem.title)}（系数 ${problem.difficultyCoefficient}）</option>`
  ).join("");
  const cards = state.contests?.length ? state.contests.map((contest) => {
    const statusLabels = { upcoming: "即将开始", running: "进行中", ended: "已结束" };
    const dateRange = `${new Date(contest.startsAt).toLocaleString("zh-CN", { hour12: false })} — ${new Date(contest.endsAt).toLocaleString("zh-CN", { hour12: false })}`;
    const registerAction = state.currentUser?.role === "student" && contest.status === "upcoming" && !contest.registered
      ? `<button class="button button-primary" data-contest-register="${escapeHtml(contest.id)}">报名参赛</button>`
      : "";
    const waiting = contest.status === "upcoming" && contest.registered
      ? `<p class="contest-private-note">报名成功。比赛开始前题目保持隐藏。</p>`
      : contest.status === "upcoming" && !state.currentUser && !admin
        ? `<p class="contest-private-note">登录并报名后，比赛开始时即可查看题目。</p>`
        : "";
    const problemList = contest.problems?.length
      ? `<div class="contest-problems"><strong>比赛题目</strong>${contest.problems.map((problem) =>
        `<button class="contest-problem" data-problem="${escapeHtml(problem.id)}" data-contest-id="${escapeHtml(contest.id)}"><span>${escapeHtml(problem.id)} · ${escapeHtml(problem.title)}</span><span class="difficulty ${difficultyTone(problem.difficulty)}">${escapeHtml(problem.difficulty)}</span></button>`
      ).join("")}</div>`
      : "";
    const leaderboard = contest.status !== "upcoming" && (contest.registered || admin)
      ? `<button class="button button-outline" data-contest-leaderboard="${escapeHtml(contest.id)}">${state.contestLeaderboards[contest.id] ? "收起比赛榜" : "查看比赛榜"}</button>`
      : "";
    const contestBoard = state.contestLeaderboards[contest.id]
      ? `<div class="contest-board"><div class="ranking-table-head"><span>排名</span><span>选手</span><span>通过题数</span><span>罚时</span></div>${state.contestLeaderboards[contest.id].leaderboard.map((entry) => `<div class="ranking-table-row"><span>${entry.rank}</span><span>${escapeHtml(entry.username)}</span><span>${entry.solved}</span><strong>${entry.penalty} 分钟</strong></div>`).join("") || emptyState("暂无比赛成绩")}</div>`
      : "";
    return `<article class="panel contest-card"><div class="contest-card-top"><div><span class="pill pill-muted">${statusLabels[contest.status]}</span><h2>${escapeHtml(contest.title)}</h2></div><span class="contest-participants">${contest.participantCount} 人报名</span></div>${contest.description ? `<p>${escapeHtml(contest.description)}</p>` : ""}<p class="contest-dates">${escapeHtml(dateRange)}</p><div class="contest-actions">${registerAction}${leaderboard}</div>${waiting}${problemList}${contestBoard}</article>`;
  }).join("") : `<section class="panel empty-panel"><div class="empty-illustration">⚑</div><h2>暂时还没有比赛</h2><p>${admin ? "可在下方创建一场新比赛。" : "管理员创建比赛后，你可以在这里报名参加。"}</p></section>`;
  const creationForm = admin ? `<form id="contest-form" class="panel contest-form"><div class="section-heading"><div><p class="eyebrow">ADMINISTRATION</p><h2>创建比赛</h2></div><span class="pill pill-muted">仅管理员</span></div><label class="auth-field">比赛名称<input name="title" required minlength="3" maxlength="80" placeholder="例如：周末算法挑战"></label><label class="auth-field">说明（可选）<textarea name="description" maxlength="500" rows="2" placeholder="比赛说明"></textarea></label><div class="contest-time-fields"><label class="auth-field">开始时间<input name="startsAt" type="datetime-local" required></label><label class="auth-field">结束时间<input name="endsAt" type="datetime-local" required></label></div><label class="auth-field">选择题目（1–20 道，按住 Ctrl/⌘ 可多选）<select name="problemIds" multiple required size="7">${problems}</select></label><p class="auth-error" id="contest-error" role="alert"></p><button class="button button-primary" type="submit">创建比赛</button></form>` : "";
  return `<div class="page-heading"><div><p class="eyebrow">FRIENDLY CHALLENGES</p><h1>比赛</h1><p>学生可直接报名；题目在比赛开始后向已报名者开放，榜单按通过题数和罚时排序。</p></div>${admin ? `<span class="pill pill-muted">管理员可创建比赛</span>` : ""}</div>${state.contests === null ? `<section class="panel empty-panel"><span class="spinner"></span><p>正在读取比赛…</p></section>` : `<div class="contest-list">${cards}</div>`}${creationForm}`;
}

function renderSubmissions() {
  if (!state.currentUser) {
    return `<section class="panel empty-panel"><div class="empty-illustration">⌁</div><h2>登录后查看个人记录</h2><p>每个账号的提交记录和解题进度彼此隔离。</p><button class="button button-primary" data-auth="login">登录 / 注册</button></section>`;
  }
  const history = state.mySubmissions;
  if (history === null) return `<section class="panel empty-panel"><span class="spinner"></span><p>正在读取提交记录…</p></section>`;
  const selectedSubmission = history.find((item) => item.id === state.selectedSubmissionId);
  return `<div class="page-heading"><div><p class="eyebrow">YOUR CODE JOURNEY</p><h1>提交记录</h1><p>每次尝试都会留下进步的痕迹。</p></div></div>
    <section class="panel history-panel"><div class="history-head"><span>题目</span><span>语言</span><span>结果</span><span>提交时间</span></div>
    ${history.length ? history.map((item) => `<button class="history-row" type="button" data-submission="${escapeHtml(item.id)}" aria-expanded="${item.id === state.selectedSubmissionId}"><span><b>${escapeHtml(item.problemId)}</b> ${escapeHtml(item.title)}<small class="history-source">${item.id === state.selectedSubmissionId ? "点击收起详情" : "点击查看评测详情"}</small></span><span>${escapeHtml(item.language)}${item.evaluationSource ? `<small class="history-source">${escapeHtml(item.evaluationSource)}</small>` : ""}</span><span class="${item.verdict === "Accepted" ? "verdict-ok" : "verdict-other"}">${escapeHtml(formatVerdict(item.verdict))}</span><span>${escapeHtml(new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false }))}</span></button>`).join("") : emptyState("还没有提交记录。完成一道题后，记录会显示在这里。")}
    ${selectedSubmission ? renderSubmissionDetail(selectedSubmission) : ""}</section>`;
}

function renderSubmissionDetail(submission) {
  const testResults = Array.isArray(submission.testResults) ? submission.testResults : [];
  const total = Number.isInteger(submission.total) ? submission.total : testResults.length;
  return `<section class="submission-detail" id="submission-detail"><div class="submission-detail-heading"><div><h2>${escapeHtml(submission.problemId)} · ${escapeHtml(submission.title)}</h2><p>${escapeHtml(submission.language)} · ${escapeHtml(new Date(submission.createdAt).toLocaleString("zh-CN", { hour12: false }))}</p></div><button class="text-button" type="button" data-action="close-submission-detail">收起</button></div>
    <div class="submission-summary"><strong class="${submission.verdict === "Accepted" ? "verdict-ok" : "verdict-other"}">${escapeHtml(formatVerdict(submission.verdict))}</strong><span>${Number(submission.passed) || 0} / ${total} 个测试点通过</span>${submission.time !== undefined ? `<span>用时 ${escapeHtml(String(submission.time))} s</span>` : ""}${submission.memory !== undefined ? `<span>内存 ${escapeHtml(String(submission.memory))} KB</span>` : ""}</div>
    ${submission.compileOutput ? `<div class="case-diagnostic"><strong>编译/运行信息</strong><pre>${escapeHtml(submission.compileOutput)}</pre></div>` : ""}
    ${testResults.length ? renderCaseResults(testResults, total) : `<p class="history-detail-note">此记录来自旧版本，尚未保存逐测试点详情。</p>`}</section>`;
}

function verdictCode(verdict) {
  return ({
    Accepted: "AC",
    "Wrong Answer": "WA",
    "Time Limit Exceeded": "TLE",
    "Memory Limit Exceeded": "MLE",
    "Runtime Error": "RTE",
    "Compilation Error": "CE"
  })[verdict] || verdict;
}

function formatVerdict(verdict) {
  const names = {
    AC: "通过",
    WA: "答案错误",
    TLE: "超时",
    MLE: "超出内存",
    RTE: "运行错误",
    CE: "编译错误"
  };
  const code = verdictCode(verdict);
  return names[code] ? `${code}（${names[code]}）` : verdict;
}

function renderCaseResults(testResults, total = testResults.length) {
  if (!testResults?.length) return "";
  const resultByCase = new Map(testResults.map((result) => [result.case, result]));
  const count = Math.max(total, ...testResults.map((result) => result.case));
  const statusCodes = ["AC", "WA", "TLE", "MLE", "RTE", "CE"];
  const statusCounts = Object.fromEntries(statusCodes.map((code) => [code, 0]));
  for (const result of testResults) {
    const code = verdictCode(result.verdict);
    if (Object.hasOwn(statusCounts, code)) statusCounts[code] += 1;
  }
  return `<div class="case-summary">${statusCodes.map((code) => `${code}: ${statusCounts[code]}`).join("　")}</div><div class="case-results">${Array.from({ length: count }, (_, index) => {
    const result = resultByCase.get(index + 1);
    if (!result) {
      return `<article class="case-result case-not-run"><strong>测试点 ${index + 1}</strong><span>未运行（前序测试点已失败）</span></article>`;
    }
    const passed = result.verdict === "Accepted";
    return `<article class="case-result ${passed ? "case-passed" : "case-failed"}"><div class="case-result-heading"><strong>${passed ? "✓" : "×"} 测试点 ${result.case} · ${escapeHtml(formatVerdict(result.verdict))}</strong>${result.time !== undefined ? `<span>${escapeHtml(String(result.time))} s</span>` : ""}</div>
      ${result.error ? `<div class="case-diagnostic"><strong>错误信息</strong><pre>${escapeHtml(result.error)}</pre></div>` : ""}
      ${typeof result.input === "string" ? `<div class="case-output-grid"><div><label>输入</label><pre>${escapeHtml(result.input)}</pre></div><div><label>标准输出</label><pre>${escapeHtml(result.expectedOutput ?? "")}</pre></div><div><label>你的输出</label><pre>${escapeHtml(result.actualOutput ?? "")}</pre></div></div>` : ""}</article>`;
  }).join("")}</div>`;
}

function renderDiscuss() {
  return `<div class="page-heading"><div><p class="eyebrow">SHARE WHAT YOU LEARN</p><h1>讨论</h1><p>记录思路、整理问题，让每次思考都能沉淀下来。</p></div></div>
    <section class="panel empty-panel"><div class="empty-illustration">▧</div><h2>给灵感留个位置</h2><p>当前是本地个人版，讨论区暂不保存或公开帖子。你可以先在笔记里记录解题思路。</p><button class="button button-outline" data-page="problems">挑一道题开始 →</button></section>`;
}

function renderRanking() {
  if (state.ranking === null) return `<section class="panel empty-panel"><span class="spinner"></span><p>正在读取经验排行榜…</p></section>`;
  return `<div class="page-heading"><div><p class="eyebrow">EXPERIENCE LEADERBOARD</p><h1>排行榜</h1><p>按累计经验值排名。每道题首次通过可获得难度系数 × 10 EXP。</p></div></div>
    <section class="panel ranking-panel"><div class="ranking-table-head"><span>排名</span><span>选手</span><span>等级</span><span>经验值</span></div>${state.ranking.length ? state.ranking.map((entry) => `<div class="ranking-table-row ${state.currentUser?.id === entry.id ? "ranking-self" : ""}"><span class="rank-number">${entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}</span><span>${escapeHtml(entry.username)}</span><span><span class="level-badge">Lv.${entry.level}</span></span><strong>${entry.experience.toLocaleString()} EXP</strong></div>`).join("") : emptyState("还没有学生上榜，完成题目即可获得经验。")}</section><p class="ranking-footnote">升级所需经验：Lv.n → Lv.(n+1) 需要 100 + 5×n² EXP，最高 Lv.999。管理员账号不参与排行榜。启用本机评测时，经验值来自用户设备报告，不可视为防作弊成绩。</p>`;
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
    <section class="panel contest-form"><div class="section-heading"><div><p class="eyebrow">DESKTOP BRANDING</p><h2>桌面端标题</h2></div></div>
      <form id="site-title-form"><label class="auth-field">桌面端名称<input name="siteTitle" required maxlength="60" value="${escapeHtml(state.siteSettings.siteTitle)}"></label><p class="auth-help">${state.siteSettings.titleSync?.error ? `共享标题服务暂不可用：${escapeHtml(state.siteSettings.titleSync.error)}` : state.siteSettings.titleSync?.enabled ? (state.siteSettings.titleSync.canEdit ? "标题会同步给所有已联网的桌面客户端。" : "共享标题已启用；当前设备可以接收更新，但不能修改共享标题。") : "标题保存在本机。"} </p><p class="form-feedback" id="site-title-feedback" role="status"></p><button class="button button-primary" type="submit">保存桌面端标题</button></form>
    </section>
    <section class="panel contest-form"><div class="section-heading"><div><p class="eyebrow">ANIME PICK</p><h2>主页日漫推荐</h2></div><span class="pill pill-muted">${state.siteSettings.deepseekConfigured ? "DeepSeek 已配置" : "需要 DeepSeek Key"}</span></div>
      <form id="anime-recommendation-form"><label class="auth-field">动漫名称<input name="title" required maxlength="120" value="${escapeHtml(state.siteSettings.anime?.requestedTitle || "")}" placeholder="输入日漫名称"></label>
        <label class="auth-field">DeepSeek API Key<input name="apiKey" type="password" autocomplete="new-password" maxlength="500" placeholder="${state.siteSettings.deepseekConfigured ? "已配置；留空则继续使用现有密钥" : "粘贴你的 DeepSeek API Key"}"></label>
        <p class="auth-help">保存后会先在国内可直连的豆瓣电影检索作品、海报与资料（必要时用萌娘百科补充简介），再调用 DeepSeek 生成原创中文推荐文。API Key 只在服务端加密保存，不会返回给访客；请自行确认 DeepSeek 账户的额度/费用政策。</p>
        ${state.siteSettings.anime?.metadataNotice ? `<p class="auth-help">${escapeHtml(state.siteSettings.anime.metadataNotice)}</p>` : ""}
        <p class="form-feedback" id="anime-recommendation-feedback" role="status"></p><button class="button button-primary" type="submit">检索海报并生成推荐</button>
      </form>
    </section>
    <section class="panel contest-form"><div class="section-heading"><div><p class="eyebrow">PROBLEM CATALOGUE</p><h2>导入题库</h2></div><span class="pill pill-muted">${state.problems.length} 道题</span></div>
      <p>选择符合题库格式的 JSON 文件。导入会保留现有题目；相同 ID 的题目以文件内容更新。测试点将用于本机评测，请勿导入不可信文件。</p>
      <input id="problem-import-file" type="file" accept=".json,application/json" hidden>
      <button class="button button-primary" id="choose-problem-import" type="button">选择 JSON 题库</button>
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
    ? (user.role === "admin" ? "管理员" : `Lv.${user.level} · ${user.experience.toLocaleString()} EXP`)
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

async function refreshSharedSiteTitle() {
  try {
    const siteSettings = await requestJson("/api/site-settings");
    if (siteSettings.siteTitle === state.siteSettings.siteTitle) return;
    state.siteSettings = { ...state.siteSettings, ...siteSettings };
    updateSiteBrand();
    if (state.page === "home") render();
  } catch (error) {
    console.error("Shared desktop title refresh failed:", error);
  }
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

async function loadRanking() {
  try {
    state.ranking = await requestJson("/api/ranking");
    if (state.page === "ranking") render();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadContests() {
  try {
    state.contests = await requestJson("/api/contests");
    if (state.page === "contests") render();
  } catch (error) {
    state.contests = [];
    showToast(error.message);
    if (state.page === "contests") render();
  }
}

async function registerForContest(contestId) {
  try {
    await requestJson(`/api/contests/${encodeURIComponent(contestId)}/register`, { method: "POST" });
    showToast("报名成功，比赛开始前题目会保持隐藏。");
    await loadContests();
  } catch (error) {
    showToast(error.message);
  }
}

async function toggleContestLeaderboard(contestId) {
  if (state.contestLeaderboards[contestId]) {
    delete state.contestLeaderboards[contestId];
    render();
    return;
  }
  try {
    state.contestLeaderboards[contestId] = await requestJson(`/api/contests/${encodeURIComponent(contestId)}/leaderboard`);
    render();
  } catch (error) {
    showToast(error.message);
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

async function handleSiteTitleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('[type="submit"]');
  const feedback = form.querySelector("#site-title-feedback");
  button.disabled = true;
  feedback.textContent = "";
  try {
    state.siteSettings = await requestJson("/api/admin/site-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteTitle: new FormData(form).get("siteTitle") })
    });
    updateSiteBrand();
    if (state.page === "home") render();
    showToast(state.siteSettings.titleSync?.enabled ? "桌面端标题已更新并同步。" : "桌面端标题已更新。");
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function handleAnimeRecommendationSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('[type="submit"]');
  const feedback = form.querySelector("#anime-recommendation-feedback");
  const values = new FormData(form);
  button.disabled = true;
  button.textContent = "正在检索并生成…";
  feedback.textContent = "正在查询动漫资料并请求 DeepSeek，可能需要几十秒。";
  try {
    state.siteSettings = await requestJson("/api/admin/anime-recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: values.get("title"), apiKey: values.get("apiKey") })
    });
    render();
    showToast("主页日漫推荐已更新。");
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "检索海报并生成推荐";
    }
  }
}

async function importProblemFile(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    showToast("题库文件不能超过 4 MB。");
    return;
  }
  try {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const parsed = JSON.parse(text);
    const result = await requestJson("/api/admin/problems/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Array.isArray(parsed) ? parsed : parsed?.problems)
    });
    state.problems = await requestJson("/api/problems");
    state.contests = null;
    document.querySelector("#problem-count").textContent = String(state.problems.length).padStart(2, "0");
    render();
    showToast(`已导入 ${result.imported} 道，更新 ${result.replaced} 道，题库共 ${result.total} 道。`);
  } catch (error) {
    showToast(error instanceof SyntaxError ? "文件不是有效的 JSON。" : error.message);
  }
}

async function handleContestFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const errorBox = form.querySelector("#contest-error");
  const button = form.querySelector('[type="submit"]');
  const values = new FormData(form);
  button.disabled = true;
  errorBox.textContent = "";
  try {
    const startsAt = new Date(values.get("startsAt"));
    const endsAt = new Date(values.get("endsAt"));
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      throw new Error("请输入有效的比赛开始和结束时间。");
    }
    await requestJson("/api/admin/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.get("title"),
        description: values.get("description"),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        problemIds: values.getAll("problemIds")
      })
    });
    showToast("比赛创建成功。");
    state.contests = null;
    await loadContests();
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

function saveLocalResult(problemId, language, result, contestId) {
  return requestJson("/api/local-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      problemId,
      language,
      contestId,
      verdict: result.verdict,
      passed: result.passed,
      total: result.total,
      time: result.time,
      memory: result.memory,
      failedCase: result.failedCase ?? null,
      testResults: result.testResults || [],
      compileOutput: result.compileOutput || null
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

const EDITOR_MODES = { c: "text/x-csrc", cpp: "text/x-c++src", python: "python", javascript: "javascript" };
let codeEditorInstance = null;

function getEditorCode() {
  return codeEditorInstance ? codeEditorInstance.getValue() : "";
}

function identifierAtCursor(editor) {
  const selection = editor.getSelection();
  if (selection && !selection.includes("\n")) return selection.trim();
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line) || "";
  const isWordChar = (character) => /[A-Za-z0-9_$]/.test(character);
  let start = Math.min(cursor.ch, line.length);
  let end = start;
  while (start > 0 && isWordChar(line[start - 1])) start -= 1;
  while (end < line.length && isWordChar(line[end])) end += 1;
  return line.slice(start, end);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findIdentifierRanges(editor, name) {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
  const ranges = [];
  for (let line = 0; line < editor.lineCount(); line += 1) {
    const text = editor.getLine(line);
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      ranges.push([{ line, ch: match.index }, { line, ch: match.index + name.length }]);
    }
  }
  return ranges;
}

function renameSameIdentifier() {
  const editor = codeEditorInstance;
  if (!editor) return;
  const name = identifierAtCursor(editor);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    showToast("请把光标放在变量名上，或先选中要改名的名字。");
    return;
  }
  const ranges = findIdentifierRanges(editor, name);
  if (!ranges.length) {
    showToast(`没有找到「${name}」。`);
    return;
  }
  editor.openDialog(
    `把「${escapeHtml(name)}」重命名为（共 ${ranges.length} 处）：<input type="text" spellcheck="false" style="width:11em"/>`,
    (answer) => {
      const next = String(answer || "").trim();
      if (!next || next === name) return;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(next)) {
        showToast("变量名只能用字母、数字、下划线或 $，且不能以数字开头。");
        return;
      }
      editor.operation(() => {
        for (let index = ranges.length - 1; index >= 0; index -= 1) {
          editor.replaceRange(next, ranges[index][0], ranges[index][1], "+rename");
        }
      });
      editor.focus();
      showToast(`已把 ${ranges.length} 处「${name}」改成「${next}」。`);
    },
    { value: name, selectValueOnOpen: true }
  );
}

function selectNextSameWord() {
  const editor = codeEditorInstance;
  if (!editor) return;
  const query = identifierAtCursor(editor);
  if (!query) {
    showToast("请把光标放在要查找的词上。");
    return;
  }
  const cursor = editor.getSearchCursor(query, editor.getCursor("to"));
  if (cursor.findNext()) {
    editor.setSelection(cursor.from(), cursor.to());
  } else {
    const wrapped = editor.getSearchCursor(query, { line: 0, ch: 0 });
    if (wrapped.findNext()) editor.setSelection(wrapped.from(), wrapped.to());
  }
  editor.focus();
}

function mountCodeEditor() {
  const host = document.querySelector("#code-editor");
  codeEditorInstance = null;
  if (!host || typeof window.CodeMirror !== "function") return;
  host.innerHTML = "";
  const editor = window.CodeMirror(host, {
    value: state.codeByLanguage[state.language] ?? STARTER_CODE[state.language] ?? "",
    mode: EDITOR_MODES[state.language] || "text/x-csrc",
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    indentUnit: 4,
    tabSize: 4,
    smartIndent: true,
    extraKeys: {
      "Shift-Ctrl-R": () => renameSameIdentifier(),
      "Ctrl-D": () => selectNextSameWord(),
      "Ctrl-F": "find",
      "Cmd-F": "find",
      "Shift-Ctrl-F": "replace",
      "Ctrl-H": "replace",
      "F3": "findNext",
      "Shift-F3": "findPrev",
      "Ctrl-/": "toggleComment",
      "Cmd-/": "toggleComment",
      "Tab": (instance) => {
        if (instance.somethingSelected()) instance.indentSelection("add");
        else instance.replaceSelection(" ".repeat(4), "end");
      },
      "Shift-Tab": (instance) => instance.indentSelection("subtract")
    }
  });
  editor.on("change", () => {
    state.codeByLanguage[state.language] = editor.getValue();
  });
  codeEditorInstance = editor;
  editor.refresh();
}

document.addEventListener("click", (event) => {
  if (event.target.id === "editor-rename") renameSameIdentifier();
  if (event.target.id === "editor-select-word") selectNextSameWord();
});

async function submitCode() {
  const button = document.querySelector("#submit-code");
  const resultContainer = document.querySelector("#submission-result");
  if (!codeEditorInstance || !button || !state.selectedProblem) return;
  if (!state.currentUser) {
    openAuth("login");
    showToast("请登录后提交代码。");
    return;
  }
  const code = getEditorCode();
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
      const saved = await saveLocalResult(state.selectedProblem.id, language, result, state.activeContestId);
      result.experienceAwarded = saved.experienceAwarded;
    } else {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: state.selectedProblem.id, language, code, contestId: state.activeContestId })
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败，请稍后重试。");
    }
    const accepted = result.verdict === "Accepted";
    if (accepted) {
      try {
        const me = await requestJson("/api/me");
        state.currentUser = me.user;
        updateAccountUI();
      } catch (error) {
        showToast(error.message);
      }
    }
    resultContainer.innerHTML = `<div class="submission-message ${accepted ? "accepted-result" : "failed-result"}">
      <div><strong>${accepted ? "✓ " : "× "}${escapeHtml(result.verdict)}</strong><span>${result.passed} / ${result.total} 个测试点通过</span></div>
      ${result.failedCase ? `<p>失败测试点：${result.failedCase}</p>` : ""}
      ${result.compileOutput ? `<pre>${escapeHtml(result.compileOutput)}</pre>` : ""}
      ${renderCaseResults(result.testResults, result.total)}
      <small>评测时间 ${escapeHtml(String(result.time ?? "-"))} s · 内存 ${escapeHtml(String(result.memory ?? "-"))} KB</small></div>`;
    showToast(accepted
      ? (result.experienceAwarded ? `恭喜通过！首次解出，获得 ${result.experienceAwarded} EXP。` : "恭喜通过！这道题的首次通过经验已领取。")
      : "评测完成，继续加油。");
    await loadSubmissions(false);
    if (state.page === "ranking") await loadRanking();
    if (state.page === "contests" && state.activeContestId) await toggleContestLeaderboard(state.activeContestId);
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

async function runSelfTest() {
  const button = document.querySelector("#run-self-test");
  const inputEditor = document.querySelector("#self-test-input");
  const resultContainer = document.querySelector("#self-test-result");
  if (!button || !codeEditorInstance || !inputEditor || !resultContainer) return;
  if (!state.localJudgeConnected || !state.localPairingToken) {
    openLocalJudgeModal();
    resultContainer.innerHTML = `<div class="submission-message failed-result"><strong>请先连接本机评测器</strong></div>`;
    return;
  }
  if (!getEditorCode().trim()) {
    resultContainer.innerHTML = `<div class="submission-message failed-result"><strong>请先编写代码</strong></div>`;
    return;
  }

  button.disabled = true;
  button.textContent = "运行中…";
  resultContainer.innerHTML = `<div class="submission-message pending-result"><span class="spinner"></span>正在本机运行自测。</div>`;
  try {
    const response = await fetch("http://127.0.0.1:4174/api/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Local-Judge-Token": state.localPairingToken
      },
      body: JSON.stringify({
        language: document.querySelector("#language-select").value,
        code: getEditorCode(),
        input: inputEditor.value
      }),
      signal: AbortSignal.timeout(25_000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `自测失败（${response.status}）。`);
    const succeeded = result.verdict === "运行成功";
    resultContainer.innerHTML = `<div class="submission-message ${succeeded ? "accepted-result" : "failed-result"}"><strong>${escapeHtml(result.verdict)}</strong>
      ${result.compileOutput ? `<div class="case-diagnostic"><strong>错误信息</strong><pre>${escapeHtml(result.compileOutput)}</pre></div>` : ""}
      ${typeof result.stdout === "string" ? `<div class="case-diagnostic"><strong>程序输出</strong><pre>${escapeHtml(result.stdout)}</pre></div>` : ""}
      ${result.stderr ? `<div class="case-diagnostic"><strong>标准错误</strong><pre>${escapeHtml(result.stderr)}</pre></div>` : ""}
      ${result.time !== undefined ? `<small>运行时间 ${escapeHtml(String(result.time))} s</small>` : ""}</div>`;
  } catch (error) {
    resultContainer.innerHTML = `<div class="submission-message failed-result"><strong>自测未完成</strong><p>${escapeHtml(error.message)}</p></div>`;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "运行自测";
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
  const registerContestButton = event.target.closest("[data-contest-register]");
  if (registerContestButton) {
    if (!state.currentUser) {
      openAuth("login");
      showToast("登录学生账号后即可报名。");
      return;
    }
    registerForContest(registerContestButton.dataset.contestRegister);
    return;
  }
  const contestLeaderboardButton = event.target.closest("[data-contest-leaderboard]");
  if (contestLeaderboardButton) {
    toggleContestLeaderboard(contestLeaderboardButton.dataset.contestLeaderboard);
    return;
  }
  if (event.target.closest("#choose-problem-import")) {
    document.querySelector("#problem-import-file")?.click();
    return;
  }
  if (event.target.closest("#run-self-test")) {
    void runSelfTest();
    return;
  }
  if (event.target.closest('[data-action="close-submission-detail"]')) {
    state.selectedSubmissionId = null;
    render();
    return;
  }
  const submissionButton = event.target.closest("[data-submission]");
  if (submissionButton) {
    state.selectedSubmissionId = submissionButton.dataset.submission;
    render();
    document.querySelector("#submission-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    state.activeContestId = problemButton.dataset.contestId || null;
    state.selectedProblem = state.problems.find((problem) => problem.id === problemButton.dataset.problem) || null;
    if (state.selectedProblem) {
      if (state.page !== "problems") {
        setPage("problems");
      } else {
        render();
      }
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
  if (event.target.id === "contest-form") handleContestFormSubmit(event);
  if (event.target.id === "site-title-form") handleSiteTitleSubmit(event);
  if (event.target.id === "anime-recommendation-form") handleAnimeRecommendationSubmit(event);
});

document.addEventListener("change", (event) => {
  if (event.target.id === "problem-import-file") {
    importProblemFile(event.target.files?.[0]);
    event.target.value = "";
  }
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
    state.codeByLanguage[state.language] = getEditorCode();
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

const updateButton = document.querySelector("#desktop-update-button");
const updateBanner = document.querySelector("#update-banner");
const updateBannerTitle = document.querySelector("#update-banner-title");
const updateBannerMessage = document.querySelector("#update-banner-message");
const updateBannerActions = document.querySelector("#update-banner-actions");
const updateBannerTrack = document.querySelector("#update-banner-track");
const updateBannerFill = document.querySelector("#update-banner-fill");

const UPDATE_BANNER_TITLES = {
  checking: "正在检查更新",
  available: "发现新版本",
  downloading: "正在下载更新",
  downloaded: "更新已就绪，等待重启安装",
  current: "已是最新版本",
  deferred: "更新已暂缓",
  error: "更新失败",
  unavailable: "更新不可用"
};

function renderUpdateBanner(status) {
  const { state = "idle", message = "", version = "", percent } = status || {};
  const visible = Boolean(UPDATE_BANNER_TITLES[state]);
  updateBanner.hidden = !visible;
  if (!visible) return;

  updateBanner.classList.toggle("error", state === "error");
  updateBanner.classList.toggle("ready", state === "downloaded");
  updateBannerTitle.textContent = version ? `${UPDATE_BANNER_TITLES[state]} v${version}` : UPDATE_BANNER_TITLES[state];
  updateBannerMessage.textContent = message;

  const downloading = state === "downloading";
  updateBannerTrack.hidden = !downloading;
  updateBannerFill.style.width = downloading ? `${Math.max(0, Math.min(Number(percent) || 0, 100))}%` : "0";

  updateBannerActions.replaceChildren();
  const addAction = (label, handler, primary) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${primary ? "button-primary" : "button-outline"}`;
    button.textContent = label;
    button.addEventListener("click", () => {
      button.disabled = true;
      void handler().finally(() => {
        if (button.isConnected) button.disabled = false;
      });
    });
    updateBannerActions.append(button);
  };
  if (state === "available" || state === "deferred") addAction("下载更新", () => window.ojDesktop.downloadUpdate(), true);
  if (state === "downloaded") addAction("立即重启安装", () => window.ojDesktop.installUpdate(), true);
  if (state === "error" || state === "current") addAction("重新检查", () => window.ojDesktop.checkForUpdates(), false);
  if (state === "available" || state === "deferred" || state === "error") {
    addAction("手动下载安装包", () => window.ojDesktop.openDownloadPage(), false);
  }
}

if (window.ojDesktop) {
  updateButton.hidden = true;
  updateButton.addEventListener("click", () => {
    updateButton.disabled = true;
    updateButton.textContent = "检查中…";
    void window.ojDesktop.checkForUpdates().finally(() => {
      updateButton.disabled = false;
    });
  });
  window.ojDesktop.onUpdateStatus((status) => {
    const { state: updateState, message } = status;
    updateButton.textContent = updateState === "downloading"
      ? (message.match(/\d+%/) || ["下载中"])[0]
      : "检查更新";
    renderUpdateBanner(status);
    if (updateState === "downloaded") showToast(message);
  });
  void window.ojDesktop.getUpdateState().then(renderUpdateBanner);
}

async function initialize() {
  try {
    const [problemResponse, statusResponse, meResponse, siteSettingsResponse] = await Promise.all([
      fetch("/api/problems"),
      fetch("/api/status"),
      fetch("/api/me"),
      fetch("/api/site-settings")
    ]);
    if (!problemResponse.ok || !statusResponse.ok || !meResponse.ok || !siteSettingsResponse.ok) throw new Error("服务暂不可用");
    state.problems = await problemResponse.json();
    const status = await statusResponse.json();
    state.currentUser = (await meResponse.json()).user;
    state.siteSettings = await siteSettingsResponse.json();
    updateSiteBrand();
    if (window.ojDesktop) {
      window.setInterval(() => void refreshSharedSiteTitle(), 30_000);
    }
    state.adminRegistrationEnabled = status.adminRegistrationEnabled;
    state.judgeConfigured = status.judgeConfigured;
    if (window.ojDesktop) {
      const desktop = await window.ojDesktop.initialize();
      updateButton.hidden = !desktop.packaged;
      document.querySelector("#app-version").textContent = `v${desktop.version}`;
      state.localPairingToken = desktop.token;
      state.localJudgeConnected = Boolean(desktop.token);
      if (!desktop.tools.complete) {
        const missing = [
          desktop.tools.gcc ? "" : "GCC",
          desktop.tools.gpp ? "" : "G++",
          desktop.tools.python ? "" : "Python"
        ].filter(Boolean);
        showToast(`本地评测器已连接；未安装 ${missing.join("、")}，对应语言暂不可用。`);
      }

    }
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

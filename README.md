# 天南地北艳姐最美OJ

一个原创编程练习站，提供题库筛选、实际背景、难度与知识点标签、账号角色、代码提交及个人记录。内置题目和测试点均为本项目编写。

## Windows 桌面版

需要 Windows x64 和 Node.js。首次在开发机准备并启动：

```powershell
npm ci
npm run desktop
```

构建 Windows 安装向导：

```powershell
npm run desktop:build
```

生成的 `天南地北艳姐最美OJ-Setup-<版本>-x64.exe` 位于 `release` 文件夹。运行 Setup 后可选择安装目录，并创建桌面/开始菜单快捷方式；安装向导包含 OJ 与本机评测器，无需公网连接。也可运行 `npm run desktop:portable` 构建免安装版本。程序会在本机启动仅绑定 `127.0.0.1` 的 OJ 服务和评测器；账号、提交、比赛和导入后的题库保存在当前 Windows 用户的 Electron 数据目录中，卸载/替换程序不会主动清理该目录。首次启动时会生成管理员注册口令，显示在提示框中并复制到剪贴板；先保存口令，再在软件中注册管理员。其他设备不会自动共享这份本地数据。

桌面版首次启动会检测 GCC、G++ 和 Python。缺少时可以选择“尝试自动安装”，由 Windows Package Manager 安装 Python 和 MSYS2/GCC；需要可用的 winget、网络及可能的系统授权。也可跳过，使用 JavaScript 评测或稍后安装。用户程序以当前 Windows 用户权限运行，不属于操作系统级沙箱；仅评测自己信任的代码。

桌面版题库导入仅对管理员开放：进入“管理后台” → “导入题库”，选择 UTF-8 JSON 文件。文件可直接是题目数组，也可以使用 `{ "problems": [...] }` 包装。导入采用合并策略：新 ID 会追加，相同 ID 的题目会被导入版本覆盖，其他已有题目保留。每题必须包含 `id`、`title`、`difficulty`、`category`、`description`、`input`、`output`、`knowledgePoints`、`examples`、`tests` 和 1–100 的 `difficultyCoefficient`。`examples` 和 `tests` 的每项需要 `input` 与 `output` 字符串。单次最多导入 1000 道题、每题最多 200 个测试点、文件最多 4 MB。测试数据会用于评测，请只导入可信题库，并在导入前保留自己的备份。

题库数据文件位于 Windows 用户数据目录下的 `problems.json`。可在管理后台随时继续导入，题目无需重新打包软件。

桌面安装版会在启动后自动检查 GitHub Releases，也可点击右上角“检查更新”。发现新版本后，软件会先询问再下载；下载完成后可立即重启安装，或在以后退出时安装。自动更新使用公开的 `LiquidAccount/OJ-` GitHub Releases；仓库必须保持公开，仓库中的源码及其他已提交内容会对所有人公开。1.0.0 和 1.0.1 安装版不含本次站点设置功能；安装 1.0.2 或更新版本后才可使用这些功能。

发布更新时，提高 `package.json` 的版本号并将改动上传到 GitHub，然后给该版本创建并推送匹配的标签。例如当前版本 1.0.2：

```powershell
git tag v1.0.2
git push origin v1.0.2
```

先把当前项目文件（包括 `.github/workflows/publish-release.yml`）上传到公开仓库的 `main` 分支，再给相同提交打版本标签。GitHub Actions 会自动构建并发布 Windows NSIS 安装器，不需要个人访问令牌；工作流会验证标签版本与 `package.json` 一致。发布后检查 GitHub Release 中包含 Setup 安装包、`latest.yml` 和 `.blockmap` 文件。自动更新仅适用于本项目构建的 NSIS 安装版；portable 版不支持自动安装更新。更新仓库须保持公开，否则客户端无法匿名下载 Release。

## 启动

需要 Node.js 18.17 或更高版本。在项目目录运行：

```powershell
npm start
```

访问 <http://127.0.0.1:4173>。账户与提交记录保存在项目根目录的 `users.json` 和 `submissions.json`；这些运行时文件不应加入版本控制。未配置 Judge0 时，提交会明确提示评测服务尚未配置，不会伪造评测结果。

## 发布到公网（Cloudflare Workers + D1）

`worker.js` 是适配 Cloudflare Workers 的服务端入口；原有 `server.js` 仍用于本地 Node.js 开发。题库和前端静态资源随 Worker 发布，账号、比赛、提交及会话存入 Cloudflare D1。按 Cloudflare 文档当前列出的免费额度，Workers 每日 100,000 次动态请求、每次 10 ms CPU；D1 每日 5,000,000 行读取、100,000 行写入，数据库总存储 5 GB。静态资源请求免费且不限量。额度、可用性和条款可能变化；留在 Free 方案时，超额请求可能失败，不要升级到付费方案。`workers.dev` 地址可直接用于测试，绑定自定义域名需要你拥有该域名。

首次部署需在项目目录安装依赖并登录 Cloudflare：

```powershell
npm ci
npx wrangler login
npx wrangler d1 create yyzm-oj
```

`d1 create` 会输出 `database_id`。将它填入 `wrangler.toml` 中对应数据库配置，替换 `REPLACE_WITH_D1_DATABASE_ID`。然后应用表结构、设置管理员注册口令并发布：

```powershell
npx wrangler d1 migrations apply yyzm-oj --remote
npx wrangler secret put ADMIN_REGISTRATION_PASSWORD
npm run worker:deploy
```

设置管理员口令时，按终端提示输入一个新的强随机口令；不要把它写入源码、聊天或 GitHub。部署完成后，从命令输出中打开 `https://yyzm.<你的Cloudflare子域>.workers.dev`。访问其 `/health` 路径应返回 `{"ok":true}`。绑定 GitHub 后可配置后续自动部署；数据库迁移仍应在部署代码前执行。

Cloudflare Worker 版本使用 D1 而不是本地 JSON/Neon 存储。现有本机 `users.json`、`submissions.json` 和 `contests.json` 不会自动上传或导入，请勿为迁移而公开这些文件。学生本机评测器仍可使用，设置 `OJ_WEB_ORIGIN` 为实际的 `workers.dev` HTTPS 来源。中心 Judge0 是可选项，只有配置时才会启用服务器端代码执行。

本地原版 Node.js 运行说明仍适用于 `npm start`。Cloudflare 版本用 `npm run worker:dev` 在本地运行。

## 账号和管理员

- 学生可以公开注册，用户名不区分大小写，密码长度为 10–128 个字符。
- 管理员注册必须提供站点所有者设置的注册口令；管理员入口关闭时，学生注册仍可使用。
- 密码使用 Node.js `scrypt` 加盐哈希保存。会话使用 `HttpOnly`、`SameSite=Strict` Cookie；会话保存在内存中，服务重启后需要重新登录。
- 学生只能查看自己的提交记录；管理员可以查看账号及整体评测统计。

## 经验、等级与排行榜

- 每道题在 `problems.json` 中有 1–100 的 `difficultyCoefficient`，题目页显示系数和首次通过奖励。
- 学生首次通过一道题获得 `difficultyCoefficient × 10` EXP；同题再次通过不重复奖励。已有提交记录会在升级时用于初始化已解题目和经验。
- Lv.1 到 Lv.999 使用递增曲线：当前等级为 n 时，升到 n+1 需要 `100 + 5 × n²` EXP。排行榜只统计学生账号，按总 EXP 降序排列。
- 本机评测的通过结果由学生设备报告，因此本地模式的经验和排行榜适合练习激励，不是防作弊或可信比赛成绩。

## 站点名称与动漫推荐

- 经验排行榜已内置：学生首次通过题目时按难度系数领取 EXP，排行榜按累计经验排序；管理员不参与学生榜单。
- 管理员可在“管理后台”修改网页大标题，更新会保存到本机用户数据目录；启用 PostgreSQL 或 Cloudflare D1 时会保存到相应数据库。
- 管理员也可在后台输入日漫名称，并提交 DeepSeek API Key。服务端会从公开的 Jikan API 查询 MyAnimeList 作品资料和海报，再调用 DeepSeek `deepseek-flash` 模型生成原创中文推荐文。首页显示海报、文章和资料来源链接。
- API Key 不会发给访客；在本机版以 AES-GCM 加密保存在 OJ 数据目录，在 Worker 版加密后保存于 D1。加密密钥由 `ADMIN_REGISTRATION_PASSWORD` 派生；更换该管理员注册口令后，需在管理后台重新输入 DeepSeek API Key。
- 需要自行申请并保管 DeepSeek API Key。免费额度、价格和服务可用性以 DeepSeek 当前政策为准；生成推荐时会把动漫名称和资料简介发送至 DeepSeek API。Jikan / MyAnimeList 海报受来源网站的可用性和使用条款约束。

## 比赛

- 仅管理员可以从“比赛”页面创建比赛，并设置名称、说明、起止时间和 1–20 道题目。
- 学生需登录后直接报名。比赛开始前，学生看不到题目；报名成功后，题目在开始时开放。比赛开始后不接受新报名。
- 在比赛题目页提交时会作为比赛提交；榜单按通过题数降序、罚时升序排列。罚时为首次通过时距比赛开始的整分钟数，加该题首次通过前每次未通过提交 20 分钟。
- 题目详情中的测试点和本机报告都遵循本机评测的信任限制；公开部署时，可信正式竞赛应使用受信任的中心评测器。

在启动服务的 PowerShell 窗口里自行设置管理员注册口令（请勿把真实口令发到聊天或写入源码）：

```powershell
$env:ADMIN_REGISTRATION_PASSWORD = "替换成你自己设置的长随机口令"
npm start
```

若要在本机之后打开的新终端中继续使用，可将自己选择的口令保存为当前 Windows 用户环境变量，然后重新打开终端：

```powershell
[Environment]::SetEnvironmentVariable('ADMIN_REGISTRATION_PASSWORD', '替换成你自己设置的长随机口令', 'User')
```

也可以将数据文件放在项目目录之外：

```powershell
$env:OJ_DATA_DIR = "D:\OJ-private-data"
```

第一次打开网站，点击左下角“登录”再切换“注册”，选择“管理员”，使用上述口令注册管理员账号。设置口令前，管理员注册被服务端拒绝。

## 启用真实代码评测

此项目将代码执行委托给你自行配置的 Judge0 实例。**提交的源代码和测试输入会发送至该实例**，请使用你信任且有权使用的服务。不要将 API 密钥提交到代码仓库。

启动前在 PowerShell 设置 Judge0 地址（及实例要求的密钥）：

```powershell
$env:JUDGE0_URL = "https://your-judge0-host"
$env:JUDGE0_API_KEY = "your-api-key"
npm start
```

本地无鉴权 Judge0 实例只需设置 `JUDGE0_URL`。评测器支持 C17、C++17、Python 3 和 JavaScript，语言 ID 使用 Judge0 CE 常见配置；如果你的实例语言 ID 不同，请在 `server.js` 的 `LANGUAGES` 中调整。每个测试点单独提交至 Judge0 并由服务端比较输出，失败后会停止后续测试；限制了代码大小、运行资源和提交频率。**不要将此项目配置为在主应用进程直接运行用户代码**。公开部署还应使用 HTTPS、可靠的 Judge0 沙箱、持久化数据库备份、密钥轮换及反滥用防护；需要 HTTPS Cookie 时设置 `COOKIE_SECURE=true`。

## 让学生在自己的电脑评测

也可以不运行中心 Judge0，让每位学生在自己的电脑运行本地评测器。学生只需在第一次使用时配置工具链、启动本地评测器并把终端的一次性配对口令填入“连接本机评测器”；之后网页会将当前提交和测试数据发给本机 `127.0.0.1:4174`。网站必须能够被用户访问，学生的本机评测进程只需在他编程练习期间运行；无需持续托管评测器。

评测学生的电脑需要安装：

- Node.js 18.17 或更高版本；
- C17：GCC，例如 Windows 上 MSYS2 的 UCRT64 GCC；如不在 PATH 中，可设置 `C_COMPILER` 为 `gcc.exe` 完整路径；
- C++17：G++，例如 Windows 上 MSYS2 UCRT64 G++；如不在 PATH 中，可设置 `CPP_COMPILER`；
- Python 题：Python 3，并确保 `python`/`python3` 命令可用；可用 `PYTHON_EXECUTABLE` 指定可执行文件；
- JavaScript 题：Node.js 已包含所需运行时。

在提供给学生的项目副本目录中用 PowerShell 运行：

```powershell
$env:OJ_WEB_ORIGIN = 'https://你的OJ域名'
npm run local-judge
```

本地自行开发和测试时，将来源设成实际页面地址，例如：

```powershell
$env:OJ_WEB_ORIGIN = 'http://127.0.0.1:4173'
npm run local-judge
```

保持该终端运行，把终端显示的随机“配对口令”填入题目的“连接本机评测器”设置。口令只保存在当前浏览器标签页会话中；重启本地评测器后需重新配对。浏览器访问回环地址时可能显示“允许访问本地网络”提示，这是连接本机程序所需的权限。网页的协议、域名和端口必须与 `OJ_WEB_ORIGIN` 完全一致。

**信任与成绩边界：** 本地评测器只绑定 `127.0.0.1`，检查精确网站来源并要求随机配对口令。但它是轻量程序，不是操作系统级沙箱；学生自己编写/提交的代码会以该学生当前 Windows 用户权限运行，有权访问该账户可访问的文件和程序。只运行自己信任的代码，不要把运行他人代码的本地评测视为安全隔离环境。为让程序在本机运行，本地模式需要将该题隐藏测试输入和答案发给浏览器/学生电脑；因此本地模式适合个人练习，无法防止查看测试点或伪造“通过”结果。网站将本机评测提交标为用户设备报告，不能用作防作弊的正式比赛成绩。需要隐藏测试数据和可信排名时，应由管理员配置一个隔离充分的中心评测服务。

## 添加有授权的题目

在 `problems.json` 增加题目对象，字段包括：

- `id`、`title`、`difficulty`、`category`
- `description`、`input`、`output`
- `examples`：展示给使用者的样例
- `background`：题目对应的实际背景（可选）
- `knowledgePoints`：在题库目录显示的考察知识点
- `difficulty`：入门、基础、进阶、困难或地狱
- `difficultyCoefficient`：1–100 的整数，首次通过该题可获得其 10 倍 EXP
- `tests`：由服务端评测的输入与标准输出

请只导入你拥有或获准使用的题目、题面和测试数据。本题库新增的困难、地狱题均为原创题面，参考了常见经典算法主题，不复制其他 OJ 的题面或测试数据。测试用例存放在服务器端题库文件，不通过题目列表 API 返回；本机评测时会经已登录的测试数据接口发送至用户自己的本机评测器，因此本地评测不适合正式比赛和可信排名。

题库当前包含 61 道题：原有 11 道，以及新增困难题 30 道、地狱题 20 道。目录和训练页支持按五个难度级别查看。

## 本机评测程序

项目保留 `local-judge.js` 本机评测程序，支持 C17、C++17、Python 3 和 JavaScript。用户在自己电脑启动程序后，通过题目页面的“连接本机评测器”按钮配对；编译、运行和测试都在该用户电脑上完成。启动方式、编译器要求及安全限制见上文“让学生在自己的电脑评测”章节。

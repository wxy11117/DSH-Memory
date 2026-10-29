## 0.1.9 — DSH-Memory 首次公开测试版

- GitHub 仓库更名为 DSH-Memory，统一仓库、问题反馈、下载与克隆链接；插件包名继续使用 dsh-hippocampus。
- Windows 安装器实际执行 ESM 探针，逐个验证 Node >=22，跳过过旧、失败或无输出的运行时，支持 DSH shim 回退。
- Windows 安装包装器完整传回安装器退出码；新增 6 项隔离回归测试。
- README 增加面向下载用户的快速安装、固定目录要求、初次记忆验证及已知限制。
- 明确自动读取与工具写入的区别、提醒与归纳的范围，以及模型上下文可能发送至所选服务商的隐私边界。

兼容性基线：Windows / Node >=22；真实宿主组件验证基于 DSH 0.2.0-rc.2。当前保留
followSession=false 默认值；会话隔离选项的读写空间尚未统一，不建议启用。

## 0.1.8 — 归档查询、真实话题接入与最终 ZIP 检查

- 修复归档查询字段与返回结构：按 query 筛选，并从 row.item 返回 id、正文、分类和归档时间。
- hp_digest 统一使用 text，保留 query 别名；兜底提示与实际接口一致。
- 支持 message.content、messages、conversation.messages 的最新人类话语；DSH 0.2 通过正式的
  agent/inbox/claimed 事件取得话题，按 agent 隔离，并在卸载时清理监听。
- 活跃与归档检索均遵守工具的 category 条件。
- 修复独立示例的 brain 嵌套，新增 --home 参数，验证示例写入可由标准 CLI 读取。
- 新增无额外依赖的打包器；最终 ZIP 按真实条目解压、CRC 校验、内容扫描并与源码核对。
- 忽略本地示例记忆与运行文件；仓库元数据统一为已连接 GitHub 账户 wxy11117。
- 补充归档、话题兜底、宿主输入事件、示例互通和发布包漏检的回归测试。

本地验证：Node.js 24.19.0 下 **88/88 测试通过**；DSH 0.2.0-rc.2 的真宿主工具与输入事件契约、
真加载器通过。最终 ZIP 另由 `node tools/release-check.mjs --zip` 解压核对。

## 0.1.7 — 修掉「工具读不到记忆」「注入不带话题」「验证与版本不符」

一句话：把外部实测报上来的四类缺陷补平，并给工具层补上 11 条回归测试。

- **工具层传错状态对象（最严重）**：`hp_list / hp_get / hp_person / hp_sweep / hp_recall_daily`
  把 `st`（函数）当状态传，导致「写入成功但列表为 0 条、按 ID 查不到」；CLI 里同样的写法会让
  `list` / `export` 读空。现在统一传 `st()`，并补了空库分支。
- **被编码门槛拒绝时不再崩**：`hp_remember` 拿到 `null` 直接读 `item.id` 会抛错，现在返回
  `{ ok: false, skipped: true, reason }`，并提示「没达标可以加 category 或钉住」。
- **自动注入接上当前话题**：之前调 `render(st, now, {})`，只有按层发牌；现在从
  `ctx.message / ctx.messages / ctx.conversation` 取最近一条人类话语作话头（`pickTopic`），
  于是【这会儿想起来的】与【顺着话头想起来的】会参与注入；取不到话头时补一句
  「先调 hp_digest({ query }) 再答」。
- **验证说明对齐版本**：`tests/real-host.mjs` 原来断言「默认不注册注入段」，与 0.1.6 的默认
  `injectMode: 'auto'` 冲突；现在 tool 模式单独断言 0 个注入段，默认配置断言恰好 1 个，且两段
  各用独立家目录（多个 mount 共用同一个 `brain.json` 会互相覆盖）。
- **发布卫生**：仓库地址统一收敛成单一记号 `YOUR_GITHUB_USER`（发布前批量替换一处即可），
  并在 `release-check` 里加了硬规则——只要还有一处没改就判红；`CHANGELOG` 里那条具体 QQ 号
  已脱敏为 `<ownerQQ>`。
- 新增 `tests/tool-layer.test.mjs`（11 条）：空库 / 写入后各接口形状 / null 不崩 / 话头渲染 /
  Markdown 导出 / 归档检索，全跑在假宿主里。

验证：单元+集成 **69 条全过（复查更正）**；`tests/real-host.mjs` 真宿主 exit 0（15 工具 schema、入参校验、
实跑、注入段渲染 78 字符）；`tests/real-loader.mjs` 真加载器零告警。

## 0.1.6 — 装上就生效，且不再静默丢数据

一句话：把「默认能用」和「写了一定落盘」这两件最基本的事补上。

- **`injectMode` 默认改成 `"auto"`**。0.1.5 及以前默认 `"tool"`：她不会主动调 `hp_digest`，
  于是「装了但记忆没进上下文」——等于记忆不存在。现在装完第一轮就注入（`order=400`）；
  在意 token 的人可以改回 `"tool"`。
- **修 CLI 静默丢数据**：`store.touch()` 的节流 timer 被 `unref` 了，`hp.mjs remember` 这种一次性
  进程会在 1.5 秒内退出，于是打印「已记下」但文件没变。现在 `createStore` 注册
  `process.once('exit')` 兜底补刷。`tests/cli-persist.test.mjs`（3 条）守着这条。
- **新增 `hp version` / `node tools/hp.mjs version`**：用户能自证装的是哪一版。
- **导出支持 Markdown**：引擎新增 `toMarkdown(doc)`；CLI `export <文件> --md`；工具 `hp_export`
  增加 `format: "json" | "md"`（默认仍是 json）。
- 文档纠错：存储文件是**一个** `brain.json`（不是 `<space>.json`）；`export --md > 记忆.md` 这种
  在 PowerShell 下会写成 UTF-16 的写法，改成「给文件参数」；README 配置表默认值对齐代码。
- 仓库卫生：`.gitignore` 去 BOM；新增 `.gitattributes` 统一换行（`*.ps1`/`*.cmd`/`*.bat` 强制 CRLF，
  其余 `eol=lf`）；`lib/hippocampus.js` 里两处 CRLF 归一。

## 0.1.5 — Windows 包装层（不用装 Node 也能装）

一句话：桌面版 DSH 用户机器上常常**没有 `node` 命令**，0.1.4 之前的结果是他们照着 README
敲 `node tools/install.mjs` 会直接报「不是内部或外部命令」。这一版补上这个真空。

- 新增 `tools/install.ps1`：找 node（`DSH_HIPPOCAMPUS_NODE` → PATH 的 `node.exe` → 常见安装位
  → DSH 自带 `node.exe` → DSH 的 `.desktop-bin\node.cmd`），然后把参数原样交给 `install.mjs`；
  支持 `-Dry` / `-Uninstall` / `-Profile` / `-CheckNode` / `-Help`。
- 新增 `tools/install.cmd`：双击即用，只负责转交 PowerShell。
- 输出改走 `[Console]::Out`（`Write-Host` 在 stdout 被重定向时抓不到，日志/CI/断言全都读不到）；
  同时**不设** `[Console]::ForegroundColor`——stdout 不是终端时它的 setter 会抛 `IOException`，
  整个脚本会死在第一行输出上（这个坑在 0.1.5 开发时踩到过）。
- 新增 `tests/wrapper.test.mjs`（5 条）：两个文件存在且 `install.cmd` 真的转交、`install.ps1`
  有 UTF-8 BOM、`-Help` 退出 0 且内容正确、`-CheckNode` 报出 node 版本或给出三条出路、
  `-Dry` 把计划交给 `install.mjs` 且**一个字节都不写**。
- 全套测试 50 → **55 条**。
# 变更记录

## 0.1.4 — 2026-10-29

**发布前体检 + 把私人信息从文档里清出去**

- 新增 `tools/release-check.mjs`（`npm run release:check`）：按 `package.json` 的 `files` 白名单算出
  「会被发出去的文件」，然后逐条查——版本号与 CHANGELOG 是否一致、必备文件是否齐全、
  **有没有本机绝对路径 / 真实 QQ 号 / `private:<数字>` / `sk-*` / 凭据赋值**、
  有没有 `node_modules`·`*.zip`·`brain.json`·`.env`·>1MB 的单文件、`cordis.patch.yml` 的
  `insert.name` 是否等于包名。红项直接给改法，`--zip` 还会连发布包一起扫。
- 清掉两处真泄漏：README 的迁移示例里有真实 QQ 号（`private:<你的QQ号>`）、
  `docs/PUBLISH.md` 里有本机工作目录路径。都换成占位符。
- 记一个坑：**用「长数字」判断 QQ 号会误报**（`const DAY = 86400000` 就被判成身份号）。
  现在只在同一行出现 `QQ/uin/user_id/群号/账号/私聊/空间` 这类上下文词时才认，并排除常见时间常数。
- README 发布章节与 `docs/PUBLISH.md` 检查单加 `npm run release:check`；CI 加同名步骤。

## 0.1.3 — 2026-10-29

**新增「真加载器」测试：证明宿主真的会把它挂上去**

- `tests/real-loader.mjs`（`npm run test:loader`）：造一个临时 Harness home
  （`profiles/web/package.json` 里 `dsh.profile.bundles = ["dsh-hippocampus"]` + `node_modules/dsh-hippocampus` 链接），
  然后调**宿主自己的** `loadProfileDirectory` / `composeEntries` / `reportSkippedBundles` / `evaluatePluginCompatibility`，
  断言：正好加载一层、包目录解析到本仓库、补丁路径解析到 `cordis.patch.yml`、入口树里出现 `id=hippocampus`、
  告警 0 条、`skippedBundles` 为空、兼容性判定无问题。
  这是「装了会不会被加载」的最终证据——以前的 `loader.test.mjs` 测的是我们移植的补丁算法，
  这个测的是宿主从 profile 出发的整条链。
- 顺带记录：宿主返回的 `packageDir` / `patchPaths` 是**经过 `node_modules` 链接的路径**（不是 realpath），
  比对时两边都要先解链接，否则在 Windows 的 junction 上必错。
- README 测试章节改成「三层证据」表（移植算法 / 真加载器 / 真 defineTool），并补 `DSH_HOST_MODULES`
  需要哪些包（`dsh-app-boot` + `cordis-plugin-group` / `dsh-home-paths` / `dsh-launch-environment` /
  `dsh-package-manifest` / `dsh-atomic-write` / `semver` / `js-yaml`）。
- `package.json` 加 `test:loader` 脚本。

## 0.1.2 — 2026-10-29

**安装路径改成「不需要 dsh CLI」**

- 新增 `tools/install.mjs`：一条命令装进 profile——写 `dependencies` 的 `link:`、追加 `dsh.profile.bundles`、
  建 `node_modules` 链接（Windows 用 junction），改前自动备份 profile 的 `package.json`，装完用
  `check-install` 同一套判定自验，绿了才说「装好了」。
- 支持 `--dry`（只打印计划）、`--profile <dir>`、`--uninstall`（依赖 / bundles / 链接都清掉，记忆库不动）、`--json`；
  退出码 0 成功 / 1 有红项 / 2 用法错。
- `tests/install-flow.test.mjs`：11 条端到端（干跑不写盘、三件齐、装完自检全绿、幂等、无 bundles 时建数组、
  覆盖旧 link、卸载清干净、`--uninstall --dry` 不删、profile 不存在退 1、未知参数退 2、`--help`）。
- `check-install.mjs` 现在可被 import（只在自己是入口时解析命令行参数），供安装器复用判定逻辑，避免两套规则漂移。
- README 安装章节改写：`node tools/install.mjs` 为默认路径，`dsh plugin add` 降为「有 CLI 时」的等价写法；
  `package.json` 加 `npm run install` / `npm run uninstall`；脚本清单与仓库结构同步。

## 0.1.1 — 2026-10-29

**兼容性修复（可能让「装了没反应」变成「能用」）**

- `inject` 由 `['tools', 'systemPrompt']` 改为 `['tools']`。
  cordis 的 `inject` 是**必需**服务表：把 `systemPrompt` 写在里面，会让插件一直等这个服务出现。
  在没装 `@deepseek-ai/dsh-system-prompt` 的宿主上，插件因此**完全不激活**——连 `hp_*` 工具都不注册，
  用户看到的现象只是「装上了但什么都没有」。现在改成运行时探测：有就注册注入段，没有就只留工具，并在日志里说明。
- 新增 `tests/smoke-noprompt.mjs`（`npm run smoke:noprompt`）守住这条路径，CI 两个 Node 版本都会跑。
- README 补「兼容性」说明与三种「装了没反应」的根因；`docs/PUBLISH.md` 检查单同步。

**新增**

- `tools/patch-parse.mjs`：宿主 `applyEntryPatches`（`@deepseek-ai/dsh-app-boot`）的逐行移植，外加零依赖 YAML 子集解析。
- `tests/loader.test.mjs`：16 条，覆盖补丁应用的全部分支（根插入 / group 插入 / 非 group / 目标缺失 / `id` 缺失 / 字段覆盖 / `name` 不一致 / 入参不可变 / 多层叠加顺序）。
- `tools/check-install.mjs` 新增两道判定：`补丁能挂到入口树`、`宿主应用补丁时无告警`——它现在是**用宿主同一套算法**算出「宿主会看到的那份入口树」。

## 0.1.0 — 2026-10-29

首个版本。

- 引擎：四层（瞬时/短期/长期/永久）+ 指数衰减 + 间隔强化 + 提取诱发遗忘 + 概率性想起 + 语义归纳 + 水波纹关系网 + 钉住/封存/订正/墓碑合并。
- 宿主半端：15 个 `hp_*` 工具、可选系统提示词注入（`order: 400`）、按空间隔离的记忆库、落盘节流与尾部刷盘。
- 安装：`cordis.patch.yml` 声明 + `dsh.bundle.patch` 清单；`dsh plugin ... add` 装上即用。
- 迁移：`tools/migrate.mjs` 可从既有 `brain.json`（含 QQ 桥接侧车格式）搬入。
- 自检：`tools/check-install.mjs` 判断「这个插件在**你的** DSH 里会不会被加载」。
- 测试：引擎 14 条 + 自检 9 条 + 假宿主冒烟 + 真宿主契约（需 `DSH_HOST_MODULES`）。

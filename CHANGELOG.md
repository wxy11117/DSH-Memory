## 0.3.0-preview.5 — 官方空模板安装与旧记忆迁移（2026-11-08，预览测试版）

- 发布前修正两条旧冒烟脚本的测试目录：种子库与插件使用同一显式 homeDir，校验 22 个工具和空内容失败分支，避免因默认数据目录变化误报“记忆为空”。不改变运行代码或记忆算法。
- 修复官方注释 + [] 空模板被误判为复杂补丁的问题；保留完整解析检查，复杂 YAML 仍安全拒绝，不改用户补丁。
- 重写离线迁移入口：必须明确新目录和空间归属，支持单空间与一一映射；保留完整源文件备份、全部记忆字段和删除标记，生成空间登记但不代替用户绑定会话。只复制到尚不存在的新目录，不覆盖现有库、不再隐式 merge/replace。
- 迁移预演不写盘；正式复制先暂存、校验并检查源文件是否变化，再整体提交目标。报告给出条数、未选择空间和源文件哈希。
- 安装拒绝信息提供下一步命令与文档；说明同一 DSH_HOME 下宿主 sessions/storages 共享，以及多个预览需要各自 homeDir。
- 看板工具补充 space 与 refreshIntervalMs 字段；文档明确从 hp_space / hp_dashboard / hp_room JSON 返回取址，不向 DSH 主端口猜接口，不写聚合所有鱼凭据的地址文件。
- 增加空模板安装、迁移前后完整性、绑定后两只鱼隔离、重启恢复的回归，并将真实宿主 boot 测试扩展为“空模板安装 → 迁移副本 → 绑定 → 读写 → 重启”。不新增模型调用，不改变记忆算法。

## 0.3.0-preview.4 — 本机试用与安装冲突拦截（2026-11-08，未发布）

- 新增 tools/local-check.cmd：只读提取本机 DSH 的程序依赖，在临时环境验证，不登记到日常 profile、不调用聊天模型。
- 预览版实际安装必须显式指定 profile；提前检查包完整性、桥接设置、停用入口、重复实例和旧脑目录，冲突时不写入安装登记。不输出配置内的访问密钥。
- 对复杂 YAML 无法完整解析时拒绝安装，防止漏读后续配置而错误放行。
- 新增真实安装器到官方 boot / auditStartupEntries 的完整检查，覆盖启动、22 工具、写入、面板、正常关闭、重启恢复、小屋存档故障隔离及卸载保留数据。
- 针对本机 DSH 0.2.0-rc.2 与独立官方 0.2.1-rc.5 运行验证。本版继续保留默认关闭的 AI 自主生活和独立研究数据目录；未替换日常插件、未公开发布。

## 0.3.0-preview.3 — 小屋开关、动作编号与可选自主生活（2026-11-07，未发布）

- 新增 hp_room_catalog / hp_room_life，共 22 个工具；29 个版本化三位动作编号覆盖一楼与阁楼。编号经插件白名单校验后执行，做饭回执等待真实食材与成品状态变化。
- 自主生活默认关闭，仅页面确认费用后开启；通过声明注入的可选 agents 服务向绑定会话 followup。限制 15–240 分钟间隔、1–24 次每日唤醒与每轮一个房间动作；计数先落盘，失败不立即重试，重启或重新开启不清空当天计数。
- 页面隐藏、未就绪、界面关闭、会话离线或忙碌时跳过；绑定变化自动停用。服务缺失时保留普通记忆功能。
- 增加按空间保存的界面开关，关闭时取消待完成动作、暂停渲染与声音；设置页仍可操作。不能中止已经发出的模型思考或保证零费用。
- 看板增加“进入海边小屋”，按会话与空间签发入口；改绑后旧面板不能进入原房间。小屋电脑保留反向看板入口。
- 修正低帧率时走路和料理被固定帧时长拖慢的问题；长帧分步推进走路，料理按可见时间计时，保留超时失败回执。
- 使用独立测试存档、官方 DSH 0.2.1-rc.5 服务、模拟 Agent 和浏览器验证，不调用模型，不安装到用户 profile。

## 0.3.0-preview.2 — 首次使用引导（2026-11-07，未发布）

- 未绑定会话自动获得首次使用提示词，要求 AI 提醒不同鱼选择不同空间并提供 hp_space 设置链接；实际提醒依赖 AI 遵循提示，未绑定拒绝读写由插件执行。
- bound 模式的 tool 设置仅在未绑定时注入引导，绑定完成后不再注入；不自动读取旧记忆，不自动选择或合并空间。
- 重新整理暖色选择页，区分新空间、已有空间和同一只鱼的新会话；改选后需重新勾选归属确认。
- README 与安装器同步首次提示；增加未绑定读写拦截、引导消失、重启保持及真实宿主提示词验证。

## 0.3.0-preview.1 — 记忆空间与海边小屋研发版（2026-11-07，未发布）

- 默认 bound 模式：由用户在本地页选择当前会话归属，随后按宿主 agent.id 路由工具和自动注入；无身份、未绑定时不读取共享默认库。
- 新增 hp_space、hp_room、hp_room_state、hp_room_action，共 20 个工具。支持灯光、窗帘、天气、时段、便签、对白、7 种活动及家具位置。
- 小屋素材随包提供，在 127.0.0.1 本地服务；由插件保存各空间状态。页面即时接收命令，并回报完成、失败、取消或超时。
- 小屋电脑自动连接本空间只读看板，看板每 60 秒读取本地数据。跨空间请求、越权客户端和跨来源请求会被拒绝。
- 导入只能恢复当前同名空间；导出写入当前空间专属导出目录。默认使用独立研究目录，不迁移旧记忆。此研发版不启用 QQ 桥接。
- 提供 tools/preview-room.cmd 独立演示；不登记、不重启 DSH，不使用现有记忆。当前角色外观仍共用大肥鱼素材，不含模型自主定时思考。

## 0.2.0-preview.3 — 修复目录链接清理风险（2026-11-01，未发布）

- 在 Electron 43.0.0 / Node 24.17.0 的隔离假目录中复现：递归 rm 可能遍历 junction 的目标目录；设置 ELECTRON_NO_ASAR=1 仍会发生。本机独立 Node 24.22.1 未复现。
- real-loader 与安装流程测试改用独立包副本；清理逐项 unlink 链接、删除普通文件、移除空目录，失败断言也执行清理，不再把源码树挂入待删目录。
- 安装器替换链接不再递归删除；先准备新链接、保留旧入口，失败时回退。真实旧目录留作同级备份，旧链接只删除链接自身。
- 安装器新增 --plugin / 包装器 -Plugin，可用本版安装器登记保留的旧版目录，避免回退时再次运行旧版清理代码。
- 修正包装器测试在 Electron 下直接调用 GUI exe 的假设，改用与 DSH 相同的 node.cmd 调用方式。
- 增加源包保留、junction 清理、升级、失败回退和配置不变的回归检查。记忆算法、面板界面和每分钟刷新逻辑未改动。
- 发布前校对首次使用指南的 16 个工具、面板入口、当前包名及保存边界；本次文档校对未改变 preview.3 的运行代码。

## 0.2.0-preview.2 — 本地试安装包（2026-11-01，未发布）

**已由 preview.3 替代，不再建议安装或运行本版本的加载测试。下列结果是当时的验证记录，未覆盖 Electron 的目录链接清理故障。**

- 将当前已验证的面板功能整理成独立版本的 ZIP，保留上一份预览包供对照。
- 包含暖色大肥鱼界面、三维自然星光关系网、按真实数据生长与每 60 秒刷新。
- 面板服务随插件后台启动，hp_dashboard 返回现成地址；并发复用、失败重试和卸载清理沿用已验证实现。
- 更新安装说明，明确当前包名、试装步骤、旧版本恢复方式及文件观察模式的记录边界。
- 功能代码与此前通过 130 项测试、DSH 0.2.0-rc.2 当前宿主隔离启动验证的预览快照一致；本版本调整版本与交付文档。

## 0.2.0-preview.1 — 本地记忆活动面板（未发布预览）

- 新增每日活动、时间线、七天统计、四层分布与可交互词语关系网。
- 本机只读面板随插件在后台自动启动；hp_dashboard 返回当前完整链接，失败时可重试，不引入新的 DSH 服务依赖。
- 面板异步启动不阻塞记忆工具；并发取址共用一个服务，插件卸载关闭监听，也覆盖尚未启动完成就卸载的情形。不会自动弹出浏览器。
- 操作日志保留 90 天，不另存正文；检索、上下文准备、成功回忆分别计数。
- 独立运行可观察脑文件变化，明确标注观察边界，不回填历史。
- 保留本机原有桥接扩展；未修改桥接数据或正在运行的插件。

## 0.1.10 — 修复 DSH Desktop 启动失败

- 修复未声明依赖便访问 `ctx.systemPrompt` 引发的 Cordis 激活异常。
- 主插件只依赖 tools；提示词注入放入声明 systemPrompt 依赖的子插件，支持服务后置加载和卸载重载。
- 默认导出与具名导出保持相同依赖声明，避免加载入口形式造成差异。
- 新增真实 Cordis 服务代理、工具注册、提示词装配与生命周期回归；补上原有模拟上下文未覆盖的启动路径。
- 安装器与自检器明确报告静态检查范围，不再把登记成功等同于宿主启动成功。
- 增加 0.1.9 启动故障恢复说明。0.1.9 不应继续安装。

此前 real-host 验证工具契约，real-loader 验证入口树合成；这些结果不足以证明真实桌面启动可用。

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

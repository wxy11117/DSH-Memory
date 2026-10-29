# DSH-Memory · 海马体记忆

给 DSH agent 一套会遗忘、会取舍、会联想的本地记忆。已通过工具写入的记录可以跨会话保存，并按当前话题加入回答上下文。GitHub 仓库名为 DSH-Memory；安装包和插件名保持 `dsh-hippocampus`。

## 下载与快速安装

**当前版本：0.1.9 公开测试版。** 已验证 Windows、Node.js 24.19.0，以及 DSH 0.2.0-rc.2 的真实工具、输入事件和加载器契约。运行要求 Node.js 22+；其他宿主版本需要自行验证。

1. 安装并至少启动过一次 DSH，确保已有 profile。
2. 到 [Releases 下载页面](https://github.com/wxy11117/DSH-Memory/releases/tag/v0.1.9)，下载 `dsh-hippocampus-0.1.9.zip`。
3. **完整解压**到长期保留的文件夹；不要在 ZIP 预览窗口内运行。
4. Windows 双击 `tools/install.cmd`，确认安装器最后报告自检成功。安装器会验证本机或 DSH 提供的 Node；找不到可用 Node 22+ 时会给出提示。
5. 重启 DSH。在对话中要求调用 `hp_remember` 保存一条测试记忆，再调用 `hp_recall` 核对。换新会话后可调用 `hp_digest` 检查记忆是否带入。

**安装后保留解压目录的位置和内容。** 安装采用目录链接；移动、重命名或删除目录会使插件失效。移动后需从新位置重新运行安装器。下载安装不要求 Git 或 npm。

已有 Node.js 22+ 时，也可在解压后的插件目录执行：

```bash
node tools/install.mjs
node tools/check-install.mjs
```

## 当前能力与限制

- 新记忆依赖模型调用 `hp_remember` 等工具；插件不会自动提炼保存每句对话。默认自动注入已保存的记忆，需要宿主提供 `systemPrompt` 服务。
- 普通查询和自动注入不会自动强化；重复写入、修订、每日回忆等操作才会改变稳定性。
- 归纳采用共同关键词和模板；联想基于词语共现。分数表示检索优先级，不是事实正确率或经过实测的回忆成功率。
- 到点事项会进入后续回答的上下文；插件不独立推送通知，也不保证定时唤醒对话。
- **保持 `followSession: false`。** 当前 `followSession=true` 的注入读取和工具写入空间尚未统一；默认模式跨会话共享 `space`，不是自动的多人隔离系统。
- “永久”是稳定性层级名称，仍有衰减；注入还受条数与字符预算限制。

## 记忆机制

- 四层沉淀：先算一条记忆能撑多久（稳定性 S），再由 S 决定它是瞬时 / 短期 / 长期 / 永久——**层是算出来的结果，不是贴上去的标签**
- 遗忘曲线：`R = exp(−Δtime / S)`，越久越淡；渲染时会自己说「记不太清了」「只剩个模糊的影子」
- 回忆强化：明确的回忆强化操作使 `S × 1.6`；每日回忆等路径还会压低同类竞争项的稳定性（`S × 0.88`）
- 语义归纳：同类至少 3 条、且有共同关键词时生成模板概括，原件归档
- 水波纹联想：词与词反复共现就长连线，从一个词扩散 1–3 圈（想到 A，带出 B、C）
- 坏记忆三选一：`hp_forget` 真删（留墓碑）、`hp_seal` 封存（不再主动提起，但按类检索可能翻到）、或者干脆交给遗忘曲线
- 跨会话：默认**全局一份**（`$DSH_HOME/hippocampus/brain.json`），新会话不再失忆

## 装（三种姿势，任选）

### ① 一条命令装好（**不需要 `dsh` 命令行**，推荐）

> 某些桌面版 DSH 环境没有 `dsh` 命令；下面的安装器可以直接登记 profile。
**Windows：优先尝试本机或 DSH 自带的 Node 22+。** 双击 `tools/install.cmd`，或者在 PowerShell 里：

```powershell
powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Dry   # 先看它准备改什么，不写文件
powershell -ExecutionPolicy Bypass -File tools\install.ps1         # 装
powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Uninstall
```

它按这个顺序找可用的 node：`DSH_HIPPOCAMPUS_NODE` 环境变量 → PATH 上真正的 `node.exe` → 常见安装位
（`%ProgramFiles%\nodejs` 等）→ DSH 桌面版自带的 `node.exe` → DSH 的 `.desktop-bin\node.cmd`
（那是用 Electron 跑的 shim，实测能跑普通脚本）。找不到就直说，并给出三条出路。
想知道它挑了哪个：`... -CheckNode`。

有 `node` 的机器（macOS / Linux / 自己装过 Node 的 Windows）直接走下面这条更省事：


```bash
git clone https://github.com/wxy11117/DSH-Memory.git
# 使用自己的 fork 时，同步更新 package.json 中四个仓库链接。
cd DSH-Memory
node tools/install.mjs              # 自动找 profile（web 优先）并装进去
node tools/install.mjs --dry        # 只想看它准备改什么
node tools/install.mjs --profile ~/.dsh/profiles/web   # 指定 profile
node tools/install.mjs --uninstall  # 撤销（记忆库不动）
```

它做三件事、并且**装完自己验一遍**（和 `check-install` 同一套判定，绿了才说「装好了」）：

1. 在 profile 的 `dependencies` 里写 `"dsh-hippocampus": "link:<本包绝对路径>"`
2. 把包名追加进 `dsh.profile.bundles`（**漏了这一步就等于没装，而且没有任何报错**）
3. 在 `node_modules/dsh-hippocampus` 建链接（Windows 用 junction，不需要管理员权限）
4. 改之前把 profile 的 `package.json` 备份成 `package.json.hp-backup-<时间戳>`

输出长这样：

```
插件：dsh-hippocampus@0.1.9
profile：~/.dsh/profiles/web（web）

  + dependencies["dsh-hippocampus"]   新：link:/path/to/dsh-hippocampus
  + dsh.profile.bundles               新：在末尾加 "dsh-hippocampus"
  + node_modules/dsh-hippocampus      新：link:/path/to/dsh-hippocampus

  ✓ 装好了。**重启 DSH 生效**，之后对话里会出现 hp_* 工具。
```

**重启 DSH**，新会话里就有 `hp_*` 工具了。装完也可以再自检一次：

```bash
node tools/check-install.mjs     # 只读，逐条说「会不会被加载」，红了给修复命令
```

### ①' 有 `dsh` CLI 的话（服务器版 / 自己搭的）

```bash
dsh plugin --profile web add "link:/path/to/dsh-hippocampus"     # macOS / Linux
dsh plugin --profile web add "link:C:\path\to\dsh-hippocampus"    # Windows
```

两个 `link:` 指向同一个东西；装完同样要重启 DSH。

**装完先自检**（只读，不改任何文件）：

```bash
npm run check        # 或 node tools/check-install.mjs
```

它逐条告诉你「会不会被加载」，红了会直接给修复命令。典型输出：

```
── 插件包自身 ──
  ✓ package.json 可解析  dsh-hippocampus@0.1.9
  ✓ 入口文件存在  ./lib/index.js
  ✓ 导出 apply(ctx, config)  找到 apply
  ✓ 补丁能挂到入口树  1 条补丁 → 1 个入口；首个 id=hippocampus name=dsh-hippocampus
  ✓ 宿主应用补丁时无告警  0 条
  ✓ 声明 @deepseek-ai/dsh-tools 为 peer  @deepseek-ai/dsh-tools @ *

── profile 登记 ──
  ✓ 找到 profile  ~/.dsh/profiles/web
  ✗ dependencies 里有这个包  没有 dsh-hippocampus
     → node tools/install.mjs --profile ~/.dsh/profiles/web
  ✗ bundles 里登记了  bundles 里没有 dsh-hippocampus —— 就算装了也不会被加载
```

最常见的两个「装了但没反应」：**忘了 `dependencies`**，或**只装了没加进 `dsh.profile.bundles`**（后者等于没装）。`--profile <目录>` 可以指定别的位置，`--json` 给脚本用。

### 宿主到底怎么把它装进来（源码级，便于排错）

DSH 的加载链路在 `@deepseek-ai/dsh-app-boot`：读 profile → 读每个 bundle 的 patch → 按顺序应用 → 得到入口树 → cordis 逐个 import + `apply`。三个关键事实：

1. **bundle 必须自己在 `package.json` 里声明补丁文件**
   ```json
   { "dsh": { "bundle": { "patch": "cordis.patch.yml" } } }
   ```
   漏了这一句，宿主读不到你的补丁，只会往 stderr 打一行
   `skipping profile bundle "<你的包名>": profile bundle "<包名>" declares no dsh.bundle in its package.json`。
   包已经装进 `node_modules`、`bundles` 里也写了名字，但**插件永远不会被加载**——这是最隐蔽的一种失败。

2. **补丁的语义由 `applyEntryPatches` 决定**（app-boot 里约 60 行）
   - `- insert:` 里没有 `id` → 追加到**根入口列表**（本插件用这条）
   - `- insert:` 带 `id` → 目标必须是 `group: true` 的入口，插进它的 `config` 数组
   - 没有 `insert` 的补丁行 → 必须给 `id`，目标必须存在，再按剩下的字段覆盖
   - 目标不存在、不是 group、`name` 与目标不一致 → 只在 stderr 告警然后**跳过**

3. **入口的字段只有六个**（`EntryOptions`，见 `cordis-plugin-loader/src/config/entry.ts`）
   `id` / `name` / `config` / `group` / `disabled` / `inject`。其中 `id` 就是命名空间：工具名、存储目录、日志前缀都靠它；`name` 必须与**安装后的包名**完全一致。

这套语义在本仓库里有一份逐行移植：`tools/patch-parse.mjs`（`parsePatchYaml` / `applyEntryPatches` / `composeEntries`），`check-install` 就是用它算出「宿主会看到的那份入口树」，`tests/loader.test.mjs` 则把上面每条分支都测了一遍——**补丁写错不会报错，只会静默不生效**，所以这部分必须有测试。

手工登记（不想用 CLI 时）：

```json
{
  "dependencies": { "dsh-hippocampus": "link:C:/path/to/dsh-hippocampus" },
  "dsh": { "profile": { "bundles": ["...", "dsh-hippocampus"] } }
}
```


### ② 别人拿到你的仓库（不改他的 profile）

同样两步：软链（或直接 `npm i` 到 profile 目录里）+ profile 里登记插件名。插件只依赖宿主注入的 `ctx`，不需要额外构建。

### ③ 只当库用（自己写 agent）

```js
import { createStore } from 'dsh-hippocampus/store'
import * as hp from 'dsh-hippocampus/engine'

const store = createStore({ dir: './my-memory' })
store.load()
const st = store.stateFor('main')
hp.remember(st, { text: '她说她对芒果过敏，别再买芒果了', category: 'person' })
store.touch(); store.flush()
console.log(hp.render(st))   // 就是可以塞进提示词的那段
```

可跑的完整例子：`node examples/embed.mjs --temp`（写 4 条 → 按话头回忆 → 渲染 → 统计 → 落盘，全程只用一个 JSON 文件）。

> 小陷阱：引擎的 `retrieve()` 返回 `[{ item, score, base }]`，不是摊平的记忆对象——第一次用很容易写出 `rows[0].text === undefined`。

### ④ 把已有记忆搬过来

```bash
node tools/migrate.mjs --from "…\某处\brain.json" --list      # 先看源里有哪些空间、各多少条
node tools/migrate.mjs --from "…\某处\brain.json" --dry       # 预演合并结果，不写盘
node tools/migrate.mjs --from "…\某处\brain.json" --from-space "private:<你的QQ号>" \
     --to "%APPDATA%\dsh-desktop\harness\hippocampus" --to-space default
```

合并规则：同 id 取更晚那版、墓碑（删过的）不复活、归档/关系网边一并带过来；想整份覆盖加 `--mode replace`。
既认本插件的 `{ brain: … }` 格式，也认 QQ 桥接那类「侧车」平铺格式。

## 配置

`cordis.patch.yml` 里可以给插件传 config（schemastery 会校验；不传就用默认值）：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 关掉 = 不挂工具、不注入 |
| `homeDir` | `""` | 记忆库目录；空 = `$DSH_HOME/hippocampus` |
| `space` | `"default"` | 记忆空间名（换名字 = 换一个脑） |
| `followSession` | `false` | 当前请保持 false；true 的注入读与工具写空间尚未统一 |
| `injectMode` | `"auto"` | `auto` = 每轮自动注入（默认，装上就生效）；`tool` = 不注入，让 agent 自己调 `hp_digest`（省 token） |
| `injectMaxChars` | `2600` | 自动注入的上限字符数 |
| `recallHour` / `recallMinute` | `21` / `5` | 每天「固定回忆」的时刻 |
| `recallCount` | `3` | 每次回忆几条 |
| `sweepMinutes` | `1` | 清算（遗忘/升层）周期 |
| `verbose` | `true` | 打印挂载与落盘日志 |

> `injectMode: "auto"` 会用 `ctx.systemPrompt.section()` 每轮把记忆挂进系统提示词（order 400）。
> DSH 0.2 的提示词上下文只有 `agent/scope` 时，插件从 `agent/inbox/claimed` 事件取得当轮用户话语；
> 其他接入可直接传入 `userText`、`messages` 或 `conversation.messages`。话题按 agent 隔离。
>
> **兼容性**：`systemPrompt` **不在** `inject` 里（只有 `tools` 必需）。这不是疏忽——写进 `inject` 会让 cordis 一直等这个服务，在没装 `@deepseek-ai/dsh-system-prompt` 的宿主上插件**根本不激活**，连工具都没有，用户看到的现象只是「装了没反应」。现在改成运行时探测：有就注册注入段，没有就只留工具并在日志里说明。这条路径由 `tests/smoke-noprompt.mjs` 守着。

## 工具（15 个）

| 工具 | 干什么 |
|---|---|
| `hp_remember` | 记一件事（分类/重要度/层可以不给，引擎自己算） |
| `hp_recall` | 按话头回忆（有检索打分与补位，不是全量 dump） |
| `hp_digest` | 拿一段可直接塞进提示词的记忆摘要；`text` 传话题，兼容 `query` 别名 |
| `hp_list` / `hp_get` | 看清单 / 看单条（带最近一次订正前的原文） |
| `hp_revise` | 订正（留 `oldText`，版本往后偏） |
| `hp_forget` | 真删（留墓碑，合并时不许复活） |
| `hp_seal` | 封存（不再主动提起） |
| `hp_pin` | 钉住（不可遗忘，每轮单列） |
| `hp_person` | 记/查「人」 |
| `hp_stats` | 统计（分层/分类/归档/关系网/平均留存） |
| `hp_sweep` | 手动跑一次清算 |
| `hp_recall_daily` | 手动跑一次「固定回忆」 |
| `hp_export` / `hp_import` | 导出整库（`format: "json"` 备份 / `"md"` 人可读）/ 导入（可换机器） |

## CLI（不装 DSH 也能用）

```bash
node tools/hp.mjs remember "她说她对芒果过敏" --cat person
node tools/hp.mjs digest
node tools/hp.mjs stats
node tools/hp.mjs doctor        # 自检：目录、权限、文件大小
```

## 数据在哪

- 默认 `$DSH_HOME/hippocampus/brain.json`（Windows: `%APPDATA%\dsh-desktop\harness\hippocampus\brain.json`）
- 纯 JSON、单文件、原子写（临时文件 + rename）；节流 1.5 秒，收尾一定补刷
- 插件自身不直接上传记忆、不依赖数据库；可使用导入/导出工具备份。被注入的记忆会成为模型请求上下文，可能随 DSH 请求发送到你选择的模型服务商，具体取决于宿主和模型配置。

## 测试

```bash
npm test               # 引擎、工具、归档、CLI、示例互通、安装与发布检查
npm run smoke          # 假宿主冒烟：15 个工具注册 + 提示词注入 + 卸载清理
npm run smoke:noprompt # 兼容性：宿主没有 ctx.systemPrompt 时工具照常在、不自动注入
npm run test:loader    # 真加载器：DSH 的 profile 会把它装成入口吗（需要 DSH_HOST_MODULES）
npm run test:real      # 真宿主契约：真 defineTool + 真 schema 校验（需要 DSH_HOST_MODULES）
```

没有 npm 时使用 `node --test tests/*.test.mjs`。测试总数以本次输出为准。

## 生成发布包

```bash
node tools/pack.mjs
node tools/release-check.mjs --zip
```

ZIP 默认生成在包目录的上一层，文件名来自当前版本号。打包器使用发布白名单，保留 GitHub 工作流，
排除 `.hp-example` 等本地运行数据。检查器会读取 ZIP 的真实条目，解压检查内容、校验 CRC，
并逐文件核对它是否与当前源码一致。不要把整个工作目录直接压缩作为发布包。

「装上去到底能不能用」有三层证据，越往下越接近真相：

| 测试 | 用什么 | 证明什么 |
|---|---|---|
| `loader.test.mjs`（16） | 我们自己移植的 `applyEntryPatches` | 补丁语义按宿主的规则跑（根插入 / group / 覆盖 / 告警） |
| **`real-loader.mjs`** | 宿主的 `loadProfileDirectory` + `composeEntries` | **profile 里登记了 → 包被解析 → 补丁被加载 → 入口树里真的多出 `hippocampus` 一行** |
| `real-host.mjs` | 宿主的 `defineTool` / `parameterSchemaSpecToJsonSchema` / `validateJsonSchemaValue` | 15 个工具的参数 DSL 会被宿主接受、注入段会被宿主渲染 |

### 需要 `DSH_HOST_MODULES` 的两个测试怎么跑

假宿主只能证明「我的代码自洽」，证明不了「装进真正的 DSH 能激活」。这两个测试直接加载 DSH 自带的宿主包（同一份代码）。

准备宿主包（任选其一）：

```bash
# A. 你有 DSH 的 node_modules（npm 全局装的）
set DSH_HOST_MODULES=%APPDATA%\npm\node_modules\@deepseek-ai

# B. 桌面版（Electron asar 包）：把里面的 node_modules/@deepseek-ai 解出来
npx @electron/asar extract "C:\...\DSH Desktop\resources\app.asar" %TEMP%\hp-asar
# 解出来的是整棵目录树；缺什么它会报 `Cannot find package 'X'`，把它们补齐即可
# real-host 还会使用 dsh-agent 的正式输入事件与 assembleContextFor，需一起提供该包及依赖。
# （跑 real-loader 还需要 @deepseek-ai/dsh-app-boot 及其依赖：cordis-plugin-group、
#   dsh-home-paths、dsh-launch-environment、dsh-package-manifest、dsh-atomic-write、semver、js-yaml…）
set DSH_HOST_MODULES=%TEMP%\hp-asar\node_modules\@deepseek-ai
```

> 这两个（`test:real` / `test:loader`）是**开发者自检**：验证真工具校验器、正式输入事件和真加载器的补丁解释器。
> 普通使用者不需要跑；装完想确认装好了，跑 `node tools/check-install.mjs` 就够了。

`npm run test:loader` 的实际输出（真加载器跑出来的）：

```
Harness home：C:\...\Temp\hp-loader-tQckOX
profile：web
加载到 1 层
  ✓ 我们的包被认出来了：dsh-hippocampus@0.1.3
  ✓ 补丁文件：cordis.patch.yml（解析出 1 条补丁行）
  ✓ 入口树：1 个入口，其中 hippocampus → dsh-hippocampus，告警 0 条
  ✓ 没有被跳过的 bundle
  ✓ 兼容性判定：无问题
✓ 真加载器通过：dsh-hippocampus@0.1.3 会被 DSH 加载成入口 hippocampus
```

不设 `DSH_HOST_MODULES` 时这两个测试直接跳过（退出码 0），普通用户不受影响。

## 已知限制

- 检索是 **2-gram 字面重合**，不懂同义词（「火锅」不会自动匹配「涮锅」）
- 所有基线（各类的 baseHours、加成、阈值）都是手调的，没有学习
- 归档容量 600 条，超出后真丢最旧的细节
- 「人」的初始半衰期 240 小时，三个月不提才会淡出——不在意的人也会被记得很久
- 自动注入（`injectMode: "auto"`）是默认路径，每轮占几百到两千多字符上下文；**在意 token 就设 `"tool"`**，让她需要时自己调 `hp_digest`

## 仓库结构

```
lib/            引擎（hippocampus.js）、宿主接入（index.js）、话题提取（topic.js）、落盘（store.js）、宿主依赖解析（hostdeps.mjs）
tools/          install.mjs（一条命令装进 profile，不需要 dsh CLI）、check-install.mjs（装之前/之后自检）、
                hp.mjs（CLI）、migrate.mjs（把旧 brain.json 搬过来）、
                patch-parse.mjs（加载补丁解析）、pack.mjs（白名单打包）、release-check.mjs（源码与最终 ZIP 检查）
examples/       embed.mjs（不装 DSH 当库用的最小例子）
tests/          engine.test.mjs（14 条）、install.test.mjs（9 条）、loader.test.mjs（16 条）、
                install-flow.test.mjs（11 条：装/幂等/卸载/坏输入）、
                smoke-host.mjs（假宿主）、real-host.mjs（真宿主契约）
docs/           DESIGN.md（设计取舍）、PUBLISH.md（怎么发出去）
cordis.patch.yml  DSH 的加载声明——少了这个文件插件不会被加载
```

## 发布

见 [`docs/PUBLISH.md`](docs/PUBLISH.md)：GitHub 网页上传 / 装 git 后 push / npm 发布三种路线，外加发布前检查单。
`.github/workflows/test.yml` 会在 Node 22 与 24 上跑 `test` + `smoke` + `example` + CLI 自检。

## License

MIT

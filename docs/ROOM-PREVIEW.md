# 海边小屋研发版：使用与验证说明

版本：0.3.0-preview.5。更新日期：2026-11-08。本包为预览测试版；公开下载状态以 GitHub Releases 为准，尚未作为稳定版承诺。

本版保留看板“小屋入口”、可关闭的小屋界面、三位动作编号和默认关闭的 AI 自主生活；preview.5 新增官方空模板修复与保留原件的 [旧记忆迁移](MIGRATE-SPACES.md)。设置、费用与编号详见 [ROOM-LIFE.md](ROOM-LIFE.md)。

## 先独立预览，再决定是否安装

先双击 tools/local-check.cmd 可用本机 DSH 的依赖执行隔离自检。它把包复制到临时环境，跑回归和真实宿主检查，包含安装 → 官方启动审计 → 写入 → 关闭 → 恢复 → 卸载；不会把包登记到日常 profile。自检和预览步骤见 [LOCAL-TRIAL.md](LOCAL-TRIAL.md)。

Windows 解压后双击 `tools/preview-room.cmd`。它调用经过 ESM 探测的 Node 22+，启动两个演示空间，打开浏览器。数据写入系统临时目录，路径显示在启动窗口中；不会登记 DSH 插件，不读取现有记忆，不重启 DSH。关闭启动窗口即可停止演示。再次运行会创建新的演示存档。

也可以在解压目录运行：

```powershell
node tools/preview-room.mjs --open
```

演示窗口支持模拟工具输入：

```json
{"fish":"a","action":"weather","value":"rainy"}
{"fish":"a","action":"note","text":"今天一起听海。"}
{"fish":"a","action":"activity","value":"sea"}
{"fish":"a","state":true}
```

每行单独发送。前三条返回 queued，只代表排队；最后一条读取实际回执。独立演示没有接入聊天大模型，所以不会产生模型调用费用。

## 在隔离的 DSH 测试 profile 试运行

本版与旧版使用相同包名和 hp_* 工具名，同一个 profile 不要重复安装两份。无需改包名或工具前缀来养两只鱼。

优先创建独立的 DSH 测试 profile。只对自己确认的测试 profile 运行预演命令，核对输出后再去掉 `--dry`：

```powershell
node tools/install.mjs --profile "<测试 profile 的绝对路径>" --dry
node tools/install.mjs --profile "<测试 profile 的绝对路径>"
```

安装脚本会改所选 profile 的插件登记和链接；它不是独立预览命令。本次研发没有对现有 DSH 执行安装，也没有重启用户的桌面端。若以后替换正式 profile 的旧版，应先正常退出 DSH，并备份 profile、旧包和脑文件；不要强杀仍有待写记忆的进程。

preview.4 开始，实际安装必须显式传 --profile；安装前检查会拦截桥接配置、停用入口、重复实例和未绑定的旧脑目录。包自身也会先检查完整性，拒绝时不写 profile 或替换链接。

preview.5 支持官方注释 + [] 空模板，不需要手工改写。旧库可先复制到新目录并生成空间登记，再绑定会话。共用 DSH_HOME 的 profile 仍共享宿主 sessions/storages；多个预览还需要独立 homeDir，详见 [LOCAL-TRIAL.md](LOCAL-TRIAL.md)。看板和小屋使用独立本地端口，按 [LOCAL-ENDPOINTS.md](LOCAL-ENDPOINTS.md) 取得地址。

本版默认配置：

```yaml
scopeMode: bound
followSession: false
roomEnabled: true
injectMode: auto
homeDir: ''
```

空 homeDir 使用 `$DSH_HOME/hippocampus-room-preview`，DSH_HOME 缺省时使用用户主目录下 `.dsh/hippocampus-room-preview`。如果继承的旧配置写了 homeDir、followSession 或 externalApi，它们不会因升级自动消失，安装前应检查。研究版不启用 QQ 桥接；遇到 externalApi 会停止本插件记忆初始化并返回错误信息。

## 一只鱼对应一个记忆空间

首次使用引导有三处：包内 README、安装器完成提示、未绑定会话的提示词。提示词会要求 AI 在回复中提醒“不同鱼选择不同空间”，并调用 hp_space 提供设置链接。下载 ZIP 本身不会自动运行或弹窗；实际对话提醒仍取决于模型是否遵循工具提示，未选择前禁止记忆读写则由插件强制执行。

bound 模式下，auto 和 tool 两种注入设置都提供未绑定时的简短引导；绑定完成后引导消失，tool 模式仍不注入记忆正文。新会话需要重新确认归属。设置页不会替用户猜测身份，改选空间后会清除之前的确认勾选。

1. 在鱼 A 的会话中按首次提示打开设置链接；没有提示时说：“调用 hp_space，把完整设置链接给我。”
2. 打开链接，输入“记忆空间1”，勾选确认并进入小屋。
3. 在鱼 B 的会话重复操作，选择“记忆空间2”。
4. 鱼 A 换到新会话时，再通过入口选择已有“记忆空间1”。插件不会仅凭名字猜它是谁。

绑定关系由本地 `spaces.json` 持久保存。身份取自 DSH 提供的 `exec.agent.id` 或提示词回调中的 `context.agent.id`，不读取插件进程的 DSH_SESSION_ID，也不接受工具参数中自报的 space。拿不到身份或未绑定时，返回错误且不注入其他空间记忆。

`scopeMode: session` 会按每个会话独立建空间；`scopeMode: shared` 明确让所有会话共用配置中的 space，不适用于多人格隔离。默认使用 bound。隔离是插件的空间边界，不是操作系统账户沙箱；有本机文件读写权限的其他程序仍可以读取本地存档。

## AI 能做什么

| 工具 | 行为 |
| --- | --- |
| hp_space | 查看归属，返回用户选择空间的设置链接 |
| hp_room | 返回当前空间的本机小屋链接；未绑定时返回设置页 |
| hp_room_state | 返回环境、家具、位置、便签和最近 8 次动作回执 |
| hp_room_action | 排队执行灯光、窗帘、天气、时段、便签、对白、活动或家具移动 |

活动可用 idle、sea、sleep、tea、computer、feed、water。家具动作需要 item、x、z、rotation，位置由页面检查，碰撞或无法到达时返回失败。

请 AI 使用这样的流程：“先查看小屋状态，安排动作，再确认动作结果。”queued 是已排队，running 是执行中，completed 才是完成；failed、cancelled、interrupted 分别表示失败、取消和重启中断。一次只安排一个待完成动作，不做高频循环查询。

页面必须打开并保持可见，才能执行画面动作。关闭页面后心跳最多约 35 秒才过期，期间请求可能先排队；45 秒未完成会标为失败。后台标签页可能被浏览器暂停，重新切回页面后再试。打开同空间的另一标签页会接管控制，并取消旧页面的未完成动作。

## 小屋与记忆面板怎样配合

小屋 → 点击电脑 → 记忆面板 → 打开记忆面板。地址由插件自动提供，只连接当前空间，无需粘贴链接。

反方向：记忆面板左侧 → 进入海边小屋。插件按该面板的会话和空间签发地址，不让用户猜端口或复制别的鱼的链接。小屋界面曾关闭时会先显示休息页，点击“打开小屋界面”恢复。

看板每 60 秒从本地插件读取记忆和活动；它是只读的。房间命令通过本地事件即时通知页面，动画由浏览器计算。页面上的灯光、天气、家具、便签、音乐偏好、厨房进度等通过插件保存，每次变更约 250 毫秒后提交；“已保存”表示服务器已确认写入，保存失败会显示提示。

记忆写入仍由 AI 调用 hp_remember，经过原有筛选、稳定性与衰减逻辑。房间的每一次走动、开灯不会自动塞进长期记忆。值得记住的虚拟经历应标记 `source: virtual-room`，并在正文写明“小屋中的虚拟经历”，避免混同现实。

| 文件 | 用途 |
| --- | --- |
| brain.json | 各空间的活记忆、归档与词语关系 |
| spaces.json | 会话与空间绑定 |
| rooms.json | 按空间保存房间配置和动作回执 |
| activity/ | 按空间筛选的记忆活动日志，不另存正文 |
| exports/ | 当前空间的导出文件 |
| backups/ | 导入前当前空间的备份 |

这些运行文件均不包含在发布包内。JSON 明文保存在用户电脑，本版本没有增加文件加密。

## 费用和边界

- 本地页面、三维动画、看板刷新、心跳和存档均不调用大模型，不产生模型 Token 费用，但会使用电脑 CPU、GPU、内存和磁盘。
- AI 理解用户话语、决定动作、调用工具、读取工具结果，以及 auto 模式加入的记忆摘要，仍使用用户自己的 DSH 模型额度。
- 本地自由活动使用现有规则，不调用 AI；新增 AI 自主生活默认关闭，需在页面确认后开启。间隔至少 15 分钟，每日最多 24 次主动唤醒，不按分钟调用模型，也没有付费云端同步或订阅服务。
- 页面随包提供，不依赖公网小屋网站读取私人存档。重启插件后端口和访问令牌变化，请重新调用 hp_room / hp_dashboard；不要把完整访问链接发给他人。
- 房间功能可通过 roomEnabled 关闭；房间服务或 rooms.json 出错会返回错误，记忆工具继续可用。脑文件本身损坏时保留原文件，拒绝初始化，避免覆盖。
- 当前各空间使用相同的大肥鱼外观；还没有各鱼自定义形象、房间内直接聊天、多人联机、自动推断人格归属、离线 AI 生活或自动迁移旧记忆。

## 已验证与未验证

普通回归测试、两个空间的并发读写与提示词隔离、导入导出边界、看板限制、重启恢复、过期回执、页面接管和故障处理见 tests/。官方 DSH 0.2.1-rc.5 的 tools.execute、assembleContextFor、Cordis 生命周期和加载器使用独立安装的官方包验证，Agent 身份为合成测试身份，没有启动真实用户会话或调用模型。

本机 Desktop 内附的 DSH 0.2.0-rc.2 也在隔离目录中运行同一组检查。real-boot.mjs 额外把安装器结果交给官方 boot 和 auditStartupEntries，验证重启后仍有记忆、小屋存档损坏不阻止记忆启动、卸载保留数据。启动测试使用 Node 的 --expose-internals，供提取出来的 Cordis 加载器访问原生模块解析器；不修改 DSH 的启动参数或源码。

浏览器实测包括：工具改小雨 → 画面改变并回报完成；走到阳台 → 到达后回报；写便签 → 小屋电脑显示；第二个空间保持晴天和空便签；刷新后恢复；电脑打开当前空间看板。未进行用户正式 profile 的整机安装和长期压力测试，不能据此保证所有 DSH 版本和显卡环境均不会故障。

复核命令：

```powershell
node --test tests/*.test.mjs
# 下列真实宿主检查需先把 DSH_HOST_MODULES 指向独立官方依赖目录
node tests/real-host.mjs
node tests/real-loader.mjs
node tests/real-cordis.mjs
node tests/real-room.mjs
node --expose-internals tests/real-boot.mjs
node tools/release-check.mjs --zip
```

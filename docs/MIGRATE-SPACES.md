# 把旧记忆复制到新的记忆空间

适用于 0.3.0-preview.5。本流程保留旧文件，在明确指定的新目录生成可供新版读取的副本。它不会安装插件、修改 profile、停止 QQ 桥接或自动绑定会话。整个过程不调用模型。

支持两种 version=1 的 brain.json：插件的 conversations[旧空间].brain，以及桥接侧车的 conversations[旧空间]。这只是离线文件格式兼容，不是开启桥接同步。

## 先保留原件，再看归属

正常退出使用源记忆库的程序，等最后一批记忆落盘；也可以使用已经备份好的静态文件。不要强杀进程。以下命令在新版插件解压目录执行，把示例路径换成自己的路径。

~~~powershell
node tools/migrate.mjs --from "D:/MemoryBackup/brain.json" --list
~~~

输出空间名、活记忆、归档、词网和删除标记数量，不输出正文。源里有多个空间时必须明确选择；不会根据“哪条最多”替你决定。只有一个源空间时可以省略 --from-space。

## 一只鱼的旧空间

目标必须是尚不存在的目录，连空目录也不会覆盖；目标父目录可以已经存在。不要预先创建该目标文件夹。源目录、正在运行的新旧库、已有测试空间都不能作为覆盖目标。

~~~powershell
node tools/migrate.mjs --from "D:/MemoryBackup/brain.json" --from-space "default" --to "D:/MemoryData/fish-preview5" --to-space "记忆空间1" --dry
~~~

核对源空间与新空间归属、活记忆和归档数量。--dry 不创建目录、备份或空间登记。确认后运行相同命令，去掉 --dry：

~~~powershell
node tools/migrate.mjs --from "D:/MemoryBackup/brain.json" --from-space "default" --to "D:/MemoryData/fish-preview5" --to-space "记忆空间1"
~~~

成功后新目录包含：

| 文件 | 作用 |
|---|---|
| brain.json | 所选空间的记忆副本，含原有归档、订正、语义记忆、关系网及删除标记 |
| spaces.json | 新空间登记；bindings 为空，等待用户确认会话归属 |
| backups/source.json | 源文件完整逐字节备份，包括没有选择迁移的其他空间 |
| migration-report.json | 对应关系、条数、未选择的空间、源文件 SHA-256 和备份位置 |

迁移不重新评分、不强化、不遗忘、不合并条目。遇到坏 JSON、未知版本或异常条目会停止，不静默跳过。数据先写临时目录并校验，再整体改名为目标；复制期间源文件改变时不提交目标。失败时可能保留 .hp-migration- 开头的临时快照，错误中会给出位置。

## 同一旧库中有多只鱼

先写一个 UTF-8 的 mapping.json，按 --list 中的真实源空间名填写：

~~~json
[
  {"from":"old-fish-a","to":"记忆空间1"},
  {"from":"old-fish-b","to":"记忆空间2"}
]
~~~

~~~powershell
node tools/migrate.mjs --from "D:/MemoryBackup/brain.json" --map "D:/MemoryBackup/mapping.json" --to "D:/MemoryData/fish-preview5" --dry
~~~

核对后去掉 --dry。每个旧空间只可映射一次，不允许多个旧空间自动合并到同一个新空间；未选择的空间保留在原文件和完整备份中，不会被删除。--map 与 --from-space / --to-space 不能混用。

如果过去几只鱼的记忆已经混在同一个旧空间，本工具不会自动猜测每条归谁。先在保留原件的副本里人工核对拆分，再迁移。来自多个独立源文件、增量合并或覆盖已有新版库，本预览暂不处理；不要把 --mode merge / replace 的旧教程用于这一版。

## 让测试插件使用迁移副本

先正常退出目标测试 DSH 实例。只在它的 cordis.patch.yml 中设置新数据目录。例如空模板 [] 可替换为下面一条；已有 hippocampus 配置时应编辑对应项，不要重复插入入口：

~~~yaml
- id: hippocampus
  config:
    homeDir: 'D:/MemoryData/fish-preview5'
    scopeMode: bound
~~~

不要把旧 externalApi / externalFile 配置带进来。这不会改动旧脑，也不会使 QQ 桥接服务停止；新副本与原桥接之后是两份独立数据，不自动同步。

~~~powershell
node tools/install.mjs --profile "<测试 profile 的绝对路径>" --dry
node tools/install.mjs --profile "<测试 profile 的绝对路径>"
~~~

启动测试 profile 后，让鱼 A 调用 hp_space，在页面中选择已有的“记忆空间1”并确认；鱼 B 选“记忆空间2”。未绑定时，新版仍拒绝读写。

接着验证：A 能找回自己的旧条目；B 不能读取 A 的条目；两份看板各显示自己的数量；正常退出并重启后绑定与记忆仍在。当前统计可能随着后续遗忘和维护变化，迁移报告记录的是复制那一刻的数量。历史活动日志与房间存档不从旧 brain.json 凭空补造。

回退时正常退出测试实例，恢复先前保留的测试配置和插件登记即可。原记忆库一直保留；不要让两套进程同时写同一目录。更改期间新副本新增的记忆不会自动回流旧库。

脚本可追加 --json 读取结构化结果。无需从中文打印信息中提取条数。返回的本地路径和备份含私人信息，不应随插件或 issue 公开上传。

# 0.3.0-preview.5 本机试用指南

这是需要先在本机独立环境验证的预览测试包。公开下载状态以 GitHub Releases 为准。本版修复官方空模板安装，补齐旧记忆复制迁移；保留安装冲突检查和一键隔离自检。

## 1. 解压后先自检

把完整 ZIP 解压到一个固定文件夹，双击 tools/local-check.cmd。

它自动找 Node 22+ 和 DSH Desktop 的程序文件，只读提取宿主依赖，在临时目录检查插件安装、真实启动审计、工具、空间隔离、存档、面板、重启与卸载。结束时显示结果和 report.json 路径。无需 npm，不下载依赖，不调用大模型。

如果自动检测不到非默认安装位置，可运行：

~~~powershell
node tools/local-check.mjs --asar "<DSH 安装目录>/resources/app.asar"
~~~

自检通过证明这些受测路径可用，不代表电脑上全部第三方插件组合和未来 DSH 版本都已验证。

## 2. 打开小屋试效果

双击 tools/preview-room.cmd。会打开演示鱼 A 的小屋；启动窗口也给出演示鱼 B 的完整地址。数据使用新建的临时目录，两个空间互相独立。

可以试走动、厨房、灯光、便签、小屋电脑中的记忆面板，以及看板左侧“进入海边小屋”。演示窗口可输入模拟指令：

~~~json
{"fish":"a","vector":[1,1,1]}
{"fish":"a","vector":[2,2,1]}
{"fish":"a","state":true}
~~~

每行分别发送，等上一件事完成再发送下一件。queued 是排队，completed 才是完成。小屋需保持可见。

独立演示没有连接用户的 AI，也不能验证它是否会正确规划生活。AI 自主生活在正式宿主中默认关闭，只有用户确认模型费用后才开启。关闭演示启动窗口，服务停止；再次运行会创建新的演示存档。

## 3. 再让自己的 AI 试用

需要启动独立的 DSH 测试 profile，而不只是打开演示页。已经有可用的测试 profile 时直接使用，不要重复执行“从模板重建”。

需要新建时，先确认 hp-memory-test 名称尚未使用。安装了 DSH CLI 的环境可执行下面的官方模板命令，只输出配置而不启动服务：

~~~powershell
dsh hp-memory-test --from-default-profile web --dump-config
~~~

--from-default-profile 会重建指定 profile，不能对日常 web 或已经使用的 hp-test 执行。只装桌面版、没有 dsh 命令时，需要该桌面版配套的启动器；如果 node 是 DSH 自带的 Electron shim，可使用：

~~~powershell
node "<DSH 安装目录>/resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js" hp-memory-test --from-default-profile web --dump-config
~~~

普通独立 Node 不能直接读取 app.asar 内的文件，不能照抄这条当作通用命令；这种情况先用 local-check.cmd / preview-room.cmd 完成隔离验证，再按宿主的 profile 管理方式创建。不要为了绕过安装拒绝删除日常补丁。

官方生成的 cordis.patch.yml 可以保留注释和 []；preview.5 已支持，不再需要改成 - insert: []。如果并行运行多套预览，请在各自的测试补丁中明确指定不同的数据目录，例如：

~~~yaml
- id: hippocampus
  config:
    homeDir: 'D:/MemoryData/hp-memory-test'
    scopeMode: bound
~~~

这个配置替代空模板 []；已存在 hippocampus 项时编辑原项，勿重复插入。不要指向正在使用的脑目录。准备好测试 profile 后运行：

~~~powershell
node tools/install.mjs --profile "<测试 profile 的绝对路径>" --dry
node tools/install.mjs --profile "<测试 profile 的绝对路径>"
~~~

启动使用该 profile 的 DSH 后，在测试会话里说：“调用 hp_space，把完整设置地址给我。”选择“记忆空间1”并确认；另一只鱼选“记忆空间2”。随后调用 hp_room 或 hp_dashboard 打开本空间页面。

不要仅改包名安装两份。不要直接把旧桥接或旧 homeDir 粘进测试配置；安装器发现这类冲突会拒绝，不会替你删除旧配置。要带上旧记忆，先按 [MIGRATE-SPACES.md](migrate-spaces.md) 创建保留原件的迁移副本，再把测试 homeDir 指向该副本。当前版不原地合并旧库。

## profile 隔离的边界

共用 DSH_HOME 时，宿主 sessions/ 和 storages/（包括定时任务与工作区设置）仍共享；分 profile、端口或插件 homeDir 都不等于这些数据已隔离。有限的记忆/小屋试验可以沿用已有测试 profile，但不要在其中创建定时任务、修改共享工作区或删除共享会话。

长期并行、需要试验宿主设置时，应在独立启动进程中设置一个新的 DSH_HOME，并在那里新建 profile。启动前应检查目标目录未使用，并按宿主方式选用不冲突的监听端口；不要给已运行的桌面进程临时改环境变量，也不要复制日常凭据到发布包。

本插件不重排宿主 sessions/ 或 storages/，不会将它们自动迁移。默认的 hippocampus-room-preview 也是相对于 DSH_HOME 的目录，同一 DSH_HOME 下两套预览仍需要不同 homeDir；目录锁会阻止两个插件同时写同一库。

## 面板与小屋地址

DSH 主界面的端口不承载插件的 /api/dashboard。在当前绑定会话调用 hp_dashboard 读返回的 url，调用 hp_room 读小屋的 url。重启或改绑后重新取址。脚本可直接使用 JSON 字段，不要猜端口或公开临时凭据，见 [LOCAL-ENDPOINTS.md](local-endpoints.md)。

## 停止与恢复

独立演示关闭启动窗口即可。已装进测试 profile 时，正常退出该 DSH 实例，再运行：

~~~powershell
node tools/install.mjs --profile "<同一个测试 profile>" --uninstall
~~~

卸载撤销插件登记和本包链接，保留记忆与房间存档。日常 DSH 的旧插件仍按原配置运行。不要手动递归删除 node_modules 中的 junction。

看板每 60 秒刷新、房间动画与本地保存没有模型 Token 费用。真实 AI 的聊天、工具调用、记忆注入和主动规划会使用用户现有模型额度。

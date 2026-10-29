# 0.1.9 启动故障恢复

如果 DSH Desktop 显示 `dsh-hippocampus` 导致启动失败，并在技术详情中出现
`cannot get property "systemPrompt" without inject`，这是 0.1.9 的插件兼容性缺陷。

插件直接读取了 Cordis 服务，却没有在访问该服务的上下文中声明依赖。0.1.10 将提示词注册放入
独立的 `ctx.inject(['systemPrompt'], callback)` 子插件：提示词服务存在时自动挂载，不存在时保留记忆工具。

## 恢复步骤

1. 若 DSH 无法进入主界面，可先进入安全模式。安全模式会暂停全部第三方插件。
2. 退出 DSH，下载本仓库 [0.1.10 发布包](https://github.com/wxy11117/DSH-Memory/releases/tag/v0.1.10)，完整解压到一个长期保留的新目录。
3. 从新目录运行 `tools/install.cmd`。安装器会备份 profile/package.json，然后将记忆插件链接指向新目录；即使旧版已被卸载，也可以重新登记。
4. 启动 DSH；若仍在安全模式，可在准备好启用其他第三方插件后退出安全模式。
5. 核对日志中记忆插件已激活，并在对话中调用 `hp_stats` 或 `hp_list`。需要确认自动注入时，保存一条测试记忆后使用相关话题检查。

安装器的“静态自检通过”表示文件和 profile 登记符合预期，不代表 DSH 已执行启动。
如果出现新的错误，应查看最新技术详情；不要反复卸载无关插件。其他插件的独立故障不由本补丁修复。

## 原有记忆

本升级不修改记忆数据格式，也不会主动删除记忆库。记忆库位于配置的 homeDir，默认是
`$DSH_HOME/hippocampus/brain.json`。桌面版通常在 `%APPDATA%/dsh-desktop/harness/hippocampus/`。
如有重要记录，升级前可以复制整个 hippocampus 数据目录备份。不要把它上传到 GitHub。

## 验证范围

0.1.10 增加了真实 Cordis 生命周期验收，覆盖服务访问限制、有无提示词服务、后置服务、卸载和重载。
原来的工具契约测试和加载树合成测试仍保留，但两者都不能单独证明完整桌面启动成功。

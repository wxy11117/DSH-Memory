# 发布 DSH-Memory 0.3.0-preview.5

仓库：[wxy11117/DSH-Memory](https://github.com/wxy11117/DSH-Memory)。本版应标记 **Pre-release**，不能按稳定版描述。Node 包名及 ZIP 唯一根目录保持 `dsh-hippocampus`。

## 下载者的第一条路径

需要 Windows 与可运行 ESM 的 Node.js 22+；包装器会探测 DSH 自带运行时。不要求 Git 或 npm。

1. 完整解压到长期保留的目录，先运行 `tools/local-check.cmd`。
2. 只看效果可运行 `tools/preview-room.cmd`；这不连接真实 AI、不调用模型。
3. 实际接入必须明确指定独立测试 profile，先 `node tools/install.mjs --profile "<绝对路径>" --dry`，检查后再去掉 `--dry`。直接双击安装器不会替换日常 profile。
4. 旧记忆按 [迁移指南](MIGRATE-SPACES.md) 复制到新目录，保留原件与备份；不能原地覆盖、自动合并或从混合旧库猜测鱼的身份。
5. 首次使用 `hp_space` 由用户确认空间，之后通过 `hp_room` / `hp_dashboard` 获取完整本地链接。

完整步骤及隔离边界见 [本机试用指南](LOCAL-TRIAL.md)。相同 DSH_HOME 下宿主会话、定时任务与工作区仍共享；不同 homeDir 只隔离插件数据。

## 发布验证

```powershell
node --test tests/*.test.mjs
node tools/check-install.mjs --plugin-only
node tests/smoke-host.mjs
node tests/smoke-noprompt.mjs
node tools/pack.mjs
node tools/release-check.mjs --zip
```

实际执行以下宿主检查，不得将“缺少宿主依赖而跳过”记为通过：

```powershell
node tests/real-host.mjs
node tests/real-loader.mjs
node tests/real-cordis.mjs
node tests/real-room.mjs
node tests/real-boot.mjs
```

先按自检器说明提供 `DSH_HOST_MODULES`；Electron 的提取依赖环境还需 `ELECTRON_NO_ASAR=1`。也可运行 `tools/local-check.cmd` 自动提取并测试。不要将宿主依赖或实际配置放进包。

准备时已验证 Windows、199 项测试、DSH 0.2.0-rc.2 与 0.2.1-rc.5 的上述五类契约，以及 DSH 自带 Electron / Node v24.17.0 的 7/7 隔离自检。实际源码变化后应重新完成相应测试；文档变更需重新打包、逐项核对及生成哈希。最终 ZIP 冷解压后再核对文件和入口。

这些检查不覆盖所有用户配置、长期运行或未来宿主版本。真实 AI 的规划效果及费用不由无模型自检证明。

## 仓库、标签、附件

1. 仅同步发布清单内文件，保留 `website/`、网站工作流和下载历史，不上传整个研发目录。
2. 仓库若仍有固定于 preview.3 的自动发布工作流，在同步新版源码时一并停用或替换；不要让旧流程校验新版本。使用手动发布路径，核对版本、提交、ZIP 内容和校验值再创建 Release。
3. 将最终源码、CI 与发布说明形成一个可审阅提交。网页更新的提交不能充当插件版本标签。
4. 在匹配 `package.json` 的提交创建 `v0.3.0-preview.5`，创建预发布 Release，上传本次 `dsh-hippocampus-0.3.0-preview.5.zip` 和 `SHA256SUMS.txt`。
5. 公开后重新下载附件，核对 SHA-256；只有此后才把官网“发布准备中”改为“下载预览版”，链接固定到该附件。

发布说明必须包含：空间绑定、旧记忆迁移、复杂 YAML 拒绝行为、独立 profile/DSH_HOME 的区别、小屋默认关闭自主生活、本地随机端口、正常退出和回退方式。

## 费用、隐私及素材

看板每 60 秒读取、三维绘制和本地保存不调用模型。AI 聊天、注入上下文、决定动作以及开启后的自主生活使用用户选定模型，按原有服务规则计费。默认自主唤醒 30 分钟间隔、每天最多 12 次；调用次数上限不等于费用上限。

不发布 brain.json、spaces.json、房间存档、访问凭据、日志或个人目录。将记忆注入模型上下文后，相关内容可能发送到用户选择的模型服务商。发布统计和验证结果应去除本机私有路径。

保留全部第三方许可证，详见 [小屋素材说明](ROOM-ASSETS.md)。MIT 代码许可不自动授予角色图片、第三方素材或商标的权利。

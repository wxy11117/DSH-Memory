# 发布 DSH-Memory

GitHub 仓库：https://github.com/wxy11117/DSH-Memory

仓库名是 DSH-Memory；Node 包名、DSH 插件名和 ZIP 根目录保持 dsh-hippocampus，避免破坏插件加载。

## 运行条件

- Node.js 22+。Windows 安装包装器可寻找并实际验证 DSH 自带的运行时。
- 已验证基线为 Windows 和 DSH 0.2.0-rc.2 的真实宿主组件。
- 下载者不需要 Git 或 npm；完整解压 ZIP 后运行 tools/install.cmd，或使用 node tools/install.mjs。
- 安装采用目录链接，必须保留解压目录；完成后重启 DSH。

## 发布前验证

```bash
node --test tests/*.test.mjs
node tools/check-install.mjs --plugin-only
node tests/smoke-host.mjs
node tests/smoke-noprompt.mjs
node tests/real-loader.mjs
node tests/real-host.mjs
node tools/pack.mjs
node tools/release-check.mjs --zip
```

real-host 和 real-loader 需要 DSH_HOST_MODULES 指向真实宿主依赖。Windows 包装器测试仅在 Windows 上执行，其他平台明确跳过。

使用生成的 ZIP 再解压到全新临时目录，验证安装器、测试及发布检查。不要把个人 profile 或记忆库加入仓库。

## GitHub 发布

1. 同步 package.json、CHANGELOG.md 与 README 的版本和四个仓库链接。
2. 通过专用打包器产生 ZIP；确认发布检查通过。
3. 仅将 ZIP 内的发布文件提交到仓库根目录。不要上传整个本地工作目录。
4. 在对应提交上创建版本标签，例如 v0.1.9。
5. 创建 Release，上传 dsh-hippocampus-0.1.9.zip 和 SHA256SUMS.txt，填写安装步骤与已知限制。
6. 当前作为公开测试版，勾选 Pre-release。确认页面可公开访问，并下载核对 ZIP 的 SHA-256。

公开说明必须注明：新记忆依赖工具写入；提醒不是独立推送；当前保持 followSession=false。

## 隐私

发布清单排除运行记忆、凭据、日志、本地示例数据与依赖。禁止把 brain.json 加入仓库。
插件自身不直接上传记忆，但注入后的记忆属于模型请求上下文，可能随宿主请求发送到用户选择的模型服务商。
反馈问题时应删除日志、截图和导出文件中的个人信息或凭据。

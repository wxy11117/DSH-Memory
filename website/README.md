# DSH-Memory 项目官方网站

**官网：https://wxy11117.github.io/DSH-Memory/**

分享这个链接即可查看项目介绍和交互演示，并从页面顶部、底部进入 [GitHub 仓库](https://github.com/wxy11117/DSH-Memory)；安装说明入口位于页面下方。浏览官网无需登录。

暖白未来实验室风格的交互展示站：石墨色粒子大脑、橙红神经脉冲、可调遗忘曲线与三层词语联想。

网站使用原生 HTML、CSS、JavaScript，无构建步骤。字体本地打包，授权文件位于 `dist/fonts/`。

## 本地预览

安装 Node.js 后，在仓库根目录运行：

```bash
node website/server.mjs
```

浏览器打开 http://127.0.0.1:4178 。使用 Ctrl+C 停止预览。

如果已经进入本目录，也可以运行 `node server.mjs`。不建议直接双击 HTML 文件，浏览器可能限制本地 ES 模块加载。

## GitHub Pages 自动发布

仓库 Settings → Pages 的 Source 设为 **GitHub Actions**，由 [pages.yml](../.github/workflows/pages.yml) 发布。

- `main` 分支的 `website/dist/` 或该工作流发生更新时，自动部署。
- 也可在 Actions → Deploy official website to GitHub Pages → Run workflow 手动发布。
- 上传的网页根目录为 `website/dist/`，不会将整个插件仓库作为网站根目录。
- 发布结果在 Actions 和仓库的 `github-pages` 环境中查看；成功后官网更新可能受浏览器/CDN 缓存影响。

## 其他静态托管

将 `website/dist/` 作为站点发布根目录，保持其中的相对路径。网页不需要服务端、数据库或 API 密钥。

相对资源路径同时适用于 GitHub Pages 项目子路径。迁移到其他正式域名时，请同步修改 `dist/index.html` 的 canonical 和 `og:url`。

## 交互

- 拖动大脑旋转视角，点击触发脉冲，切换观察、写入与联想模式。
- 展开四层记忆说明，查看稳定性分档。
- 调节稳定性或选择示例，比较指数遗忘曲线；“回顾一次”按 1.6 倍强化。
- 选择火锅、海边或小陈，查看固定词图的分层传播。
- 顶部可暂停动态效果；系统要求减少动态时默认减少动画。

## 内容边界

本文案依据已经核对的插件 0.1.10 实现。大脑为艺术化可视化，曲线与词图是数学/合成演示，不代表人脑仿真、事实正确率或真实用户数据。

网站不会调用插件、模型或读取本地记忆库。网站和插件的安装、运行相互独立；插件兼容性和安装方法见[仓库首页](../README.md)。

## 文件结构

```text
website/
  server.mjs           本机预览服务器
  README.md            本说明
  dist/
    index.html         页面与插件介绍
    styles.css         基础布局及动态效果
    studio.css         暖白实验室视觉
    app.js             页面交互
    brain.js           交互式粒子大脑
    lab.js             遗忘曲线与词语联想实验
    favicon.svg        网站图标
    fonts/             本地字体及 SIL Open Font License
```

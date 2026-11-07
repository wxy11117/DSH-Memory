# 正确取得看板与小屋地址

0.3.0-preview.5 的网页服务和 DSH 主界面不是同一个端口。在 DSH 主端口请求 /api/dashboard 返回 404，并不能证明插件看板没启动。

默认 bound 模式下，先让当前会话调用 hp_space，并由用户选择空间。工具执行需要 DSH 传入可信的 agent.id；不要从 shell 环境变量或可随便填写的 space 参数猜身份。

| 工具 | 读取哪个返回字段 | 用途 |
|---|---|---|
| hp_space | setupUrl | 用户确认当前会话归属；此地址是一次性设置凭据 |
| hp_dashboard | url、space、refreshIntervalMs | 当前空间看板；刷新间隔为 60000 毫秒 |
| hp_room | url、space、needsBinding | 当前空间小屋；未绑定时会进入设置页 |

工具返回的 JSON 字段就是脚本获取地址的接口，不需要从 AI 的中文回答里正则截取端口。先检查 ok === true；未绑定、服务关闭或启动失败时处理错误，再取得地址。同一空间的看板在首次查看时启动并复用，退出或重新加载插件后地址会变化。绑定改动后应重新取址。

供插件集成测试使用的示例（call 是测试宿主提供的工具调用函数，不是独立 CLI 命令）：

~~~js
const panel = await call('hp_dashboard', {});
if (!panel.ok) throw new Error(panel.error || panel.code);
const page = new URL(panel.url);
const access = new URLSearchParams(page.hash.slice(1)).get('access');
const response = await fetch(page.origin + '/api/dashboard', {
  headers: { 'x-memory-access': access }
});
if (!response.ok) throw new Error('看板读取失败：' + response.status);
const snapshot = await response.json();
if (snapshot.space !== panel.space) throw new Error('空间不匹配');
~~~

小屋 API 使用小屋 url 的 origin 和 x-room-access，不能把看板凭据或 DSH 主界面凭据拿来替用。打开网页时保留完整的 #access= 片段。

本版继续使用随机本地端口，降低并行实例占用端口的冲突；没有新增统一 dashboard.endpoint 文件或固定端口参数。一个文件放所有鱼的访问凭据容易混淆归属，现阶段按会话工具取址更明确。需要稳定的是获取方式，而不是端口号。

看板每 60 秒读取本机数据，不调用模型。浏览器后台可能暂停或延后轮询，所以不是严格每分钟到达的实时通知；重新打开或恢复可见后会继续更新。小屋动作与状态通过本地接口及时通信，动画由浏览器运行。

完整链接能访问对应的私人数据，只在本机使用，不贴进公开 issue、日志截图或项目文档。自动验收无需调用聊天模型，包内 tests/real-boot.mjs 和 tests/space-room.test.mjs 已按工具返回地址测试。

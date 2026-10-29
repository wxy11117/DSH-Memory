# 第一天：装完重启之后的五分钟

> 这份是**给人看的**，不是给 agent 看的。装完、重启之后照着走一遍，就知道它到底通没通。
> 每一步都写了「应该看到什么」和「没看到说明什么」。

---

## 0. 先确认「挂上了」

重启 DSH 之后，**新开一个会话**，随便说一句：

> 你有哪些 hp_ 开头的工具？

**应该看到**：`hp_remember`、`hp_recall`、`hp_digest`、`hp_list`、`hp_stats` … 一共 15 个。

**如果没看到**（这是最常见的失败，且不报错）：

1. profile 的 `dsh.profile.bundles` 里没有 `dsh-hippocampus` —— 漏了这一步**等于没装**，且没有任何提示。
   跑一次自检，它会直接标红并给出修法：
   ```bash
   node tools/check-install.mjs
   ```
2. 装到了另一个 profile。桌面版有 `profiles/web`，有些环境还有 `profiles/desktop`——`--profile` 指对了再装一次。
3. 没重启。插件是启动时加载的，装完必须重启 DSH。

---

## 1. 让它记住一件事

> 帮我记住：我对芒果过敏。以后提到吃的先提醒我这一点。

**应该看到**：它调用 `hp_remember`，回一条带「层 / 分类 / 稳定期」的结果，类似：

```
已记下（长期 / 过敏）：稳定期约 198 小时
```

想看全一点：

> 用 hp_list 给我看看你现在记着什么。

**如果它说「我没有记忆工具」** → 回到第 0 步。
**如果写了但 `hp_list` 是空的** → 它可能只是在回答里假装记住了，没真的调用工具。可以直接点名：`调用 hp_remember，原文是……`。

---

## 2. 换个会话，问同一件事（这一步才是重点）

**新开一个会话**（不要在原会话里追问），说：

> 我有什么食物过敏来着？

**应该看到**：它直接答「芒果」，而且**你没有提过「记忆」这个词**——因为记忆段已经自动挂在系统提示词里了。

注入的段落长这样（按内容有无出现，不是每次都全有）：

```
【不能忘的】        钉住的事（不会忘、不会被淘汰）
【我认识的人】      人单独一类，不和视频/琐事抢名额
【这会儿想起来的】  按你这句话检索出来的
【记下的道理】      同类小事攒够 3 条后归纳出的「事理」
【顺着话头想起来的】词与词的水波纹联想（带免责：不保证对得上）
【那年今日】        去年/上个月的今天记下的事
```

**如果它答不上来**，按顺序查：

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 完全不知道你在说什么 | `injectMode` 被设成了 `tool` | 改回 `auto`（见第 4 节），或让它 `调用 hp_digest` |
| 知道但不准 | 记忆真的在按遗忘曲线变淡 | 正常现象；说一句「这条很重要」让它 `hp_pin` |
| 它能看见但换会话就忘 | `followSession: true`（每个会话一个脑） | 改成 `false`（默认，全局一份） |

---

## 3. 它会记错，也能改

> 不是芒果，是**黄桃**，你记错了。

**应该看到**：它调 `hp_revise`，返回里带 `reviseCount` 和旧原文留痕；以后再问，用的是**新版本**（合并时新版本优先，不会来回翻烧饼）。

---

## 4. 想省 token 的话

默认 `injectMode: "auto"`：每轮把记忆段挂进系统提示词，最多 `injectMaxChars`（默认 2600 字，约 900–1300 token）。
如果觉得贵，两个旋钮：

```yaml
# <profile>/node_modules/dsh-hippocampus/cordis.patch.yml 里给 entry 加 config
- insert:
    - id: hippocampus
      name: dsh-hippocampus
      config:
        injectMaxChars: 1200   # 只注入最要紧的
        # injectMode: tool     # 彻底不注入，只留工具（省 token，但 agent 得自己想起来调）
```

改完重启生效。

---

## 5. 记忆存在哪、怎么带走

```bash
node tools/hp.mjs version     # 版本号
node tools/hp.mjs doctor      # 打印家目录 / 空间 / 条数
```

- 默认位置：`$DSH_HOME/hippocampus/brain.json`（一个文件装所有空间）（`$DSH_HOME` 缺省 `~/.dsh`，桌面版是 `%APPDATA%\dsh-desktop\harness`）
- 想变成人可读的：`node tools/hp.mjs export 记忆.md --md`（工具里等价于 `hp_export` 带 `format: "md"`）
- 想搬机器：把 `brain.json` 整个拷走即可；跨插件搬（比如从 QQ 桥接那份 `state\brain.json`）用 `tools/migrate.mjs`。

---

## 6. 一句话验收

做完 1–3 步，你就拥有了：**跨会话、会忘、越想起越牢、能订正、能归纳、能联想**的一份记忆。

其中「会忘」是设计，不是 bug——`R = exp(−Δtime / S)` 让它像人一样变淡；不想让它忘的事，`hp_pin` 钉住即可。

/** Real Cordis proxy, config validation, service lifecycle and prompt registration. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOST = process.env.DSH_HOST_MODULES;
if (!HOST) {
  console.log('跳过：未设置 DSH_HOST_MODULES（真实 Cordis 生命周期验收）');
  process.exit(0);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = name => import(pathToFileURL(path.join(HOST, name, 'lib', 'index.js')).href);
const { Context, Service } = await load('cordis');
const { default: SystemPrompt } = await load('dsh-system-prompt');
const { default: ToolRuntime } = await load('dsh-tools');
const pluginModule = await import(pathToFileURL(path.join(root, 'lib', 'index.js')).href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-cordis-'));

// DSH's real ToolRuntime itself requires systemPrompt. A small real Cordis
// service isolates our plugin's tools-only compatibility when prompt is absent.
class ToolsOnly extends Service {
  registered = new Map();
  constructor(ctx) { super(ctx, 'tools'); }
  register(definition) {
    const rows = this.registered;
    return this.ctx.effect(() => {
      assert.ok(!rows.has(definition.name), 'duplicate tool registration');
      rows.set(definition.name, definition);
      return () => rows.delete(definition.name);
    }, 'fixture: tools.register');
  }
}

async function settled(ctx) {
  // Await actual fibers, including ctx.inject children, after service changes.
  for (let n = 0; n < 3; n++) {
    const fibers = [];
    ctx.registry.forEach(runtime => fibers.push(...runtime.fibers));
    await Promise.all(fibers.map(fiber => fiber.await()));
  }
}
const memorySections = assembly => assembly.sections.filter(section => section.name === 'hippocampus:memory');
const mountPrompt = ctx => ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });

for (const [exportKind, plugin] of [['namespace', pluginModule], ['default', pluginModule.default]]) {
console.log(`检查 ${exportKind} 导出`);
assert.deepEqual(plugin.inject, ['tools']);

// 1. This is the Desktop failure path: tools and systemPrompt already exist,
// but Cordis forbids direct ctx.systemPrompt access from a tools-only plugin.
{
  const ctx = new Context();
  const prompt = await mountPrompt(ctx);
  const tools = await ctx.plugin(ToolRuntime, { mode: 'native' });
  let memory;
  try {
    memory = await ctx.plugin(plugin, { homeDir: path.join(tmp, 'existing'), verbose: false });
    await settled(ctx);
    const definitions = ctx.get('tools').view().visible;
    assert.equal([...definitions.keys()].filter(name => name.startsWith('hp_')).length, 15);
    await definitions.get('hp_remember').execute({ text: '她说她对芒果过敏，别买芒果', category: 'person' });
    let sections = memorySections(await ctx.get('systemPrompt').assemble({ userText: '芒果' }));
    assert.equal(sections.length, 1);
    assert.match(sections[0].text, /芒果/);
    await memory.dispose();
    assert.equal(memorySections(await ctx.get('systemPrompt').assemble()).length, 0);
    assert.equal([...ctx.get('tools').view().visible.keys()].filter(name => name.startsWith('hp_')).length, 0);
    memory = await ctx.plugin(plugin, { homeDir: path.join(tmp, 'existing'), verbose: false });
    await settled(ctx);
    sections = memorySections(await ctx.get('systemPrompt').assemble());
    assert.equal(sections.length, 1, 'reload must register exactly one memory section');
    console.log('✓ 真实 Cordis + 真实 tools/systemPrompt：启动、写入、注入、卸载与重载');
  } finally {
    if (memory) await memory.dispose();
    await tools.dispose();
    await prompt.dispose();
  }
}

// 2. Missing prompt must not hold tools hostage; a later service must attach
// and survive replacement without re-registering the parent plugin's tools.
{
  const ctx = new Context();
  const tools = await ctx.plugin(ToolsOnly);
  let memory, prompt;
  try {
    memory = await ctx.plugin(plugin, { homeDir: path.join(tmp, 'late'), verbose: false });
    await settled(ctx);
    assert.equal(memory.state, 2, 'parent plugin must be ACTIVE without systemPrompt');
    const definitions = ctx.get('tools').registered;
    assert.equal(definitions.size, 15);
    const remember = definitions.get('hp_remember');
    await remember.execute({ text: '下周考试需要复习微积分', category: 'study' });
    assert.equal(ctx.get('systemPrompt'), undefined);

    prompt = await mountPrompt(ctx);
    await settled(ctx);
    let sections = memorySections(await ctx.get('systemPrompt').assemble({ userText: '微积分' }));
    assert.equal(sections.length, 1);
    assert.match(sections[0].text, /微积分/);
    await prompt.dispose();
    await settled(ctx);
    assert.equal(memory.state, 2);
    assert.equal(definitions.get('hp_remember'), remember, 'prompt removal must preserve tools');
    prompt = await mountPrompt(ctx);
    await settled(ctx);
    sections = memorySections(await ctx.get('systemPrompt').assemble());
    assert.equal(sections.length, 1, 'replacement must not create duplicate sections');
    await memory.dispose();
    assert.equal(definitions.size, 0);
    assert.equal(memorySections(await ctx.get('systemPrompt').assemble()).length, 0);
    console.log('✓ 缺少 systemPrompt 时工具可用；后置、卸载、重建服务均正确注册与清理');
  } finally {
    if (memory) await memory.dispose();
    if (prompt) await prompt.dispose();
    await tools.dispose();
  }
}

// 3. Explicit tool mode does not create a prompt section even when available.
{
  const ctx = new Context();
  const prompt = await mountPrompt(ctx);
  const tools = await ctx.plugin(ToolsOnly);
  let memory;
  try {
    memory = await ctx.plugin(plugin, { homeDir: path.join(tmp, 'tool'), injectMode: 'tool', verbose: false });
    await settled(ctx);
    assert.equal(ctx.get('tools').registered.size, 15);
    assert.equal(memorySections(await ctx.get('systemPrompt').assemble()).length, 0);
    console.log('✓ 显式 tool 模式保持 15 个工具、0 个记忆注入段');
  } finally {
    if (memory) await memory.dispose();
    await tools.dispose();
    await prompt.dispose();
  }
}
}
console.log(`✓ 真 Cordis 生命周期通过；测试记忆仅位于 ${tmp}`);

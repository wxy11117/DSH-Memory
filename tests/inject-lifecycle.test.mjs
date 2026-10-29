/** Always-on CI guard for Cordis service permissions, without external packages. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as module from '../lib/index.js';

function strictMount(t, plugin, options = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-strict-inject-'));
  const tools = new Map(), sections = [], pending = [], disposers = [];
  let unauthorized = 0;
  const makeContext = (allowed, service) => new Proxy({
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
    on() { return () => {} },
    effect(fn) { const dispose = fn(); disposers.push(dispose); return dispose },
    inject(deps, callback) { pending.push({ deps, callback }); return {} },
  }, {
    get(target, key, receiver) {
      if (key === 'systemPrompt' || key === 'tools') {
        if (!allowed.includes(key)) {
          unauthorized++;
          throw new Error(`cannot get property "${key}" without inject`);
        }
        if (key === 'systemPrompt') return service;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  plugin.apply(makeContext(plugin.inject || []), { homeDir: home, verbose: false, ...options });
  t.after(() => disposers.reverse().forEach(dispose => dispose?.()));
  return {
    tools, sections, pending,
    get unauthorized() { return unauthorized },
    providePrompt() {
      const service = { section(section) { sections.push(section); return () => {} } };
      for (const child of pending) child.callback(makeContext(child.deps, service));
    },
  };
}

for (const [kind, plugin] of [['namespace', module], ['default', module.default]]) {
  test(`${kind} export keeps tools available and accesses a late prompt only with declared injection`, async (t) => {
    assert.deepEqual(plugin.inject, ['tools']);
    const f = strictMount(t, plugin);
    assert.equal(f.unauthorized, 0);
    assert.equal(f.tools.size, 15);
    assert.equal(f.sections.length, 0);
    assert.equal(f.pending.length, 1);
    assert.deepEqual(f.pending[0].deps, ['systemPrompt']);
    const write = await f.tools.get('hp_remember').execute({ text: '她说她对芒果过敏', category: 'person' });
    assert.equal(write.ok, true);
    f.providePrompt();
    assert.equal(f.unauthorized, 0);
    assert.equal(f.sections.length, 1);
    assert.match(f.sections[0].text({ userText: '芒果' }), /芒果/);
  });
}

test('tool mode never reads or subscribes to the optional prompt service', (t) => {
  const f = strictMount(t, module.default, { injectMode: 'tool' });
  assert.equal(f.tools.size, 15);
  assert.equal(f.pending.length, 0);
  assert.equal(f.unauthorized, 0);
});

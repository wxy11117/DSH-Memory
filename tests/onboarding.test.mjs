import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {mount, bind, api} from './helpers/room-host.mjs';

test('first-use guidance does not expose existing memories and all unbound writes stay blocked', async t => {
  const f = mount(); t.after(() => f.close());
  await bind(f, 'fish-a', '记忆空间1');
  await f.call('fish-a', 'hp_remember', {text:'一号鱼的私有蓝莓偏好',category:'self'});
  const prompt = f.render('fish-b');
  assert.match(prompt, /首次使用[\s\S]*hp_space/);
  assert.doesNotMatch(prompt, /蓝莓/);
  for (const tool of ['hp_remember','hp_import','hp_list','hp_room_action']) {
    const result = await f.call('fish-b', tool, {text:'不能写入的另一条记忆',path:'missing.json',action:'note'});
    assert.equal(result.code, 'SPACE_UNBOUND');
    assert.equal(result.needsBinding, true);
    assert.equal(result.nextTool, 'hp_space');
  }
  const setup = await f.call('fish-b', 'hp_space');
  assert.equal(setup.needsBinding, true);
  assert.match(setup.userMessage, /不同的鱼请选择不同空间/);
  assert.equal((await api(setup.setupUrl, '/api/setup')).data.current, null);
  await bind(f, 'fish-b', '记忆空间2');
  assert.equal(f.render('fish-b'), '', 'no first-use reminder after confirmation');
  assert.equal((await f.call('fish-b', 'hp_space')).needsBinding, false);
  assert.equal((await f.call('fish-a', 'hp_list')).total, 1);
});

test('tool mode provides only onboarding until binding and never auto-injects stored memory', async t => {
  const f = mount({injectMode:'tool'}); t.after(() => f.close());
  assert.equal(f.sections.length, 1);
  assert.equal(f.sections[0].name, 'hippocampus:onboarding');
  assert.match(f.render('fish-a'), /首次使用/);
  await bind(f, 'fish-a', '记忆空间1');
  await f.call('fish-a', 'hp_remember', {text:'工具模式中的海边记忆',category:'self'});
  assert.equal(f.render('fish-a'), '');
  assert.equal((await f.call('fish-a','hp_list')).total, 1);
});

test('completed binding survives restart; only a new unbound conversation gets guidance', async t => {
  let f = mount(); t.after(() => f.close());
  const home = f.home;
  await bind(f, 'fish-a', '记忆空间1');
  await f.close(); f = mount({homeDir:home});
  assert.equal(f.render('fish-a'), '');
  assert.match(f.render('fish-a-new-chat'), /同一只鱼换会话，请选回原空间/);
  assert.equal(fs.existsSync(path.join(home,'brain.json')), false, 'guidance does not create a memory');
});

test('disabled room gives an actionable setup notice without pretending to offer a link', async t => {
  const f = mount({roomEnabled:false}); t.after(() => f.close());
  assert.match(f.render('fish-a'), /roomEnabled/);
  const info = await f.call('fish-a','hp_space');
  assert.equal(info.setupUrl, undefined);
  assert.equal((await f.call('fish-a','hp_remember',{text:'尚未选择空间'})).code,'SPACE_UNBOUND');
});

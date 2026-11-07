const token = new URLSearchParams(location.hash.slice(1)).get('access');
history.replaceState(null, '', location.pathname);
const $ = selector => document.querySelector(selector);
const status = $('#status');
let spaces = [];

async function request(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {'x-room-access': token || '', 'Content-Type': 'application/json'},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function updateSelection() {
  const value = $('#space').value.trim();
  $('#agree').checked = false;
  $('#existing').value = spaces.includes(value) ? value : '';
  $('#choice-help').textContent = !value ? '请选择或填写空间名称，确认后才会绑定。'
    : spaces.includes(value) ? '这是已有空间：只有当前会话属于同一只鱼时，才应继续使用。'
    : '将为这只鱼创建新空间，其他空间的记忆保持原样。';
  $('#agreement').textContent = value
    ? '我确认：当前会话属于使用“' + value + '”的这只鱼，可以读取和保存它的记忆。'
    : '我确认：当前会话属于这只鱼，可以使用所选空间的记忆和小屋。';
  for (const button of $('#choices').children) button.setAttribute('aria-pressed', String(button.dataset.space === value));
  status.textContent = '';
}

try {
  const data = await request('/api/setup');
  spaces = data.spaces;
  $('#session').textContent = data.session;
  $('#current').textContent = data.current ? '当前绑定：' + data.current + '。更换前请确认是另一只鱼。'
    : '尚未选择空间：当前会话暂不读取、保存或导入记忆。';
  for (const space of spaces) {
    const option = document.createElement('option');
    option.value = space;
    option.textContent = space + '（已有）';
    $('#existing').append(option);
  }
  let next = 1;
  while (spaces.includes('记忆空间' + next)) next++;
  for (const space of new Set(['记忆空间1', '记忆空间2', '记忆空间' + next])) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'choice'; button.dataset.space = space;
    button.textContent = space; button.setAttribute('aria-pressed', 'false');
    const hint = document.createElement('small');
    hint.textContent = spaces.includes(space) ? '已有空间 · 同一只鱼可继续使用' : '新空间';
    button.append(hint);
    button.addEventListener('click', () => { $('#space').value = space; updateSelection(); });
    $('#choices').append(button);
  }
  if (data.current) $('#space').value = data.current;
  updateSelection();
  $('#fields').disabled = false;
} catch (error) {
  status.textContent = error.message + '；请让 AI 重新调用 hp_space 获取完整设置链接。';
}

$('#existing').addEventListener('change', event => { $('#space').value = event.target.value; updateSelection(); });
$('#space').addEventListener('input', updateSelection);
$('#setup-form').addEventListener('submit', async event => {
  event.preventDefault();
  const space = $('#space').value.trim();
  if (!space || !$('#agree').checked) { status.textContent = '请先选择空间，并确认会话归属。'; return; }
  $('#fields').disabled = true;
  status.textContent = '正在保存当前会话的归属…';
  try {
    const data = await request('/api/bind', {space, confirm: true});
    location.assign(data.url);
  } catch (error) {
    status.textContent = error.message;
    $('#fields').disabled = false;
  }
});

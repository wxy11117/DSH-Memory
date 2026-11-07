(() => {
  const room = document.querySelector('.room-demo');
  if (!room) return;
  const residents = {
    sea: { name: '小海', space: '记忆空间 1', memory: '“我喜欢听雨，也喜欢灯亮着的傍晚。”', note: '下次下雨，我们一起听海。', mood: 'rain' },
    star: { name: '小星', space: '记忆空间 2', memory: '“睡前想看一会儿星星，把今天的开心记下来。”', note: '留一盏灯，晚安后也有星光。', mood: 'night' },
  };
  const moods = { rain: '雨声轻轻，暖灯亮着。', sun: '阳光落进窗边，海风刚刚好。', night: '星光慢慢，把今天收进回忆。' };
  let active = 'sea';
  function setMood(mood) {
    residents[active].mood = mood;
    room.dataset.atmosphere = mood;
    document.querySelectorAll('[data-atmosphere-demo]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.atmosphereDemo === mood)));
    document.querySelector('#room-demo-status').textContent = `${residents[active].name}的示例小屋 · ${moods[mood]}`;
  }
  document.querySelectorAll('[data-space-demo]').forEach(button => button.addEventListener('click', () => {
    active = button.dataset.spaceDemo;
    const resident = residents[active];
    room.dataset.resident = active;
    document.querySelectorAll('[data-space-demo]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    document.querySelector('#space-demo-caption').textContent = `${resident.name}的示例记忆`;
    document.querySelector('#space-demo-memory').textContent = resident.memory;
    document.querySelector('#room-space-label').textContent = `${resident.space} · ${resident.name}`;
    document.querySelector('#room-demo-note').textContent = resident.note;
    setMood(resident.mood);
  }));
  document.querySelectorAll('[data-atmosphere-demo]').forEach(button => button.addEventListener('click', () => setMood(button.dataset.atmosphereDemo)));
  setMood(residents[active].mood);
})();

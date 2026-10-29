import { initBrain } from './brain.js';
import { initLab } from './lab.js';

document.documentElement.classList.add('js-ready');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduced.matches;
let brain;
try { brain = initBrain(document.querySelector('#brain-canvas')); window.__brain = brain; }
catch (error) { console.error('Brain visual initialization failed:', error); document.querySelector('#brain-instruction').textContent = '大脑可视化暂不可用，仍可探索下方交互实验。'; }
try { initLab(); } catch (error) { console.error('Memory lab initialization failed:', error); document.querySelector('#lab-status').textContent = '交互图表暂不可用，请刷新页面重试。'; }

const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }), { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  reveals.forEach(element => observer.observe(element));
} else reveals.forEach(element => element.classList.add('is-visible'));

const motionButton = document.querySelector('#motion-toggle');
function setMotion(next) {
  paused = next;
  document.documentElement.classList.toggle('motion-paused', paused);
  motionButton.setAttribute('aria-pressed', String(!paused));
  motionButton.setAttribute('aria-label', paused ? '开启动态效果' : '暂停动态效果');
  motionButton.querySelector('.motion-icon').textContent = paused ? '▷' : 'Ⅱ';
  brain?.setPaused(paused);
  window.dispatchEvent(new CustomEvent('memory-motion-change', { detail: { paused } }));
}
setMotion(paused);
motionButton.addEventListener('click', () => setMotion(!paused));
reduced.addEventListener('change', event => setMotion(event.matches));

const instructions = {
  observe: '拖动旋转 · 点击激活神经脉冲',
  encode: '写入示意：信号进入，连接被点亮',
  recall: '联想示意：沿着连接，唤起远处的记忆'
};
document.querySelectorAll('[data-brain-mode]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-brain-mode]').forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); });
  brain?.setMode(button.dataset.brainMode);
  brain?.pulse();
  document.querySelector('#brain-instruction').textContent = instructions[button.dataset.brainMode];
}));

document.querySelectorAll('[data-tier]').forEach(button => {
  const detail = document.querySelector(`#tier-${button.dataset.tier}`);
  button.setAttribute('aria-controls', detail.id);
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    detail.hidden = !expanded;
  });
});

const progress = document.querySelector('.reading-progress i');
let scrollQueued = false;
function updateScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? Math.max(0, Math.min(1, scrollY / max)) : 0})`;
  scrollQueued = false;
}
addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateScroll); } }, { passive: true });
addEventListener('resize', updateScroll, { passive: true });
updateScroll();

if (matchMedia('(pointer:fine)').matches) {
  const aura = document.querySelector('.cursor-aura');
  addEventListener('pointermove', event => {
    if (paused) { aura.style.opacity = '0'; return; }
    aura.style.opacity = '1';
    aura.style.transform = `translate(${event.clientX}px,${event.clientY}px)`;
  }, { passive: true });
  document.querySelectorAll('.magnetic').forEach(button => {
    button.addEventListener('pointermove', event => {
      if (paused) return;
      const rect = button.getBoundingClientRect();
      button.style.transform = `translate(${(event.clientX - rect.left - rect.width / 2) * 0.05}px,${(event.clientY - rect.top - rect.height / 2) * 0.09}px)`;
    });
    button.addEventListener('pointerleave', () => { button.style.transform = ''; });
  });
}

'use strict';
/* =========================================================================
   MAGIC LEARNING ADVENTURE — script.js  (v2 — premium dashboard update)
   Sections:
   1) State/Storage        2) Audio Engine          3) Confetti/Particles
   4) Toast & word banks   5) Screen Navigation     6) Toolbar & Accessibility
   7) Landing Page         8) Avatar Builder        9) Dashboard (world,
   widgets, symmetric grid, story library, parent/help, footer)
   10) Game Chrome helper  11) Generic Placement-Game Engine
   12) Individual Games    13) Rewards / Achievements   14) Profile
   15) Boot sequence
   ========================================================================= */

/* ---------- 1) STATE / STORAGE ---------- */
const STORAGE_KEY = 'mla_state_v2';

if(typeof structuredClone !== 'function'){
  window.structuredClone = obj => JSON.parse(JSON.stringify(obj));
}

const DEFAULT_AVATAR_PARTS = {
  background:'#AEE1F9', skin:'#FFE0BD', hairStyle:'short', hairColor:'#3B2A20',
  face:'🙂', hat:'', accessory:'', shirt:'#6FA8DC'
};

const DEFAULT_STATE = {
  profile: { name: 'Explorer', avatar: '🐻', avatarParts: structuredClone(DEFAULT_AVATAR_PARTS) },
  stars: 0, coins: 0, xp: 0, level: 1,
  badges: [], achievements: [],
  activityCompletions: {},
  settings: { theme: 'light', dyslexia: false, muted: false, voice: false, largeText: false, colorBlind: false, lang: 'en' },
  streak: { count: 0, lastVisit: null },
  moodLog: {}, giftLog: {}, drawing: null,
  notifications: []
};

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULT_STATE), parsed, {
      profile: Object.assign({}, DEFAULT_STATE.profile, parsed.profile, {
        avatarParts: Object.assign({}, DEFAULT_AVATAR_PARTS, parsed.profile && parsed.profile.avatarParts)
      }),
      settings: Object.assign({}, DEFAULT_STATE.settings, parsed.settings),
      streak: Object.assign({}, DEFAULT_STATE.streak, parsed.streak)
    });
  }catch(e){
    console.warn('Could not load saved progress, starting fresh.', e);
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.warn('Could not save progress.', e); }
}

/* ---------- 2) AUDIO ENGINE (all sounds synthesized — fully offline) ---------- */
const AudioEngine = (() => {
  let ctx = null;
  let ambientNodes = null;
  let loopNodes = null; // for rain/ocean/forest calm-corner loops

  function ensureCtx(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC) ctx = new AC();
    }
    if(ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function isMuted(){ return state.settings.muted; }

  function tone(freq, start, duration, type='sine', peakGain=0.18){
    const c = ensureCtx(); if(!c || isMuted()) return;
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.type = type; osc.frequency.value = freq;
    osc.connect(gain); gain.connect(c.destination);
    const t0 = c.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0); osc.stop(t0 + duration + 0.05);
  }

  function makeNoiseBuffer(c, duration){
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1);
    return buffer;
  }

  function noiseBurst(start, duration, filterFreq=1200, peakGain=0.12, type='bandpass'){
    const c = ensureCtx(); if(!c || isMuted()) return;
    const src = c.createBufferSource(); src.buffer = makeNoiseBuffer(c, duration);
    const filter = c.createBiquadFilter(); filter.type=type; filter.frequency.value = filterFreq;
    const gain = c.createGain();
    const t0 = c.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0+0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t0+duration);
    src.connect(filter); filter.connect(gain); gain.connect(c.destination);
    src.start(t0); src.stop(t0+duration+0.05);
  }

  function startLoop(kind){
    const c = ensureCtx(); if(!c || isMuted()) return;
    stopLoop();
    const src = c.createBufferSource(); src.buffer = makeNoiseBuffer(c, 4); src.loop = true;
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    if(kind === 'rain'){ filter.type='highpass'; filter.frequency.value = 1800; gain.gain.value = 0.05; }
    else if(kind === 'ocean'){
      filter.type='lowpass'; filter.frequency.value = 500; gain.gain.value = 0.06;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.15;
      const lfoGain = c.createGain(); lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain); lfoGain.connect(gain.gain); lfo.start();
      src.connect(filter); filter.connect(gain); gain.connect(c.destination); src.start();
      loopNodes = { src, filter, gain, lfo };
      return;
    } else { filter.type='bandpass'; filter.frequency.value = 900; gain.gain.value = 0.035; } // forest
    src.connect(filter); filter.connect(gain); gain.connect(c.destination); src.start();
    loopNodes = { src, filter, gain };
  }
  function stopLoop(){
    if(loopNodes){
      try{ loopNodes.src.stop(); if(loopNodes.lfo) loopNodes.lfo.stop(); }catch(e){}
      loopNodes = null;
    }
  }

  return {
    unlock(){ ensureCtx(); },
    click(){ tone(520, 0, 0.09, 'triangle', 0.12); },
    correct(){ [523,659,784].forEach((f,i)=> tone(f, i*0.09, 0.28, 'sine', 0.2)); },
    incorrect(){ tone(300, 0, 0.22, 'sine', 0.1); tone(230, 0.1, 0.28, 'sine', 0.09); },
    victory(){ [523,659,784,1046].forEach((f,i)=> tone(f, i*0.11, 0.35, 'triangle', 0.2)); noiseBurst(0.3, 0.3, 3000, 0.05); },
    celebration(){ this.victory(); [1200,1500,1800,2100].forEach((f,i)=> tone(f, 0.4+i*0.07, 0.15, 'sine', 0.08)); },
    piano(freq){ tone(freq, 0, 0.9, 'triangle', 0.22); },
    drum(){ noiseBurst(0, 0.18, 150, 0.3, 'lowpass'); },
    xylophone(freq){ tone(freq, 0, 0.5, 'sine', 0.25); },
    pop(){ tone(700, 0, 0.12, 'sine', 0.15); },
    whoosh(){ noiseBurst(0, 0.4, 800, 0.06); },
    animal(kind){
      const map = { dog:[220,180], cat:[600,900], cow:[130,110], bird:[1400,1900,1400], duck:[500,400] };
      (map[kind] || [440]).forEach((f,i)=> tone(f, i*0.12, 0.22, 'square', 0.12));
    },
    startAmbient(){
      const c = ensureCtx(); if(!c || isMuted() || ambientNodes) return;
      const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o1.type='sine'; o2.type='sine'; o1.frequency.value=196; o2.frequency.value=246.9; g.gain.value = 0.035;
      o1.connect(g); o2.connect(g); g.connect(c.destination); o1.start(); o2.start();
      ambientNodes = {o1,o2,g};
    },
    stopAmbient(){ if(ambientNodes){ try{ ambientNodes.o1.stop(); ambientNodes.o2.stop(); }catch(e){} ambientNodes=null; } },
    startNature(kind){ startLoop(kind); },
    stopNature(){ stopLoop(); }
  };
})();

/* Voice guidance (uses browser SpeechSynthesis — no external files/dependencies) */
function speak(text){
  if(!state.settings.voice) return;
  if(!('speechSynthesis' in window)) return;
  try{
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 1.15; u.volume = state.settings.muted ? 0 : 1;
    window.speechSynthesis.speak(u);
  }catch(e){ /* fail silently — voice is a bonus, never blocks the app */ }
}

/* ---------- 3) CONFETTI / PARTICLE CELEBRATIONS ---------- */
const confettiCanvas = document.getElementById('confetti-canvas');
const cctx = confettiCanvas.getContext('2d');
let particles = [];
function resizeConfetti(){ confettiCanvas.width = window.innerWidth; confettiCanvas.height = window.innerHeight; }
window.addEventListener('resize', resizeConfetti); resizeConfetti();

const CONFETTI_COLORS = ['#FF9FB2','#FFD66B','#B6ECD2','#AEE1F9','#C9B6E4','#FFB5A7'];

function spawnParticles(x, y, count, shape){
  for(let i=0;i<count;i++){
    particles.push({
      x, y, shape,
      vx: (Math.random()-0.5) * 8, vy: -(Math.random()*8 + 4), g: 0.28,
      size: shape==='coin' ? 14 : (shape==='star' ? 16 : 8),
      rot: Math.random()*Math.PI*2, vr: (Math.random()-0.5)*0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)],
      life: 90 + Math.random()*30
    });
  }
  if(!confettiRAF) confettiLoop();
}
function fireConfettiBurst(x,y){ spawnParticles(x,y, 60, 'confetti'); }
function fireStarBurst(x,y){ spawnParticles(x,y, 18, 'star'); }
function fireCoinBurst(x,y){ spawnParticles(x,y, 14, 'coin'); }
function celebrationConfetti(){
  for(let i=0;i<3;i++) setTimeout(()=> spawnParticles(Math.random()*window.innerWidth, window.innerHeight*0.3, 40, 'confetti'), i*150);
  setTimeout(()=> fireCoinBurst(window.innerWidth-70, 34), 200);
}

let confettiRAF = null;
function confettiLoop(){
  cctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
  particles.forEach(p=>{
    p.vy += p.g*0.15; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
    cctx.save(); cctx.translate(p.x, p.y); cctx.rotate(p.rot); cctx.globalAlpha = Math.max(p.life/100, 0);
    if(p.shape === 'star'){ cctx.font = `${p.size}px sans-serif`; cctx.fillText('⭐', -p.size/2, p.size/2); }
    else if(p.shape === 'coin'){ cctx.font = `${p.size}px sans-serif`; cctx.fillText('🪙', -p.size/2, p.size/2); }
    else { cctx.fillStyle = p.color; cctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6); }
    cctx.restore();
  });
  particles = particles.filter(p => p.life > 0 && p.y < confettiCanvas.height + 50);
  if(particles.length){ confettiRAF = requestAnimationFrame(confettiLoop); }
  else { confettiRAF = null; cctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height); }
}

/* ---------- 4) TOAST + WORD BANKS (always positive — never negative feedback) ---------- */
const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(message){
  toastEl.textContent = message; toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toastEl.classList.remove('show'), 2600);
}

const ENCOURAGEMENTS = [
  "Let's try again! 🌟", "You're amazing — one more try! 💪", "You can do it! ✨",
  "Nice try, friend! 🐻", "You're learning — that's magic! 🪄", "So close, try again! 🌈"
];
const PRAISES = [
  "Great job! 🎉", "You did it! ⭐", "Amazing work! 🪄", "Super star! 🌟",
  "You're on fire! 🔥", "Fantastic! 🎈", "Yay! Wonderful! 🎊", "You're amazing! 💖"
];
function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

const DAILY_QUOTES = [
  "Every small step is a giant magical leap. ✨", "You are brave, you are kind, you are learning! 🌈",
  "Mistakes are just magic still in progress. 🪄", "Today is a wonderful day to grow. 🌱",
  "Your smile makes the whole kingdom brighter. 😊", "Keep going — the stars are cheering for you! ⭐",
  "Learning is an adventure, and you're the hero. 🦸", "One page, one puzzle, one smile at a time. 📖"
];
const FUN_FACTS = [
  "Butterflies taste with their feet! 🦋", "A group of flamingos is called a 'flamboyance'! 🦩",
  "Honey never spoils — ever! 🍯", "Rainbows are actually full circles! 🌈",
  "Otters hold hands while sleeping so they don't drift apart! 🦦", "Some stars are bigger than our whole Sun! ⭐"
];
const CREATIVE_TIPS = [
  "Try mixing red and yellow to make a sunny orange! 🎨", "Use the glow brush to make magical stars! ✨",
  "Draw a rainbow with every color in the palette! 🌈", "Stickers make any drawing extra special! 🐻",
  "Try drawing your favorite animal from Magic Learning Adventure! 🦋"
];
const BUDDY_TIPS = [
  "I believe in you today! 🦄", "Let's learn something new together! 🌟",
  "You make this kingdom brighter every day! 💛", "Ready for an adventure, friend? 🚀",
  "Remember to smile — you're doing great! 😊"
];
const WEATHER_MOODS = [
  {emoji:'☀️', text:'Sunny and bright — a perfect day to learn!'},
  {emoji:'⛅', text:'Cozy clouds today — great for a calm activity!'},
  {emoji:'🌈', text:'A rainbow appeared! Something magical is coming!'},
  {emoji:'🌙', text:'A gentle starry evening for quiet play.'}
];

/* ---------- 5) SCREEN NAVIGATION ---------- */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const heading = target.querySelector('h1');
  if(heading){ heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); }
}

/* ---------- 6) TOOLBAR & ACCESSIBILITY CONTROLS ---------- */
function applySettingsToDOM(){
  document.body.dataset.theme = state.settings.theme;
  document.body.dataset.dyslexia = state.settings.dyslexia ? 'on' : 'off';
  document.body.dataset.largeText = state.settings.largeText ? 'on' : 'off';
  document.body.dataset.colorblind = state.settings.colorBlind ? 'on' : 'off';
  document.getElementById('btn-contrast').setAttribute('aria-pressed', state.settings.theme === 'contrast');
  document.getElementById('btn-dyslexia').setAttribute('aria-pressed', String(state.settings.dyslexia));
  document.getElementById('btn-mute').setAttribute('aria-pressed', String(state.settings.muted));
  document.getElementById('btn-mute').textContent = state.settings.muted ? '🔇' : '🔊';
  document.getElementById('voice-state').textContent = state.settings.voice ? 'On' : 'Off';
  document.getElementById('btn-voice').setAttribute('aria-pressed', String(state.settings.voice));
  document.getElementById('largetext-state').textContent = state.settings.largeText ? 'On' : 'Off';
  document.getElementById('btn-large-text').setAttribute('aria-pressed', String(state.settings.largeText));
  document.getElementById('colorblind-state').textContent = state.settings.colorBlind ? 'On' : 'Off';
  document.getElementById('btn-colorblind').setAttribute('aria-pressed', String(state.settings.colorBlind));
  document.getElementById('lang-select').value = state.settings.lang;
}

function toggleDropdown(panelId, btnId){
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  const isOpen = !panel.hidden;
  document.querySelectorAll('.dropdown-panel').forEach(p=> p.hidden = true);
  document.querySelectorAll('.toolbar-actions [aria-haspopup]').forEach(b=> b.setAttribute('aria-expanded','false'));
  if(!isOpen){ panel.hidden = false; btn.setAttribute('aria-expanded','true'); }
}

function initToolbar(){
  document.getElementById('btn-home').addEventListener('click', ()=>{ AudioEngine.click(); showScreen('screen-landing'); });
  document.getElementById('btn-profile').addEventListener('click', ()=>{ AudioEngine.click(); openProfile(); });

  document.getElementById('btn-mute').addEventListener('click', ()=>{
    state.settings.muted = !state.settings.muted;
    if(state.settings.muted) { AudioEngine.stopAmbient(); AudioEngine.stopNature(); }
    saveState(); applySettingsToDOM();
  });
  document.getElementById('btn-contrast').addEventListener('click', ()=>{
    state.settings.theme = state.settings.theme === 'contrast' ? 'light' : 'contrast';
    saveState(); applySettingsToDOM();
  });
  document.getElementById('btn-dyslexia').addEventListener('click', ()=>{
    state.settings.dyslexia = !state.settings.dyslexia; saveState(); applySettingsToDOM();
  });
  document.getElementById('btn-fullscreen').addEventListener('click', ()=>{
    if(!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.();
  });
  document.getElementById('btn-voice').addEventListener('click', ()=>{
    state.settings.voice = !state.settings.voice; saveState(); applySettingsToDOM();
    if(state.settings.voice) speak('Voice guidance is on. I will read helpful instructions out loud.');
  });
  document.getElementById('btn-large-text').addEventListener('click', ()=>{
    state.settings.largeText = !state.settings.largeText; saveState(); applySettingsToDOM();
  });
  document.getElementById('btn-colorblind').addEventListener('click', ()=>{
    state.settings.colorBlind = !state.settings.colorBlind; saveState(); applySettingsToDOM();
  });
  document.getElementById('lang-select').addEventListener('change', e=>{
    state.settings.lang = e.target.value; saveState();
    showToast('🌐 More full translations are coming soon — English content shown for now!');
  });
  document.getElementById('btn-help-shortcut').addEventListener('click', ()=>{
    document.getElementById('panel-settings').hidden = true;
    renderDashboard(); showScreen('screen-dashboard');
    setTimeout(()=> document.getElementById('help-center-section').scrollIntoView({behavior:'smooth'}), 200);
  });
  document.getElementById('btn-parent-shortcut').addEventListener('click', ()=>{
    document.getElementById('panel-settings').hidden = true;
    renderDashboard(); showScreen('screen-dashboard');
    setTimeout(()=> document.getElementById('parent-zone-section').scrollIntoView({behavior:'smooth'}), 200);
  });

  document.getElementById('btn-settings').addEventListener('click', ()=> toggleDropdown('panel-settings','btn-settings'));
  document.getElementById('btn-notifications').addEventListener('click', ()=> toggleDropdown('panel-notifications','btn-notifications'));
  document.addEventListener('click', e=>{
    if(!e.target.closest('.dropdown-wrap')){
      document.querySelectorAll('.dropdown-panel').forEach(p=> p.hidden = true);
      document.querySelectorAll('.toolbar-actions [aria-haspopup]').forEach(b=> b.setAttribute('aria-expanded','false'));
    }
  });

  document.addEventListener('pointerdown', ()=> AudioEngine.unlock(), { once:true });
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(btn && !btn.dataset.silent) AudioEngine.click();
    addRippleEffect(e);
  });

  updateStreak();
}

function addRippleEffect(e){
  const btn = e.target.closest('.btn-start, .game-card, .feature-card, .widget-card');
  if(!btn) return;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.left = (e.clientX - rect.left) + 'px';
  ripple.style.top = (e.clientY - rect.top) + 'px';
  ripple.style.width = ripple.style.height = Math.max(rect.width, rect.height) + 'px';
  btn.style.position = btn.style.position || 'relative';
  btn.appendChild(ripple);
  setTimeout(()=> ripple.remove(), 650);
}

/* Gentle 3D tilt for premium cards (mouse only — skipped on touch for performance) */
function enableTilt(el){
  if(window.matchMedia('(pointer: coarse)').matches) return;
  el.addEventListener('mousemove', e=>{
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translateY(-8px) rotateX(${(-py*8).toFixed(2)}deg) rotateY(${(px*10).toFixed(2)}deg)`;
  });
  el.addEventListener('mouseleave', ()=>{ el.style.transform = ''; });
}

function updateStreak(){
  const today = new Date().toDateString();
  if(state.streak.lastVisit !== today){
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    state.streak.count = (state.streak.lastVisit === yesterday) ? state.streak.count + 1 : 1;
    state.streak.lastVisit = today;
    saveState();
  }
  const el = document.getElementById('streak-count');
  if(el) el.textContent = state.streak.count;
}

/* ---------- 7) LANDING PAGE ---------- */
function initLanding(){
  document.getElementById('btn-start-adventure').addEventListener('click', ()=>{
    renderDashboard(); showScreen('screen-dashboard');
  });
  const dayIndex = Math.floor(Date.now() / 86400000) % DAILY_QUOTES.length;
  document.getElementById('daily-quote').textContent = '💭 ' + DAILY_QUOTES[dayIndex];
  renderFooter(document.getElementById('landing-footer'));
}

/* ---------- 8) AVATAR BUILDER ---------- */
const AVATAR_OPTIONS = {
  background: { label:'🖼️ Background', kind:'color', values:['#AEE1F9','#FFD6E8','#D9F2D0','#FFF3B0','#E4D6FF','#FFD3B0'] },
  skin:       { label:'🧑 Skin Tone',   kind:'color', values:['#FFE0BD','#F1C27D','#D8A25E','#A9713F','#6B4226'] },
  hairStyle:  { label:'💇 Hair Style',  kind:'shape', values:['bald','short','curly','pony'] },
  hairColor:  { label:'🎨 Hair Color',  kind:'color', values:['#3B2A20','#7A4A2B','#D4A017','#B0402C','#5B4B8A','#E5E5E5'] },
  face:       { label:'😊 Eyes & Smile',kind:'emoji', values:['🙂','😊','😄','😉','🤩','😴'] },
  hat:        { label:'🎩 Hat',         kind:'emoji', values:['','🎩','👑','🧢','🎓','🌸'] },
  accessory:  { label:'✨ Accessory',   kind:'emoji', values:['','👓','🎀','🦋','⭐','🌟'] },
  shirt:      { label:'👕 Shirt Color', kind:'color', values:['#6FA8DC','#FF9FB2','#7FD79A','#FFC15E','#C9A0FF'] }
};
const HAIR_SHAPE_LABEL = { bald:'Bald', short:'Short', curly:'Curly', pony:'Ponytail' };

function buildAvatarMarkup(parts, size){
  const s = size === 'mini' ? 'avatar-mini' : 'avatar-full';
  const hairHtml = parts.hairStyle === 'bald' ? '' :
    `<div class="avatar-hair avatar-hair-${parts.hairStyle}" style="background:${parts.hairColor}"></div>`;
  return `
    <div class="avatar-ring ${s}" style="background:${parts.background}">
      <div class="avatar-head" style="background:${parts.skin}">
        ${hairHtml}
        <div class="avatar-face">${parts.face}</div>
        ${parts.hat ? `<div class="avatar-hat">${parts.hat}</div>` : ''}
        ${parts.accessory ? `<div class="avatar-accessory">${parts.accessory}</div>` : ''}
      </div>
      <div class="avatar-shirt" style="background:${parts.shirt}"></div>
    </div>`;
}
function renderAvatar(container, parts, size='full'){
  container.innerHTML = buildAvatarMarkup(parts, size);
}

let activeAvatarTab = 'background';
function initAvatarBuilder(){
  const tabsEl = document.getElementById('avatar-tabs');
  const optsEl = document.getElementById('avatar-options');
  const stageEl = document.getElementById('avatar-stage');

  tabsEl.innerHTML = '';
  Object.entries(AVATAR_OPTIONS).forEach(([key, cfg])=>{
    const tab = document.createElement('button');
    tab.className = 'avatar-tab' + (key===activeAvatarTab ? ' active':'');
    tab.textContent = cfg.label; tab.dataset.key = key;
    tab.setAttribute('role','tab'); tab.setAttribute('aria-selected', String(key===activeAvatarTab));
    tab.addEventListener('click', ()=>{
      activeAvatarTab = key; renderAvatarOptions();
      tabsEl.querySelectorAll('.avatar-tab').forEach(t=>{ t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      tab.classList.add('active'); tab.setAttribute('aria-selected','true');
    });
    tabsEl.appendChild(tab);
  });

  function renderAvatarOptions(){
    const cfg = AVATAR_OPTIONS[activeAvatarTab];
    optsEl.innerHTML = '';
    cfg.values.forEach(val=>{
      const btn = document.createElement('button');
      btn.className = 'avatar-swatch';
      btn.setAttribute('role','listitem');
      const current = state.profile.avatarParts[activeAvatarTab];
      if(current === val) btn.classList.add('selected');
      if(cfg.kind === 'color'){ btn.style.background = val; btn.setAttribute('aria-label', `${cfg.label}: color swatch`); }
      else if(cfg.kind === 'emoji'){ btn.textContent = val || '🚫'; btn.setAttribute('aria-label', val ? `${cfg.label}: ${val}` : 'None'); }
      else { btn.textContent = HAIR_SHAPE_LABEL[val]; btn.classList.add('avatar-swatch-text'); btn.setAttribute('aria-label', `Hair style: ${HAIR_SHAPE_LABEL[val]}`); }
      btn.addEventListener('click', ()=>{
        state.profile.avatarParts[activeAvatarTab] = val;
        saveState();
        renderAvatar(stageEl, state.profile.avatarParts, 'full');
        renderAvatar(document.getElementById('toolbar-avatar'), state.profile.avatarParts, 'mini');
        optsEl.querySelectorAll('.avatar-swatch').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        fireStarBurst(btn.getBoundingClientRect().left, btn.getBoundingClientRect().top);
      });
      optsEl.appendChild(btn);
    });
  }
  renderAvatarOptions();
  renderAvatar(stageEl, state.profile.avatarParts, 'full');
}

/* ---------- 9) DASHBOARD ---------- */
const ACTIVITIES = [
  { id:'abc', title:'ABC Learning', emoji:'🔤', desc:'Match letters to their pictures.', difficulty:'Easy', time:'5 min', reward:3 },
  { id:'numbers', title:'Numbers', emoji:'🔢', desc:'Count and tap the right number.', difficulty:'Easy', time:'5 min', reward:3 },
  { id:'shapes', title:'Shapes', emoji:'🔺', desc:'Fit shapes into their outlines.', difficulty:'Easy', time:'5 min', reward:3 },
  { id:'colors', title:'Colors', emoji:'🎨', desc:'Match color names to splashes.', difficulty:'Easy', time:'5 min', reward:3 },
  { id:'memory', title:'Memory Game', emoji:'🧠', desc:'Flip cards and find the pairs.', difficulty:'Medium', time:'8 min', reward:4 },
  { id:'puzzle', title:'Puzzle', emoji:'🧩', desc:'Build a happy little picture.', difficulty:'Medium', time:'6 min', reward:3 },
  { id:'matching', title:'Matching Game', emoji:'🐣', desc:'Match baby animals to parents.', difficulty:'Medium', time:'6 min', reward:3 },
  { id:'music', title:'Music Corner', emoji:'🎹', desc:'Play piano, drums &amp; xylophone.', difficulty:'Easy', time:'Free play', reward:2 },
  { id:'drawing', title:'Drawing Pad', emoji:'🖍️', desc:'Draw with rainbow &amp; glitter brushes.', difficulty:'Easy', time:'Free play', reward:2 },
  { id:'rewards', title:'Reward Room', emoji:'🎁', desc:'See your stickers and trophies.', difficulty:'—', time:'2 min', reward:0 },
  { id:'calm', title:'Calm Corner', emoji:'🫧', desc:'Breathe, pop bubbles, relax.', difficulty:'—', time:'Free play', reward:1 },
  { id:'achievements', title:'Achievements', emoji:'🏆', desc:'Track your magical milestones.', difficulty:'—', time:'2 min', reward:0 },
  { id:'words', title:'Word Builder', emoji:'🧱', desc:'Build simple words letter by letter.', difficulty:'Medium', time:'6 min', reward:3 },
  { id:'emotions', title:'Emotions Corner', emoji:'🥰', desc:'Match faces to how they feel.', difficulty:'Easy', time:'5 min', reward:3 },
  { id:'opposites', title:'Opposites', emoji:'⚖️', desc:'Match every word to its opposite.', difficulty:'Medium', time:'5 min', reward:3 },
  { id:'simon', title:'Simon Says', emoji:'🎯', desc:'Watch, remember, repeat the pattern.', difficulty:'Medium', time:'5 min', reward:4 }
];
const ACTIVITY_TARGET = 5; // completions considered "mastered" for the progress bar
const ALWAYS_UNLOCKED = ['abc', 'rewards', 'achievements']; // first activity + info-only rooms

function isUnlocked(activityId){
  if(ALWAYS_UNLOCKED.includes(activityId)) return true;
  const idx = ACTIVITIES.findIndex(a=>a.id===activityId);
  // walk backwards to the nearest *real* activity, skipping info-only rooms
  for(let i = idx - 1; i >= 0; i--){
    const prevId = ACTIVITIES[i].id;
    if(ALWAYS_UNLOCKED.includes(prevId)) continue;
    return (state.activityCompletions[prevId] || 0) >= 1;
  }
  return true;
}

function createGameCard(activity){
  const card = document.createElement('button');
  card.className = 'game-card tilt-card';
  card.setAttribute('role','listitem');
  const unlocked = isUnlocked(activity.id);
  if(!unlocked) card.classList.add('locked');
  const completions = state.activityCompletions[activity.id] || 0;
  const pct = Math.min(100, Math.round((completions/ACTIVITY_TARGET)*100));
  const diffClass = activity.difficulty === 'Easy' ? 'diff-easy' : activity.difficulty === 'Medium' ? 'diff-medium' : (activity.difficulty === 'Hard' ? 'diff-hard' : '');

  card.setAttribute('aria-label', `${activity.title}: ${activity.desc}${unlocked ? '' : ' (locked)'}`);
  card.innerHTML = `
    <div class="card-glow-ring"></div>
    ${!unlocked ? '<div class="lock-overlay" aria-hidden="true">🔒</div>' : ''}
    <div class="card-illustration" aria-hidden="true">${activity.emoji}</div>
    <div class="card-badges">
      ${activity.difficulty!=='—' ? `<span class="badge-chip ${diffClass}">${activity.difficulty}</span>`:''}
      <span class="badge-chip">⏱ ${activity.time}</span>
      ${activity.reward ? `<span class="badge-chip">+${activity.reward} ⭐</span>` : ''}
    </div>
    <h3>${activity.title}</h3>
    <p class="card-desc">${activity.desc}</p>
    <div class="card-progress-wrap">
      <div class="card-progress-bar"><div class="card-progress-fill" style="width:${pct}%"></div></div>
      <div class="card-progress-label">${pct}% mastered</div>
    </div>
    <button class="btn-play" ${unlocked?'':'disabled'} data-silent="true">${unlocked ? '▶ Play' : '🔒 Locked'}</button>`;

  card.addEventListener('click', ()=>{
    if(!unlocked){
      const idx = ACTIVITIES.findIndex(a=>a.id===activity.id);
      showToast(`🔒 Finish "${ACTIVITIES[idx-1].title}" once to unlock this!`);
      return;
    }
    openActivity(activity.id);
  });
  enableTilt(card);
  return card;
}

function renderDashboard(){
  document.getElementById('dashboard-name').textContent = state.profile.name || 'Explorer';
  const grid = document.getElementById('dashboard-grid');
  grid.innerHTML = '';
  ACTIVITIES.forEach(a=> grid.appendChild(createGameCard(a)));

  renderWorldDecorations();
  renderWidgets();
  renderStoryLibrary();
  renderParentZone();
  renderHelpCenter();
  renderFooter(document.getElementById('dashboard-footer'));
  updateToolbarUI();
  observeSectionReveal();
}

/* ---- Decorative magical-world background (purely visual, aria-hidden) ---- */
function renderWorldDecorations(){
  const layer = document.getElementById('world-decor');
  if(layer.dataset.built) return; // build once, keep it lightweight
  layer.dataset.built = 'true';
  const items = [
    ...Array(4).fill('☁️'), ...Array(3).fill('🦋'), ...Array(2).fill('🐦'),
    ...Array(4).fill('✨'), ...Array(3).fill('🌸'), '🍄','🍄','🌳','🌳','🌻','🌼',
    '🎈','🎈','🪁','🦄','🐝','🐞','🐇','🐿️','🐸','🌞'
  ];
  items.forEach((emoji, i)=>{
    const span = document.createElement('span');
    span.textContent = emoji;
    span.setAttribute('aria-hidden','true');
    const size = 1.2 + Math.random()*1.4;
    span.style.fontSize = size + 'rem';
    span.style.left = (Math.random()*94) + '%';
    span.style.top = (80 + Math.random()*1900) + 'px';
    const anims = ['decor-float','decor-sway','decor-bob','decor-twinkle'];
    span.className = anims[i % anims.length];
    span.style.animationDelay = (Math.random()*4) + 's';
    span.style.animationDuration = (4 + Math.random()*5) + 's';
    layer.appendChild(span);
  });
}

/* ---- Widgets row ---- */
function renderWidgets(){
  const wrap = document.getElementById('widgets-grid');
  wrap.innerHTML = '';
  const todayKey = new Date().toDateString();
  const dayIdx = Math.floor(Date.now()/86400000);

  const widgets = [
    { icon:'📅', title:"Today's Challenge", body: challengeText(), action:'Go!', onAction:()=> openBestNextActivity() },
    { icon:'🌟', title:"Today's Goal", body: 'Finish 1 activity today.', action:"Let's go", onAction:()=> document.getElementById('dashboard-grid').scrollIntoView({behavior:'smooth'}) },
    { icon:'🏅', title:'Weekly Progress', body: `${state.stars} stars earned so far — keep glowing!`, action:null },
    { icon:'🎁', title:'Surprise Gift', body: state.giftLog[todayKey] ? "You already opened today's gift!" : 'A gift is waiting for you!', action: state.giftLog[todayKey] ? 'Opened ✔' : 'Open', onAction: openSurpriseGift, disabled: !!state.giftLog[todayKey] },
    { icon:'📖', title:'Story of the Day', body: STORIES[dayIdx % STORIES.length].title, action:'Read', onAction:()=> document.getElementById('story-heading').scrollIntoView({behavior:'smooth'}) },
    { icon:'💡', title:'Fun Fact', body: FUN_FACTS[dayIdx % FUN_FACTS.length], action:null },
    { icon:'😊', title:'Mood Check', body: 'How are you feeling today?', isMood:true },
    { icon:'🌤️', title:'Weather Friend', body: WEATHER_MOODS[dayIdx % WEATHER_MOODS.length].text, iconOverride: WEATHER_MOODS[dayIdx % WEATHER_MOODS.length].emoji },
    { icon:'🦄', title:'Daily Buddy', body: randomFrom(BUDDY_TIPS), action:null },
    { icon:'🎨', title:'Creative Tip', body: CREATIVE_TIPS[dayIdx % CREATIVE_TIPS.length], action:null }
  ];

  widgets.forEach(w=>{
    const card = document.createElement('div');
    card.className = 'widget-card';
    card.innerHTML = `
      <span class="widget-icon" aria-hidden="true">${w.iconOverride || w.icon}</span>
      <p class="widget-title">${w.title}</p>
      <p class="widget-body">${w.body}</p>
      ${w.isMood ? `<div class="widget-mood-row" role="group" aria-label="Choose your mood">
          <button data-mood="happy" aria-label="Happy">😀</button>
          <button data-mood="okay" aria-label="Okay">🙂</button>
          <button data-mood="sad" aria-label="Sad">😐</button>
        </div>` : ''}
      ${w.action ? `<button class="widget-action" ${w.disabled?'disabled':''}>${w.action}</button>` : ''}`;
    if(w.onAction){
      const btn = card.querySelector('.widget-action');
      if(btn) btn.addEventListener('click', w.onAction);
    }
    if(w.isMood){
      const already = state.moodLog[todayKey];
      card.querySelectorAll('.widget-mood-row button').forEach(b=>{
        if(b.dataset.mood === already) b.classList.add('selected');
        b.addEventListener('click', ()=>{
          state.moodLog[todayKey] = b.dataset.mood; saveState();
          card.querySelectorAll('.widget-mood-row button').forEach(x=>x.classList.remove('selected'));
          b.classList.add('selected');
          const replies = { happy:"Yay! Let's have a wonderful day! 😀", okay:"That's okay — Calm Corner is here if you need it. 🫧", sad:'Sending you a big hug 🤗 Maybe visit the Calm Corner?' };
          showToast(replies[b.dataset.mood]);
        });
      });
    }
    wrap.appendChild(card);
  });
}
function challengeText(){
  const pool = ['Earn 10 ⭐ Stars', 'Try 3 different activities', 'Collect 15 🪙 Coins', 'Unlock a new badge'];
  const dayIdx = Math.floor(Date.now()/86400000);
  return pool[dayIdx % pool.length];
}
function openBestNextActivity(){
  const next = ACTIVITIES.find(a=> isUnlocked(a.id) && !['rewards','achievements'].includes(a.id));
  if(next) openActivity(next.id);
}
function openSurpriseGift(){
  const todayKey = new Date().toDateString();
  if(state.giftLog[todayKey]) return;
  state.giftLog[todayKey] = true;
  grantReward({ stars:2, coins:5 });
  celebrationConfetti(); AudioEngine.celebration();
  showToast('🎁 Surprise! You found bonus coins and stars!');
  renderWidgets();
}

/* ---- Story Library (small, real, expandable stories) ---- */
const STORIES = [
  { emoji:'🐻', title:'Bruno the Brave Bear', text:"Bruno was scared of the dark cave, but his friends held his paw. Step by step, he walked in and found a room full of sparkling crystals. Being brave doesn't mean not being scared — it means trying anyway!" },
  { emoji:'🦋', title:'Bella the Patient Butterfly', text:'Bella wanted to fly right away, but first she had to wait inside her cozy cocoon. She practiced patience every day. When she finally opened her wings, she flew higher than she ever imagined!' },
  { emoji:'🐢', title:'Toby the Slow and Steady Turtle', text:'Toby moved slower than his friends, but he never gave up. He took breaks when he needed to and always finished what he started. Slow and steady made his heart very proud.' }
];
function renderStoryLibrary(){
  const grid = document.getElementById('story-grid');
  grid.innerHTML = '';
  STORIES.forEach(story=>{
    const card = document.createElement('div');
    card.className = 'story-card';
    card.innerHTML = `
      <div class="story-illustration" aria-hidden="true">${story.emoji}</div>
      <h3>${story.title}</h3>
      <div class="story-text">${story.text}</div>
      <button data-silent="true">📖 Read Story</button>`;
    const btn = card.querySelector('button');
    const textEl = card.querySelector('.story-text');
    btn.addEventListener('click', ()=>{
      const open = textEl.classList.toggle('open');
      btn.textContent = open ? '🙈 Hide Story' : '📖 Read Story';
      if(open) speak(story.title + '. ' + story.text);
    });
    grid.appendChild(card);
  });
}

/* ---- Parent Zone ---- */
function renderParentZone(){
  const grid = document.getElementById('parent-zone-grid');
  grid.innerHTML = '';
  const items = [
    { icon:'📊', title:'Progress Overview', body:`${state.profile.name} has completed ${Object.values(state.activityCompletions).reduce((a,b)=>a+b,0)} activities and earned ${state.stars} stars.` },
    { icon:'🔒', title:'Privacy First', body:'All progress stays on this device — nothing is uploaded anywhere.' },
    { icon:'🧘', title:'Encourage Breaks', body:'The Calm Corner is always one tap away if things feel like too much.' },
    { icon:'⚙️', title:'Accessibility Options', body:'High contrast, dyslexia font, large text and voice guidance are in the ⚙️ menu.' }
  ];
  items.forEach(w=>{
    const card = document.createElement('div');
    card.className = 'widget-card';
    card.innerHTML = `<span class="widget-icon" aria-hidden="true">${w.icon}</span><p class="widget-title">${w.title}</p><p class="widget-body">${w.body}</p>`;
    grid.appendChild(card);
  });
}

/* ---- Help Center (native <details> — accessible with zero extra JS) ---- */
function renderHelpCenter(){
  const wrap = document.getElementById('help-accordion');
  const faqs = [
    { q:'How do I unlock more activities?', a:'Complete the activity just before it once, and the next one unlocks automatically!' },
    { q:'Is my progress saved?', a:'Yes! Everything is saved right in this browser using Local Storage — no account needed.' },
    { q:'My child needs a break — what do I do?', a:'Open the Calm Corner anytime for breathing exercises, bubbles and gentle sounds.' },
    { q:'Can I turn off the sounds?', a:'Yes — tap the 🔊 speaker icon in the top toolbar to mute all sounds instantly.' }
  ];
  wrap.innerHTML = faqs.map(f=> `
    <details class="help-item">
      <summary>${f.q}</summary>
      <p>${f.a}</p>
    </details>`).join('');
}

/* ---- Rich shared footer (used by both landing & dashboard) ---- */
function renderFooter(container){
  container.innerHTML = `
    <footer class="rich-footer">
      <div class="footer-rainbow" aria-hidden="true"></div>
      <div class="footer-decor" aria-hidden="true">
        <span style="left:6%; top:10%;">☁️</span><span style="right:8%; top:14%; animation-delay:1s;">☁️</span>
        <span style="left:14%; bottom:14%; animation-delay:.6s;">🐻</span><span style="right:16%; bottom:10%; animation-delay:1.4s;">🐰</span>
        <span style="left:50%; top:4%; animation-delay:.3s;">⭐</span>
      </div>
      <img class="footer-mascot" src="assets/images/mascot.svg" alt="Sparkle the mascot waving goodbye">
      <p style="font-weight:800;">Thanks for visiting the kingdom — come back soon! 💛</p>
      <div class="footer-links">
        <div class="footer-col">
          <h4>Quick Links</h4>
          <a href="#" data-nav="screen-landing">Home</a>
          <a href="#" data-nav="screen-dashboard">Dashboard</a>
          <a href="#" data-nav="screen-profile">My Profile</a>
        </div>
        <div class="footer-col">
          <h4>Accessibility</h4>
          <p>High contrast, dyslexia font, large text &amp; voice guidance available in ⚙️ Settings.</p>
        </div>
        <div class="footer-col">
          <h4>For Parents</h4>
          <p>No ads. No accounts. Progress saved only on this device.</p>
        </div>
        <div class="footer-col">
          <h4>Contact</h4>
          <p>Questions? Visit the ❓ Help Center on the dashboard.</p>
        </div>
      </div>
      <p class="footer-bottom">© <span id="footer-year"></span> Magic Learning Adventure — made with 💛 for every kind of learner.</p>
    </footer>`;
  container.querySelector('#footer-year').textContent = new Date().getFullYear();
  container.querySelectorAll('[data-nav]').forEach(a=>{
    a.addEventListener('click', e=>{
      e.preventDefault();
      const id = a.dataset.nav;
      if(id === 'screen-dashboard'){ renderDashboard(); showScreen(id); return; }
      if(id === 'screen-profile'){ openProfile(); return; }
      showScreen(id);
    });
  });
}

/* Fade-in sections as the user scrolls (IntersectionObserver — lightweight) */
function observeSectionReveal(){
  const sections = document.querySelectorAll('#screen-dashboard .dash-section');
  const io = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{ if(entry.isIntersecting) entry.target.classList.add('in-view'); });
  }, { threshold: 0.12 });
  sections.forEach(s=> io.observe(s));
}

function openActivity(id){
  const meta = ACTIVITIES.find(a=>a.id===id);
  document.getElementById('activity-title').textContent = `${meta.emoji} ${meta.title}`;
  showScreen('screen-activity');
  const content = document.getElementById('activity-content');
  content.innerHTML = '';
  speak(`${meta.title}. ${meta.desc}`);
  GAME_RENDERERS[id](content);
}
document.getElementById('btn-activity-back').addEventListener('click', ()=>{ AudioEngine.stopAmbient(); AudioEngine.stopNature(); renderDashboard(); showScreen('screen-dashboard'); });
document.getElementById('btn-profile-back').addEventListener('click', ()=>{ showScreen('screen-dashboard'); });

/* ---------- Reward helpers (shared by every game) ---------- */
function grantReward({stars=1, coins=1, activityId, badgeId}={}){
  state.stars += stars; state.coins += coins;
  state.xp += stars*10 + coins*4;
  if(activityId){ state.activityCompletions[activityId] = (state.activityCompletions[activityId]||0) + 1; }
  const newLevel = Math.floor(state.xp/100) + 1;
  const leveledUp = newLevel > state.level;
  state.level = newLevel;
  if(badgeId) unlockBadge(badgeId);
  checkAchievements();
  saveState();
  updateToolbarUI();
  if(leveledUp){
    showToast(`🏆 Level Up! You're now Level ${state.level}!`);
    celebrationConfetti(); AudioEngine.victory();
  }
}

function updateToolbarUI(){
  document.getElementById('stars-count').textContent = state.stars;
  document.getElementById('coins-count').textContent = state.coins;
  document.getElementById('level-count').textContent = state.level;
  document.getElementById('trophies-count').textContent = state.achievements.length;
  document.getElementById('mini-xp-fill').style.width = (state.xp % 100) + '%';
  renderAvatar(document.getElementById('toolbar-avatar'), state.profile.avatarParts, 'mini');
  renderNotifications();
}

function renderNotifications(){
  const list = document.getElementById('notif-list');
  const dot = document.getElementById('notif-dot');
  const items = [...state.notifications].slice(-8).reverse();
  if(items.length === 0){
    list.innerHTML = '<li class="dropdown-empty">No notifications yet — go earn a badge! ✨</li>';
    dot.hidden = true;
  } else {
    list.innerHTML = items.map(n=> `<li>${n}</li>`).join('');
    dot.hidden = false;
  }
}
function pushNotification(text){
  state.notifications.push(text);
  if(state.notifications.length > 20) state.notifications.shift();
  saveState(); renderNotifications();
}

function feedbackCorrect(el, x, y){
  el.classList.add('correct');
  AudioEngine.correct();
  fireStarBurst(x, y);
  showToast(randomFrom(PRAISES));
}
function feedbackIncorrect(el){
  el.classList.add('shake');
  AudioEngine.incorrect();
  showToast(randomFrom(ENCOURAGEMENTS));
  setTimeout(()=> el.classList.remove('shake'), 420);
}

/* ---------- 10) GAME CHROME (shared instructions / hint / restart bar) ----------
   Every mini-game gets a consistent, reusable top bar: Instructions (with
   voice read-aloud), Hint and Restart. Keeps games consistent and the
   code DRY instead of re-implementing this per game.
--------------------------------------------------------------------------- */
function renderGameChrome(mount, { instructions, onHint, onRestart }){
  const bar = document.createElement('div');
  bar.className = 'game-chrome';
  bar.innerHTML = `
    <button class="chrome-btn" id="chrome-instructions" aria-haspopup="dialog">ℹ️ Instructions</button>
    ${onHint ? '<button class="chrome-btn" id="chrome-hint">💡 Hint</button>' : ''}
    ${onRestart ? '<button class="chrome-btn" id="chrome-restart">🔁 Restart</button>' : ''}
  `;
  mount.appendChild(bar);

  const dialogBack = document.createElement('div');
  dialogBack.className = 'chrome-modal-backdrop'; dialogBack.hidden = true;
  dialogBack.innerHTML = `<div class="chrome-modal" role="dialog" aria-label="Instructions">
      <h3>ℹ️ How to Play</h3><p>${instructions}</p>
      <button class="btn-play" id="chrome-modal-close">Got it! 😊</button>
    </div>`;
  mount.appendChild(dialogBack);

  bar.querySelector('#chrome-instructions').addEventListener('click', ()=>{
    dialogBack.hidden = false; speak(instructions);
  });
  dialogBack.querySelector('#chrome-modal-close').addEventListener('click', ()=> dialogBack.hidden = true);
  dialogBack.addEventListener('click', e=>{ if(e.target === dialogBack) dialogBack.hidden = true; });

  if(onHint) bar.querySelector('#chrome-hint').addEventListener('click', onHint);
  if(onRestart) bar.querySelector('#chrome-restart').addEventListener('click', onRestart);
}

/* ---------- 11) GENERIC PLACEMENT-GAME ENGINE (drag + keyboard accessible) ----------
   Used by: ABC, Shapes, Colors, Matching(animals), Puzzle.
------------------------------------------------------------------------- */
function createPlacementGame({ mountEl, poolItems, slots, slotGridStyle, onAllComplete, activityId, badgeId, instructions }){
  mountEl.innerHTML = '';
  renderGameChrome(mountEl, {
    instructions: instructions || "Drag each item to the spot where it belongs. Tap an item, then tap its matching spot!",
    onHint: () => giveHint(),
    onRestart: () => build()
  });
  const shell = document.createElement('div');
  shell.className = 'game-shell';
  shell.innerHTML = `
    <p class="game-progress" id="pg-progress"></p>
    <div class="match-board">
      <div><div class="drop-pool" id="pg-slots" style="${slotGridStyle||''}"></div></div>
      <div class="drag-pool" id="pg-pool"></div>
    </div>`;
  mountEl.appendChild(shell);

  const poolEl = shell.querySelector('#pg-pool');
  const slotsEl = shell.querySelector('#pg-slots');
  const progressEl = shell.querySelector('#pg-progress');
  let matchedCount = 0;
  let selectedChip = null;

  function build(){
    matchedCount = 0; selectedChip = null;
    poolEl.innerHTML = ''; slotsEl.innerHTML = '';
    progressEl.textContent = `0 / ${slots.length} matched`;

    const shuffledPool = [...poolItems].sort(()=> Math.random()-0.5);
    shuffledPool.forEach(item=>{
      const chip = document.createElement('div');
      chip.className = 'drag-chip'; chip.tabIndex = 0; chip.setAttribute('role','button');
      chip.setAttribute('draggable','true'); chip.dataset.id = item.id;
      chip.setAttribute('aria-label', `${item.label}, draggable item`);
      chip.innerHTML = `<span aria-hidden="true">${item.emoji}</span><span class="chip-label">${item.label}</span>`;
      poolEl.appendChild(chip);
      chip.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', item.id); chip.classList.add('dragging'); });
      chip.addEventListener('dragend', ()=> chip.classList.remove('dragging'));
      chip.addEventListener('click', ()=> selectChip(chip));
      chip.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); selectChip(chip);} });
    });

    const shuffledSlots = [...slots].sort(()=> Math.random()-0.5);
    shuffledSlots.forEach(slot=>{
      const zone = document.createElement('div');
      zone.className = 'drop-zone'; zone.tabIndex = 0; zone.setAttribute('role','button');
      zone.dataset.match = slot.matchId;
      zone.setAttribute('aria-label', `Drop zone for ${slot.label}`);
      zone.innerHTML = `<span class="drop-zone-emoji" aria-hidden="true">${slot.emoji||'❔'}</span><span class="chip-label">${slot.label}</span>`;
      slotsEl.appendChild(zone);
      zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', ()=> zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e=>{
        e.preventDefault(); zone.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        attemptPlacement(poolEl.querySelector(`.drag-chip[data-id="${CSS.escape(id)}"]`), zone);
      });
      zone.addEventListener('click', ()=>{ if(selectedChip) attemptPlacement(selectedChip, zone); });
      zone.addEventListener('keydown', e=>{ if((e.key==='Enter'||e.key===' ') && selectedChip){ e.preventDefault(); attemptPlacement(selectedChip, zone); } });
    });
  }

  function selectChip(chip){
    if(chip.classList.contains('placed')) return;
    if(selectedChip) selectedChip.style.outline='';
    selectedChip = chip; chip.style.outline = '4px solid #3F6FE0';
  }

  function attemptPlacement(chip, zone){
    if(!chip || zone.classList.contains('filled')) return;
    const rect = zone.getBoundingClientRect();
    if(chip.dataset.id === zone.dataset.match){
      zone.classList.add('filled');
      const item = poolItems.find(p=>p.id===chip.dataset.id);
      zone.querySelector('.drop-zone-emoji').textContent = item.emoji;
      chip.classList.add('placed'); chip.style.display = 'none';
      matchedCount++;
      progressEl.textContent = `${matchedCount} / ${slots.length} matched`;
      feedbackCorrect(zone, rect.left+rect.width/2, rect.top);
      selectedChip = null;
      if(matchedCount === slots.length){
        setTimeout(()=>{
          AudioEngine.victory(); celebrationConfetti();
          grantReward({ stars:3, coins:2, activityId, badgeId });
          showToast('🎉 Activity complete! Amazing work!');
          if(onAllComplete) onAllComplete();
        }, 300);
      }
    } else feedbackIncorrect(zone);
  }

  function giveHint(){
    const remainingChip = [...poolEl.querySelectorAll('.drag-chip')].find(c=> c.style.display !== 'none');
    if(!remainingChip) return;
    const zone = slotsEl.querySelector(`.drop-zone[data-match="${CSS.escape(remainingChip.dataset.id)}"]`);
    [remainingChip, zone].forEach(el=>{ if(el){ el.style.boxShadow='0 0 0 5px #FFD66B'; setTimeout(()=> el.style.boxShadow='', 1400); } });
    showToast('💡 Look for the glowing hint!');
  }

  build();
}

/* ---------- 12) INDIVIDUAL GAMES ---------- */
const GAME_RENDERERS = {
  abc: renderABC, numbers: renderNumbers, shapes: renderShapes, colors: renderColors,
  memory: renderMemory, puzzle: renderPuzzle, matching: renderMatching, music: renderMusic,
  drawing: renderDrawing, rewards: renderRewards, calm: renderCalm, achievements: renderAchievements,
  words: renderWordBuilder, emotions: renderEmotions, opposites: renderOpposites, simon: renderSimon
};

function renderABC(mount){
  const data = [
    {id:'A', emoji:'🍎', label:'A is for Apple'}, {id:'B', emoji:'🎈', label:'B is for Balloon'},
    {id:'C', emoji:'🐱', label:'C is for Cat'}, {id:'D', emoji:'🐶', label:'D is for Dog'},
    {id:'E', emoji:'🥚', label:'E is for Egg'}, {id:'F', emoji:'🐸', label:'F is for Frog'}
  ];
  createPlacementGame({
    mountEl: mount,
    poolItems: data.map(d=>({id:d.id, emoji:d.id, label:d.id})),
    slots: data.map(d=>({id:d.id, matchId:d.id, label:d.label, emoji:d.emoji})),
    activityId:'abc', badgeId:'badge_abc',
    instructions:'Drag each letter to the picture that starts with that letter!'
  });
}

function renderNumbers(mount){
  mount.innerHTML = '';
  renderGameChrome(mount, {
    instructions:'Count the pictures, then tap the number that matches how many you see!',
    onRestart: ()=> start()
  });
  const shell = document.createElement('div');
  shell.className = 'game-shell'; shell.style.textAlign = 'center';
  shell.innerHTML = `
    <div class="game-toolbar" role="group" aria-label="Choose difficulty">
      <button class="diff-btn" data-max="6">Easy</button>
      <button class="diff-btn" data-max="9">Medium</button>
      <button class="diff-btn" data-max="12">Hard</button>
    </div>
    <p class="game-progress" id="num-progress">Round 1 of 5 • Score: 0</p>
    <div id="num-objects" style="font-size:3rem; margin:20px 0; letter-spacing:10px;"></div>
    <p style="font-weight:800; font-size:1.2rem;">How many do you see?</p>
    <div id="num-choices" style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap; margin-top:16px;"></div>`;
  mount.appendChild(shell);

  const emojiChoices = ['🍓','🐥','⭐','🎈','🐬','🦋'];
  let round = 0, score = 0, maxN = 9; const totalRounds = 5;
  const diffBtns = shell.querySelectorAll('.diff-btn');
  diffBtns.forEach(b=> b.addEventListener('click', ()=>{
    diffBtns.forEach(x=>x.classList.remove('active')); b.classList.add('active');
    maxN = parseInt(b.dataset.max,10); start();
  }));
  diffBtns[0].classList.add('active');

  const progressEl = shell.querySelector('#num-progress');
  const objectsEl = shell.querySelector('#num-objects');
  const choicesEl = shell.querySelector('#num-choices');

  function start(){ round = 0; score = 0; nextRound(); }

  function nextRound(){
    if(round >= totalRounds){
      AudioEngine.victory(); celebrationConfetti();
      grantReward({ stars:3, coins:2, activityId:'numbers', badgeId:'badge_numbers' });
      shell.innerHTML = `<h2>🎉 You're Amazing!</h2><p>You scored ${score} / ${totalRounds}. Great counting!</p>`;
      return;
    }
    round++;
    progressEl.textContent = `Round ${round} of ${totalRounds} • Score: ${score}`;
    const correct = Math.max(2, Math.floor(Math.random()*(maxN-1)) + 2);
    objectsEl.textContent = randomFrom(emojiChoices).repeat(correct);
    const options = new Set([correct]);
    while(options.size < 3) options.add(Math.max(1, correct + Math.floor(Math.random()*5)-2));
    choicesEl.innerHTML = '';
    [...options].sort(()=> Math.random()-0.5).forEach(n=>{
      const btn = document.createElement('button');
      btn.className = 'diff-btn'; btn.style.fontSize = '1.6rem'; btn.style.minWidth='70px';
      btn.textContent = n; btn.setAttribute('aria-label', `Answer ${n}`);
      btn.addEventListener('click', ()=>{
        if(n === correct){ score++; feedbackCorrect(btn, window.innerWidth/2, window.innerHeight/2); setTimeout(nextRound, 700); }
        else feedbackIncorrect(btn);
      });
      choicesEl.appendChild(btn);
    });
  }
  start();
}

function renderShapes(mount){
  const data = [
    {id:'circle', emoji:'🔴', label:'Circle'}, {id:'square', emoji:'🟧', label:'Square'},
    {id:'triangle', emoji:'🔺', label:'Triangle'}, {id:'star', emoji:'⭐', label:'Star'},
    {id:'heart', emoji:'💚', label:'Heart'}
  ];
  createPlacementGame({
    mountEl: mount,
    poolItems: data.map(d=>({id:d.id, emoji:d.emoji, label:d.label})),
    slots: data.map(d=>({id:d.id, matchId:d.id, label:d.label})),
    activityId:'shapes', badgeId:'badge_shapes',
    instructions:'Drag each shape into the box with the matching name!'
  });
}

function renderColors(mount){
  const data = [
    {id:'red', emoji:'🔴', label:'Red'}, {id:'yellow', emoji:'🟡', label:'Yellow'},
    {id:'green', emoji:'🟢', label:'Green'}, {id:'blue', emoji:'🔵', label:'Blue'},
    {id:'purple', emoji:'🟣', label:'Purple'}
  ];
  createPlacementGame({
    mountEl: mount,
    poolItems: data.map(d=>({id:d.id, emoji:'🖌️', label:d.label})),
    slots: data.map(d=>({id:d.id, matchId:d.id, label:'', emoji:d.emoji})),
    activityId:'colors', badgeId:'badge_colors',
    instructions:'Drag each paintbrush to the splash of the matching color!'
  });
}

function renderMatching(mount){
  const data = [
    {id:'dog', baby:'🐶', label:'Puppy → Dog', emoji:'🐕'}, {id:'cat', baby:'🐱', label:'Kitten → Cat', emoji:'🐈'},
    {id:'duck', baby:'🐥', label:'Duckling → Duck', emoji:'🦆'}, {id:'cow', baby:'🐮', label:'Calf → Cow', emoji:'🐄'},
    {id:'sheep', baby:'🐑', label:'Lamb → Sheep', emoji:'🐑'}
  ];
  createPlacementGame({
    mountEl: mount,
    poolItems: data.map(d=>({id:d.id, emoji:d.baby, label:d.label.split(' → ')[0]})),
    slots: data.map(d=>({id:d.id, matchId:d.id, label:d.label.split(' → ')[1], emoji: d.emoji})),
    activityId:'matching', badgeId:'badge_matching',
    instructions:'Drag each baby animal to its grown-up parent!'
  });
}

function renderPuzzle(mount){
  mount.innerHTML = '';
  const scene = [
    {id:'sun', emoji:'☀️', label:'Sun'}, {id:'cloud', emoji:'☁️', label:'Cloud'}, {id:'bird', emoji:'🐦', label:'Bird'},
    {id:'house', emoji:'🏠', label:'House'}, {id:'tree', emoji:'🌳', label:'Tree'}, {id:'flower', emoji:'🌸', label:'Flower'}
  ];
  const puzzleMount = document.createElement('div'); mount.appendChild(puzzleMount);
  createPlacementGame({
    mountEl: puzzleMount,
    poolItems: scene.map(s=>({id:s.id, emoji:s.emoji, label:s.label})),
    slots: scene.map(s=>({id:s.id, matchId:s.id, label:s.label})),
    slotGridStyle: 'display:grid; grid-template-columns: repeat(3, 110px); gap:14px;',
    activityId:'puzzle', badgeId:'badge_puzzle',
    instructions:'Drag each piece into its matching spot to build the happy scene!'
  });
}

function renderMemory(mount){
  mount.innerHTML = '';
  let diffBtns;
  renderGameChrome(mount, { instructions:'Flip two cards at a time to find matching pairs!', onRestart: ()=> {
    const activeIdx = Array.from(diffBtns).findIndex(b=>b.classList.contains('active'));
    diffBtns[activeIdx >= 0 ? activeIdx : 0].click();
  }});
  const shell = document.createElement('div'); shell.className = 'game-shell';
  shell.innerHTML = `
    <div class="game-toolbar" role="group" aria-label="Choose difficulty">
      <button class="diff-btn" data-n="6">Easy (6 pairs)</button>
      <button class="diff-btn" data-n="8">Medium (8 pairs)</button>
      <button class="diff-btn" data-n="12">Hard (12 pairs)</button>
    </div>
    <p class="game-progress" id="mem-progress"></p>
    <div class="memory-grid" id="memory-grid"></div>`;
  mount.appendChild(shell);
  diffBtns = shell.querySelectorAll('.diff-btn');
  diffBtns.forEach(b=> b.addEventListener('click', ()=>{
    diffBtns.forEach(x=>x.classList.remove('active')); b.classList.add('active');
    startMemory(parseInt(b.dataset.n,10));
  }));
  diffBtns[0].click();

  function startMemory(n){
    const symbols = ['🐶','🐱','🐰','🐻','🦊','🐼','🐸','🦁','🐵','🐷','🐨','🦄','🐤','🐙'];
    const chosen = symbols.slice(0, n);
    const deck = [...chosen, ...chosen].sort(()=> Math.random()-0.5);
    const grid = shell.querySelector('#memory-grid');
    grid.style.setProperty('--cols', n <= 6 ? 4 : (n <= 8 ? 4 : 6));
    grid.innerHTML = '';
    let flipped = [], lockBoard = false, matches = 0;
    const progressEl = shell.querySelector('#mem-progress');
    progressEl.textContent = `0 / ${chosen.length} pairs found`;

    deck.forEach((symbol)=>{
      const card = document.createElement('div');
      card.className = 'memory-card'; card.tabIndex = 0; card.setAttribute('role','button');
      card.setAttribute('aria-label','Memory card, hidden'); card.dataset.symbol = symbol;
      card.innerHTML = `<div class="memory-card-inner">
          <div class="memory-face front" aria-hidden="true">❓</div>
          <div class="memory-face back" aria-hidden="true">${symbol}</div></div>`;
      card.addEventListener('click', ()=> flipCard(card));
      card.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); flipCard(card); } });
      grid.appendChild(card);
    });

    function flipCard(card){
      if(lockBoard || card.classList.contains('flipped') || card.classList.contains('matched')) return;
      card.classList.add('flipped'); flipped.push(card);
      if(flipped.length === 2){
        lockBoard = true;
        const [a,b] = flipped;
        if(a.dataset.symbol === b.dataset.symbol){
          a.classList.add('matched'); b.classList.add('matched'); matches++;
          progressEl.textContent = `${matches} / ${chosen.length} pairs found`;
          AudioEngine.correct(); fireStarBurst(window.innerWidth/2, window.innerHeight/3);
          flipped = []; lockBoard = false;
          if(matches === chosen.length){
            setTimeout(()=>{
              AudioEngine.victory(); celebrationConfetti();
              grantReward({ stars:4, coins:3, activityId:'memory', badgeId:'badge_memory' });
              showToast('🎉 You found every pair!');
            }, 250);
          }
        } else {
          AudioEngine.incorrect();
          setTimeout(()=>{ a.classList.remove('flipped'); b.classList.remove('flipped'); flipped=[]; lockBoard=false; }, 800);
        }
      }
    }
  }
}

function renderMusic(mount){
  mount.innerHTML = '';
  renderGameChrome(mount, { instructions:'Tap the piano keys, drums or xylophone bars to make music. Try the animal and nature sounds too!' });
  const shell = document.createElement('div'); shell.className = 'game-shell';
  shell.innerHTML = `
    <h2 style="text-align:center">🎹 Friendly Piano</h2>
    <div class="piano" id="piano"></div>
    <h2 style="text-align:center">🥁 Drums</h2>
    <div class="drum-row" id="drum-row"></div>
    <h2 style="text-align:center">🎼 Xylophone</h2>
    <div class="xylo-row" id="xylo-row"></div>
    <h2 style="text-align:center">🐾 Animal &amp; Nature Sounds</h2>
    <div class="sound-buttons" id="sound-buttons"></div>`;
  mount.appendChild(shell);

  let musicRewarded = false;
  function rewardFirstPlay(){
    if(musicRewarded) return; musicRewarded = true;
    grantReward({ stars:1, coins:1, activityId:'music', badgeId:'badge_music' });
  }

  const colors = ['#FF9AA2','#FFD66B','#B6ECD2','#AEE1F9','#C9B6E4','#FF9FB2','#FFB5A7','#A0E7E5'];
  const notes = [{n:'C',f:261.6},{n:'D',f:293.7},{n:'E',f:329.6},{n:'F',f:349.2},{n:'G',f:392.0},{n:'A',f:440.0},{n:'B',f:493.9},{n:'C2',f:523.3}];
  const piano = shell.querySelector('#piano');
  notes.forEach((note,i)=>{
    const key = document.createElement('button');
    key.className = 'piano-key'; key.textContent = note.n.replace('2','');
    key.style.background = colors[i % colors.length];
    key.setAttribute('aria-label', `Play note ${note.n}`);
    key.addEventListener('click', ()=>{ AudioEngine.piano(note.f); key.classList.add('active-key'); setTimeout(()=>key.classList.remove('active-key'),150); rewardFirstPlay(); });
    piano.appendChild(key);
  });

  const drumRow = shell.querySelector('#drum-row');
  ['🥁 Snare','🪘 Tom','🥁 Bass'].forEach(label=>{
    const btn = document.createElement('button'); btn.className = 'drum-pad'; btn.textContent = label;
    btn.addEventListener('click', ()=>{ AudioEngine.drum(); btn.classList.add('active-key'); setTimeout(()=>btn.classList.remove('active-key'),150); rewardFirstPlay(); });
    drumRow.appendChild(btn);
  });

  const xyloRow = shell.querySelector('#xylo-row');
  [392,440,523.3,587.3,659.3,784].forEach((f,i)=>{
    const bar = document.createElement('button'); bar.className = 'xylo-bar'; bar.style.background = colors[i % colors.length];
    bar.setAttribute('aria-label','Xylophone bar');
    bar.addEventListener('click', ()=>{ AudioEngine.xylophone(f); bar.classList.add('active-key'); setTimeout(()=>bar.classList.remove('active-key'),150); rewardFirstPlay(); });
    xyloRow.appendChild(bar);
  });

  const sounds = [
    {label:'Dog', emoji:'🐶', fn:()=>AudioEngine.animal('dog')}, {label:'Cat', emoji:'🐱', fn:()=>AudioEngine.animal('cat')},
    {label:'Cow', emoji:'🐮', fn:()=>AudioEngine.animal('cow')}, {label:'Bird', emoji:'🐦', fn:()=>AudioEngine.animal('bird')},
    {label:'Duck', emoji:'🦆', fn:()=>AudioEngine.animal('duck')}, {label:'Melody', emoji:'🎶', fn:()=>AudioEngine.victory()}
  ];
  const soundBtns = shell.querySelector('#sound-buttons');
  sounds.forEach(s=>{
    const btn = document.createElement('button');
    btn.innerHTML = `${s.emoji}<br><span style="font-size:.9rem">${s.label}</span>`;
    btn.setAttribute('aria-label', s.label); btn.addEventListener('click', s.fn);
    soundBtns.appendChild(btn);
  });
}

function renderDrawing(mount){
  mount.innerHTML = '';
  renderGameChrome(mount, { instructions:'Pick a brush and color, then draw on the canvas. Try stickers, glitter and glow brushes for extra magic!' });
  const shell = document.createElement('div'); shell.className = 'game-shell';
  shell.innerHTML = `
    <div class="drawing-toolbar" role="group" aria-label="Drawing tools">
      <span id="swatches" style="display:flex; gap:8px;"></span>
      <input type="color" id="color-picker" value="#FF6B81" aria-label="Custom color picker">
      <label>Brush: <input type="range" id="brush-size" min="2" max="40" value="10" aria-label="Brush size"></label>
      <select id="brush-type" aria-label="Brush type">
        <option value="normal">🖌️ Normal</option>
        <option value="rainbow">🌈 Rainbow</option>
        <option value="glitter">✨ Glitter</option>
        <option value="glow">💫 Glow</option>
      </select>
      <button id="btn-eraser" aria-pressed="false">🧽 Eraser</button>
      <button id="btn-undo">↩ Undo</button>
      <button id="btn-redo">↪ Redo</button>
      <button id="btn-clear">🗑 Clear</button>
      <button id="btn-save">💾 Save</button>
    </div>
    <div class="drawing-extra-row" role="group" aria-label="Stickers and backgrounds">
      <span id="stickers" style="display:flex; gap:6px;"></span>
      <span id="bg-templates" style="display:flex; gap:6px;"></span>
    </div>
    <canvas id="drawing-canvas" width="800" height="500" aria-label="Drawing canvas"></canvas>`;
  mount.appendChild(shell);

  const canvas = shell.querySelector('#drawing-canvas');
  const ctx2d = canvas.getContext('2d');
  ctx2d.fillStyle = '#fff'; ctx2d.fillRect(0,0,canvas.width, canvas.height);
  let drawing=false, color='#FF6B81', size=10, erasing=false, brushType='normal', hue=0;
  const undoStack = []; const redoStack = [];

  function saveSnapshot(){ undoStack.push(canvas.toDataURL()); if(undoStack.length>25) undoStack.shift(); redoStack.length = 0; }
  function restore(dataUrl){ const img = new Image(); img.src = dataUrl; img.onload = ()=> { ctx2d.clearRect(0,0,canvas.width,canvas.height); ctx2d.drawImage(img,0,0,canvas.width,canvas.height); }; }
  saveSnapshot();

  const colors = ['#FF6B81','#FFC15E','#7FD79A','#6FA8DC','#C9A0FF','#FF9FB2','#4A3F6B','#FFFFFF'];
  const swatchWrap = shell.querySelector('#swatches');
  colors.forEach((c,i)=>{
    const sw = document.createElement('button'); sw.className = 'color-swatch' + (i===0?' active':'');
    sw.style.background = c; sw.setAttribute('aria-label', `Color ${c}`);
    sw.addEventListener('click', ()=>{ color=c; erasing=false; shell.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active')); sw.classList.add('active'); shell.querySelector('#btn-eraser').setAttribute('aria-pressed','false'); });
    swatchWrap.appendChild(sw);
  });
  shell.querySelector('#color-picker').addEventListener('input', e=>{ color = e.target.value; erasing=false; });
  shell.querySelector('#brush-size').addEventListener('input', e=> size = parseInt(e.target.value,10));
  shell.querySelector('#brush-type').addEventListener('change', e=> brushType = e.target.value);
  shell.querySelector('#btn-eraser').addEventListener('click', (e)=>{ erasing = !erasing; e.target.setAttribute('aria-pressed', String(erasing)); });
  shell.querySelector('#btn-clear').addEventListener('click', ()=>{ ctx2d.fillStyle='#fff'; ctx2d.fillRect(0,0,canvas.width,canvas.height); saveSnapshot(); });
  shell.querySelector('#btn-undo').addEventListener('click', ()=>{ if(undoStack.length>1){ redoStack.push(undoStack.pop()); restore(undoStack[undoStack.length-1]); } });
  shell.querySelector('#btn-redo').addEventListener('click', ()=>{ if(redoStack.length){ const d = redoStack.pop(); undoStack.push(d); restore(d); } });
  shell.querySelector('#btn-save').addEventListener('click', ()=>{
    state.drawing = canvas.toDataURL(); saveState();
    const link = document.createElement('a'); link.download = 'my-magic-drawing.png'; link.href = canvas.toDataURL(); link.click();
    grantReward({ stars:2, coins:1, activityId:'drawing', badgeId:'badge_artist' });
    showToast('🎨 Your masterpiece is saved and downloaded!');
  });

  // Stickers (emoji stamps)
  const stickerWrap = shell.querySelector('#stickers');
  let pendingSticker = null;
  ['🐻','🌟','🦋','🌈','🎈','❤️'].forEach(sticker=>{
    const btn = document.createElement('button'); btn.textContent = sticker; btn.setAttribute('aria-label', `Stamp ${sticker}`);
    btn.addEventListener('click', ()=>{ pendingSticker = sticker; showToast('Tap the canvas to place your sticker! ' + sticker); });
    stickerWrap.appendChild(btn);
  });

  // Background templates
  const bgWrap = shell.querySelector('#bg-templates');
  const templates = [
    { label:'⬜ Plain', fn:()=>{ ctx2d.fillStyle='#fff'; ctx2d.fillRect(0,0,canvas.width,canvas.height); } },
    { label:'🟦 Sky', fn:()=>{ const g=ctx2d.createLinearGradient(0,0,0,canvas.height); g.addColorStop(0,'#AEE1F9'); g.addColorStop(1,'#EAF6FF'); ctx2d.fillStyle=g; ctx2d.fillRect(0,0,canvas.width,canvas.height); } },
    { label:'🌈 Party', fn:()=>{ const g=ctx2d.createLinearGradient(0,0,canvas.width,0); ['#FF9AA2','#FFD66B','#B6ECD2','#AEE1F9','#C9B6E4'].forEach((c,i,arr)=>g.addColorStop(i/(arr.length-1), c)); ctx2d.fillStyle=g; ctx2d.fillRect(0,0,canvas.width,canvas.height); } }
  ];
  templates.forEach(t=>{
    const btn = document.createElement('button'); btn.textContent = t.label;
    btn.addEventListener('click', ()=>{ t.fn(); saveSnapshot(); });
    bgWrap.appendChild(btn);
  });

  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX-rect.left) * (canvas.width/rect.width), y: (clientY-rect.top) * (canvas.height/rect.height) };
  }
  function startDraw(e){
    const p = getPos(e);
    if(pendingSticker){ ctx2d.font = '48px sans-serif'; ctx2d.fillText(pendingSticker, p.x-24, p.y+16); pendingSticker=null; saveSnapshot(); return; }
    drawing = true; ctx2d.beginPath(); ctx2d.moveTo(p.x,p.y);
  }
  function draw(e){
    if(!drawing) return;
    const p = getPos(e);
    ctx2d.lineCap = 'round'; ctx2d.lineWidth = size; ctx2d.shadowBlur = 0;
    if(erasing){ ctx2d.strokeStyle = '#ffffff'; }
    else if(brushType === 'rainbow'){ hue = (hue+4)%360; ctx2d.strokeStyle = `hsl(${hue},80%,60%)`; }
    else if(brushType === 'glitter'){
      ctx2d.strokeStyle = color;
      for(let i=0;i<3;i++){ ctx2d.fillStyle = `hsl(${Math.random()*360},90%,70%)`; ctx2d.beginPath(); ctx2d.arc(p.x+(Math.random()-0.5)*size*2, p.y+(Math.random()-0.5)*size*2, 1.5, 0, 7); ctx2d.fill(); }
    }
    else if(brushType === 'glow'){ ctx2d.strokeStyle = color; ctx2d.shadowBlur = 18; ctx2d.shadowColor = color; }
    else { ctx2d.strokeStyle = color; }
    ctx2d.lineTo(p.x,p.y); ctx2d.stroke();
  }
  function endDraw(){ if(drawing){ drawing=false; saveSnapshot(); } }

  canvas.addEventListener('pointerdown', startDraw);
  canvas.addEventListener('pointermove', draw);
  window.addEventListener('pointerup', endDraw);
}

/* ---------- Calm Corner ---------- */
function renderCalm(mount){
  mount.innerHTML = '';
  renderGameChrome(mount, { instructions:'Breathe with the circle, pop some bubbles, or play a gentle sound. Take your time — there is no rush here.' });
  const shell = document.createElement('div');
  shell.className = 'calm-shell'; shell.id = 'calm-shell';
  shell.innerHTML = `
    <div class="calm-toggle-row">
      <button id="btn-daynight" aria-pressed="false">🌙 Night Mode</button>
    </div>
    <h2>Let's take a magical breath 🌿</h2>
    <div class="breathing-circle" id="breathe-circle">Breathe In</div>
    <div class="calm-sound-row">
      <button id="btn-ambient" aria-pressed="false">🎶 Gentle Music</button>
      <button data-nature="rain">🌧️ Soft Rain</button>
      <button data-nature="ocean">🌊 Ocean Waves</button>
      <button data-nature="forest">🌲 Forest Sounds</button>
    </div>
    <h3 style="margin-top:26px;">Pop the calming bubbles 🫧</h3>
    <div class="bubble-field" id="bubble-field"></div>
    <h3 style="margin-top:20px;">Meditation stars &amp; floating lanterns ✨🏮</h3>
    <div class="calm-stars" id="calm-stars"></div>`;
  mount.appendChild(shell);

  const circle = shell.querySelector('#breathe-circle');
  let phase = 0; const phases = ['Breathe In','Hold','Breathe Out'];
  const breatheTimer = setInterval(()=>{ phase = (phase+1)%3; circle.textContent = phases[phase]; }, 2666);
  observeUnmount(mount, ()=> { clearInterval(breatheTimer); AudioEngine.stopNature(); AudioEngine.stopAmbient(); });

  shell.querySelector('#btn-daynight').addEventListener('click', (e)=>{
    const isNight = shell.classList.toggle('night-mode');
    e.target.setAttribute('aria-pressed', String(isNight));
    e.target.textContent = isNight ? '☀️ Day Mode' : '🌙 Night Mode';
  });

  const ambientBtn = shell.querySelector('#btn-ambient');
  ambientBtn.addEventListener('click', ()=>{
    const active = ambientBtn.getAttribute('aria-pressed') === 'true';
    if(active){ AudioEngine.stopAmbient(); ambientBtn.setAttribute('aria-pressed','false'); ambientBtn.textContent='🎶 Gentle Music'; }
    else { AudioEngine.startAmbient(); ambientBtn.setAttribute('aria-pressed','true'); ambientBtn.textContent='⏸ Stop Music'; }
  });
  shell.querySelectorAll('[data-nature]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const active = btn.classList.contains('active-key');
      shell.querySelectorAll('[data-nature]').forEach(b=> b.classList.remove('active-key'));
      if(active){ AudioEngine.stopNature(); } else { AudioEngine.startNature(btn.dataset.nature); btn.classList.add('active-key'); }
    });
  });

  const bubbleField = shell.querySelector('#bubble-field');
  let calmRewarded = false;
  const bubbleTimer = setInterval(()=>{
    if(!document.body.contains(bubbleField)) return;
    const bubble = document.createElement('div');
    const s = 24 + Math.random()*46;
    bubble.className = 'bubble'; bubble.style.width = bubble.style.height = s+'px';
    bubble.style.left = Math.random()*90 + '%'; bubble.style.animationDuration = (5+Math.random()*4)+'s';
    bubble.setAttribute('role','button'); bubble.tabIndex = 0; bubble.setAttribute('aria-label','Pop bubble');
    bubble.addEventListener('click', ()=>{
      AudioEngine.pop(); fireStarBurst(bubble.getBoundingClientRect().left, bubble.getBoundingClientRect().top); bubble.remove();
      if(!calmRewarded){ calmRewarded = true; grantReward({ stars:1, coins:1, activityId:'calm', badgeId:'badge_calm' }); }
    });
    bubble.addEventListener('animationend', ()=> bubble.remove());
    bubbleField.appendChild(bubble);
  }, 900);
  observeUnmount(mount, ()=> clearInterval(bubbleTimer));

  const starsField = shell.querySelector('#calm-stars');
  for(let i=0;i<8;i++){
    const s = document.createElement('span'); s.className = 'calm-star'; s.textContent = '✨';
    s.style.left = (Math.random()*95)+'%'; s.style.top = (Math.random()*90)+'%'; s.style.animationDelay = (Math.random()*2)+'s';
    starsField.appendChild(s);
  }
  for(let i=0;i<4;i++){
    const l = document.createElement('span'); l.className = 'calm-lantern'; l.textContent = '🏮';
    l.style.left = (10+Math.random()*80)+'%'; l.style.animationDelay = (Math.random()*4)+'s';
    starsField.appendChild(l);
  }
}
function observeUnmount(mount, cleanup){
  const obs = new MutationObserver(()=>{ if(!document.body.contains(mount)){ cleanup(); obs.disconnect(); } });
  const target = document.getElementById('screen-activity');
  obs.observe(target, { childList:true });
  document.getElementById('btn-activity-back').addEventListener('click', function once(){ cleanup(); }, { once:true });
}

/* ---------- Word Builder (tap letters in order to spell a picture word) ---------- */
function renderWordBuilder(mount){
  mount.innerHTML = '';
  renderGameChrome(mount, { instructions:'Look at the picture, then tap the letters in the right order to spell the word!', onRestart: ()=> start() });
  const shell = document.createElement('div'); shell.className = 'game-shell'; shell.style.textAlign = 'center';
  shell.innerHTML = `
    <p class="game-progress" id="wb-progress"></p>
    <div id="wb-picture" style="font-size:3.4rem; margin:10px 0;"></div>
    <div id="wb-blanks" class="wb-blanks"></div>
    <div id="wb-letters" class="wb-letters"></div>`;
  mount.appendChild(shell);

  const WORD_BANK = [
    {word:'CAT', emoji:'🐱'}, {word:'DOG', emoji:'🐶'}, {word:'SUN', emoji:'☀️'}, {word:'BEE', emoji:'🐝'},
    {word:'PIG', emoji:'🐷'}, {word:'HAT', emoji:'🎩'}, {word:'CUP', emoji:'☕'}, {word:'BUS', emoji:'🚌'}
  ];
  let order, round, filled;
  const progressEl = shell.querySelector('#wb-progress');
  const pictureEl = shell.querySelector('#wb-picture');
  const blanksEl = shell.querySelector('#wb-blanks');
  const lettersEl = shell.querySelector('#wb-letters');

  function start(){ order = [...WORD_BANK].sort(()=> Math.random()-0.5).slice(0,5); round = 0; nextRound(); }

  function nextRound(){
    if(round >= order.length){
      AudioEngine.victory(); celebrationConfetti();
      grantReward({ stars:3, coins:2, activityId:'words', badgeId:'badge_words' });
      shell.innerHTML = `<h2>🎉 Wonderful Words!</h2><p>You built ${order.length} words all by yourself!</p>`;
      return;
    }
    const { word, emoji } = order[round]; round++;
    filled = Array(word.length).fill(null);
    progressEl.textContent = `Word ${round} of ${order.length}`;
    pictureEl.textContent = emoji;
    blanksEl.innerHTML = word.split('').map((_,i)=> `<span class="wb-blank" id="wb-blank-${i}"></span>`).join('');
    const extras = ['A','E','I','O','S','T','R'].filter(l=> !word.includes(l)).sort(()=> Math.random()-0.5).slice(0,2);
    const pool = [...word.split(''), ...extras].sort(()=> Math.random()-0.5);
    lettersEl.innerHTML = '';
    pool.forEach(letter=>{
      const btn = document.createElement('button');
      btn.className = 'diff-btn'; btn.style.fontSize = '1.4rem'; btn.style.minWidth = '54px';
      btn.textContent = letter;
      btn.addEventListener('click', ()=> handleLetter(letter, word, btn));
      lettersEl.appendChild(btn);
    });
  }

  function handleLetter(letter, word, btn){
    const nextIndex = filled.findIndex(f=> f===null);
    if(nextIndex === -1) return;
    if(word[nextIndex] === letter){
      filled[nextIndex] = letter;
      document.getElementById(`wb-blank-${nextIndex}`).textContent = letter;
      btn.disabled = true; btn.style.opacity = '.3';
      feedbackCorrect(btn, btn.getBoundingClientRect().left, btn.getBoundingClientRect().top);
      if(!filled.includes(null)) setTimeout(nextRound, 800);
    } else feedbackIncorrect(btn);
  }
  start();
}

/* ---------- Emotions Corner (match faces to feeling words) ---------- */
function renderEmotions(mount){
  const data = [
    {id:'happy', emoji:'😀', label:'Happy'}, {id:'sad', emoji:'😢', label:'Sad'},
    {id:'angry', emoji:'😠', label:'Angry'}, {id:'surprised', emoji:'😲', label:'Surprised'},
    {id:'sleepy', emoji:'😴', label:'Sleepy'}, {id:'excited', emoji:'🤩', label:'Excited'}
  ];
  createPlacementGame({
    mountEl: mount,
    poolItems: data.map(d=>({id:d.id, emoji:d.emoji, label:d.label})),
    slots: data.map(d=>({id:d.id, matchId:d.id, label:d.label})),
    activityId:'emotions', badgeId:'badge_emotions',
    instructions:'Drag each face to the word that describes how it feels!'
  });
}

/* ---------- Opposites (match every word to its opposite) ---------- */
function renderOpposites(mount){
  const pairs = [
    {id:'hot', word:'Hot', opp:'Cold'}, {id:'big', word:'Big', opp:'Small'},
    {id:'up', word:'Up', opp:'Down'}, {id:'fast', word:'Fast', opp:'Slow'},
    {id:'day', word:'Day', opp:'Night'}
  ];
  createPlacementGame({
    mountEl: mount,
    poolItems: pairs.map(p=>({id:p.id, emoji:'🔤', label:p.word})),
    slots: pairs.map(p=>({id:p.id, matchId:p.id, label:p.opp})),
    activityId:'opposites', badgeId:'badge_opposites',
    instructions:'Drag each word to its opposite meaning!'
  });
}

/* ---------- Simon Says (watch the pattern, then repeat it) ---------- */
function renderSimon(mount){
  mount.innerHTML = '';
  let startGame; // forward reference for restart button
  renderGameChrome(mount, { instructions:'Watch the pads light up, then tap them in the very same order!', onRestart: ()=> startGame() });
  const shell = document.createElement('div'); shell.className = 'game-shell'; shell.style.textAlign = 'center';
  shell.innerHTML = `
    <p class="game-progress" id="simon-progress">Tap "Start Pattern" to begin!</p>
    <div class="simon-grid" id="simon-grid"></div>
    <button id="simon-start" class="btn-play" style="max-width:220px; margin:18px auto 0; display:block;">▶ Start Pattern</button>`;
  mount.appendChild(shell);

  const PADS = [
    { color:'#FF9AA2', freq:392 }, { color:'#FFD66B', freq:440 },
    { color:'#B6ECD2', freq:523.3 }, { color:'#AEE1F9', freq:587.3 }
  ];
  const gridEl = shell.querySelector('#simon-grid');
  PADS.forEach((p,i)=>{
    const pad = document.createElement('button');
    pad.className = 'simon-pad'; pad.style.background = p.color;
    pad.setAttribute('aria-label', `Pattern pad ${i+1}`);
    pad.addEventListener('click', ()=> handlePadClick(i));
    gridEl.appendChild(pad);
  });

  const progressEl = shell.querySelector('#simon-progress');
  const startBtn = shell.querySelector('#simon-start');
  const TARGET = 6;
  let sequence = [], userStep = 0, accepting = false;

  startGame = function(){ sequence = []; startBtn.textContent = '▶ Watch Again'; addStep(); };
  function addStep(){
    sequence.push(Math.floor(Math.random()*PADS.length));
    userStep = 0;
    progressEl.textContent = `Round ${sequence.length} of ${TARGET} — watch closely!`;
    playSequence();
  }
  function playSequence(){
    accepting = false;
    sequence.forEach((id, i)=> setTimeout(()=> lightPad(id), i*700));
    setTimeout(()=>{ accepting = true; progressEl.textContent = `Round ${sequence.length} of ${TARGET} — your turn!`; }, sequence.length*700);
  }
  function lightPad(id){
    const pad = gridEl.children[id];
    AudioEngine.xylophone(PADS[id].freq);
    pad.classList.add('active-key');
    setTimeout(()=> pad.classList.remove('active-key'), 380);
  }
  function handlePadClick(id){
    if(!accepting) return;
    lightPad(id);
    if(sequence[userStep] === id){
      userStep++;
      if(userStep === sequence.length){
        accepting = false;
        feedbackCorrect(gridEl, window.innerWidth/2, window.innerHeight/2);
        if(sequence.length >= TARGET){
          setTimeout(()=>{
            AudioEngine.victory(); celebrationConfetti();
            grantReward({ stars:4, coins:3, activityId:'simon', badgeId:'badge_simon' });
            shell.innerHTML = `<h2>🎉 Amazing Memory!</h2><p>You remembered a pattern of ${TARGET} in a row!</p>`;
          }, 500);
        } else setTimeout(addStep, 900);
      }
    } else {
      accepting = false;
      feedbackIncorrect(gridEl);
      showToast("Let's watch it once more! 👀");
      setTimeout(playSequence, 900);
    }
  }
  startBtn.addEventListener('click', startGame);
}

/* ---------- 13) REWARDS / ACHIEVEMENTS ---------- */
const BADGES = [
  {id:'badge_abc', name:'Alphabet Star', emoji:'🔤'}, {id:'badge_numbers', name:'Number Whiz', emoji:'🔢'},
  {id:'badge_shapes', name:'Shape Master', emoji:'🔺'}, {id:'badge_colors', name:'Color Wizard', emoji:'🎨'},
  {id:'badge_memory', name:'Memory Master', emoji:'🧠'}, {id:'badge_puzzle', name:'Puzzle Pro', emoji:'🧩'},
  {id:'badge_matching', name:'Animal Friend', emoji:'🐣'}, {id:'badge_artist', name:'Little Artist', emoji:'🖍️'},
  {id:'badge_music', name:'Music Maker', emoji:'🎹'}, {id:'badge_calm', name:'Calm Champion', emoji:'🫧'},
  {id:'badge_words', name:'Word Builder', emoji:'🧱'}, {id:'badge_emotions', name:'Feelings Friend', emoji:'🥰'},
  {id:'badge_opposites', name:'Opposite Ace', emoji:'⚖️'}, {id:'badge_simon', name:'Pattern Pro', emoji:'🎯'}
];
const ACHIEVEMENTS = [
  {id:'ach_first_star', name:'First Star', emoji:'⭐', desc:'Earn your first star', target:1, progress:s=>s.stars, check:s=>s.stars>=1},
  {id:'ach_10_stars', name:'Star Collector', emoji:'🌟', desc:'Earn 10 stars', target:10, progress:s=>s.stars, check:s=>s.stars>=10},
  {id:'ach_50_coins', name:'Coin Champion', emoji:'🪙', desc:'Earn 50 coins', target:50, progress:s=>s.coins, check:s=>s.coins>=50},
  {id:'ach_level5', name:'Rising Explorer', emoji:'🚀', desc:'Reach level 5', target:5, progress:s=>s.level, check:s=>s.level>=5},
  {id:'ach_all_badges', name:'Badge Master', emoji:'🎖️', desc:'Unlock every badge', target:BADGES.length, progress:s=>s.badges.length, check:s=>BADGES.every(b=>s.badges.includes(b.id))},
  {id:'ach_5_activities', name:'Curious Mind', emoji:'🔍', desc:'Try 5 different activities', target:5, progress:s=>Object.keys(s.activityCompletions).length, check:s=>Object.keys(s.activityCompletions).length>=5}
];

function unlockBadge(id){
  if(!state.badges.includes(id)){
    state.badges.push(id);
    const badge = BADGES.find(b=>b.id===id);
    if(badge){ showToast(`🎖️ New badge unlocked: ${badge.name}!`); pushNotification(`🎖️ Unlocked badge: ${badge.name}`); }
  }
}
function checkAchievements(){
  ACHIEVEMENTS.forEach(a=>{
    if(!state.achievements.includes(a.id) && a.check(state)){
      state.achievements.push(a.id);
      showToast(`🏆 Achievement unlocked: ${a.name}!`);
      pushNotification(`🏆 Achievement unlocked: ${a.name}`);
      celebrationConfetti(); AudioEngine.celebration();
    }
  });
  saveState();
}

function renderRewards(mount){
  mount.innerHTML = `
    <div class="game-shell">
      <h2 style="text-align:center">🎁 Your Stickers &amp; Trophies</h2>
      <p style="text-align:center; color:var(--ink-soft); font-weight:700;">Complete activities to unlock more!</p>
      <div class="rewards-grid" id="rewards-grid"></div>
    </div>`;
  const grid = mount.querySelector('#rewards-grid');
  BADGES.forEach(b=>{
    const unlocked = state.badges.includes(b.id);
    const el = document.createElement('div');
    el.className = 'badge-item' + (unlocked?' unlocked':'');
    el.innerHTML = `<span class="badge-emoji">${b.emoji}</span><span class="badge-name">${b.name}</span>`;
    el.setAttribute('aria-label', `${b.name}: ${unlocked?'unlocked':'locked'}`);
    grid.appendChild(el);
  });
}

function renderAchievements(mount){
  const overallPct = Math.round((state.achievements.length / ACHIEVEMENTS.length) * 100);
  mount.innerHTML = `
    <div class="game-shell">
      <h2 style="text-align:center">🏆 Achievements</h2>
      <div class="card-progress-wrap" style="max-width:400px; margin:0 auto 24px;">
        <div class="card-progress-bar"><div class="card-progress-fill" style="width:${overallPct}%"></div></div>
        <div class="card-progress-label">${overallPct}% complete overall</div>
      </div>
      <div class="rewards-grid" id="ach-grid"></div>
    </div>`;
  const grid = mount.querySelector('#ach-grid');
  ACHIEVEMENTS.forEach(a=>{
    const unlocked = state.achievements.includes(a.id);
    const val = Math.min(a.target, a.progress(state));
    const pct = Math.round((val/a.target)*100);
    const el = document.createElement('div');
    el.className = 'badge-item' + (unlocked?' unlocked':'');
    el.innerHTML = `<span class="badge-emoji">${a.emoji}</span><span class="badge-name">${a.name}</span>
      <p style="font-size:.8rem; margin:6px 0 4px; color:var(--ink-soft);">${a.desc}</p>
      <div class="card-progress-bar" style="height:8px;"><div class="card-progress-fill" style="width:${pct}%"></div></div>
      <p style="font-size:.72rem; margin:4px 0 0; color:var(--ink-soft);">${val}/${a.target}</p>`;
    grid.appendChild(el);
  });
}

/* ---------- 14) PROFILE ---------- */
function openProfile(){
  document.getElementById('profile-name-input').value = state.profile.name;
  initAvatarBuilder();
  refreshProfileStats();
  showScreen('screen-profile');
}
document.getElementById('profile-name-input').addEventListener('input', e=>{
  state.profile.name = e.target.value.trim() || 'Explorer';
  saveState();
});

function refreshProfileStats(){
  document.getElementById('profile-level').textContent = state.level;
  document.getElementById('profile-stars').textContent = state.stars;
  document.getElementById('profile-coins').textContent = state.coins;
  document.getElementById('profile-badges').textContent = state.badges.length;
  document.getElementById('profile-trophies').textContent = state.achievements.length;
  document.getElementById('profile-xp-fill').style.width = (state.xp % 100) + '%';
}

/* ---------- 15) BOOT SEQUENCE ---------- */
function boot(){
  applySettingsToDOM();
  updateToolbarUI();
  initToolbar();
  initLanding();

  const fill = document.getElementById('loading-bar-fill');
  let pct = 0;
  const iv = setInterval(()=>{
    pct += Math.random()*22 + 8;
    if(pct >= 100){ pct = 100; clearInterval(iv);
      setTimeout(()=> document.getElementById('loading-screen').classList.add('hidden'), 250);
    }
    fill.style.width = pct + '%';
  }, 180);
}

document.addEventListener('DOMContentLoaded', boot);

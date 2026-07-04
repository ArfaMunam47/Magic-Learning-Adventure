'use strict';
/* =========================================================================
   MAGIC LEARNING ADVENTURE — script.js
   Sections: 1) State/Storage 2) Audio Engine 3) Confetti/Particles
   4) Screen Navigation 5) Toolbar & Accessibility 6) Landing Page
   7) Dashboard 8) Generic Placement-Game Engine 9) Individual Games
   10) Rewards / Achievements 11) Profile 12) Boot sequence
   ========================================================================= */

/* ---------- 1) STATE / STORAGE ---------- */
const STORAGE_KEY = 'mla_state_v1';

// Fallback for browsers without structuredClone (older Safari/mobile browsers)
if(typeof structuredClone !== 'function'){
  window.structuredClone = obj => JSON.parse(JSON.stringify(obj));
}

const DEFAULT_STATE = {
  profile: { name: 'Explorer', avatar: '🐻' },
  stars: 0, coins: 0, xp: 0, level: 1,
  badges: [],          // unlocked badge/sticker/trophy ids
  achievements: [],    // unlocked achievement ids
  activityCompletions: {}, // { abc: 3, numbers: 1, ... }
  settings: { theme: 'light', dyslexia: false, muted: false },
  drawing: null
};

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULT_STATE), parsed, {
      profile: Object.assign({}, DEFAULT_STATE.profile, parsed.profile),
      settings: Object.assign({}, DEFAULT_STATE.settings, parsed.settings)
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
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type; osc.frequency.value = freq;
    osc.connect(gain); gain.connect(c.destination);
    const t0 = c.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0); osc.stop(t0 + duration + 0.05);
  }

  function noiseBurst(start, duration, filterFreq=1200, peakGain=0.12){
    const c = ensureCtx(); if(!c || isMuted()) return;
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1);
    const src = c.createBufferSource(); src.buffer = buffer;
    const filter = c.createBiquadFilter(); filter.type='bandpass'; filter.frequency.value = filterFreq;
    const gain = c.createGain();
    const t0 = c.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0+0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t0+duration);
    src.connect(filter); filter.connect(gain); gain.connect(c.destination);
    src.start(t0); src.stop(t0+duration+0.05);
  }

  return {
    unlock(){ ensureCtx(); },
    click(){ tone(520, 0, 0.09, 'triangle', 0.12); },
    correct(){ [523,659,784].forEach((f,i)=> tone(f, i*0.09, 0.28, 'sine', 0.2)); },
    incorrect(){ tone(300, 0, 0.22, 'sine', 0.1); tone(230, 0.1, 0.28, 'sine', 0.09); },
    victory(){ [523,659,784,1046].forEach((f,i)=> tone(f, i*0.11, 0.35, 'triangle', 0.2)); noiseBurst(0.3, 0.3, 3000, 0.05); },
    celebration(){ this.victory(); [1200,1500,1800,2100].forEach((f,i)=> tone(f, 0.4+i*0.07, 0.15, 'sine', 0.08)); },
    piano(freq){ tone(freq, 0, 0.9, 'triangle', 0.22); },
    pop(){ tone(700, 0, 0.12, 'sine', 0.15); },
    whoosh(){ noiseBurst(0, 0.4, 800, 0.06); },
    animal(kind){
      const map = {
        dog:[220,180], cat:[600,900], cow:[130,110], bird:[1400,1900,1400], duck:[500,400]
      };
      const seq = map[kind] || [440];
      seq.forEach((f,i)=> tone(f, i*0.12, 0.22, 'square', 0.12));
    },
    startAmbient(){
      const c = ensureCtx(); if(!c || isMuted() || ambientNodes) return;
      const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o1.type='sine'; o2.type='sine'; o1.frequency.value=196; o2.frequency.value=246.9;
      g.gain.value = 0.035;
      o1.connect(g); o2.connect(g); g.connect(c.destination);
      o1.start(); o2.start();
      ambientNodes = {o1,o2,g};
    },
    stopAmbient(){
      if(ambientNodes){ try{ ambientNodes.o1.stop(); ambientNodes.o2.stop(); }catch(e){} ambientNodes=null; }
    }
  };
})();

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
      vx: (Math.random()-0.5) * 8,
      vy: -(Math.random()*8 + 4),
      g: 0.28,
      size: shape==='coin' ? 14 : (shape==='star' ? 16 : 8),
      rot: Math.random()*Math.PI*2,
      vr: (Math.random()-0.5)*0.3,
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
}

let confettiRAF = null;
function confettiLoop(){
  cctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
  particles.forEach(p=>{
    p.vy += p.g*0.15; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
    cctx.save();
    cctx.translate(p.x, p.y); cctx.rotate(p.rot); cctx.globalAlpha = Math.max(p.life/100, 0);
    if(p.shape === 'star'){
      cctx.font = `${p.size}px sans-serif`; cctx.fillText('⭐', -p.size/2, p.size/2);
    } else if(p.shape === 'coin'){
      cctx.font = `${p.size}px sans-serif`; cctx.fillText('🪙', -p.size/2, p.size/2);
    } else {
      cctx.fillStyle = p.color; cctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
    }
    cctx.restore();
  });
  particles = particles.filter(p => p.life > 0 && p.y < confettiCanvas.height + 50);
  if(particles.length){ confettiRAF = requestAnimationFrame(confettiLoop); }
  else { confettiRAF = null; cctx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height); }
}

/* ---------- Toast + Mascot messages ---------- */
const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(message){
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toastEl.classList.remove('show'), 2600);
}

const ENCOURAGEMENTS = [
  "So close! Let's try again! 🌟", "Great try! You can do it! 💪",
  "Almost there, keep going! ✨", "Nice try, friend! One more time! 🐻",
  "You're learning — that's magic! 🪄", "Oops! Try another one! 🌈"
];
const PRAISES = [
  "Wonderful job! 🎉", "You did it! ⭐", "Amazing work! 🪄",
  "Super star! 🌟", "You're on fire! 🔥", "Fantastic! 🎈", "Yay! Great job! 🎊"
];
function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

const DAILY_QUOTES = [
  "Every small step is a giant magical leap. ✨",
  "You are brave, you are kind, you are learning! 🌈",
  "Mistakes are just magic still in progress. 🪄",
  "Today is a wonderful day to grow. 🌱",
  "Your smile makes the whole kingdom brighter. 😊",
  "Keep going — the stars are cheering for you! ⭐",
  "Learning is an adventure, and you're the hero. 🦸",
  "One page, one puzzle, one smile at a time. 📖"
];

/* ---------- 4) SCREEN NAVIGATION ---------- */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const heading = target.querySelector('h1');
  if(heading){ heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); }
}

/* ---------- 5) TOOLBAR & ACCESSIBILITY CONTROLS ---------- */
function applySettingsToDOM(){
  document.body.dataset.theme = state.settings.theme;
  document.body.dataset.dyslexia = state.settings.dyslexia ? 'on' : 'off';
  document.getElementById('btn-contrast').setAttribute('aria-pressed', state.settings.theme === 'contrast');
  document.getElementById('btn-dyslexia').setAttribute('aria-pressed', String(state.settings.dyslexia));
  document.getElementById('btn-mute').setAttribute('aria-pressed', String(state.settings.muted));
  document.getElementById('btn-mute').textContent = state.settings.muted ? '🔇' : '🔊';
}

function initToolbar(){
  document.getElementById('btn-home').addEventListener('click', ()=>{ AudioEngine.click(); showScreen('screen-landing'); });
  document.getElementById('btn-profile').addEventListener('click', ()=>{ AudioEngine.click(); openProfile(); });

  document.getElementById('btn-mute').addEventListener('click', ()=>{
    state.settings.muted = !state.settings.muted;
    if(state.settings.muted) AudioEngine.stopAmbient();
    saveState(); applySettingsToDOM();
  });

  document.getElementById('btn-contrast').addEventListener('click', ()=>{
    AudioEngine.click();
    state.settings.theme = state.settings.theme === 'contrast' ? 'light' : 'contrast';
    saveState(); applySettingsToDOM();
  });

  document.getElementById('btn-dyslexia').addEventListener('click', ()=>{
    AudioEngine.click();
    state.settings.dyslexia = !state.settings.dyslexia;
    saveState(); applySettingsToDOM();
  });

  document.getElementById('btn-fullscreen').addEventListener('click', ()=>{
    AudioEngine.click();
    if(!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.();
  });

  // Unlock audio context on first interaction anywhere (required by browsers)
  document.addEventListener('pointerdown', ()=> AudioEngine.unlock(), { once:true });

  // Global button click sound (delegated) for that "magic" tactile feedback
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(btn && !btn.dataset.silent) AudioEngine.click();
    addRippleEffect(e);
  });
}

function addRippleEffect(e){
  const btn = e.target.closest('.btn-start, .dashboard-card, .feature-card');
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

/* ---------- 6) LANDING PAGE ---------- */
function initLanding(){
  document.getElementById('btn-start-adventure').addEventListener('click', ()=>{
    renderDashboard();
    showScreen('screen-dashboard');
  });
  const dayIndex = Math.floor(Date.now() / 86400000) % DAILY_QUOTES.length;
  document.getElementById('daily-quote').textContent = '💭 ' + DAILY_QUOTES[dayIndex];
}

/* ---------- 7) DASHBOARD ---------- */
const ACTIVITIES = [
  { id:'abc', title:'ABC Learning', emoji:'🔤', desc:'Match letters to their pictures.' },
  { id:'numbers', title:'Numbers', emoji:'🔢', desc:'Count and tap the right number.' },
  { id:'shapes', title:'Shapes', emoji:'🔺', desc:'Fit shapes into their outlines.' },
  { id:'colors', title:'Colors', emoji:'🎨', desc:'Match color names to splashes.' },
  { id:'memory', title:'Memory Game', emoji:'🧠', desc:'Flip cards and find the pairs.' },
  { id:'puzzle', title:'Puzzle', emoji:'🧩', desc:'Build a happy little picture.' },
  { id:'matching', title:'Matching Game', emoji:'🐣', desc:'Match baby animals to parents.' },
  { id:'music', title:'Music Corner', emoji:'🎹', desc:'Play piano and fun sounds.' },
  { id:'drawing', title:'Drawing Pad', emoji:'🖍️', desc:'Draw and paint anything!' },
  { id:'rewards', title:'Reward Room', emoji:'🎁', desc:'See your stickers and trophies.' },
  { id:'calm', title:'Calm Corner', emoji:'🫧', desc:'Breathe, pop bubbles, relax.' },
  { id:'achievements', title:'Achievements', emoji:'🏆', desc:'Track your magical milestones.' }
];

function renderDashboard(){
  document.getElementById('dashboard-name').textContent = state.profile.name || 'Explorer';
  const grid = document.getElementById('dashboard-grid');
  grid.innerHTML = '';
  ACTIVITIES.forEach(a=>{
    const card = document.createElement('button');
    card.className = 'dashboard-card';
    card.setAttribute('role','listitem');
    card.setAttribute('aria-label', `${a.title}: ${a.desc}`);
    card.innerHTML = `<div class="card-glow"></div><span class="card-emoji" aria-hidden="true">${a.emoji}</span><h3>${a.title}</h3><p>${a.desc}</p>`;
    card.addEventListener('click', ()=> openActivity(a.id));
    grid.appendChild(card);
  });
  updateToolbarUI();
}

function openActivity(id){
  const meta = ACTIVITIES.find(a=>a.id===id);
  document.getElementById('activity-title').textContent = `${meta.emoji} ${meta.title}`;
  showScreen('screen-activity');
  const content = document.getElementById('activity-content');
  content.innerHTML = '';
  GAME_RENDERERS[id](content);
}
document.getElementById('btn-activity-back').addEventListener('click', ()=>{ AudioEngine.stopAmbient(); renderDashboard(); showScreen('screen-dashboard'); });
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
  document.getElementById('toolbar-avatar').textContent = state.profile.avatar;
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

/* ---------- 8) GENERIC PLACEMENT-GAME ENGINE (drag + keyboard accessible) ----------
   Used by: ABC, Shapes, Colors, Matching(animals), Puzzle.
   poolItems: [{id, emoji, label}]
   slots:     [{id, label, matchId}]           matchId === poolItems[i].id
------------------------------------------------------------------------- */
function createPlacementGame({ mountEl, poolItems, slots, slotGridStyle, onAllComplete, activityId, badgeId }){
  mountEl.innerHTML = `
    <div class="game-shell">
      <p class="game-progress" id="pg-progress">0 / ${slots.length} matched</p>
      <div class="match-board">
        <div>
          <div class="drop-pool" id="pg-slots" style="${slotGridStyle||''}"></div>
        </div>
        <div class="drag-pool" id="pg-pool"></div>
      </div>
    </div>`;
  const poolEl = mountEl.querySelector('#pg-pool');
  const slotsEl = mountEl.querySelector('#pg-slots');
  const progressEl = mountEl.querySelector('#pg-progress');
  let matchedCount = 0;
  let selectedChip = null;

  const shuffledPool = [...poolItems].sort(()=> Math.random()-0.5);

  shuffledPool.forEach(item=>{
    const chip = document.createElement('div');
    chip.className = 'drag-chip';
    chip.tabIndex = 0;
    chip.setAttribute('role','button');
    chip.setAttribute('draggable','true');
    chip.dataset.id = item.id;
    chip.setAttribute('aria-label', `${item.label}, draggable item`);
    chip.innerHTML = `<span aria-hidden="true">${item.emoji}</span><span class="chip-label">${item.label}</span>`;
    poolEl.appendChild(chip);

    chip.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', item.id); chip.classList.add('dragging'); });
    chip.addEventListener('dragend', ()=> chip.classList.remove('dragging'));
    chip.addEventListener('click', ()=> selectChip(chip));
    chip.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); selectChip(chip);} });
  });

  function selectChip(chip){
    if(chip.classList.contains('placed')) return;
    if(selectedChip) selectedChip.style.outline='';
    selectedChip = chip;
    chip.style.outline = '4px solid #3F6FE0';
  }

  const shuffledSlots = [...slots].sort(()=> Math.random()-0.5);
  shuffledSlots.forEach(slot=>{
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.tabIndex = 0;
    zone.setAttribute('role','button');
    zone.dataset.match = slot.matchId;
    zone.setAttribute('aria-label', `Drop zone for ${slot.label}`);
    zone.innerHTML = `<span class="drop-zone-emoji" aria-hidden="true">${slot.emoji||'❔'}</span><span class="chip-label">${slot.label}</span>`;
    slotsEl.appendChild(zone);

    zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()=> zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e=>{
      e.preventDefault(); zone.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const chip = poolEl.querySelector(`.drag-chip[data-id="${CSS.escape(id)}"]`);
      attemptPlacement(chip, zone);
    });
    zone.addEventListener('click', ()=>{ if(selectedChip) attemptPlacement(selectedChip, zone); });
    zone.addEventListener('keydown', e=>{ if((e.key==='Enter'||e.key===' ') && selectedChip){ e.preventDefault(); attemptPlacement(selectedChip, zone); } });
  });

  function attemptPlacement(chip, zone){
    if(!chip || zone.classList.contains('filled')) return;
    const rect = zone.getBoundingClientRect();
    if(chip.dataset.id === zone.dataset.match){
      zone.classList.add('filled');
      const item = poolItems.find(p=>p.id===chip.dataset.id);
      zone.querySelector('.drop-zone-emoji').textContent = item.emoji;
      chip.classList.add('placed');
      chip.style.display = 'none';
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
    } else {
      feedbackIncorrect(zone);
    }
  }
}

/* ---------- 9) INDIVIDUAL GAMES ---------- */
const GAME_RENDERERS = {
  abc: renderABC, numbers: renderNumbers, shapes: renderShapes, colors: renderColors,
  memory: renderMemory, puzzle: renderPuzzle, matching: renderMatching, music: renderMusic,
  drawing: renderDrawing, rewards: renderRewards, calm: renderCalm, achievements: renderAchievements
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
    activityId:'abc', badgeId:'badge_abc'
  });
}

function renderNumbers(mount){
  mount.innerHTML = `<div class="game-shell" style="text-align:center">
      <p class="game-progress" id="num-progress">Round 1 of 5</p>
      <div id="num-objects" style="font-size:3rem; margin:20px 0; letter-spacing:10px;"></div>
      <p style="font-weight:800; font-size:1.2rem;">How many do you see?</p>
      <div id="num-choices" style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap; margin-top:16px;"></div>
    </div>`;
  const emojiChoices = ['🍓','🐥','⭐','🎈','🐬','🦋'];
  let round = 0; const totalRounds = 5;
  const progressEl = mount.querySelector('#num-progress');
  const objectsEl = mount.querySelector('#num-objects');
  const choicesEl = mount.querySelector('#num-choices');

  function nextRound(){
    if(round >= totalRounds){
      AudioEngine.victory(); celebrationConfetti();
      grantReward({ stars:3, coins:2, activityId:'numbers', badgeId:'badge_numbers' });
      mount.querySelector('.game-shell').innerHTML = `<h2>🎉 You counted them all!</h2><p>Great job with numbers!</p>`;
      return;
    }
    round++;
    progressEl.textContent = `Round ${round} of ${totalRounds}`;
    const correct = Math.floor(Math.random()*8) + 2; // 2 - 9
    const symbol = randomFrom(emojiChoices);
    objectsEl.textContent = symbol.repeat(correct);
    const options = new Set([correct]);
    while(options.size < 3) options.add(Math.max(1, correct + Math.floor(Math.random()*5)-2));
    const shuffled = [...options].sort(()=> Math.random()-0.5);
    choicesEl.innerHTML = '';
    shuffled.forEach(n=>{
      const btn = document.createElement('button');
      btn.className = 'diff-btn'; btn.style.fontSize = '1.6rem'; btn.style.minWidth='70px';
      btn.textContent = n;
      btn.setAttribute('aria-label', `Answer ${n}`);
      btn.addEventListener('click', ()=>{
        if(n === correct){ feedbackCorrect(btn, window.innerWidth/2, window.innerHeight/2); setTimeout(nextRound, 700); }
        else feedbackIncorrect(btn);
      });
      choicesEl.appendChild(btn);
    });
  }
  nextRound();
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
    activityId:'shapes', badgeId:'badge_shapes'
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
    activityId:'colors', badgeId:'badge_colors'
  });
}

function renderMatching(mount){
  const data = [
    {id:'dog', baby:'🐶', label:'Puppy → Dog', emoji:'🐕'},
    {id:'cat', baby:'🐱', label:'Kitten → Cat', emoji:'🐈'},
    {id:'duck', baby:'🐥', label:'Duckling → Duck', emoji:'🦆'},
    {id:'cow', baby:'🐮', label:'Calf → Cow', emoji:'🐄'},
    {id:'sheep', baby:'🐑', label:'Lamb → Sheep', emoji:'🐑'}
  ];
  createPlacementGame({
    mountEl: mount,
    poolItems: data.map(d=>({id:d.id, emoji:d.baby, label:d.label.split(' → ')[0]})),
    slots: data.map(d=>({id:d.id, matchId:d.id, label:d.label.split(' → ')[1], emoji: d.emoji})),
    activityId:'matching', badgeId:'badge_matching'
  });
}

function renderPuzzle(mount){
  mount.innerHTML = `<div class="game-shell" style="text-align:center">
    <p>Drag each piece into its matching spot to build the happy scene! 🌈</p>
    <div id="puzzle-mount"></div>
  </div>`;
  const scene = [
    {id:'sun', emoji:'☀️', label:'Sun'}, {id:'cloud', emoji:'☁️', label:'Cloud'}, {id:'bird', emoji:'🐦', label:'Bird'},
    {id:'house', emoji:'🏠', label:'House'}, {id:'tree', emoji:'🌳', label:'Tree'}, {id:'flower', emoji:'🌸', label:'Flower'}
  ];
  createPlacementGame({
    mountEl: mount.querySelector('#puzzle-mount'),
    poolItems: scene.map(s=>({id:s.id, emoji:s.emoji, label:s.label})),
    slots: scene.map(s=>({id:s.id, matchId:s.id, label:s.label})),
    slotGridStyle: 'display:grid; grid-template-columns: repeat(3, 110px); gap:14px;',
    activityId:'puzzle', badgeId:'badge_puzzle'
  });
}

function renderMemory(mount){
  mount.innerHTML = `
    <div class="game-shell">
      <div class="game-toolbar" role="group" aria-label="Choose difficulty">
        <button class="diff-btn" data-n="6">Easy (6 pairs)</button>
        <button class="diff-btn" data-n="8">Medium (8 pairs)</button>
        <button class="diff-btn" data-n="12">Hard (12 pairs)</button>
      </div>
      <p class="game-progress" id="mem-progress"></p>
      <div class="memory-grid" id="memory-grid"></div>
    </div>`;
  const buttons = mount.querySelectorAll('.diff-btn');
  buttons.forEach(b=> b.addEventListener('click', ()=>{
    buttons.forEach(x=>x.classList.remove('active')); b.classList.add('active');
    startMemory(parseInt(b.dataset.n,10));
  }));
  buttons[0].click();

  function startMemory(n){
    const symbols = ['🐶','🐱','🐰','🐻','🦊','🐼','🐸','🦁','🐵','🐷','🐨','🦄','🐤','🐙'];
    const chosen = symbols.slice(0, n);
    const deck = [...chosen, ...chosen].sort(()=> Math.random()-0.5);
    const grid = mount.querySelector('#memory-grid');
    const cols = n <= 6 ? 4 : (n <= 8 ? 4 : 6);
    grid.style.setProperty('--cols', cols);
    grid.innerHTML = '';
    let flipped = []; let lockBoard = false; let matches = 0;
    const progressEl = mount.querySelector('#mem-progress');
    progressEl.textContent = `0 / ${chosen.length} pairs found`;

    deck.forEach((symbol, idx)=>{
      const card = document.createElement('div');
      card.className = 'memory-card'; card.tabIndex = 0; card.setAttribute('role','button');
      card.setAttribute('aria-label','Memory card, hidden');
      card.dataset.symbol = symbol; card.dataset.idx = idx;
      card.innerHTML = `<div class="memory-card-inner">
          <div class="memory-face front" aria-hidden="true">❓</div>
          <div class="memory-face back" aria-hidden="true">${symbol}</div>
        </div>`;
      card.addEventListener('click', ()=> flipCard(card));
      card.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); flipCard(card); } });
      grid.appendChild(card);
    });

    function flipCard(card){
      if(lockBoard || card.classList.contains('flipped') || card.classList.contains('matched')) return;
      card.classList.add('flipped');
      flipped.push(card);
      if(flipped.length === 2){
        lockBoard = true;
        const [a,b] = flipped;
        if(a.dataset.symbol === b.dataset.symbol){
          a.classList.add('matched'); b.classList.add('matched');
          matches++; progressEl.textContent = `${matches} / ${chosen.length} pairs found`;
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
  mount.innerHTML = `
    <div class="game-shell">
      <h2 style="text-align:center">🎹 Friendly Piano</h2>
      <div class="piano" id="piano"></div>
      <h2 style="text-align:center">🐾 Animal &amp; Nature Sounds</h2>
      <div class="sound-buttons" id="sound-buttons"></div>
    </div>`;
  const notes = [
    {n:'C', f:261.6},{n:'D', f:293.7},{n:'E', f:329.6},{n:'F', f:349.2},
    {n:'G', f:392.0},{n:'A', f:440.0},{n:'B', f:493.9},{n:'C2', f:523.3}
  ];
  const piano = mount.querySelector('#piano');
  notes.forEach(note=>{
    const key = document.createElement('button');
    key.className = 'piano-key'; key.textContent = note.n.replace('2','');
    key.setAttribute('aria-label', `Play note ${note.n}`);
    key.addEventListener('click', ()=>{ AudioEngine.piano(note.f); key.classList.add('active-key'); setTimeout(()=>key.classList.remove('active-key'),150); });
    piano.appendChild(key);
  });
  const sounds = [
    {label:'Dog', emoji:'🐶', fn:()=>AudioEngine.animal('dog')},
    {label:'Cat', emoji:'🐱', fn:()=>AudioEngine.animal('cat')},
    {label:'Cow', emoji:'🐮', fn:()=>AudioEngine.animal('cow')},
    {label:'Bird', emoji:'🐦', fn:()=>AudioEngine.animal('bird')},
    {label:'Duck', emoji:'🦆', fn:()=>AudioEngine.animal('duck')},
    {label:'Melody', emoji:'🎶', fn:()=>AudioEngine.victory()}
  ];
  const soundBtns = mount.querySelector('#sound-buttons');
  sounds.forEach(s=>{
    const btn = document.createElement('button');
    btn.innerHTML = `${s.emoji}<br><span style="font-size:.9rem">${s.label}</span>`;
    btn.setAttribute('aria-label', s.label);
    btn.addEventListener('click', s.fn);
    soundBtns.appendChild(btn);
  });
}

function renderDrawing(mount){
  mount.innerHTML = `
    <div class="game-shell">
      <div class="drawing-toolbar" role="group" aria-label="Drawing tools">
        <span id="swatches" style="display:flex; gap:8px;"></span>
        <label>Brush: <input type="range" id="brush-size" min="2" max="40" value="10" aria-label="Brush size"></label>
        <button id="btn-eraser" aria-pressed="false">🧽 Eraser</button>
        <button id="btn-undo">↩ Undo</button>
        <button id="btn-clear">🗑 Clear</button>
        <button id="btn-save">💾 Save</button>
      </div>
      <canvas id="drawing-canvas" width="800" height="500" aria-label="Drawing canvas"></canvas>
    </div>`;
  const canvas = mount.querySelector('#drawing-canvas');
  const ctx2d = canvas.getContext('2d');
  ctx2d.fillStyle = '#fff'; ctx2d.fillRect(0,0,canvas.width, canvas.height);
  let drawing = false, color = '#FF6B81', size = 10, erasing = false;
  const history = [];

  function saveSnapshot(){
    history.push(canvas.toDataURL());
    if(history.length > 20) history.shift();
  }
  saveSnapshot();

  const colors = ['#FF6B81','#FFC15E','#7FD79A','#6FA8DC','#C9A0FF','#FF9FB2','#4A3F6B','#FFFFFF'];
  const swatchWrap = mount.querySelector('#swatches');
  colors.forEach((c,i)=>{
    const sw = document.createElement('button');
    sw.className = 'color-swatch' + (i===0?' active':'');
    sw.style.background = c; sw.setAttribute('aria-label', `Color ${c}`);
    sw.addEventListener('click', ()=>{
      color = c; erasing = false;
      mount.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));
      sw.classList.add('active');
      mount.querySelector('#btn-eraser').setAttribute('aria-pressed','false');
    });
    swatchWrap.appendChild(sw);
  });

  mount.querySelector('#brush-size').addEventListener('input', e=> size = parseInt(e.target.value,10));
  mount.querySelector('#btn-eraser').addEventListener('click', (e)=>{
    erasing = !erasing; e.target.setAttribute('aria-pressed', String(erasing));
  });
  mount.querySelector('#btn-clear').addEventListener('click', ()=>{
    ctx2d.fillStyle = '#fff'; ctx2d.fillRect(0,0,canvas.width, canvas.height); saveSnapshot();
  });
  mount.querySelector('#btn-undo').addEventListener('click', ()=>{
    if(history.length > 1){ history.pop(); const img = new Image(); img.src = history[history.length-1];
      img.onload = ()=> ctx2d.drawImage(img,0,0,canvas.width,canvas.height); }
  });
  mount.querySelector('#btn-save').addEventListener('click', ()=>{
    state.drawing = canvas.toDataURL(); saveState();
    const link = document.createElement('a');
    link.download = 'my-magic-drawing.png'; link.href = canvas.toDataURL(); link.click();
    grantReward({ stars:2, coins:1, activityId:'drawing', badgeId:'badge_artist' });
    showToast('🎨 Your masterpiece is saved!');
  });

  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX-rect.left) * (canvas.width/rect.width), y: (clientY-rect.top) * (canvas.height/rect.height) };
  }
  function startDraw(e){ drawing = true; const p = getPos(e); ctx2d.beginPath(); ctx2d.moveTo(p.x,p.y); }
  function draw(e){
    if(!drawing) return;
    const p = getPos(e);
    ctx2d.lineWidth = size; ctx2d.lineCap = 'round'; ctx2d.strokeStyle = erasing ? '#ffffff' : color;
    ctx2d.lineTo(p.x,p.y); ctx2d.stroke();
  }
  function endDraw(){ if(drawing){ drawing=false; saveSnapshot(); } }

  canvas.addEventListener('pointerdown', startDraw);
  canvas.addEventListener('pointermove', draw);
  window.addEventListener('pointerup', endDraw);
}

/* ---------- Calm Corner ---------- */
function renderCalm(mount){
  mount.innerHTML = `
    <div class="calm-shell">
      <h2>Let's take a magical breath 🌿</h2>
      <div class="breathing-circle" id="breathe-circle">Breathe In</div>
      <button id="btn-ambient" aria-pressed="false">🎶 Play Gentle Music</button>
      <h3 style="margin-top:26px;">Pop the calming bubbles 🫧</h3>
      <div class="bubble-field" id="bubble-field"></div>
      <h3 style="margin-top:20px;">Floating stars ✨</h3>
      <div class="calm-stars" id="calm-stars"></div>
    </div>`;

  const circle = mount.querySelector('#breathe-circle');
  let phase = 0; const phases = ['Breathe In','Hold','Breathe Out'];
  const breatheTimer = setInterval(()=>{ phase = (phase+1)%3; circle.textContent = phases[phase]; }, 2666);
  observeUnmount(mount, ()=> clearInterval(breatheTimer));

  const ambientBtn = mount.querySelector('#btn-ambient');
  ambientBtn.addEventListener('click', ()=>{
    const active = ambientBtn.getAttribute('aria-pressed') === 'true';
    if(active){ AudioEngine.stopAmbient(); ambientBtn.setAttribute('aria-pressed','false'); ambientBtn.textContent='🎶 Play Gentle Music'; }
    else { AudioEngine.startAmbient(); ambientBtn.setAttribute('aria-pressed','true'); ambientBtn.textContent='⏸ Stop Music'; }
  });

  const bubbleField = mount.querySelector('#bubble-field');
  const bubbleTimer = setInterval(()=>{
    if(!document.body.contains(bubbleField)) return;
    const bubble = document.createElement('div');
    const s = 24 + Math.random()*46;
    bubble.className = 'bubble';
    bubble.style.width = bubble.style.height = s+'px';
    bubble.style.left = Math.random()*90 + '%';
    bubble.style.animationDuration = (5+Math.random()*4)+'s';
    bubble.setAttribute('role','button'); bubble.tabIndex = 0;
    bubble.setAttribute('aria-label','Pop bubble');
    bubble.addEventListener('click', ()=>{ AudioEngine.pop(); fireStarBurst(bubble.getBoundingClientRect().left, bubble.getBoundingClientRect().top); bubble.remove(); });
    bubble.addEventListener('animationend', ()=> bubble.remove());
    bubbleField.appendChild(bubble);
  }, 900);
  observeUnmount(mount, ()=> clearInterval(bubbleTimer));

  const starsField = mount.querySelector('#calm-stars');
  for(let i=0;i<10;i++){
    const s = document.createElement('span');
    s.className = 'calm-star'; s.textContent = '✨';
    s.style.left = (Math.random()*95)+'%'; s.style.top = (Math.random()*90)+'%';
    s.style.animationDelay = (Math.random()*2)+'s';
    starsField.appendChild(s);
  }
}
// Utility: run a cleanup callback when this mount's content gets replaced/removed
function observeUnmount(mount, cleanup){
  const obs = new MutationObserver(()=>{
    if(!document.body.contains(mount) || mount.dataset.left === 'true'){ cleanup(); obs.disconnect(); }
  });
  const target = document.getElementById('screen-activity');
  obs.observe(target, { childList:true });
  document.getElementById('btn-activity-back').addEventListener('click', function once(){ cleanup(); }, { once:true });
}

/* ---------- 10) REWARDS / ACHIEVEMENTS ---------- */
const BADGES = [
  {id:'badge_abc', name:'Alphabet Star', emoji:'🔤'},
  {id:'badge_numbers', name:'Number Whiz', emoji:'🔢'},
  {id:'badge_shapes', name:'Shape Master', emoji:'🔺'},
  {id:'badge_colors', name:'Color Wizard', emoji:'🎨'},
  {id:'badge_memory', name:'Memory Master', emoji:'🧠'},
  {id:'badge_puzzle', name:'Puzzle Pro', emoji:'🧩'},
  {id:'badge_matching', name:'Animal Friend', emoji:'🐣'},
  {id:'badge_artist', name:'Little Artist', emoji:'🖍️'},
];

const ACHIEVEMENTS = [
  {id:'ach_first_star', name:'First Star', emoji:'⭐', desc:'Earn your first star', check: s=> s.stars>=1},
  {id:'ach_10_stars', name:'Star Collector', emoji:'🌟', desc:'Earn 10 stars', check: s=> s.stars>=10},
  {id:'ach_50_coins', name:'Coin Champion', emoji:'🪙', desc:'Earn 50 coins', check: s=> s.coins>=50},
  {id:'ach_level5', name:'Rising Explorer', emoji:'🚀', desc:'Reach level 5', check: s=> s.level>=5},
  {id:'ach_all_badges', name:'Badge Master', emoji:'🎖️', desc:'Unlock every badge', check: s=> BADGES.every(b=>s.badges.includes(b.id))},
  {id:'ach_5_activities', name:'Curious Mind', emoji:'🔍', desc:'Try 5 different activities', check: s=> Object.keys(s.activityCompletions).length>=5},
];

function unlockBadge(id){
  if(!state.badges.includes(id)){
    state.badges.push(id);
    const badge = BADGES.find(b=>b.id===id);
    if(badge) showToast(`🎖️ New badge unlocked: ${badge.name}!`);
  }
}
function checkAchievements(){
  ACHIEVEMENTS.forEach(a=>{
    if(!state.achievements.includes(a.id) && a.check(state)){
      state.achievements.push(a.id);
      showToast(`🏆 Achievement unlocked: ${a.name}!`);
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
  mount.innerHTML = `
    <div class="game-shell">
      <h2 style="text-align:center">🏆 Achievements</h2>
      <div class="rewards-grid" id="ach-grid"></div>
    </div>`;
  const grid = mount.querySelector('#ach-grid');
  ACHIEVEMENTS.forEach(a=>{
    const unlocked = state.achievements.includes(a.id);
    const el = document.createElement('div');
    el.className = 'badge-item' + (unlocked?' unlocked':'');
    el.innerHTML = `<span class="badge-emoji">${a.emoji}</span><span class="badge-name">${a.name}</span><p style="font-size:.8rem; margin:6px 0 0; color:var(--ink-soft);">${a.desc}</p>`;
    grid.appendChild(el);
  });
}

/* ---------- 11) PROFILE ---------- */
const AVATARS = ['🐻','🐰','🦊','🐼','🦄','🐸','🐵','🐯','🐨','🐤','🐬','🦋'];

function openProfile(){
  document.getElementById('profile-name-input').value = state.profile.name;
  document.getElementById('avatar-display').textContent = state.profile.avatar;
  const grid = document.getElementById('avatar-grid');
  grid.innerHTML = '';
  AVATARS.forEach(av=>{
    const btn = document.createElement('button');
    btn.className = 'avatar-choice' + (av===state.profile.avatar?' selected':'');
    btn.textContent = av; btn.setAttribute('aria-label', `Choose avatar ${av}`);
    btn.addEventListener('click', ()=>{
      state.profile.avatar = av; saveState();
      document.getElementById('avatar-display').textContent = av;
      grid.querySelectorAll('.avatar-choice').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      updateToolbarUI();
    });
    grid.appendChild(btn);
  });
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
  const xpInLevel = state.xp % 100;
  document.getElementById('profile-xp-fill').style.width = xpInLevel + '%';
}

/* ---------- 12) BOOT SEQUENCE ---------- */
function boot(){
  applySettingsToDOM();
  updateToolbarUI();
  initToolbar();
  initLanding();

  // Animated loading bar, then reveal app
  const fill = document.getElementById('loading-bar-fill');
  let pct = 0;
  const iv = setInterval(()=>{
    pct += Math.random()*22 + 8;
    if(pct >= 100){ pct = 100; clearInterval(iv);
      setTimeout(()=>{
        document.getElementById('loading-screen').classList.add('hidden');
      }, 250);
    }
    fill.style.width = pct + '%';
  }, 180);
}

document.addEventListener('DOMContentLoaded', boot);

// ── Character Generation ──────────────────────────────────────────────────

const ADJECTIVES = [
  '炎の', '氷の', '疾風の', '鋼の', '雷の', '闇の', '光の', '毒の',
  '聖なる', '呪われた', '古代の', '竜の', '神聖な', '影の', '嵐の',
];
const NOUNS = [
  'ドラゴン', 'ウォリアー', 'ウィザード', 'ナイト', 'ビースト',
  'フェニックス', 'ゴーレム', 'シャーマン', 'デーモン', 'エンジェル',
  'サムライ', 'ニンジャ', 'バーサーカー', 'ソーサラー',
];
const ELEMENTS = ['fire', 'water', 'forest'];
const ELEM_LABEL = { fire: '🔥 火', water: '💧 水', forest: '🌲 森' };
const ELEM_ICON  = { fire: '🔥', water: '💧', forest: '🌲' };
const CHAR_ICON  = { fire: '🐉', water: '🧊', forest: '🌿' };

function hashStr(str, seed) {
  let h = (0xdeadbeef + (seed | 0)) | 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function generateCharacter(qrData) {
  const s = (i) => hashStr(qrData, i);
  const element = ELEMENTS[s(3) % ELEMENTS.length];
  const hp = 80 + (s(0) % 121);
  return {
    name: ADJECTIVES[s(4) % ADJECTIVES.length] + NOUNS[s(5) % NOUNS.length],
    hp,
    maxHp: hp,
    currentHp: hp,
    atk: 15 + (s(1) % 36),
    def: 5  + (s(2) % 21),
    element,
    qrData,
  };
}

// ── Battle Logic ─────────────────────────────────────────────────────────

// 攻撃 > 防御 > 反撃 > 攻撃
const BEATS = { attack: 'guard', guard: 'counter', counter: 'attack' };
const ACTION_LABEL = { attack: '⚔️攻撃', guard: '🛡️防御', counter: '🔄反撃' };
const RESULT_LABEL = { win: '勝ち', draw: '引き分け', lose: '負け' };

function resolveActions(mine, theirs) {
  if (mine === theirs) return 'draw';
  return BEATS[mine] === theirs ? 'win' : 'lose';
}

function elementMultiplier(atkElem, defElem) {
  const adv = { fire: 'forest', forest: 'water', water: 'fire' };
  if (adv[atkElem] === defElem) return 1.5;
  if (adv[defElem] === atkElem) return 0.75;
  return 1.0;
}

function calcDamage(attacker, defender, actionResult) {
  const base = Math.max(1, attacker.atk - defender.def);
  const am = actionResult === 'win' ? 1.8 : actionResult === 'draw' ? 1.0 : 0.4;
  const em = elementMultiplier(attacker.element, defender.element);
  return Math.floor(base * am * em);
}

// ── UI Helpers ───────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function renderCharCard(char, containerId, mini = false) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (mini) {
    el.innerHTML = `
      <div class="char-card-inner elem-${char.element}">
        <div class="char-main-icon">${ELEM_ICON[char.element]}</div>
        <div class="char-name">${char.name}</div>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="char-card-inner elem-${char.element}">
        <div class="char-main-icon">${CHAR_ICON[char.element]}</div>
        <div class="char-name">${char.name}</div>
        <div class="char-elem-badge">${ELEM_LABEL[char.element]}</div>
        <div class="char-stats">
          <div class="stat"><span class="stat-label">HP</span><span class="stat-val">${char.hp}</span></div>
          <div class="stat"><span class="stat-label">ATK</span><span class="stat-val">${char.atk}</span></div>
          <div class="stat"><span class="stat-label">DEF</span><span class="stat-val">${char.def}</span></div>
        </div>
      </div>`;
  }
}

function updateHpBar(barId, labelId, nameId, current, max, name) {
  const pct = Math.max(0, Math.round((current / max) * 100));
  const bar = document.getElementById(barId);
  bar.style.width = pct + '%';
  bar.style.backgroundColor =
    pct > 50 ? 'var(--hp-green)' : pct > 25 ? 'var(--hp-yellow)' : 'var(--hp-red)';
  document.getElementById(labelId).textContent = `HP: ${current}/${max}`;
  if (nameId && name) document.getElementById(nameId).textContent = name;
}

function addLog(message, cls = '') {
  const log = document.getElementById('battle-log');
  const p = document.createElement('p');
  p.className = 'log-entry' + (cls ? ' ' + cls : '');
  p.textContent = message;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

function setActionsEnabled(enabled) {
  document.querySelectorAll('.btn-action').forEach(btn => {
    btn.disabled = !enabled;
    btn.classList.remove('selected');
  });
}

// ── Camera / QR Scanning ─────────────────────────────────────────────────

let videoStream = null;
let scanRafId   = null;

async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    });
    const video = document.getElementById('camera-video');
    video.srcObject = videoStream;
    await video.play();
    scanRafId = requestAnimationFrame(scanFrame);
  } catch (err) {
    alert('カメラへのアクセスができませんでした。\n' + err.message);
    showScreen('screen-home');
  }
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  if (scanRafId) {
    cancelAnimationFrame(scanRafId);
    scanRafId = null;
  }
}

function scanFrame() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    if (code && code.data) {
      stopCamera();
      onQrScanned(code.data);
      return;
    }
  }
  scanRafId = requestAnimationFrame(scanFrame);
}

// ── Game State ───────────────────────────────────────────────────────────

let myChar  = null;
let oppChar = null;
let isOnline = false;
let socket   = null;
let myLastAction = null;

function onQrScanned(data) {
  myChar = generateCharacter(data);
  renderCharCard(myChar, 'my-char-card');
  showScreen('screen-ready');
}

// ── AI Battle ────────────────────────────────────────────────────────────

function generateAiChar() {
  const seed = 'AI_' + Math.floor(Math.random() * 10000).toString();
  return generateCharacter(seed);
}

function aiChooseAction() {
  const actions = ['attack', 'guard', 'counter'];
  if (myLastAction && Math.random() < 0.4) {
    return BEATS[myLastAction]; // counter the player's last move
  }
  return actions[Math.floor(Math.random() * 3)];
}

function startAiBattle() {
  isOnline = false;
  oppChar = generateAiChar();
  myChar.currentHp = myChar.hp;
  setupBattleScreen();
  addLog(`AIキャラ「${oppChar.name}」との対戦開始！`, 'log-system');
  showScreen('screen-battle');
}

// ── Online Battle ────────────────────────────────────────────────────────

function initSocket() {
  if (socket) return;
  socket = io();

  socket.on('match_found', ({ opponent }) => {
    document.getElementById('matchmaking-overlay').style.display = 'none';
    oppChar = { ...opponent, currentHp: opponent.hp, maxHp: opponent.hp };
    myChar.currentHp = myChar.hp;
    setupBattleScreen();
    addLog(`マッチング成立！「${oppChar.name}」との対戦開始！`, 'log-system');
    showScreen('screen-battle');
  });

  socket.on('battle_result', ({ myAction, opponentAction, myHp, opponentHp, myDamageReceived, opponentDamageDealt }) => {
    myChar.currentHp  = myHp;
    oppChar.currentHp = opponentHp;
    updateHpBar('my-hp-bar',  'my-hp-label',  'my-name-label',  myHp,  myChar.hp,  myChar.name);
    updateHpBar('opp-hp-bar', 'opp-hp-label', 'opp-name-label', opponentHp, oppChar.hp, oppChar.name);

    const result = resolveActions(myAction, opponentAction);
    const cls = result === 'win' ? 'log-win' : result === 'lose' ? 'log-lose' : 'log-draw';
    addLog(`自: ${ACTION_LABEL[myAction]} vs 相: ${ACTION_LABEL[opponentAction]} → ${RESULT_LABEL[result]}`, cls);
    if (opponentDamageDealt > 0) addLog(`${oppChar.name}に ${opponentDamageDealt} ダメージ！`);
    if (myDamageReceived > 0)    addLog(`自分は ${myDamageReceived} ダメージを受けた！`);

    setActionsEnabled(true);
    document.getElementById('waiting-label').style.display = 'none';
  });

  socket.on('battle_end', ({ winner }) => {
    setTimeout(() => showResult(winner === 'you'), 600);
  });

  socket.on('opponent_disconnected', () => {
    addLog('相手が切断しました。あなたの勝利！', 'log-win');
    setTimeout(() => showResult(true), 1200);
  });
}

function startOnlineBattle() {
  isOnline = true;
  initSocket();
  document.getElementById('matchmaking-overlay').style.display = 'flex';
  socket.emit('join_matchmaking', { character: myChar });
}

// ── Battle Shared ─────────────────────────────────────────────────────────

function setupBattleScreen() {
  renderCharCard(myChar,  'my-char-card-battle', true);
  renderCharCard(oppChar, 'opp-char-card',       true);
  updateHpBar('my-hp-bar',  'my-hp-label',  'my-name-label',  myChar.hp,  myChar.hp,  myChar.name);
  updateHpBar('opp-hp-bar', 'opp-hp-label', 'opp-name-label', oppChar.hp, oppChar.hp, oppChar.name);
  document.getElementById('battle-log').innerHTML = '';
  setActionsEnabled(true);
  document.getElementById('waiting-label').style.display = 'none';
  myLastAction = null;
}

function handleAction(action) {
  myLastAction = action;
  setActionsEnabled(false);
  document.querySelector(`[data-action="${action}"]`).classList.add('selected');

  if (isOnline) {
    socket.emit('battle_action', { action });
    document.getElementById('waiting-label').style.display = 'block';
    return;
  }

  // AI battle — resolve immediately
  const aiAction  = aiChooseAction();
  const myResult  = resolveActions(action, aiAction);
  const aiResult  = resolveActions(aiAction, action);
  const myDealt   = calcDamage(myChar,  oppChar, myResult);
  const aiDealt   = calcDamage(oppChar, myChar,  aiResult);

  oppChar.currentHp = Math.max(0, oppChar.currentHp - myDealt);
  myChar.currentHp  = Math.max(0, myChar.currentHp  - aiDealt);

  updateHpBar('my-hp-bar',  'my-hp-label',  'my-name-label',  myChar.currentHp,  myChar.hp,  myChar.name);
  updateHpBar('opp-hp-bar', 'opp-hp-label', 'opp-name-label', oppChar.currentHp, oppChar.hp, oppChar.name);

  const cls = myResult === 'win' ? 'log-win' : myResult === 'lose' ? 'log-lose' : 'log-draw';
  addLog(`自: ${ACTION_LABEL[action]} vs AI: ${ACTION_LABEL[aiAction]} → ${RESULT_LABEL[myResult]}`, cls);
  if (myDealt  > 0) addLog(`${oppChar.name}に ${myDealt} ダメージ！`);
  if (aiDealt  > 0) addLog(`自分は ${aiDealt} ダメージを受けた！`);

  if (myChar.currentHp === 0 || oppChar.currentHp === 0) {
    setTimeout(() => showResult(myChar.currentHp > 0), 600);
  } else {
    setTimeout(() => setActionsEnabled(true), 400);
  }
}

function showResult(won) {
  const result = document.getElementById('result-display');
  result.className = 'result-display ' + (won ? 'result-win' : 'result-lose');
  document.getElementById('result-icon').textContent   = won ? '🏆' : '💀';
  document.getElementById('result-title').textContent  = won ? '勝利！' : '敗北...';
  document.getElementById('result-subtitle').textContent =
    won ? `${myChar.name}の勝利！` : `${oppChar.name}の勝利！`;
  showScreen('screen-result');
}

// ── Event Listeners ──────────────────────────────────────────────────────

document.getElementById('btn-start-scan').addEventListener('click', () => {
  showScreen('screen-scan');
  startCamera();
});

document.getElementById('btn-cancel-scan').addEventListener('click', () => {
  stopCamera();
  showScreen('screen-home');
});

document.getElementById('btn-rescan').addEventListener('click', () => {
  showScreen('screen-scan');
  startCamera();
});

document.getElementById('btn-ai-battle').addEventListener('click', startAiBattle);

document.getElementById('btn-online-battle').addEventListener('click', startOnlineBattle);

document.getElementById('btn-cancel-matchmaking').addEventListener('click', () => {
  if (socket) socket.emit('leave_matchmaking');
  document.getElementById('matchmaking-overlay').style.display = 'none';
  isOnline = false;
});

document.querySelectorAll('.btn-action').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.disabled) handleAction(btn.dataset.action);
  });
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  if (myChar) {
    myChar.currentHp = myChar.hp;
    renderCharCard(myChar, 'my-char-card');
    showScreen('screen-ready');
  } else {
    showScreen('screen-home');
  }
});

document.getElementById('btn-back-home').addEventListener('click', () => {
  if (socket) {
    socket.emit('leave_matchmaking');
    socket.disconnect();
    socket = null;
  }
  myChar = null;
  oppChar = null;
  showScreen('screen-home');
});

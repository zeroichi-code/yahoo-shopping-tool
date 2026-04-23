import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(join(__dirname, 'public')));

const matchmakingQueue = [];
const battles = new Map();

function generateBattleId() {
  return Math.random().toString(36).slice(2, 10);
}

// 攻撃=attack > 防御=guard > 反撃=counter > 攻撃
function resolveActions(a1, a2) {
  if (a1 === a2) return 'draw';
  const beats = { attack: 'guard', guard: 'counter', counter: 'attack' };
  return beats[a1] === a2 ? 'win' : 'lose';
}

function elementMultiplier(atkElem, defElem) {
  const adv = { fire: 'forest', forest: 'water', water: 'fire' };
  if (adv[atkElem] === defElem) return 1.5;
  if (adv[defElem] === atkElem) return 0.75;
  return 1.0;
}

function calcDamage(attacker, defender, actionResult) {
  const base = Math.max(1, attacker.atk - defender.def);
  const actionMult = actionResult === 'win' ? 1.8 : actionResult === 'draw' ? 1.0 : 0.4;
  const elemMult = elementMultiplier(attacker.element, defender.element);
  return Math.floor(base * actionMult * elemMult);
}

io.on('connection', (socket) => {
  socket.on('join_matchmaking', ({ character }) => {
    if (matchmakingQueue.find(e => e.socket.id === socket.id)) return;
    matchmakingQueue.push({ socket, character });

    if (matchmakingQueue.length >= 2) {
      const p1 = matchmakingQueue.shift();
      const p2 = matchmakingQueue.shift();
      const battleId = generateBattleId();

      const battle = {
        p1: { socket: p1.socket, character: { ...p1.character, currentHp: p1.character.hp }, action: null },
        p2: { socket: p2.socket, character: { ...p2.character, currentHp: p2.character.hp }, action: null },
      };
      battles.set(battleId, battle);

      p1.socket.data.battleId = battleId;
      p2.socket.data.battleId = battleId;
      p1.socket.data.playerKey = 'p1';
      p2.socket.data.playerKey = 'p2';

      p1.socket.emit('match_found', { opponent: p2.character, battleId });
      p2.socket.emit('match_found', { opponent: p1.character, battleId });
    }
  });

  socket.on('leave_matchmaking', () => {
    const idx = matchmakingQueue.findIndex(e => e.socket.id === socket.id);
    if (idx !== -1) matchmakingQueue.splice(idx, 1);
  });

  socket.on('battle_action', ({ action }) => {
    const { battleId, playerKey } = socket.data;
    if (!battleId || !playerKey) return;

    const battle = battles.get(battleId);
    if (!battle) return;

    battle[playerKey].action = action;

    if (battle.p1.action && battle.p2.action) {
      const p1Result = resolveActions(battle.p1.action, battle.p2.action);
      const p2Result = p1Result === 'draw' ? 'draw' : (p1Result === 'win' ? 'lose' : 'win');

      const p1Dealt = calcDamage(battle.p1.character, battle.p2.character, p1Result);
      const p2Dealt = calcDamage(battle.p2.character, battle.p1.character, p2Result);

      battle.p2.character.currentHp = Math.max(0, battle.p2.character.currentHp - p1Dealt);
      battle.p1.character.currentHp = Math.max(0, battle.p1.character.currentHp - p2Dealt);

      const p1Action = battle.p1.action;
      const p2Action = battle.p2.action;
      battle.p1.action = null;
      battle.p2.action = null;

      battle.p1.socket.emit('battle_result', {
        myAction: p1Action, opponentAction: p2Action,
        myDamageReceived: p2Dealt, opponentDamageDealt: p1Dealt,
        myHp: battle.p1.character.currentHp, opponentHp: battle.p2.character.currentHp,
      });
      battle.p2.socket.emit('battle_result', {
        myAction: p2Action, opponentAction: p1Action,
        myDamageReceived: p1Dealt, opponentDamageDealt: p2Dealt,
        myHp: battle.p2.character.currentHp, opponentHp: battle.p1.character.currentHp,
      });

      if (battle.p1.character.currentHp === 0 || battle.p2.character.currentHp === 0) {
        setTimeout(() => {
          battle.p1.socket.emit('battle_end', { winner: battle.p2.character.currentHp === 0 ? 'you' : 'opponent' });
          battle.p2.socket.emit('battle_end', { winner: battle.p1.character.currentHp === 0 ? 'you' : 'opponent' });
          battles.delete(battleId);
          battle.p1.socket.data.battleId = null;
          battle.p2.socket.data.battleId = null;
        }, 500);
      }
    }
  });

  socket.on('disconnect', () => {
    const idx = matchmakingQueue.findIndex(e => e.socket.id === socket.id);
    if (idx !== -1) matchmakingQueue.splice(idx, 1);

    const { battleId, playerKey } = socket.data;
    if (battleId) {
      const battle = battles.get(battleId);
      if (battle) {
        const opponent = playerKey === 'p1' ? battle.p2 : battle.p1;
        opponent.socket.emit('opponent_disconnected');
        battles.delete(battleId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`QRバトラーズ起動中: http://localhost:${PORT}`);
});

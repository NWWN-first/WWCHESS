// scripts/runMasterClusterAnalysis.ts
// Step 7a Part 2: MASTER 1,000 games (SEED=1, RANDOM_PERSONA=1)
// Measures: Clustered persona (>= 4 bots) pivot rate & within-game pairwise rank comparison

import fs from 'fs';
import path from 'path';
import { GameLoopManager } from '../src/GameLoopManager';
import { Participant } from '../src/Participant';

const rootDir = process.cwd();
const TICK_MS = 200;
const ROUND_CAP = 70;
const MASTER_GAMES = 1000;
const SEED = 1;

process.env.RANDOM_PERSONA = '1';

// Mulberry32 PRNG
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Math.random = mulberry32(SEED);

const ALL_PERSONAS = ['HYPER_ROLLER', 'FAST_NINE_GREEDY', 'GOBLIN_GAMBLER', 'FLEX_MASTER'];

interface ClusteredGameData {
  gameIndex: number;
  clusteredPersona: string;
  clusterCount: number;
  clusteredBotRanks: number[];
  clusteredBotPivots: number[];
  nonClusteredBotRanks: number[];
  pairwiseDiff: number; // mean(clustered) - mean(non-clustered) in this exact game
}

const clusteredGames: ClusteredGameData[] = [];
let totalPivots = 0;
let totalBotCount = 0;
let clusteredGroupPivots = 0;
let clusteredGroupBots = 0;
const seatRanks: number[][] = Array.from({ length: 7 }, () => []);

console.log('================================================================');
console.log(`Running MASTER 1,000 games (SEED=${SEED}, RANDOM_PERSONA=1)...`);
console.log('================================================================');

const t0 = Date.now();

for (let g = 0; g < MASTER_GAMES; g++) {
  const game = new GameLoopManager();
  game.rankManager.setTierForTesting('MASTER');
  const ai = game.aiController as any;
  game.player.persona = 'FLEX_MASTER';

  const brainOf = (p: Participant) => ai.botBrains.get(p.id);

  // Patch finalizeGameAndRank
  const origFinalize = (game as any).finalizeGameAndRank.bind(game);
  (game as any).finalizeGameAndRank = function () {
    const alive = game.participants.filter((p) => !p.isEliminated);
    if (game.player.isEliminated && alive.length > 1) {
      (game as any).distributeRoundIncomeAndRefreshShops();
      (game as any).advanceRoundCounter();
      (game as any).beginRoundEntrySequence();
      return;
    }
    origFinalize();
  };

  let guard = 0;
  let rounds = 0;

  while (game.phase !== 'GAME_OVER_PHASE' && guard++ < 2000) {
    if (rounds >= ROUND_CAP) break;
    if (game.phase === 'AUGMENT_PHASE') {
      if (!game.selectPlayerAugment(0)) break;
      continue;
    }
    if (game.phase === 'ANVIL_PHASE') {
      if (!game.selectPlayerAnvilOption(0)) break;
      continue;
    }
    if (game.phase !== 'PREPARATION_PHASE') break;

    rounds++;
    const roundLabel = game.getRoundLabel();

    if (!game.player.isEliminated) {
      ai.prepareBotForRealTimePrep(game.player, game.participants, game.sharedPool, roundLabel);
    }

    const totalMs = game.prepTotalSec * 1000;
    const currentAlive = game.participants.filter((p) => !p.isEliminated);
    for (let t = 0; t < totalMs; t += TICK_MS) {
      for (const p of currentAlive) {
        const brain = brainOf(p);
        if (!brain) continue;
        try {
          ai.stepBotRealTimeAPM(p, TICK_MS, game.participants, game.sharedPool, roundLabel);
        } catch {}
      }
    }

    try {
      game.startCombatPhase();
    } catch { break; }
    try {
      game.skipCombatToResolution();
    } catch { break; }
  }

  // Determine placements
  const order = [...game.eliminationOrderIds];
  const survivors = game.participants.filter((p) => !p.isEliminated).map((p) => p.id);
  const full = [...order, ...survivors];
  const placements = new Map<string, number>();
  full.forEach((id, idx) => placements.set(id, 8 - idx));
  for (const p of game.participants) {
    if (!placements.has(p.id)) placements.set(p.id, 4);
  }

  for (let s = 1; s <= 7; s++) {
    const botId = `ai_bot_${s}`;
    const rank = placements.get(botId) ?? 4;
    seatRanks[s - 1].push(rank);
  }

  // Count personas
  const counts = new Map<string, number>();
  ALL_PERSONAS.forEach((p) => counts.set(p, 0));
  const bots = game.participants.filter((p) => p.isAI);

  for (const b of bots) {
    totalBotCount++;
    const brain = brainOf(b);
    const pivots = brain ? brain.pivotedCount : 0;
    totalPivots += pivots;
    const persona = b.persona ?? 'UNKNOWN';
    counts.set(persona, (counts.get(persona) ?? 0) + 1);
  }

  let maxCnt = 0;
  let maxPersona = '';
  for (const [p, cnt] of counts) {
    if (cnt > maxCnt) {
      maxCnt = cnt;
      maxPersona = p;
    }
  }

  if (maxCnt >= 4) {
    const cRanks: number[] = [];
    const cPivots: number[] = [];
    const ncRanks: number[] = [];

    for (const b of bots) {
      const rank = placements.get(b.id) ?? 4;
      const brain = brainOf(b);
      const pivots = brain ? brain.pivotedCount : 0;

      if (b.persona === maxPersona) {
        cRanks.push(rank);
        cPivots.push(pivots);
        clusteredGroupBots++;
        clusteredGroupPivots += pivots;
      } else {
        ncRanks.push(rank);
      }
    }

    const meanClustered = cRanks.reduce((a, b) => a + b, 0) / cRanks.length;
    const meanNonClustered = ncRanks.reduce((a, b) => a + b, 0) / ncRanks.length;

    clusteredGames.push({
      gameIndex: g,
      clusteredPersona: maxPersona,
      clusterCount: maxCnt,
      clusteredBotRanks: cRanks,
      clusteredBotPivots: cPivots,
      nonClusteredBotRanks: ncRanks,
      pairwiseDiff: meanClustered - meanNonClustered,
    });
  }

  if ((g + 1) % 200 === 0) {
    console.log(`[MASTER Progress] Completed ${g + 1}/${MASTER_GAMES} games...`);
  }
}

const elapsedSec = (Date.now() - t0) / 1000;
console.log(`MASTER 1,000 games finished in ${elapsedSec.toFixed(1)}s.`);

const outData = {
  tier: 'MASTER',
  games: MASTER_GAMES,
  seed: SEED,
  elapsedSec,
  totalBotCount,
  totalPivots,
  clusteredGroupBots,
  clusteredGroupPivots,
  clusteredGamesCount: clusteredGames.length,
  clusteredGames,
  seatRanks,
};

const jsonPath = path.join(rootDir, 'results/master-cluster-results.json');
fs.writeFileSync(jsonPath, JSON.stringify(outData, null, 2), 'utf-8');
console.log(`Saved MASTER results to ${jsonPath}`);

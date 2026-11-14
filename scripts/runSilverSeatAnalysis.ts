// scripts/runSilverSeatAnalysis.ts
// Step 7a Part 1: SILVER 3,000 games (SEED=1, RANDOM_PERSONA=1)
// Measures: Seat bias across 7 seats, simultaneous elimination tie-breaking statistics

import fs from 'fs';
import path from 'path';
import { GameLoopManager } from '../src/GameLoopManager';
import { Participant } from '../src/Participant';

const rootDir = process.cwd();
const TICK_MS = 200;
const ROUND_CAP = 70;
const SILVER_GAMES = 3000;
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

const silverSeatRanks: number[][] = Array.from({ length: 7 }, () => []);
let silverSimultaneousElimRounds = 0;
let silverTotalElimRounds = 0;

console.log('================================================================');
console.log(`Running SILVER 3,000 games (SEED=${SEED}, RANDOM_PERSONA=1)...`);
console.log('================================================================');

const t0 = Date.now();

for (let g = 0; g < SILVER_GAMES; g++) {
  const game = new GameLoopManager();
  game.rankManager.setTierForTesting('SILVER');
  const ai = game.aiController as any;
  game.player.persona = 'FLEX_MASTER';

  const brainOf = (p: Participant) => ai.botBrains.get(p.id);

  // Patch finalizeGameAndRank to let all 7 bots finish naturally
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

    const elimCountBefore = game.eliminationOrderIds.length;
    try {
      game.startCombatPhase();
    } catch { break; }
    try {
      game.skipCombatToResolution();
    } catch { break; }

    const elimsThisRound = game.eliminationOrderIds.length - elimCountBefore;
    if (elimsThisRound > 0) {
      silverTotalElimRounds++;
      if (elimsThisRound >= 2) {
        silverSimultaneousElimRounds++;
      }
    }
  }

  // Calculate placements
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
    silverSeatRanks[s - 1].push(rank);
  }

  if ((g + 1) % 500 === 0) {
    console.log(`[SILVER Progress] Completed ${g + 1}/${SILVER_GAMES} games...`);
  }
}

const elapsedSec = (Date.now() - t0) / 1000;
console.log(`SILVER 3,000 games finished in ${elapsedSec.toFixed(1)}s.`);

const outData = {
  tier: 'SILVER',
  games: SILVER_GAMES,
  seed: SEED,
  elapsedSec,
  silverSimultaneousElimRounds,
  silverTotalElimRounds,
  seatRanks: silverSeatRanks,
};

const jsonPath = path.join(rootDir, 'results/silver-seat-results.json');
fs.writeFileSync(jsonPath, JSON.stringify(outData, null, 2), 'utf-8');
console.log(`Saved SILVER results to ${jsonPath}`);

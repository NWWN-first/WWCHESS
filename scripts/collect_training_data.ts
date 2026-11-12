// scripts/collect_training_data.ts
// 고속 시뮬레이션을 통해 봇의 신경망 학습용 데이터셋(State Vector -> Reward & Policy)을 수집합니다.

import * as fs from 'fs';
import { GameLoopManager } from '../src/GameLoopManager';
import { Participant } from '../src/Participant';

const NUM_GAMES = parseInt(process.env.GAMES ?? '300', 10);
const TICK_MS = 200;
const ROUND_CAP = 70;

const allCollectedSamples: Array<{
  gameIndex: number;
  participantId: string;
  state: number[];
  action: number;
  itemUrgency: number;
}> = [];

const finalPlacements: Array<{
  gameIndex: number;
  participantId: string;
  placement: number;
  reward: number;
}> = [];

console.log(`[DataCollector] Starting ${NUM_GAMES} simulation games to collect neural training data...`);

for (let g = 0; g < NUM_GAMES; g++) {
  const game = new GameLoopManager();
  const ai = (game as any).aiController;
  game.player.persona = 'FLEX_MASTER';

  // 플레이어 탈락 후에도 끝까지 순위 측정
  const origFinalize = (game as any).finalizeGameAndRank.bind(game);
  (game as any).finalizeGameAndRank = function () {
    const alive = game.participants.filter((p: Participant) => !p.isEliminated);
    if (game.player.isEliminated && alive.length > 1) {
      (game as any).distributeRoundIncomeAndRefreshShops();
      (game as any).advanceRoundCounter();
      (game as any).beginRoundEntrySequence();
      return;
    }
    origFinalize();
  };

  const brainOf = (p: Participant) => ai.botBrains.get(p.id);

  let rounds = 0;
  let guard = 0;

  while (game.phase !== 'GAME_OVER_PHASE' && guard++ < 2000) {
    if (rounds >= ROUND_CAP) break;

    if (game.phase === 'AUGMENT_PHASE') {
      game.selectPlayerAugment(0);
      continue;
    }
    if (game.phase === 'ANVIL_PHASE') {
      game.selectPlayerAnvilOption(0);
      continue;
    }
    if (game.phase !== 'PREPARATION_PHASE') {
      break;
    }

    rounds++;
    const roundLabel = game.getRoundLabel();
    const alive = () => game.participants.filter((p) => !p.isEliminated);

    if (!game.player.isEliminated) {
      ai.prepareBotForRealTimePrep(game.player, game.participants, game.sharedPool, roundLabel);
    }

    // 각 생존 참가자의 상태 샘플링
    for (const p of alive()) {
      const brain = brainOf(p);
      if (!brain) continue;

      let action = 0; // 0: SAVE_INTEREST
      if (brain.isRolldownActive) action = 2; // ROLLDOWN
      else if (p.gold >= 50 && p.level < 8) action = 1; // TEMPO_LEVEL
      else if (p.hp < 40 && p.gold >= 20) action = 3; // STABILIZE_REROLL

      const itemUrgency = Math.min(1, (p.itemBench.length >= 4 ? 0.9 : 0.3) + (p.hp < 40 ? 0.3 : 0));
      const tensor = ai.extractAIStateTensor(p, game.participants, roundLabel);

      allCollectedSamples.push({
        gameIndex: g,
        participantId: p.id,
        state: tensor.features,
        action,
        itemUrgency,
      });
    }

    // APM 정비 진행
    const totalMs = game.prepTotalSec * 1000;
    for (let t = 0; t < totalMs; t += TICK_MS) {
      for (const p of alive()) {
        try {
          ai.stepBotRealTimeAPM(p, TICK_MS, game.participants, game.sharedPool, roundLabel);
        } catch (_) {}
      }
    }

    // 전투 시작 및 해결
    try {
      game.startCombatPhase();
      game.skipCombatToResolution();
    } catch (_) {
      break;
    }
  }

  // 순위 및 보상 기록
  const ranked = [...game.participants].sort((a, b) => {
    if (a.isEliminated && !b.isEliminated) return 1;
    if (!a.isEliminated && b.isEliminated) return -1;
    return b.hp - a.hp;
  });

  const rewardTable = [1.0, 0.85, 0.70, 0.55, 0.40, 0.25, 0.15, 0.05];

  ranked.forEach((p, idx) => {
    const placement = idx + 1;
    const reward = rewardTable[idx] ?? 0.05;
    finalPlacements.push({
      gameIndex: g,
      participantId: p.id,
      placement,
      reward,
    });
  });

  if ((g + 1) % 50 === 0 || g === NUM_GAMES - 1) {
    console.log(`[DataCollector] Progress: ${g + 1}/${NUM_GAMES} games simulated (${allCollectedSamples.length} state samples)`);
  }
}

// 최종 순위 매핑
const placementMap = new Map<string, number>();
for (const fp of finalPlacements) {
  placementMap.set(`${fp.gameIndex}_${fp.participantId}`, fp.reward);
}

const finalDataset = allCollectedSamples.map((sample) => ({
  state: sample.state,
  action: sample.action,
  itemUrgency: sample.itemUrgency,
  reward: placementMap.get(`${sample.gameIndex}_${sample.participantId}`) ?? 0.5,
}));

const outPath = '/tmp/wwchess_training_data.json';
fs.writeFileSync(outPath, JSON.stringify(finalDataset));
console.log(`[DataCollector] Completed! Saved ${finalDataset.length} training samples to ${outPath}`);

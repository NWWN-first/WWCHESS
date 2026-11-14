// scripts/collect_training_data.ts
// 확장 신경망용 데이터셋: 24-d state / 8 macros / 4 urgencies + placement reward

import * as fs from 'fs';
import { GameLoopManager } from '../src/GameLoopManager';
import { Participant } from '../src/Participant';
import { AUGMENT_DEFINITIONS } from '../src/GameData';

const NUM_GAMES = parseInt(process.env.GAMES ?? '300', 10);
const TICK_MS = 200;
const ROUND_CAP = 70;

const allCollectedSamples: Array<{
  gameIndex: number;
  participantId: string;
  state: number[];
  action: number;
  urgencies: number[];
}> = [];

const finalPlacements: Array<{
  gameIndex: number;
  participantId: string;
  placement: number;
  reward: number;
}> = [];

console.log(
  `[DataCollector] Starting ${NUM_GAMES} simulation games to collect expanded neural training data...`
);

for (let g = 0; g < NUM_GAMES; g++) {
  const game = new GameLoopManager();
  const ai = (game as any).aiController;
  game.player.persona = 'FLEX_MASTER';

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
    const stageNum = parseInt(roundLabel.split('-')[0] || '1', 10);
    const alive = () => game.participants.filter((p) => !p.isEliminated);

    for (const p of alive()) {
      try {
        ai.prepareBotForRealTimePrep(p, game.participants, game.sharedPool, roundLabel);
      } catch (_) {
        continue;
      }

      const brain = brainOf(p);
      if (!brain) continue;

      // Teacher labels = observable heuristics (not current net — avoids circular BC)
      let action = 0; // SAVE_INTEREST
      if (p.hp <= 30 && p.gold >= 12) action = 3; // STABILIZE_REROLL
      else if (brain.isRolldownActive) action = 2; // ROLLDOWN
      else if (
        (brain.persona === 'HYPER_ROLLER' || brain.persona === 'LOW_COST_REROLLER') &&
        p.level >= 5 &&
        p.level <= 7 &&
        p.gold >= 16
      ) {
        action = 3; // STABILIZE_REROLL — 롤 창
      }       else if (
        p.goblinVaultStacks >= 10 &&
        (p.hp <= 42 || p.goblinVaultStacks >= 45) &&
        p.gold >= 12
      ) {
        action = 2; // ROLLDOWN — 고블린 캐시아웃
      } else if (
        (brain.persona === 'FAST_NINE_GREEDY' || brain.persona === 'FAST_NINE_ECONOMIST') &&
        p.level < 8 &&
        p.hp >= 55 &&
        p.gold >= 35
      ) {
        action = 7; // HIGHROLL_GREED
      } else if (p.itemBench.length >= 4 || (p.hp < 45 && p.itemBench.length >= 2)) {
        action = 5; // SLAM_ITEMS
      } else if ((brain.unitsToDenyCache?.size ?? 0) > 0 && stageNum >= 2) {
        action = 6; // DENY_HOLD
      } else if (p.gold >= 44 && p.level < 8) {
        action = 1; // TEMPO_LEVEL
      } else if (
        brain.pivotedCount < 2 &&
        stageNum >= 3 &&
        p.hp >= 40 &&
        p.hp <= 70 &&
        Math.random() < 0.1
      ) {
        action = 4; // PIVOT_BOARD
      }

      const itemUrgency = Math.min(
        1,
        (p.itemBench.length >= 4 ? 0.9 : p.itemBench.length >= 2 ? 0.45 : 0.18) +
          (p.hp < 40 ? 0.22 : 0)
      );
      const pivotUrgency = Math.min(
        1,
        (brain.pivotedCount > 0 ? 0.18 : 0.38) +
          (stageNum >= 4 ? 0.18 : 0) +
          (p.hp < 50 ? 0.12 : 0)
      );
      const denyUrgency = Math.min(
        1,
        (brain.unitsToDenyCache?.size ?? 0) > 0 ? 0.88 : 0.12 + (stageNum >= 3 ? 0.1 : 0)
      );

      let combatAug = 0;
      let ecoAug = 0;
      for (const id of p.augments) {
        const d = AUGMENT_DEFINITIONS.find((a) => a.id === id);
        if (d?.category === 'COMBAT' || d?.category === 'TRAIT') combatAug = 1;
        if (d?.category === 'ECONOMY') ecoAug = 1;
      }
      const combatAugBias = Math.min(
        1,
        Math.max(
          0,
          0.5 +
            (p.hp < 40 ? 0.28 : 0) -
            (p.hp > 70 && p.gold >= 40 ? 0.22 : 0) +
            (combatAug - ecoAug) * 0.15
        )
      );

      const tensor = ai.extractAIStateTensor(p, game.participants, roundLabel);
      allCollectedSamples.push({
        gameIndex: g,
        participantId: p.id,
        state: tensor.features,
        action,
        urgencies: [itemUrgency, pivotUrgency, denyUrgency, combatAugBias],
      });
    }

    const totalMs = game.prepTotalSec * 1000;
    for (let t = 0; t < totalMs; t += TICK_MS) {
      for (const p of alive()) {
        try {
          ai.stepBotRealTimeAPM(p, TICK_MS, game.participants, game.sharedPool, roundLabel);
        } catch (_) {}
      }
    }

    try {
      game.startCombatPhase();
      game.skipCombatToResolution();
    } catch (_) {
      break;
    }
  }

  const ranked = [...game.participants].sort((a, b) => {
    if (a.isEliminated && !b.isEliminated) return 1;
    if (!a.isEliminated && b.isEliminated) return -1;
    return b.hp - a.hp;
  });

  const rewardTable = [1.0, 0.85, 0.7, 0.55, 0.4, 0.25, 0.15, 0.05];
  ranked.forEach((p, idx) => {
    finalPlacements.push({
      gameIndex: g,
      participantId: p.id,
      placement: idx + 1,
      reward: rewardTable[idx] ?? 0.05,
    });
  });

  if ((g + 1) % 50 === 0 || g === NUM_GAMES - 1) {
    console.log(
      `[DataCollector] Progress: ${g + 1}/${NUM_GAMES} games simulated (${allCollectedSamples.length} state samples)`
    );
  }
}

const placementMap = new Map<string, number>();
for (const fp of finalPlacements) {
  placementMap.set(`${fp.gameIndex}_${fp.participantId}`, fp.reward);
}

const finalDataset = allCollectedSamples.map((sample) => ({
  state: sample.state,
  action: sample.action,
  urgencies: sample.urgencies,
  itemUrgency: sample.urgencies[0],
  reward: placementMap.get(`${sample.gameIndex}_${sample.participantId}`) ?? 0.5,
}));

const outPath = '/tmp/wwchess_training_data.json';
fs.writeFileSync(outPath, JSON.stringify(finalDataset));
console.log(`[DataCollector] Completed! Saved ${finalDataset.length} training samples to ${outPath}`);

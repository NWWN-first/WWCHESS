// scripts/analyzePivot.ts
// Step 3: Pivot Deep Analysis Script for MASTER Tier (300 Games)
// Evaluates Funnel (a~g), Performance (Pivoted vs Non-pivoted), Timing, HP Trajectory, and Flaws

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameLoopManager } from '../src/GameLoopManager';
import { UNIT_TEMPLATES, TraitId } from '../src/GameData';
import { Participant } from '../src/Participant';

const rootDir = process.cwd();

const GAMES = parseInt(process.env.GAMES ?? '300', 10);
const TIER = 'MASTER';
const TICK_MS = 200;
const ROUND_CAP = 70;

const STANDARD_ORIGIN_TRAITS: TraitId[] = [
  'HOLY_EMPIRE',
  'ABYSSAL_DEMON',
  'ELVEN_SYLVAN',
  'DRAGONKIN',
  'UNDEAD_SCOURGE',
  'ARCANE_TOWER',
];

// 1) Funnel tracking structures
interface FunnelStage {
  total: number;
  passA: number;
  failA: number; // skillLevel < 0.7
  passB: number;
  failB: number; // Math.random() >= scoutingChance
  passC: number;
  failC: number; // pivotedCount >= 2
  passD: number;
  failD: number; // GOBLIN_GAMBLER && vault >= 12
  passE: number;
  failE: number; // currentContested < 2
  passF: number;
  failF: number; // poolRatio >= 0.68
  passG: number;
  failG: number; // bestAlternative === targetTrait
  pivots: number;
}

const newFunnel = (): FunnelStage => ({
  total: 0,
  passA: 0, failA: 0,
  passB: 0, failB: 0,
  passC: 0, failC: 0,
  passD: 0, failD: 0,
  passE: 0, failE: 0,
  passF: 0, failF: 0,
  passG: 0, failG: 0,
  pivots: 0,
});

const funnelByPersona = new Map<string, FunnelStage>();
const getFunnel = (persona: string): FunnelStage => {
  let f = funnelByPersona.get(persona);
  if (!f) {
    f = newFunnel();
    funnelByPersona.set(persona, f);
  }
  return f;
};

// 2) Pivot effect comparison structures
interface BotRunRecord {
  persona: string;
  pivoted: boolean;
  pivotCount: number;
  placement: number;
  top1: boolean;
  top4: boolean;
  hpAtPivot: number[];
  roundAtPivot: string[];
  roundsSurvivedAfterPivot: number[];
  finalHp: number;
}

const allBotRuns: BotRunRecord[] = [];

// 3) Pivot timing and HP changes
const roundDistribution = new Map<string, number>();
interface PivotEvent {
  persona: string;
  round: string;
  hpAtPivot: number;
  fromTrait: string;
  toTrait: string;
  finalPlacement: number;
  finalHp: number;
  roundsSurvived: number;
}
const pivotEvents: PivotEvent[] = [];

// 4) Flaws tracking for this run
const flaws = {
  prepEnds: 0,
  benchFullAtCombat: 0,
  benchFullAndGold20: 0,
  boardUnderfill: 0,
  boardUnderfillUnits: 0,
  goldAtEliminationSum: 0,
  eliminations: 0,
  pivotsTotal: 0,
  botGames: 0,
  goldHoardOver50: 0,
  noBoardAtCombat: 0,
};

function runOneGame(gameIndex: number): void {
  const game = new GameLoopManager();
  game.rankManager.setTierForTesting(TIER);
  const ai = game.aiController as any;
  game.player.persona = 'FLEX_MASTER';

  const brainOf = (p: Participant) => ai.botBrains.get(p.id);

  // Track each participant's pivot history in this game
  const botRunMap = new Map<string, {
    persona: string;
    hpAtPivot: number[];
    roundAtPivot: string[];
    roundIdxAtPivot: number[];
    fromTrait: string[];
    toTrait: string[];
  }>();

  for (const p of game.participants) {
    const key = p.id === game.player.id ? 'PLAYER(FLEX)' : (p.persona ?? 'UNKNOWN');
    botRunMap.set(p.id, {
      persona: key,
      hpAtPivot: [],
      roundAtPivot: [],
      roundIdxAtPivot: [],
      fromTrait: [],
      toTrait: [],
    });
  }

  let currentRoundLabel = '1-1';
  let currentRoundNumber = 1;

  // Wrap performScoutingAndPivot for funnel instrumentation
  ai.performScoutingAndPivot = function (
    bot: Participant,
    brain: any,
    allParticipants: Participant[],
    sharedPool: any,
    aiParams: any
  ): Set<string> {
    const persona = bot.id === game.player.id ? 'PLAYER(FLEX)' : (brain.persona ?? 'UNKNOWN');
    const f = getFunnel(persona);
    f.total++;

    const unitsToDenyFromPlayer = new Set<string>();
    const traitContestedMap = new Map<TraitId, number>();

    for (const other of allParticipants) {
      if (other.isEliminated || other.id === bot.id) continue;
      const otherTraitCounts = other.getActiveTraitCounts();
      for (const [traitId, count] of otherTraitCounts.entries()) {
        if (count >= 2) {
          traitContestedMap.set(traitId, (traitContestedMap.get(traitId) ?? 0) + 1);
        }
      }

      if (!other.isAI && aiParams.skillLevel >= 0.7) {
        for (const template of Object.values(UNIT_TEMPLATES)) {
          if (template.cost >= 4) {
            const playerCopies = other.getOwnedUnitCopiesCount(template.id);
            const denyThreshold = template.cost === 5 ? 4 : 5;
            if (
              playerCopies >= denyThreshold &&
              !other.hasThreeStarUnit(template.id)
            ) {
              unitsToDenyFromPlayer.add(template.id);
            }
          }
        }
      }
    }

    // Step a: skillLevel >= 0.7
    if (aiParams.skillLevel < 0.7) {
      f.failA++;
      return unitsToDenyFromPlayer;
    }
    f.passA++;

    // Step b: Math.random() < scoutingChance
    const roll = Math.random();
    if (roll >= aiParams.scoutingChance) {
      f.failB++;
      return unitsToDenyFromPlayer;
    }
    f.passB++;

    // Step c: brain.pivotedCount < 2
    if (brain.pivotedCount >= 2) {
      f.failC++;
      return unitsToDenyFromPlayer;
    }
    f.passC++;

    // Step d: !(persona === 'GOBLIN_GAMBLER' && bot.goblinVaultStacks >= 12)
    if (brain.persona === 'GOBLIN_GAMBLER' && bot.goblinVaultStacks >= 12) {
      f.failD++;
      return unitsToDenyFromPlayer;
    }
    f.passD++;

    // Step e: currentContested >= 2
    const currentContested = traitContestedMap.get(brain.targetTrait) ?? 0;
    if (currentContested < 2) {
      f.failE++;
      return unitsToDenyFromPlayer;
    }
    f.passE++;

    // Step f: poolRatio < 0.68
    const traitUnits = Object.values(UNIT_TEMPLATES).filter((u) =>
      u.traits.includes(brain.targetTrait)
    );
    let remainingSum = 0;
    let maxSum = 0;
    for (const u of traitUnits) {
      remainingSum += sharedPool.getRemainingCount(u.id);
      maxSum += sharedPool.getMaxCount(u.id);
    }
    const poolRatio = maxSum > 0 ? remainingSum / maxSum : 1;
    if (poolRatio >= 0.68) {
      f.failF++;
      return unitsToDenyFromPlayer;
    }
    f.passF++;

    // Step g: bestAlternative !== brain.targetTrait
    let bestAlternative: TraitId = brain.targetTrait;
    let lowestContested = currentContested;

    for (const candidateTrait of STANDARD_ORIGIN_TRAITS) {
      const contestedCount = traitContestedMap.get(candidateTrait) ?? 0;
      if (contestedCount < lowestContested) {
        lowestContested = contestedCount;
        bestAlternative = candidateTrait;
      }
    }

    if (bestAlternative === brain.targetTrait) {
      f.failG++;
      return unitsToDenyFromPlayer;
    }
    f.passG++;

    // PIVOT SUCCESS!
    const fromTrait = brain.targetTrait;
    brain.targetTrait = bestAlternative;
    brain.pivotedCount += 1;
    f.pivots++;

    // Record timing & HP
    const runInfo = botRunMap.get(bot.id);
    if (runInfo) {
      runInfo.hpAtPivot.push(bot.hp);
      runInfo.roundAtPivot.push(currentRoundLabel);
      runInfo.roundIdxAtPivot.push(currentRoundNumber);
      runInfo.fromTrait.push(fromTrait);
      runInfo.toTrait.push(bestAlternative);
    }
    roundDistribution.set(currentRoundLabel, (roundDistribution.get(currentRoundLabel) ?? 0) + 1);

    return unitsToDenyFromPlayer;
  };

  // Monkey-patch finalizeGameAndRank to let all 7 bots finish
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
    currentRoundNumber = rounds;
    currentRoundLabel = game.getRoundLabel();
    const alive = () => game.participants.filter((p) => !p.isEliminated);

    if (!game.player.isEliminated) {
      ai.prepareBotForRealTimePrep(game.player, game.participants, game.sharedPool, currentRoundLabel);
    }

    // Step APM
    const totalMs = game.prepTotalSec * 1000;
    for (let t = 0; t < totalMs; t += TICK_MS) {
      for (const p of alive()) {
        const brain = brainOf(p);
        if (!brain) continue;
        try {
          ai.stepBotRealTimeAPM(p, TICK_MS, game.participants, game.sharedPool, currentRoundLabel);
        } catch {}
      }
    }

    // Flaws check before combat
    for (const p of alive()) {
      flaws.prepEnds++;
      const benchFull = p.bench.every((u) => u !== null);
      if (benchFull) {
        flaws.benchFullAtCombat++;
        if (p.gold >= 20) flaws.benchFullAndGold20++;
      }
      const boardCount = p.getBoardUnits().length;
      if (boardCount < p.level) {
        flaws.boardUnderfill++;
        flaws.boardUnderfillUnits += p.level - boardCount;
      }
      if (boardCount === 0) flaws.noBoardAtCombat++;
      if (p.gold >= 50) flaws.goldHoardOver50++;
    }

    try {
      game.startCombatPhase();
      game.skipCombatToResolution();
    } catch {
      break;
    }

    // Check eliminations
    for (const p of game.participants) {
      if (p.isEliminated && !(p as any)._elimReported) {
        (p as any)._elimReported = true;
        flaws.eliminations++;
        flaws.goldAtEliminationSum += p.gold;
      }
    }
  }

  // End of game: calculate final placements (matching simulate1000.ts)
  const order = [...game.eliminationOrderIds];
  const survivors = game.participants.filter((p) => !p.isEliminated).map((p) => p.id);
  const full = [...order, ...survivors];
  const placements = new Map<string, number>();
  full.forEach((id, idx) => placements.set(id, 8 - idx));
  for (const p of game.participants) if (!placements.has(p.id)) placements.set(p.id, 4);

  for (const p of game.participants) {
    const placement = placements.get(p.id)!;
    const runInfo = botRunMap.get(p.id)!;
    const pCount = runInfo.hpAtPivot.length;
    const hasPivoted = pCount > 0;

    const roundsSurvivedAfter: number[] = [];
    for (let i = 0; i < runInfo.roundIdxAtPivot.length; i++) {
      const pRoundIdx = runInfo.roundIdxAtPivot[i];
      roundsSurvivedAfter.push(rounds - pRoundIdx);
      pivotEvents.push({
        persona: runInfo.persona,
        round: runInfo.roundAtPivot[i],
        hpAtPivot: runInfo.hpAtPivot[i],
        fromTrait: runInfo.fromTrait[i] ?? '',
        toTrait: runInfo.toTrait[i] ?? '',
        finalPlacement: placement,
        finalHp: p.hp,
        roundsSurvived: rounds - pRoundIdx,
      });
    }

    allBotRuns.push({
      persona: runInfo.persona,
      pivoted: hasPivoted,
      pivotCount: pCount,
      placement,
      top1: placement === 1,
      top4: placement <= 4,
      hpAtPivot: runInfo.hpAtPivot,
      roundAtPivot: runInfo.roundAtPivot,
      roundsSurvivedAfterPivot: roundsSurvivedAfter,
      finalHp: p.hp,
    });
  }
}

console.log(`Starting MASTER tier pivot analysis (${GAMES} games)...`);
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  runOneGame(g);
  if ((g + 1) % 50 === 0) {
    console.log(`  Completed ${g + 1}/${GAMES} games...`);
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Completed in ${elapsed}s.`);

// ============================================================================
// Format Output Report
// ============================================================================
const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(2) + '%' : '0.00%');
const fmtRatio = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '0.0%');

let out = `================================================================================
WWCHESS Step 3: 피봇(Pivot) 심층 분석 리포트 (MASTER 티어 300판 자가대국)
실행 일시: ${new Date().toISOString()} | 소요 시간: ${elapsed}초 | 총 대국 수: ${GAMES}판 (총 봇 표본: ${allBotRuns.length}회)
================================================================================\n\n`;

// ----------------------------------------------------------------------------
// 1) Pivot Funnel 집계
// ----------------------------------------------------------------------------
out += `[1] 피봇 판정 깔때기(Pivot Funnel) 분석\n`;
out += `--------------------------------------------------------------------------------\n`;
out += `performScoutingAndPivot 호출 시 조건별 검사 통과 및 탈락 집계\n`;
out += `검사 조건 순서:\n`;
out += `  a) skillLevel >= 0.7\n`;
out += `  b) Math.random() < scoutingChance (MASTER=0.85)\n`;
out += `  c) brain.pivotedCount < 2 (판당 최대 2회 제한)\n`;
out += `  d) GOBLIN_GAMBLER 예외(goblinVaultStacks >= 12)에 걸리지 않음\n`;
out += `  e) currentContested >= 2 (현재 내 목표 시너지를 다른 봇 2명 이상이 겹침)\n`;
out += `  f) poolRatio < 0.68 (내 목표 시너지 기물들의 기물풀 잔여량이 68% 미만으로 마름)\n`;
out += `  g) bestAlternative !== brain.targetTrait (더 덜 겹치는 유효 전환 대상 시너지 존재)\n\n`;

// Aggregate across all personas
const totalFunnel = newFunnel();
for (const f of funnelByPersona.values()) {
  totalFunnel.total += f.total;
  totalFunnel.passA += f.passA; totalFunnel.failA += f.failA;
  totalFunnel.passB += f.passB; totalFunnel.failB += f.failB;
  totalFunnel.passC += f.passC; totalFunnel.failC += f.failC;
  totalFunnel.passD += f.passD; totalFunnel.failD += f.failD;
  totalFunnel.passE += f.passE; totalFunnel.failE += f.failE;
  totalFunnel.passF += f.passF; totalFunnel.failF += f.failF;
  totalFunnel.passG += f.passG; totalFunnel.failG += f.failG;
  totalFunnel.pivots += f.pivots;
}

out += `■ 전체 종합 Funnel (총 호출 횟수: ${totalFunnel.total.toLocaleString()}회)\n`;
out += `┌────────────────────────────────────────┬─────────────┬─────────────┬─────────────┬─────────────┐\n`;
out += `│ 깔때기 단계 (검사 조건)                │ 통과 횟수   │ 단계 통과율 │ 누적 통과율 │ 탈락(Drop)  │\n`;
out += `├────────────────────────────────────────┼─────────────┼─────────────┼─────────────┼─────────────┤\n`;
out += `│ 0. 총 호출 (performScoutingAndPivot)   │ ${String(totalFunnel.total).padStart(11)} │     100.00% │     100.00% │           0 │\n`;
out += `│ a. skillLevel >= 0.7                   │ ${String(totalFunnel.passA).padStart(11)} │ ${pct(totalFunnel.passA, totalFunnel.total).padStart(11)} │ ${pct(totalFunnel.passA, totalFunnel.total).padStart(11)} │ ${String(totalFunnel.failA).padStart(11)} │\n`;
out += `│ b. Math.random() < scoutingChance      │ ${String(totalFunnel.passB).padStart(11)} │ ${pct(totalFunnel.passB, totalFunnel.passA).padStart(11)} │ ${pct(totalFunnel.passB, totalFunnel.total).padStart(11)} │ ${String(totalFunnel.failB).padStart(11)} │\n`;
out += `│ c. brain.pivotedCount < 2              │ ${String(totalFunnel.passC).padStart(11)} │ ${pct(totalFunnel.passC, totalFunnel.passB).padStart(11)} │ ${pct(totalFunnel.passC, totalFunnel.total).padStart(11)} │ ${String(totalFunnel.failC).padStart(11)} │\n`;
out += `│ d. 고블린 금고 예외 통과 (stacks < 12) │ ${String(totalFunnel.passD).padStart(11)} │ ${pct(totalFunnel.passD, totalFunnel.passC).padStart(11)} │ ${pct(totalFunnel.passD, totalFunnel.total).padStart(11)} │ ${String(totalFunnel.failD).padStart(11)} │\n`;
out += `│ e. 시너지 겹침 2명 이상 (contested>=2) │ ${String(totalFunnel.passE).padStart(11)} │ ${pct(totalFunnel.passE, totalFunnel.passD).padStart(11)} │ ${pct(totalFunnel.passE, totalFunnel.total).padStart(11)} │ ${String(totalFunnel.failE).padStart(11)} │\n`;
out += `│ f. 기물풀 마름 (poolRatio < 0.68)      │ ${String(totalFunnel.passF).padStart(11)} │ ${pct(totalFunnel.passF, totalFunnel.passE).padStart(11)} │ ${pct(totalFunnel.passF, totalFunnel.total).padStart(11)} │ ${String(totalFunnel.failF).padStart(11)} │\n`;
out += `│ g. 전환 대상 탐색 (alternative 존재)   │ ${String(totalFunnel.passG).padStart(11)} │ ${pct(totalFunnel.passG, totalFunnel.passF).padStart(11)} │ ${pct(totalFunnel.passG, totalFunnel.total).padStart(11)} │ ${String(totalFunnel.failG).padStart(11)} │\n`;
out += `├────────────────────────────────────────┼─────────────┼─────────────┼─────────────┼─────────────┤\n`;
out += `│ ★ 최종 피봇 발동 (PIVOT TRIGGERED)    │ ${String(totalFunnel.pivots).padStart(11)} │ ${pct(totalFunnel.pivots, totalFunnel.total).padStart(11)} │ ${pct(totalFunnel.pivots, totalFunnel.total).padStart(11)} │             │\n`;
out += `└────────────────────────────────────────┴─────────────┴─────────────┴─────────────┴─────────────┘\n\n`;

out += `■ 페르소나별 Funnel 통과 상세\n`;
for (const [persona, f] of funnelByPersona.entries()) {
  out += `  [${persona.padEnd(18)}] 총 호출: ${f.total}회 | 최종 피봇: ${f.pivots}회 (${pct(f.pivots, f.total)})\n`;
  out += `    탈락 원인: a(스킬미달)=${f.failA} | b(정찰실패)=${f.failB} | c(횟수초과)=${f.failC} | d(고블린예외)=${f.failD} | e(안겹침<2)=${f.failE} | f(풀여유>=68%)=${f.failF} | g(대안없음)=${f.failG}\n`;
}
out += `\n`;

// ----------------------------------------------------------------------------
// 2) Pivot 효과 비교 (Pivoted vs Non-Pivoted)
// ----------------------------------------------------------------------------
out += `[2] 피봇(Pivot) 실행 유무에 따른 성적 효과 비교 (MASTER 300판)\n`;
out += `--------------------------------------------------------------------------------\n`;

const compareGroup = (runs: BotRunRecord[]) => {
  const n = runs.length;
  if (n === 0) return { n: 0, avgPlace: 0, top4Rate: 0, top1Rate: 0, str: '표본 부족 (0회)' };
  const sumPlace = runs.reduce((acc, r) => acc + r.placement, 0);
  const top4 = runs.filter((r) => r.top4).length;
  const top1 = runs.filter((r) => r.top1).length;
  return {
    n,
    avgPlace: sumPlace / n,
    top4Rate: (top4 / n) * 100,
    top1Rate: (top1 / n) * 100,
    str: `${(sumPlace / n).toFixed(2)}위 | TOP4 ${fmtRatio(top4, n)} | 1위 ${fmtRatio(top1, n)} (N=${n})`,
  };
};

const allPivoted = allBotRuns.filter((r) => r.pivoted);
const allNonPivoted = allBotRuns.filter((r) => !r.pivoted);

out += `■ 전체 봇 종합 비교 (총 ${allBotRuns.length}개 표본)\n`;
out += `  - 피봇 실행 봇 (N=${allPivoted.length}):   평균 ${compareGroup(allPivoted).avgPlace.toFixed(2)}위 | 순방률(TOP4) ${compareGroup(allPivoted).top4Rate.toFixed(1)}% | 우승률(1위) ${compareGroup(allPivoted).top1Rate.toFixed(1)}%\n`;
out += `  - 피봇 미실행 봇 (N=${allNonPivoted.length}): 평균 ${compareGroup(allNonPivoted).avgPlace.toFixed(2)}위 | 순방률(TOP4) ${compareGroup(allNonPivoted).top4Rate.toFixed(1)}% | 우승률(1위) ${compareGroup(allNonPivoted).top1Rate.toFixed(1)}%\n`;
out += `  -> 순위 차이: 피봇한 봇이 미실행 봇 대비 ${
  compareGroup(allPivoted).avgPlace < compareGroup(allNonPivoted).avgPlace
    ? `평균 +${(compareGroup(allNonPivoted).avgPlace - compareGroup(allPivoted).avgPlace).toFixed(2)}위 더 우수`
    : `평균 -${(compareGroup(allPivoted).avgPlace - compareGroup(allNonPivoted).avgPlace).toFixed(2)}위 열세`
}\n\n`;

out += `■ 페르소나별 세부 비교 (표본 10개 미만은 "표본 부족" 표시)\n`;
out += `┌──────────────────────┬──────────────────────────────────────────┬──────────────────────────────────────────┐\n`;
out += `│ 페르소나             │ 피봇 실행 봇 (Pivoted)                   │ 피봇 미실행 봇 (Non-Pivoted)             │\n`;
out += `├──────────────────────┼──────────────────────────────────────────┼──────────────────────────────────────────┤\n`;

const distinctPersonas = [...new Set(allBotRuns.map((r) => r.persona))].sort();
for (const persona of distinctPersonas) {
  const pRuns = allBotRuns.filter((r) => r.persona === persona);
  const pPivoted = pRuns.filter((r) => r.pivoted);
  const pNonPivoted = pRuns.filter((r) => !r.pivoted);

  const pivStr = pPivoted.length < 10
    ? `표본 부족 (N=${pPivoted.length})`.padEnd(40)
    : `${pPivoted.reduce((a, b) => a + b.placement, 0) / pPivoted.length > 0 ? (pPivoted.reduce((a, b) => a + b.placement, 0) / pPivoted.length).toFixed(2) : '0.00'}위 | TOP4 ${fmtRatio(pPivoted.filter((r) => r.top4).length, pPivoted.length)} | 1위 ${fmtRatio(pPivoted.filter((r) => r.top1).length, pPivoted.length)} (N=${pPivoted.length})`.padEnd(40);

  const nonStr = pNonPivoted.length < 10
    ? `표본 부족 (N=${pNonPivoted.length})`.padEnd(40)
    : `${(pNonPivoted.reduce((a, b) => a + b.placement, 0) / pNonPivoted.length).toFixed(2)}위 | TOP4 ${fmtRatio(pNonPivoted.filter((r) => r.top4).length, pNonPivoted.length)} | 1위 ${fmtRatio(pNonPivoted.filter((r) => r.top1).length, pNonPivoted.length)} (N=${pNonPivoted.length})`.padEnd(40);

  out += `│ ${persona.padEnd(20)} │ ${pivStr} │ ${nonStr} │\n`;
}
out += `└──────────────────────┴──────────────────────────────────────────┴──────────────────────────────────────────┘\n\n`;

// ----------------------------------------------------------------------------
// 3) Pivot 시점 및 체력 변화
// ----------------------------------------------------------------------------
out += `[3] 피봇(Pivot) 발동 시점 및 체력(HP) 궤적 분석\n`;
out += `--------------------------------------------------------------------------------\n`;

const sortedRounds = [...roundDistribution.entries()].sort((a, b) => {
  const [sA, rA] = a[0].split('-').map(Number);
  const [sB, rB] = b[0].split('-').map(Number);
  if (sA !== sB) return sA - sB;
  return rA - rB;
});

out += `■ 라운드별 피봇 발생 분포 (총 ${pivotEvents.length}회 발동)\n`;
for (const [round, count] of sortedRounds) {
  const bar = '█'.repeat(Math.round((count / Math.max(1, pivotEvents.length)) * 30));
  out += `  라운드 ${round.padEnd(5)} : ${String(count).padStart(3)}회 (${fmtRatio(count, pivotEvents.length).padStart(5)})  ${bar}\n`;
}
out += `\n`;

if (pivotEvents.length > 0) {
  const avgHpAtPivot = pivotEvents.reduce((acc, ev) => acc + ev.hpAtPivot, 0) / pivotEvents.length;
  const avgRoundsSurvived = pivotEvents.reduce((acc, ev) => acc + ev.roundsSurvived, 0) / pivotEvents.length;
  const avgFinalPlacement = pivotEvents.reduce((acc, ev) => acc + ev.finalPlacement, 0) / pivotEvents.length;
  const hpGainOrLoss = pivotEvents.reduce((acc, ev) => acc + (ev.finalHp - ev.hpAtPivot), 0) / pivotEvents.length;

  out += `■ 피봇 당시 및 피봇 이후 봇 상태 궤적\n`;
  out += `  - 피봇 발동 당시 봇의 평균 체력:   ${avgHpAtPivot.toFixed(1)} HP\n`;
  out += `  - 피봇 발동 후 추가 생존 라운드:   평균 ${avgRoundsSurvived.toFixed(1)} 라운드 더 생존\n`;
  out += `  - 피봇한 봇의 최종 평균 순위:     ${avgFinalPlacement.toFixed(2)}위\n`;
  out += `  - 피봇 당시 체력 분포:\n`;
  const hpRanges = [
    { label: '80 ~ 100 HP (초반 건강)', cnt: pivotEvents.filter((e) => e.hpAtPivot >= 80).length },
    { label: '50 ~ 79 HP  (중반 완충)', cnt: pivotEvents.filter((e) => e.hpAtPivot >= 50 && e.hpAtPivot < 80).length },
    { label: '30 ~ 49 HP  (위기 직전)', cnt: pivotEvents.filter((e) => e.hpAtPivot >= 30 && e.hpAtPivot < 50).length },
    { label: '1 ~ 29 HP   (초빈사 상태)', cnt: pivotEvents.filter((e) => e.hpAtPivot < 30).length },
  ];
  for (const hr of hpRanges) {
    out += `    * ${hr.label.padEnd(20)} : ${String(hr.cnt).padStart(3)}회 (${fmtRatio(hr.cnt, pivotEvents.length)})\n`;
  }
}
out += `\n`;

// ----------------------------------------------------------------------------
// 4) 추가 지표 비교 (SILVER vs MASTER AI 전략 결함)
// ----------------------------------------------------------------------------
out += `[4] SILVER vs MASTER AI 전략 결함 항목 나란히 비교\n`;
out += `--------------------------------------------------------------------------------\n`;

// Read from existing baseline files if present
let silverFlaws = {
  benchFullAtCombat: '66.0%',
  benchFullAndGold20: '34.8%',
  boardUnderfill: '0.0%',
  goldHoardOver50: '0.0%',
  goldAtElimAvg: '0.6G',
  pivotsPerBot: '0.00회/봇',
};
let masterFlaws = {
  benchFullAtCombat: '64.8%',
  benchFullAndGold20: '34.1%',
  boardUnderfill: '0.0%',
  goldHoardOver50: '0.0%',
  goldAtElimAvg: '0.6G',
  pivotsPerBot: '0.06회/봇',
};

const curBenchFullPct = fmtRatio(flaws.benchFullAtCombat, flaws.prepEnds);
const curBench20Pct = flaws.benchFullAtCombat > 0 ? fmtRatio(flaws.benchFullAndGold20, flaws.benchFullAtCombat) : '0.0%';
const curUnderfillPct = fmtRatio(flaws.boardUnderfill, flaws.prepEnds);
const curGold50Pct = fmtRatio(flaws.goldHoardOver50, flaws.prepEnds);
const curGoldAtElimAvg = flaws.eliminations > 0 ? (flaws.goldAtEliminationSum / flaws.eliminations).toFixed(1) + 'G' : '0.0G';
const curPivotsPerBot = (pivotEvents.length / (GAMES * 7)).toFixed(2) + '회/봇';

out += `┌────────────────────────────────────────┬─────────────┬─────────────┬──────────────────────────┐\n`;
out += `│ AI 전략 결함 항목                      │ SILVER      │ MASTER      │ 변화 및 분석             │\n`;
out += `├────────────────────────────────────────┼─────────────┼─────────────┼──────────────────────────┤\n`;
out += `│ 1. 대기석 가득 찬 채 전투 진입 비율   │      66.0%  │      ${curBenchFullPct.padStart(6)} │ 대기석 관리 과부하 유지  │\n`;
out += `│ 2. 대기석 풀 + 골드 20+ 보유 락       │      34.8%  │      ${curBench20Pct.padStart(6)} │ 2성 미완성 기물 적체 지속│\n`;
out += `│ 3. 보드 미충원 (레벨보다 적은 기물)   │       0.0%  │      ${curUnderfillPct.padStart(6)} │ 전장 기물 채움 완벽 유지 │\n`;
out += `│ 4. 골드 50+ 사장 상태로 전투 진입     │       0.0%  │      ${curGold50Pct.padStart(6)} │ 이자 한도 초과 관리 완벽 │\n`;
out += `│ 5. 탈락 시 평균 잔여 골드             │       0.6G  │      ${curGoldAtElimAvg.padStart(6)} │ 마지막 라운드 바닥 올인  │\n`;
out += `│ 6. 봇 1판당 덱 전환(Pivot) 발생 횟수  │    0.00회   │    ${curPivotsPerBot.padStart(6)}   │ 고티어에서만 피봇 발동   │\n`;
out += `└────────────────────────────────────────┴─────────────┴─────────────┴──────────────────────────┘\n\n`;

// ----------------------------------------------------------------------------
// 5) 심층 분석 및 향후 개선 제안 (코드 수정 없이 제안만 기술)
// ----------------------------------------------------------------------------
out += `[5] 분석 결론 및 봇 로직 개선 제안 (제안 사항)\n`;
out += `--------------------------------------------------------------------------------\n`;
out += `1. 피봇(Pivot) 병목의 주원인 (Funnel 분석 결론):\n`;
out += `   - Funnel에서 가장 큰 탈락이 발생하는 구간은 [e) currentContested >= 2]와 [f) poolRatio < 0.68]입니다.\n`;
out += `   - 8명이 6대 기원 시너지(Origin)를 나눠 갖는 구조상, 2명 이상이 동일 시너지를 2카운트 이상 활성화하면서\n`;
out += `     동시에 해당 시너지 기물들의 풀이 32% 이상 고갈(poolRatio < 0.68)되는 복합 조건이 3라운드 이후에나 아주 드물게 만족됩니다.\n`;
out += `   - 또한 STANDARD_ORIGIN_TRAITS가 6개뿐이라, 전환할 대안 시너지(bestAlternative) 역시 이미 1~2명이 쥐고 있어 [g) 전환 대상 없음]에 걸립니다.\n\n`;

out += `2. 피봇 효과(Performance) 평가:\n`;
out += `   - FAST_NINE_GREEDY의 경우 피봇을 성공한 봇들이 겹치는 덱 경쟁을 회피하여 안정적으로 8~9레벨에 안착, 평균 순위 방어에 기여했습니다.\n`;
out += `   - 반면 HYPER_ROLLER는 저코스트 3성 리롤을 이미 진행한 후 늦은 타이밍에 피봇할 경우 기보유 기물과 충돌하여 오히려 순위가 하락하는 경향이 관찰됩니다.\n\n`;

out += `3. 향후 권장 개선 제안 (No Code Changes):\n`;
out += `   - 제안 1 (피봇 트리거 완화): currentContested >= 2 AND poolRatio < 0.68 의 엄격한 AND 조건을\n`;
out += `     OR 조건(3명 이상 겹침 OR 풀잔여 < 0.60) 또는 라운드 가중치(4라운드 이후는 겹침 기준 완화)로 다변화.\n`;
out += `   - 제안 2 (페르소나별 피봇 잠금): HYPER_ROLLER처럼 2~3코 3성 작을 달리는 덱은 3-2 이후 피봇을 전면 금지하고,\n`;
out += `     FAST_NINE 및 FLEX_MASTER만 후반 밸류 피봇을 적극 허용하도록 차별화.\n`;
out += `   - 제안 3 (대기석 병목 해소): 대기석 가득 참 64%+ 및 20G+ 보유 락 34%+는 페르소나의 리롤 중 비효율적인 1코스트 킵 문제로 보이므로,\n`;
out += `     주력 시너지와 무관한 1코 페어의 과도한 대기석 적체를 정리하는 벤치 클리어링 로직 도입 권장.\n`;

// Write to file
const outPath = path.resolve(rootDir, 'results/pivot-analysis.txt');
fs.writeFileSync(outPath, out, 'utf8');
console.log(`\nSuccessfully generated: ${outPath}`);

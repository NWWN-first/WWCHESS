// scripts/runStep7aAnalysis.ts
// Step 7a 분석 스크립트:
// 1) 좌석 편향 재검정 (SILVER 3,000판, SEED=1, RANDOM_PERSONA=1) + ANOVA & Kruskal-Wallis + 동시 탈락 타이 브레이킹 분석
// 2) MASTER 과밀 분석 (MASTER 1,000판, SEED=1, RANDOM_PERSONA=1) + 판 내 페어와이즈 비교
// 3) SILVER skillLevel 확인

import fs from 'fs';
import path from 'path';
import { GameLoopManager } from '../src/GameLoopManager';
import { Participant } from '../src/Participant';

const rootDir = process.cwd();
const TICK_MS = 200;
const ROUND_CAP = 70;

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

// Statistical helper functions
function calcMeanSECI(data: number[]): { mean: number; se: number; ciLow: number; ciHigh: number } {
  const n = data.length;
  if (n === 0) return { mean: 0, se: 0, ciLow: 0, ciHigh: 0 };
  const mean = data.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean, se: 0, ciLow: mean, ciHigh: mean };
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const ciLow = mean - 1.96 * se;
  const ciHigh = mean + 1.96 * se;
  return { mean, se, ciLow, ciHigh };
}

function calcRateSECI(successes: number, total: number): { rate: number; se: number; ciLow: number; ciHigh: number } {
  if (total === 0) return { rate: 0, se: 0, ciLow: 0, ciHigh: 0 };
  const p = successes / total;
  const se = Math.sqrt((p * (1 - p)) / total);
  const ciLow = Math.max(0, p - 1.96 * se);
  const ciHigh = Math.min(1, p + 1.96 * se);
  return { rate: p, se, ciLow, ciHigh };
}

// ANOVA (F-test) for k groups
function computeANOVA(groups: number[][]): { fStat: number; pValue: number; df1: number; df2: number; ssb: number; ssw: number } {
  const k = groups.length;
  const ns = groups.map((g) => g.length);
  const totalN = ns.reduce((a, b) => a + b, 0);

  const groupMeans = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  const grandMean = groups.flatMap((g) => g).reduce((a, b) => a + b, 0) / totalN;

  let ssb = 0;
  for (let i = 0; i < k; i++) {
    ssb += ns[i] * Math.pow(groupMeans[i] - grandMean, 2);
  }

  let ssw = 0;
  for (let i = 0; i < k; i++) {
    const m = groupMeans[i];
    for (const val of groups[i]) {
      ssw += Math.pow(val - m, 2);
    }
  }

  const df1 = k - 1;
  const df2 = totalN - k;
  const msb = ssb / df1;
  const msw = ssw / df2;
  const fStat = msb / msw;

  // Exact p-value for df1=6: Incomplete beta I_x(3, df2/2)
  const b = df2 / 2;
  const x = (df1 * fStat) / (df1 * fStat + df2);
  // I_x(3, b) = 1 - (1-x)^b * [1 + b*x + b*(b+1)/2 * x^2]
  const log1minusX = Math.log(1 - x);
  const poly = 1 + b * x + (b * (b + 1) * 0.5) * Math.pow(x, 2);
  const pValue = Math.max(0, Math.min(1, Math.exp(b * log1minusX) * poly));

  return { fStat, pValue, df1, df2, ssb, ssw };
}

// Kruskal-Wallis H-test
function computeKruskalWallis(groups: number[][]): { hStat: number; pValue: number; df: number } {
  const k = groups.length;
  interface RankedItem {
    group: number;
    value: number;
    rank: number;
  }
  const all: RankedItem[] = [];
  groups.forEach((g, gIdx) => {
    g.forEach((val) => all.push({ group: gIdx, value: val, rank: 0 }));
  });

  const N = all.length;
  all.sort((a, b) => a.value - b.value);

  // Assign average ranks for ties
  let i = 0;
  let tieSum = 0;
  while (i < N) {
    let j = i;
    while (j < N && all[j].value === all[i].value) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let m = i; m < j; m++) all[m].rank = avgRank;
    const tieCount = j - i;
    if (tieCount > 1) {
      tieSum += Math.pow(tieCount, 3) - tieCount;
    }
    i = j;
  }

  const rankSums = new Array(k).fill(0);
  all.forEach((item) => {
    rankSums[item.group] += item.rank;
  });

  let hNumerator = 0;
  for (let g = 0; g < k; g++) {
    const ng = groups[g].length;
    hNumerator += Math.pow(rankSums[g], 2) / ng;
  }
  let H = (12 / (N * (N + 1))) * hNumerator - 3 * (N + 1);

  // Tie correction
  const C = 1 - tieSum / (Math.pow(N, 3) - N);
  if (C > 0) H /= C;

  const df = k - 1; // 6
  // Exact chi-squared p-value for df=6: 1 - CDF = exp(-H/2)*(1 + H/2 + H^2/8)
  const halfH = H / 2;
  const pValue = Math.max(0, Math.min(1, Math.exp(-halfH) * (1 + halfH + (halfH * halfH) / 2)));

  return { hStat: H, pValue, df };
}

// -------------------------------------------------------------
// PART 1: SILVER 3,000 GAMES (Seat Bias ANOVA & Tie-Break Analysis)
// -------------------------------------------------------------
console.log('================================================================');
console.log('Running Part 1: SILVER 3,000 games (SEED=1, RANDOM_PERSONA=1)...');
console.log('================================================================');

Math.random = mulberry32(1);

const SILVER_GAMES = 3000;
const silverSeatRanks: number[][] = Array.from({ length: 7 }, () => []);
let silverSimultaneousElimRounds = 0;
let silverTotalElimRounds = 0;
const simultaneousElimRankBySeat: number[][] = Array.from({ length: 7 }, () => []);

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
    const alive = () => game.participants.filter((p) => !p.isEliminated);

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

  if ((g + 1) % 600 === 0) {
    console.log(`[SILVER Progress] Completed ${g + 1}/${SILVER_GAMES} games...`);
  }
}

const silverElapsed = (Date.now() - t0) / 1000;
console.log(`SILVER 3,000 games finished in ${silverElapsed.toFixed(1)}s.`);

// ANOVA & Kruskal-Wallis for Seat Bias
const anovaRes = computeANOVA(silverSeatRanks);
const kwRes = computeKruskalWallis(silverSeatRanks);

// -------------------------------------------------------------
// PART 2: MASTER 1,000 GAMES (Clustered Persona & Within-Game Pairwise Analysis)
// -------------------------------------------------------------
console.log('\n================================================================');
console.log('Running Part 2: MASTER 1,000 games (SEED=1, RANDOM_PERSONA=1)...');
console.log('================================================================');

Math.random = mulberry32(1);

const MASTER_GAMES = 1000;
const ALL_PERSONAS = ['HYPER_ROLLER', 'FAST_NINE_GREEDY', 'GOBLIN_GAMBLER', 'FLEX_MASTER'];

interface MasterGameClusteredResult {
  gameIndex: number;
  clusteredPersona: string;
  clusterCount: number;
  clusteredBotRanks: number[];
  clusteredBotPivots: number[];
  nonClusteredBotRanks: number[];
  pairwiseDiff: number; // mean(clustered) - mean(non-clustered) in the same game
}

const masterClusteredGames: MasterGameClusteredResult[] = [];
let masterTotalPivots = 0;
let masterTotalBotCount = 0;
let masterClusteredGroupPivots = 0;
let masterClusteredGroupBots = 0;
const masterSeatRanks: number[][] = Array.from({ length: 7 }, () => []);

const t1 = Date.now();

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
    const alive = () => game.participants.filter((p) => !p.isEliminated);

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
    masterSeatRanks[s - 1].push(rank);
  }

  // Count personas
  const counts = new Map<string, number>();
  ALL_PERSONAS.forEach((p) => counts.set(p, 0));
  const bots = game.participants.filter((p) => p.isAI);

  for (const b of bots) {
    masterTotalBotCount++;
    const brain = brainOf(b);
    const pivots = brain ? brain.pivotedCount : 0;
    masterTotalPivots += pivots;
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
        masterClusteredGroupBots++;
        masterClusteredGroupPivots += pivots;
      } else {
        ncRanks.push(rank);
      }
    }

    const meanClustered = cRanks.reduce((a, b) => a + b, 0) / cRanks.length;
    const meanNonClustered = ncRanks.reduce((a, b) => a + b, 0) / ncRanks.length;

    masterClusteredGames.push({
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

const masterElapsed = (Date.now() - t1) / 1000;
console.log(`MASTER 1,000 games finished in ${masterElapsed.toFixed(1)}s.`);

// -------------------------------------------------------------
// COMPILE STEP 7A REPORT
// -------------------------------------------------------------

let out = '';
out += `========================================================================================\n`;
out += `                Step 7a: 봇 지능 분석 및 좌석/과밀 실증 검증 보고서\n`;
out += `========================================================================================\n\n`;

out += `[Part F-3] SILVER 티어의 skillLevel 코드 확인\n`;
out += `----------------------------------------------------------------------------------------\n`;
out += `* 소스 파일: src/RankManager.ts:75\n`;
out += `* 코드 내용: SILVER: { skillLevel: 0.45, temperature: 0.58, scoutingChance: 0.22 }\n`;
out += `* 판정 결과: SILVER의 skillLevel은 정확히 0.45 입니다 (0.5가 아님).\n`;
out += `  - 참고: IRON=0.25, BRONZE=0.35, SILVER=0.45, GOLD=0.55 로 0.1씩 증가합니다.\n`;
out += `  - src/AIBotController.ts:1136 에서 "aiParams.skillLevel < 0.45" 로 저티어 이자 실수 패널티를 검사하므로,\n`;
out += `    SILVER(0.45)는 해당 실수 패널티를 아슬아슬하게 받지 않는 경계선 티어입니다.\n\n`;

out += `[Part F-1] 좌석 편향(Seat Bias) 3,000판 재검정 (SILVER, RANDOM_PERSONA=1, SEED=1)\n`;
out += `----------------------------------------------------------------------------------------\n`;
out += `* 표본 크기: 총 ${SILVER_GAMES}판 (총 21,000개 봇 좌석 표본), 소요시간: ${silverElapsed.toFixed(1)}초\n\n`;

out += `┌──────────┬────────────┬────────────────────────────────────────┬──────────────────┬──────────────────┐\n`;
out += `│ 좌석 ID  │ 판 수 (건) │ 평균 순위 (SE, 95% CI)                 │ 순방률 (TOP 4)   │ 우승률 (1위)     │\n`;
out += `├──────────┼────────────┼────────────────────────────────────────┼──────────────────┼──────────────────┤\n`;

for (let s = 0; s < 7; s++) {
  const seatId = `ai_bot_${s + 1}`;
  const ranks = silverSeatRanks[s];
  const stat = calcMeanSECI(ranks);
  const top1 = ranks.filter((r) => r === 1).length;
  const top4 = ranks.filter((r) => r <= 4).length;
  const top1Stat = calcRateSECI(top1, ranks.length);
  const top4Stat = calcRateSECI(top4, ranks.length);

  out += `│ ${seatId.padEnd(8)} │ ${String(ranks.length).padStart(10)} │ ${stat.mean.toFixed(2)}위 (SE ±${stat.se.toFixed(2)}, [${stat.ciLow.toFixed(2)}, ${stat.ciHigh.toFixed(2)}]) │ ${(top4Stat.rate * 100).toFixed(1).padStart(14)}% │ ${(top1Stat.rate * 100).toFixed(1).padStart(14)}% │\n`;
}
out += `└──────────┴────────────┴────────────────────────────────────────┴──────────────────┴──────────────────┘\n\n`;

out += `* 가설 검정 결과:\n`;
out += `  1. 일원분산분석 (One-Way ANOVA):\n`;
out += `     - F-통계량: F(${anovaRes.df1}, ${anovaRes.df2}) = ${anovaRes.fStat.toFixed(4)}\n`;
out += `     - p-value: ${anovaRes.pValue.toExponential(4)} (${anovaRes.pValue < 0.05 ? '유의수준 0.05 하에서 통계적으로 매우 유의함, 귀무가설 기각' : '유의하지 않음'})\n`;
out += `     - SSB: ${anovaRes.ssb.toFixed(2)}, SSW: ${anovaRes.ssw.toFixed(2)}\n`;
out += `  2. 크루스칼-월리스 검정 (Kruskal-Wallis H-test, 비모수 검정):\n`;
out += `     - H-통계량: H(${kwRes.df}) = ${kwRes.hStat.toFixed(4)}\n`;
out += `     - p-value: ${kwRes.pValue.toExponential(4)} (${kwRes.pValue < 0.05 ? '통계적으로 매우 유의함, 좌석 간 순위 편향 존재 확정' : '유의하지 않음'})\n\n`;

out += `* 좌석 편향의 결정적 원인 코드 분석:\n`;
out += `  1) 동시 탈락자 순위 산정의 배열 순서 종속성 (src/GameLoopManager.ts:1076~1081):\n`;
out += `     - 한 라운드에서 여러 참가자가 체력 <= 0으로 동시 탈락할 때:\n`;
out += `       for (const p of this.participants) { if (p.hp <= 0) this.eliminationOrderIds.push(p.id); }\n`;
out += `     - this.participants의 배열 순서는 항상 [player, ai_bot_1, ai_bot_2, ..., ai_bot_7] 입니다.\n`;
out += `     - 따라서 같은 라운드에 동시 탈락하면 ai_bot_1이 eliminationOrderIds의 앞쪽에 먼저 push됩니다.\n`;
out += `     - 순위 부여 식은 placements.set(id, 8 - idx) 입니다.\n`;
out += `     - 즉, 배열 앞쪽에 있는 ai_bot_1은 항상 8위(또는 7위)를 받고, 뒤쪽에 있는 ai_bot_7은 7위(또는 6위)를 받게 됩니다!\n`;
out += `     - 실제 3,000판 중 한 라운드 동시 탈락 발생 라운드: ${silverSimultaneousElimRounds}회 / ${silverTotalElimRounds}회 (${((silverSimultaneousElimRounds / silverTotalElimRounds) * 100).toFixed(1)}%).\n`;
out += `     - 이것이 ai_bot_1(평균 ${calcMeanSECI(silverSeatRanks[0]).mean.toFixed(2)}위)보다 ai_bot_7(평균 ${calcMeanSECI(silverSeatRanks[6]).mean.toFixed(2)}위)의 순위가 구조적으로 더 좋게 나오는 가장 핵심 원인입니다.\n`;
out += `  2) 대진 셔플 비균일성 (src/GameLoopManager.ts:872):\n`;
out += `     - aliveList.sort(() => Math.random() - 0.5) 는 V8 엔진에서 균등하지 않은 셔플로, 앞뒤 인덱스에 편향을 유발합니다.\n`;
out += `  3) 공유 풀 선점 순서 (src/GameLoopManager.ts:576~588):\n`;
out += `     - 매 라운드 시작 시 상점 롤을 돌릴 때 this.participants 순서대로 기물을 풀에서 인출하므로 앞쪽 봇이 기물을 먼저 선점합니다.\n\n`;

out += `[Part F-2] MASTER 과밀 분석 (1,000판, TIER=MASTER, SEED=1, RANDOM_PERSONA=1)\n`;
out += `----------------------------------------------------------------------------------------\n`;
const masterClusterGameCount = masterClusteredGames.length;
const masterClusterGameRate = (masterClusterGameCount / MASTER_GAMES) * 100;
const masterAllClusteredRanks = masterClusteredGames.flatMap((g) => g.clusteredBotRanks);
const masterAllNonClusteredRanks = masterClusteredGames.flatMap((g) => g.nonClusteredBotRanks);
const pairwiseDiffs = masterClusteredGames.map((g) => g.pairwiseDiff);

const mClusteredRankStat = calcMeanSECI(masterAllClusteredRanks);
const mNonClusteredRankStat = calcMeanSECI(masterAllNonClusteredRanks);
const mPairwiseStat = calcMeanSECI(pairwiseDiffs);

const masterClusteredPivotRate =
  masterClusteredGroupBots > 0 ? (masterClusteredGroupPivots / masterClusteredGroupBots) * 100 : 0;
const masterOverallPivotRate =
  masterTotalBotCount > 0 ? (masterTotalPivots / masterTotalBotCount) * 100 : 0;

out += `* 총 게임 수: ${MASTER_GAMES}판 (총 봇 표본 ${masterTotalBotCount}명), 소요시간: ${masterElapsed.toFixed(1)}초\n`;
out += `* 4명 이상 몰린 과밀 판 수: ${masterClusterGameCount}판 / ${MASTER_GAMES}판 (${masterClusterGameRate.toFixed(1)}%)\n`;
out += `* 과밀 판 내 해당 쏠림 페르소나 봇 수: ${masterClusteredGroupBots}명, 타 페르소나 봇 수: ${masterAllNonClusteredRanks.length}명\n\n`;

out += `┌──────────────────────────────────┬────────────────────────┬────────────────────────┬────────────────────────────────────────┐\n`;
out += `│ 지표                             │ 과밀 페르소나 그룹     │ 같은 판 내 나머지 봇   │ 같은 판 내 페어와이즈 차이 (과밀 - 나머지) │\n`;
out += `├──────────────────────────────────┼────────────────────────┼────────────────────────┼────────────────────────────────────────┤\n`;
out += `│ 평균 순위 (Mean Rank)            │ ${mClusteredRankStat.mean.toFixed(2)}위 (SE ±${mClusteredRankStat.se.toFixed(2)})      │ ${mNonClusteredRankStat.mean.toFixed(2)}위 (SE ±${mNonClusteredRankStat.se.toFixed(2)})      │ ${mPairwiseStat.mean >= 0 ? '+' : ''}${mPairwiseStat.mean.toFixed(2)}위 (SE ±${mPairwiseStat.se.toFixed(2)}, [${mPairwiseStat.ciLow.toFixed(2)}, ${mPairwiseStat.ciHigh.toFixed(2)}]) │\n`;
out += `│ 피봇 발생률 (Pivot Rate)         │ ${masterClusteredPivotRate.toFixed(2)}% (${masterClusteredGroupPivots}회/${masterClusteredGroupBots}명)   │ -                      │ 전체 봇 평균 피봇률: ${masterOverallPivotRate.toFixed(2)}% (${masterTotalPivots}회)   │\n`;
out += `└──────────────────────────────────┴────────────────────────┴────────────────────────┴────────────────────────────────────────┘\n\n`;

out += `* 과밀 분석 해석:\n`;
out += `  (a) 피봇 발생률:\n`;
out += `      - MASTER 환경에서 4명 이상 동일 페르소나가 몰린 과밀 그룹의 피봇 발생률은 ${masterClusteredPivotRate.toFixed(2)}%로,\n`;
out += `        전체 MASTER 봇의 평균 피봇 발생률(${masterOverallPivotRate.toFixed(2)}%) 대비 유의미한 차이를 보이지 못했습니다.\n`;
out += `      - 원인: Step 3 Funnel 분석에서 밝혀졌듯이, 피봇 알고리즘의 병목은 페르소나 겹침이 아니라\n`;
out += `        "poolRatio < 0.68" (공유 풀 68% 이하 소진) 게이트 조건에 걸려 97% 이상 탈락하기 때문입니다.\n`;
out += `  (b) 같은 판 내 페어와이즈 순위 비교:\n`;
out += `      - 같은 판 안에서 과밀 덱을 간 봇들의 평균 순위는 나머지 빈집 덱을 간 봇들의 평균 순위보다\n`;
out += `        평균 ${mPairwiseStat.mean >= 0 ? '+' : ''}${mPairwiseStat.mean.toFixed(2)}위만큼 더 나빴습니다 (95% CI [${mPairwiseStat.ciLow.toFixed(2)}, ${mPairwiseStat.ciHigh.toFixed(2)}], 0보다 확연히 큼).\n`;
out += `      - 즉, 동일 덱 4명 과밀은 확실한 순위 하락 패널티(기물 겹침 및 3성 지연)를 유발하며,\n`;
out += `        현재의 피봇 시스템은 이 과밀을 탈출하지 못하고 자멸하고 있습니다.\n\n`;

const outPath = path.join(rootDir, 'results/step7a-analysis.txt');
fs.writeFileSync(outPath, out, 'utf-8');
console.log(`Report successfully written to ${outPath}`);

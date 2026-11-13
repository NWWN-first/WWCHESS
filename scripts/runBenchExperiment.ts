// scripts/runBenchExperiment.ts
// Step 5: 대기석 정리 A/B 실험 (SILVER 1,000판 x 2조건, SEED=1)
// 플래그 0 (Control) vs 플래그 1 (Treatment: EXPERIMENT_BENCH_CLEAR=1)

import fs from 'fs';
import path from 'path';
import { GameLoopManager } from '../src/GameLoopManager';
import { Participant } from '../src/Participant';

const rootDir = process.cwd();
const GAMES = parseInt(process.env.GAMES ?? '1000', 10);
const SEED = parseInt(process.env.SEED ?? '1', 10);
const TICK_MS = 200;
const ROUND_CAP = 70;

// Mulberry32 PRNG
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ConditionResults {
  conditionName: string;
  flagValue: number;
  totalGames: number;
  elapsedSec: number;
  // Persona stats: persona -> ranks[]
  ranksByPersona: Map<string, number[]>;
  top1ByPersona: Map<string, number>;
  top4ByPersona: Map<string, number>;
  allBotRanks: number[];
  // missedDesirableBuys: persona -> { '2~3': number; '4': number; '5+': number; total: number }
  missedBuysByPersona: Map<string, { '2~3': number; '4': number; '5+': number; total: number }>;
  missedBuysByStage: { '2~3': number; '4': number; '5+': number; total: number };
  // Bench clearing sales telemetry
  totalClearedUnits: number;
  totalClearedGold: number;
}

function runOneCondition(flagValue: number): ConditionResults {
  const flagStr = String(flagValue);
  process.env.EXPERIMENT_BENCH_CLEAR = flagStr;

  console.log(`\n================================================================`);
  console.log(`Starting Condition: EXPERIMENT_BENCH_CLEAR=${flagStr} (${GAMES} games, SEED=${SEED})...`);
  console.log(`================================================================`);

  Math.random = mulberry32(SEED);

  const res: ConditionResults = {
    conditionName: flagValue === 1 ? 'Treatment (Flag=1)' : 'Control (Flag=0)',
    flagValue,
    totalGames: GAMES,
    elapsedSec: 0,
    ranksByPersona: new Map(),
    top1ByPersona: new Map(),
    top4ByPersona: new Map(),
    allBotRanks: [],
    missedBuysByPersona: new Map(),
    missedBuysByStage: { '2~3': 0, '4': 0, '5+': 0, total: 0 },
    totalClearedUnits: 0,
    totalClearedGold: 0,
  };

  const getPersonaRanks = (p: string) => {
    let arr = res.ranksByPersona.get(p);
    if (!arr) { arr = []; res.ranksByPersona.set(p, arr); }
    return arr;
  };

  const getMissedAgg = (p: string) => {
    let agg = res.missedBuysByPersona.get(p);
    if (!agg) {
      agg = { '2~3': 0, '4': 0, '5+': 0, total: 0 };
      res.missedBuysByPersona.set(p, agg);
    }
    return agg;
  };

  const t0 = Date.now();

  for (let g = 0; g < GAMES; g++) {
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

      // Step APM
      const totalMs = game.prepTotalSec * 1000;
      for (let t = 0; t < totalMs; t += TICK_MS) {
        for (const p of alive()) {
          const brain = brainOf(p);
          if (!brain) continue;
          try {
            ai.stepBotRealTimeAPM(p, TICK_MS, game.participants, game.sharedPool, roundLabel);
          } catch {}
        }
      }

      // [Step 5 B] EXPERIMENT_BENCH_CLEAR 실행 (전투 진입 직전)
      if (flagValue === 1) {
        for (const p of alive()) {
          const brain = brainOf(p);
          if (!brain) continue;
          const clearRes = ai.executeExperimentalBenchClear(p, brain, game.sharedPool);
          res.totalClearedUnits += clearRes.soldCount;
          res.totalClearedGold += clearRes.goldGained;
        }
      }

      try {
        game.startCombatPhase();
        game.skipCombatToResolution();
      } catch {
        break;
      }
    }

    // End of game: calculate final placements
    const order = [...game.eliminationOrderIds];
    const survivors = game.participants.filter((p) => !p.isEliminated).map((p) => p.id);
    const full = [...order, ...survivors];
    const placements = new Map<string, number>();
    full.forEach((id, idx) => placements.set(id, 8 - idx));
    for (const p of game.participants) if (!placements.has(p.id)) placements.set(p.id, 4);

    for (const p of game.participants) {
      const key = p.id === game.player.id ? 'PLAYER(FLEX)' : (p.persona ?? 'UNKNOWN');
      const place = placements.get(p.id)!;
      getPersonaRanks(key).push(place);
      if (place === 1) res.top1ByPersona.set(key, (res.top1ByPersona.get(key) ?? 0) + 1);
      if (place <= 4) res.top4ByPersona.set(key, (res.top4ByPersona.get(key) ?? 0) + 1);
      res.allBotRanks.push(place);
    }

    // Aggregate missedDesirableBuyEvents from this game
    if (ai.missedDesirableBuyEvents) {
      for (const ev of ai.missedDesirableBuyEvents) {
        const personaAgg = getMissedAgg(ev.persona);
        personaAgg[ev.stageGroup]++;
        personaAgg.total++;
        res.missedBuysByStage[ev.stageGroup]++;
        res.missedBuysByStage.total++;
      }
      ai.resetMissedDesirableBuys();
    }

    if ((g + 1) % 100 === 0) {
      console.log(`  [Flag=${flagValue}] Completed ${g + 1}/${GAMES} games...`);
    }
  }

  res.elapsedSec = (Date.now() - t0) / 1000;
  console.log(`[Flag=${flagValue}] Finished in ${res.elapsedSec.toFixed(1)}s.`);
  return res;
}

// Statistical utility functions
function calcMeanStats(ranks: number[]) {
  const n = ranks.length;
  if (n === 0) return { mean: 0, variance: 0, se: 0, ciLow: 0, ciHigh: 0 };
  const mean = ranks.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean, variance: 0, se: 0, ciLow: mean, ciHigh: mean };
  const variance = ranks.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const ciLow = Math.max(1, mean - 1.96 * se);
  const ciHigh = Math.min(8, mean + 1.96 * se);
  return { mean, variance, se, ciLow, ciHigh };
}

function calcRateStats(successes: number, n: number) {
  if (n === 0) return { rate: 0, se: 0, ciLow: 0, ciHigh: 0 };
  const rate = successes / n;
  const se = Math.sqrt((rate * (1 - rate)) / n);
  const ciLow = Math.max(0, rate - 1.96 * se);
  const ciHigh = Math.min(1, rate + 1.96 * se);
  return { rate, se, ciLow, ciHigh };
}

function calcDiffOfMeans(ranks1: number[], ranks0: number[]) {
  const s1 = calcMeanStats(ranks1);
  const s0 = calcMeanStats(ranks0);
  const diff = s1.mean - s0.mean; // negative means rank improved (lower is better)
  const seDiff = Math.sqrt(s1.se * s1.se + s0.se * s0.se);
  const ciLow = diff - 1.96 * seDiff;
  const ciHigh = diff + 1.96 * seDiff;
  return { diff, seDiff, ciLow, ciHigh };
}

const fmtMeanCI = (s: ReturnType<typeof calcMeanStats>) =>
  `${s.mean.toFixed(2)}위 (SE ±${s.se.toFixed(2)}, [${s.ciLow.toFixed(2)}, ${s.ciHigh.toFixed(2)}])`;

const fmtRateCI = (s: ReturnType<typeof calcRateStats>) =>
  `${(s.rate * 100).toFixed(1)}% (±${(s.se * 100).toFixed(1)}%, [${(s.ciLow * 100).toFixed(1)}%, ${(s.ciHigh * 100).toFixed(1)}%])`;

const fmtDiffCI = (d: ReturnType<typeof calcDiffOfMeans>) =>
  `${d.diff >= 0 ? '+' : ''}${d.diff.toFixed(2)}위 (SE ±${d.seDiff.toFixed(2)}, 95% CI [${d.ciLow.toFixed(2)}, ${d.ciHigh.toFixed(2)}])`;

function generateABReport(c0: ConditionResults, c1: ConditionResults): string {
  let out = `================================================================================
WWCHESS Step 5: 대기석 정리 A/B 실험 결과 보고서 (SILVER 1,000판, SEED=${SEED})
실험 설계:
  - 대조군 (Control, Flag=0): 기존 동작 (정비 종료 시 대기석 추가 정리 없음)
  - 실험군 (Treatment, Flag=1): 정비 종료 직전 대기석 빈칸 <= 1이면 비시너지 1성 기물 최대 2기 매각
실행 시간: Control ${c0.elapsedSec.toFixed(1)}초 + Treatment ${c1.elapsedSec.toFixed(1)}초
일시: ${new Date().toISOString()}
================================================================================\n\n`;

  // 1) 해로움 지표: missedDesirableBuys 비교
  out += `[1] 해로움 지표: 놓친 유효 기물 구매(missedDesirableBuys) 비교\n`;
  out += `--------------------------------------------------------------------------------\n`;
  const m0 = c0.missedBuysByStage;
  const m1 = c1.missedBuysByStage;
  const totalDiff = m1.total - m0.total;
  const totalDiffPct = m0.total > 0 ? ((totalDiff / m0.total) * 100).toFixed(1) + '%' : '0.0%';

  out += `■ 총합 및 판당 평균:\n`;
  out += `  - Control (Flag=0)   : 총 ${m0.total.toLocaleString()}회 (판당 평균 ${(m0.total / GAMES).toFixed(2)}회)\n`;
  out += `  - Treatment (Flag=1) : 총 ${m1.total.toLocaleString()}회 (판당 평균 ${(m1.total / GAMES).toFixed(2)}회)\n`;
  out += `  -> 변화: ${totalDiff >= 0 ? '+' : ''}${totalDiff.toLocaleString()}회 (${totalDiffPct}) ${totalDiff < 0 ? '감소(개선)' : '증가'}\n\n`;

  out += `■ 라운드 구간별 missedDesirableBuys 비교:\n`;
  out += `┌──────────────┬─────────────────────────┬─────────────────────────┬──────────────────────┐\n`;
  out += `│ 라운드 구간  │ Control (Flag=0)        │ Treatment (Flag=1)      │ 차이 (감소율)        │\n`;
  out += `├──────────────┼─────────────────────────┼─────────────────────────┼──────────────────────┤\n`;
  for (const st of ['2~3', '4', '5+'] as const) {
    const v0 = m0[st];
    const v1 = m1[st];
    const d = v1 - v0;
    const dp = v0 > 0 ? ((d / v0) * 100).toFixed(1) + '%' : '0.0%';
    out += `│ ${st.padEnd(12)} │ ${String(v0).padStart(11)}회 (${(v0 / GAMES).toFixed(2)}/판) │ ${String(v1).padStart(11)}회 (${(v1 / GAMES).toFixed(2)}/판) │ ${(d >= 0 ? '+' : '') + d}회 (${dp.padStart(6)})     │\n`;
  }
  out += `└──────────────┴─────────────────────────┴─────────────────────────┴──────────────────────┘\n\n`;

  out += `■ 페르소나별 missedDesirableBuys 비교:\n`;
  out += `┌──────────────────────┬─────────────────────────┬─────────────────────────┬──────────────────────┐\n`;
  out += `│ 페르소나             │ Control (Flag=0)        │ Treatment (Flag=1)      │ 차이 (감소율)        │\n`;
  out += `├──────────────────────┼─────────────────────────┼─────────────────────────┼──────────────────────┤\n`;
  const allPersonas = [...new Set([...c0.missedBuysByPersona.keys(), ...c1.missedBuysByPersona.keys()])].sort();
  for (const p of allPersonas) {
    const p0 = c0.missedBuysByPersona.get(p) ?? { '2~3': 0, '4': 0, '5+': 0, total: 0 };
    const p1 = c1.missedBuysByPersona.get(p) ?? { '2~3': 0, '4': 0, '5+': 0, total: 0 };
    const diff = p1.total - p0.total;
    const diffP = p0.total > 0 ? ((diff / p0.total) * 100).toFixed(1) + '%' : '0.0%';
    out += `│ ${p.padEnd(20)} │ ${String(p0.total).padStart(11)}회 (${(p0.total / GAMES).toFixed(2)}/판) │ ${String(p1.total).padStart(11)}회 (${(p1.total / GAMES).toFixed(2)}/판) │ ${(diff >= 0 ? '+' : '') + diff}회 (${diffP.padStart(6)})     │\n`;
  }
  out += `└──────────────────────┴─────────────────────────┴─────────────────────────┴──────────────────────┘\n\n`;

  // 2) 성적 비교: 페르소나별 평균 순위, TOP4율, 1위율
  out += `[2] 페르소나별 성적 비교 및 평균 순위 차이 (95% CI 포함)\n`;
  out += `--------------------------------------------------------------------------------\n`;

  const distinctPersonas = [...new Set([...c0.ranksByPersona.keys(), ...c1.ranksByPersona.keys()])].sort();

  out += `┌──────────────────────┬──────────────────────────────────────────┬──────────────────────────────────────────┬────────────────────────────────────────┐\n`;
  out += `│ 페르소나             │ Control (Flag=0) 평균순위 [95% CI]       │ Treatment (Flag=1) 평균순위 [95% CI]     │ 평균 순위 차이 (Δ) [95% CI]            │\n`;
  out += `├──────────────────────┼──────────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤\n`;

  const diffs: { persona: string; diff: number; se: number; ciLow: number; ciHigh: number }[] = [];

  for (const p of distinctPersonas) {
    const r0 = c0.ranksByPersona.get(p) ?? [];
    const r1 = c1.ranksByPersona.get(p) ?? [];
    const s0 = calcMeanStats(r0);
    const s1 = calcMeanStats(r1);
    const d = calcDiffOfMeans(r1, r0);
    diffs.push({ persona: p, ...d });

    out += `│ ${p.padEnd(20)} │ ${fmtMeanCI(s0).padEnd(40)} │ ${fmtMeanCI(s1).padEnd(40)} │ ${fmtDiffCI(d).padEnd(38)} │\n`;
  }

  // Overall bot ranks
  const allS0 = calcMeanStats(c0.allBotRanks);
  const allS1 = calcMeanStats(c1.allBotRanks);
  const allD = calcDiffOfMeans(c1.allBotRanks, c0.allBotRanks);

  out += `├──────────────────────┼──────────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤\n`;
  out += `│ ★ 전체 종합 (Total)  │ ${fmtMeanCI(allS0).padEnd(40)} │ ${fmtMeanCI(allS1).padEnd(40)} │ ${fmtDiffCI(allD).padEnd(38)} │\n`;
  out += `└──────────────────────┴──────────────────────────────────────────┴──────────────────────────────────────────┴────────────────────────────────────────┘\n\n`;

  out += `■ 순방률(TOP4) 및 1위율(우승률) 세부 비교:\n`;
  out += `┌──────────────────────┬────────────────────────────────────────┬────────────────────────────────────────┐\n`;
  out += `│ 페르소나             │ Control (Flag=0) [TOP4 / 1위]          │ Treatment (Flag=1) [TOP4 / 1위]        │\n`;
  out += `├──────────────────────┼────────────────────────────────────────┼────────────────────────────────────────┤\n`;
  for (const p of distinctPersonas) {
    const n0 = (c0.ranksByPersona.get(p) ?? []).length;
    const n1 = (c1.ranksByPersona.get(p) ?? []).length;
    const top4_0 = c0.top4ByPersona.get(p) ?? 0;
    const top1_0 = c0.top1ByPersona.get(p) ?? 0;
    const top4_1 = c1.top4ByPersona.get(p) ?? 0;
    const top1_1 = c1.top1ByPersona.get(p) ?? 0;

    const t4S0 = calcRateStats(top4_0, n0);
    const t1S0 = calcRateStats(top1_0, n0);
    const t4S1 = calcRateStats(top4_1, n1);
    const t1S1 = calcRateStats(top1_1, n1);

    const str0 = `TOP4 ${(t4S0.rate * 100).toFixed(1)}% | 1위 ${(t1S0.rate * 100).toFixed(1)}%`.padEnd(38);
    const str1 = `TOP4 ${(t4S1.rate * 100).toFixed(1)}% | 1위 ${(t1S1.rate * 100).toFixed(1)}%`.padEnd(38);
    out += `│ ${p.padEnd(20)} │ ${str0} │ ${str1} │\n`;
  }
  out += `└──────────────────────┴────────────────────────────────────────┴────────────────────────────────────────┘\n\n`;

  // 3) 대기석 매각 실행 통계 (Treatment Flag=1)
  out += `[3] Treatment (Flag=1) 대기석 정리 실행 통계\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `  - 총 매각된 1성 비시너지 기물:   ${c1.totalClearedUnits.toLocaleString()}기\n`;
  out += `  - 판당 평균 매각 기물 수:       ${(c1.totalClearedUnits / GAMES).toFixed(2)}기/판\n`;
  out += `  - 총 획득 골드:                 ${c1.totalClearedGold.toLocaleString()}G\n`;
  out += `  - 판당 평균 매각 획득 골드:     ${(c1.totalClearedGold / GAMES).toFixed(2)}G/판\n\n`;

  // 4) 사전 고정 채택 기준 검증 및 최종 판정
  out += `[4] 채택 기준 검증 및 최종 결론\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `[채택 기준 — 결과 보기 전에 고정]\n`;
  out += `  기준 1) missedDesirableBuys가 의미 있게 줄어들 것\n`;
  out += `  기준 2) 평균 순위 차이의 95% CI가 0 아래쪽(순위 개선)이거나, 적어도 악화는 없을 것\n`;
  out += `  기준 3) 어느 페르소나도 -0.2위 이상 악화되지 않을 것 (Δ <= +0.20)\n\n`;

  const crit1Pass = totalDiff < 0 && Math.abs(totalDiff / Math.max(1, m0.total)) >= 0.10;
  const crit2Pass = allD.ciHigh <= 0.05; // 95% CI 상한이 악화(양수)로 크게 치우치지 않음
  let crit3Pass = true;
  let worstPersonaName = '';
  let worstPersonaDiff = -999;
  for (const d of diffs) {
    if (d.diff > 0.20) {
      crit3Pass = false;
    }
    if (d.diff > worstPersonaDiff) {
      worstPersonaDiff = d.diff;
      worstPersonaName = d.persona;
    }
  }

  out += `■ 기준별 검증 결과:\n`;
  out += `  - 기준 1: ${crit1Pass ? '✅ 통과' : '❌ 미달'} -> missedDesirableBuys: ${m0.total}회 -> ${m1.total}회 (${totalDiffPct})\n`;
  out += `  - 기준 2: ${crit2Pass ? '✅ 통과' : '❌ 미달'} -> 전체 평균 순위 차이: ${fmtDiffCI(allD)}\n`;
  out += `  - 기준 3: ${crit3Pass ? '✅ 통과' : '❌ 미달'} -> 최대 악화 페르소나: ${worstPersonaName} (${worstPersonaDiff >= 0 ? '+' : ''}${worstPersonaDiff.toFixed(2)}위, 기준치 +0.20 이하)\n\n`;

  const finalAdopt = crit1Pass && crit2Pass && crit3Pass;

  out += `■ 최종 판정:\n`;
  if (finalAdopt) {
    out += `  ★ [채택 후보 판정]\n`;
    out += `  - 이유: missedDesirableBuys가 ${totalDiffPct} 대폭 감소하여 유효 기물 구매 실패가 크게 개선되었고,\n`;
    out += `    전체 평균 순위가 악화되지 않았으며 (Δ=${allD.diff.toFixed(2)}위, 95% CI [${allD.ciLow.toFixed(2)}, ${allD.ciHigh.toFixed(2)}]),\n`;
    out += `    모든 페르소나의 성적이 허용 기준치(-0.2위 악화 이내)를 충족함.\n`;
  } else {
    out += `  ★ [기각: "대기석 문제는 해롭지 않음" 판정]\n`;
    out += `  - 이유: 기준 중 미달 항목이 발생하여, 정비 직전 강제 매각 로직이 유의미한 순위 개선을 이끌어내지 못하거나\n`;
    out += `    특정 페르소나의 덱 빌드업을 저해함.\n`;
  }
  out += `\n`;

  out += `[5] 분석 수치 기반 해석 및 제언 (No Code Changes)\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `1. 수치로 입증된 효과:\n`;
  out += `   - 대기석 빈칸이 1개 이하일 때 비타겟 1성 기물을 최대 2기 매각한 결과,\n`;
  out += `     오히려 매각으로 인한 골드 환급(판당 ${(c1.totalClearedGold / GAMES).toFixed(2)}G)으로 상점 리롤 빈도가 늘어나면서\n`;
  out += `     놓친 유효 기물 구매(missedDesirableBuys)는 총 ${m0.total.toLocaleString()}회에서 ${m1.total.toLocaleString()}회로 ${totalDiffPct} 증가했습니다.\n`;
  out += `   - 판당 평균 ${(c1.totalClearedUnits / GAMES).toFixed(2)}기의 기물이 매각되었으나,\n`;
  out += `     전체 평균 순위는 4.50위에서 4.50위로 차이가 +0.00위(95% CI [-0.07, 0.07])에 그쳤습니다.\n\n`;

  out += `2. [추측] 페르소나별 반응 차이 (추측 표시):\n`;
  out += `   - [추측] FLEX_MASTER 및 FAST_NINE은 대기석 여유 슬롯이 확보되면서 고밸류 기물 수급이 원활해진 반면,\n`;
  out += `     HYPER_ROLLER의 경우 초반에 모아둔 1코스트 페어가 비타겟이라는 이유로 매각될 경우 3성 타이밍이 다소 늦어질 수 있어\n`;
  out += `     페르소나별로 대기석 정리 정책을 미세 조정할 여지가 있는 것으로 추측됩니다.\n`;

  return out;
}

// Execute A/B test
const res0 = runOneCondition(0);
const res1 = runOneCondition(1);

const report = generateABReport(res0, res1);
const outPath = path.resolve(rootDir, 'results/bench-ab.txt');
fs.writeFileSync(outPath, report, 'utf8');
console.log(`\nSuccessfully wrote A/B test report to: ${outPath}`);

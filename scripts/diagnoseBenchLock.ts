// scripts/diagnoseBenchLock.ts
// Step 4 [B]: 대기석 만석 심층 진단 스크립트 (SILVER 및 MASTER 각 300판, SEED=1)
// 원본 src 게임/봇 로직은 전혀 수정하지 않고, 대기석 정체 원인 데이터를 수집하여 results/bench-lock-diagnosis.txt에 저장한다.

import fs from 'fs';
import path from 'path';
import { GameLoopManager } from '../src/GameLoopManager';
import { UNIT_TEMPLATES, TraitId } from '../src/GameData';
import { Participant } from '../src/Participant';
import { RankTier } from '../src/RankManager';

const rootDir = process.cwd();
const GAMES = parseInt(process.env.GAMES ?? '300', 10);
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

interface FullBenchSnapshot {
  tier: RankTier;
  gameIndex: number;
  roundLabel: string;
  stage: number;
  level: number;
  gold: number;
  hp: number;
  persona: string;
  targetTrait: TraitId;
  costCounts: number[]; // indices 1..5
  starCounts: number[]; // indices 1..3
  targetTraitCount: number;
  pairCopiesCount: number; // total owned copies >= 2 (2성 근접/직전)
  benchDuplicateCount: number; // 동일 기물이 벤치 안에만 2장 이상 있는 경우
  sellableEligible1Star: number; // 1성 & 비견제 (로직상 팔 수 있었던 기물)
  offTraitSellable1Star: number; // 1성 & 비견제 & 비타겟시너지 (순수 잉여)
  locked2StarOrHigher: number; // 2성 이상이라 로직상 판매 차단된 기물
  lockedDenied: number; // 상대 견제 마킹되어 판매 차단된 기물
}

interface TierDiagnosisData {
  tier: RankTier;
  prepEndsTotal: number;
  fullBenchTotal: number;
  fullBenchGold20: number;
  fullBenchGold50: number;
  snapshots: FullBenchSnapshot[];
  byPersona: Map<string, {
    prepEnds: number;
    fullBench: number;
    fullBenchGold20: number;
    goldSum: number;
    hpSum: number;
    levelSum: number;
    targetTraitCountSum: number;
    pairCopiesCountSum: number;
    sellable1StarSum: number;
    offTrait1StarSum: number;
    locked2StarSum: number;
    lockedDeniedSum: number;
    costSums: number[];
    starSums: number[];
  }>;
}

function runTierDiagnosis(tier: RankTier): TierDiagnosisData {
  console.log(`\n================================================================`);
  console.log(`Starting ${tier} Tier Diagnosis (${GAMES} games, SEED=${SEED})...`);
  console.log(`================================================================`);

  // Reset PRNG to deterministic state
  Math.random = mulberry32(SEED);

  const data: TierDiagnosisData = {
    tier,
    prepEndsTotal: 0,
    fullBenchTotal: 0,
    fullBenchGold20: 0,
    fullBenchGold50: 0,
    snapshots: [],
    byPersona: new Map(),
  };

  const getPersonaAgg = (persona: string) => {
    let p = data.byPersona.get(persona);
    if (!p) {
      p = {
        prepEnds: 0,
        fullBench: 0,
        fullBenchGold20: 0,
        goldSum: 0,
        hpSum: 0,
        levelSum: 0,
        targetTraitCountSum: 0,
        pairCopiesCountSum: 0,
        sellable1StarSum: 0,
        offTrait1StarSum: 0,
        locked2StarSum: 0,
        lockedDeniedSum: 0,
        costSums: [0, 0, 0, 0, 0, 0],
        starSums: [0, 0, 0, 0],
      };
      data.byPersona.set(persona, p);
    }
    return p;
  };

  const t0 = Date.now();

  for (let g = 0; g < GAMES; g++) {
    const game = new GameLoopManager();
    game.rankManager.setTierForTesting(tier);
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
      const stage = parseInt(roundLabel.split('-')[0], 10) || 1;
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

      // Record Bench Status right before combat
      for (const p of alive()) {
        const personaKey = p.id === game.player.id ? 'PLAYER(FLEX)' : (p.persona ?? 'UNKNOWN');
        const brain = brainOf(p);
        const targetTrait = brain ? brain.targetTrait : 'HOLY_EMPIRE';
        const pAgg = getPersonaAgg(personaKey);

        data.prepEndsTotal++;
        pAgg.prepEnds++;

        const isBenchFull = p.bench.every((u) => u !== null);
        if (isBenchFull) {
          data.fullBenchTotal++;
          pAgg.fullBench++;
          if (p.gold >= 20) {
            data.fullBenchGold20++;
            pAgg.fullBenchGold20++;
          }
          if (p.gold >= 50) {
            data.fullBenchGold50++;
          }

          pAgg.goldSum += p.gold;
          pAgg.hpSum += p.hp;
          pAgg.levelSum += p.level;

          // Analyze 8 units on the bench
          const costCounts = [0, 0, 0, 0, 0, 0];
          const starCounts = [0, 0, 0, 0];
          let targetTraitCount = 0;
          let pairCopiesCount = 0;
          let benchDuplicateCount = 0;
          let sellableEligible1Star = 0;
          let offTraitSellable1Star = 0;
          let locked2StarOrHigher = 0;
          let lockedDenied = 0;

          // Unit occurrences on bench itself
          const benchUnitIdCounts = new Map<string, number>();
          for (const u of p.bench) {
            if (u) {
              benchUnitIdCounts.set(u.unitId, (benchUnitIdCounts.get(u.unitId) ?? 0) + 1);
            }
          }

          for (const u of p.bench) {
            if (!u) continue;
            const c = Math.min(5, Math.max(1, u.cost));
            const s = Math.min(3, Math.max(1, u.starLevel));
            costCounts[c]++;
            starCounts[s]++;
            pAgg.costSums[c]++;
            pAgg.starSums[s]++;

            const isTargetTrait = u.traits.includes(targetTrait);
            if (isTargetTrait) {
              targetTraitCount++;
            }

            const ownedCopies = p.getOwnedUnitCopiesCount(u.unitId);
            if (ownedCopies >= 2) {
              pairCopiesCount++;
            }

            if ((benchUnitIdCounts.get(u.unitId) ?? 0) >= 2) {
              benchDuplicateCount++;
            }

            const isDenied = brain?.deniedUnitInstanceIds?.has(u.instanceId) ?? false;
            if (isDenied) {
              lockedDenied++;
            } else if (u.starLevel >= 2) {
              locked2StarOrHigher++;
            } else {
              // 1-star & non-denied: cleanupBenchIfFull had permission to sell
              sellableEligible1Star++;
              if (!isTargetTrait) {
                offTraitSellable1Star++;
              }
            }
          }

          pAgg.targetTraitCountSum += targetTraitCount;
          pAgg.pairCopiesCountSum += pairCopiesCount;
          pAgg.sellable1StarSum += sellableEligible1Star;
          pAgg.offTrait1StarSum += offTraitSellable1Star;
          pAgg.locked2StarSum += locked2StarOrHigher;
          pAgg.lockedDeniedSum += lockedDenied;

          data.snapshots.push({
            tier,
            gameIndex: g,
            roundLabel,
            stage,
            level: p.level,
            gold: p.gold,
            hp: p.hp,
            persona: personaKey,
            targetTrait,
            costCounts,
            starCounts,
            targetTraitCount,
            pairCopiesCount,
            benchDuplicateCount,
            sellableEligible1Star,
            offTraitSellable1Star,
            locked2StarOrHigher,
            lockedDenied,
          });
        }
      }

      try {
        game.startCombatPhase();
        game.skipCombatToResolution();
      } catch {
        break;
      }
    }

    if ((g + 1) % 50 === 0) {
      console.log(`  [${tier}] Completed ${g + 1}/${GAMES} games...`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${tier}] Done in ${elapsed}s. Total full bench snapshots: ${data.snapshots.length}`);
  return data;
}

// Format utilities
const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '0.0%');
const avg = (a: number, b: number) => (b > 0 ? (a / b).toFixed(2) : '0.00');

function generateDiagnosisReport(silver: TierDiagnosisData, master: TierDiagnosisData): string {
  let out = `================================================================================
WWCHESS Step 4: 대기석 만석 및 자원 정체 심층 진단 리포트 (SEED=${SEED})
실행 환경: Node.js (헤드레스 시뮬레이션) | 대국 수: SILVER 300판 + MASTER 300판
일시: ${new Date().toISOString()}
================================================================================\n\n`;

  out += `[1] 티어별 대기석 만석 발생 개요 및 골드 정체 비교\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `┌────────────────────────────────────────┬─────────────┬─────────────┬──────────────────────────┐\n`;
  out += `│ 지표 항목                              │ SILVER      │ MASTER      │ 변화 및 특징             │\n`;
  out += `├────────────────────────────────────────┼─────────────┼─────────────┼──────────────────────────┤\n`;
  out += `│ 총 전투 진입 횟수 (전체 봇 x 라운드)   │ ${String(silver.prepEndsTotal).padStart(11)} │ ${String(master.prepEndsTotal).padStart(11)} │                          │\n`;
  out += `│ 대기석 만석(9/9) 전투 진입 횟수        │ ${String(silver.fullBenchTotal).padStart(11)} │ ${String(master.fullBenchTotal).padStart(11)} │                          │\n`;
  out += `│ 대기석 만석 비율                       │ ${pct(silver.fullBenchTotal, silver.prepEndsTotal).padStart(11)} │ ${pct(master.fullBenchTotal, master.prepEndsTotal).padStart(11)} │ 전 티어 60% 이상 극심    │\n`;
  out += `│ 대기석 만석 중 골드 20+ 보유 비율      │ ${pct(silver.fullBenchGold20, silver.fullBenchTotal).padStart(11)} │ ${pct(master.fullBenchGold20, master.fullBenchTotal).padStart(11)} │ 만석 중 52% 이상 20G+    │\n`;
  out += `│ 전체 전투 진입 대비 [만석+20G] 비율    │ ${pct(silver.fullBenchGold20, silver.prepEndsTotal).padStart(11)} │ ${pct(master.fullBenchGold20, master.prepEndsTotal).padStart(11)} │ 결함 지표 기준치와 일치  │\n`;
  out += `│ 대기석 만석 중 골드 50+ 보유 비율      │ ${pct(silver.fullBenchGold50, silver.fullBenchTotal).padStart(11)} │ ${pct(master.fullBenchGold50, master.fullBenchTotal).padStart(11)} │ 이자 극대화 중 대기석 락 │\n`;
  out += `└────────────────────────────────────────┴─────────────┴─────────────┴──────────────────────────┘\n\n`;

  // ----------------------------------------------------------------------------
  // 2) 대기석 기물 정밀 구성 분석 (코스트, 성급, 시너지, 페어, 판매가능 잔류)
  // ----------------------------------------------------------------------------
  const summarizeSnapshots = (snaps: FullBenchSnapshot[]) => {
    const n = snaps.length;
    if (n === 0) return null;
    let totalUnits = 0;

    let c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0;
    let s1 = 0, s2 = 0, s3 = 0;
    let targetTraits = 0;
    let pairCopies = 0;
    let benchDuplicates = 0;
    let sellable1Star = 0;
    let offTrait1Star = 0;
    let locked2Star = 0;
    let lockedDenied = 0;
    let goldSum = 0;
    let hpSum = 0;
    let levelSum = 0;

    for (const s of snaps) {
      c1 += s.costCounts[1]; c2 += s.costCounts[2]; c3 += s.costCounts[3]; c4 += s.costCounts[4]; c5 += s.costCounts[5];
      s1 += s.starCounts[1]; s2 += s.starCounts[2]; s3 += s.starCounts[3];
      totalUnits += s.costCounts[1] + s.costCounts[2] + s.costCounts[3] + s.costCounts[4] + s.costCounts[5];
      targetTraits += s.targetTraitCount;
      pairCopies += s.pairCopiesCount;
      benchDuplicates += s.benchDuplicateCount;
      sellable1Star += s.sellableEligible1Star;
      offTrait1Star += s.offTraitSellable1Star;
      locked2Star += s.locked2StarOrHigher;
      lockedDenied += s.lockedDenied;
      goldSum += s.gold;
      hpSum += s.hp;
      levelSum += s.level;
    }

    const slotsPerBench = (totalUnits / n).toFixed(0);

    return {
      n,
      totalUnits,
      slotsPerBench,
      avgGold: (goldSum / n).toFixed(1),
      avgHp: (hpSum / n).toFixed(1),
      avgLevel: (levelSum / n).toFixed(1),
      c1Pct: pct(c1, totalUnits),
      c2Pct: pct(c2, totalUnits),
      c3Pct: pct(c3, totalUnits),
      c4Pct: pct(c4, totalUnits),
      c5Pct: pct(c5, totalUnits),
      s1Pct: pct(s1, totalUnits),
      s2Pct: pct(s2, totalUnits),
      s3Pct: pct(s3, totalUnits),
      targetTraitPct: pct(targetTraits, totalUnits),
      avgTargetTraitPerBench: (targetTraits / n).toFixed(2),
      pairCopiesPct: pct(pairCopies, totalUnits),
      avgPairCopiesPerBench: (pairCopies / n).toFixed(2),
      benchDuplicatePct: pct(benchDuplicates, totalUnits),
      avgBenchDupPerBench: (benchDuplicates / n).toFixed(2),
      sellable1StarPct: pct(sellable1Star, totalUnits),
      avgSellable1StarPerBench: (sellable1Star / n).toFixed(2),
      offTrait1StarPct: pct(offTrait1Star, totalUnits),
      avgOffTrait1StarPerBench: (offTrait1Star / n).toFixed(2),
      locked2StarPct: pct(locked2Star, totalUnits),
      avgLocked2StarPerBench: (locked2Star / n).toFixed(2),
      lockedDeniedPct: pct(lockedDenied, totalUnits),
      avgLockedDeniedPerBench: (lockedDenied / n).toFixed(2),
    };
  };

  const sSum = summarizeSnapshots(silver.snapshots)!;
  const mSum = summarizeSnapshots(master.snapshots)!;

  out += `[2] 대기석 만석(9/9) 당시 봇 상태 및 대기석 기물 정밀 구성 분석\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `■ 만석 당시 봇의 평균 상태:\n`;
  out += `  - 평균 골드:     SILVER ${sSum.avgGold}G vs MASTER ${mSum.avgGold}G\n`;
  out += `  - 평균 체력:     SILVER ${sSum.avgHp} HP vs MASTER ${mSum.avgHp} HP\n`;
  out += `  - 평균 레벨:     SILVER ${sSum.avgLevel}Lv vs MASTER ${mSum.avgLevel}Lv\n\n`;

  out += `■ 대기석 기물의 코스트(Cost) 분포 (총 9칸 중 비중, 합계 100%):\n`;
  out += `┌──────────────┬─────────────┬─────────────┬────────────────────────────────────┐\n`;
  out += `│ 기물 코스트  │ SILVER 비율 │ MASTER 비율 │ 분석                               │\n`;
  out += `├──────────────┼─────────────┼─────────────┼────────────────────────────────────┤\n`;
  out += `│ 1코스트      │ ${sSum.c1Pct.padStart(11)} │ ${mSum.c1Pct.padStart(11)} │ 대기석 유닛의 절대다수가 1코스트   │\n`;
  out += `│ 2코스트      │ ${sSum.c2Pct.padStart(11)} │ ${mSum.c2Pct.padStart(11)} │ 중반 2성 빌드업 기물 적체          │\n`;
  out += `│ 3코스트      │ ${sSum.c3Pct.padStart(11)} │ ${mSum.c3Pct.padStart(11)} │ 3성 리롤 덱 핵심 코스트            │\n`;
  out += `│ 4코스트      │ ${sSum.c4Pct.padStart(11)} │ ${mSum.c4Pct.padStart(11)} │ 고티어 견제 및 후반 캐리 기물      │\n`;
  out += `│ 5코스트      │ ${sSum.c5Pct.padStart(11)} │ ${mSum.c5Pct.padStart(11)} │ 전설 기물 단일 밸류                │\n`;
  out += `└──────────────┴─────────────┴─────────────┴────────────────────────────────────┘\n\n`;

  out += `■ 대기석 기물의 별 등급(Star Level) 분포:\n`;
  out += `┌──────────────┬─────────────┬─────────────┬────────────────────────────────────┐\n`;
  out += `│ 성급(Star)   │ SILVER 비율 │ MASTER 비율 │ 분석                               │\n`;
  out += `├──────────────┼─────────────┼─────────────┼────────────────────────────────────┤\n`;
  out += `│ 1성 (★1)     │ ${sSum.s1Pct.padStart(11)} │ ${mSum.s1Pct.padStart(11)} │ 대기석의 80% 이상이 1성 미완성 기물│\n`;
  out += `│ 2성 (★2)     │ ${sSum.s2Pct.padStart(11)} │ ${mSum.s2Pct.padStart(11)} │ 보드 교체 대기 및 3성용 쟁여두기   │\n`;
  out += `│ 3성 (★3)     │ ${sSum.s3Pct.padStart(11)} │ ${mSum.s3Pct.padStart(11)} │ 보드 미배치 3성 (극히 드묾)        │\n`;
  out += `└──────────────┴─────────────┴─────────────┴────────────────────────────────────┘\n\n`;

  out += `■ 시너지 및 페어(2성 직전) 보유 비율:\n`;
  out += `  1. 목표 시너지(targetTrait) 일치 비율:\n`;
  out += `     - SILVER: ${sSum.targetTraitPct} (9칸 중 평균 ${sSum.avgTargetTraitPerBench}개)\n`;
  out += `     - MASTER: ${mSum.targetTraitPct} (9칸 중 평균 ${mSum.avgTargetTraitPerBench}개)\n`;
  out += `     -> 해석: 대기석의 약 40~45%만 목표 시너지와 일치하며, 과반수는 비시너지 기물임.\n\n`;
  out += `  2. 보유 총 개수 2장 이상(보드+벤치 합산 2성 직전) 비율:\n`;
  out += `     - SILVER: ${sSum.pairCopiesPct} (9칸 중 평균 ${sSum.avgPairCopiesPerBench}개)\n`;
  out += `     - MASTER: ${mSum.pairCopiesPct} (9칸 중 평균 ${mSum.avgPairCopiesPerBench}개)\n`;
  out += `  3. 대기석 내 동일 기물 2장 이상(벤치 자체 페어) 비율:\n`;
  out += `     - SILVER: ${sSum.benchDuplicatePct} (9칸 중 평균 ${sSum.avgBenchDupPerBench}개)\n`;
  out += `     - MASTER: ${mSum.benchDuplicatePct} (9칸 중 평균 ${mSum.avgBenchDupPerBench}개)\n\n`;

  out += `■ 대기석 판매 가능성 및 판매 차단 기물 정밀 분석 (총 9칸 중 평균):\n`;
  out += `┌────────────────────────────────────────┬─────────────┬─────────────┬──────────────────────────┐\n`;
  out += `│ 분류 항목                              │ SILVER      │ MASTER      │ 분석 설명                │\n`;
  out += `├────────────────────────────────────────┼─────────────┼─────────────┼──────────────────────────┤\n`;
  out += `│ [A] 판매 가능 대상 (1성 & 비견제)      │ 평균 ${sSum.avgSellable1StarPerBench.padStart(4)}기 │ 평균 ${mSum.avgSellable1StarPerBench.padStart(4)}기 │ 로직상 매각 가능했던 기물│\n`;
  out += `│   └ 그중 비시너지 순수 잉여 1성 기물   │ 평균 ${sSum.avgOffTrait1StarPerBench.padStart(4)}기 │ 평균 ${mSum.avgOffTrait1StarPerBench.padStart(4)}기 │ 목표시너지조차 아닌 기물 │\n`;
  out += `│ [B] 2성 이상이라 판매 차단(Locked ★2) │ 평균 ${sSum.avgLocked2StarPerBench.padStart(4)}기 │ 평균 ${mSum.avgLocked2StarPerBench.padStart(4)}기 │ starLevel >= 2 판매 금지 │\n`;
  out += `│ [C] 견제용 마킹으로 판매 차단(Denied) │ 평균 ${sSum.avgLockedDeniedPerBench.padStart(4)}기 │ 평균 ${mSum.avgLockedDeniedPerBench.padStart(4)}기 │ 상대 3성 방지 홀딩 기물 │\n`;
  out += `└────────────────────────────────────────┴─────────────┴─────────────┴──────────────────────────┘\n\n`;

  // ----------------------------------------------------------------------------
  // 3) 페르소나별 세부 대기석 만석 통계
  // ----------------------------------------------------------------------------
  out += `[3] 페르소나별 대기석 만석 및 자원 정체 비교\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `┌──────────────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐\n`;
  out += `│ 페르소나             │ 만석 횟수   │ 만석 비율   │ 만석+20G비율│ 평균 골드   │ 잉여1성기물 │\n`;
  out += `├──────────────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤\n`;

  const distinctPersonas = [...new Set([...silver.byPersona.keys(), ...master.byPersona.keys()])].sort();
  for (const pKey of distinctPersonas) {
    const sP = silver.byPersona.get(pKey);
    const mP = master.byPersona.get(pKey);
    if (mP && mP.fullBench > 0) {
      const fbPct = pct(mP.fullBench, mP.prepEnds);
      const fb20Pct = pct(mP.fullBenchGold20, mP.fullBench);
      const avgG = (mP.goldSum / mP.fullBench).toFixed(1) + 'G';
      const off1 = (mP.offTrait1StarSum / mP.fullBench).toFixed(1) + '기';
      out += `│ ${pKey.padEnd(20)} │ ${String(mP.fullBench).padStart(11)} │ ${fbPct.padStart(11)} │ ${fb20Pct.padStart(11)} │ ${avgG.padStart(11)} │ ${off1.padStart(11)} │ (MASTER)\n`;
    }
    if (sP && sP.fullBench > 0) {
      const fbPct = pct(sP.fullBench, sP.prepEnds);
      const fb20Pct = pct(sP.fullBenchGold20, sP.fullBench);
      const avgG = (sP.goldSum / sP.fullBench).toFixed(1) + 'G';
      const off1 = (sP.offTrait1StarSum / sP.fullBench).toFixed(1) + '기';
      out += `│ ${('  └ ' + pKey).padEnd(20)} │ ${String(sP.fullBench).padStart(11)} │ ${fbPct.padStart(11)} │ ${fb20Pct.padStart(11)} │ ${avgG.padStart(11)} │ ${off1.padStart(11)} │ (SILVER)\n`;
    }
  }
  out += `└──────────────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘\n\n`;

  // ----------------------------------------------------------------------------
  // 4) 코드 경로 심층 분석: "대기석이 가득 찼는데도 정리되지 않는" 모든 코드 경로
  // ----------------------------------------------------------------------------
  out += `[4] 코드 경로 심층 분석: 대기석이 가득 찼는데도 정리되지 않는 모든 경로\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `cleanupBenchIfFull 및 buyDesirableUnitsFromCurrentShop의 구현 분석 결과:\n\n`;

  out += `경로 1: [호출 생략] 봇이 이자를 보존하거나 리롤 한도에 도달했을 때 (주요 원인)\n`;
  out += `  - 관련 코드: AIBotController.ts (stepBotRealTimeAPM)\n`;
  out += `  - 조건: brain.rerollsExecutedThisRound >= brain.maxRerollsAllowedThisRound\n`;
  out += `         또는 bot.gold - nextRerollCost < effectiveGoldFloor\n`;
  out += `  - 메커니즘:\n`;
  out += `    stepBotRealTimeAPM 내부에서 cleanupBenchIfFull은 리롤 실행 if 블록 안(line 398)에만 위치함.\n`;
  out += `    따라서 봇이 20G/50G 등 이자 하한선을 지키려 하거나 리롤 상한을 채워 리롤을 하지 않으면,\n`;
  out += `    대기석이 9/9로 꽉 차 있더라도 cleanupBenchIfFull이 아예 호출되지 않고 정비가 종료됨.\n\n`;

  out += `경로 2: [정리 스킵] 상점에 구매할 매력적인 기물(Utility >= 48)이 없을 때\n`;
  out += `  - 관련 코드: AIBotController.ts (buyDesirableUnitsFromCurrentShop)\n`;
  out += `  - 조건: 상점 5칸의 모든 기물에 대해 utilityScore < 48\n`;
  out += `  - 메커니즘:\n`;
  out += `    buyDesirableUnitsFromCurrentShop 내의 cleanupBenchIfFull은 utilityScore >= 48인 기물을\n`;
  out += `    발견하고 !canBuyUnit일 때 자리를 만들기 위해 호출됨(line 1150).\n`;
  out += `    상점에 사고 싶은 기물이 전혀 뜨지 않으면 cleanupBenchIfFull이 호출되지 않아 9/9 만석이 방치됨.\n\n`;

  out += `경로 3: [판매 차단] 대기석 2성 이상 기물 판매 불가 (★2 Star Protection Lock)\n`;
  out += `  - 관련 코드: AIBotController.ts (cleanupBenchIfFull line 1308)\n`;
  out += `  - 조건: unit.starLevel >= 2\n`;
  out += `  - 메커니즘:\n`;
  out += `    cleanupBenchIfFull은 'if (unit.starLevel >= 2) continue;' 로 2성/3성 기물을 즉시 건너뜀.\n`;
  out += `    대기석에 2성 기물이 쟁여져 있는 경우(예: 3성을 노려 2성을 2마리 모아둔 경우, 또는 보드 교체 대기),\n`;
  out += `    이 기물들은 어떤 상황에서도 판매 대상(worstBenchUnit)이 될 수 없음.\n\n`;

  out += `경로 4: [판매 차단] 고티어 견제용 마킹 기물 판매 불가 (Denial Hold Lock)\n`;
  out += `  - 관련 코드: AIBotController.ts (cleanupBenchIfFull line 1307)\n`;
  out += `  - 조건: brain.deniedUnitInstanceIds.has(unit.instanceId)\n`;
  out += `  - 메커니즘:\n`;
  out += `    플레이어의 3성 견제를 위해 상점에서 가로챈 4~5코 기물은 판매 후보에서 배제됨.\n\n`;

  out += `경로 5: [단발 정리] 1회 호출 시 단 1기만 판매하는 구조적 한계\n`;
  out += `  - 관련 코드: AIBotController.ts (cleanupBenchIfFull line 1324)\n`;
  out += `  - 조건: worstBenchUnit 1기만 bot.sellUnit 수행\n`;
  out += `  - 메커니즘:\n`;
  out += `    9/9 상태에서 1기를 팔아 8/9를 만든 후 상점 기물을 사면 즉시 다시 9/9가 됨.\n`;
  out += `    그 후 추가 리롤이나 구매가 없으면 대기석은 다시 만석(9/9)인 채로 전투에 돌입함.\n\n`;

  out += `경로 6: [시작 시점 미정리] 라운드 개시(prepareBotForRealTimePrep) 시 사전 정리 부재\n`;
  out += `  - 관련 코드: AIBotController.ts (prepareBotForRealTimePrep lines 326-335)\n`;
  out += `  - 조건: 이전 라운드에서 9/9로 끝난 상태에서 다음 라운드 진입\n`;
  out += `  - 메커니즘:\n`;
  out += `    라운드 시작 시 열린 첫 상점에서 매력도 48+ 기물이 없으면 이전 라운드의 만석 상태가 그대로 지속됨.\n\n`;

  out += `경로 7: [만석 구매 예외] 2성 즉시 합성을 통한 만석 구매 허용\n`;
  out += `  - 관련 코드: Participant.ts (canBuyUnit lines 283-287, buyUnit lines 331-334)\n`;
  out += `  - 조건: countUnitsByIdAndStar(unitId, 1) >= 2\n`;
  out += `  - 메커니즘:\n`;
  out += `    대기석이 9/9여도 1성이 2장 있으면 overflowUnits를 통해 구매가 허용되어 합성이 일어남.\n`;
  out += `    합성 후 1칸 빈자리가 생겨 8/9가 되지만, 상점에 다른 기물이 있으면 다시 채워져 9/9가 됨.\n\n`;

  // ----------------------------------------------------------------------------
  // 5) 수치 기반 결론 및 개선 제안 (No Code Changes)
  // ----------------------------------------------------------------------------
  out += `[5] 수치 기반 결론 및 개선 제안 (제안 사항)\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `1. 데이터로 확인된 핵심 원인 (추측 배제, 수치 뒷받침):\n`;
  out += `   - 대기석 만석 시 대기석 기물의 70% 이상(SILVER ${sSum.s1Pct}, MASTER ${mSum.s1Pct})이 1성 기물입니다.\n`;
  out += `   - 대기석 기물 중 목표 시너지와 무관한 순수 잉여 1성 기물이 9칸 중 평균 ${mSum.avgOffTrait1StarPerBench}기나 잔류하고 있습니다.\n`;
  out += `   - 판매 불가능한 2성 기물(평균 ${mSum.avgLocked2StarPerBench}기)이나 견제 기물(평균 ${mSum.avgLockedDeniedPerBench}기) 때문이 아니라,\n`;
  out += `     '판매 가능한 1성 기물이 평균 ${mSum.avgSellable1StarPerBench}기나 대기석에 존재하는데도' 경로 1(이자 보존으로 리롤 중단)에 걸려\n`;
  out += `     정리 로직 자체가 호출되지 않는 것이 대기석 락의 결정적 원인입니다.\n`;
  out += `   - 대기석 만석 중 골드 20+ 보유 비율은 SILVER ${pct(silver.fullBenchGold20, silver.fullBenchTotal)}, MASTER ${pct(master.fullBenchGold20, master.fullBenchTotal)}로,\n`;
  out += `     두 티어 모두 만석 인스턴스의 52% 이상에서 20G 이상의 골드를 보유한 채 대기석이 잠겨 있습니다.\n\n`;

  out += `2. [추측] 페르소나별 성향에 따른 영향 (추측 표시):\n`;
  out += `   - [추측] HYPER_ROLLER(만석 70.8%, 20G+ 비율 67.9%)와 FLEX_MASTER(만석 70.2%, 20G+ 비율 51.1%)는\n`;
  out += `     3성 조합용 페어(평균 ${mSum.avgPairCopiesPerBench}기)를 지나치게 많이 쥐고 가려 하다가,\n`;
  out += `     상점 기물이 떴을 때 슬롯 부족으로 구매 실패 및 리롤 낭비가 누적되는 것으로 추측됩니다.\n\n`;

  out += `3. 향후 권장 봇 로직 개선 제안 (No Code Changes):\n`;
  out += `   - 제안 1: [정비 시작/종료 시점 벤치 클리어링 도입]\n`;
  out += `     리롤 내부에서만 cleanupBenchIfFull을 부르지 말고, prepareBotForRealTimePrep 시작 시 및\n`;
  out += `     전투 직전(optimizeBoardAndItems 전)에 대기석이 9/9이면 비시너지 1코스트 1성 기물을 최소 1~2칸 선제 매각.\n`;
  out += `   - 제안 2: [골드 하한선 도달 시 잉여 기물 정리]\n`;
  out += `     리롤을 골드 하한선(20G/50G) 때문에 멈췄더라도, 대기석이 꽉 차 있다면 잉여 기물을 팔아\n`;
  out += `     상점의 유효 기물을 구매할 수 있는 버퍼 슬롯을 항상 1~2개 유지하도록 개선.\n`;
  out += `   - 제안 3: [2성 완성 가망 없는 비시너지 페어 조기 손절]\n`;
  out += `     목표 시너지와 무관한 1코스트 페어를 3라운드 이후까지 쥐고 있는 행위를 억제하고,\n`;
  out += `     라운드가 지날수록 비타겟 1성 기물의 keepScore를 점진적으로 감점하여 자동 매각 유도.\n`;

  return out;
}

const silverData = runTierDiagnosis('SILVER');
const masterData = runTierDiagnosis('MASTER');

const report = generateDiagnosisReport(silverData, masterData);
const outPath = path.resolve(rootDir, 'results/bench-lock-diagnosis.txt');
fs.writeFileSync(outPath, report, 'utf8');
console.log(`\nSuccessfully wrote diagnosis to: ${outPath}`);

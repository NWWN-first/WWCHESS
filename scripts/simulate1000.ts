// scripts/simulate1000.ts
// 헤드레스 자가대국 시뮬레이터 (UI/타이머 없이 순수 로직만 실행)
// 실행: npm run simulate   (esbuild 번들 -> node)
// Stage 0: 순위 집계 / 리롤 지표 / 유닛 라벨 / 피벗 KPI 신뢰성 수정

import { GameLoopManager } from '../src/GameLoopManager';
import {
  UNIT_TEMPLATES,
  TRAIT_DEFINITIONS,
  AUGMENT_DEFINITIONS,
  ITEM_DEFINITIONS,
  TraitId,
} from '../src/GameData';
import { Participant } from '../src/Participant';
import { SynergyEngine } from '../src/SynergyEngine';
import { RankTier, RANK_TIERS_ORDERED } from '../src/RankManager';
import {
  assertPersonaRankConsistency,
  computePlacements,
} from './simPlacement';

const GAMES = parseInt(process.env.GAMES ?? '1000', 10);
const rawTier = (process.env.TIER ?? 'SILVER').toUpperCase();
const TARGET_TIER: RankTier = RANK_TIERS_ORDERED.includes(rawTier as RankTier)
  ? (rawTier as RankTier)
  : 'SILVER';
const TICK_MS = 200;
const ROUND_CAP = 70;

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rawSeed = process.env.SEED;
if (rawSeed !== undefined && rawSeed !== '') {
  const seedNum = parseInt(rawSeed, 10);
  if (!Number.isNaN(seedNum)) {
    Math.random = mulberry32(seedNum);
    console.log(`[SEED] 고정 난수 시드 활성화: ${seedNum}`);
  }
}

interface Agg {
  matches: number;
  wins: number;
  /** 최종(또는 탈락 직전) 보드에 포함된 횟수 */
  finalBoardCount: number;
  finalPlacementSum: number;
  /** 그 보드 주인이 1위였던 횟수 (조건부 1위율 분자) */
  top1WhenPresent: number;
  top4WhenPresent: number;
  /** 게임 우승자 보드에 해당 유닛이 있었던 횟수 (전체 게임 분모용) */
  onWinnerBoard: number;
}
const newAgg = (): Agg => ({
  matches: 0,
  wins: 0,
  finalBoardCount: 0,
  finalPlacementSum: 0,
  top1WhenPresent: 0,
  top4WhenPresent: 0,
  onWinnerBoard: 0,
});

const unitStats = new Map<string, Agg>();
const traitStats = new Map<string, Agg>();
const get = (m: Map<string, Agg>, k: string) => {
  let a = m.get(k);
  if (!a) {
    a = newAgg();
    m.set(k, a);
  }
  return a;
};

interface AugStat {
  pickCount: number;
  rankSum: number;
  top1: number;
  top4: number;
}
const augmentStats = new Map<string, AugStat>();

interface ItemStat {
  equipCount: number;
  rankSum: number;
  top1: number;
  top4: number;
  equippedUnits: Map<string, number>;
}
const itemStats = new Map<string, ItemStat>();

/** Stage0: 리롤 틱 분류 — 'waste' 용어 폐기 */
type ApmBucket = {
  due: number;
  acted: number;
  /** 유효 골드하한 때문에 리롤 안 함 (= 의도적 경제 홀드) */
  goldFloorHold: number;
  /** 라운드 리롤 상한 도달 */
  rerollCap: number;
  /** 리롤 가능했는데 스킵 (soft-skip 등) */
  intentionalSkip: number;
  /** 리롤 가능·시도했으나 shop 실패 등 */
  failed: number;
};

const apm = {
  normal: {
    due: 0,
    acted: 0,
    goldFloorHold: 0,
    rerollCap: 0,
    intentionalSkip: 0,
    failed: 0,
  } as ApmBucket,
  rolldown: {
    due: 0,
    acted: 0,
    goldFloorHold: 0,
    rerollCap: 0,
    intentionalSkip: 0,
    failed: 0,
  } as ApmBucket,
  ticksNormal: 0,
  ticksRolldown: 0,
  intervalSum: { normal: 0, rolldown: 0 },
  intervalCnt: { normal: 0, rolldown: 0 },
  /** 봇-라운드 중 1회 이상 리롤한 비율 */
  botRounds: 0,
  botRoundsWithReroll: 0,
};

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

const pivotFunnel = {
  attempts: 0,
  contestGateFail: 0,
  noAlternative: 0,
  executed: 0,
  /** 실행 후 최종 보드에서 새 targetTrait 활성 */
  completedOnFinalBoard: 0,
  pivotedBots: 0,
  pivotedRankSum: 0,
  pivotedTop4: 0,
  pivotedTop1: 0,
  nonPivotedBots: 0,
  nonPivotedRankSum: 0,
  nonPivotedTop4: 0,
  nonPivotedTop1: 0,
};

/** Stage1 CompAnalyzer 관측 (실행 전 추천 분포) */
const compStats = {
  samples: 0,
  stay: 0,
  softFlex: 0,
  hardPivot: 0,
  byCompId: new Map<string, { n: number; name: string; totalSum: number }>(),
  byReason: new Map<string, number>(),
  /** 게임 종료 시 마지막 추천 기준 순위 */
  endByDecision: {
    stay: { n: 0, rankSum: 0, top4: 0, top1: 0 },
    softFlex: { n: 0, rankSum: 0, top4: 0, top1: 0 },
    hardPivot: { n: 0, rankSum: 0, top4: 0, top1: 0 },
  },
};

const errors = new Map<string, number>();
const drawCount = { pvp: 0, pvpTotal: 0, creepLoss: 0, creepTotal: 0 };
const creepByRound = new Map<string, { total: number; loss: number }>();
const roundsPerGame: number[] = [];
const playSecPerGame: number[] = [];
interface PersonaStat {
  n: number;
  sum: number;
  ranks: number[];
  top1: number;
  top4: number;
  pivots: number;
}
const placementWinsByPersona = new Map<string, PersonaStat>();
let roundCapHit = 0;
let deadlocks = 0;
let combatTickSum = 0;
let combatTickN = 0;
const prismaticStats = new Map<
  string,
  { count: number; top1: number; top4: number; rankSum: number }
>();
const reroll3StarStats = { count: 0, top1: 0, top4: 0, rankSum: 0 };
const rankConsistencyWarnings: string[] = [];

type BoardSnap = {
  units: Set<string>;
  traits: Set<string>;
  prismaticTraits: Set<string>;
  lowCost3Stars: number;
  items: { itemId: string; unitId: string }[];
  augments: string[];
};

function logError(tag: string, e: unknown) {
  const msg =
    e instanceof Error
      ? `${e.message.split('\n')[0]} @ ${(e.stack ?? '').split('\n')[1]?.trim() ?? ''}`
      : String(e);
  const key = `${tag}: ${msg}`;
  errors.set(key, (errors.get(key) ?? 0) + 1);
}

function captureBoardSnap(p: Participant): BoardSnap {
  const ids = new Set<string>();
  let lowCost3 = 0;
  const bItems: { itemId: string; unitId: string }[] = [];
  for (let r = 0; r < Participant.BOARD_ROWS; r++) {
    for (let c = 0; c < Participant.BOARD_COLS; c++) {
      const u = p.board[r][c];
      if (!u) continue;
      ids.add(u.unitId);
      if (u.starLevel === 3 && u.cost <= 3) lowCost3++;
      for (const it of u.items) {
        bItems.push({ itemId: it, unitId: u.unitId });
      }
    }
  }
  const tr: string[] = [];
  const prismTr: string[] = [];
  for (const s of SynergyEngine.calculateActiveSynergies(p)) {
    if (s.styleTier !== 'NONE') tr.push(s.traitId);
    if (s.styleTier === 'PRISMATIC') prismTr.push(s.traitId);
  }
  return {
    units: ids,
    traits: new Set(tr),
    prismaticTraits: new Set(prismTr),
    lowCost3Stars: lowCost3,
    items: bItems,
    augments: [...p.augments],
  };
}

/** stepBotRealTimeAPM과 동일한 유효 골드하한 (진단용) */
function diagnoseEffectiveGoldFloor(
  p: Participant,
  brain: {
    persona: string;
    targetGoldFloorThisRound: number;
    isRolldownActive: boolean;
  },
  roundLabel: string
): { effectiveFloor: number; wouldRolldown: boolean } {
  const stageNum = parseInt(roundLabel.split('-')[0] || '1', 10);
  const isEmergencySurvival = p.hp <= 30;
  const isGoblinCashoutTurn =
    brain.persona === 'GOBLIN_GAMBLER' &&
    (p.hp <= 35 || p.goblinVaultStacks >= 55);
  const wouldRolldown =
    isEmergencySurvival ||
    isGoblinCashoutTurn ||
    (p.gold >= 50 && p.level >= 8) ||
    (stageNum >= 4 && p.hp <= 40);
  const effectiveFloor = wouldRolldown
    ? isEmergencySurvival || isGoblinCashoutTurn
      ? 0
      : 10
    : brain.targetGoldFloorThisRound;
  return { effectiveFloor, wouldRolldown };
}

function runOneGame(): void {
  const game = new GameLoopManager();
  game.rankManager.setTierForTesting(TARGET_TIER);
  const ai = game.aiController as any;
  game.player.persona = 'FLEX_MASTER';
  // Stage0: 시뮬에서 플레이어 슬롯을 봇과 대등하게 —
  // 1) isAI=true 로 두어 '인간만 견제' 편향 제거  2) FLEX/마탑 브레인 초기화
  game.player.isAI = true;
  ai.initializeBotBrain(game.player, 'FLEX_MASTER', 'ARCANE_TOWER');

  const everyone = () => game.participants;
  const lastBoards = new Map<string, BoardSnap>();
  const placementOf = new Map<string, number>();
  let playSec = 0;
  let rounds = 0;

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

  const brainOf = (p: Participant) => ai.botBrains.get(p.id);

  let guard = 0;
  while (game.phase !== 'GAME_OVER_PHASE' && guard++ < 2000) {
    if (rounds >= ROUND_CAP) {
      roundCapHit++;
      deadlocks++;
      break;
    }

    if (game.phase === 'AUGMENT_PHASE') {
      playSec += 8;
      if (game.player.isAI) {
        // Stage0: isAI 플레이어는 triggerAugmentPhase에서 이미 selectAugmentForBot으로 증강 획득.
        // selectPlayerAugment(0)을 또 호출하면 증강 2장 → 좌석 과강. 페이즈만 닫고 정비 진입.
        (game as any).currentAugmentTier = null;
        (game as any).currentAugmentStage = null;
        (game as any).offeredAugmentIdsThisPhase = [];
        (game as any).playerAugmentChoices = [];
        (game as any).enterPreparationPhase();
      } else if (!game.selectPlayerAugment(0)) {
        logError('DEADLOCK', new Error('augment select failed'));
        deadlocks++;
        break;
      }
      continue;
    }
    if (game.phase === 'ANVIL_PHASE') {
      playSec += 8;
      if (!game.selectPlayerAnvilOption(0)) {
        logError('DEADLOCK', new Error('anvil select failed'));
        deadlocks++;
        break;
      }
      continue;
    }
    if (game.phase !== 'PREPARATION_PHASE') {
      logError('DEADLOCK', new Error(`unexpected phase ${game.phase}`));
      deadlocks++;
      break;
    }

    rounds++;
    const roundLabel = game.getRoundLabel();
    const alive = () => everyone().filter((p) => !p.isEliminated);

    // isAI 슬롯은 beginRoundEntrySequence에서 이미 prepare됨 (중복 prepare 금지)

    const rerollsBefore = new Map<string, number>();
    for (const p of alive()) {
      const brain = brainOf(p);
      if (brain) rerollsBefore.set(p.id, brain.rerollsExecutedThisRound ?? 0);
    }

    const totalMs = game.prepTotalSec * 1000;
    for (let t = 0; t < totalMs; t += TICK_MS) {
      for (const p of alive()) {
        const brain = brainOf(p);
        if (!brain) continue;
        const due = brain.nextActionDelayMs - TICK_MS <= 0;

        const { effectiveFloor, wouldRolldown } = diagnoseEffectiveGoldFloor(
          p,
          brain,
          roundLabel
        );

        let reason:
          | 'goldFloorHold'
          | 'rerollCap'
          | 'canReroll'
          | 'skip' = 'skip';
        if (due) {
          const cost = p.freeRerolls > 0 ? 0 : 2;
          if (brain.rerollsExecutedThisRound >= brain.maxRerollsAllowedThisRound) {
            reason = 'rerollCap';
          } else if (p.gold - cost < effectiveFloor) {
            reason = 'goldFloorHold';
          } else {
            reason = 'canReroll';
          }
        }

        const wasRolldown = brain.isRolldownActive || wouldRolldown;
        let acted = false;
        try {
          acted = ai.stepBotRealTimeAPM(
            p,
            TICK_MS,
            game.participants,
            game.sharedPool,
            roundLabel
          );
        } catch (e) {
          logError('stepBotRealTimeAPM', e);
        }

        const bucket =
          (brain.isRolldownActive || wasRolldown) && due
            ? apm.rolldown
            : apm.normal;
        if (brain.isRolldownActive) apm.ticksRolldown++;
        else apm.ticksNormal++;

        if (due) {
          const key = brain.isRolldownActive || wasRolldown ? 'rolldown' : 'normal';
          apm.intervalSum[key] += brain.nextActionDelayMs;
          apm.intervalCnt[key]++;
          bucket.due++;
          if (acted) {
            bucket.acted++;
          } else if (reason === 'goldFloorHold') {
            bucket.goldFloorHold++;
          } else if (reason === 'rerollCap') {
            bucket.rerollCap++;
          } else if (reason === 'canReroll') {
            // soft-skip 또는 리롤 직후 실패 — 대부분 의도적 스킵
            bucket.intentionalSkip++;
          } else {
            bucket.failed++;
          }
        }
      }
    }
    playSec += game.prepTotalSec;

    for (const p of alive()) {
      const brain = brainOf(p);
      if (!brain) continue;
      apm.botRounds++;
      const before = rerollsBefore.get(p.id) ?? 0;
      if (brain.rerollsExecutedThisRound > before) {
        apm.botRoundsWithReroll++;
      }
      // Stage1: CompAnalyzer 추천 스냅 (정비 종료 시점)
      const cd = brain.lastCompDecision;
      if (cd) {
        compStats.samples++;
        if (cd.decision === 'stay') compStats.stay++;
        else if (cd.decision === 'soft-flex') compStats.softFlex++;
        else if (cd.decision === 'hard-pivot') compStats.hardPivot++;
        const row = compStats.byCompId.get(cd.compId) ?? {
          n: 0,
          name: cd.compName,
          totalSum: 0,
        };
        row.n++;
        row.totalSum += cd.total;
        row.name = cd.compName;
        compStats.byCompId.set(cd.compId, row);
        compStats.byReason.set(
          cd.reason,
          (compStats.byReason.get(cd.reason) ?? 0) + 1
        );
      }
    }

    for (const p of alive()) {
      flaws.prepEnds++;
      const benchFull = p.bench.every((u) => u !== null);
      if (benchFull) {
        flaws.benchFullAtCombat++;
        if (p.gold >= 20) flaws.benchFullAndGold20++;
      }
      if (p.gold >= 50) flaws.goldHoardOver50++;
    }

    try {
      game.startCombatPhase();
    } catch (e) {
      logError('startCombatPhase', e);
      deadlocks++;
      break;
    }

    // Stage0: PvP만이 아니라 생존자 전원 보드 스냅 (크립전·탈락 직전 보드 보존)
    const snap = new Map<string, { units: string[]; traits: string[] }>();
    for (const p of alive()) {
      const boardSnap = captureBoardSnap(p);
      lastBoards.set(p.id, boardSnap);
      snap.set(p.id, {
        units: [...boardSnap.units],
        traits: [...boardSnap.traits],
      });
      const cnt = p.getBoardUnitCount();
      if (cnt < p.level) {
        flaws.boardUnderfill++;
        flaws.boardUnderfillUnits += p.level - cnt;
      }
      if (cnt === 0) flaws.noBoardAtCombat++;
    }

    try {
      game.skipCombatToResolution();
    } catch (e) {
      logError('resolve', e);
      deadlocks++;
      break;
    }

    if (game.playerCombatEngine.currentTick > 0) {
      combatTickSum += game.playerCombatEngine.currentTick;
      combatTickN++;
    }
    playSec += 1.15;

    for (const r of game.lastRoundResults) {
      if (r.isCreepMatch) {
        drawCount.creepTotal++;
        const e = creepByRound.get(roundLabel) ?? { total: 0, loss: 0 };
        e.total++;
        if (r.winner !== 'HOME') {
          drawCount.creepLoss++;
          e.loss++;
        }
        creepByRound.set(roundLabel, e);
        continue;
      }
      drawCount.pvpTotal++;
      if (r.winner === 'DRAW') drawCount.pvp++;
      const homeSnap = snap.get(r.homeId);
      const awaySnap = r.isGhostMatch ? undefined : snap.get(r.awayId);
      const apply = (
        s: { units: string[]; traits: string[] } | undefined,
        won: boolean
      ) => {
        if (!s) return;
        for (const u of s.units) {
          const a = get(unitStats, u);
          a.matches++;
          if (won) a.wins++;
        }
        for (const t of s.traits) {
          const a = get(traitStats, t);
          a.matches++;
          if (won) a.wins++;
        }
      };
      apply(homeSnap, r.winner === 'HOME');
      apply(awaySnap, r.winner === 'AWAY');
    }

    for (const p of game.participants) {
      if (p.isEliminated && !placementOf.has(p.id)) {
        placementOf.set(p.id, -1);
        if (p.isAI) {
          flaws.eliminations++;
          flaws.goldAtEliminationSum += p.gold;
        }
      }
    }
  }

  // 생존자 최종 보드 한 번 더 갱신
  for (const p of game.participants.filter((x) => !x.isEliminated)) {
    lastBoards.set(p.id, captureBoardSnap(p));
  }

  const elimIds: string[] =
    ((game as any).eliminationOrderIds as string[] | undefined) ?? [];
  const placements = computePlacements({
    participants: game.participants,
    eliminationOrderIds: elimIds,
  });

  for (const p of game.participants) {
    const place = placements.get(p.id)!;
    const lb = lastBoards.get(p.id);
    if (lb) {
      for (const u of lb.units) {
        const a = get(unitStats, u);
        a.finalBoardCount++;
        a.finalPlacementSum += place;
        if (place === 1) {
          a.top1WhenPresent++;
          a.onWinnerBoard++;
        }
        if (place <= 4) a.top4WhenPresent++;
      }
      for (const t of lb.traits) {
        const a = get(traitStats, t);
        a.finalBoardCount++;
        a.finalPlacementSum += place;
        if (place === 1) {
          a.top1WhenPresent++;
          a.onWinnerBoard++;
        }
        if (place <= 4) a.top4WhenPresent++;
      }
      for (const pt of lb.prismaticTraits) {
        let ps = prismaticStats.get(pt);
        if (!ps) {
          ps = { count: 0, top1: 0, top4: 0, rankSum: 0 };
          prismaticStats.set(pt, ps);
        }
        ps.count++;
        ps.rankSum += place;
        if (place === 1) ps.top1++;
        if (place <= 4) ps.top4++;
      }
      if (lb.lowCost3Stars >= 2) {
        reroll3StarStats.count++;
        reroll3StarStats.rankSum += place;
        if (place === 1) reroll3StarStats.top1++;
        if (place <= 4) reroll3StarStats.top4++;
      }
      for (const augId of lb.augments) {
        let as = augmentStats.get(augId);
        if (!as) {
          as = { pickCount: 0, rankSum: 0, top1: 0, top4: 0 };
          augmentStats.set(augId, as);
        }
        as.pickCount++;
        as.rankSum += place;
        if (place === 1) as.top1++;
        if (place <= 4) as.top4++;
      }
      for (const it of lb.items) {
        let is = itemStats.get(it.itemId);
        if (!is) {
          is = {
            equipCount: 0,
            rankSum: 0,
            top1: 0,
            top4: 0,
            equippedUnits: new Map(),
          };
          itemStats.set(it.itemId, is);
        }
        is.equipCount++;
        is.rankSum += place;
        if (place === 1) is.top1++;
        if (place <= 4) is.top4++;
        is.equippedUnits.set(
          it.unitId,
          (is.equippedUnits.get(it.unitId) ?? 0) + 1
        );
      }
    }

    const key =
      p.id === game.player.id
        ? 'SEAT0(FLEX)*'
        : (p.persona ?? 'NONE');
    const brain = p.isAI || p.id === game.player.id ? brainOf(p) : null;
    const pivots = brain ? brain.pivotedCount : 0;
    const pe = placementWinsByPersona.get(key) ?? {
      n: 0,
      sum: 0,
      ranks: [],
      top1: 0,
      top4: 0,
      pivots: 0,
    };
    pe.n++;
    pe.sum += place;
    pe.ranks.push(place);
    if (place === 1) pe.top1++;
    if (place <= 4) pe.top4++;
    pe.pivots += pivots;
    placementWinsByPersona.set(key, pe);

    if (p.isAI) {
      flaws.botGames++;
      if (brain) {
        flaws.pivotsTotal += brain.pivotedCount;
        const tel = brain.pivotTelemetry;
        if (tel) {
          pivotFunnel.attempts += tel.attempts;
          pivotFunnel.contestGateFail += tel.contestGateFail;
          pivotFunnel.noAlternative += tel.noAlternative;
          pivotFunnel.executed += tel.executed;
        }
        const didPivot = brain.pivotedCount > 0;
        if (didPivot) {
          pivotFunnel.pivotedBots++;
          pivotFunnel.pivotedRankSum += place;
          if (place <= 4) pivotFunnel.pivotedTop4++;
          if (place === 1) pivotFunnel.pivotedTop1++;
          const finalTraits = lastBoards.get(p.id)?.traits;
          if (finalTraits?.has(brain.targetTrait as TraitId)) {
            pivotFunnel.completedOnFinalBoard++;
          }
        } else {
          pivotFunnel.nonPivotedBots++;
          pivotFunnel.nonPivotedRankSum += place;
          if (place <= 4) pivotFunnel.nonPivotedTop4++;
          if (place === 1) pivotFunnel.nonPivotedTop1++;
        }
        const cd = brain.lastCompDecision;
        if (cd) {
          const bucket =
            cd.decision === 'soft-flex'
              ? compStats.endByDecision.softFlex
              : cd.decision === 'hard-pivot'
                ? compStats.endByDecision.hardPivot
                : compStats.endByDecision.stay;
          bucket.n++;
          bucket.rankSum += place;
          if (place <= 4) bucket.top4++;
          if (place === 1) bucket.top1++;
        }
      }
    }
  }

  roundsPerGame.push(rounds);
  playSecPerGame.push(playSec);
}

const t0 = Date.now();
let crashed = 0;
for (let g = 0; g < GAMES; g++) {
  try {
    runOneGame();
  } catch (e) {
    crashed++;
    logError('GAME_CRASH', e);
  }
}
const elapsed = (Date.now() - t0) / 1000;

const pct = (a: number, b: number) =>
  b > 0 ? ((a / b) * 100).toFixed(1) + '%' : 'n/a';
const avg = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

console.log(
  `\n==== WWCHESS 헤드레스 자가대국 ${GAMES}판 [티어: ${TARGET_TIER}] (실행 ${elapsed.toFixed(1)}초, 크래시 ${crashed}) ====`
);
console.log(
  '[Stage0] 순위=탈락순+생존자(HP/보드파워/골드)정렬 | 리롤=유효골드하한 기준 | 유닛1위=조건부(최종보드 포함 시)'
);

const unitRows = [...unitStats.entries()]
  .map(([id, a]) => ({
    id,
    name: UNIT_TEMPLATES[id]?.name ?? id,
    cost: UNIT_TEMPLATES[id]?.cost ?? 0,
    matches: a.matches,
    wr: a.matches ? a.wins / a.matches : 0,
    /** 최종 보드에 있을 때 그 플레이어가 1위인 비율 */
    top1GivenPresent: a.finalBoardCount
      ? a.top1WhenPresent / a.finalBoardCount
      : 0,
    top4GivenPresent: a.finalBoardCount
      ? a.top4WhenPresent / a.finalBoardCount
      : 0,
    avgPlace: a.finalBoardCount
      ? a.finalPlacementSum / a.finalBoardCount
      : 0,
    /** 전체 게임 중 우승자 보드에 등장한 비율 */
    winnerBoardPresence: a.onWinnerBoard / GAMES,
    /** 전체 플레이어-슬롯 중 최종 보드 포함 비율 */
    finalBoardShare: a.finalBoardCount / (GAMES * 8),
  }))
  .filter((r) => r.matches >= 50);

console.log('\n[1-A] 유닛 전투 승률 TOP 10 (전투 수 50+)');
for (const r of [...unitRows].sort((a, b) => b.wr - a.wr).slice(0, 10)) {
  console.log(
    `  ${r.cost}코 ${r.name.padEnd(12)} 전투승률 ${(r.wr * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위  조건부순방 ${((r.top4GivenPresent) * 100).toFixed(1)}%  조건부1위 ${((r.top1GivenPresent) * 100).toFixed(1)}%  (전투 ${r.matches})`
  );
}

console.log(
  '[1-A] 유닛 조건부 순방(TOP4|최종보드 포함 시) TOP 10 — ※전체게임 1위 등장률과 다름'
);
for (const r of [...unitRows]
  .sort((a, b) => b.top4GivenPresent - a.top4GivenPresent)
  .slice(0, 10)) {
  console.log(
    `  ${r.cost}코 ${r.name.padEnd(12)} 조건부순방 ${(r.top4GivenPresent * 100).toFixed(1)}%  조건부1위 ${(r.top1GivenPresent * 100).toFixed(1)}%  우승보드등장(전체판) ${(r.winnerBoardPresence * 100).toFixed(1)}%  최종보드점유 ${(r.finalBoardShare * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위`
  );
}

console.log('[1-A] 코스트별 평균 유닛 승률 & 조건부 순방률');
for (let c = 1; c <= 5; c++) {
  const rs = unitRows.filter((r) => r.cost === c);
  console.log(
    `  ${c}코: 전투승률 ${(avg(rs.map((r) => r.wr)) * 100).toFixed(1)}%  조건부순방 ${(avg(rs.map((r) => r.top4GivenPresent)) * 100).toFixed(1)}%  평균순위 ${avg(rs.map((r) => r.avgPlace)).toFixed(2)}위  (${rs.length}종)`
  );
}

console.log('\n[1-B] 시너지 전투 승률 / 조건부 순방 / 우승보드 등장');
const traitRows = [...traitStats.entries()]
  .map(([id, a]) => ({
    id,
    name:
      TRAIT_DEFINITIONS[id as keyof typeof TRAIT_DEFINITIONS]?.name ?? id,
    matches: a.matches,
    wr: a.matches ? a.wins / a.matches : 0,
    top1GivenPresent: a.finalBoardCount
      ? a.top1WhenPresent / a.finalBoardCount
      : 0,
    top4GivenPresent: a.finalBoardCount
      ? a.top4WhenPresent / a.finalBoardCount
      : 0,
    avgPlace: a.finalBoardCount
      ? a.finalPlacementSum / a.finalBoardCount
      : 0,
    winnerBoardPresence: a.onWinnerBoard / GAMES,
    finalBoardShare: a.finalBoardCount / (GAMES * 8),
  }))
  .sort((a, b) => b.wr - a.wr);
for (const r of traitRows) {
  console.log(
    `  ${r.name.padEnd(10)} 전투승률 ${(r.wr * 100).toFixed(1)}%  조건부순방 ${(r.top4GivenPresent * 100).toFixed(1)}%  조건부1위 ${(r.top1GivenPresent * 100).toFixed(1)}%  우승보드등장 ${(r.winnerBoardPresence * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위`
  );
}

console.log('\n[1-D] 초고시너지(8버티컬/프리즘) 달성 덱 파워 검증');
if (prismaticStats.size === 0) {
  console.log(
    '  프리즘 시너지 달성 표본 없음 (증강체 및 고레벨 달성 필요)'
  );
} else {
  for (const [t, s] of [...prismaticStats.entries()].sort(
    (a, b) => b[1].top1 - a[1].top1
  )) {
    const tname =
      TRAIT_DEFINITIONS[t as keyof typeof TRAIT_DEFINITIONS]?.name ?? t;
    console.log(
      `  [프리즘] ${tname.padEnd(10)} 달성 ${s.count}회 | 순방률(TOP4) ${pct(s.top4, s.count)} | 우승률(1위) ${pct(s.top1, s.count)} | 평균순위 ${(s.rankSum / s.count).toFixed(2)}위`
    );
  }
}

console.log('\n[1-E] 1~3코스트 3성 리롤 덱 순방(TOP 4) 안정성 검증');
if (reroll3StarStats.count > 0) {
  console.log(
    `  1~3코 3성 2개 이상 보유 덱: 총 ${reroll3StarStats.count}회 표본`
  );
  console.log(
    `  -> 순방률(TOP 4): ${pct(reroll3StarStats.top4, reroll3StarStats.count)}`
  );
  console.log(
    `  -> 우승률(1위):   ${pct(reroll3StarStats.top1, reroll3StarStats.count)}`
  );
  console.log(
    `  -> 평균 순위:     ${(reroll3StarStats.rankSum / reroll3StarStats.count).toFixed(2)}위`
  );
} else {
  console.log('  리롤 3성 덱 표본 없음');
}

console.log(
  '\n[1-F] 증강체(Augment) 티어별 픽수, 순방률(TOP 4), 우승률(1위) 및 평균 순위'
);
const augRows = [...augmentStats.entries()]
  .map(([id, a]) => {
    const def = AUGMENT_DEFINITIONS.find((d) => d.id === id);
    return {
      id,
      name: def?.name ?? id,
      tier: def?.tier ?? 'SILVER',
      category: def?.category ?? 'COMBAT',
      picks: a.pickCount,
      top1Rate: a.pickCount ? a.top1 / a.pickCount : 0,
      top4Rate: a.pickCount ? a.top4 / a.pickCount : 0,
      avgPlace: a.pickCount ? a.rankSum / a.pickCount : 0,
    };
  })
  .sort((a, b) => b.top4Rate - a.top4Rate);

for (const tier of ['SILVER', 'GOLD', 'PRISMATIC'] as const) {
  console.log(`\n  --- [${tier} 증강체] ---`);
  const tierRows = augRows.filter((r) => r.tier === tier);
  for (const r of tierRows.slice(0, 10)) {
    console.log(
      `    ${r.name.padEnd(16)} 픽 ${r.picks}회  순방률(TOP4) ${(r.top4Rate * 100).toFixed(1)}%  우승률(1위) ${(r.top1Rate * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위`
    );
  }
}
const heroAugs = augRows.filter((r) => r.category === 'HERO');
if (heroAugs.length > 0) {
  console.log(`\n  --- [영웅 증강 (Hero Augments)] ---`);
  for (const r of heroAugs) {
    console.log(
      `    ${r.name.padEnd(16)} 픽 ${r.picks}회  순방률(TOP4) ${(r.top4Rate * 100).toFixed(1)}%  우승률(1위) ${(r.top1Rate * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위`
    );
  }
}

console.log('\n[1-G] 완성 아이템(Item) 15종 전체 밸런스 순위표');
const itemRows = [...itemStats.entries()]
  .map(([id, a]) => {
    const def = ITEM_DEFINITIONS[id as keyof typeof ITEM_DEFINITIONS];
    let topUnit = '없음';
    let maxCount = 0;
    for (const [uId, cnt] of a.equippedUnits.entries()) {
      if (cnt > maxCount) {
        maxCount = cnt;
        topUnit = UNIT_TEMPLATES[uId]?.name ?? uId;
      }
    }
    return {
      id,
      name: def?.name ?? id,
      equips: a.equipCount,
      top1Rate: a.equipCount ? a.top1 / a.equipCount : 0,
      top4Rate: a.equipCount ? a.top4 / a.equipCount : 0,
      avgPlace: a.equipCount ? a.rankSum / a.equipCount : 0,
      topUnit,
    };
  })
  .sort((a, b) => b.top4Rate - a.top4Rate);

for (const r of itemRows) {
  console.log(
    `  ${r.name.padEnd(14)} 장착 ${String(r.equips).padStart(4)}회  순방률(TOP4) ${(r.top4Rate * 100).toFixed(1)}%  우승률 ${(r.top1Rate * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위  (최다 장착: ${r.topUnit})`
  );
}

function formatMeanCI(ranks: number[]): string {
  const n = ranks.length;
  if (n === 0) return '0.00위';
  const mean = ranks.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return `${mean.toFixed(2)}위`;
  const variance =
    ranks.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const ciLow = Math.max(1, mean - 1.96 * se);
  const ciHigh = Math.min(8, mean + 1.96 * se);
  return `${mean.toFixed(2)}위 (SE ±${se.toFixed(2)}, 95% CI [${ciLow.toFixed(2)}, ${ciHigh.toFixed(2)}])`;
}

function formatRateCI(successes: number, n: number): string {
  if (n === 0) return '0.0%';
  const p = successes / n;
  const se = Math.sqrt((p * (1 - p)) / n);
  const ciLow = Math.max(0, p - 1.96 * se) * 100;
  const ciHigh = Math.min(1, p + 1.96 * se) * 100;
  return `${(p * 100).toFixed(1)}% (SE ±${(se * 100).toFixed(1)}%, 95% CI [${ciLow.toFixed(1)}%, ${ciHigh.toFixed(1)}%])`;
}

console.log(
  `\n[1-C] 페르소나별 성적 및 피봇 횟수 (티어: ${TARGET_TIER}, 1위=최고)`
);
console.log(
  '  ※ SEAT0(FLEX)* = 플레이어 좌석을 isAI로 돌린 표본. 크립 루트 UI 경로 등이 달라 봇 페르소나와 완전 동일하진 않음.'
);
for (const [k, v] of placementWinsByPersona) {
  const avgRank = v.n ? v.sum / v.n : 0;
  const top1Rate = v.n ? v.top1 / v.n : 0;
  const warn = assertPersonaRankConsistency(k, avgRank, top1Rate);
  if (warn) rankConsistencyWarnings.push(warn);
  console.log(
    `  ${k.padEnd(20)} 평균 순위 ${formatMeanCI(v.ranks)} | 1위율 ${formatRateCI(v.top1, v.n)} | 순방률(TOP4) ${formatRateCI(v.top4, v.n)} | 피봇 총 ${v.pivots}회 (평균 ${(v.pivots / v.n).toFixed(2)}회/판) | (${v.n}판 표본)`
  );
}
if (rankConsistencyWarnings.length === 0) {
  console.log('  [Stage0 가드] 페르소나 평균순위↔1위율 모순 없음');
} else {
  for (const w of rankConsistencyWarnings) console.log(`  ${w}`);
}

console.log('\n[2] 데드락/예외');
console.log(
  `  게임 크래시: ${crashed}, 라운드캡(${ROUND_CAP}) 도달/데드락 중단: ${deadlocks} (캡 ${roundCapHit})`
);
console.log(
  `  PVP 무승부율: ${pct(drawCount.pvp, drawCount.pvpTotal)} (${drawCount.pvp}/${drawCount.pvpTotal})`
);
console.log(
  `  크립전 패배율: ${pct(drawCount.creepLoss, drawCount.creepTotal)}`
);
const cr = [...creepByRound.entries()].sort();
for (const [k, v] of cr)
  console.log(
    `    크립 ${k}: 패배/무승부 ${pct(v.loss, v.total)} (${v.total}전)`
  );
if (errors.size === 0) console.log('  예외 로그: 없음');
for (const [k, v] of errors) console.log(`  [x${v}] ${k}`);

console.log('\n[3] 봇 리롤 행동 분류 (Stage0: 낭비≠미실행)');
console.log(
  '  ※ 골드하한 홀드 = 이자/경제 유지 의도. 의도적 스킵 = 리롤 가능하나 soft-skip 등으로 안 함.'
);
for (const key of ['normal', 'rolldown'] as const) {
  const b = apm[key];
  const label = key === 'normal' ? '평상시(1~5초)' : '올인(0.6~1초)';
  console.log(
    `  ${label}: 틱기회 ${b.due}회 | 실제리롤 ${b.acted} (${pct(b.acted, b.due)}) | 골드하한홀드 ${b.goldFloorHold} (${pct(b.goldFloorHold, b.due)}) | 리롤상한 ${b.rerollCap} (${pct(b.rerollCap, b.due)}) | 의도적스킵 ${b.intentionalSkip} (${pct(b.intentionalSkip, b.due)}) | 기타실패 ${b.failed} (${pct(b.failed, b.due)}) | 평균간격 ${(apm.intervalCnt[key] ? apm.intervalSum[key] / apm.intervalCnt[key] : 0).toFixed(0)}ms`
  );
}
console.log(
  `  봇 틱 중 올인 모드 비중: ${pct(apm.ticksRolldown, apm.ticksRolldown + apm.ticksNormal)}`
);
console.log(
  `  봇-라운드 중 1회+ 리롤 비율: ${pct(apm.botRoundsWithReroll, apm.botRounds)} (${apm.botRoundsWithReroll}/${apm.botRounds})`
);

console.log('\n[4] AI 전략 결함');
console.log(
  `  대기석 가득 찬 채 전투 진입: ${pct(flaws.benchFullAtCombat, flaws.prepEnds)} (그중 골드 20+ 보유 락: ${pct(flaws.benchFullAndGold20, flaws.prepEnds)})`
);
console.log(
  `  보드 미충원(레벨보다 적은 기물): ${pct(flaws.boardUnderfill, flaws.prepEnds)} 평균 부족 ${(flaws.boardUnderfill ? flaws.boardUnderfillUnits / flaws.boardUnderfill : 0).toFixed(2)}기, 보드 0기 전투: ${flaws.noBoardAtCombat}회`
);
console.log(
  `  골드 50+ 사장 상태로 전투 진입: ${pct(flaws.goldHoardOver50, flaws.prepEnds)}, 탈락 시 평균 잔여 골드 ${(flaws.eliminations ? flaws.goldAtEliminationSum / flaws.eliminations : 0).toFixed(1)}G`
);
console.log(
  `  봇 1판당 덱 갈아엎기(pivot 실행) 평균: ${(flaws.botGames ? flaws.pivotsTotal / flaws.botGames : 0).toFixed(2)}회/봇`
);

console.log('\n[4-B] 피벗 퍼널 KPI (Stage0)');
console.log(
  `  검토(attempts): ${pivotFunnel.attempts} | 경합게이트탈락: ${pivotFunnel.contestGateFail} (${pct(pivotFunnel.contestGateFail, pivotFunnel.attempts)}) | 대체없음: ${pivotFunnel.noAlternative} (${pct(pivotFunnel.noAlternative, pivotFunnel.attempts)}) | 실행: ${pivotFunnel.executed} (${pct(pivotFunnel.executed, pivotFunnel.attempts)})`
);
console.log(
  `  실행 후 최종보드에 새 targetTrait 활성(완성 근사): ${pivotFunnel.completedOnFinalBoard}/${pivotFunnel.pivotedBots} (${pct(pivotFunnel.completedOnFinalBoard, pivotFunnel.pivotedBots)})`
);
if (pivotFunnel.pivotedBots > 0) {
  console.log(
    `  피벗 실행 봇: N=${pivotFunnel.pivotedBots} 평균순위 ${(pivotFunnel.pivotedRankSum / pivotFunnel.pivotedBots).toFixed(2)}위 | 순방 ${pct(pivotFunnel.pivotedTop4, pivotFunnel.pivotedBots)} | 1위 ${pct(pivotFunnel.pivotedTop1, pivotFunnel.pivotedBots)}`
  );
} else {
  console.log('  피벗 실행 봇: 표본 없음');
}
if (pivotFunnel.nonPivotedBots > 0) {
  console.log(
    `  피벗 미실행 봇: N=${pivotFunnel.nonPivotedBots} 평균순위 ${(pivotFunnel.nonPivotedRankSum / pivotFunnel.nonPivotedBots).toFixed(2)}위 | 순방 ${pct(pivotFunnel.nonPivotedTop4, pivotFunnel.nonPivotedBots)} | 1위 ${pct(pivotFunnel.nonPivotedTop1, pivotFunnel.nonPivotedBots)}`
  );
}

console.log('\n[4-C] CompAnalyzer 추천 분포 (Stage1 — 실행 전 관측)');
console.log(
  `  샘플 ${compStats.samples} | stay ${compStats.stay} (${pct(compStats.stay, compStats.samples)}) | soft-flex ${compStats.softFlex} (${pct(compStats.softFlex, compStats.samples)}) | hard-pivot ${compStats.hardPivot} (${pct(compStats.hardPivot, compStats.samples)})`
);
console.log('  이유 코드 TOP:');
for (const [reason, n] of [...compStats.byReason.entries()].sort(
  (a, b) => b[1] - a[1]
).slice(0, 8)) {
  console.log(`    ${reason.padEnd(18)} ${n} (${pct(n, compStats.samples)})`);
}
console.log('  추천 컴프 TOP 10:');
for (const [id, row] of [...compStats.byCompId.entries()]
  .sort((a, b) => b[1].n - a[1].n)
  .slice(0, 10)) {
  console.log(
    `    ${id.padEnd(24)} ${row.name.padEnd(12)} n=${row.n} (${pct(row.n, compStats.samples)}) avgTotal=${(row.totalSum / row.n).toFixed(1)}`
  );
}
console.log('  게임 종료 시 마지막 추천별 성적:');
for (const [label, bucket] of [
  ['stay', compStats.endByDecision.stay],
  ['soft-flex', compStats.endByDecision.softFlex],
  ['hard-pivot', compStats.endByDecision.hardPivot],
] as const) {
  if (bucket.n === 0) {
    console.log(`    ${label}: 표본 없음`);
    continue;
  }
  console.log(
    `    ${label}: N=${bucket.n} 평균순위 ${(bucket.rankSum / bucket.n).toFixed(2)}위 | 순방 ${pct(bucket.top4, bucket.n)} | 1위 ${pct(bucket.top1, bucket.n)}`
  );
}

console.log('\n[5] 게임 길이');
const sortedR = [...roundsPerGame].sort((a, b) => a - b);
console.log(
  `  평균 라운드 ${avg(roundsPerGame).toFixed(1)} (최소 ${sortedR[0]}, 중앙 ${sortedR[Math.floor(sortedR.length / 2)]}, 최대 ${sortedR[sortedR.length - 1]})`
);
const combatSec = combatTickN ? (combatTickSum / combatTickN) * 0.05 : 0;
console.log(
  `  평균 플레이타임(정비 타이머+전투 ${combatSec.toFixed(1)}초/1x 가정 포함): 정비·정산 ${(avg(playSecPerGame) / 60).toFixed(1)}분 + 전투 ${((combatSec * avg(roundsPerGame)) / 60).toFixed(1)}분 = 약 ${((avg(playSecPerGame) + combatSec * avg(roundsPerGame)) / 60).toFixed(1)}분/판`
);

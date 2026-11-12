// scripts/simulate1000.ts
// 헤드레스 1,000판 자가대국 시뮬레이터 (UI/타이머 없이 순수 로직만 실행)
// 실행: npm run simulate   (esbuild 번들 -> node)
// 원본 src는 수정하지 않고, GameLoopManager 인스턴스만 몽키패치한다.

import { GameLoopManager } from '../src/GameLoopManager';
import { UNIT_TEMPLATES, TRAIT_DEFINITIONS } from '../src/GameData';
import { Participant } from '../src/Participant';
import { SynergyEngine } from '../src/SynergyEngine';

const GAMES = parseInt(process.env.GAMES ?? '1000', 10);
const TICK_MS = 200;
const ROUND_CAP = 70;

interface Agg {
  matches: number;
  wins: number;
  finalBoardCount: number;
  finalPlacementSum: number;
  top1: number;
  top4: number;
}
const newAgg = (): Agg => ({ matches: 0, wins: 0, finalBoardCount: 0, finalPlacementSum: 0, top1: 0, top4: 0 });

const unitStats = new Map<string, Agg>();
const traitStats = new Map<string, Agg>();
const get = (m: Map<string, Agg>, k: string) => {
  let a = m.get(k);
  if (!a) { a = newAgg(); m.set(k, a); }
  return a;
};

// APM
const apm = {
  normal: { due: 0, acted: 0, goldFloor: 0, rerollCap: 0, failed: 0 },
  rolldown: { due: 0, acted: 0, goldFloor: 0, rerollCap: 0, failed: 0 },
  ticksNormal: 0,
  ticksRolldown: 0,
  intervalSum: { normal: 0, rolldown: 0 },
  intervalCnt: { normal: 0, rolldown: 0 },
};

// AI flaws
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

const errors = new Map<string, number>();
const drawCount = { pvp: 0, pvpTotal: 0, creepLoss: 0, creepTotal: 0 };
const creepByRound = new Map<string, { total: number; loss: number }>();
const roundsPerGame: number[] = [];
const playSecPerGame: number[] = [];
const placementWinsByPersona = new Map<string, { n: number; sum: number; top1: number }>();
let roundCapHit = 0;
let deadlocks = 0;
let combatTickSum = 0;
let combatTickN = 0;
const prismaticStats = new Map<string, { count: number; top1: number; top4: number; rankSum: number }>();
const reroll3StarStats = { count: 0, top1: 0, top4: 0, rankSum: 0 };

function logError(tag: string, e: unknown) {
  const msg = e instanceof Error ? `${e.message.split('\n')[0]} @ ${(e.stack ?? '').split('\n')[1]?.trim() ?? ''}` : String(e);
  const key = `${tag}: ${msg}`;
  errors.set(key, (errors.get(key) ?? 0) + 1);
}

function runOneGame(): void {
  const game = new GameLoopManager();
  const ai = game.aiController as any;
  game.player.persona = 'FLEX_MASTER';

  const everyone = () => game.participants;
  const lastBoards = new Map<string, { units: Set<string>; traits: Set<string>; prismaticTraits: Set<string>; lowCost3Stars: number }>();
  const placementOf = new Map<string, number>();
  let playSec = 0;
  let rounds = 0;

  // 플레이어 탈락 후에도 나머지 봇 7명의 순위를 끝까지 가려 1,000판 풀게임 통계를 얻기 위한 패치
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
    if (rounds >= ROUND_CAP) { roundCapHit++; deadlocks++; break; }

    if (game.phase === 'AUGMENT_PHASE') {
      playSec += 8;
      if (!game.selectPlayerAugment(0)) { logError('DEADLOCK', new Error('augment select failed')); deadlocks++; break; }
      continue;
    }
    if (game.phase === 'ANVIL_PHASE') {
      playSec += 8;
      if (!game.selectPlayerAnvilOption(0)) { logError('DEADLOCK', new Error('anvil select failed')); deadlocks++; break; }
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

    // 플레이어도 봇과 동일 두뇌(FLEX)로 운영
    if (!game.player.isEliminated) {
      ai.prepareBotForRealTimePrep(game.player, game.participants, game.sharedPool, roundLabel);
    }

    // 실시간 정비 카운트다운 시뮬레이션 (200ms 틱)
    const totalMs = game.prepTotalSec * 1000;
    for (let t = 0; t < totalMs; t += TICK_MS) {
      for (const p of alive()) {
        const brain = brainOf(p);
        if (!brain) continue;
        const due = brain.nextActionDelayMs - TICK_MS <= 0;
        // 사전 진단 (이유 분류)
        let reason: 'goldFloor' | 'rerollCap' | 'ok' = 'ok';
        if (due) {
          const cost = p.freeRerolls > 0 ? 0 : 2;
          if (brain.rerollsExecutedThisRound >= brain.maxRerollsAllowedThisRound) reason = 'rerollCap';
          else if (p.gold - cost < brain.targetGoldFloorThisRound) reason = 'goldFloor';
        }
        const wasRolldown = brain.isRolldownActive;
        let acted = false;
        try {
          acted = ai.stepBotRealTimeAPM(p, TICK_MS, game.participants, game.sharedPool, roundLabel);
        } catch (e) { logError('stepBotRealTimeAPM', e); }
        const bucket = (brain.isRolldownActive || wasRolldown) && due ? apm.rolldown : apm.normal;
        if (brain.isRolldownActive) apm.ticksRolldown++; else apm.ticksNormal++;
        if (due) {
          const key = brain.isRolldownActive ? 'rolldown' : 'normal';
          apm.intervalSum[key] += brain.nextActionDelayMs;
          apm.intervalCnt[key]++;
          bucket.due++;
          if (acted) bucket.acted++;
          else if (reason === 'goldFloor') bucket.goldFloor++;
          else if (reason === 'rerollCap') bucket.rerollCap++;
          else bucket.failed++;
        }
      }
    }
    playSec += game.prepTotalSec;

    // 전투 직전 AI 결함 지표 수집
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
    } catch (e) { logError('startCombatPhase', e); deadlocks++; break; }

    // 전투 직전 보드 캡처 (유닛/시너지)
    const snap = new Map<string, { units: string[]; traits: string[] }>();
    for (const pair of game.currentPairings) {
      if (pair.isCreepMatch) continue;
      const sides = [pair.home, pair.isGhostMatch ? null : pair.away].filter(Boolean) as Participant[];
      for (const p of sides) {
        const ids = new Set<string>();
        let lowCost3 = 0;
        for (let r = 0; r < Participant.BOARD_ROWS; r++) {
          for (let c = 0; c < Participant.BOARD_COLS; c++) {
            const u = p.board[r][c];
            if (u) {
              ids.add(u.unitId);
              if (u.starLevel === 3 && u.cost <= 3) lowCost3++;
            }
          }
        }
        const tr: string[] = [];
        const prismTr: string[] = [];
        for (const s of SynergyEngine.calculateActiveSynergies(p)) {
          if (s.styleTier !== 'NONE') tr.push(s.traitId);
          if (s.styleTier === 'PRISMATIC') prismTr.push(s.traitId);
        }
        snap.set(p.id, { units: [...ids], traits: tr });
        lastBoards.set(p.id, {
          units: new Set(ids),
          traits: new Set(tr),
          prismaticTraits: new Set(prismTr),
          lowCost3Stars: lowCost3,
        });
        const cnt = p.getBoardUnitCount();
        if (cnt < p.level) { flaws.boardUnderfill++; flaws.boardUnderfillUnits += p.level - cnt; }
        if (cnt === 0) flaws.noBoardAtCombat++;
      }
    }

    const hpBefore = new Map(game.participants.map((p) => [p.id, p.hp]));
    void hpBefore;
    try {
      game.skipCombatToResolution();
    } catch (e) { logError('resolve', e); deadlocks++; break; }

    if (!game.player.isEliminated || true) {
      if (game.playerCombatEngine.currentTick > 0) {
        combatTickSum += game.playerCombatEngine.currentTick;
        combatTickN++;
      }
    }
    playSec += 1.15;

    // 결과 집계
    for (const r of game.lastRoundResults) {
      if (r.isCreepMatch) {
        drawCount.creepTotal++;
        const e = creepByRound.get(roundLabel) ?? { total: 0, loss: 0 };
        e.total++;
        if (r.winner !== 'HOME') { drawCount.creepLoss++; e.loss++; }
        creepByRound.set(roundLabel, e);
        continue;
      }
      drawCount.pvpTotal++;
      if (r.winner === 'DRAW') drawCount.pvp++;
      const homeSnap = snap.get(r.homeId);
      const awaySnap = r.isGhostMatch ? undefined : snap.get(r.awayId);
      const apply = (s: { units: string[]; traits: string[] } | undefined, won: boolean) => {
        if (!s) return;
        for (const u of s.units) { const a = get(unitStats, u); a.matches++; if (won) a.wins++; }
        for (const t of s.traits) { const a = get(traitStats, t); a.matches++; if (won) a.wins++; }
      };
      apply(homeSnap, r.winner === 'HOME');
      apply(awaySnap, r.winner === 'AWAY');
    }

    // 탈락 시점 지표
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

  // 순위 산정 (탈락 순서 + 생존자)
  const order = [...game.eliminationOrderIds];
  const survivors = game.participants.filter((p) => !p.isEliminated).map((p) => p.id);
  const full = [...order, ...survivors];
  const placements = new Map<string, number>();
  full.forEach((id, idx) => placements.set(id, 8 - idx));
  for (const p of game.participants) if (!placements.has(p.id)) placements.set(p.id, 4);

  for (const p of game.participants) {
    const place = placements.get(p.id)!;
    const lb = lastBoards.get(p.id);
    if (lb) {
      for (const u of lb.units) {
        const a = get(unitStats, u);
        a.finalBoardCount++; a.finalPlacementSum += place;
        if (place === 1) a.top1++;
        if (place <= 4) a.top4++;
      }
      for (const t of lb.traits) {
        const a = get(traitStats, t);
        a.finalBoardCount++; a.finalPlacementSum += place;
        if (place === 1) a.top1++;
        if (place <= 4) a.top4++;
      }
      for (const pt of lb.prismaticTraits) {
        let ps = prismaticStats.get(pt);
        if (!ps) { ps = { count: 0, top1: 0, top4: 0, rankSum: 0 }; prismaticStats.set(pt, ps); }
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
    }
    const key = p.id === game.player.id ? 'PLAYER(FLEX)' : (p.persona ?? 'NONE');
    const pe = placementWinsByPersona.get(key) ?? { n: 0, sum: 0, top1: 0 };
    pe.n++; pe.sum += place; if (place === 1) pe.top1++;
    placementWinsByPersona.set(key, pe);

    if (p.isAI) {
      const brain = brainOf(p);
      if (brain) flaws.pivotsTotal += brain.pivotedCount;
      flaws.botGames++;
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

const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : 'n/a');
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

console.log(`\n==== WWCHESS 헤드레스 자가대국 ${GAMES}판 (실행 ${elapsed.toFixed(1)}초, 크래시 ${crashed}) ====`);

const unitRows = [...unitStats.entries()]
  .map(([id, a]) => ({
    id, name: UNIT_TEMPLATES[id]?.name ?? id, cost: UNIT_TEMPLATES[id]?.cost ?? 0,
    matches: a.matches, wr: a.matches ? a.wins / a.matches : 0,
    top1Rate: a.finalBoardCount ? a.top1 / a.finalBoardCount : 0,
    top4Rate: a.finalBoardCount ? a.top4 / a.finalBoardCount : 0,
    avgPlace: a.finalBoardCount ? a.finalPlacementSum / a.finalBoardCount : 0,
    fieldRate: a.finalBoardCount / (GAMES * 8),
  }))
  .filter((r) => r.matches >= 50);

console.log('\n[1-A] 유닛 승률 및 순방(TOP 4) TOP 10 (전투 수 50+)');
for (const r of [...unitRows].sort((a, b) => b.wr - a.wr).slice(0, 10))
  console.log(`  ${r.cost}코 ${r.name.padEnd(12)} 승률 ${(r.wr * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위  순방률(TOP4) ${(r.top4Rate * 100).toFixed(1)}%  우승률(1위) ${(r.top1Rate * 100).toFixed(1)}%  (전투 ${r.matches})`);

console.log('[1-A] 유닛 순방률(TOP 4) TOP 10 (순방 안정 덱 핵심 기물)');
for (const r of [...unitRows].sort((a, b) => b.top4Rate - a.top4Rate).slice(0, 10))
  console.log(`  ${r.cost}코 ${r.name.padEnd(12)} 순방률(TOP4) ${(r.top4Rate * 100).toFixed(1)}%  우승률 ${(r.top1Rate * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위  채용률 ${(r.fieldRate * 100).toFixed(1)}%`);

console.log('[1-A] 코스트별 평균 유닛 승률 & 순방률');
for (let c = 1; c <= 5; c++) {
  const rs = unitRows.filter((r) => r.cost === c);
  console.log(`  ${c}코: 승률 ${(avg(rs.map((r) => r.wr)) * 100).toFixed(1)}%  순방률(TOP4) ${(avg(rs.map((r) => r.top4Rate)) * 100).toFixed(1)}%  평균순위 ${avg(rs.map((r) => r.avgPlace)).toFixed(2)}위  (${rs.length}종)`);
}

console.log('\n[1-B] 시너지 승률, 1위 픽률 및 순방(TOP 4) 순위');
const traitRows = [...traitStats.entries()]
  .map(([id, a]) => ({
    id, name: TRAIT_DEFINITIONS[id as keyof typeof TRAIT_DEFINITIONS]?.name ?? id,
    matches: a.matches, wr: a.matches ? a.wins / a.matches : 0,
    top1Rate: a.finalBoardCount ? a.top1 / a.finalBoardCount : 0,
    top4Rate: a.finalBoardCount ? a.top4 / a.finalBoardCount : 0,
    avgPlace: a.finalBoardCount ? a.finalPlacementSum / a.finalBoardCount : 0,
    adopt: a.finalBoardCount / (GAMES * 8),
  }))
  .sort((a, b) => b.wr - a.wr);
for (const r of traitRows)
  console.log(`  ${r.name.padEnd(10)} 승률 ${(r.wr * 100).toFixed(1)}%  순방(TOP4) ${(r.top4Rate * 100).toFixed(1)}%  우승(1위) ${(r.top1Rate * 100).toFixed(1)}%  평균순위 ${r.avgPlace.toFixed(2)}위  채용률 ${(r.adopt * 100).toFixed(1)}%`);

console.log('\n[1-D] 초고시너지(8버티컬/프리즘) 달성 덱 파워 검증');
if (prismaticStats.size === 0) {
  console.log('  프리즘 시너지 달성 표본 없음 (증강체 및 고레벨 달성 필요)');
} else {
  for (const [t, s] of [...prismaticStats.entries()].sort((a, b) => b[1].top1 - a[1].top1)) {
    const tname = TRAIT_DEFINITIONS[t as keyof typeof TRAIT_DEFINITIONS]?.name ?? t;
    console.log(`  [프리즘] ${tname.padEnd(10)} 달성 ${s.count}회 | 순방률(TOP4) ${pct(s.top4, s.count)} | 우승률(1위) ${pct(s.top1, s.count)} | 평균순위 ${(s.rankSum / s.count).toFixed(2)}위`);
  }
}

console.log('\n[1-E] 1~3코스트 3성 리롤 덱 순방(TOP 4) 안정성 검증');
if (reroll3StarStats.count > 0) {
  console.log(`  1~3코 3성 2개 이상 보유 덱: 총 ${reroll3StarStats.count}회 표본`);
  console.log(`  -> 순방률(TOP 4): ${pct(reroll3StarStats.top4, reroll3StarStats.count)}`);
  console.log(`  -> 우승률(1위):   ${pct(reroll3StarStats.top1, reroll3StarStats.count)}`);
  console.log(`  -> 평균 순위:     ${(reroll3StarStats.rankSum / reroll3StarStats.count).toFixed(2)}위`);
} else {
  console.log('  리롤 3성 덱 표본 없음');
}

console.log('\n[1-C] 페르소나별 평균 순위 (1위=최고)');
for (const [k, v] of placementWinsByPersona) {
  // place는 이미 실제 순위(1=우승)
  console.log(`  ${k.padEnd(20)} 평균 순위 ${(v.sum / v.n).toFixed(2)}위  1위율 ${pct(v.top1, v.n)}  (${v.n}판 표본)`);
}

console.log('\n[2] 데드락/예외');
console.log(`  게임 크래시: ${crashed}, 라운드캡(${ROUND_CAP}) 도달/데드락 중단: ${deadlocks} (캡 ${roundCapHit})`);
console.log(`  PVP 무승부율: ${pct(drawCount.pvp, drawCount.pvpTotal)} (${drawCount.pvp}/${drawCount.pvpTotal})`);
console.log(`  크립전 패배율: ${pct(drawCount.creepLoss, drawCount.creepTotal)}`);
const cr = [...creepByRound.entries()].sort();
for (const [k, v] of cr) console.log(`    크립 ${k}: 패배/무승부 ${pct(v.loss, v.total)} (${v.total}전)`);
if (errors.size === 0) console.log('  예외 로그: 없음');
for (const [k, v] of errors) console.log(`  [x${v}] ${k}`);

console.log('\n[3] 봇 APM 자원 낭비율');
for (const key of ['normal', 'rolldown'] as const) {
  const b = apm[key];
  const label = key === 'normal' ? '평상시(1~5초)' : '올인(0.6~1초)';
  const waste = b.goldFloor + b.rerollCap + b.failed;
  console.log(`  ${label}: 행동 기회 ${b.due}회, 실제 리롤 ${b.acted} (${pct(b.acted, b.due)}), 낭비 ${waste} (${pct(waste, b.due)}) = 골드하한 차단 ${pct(b.goldFloor, b.due)} / 리롤상한 소진 ${pct(b.rerollCap, b.due)} / 리롤실패(기타) ${pct(b.failed, b.due)}  평균 간격 ${(apm.intervalCnt[key] ? apm.intervalSum[key] / apm.intervalCnt[key] : 0).toFixed(0)}ms`);
}
console.log(`  봇 틱 중 올인 모드 비중: ${pct(apm.ticksRolldown, apm.ticksRolldown + apm.ticksNormal)}`);

console.log('\n[4] AI 전략 결함');
console.log(`  대기석 가득 찬 채 전투 진입: ${pct(flaws.benchFullAtCombat, flaws.prepEnds)} (그중 골드 20+ 보유 락: ${pct(flaws.benchFullAndGold20, flaws.prepEnds)})`);
console.log(`  보드 미충원(레벨보다 적은 기물): ${pct(flaws.boardUnderfill, flaws.prepEnds)} 평균 부족 ${(flaws.boardUnderfill ? flaws.boardUnderfillUnits / flaws.boardUnderfill : 0).toFixed(2)}기, 보드 0기 전투: ${flaws.noBoardAtCombat}회`);
console.log(`  골드 50+ 사장 상태로 전투 진입: ${pct(flaws.goldHoardOver50, flaws.prepEnds)}, 탈락 시 평균 잔여 골드 ${(flaws.eliminations ? flaws.goldAtEliminationSum / flaws.eliminations : 0).toFixed(1)}G`);
console.log(`  봇 1판당 덱 갈아엎기(pivot) 평균: ${(flaws.botGames ? flaws.pivotsTotal / flaws.botGames : 0).toFixed(2)}회/봇`);

console.log('\n[5] 게임 길이');
const sortedR = [...roundsPerGame].sort((a, b) => a - b);
console.log(`  평균 라운드 ${avg(roundsPerGame).toFixed(1)} (최소 ${sortedR[0]}, 중앙 ${sortedR[Math.floor(sortedR.length / 2)]}, 최대 ${sortedR[sortedR.length - 1]})`);
const combatSec = combatTickN ? (combatTickSum / combatTickN) * 0.05 : 0;
console.log(`  평균 플레이타임(정비 타이머+전투 ${combatSec.toFixed(1)}초/1x 가정 포함): 정비·정산 ${(avg(playSecPerGame) / 60).toFixed(1)}분 + 전투 ${((combatSec * avg(roundsPerGame)) / 60).toFixed(1)}분 = 약 ${((avg(playSecPerGame) + combatSec * avg(roundsPerGame)) / 60).toFixed(1)}분/판`);

// src/strategy/CompAnalyzer.ts
// Stage 1: 덱 후보 종합 평가 — stay / soft-flex / hard-pivot 추천
// Stage 2 Pivot Planner가 이 출력을 실행 계획으로 소비한다.

import {
  ITEM_DEFINITIONS,
  TRAIT_DEFINITIONS,
  TraitId,
  UNIT_TEMPLATES,
} from '../GameData';
import { Participant } from '../Participant';
import { SharedPoolManager } from '../SharedPoolManager';
import {
  COMP_CATALOG,
  CompDefinition,
  CompLevelHint,
} from './CompCatalog';
import {
  ContestLedger,
  buildContestLedger,
  scoreCompContestEaseFromLedger,
} from './ContestLedger';

/** AIBotController 순환참조 방지용 로컬 역할 추정 */
function estimateRole(
  unitId: string
): 'TANK' | 'AD_CARRY' | 'AP_CARRY' | 'BRUISER' {
  const template = UNIT_TEMPLATES[unitId];
  if (!template) return 'BRUISER';
  if (
    template.traits.includes('VANGUARD') ||
    template.traits.includes('PALADIN') ||
    (template.stats.def >= 40 && template.stats.range === 1)
  ) {
    return 'TANK';
  }
  if (
    template.traits.includes('ARCHMAGE') ||
    template.traits.includes('ARCANE_TOWER')
  ) {
    return 'AP_CARRY';
  }
  if (
    template.traits.includes('RANGER') ||
    template.traits.includes('SHADOW_ASSASSIN')
  ) {
    return 'AD_CARRY';
  }
  return template.stats.range === 1 ? 'BRUISER' : 'AD_CARRY';
}

export type CompDecision = 'stay' | 'soft-flex' | 'hard-pivot';

export type CompReasonCode =
  | 'BEST_OVERALL'
  | 'STAY_AHEAD'
  | 'CONTEST_CORE'
  | 'HIGH_COMPLETION'
  | 'ITEM_MISMATCH'
  | 'TEMPO_TOO_WEAK'
  | 'TRANSITION_COSTLY'
  | 'STAGE_MISMATCH'
  | 'LOW_CONTEST_ALT'
  | 'MARGIN_THIN';

export interface CompScoreBreakdown {
  /** 현재 보유 기준으로 당장 내는 힘 0~100 */
  combatNow: number;
  /** 핵심 2성+메인 시너지 가정 완성 힘 0~100 */
  combatComplete: number;
  /** 경합 낮을수록 높음 0~100 */
  contestEase: number;
  /** 풀/골드/레벨로 본 완성 가능성 0~100 */
  completion: number;
  /** 전환 비용 낮을수록 높음 0~100 */
  transitionEase: number;
  /** 보유 아이템↔캐리 적합 0~100 */
  itemFit: number;
  /** 스테이지/레벨 힌트 적합 0~100 */
  stageFit: number;
}

export interface CompCandidateScore {
  comp: CompDefinition;
  breakdown: CompScoreBreakdown;
  /** 가중합 종합 점수 0~100 */
  total: number;
  /** 현재 보드와 유닛 유닛 수 */
  overlapUnits: number;
  /** 핵심 유닛 중 미보유 수 */
  missingCore: number;
  reasons: CompReasonCode[];
}

export interface CompAnalysisResult {
  decision: CompDecision;
  recommended: CompCandidateScore;
  alternatives: CompCandidateScore[];
  /** 현재 targetTrait에 매칭되는 최고 컴프 (없으면 null) */
  stayComp: CompCandidateScore | null;
  margin: number;
  primaryReason: CompReasonCode;
}

export interface CompAnalyzerInput {
  bot: Participant;
  allParticipants: Participant[];
  sharedPool: SharedPoolManager;
  currentTrait: TraitId;
  stage: number;
  roundLabel?: string;
  /** Stage3: 미리 만든 경합 장부 (없으면 내부 구축) */
  contestLedger?: ContestLedger;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseStage(roundLabel: string | undefined, fallback: number): number {
  if (!roundLabel) return fallback;
  const n = parseInt(roundLabel.split('-')[0] || `${fallback}`, 10);
  return Number.isFinite(n) ? n : fallback;
}

function collectOwnedUnitMeta(bot: Participant): {
  copies: Map<string, number>;
  maxStar: Map<string, number>;
  itemCount: Map<string, number>;
  allUnitIds: Set<string>;
  completedItemIds: string[];
} {
  const copies = new Map<string, number>();
  const maxStar = new Map<string, number>();
  const itemCount = new Map<string, number>();
  const allUnitIds = new Set<string>();
  const completedItemIds: string[] = [];

  const consider = (unit: {
    unitId: string;
    starLevel: number;
    items: string[];
  } | null) => {
    if (!unit) return;
    allUnitIds.add(unit.unitId);
    copies.set(unit.unitId, (copies.get(unit.unitId) ?? 0) + 1);
    maxStar.set(
      unit.unitId,
      Math.max(maxStar.get(unit.unitId) ?? 0, unit.starLevel)
    );
    itemCount.set(
      unit.unitId,
      (itemCount.get(unit.unitId) ?? 0) + unit.items.length
    );
    for (const it of unit.items) {
      const def = ITEM_DEFINITIONS[it as keyof typeof ITEM_DEFINITIONS];
      if (def?.isCompleted) completedItemIds.push(it);
    }
  };

  for (let r = 0; r < Participant.BOARD_ROWS; r++) {
    for (let c = 0; c < Participant.BOARD_COLS; c++) {
      consider(bot.board[r][c]);
    }
  }
  for (let i = 0; i < Participant.BENCH_SIZE; i++) {
    consider(bot.bench[i]);
  }
  for (const it of bot.itemBench) {
    const def = ITEM_DEFINITIONS[it as keyof typeof ITEM_DEFINITIONS];
    if (def?.isCompleted) completedItemIds.push(it);
  }

  return { copies, maxStar, itemCount, allUnitIds, completedItemIds };
}

function stagePowerBias(comp: CompDefinition, stage: number): number {
  if (stage <= 2) return comp.earlyPower;
  if (stage <= 4) return comp.midPower;
  return comp.latePower;
}

function levelHintFit(
  hint: CompLevelHint,
  level: number,
  stage: number
): number {
  if (hint === 'reroll5') {
    if (level <= 6 && stage <= 3) return 90;
    if (level <= 7) return 70;
    return 35;
  }
  if (hint === 'fast8') {
    if (level >= 7 && level <= 9) return 90;
    if (level >= 6) return 70;
    return 45;
  }
  // fast9
  if (level >= 8) return 92;
  if (stage >= 4) return 75;
  if (stage <= 2) return 30;
  return 55;
}

function traitBreakpointProgress(
  bot: Participant,
  trait: TraitId,
  unitIds: string[]
): number {
  const thresholds = TRAIT_DEFINITIONS[trait]?.thresholds ?? [2, 4, 6];
  const ownedUnique = new Set<string>();
  for (const id of unitIds) {
    if (bot.getOwnedUnitCopiesCount(id) > 0) ownedUnique.add(id);
  }
  // also count any owned units that have the trait
  const counts = bot.getActiveTraitCounts();
  const have = counts.get(trait) ?? ownedUnique.size;
  let best = 0;
  for (const t of thresholds) {
    if (have >= t) best = Math.max(best, 40 + (t / thresholds[thresholds.length - 1]) * 60);
    else {
      const progress = have / t;
      best = Math.max(best, progress * 55);
      break;
    }
  }
  return clamp(best);
}

function scoreCombatNow(
  comp: CompDefinition,
  owned: ReturnType<typeof collectOwnedUnitMeta>,
  bot: Participant
): number {
  let score = 0;
  let weighed = 0;
  for (const id of comp.coreUnitIds) {
    weighed += 1.4;
    const copies = owned.copies.get(id) ?? 0;
    const star = owned.maxStar.get(id) ?? 0;
    if (copies <= 0) continue;
    score += 12 + star * 10 + Math.min(copies, 3) * 4;
  }
  for (const id of comp.flexUnitIds) {
    weighed += 0.7;
    const copies = owned.copies.get(id) ?? 0;
    const star = owned.maxStar.get(id) ?? 0;
    if (copies <= 0) continue;
    score += 6 + star * 6;
  }
  score += traitBreakpointProgress(bot, comp.primaryTrait, [
    ...comp.coreUnitIds,
    ...comp.flexUnitIds,
  ]) * 0.35;
  const base = stagePowerBias(comp, 3) * 0.15;
  return clamp((score / Math.max(1, weighed * 18)) * 100 * 0.85 + base);
}

function scoreCombatComplete(comp: CompDefinition, stage: number): number {
  // 핵심 2성 + 메인 시너지 중상위 브레이크 가정
  return clamp(stagePowerBias(comp, stage) * 0.92 + 8);
}

function scoreContestEase(
  comp: CompDefinition,
  bot: Participant,
  allParticipants: Participant[],
  sharedPool: SharedPoolManager,
  ledger: ContestLedger
): { ease: number; reason?: CompReasonCode } {
  // Stage3: 유닛 장부 기반 평균 경합 용이성
  let ease = scoreCompContestEaseFromLedger(ledger, comp.coreUnitIds);

  // 시너지 인원 경합은 보조 가중
  let traitContested = 0;
  for (const other of allParticipants) {
    if (other.id === bot.id || other.isEliminated) continue;
    if ((other.getActiveTraitCounts().get(comp.primaryTrait) ?? 0) >= 2) {
      traitContested++;
    }
  }
  ease = clamp(ease - traitContested * 6);

  // 캐리 유닛이 특히 말라 있으면 추가 패널티
  for (const carryId of comp.carryUnitIds) {
    const e = ledger.byUnitId.get(carryId);
    if (!e) continue;
    if (e.maxHeldByOne >= 2 && e.poolRatio < 0.45) {
      ease = clamp(ease - 8);
    }
  }

  void sharedPool;
  const reason: CompReasonCode | undefined =
    ease < 35 ? 'CONTEST_CORE' : ease >= 75 ? 'LOW_CONTEST_ALT' : undefined;
  return { ease, reason };
}

function scoreCompletion(
  comp: CompDefinition,
  owned: ReturnType<typeof collectOwnedUnitMeta>,
  bot: Participant,
  sharedPool: SharedPoolManager,
  stage: number
): number {
  let missing = 0;
  let reachable = 0;
  for (const unitId of comp.coreUnitIds) {
    const have = owned.copies.get(unitId) ?? 0;
    const needForTwoStar = Math.max(0, 3 - have);
    const rem = sharedPool.getRemainingCount(unitId);
    if (have <= 0) missing++;
    if (needForTwoStar <= rem) reachable++;
    else if (rem > 0) reachable += 0.4;
  }
  const goldFactor = clamp(bot.gold / 50) * 20;
  const levelFactor = levelHintFit(comp.levelHint, bot.level, stage) * 0.25;
  const coreFactor =
    (reachable / Math.max(1, comp.coreUnitIds.length)) * 55;
  const missingPenalty = missing * 8;
  return clamp(coreFactor + goldFactor + levelFactor - missingPenalty);
}

function scoreTransitionEase(
  comp: CompDefinition,
  owned: ReturnType<typeof collectOwnedUnitMeta>
): { ease: number; overlap: number; missingCore: number } {
  const target = new Set([...comp.coreUnitIds, ...comp.flexUnitIds]);
  let overlap = 0;
  for (const id of owned.allUnitIds) {
    if (target.has(id)) overlap++;
  }
  let missingCore = 0;
  for (const id of comp.coreUnitIds) {
    if ((owned.copies.get(id) ?? 0) <= 0) missingCore++;
  }
  const overlapRatio = overlap / Math.max(1, target.size);
  const missingRatio = missingCore / Math.max(1, comp.coreUnitIds.length);
  const ease = clamp(overlapRatio * 70 + (1 - missingRatio) * 40);
  return { ease, overlap, missingCore };
}

function scoreItemFit(
  comp: CompDefinition,
  owned: ReturnType<typeof collectOwnedUnitMeta>
): { fit: number; reason?: CompReasonCode } {
  if (owned.completedItemIds.length === 0) {
    return { fit: 55 }; // 중립 — 아이템 없으면 패널티만 약하게
  }
  let good = 0;
  let total = owned.completedItemIds.length;
  for (const itemId of owned.completedItemIds) {
    const def = ITEM_DEFINITIONS[itemId as keyof typeof ITEM_DEFINITIONS];
    if (!def) continue;
    // 역할 추정: AP 아이템 vs AD vs tank
    const name = def.name ?? '';
    const isAp =
      /라바돈|대천사|블루|쇼진|마법|스펠/.test(name) ||
      (def.stats?.spellPower ?? 0) > 0;
    const isTank =
      /가시|결의|태양|워모그|수호|방어/.test(name) ||
      (def.stats?.hp ?? 0) > 0 ||
      (def.stats?.def ?? 0) > 0;
    const isAd = !isAp && !isTank;

    let matched = false;
    for (const carryId of comp.carryUnitIds) {
      const role = estimateRole(carryId);
      if (isAp && role === 'AP_CARRY') matched = true;
      if (isAd && (role === 'AD_CARRY' || role === 'BRUISER')) matched = true;
    }
    for (const tankId of comp.tankUnitIds) {
      const role = estimateRole(tankId);
      if (isTank && (role === 'TANK' || role === 'BRUISER')) matched = true;
    }
    if (matched) good++;
  }
  const fit = clamp(30 + (good / Math.max(1, total)) * 70);
  return { fit, reason: fit < 40 ? 'ITEM_MISMATCH' : undefined };
}

function weightedTotal(b: CompScoreBreakdown, stage: number): number {
  // 초반은 지금 힘·전환, 후반은 완성·경합
  const w =
    stage <= 2
      ? {
          combatNow: 0.28,
          combatComplete: 0.12,
          contestEase: 0.12,
          completion: 0.12,
          transitionEase: 0.18,
          itemFit: 0.08,
          stageFit: 0.1,
        }
      : stage <= 4
        ? {
            combatNow: 0.18,
            combatComplete: 0.2,
            contestEase: 0.16,
            completion: 0.18,
            transitionEase: 0.1,
            itemFit: 0.1,
            stageFit: 0.08,
          }
        : {
            combatNow: 0.12,
            combatComplete: 0.24,
            contestEase: 0.18,
            completion: 0.2,
            transitionEase: 0.06,
            itemFit: 0.12,
            stageFit: 0.08,
          };

  return clamp(
    b.combatNow * w.combatNow +
      b.combatComplete * w.combatComplete +
      b.contestEase * w.contestEase +
      b.completion * w.completion +
      b.transitionEase * w.transitionEase +
      b.itemFit * w.itemFit +
      b.stageFit * w.stageFit
  );
}

function scoreComp(
  comp: CompDefinition,
  input: CompAnalyzerInput,
  owned: ReturnType<typeof collectOwnedUnitMeta>,
  ledger: ContestLedger
): CompCandidateScore {
  const stage = parseStage(input.roundLabel, input.stage);
  const combatNow = scoreCombatNow(comp, owned, input.bot);
  const combatComplete = scoreCombatComplete(comp, stage);
  const contest = scoreContestEase(
    comp,
    input.bot,
    input.allParticipants,
    input.sharedPool,
    ledger
  );
  const completion = scoreCompletion(
    comp,
    owned,
    input.bot,
    input.sharedPool,
    stage
  );
  const transition = scoreTransitionEase(comp, owned);
  const items = scoreItemFit(comp, owned);
  const stageFit = levelHintFit(comp.levelHint, input.bot.level, stage);

  const breakdown: CompScoreBreakdown = {
    combatNow,
    combatComplete,
    contestEase: contest.ease,
    completion,
    transitionEase: transition.ease,
    itemFit: items.fit,
    stageFit,
  };

  const reasons: CompReasonCode[] = [];
  if (contest.reason) reasons.push(contest.reason);
  if (items.reason) reasons.push(items.reason);
  if (completion >= 75) reasons.push('HIGH_COMPLETION');
  if (combatNow < 35 && stage >= 3) reasons.push('TEMPO_TOO_WEAK');
  if (transition.ease < 35) reasons.push('TRANSITION_COSTLY');
  if (stageFit < 40) reasons.push('STAGE_MISMATCH');

  return {
    comp,
    breakdown,
    total: weightedTotal(breakdown, stage),
    overlapUnits: transition.overlap,
    missingCore: transition.missingCore,
    reasons,
  };
}

/**
 * 전체 카탈로그를 평가하고 stay/soft-flex/hard-pivot을 추천한다.
 * Stage 1에서는 관측·시뮬 로그용; Stage 2에서 실제 피벗 실행에 연결.
 */
export function analyzeComps(input: CompAnalyzerInput): CompAnalysisResult {
  const owned = collectOwnedUnitMeta(input.bot);
  const ledger =
    input.contestLedger ??
    buildContestLedger(input.bot, input.allParticipants, input.sharedPool);
  const scored = COMP_CATALOG.map((c) =>
    scoreComp(c, input, owned, ledger)
  ).sort((a, b) => b.total - a.total);

  const stayPool = scored.filter(
    (s) => s.comp.primaryTrait === input.currentTrait
  );
  const stayComp =
    stayPool.length > 0
      ? stayPool.reduce((a, b) => (a.total >= b.total ? a : b))
      : null;

  const best = scored[0];
  const stayTotal = stayComp?.total ?? 0;
  const margin = best.total - stayTotal;

  let decision: CompDecision = 'stay';
  let primaryReason: CompReasonCode = 'STAY_AHEAD';

  if (!stayComp) {
    decision = 'hard-pivot';
    primaryReason = 'BEST_OVERALL';
  } else if (best.comp.id === stayComp.comp.id || margin < 4) {
    decision = 'stay';
    primaryReason = margin < 4 && best.comp.id !== stayComp.comp.id
      ? 'MARGIN_THIN'
      : 'STAY_AHEAD';
  } else if (margin < 12 || best.breakdown.transitionEase < 40) {
    decision = 'soft-flex';
    primaryReason =
      best.breakdown.contestEase >= 70 ? 'LOW_CONTEST_ALT' : 'MARGIN_THIN';
  } else {
    decision = 'hard-pivot';
    primaryReason =
      best.reasons.includes('CONTEST_CORE') && stayComp.breakdown.contestEase < 40
        ? 'CONTEST_CORE'
        : best.breakdown.completion >= stayComp.breakdown.completion + 15
          ? 'HIGH_COMPLETION'
          : 'BEST_OVERALL';
  }

  const recommended =
    decision === 'stay' && stayComp ? stayComp : best;

  return {
    decision,
    recommended,
    alternatives: scored.slice(0, 5),
    stayComp,
    margin,
    primaryReason,
  };
}

/** 시뮬/디버그용 한 줄 요약 */
export function formatCompAnalysis(result: CompAnalysisResult): string {
  const r = result.recommended;
  return `${result.decision} → ${r.comp.id} (${r.comp.name}) total=${r.total.toFixed(1)} margin=${result.margin.toFixed(1)} reason=${result.primaryReason} [now=${r.breakdown.combatNow.toFixed(0)} done=${r.breakdown.combatComplete.toFixed(0)} contest=${r.breakdown.contestEase.toFixed(0)} finish=${r.breakdown.completion.toFixed(0)} transit=${r.breakdown.transitionEase.toFixed(0)}]`;
}

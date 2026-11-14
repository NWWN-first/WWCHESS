// src/strategy/ContestLedger.ts
// Stage 3: 유닛 단위 경합 장부 — 보유/풀/샵/위협도

import { UNIT_TEMPLATES } from '../GameData';
import { Participant } from '../Participant';
import { SharedPoolManager } from '../SharedPoolManager';
import { COMP_CATALOG } from './CompCatalog';

export interface UnitContestEntry {
  unitId: string;
  cost: number;
  remaining: number;
  maxCount: number;
  poolRatio: number;
  heldByOthers: number;
  /** 한 명이 최대로 쥔 카피 수 */
  maxHeldByOne: number;
  /** 그 최다 보유자 id */
  topHolderId: string | null;
  inShops: number;
  /** 0~100 경합 압박 (높을수록 경쟁 심함) */
  contestedScore: number;
  /** 상대 완성 방해 가치 0~100 */
  denyValue: number;
}

export interface ContestLedger {
  byUnitId: Map<string, UnitContestEntry>;
  /** 내 관점 상위 위협 유닛 */
  topThreats: UnitContestEntry[];
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

/** 카탈로그 핵심/캐리 유닛 집합 — 견제 우선순위용 */
const CATALOG_CORE_OR_CARRY = new Set<string>();
for (const c of COMP_CATALOG) {
  for (const id of c.coreUnitIds) CATALOG_CORE_OR_CARRY.add(id);
  for (const id of c.carryUnitIds) CATALOG_CORE_OR_CARRY.add(id);
}

/**
 * 생존 플레이어 기준으로 유닛별 경합 장부 구축.
 */
export function buildContestLedger(
  self: Participant,
  allParticipants: Participant[],
  sharedPool: SharedPoolManager
): ContestLedger {
  const byUnitId = new Map<string, UnitContestEntry>();

  for (const template of Object.values(UNIT_TEMPLATES)) {
    const maxCount = sharedPool.getMaxCount(template.id) || 1;
    const remaining = sharedPool.getRemainingCount(template.id);
    const poolRatio = remaining / maxCount;

    let heldByOthers = 0;
    let maxHeldByOne = 0;
    let topHolderId: string | null = null;
    let inShops = 0;

    for (const other of allParticipants) {
      if (other.isEliminated) continue;
      for (const slot of other.shop) {
        if (slot === template.id) inShops++;
      }
      if (other.id === self.id) continue;
      const held = other.getOwnedUnitCopiesCount(template.id);
      if (held <= 0) continue;
      heldByOthers += held;
      if (held > maxHeldByOne) {
        maxHeldByOne = held;
        topHolderId = other.id;
      }
    }

    // 경합 압박: 타인 보유 + 풀 고갈 + 고코스트 가중
    const costWeight = template.cost >= 5 ? 1.35 : template.cost >= 4 ? 1.2 : 1.0;
    const contestedScore = clamp(
      (heldByOthers * 16 + (1 - poolRatio) * 45 + maxHeldByOne * 10) * costWeight
    );

    // 견제 가치: 상대가 2성/3성 임박 + 풀이 얼마 안 남음 + 메타 코어
    let denyValue = 0;
    if (template.cost >= 3 && maxHeldByOne >= 2 && !self.hasThreeStarUnit(template.id)) {
      const nearTwo = maxHeldByOne === 2 ? 35 : 0;
      const nearThree = maxHeldByOne >= 5 ? 40 : maxHeldByOne >= 4 ? 25 : 0;
      const scarcity = (1 - poolRatio) * 30;
      const meta = CATALOG_CORE_OR_CARRY.has(template.id) ? 20 : 0;
      const costBonus = template.cost >= 4 ? 15 : template.cost === 3 ? 8 : 0;
      denyValue = clamp(nearTwo + nearThree + scarcity + meta + costBonus);
    }

    byUnitId.set(template.id, {
      unitId: template.id,
      cost: template.cost,
      remaining,
      maxCount,
      poolRatio,
      heldByOthers,
      maxHeldByOne,
      topHolderId,
      inShops,
      contestedScore,
      denyValue,
    });
  }

  const topThreats = [...byUnitId.values()]
    .filter((e) => e.denyValue >= 40 || e.contestedScore >= 55)
    .sort(
      (a, b) =>
        b.denyValue + b.contestedScore * 0.35 -
        (a.denyValue + a.contestedScore * 0.35)
    )
    .slice(0, 12);

  return { byUnitId, topThreats };
}

export function getUnitContestEase(
  ledger: ContestLedger,
  unitId: string
): number {
  const e = ledger.byUnitId.get(unitId);
  if (!e) return 70;
  return clamp(100 - e.contestedScore);
}

/**
 * 견제 구매 대상 선정.
 * - 자해 방지: 골드·벤치·이미 홀드 수 제한
 * - 내 컴프와 겹치면 우선 (듀얼 목적)
 */
export function selectDenyTargets(args: {
  ledger: ContestLedger;
  self: Participant;
  keepUnitIds: Set<string>;
  buyPriorityUnitIds: Set<string>;
  alreadyDenying: Set<string>;
  maxTargets?: number;
  minDenyValue?: number;
}): string[] {
  const {
    ledger,
    self,
    keepUnitIds,
    buyPriorityUnitIds,
    alreadyDenying,
    maxTargets = 3,
    minDenyValue = 45,
  } = args;

  const emptyBench = self.bench.filter((s) => s === null).length;
  const gold = self.gold;
  // 벤치 여유 없고 골드도 타이트하면 견제 축소
  if (emptyBench === 0 && gold < 12) return [];
  if (gold < 6) return [];

  const scored: Array<{ id: string; score: number }> = [];
  for (const entry of ledger.topThreats) {
    if (alreadyDenying.has(entry.unitId)) continue;
    if (entry.denyValue < minDenyValue) continue;
    if (entry.remaining <= 0 && entry.inShops <= 0) continue;
    // 이미 3성인 유닛은 견제 무의미
    if (self.hasThreeStarUnit(entry.unitId)) continue;

    let score = entry.denyValue;
    // 내 컴프에도 쓰면 자해↓
    if (buyPriorityUnitIds.has(entry.unitId) || keepUnitIds.has(entry.unitId)) {
      score += 25;
    } else {
      // 순수 견제는 골드/벤치 여유 있을 때만
      if (emptyBench <= 1) score -= 20;
      if (gold < 20) score -= 15;
      if (entry.cost >= 5 && gold < 30) score -= 10;
    }
    // 상대 2성 임박(카피 2) 또는 3성 임박 가산은 이미 denyValue에 포함
    if (score >= minDenyValue) {
      scored.push({ id: entry.unitId, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxTargets).map((s) => s.id);
}

/** 컴프 핵심 유닛들의 평균 경합 용이성 (높을수록 여유) */
export function scoreCompContestEaseFromLedger(
  ledger: ContestLedger,
  coreUnitIds: string[]
): number {
  if (coreUnitIds.length === 0) return 60;
  let sum = 0;
  for (const id of coreUnitIds) {
    sum += getUnitContestEase(ledger, id);
  }
  return sum / coreUnitIds.length;
}

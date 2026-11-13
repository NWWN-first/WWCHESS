// src/strategy/ItemBoardPlanner.ts
// Stage 5: CompAnalyzer 캐리/탱 + 정찰 → 아이템 슬램·보드 배치 통합 계획

import {
  CompletedItemId,
  getUnitRecommendedItems,
  ITEM_DEFINITIONS,
  UNIT_TEMPLATES,
} from '../GameData';
import { Participant, UnitInstance } from '../Participant';
import { CompDefinition, getCompById } from './CompCatalog';

export type PositionStance =
  | 'clump_front'
  | 'spread_corners'
  | 'assassinate'
  | 'anti_dive';

export interface ItemBoardPlan {
  primaryCarryUnitId: string | null;
  secondaryCarryUnitId: string | null;
  primaryTankUnitId: string | null;
  /** 캐리→탱 순 BiS 완성템 우선순위 */
  preferredCompletedItems: CompletedItemId[];
  /** 0~1 — 높을수록 합성/슬램 문턱 완화 */
  slamAggressiveness: number;
  /** BiS 재료 홀드 (잡조합 억제) */
  holdForBis: boolean;
  positionStance: PositionStance;
  snipeCol: number;
  frontColOrder: number[];
  backColOrder: number[];
  assassinColOrder: number[];
  reason: string;
}

export interface ItemBoardScoutSummary {
  opponentHighHpCount: number;
  opponentHealShieldTraits: number;
  opponentVanguardCount: number;
  opponentMagicCount: number;
  /** 저격할 상대 캐리 열 (없으면 중앙) */
  threatCol: number;
}

function uniqueCols(cols: number[]): number[] {
  return cols.filter((c, i, a) => c >= 0 && c < 7 && a.indexOf(c) === i);
}

function unitCombatScore(u: UnitInstance): number {
  return u.starLevel * 40 + u.cost * 14 + u.items.length * 18 + u.atk * 0.05;
}

function pickRoleUnits(
  deployed: UnitInstance[],
  preferredIds: string[],
  roleFilter: (u: UnitInstance) => boolean
): { primary: string | null; secondary: string | null } {
  const preferred = preferredIds
    .map((id) => deployed.find((u) => u.unitId === id))
    .filter((u): u is UnitInstance => !!u)
    .sort((a, b) => unitCombatScore(b) - unitCombatScore(a));

  if (preferred.length > 0) {
    return {
      primary: preferred[0].unitId,
      secondary: preferred[1]?.unitId ?? null,
    };
  }

  const fallback = deployed
    .filter(roleFilter)
    .sort((a, b) => unitCombatScore(b) - unitCombatScore(a));
  return {
    primary: fallback[0]?.unitId ?? null,
    secondary: fallback[1]?.unitId ?? null,
  };
}

function isCarryLike(u: UnitInstance): boolean {
  const t = UNIT_TEMPLATES[u.unitId];
  if (!t) return false;
  return (
    t.traits.includes('RANGER') ||
    t.traits.includes('ARCHMAGE') ||
    t.traits.includes('SHADOW_ASSASSIN') ||
    t.traits.includes('BERSERKER') ||
    (t.stats.range >= 3 && t.cost >= 2)
  );
}

function isTankLike(u: UnitInstance): boolean {
  const t = UNIT_TEMPLATES[u.unitId];
  if (!t) return false;
  return (
    t.traits.includes('VANGUARD') ||
    t.traits.includes('PALADIN') ||
    (t.stats.def >= 40 && t.stats.range <= 1)
  );
}

function buildPreferredItems(
  primaryCarry: string | null,
  secondaryCarry: string | null,
  primaryTank: string | null,
  scout: ItemBoardScoutSummary
): CompletedItemId[] {
  const out: CompletedItemId[] = [];
  const push = (id: CompletedItemId) => {
    if (!out.includes(id)) out.push(id);
  };

  for (const uid of [primaryCarry, secondaryCarry, primaryTank]) {
    if (!uid) continue;
    for (const it of getUnitRecommendedItems(uid)) push(it);
  }

  // 정찰 카운터 템을 앞쪽 가산
  if (scout.opponentHighHpCount >= 2) {
    push('GIANT_SLAYER');
    push('BRAMBLE_VEST');
  }
  if (scout.opponentHealShieldTraits >= 1) {
    push('SUNFIRE_CAPE');
  }
  if (scout.opponentMagicCount >= 2) {
    // 마법 메타면 탱 방템 우선 (현재 카탈로그에 MR 전용 완성템 없음 → 수호자/태양)
    push('PROTECTORS_VOW');
    push('SUNFIRE_CAPE');
  }

  return out;
}

function pickStance(
  deployed: UnitInstance[],
  scout: ItemBoardScoutSummary,
  stage: number,
  hp: number
): { stance: PositionStance; reason: string } {
  const assassinCount = deployed.filter((u) =>
    u.traits.includes('SHADOW_ASSASSIN')
  ).length;
  if (assassinCount >= 2) {
    return { stance: 'assassinate', reason: 'ASSASSIN_COMP' };
  }
  if (scout.opponentVanguardCount >= 2 || scout.opponentHighHpCount >= 3) {
    return { stance: 'clump_front', reason: 'VS_FRONTLINE' };
  }
  if (scout.opponentMagicCount >= 2 && stage >= 3) {
    return { stance: 'spread_corners', reason: 'VS_AOE_MAGIC' };
  }
  if (hp <= 40 && stage >= 4) {
    return { stance: 'anti_dive', reason: 'LATE_DEFENSIVE' };
  }
  return { stance: 'spread_corners', reason: 'DEFAULT_SPREAD' };
}

/**
 * 배치·아이템 슬램을 한 라운드 계획으로 묶는다.
 * - CompCatalog carry/tank 우선, 없으면 역할 휴리스틱
 * - 정찰 위협 열로 탱/암살 저격 열 결정
 */
export function buildItemBoardPlan(args: {
  bot: Participant;
  deployedUnits: UnitInstance[];
  activeCompId?: string | null;
  stage: number;
  scout: ItemBoardScoutSummary;
  itemUrgency: number;
  macroAction: string | null;
  economyTempo: string | null;
}): ItemBoardPlan {
  const {
    bot,
    deployedUnits,
    activeCompId,
    stage,
    scout,
    itemUrgency,
    macroAction,
    economyTempo,
  } = args;

  const comp: CompDefinition | undefined = activeCompId
    ? getCompById(activeCompId)
    : undefined;

  const carries = pickRoleUnits(
    deployedUnits,
    comp?.carryUnitIds ?? [],
    isCarryLike
  );
  const tanks = pickRoleUnits(
    deployedUnits,
    comp?.tankUnitIds ?? [],
    isTankLike
  );

  // 캐리가 탱과 동일하면 보조 딜러를 캐리로 승격
  let primaryCarry = carries.primary;
  let secondaryCarry = carries.secondary;
  if (primaryCarry && primaryCarry === tanks.primary) {
    primaryCarry =
      secondaryCarry ??
      deployedUnits
        .filter((u) => u.unitId !== tanks.primary && isCarryLike(u))
        .sort((a, b) => unitCombatScore(b) - unitCombatScore(a))[0]?.unitId ??
      primaryCarry;
  }

  const preferredCompletedItems = buildPreferredItems(
    primaryCarry,
    secondaryCarry,
    tanks.primary,
    scout
  );

  const { stance, reason: stanceReason } = pickStance(
    deployedUnits,
    scout,
    stage,
    bot.hp
  );

  const snipeCol = scout.threatCol;
  let frontColOrder: number[];
  let backColOrder: number[];
  let assassinColOrder: number[];

  switch (stance) {
    case 'assassinate':
      frontColOrder = uniqueCols([3, 2, 4, snipeCol, 1, 5, 0, 6]);
      backColOrder = uniqueCols([0, 6, 1, 5, 2, 4, 3]);
      assassinColOrder = uniqueCols([
        snipeCol,
        6 - snipeCol,
        0,
        6,
        1,
        5,
        2,
        4,
        3,
      ]);
      break;
    case 'clump_front':
      frontColOrder = uniqueCols([snipeCol, 3, 2, 4, 1, 5, 0, 6]);
      backColOrder = uniqueCols([3, 2, 4, 1, 5, 0, 6]);
      assassinColOrder = uniqueCols([snipeCol, 3, 2, 4, 0, 6]);
      break;
    case 'anti_dive':
      frontColOrder = uniqueCols([3, 2, 4, 1, 5, snipeCol, 0, 6]);
      backColOrder = uniqueCols([0, 6, 1, 5, 2, 4, 3]);
      assassinColOrder = uniqueCols([1, 5, 0, 6, 2, 4, 3]);
      break;
    case 'spread_corners':
    default:
      frontColOrder = uniqueCols([snipeCol, 3, 2, 4, 1, 5, 0, 6]);
      backColOrder = uniqueCols([0, 6, 1, 5, 2, 4, 3]);
      assassinColOrder = uniqueCols([
        snipeCol,
        6 - snipeCol,
        0,
        6,
        1,
        5,
        2,
        4,
        3,
      ]);
      break;
  }

  // 슬램 공격성: 재료 쌓임 / 매크로 / 위기 / 롤다운
  const baseCount = bot.itemBench.filter((id) => {
    const def = ITEM_DEFINITIONS[id];
    return def && !def.isCompleted;
  }).length;
  let slamAggressiveness = 0.35;
  if (baseCount >= 4) slamAggressiveness += 0.25;
  else if (baseCount >= 3) slamAggressiveness += 0.15;
  if (itemUrgency > 0.55) slamAggressiveness += itemUrgency * 0.25;
  if (macroAction === 'SLAM_ITEMS') slamAggressiveness += 0.3;
  if (economyTempo === 'rolldown' || bot.hp <= 35) slamAggressiveness += 0.2;
  if (stage <= 2 && bot.hp >= 70) slamAggressiveness -= 0.1;
  slamAggressiveness = Math.max(0, Math.min(1, slamAggressiveness));

  const holdForBis =
    slamAggressiveness < 0.55 &&
    preferredCompletedItems.length > 0 &&
    bot.hp > 40 &&
    stage <= 4;

  return {
    primaryCarryUnitId: primaryCarry,
    secondaryCarryUnitId: secondaryCarry,
    primaryTankUnitId: tanks.primary,
    preferredCompletedItems,
    slamAggressiveness,
    holdForBis,
    positionStance: stance,
    snipeCol,
    frontColOrder,
    backColOrder,
    assassinColOrder,
    reason: stanceReason,
  };
}

/** 완성템이 계획상 우선 대상인지 */
export function itemPlanPriorityBonus(
  plan: ItemBoardPlan,
  itemId: CompletedItemId,
  unit: UnitInstance
): number {
  let bonus = 0;
  const prefIdx = plan.preferredCompletedItems.indexOf(itemId);
  if (prefIdx >= 0) {
    bonus += Math.max(8, 36 - prefIdx * 4);
  }

  if (unit.unitId === plan.primaryCarryUnitId) bonus += 28;
  else if (unit.unitId === plan.secondaryCarryUnitId) bonus += 16;
  else if (unit.unitId === plan.primaryTankUnitId) {
    // 탱 템이면 가산, 딜템이면 소폭
    const tankish = [
      'SUNFIRE_CAPE',
      'BRAMBLE_VEST',
      'PROTECTORS_VOW',
      'TITANS_RESOLVE',
      'BLOODTHIRSTER',
    ] as CompletedItemId[];
    bonus += tankish.includes(itemId) ? 22 : 4;
  }

  const bis = getUnitRecommendedItems(unit.unitId);
  if (bis.includes(itemId)) bonus += 20;

  return bonus;
}

/**
 * BiS 홀드 모드에서 잡조합을 막을지.
 * preferredCompletedItems에 없는 조합이고 캐리/탱이 아직 BiS 슬롯이 비었으면 true.
 */
export function shouldDeferNonBisCraft(
  plan: ItemBoardPlan,
  craftedId: CompletedItemId,
  target: UnitInstance
): boolean {
  if (!plan.holdForBis) return false;
  if (plan.preferredCompletedItems.includes(craftedId)) return false;
  if (getUnitRecommendedItems(target.unitId).includes(craftedId)) return false;

  const isKey =
    target.unitId === plan.primaryCarryUnitId ||
    target.unitId === plan.secondaryCarryUnitId ||
    target.unitId === plan.primaryTankUnitId;
  if (!isKey) return false;
  // 키 유닛에 잡템을 끼우기 전에  defer
  return target.items.length < 2;
}

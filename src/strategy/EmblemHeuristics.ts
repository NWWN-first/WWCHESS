// V2.1 휴리스틱: 상징(문장) 장착·뒤집개 조합 우선순위
// 뉴럴 재학습 전, CompCatalog 기반 봇이 상징을 벤치에만 쌓아두지 않게 한다.

import {
  CompletedItemId,
  ITEM_DEFINITIONS,
  ItemId,
  TRAIT_DEFINITIONS,
  TraitId,
  UNIT_TEMPLATES,
  getEffectiveUnitTraits,
  traitIdToEmblemItem,
} from '../GameData';
import { UnitInstance } from '../Participant';

/** 환경변수 BOT_NEURAL_CORRECTION=1 일 때만 뉴럴 보정 적용. 기본은 휴리스틱 전용. */
export function isBotHeuristicOnly(): boolean {
  if (typeof process === 'undefined') return true;
  return process.env?.BOT_NEURAL_CORRECTION !== '1';
}

export function isEmblemItem(itemId: ItemId): boolean {
  return !!ITEM_DEFINITIONS[itemId]?.grantsTrait;
}

export function emblemGrantedTrait(itemId: ItemId): TraitId | null {
  return ITEM_DEFINITIONS[itemId]?.grantsTrait ?? null;
}

/**
 * 상징을 어느 유닛에 끼울지 점수.
 * - 아직 해당 시너지가 없는 유닛에 끼워야 카운트 +1 (TFT식)
 * - target/secondary 시너지·다음 브레이크포인트 직전이면 대폭 가산
 */
export function scoreEmblemEquipTarget(args: {
  emblemId: ItemId;
  unit: UnitInstance;
  targetTrait: TraitId;
  secondaryTrait: TraitId | null;
  boardTraitCounts: Map<TraitId, number>;
}): number {
  const trait = emblemGrantedTrait(args.emblemId);
  if (!trait) return -999;
  if (args.unit.items.length >= 3) return -999;

  const effective = getEffectiveUnitTraits(args.unit.traits, args.unit.items);
  const alreadyHas = effective.includes(trait);

  let score = 40;
  // 이미 가진 시너지에 상징을 끼우면 카운트 이득 없음 → 강하게 페널티
  if (alreadyHas) score -= 55;
  else score += 50;

  if (trait === args.targetTrait) score += 70;
  else if (args.secondaryTrait && trait === args.secondaryTrait) score += 40;
  else if (TRAIT_DEFINITIONS[trait]?.type === 'ORIGIN') score += 8;
  else score -= 5;

  const def = TRAIT_DEFINITIONS[trait];
  const have = args.boardTraitCounts.get(trait) ?? 0;
  // 장착 후 카운트 (없는 유닛에 끼울 때만 +1)
  const after = have + (alreadyHas ? 0 : 1);
  if (def) {
    for (const th of def.thresholds) {
      if (have < th && after >= th) {
        // 브레이크포인트 달성
        const isTop = th === def.thresholds[def.thresholds.length - 1];
        score += isTop ? 90 : 55;
      } else if (have < th && after === th - 1) {
        score += 18; // 문장 하나 더 있으면 찍히는 직전
      }
    }
  }

  // 슬롯 여유·값싼 유닛에 상징을 먼저 (캐리 BiS 슬롯 보존)
  score += (3 - args.unit.items.length) * 6;
  const cost = UNIT_TEMPLATES[args.unit.unitId]?.cost ?? 3;
  if (cost <= 2) score += 8;
  if (cost >= 4 && args.unit.items.length >= 1) score -= 10;

  return score;
}

/** targetTrait에 맞는 상징 CompletedItemId (없으면 null) */
export function preferredEmblemForTrait(trait: TraitId): CompletedItemId | null {
  return traitIdToEmblemItem(trait);
}

/**
 * 뒤집개 조합 결과 상징이면 targetTrait 쪽으로 점수 보정.
 * 일반 완성템이면 0.
 */
export function spatulaCraftTraitBonus(
  craftedId: CompletedItemId,
  targetTrait: TraitId,
  secondaryTrait: TraitId | null
): number {
  const trait = emblemGrantedTrait(craftedId);
  if (!trait) return 0;
  if (trait === targetTrait) return 85;
  if (secondaryTrait && trait === secondaryTrait) return 45;
  return 10;
}

/** 잉여 재료로 유닛에 꽂지 말아야 할 것 (뒤집개 등) */
export function shouldHoldBaseComponent(itemId: ItemId): boolean {
  return itemId === 'SPATULA';
}

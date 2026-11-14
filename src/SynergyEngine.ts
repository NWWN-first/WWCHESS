// src/SynergyEngine.ts

import {
  TRAIT_DEFINITIONS,
  TraitDefinition,
  TraitEffectTier,
  TraitId,
  UNIT_TEMPLATES,
  getEffectiveUnitTraits,
} from './GameData';
import { Participant, UnitInstance } from './Participant';

/** 시너지 UI 색 등급. 모든 시너지가 4단계를 갖진 않음(실버/플레 생략 가능). */
export type SynergyStyleTier =
  | 'NONE'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM';

export interface ActiveSynergyState {
  traitId: TraitId;
  definition: TraitDefinition;
  count: number;
  activeThreshold: number | null;
  nextThreshold: number | null;
  styleTier: SynergyStyleTier;
  activeEffect: TraitEffectTier | null;
}

const STYLE_PRIORITY: Record<SynergyStyleTier, number> = {
  PLATINUM: 4,
  GOLD: 3,
  SILVER: 2,
  BRONZE: 1,
  NONE: 0,
};

/**
 * 임계값 개수에 맞는 색 사다리.
 * - 4단계: 브론즈→실버→골드→플레
 * - 3단계: 브론즈→실버→플레 (골드 없음) 또는 브론즈→골드→플레는 아님 — TFT식 기본은 B/S/플레
 * - 2단계: 브론즈→골드 (실버·플레 없음)
 * - 1단계: 골드
 */
const STYLE_LADDER_BY_LENGTH: Record<number, SynergyStyleTier[]> = {
  1: ['GOLD'],
  2: ['BRONZE', 'GOLD'],
  3: ['BRONZE', 'SILVER', 'PLATINUM'],
  4: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'],
};

export class SynergyEngine {
  /**
   * participant.board 위에 배치된 기물들의 고유 unitId만 추출(Set)하여
   * 각 기물의 traits 카운트를 합산하고, participant.bonusTraits(증강체 추가 시너지)를 더해
   * 각 시너지의 현재 카운트, 활성화된 등급(NONE~PLATINUM),
   * 그리고 적용될 수치 데이터(activeEffect)를 반환한다.
   */
  public static calculateActiveSynergies(participant: Participant): ActiveSynergyState[] {
    const traitCounts = new Map<TraitId, number>();
    const uniqueBoardUnitIds = new Set<string>();

    // 1. 보드 위 고유(Unique) 기물 추출 및 시너지 카운트 합산
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = participant.board[r][c];
        if (!unit || unit.currentHp <= 0) continue;
        if (uniqueBoardUnitIds.has(unit.unitId)) continue;

        uniqueBoardUnitIds.add(unit.unitId);
        const template = UNIT_TEMPLATES[unit.unitId];
        const baseTraits = template ? template.traits : unit.traits;
        const traits = getEffectiveUnitTraits(baseTraits, unit.items);

        for (const traitId of traits) {
          traitCounts.set(traitId, (traitCounts.get(traitId) ?? 0) + 1);
        }
      }
    }

    // 2. 증강체(문장/왕관)로 획득한 bonusTraits 합산
    for (const [traitId, bonusCount] of participant.bonusTraits.entries()) {
      if (bonusCount > 0) {
        traitCounts.set(traitId, (traitCounts.get(traitId) ?? 0) + bonusCount);
      }
    }

    // 3. 각 시너지별 활성화 단계(BRONZE / SILVER / GOLD / PLATINUM) 및 효과 계산
    const results: ActiveSynergyState[] = [];

    for (const [traitId, count] of traitCounts.entries()) {
      if (count <= 0) continue;
      const definition = TRAIT_DEFINITIONS[traitId];
      if (!definition) continue;

      const state = SynergyEngine.buildSynergyState(definition, count);
      results.push(state);
    }

    // 4. 정렬: 활성화된 등급 높은 순 -> 활성 여부 -> 현재 카운트 높은 순
    results.sort((a, b) => {
      const prioDiff = STYLE_PRIORITY[b.styleTier] - STYLE_PRIORITY[a.styleTier];
      if (prioDiff !== 0) return prioDiff;
      return b.count - a.count;
    });

    return results;
  }

  /**
   * 특정 시너지 정의와 카운트를 받아 등급(NONE~PLATINUM) 및 효과 객체를 생성한다.
   */
  public static buildSynergyState(
    definition: TraitDefinition,
    count: number
  ): ActiveSynergyState {
    const { thresholds, effects } = definition;
    let activeIndex = -1;

    for (let i = 0; i < thresholds.length; i++) {
      if (count >= thresholds[i]) {
        activeIndex = i;
      }
    }

    const activeThreshold = activeIndex >= 0 ? thresholds[activeIndex] : null;
    const nextThreshold =
      activeIndex + 1 < thresholds.length ? thresholds[activeIndex + 1] : null;
    const activeEffect: TraitEffectTier | null =
      activeIndex >= 0 ? effects[activeIndex] ?? null : null;

    const styleTier = SynergyEngine.resolveStyleTier(thresholds, activeIndex);

    return {
      traitId: definition.id,
      definition,
      count,
      activeThreshold,
      nextThreshold,
      styleTier,
      activeEffect,
    };
  }

  /**
   * 시너지 임계값 단계 → 시각 등급.
   * 시너지마다 단계 수가 다르므로, 해당 시너지 사다리에서 활성 인덱스 색만 쓴다.
   * (예: 2단계면 브론즈/골드만, 3단계면 브론즈/실버/플레 — 없는 색은 건너뜀)
   */
  private static resolveStyleTier(
    thresholds: number[],
    activeIndex: number
  ): SynergyStyleTier {
    if (activeIndex < 0) return 'NONE';

    const totalTiers = Math.min(4, Math.max(1, thresholds.length));
    const ladder =
      STYLE_LADDER_BY_LENGTH[totalTiers] ?? STYLE_LADDER_BY_LENGTH[4];
    const clampedIdx = Math.min(activeIndex, ladder.length - 1);
    return ladder[clampedIdx];
  }

  /**
   * 빠른 조회를 위해 TraitId -> ActiveSynergyState 맵을 반환한다.
   */
  public static getActiveSynergyMap(
    participant: Participant
  ): Map<TraitId, ActiveSynergyState> {
    const list = SynergyEngine.calculateActiveSynergies(participant);
    const map = new Map<TraitId, ActiveSynergyState>();
    for (const item of list) {
      map.set(item.traitId, item);
    }
    return map;
  }

  /**
   * 임의의 기물 조합이 만들어내는 시너지 점수를 수치화한다 (AI 봇 최적 조합 평가용).
   * - 최고단계(PLATINUM) 대박 뽕맛 가중치 (+65)
   * - 다채로운 시너지 활성화(2/2/2, 4/2/2 등)를 통한 초중반 체력 보존 및 TOP 4(순방) 가중치 부여
   */
  public static evaluateCandidateUnitsSynergyScore(
    units: UnitInstance[],
    bonusTraits?: Map<TraitId, number>
  ): number {
    const counts = new Map<TraitId, number>();
    const uniqueIds = new Set<string>();

    for (const u of units) {
      if (uniqueIds.has(u.unitId)) continue;
      uniqueIds.add(u.unitId);
      for (const t of getEffectiveUnitTraits(u.traits, u.items)) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }

    if (bonusTraits) {
      for (const [t, b] of bonusTraits.entries()) {
        counts.set(t, (counts.get(t) ?? 0) + b);
      }
    }

    let score = 0;
    let activeSynergyCount = 0;

    for (const [traitId, count] of counts.entries()) {
      const def = TRAIT_DEFINITIONS[traitId];
      if (!def) continue;
      const state = SynergyEngine.buildSynergyState(def, count);
      if (state.styleTier === 'PLATINUM') {
        score += 65;
        activeSynergyCount++;
      } else if (state.styleTier === 'GOLD') {
        score += 34;
        activeSynergyCount++;
      } else if (state.styleTier === 'SILVER') {
        score += 20;
        activeSynergyCount++;
      } else if (state.styleTier === 'BRONZE') {
        score += 11;
        activeSynergyCount++;
      } else if (count > 0) {
        score += count * 1.5;
      }
    }

    // TFT 순방(TOP 4) 가중치: 다양한 시너지가 촘촘히 엮여있는 안정적인 밸런스 조합에 보너스 부여
    if (activeSynergyCount >= 4) {
      score += 20;
    } else if (activeSynergyCount >= 3) {
      score += 12;
    }

    return score;
  }
}

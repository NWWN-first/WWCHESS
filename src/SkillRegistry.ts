// src/SkillRegistry.ts

import { CostTier, ItemId, SkillType, StarLevel, TraitId, UNIT_TEMPLATES } from './GameData';

export type CombatTeam = 'HOME' | 'AWAY';

export type CombatDamageType = 'PHYSICAL' | 'MAGICAL' | 'TRUE';

export type CombatEventType =
  | 'MOVE'
  | 'LEAP'
  | 'BASIC_ATTACK'
  | 'SKILL_CAST'
  | 'DAMAGE'
  | 'HEAL'
  | 'SHIELD'
  | 'STUN'
  | 'ARMOR_SHRED'
  | 'DEATH'
  | 'REVIVE_START'
  | 'REVIVE_COMPLETE'
  | 'GOLD_DROP'
  | 'MANA_RESET'
  | 'FIVE_COST_3STAR_CATACLYSM';

export interface CombatEvent {
  type: CombatEventType;
  tick: number;
  sourceId?: string;
  targetId?: string;
  team?: CombatTeam;
  unitId?: string;
  skillName?: string;
  fromRow?: number;
  fromCol?: number;
  toRow?: number;
  toCol?: number;
  amount?: number;
  damageType?: CombatDamageType;
  isCrit?: boolean;
  goldAmount?: number;
  message?: string;
}

export interface CombatUnit {
  instanceId: string;
  unitId: string;
  name: string;
  team: CombatTeam;
  cost: CostTier;
  starLevel: StarLevel;
  traits: TraitId[];
  icon: string;
  items: ItemId[];

  row: number;
  col: number;

  maxHp: number;
  currentHp: number;
  shield: number;

  atk: number;
  baseAtk: number;
  def: number;
  baseDef: number;
  atkSpeed: number;
  baseAtkSpeed: number;
  range: number;

  startMana: number;
  maxMana: number;
  currentMana: number;

  spellPower: number;
  critChance: number;
  critDamage: number;
  omnivamp: number;

  enableSkillCrit: boolean;
  trueDamageBonusRatio: number;
  damageReductionRatio: number;
  ccDurationReduction: number;

  stunTimerMs: number;
  manaLockTimerMs: number;
  attackCooldownMs: number;

  basicAttackCount: number;
  titansStacks: number;
  berserkTriggered: boolean;
  bloodthirsterTriggered: boolean;
  protectorsVowTriggered: boolean;

  hasReviveAvailable: boolean;
  isReviving: boolean;
  reviveTimerMs: number;
  reviveHpRatio: number;
  reviveBonusAtkSpeed: number;

  ownerGold: number;
  totalDamageDealt: number;
}

/**
 * CombatEngine에서 SkillRegistry로 제공하는 데미지/회복/상태이상/이동 헬퍼 컨텍스트 인터페이스
 */
export interface SkillCombatContext {
  currentTick: number;
  dealDamage(
    attacker: CombatUnit,
    target: CombatUnit,
    rawAmount: number,
    damageType: CombatDamageType,
    canCrit: boolean,
    isSkill: boolean
  ): { actualDamage: number; killed: boolean; isCrit: boolean };
  healUnit(source: CombatUnit, target: CombatUnit, amount: number): number;
  addShield(source: CombatUnit, target: CombatUnit, amount: number): void;
  applyStun(source: CombatUnit, target: CombatUnit, durationMs: number): void;
  shredArmor(source: CombatUnit, target: CombatUnit, shredRatio: number): void;
  teleportUnit(unit: CombatUnit, targetRow: number, targetCol: number): boolean;
  findEmptyTileBehindTarget(mover: CombatUnit, target: CombatUnit): { row: number; col: number } | null;
  emitEvent(event: CombatEvent): void;
}

export type SkillHandler = (
  caster: CombatUnit,
  primaryTarget: CombatUnit,
  allUnits: CombatUnit[],
  ctx: SkillCombatContext
) => void;

// ============================================================================
// 유틸리티 헬퍼 (타겟 필터링 및 거리 계산)
// ============================================================================

function getLivingEnemies(caster: CombatUnit, allUnits: CombatUnit[]): CombatUnit[] {
  return allUnits.filter(
    (u) => u.team !== caster.team && u.currentHp > 0 && !u.isReviving
  );
}

function getLivingAllies(caster: CombatUnit, allUnits: CombatUnit[]): CombatUnit[] {
  return allUnits.filter(
    (u) => u.team === caster.team && u.currentHp > 0 && !u.isReviving
  );
}

function chebyshevDist(
  r1: number,
  c1: number,
  r2: number,
  c2: number
): number {
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
}

function getSkillPrimaryValue(caster: CombatUnit): number {
  const template = UNIT_TEMPLATES[caster.unitId];
  if (!template) return 200;
  const idx = Math.max(0, Math.min(2, caster.starLevel - 1));
  return template.skill.baseValueByStar[idx] * caster.spellPower;
}

function getSkillSecondaryValue(caster: CombatUnit): number {
  const template = UNIT_TEMPLATES[caster.unitId];
  if (!template || !template.skill.secondaryValueByStar) return 0;
  const idx = Math.max(0, Math.min(2, caster.starLevel - 1));
  return template.skill.secondaryValueByStar[idx];
}

// ============================================================================
// 20종 판타지 챔피언 전용 스킬 전략 맵 (Record<string, SkillHandler>)
// ============================================================================

const UNIT_SKILL_HANDLERS: Record<string, SkillHandler> = {
  /**
   * 1. [1코] 제국 보병 가렌 (u1_garen): 심판의 회전참
   * 주변 1칸 적들에게 물리 피해를 입히고 자신에게 신성 보호막 생성
   */
  u1_garen: (caster, primaryTarget, allUnits, ctx) => {
    const damage = getSkillPrimaryValue(caster) + caster.atk * 0.8;
    const shieldAmount = getSkillSecondaryValue(caster) * caster.spellPower;

    ctx.addShield(caster, caster, shieldAmount);

    const nearbyEnemies = getLivingEnemies(caster, allUnits).filter(
      (e) => chebyshevDist(caster.row, caster.col, e.row, e.col) <= 1
    );
    const targets = nearbyEnemies.length > 0 ? nearbyEnemies : [primaryTarget];

    for (const enemy of targets) {
      if (enemy.currentHp > 0) {
        ctx.dealDamage(caster, enemy, damage, 'PHYSICAL', caster.enableSkillCrit, true);
      }
    }
  },

  /**
   * 2. [1코] 고블린 소매치기 핍 (u1_pip): 급소 소매치기
   * 적 후방 빈 타일로 도약 후 단검 찌르기. 처치 시 30% 확률로 1골드 즉시 드랍!
   */
  u1_pip: (caster, primaryTarget, _allUnits, ctx) => {
    const behindTile = ctx.findEmptyTileBehindTarget(caster, primaryTarget);
    if (behindTile) {
      ctx.teleportUnit(caster, behindTile.row, behindTile.col);
    }

    const damage = getSkillPrimaryValue(caster) + caster.atk * 1.1;
    const goldChance = getSkillSecondaryValue(caster) || 0.3;
    const result = ctx.dealDamage(
      caster,
      primaryTarget,
      damage,
      'PHYSICAL',
      true,
      true
    );

    if (result.killed && Math.random() < goldChance) {
      caster.ownerGold += 1;
      ctx.emitEvent({
        type: 'GOLD_DROP',
        tick: ctx.currentTick,
        sourceId: caster.instanceId,
        targetId: primaryTarget.instanceId,
        team: caster.team,
        unitId: caster.unitId,
        goldAmount: 1,
        message: '🪙 [소매치기 핍] 적 처치로 +1 골드 획득!',
      });
    }
  },

  /**
   * 3. [1코] 엘프 궁수 아리아 (u1_aria): 바람의 3연사
   * 단일 대상에게 초고속으로 화살 3발을 연속 발사하여 물리 피해
   */
  u1_aria: (caster, primaryTarget, allUnits, ctx) => {
    const totalDamage = getSkillPrimaryValue(caster) + caster.atk * 1.35;
    const perArrowDamage = totalDamage / 3;

    for (let i = 0; i < 3; i++) {
      let currentTarget = primaryTarget;
      if (currentTarget.currentHp <= 0) {
        const alive = getLivingEnemies(caster, allUnits);
        if (alive.length === 0) break;
        currentTarget = alive[0];
      }
      ctx.dealDamage(
        caster,
        currentTarget,
        perArrowDamage,
        'PHYSICAL',
        caster.enableSkillCrit,
        true
      );
    }
  },

  /**
   * 4. [1코] 해골 전사 스켈 (u1_skel): 원한의 가시 강타
   * 주 대상에게 강력한 물리 강타 + 주변 1칸 적들에게 가시 충격파 마법 피해
   */
  u1_skel: (caster, primaryTarget, allUnits, ctx) => {
    const mainDamage = getSkillPrimaryValue(caster) + caster.atk * 0.9;
    const splashDamage = getSkillSecondaryValue(caster) * caster.spellPower;

    ctx.dealDamage(
      caster,
      primaryTarget,
      mainDamage,
      'PHYSICAL',
      caster.enableSkillCrit,
      true
    );

    const neighbors = getLivingEnemies(caster, allUnits).filter(
      (e) =>
        e.instanceId !== primaryTarget.instanceId &&
        chebyshevDist(primaryTarget.row, primaryTarget.col, e.row, e.col) <= 1
    );

    for (const enemy of neighbors) {
      ctx.dealDamage(caster, enemy, splashDamage, 'MAGICAL', caster.enableSkillCrit, true);
    }
  },

  /**
   * 5. [1코] 견습 마법사 루미 (u1_lumi): 비전 구체
   * 단일 대상에게 강력한 비전 구체 마법 피해
   */
  u1_lumi: (caster, primaryTarget, _allUnits, ctx) => {
    const damage = getSkillPrimaryValue(caster);
    ctx.dealDamage(
      caster,
      primaryTarget,
      damage,
      'MAGICAL',
      caster.enableSkillCrit,
      true
    );
  },

  /**
   * 6. [2코] 고블린 연금술사 팅크 (u2_tink): 부식성 산성 폭탄
   * 대상과 주변 1칸 적들에게 광역 마법 피해 및 방어력 40% 파쇄(Shred)
   */
  u2_tink: (caster, primaryTarget, allUnits, ctx) => {
    const damage = getSkillPrimaryValue(caster);
    const shredRatio = getSkillSecondaryValue(caster) || 0.4;

    const cluster = getLivingEnemies(caster, allUnits).filter(
      (e) => chebyshevDist(primaryTarget.row, primaryTarget.col, e.row, e.col) <= 1
    );

    for (const enemy of cluster) {
      ctx.shredArmor(caster, enemy, shredRatio);
      ctx.dealDamage(caster, enemy, damage, 'MAGICAL', caster.enableSkillCrit, true);
    }
  },

  /**
   * 7. [2코] 성전사 잔느 (u2_jeanne): 성녀의 방패 강타
   * 대상을 1.5초 기절시키고 마법 피해를 입히며 최저 체력 아군을 치유
   */
  u2_jeanne: (caster, primaryTarget, allUnits, ctx) => {
    const damage = getSkillPrimaryValue(caster);
    const healAmount = getSkillSecondaryValue(caster) * caster.spellPower;

    ctx.dealDamage(caster, primaryTarget, damage, 'MAGICAL', caster.enableSkillCrit, true);
    ctx.applyStun(caster, primaryTarget, 1500);

    const allies = getLivingAllies(caster, allUnits);
    if (allies.length > 0) {
      allies.sort((a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp);
      ctx.healUnit(caster, allies[0], healAmount);
    }
  },

  /**
   * 8. [2코] 심연의 사냥꾼 카일 (u2_kyle): 심연의 파멸 화살
   * 기본 물리 피해 + 대상 현재 체력 비례 추가 마법 피해
   */
  u2_kyle: (caster, primaryTarget, _allUnits, ctx) => {
    const baseDamage = getSkillPrimaryValue(caster) + caster.atk * 0.85;
    const currentHpRatio = getSkillSecondaryValue(caster) || 0.18;
    const bonusHpDamage = primaryTarget.currentHp * currentHpRatio;

    ctx.dealDamage(
      caster,
      primaryTarget,
      baseDamage + bonusHpDamage,
      'PHYSICAL',
      caster.enableSkillCrit,
      true
    );
  },

  /**
   * 9. [2코] 숲의 수호신 엔트 (u2_ent): 대자연의 뿌리 감옥
   * 주변 1칸 적들을 1.2초 기절(속박)시키고 마법 피해를 입히며 자신의 체력을 대량 회복
   */
  u2_ent: (caster, primaryTarget, allUnits, ctx) => {
    const damage = getSkillPrimaryValue(caster);
    const healAmount = getSkillSecondaryValue(caster) * caster.spellPower;

    ctx.healUnit(caster, caster, healAmount);

    const nearbyEnemies = getLivingEnemies(caster, allUnits).filter(
      (e) => chebyshevDist(caster.row, caster.col, e.row, e.col) <= 1
    );
    const targets = nearbyEnemies.length > 0 ? nearbyEnemies : [primaryTarget];

    for (const enemy of targets) {
      ctx.dealDamage(caster, enemy, damage, 'MAGICAL', caster.enableSkillCrit, true);
      ctx.applyStun(caster, enemy, 1200);
    }
  },

  /**
   * 10. [2코] 그림자 칼날 제드 (u2_zed): 사망 표식 베기
   * 적진 핵심 원거리 딜러(가장 뒷열 적) 뒤로 이동해 확정 치명타 암살 베기
   */
  u2_zed: (caster, primaryTarget, allUnits, ctx) => {
    const enemies = getLivingEnemies(caster, allUnits);
    let backlineTarget = primaryTarget;

    if (enemies.length > 0) {
      // 사거리가 가장 길거나 가장 후방에 위치한 딜러 탐색
      enemies.sort((a, b) => b.range * 10 + b.atk - (a.range * 10 + a.atk));
      backlineTarget = enemies[0];
    }

    const behindTile = ctx.findEmptyTileBehindTarget(caster, backlineTarget);
    if (behindTile) {
      ctx.teleportUnit(caster, behindTile.row, behindTile.col);
    }

    const damage = (getSkillPrimaryValue(caster) + caster.atk * 1.1) * caster.critDamage;
    ctx.dealDamage(caster, backlineTarget, damage, 'PHYSICAL', false, true);
  },

  /**
   * 11. [3코] 고블린 용병대장 그롬 (u3_grom): 황금욕의 대지분쇄
   * 광역 도끼 내려찍기 + 보유 골드 10골드당 스킬 피해량 15% 추가 증가!
   */
  u3_grom: (caster, primaryTarget, allUnits, ctx) => {
    const baseDamage = getSkillPrimaryValue(caster) + caster.atk * 1.0;
    const bonusPerTenGold = getSkillSecondaryValue(caster) || 0.15;
    const goldStacks = Math.min(8, Math.floor(caster.ownerGold / 10));
    const finalDamage = baseDamage * (1 + goldStacks * bonusPerTenGold);

    const targets = getLivingEnemies(caster, allUnits).filter(
      (e) => chebyshevDist(primaryTarget.row, primaryTarget.col, e.row, e.col) <= 1
    );

    for (const enemy of targets) {
      ctx.dealDamage(
        caster,
        enemy,
        finalDamage,
        'PHYSICAL',
        caster.enableSkillCrit,
        true
      );
    }
  },

  /**
   * 12. [3코] 드래곤 나이트 지크 (u3_sieg): 용린의 화염 방패
   * 전방 부채꼴(대상 및 주변 1칸) 화염 방사 마법 피해 및 자신의 방어력 2배 상승
   */
  u3_sieg: (caster, primaryTarget, allUnits, ctx) => {
    const damage = getSkillPrimaryValue(caster);
    caster.def = Math.min(600, Math.round(caster.def * 2));

    const targets = getLivingEnemies(caster, allUnits).filter(
      (e) => chebyshevDist(primaryTarget.row, primaryTarget.col, e.row, e.col) <= 1
    );

    for (const enemy of targets) {
      ctx.dealDamage(caster, enemy, damage, 'MAGICAL', caster.enableSkillCrit, true);
    }
  },

  /**
   * 13. [3코] 엘프 바람술사 실피 (u3_sylphie): 폭풍의 회오리
   * 적이 가장 밀집한 지역에 회오리바람을 일으켜 광역 마법 피해 및 1초 에어본(기절)
   */
  u3_sylphie: (caster, primaryTarget, allUnits, ctx) => {
    const enemies = getLivingEnemies(caster, allUnits);
    let bestCenter = primaryTarget;
    let maxClusterSize = -1;

    for (const candidate of enemies) {
      const neighbors = enemies.filter(
        (other) => chebyshevDist(candidate.row, candidate.col, other.row, other.col) <= 1
      ).length;
      if (neighbors > maxClusterSize) {
        maxClusterSize = neighbors;
        bestCenter = candidate;
      }
    }

    const damage = getSkillPrimaryValue(caster);
    const affected = enemies.filter(
      (e) => chebyshevDist(bestCenter.row, bestCenter.col, e.row, e.col) <= 1
    );

    for (const enemy of affected) {
      ctx.dealDamage(caster, enemy, damage, 'MAGICAL', caster.enableSkillCrit, true);
      ctx.applyStun(caster, enemy, 1000);
    }
  },

  /**
   * 14. [3코] 블러드 로드 블라드 (u3_vlad): 선혈의 향연
   * 가장 가까운 적 3명의 생명력을 흡수하여 입힌 피해의 100%만큼 자신의 체력 회복
   */
  u3_vlad: (caster, _primaryTarget, allUnits, ctx) => {
    const enemies = getLivingEnemies(caster, allUnits).sort(
      (a, b) =>
        chebyshevDist(caster.row, caster.col, a.row, a.col) -
        chebyshevDist(caster.row, caster.col, b.row, b.col)
    );

    const targets = enemies.slice(0, 3);
    const damagePerTarget = getSkillPrimaryValue(caster);
    let totalDrained = 0;

    for (const enemy of targets) {
      const res = ctx.dealDamage(
        caster,
        enemy,
        damagePerTarget,
        'MAGICAL',
        caster.enableSkillCrit,
        true
      );
      totalDrained += res.actualDamage;
    }

    if (totalDrained > 0) {
      ctx.healUnit(caster, caster, totalDrained);
    }
  },

  /**
   * 15. [4코] 성검의 집행자 아서 (u4_arthur): 성검 엑스칼리버 강림
   * 하늘에서 거대한 성검 엑스칼리버를 내리꽂아 대상과 주변 적들에게 막대한 물리 피해 및 아군 전체 보호막 부여
   */
  u4_arthur: (caster, primaryTarget, allUnits, ctx) => {
    const swordDamage = getSkillPrimaryValue(caster) + caster.atk * 1.25;
    const teamShield = getSkillSecondaryValue(caster) * caster.spellPower;

    const enemiesInImpact = getLivingEnemies(caster, allUnits).filter(
      (e) => chebyshevDist(primaryTarget.row, primaryTarget.col, e.row, e.col) <= 1
    );

    for (const enemy of enemiesInImpact) {
      ctx.dealDamage(
        caster,
        enemy,
        swordDamage,
        'PHYSICAL',
        caster.enableSkillCrit,
        true
      );
    }

    const allies = getLivingAllies(caster, allUnits);
    for (const ally of allies) {
      ctx.addShield(caster, ally, teamShield);
    }
  },

  /**
   * 16. [4코] 대마도사 멀린 (u4_merlin): 메테오 스웜
   * 전장에 메테오(운석 폭격) 5발을 떨어뜨려 적 진영을 광역 마법 초토화
   */
  u4_merlin: (caster, _primaryTarget, allUnits, ctx) => {
    const perMeteorDamage = getSkillPrimaryValue(caster) * 0.48;

    for (let i = 0; i < 5; i++) {
      const livingEnemies = getLivingEnemies(caster, allUnits);
      if (livingEnemies.length === 0) break;

      const strikeTarget =
        livingEnemies[Math.floor(Math.random() * livingEnemies.length)];

      // 운석 충돌 지점 및 인접 적에게 광역 피해
      for (const enemy of livingEnemies) {
        const dist = chebyshevDist(
          strikeTarget.row,
          strikeTarget.col,
          enemy.row,
          enemy.col
        );
        if (dist === 0) {
          ctx.dealDamage(
            caster,
            enemy,
            perMeteorDamage,
            'MAGICAL',
            caster.enableSkillCrit,
            true
          );
        } else if (dist === 1) {
          ctx.dealDamage(
            caster,
            enemy,
            perMeteorDamage * 0.55,
            'MAGICAL',
            caster.enableSkillCrit,
            true
          );
        }
      }
    }
  },

  /**
   * 17. [4코] 칠흑의 사신 타나토스 (u4_thanatos): 사신의 연쇄 처형
   * 체력이 가장 낮은 적을 처형하고, 처치 성공 시 즉시 마나를 100% 회복하여 연쇄 암살 발동!
   */
  u4_thanatos: (caster, primaryTarget, allUnits, ctx) => {
    const enemies = getLivingEnemies(caster, allUnits);
    let lowestEnemy = primaryTarget;

    if (enemies.length > 0) {
      enemies.sort((a, b) => a.currentHp - b.currentHp);
      lowestEnemy = enemies[0];
    }

    const behindTile = ctx.findEmptyTileBehindTarget(caster, lowestEnemy);
    if (behindTile) {
      ctx.teleportUnit(caster, behindTile.row, behindTile.col);
    }

    const executeDamage = getSkillPrimaryValue(caster) + caster.atk * 1.4;
    const result = ctx.dealDamage(
      caster,
      lowestEnemy,
      executeDamage,
      'PHYSICAL',
      true,
      true
    );

    if (result.killed) {
      caster.currentMana = caster.maxMana;
      caster.manaLockTimerMs = 0;
      ctx.emitEvent({
        type: 'MANA_RESET',
        tick: ctx.currentTick,
        sourceId: caster.instanceId,
        targetId: lowestEnemy.instanceId,
        team: caster.team,
        unitId: caster.unitId,
        message: '⚰️ [타나토스] 처형 성공! 마나 100% 즉시 리셋!',
      });
    }
  },

  /**
   * 18. [5코 전설] 고대 종말룡 이그니스 (u5_ignis): 종말의 지옥불 브레스
   * 공중으로 날아올라 적 보드 전체(8x7)에 지옥불 브레스를 퍼부어 모든 적에게 피해 및 2초 기절!
   * (3성 달성 시 스킬 피해량 99,999로 적 보드 전체 즉사!)
   */
  u5_ignis: (caster, _primaryTarget, allUnits, ctx) => {
    const damage = getSkillPrimaryValue(caster);
    const enemies = getLivingEnemies(caster, allUnits);

    for (const enemy of enemies) {
      ctx.dealDamage(caster, enemy, damage, 'MAGICAL', caster.enableSkillCrit, true);
      if (enemy.currentHp > 0) {
        ctx.applyStun(caster, enemy, 2000);
      }
    }
  },

  /**
   * 19. [5코 전설] 황금 고블린 왕 골드투스 (u5_goldtooth): 황금 제국의 금고 폭격
   * 하늘에서 황금 금고 폭격을 내려 적 전체를 기절시키고 영구 골드를 생성!
   * (3성 달성 시 적 전체에게 99,999 피해 및 50골드 즉시 지급!)
   */
  u5_goldtooth: (caster, _primaryTarget, allUnits, ctx) => {
    const damage = getSkillPrimaryValue(caster);
    const bonusGold = Math.round(getSkillSecondaryValue(caster) || 3);
    const enemies = getLivingEnemies(caster, allUnits);

    caster.ownerGold += bonusGold;
    ctx.emitEvent({
      type: 'GOLD_DROP',
      tick: ctx.currentTick,
      sourceId: caster.instanceId,
      team: caster.team,
      unitId: caster.unitId,
      goldAmount: bonusGold,
      message: `👑 [골드투스] 황금 금고 폭격으로 +${bonusGold} 골드 생성!`,
    });

    for (const enemy of enemies) {
      ctx.dealDamage(caster, enemy, damage, 'MAGICAL', caster.enableSkillCrit, true);
      if (enemy.currentHp > 0) {
        ctx.applyStun(caster, enemy, 1800);
      }
    }
  },

  /**
   * 20. [5코 전설] 타락한 대천사 루시엘 (u5_luciel): 빛과 어둠의 심판 난사
   * 빛과 어둠의 쌍권총으로 전장의 모든 적에게 동시에 심판의 탄환(물리+고정 복합 피해) 난사!
   * (3성 달성 시 타겟당 50,000 피해로 적 전체 즉사!)
   */
  u5_luciel: (caster, _primaryTarget, allUnits, ctx) => {
    const baseBarrageDamage = getSkillPrimaryValue(caster) + caster.atk * 1.5;
    const enemies = getLivingEnemies(caster, allUnits);

    for (const enemy of enemies) {
      // 빛(고정 피해 40%) + 어둠(물리 피해 60%) 동시 타격
      ctx.dealDamage(
        caster,
        enemy,
        baseBarrageDamage * 0.6,
        'PHYSICAL',
        caster.enableSkillCrit,
        true
      );
      if (enemy.currentHp > 0) {
        ctx.dealDamage(
          caster,
          enemy,
          baseBarrageDamage * 0.4,
          'TRUE',
          caster.enableSkillCrit,
          true
        );
      }
    }
  },
};

const SKILL_TYPE_FALLBACK_MAP: Record<SkillType, string> = {
  SELF_SHIELD_SLASH: 'u1_garen',
  ASSASSIN_GOLD_STRIKE: 'u1_pip',
  TRIPLE_SNIPE: 'u1_aria',
  THORN_SMASH: 'u1_skel',
  ARCANE_BOLT: 'u1_lumi',
  ACID_BOMB_SHRED: 'u2_tink',
  SHIELD_BASH_HEAL: 'u2_jeanne',
  CURRENT_HP_ARROW: 'u2_kyle',
  ROOT_AND_REGEN: 'u2_ent',
  BACKLINE_CRIT_SLASH: 'u2_zed',
  GOLD_SCALING_CLEAVE: 'u3_grom',
  DRAGON_BREATH_ARMOR: 'u3_sieg',
  TORNADO_KNOCKUP: 'u3_sylphie',
  BLOOD_DRAIN_TRIO: 'u3_vlad',
  EXCALIBUR_TEAM_SHIELD: 'u4_arthur',
  METEOR_SWARM: 'u4_merlin',
  EXECUTE_RESET: 'u4_thanatos',
  APOCALYPSE_BREATH: 'u5_ignis',
  GOLDEN_VAULT_BOMBARD: 'u5_goldtooth',
  JUDGMENT_BARRAGE: 'u5_luciel',
};

export class SkillRegistry {
  public static readonly HANDLERS: Record<string, SkillHandler> = UNIT_SKILL_HANDLERS;

  /**
   * 유닛의 고유 unitId 또는 skillType에 매핑된 전략 핸들러를 찾아 스킬을 실행한다.
   */
  public static executeSkill(
    caster: CombatUnit,
    primaryTarget: CombatUnit,
    allCombatUnits: CombatUnit[],
    ctx: SkillCombatContext
  ): void {
    const directHandler = SkillRegistry.HANDLERS[caster.unitId];
    if (directHandler) {
      directHandler(caster, primaryTarget, allCombatUnits, ctx);
      return;
    }

    const template = UNIT_TEMPLATES[caster.unitId];
    if (template) {
      const mappedUnitId = SKILL_TYPE_FALLBACK_MAP[template.skill.skillType];
      const fallbackHandler = SkillRegistry.HANDLERS[mappedUnitId];
      if (fallbackHandler) {
        fallbackHandler(caster, primaryTarget, allCombatUnits, ctx);
      }
    }
  }
}

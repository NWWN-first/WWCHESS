// src/SkillRegistry.ts

import {
  CostTier,
  ItemId,
  SkillType,
  StarLevel,
  TraitId,
  UNIT_TEMPLATES,
} from './GameData';
import { HexGridMath } from './HexGridMath';
import {
  isSet6Champion,
  SET6_UNIT_SKILL_HANDLERS,
} from './set6/set6SkillExecutor';

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
  /** SkillRegistry handler key for VFX routing (from unit template skill.skillType). */
  skillType?: SkillType;
  fromRow?: number;
  fromCol?: number;
  toRow?: number;
  toCol?: number;
  amount?: number;
  damageType?: CombatDamageType;
  isCrit?: boolean;
  goldAmount?: number;
  durationMs?: number;
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
  baseMoveIntervalMs: number;
  moveCooldownMs: number;

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

  /** Set 6 Jayce: true = hammer melee form. */
  set6JayceHammerForm?: boolean;
  /** Set 6 Kog'Maw Barrage end (combat elapsed ms). */
  set6KogmawBarrageUntilMs?: number;
  set6KogmawOnHitPct?: number;
  set6MutantVariant?: string;
  set6MutantAdrenaline?: boolean;
  set6SocialiteManaPerAttack?: number;
  set6Colossus?: boolean;
  set6InnovatorSummon?: boolean;
  set6ScrapTransformed?: boolean;
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
  return HexGridMath.hexDistance(r1, c1, r2, c2);
}

function getSkillPrimaryValue(caster: CombatUnit): number {
  const template = UNIT_TEMPLATES[caster.unitId];
  if (!template) return 200;
  const idx = Math.max(0, Math.min(2, caster.starLevel - 1));
  // Set 6: per-star coefficients already live in baseValueByStar (lolchess tables).
  return template.skill.baseValueByStar[idx] * caster.spellPower;
}

function getSkillSecondaryValue(caster: CombatUnit): number {
  const template = UNIT_TEMPLATES[caster.unitId];
  if (!template || !template.skill.secondaryValueByStar) return 0;
  const idx = Math.max(0, Math.min(2, caster.starLevel - 1));
  return template.skill.secondaryValueByStar[idx] * caster.spellPower;
}

// ============================================================================
// 크립 라운드 전용 몬스터 스킬 (Set 6 챔피언 → set6/set6SkillExecutor.ts)
// ============================================================================

const UNIT_SKILL_HANDLERS: Record<string, SkillHandler> = {
  creep_minion_scavenger: (caster, primaryTarget, _allUnits, ctx) => {
    ctx.dealDamage(caster, primaryTarget, caster.atk * 1.25, 'PHYSICAL', false, true);
  },
  creep_toxic_sprite: (caster, primaryTarget, _allUnits, ctx) => {
    ctx.dealDamage(caster, primaryTarget, 28 + caster.atk * 0.8, 'MAGICAL', false, true);
  },
  creep_stone_golem: (caster, primaryTarget, _allUnits, ctx) => {
    ctx.addShield(caster, caster, 140 * caster.starLevel);
    ctx.dealDamage(caster, primaryTarget, 90 + caster.atk * 1.1, 'PHYSICAL', false, true);
  },
  creep_wild_wolf: (caster, primaryTarget, _allUnits, ctx) => {
    caster.atkSpeed = Math.min(2.5, Number((caster.atkSpeed * 1.2).toFixed(3)));
    ctx.dealDamage(caster, primaryTarget, 110 + caster.atk * 1.35, 'PHYSICAL', true, true);
  },
  creep_razor_beak: (caster, primaryTarget, allUnits, ctx) => {
    const cluster = getLivingEnemies(caster, allUnits).filter(
      (e) => chebyshevDist(primaryTarget.row, primaryTarget.col, e.row, e.col) <= 1
    );
    for (const enemy of cluster) {
      ctx.dealDamage(caster, enemy, 125 + caster.atk * 0.9, 'PHYSICAL', false, true);
    }
  },
  creep_ancient_dragon: (caster, primaryTarget, allUnits, ctx) => {
    const cluster = getLivingEnemies(caster, allUnits).filter(
      (e) => chebyshevDist(primaryTarget.row, primaryTarget.col, e.row, e.col) <= 2
    );
    for (const enemy of cluster) {
      ctx.dealDamage(caster, enemy, 260 + caster.atk * 1.2, 'MAGICAL', false, true);
    }
  },
  creep_void_behemoth: (caster, _primaryTarget, allUnits, ctx) => {
    const enemies = getLivingEnemies(caster, allUnits);
    for (const enemy of enemies) {
      ctx.dealDamage(caster, enemy, 320 + caster.atk * 1.1, 'MAGICAL', false, true);
      if (enemy.currentHp > 0) {
        ctx.applyStun(caster, enemy, 900);
      }
    }
  },
};

const SKILL_TYPE_FALLBACK_MAP: Record<SkillType, string> = {
  SELF_SHIELD_SLASH: 'u1_garen',
  ASSASSIN_GOLD_STRIKE: 'u1_twitch',
  TRIPLE_SNIPE: 'u1_caitlyn',
  THORN_SMASH: 'u1_darius',
  ARCANE_BOLT: 'u1_ezreal',
  ACID_BOMB_SHRED: 'u1_singed',
  SHIELD_BASH_HEAL: 'u3_taric',
  CURRENT_HP_ARROW: 'u2_kogmaw',
  ROOT_AND_REGEN: 'u2_zyra',
  BACKLINE_CRIT_SLASH: 'u2_katarina',
  GOLD_SCALING_CLEAVE: 'u3_gangplank',
  DRAGON_BREATH_ARMOR: 'u5_galio',
  TORNADO_KNOCKUP: 'u4_janna',
  BLOOD_DRAIN_TRIO: 'u2_swain',
  EXCALIBUR_TEAM_SHIELD: 'u3_leona',
  METEOR_SWARM: 'u5_veigar',
  EXECUTE_RESET: 'u4_yone',
  APOCALYPSE_BREATH: 'u5_viktor',
  GOLDEN_VAULT_BOMBARD: 'u5_tahm_kench',
  JUDGMENT_BARRAGE: 'u5_akali',
  FURYHORN_STORM: 'u5_veigar',
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
    if (isSet6Champion(caster.unitId)) {
      const set6Handler = SET6_UNIT_SKILL_HANDLERS[caster.unitId];
      if (set6Handler) {
        set6Handler(caster, primaryTarget, allCombatUnits, ctx);
        return;
      }
    }

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


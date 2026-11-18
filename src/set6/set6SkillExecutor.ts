// Set 6 per-champion skill execution (lolchess mechanics, simplified where needed).

import { UNIT_TEMPLATES } from '../GameData';
import { HexGridMath } from '../HexGridMath';
import {
  CombatUnit,
  SkillCombatContext,
  SkillHandler,
} from '../SkillRegistry';
import { SET6_SKILL_BEHAVIOR, Set6SkillBehavior } from './set6SkillBehaviors';

function skillIdx(caster: CombatUnit): number {
  return Math.max(0, Math.min(2, caster.starLevel - 1));
}

function primary(caster: CombatUnit): number {
  const t = UNIT_TEMPLATES[caster.unitId];
  if (!t) return 0;
  return t.skill.baseValueByStar[skillIdx(caster)] * caster.spellPower;
}

function secondary(caster: CombatUnit): number {
  const t = UNIT_TEMPLATES[caster.unitId];
  if (!t?.skill.secondaryValueByStar) return 0;
  return t.skill.secondaryValueByStar[skillIdx(caster)] * caster.spellPower;
}

function enemies(caster: CombatUnit, all: CombatUnit[]): CombatUnit[] {
  return all.filter((u) => u.team !== caster.team && u.currentHp > 0 && !u.isReviving);
}

function allies(caster: CombatUnit, all: CombatUnit[]): CombatUnit[] {
  return all.filter((u) => u.team === caster.team && u.currentHp > 0 && !u.isReviving);
}

function dist(c: CombatUnit, t: CombatUnit): number {
  return HexGridMath.hexDistance(c.row, c.col, t.row, t.col);
}

function farthest(caster: CombatUnit, all: CombatUnit[]): CombatUnit | null {
  const list = enemies(caster, all);
  if (list.length === 0) return null;
  return list.reduce((best, u) => (dist(caster, u) > dist(caster, best) ? u : best));
}

function lowestHpEnemy(caster: CombatUnit, all: CombatUnit[]): CombatUnit | null {
  const list = enemies(caster, all);
  if (list.length === 0) return null;
  return list.reduce((best, u) => (u.currentHp < best.currentHp ? u : best));
}

function adjacentEnemies(caster: CombatUnit, center: CombatUnit, all: CombatUnit[]): CombatUnit[] {
  return enemies(caster, all).filter((e) => dist(center, e) <= 1);
}

function deal(
  ctx: SkillCombatContext,
  caster: CombatUnit,
  target: CombatUnit,
  amount: number,
  type: 'PHYSICAL' | 'MAGICAL' | 'TRUE' = 'MAGICAL',
  canCrit = true
): void {
  if (target.currentHp <= 0) return;
  ctx.dealDamage(caster, target, amount, type, canCrit && caster.enableSkillCrit, true);
}

function runBehavior(
  behavior: Set6SkillBehavior,
  caster: CombatUnit,
  primaryTarget: CombatUnit,
  allUnits: CombatUnit[],
  ctx: SkillCombatContext
): void {
  switch (behavior) {
    case 'passive_only':
      return;

    case 'decisive_strike': {
      const missingRatio = primary(caster) / 100;
      const dmg = caster.atk * 2 + (caster.maxHp - caster.currentHp) * missingRatio;
      deal(ctx, caster, primaryTarget, dmg, 'PHYSICAL');
      return;
    }

    case 'decimate': {
      const dmg = primary(caster);
      const healEach = secondary(caster);
      const near = enemies(caster, allUnits).filter((e) => dist(caster, e) <= 1);
      const targets = near.length > 0 ? near : [primaryTarget];
      let hits = 0;
      for (const t of targets) {
        deal(ctx, caster, t, dmg);
        hits += 1;
      }
      if (hits > 0 && healEach > 0) {
        ctx.healUnit(caster, caster, healEach * hits);
      }
      return;
    }

    case 'furyhorn_storm': {
      const bolt = primary(caster);
      const count = Math.max(1, Math.round(secondary(caster) || 20));
      const foe = enemies(caster, allUnits);
      if (foe.length === 0) return;
      for (let i = 0; i < count; i += 1) {
        const t = foe[i % foe.length];
        deal(ctx, caster, t, bolt);
      }
      return;
    }

    case 'farthest_magic': {
      const t = farthest(caster, allUnits) ?? primaryTarget;
      deal(ctx, caster, t, primary(caster));
      return;
    }

    case 'jhin_curtain_call': {
      const adRatio = primary(caster) / 100;
      const shotDamage = caster.atk * adRatio;
      for (let i = 0; i < 4; i += 1) {
        if (primaryTarget.currentHp <= 0) break;
        deal(ctx, caster, primaryTarget, shotDamage, 'PHYSICAL');
      }
      return;
    }

    case 'kogmaw_barrage': {
      const asBuff = 0.75;
      caster.atkSpeed = Number((caster.atkSpeed * (1 + asBuff)).toFixed(3));
      caster.range = 99;
      caster.set6KogmawBarrageUntilMs = ctx.currentTick * 50 + 3000;
      caster.set6KogmawOnHitPct = primary(caster);
      return;
    }

    case 'jayce_transform': {
      const hammer = caster.set6JayceHammerForm !== false;
      if (hammer) {
        const cleave = primary(caster) + caster.atk * 1.6;
        ctx.addShield(caster, caster, secondary(caster) || cleave * 0.85);
        for (const t of adjacentEnemies(caster, caster, allUnits)) {
          deal(ctx, caster, t, cleave, 'PHYSICAL');
        }
        if (adjacentEnemies(caster, caster, allUnits).length === 0) {
          deal(ctx, caster, primaryTarget, cleave, 'PHYSICAL');
        }
        caster.set6JayceHammerForm = false;
        caster.range = 4;
      } else {
        const blast = primary(caster) + caster.atk * 1.1;
        const t = farthest(caster, allUnits) ?? primaryTarget;
        deal(ctx, caster, t, blast);
        for (const adj of adjacentEnemies(caster, t, allUnits)) {
          deal(ctx, caster, adj, blast * 0.65);
        }
        caster.set6JayceHammerForm = true;
        caster.range = 1;
      }
      return;
    }

    case 'viktor_chaos_rays': {
      const ray = primary(caster);
      for (const t of enemies(caster, allUnits)) {
        deal(ctx, caster, t, ray);
        ctx.applyStun(caster, t, 400);
      }
      return;
    }

    case 'akali_perfect_execution': {
      const dashDmg = primary(caster);
      const threshold = (secondary(caster) || 15) / 100;
      for (const t of enemies(caster, allUnits).slice(0, 3)) {
        deal(ctx, caster, t, dashDmg);
      }
      const marked = enemies(caster, allUnits).find(
        (e) => e.currentHp / e.maxHp <= threshold
      );
      if (marked) {
        deal(ctx, caster, marked, dashDmg * 2, 'TRUE', false);
      }
      return;
    }

    case 'hook_farthest_stun': {
      const t = farthest(caster, allUnits) ?? primaryTarget;
      ctx.teleportUnit(t, caster.row, caster.col);
      deal(ctx, caster, t, primary(caster));
      ctx.applyStun(caster, t, 1500);
      return;
    }

    case 'stun_bomb_adjacent': {
      const t = primaryTarget;
      ctx.applyStun(caster, t, 1500);
      for (const adj of adjacentEnemies(caster, t, allUnits)) {
        deal(ctx, caster, adj, primary(caster));
      }
      return;
    }

    case 'hook_lowest_armor': {
      const t = lowestHpEnemy(caster, allUnits) ?? primaryTarget;
      ctx.teleportUnit(caster, t.row, t.col);
      deal(ctx, caster, t, primary(caster), 'PHYSICAL');
      return;
    }

    case 'smoke_cone_phys':
    case 'cone_bullets':
    case 'cone_armor_shred':
    case 'cone_cards': {
      const dmg = primary(caster) + caster.atk * (behavior === 'cone_cards' ? 0.55 : 0.8);
      for (const t of adjacentEnemies(caster, primaryTarget, allUnits)) {
        deal(ctx, caster, t, dmg, behavior === 'cone_cards' ? 'MAGICAL' : 'PHYSICAL');
      }
      deal(ctx, caster, primaryTarget, dmg, behavior === 'cone_cards' ? 'MAGICAL' : 'PHYSICAL');
      if (behavior === 'cone_armor_shred') {
        ctx.shredArmor(caster, primaryTarget, 0.35);
      }
      return;
    }

    case 'mystic_shot_phys':
    case 'parrrley_phys': {
      const dmg = primary(caster) + caster.atk * (behavior === 'mystic_shot_phys' ? 1.5 : 1.2);
      deal(ctx, caster, primaryTarget, dmg, 'PHYSICAL');
      return;
    }

    case 'line_magic': {
      const dmg = primary(caster) + caster.atk * 0.6;
      for (const t of enemies(caster, allUnits)) {
        if (t.row === primaryTarget.row || t.col === primaryTarget.col) {
          deal(ctx, caster, t, dmg);
        }
      }
      return;
    }

    case 'shield_slam':
    case 'shield_self_magic_bolt':
    case 'polymorph_shield': {
      const shield = secondary(caster) || primary(caster) * 2;
      ctx.addShield(caster, allies(caster, allUnits)[0] ?? caster, shield);
      deal(ctx, caster, primaryTarget, primary(caster));
      if (behavior === 'polymorph_shield') {
        ctx.applyStun(caster, primaryTarget, 1200);
      }
      return;
    }

    case 'fling_adjacent':
    case 'aoe_slam':
    case 'bomb_aoe':
    case 'adjacent_aoe_magic':
    case 'rupture_aoe':
    case 'shockwave':
    case 'aoe_ring': {
      const dmg = primary(caster);
      for (const t of adjacentEnemies(caster, primaryTarget, allUnits)) {
        deal(ctx, caster, t, dmg);
      }
      deal(ctx, caster, primaryTarget, dmg);
      return;
    }

    case 'drain_all':
    case 'all_enemies_magic': {
      const dmg = primary(caster);
      let total = 0;
      for (const t of enemies(caster, allUnits)) {
        const r = ctx.dealDamage(caster, t, dmg, 'MAGICAL', caster.enableSkillCrit, true);
        total += r.actualDamage;
      }
      if (behavior === 'drain_all' && total > 0) {
        ctx.healUnit(caster, caster, total * 0.35);
      }
      return;
    }

    case 'self_shield_flat':
    case 'aoe_stun_shield':
    case 'shield_stun':
    case 'tempest_shield':
    case 'shield_wave':
    case 'challenge_cc_immune': {
      const shieldAmt = secondary(caster) || primary(caster);
      ctx.addShield(caster, caster, shieldAmt);
      if (behavior === 'challenge_cc_immune') {
        caster.stunTimerMs = 0;
      }
      if (behavior !== 'self_shield_flat' && behavior !== 'challenge_cc_immune') {
        for (const t of enemies(caster, allUnits).slice(0, 3)) {
          deal(ctx, caster, t, primary(caster));
          if (behavior.includes('stun')) ctx.applyStun(caster, t, 900);
        }
      }
      return;
    }

    case 'heal_allies':
    case 'heal_allies_flat': {
      const heal = primary(caster);
      for (const a of allies(caster, allUnits)) {
        ctx.healUnit(caster, a, heal);
      }
      return;
    }

    case 'vanish_crit':
    case 'blossom_dash': {
      const behind = ctx.findEmptyTileBehindTarget(caster, primaryTarget);
      if (behind) ctx.teleportUnit(caster, behind.row, behind.col);
      const dmg = primary(caster) + caster.atk * (behavior === 'vanish_crit' ? 1.35 : 1.0);
      deal(ctx, caster, primaryTarget, dmg, 'PHYSICAL', true);
      return;
    }

    case 'dash_shield_stun': {
      const behind = ctx.findEmptyTileBehindTarget(caster, primaryTarget);
      if (behind) ctx.teleportUnit(caster, behind.row, behind.col);
      ctx.addShield(caster, caster, secondary(caster) || primary(caster));
      ctx.applyStun(caster, primaryTarget, 1000);
      deal(ctx, caster, primaryTarget, primary(caster));
      return;
    }

    case 'whirlwind_phys':
    case 'ghost_cleave':
    case 'icathian_barrage':
    case 'rocket_aoe':
    case 'taunt_slash_aoe':
    case 'shredder':
    case 'turret_storm':
    case 'voidlings':
    case 'finale_spark':
    case 'blob_bounce':
    case 'charge_knockup':
    case 'enrage_as':
    case 'chomp_shred':
    case 'cannon_shot_knock':
    case 'max_hp_boost':
    case 'zoomies':
    case 'devour':
    case 'single_stun_magic':
    case 'single_phys_ad':
    case 'single_magic':
    default: {
      if (behavior === 'enrage_as') {
        caster.atkSpeed = Number((caster.atkSpeed * (1 + primary(caster) / 100)).toFixed(3));
      }
      if (behavior === 'max_hp_boost') {
        const bonus = Math.round(caster.maxHp * (primary(caster) / 100));
        caster.maxHp += bonus;
        caster.currentHp += bonus;
      }
      if (behavior === 'chomp_shred') {
        ctx.shredArmor(caster, primaryTarget, 0.25);
      }
      if (behavior === 'cannon_shot_knock') {
        ctx.applyStun(caster, primaryTarget, 800);
      }
      if (behavior === 'charge_knockup') {
        for (const t of enemies(caster, allUnits).slice(0, 4)) {
          ctx.applyStun(caster, t, 1200);
        }
      }
      if (behavior === 'devour') {
        const threshold = 0.35;
        if (primaryTarget.currentHp / primaryTarget.maxHp <= threshold) {
          deal(ctx, caster, primaryTarget, 99999, 'TRUE', false);
          ctx.healUnit(caster, caster, secondary(caster) || 200);
          return;
        }
      }
      const dmg =
        behavior === 'single_phys_ad' || behavior === 'whirlwind_phys'
          ? primary(caster) + caster.atk * 1.25
          : primary(caster) + caster.atk * 0.35;
      const type = behavior === 'whirlwind_phys' || behavior === 'single_phys_ad' ? 'PHYSICAL' : 'MAGICAL';
      if (behavior === 'rocket_aoe' || behavior === 'taunt_slash_aoe') {
        for (const t of adjacentEnemies(caster, primaryTarget, allUnits)) {
          deal(ctx, caster, t, dmg, type);
        }
      } else if (behavior === 'icathian_barrage' || behavior === 'turret_storm' || behavior === 'voidlings') {
        for (let i = 0; i < 5; i += 1) {
          deal(ctx, caster, primaryTarget, dmg / 5, type);
        }
      } else {
        deal(ctx, caster, primaryTarget, dmg, type);
      }
      if (behavior === 'single_stun_magic') {
        ctx.applyStun(caster, primaryTarget, 900);
      }
      return;
    }
  }
}

export const SET6_UNIT_SKILL_HANDLERS: Record<string, SkillHandler> = {};

for (const unitId of Object.keys(SET6_SKILL_BEHAVIOR)) {
  SET6_UNIT_SKILL_HANDLERS[unitId] = (
    caster: CombatUnit,
    primaryTarget: CombatUnit,
    allUnits: CombatUnit[],
    ctx: SkillCombatContext
  ) => {
    const behavior = SET6_SKILL_BEHAVIOR[unitId];
  if (!behavior) return;
    runBehavior(behavior, caster, primaryTarget, allUnits, ctx);
  };
}

export function isSet6Champion(unitId: string): boolean {
  return unitId in SET6_SKILL_BEHAVIOR;
}
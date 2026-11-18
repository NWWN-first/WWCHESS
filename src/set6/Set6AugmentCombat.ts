// src/set6/Set6AugmentCombat.ts — Set 6 augment combat-start stat hooks

import type { TraitId } from '../GameData/types';
import {
  participantEffectTier,
  participantHasAnyEffect,
  participantHasEffect,
} from '../GameData/augmentUtils';
import type { Participant } from '../Participant';
import type { CombatUnit } from '../SkillRegistry';
import type { ActiveSynergyState } from '../SynergyEngine';

export interface AugmentCombatContext {
  owner: Participant;
  synergyActiveCount: number;
  synergyMap: Map<TraitId, ActiveSynergyState>;
  originalBoardRow: number;
  unitCost: number;
}

export function applySet6AugmentSpawnBonuses(
  cu: CombatUnit,
  ctx: AugmentCombatContext
): void {
  const { owner, synergyActiveCount, synergyMap, originalBoardRow, unitCost } = ctx;
  const aug = owner.augments;

  const cyberTier = participantEffectTier(aug, 'CYBERNETIC_IMPLANTS');
  if (cyberTier > 0 && cu.items.length > 0) {
    const hp = [0, 150, 250, 350][cyberTier];
    const ad = [0, 10, 20, 30][cyberTier];
    cu.maxHp += hp;
    cu.currentHp += hp;
    cu.atk += ad;
    cu.baseAtk += ad;
  }

  const makeshiftTier = participantEffectTier(aug, 'MAKESHIFT_ARMOR');
  if (makeshiftTier > 0 && cu.items.length === 0) {
    const armor = [0, 35, 55, 75][makeshiftTier];
    cu.def += armor;
    cu.baseDef += armor;
  }

  const celestialTier = participantEffectTier(aug, 'CELESTIAL_BLESSING');
  if (celestialTier > 0) {
    const vamp = [0, 0.12, 0.2, 0.25][celestialTier];
    cu.omnivamp = Number((cu.omnivamp + vamp).toFixed(2));
  }

  const standTier = participantEffectTier(aug, 'STAND_UNITED');
  if (standTier > 0) {
    const per = [0, 2, 3, 5][standTier];
    cu.atk += synergyActiveCount * per;
    cu.baseAtk += synergyActiveCount * per;
    cu.spellPower = Number((cu.spellPower + synergyActiveCount * per * 0.01).toFixed(2));
  }

  const knivesTier = participantEffectTier(aug, 'KNIFE_S_EDGE');
  if (knivesTier > 0 && originalBoardRow <= 1) {
    const ad = [0, 25, 35, 50][knivesTier];
    cu.atk += ad;
    cu.baseAtk += ad;
  }

  const featherTier = participantEffectTier(aug, 'FEATHERWEIGHTS');
  if (featherTier > 0 && unitCost <= 2) {
    const as = [0, 0.25, 0.35, 0.55][featherTier];
    cu.atkSpeed = Number((cu.atkSpeed + as).toFixed(2));
  }

  if (participantHasEffect(aug, 'TITANIC_FORCE') && cu.maxHp >= 1400) {
    const bonus = Math.round(cu.maxHp * 0.03);
    cu.atk += bonus;
    cu.baseAtk += bonus;
  }

  const builtTier = participantEffectTier(aug, 'BUILT_DIFFERENT');
  const traitActive = cu.traits.some((t) => synergyMap.has(t));
  if (builtTier > 0 && !traitActive) {
    const hp = [0, 300, 400, 500][builtTier];
    const as = [0, 0.5, 0.6, 0.7][builtTier];
    cu.maxHp += hp;
    cu.currentHp += hp;
    cu.atkSpeed = Number((cu.atkSpeed + as).toFixed(2));
  }

  const exileTier = participantEffectTier(aug, 'EXILES');
  if (exileTier > 0) {
    // Adjacency check omitted — simplified combat shield at spawn
    const ratio = [0, 0.3, 0.45, 0.7][exileTier];
    const shield = Math.round(cu.maxHp * ratio);
    cu.shield += shield;
  }

  const runicTier = participantEffectTier(aug, 'RUNIC_SHIELD');
  if (runicTier > 0 && cu.traits.includes('ARCANIST')) {
    const mult = [0, 3, 4.5, 6][runicTier];
    const shield = Math.round(cu.spellPower * 100 * mult);
    cu.shield += Math.max(80, shield);
  }

  if (participantHasEffect(aug, 'WEAKSPOT')) {
    cu.trueDamageBonusRatio = Math.max(cu.trueDamageBonusRatio, 0.2);
  }

  if (participantHasEffect(aug, 'SO_SMALL') && cu.traits.includes('YORDLE')) {
    cu.damageReductionRatio = Math.max(cu.damageReductionRatio, 0.25);
  }
}

export function celestialBlessingShieldCap(augmentIds: readonly string[]): number {
  const tier = participantEffectTier(augmentIds, 'CELESTIAL_BLESSING');
  return [0, 300, 450, 600][tier];
}
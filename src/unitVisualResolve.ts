// Trait-role pixel & 3D visual resolution for Set 6 champions only.

import { getCreepMonsterTemplate, isCreepMonsterUnitId } from './CreepMonsterData';
import { CostTier, TraitId, UNIT_TEMPLATES } from './GameData';
import type { UnitPixelArtSpec } from './unitVisualTypes';

export type PixelVisualRole =
  | 'FRONTLINE'
  | 'BRUISER'
  | 'ASSASSIN'
  | 'SNIPER'
  | 'ARCANIST'
  | 'SCHOLAR'
  | 'MERCENARY'
  | 'MUTANT_MELEE'
  | 'MUTANT_CASTER'
  | 'MUTANT_ROGUE'
  | 'CHEMTECH'
  | 'YORDLE'
  | 'DEFAULT';

const ROLE_BASE_SPECS: Record<PixelVisualRole, UnitPixelArtSpec> = {
  FRONTLINE: {
    primaryArmor: '#2b579a',
    secondaryArmor: '#d9e2ec',
    trimGold: '#f4c430',
    skinOrFace: '#f3c6a0',
    eyeGlow: '#ffffff',
    weaponColor: '#e2e8f0',
    weaponGlow: '#ffd700',
    headgear: 'KNIGHT_HELM',
    weapon: 'SWORD_SHIELD',
    wings: 'CAPE',
  },
  BRUISER: {
    primaryArmor: '#7c2d12',
    secondaryArmor: '#c2410c',
    trimGold: '#fbbf24',
    skinOrFace: '#d4a574',
    eyeGlow: '#fef3c7',
    weaponColor: '#78350f',
    weaponGlow: '#f97316',
    headgear: 'KNIGHT_HELM',
    weapon: 'GREATSWORD',
    wings: 'NONE',
  },
  ASSASSIN: {
    primaryArmor: '#1e1b4b',
    secondaryArmor: '#312e81',
    trimGold: '#a78bfa',
    skinOrFace: '#c4b5fd',
    eyeGlow: '#22d3ee',
    weaponColor: '#64748b',
    weaponGlow: '#06b6d4',
    headgear: 'HOOD',
    weapon: 'DUAL_DAGGERS',
    wings: 'NONE',
  },
  SNIPER: {
    primaryArmor: '#14532d',
    secondaryArmor: '#166534',
    trimGold: '#86efac',
    skinOrFace: '#d9f99d',
    eyeGlow: '#fef08a',
    weaponColor: '#422006',
    weaponGlow: '#facc15',
    headgear: 'HOOD',
    weapon: 'BOW',
    wings: 'NONE',
  },
  ARCANIST: {
    primaryArmor: '#3f37c9',
    secondaryArmor: '#4895ef',
    trimGold: '#f72585',
    skinOrFace: '#ffe5d9',
    eyeGlow: '#4cc9f0',
    weaponColor: '#7209b7',
    weaponGlow: '#4cc9f0',
    headgear: 'WIZARD_HAT',
    weapon: 'ARCANE_STAFF',
    wings: 'NONE',
  },
  SCHOLAR: {
    primaryArmor: '#1e3a5f',
    secondaryArmor: '#38bdf8',
    trimGold: '#fcd34d',
    skinOrFace: '#e0f2fe',
    eyeGlow: '#7dd3fc',
    weaponColor: '#0ea5e9',
    weaponGlow: '#a855f7',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'ARCANE_ORB',
    wings: 'NONE',
  },
  MERCENARY: {
    primaryArmor: '#3f6212',
    secondaryArmor: '#65a30d',
    trimGold: '#fde047',
    skinOrFace: '#bef264',
    eyeGlow: '#ffea00',
    weaponColor: '#ca8a04',
    weaponGlow: '#eab308',
    headgear: 'GOBLIN_EARS',
    weapon: 'DUAL_DAGGERS',
    wings: 'NONE',
  },
  MUTANT_MELEE: {
    primaryArmor: '#4a044e',
    secondaryArmor: '#86198f',
    trimGold: '#e879f9',
    skinOrFace: '#e5e5e5',
    eyeGlow: '#00f5d4',
    weaponColor: '#94a3b8',
    weaponGlow: '#d946ef',
    headgear: 'SKULL',
    weapon: 'GREATSWORD',
    wings: 'NONE',
  },
  MUTANT_CASTER: {
    primaryArmor: '#3b0764',
    secondaryArmor: '#6b21a8',
    trimGold: '#c026d3',
    skinOrFace: '#ddd6fe',
    eyeGlow: '#a855f7',
    weaponColor: '#7e22ce',
    weaponGlow: '#e879f9',
    headgear: 'SKULL',
    weapon: 'ARCANE_STAFF',
    wings: 'NONE',
  },
  MUTANT_ROGUE: {
    primaryArmor: '#312e81',
    secondaryArmor: '#4338ca',
    trimGold: '#818cf8',
    skinOrFace: '#c7d2fe',
    eyeGlow: '#22d3ee',
    weaponColor: '#475569',
    weaponGlow: '#8b5cf6',
    headgear: 'SKULL',
    weapon: 'DUAL_DAGGERS',
    wings: 'NONE',
  },
  CHEMTECH: {
    primaryArmor: '#064e3b',
    secondaryArmor: '#10b981',
    trimGold: '#6ee7b7',
    skinOrFace: '#6b9e7a',
    eyeGlow: '#fef08a',
    weaponColor: '#047857',
    weaponGlow: '#34d399',
    headgear: 'DEMON_HORNS',
    weapon: 'DRAGON_CLAW',
    wings: 'DRAGON_WINGS',
  },
  YORDLE: {
    primaryArmor: '#7c3aed',
    secondaryArmor: '#a78bfa',
    trimGold: '#fbbf24',
    skinOrFace: '#fde68a',
    eyeGlow: '#fef9c3',
    weaponColor: '#5b21b6',
    weaponGlow: '#fcd34d',
    headgear: 'GOBLIN_EARS',
    weapon: 'CANNON_BAG',
    wings: 'NONE',
  },
  DEFAULT: {
    primaryArmor: '#334155',
    secondaryArmor: '#64748b',
    trimGold: '#cbd5e1',
    skinOrFace: '#f1f5f9',
    eyeGlow: '#ffffff',
    weaponColor: '#94a3b8',
    weaponGlow: '#e2e8f0',
    headgear: 'KNIGHT_HELM',
    weapon: 'SWORD_SHIELD',
    wings: 'NONE',
  },
};

function hashUnitId(unitId: string): number {
  let h = 0;
  for (let i = 0; i < unitId.length; i++) {
    h = (h * 31 + unitId.charCodeAt(i)) >>> 0;
  }
  return h;
}

function shiftHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Per-champion tint so same-role units remain distinguishable. */
export function tintPixelSpec(base: UnitPixelArtSpec, unitId: string, cost: CostTier): UnitPixelArtSpec {
  const h = hashUnitId(unitId);
  const delta = ((h % 7) - 3) * 4 + (cost - 3) * 3;
  return {
    ...base,
    primaryArmor: shiftHex(base.primaryArmor, delta),
    secondaryArmor: shiftHex(base.secondaryArmor, Math.floor(delta / 2)),
    trimGold: shiftHex(base.trimGold, (h % 5) - 2),
  };
}

export function classifyPixelVisualRole(
  traits: TraitId[],
  range: number
): PixelVisualRole {
  if (traits.includes('YORDLE') || traits.includes('YORDLE_LORD')) return 'YORDLE';
  if (traits.includes('CHEMTECH')) return 'CHEMTECH';
  if (traits.includes('MUTANT')) {
    if (traits.includes('ARCANIST') || range >= 3) return 'MUTANT_CASTER';
    if (traits.includes('ASSASSIN')) return 'MUTANT_ROGUE';
    return 'MUTANT_MELEE';
  }
  if (traits.includes('SNIPER')) return 'SNIPER';
  if (traits.includes('ARCANIST') || traits.includes('SCHOLAR') || range >= 3) {
    return traits.includes('SCHOLAR') ? 'SCHOLAR' : 'ARCANIST';
  }
  if (traits.includes('ASSASSIN')) return 'ASSASSIN';
  if (traits.includes('MERCENARY')) return 'MERCENARY';
  if (traits.includes('BRUISER') || traits.includes('COLOSSUS')) {
    return 'BRUISER';
  }
  if (traits.includes('PROTECTOR') || traits.includes('BODYGUARD') || traits.includes('COLOSSUS')) {
    return 'FRONTLINE';
  }
  return 'DEFAULT';
}

const CREEP_PIXEL_SPEC: UnitPixelArtSpec = {
  primaryArmor: '#44403c',
  secondaryArmor: '#78716c',
  trimGold: '#a8a29e',
  skinOrFace: '#d6d3d1',
  eyeGlow: '#f87171',
  weaponColor: '#57534e',
  weaponGlow: '#ef4444',
  headgear: 'GOLEM_CORE',
  weapon: 'DRAGON_CLAW',
  wings: 'NONE',
};

/**
 * Resolve 28×28 dot palette from Set 6 UNIT_TEMPLATES traits (never legacy fantasy ids).
 */
export function resolveUnitPixelSpec(unitId: string): UnitPixelArtSpec {
  if (isCreepMonsterUnitId(unitId)) {
    const creep = getCreepMonsterTemplate(unitId);
    if (!creep) return CREEP_PIXEL_SPEC;
    return tintPixelSpec(CREEP_PIXEL_SPEC, unitId, creep.cost);
  }

  const tpl = UNIT_TEMPLATES[unitId];
  if (!tpl) {
    return ROLE_BASE_SPECS.DEFAULT;
  }

  const range = tpl.stats?.range ?? 1;
  const role = classifyPixelVisualRole(tpl.traits, range);
  return tintPixelSpec(ROLE_BASE_SPECS[role], unitId, tpl.cost);
}

/** Champion-only registry: one entry per Set 6 id (tests: keys ⊆ UNIT_TEMPLATES). */
export function buildChampionPixelSpecMap(): Record<string, UnitPixelArtSpec> {
  const map: Record<string, UnitPixelArtSpec> = {};
  for (const id of Object.keys(UNIT_TEMPLATES)) {
    map[id] = resolveUnitPixelSpec(id);
  }
  return map;
}

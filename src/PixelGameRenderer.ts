// src/PixelGameRenderer.ts

import { getCreepMonsterTemplate, isCreepMonsterUnitId } from './CreepMonsterData';
import { CostTier, ITEM_DEFINITIONS, ItemId, StarLevel } from './GameData';
import { AvatarFinisherLaserPayload } from './GameLoopManager';
import { HexBoardViewportMetrics, HexCoord, HexGridMath } from './HexGridMath';
import { Participant, UnitInstance } from './Participant';
import { CombatEvent, CombatUnit } from './SkillRegistry';

/**
 * 20종 판타지 챔피언 전용 28x28 도트 스프라이트 아키타입 및 컬러 팔레트
 */
export type WeaponKind =
  | 'GREATSWORD'
  | 'SWORD_SHIELD'
  | 'DUAL_DAGGERS'
  | 'BOW'
  | 'ARCANE_STAFF'
  | 'NATURE_STAFF'
  | 'SCYTHE'
  | 'DRAGON_CLAW'
  | 'SPEAR'
  | 'CANNON_BAG'
  | 'HOLY_BLADE'
  | 'ARCHMAGE_ORB';

export type HeadgearKind =
  | 'KNIGHT_HELM'
  | 'CROWN'
  | 'HOOD'
  | 'ELVEN_CIRCLET'
  | 'SKULL'
  | 'WIZARD_HAT'
  | 'DEMON_HORNS'
  | 'DRAGON_HORNS'
  | 'HALO_HELM'
  | 'GOBLIN_EARS'
  | 'GOLEM_CORE';

export type WingKind = 'NONE' | 'ANGEL_WINGS' | 'DRAGON_WINGS' | 'DEMON_WINGS' | 'CAPE';

export interface UnitPixelArtSpec {
  primaryArmor: string;
  secondaryArmor: string;
  trimGold: string;
  skinOrFace: string;
  eyeGlow: string;
  weaponColor: string;
  weaponGlow: string;
  headgear: HeadgearKind;
  weapon: WeaponKind;
  wings: WingKind;
}

export const UNIT_PIXEL_SPECS: Record<string, UnitPixelArtSpec> = {
  // --------------------------------------------------------------------------
  // 1코스트 (14종)
  // --------------------------------------------------------------------------
  u1_garen: {
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
  u1_pip: {
    primaryArmor: '#5c4033',
    secondaryArmor: '#8b5a2b',
    trimGold: '#ffd700',
    skinOrFace: '#55a630',
    eyeGlow: '#ffea00',
    weaponColor: '#cbd5e1',
    weaponGlow: '#ffbe0b',
    headgear: 'GOBLIN_EARS',
    weapon: 'DUAL_DAGGERS',
    wings: 'NONE',
  },
  u1_aria: {
    primaryArmor: '#1b4332',
    secondaryArmor: '#40916c',
    trimGold: '#95d5b2',
    skinOrFace: '#fde2c4',
    eyeGlow: '#52b788',
    weaponColor: '#b08968',
    weaponGlow: '#74c69d',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'BOW',
    wings: 'CAPE',
  },
  u1_skel: {
    primaryArmor: '#3a0ca3',
    secondaryArmor: '#4cc9f0',
    trimGold: '#7209b7',
    skinOrFace: '#e5e5e5',
    eyeGlow: '#00f5d4',
    weaponColor: '#94a3b8',
    weaponGlow: '#b5179e',
    headgear: 'SKULL',
    weapon: 'GREATSWORD',
    wings: 'NONE',
  },
  u1_lumi: {
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
  u1_valen: {
    primaryArmor: '#1e3a8a',
    secondaryArmor: '#f8fafc',
    trimGold: '#fbbf24',
    skinOrFace: '#fde68a',
    eyeGlow: '#38bdf8',
    weaponColor: '#e2e8f0',
    weaponGlow: '#fde047',
    headgear: 'HALO_HELM',
    weapon: 'SWORD_SHIELD',
    wings: 'NONE',
  },
  u1_imp: {
    primaryArmor: '#7f1d1d',
    secondaryArmor: '#dc2626',
    trimGold: '#f97316',
    skinOrFace: '#ef4444',
    eyeGlow: '#fef08a',
    weaponColor: '#ea580c',
    weaponGlow: '#facc15',
    headgear: 'DEMON_HORNS',
    weapon: 'ARCANE_STAFF',
    wings: 'DEMON_WINGS',
  },
  u1_thorn: {
    primaryArmor: '#14532d',
    secondaryArmor: '#16a34a',
    trimGold: '#a3e635',
    skinOrFace: '#86efac',
    eyeGlow: '#fef08a',
    weaponColor: '#65a30d',
    weaponGlow: '#4ade80',
    headgear: 'GOLEM_CORE',
    weapon: 'SWORD_SHIELD',
    wings: 'NONE',
  },
  u1_whelp: {
    primaryArmor: '#9a3412',
    secondaryArmor: '#ea580c',
    trimGold: '#facc15',
    skinOrFace: '#fb923c',
    eyeGlow: '#fef08a',
    weaponColor: '#f97316',
    weaponGlow: '#fde047',
    headgear: 'DRAGON_HORNS',
    weapon: 'DRAGON_CLAW',
    wings: 'DRAGON_WINGS',
  },
  u1_ghoul: {
    primaryArmor: '#312e81',
    secondaryArmor: '#4c1d95',
    trimGold: '#a855f7',
    skinOrFace: '#cbd5e1',
    eyeGlow: '#2dd4bf',
    weaponColor: '#94a3b8',
    weaponGlow: '#c084fc',
    headgear: 'SKULL',
    weapon: 'DUAL_DAGGERS',
    wings: 'NONE',
  },
  u1_chrona: {
    primaryArmor: '#0f172a',
    secondaryArmor: '#0284c7',
    trimGold: '#38bdf8',
    skinOrFace: '#e2e8f0',
    eyeGlow: '#7dd3fc',
    weaponColor: '#38bdf8',
    weaponGlow: '#e0f2fe',
    headgear: 'KNIGHT_HELM',
    weapon: 'SWORD_SHIELD',
    wings: 'CAPE',
  },
  u1_snatch: {
    primaryArmor: '#713f12',
    secondaryArmor: '#ca8a04',
    trimGold: '#facc15',
    skinOrFace: '#65a30d',
    eyeGlow: '#fef08a',
    weaponColor: '#fde047',
    weaponGlow: '#f59e0b',
    headgear: 'GOBLIN_EARS',
    weapon: 'SPEAR',
    wings: 'NONE',
  },
  u1_shieldmaiden: {
    primaryArmor: '#1e40af',
    secondaryArmor: '#93c5fd',
    trimGold: '#f59e0b',
    skinOrFace: '#fed7aa',
    eyeGlow: '#ffffff',
    weaponColor: '#cbd5e1',
    weaponGlow: '#fbbf24',
    headgear: 'KNIGHT_HELM',
    weapon: 'GREATSWORD',
    wings: 'CAPE',
  },
  u1_ember: {
    primaryArmor: '#450a0a',
    secondaryArmor: '#991b1b',
    trimGold: '#f97316',
    skinOrFace: '#b91c1c',
    eyeGlow: '#fbbf24',
    weaponColor: '#7f1d1d',
    weaponGlow: '#ef4444',
    headgear: 'DEMON_HORNS',
    weapon: 'SWORD_SHIELD',
    wings: 'NONE',
  },

  // --------------------------------------------------------------------------
  // 2코스트 (13종)
  // --------------------------------------------------------------------------
  u2_tink: {
    primaryArmor: '#3f6212',
    secondaryArmor: '#84cc16',
    trimGold: '#facc15',
    skinOrFace: '#65a30d',
    eyeGlow: '#bef264',
    weaponColor: '#a3e635',
    weaponGlow: '#4ade80',
    headgear: 'GOBLIN_EARS',
    weapon: 'CANNON_BAG',
    wings: 'NONE',
  },
  u2_jeanne: {
    primaryArmor: '#1d4ed8',
    secondaryArmor: '#fef08a',
    trimGold: '#facc15',
    skinOrFace: '#ffedd5',
    eyeGlow: '#60a5fa',
    weaponColor: '#fef9c3',
    weaponGlow: '#fde047',
    headgear: 'HALO_HELM',
    weapon: 'SWORD_SHIELD',
    wings: 'CAPE',
  },
  u2_kyle: {
    primaryArmor: '#4c0519',
    secondaryArmor: '#be123c',
    trimGold: '#fb7185',
    skinOrFace: '#fecdd3',
    eyeGlow: '#f43f5e',
    weaponColor: '#9f1239',
    weaponGlow: '#fb7185',
    headgear: 'DEMON_HORNS',
    weapon: 'BOW',
    wings: 'CAPE',
  },
  u2_ent: {
    primaryArmor: '#365314',
    secondaryArmor: '#15803d',
    trimGold: '#86efac',
    skinOrFace: '#78350f',
    eyeGlow: '#4ade80',
    weaponColor: '#57534e',
    weaponGlow: '#22c55e',
    headgear: 'GOLEM_CORE',
    weapon: 'NATURE_STAFF',
    wings: 'NONE',
  },
  u2_zed: {
    primaryArmor: '#18181b',
    secondaryArmor: '#dc2626',
    trimGold: '#991b1b',
    skinOrFace: '#52525b',
    eyeGlow: '#ef4444',
    weaponColor: '#e4e4e7',
    weaponGlow: '#f87171',
    headgear: 'HOOD',
    weapon: 'DUAL_DAGGERS',
    wings: 'CAPE',
  },
  u2_zephyr: {
    primaryArmor: '#1e1b2e',
    secondaryArmor: '#7209b7',
    trimGold: '#f72585',
    skinOrFace: '#d8b4e2',
    eyeGlow: '#ff2a85',
    weaponColor: '#e2e8f0',
    weaponGlow: '#f72585',
    headgear: 'DEMON_HORNS',
    weapon: 'DUAL_DAGGERS',
    wings: 'CAPE',
  },
  u2_elowen: {
    primaryArmor: '#2d6a4f',
    secondaryArmor: '#74c69d',
    trimGold: '#ffd166',
    skinOrFace: '#fae1dd',
    eyeGlow: '#80ed99',
    weaponColor: '#7f4f24',
    weaponGlow: '#57cc99',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'NATURE_STAFF',
    wings: 'NONE',
  },
  u2_boulder: {
    primaryArmor: '#495057',
    secondaryArmor: '#6c757d',
    trimGold: '#48cae4',
    skinOrFace: '#adb5bd',
    eyeGlow: '#00f5d4',
    weaponColor: '#6c757d',
    weaponGlow: '#00bbf9',
    headgear: 'GOLEM_CORE',
    weapon: 'SWORD_SHIELD',
    wings: 'NONE',
  },
  u2_boom: {
    primaryArmor: '#9b2226',
    secondaryArmor: '#ca6702',
    trimGold: '#ee9b00',
    skinOrFace: '#6a994e',
    eyeGlow: '#ffea00',
    weaponColor: '#bb3e03',
    weaponGlow: '#ff9e00',
    headgear: 'GOBLIN_EARS',
    weapon: 'CANNON_BAG',
    wings: 'NONE',
  },
  u2_vayne: {
    primaryArmor: '#1d3557',
    secondaryArmor: '#e63946',
    trimGold: '#f1faee',
    skinOrFace: '#f8edeb',
    eyeGlow: '#ffd166',
    weaponColor: '#e5e5e5',
    weaponGlow: '#a8dadc',
    headgear: 'HOOD',
    weapon: 'BOW',
    wings: 'CAPE',
  },
  u2_pyre: {
    primaryArmor: '#7c2d12',
    secondaryArmor: '#ea580c',
    trimGold: '#fbbf24',
    skinOrFace: '#fdba74',
    eyeGlow: '#fef08a',
    weaponColor: '#f97316',
    weaponGlow: '#fde047',
    headgear: 'DRAGON_HORNS',
    weapon: 'GREATSWORD',
    wings: 'NONE',
  },
  u2_boneknight: {
    primaryArmor: '#1e1b4b',
    secondaryArmor: '#6366f1',
    trimGold: '#2dd4bf',
    skinOrFace: '#e2e8f0',
    eyeGlow: '#5eead4',
    weaponColor: '#94a3b8',
    weaponGlow: '#2dd4bf',
    headgear: 'SKULL',
    weapon: 'SWORD_SHIELD',
    wings: 'CAPE',
  },
  u2_malice: {
    primaryArmor: '#581c87',
    secondaryArmor: '#a855f7',
    trimGold: '#f43f5e',
    skinOrFace: '#e9d5ff',
    eyeGlow: '#fb7185',
    weaponColor: '#9333ea',
    weaponGlow: '#f43f5e',
    headgear: 'WIZARD_HAT',
    weapon: 'ARCANE_STAFF',
    wings: 'NONE',
  },

  // --------------------------------------------------------------------------
  // 3코스트 (13종)
  // --------------------------------------------------------------------------
  u3_grom: {
    primaryArmor: '#854d0e',
    secondaryArmor: '#eab308',
    trimGold: '#fef08a',
    skinOrFace: '#4d7c0f',
    eyeGlow: '#ef4444',
    weaponColor: '#facc15',
    weaponGlow: '#fef08a',
    headgear: 'GOBLIN_EARS',
    weapon: 'GREATSWORD',
    wings: 'CAPE',
  },
  u3_sieg: {
    primaryArmor: '#7f1d1d',
    secondaryArmor: '#b91c1c',
    trimGold: '#fbbf24',
    skinOrFace: '#fde68a',
    eyeGlow: '#f97316',
    weaponColor: '#f59e0b',
    weaponGlow: '#ef4444',
    headgear: 'DRAGON_HORNS',
    weapon: 'SWORD_SHIELD',
    wings: 'DRAGON_WINGS',
  },
  u3_sylphie: {
    primaryArmor: '#065f46',
    secondaryArmor: '#34d399',
    trimGold: '#a7f3d0',
    skinOrFace: '#ecfdf5',
    eyeGlow: '#6ee7b7',
    weaponColor: '#10b981',
    weaponGlow: '#a7f3d0',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'NATURE_STAFF',
    wings: 'CAPE',
  },
  u3_vlad: {
    primaryArmor: '#450a0a',
    secondaryArmor: '#dc2626',
    trimGold: '#f87171',
    skinOrFace: '#f1f5f9',
    eyeGlow: '#ef4444',
    weaponColor: '#991b1b',
    weaponGlow: '#f43f5e',
    headgear: 'CROWN',
    weapon: 'ARCANE_STAFF',
    wings: 'CAPE',
  },
  u3_drake: {
    primaryArmor: '#9d0208',
    secondaryArmor: '#dc2f02',
    trimGold: '#ffba08',
    skinOrFace: '#f48c06',
    eyeGlow: '#ffea00',
    weaponColor: '#ffba08',
    weaponGlow: '#ff4800',
    headgear: 'DRAGON_HORNS',
    weapon: 'SPEAR',
    wings: 'DRAGON_WINGS',
  },
  u3_leona: {
    primaryArmor: '#e09f3e',
    secondaryArmor: '#fff3b0',
    trimGold: '#ffd700',
    skinOrFace: '#fae1dd',
    eyeGlow: '#ffffff',
    weaponColor: '#ffd700',
    weaponGlow: '#fff3b0',
    headgear: 'HALO_HELM',
    weapon: 'SWORD_SHIELD',
    wings: 'CAPE',
  },
  u3_kazu: {
    primaryArmor: '#240046',
    secondaryArmor: '#5a189a',
    trimGold: '#9d4edd',
    skinOrFace: '#e0aaff',
    eyeGlow: '#ff007f',
    weaponColor: '#c77dff',
    weaponGlow: '#e0aaff',
    headgear: 'HOOD',
    weapon: 'DUAL_DAGGERS',
    wings: 'NONE',
  },
  u3_malakor: {
    primaryArmor: '#10002b',
    secondaryArmor: '#3c096c',
    trimGold: '#00f5d4',
    skinOrFace: '#dee2e6',
    eyeGlow: '#00f5d4',
    weaponColor: '#5a189a',
    weaponGlow: '#00f5d4',
    headgear: 'SKULL',
    weapon: 'SCYTHE',
    wings: 'CAPE',
  },
  u3_seraphina: {
    primaryArmor: '#1e3a8a',
    secondaryArmor: '#bfdbfe',
    trimGold: '#fde047',
    skinOrFace: '#fffbeb',
    eyeGlow: '#38bdf8',
    weaponColor: '#facc15',
    weaponGlow: '#e0f2fe',
    headgear: 'HALO_HELM',
    weapon: 'ARCANE_STAFF',
    wings: 'ANGEL_WINGS',
  },
  u3_grizzle: {
    primaryArmor: '#78350f',
    secondaryArmor: '#d97706',
    trimGold: '#facc15',
    skinOrFace: '#84cc16',
    eyeGlow: '#fde047',
    weaponColor: '#94a3b8',
    weaponGlow: '#f97316',
    headgear: 'GOLEM_CORE',
    weapon: 'CANNON_BAG',
    wings: 'NONE',
  },
  u3_orion: {
    primaryArmor: '#1e1b4b',
    secondaryArmor: '#38bdf8',
    trimGold: '#e0f2fe',
    skinOrFace: '#e2e8f0',
    eyeGlow: '#7dd3fc',
    weaponColor: '#38bdf8',
    weaponGlow: '#bae6fd',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'BOW',
    wings: 'CAPE',
  },
  u3_nyx: {
    primaryArmor: '#3b0764',
    secondaryArmor: '#be185d',
    trimGold: '#f472b6',
    skinOrFace: '#fbcfe8',
    eyeGlow: '#f43f5e',
    weaponColor: '#ec4899',
    weaponGlow: '#f9a8d4',
    headgear: 'DEMON_HORNS',
    weapon: 'DUAL_DAGGERS',
    wings: 'DEMON_WINGS',
  },
  u3_fenrir: {
    primaryArmor: '#0f172a',
    secondaryArmor: '#0284c7',
    trimGold: '#38bdf8',
    skinOrFace: '#cbd5e1',
    eyeGlow: '#00f5d4',
    weaponColor: '#7dd3fc',
    weaponGlow: '#38bdf8',
    headgear: 'SKULL',
    weapon: 'DRAGON_CLAW',
    wings: 'CAPE',
  },

  // --------------------------------------------------------------------------
  // 4코스트 (12종)
  // --------------------------------------------------------------------------
  u4_arthur: {
    primaryArmor: '#1e3a8a',
    secondaryArmor: '#facc15',
    trimGold: '#fef08a',
    skinOrFace: '#fde68a',
    eyeGlow: '#ffffff',
    weaponColor: '#fde047',
    weaponGlow: '#ffffff',
    headgear: 'CROWN',
    weapon: 'HOLY_BLADE',
    wings: 'CAPE',
  },
  u4_merlin: {
    primaryArmor: '#311068',
    secondaryArmor: '#6366f1',
    trimGold: '#38bdf8',
    skinOrFace: '#ffedd5',
    eyeGlow: '#38bdf8',
    weaponColor: '#818cf8',
    weaponGlow: '#7dd3fc',
    headgear: 'WIZARD_HAT',
    weapon: 'ARCHMAGE_ORB',
    wings: 'CAPE',
  },
  u4_thanatos: {
    primaryArmor: '#090d16',
    secondaryArmor: '#581c87',
    trimGold: '#2dd4bf',
    skinOrFace: '#f8fafc',
    eyeGlow: '#00f5d4',
    weaponColor: '#c084fc',
    weaponGlow: '#00f5d4',
    headgear: 'SKULL',
    weapon: 'SCYTHE',
    wings: 'DEMON_WINGS',
  },
  u4_sylph: {
    primaryArmor: '#1b4332',
    secondaryArmor: '#52b788',
    trimGold: '#ffd166',
    skinOrFace: '#fff1e6',
    eyeGlow: '#b7e4c7',
    weaponColor: '#ffd166',
    weaponGlow: '#95d5b2',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'BOW',
    wings: 'CAPE',
  },
  u4_astaroth: {
    primaryArmor: '#640d14',
    secondaryArmor: '#ad2831',
    trimGold: '#ff4d6d',
    skinOrFace: '#800f2f',
    eyeGlow: '#ffbe0b',
    weaponColor: '#ff4d6d',
    weaponGlow: '#ff0055',
    headgear: 'DEMON_HORNS',
    weapon: 'GREATSWORD',
    wings: 'DEMON_WINGS',
  },
  u4_velkora: {
    primaryArmor: '#3a0ca3',
    secondaryArmor: '#7209b7',
    trimGold: '#4cc9f0',
    skinOrFace: '#f8edeb',
    eyeGlow: '#4cc9f0',
    weaponColor: '#f72585',
    weaponGlow: '#4cc9f0',
    headgear: 'WIZARD_HAT',
    weapon: 'ARCHMAGE_ORB',
    wings: 'CAPE',
  },
  u4_valkyrie: {
    primaryArmor: '#d97706',
    secondaryArmor: '#fef3c7',
    trimGold: '#fde047',
    skinOrFace: '#fffbeb',
    eyeGlow: '#38bdf8',
    weaponColor: '#fef08a',
    weaponGlow: '#ffffff',
    headgear: 'HALO_HELM',
    weapon: 'SPEAR',
    wings: 'ANGEL_WINGS',
  },
  u4_fafnir: {
    primaryArmor: '#b45309',
    secondaryArmor: '#f59e0b',
    trimGold: '#fef08a',
    skinOrFace: '#fbbf24',
    eyeGlow: '#ef4444',
    weaponColor: '#fde047',
    weaponGlow: '#f97316',
    headgear: 'DRAGON_HORNS',
    weapon: 'SWORD_SHIELD',
    wings: 'DRAGON_WINGS',
  },
  u4_lichking: {
    primaryArmor: '#0f172a',
    secondaryArmor: '#0369a1',
    trimGold: '#38bdf8',
    skinOrFace: '#e0f2fe',
    eyeGlow: '#00f5d4',
    weaponColor: '#7dd3fc',
    weaponGlow: '#38bdf8',
    headgear: 'CROWN',
    weapon: 'ARCHMAGE_ORB',
    wings: 'CAPE',
  },
  u4_midas: {
    primaryArmor: '#a16207',
    secondaryArmor: '#facc15',
    trimGold: '#fef9c3',
    skinOrFace: '#84cc16',
    eyeGlow: '#fef08a',
    weaponColor: '#fde047',
    weaponGlow: '#ffffff',
    headgear: 'CROWN',
    weapon: 'ARCANE_STAFF',
    wings: 'CAPE',
  },
  u4_artemis: {
    primaryArmor: '#7c2d12',
    secondaryArmor: '#dc2626',
    trimGold: '#fbbf24',
    skinOrFace: '#ffedd5',
    eyeGlow: '#fde047',
    weaponColor: '#f59e0b',
    weaponGlow: '#ef4444',
    headgear: 'DRAGON_HORNS',
    weapon: 'BOW',
    wings: 'DRAGON_WINGS',
  },
  u4_diablo: {
    primaryArmor: '#14532d',
    secondaryArmor: '#22c55e',
    trimGold: '#fde047',
    skinOrFace: '#dcfce7',
    eyeGlow: '#86efac',
    weaponColor: '#4ade80',
    weaponGlow: '#fef08a',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'NATURE_STAFF',
    wings: 'CAPE',
  },

  // --------------------------------------------------------------------------
  // 5코스트 전설 (8종)
  // --------------------------------------------------------------------------
  u5_ignis: {
    primaryArmor: '#b7094c',
    secondaryArmor: '#ff4800',
    trimGold: '#ffea00',
    skinOrFace: '#ff9e00',
    eyeGlow: '#ffffff',
    weaponColor: '#ffea00',
    weaponGlow: '#ff0000',
    headgear: 'DRAGON_HORNS',
    weapon: 'DRAGON_CLAW',
    wings: 'DRAGON_WINGS',
  },
  u5_goldtooth: {
    primaryArmor: '#ffd700',
    secondaryArmor: '#b5179e',
    trimGold: '#ffea00',
    skinOrFace: '#70e000',
    eyeGlow: '#ff0055',
    weaponColor: '#ffea00',
    weaponGlow: '#00f5d4',
    headgear: 'CROWN',
    weapon: 'CANNON_BAG',
    wings: 'CAPE',
  },
  u5_luciel: {
    primaryArmor: '#311068',
    secondaryArmor: '#facc15',
    trimGold: '#38bdf8',
    skinOrFace: '#f8fafc',
    eyeGlow: '#f43f5e',
    weaponColor: '#e0f2fe',
    weaponGlow: '#facc15',
    headgear: 'HALO_HELM',
    weapon: 'BOW',
    wings: 'ANGEL_WINGS',
  },
  u5_michael: {
    primaryArmor: '#ffffff',
    secondaryArmor: '#ffd700',
    trimGold: '#ffea00',
    skinOrFace: '#fff8e7',
    eyeGlow: '#00f5d4',
    weaponColor: '#ffea00',
    weaponGlow: '#ffffff',
    headgear: 'HALO_HELM',
    weapon: 'HOLY_BLADE',
    wings: 'ANGEL_WINGS',
  },
  u5_bahamut: {
    primaryArmor: '#1e1b4b',
    secondaryArmor: '#7c3aed',
    trimGold: '#38bdf8',
    skinOrFace: '#c084fc',
    eyeGlow: '#00f5d4',
    weaponColor: '#38bdf8',
    weaponGlow: '#f472b6',
    headgear: 'DRAGON_HORNS',
    weapon: 'ARCHMAGE_ORB',
    wings: 'DRAGON_WINGS',
  },
  u5_chronos: {
    primaryArmor: '#0f172a',
    secondaryArmor: '#0284c7',
    trimGold: '#facc15',
    skinOrFace: '#e0f2fe',
    eyeGlow: '#fef08a',
    weaponColor: '#facc15',
    weaponGlow: '#38bdf8',
    headgear: 'CROWN',
    weapon: 'ARCHMAGE_ORB',
    wings: 'ANGEL_WINGS',
  },
  u5_lilith: {
    primaryArmor: '#4c0519',
    secondaryArmor: '#e11d48',
    trimGold: '#fda4af',
    skinOrFace: '#ffe4e6',
    eyeGlow: '#ffea00',
    weaponColor: '#fb7185',
    weaponGlow: '#f43f5e',
    headgear: 'DEMON_HORNS',
    weapon: 'SCYTHE',
    wings: 'DEMON_WINGS',
  },
  u5_yggdrasil: {
    primaryArmor: '#064e3b',
    secondaryArmor: '#10b981',
    trimGold: '#fde047',
    skinOrFace: '#a7f3d0',
    eyeGlow: '#fef08a',
    weaponColor: '#fde047',
    weaponGlow: '#34d399',
    headgear: 'CROWN',
    weapon: 'NATURE_STAFF',
    wings: 'ANGEL_WINGS',
  },
};

const WEAPON_BADGE_ICONS: Record<WeaponKind, string> = {
  GREATSWORD: '🗡️',
  SWORD_SHIELD: '🛡️',
  DUAL_DAGGERS: '⚔️',
  BOW: '🏹',
  ARCANE_STAFF: '🔮',
  NATURE_STAFF: '🌿',
  SCYTHE: '💀',
  DRAGON_CLAW: '🐉',
  SPEAR: '🔱',
  CANNON_BAG: '💣',
  HOLY_BLADE: '✨',
  ARCHMAGE_ORB: '⚡',
};

/**
 * 실시간 전투 타격감(Combat Juice) & 피격 잔상 트레일(Damage Trail) 애니메이션 상태
 */
interface UnitVisualJuiceState {
  renderRow: number;
  renderCol: number;
  moveFromRow: number;
  moveFromCol: number;
  moveToRow: number;
  moveToCol: number;
  moveProgress: number;
  moveDurationMs: number;
  isLeapMove: boolean;

  lungeDirX: number;
  lungeDirY: number;
  lungeTimerMs: number;
  lungeDurationMs: number;

  hitFlashTimerMs: number;
  knockbackOffsetX: number;
  knockbackOffsetY: number;
  squashTimerMs: number;

  trailHp: number;
  trailMaxHp: number;

  facingX: 1 | -1;
}


interface SlashSmearFX {
  x: number;
  y: number;
  angleRad: number;
  radius: number;
  color: string;
  coreColor: string;
  lifeMs: number;
  maxLifeMs: number;
}

interface ProjectileFX {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  trailColor: string;
  kind: 'ARROW' | 'ORB' | 'FIRE' | 'COIN' | 'LIGHTNING';
  lifeMs: number;
  maxLifeMs: number;
}

interface PixelSparkFX {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  color: string;
  lifeMs: number;
  maxLifeMs: number;
}

interface ArcadeDamagePopFX {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  text: string;
  color: string;
  strokeColor: string;
  baseFontSize: number;
  isCritOrCataclysm: boolean;
  lifeMs: number;
  maxLifeMs: number;
}

interface AvatarLaserFinisherFX {
  id: number;
  winnerSide: 'HOME' | 'AWAY';
  winnerName: string;
  loserName: string;
  damage: number;
  survivingUnits: number;
  lifeMs: number;
  maxLifeMs: number;
  impactTriggered: boolean;
}

const COST_BORDER_COLORS: Record<CostTier, string> = {
  1: '#94a3b8',
  2: '#2ec4b6',
  3: '#3a86ff',
  4: '#b5179e',
  5: '#ffbe0b',
};

export class PixelGameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // 논리적 뷰포트 크기 (CSS Pixel 기준) 및 레티나 DPR 배율
  public viewportWidth: number = 800;
  public viewportHeight: number = 600;
  public dpr: number = 1;

  // 오프스크린 도트 스프라이트 캐시
  private spriteCache: Map<string, HTMLCanvasElement> = new Map();

  // 유닛별 전투 모션/타격감 상태
  private unitJuiceMap: Map<string, UnitVisualJuiceState> = new Map();

  // 전투 VFX 리스트
  private slashSmears: SlashSmearFX[] = [];
  private projectiles: ProjectileFX[] = [];
  private pixelSparks: PixelSparkFX[] = [];
  private damagePops: ArcadeDamagePopFX[] = [];

  // 전투 종료 승리 지휘관 아바타 -> 패배 지휘관 아바타 레이저 피니시 연출 상태
  private activeLaserFX: AvatarLaserFinisherFX | null = null;
  private lastTriggeredFinisherId: number = 0;

  // 역경직(Hit-Stop 45ms) & 카메라 쉐이크(Screen Shake) 타이머
  private hitStopRemainingMs: number = 0;
  private shakeRemainingMs: number = 0;
  private shakeIntensity: number = 0;
  private cataclysmFlashMs: number = 0;
  private globalAnimClockMs: number = 0;

  // 유저 지휘관 아바타 실시간 자유 이동 위치 (터치한 전장 좌표로 이동)
  public playerAvatarPos: { x: number; y: number } | null = null;
  public playerAvatarTarget: { x: number; y: number } | null = null;

  // 현재 프레임의 육각형 보드 메트릭스 & 하단 1x9 대기석 슬롯 히트박스
  public hexMetrics!: HexBoardViewportMetrics;
  public benchSlotRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  public isShopExpanded: boolean = true;

  /**
   * 유저가 화면(전장)을 터치했을 때 아바타의 목표 이동 좌표를 설정
   */
  public movePlayerAvatarTo(x: number, y: number): void {
    const clampedX = Math.max(30, Math.min(this.viewportWidth - 30, x));
    const clampedY = Math.max(40, Math.min(this.viewportHeight - 70, y));
    this.playerAvatarTarget = { x: clampedX, y: clampedY };
  }

  public getPlayerAvatarCurrentPos(): { x: number; y: number } {
    if (!this.playerAvatarPos) {
      return this.getHomeCommanderAnchor();
    }
    return { ...this.playerAvatarPos };
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.resizeViewport(
      window.innerWidth || 800,
      window.innerHeight || 600,
      window.devicePixelRatio || 1,
      true
    );
  }

  /**
   * 고해상도 모바일 레티나(DPR) 대응 및 가로모드 뷰포트 갱신
   */
  public resizeViewport(
    cssWidth: number,
    cssHeight: number,
    devicePixelRatio: number = 1,
    isShopExpanded: boolean = this.isShopExpanded
  ): void {
    this.viewportWidth = Math.max(320, Math.floor(cssWidth));
    this.viewportHeight = Math.max(220, Math.floor(cssHeight));
    this.dpr = Math.max(1, Math.min(3, devicePixelRatio || 1));
    this.isShopExpanded = isShopExpanded;

    this.canvas.width = Math.floor(this.viewportWidth * this.dpr);
    this.canvas.height = Math.floor(this.viewportHeight * this.dpr);
    this.canvas.style.width = `${this.viewportWidth}px`;
    this.canvas.style.height = `${this.viewportHeight}px`;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;

    this.recomputeLayoutMetrics(this.isShopExpanded);
  }

  /**
   * 가로모드(Landscape) 맞춤형 전장 + 대기석(1x9) 수직 일체형 스케일러:
   * - 상점이 열려 있을 때는 슬림 상점 드로어(94px + 토글바 18px)를 차감하고,
   *   상점이 접혔거나 전투 중일 때는 하단 여백(14px)만 차감하여 전장을 최대 크기로 확대한다.
   * - 1x9 대기석은 반드시 8행 육각형 전장(row=7) 바로 아래(`benchTopY`)에 배치되어
   *   어떤 스마트폰 해상도에서도 전장을 단 1px도 가리지 않는다.
   */
  public recomputeLayoutMetrics(isShopExpanded: boolean = this.isShopExpanded): void {
    this.isShopExpanded = isShopExpanded;
    const w = this.viewportWidth;
    const h = this.viewportHeight;

    const topHudPx = 38;
    const bottomReservedPx = isShopExpanded ? Math.min(108, Math.floor(h * 0.28)) : 16;
    const leftDockPx = 68;
    const rightDockPx = 78;

    const arenaLeft = leftDockPx;
    const arenaTop = topHudPx;
    const arenaWidth = Math.max(200, w - leftDockPx - rightDockPx);
    const arenaHeight = Math.max(120, h - topHudPx - bottomReservedPx);

    this.hexMetrics = HexGridMath.computeBoardMetrics(
      arenaLeft,
      arenaTop,
      arenaWidth,
      arenaHeight,
      8,
      7
    );

    // 대기석(1x9) 슬롯을 7행(아군 마지막 줄) 바로 아래(`this.hexMetrics.benchTopY`)의 석조 단상 위에 정렬
    const maxBenchTotalW = Math.min(
      arenaWidth * 0.94,
      this.hexMetrics.hexWidth * 7.45
    );
    const slotGap = Math.max(3, Math.round(this.hexMetrics.hexRadius * 0.14));
    const slotW = Math.max(22, Math.floor((maxBenchTotalW - slotGap * 8) / 9));
    const slotH = this.hexMetrics.benchHeight;
    const actualBenchTotalW = slotW * 9 + slotGap * 8;
    const benchStartX = Math.floor(
      this.hexMetrics.centerX - actualBenchTotalW * 0.5
    );
    const benchY = Math.floor(this.hexMetrics.benchTopY);

    this.benchSlotRects = [];
    for (let i = 0; i < 9; i++) {
      this.benchSlotRects.push({
        x: benchStartX + i * (slotW + slotGap),
        y: benchY,
        w: slotW,
        h: slotH,
      });
    }
  }


  /**
   * 화면 포인터 좌표 (px, py)가 하단 1x9 대기석 슬롯(0~8) 중 어디에 속하는지 반환
   */
  public screenPointToBenchIndex(px: number, py: number): number | null {
    for (let i = 0; i < this.benchSlotRects.length; i++) {
      const r = this.benchSlotRects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        return i;
      }
    }
    return null;
  }

  public resetCombatJuiceStates(): void {
    this.unitJuiceMap.clear();
    this.slashSmears = [];
    this.projectiles = [];
    this.hitStopRemainingMs = 0;
  }

  /**
   * 전투 종료 직후 승리 플레이어 아바타가 패배 플레이어 아바타에게 거대한 마법 레이저/에너지 투사체를 쏘아
   * 직접 체력을 깎는 피니시 연출을 트리거한다.
   */
  public triggerAvatarFinisherLaser(payload: AvatarFinisherLaserPayload | null): void {
    if (!payload) return;
    if (payload.id === this.lastTriggeredFinisherId) return;
    this.lastTriggeredFinisherId = payload.id;

    this.activeLaserFX = {
      id: payload.id,
      winnerSide: payload.winnerSide,
      winnerName: payload.winnerName,
      loserName: payload.loserName,
      damage: payload.damage,
      survivingUnits: payload.survivingUnits,
      lifeMs: 0,
      maxLifeMs: 1050,
      impactTriggered: false,
    };
  }

  public spawnPixelSparks(
    x: number,
    y: number,
    color: string,
    count: number = 22
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 165;
      this.pixelSparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 45,
        gravity: 340,
        size: Math.random() < 0.4 ? 4 : 3,
        color,
        lifeMs: 0,
        maxLifeMs: 360 + Math.random() * 280,
      });
    }
  }

  public spawnArcadePopupText(
    x: number,
    y: number,
    text: string,
    color: string = '#ffea00',
    fontSize: number = 15
  ): void {
    this.damagePops.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 40,
      vy: -135,
      gravity: 360,
      text,
      color,
      strokeColor: '#000000',
      baseFontSize: fontSize,
      isCritOrCataclysm: true,
      lifeMs: 0,
      maxLifeMs: 1100,
    });
  }

  public triggerImpactShake(
    intensity: number = 7,
    durationMs: number = 220,
    hitStopMs: number = 45
  ): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeRemainingMs = Math.max(this.shakeRemainingMs, durationMs);
    if (hitStopMs > 0) {
      this.hitStopRemainingMs = Math.max(this.hitStopRemainingMs, hitStopMs);
    }
  }

  /**
   * 1. 상점 카드(Shop Portrait)에 실제 필드 위 도트 캐릭터를 2.5~3배 확대 클로즈업 아바타로 렌더링
   * - 배경에는 해당 기물의 메인 시너지/코스트 테마 색상 그라데이션 + 도트 무기 아이콘을 깔아줌
   * - 필드 위 기물과 100% 동일한 28x28 도트 캐릭터를 2.8배(약 78x78) 확대하여 칼같이 렌더링
   */
  public renderShopCardPortrait(
    portraitCanvas: HTMLCanvasElement,
    unitId: string,
    cost: CostTier,
    isOwnedHighlight: boolean
  ): void {
    const dpr = Math.max(2, Math.floor(this.dpr));
    const logicalW = 96;
    const logicalH = 74;
    portraitCanvas.width = logicalW * dpr;
    portraitCanvas.height = logicalH * dpr;

    const pCtx = portraitCanvas.getContext('2d')!;
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pCtx.imageSmoothingEnabled = false;

    const spec = UNIT_PIXEL_SPECS[unitId] ?? UNIT_PIXEL_SPECS.u1_garen;
    const borderColor = COST_BORDER_COLORS[cost];

    // 1) 시너지/코스트 테마 배경 라디얼 그라데이션
    const bgGrad = pCtx.createRadialGradient(
      logicalW * 0.5,
      logicalH * 0.58,
      6,
      logicalW * 0.5,
      logicalH * 0.55,
      logicalW * 0.65
    );
    bgGrad.addColorStop(0, spec.primaryArmor);
    bgGrad.addColorStop(0.55, '#131b2e');
    bgGrad.addColorStop(1, '#080b14');
    pCtx.fillStyle = bgGrad;
    pCtx.fillRect(0, 0, logicalW, logicalH);

    // 2) 보유 기물인 경우 배경 황금 마법 후광 링
    if (isOwnedHighlight) {
      pCtx.strokeStyle = 'rgba(255, 234, 0, 0.55)';
      pCtx.lineWidth = 2;
      pCtx.beginPath();
      pCtx.arc(logicalW * 0.5, logicalH * 0.56, 26, 0, Math.PI * 2);
      pCtx.stroke();
    }

    // 3) 우측 상단 워터마크 도트 무기 아이콘
    const weaponIcon = WEAPON_BADGE_ICONS[spec.weapon] ?? '⚔️';
    pCtx.font = '13px sans-serif';
    pCtx.textAlign = 'right';
    pCtx.globalAlpha = 0.78;
    pCtx.fillText(weaponIcon, logicalW - 5, 16);
    pCtx.globalAlpha = 1.0;

    // 4) 발밑 타원형 그림자 패드
    pCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    pCtx.beginPath();
    pCtx.ellipse(logicalW * 0.5, logicalH - 7, 24, 6, 0, 0, Math.PI * 2);
    pCtx.fill();

    // 5) 필드 위와 100% 동일한 28x28 도트 스프라이트를 2.65배(~74x74) 확대 클로즈업으로 렌더링
    const sprite = this.getOrCreateUnitPixelSprite(
      unitId,
      isOwnedHighlight ? 2 : 1,
      0,
      false
    );
    const drawSize = 72; // 28px * ~2.6배 확대 클로즈업 아바타
    const drawX = Math.floor((logicalW - drawSize) * 0.5);
    const drawY = Math.floor(logicalH - drawSize + 2);
    pCtx.drawImage(sprite, drawX, drawY, drawSize, drawSize);

    // 6) 상점 초상화 내부 픽셀 액자 테두리
    pCtx.strokeStyle = isOwnedHighlight ? '#ffea00' : borderColor;
    pCtx.lineWidth = 1.5;
    pCtx.strokeRect(1, 1, logicalW - 2, logicalH - 2);
  }

  public ingestCombatEvents(events: CombatEvent[], units: CombatUnit[]): void {
    const unitById = new Map<string, CombatUnit>();
    for (const u of units) {
      unitById.set(u.instanceId, u);
    }

    for (const ev of events) {
      if (ev.type === 'MOVE' || ev.type === 'LEAP') {
        if (
          ev.sourceId &&
          ev.fromRow !== undefined &&
          ev.fromCol !== undefined &&
          ev.toRow !== undefined &&
          ev.toCol !== undefined
        ) {
          const state = this.getOrInitUnitJuice(
            ev.sourceId,
            ev.fromRow,
            ev.fromCol
          );
          state.moveFromRow = ev.fromRow;
          state.moveFromCol = ev.fromCol;
          state.moveToRow = ev.toRow;
          state.moveToCol = ev.toCol;
          state.moveProgress = 0;

          const pFrom = HexGridMath.hexToScreenCenter(
            ev.fromRow,
            ev.fromCol,
            this.hexMetrics
          );
          const pTo = HexGridMath.hexToScreenCenter(
            ev.toRow,
            ev.toCol,
            this.hexMetrics
          );
          if (Math.abs(pTo.x - pFrom.x) > 2) {
            state.facingX = pTo.x >= pFrom.x ? 1 : -1;
          }
          if (ev.type === 'LEAP') {
            this.spawnPixelSparks(pFrom.x, pFrom.y, '#9d4edd', 14);
            this.spawnPixelSparks(pTo.x, pTo.y, '#e0aaff', 18);
          }
        }
      } else if (ev.type === 'FIVE_COST_3STAR_CATACLYSM') {
        this.cataclysmFlashMs = 900;
        this.triggerImpactShake(14, 550, 75);
        const cx = this.viewportWidth * 0.5;
        const cy = this.viewportHeight * 0.42;
        this.spawnArcadePopupText(cx, cy, '⚡ 99,999! 5코 3성 절대 권능! ⚡', '#ffea00', 22);
        this.spawnPixelSparks(cx, cy, '#ffea00', 65);
      } else if (
        (ev.type === 'BASIC_ATTACK' || ev.type === 'SKILL_CAST') &&
        ev.sourceId &&
        ev.fromRow !== undefined &&
        ev.fromCol !== undefined &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined
      ) {
        const attacker = unitById.get(ev.sourceId);
        const pFrom = HexGridMath.hexToScreenCenter(
          ev.fromRow,
          ev.fromCol,
          this.hexMetrics
        );
        const pTo = HexGridMath.hexToScreenCenter(
          ev.toRow,
          ev.toCol,
          this.hexMetrics
        );
        const dx = pTo.x - pFrom.x;
        const dy = pTo.y - pFrom.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const nx = dx / len;
        const ny = dy / len;

        const state = this.getOrInitUnitJuice(
          ev.sourceId,
          ev.fromRow,
          ev.fromCol
        );
        if (Math.abs(dx) > 2) {
          state.facingX = dx >= 0 ? 1 : -1;
        }

        state.lungeDirX = nx;
        state.lungeDirY = ny;
        state.lungeDurationMs = ev.type === 'SKILL_CAST' ? 210 : 150;
        state.lungeTimerMs = state.lungeDurationMs;

        const isMelee = !attacker || attacker.range <= 1;
        const spec = UNIT_PIXEL_SPECS[ev.unitId ?? 'u1_garen'] ?? UNIT_PIXEL_SPECS.u1_garen;

        if (isMelee) {
          const smearX = pFrom.x + nx * (this.hexMetrics.hexRadius * 0.65);
          const smearY = pFrom.y + ny * (this.hexMetrics.hexRadius * 0.65);
          this.slashSmears.push({
            x: smearX,
            y: smearY,
            angleRad: Math.atan2(dy, dx),
            radius:
              this.hexMetrics.hexRadius *
              (ev.type === 'SKILL_CAST' ? 1.15 : 0.78),
            color: ev.type === 'SKILL_CAST' ? spec.weaponGlow : spec.weaponColor,
            coreColor: '#ffffff',
            lifeMs: 0,
            maxLifeMs: ev.type === 'SKILL_CAST' ? 220 : 145,
          });
        } else {
          const projKind =
            spec.weapon === 'BOW'
              ? 'ARROW'
              : spec.weapon === 'CANNON_BAG'
              ? 'COIN'
              : spec.wings === 'DRAGON_WINGS'
              ? 'FIRE'
              : 'ORB';
          this.projectiles.push({
            x1: pFrom.x,
            y1: pFrom.y - 10,
            x2: pTo.x,
            y2: pTo.y - 8,
            color: spec.weaponGlow,
            trailColor: spec.primaryArmor,
            kind: projKind,
            lifeMs: 0,
            maxLifeMs: 165,
          });
        }

        if (ev.type === 'SKILL_CAST' && attacker && attacker.cost >= 3) {
          this.triggerImpactShake(attacker.cost >= 4 ? 8 : 5, 190, 45);
        }
      } else if (
        ev.type === 'DAMAGE' &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined &&
        ev.amount !== undefined
      ) {
        const pTarget = HexGridMath.hexToScreenCenter(
          ev.toRow,
          ev.toCol,
          this.hexMetrics
        );

        if (ev.targetId) {
          const targetState = this.getOrInitUnitJuice(
            ev.targetId,
            ev.toRow,
            ev.toCol
          );
          targetState.hitFlashTimerMs = 80;
          targetState.squashTimerMs = 150;

          if (ev.fromRow !== undefined && ev.fromCol !== undefined) {
            const pAttacker = HexGridMath.hexToScreenCenter(
              ev.fromRow,
              ev.fromCol,
              this.hexMetrics
            );
            const kdx = pTarget.x - pAttacker.x;
            const kdy = pTarget.y - pAttacker.y;
            const klen = Math.max(1, Math.hypot(kdx, kdy));
            const knockDist = ev.isCrit ? 8.5 : 5.0;
            targetState.knockbackOffsetX = (kdx / klen) * knockDist;
            targetState.knockbackOffsetY = (kdy / klen) * knockDist;
          } else {
            targetState.knockbackOffsetY = -5;
          }
        }

        const isCataclysm = ev.amount >= 9999;
        if (ev.isCrit || isCataclysm || ev.amount >= 380) {
          this.triggerImpactShake(
            isCataclysm ? 13 : ev.isCrit ? 6.5 : 4.5,
            isCataclysm ? 420 : 160,
            45
          );
        }

        const sparkColor = isCataclysm
          ? '#ffea00'
          : ev.damageType === 'TRUE'
          ? '#ffffff'
          : ev.damageType === 'MAGICAL'
          ? '#4cc9f0'
          : ev.isCrit
          ? '#ff2a85'
          : '#ff9e00';
        this.spawnPixelSparks(
          pTarget.x,
          pTarget.y - 8,
          sparkColor,
          ev.isCrit || isCataclysm ? 16 : 8
        );

        const vx = (Math.random() - 0.5) * 95;
        const vy = isCataclysm ? -190 : ev.isCrit ? -155 : -120;
        this.damagePops.push({
          x: pTarget.x + (Math.random() - 0.5) * 10,
          y: pTarget.y - 16,
          vx,
          vy,
          gravity: 420,
          text: `${ev.isCrit || isCataclysm ? '💥' : ''}-${ev.amount}`,
          color: sparkColor,
          strokeColor: '#090b10',
          baseFontSize: isCataclysm ? 22 : ev.isCrit ? 16 : 12,
          isCritOrCataclysm: Boolean(ev.isCrit || isCataclysm),
          lifeMs: 0,
          maxLifeMs: isCataclysm ? 1250 : 760,
        });
      } else if (
        ev.type === 'HEAL' &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined &&
        ev.amount !== undefined
      ) {
        const pTarget = HexGridMath.hexToScreenCenter(
          ev.toRow,
          ev.toCol,
          this.hexMetrics
        );
        this.damagePops.push({
          x: pTarget.x,
          y: pTarget.y - 18,
          vx: (Math.random() - 0.5) * 35,
          vy: -105,
          gravity: 260,
          text: `+${ev.amount}`,
          color: '#52b788',
          strokeColor: '#081c15',
          baseFontSize: 12,
          isCritOrCataclysm: false,
          lifeMs: 0,
          maxLifeMs: 680,
        });
      }
    }
  }

  private getOrInitUnitJuice(
    instanceId: string,
    row: number,
    col: number
  ): UnitVisualJuiceState {
    let st = this.unitJuiceMap.get(instanceId);
    if (!st) {
      st = {
        renderRow: row,
        renderCol: col,
        moveFromRow: row,
        moveFromCol: col,
        moveToRow: row,
        moveToCol: col,
        moveProgress: 1,
        moveDurationMs: 480,
        isLeapMove: false,
        lungeDirX: 0,
        lungeDirY: 0,
        lungeTimerMs: 0,
        lungeDurationMs: 150,
        hitFlashTimerMs: 0,
        knockbackOffsetX: 0,
        knockbackOffsetY: 0,
        squashTimerMs: 0,
        trailHp: -1,
        trailMaxHp: -1,
        facingX: 1,
      };
      this.unitJuiceMap.set(instanceId, st);
    }
    return st;
  }


  // 전장 맵 테마 ('FOREST' = 요정의 숲 공터, 'CASTLE_TOWN' = 제국 왕도 성벽 광장)
  public currentMapTheme: 'FOREST' | 'CASTLE_TOWN' = 'FOREST';

  public toggleMapTheme(): 'FOREST' | 'CASTLE_TOWN' {
    this.currentMapTheme =
      this.currentMapTheme === 'FOREST' ? 'CASTLE_TOWN' : 'FOREST';
    return this.currentMapTheme;
  }

  // ==========================================================================
  // 메인 프레임 렌더링 루프
  // ==========================================================================

  public renderFrame(
    dtMs: number,
    params: {
      inCombat: boolean;
      viewedParticipant: Participant;
      opponentName?: string;
      combatUnits: CombatUnit[];
      hoveredHex: HexCoord | null;
      hoveredBenchIndex: number | null;
      isDraggingUnit: boolean;
      draggedInstanceId: string | null;
      selectedInstanceId: string | null;
      hasPandoraBench: boolean;
      isCreepMatch?: boolean;
    }
  ): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const w = this.viewportWidth;
    const h = this.viewportHeight;

    let effectiveDt = dtMs;
    if (this.hitStopRemainingMs > 0) {
      this.hitStopRemainingMs = Math.max(0, this.hitStopRemainingMs - dtMs);
      effectiveDt = 0;
    } else {
      this.globalAnimClockMs += dtMs;
    }

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeRemainingMs > 0) {
      this.shakeRemainingMs = Math.max(0, this.shakeRemainingMs - dtMs);
      const decay = Math.min(1, this.shakeRemainingMs / 180);
      shakeX = Math.round((Math.random() - 0.5) * 2 * this.shakeIntensity * decay);
      shakeY = Math.round((Math.random() - 0.5) * 2 * this.shakeIntensity * decay);
    }

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    ctx.translate(shakeX, shakeY);

    // 1. 판타지 숲 / 왕도 성채 도시 2D 도트 월드 맵 렌더링
    this.drawFantasyBiomeWorldMap(ctx, w, h);

    // 2. 육각형 바닥 타일은 대기(정비 페이즈, !inCombat)일 때만 반투명 배치 가이드로 표시하고,
    //    전투가 시작되면(inCombat === true) 완전히 숨겨서 실제 필드 위에서 싸우는 현장감을 극대화!
    if (!params.inCombat) {
      this.drawHexagonalBattlefieldGrid(
        ctx,
        params.inCombat,
        params.hoveredHex,
        params.isDraggingUnit
      );
    }

    // 3. 전장 양측 아군 지휘관 아바타 & 상대 지휘관 아바타 단상 렌더링
    // 크립전일 때는 상대 아바타를 일절 띄우지 않음!
    const showAway =
      !params.isCreepMatch && (params.inCombat || this.activeLaserFX !== null);
    this.drawCommanderAvatarsOnArena(
      ctx,
      effectiveDt,
      params.viewedParticipant,
      params.opponentName ?? '적 지휘관',
      showAway
    );

    // 4. 하단 1x9 대기석(Bench Row) 슬롯 및 기물 렌더링
    this.drawBenchSlotsAndUnits(
      ctx,
      params.viewedParticipant,
      params.hoveredBenchIndex,
      params.draggedInstanceId,
      params.selectedInstanceId,
      params.hasPandoraBench
    );

    // 5. 전장 위 기물들 렌더링 (Y-Sorting: screenY 오름차순 정렬)
    if (params.inCombat) {
      this.updateAndDrawCombatUnits(
        ctx,
        effectiveDt,
        params.combatUnits,
        params.selectedInstanceId
      );
    } else {
      this.drawPreparationBoardUnits(
        ctx,
        params.viewedParticipant,
        params.draggedInstanceId,
        params.selectedInstanceId
      );
    }

    // 6. 전투 타격 이펙트 및 승리 지휘관 아바타 -> 패배 지휘관 아바타 피니시 레이저 연출 렌더링
    this.updateAndDrawCombatVFX(ctx, effectiveDt);
    this.updateAndDrawAvatarFinisherLaser(ctx, effectiveDt);

    ctx.restore();
  }

  /**
   * 가상공간 느낌을 완전히 없애고 생동감 넘치는 판타지 숲 공터(FOREST) & 왕도 성채 광장(CASTLE_TOWN) 도트 배경을 렌더링
   */
  private drawFantasyBiomeWorldMap(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    const m = this.hexMetrics;
    const boardSpanW = m.hexWidth * 7.65;
    const slabLeft = Math.floor(m.centerX - boardSpanW * 0.5 - 14);
    const slabRight = Math.ceil(m.centerX + boardSpanW * 0.5 + 14);
    const slabW = slabRight - slabLeft;
    const slabTop = Math.floor(m.boardTopY - 12);
    const slabBottom = Math.ceil(m.benchTopY + m.benchHeight + 12);
    const slabH = slabBottom - slabTop;

    if (this.currentMapTheme === 'CASTLE_TOWN') {
      this.drawImperialCastleTownMap(
        ctx,
        w,
        h,
        slabLeft,
        slabTop,
        slabRight,
        slabBottom,
        slabW,
        slabH
      );
    } else {
      this.drawElvenForestClearingMap(
        ctx,
        w,
        h,
        slabLeft,
        slabTop,
        slabRight,
        slabBottom,
        slabW,
        slabH
      );
    }
  }

  /**
   * 테마 1: 🌲 판타지 요정의 숲 & 고대 왕도 가도 (햇살 비치는 잔디 공터, 시냇물, 아름드리 나무, 들꽃, 모닥불)
   */
  private drawElvenForestClearingMap(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    slabLeft: number,
    slabTop: number,
    slabRight: number,
    slabBottom: number,
    slabW: number,
    slabH: number
  ): void {
    const m = this.hexMetrics;

    // 1) 외곽 깊은 숲 잔디 배경
    const outerGrad = ctx.createRadialGradient(
      m.centerX,
      m.centerY,
      30,
      m.centerX,
      m.centerY,
      Math.max(w, h) * 0.75
    );
    outerGrad.addColorStop(0, '#35662d');
    outerGrad.addColorStop(0.6, '#23471e');
    outerGrad.addColorStop(1, '#142b12');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(0, 0, w, h);

    // 2) 좌측/우측 숲속 맑은 시냇물(Stream)과 통나무 다리
    const waterShimmer = Math.sin(this.globalAnimClockMs * 0.004) * 3;
    const streamX = Math.max(48, slabLeft - 26);
    ctx.fillStyle = '#1e6091';
    ctx.fillRect(streamX - 10, 0, 18, h);
    ctx.fillStyle = '#38a3a5';
    for (let wy = 10; wy < h; wy += 28) {
      ctx.fillRect(streamX - 6 + Math.round(waterShimmer * 0.4), wy, 8, 10);
    }
    // 시냇물 위 통나무 다리
    ctx.fillStyle = '#7f4f24';
    ctx.fillRect(streamX - 13, Math.floor(m.centerY - 18), 24, 36);
    ctx.fillStyle = '#582f0e';
    for (let by = -14; by <= 14; by += 7) {
      ctx.fillRect(streamX - 13, Math.floor(m.centerY + by), 24, 2);
    }

    // 3) 중앙 전투 결투장: 따사로운 햇살이 내려앉은 숲속 공터(Sunlit Grass Clearing) + 돌담/통나무 경계
    ctx.fillStyle = '#4a3520';
    this.fillBeveledRect(ctx, slabLeft - 4, slabTop - 3, slabW + 8, slabH + 8, 14);

    const fieldGrad = ctx.createRadialGradient(
      m.centerX,
      m.centerY,
      15,
      m.centerX,
      m.centerY,
      slabW * 0.65
    );
    fieldGrad.addColorStop(0, '#4f8a42');
    fieldGrad.addColorStop(0.55, '#3d7033');
    fieldGrad.addColorStop(1, '#2f5927');
    ctx.fillStyle = fieldGrad;
    this.fillBeveledRect(ctx, slabLeft, slabTop, slabW, slabH, 12);

    // 공터 가장자리 자연스러운 황토 흙길 & 이끼 낀 돌담 테두리
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8c6d46';
    this.strokeBeveledRect(ctx, slabLeft + 2, slabTop + 2, slabW - 4, slabH - 4, 10);

    // 4) 잔디밭 위 자연스러운 도트 잔디 결과 들꽃(노란/흰/하늘색 야생화), 조약돌 패치
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 7; c++) {
        const seed = (r * 13 + c * 29) % 17;
        const cx = m.originX + c * m.hexWidth + (r % 2 === 1 ? m.hexWidth * 0.5 : 0);
        const cy = m.originY + r * m.rowStepY;

        // 연한 잔디 패치
        if (seed % 3 === 0) {
          ctx.fillStyle = 'rgba(132, 204, 22, 0.16)';
          ctx.beginPath();
          ctx.ellipse(cx, cy, m.hexRadius * 0.55, m.hexRadius * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // 작은 도트 잔디 잎
        ctx.fillStyle = '#284b20';
        ctx.fillRect(cx - 10 + seed, cy + 4, 2, 4);
        ctx.fillRect(cx - 8 + seed, cy + 3, 2, 5);

        // 야생 들꽃 도트
        if (seed === 2 || seed === 9 || seed === 14) {
          const fx = Math.round(cx + (seed - 8) * 1.6);
          const fy = Math.round(cy - 5 + (seed % 5));
          ctx.fillStyle =
            seed === 2 ? '#fef08a' : seed === 9 ? '#ffffff' : '#93c5fd';
          ctx.fillRect(fx, fy, 3, 3);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(fx + 1, fy + 1, 1, 1);
        }
      }
    }

    // 5) 아군/적군 진영을 가르는 숲속 오솔길 & 작은 돌다리 경계선
    const midY = Math.round(m.originY + 3.5 * m.rowStepY);
    ctx.fillStyle = 'rgba(166, 124, 82, 0.38)';
    ctx.fillRect(slabLeft + 10, midY - 3, slabW - 20, 6);
    ctx.fillStyle = 'rgba(214, 184, 140, 0.45)';
    for (let sx = slabLeft + 22; sx < slabRight - 22; sx += 26) {
      ctx.fillRect(sx, midY - 2, 12, 4);
    }

    // 6) 상단(적 진영 뒤편) 고대 석조 성문 아치 & 전장 외곽 아름드리 도트 나무(Swaying Pixel Trees)
    const sway = Math.round(Math.sin(this.globalAnimClockMs * 0.003) * 1.5);
    const treePositions = [
      { x: slabLeft - 8, y: slabTop + 18, scale: 1.0 },
      { x: slabLeft - 12, y: slabTop + slabH * 0.48, scale: 1.1 },
      { x: slabLeft - 8, y: slabBottom - 22, scale: 0.95 },
      { x: slabRight + 10, y: slabTop + 20, scale: 1.05 },
      { x: slabRight + 14, y: slabTop + slabH * 0.5, scale: 1.1 },
      { x: slabRight + 10, y: slabBottom - 20, scale: 0.95 },
    ];
    for (const tp of treePositions) {
      this.drawPixelForestTree(ctx, tp.x, tp.y, tp.scale, sway);
    }

    // 7) 결투장 네 모서리 따뜻한 야영지 모닥불(Campfire Lanterns)
    const flicker = Math.sin(this.globalAnimClockMs * 0.015) * 1.8;
    const campfires = [
      { x: slabLeft + 12, y: slabTop + 12 },
      { x: slabRight - 12, y: slabTop + 12 },
      { x: slabLeft + 12, y: slabBottom - 12 },
      { x: slabRight - 12, y: slabBottom - 12 },
    ];
    for (const cf of campfires) {
      // 따뜻한 모닥불 불빛 후광
      const glow = ctx.createRadialGradient(cf.x, cf.y, 2, cf.x, cf.y, 22);
      glow.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
      glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cf.x, cf.y, 22, 0, Math.PI * 2);
      ctx.fill();

      // 통나무 장작
      ctx.fillStyle = '#582f0e';
      ctx.fillRect(cf.x - 5, cf.y, 10, 4);
      // 불꽃 도트
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(cf.x, cf.y - 3, 4 + flicker * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cf.x - 2, cf.y - 5 - Math.round(flicker * 0.4), 4, 4);
    }
  }

  private drawPixelForestTree(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    sway: number
  ): void {
    const r = Math.round(14 * scale);
    // 나무 그림자
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // 나무 기둥
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(x - 4, y - 6, 8, 12);

    // 풍성한 3단 도트 수관(Foliage)
    ctx.fillStyle = '#1b4332';
    ctx.beginPath();
    ctx.arc(x + sway * 0.5, y - 10, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2d6a4f';
    ctx.beginPath();
    ctx.arc(x - 3 + sway, y - 13, r * 0.82, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#52b788';
    ctx.beginPath();
    ctx.arc(x - 4 + sway, y - 16, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 테마 2: 🏰 신성 제국 왕도 대광장 (중세 판타지 성벽, 보도블록 광장, 왕국 깃발, 가로등 화로)
   */
  private drawImperialCastleTownMap(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    slabLeft: number,
    slabTop: number,
    slabRight: number,
    slabBottom: number,
    slabW: number,
    slabH: number
  ): void {
    const m = this.hexMetrics;

    // 1) 왕도 성곽 외곽 포장도로 및 해자 배경
    const cityGrad = ctx.createRadialGradient(
      m.centerX,
      m.centerY,
      30,
      m.centerX,
      m.centerY,
      Math.max(w, h) * 0.78
    );
    cityGrad.addColorStop(0, '#4a443c');
    cityGrad.addColorStop(0.65, '#2c2824');
    cityGrad.addColorStop(1, '#1a1815');
    ctx.fillStyle = cityGrad;
    ctx.fillRect(0, 0, w, h);

    // 2) 상단 중세 왕도 성벽(Castle Battlements)과 왕국 깃발
    const wallY = Math.max(30, slabTop - 16);
    ctx.fillStyle = '#645d54';
    ctx.fillRect(slabLeft - 20, wallY, slabW + 40, 16);
    ctx.fillStyle = '#82796e';
    for (let bx = slabLeft - 18; bx < slabRight + 16; bx += 18) {
      ctx.fillRect(bx, wallY - 5, 11, 6);
    }

    // 3) 중앙 왕도 대광장 사암/화강암 보도블록 바닥
    ctx.fillStyle = '#332e2a';
    this.fillBeveledRect(ctx, slabLeft - 4, slabTop - 2, slabW + 8, slabH + 8, 12);

    const plazaGrad = ctx.createRadialGradient(
      m.centerX,
      m.centerY,
      15,
      m.centerX,
      m.centerY,
      slabW * 0.65
    );
    plazaGrad.addColorStop(0, '#786f63');
    plazaGrad.addColorStop(0.6, '#5e564c');
    plazaGrad.addColorStop(1, '#474139');
    ctx.fillStyle = plazaGrad;
    this.fillBeveledRect(ctx, slabLeft, slabTop, slabW, slabH, 10);

    // 보도블록 벽돌 결
    ctx.strokeStyle = 'rgba(35, 30, 25, 0.32)';
    ctx.lineWidth = 1;
    const tileStepX = 28;
    const tileStepY = 16;
    for (let py = slabTop + 8; py < slabBottom - 8; py += tileStepY) {
      const shift = ((Math.floor(py / tileStepY) % 2) * tileStepX) / 2;
      for (let px = slabLeft + 10; px < slabRight - 18; px += tileStepX) {
        ctx.strokeRect(px + shift, py, tileStepX - 2, tileStepY - 2);
      }
    }

    // 광장 중앙 왕실 문장 카펫 라인 & 황금 테두리
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#eab308';
    this.strokeBeveledRect(ctx, slabLeft + 2, slabTop + 2, slabW - 4, slabH - 4, 9);

    const midY = Math.round(m.originY + 3.5 * m.rowStepY);
    ctx.fillStyle = 'rgba(185, 28, 28, 0.35)';
    ctx.fillRect(slabLeft + 14, midY - 4, slabW - 28, 8);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(slabLeft + 14, midY);
    ctx.lineTo(slabRight - 14, midY);
    ctx.stroke();

    // 4) 좌우 왕도 화단 & 성벽 깃발/황금 가로등 화로
    const flicker = Math.sin(this.globalAnimClockMs * 0.015) * 1.8;
    const braziers = [
      { x: slabLeft + 12, y: slabTop + 12, bannerColor: '#dc2626' },
      { x: slabRight - 12, y: slabTop + 12, bannerColor: '#dc2626' },
      { x: slabLeft + 12, y: slabBottom - 12, bannerColor: '#2563eb' },
      { x: slabRight - 12, y: slabBottom - 12, bannerColor: '#2563eb' },
    ];
    for (const bz of braziers) {
      ctx.fillStyle = bz.bannerColor;
      ctx.fillRect(bz.x - 4, bz.y - 2, 8, 12);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(bz.x - 5, bz.y - 4, 10, 3);
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(bz.x, bz.y - 6, 4 + flicker * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private fillBeveledRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    bevel: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + bevel, y);
    ctx.lineTo(x + w - bevel, y);
    ctx.lineTo(x + w, y + bevel);
    ctx.lineTo(x + w, y + h - bevel);
    ctx.lineTo(x + w - bevel, y + h);
    ctx.lineTo(x + bevel, y + h);
    ctx.lineTo(x, y + h - bevel);
    ctx.lineTo(x, y + bevel);
    ctx.closePath();
    ctx.fill();
  }

  private strokeBeveledRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    bevel: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + bevel, y);
    ctx.lineTo(x + w - bevel, y);
    ctx.lineTo(x + w, y + bevel);
    ctx.lineTo(x + w, y + h - bevel);
    ctx.lineTo(x + w - bevel, y + h);
    ctx.lineTo(x + bevel, y + h);
    ctx.lineTo(x, y + h - bevel);
    ctx.lineTo(x, y + bevel);
    ctx.closePath();
    ctx.stroke();
  }

  /**
   * 대기(정비) 페이즈 전용 반투명 육각형 타일 가이드:
   * - 아래에 깔린 판타지 숲 잔디밭/왕도 보도블록이 그대로 투과되어 보이도록 불투명 채우기를 제거하고
   *   아군 진영(4~7행)은 은은한 마법진 라인으로, 적군 진영(0~3행)은 옅은 위치 표시선으로만 렌더링한다.
   * - 전투 시작 시에는 호출되지 않아 바닥 타일이 완전히 사라진다.
   */
  private drawHexagonalBattlefieldGrid(
    ctx: CanvasRenderingContext2D,
    inCombat: boolean,
    hoveredHex: HexCoord | null,
    isDraggingUnit: boolean
  ): void {
    if (inCombat) return;

    const m = this.hexMetrics;
    const innerRadius = Math.max(7, m.hexRadius - m.gapPx);

    for (let r = 0; r < HexGridMath.ROWS; r++) {
      const isEnemyRow = r < 4;
      for (let c = 0; c < HexGridMath.COLS; c++) {
        const center = HexGridMath.hexToScreenCenter(r, c, m);
        const isHoveredAllySlot =
          hoveredHex !== null &&
          hoveredHex.row === r &&
          hoveredHex.col === c &&
          !isEnemyRow;

        const topPts = HexGridMath.getHexPolygonVertices(
          center.x,
          center.y,
          innerRadius,
          m.perspectiveRatio
        );
        ctx.beginPath();
        ctx.moveTo(topPts[0].x, topPts[0].y);
        for (let i = 1; i < 6; i++) {
          ctx.lineTo(topPts[i].x, topPts[i].y);
        }
        ctx.closePath();

        // 배경 잔디/돌바닥이 훤히 비치도록 아주 옅은 반투명 하이라이트만 적용
        if (isHoveredAllySlot) {
          ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
          ctx.fill();
        } else if (!isEnemyRow) {
          ctx.fillStyle = isDraggingUnit
            ? 'rgba(56, 189, 248, 0.16)'
            : 'rgba(15, 23, 42, 0.14)';
          ctx.fill();
        }

        // 육각형 테두리 가이드
        ctx.lineWidth = isHoveredAllySlot ? 2.5 : isEnemyRow ? 1.0 : 1.5;
        if (isHoveredAllySlot) {
          ctx.strokeStyle = '#ffea00';
        } else if (isEnemyRow) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        } else if (isDraggingUnit) {
          ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
        } else {
          ctx.strokeStyle =
            r === 4
              ? 'rgba(253, 224, 71, 0.52)'
              : 'rgba(255, 255, 255, 0.35)';
        }
        ctx.stroke();
      }
    }
  }


  /**
   * 아군 7행 바로 아래에 연결된 '석조 대기석 단상(1x9 Bench Sanctuary)' 및 기물 렌더링
   * - 정체불명의 빈 사각형처럼 보이지 않도록 석조 단상 프레임과 좌측 상단 [대기석] 각인, 슬롯 번호(1~9)를 함께 렌더링
   */
  private drawBenchSlotsAndUnits(
    ctx: CanvasRenderingContext2D,
    participant: Participant,
    hoveredBenchIndex: number | null,
    draggedInstanceId: string | null,
    selectedInstanceId: string | null,
    hasPandoraBench: boolean
  ): void {
    if (this.benchSlotRects.length === 0) return;

    const firstSlot = this.benchSlotRects[0];
    const lastSlot = this.benchSlotRects[this.benchSlotRects.length - 1];
    const dockX = firstSlot.x - 8;
    const dockY = firstSlot.y - 4;
    const dockW = lastSlot.x + lastSlot.w - firstSlot.x + 16;
    const dockH = firstSlot.h + 10;

    // 1) 대기석 전체를 하나로 묶어주는 고대 석조 단상 베이스
    ctx.fillStyle = '#070a14';
    this.fillBeveledRect(ctx, dockX, dockY + 3, dockW, dockH, 6);
    ctx.fillStyle = '#141d33';
    this.fillBeveledRect(ctx, dockX, dockY, dockW, dockH, 6);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.65)';
    this.strokeBeveledRect(ctx, dockX, dockY, dockW, dockH, 6);

    // 2) 좌측 '대기석' 황금 명패 태그
    const benchCount = participant.bench.filter((u) => u !== null).length;
    const tagW = 48;
    const tagH = 14;
    const tagX = dockX + 6;
    const tagY = dockY - 9;
    ctx.fillStyle = '#1e293b';
    this.fillBeveledRect(ctx, tagX, tagY, tagW, tagH, 4);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1;
    this.strokeBeveledRect(ctx, tagX, tagY, tagW, tagH, 4);
    ctx.font = '900 9px "Jua", sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.fillText(`대기석 ${benchCount}/9`, tagX + tagW * 0.5, tagY + 10);

    // 3) 9개 개별 영웅 대기 페데스탈(Pedestal) 슬롯 렌더링
    for (let i = 0; i < this.benchSlotRects.length; i++) {
      const slot = this.benchSlotRects[i];
      const isPandoraSlot = hasPandoraBench && i >= 6;
      const isHovered = hoveredBenchIndex === i;

      // 하단 3px 입체 단면
      ctx.fillStyle = '#080b14';
      this.fillBeveledRect(ctx, slot.x, slot.y + 3, slot.w, slot.h, 4);

      // 슬롯 석판 표면
      ctx.fillStyle = isHovered
        ? '#2b456b'
        : isPandoraSlot
        ? '#291a3e'
        : '#1a263e';
      this.fillBeveledRect(ctx, slot.x, slot.y, slot.w, slot.h, 4);

      ctx.lineWidth = isHovered ? 2 : 1.2;
      ctx.strokeStyle = isHovered
        ? '#ffea00'
        : isPandoraSlot
        ? '#c77dff'
        : 'rgba(100, 145, 205, 0.55)';
      this.strokeBeveledRect(ctx, slot.x, slot.y, slot.w, slot.h, 4);

      // 빈 슬롯에는 은은한 룬 받침 원과 슬롯 번호 표시
      const unit = participant.bench[i];
      if (!unit) {
        ctx.strokeStyle = isPandoraSlot
          ? 'rgba(199, 125, 255, 0.25)'
          : 'rgba(148, 163, 184, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(
          slot.x + slot.w * 0.5,
          slot.y + slot.h * 0.62,
          slot.w * 0.3,
          slot.h * 0.18,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();

        ctx.fillStyle = isPandoraSlot
          ? 'rgba(233, 213, 255, 0.45)'
          : 'rgba(148, 163, 184, 0.28)';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          isPandoraSlot ? '🎲' : `${i + 1}`,
          slot.x + slot.w * 0.5,
          slot.y + slot.h * 0.68
        );
      }

      if (unit && unit.instanceId !== draggedInstanceId) {
        const tileCenterX = slot.x + slot.w * 0.5;
        const tileCenterY = slot.y + slot.h * 0.56;
        const isSelected = unit.instanceId === selectedInstanceId;
        this.drawUnitCompleteOnCanvas(ctx, {
          unitId: unit.unitId,
          name: unit.name,
          cost: unit.cost,
          starLevel: unit.starLevel,
          currentHp: unit.maxHp,
          maxHp: unit.maxHp,
          shield: 0,
          currentMana: unit.startMana,
          maxMana: unit.maxMana,
          items: unit.items,
          team: 'HOME',
          tileCenterX,
          tileCenterY,
          facingX: 1,
          hitFlash: false,
          squashRatioX: 1,
          squashRatioY: 1,
          isStunned: false,
          isReviving: false,
          isSelectedOrDragged: isSelected,
          compactBenchMode: true,
          benchSlotWidth: slot.w,
        });
      }
    }
  }


  /**
   * 정비 페이즈(PREPARATION_PHASE): 보드(4x7) 기물들을 Y-Sorting(screenY 오름차순)으로 정렬하여 렌더링
   */
  private drawPreparationBoardUnits(
    ctx: CanvasRenderingContext2D,
    participant: Participant,
    draggedInstanceId: string | null,
    selectedInstanceId: string | null
  ): void {
    const m = this.hexMetrics;
    const renderList: Array<{
      unit: UnitInstance;
      screenX: number;
      screenY: number;
    }> = [];

    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = participant.board[r][c];
        if (!unit || unit.instanceId === draggedInstanceId) continue;
        const combatRow = 4 + r;
        const center = HexGridMath.hexToScreenCenter(combatRow, c, m);
        renderList.push({
          unit,
          screenX: center.x,
          screenY: center.y,
        });
      }
    }

    // 6. Y-Sorting (원근 깊이 정렬): 화면의 y 좌표가 작은(뒷줄) 유닛부터 큰(앞줄) 유닛 순으로 정렬
    renderList.sort((a, b) => a.screenY - b.screenY);

    for (const entry of renderList) {
      const { unit, screenX, screenY } = entry;
      this.drawUnitCompleteOnCanvas(ctx, {
        unitId: unit.unitId,
        name: unit.name,
        cost: unit.cost,
        starLevel: unit.starLevel,
        currentHp: unit.maxHp,
        maxHp: unit.maxHp,
        shield: 0,
        currentMana: unit.startMana,
        maxMana: unit.maxMana,
        items: unit.items,
        team: 'HOME',
        tileCenterX: screenX,
        tileCenterY: screenY,
        facingX: 1,
        hitFlash: false,
        squashRatioX: 1,
        squashRatioY: 1,
        isStunned: false,
        isReviving: false,
        isSelectedOrDragged: unit.instanceId === selectedInstanceId,
        compactBenchMode: false,
      });
    }
  }

  /**
   * 전투 페이즈(COMBAT_PHASE): 6방향 보간 이동, 공격 돌진(Hex Lunge), 80ms 피격 점멸, Y-Sorting 적용 렌더링
   */
  private updateAndDrawCombatUnits(
    ctx: CanvasRenderingContext2D,
    dtMs: number,
    combatUnits: CombatUnit[],
    selectedInstanceId: string | null
  ): void {
    const m = this.hexMetrics;

    const renderList: Array<{
      cu: CombatUnit;
      trailHp: number;
      screenX: number;
      screenY: number;
      facingX: 1 | -1;
      hitFlash: boolean;
      squashX: number;
      squashY: number;
    }> = [];

    for (const cu of combatUnits) {
      if (cu.currentHp <= 0 && !cu.isReviving) continue;

      const st = this.getOrInitUnitJuice(cu.instanceId, cu.row, cu.col);

      // 피격 잔상 게이지(trailHp) 초기화 및 ~250ms 부드러운 감쇠 업데이트
      if (st.trailHp < 0 || st.trailMaxHp !== cu.maxHp) {
        st.trailHp = cu.currentHp;
        st.trailMaxHp = cu.maxHp;
      } else if (cu.currentHp >= st.trailHp) {
        st.trailHp = cu.currentHp;
      } else {
        const hpGap = st.trailHp - cu.currentHp;
        const shrinkPerMs = Math.max(hpGap / 180, cu.maxHp / 250);
        st.trailHp = Math.max(cu.currentHp, st.trailHp - shrinkPerMs * dtMs);
      }

      if (st.moveToRow !== cu.row || st.moveToCol !== cu.col) {
        st.moveFromRow = st.renderRow;
        st.moveFromCol = st.renderCol;
        st.moveToRow = cu.row;
        st.moveToCol = cu.col;
        st.moveProgress = 0;
        st.moveDurationMs = cu.baseMoveIntervalMs || 480;
        st.isLeapMove = false;
      }

      let strideArcOffsetY = 0;
      if (st.moveProgress < 1) {
        const animDuration = Math.max(240, (st.moveDurationMs || 480) * 0.92);
        st.moveProgress = Math.min(1, st.moveProgress + dtMs / animDuration);
        st.renderRow =
          st.moveFromRow + (st.moveToRow - st.moveFromRow) * st.moveProgress;
        st.renderCol =
          st.moveFromCol + (st.moveToCol - st.moveFromCol) * st.moveProgress;

        if (st.isLeapMove) {
          // 암살자 은신 도약 시 공중 포물선 점프 궤적
          strideArcOffsetY = -Math.sin(st.moveProgress * Math.PI) * 32;
        } else {
          // 기물 고유 보행 리듬(중갑 탱커의 묵직한 걸음 vs 암살자/고블린의 경쾌한 스텝)
          const isHeavyTank = cu.traits.includes('VANGUARD');
          const hopHeight = isHeavyTank ? 2.5 : 4.5;
          strideArcOffsetY =
            -Math.abs(Math.sin(st.moveProgress * Math.PI * 2)) * hopHeight;
        }
      } else {
        st.renderRow = cu.row;
        st.renderCol = cu.col;
        st.isLeapMove = false;
      }

      const basePos = HexGridMath.lerpHexScreenPoint(
        st.moveFromRow,
        st.moveFromCol,
        st.moveToRow,
        st.moveToCol,
        st.moveProgress,
        m
      );

      let lungeOffsetX = 0;
      let lungeOffsetY = 0;
      if (st.lungeTimerMs > 0) {
        st.lungeTimerMs = Math.max(0, st.lungeTimerMs - dtMs);
        const progress = 1 - st.lungeTimerMs / st.lungeDurationMs;
        const lungeFactor = Math.sin(progress * Math.PI);
        const maxLungePx = m.hexRadius * 0.52;
        lungeOffsetX = st.lungeDirX * maxLungePx * lungeFactor;
        lungeOffsetY = st.lungeDirY * maxLungePx * lungeFactor;
      }

      if (st.hitFlashTimerMs > 0) {
        st.hitFlashTimerMs = Math.max(0, st.hitFlashTimerMs - dtMs);
      }
      st.knockbackOffsetX *= Math.pow(0.75, dtMs / 16);
      st.knockbackOffsetY *= Math.pow(0.75, dtMs / 16);

      let squashX = 1.0;
      let squashY = 1.0;
      if (st.squashTimerMs > 0) {
        st.squashTimerMs = Math.max(0, st.squashTimerMs - dtMs);
        const sqPhase = (st.squashTimerMs / 150) * Math.PI;
        squashX = 1 + Math.sin(sqPhase) * 0.22;
        squashY = 1 - Math.sin(sqPhase) * 0.18;
      }

      renderList.push({
        cu,
        trailHp: st.trailHp,
        screenX: basePos.x + lungeOffsetX + st.knockbackOffsetX,
        screenY:
          basePos.y + lungeOffsetY + st.knockbackOffsetY + strideArcOffsetY,
        facingX: st.facingX,
        hitFlash: st.hitFlashTimerMs > 0,
        squashX,
        squashY,
      });
    }

    // 6. Y-Sorting (원근 깊이 정렬): units.sort((a, b) => a.screenY - b.screenY)
    renderList.sort((a, b) => a.screenY - b.screenY);

    for (const item of renderList) {
      const { cu, trailHp, screenX, screenY, facingX, hitFlash, squashX, squashY } =
        item;
      this.drawUnitCompleteOnCanvas(ctx, {
        unitId: cu.unitId,
        name: cu.name,
        cost: cu.cost,
        starLevel: cu.starLevel,
        currentHp: cu.currentHp,
        trailHp,
        maxHp: cu.maxHp,
        shield: cu.shield,
        currentMana: cu.currentMana,
        maxMana: cu.maxMana,
        items: cu.items,
        team: cu.team,
        tileCenterX: screenX,
        tileCenterY: screenY,
        facingX,
        hitFlash,
        squashRatioX: squashX,
        squashRatioY: squashY,
        isStunned: cu.stunTimerMs > 0,
        isReviving: cu.isReviving,
        isSelectedOrDragged: cu.instanceId === selectedInstanceId,
        compactBenchMode: false,
      });
    }
  }

  // ==========================================================================
  // 상용 모바일 게임풍(TFT 모바일 / 킹갓캐슬 스타일) 입체 글로시 체력바(HP) & 마나바(MP)
  // ==========================================================================

  private drawUnitCompleteOnCanvas(
    ctx: CanvasRenderingContext2D,
    u: {
      unitId: string;
      name: string;
      cost: CostTier;
      starLevel: StarLevel;
      currentHp: number;
      trailHp?: number;
      maxHp: number;
      shield: number;
      currentMana: number;
      maxMana: number;
      items: ItemId[];
      team: 'HOME' | 'AWAY';
      tileCenterX: number;
      tileCenterY: number;
      facingX: 1 | -1;
      hitFlash: boolean;
      squashRatioX: number;
      squashRatioY: number;
      isStunned: boolean;
      isReviving: boolean;
      isSelectedOrDragged: boolean;
      compactBenchMode: boolean;
      benchSlotWidth?: number;
    }
  ): void {
    const m = this.hexMetrics;

    // 6. 캐릭터 스케일: 기본 1성 캐릭터의 렌더링 크기를 hexWidth * 0.9 (2성은 1.15배, 3성은 1.4배)
    const starScale =
      u.starLevel === 3 ? 1.4 : u.starLevel === 2 ? 1.15 : 1.0;
    const base1StarSize = u.compactBenchMode
      ? (u.benchSlotWidth ?? 36) * 0.86
      : m.hexWidth * 0.9;

    const spriteDrawW = Math.round(base1StarSize * starScale * u.squashRatioX);
    const spriteDrawH = Math.round(base1StarSize * starScale * u.squashRatioY);

    // 발밑 기준점(Feet Anchor): 캐릭터 스프라이트의 발바닥 끝(Bottom-Center)
    const feetAnchorX = Math.round(u.tileCenterX);
    const feetAnchorY = Math.round(
      u.tileCenterY + (u.compactBenchMode ? 10 : m.hexRadius * 0.15)
    );
    const bobbingOffset = Math.floor(
      Math.sin(this.globalAnimClockMs / 180 + u.tileCenterX) * 1.2
    );

    const spriteTopY = feetAnchorY + bobbingOffset - spriteDrawH;

    ctx.save();

    // 1) 3성 기물 전용: 발밑 육각형 타일에 회전하는 도트 황금 마법진과 상승하는 빛 입자 상시 출력
    if (u.starLevel === 3 && !u.compactBenchMode) {
      this.drawThreeStarMagicCircle(
        ctx,
        feetAnchorX,
        feetAnchorY,
        m.hexRadius * 0.76
      );
    }

    // 2) 발바닥 기준점(feetAnchorX, feetAnchorY)에 타원형 반투명 그림자(Drop Shadow)
    const shadowRx = Math.max(10, spriteDrawW * 0.34);
    const shadowRy = Math.max(4, shadowRx * 0.38);
    ctx.beginPath();
    ctx.ellipse(feetAnchorX, feetAnchorY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
    ctx.fill();

    // 3) 선택된 기물 발밑 하이라이트 링
    if (u.isSelectedOrDragged) {
      ctx.strokeStyle = '#ffea00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        feetAnchorX,
        feetAnchorY,
        shadowRx * 1.25,
        shadowRy * 1.25,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    // 4) 도트 캐릭터 스프라이트 렌더링 (Bottom-Center Anchor = feetAnchorX, feetAnchorY + bobbingOffset)
    const animFrame: 0 | 1 =
      Math.floor(this.globalAnimClockMs / 260) % 2 === 0 ? 0 : 1;
    const spriteCanvas = this.getOrCreateUnitPixelSprite(
      u.unitId,
      u.starLevel,
      animFrame,
      u.hitFlash
    );

    ctx.save();
    ctx.translate(feetAnchorX, feetAnchorY + bobbingOffset);
    if (u.facingX === -1) {
      ctx.scale(-1, 1);
    }
    if (u.isReviving) {
      ctx.globalAlpha = 0.45;
    }
    ctx.drawImage(
      spriteCanvas,
      Math.round(-spriteDrawW * 0.5),
      -spriteDrawH,
      spriteDrawW,
      spriteDrawH
    );
    ctx.restore();

    // 5) 기절(Stun) 중일 때 표시
    if (u.isStunned) {
      ctx.fillStyle = '#ffea00';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('💫', feetAnchorX, spriteTopY - 25);
    }

    // ========================================================================
    // 6) 상용 모바일 게임풍 입체 체력바(HP) & 마나바(MP) 일체형 프레임 렌더링
    // ========================================================================
    const barWidth = u.compactBenchMode
      ? Math.max(26, Math.round((u.benchSlotWidth ?? 36) * 0.78))
      : Math.max(36, Math.round(m.hexWidth * 0.8));
    const hpBarHeight = u.compactBenchMode ? 5 : 8;
    const manaBarHeight = u.compactBenchMode ? 2.5 : 3.5;
    const barX = Math.round(feetAnchorX - barWidth * 0.5);
    const barY = Math.round(spriteTopY - 12);
    const totalFrameH = hpBarHeight + manaBarHeight + 1;

    // 6-1) 다크 메탈릭 베젤 & 캡슐 프레임 + 하단 드롭 섀도우(Drop Shadow)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    this.fillBeveledRect(
      ctx,
      barX - 2,
      barY,
      barWidth + 4,
      totalFrameH + 3,
      2
    );

    ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
    this.fillBeveledRect(
      ctx,
      barX - 2,
      barY - 1,
      barWidth + 4,
      totalFrameH + 2,
      2
    );
    ctx.strokeStyle = '#04070d';
    ctx.lineWidth = 1;
    this.strokeBeveledRect(
      ctx,
      barX - 2,
      barY - 1,
      barWidth + 4,
      totalFrameH + 2,
      2
    );

    // 체력바 내부 어두운 트랙 배경
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(barX, barY, barWidth, hpBarHeight);

    const safeMaxHp = Math.max(1, u.maxHp);
    const hpRatio = Math.max(0, Math.min(1, u.currentHp / safeMaxHp));
    const hpFillW = Math.round(barWidth * hpRatio);

    // 6-2) 피격 잔상 트레일(White/Yellow Damage Trail) 애니메이션 (~250ms)
    const effectiveTrailHp = Math.max(
      u.currentHp,
      u.trailHp !== undefined ? u.trailHp : u.currentHp
    );
    const trailRatio = Math.max(0, Math.min(1, effectiveTrailHp / safeMaxHp));
    const trailFillW = Math.round(barWidth * trailRatio);

    if (trailFillW > hpFillW) {
      const trailGrad = ctx.createLinearGradient(
        barX,
        barY,
        barX,
        barY + hpBarHeight
      );
      trailGrad.addColorStop(0, '#ffffff');
      trailGrad.addColorStop(0.45, '#fef08a');
      trailGrad.addColorStop(1, '#f59e0b');
      ctx.fillStyle = trailGrad;
      ctx.fillRect(
        barX + hpFillW,
        barY,
        trailFillW - hpFillW,
        hpBarHeight
      );
    }

    // 6-3) 아군(에메랄드 그린) vs 적군(크림슨 레드) 수직 그라데이션 체력 게이지
    if (hpFillW > 0) {
      const hpGrad = ctx.createLinearGradient(
        barX,
        barY,
        barX,
        barY + hpBarHeight
      );
      if (u.team === 'HOME') {
        hpGrad.addColorStop(0, '#22c55e');
        hpGrad.addColorStop(1, '#15803d');
      } else {
        hpGrad.addColorStop(0, '#ef4444');
        hpGrad.addColorStop(1, '#991b1b');
      }
      ctx.fillStyle = hpGrad;
      ctx.fillRect(barX, barY, hpFillW, hpBarHeight);
    }

    // 보호막(Shield > 0) 보유 시: 체력바 우측 끝에 은빛/하늘색 쉴드 게이지 결합 렌더링
    if (u.shield > 0) {
      const shieldW = Math.max(
        3,
        Math.min(barWidth, Math.round((u.shield / safeMaxHp) * barWidth))
      );
      const shieldStartX =
        hpFillW + shieldW <= barWidth
          ? barX + hpFillW
          : barX + barWidth - shieldW;
      const shieldGrad = ctx.createLinearGradient(
        shieldStartX,
        barY,
        shieldStartX,
        barY + hpBarHeight
      );
      shieldGrad.addColorStop(0, '#f8fafc');
      shieldGrad.addColorStop(0.5, '#bae6fd');
      shieldGrad.addColorStop(1, '#38bdf8');
      ctx.fillStyle = shieldGrad;
      ctx.fillRect(shieldStartX, barY, shieldW, hpBarHeight);

      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(shieldStartX, barY, shieldW, hpBarHeight);
    }

    // 체력바 상단 1.5px 반투명 화이트 하이라이트 라인 (유리관/캡슐 입체 볼륨감)
    if (hpFillW > 0 || u.shield > 0) {
      const glossW = Math.min(
        barWidth,
        hpFillW +
          (u.shield > 0 ? Math.round((u.shield / safeMaxHp) * barWidth) : 0)
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.fillRect(barX, barY, glossW, 1.5);
    }

    // 6-4) 체력 수치별 동적 눈금(Dynamic HP Tick Marks: 250 HP 얇은 눈금 & 1,000 HP 굵은 눈금)
    if (!u.compactBenchMode && safeMaxHp > 250) {
      const maxTicks = Math.min(36, Math.floor((safeMaxHp - 1) / 250));
      for (let t = 1; t <= maxTicks; t++) {
        const tickHp = t * 250;
        const tickX = barX + Math.round((tickHp / safeMaxHp) * barWidth);
        const isThousandTick = tickHp % 1000 === 0;
        if (isThousandTick) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
          ctx.fillRect(tickX - 0.5, barY, 1.5, hpBarHeight);
        } else {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.fillRect(
            tickX,
            barY,
            1,
            Math.max(3, Math.round(hpBarHeight * 0.65))
          );
        }
      }
    }

    // 6-5) 마나바 (MP Bar): 체력바 바로 아래에 밀착 결합, 아케인 블루/시안 그라데이션 & 90% 이상 시 화이트 펄스 발광
    const manaY = barY + hpBarHeight + 1;
    const manaRatio =
      u.maxMana > 0
        ? Math.max(0, Math.min(1, u.currentMana / u.maxMana))
        : 0;
    const manaFillW = Math.round(barWidth * manaRatio);

    ctx.fillStyle = '#09101d';
    ctx.fillRect(barX, manaY, barWidth, manaBarHeight);

    if (manaFillW > 0) {
      const isAlmostFullMana = manaRatio >= 0.9;
      const manaGrad = ctx.createLinearGradient(
        barX,
        manaY,
        barX,
        manaY + manaBarHeight
      );
      if (isAlmostFullMana) {
        const pulse =
          0.5 + 0.5 * Math.sin(this.globalAnimClockMs * 0.018);
        manaGrad.addColorStop(0, '#ffffff');
        manaGrad.addColorStop(0.5, pulse > 0.5 ? '#bae6fd' : '#38bdf8');
        manaGrad.addColorStop(1, '#0284c7');
      } else {
        manaGrad.addColorStop(0, '#38bdf8');
        manaGrad.addColorStop(1, '#0284c7');
      }
      ctx.fillStyle = manaGrad;
      ctx.fillRect(barX, manaY, manaFillW, manaBarHeight);

      // 마나바 상단 1px 하이라이트 및 90% 이상 발광 테두리
      ctx.fillStyle = isAlmostFullMana
        ? 'rgba(255, 255, 255, 0.85)'
        : 'rgba(255, 255, 255, 0.32)';
      ctx.fillRect(barX, manaY, manaFillW, 1);

      if (isAlmostFullMana && !u.compactBenchMode) {
        ctx.strokeStyle = 'rgba(224, 242, 254, 0.88)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX - 0.5, manaY - 0.5, barWidth + 1, manaBarHeight + 1);
      }
    }

    // 6-6) 성급 엠블럼 통합 (체력바 좌측 끝에 코스트 색상이 반영된 다이아몬드/방패형 성급 배지)
    const starsStr = '★'.repeat(u.starLevel);
    const costColor = COST_BORDER_COLORS[u.cost];
    const badgeH = totalFrameH + 2;
    const badgeW = u.starLevel === 3 ? 21 : u.starLevel === 2 ? 15 : 11;
    const badgeX = barX - badgeW - 2;
    const badgeY = barY - 1;

    if (u.starLevel === 3) {
      // 3성 황금 광채 후광
      ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
      this.fillBeveledRect(
        ctx,
        badgeX - 1.5,
        badgeY - 1.5,
        badgeW + 3,
        badgeH + 3,
        3
      );
    }

    ctx.fillStyle = 'rgba(10, 14, 23, 0.94)';
    this.fillBeveledRect(ctx, badgeX, badgeY, badgeW, badgeH, 2.5);
    ctx.strokeStyle = u.starLevel === 3 ? '#facc15' : costColor;
    ctx.lineWidth = u.starLevel === 3 ? 1.5 : 1.1;
    this.strokeBeveledRect(ctx, badgeX, badgeY, badgeW, badgeH, 2.5);

    ctx.font = `900 ${u.starLevel === 3 ? 8 : 7.5}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle =
      u.starLevel === 3
        ? '#fde047'
        : u.starLevel === 2
        ? '#f8fafc'
        : '#cbd5e1';
    ctx.fillText(
      starsStr,
      badgeX + badgeW * 0.5,
      badgeY + Math.round(badgeH * 0.74)
    );

    // 6-7) 장착 아이템 미니 슬롯 통합 (체력바 바로 위에 최대 3개 11x11px 테두리 미니 아이콘 정렬)
    if (u.items.length > 0) {
      const equipped = u.items.slice(0, 3);
      const slotSize = u.compactBenchMode ? 9 : 11;
      const slotGap = 2;
      const totalItemsW =
        equipped.length * slotSize + (equipped.length - 1) * slotGap;
      const startItemX = Math.round(feetAnchorX - totalItemsW * 0.5);
      const itemY = barY - slotSize - 3;

      equipped.forEach((itemId, idx) => {
        const def = ITEM_DEFINITIONS[itemId];
        if (!def) return;
        const ix = startItemX + idx * (slotSize + slotGap);

        ctx.fillStyle = 'rgba(10, 14, 23, 0.92)';
        ctx.fillRect(ix, itemY, slotSize, slotSize);

        ctx.strokeStyle = def.isCompleted ? '#facc15' : '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(ix, itemY, slotSize, slotSize);

        ctx.font = `${slotSize - 2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
          def.icon,
          ix + slotSize * 0.5,
          itemY + slotSize - 1.5
        );
      });
    }

    // 7) 예외 처리: 플레이어가 해당 기물을 터치(Tap)하여 선택했거나 드래그 중일 때만 기물 말풍선으로 이름 표시
    if (u.isSelectedOrDragged) {
      this.drawSelectedUnitNameBubble(
        ctx,
        feetAnchorX,
        barY - (u.items.length > 0 ? 18 : 6),
        `${u.name} ${starsStr}`,
        costColor
      );
    }

    ctx.restore();
  }

  /**
   * 터치(Tap)로 선택되었거나 드래그 중인 기물에만 표시되는 깔끔한 말풍선 이름표
   */
  private drawSelectedUnitNameBubble(
    ctx: CanvasRenderingContext2D,
    cx: number,
    bottomY: number,
    label: string,
    borderColor: string
  ): void {
    ctx.save();
    ctx.font = '900 10px sans-serif';
    const paddingX = 6;
    const textW = ctx.measureText(label).width;
    const boxW = Math.round(textW + paddingX * 2);
    const boxH = 16;
    const boxX = Math.round(cx - boxW * 0.5);
    const boxY = Math.round(bottomY - boxH);

    ctx.fillStyle = 'rgba(9, 13, 26, 0.94)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, boxY + 12);
    ctx.restore();
  }

  private drawThreeStarMagicCircle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number
  ): void {
    const angle = (this.globalAnimClockMs / 900) % (Math.PI * 2);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.55);
    ctx.rotate(angle);

    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * 120 + k * 60) * (Math.PI / 180);
        const px = Math.cos(a) * radius * 0.92;
        const py = Math.sin(a) * radius * 0.92;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = k === 0 ? '#ffd700' : '#ffffff';
      ctx.stroke();
    }
    ctx.restore();

    for (let i = 0; i < 4; i++) {
      const phase = ((this.globalAnimClockMs * 0.04 + i * 25) % 100) / 100;
      const px =
        cx +
        Math.cos(i * 1.7 + this.globalAnimClockMs * 0.003) * (radius * 0.65);
      const py = cy - phase * 28;
      ctx.fillStyle = i % 2 === 0 ? '#ffea00' : '#ffffff';
      ctx.fillRect(Math.round(px), Math.round(py), 3, 3);
    }
  }

  // ==========================================================================
  // 60종 챔피언 & 7종 크립 몬스터/동물 고유 28x28 도트 스프라이트 생성기
  // ==========================================================================

  public getOrCreateUnitPixelSprite(
    unitId: string,
    starLevel: StarLevel,
    frame: 0 | 1,
    whiteHitFlash: boolean
  ): HTMLCanvasElement {
    const key = `${unitId}_s${starLevel}_f${frame}_${whiteHitFlash ? 'FLASH' : 'NORM'}`;
    const cached = this.spriteCache.get(key);
    if (cached) return cached;

    if (isCreepMonsterUnitId(unitId)) {
      const creepCanvas = this.createCreepMonsterPixelSprite(
        unitId,
        starLevel,
        frame,
        whiteHitFlash
      );
      this.spriteCache.set(key, creepCanvas);
      return creepCanvas;
    }

    const size = 28;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const g = off.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    const spec = UNIT_PIXEL_SPECS[unitId] ?? UNIT_PIXEL_SPECS.u1_garen;

    const pixels: (string | null)[][] = Array.from({ length: size }, () =>
      Array<string | null>(size).fill(null)
    );

    const setPx = (x: number, y: number, color: string) => {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix >= 0 && ix < size && iy >= 0 && iy < size) {
        pixels[iy][ix] = color;
      }
    };

    const fillRectPx = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: string
    ) => {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          setPx(px, py, color);
        }
      }
    };

    const dy = frame === 1 ? -1 : 0;

    if (
      spec.wings === 'ANGEL_WINGS' ||
      spec.wings === 'DRAGON_WINGS' ||
      spec.wings === 'DEMON_WINGS'
    ) {
      const wingColor =
        spec.wings === 'ANGEL_WINGS'
          ? '#ffffff'
          : spec.wings === 'DRAGON_WINGS'
          ? spec.secondaryArmor
          : '#5a189a';
      const wingTip = spec.trimGold;
      for (let wy = 7; wy <= 18; wy++) {
        const span = wy < 12 ? 9 - (wy - 7) : 5;
        for (let wx = 2; wx < 2 + span; wx++) {
          setPx(wx, wy + dy, wx === 2 ? wingTip : wingColor);
          setPx(size - 1 - wx, wy + dy, wx === 2 ? wingTip : wingColor);
        }
      }
    } else if (spec.wings === 'CAPE') {
      fillRectPx(8, 12 + dy, 11, 10, spec.secondaryArmor);
    }

    const legOffset = frame === 1 ? 1 : 0;
    fillRectPx(10, 21, 3, 4 - legOffset, spec.primaryArmor);
    fillRectPx(15, 21, 3, 4, spec.primaryArmor);
    fillRectPx(10, 24 - legOffset, 3, 2, spec.trimGold);
    fillRectPx(15, 24, 3, 2, spec.trimGold);

    fillRectPx(9, 13 + dy, 10, 8, spec.primaryArmor);
    fillRectPx(11, 14 + dy, 6, 6, spec.secondaryArmor);
    fillRectPx(9, 19 + dy, 10, 2, spec.trimGold);
    fillRectPx(13, 14 + dy, 2, 5, spec.trimGold);
    fillRectPx(7, 13 + dy, 3, 4, spec.secondaryArmor);
    fillRectPx(18, 13 + dy, 3, 4, spec.secondaryArmor);
    setPx(7, 13 + dy, spec.trimGold);
    setPx(20, 13 + dy, spec.trimGold);

    fillRectPx(10, 7 + dy, 8, 6, spec.skinOrFace);
    setPx(12, 10 + dy, spec.eyeGlow);
    setPx(16, 10 + dy, spec.eyeGlow);

    if (spec.headgear === 'KNIGHT_HELM' || spec.headgear === 'HALO_HELM') {
      fillRectPx(9, 5 + dy, 10, 4, spec.primaryArmor);
      fillRectPx(10, 8 + dy, 8, 2, spec.trimGold);
      fillRectPx(13, 3 + dy, 2, 3, spec.trimGold);
      if (spec.headgear === 'HALO_HELM') {
        fillRectPx(10, 2 + dy, 8, 1, '#ffea00');
      }
    } else if (spec.headgear === 'CROWN') {
      fillRectPx(9, 4 + dy, 10, 3, '#ffd700');
      setPx(9, 3 + dy, '#ffea00');
      setPx(13, 2 + dy, '#ff0055');
      setPx(14, 2 + dy, '#ff0055');
      setPx(18, 3 + dy, '#ffea00');
      fillRectPx(7, 8 + dy, 3, 2, spec.skinOrFace);
      fillRectPx(18, 8 + dy, 3, 2, spec.skinOrFace);
    } else if (spec.headgear === 'GOBLIN_EARS') {
      fillRectPx(6, 8 + dy, 4, 2, spec.skinOrFace);
      fillRectPx(18, 8 + dy, 4, 2, spec.skinOrFace);
      fillRectPx(10, 6 + dy, 8, 2, spec.secondaryArmor);
    } else if (spec.headgear === 'WIZARD_HAT') {
      fillRectPx(7, 7 + dy, 14, 2, spec.primaryArmor);
      fillRectPx(10, 4 + dy, 8, 3, spec.primaryArmor);
      fillRectPx(12, 2 + dy, 5, 2, spec.secondaryArmor);
      fillRectPx(10, 6 + dy, 8, 1, spec.trimGold);
    } else if (
      spec.headgear === 'DEMON_HORNS' ||
      spec.headgear === 'DRAGON_HORNS'
    ) {
      fillRectPx(10, 6 + dy, 8, 2, spec.primaryArmor);
      fillRectPx(8, 3 + dy, 2, 4, spec.trimGold);
      fillRectPx(18, 3 + dy, 2, 4, spec.trimGold);
      setPx(7, 2 + dy, spec.weaponGlow);
      setPx(20, 2 + dy, spec.weaponGlow);
    } else if (spec.headgear === 'ELVEN_CIRCLET') {
      fillRectPx(9, 6 + dy, 10, 2, spec.trimGold);
      setPx(14, 5 + dy, spec.eyeGlow);
      fillRectPx(8, 8 + dy, 2, 5, spec.secondaryArmor);
    } else if (spec.headgear === 'HOOD') {
      fillRectPx(9, 5 + dy, 10, 5, spec.primaryArmor);
      fillRectPx(11, 8 + dy, 6, 3, '#111111');
      setPx(12, 9 + dy, spec.eyeGlow);
      setPx(15, 9 + dy, spec.eyeGlow);
    } else if (spec.headgear === 'SKULL') {
      fillRectPx(10, 6 + dy, 8, 6, '#e2e8f0');
      setPx(12, 9 + dy, spec.eyeGlow);
      setPx(15, 9 + dy, spec.eyeGlow);
      setPx(11, 12 + dy, '#475569');
      setPx(13, 12 + dy, '#475569');
      setPx(15, 12 + dy, '#475569');
    } else if (spec.headgear === 'GOLEM_CORE') {
      fillRectPx(9, 6 + dy, 10, 7, spec.primaryArmor);
      fillRectPx(12, 8 + dy, 4, 3, spec.eyeGlow);
    }

    if (spec.weapon === 'SWORD_SHIELD') {
      fillRectPx(4, 13 + dy, 4, 7, spec.secondaryArmor);
      fillRectPx(5, 14 + dy, 2, 5, spec.trimGold);
      fillRectPx(21, 7 + dy, 2, 11, spec.weaponColor);
      fillRectPx(19, 15 + dy, 6, 2, spec.trimGold);
    } else if (spec.weapon === 'GREATSWORD' || spec.weapon === 'HOLY_BLADE') {
      fillRectPx(21, 4 + dy, 3, 14, spec.weaponColor);
      fillRectPx(22, 5 + dy, 1, 12, spec.weaponGlow);
      fillRectPx(19, 16 + dy, 7, 2, spec.trimGold);
    } else if (spec.weapon === 'DUAL_DAGGERS') {
      fillRectPx(4, 14 + dy, 2, 6, spec.weaponColor);
      fillRectPx(21, 12 + dy, 2, 7, spec.weaponColor);
      setPx(4, 14 + dy, spec.weaponGlow);
      setPx(22, 12 + dy, spec.weaponGlow);
    } else if (spec.weapon === 'BOW') {
      for (let by = 8; by <= 19; by++) {
        const bx = by === 8 || by === 19 ? 20 : by < 11 || by > 16 ? 22 : 23;
        setPx(bx, by + dy, spec.weaponColor);
      }
      fillRectPx(20, 9 + dy, 1, 10, '#e2e8f0');
      fillRectPx(19, 13 + dy, 6, 1, spec.weaponGlow);
    } else if (
      spec.weapon === 'ARCANE_STAFF' ||
      spec.weapon === 'NATURE_STAFF' ||
      spec.weapon === 'ARCHMAGE_ORB'
    ) {
      fillRectPx(21, 7 + dy, 2, 16, spec.weaponColor);
      fillRectPx(20, 5 + dy, 4, 4, spec.weaponGlow);
      setPx(21, 6 + dy, '#ffffff');
    } else if (spec.weapon === 'SCYTHE') {
      fillRectPx(21, 5 + dy, 2, 18, spec.weaponColor);
      fillRectPx(15, 5 + dy, 8, 2, spec.weaponGlow);
      fillRectPx(14, 7 + dy, 3, 2, spec.weaponGlow);
    } else if (spec.weapon === 'SPEAR') {
      fillRectPx(21, 3 + dy, 2, 20, spec.weaponColor);
      fillRectPx(20, 2 + dy, 4, 3, spec.weaponGlow);
    } else if (spec.weapon === 'CANNON_BAG') {
      fillRectPx(4, 11 + dy, 5, 9, '#ffd700');
      fillRectPx(20, 12 + dy, 5, 5, '#334155');
      setPx(24, 11 + dy, '#ffea00');
    } else if (spec.weapon === 'DRAGON_CLAW') {
      fillRectPx(20, 11 + dy, 5, 5, spec.weaponGlow);
      setPx(25, 10 + dy, '#ffea00');
      setPx(25, 13 + dy, '#ffea00');
      setPx(25, 16 + dy, '#ffea00');
    }

    const outlineColor =
      starLevel === 3
        ? '#ffd700'
        : starLevel === 2
        ? '#e2e8f0'
        : '#05070d';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (pixels[y][x] !== null) continue;
        const hasNeighbor =
          (y > 0 && pixels[y - 1][x] !== null) ||
          (y < size - 1 && pixels[y + 1][x] !== null) ||
          (x > 0 && pixels[y][x - 1] !== null) ||
          (x < size - 1 && pixels[y][x + 1] !== null);
        if (hasNeighbor) {
          g.fillStyle = outlineColor;
          g.fillRect(x, y, 1, 1);
        }
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const col = pixels[y][x];
        if (!col) continue;
        g.fillStyle = whiteHitFlash ? '#ffffff' : col;
        g.fillRect(x, y, 1, 1);
      }
    }

    this.spriteCache.set(key, off);
    return off;
  }

  /**
   * 크립 라운드 전용 7종 야생 몬스터/동물(미니언 포식자, 독성 포자 정령, 바위 돌거북 골렘, 야생 늑대, 칼날부리 괴조, 고대 드래곤, 공허 대괴수)
   * 전용 28x28 도트 스프라이트를 생성한다 (인간형 챔피언과 100% 차별화된 비인간형 실루엣).
   */
  private createCreepMonsterPixelSprite(
    unitId: string,
    starLevel: StarLevel,
    frame: 0 | 1,
    whiteHitFlash: boolean
  ): HTMLCanvasElement {
    const size = 28;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const g = off.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    const tmpl = getCreepMonsterTemplate(unitId);
    const arch = tmpl?.archetype ?? 'MINION_SCAVENGER';
    const c1 = tmpl?.primaryBodyColor ?? '#6d28d9';
    const c2 = tmpl?.secondaryBodyColor ?? '#a78bfa';
    const acc = tmpl?.accentColor ?? '#fde047';
    const eye = tmpl?.eyeColor ?? '#ffea00';

    const pixels: (string | null)[][] = Array.from({ length: size }, () =>
      Array<string | null>(size).fill(null)
    );
    const setPx = (x: number, y: number, color: string) => {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix >= 0 && ix < size && iy >= 0 && iy < size) {
        pixels[iy][ix] = color;
      }
    };
    const fillRectPx = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: string
    ) => {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          setPx(px, py, color);
        }
      }
    };

    const dy = frame === 1 ? -1 : 0;

    if (arch === 'MINION_SCAVENGER') {
      // 귀여우면서도 장난스러운 꼬마 미니언 포식자 (작은 망토 + 커다란 외눈/쌍눈 + 나무 몽둥이)
      fillRectPx(9, 13 + dy, 10, 9, c1);
      fillRectPx(10, 10 + dy, 8, 5, '#1e1b4b');
      fillRectPx(8, 8 + dy, 12, 3, c2);
      setPx(12, 12 + dy, eye);
      setPx(15, 12 + dy, eye);
      fillRectPx(10, 22, 3, 3 - (frame === 1 ? 1 : 0), c2);
      fillRectPx(15, 22, 3, 3, c2);
      // 작은 나무 단검
      fillRectPx(20, 14 + dy, 3, 5, acc);
    } else if (arch === 'TOXIC_SPRITE') {
      // 버섯 갓을 쓴 숲의 포자 슬라임 정령
      fillRectPx(6, 7 + dy, 16, 5, c1);
      fillRectPx(8, 5 + dy, 12, 3, c1);
      // 버섯 반점
      fillRectPx(8, 8 + dy, 3, 2, acc);
      fillRectPx(16, 7 + dy, 3, 2, acc);
      fillRectPx(12, 6 + dy, 2, 2, '#ffffff');
      // 말랑한 몸통
      fillRectPx(9, 12 + dy, 10, 10, c2);
      fillRectPx(8, 19 + dy, 12, 4, c2);
      setPx(11, 15 + dy, '#052e16');
      setPx(16, 15 + dy, '#052e16');
      setPx(11, 14 + dy, eye);
      setPx(16, 14 + dy, eye);
    } else if (arch === 'STONE_GOLEM') {
      // 육중한 바위산 돌거북 골렘 (넓은 어깨와 이끼 낀 암석 동체)
      fillRectPx(5, 9 + dy, 18, 12, c1);
      fillRectPx(7, 6 + dy, 14, 5, c2);
      fillRectPx(8, 7 + dy, 6, 2, acc); // 초록 이끼 패치
      fillRectPx(15, 11 + dy, 5, 3, acc);
      // 빛나는 고대 코어 눈
      fillRectPx(10, 11 + dy, 3, 2, eye);
      fillRectPx(15, 11 + dy, 3, 2, eye);
      // 굵은 바위 팔다리
      fillRectPx(3, 12 + dy, 3, 9, c2);
      fillRectPx(22, 12 + dy, 3, 9, c2);
      fillRectPx(7, 21, 5, 4 - (frame === 1 ? 1 : 0), c1);
      fillRectPx(16, 21, 5, 4, c1);
    } else if (arch === 'WILD_WOLF') {
      // 네 발로 달리는 날렵한 4족보행 야생 늑대 (뾰족한 귀, 긴 주둥이, 복슬한 꼬리)
      fillRectPx(7, 13 + dy, 13, 7, c1);
      fillRectPx(9, 14 + dy, 9, 4, c2);
      // 늑대 머리와 주둥이 (우측 지향)
      fillRectPx(16, 9 + dy, 7, 6, c1);
      fillRectPx(21, 11 + dy, 4, 3, c2);
      // 뾰족한 두 귀
      fillRectPx(16, 6 + dy, 2, 3, c1);
      fillRectPx(19, 6 + dy, 2, 3, c1);
      // 붉은 야수 안광 & 흰 송곳니
      setPx(20, 10 + dy, eye);
      setPx(22, 14 + dy, '#ffffff');
      setPx(24, 14 + dy, '#ffffff');
      // 더부룩한 꼬리
      fillRectPx(3, 10 + dy, 4, 4, c2);
      // 4족 다리
      const step = frame === 1 ? 1 : 0;
      fillRectPx(8, 20, 2, 5 - step, c1);
      fillRectPx(11, 20, 2, 5, c2);
      fillRectPx(16, 20, 2, 5, c1);
      fillRectPx(19, 20, 2, 5 - step, c2);
    } else if (arch === 'RAZOR_BEAK') {
      // 붉은 벼슬과 날카로운 부리를 가진 칼날부리 괴조 (날개 퍼덕임)
      fillRectPx(9, 12 + dy, 10, 9, c1);
      // 붉은/황금 깃털 날개
      fillRectPx(4, 10 + (frame === 1 ? -2 : 1), 6, 7, c2);
      fillRectPx(18, 11 + dy, 5, 6, c2);
      // 머리와 벼슬
      fillRectPx(13, 7 + dy, 6, 6, c1);
      fillRectPx(14, 4 + dy, 4, 3, acc);
      // 거대한 황금 칼날 부리
      fillRectPx(19, 9 + dy, 6, 3, acc);
      setPx(24, 10 + dy, '#ffffff');
      setPx(17, 8 + dy, eye);
      // 새 발톱 다리
      fillRectPx(11, 21, 2, 4, acc);
      fillRectPx(15, 21, 2, 4 - (frame === 1 ? 1 : 0), acc);
    } else if (arch === 'ANCIENT_DRAGON') {
      // 거대한 날개와 뿔, 화염 아우라를 두른 고대 드래곤 보스
      for (let wy = 5; wy <= 18; wy++) {
        fillRectPx(2, wy + dy, 6, 1, c2);
        fillRectPx(20, wy + dy, 6, 1, c2);
      }
      fillRectPx(8, 11 + dy, 12, 11, c1);
      fillRectPx(10, 13 + dy, 8, 8, acc);
      fillRectPx(9, 5 + dy, 10, 6, c1);
      // 드래곤 뿔
      fillRectPx(7, 2 + dy, 2, 4, acc);
      fillRectPx(19, 2 + dy, 2, 4, acc);
      setPx(12, 8 + dy, eye);
      setPx(16, 8 + dy, eye);
      // 입가의 화염 불꽃
      fillRectPx(20, 9 + dy, 4, 3, '#ffea00');
      fillRectPx(9, 22, 4, 4, c1);
      fillRectPx(15, 22, 4, 4, c1);
    } else {
      // VOID_BEHEMOTH: 공허의 촉수와 여러 개의 눈을 지닌 심연 대괴수
      fillRectPx(5, 7 + dy, 18, 14, c1);
      fillRectPx(7, 9 + dy, 14, 10, c2);
      // 3개의 공허 안광
      fillRectPx(9, 11 + dy, 2, 2, eye);
      fillRectPx(13, 9 + dy, 2, 3, acc);
      fillRectPx(17, 11 + dy, 2, 2, eye);
      // 어깨 가시 & 촉수 다리
      fillRectPx(3, 5 + dy, 3, 5, acc);
      fillRectPx(22, 5 + dy, 3, 5, acc);
      fillRectPx(6, 21, 3, 5 - (frame === 1 ? 1 : 0), c1);
      fillRectPx(12, 21, 4, 5, c2);
      fillRectPx(19, 21, 3, 5 - (frame === 1 ? 1 : 0), c1);
    }

    const outlineColor = starLevel >= 2 ? '#fde047' : '#05070d';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (pixels[y][x] !== null) continue;
        const hasNeighbor =
          (y > 0 && pixels[y - 1][x] !== null) ||
          (y < size - 1 && pixels[y + 1][x] !== null) ||
          (x > 0 && pixels[y][x - 1] !== null) ||
          (x < size - 1 && pixels[y][x + 1] !== null);
        if (hasNeighbor) {
          g.fillStyle = outlineColor;
          g.fillRect(x, y, 1, 1);
        }
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const col = pixels[y][x];
        if (!col) continue;
        g.fillStyle = whiteHitFlash ? '#ffffff' : col;
        g.fillRect(x, y, 1, 1);
      }
    }

    return off;
  }

  // ==========================================================================
  // 전장 좌우 지휘관(전설이) 아바타 단상 & 전투 종료 아바타 레이저 피니시 연출
  // ==========================================================================

  private getHomeCommanderAnchor(): { x: number; y: number } {
    const m = this.hexMetrics;
    const boardSpanW = m.hexWidth * 7.65;
    const slabLeft = Math.floor(m.centerX - boardSpanW * 0.5 - 14);
    return {
      x: Math.max(82, slabLeft + 18),
      y: Math.round(m.originY + 5.8 * m.rowStepY),
    };
  }

  private getAwayCommanderAnchor(): { x: number; y: number } {
    const m = this.hexMetrics;
    const boardSpanW = m.hexWidth * 7.65;
    const slabRight = Math.ceil(m.centerX + boardSpanW * 0.5 + 14);
    return {
      x: Math.min(this.viewportWidth - 92, slabRight - 18),
      y: Math.round(m.originY + 1.2 * m.rowStepY),
    };
  }

  private drawCommanderAvatarsOnArena(
    ctx: CanvasRenderingContext2D,
    dtMs: number,
    homeParticipant: Participant,
    awayName: string,
    showAwayAvatar: boolean
  ): void {
    const homeAnchor = this.getHomeCommanderAnchor();

    // 초기화: 아바타 위치가 없으면 홈 단상에 위치
    if (!this.playerAvatarPos) {
      this.playerAvatarPos = { x: homeAnchor.x, y: homeAnchor.y };
    }

    // 목표 위치(playerAvatarTarget)가 있으면 부드럽게 걸어서 이동!
    let isWalking = false;
    if (this.playerAvatarTarget) {
      const dx = this.playerAvatarTarget.x - this.playerAvatarPos.x;
      const dy = this.playerAvatarTarget.y - this.playerAvatarPos.y;
      const dist = Math.hypot(dx, dy);
      const moveSpeed = 240; // 초당 240px 도트 달리기 속도
      const step = (moveSpeed * dtMs) / 1000;

      if (dist <= step) {
        this.playerAvatarPos.x = this.playerAvatarTarget.x;
        this.playerAvatarPos.y = this.playerAvatarTarget.y;
        this.playerAvatarTarget = null;
      } else {
        isWalking = true;
        this.playerAvatarPos.x += (dx / dist) * step;
        this.playerAvatarPos.y += (dy / dist) * step;
      }
    }

    const bob = isWalking
      ? Math.sin(this.globalAnimClockMs * 0.02) * 4
      : Math.sin(this.globalAnimClockMs * 0.005) * 2;

    // 1) 아군 지휘관 도트 아바타: '나 (전설이)' 대신 참가자 실제 닉네임 표기 & 터치 좌표로 자유 이동
    const avatarDisplayName = homeParticipant.name || '지휘관';
    this.drawSingleCommanderAvatar(
      ctx,
      this.playerAvatarPos.x,
      this.playerAvatarPos.y + bob,
      'HOME',
      avatarDisplayName.slice(0, 7),
      homeParticipant.hp
    );

    // 2) 크립전이 아니거나 대인전/피니시 레이저 시에만 적 지휘관 아바타 표시
    if (showAwayAvatar) {
      const awayPos = this.getAwayCommanderAnchor();
      this.drawSingleCommanderAvatar(
        ctx,
        awayPos.x,
        awayPos.y - bob,
        'AWAY',
        awayName.slice(0, 6),
        null
      );
    }
  }

  private drawSingleCommanderAvatar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    side: 'HOME' | 'AWAY',
    label: string,
    hp: number | null
  ): void {
    ctx.save();

    // 마법 단상 패드
    ctx.fillStyle =
      side === 'HOME' ? 'rgba(14, 116, 144, 0.55)' : 'rgba(153, 27, 27, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = side === 'HOME' ? '#38bdf8' : '#f87171';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 꼬마 전설이 몸통/망토/왕관 도트
    ctx.fillStyle = side === 'HOME' ? '#0284c7' : '#dc2626';
    this.fillBeveledRect(ctx, cx - 9, cy - 8, 18, 18, 5);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.2;
    this.strokeBeveledRect(ctx, cx - 9, cy - 8, 18, 18, 5);

    // 전설이 얼굴과 눈빛
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 6, cy - 4, 12, 7);
    ctx.fillStyle = side === 'HOME' ? '#00f5d4' : '#ffea00';
    ctx.fillRect(cx - 4, cy - 2, 3, 3);
    ctx.fillRect(cx + 1, cy - 2, 3, 3);

    // 머리 위 작은 왕관
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 5, cy - 12, 10, 4);

    // 이름표 & 체력 뱃지
    ctx.font = '900 8.5px "Jua", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(7, 10, 18, 0.86)';
    this.fillBeveledRect(ctx, cx - 24, cy + 16, 48, 12, 3);
    ctx.fillStyle = side === 'HOME' ? '#7dd3fc' : '#fca5a5';
    ctx.fillText(
      hp !== null ? `${label} ♥${hp}` : label,
      cx,
      cy + 25
    );

    ctx.restore();
  }

  /**
   * 전투 종료 순간 승리한 플레이어 아바타에서 패배한 플레이어 아바타에게
   * 거대한 마법 레이저 빔과 응축된 에너지 구체가 날아가 꽂히며 체력을 깎는 피니시 연출!
   */
  private updateAndDrawAvatarFinisherLaser(
    ctx: CanvasRenderingContext2D,
    dtMs: number
  ): void {
    const fx = this.activeLaserFX;
    if (!fx) return;

    fx.lifeMs += dtMs;
    if (fx.lifeMs >= fx.maxLifeMs) {
      this.activeLaserFX = null;
      return;
    }

    const homePos = this.getHomeCommanderAnchor();
    const awayPos = this.getAwayCommanderAnchor();

    const fromPos = fx.winnerSide === 'HOME' ? homePos : awayPos;
    const toPos = fx.winnerSide === 'HOME' ? awayPos : homePos;

    const prog = Math.min(1, fx.lifeMs / fx.maxLifeMs);
    const beamReach = Math.min(1, prog / 0.38); // 첫 0.38구간 동안 레이저가 상대 아바타까지 관통!

    const curX = fromPos.x + (toPos.x - fromPos.x) * beamReach;
    const curY = fromPos.y + (toPos.y - fromPos.y) * beamReach;

    // 명중 순간(beamReach >= 1) 강력한 카메라 흔들림 + 파편 스파크 + 피해량 팝업!
    if (beamReach >= 1 && !fx.impactTriggered) {
      fx.impactTriggered = true;
      this.triggerImpactShake(12, 360, 50);
      this.spawnPixelSparks(
        toPos.x,
        toPos.y,
        fx.winnerSide === 'HOME' ? '#38bdf8' : '#f43f5e',
        42
      );
      this.spawnPixelSparks(toPos.x, toPos.y, '#ffea00', 24);
      this.spawnArcadePopupText(
        toPos.x,
        toPos.y - 22,
        `⚡ -${fx.damage} HP!`,
        '#ff2a85',
        21
      );
    }

    const fadeAlpha = prog > 0.72 ? 1 - (prog - 0.72) / 0.28 : 1;
    const outerColor = fx.winnerSide === 'HOME' ? '#00f5d4' : '#f43f5e';
    const midColor = fx.winnerSide === 'HOME' ? '#38bdf8' : '#fb923c';

    ctx.save();
    ctx.globalAlpha = Math.max(0, fadeAlpha);

    // 1) 발사자 아바타 주변 마력 차징 링
    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(
      fromPos.x,
      fromPos.y,
      14 + Math.sin(this.globalAnimClockMs * 0.03) * 4,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    // 2) 외곽 거대 마법 레이저 줄기
    ctx.strokeStyle = outerColor;
    ctx.lineWidth = 14 * (1 - prog * 0.3);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);
    ctx.lineTo(curX, curY);
    ctx.stroke();

    // 3) 중간 고열 플라즈마 코어
    ctx.strokeStyle = midColor;
    ctx.lineWidth = 8 * (1 - prog * 0.25);
    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);
    ctx.lineTo(curX, curY);
    ctx.stroke();

    // 4) 중심부 순백색 절대 광선 코어
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(fromPos.x, fromPos.y);
    ctx.lineTo(curX, curY);
    ctx.stroke();

    // 5) 레이저 선단 에너지 구체 & 피격 폭발 링
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(curX, curY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  private updateAndDrawCombatVFX(
    ctx: CanvasRenderingContext2D,
    dtMs: number
  ): void {
    if (this.cataclysmFlashMs > 0) {
      this.cataclysmFlashMs = Math.max(0, this.cataclysmFlashMs - dtMs);
      const alpha = (this.cataclysmFlashMs / 900) * 0.75;
      ctx.save();
      ctx.fillStyle = `rgba(255, 234, 0, ${alpha * 0.35})`;
      ctx.fillRect(0, 0, this.viewportWidth, this.viewportHeight);

      ctx.strokeStyle = '#ffea00';
      ctx.lineWidth = 6;
      ctx.globalAlpha = Math.min(1, alpha * 1.4);
      for (let i = 0; i < 7; i++) {
        const lx = ((i + 0.5) / 7) * this.viewportWidth;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx + (Math.random() - 0.5) * 24, this.viewportHeight * 0.5);
        ctx.lineTo(lx, this.viewportHeight);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (let i = this.slashSmears.length - 1; i >= 0; i--) {
      const s = this.slashSmears[i];
      s.lifeMs += dtMs;
      if (s.lifeMs >= s.maxLifeMs) {
        this.slashSmears.splice(i, 1);
        continue;
      }
      const prog = s.lifeMs / s.maxLifeMs;
      const alpha = 1 - prog;

      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.rotate(s.angleRad);
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      ctx.arc(0, 0, s.radius, -Math.PI * 0.42, Math.PI * 0.42, false);
      ctx.arc(
        -s.radius * 0.22,
        0,
        s.radius * 0.85,
        Math.PI * 0.38,
        -Math.PI * 0.38,
        true
      );
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = s.coreColor;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius * 0.92, -Math.PI * 0.34, Math.PI * 0.34);
      ctx.stroke();

      ctx.restore();
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifeMs += dtMs;
      if (p.lifeMs >= p.maxLifeMs) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const t = p.lifeMs / p.maxLifeMs;
      const cx = p.x1 + (p.x2 - p.x1) * t;
      const cy = p.y1 + (p.y2 - p.y1) * t - Math.sin(t * Math.PI) * 14;

      ctx.save();
      const prevT = Math.max(0, t - 0.18);
      const tx = p.x1 + (p.x2 - p.x1) * prevT;
      const ty = p.y1 + (p.y2 - p.y1) * prevT - Math.sin(prevT * Math.PI) * 14;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(cx - 3), Math.round(cy - 3), 6, 6);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(cx - 4), Math.round(cy - 4), 8, 8);
      ctx.restore();
    }

    for (let i = this.pixelSparks.length - 1; i >= 0; i--) {
      const sp = this.pixelSparks[i];
      sp.lifeMs += dtMs;
      if (sp.lifeMs >= sp.maxLifeMs) {
        this.pixelSparks.splice(i, 1);
        continue;
      }
      const dtSec = dtMs / 1000;
      sp.vy += sp.gravity * dtSec;
      sp.x += sp.vx * dtSec;
      sp.y += sp.vy * dtSec;

      const alpha = 1 - sp.lifeMs / sp.maxLifeMs;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = sp.color;
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), sp.size, sp.size);
      ctx.restore();
    }

    for (let i = this.damagePops.length - 1; i >= 0; i--) {
      const dp = this.damagePops[i];
      dp.lifeMs += dtMs;
      if (dp.lifeMs >= dp.maxLifeMs) {
        this.damagePops.splice(i, 1);
        continue;
      }
      const dtSec = dtMs / 1000;
      dp.vy += dp.gravity * dtSec;
      dp.x += dp.vx * dtSec;
      dp.y += dp.vy * dtSec;

      const lifeRatio = dp.lifeMs / dp.maxLifeMs;
      const popScale =
        lifeRatio < 0.18
          ? 0.8 + (lifeRatio / 0.18) * 0.55
          : lifeRatio < 0.35
          ? 1.35 - ((lifeRatio - 0.18) / 0.17) * 0.35
          : 1.0;
      const alpha = lifeRatio > 0.72 ? 1 - (lifeRatio - 0.72) / 0.28 : 1;

      const fontSize = Math.round(dp.baseFontSize * popScale);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = dp.isCritOrCataclysm ? 4 : 3;
      ctx.strokeStyle = dp.strokeColor;
      ctx.strokeText(dp.text, Math.round(dp.x), Math.round(dp.y));
      ctx.fillStyle = dp.color;
      ctx.fillText(dp.text, Math.round(dp.x), Math.round(dp.y));
      ctx.restore();
    }
  }
}

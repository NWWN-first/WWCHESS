// src/ThreeJsGameRenderer.ts
/**
 * Three.js 3D WebGL Fantasy Auto-Battler Renderer.
 * High-End TFT Mobile Style with:
 * - Real 3D GLB Character Models (Knight, Mage, Rogue, Barbarian, Skeleton, Dragon) via GLTFLoader
 * - Dark Medieval Fantasy Colosseum Arena (No digital/neon wireframes, Real Stone Hexagons with Carved Runes)
 * - Warm Flickering Torches & Braziers with dynamic PointLight fire glows
 * - TFT-style 1:1 Responsive 3D Drag & Drop (Unit floats up, follows finger/cursor in 3D world space, snapped landing)
 * - 3D Overhead Billboard HP/Mana bars and 3D Floating Popups
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  CostTier,
  StarLevel,
  UNIT_TEMPLATES,
} from './GameData';
import { HexCoord } from './HexGridMath';
import { Participant } from './Participant';
import { UNIT_PIXEL_SPECS, WEAPON_BADGE_ICONS } from './PixelGameRenderer';
import { CombatEvent, CombatUnit } from './SkillRegistry';

export type ChampionArchetype =
  | 'WARRIOR'      // 기사, 선봉대, 성기사 (Knight.glb)
  | 'MAGE'         // 대마법사, 비전탑 (Mage.glb)
  | 'ROGUE'        // 그림자 암살자, 고블린 (Rogue.glb)
  | 'BRAWLER'      // 광전사, 버서커 (Barbarian.glb)
  | 'SKELETON'     // 언데드, 사령술사 (Skeleton.glb)
  | 'BEAST_GOLEM'; // 용족, 몬스터, PVE 크립 (Dragon.glb)

export interface Champion3DVisualConfig {
  modelKey: 'Knight' | 'Mage' | 'Rogue' | 'Rogue_Hooded' | 'Barbarian' | 'Skeleton_Warrior' | 'Skeleton_Mage' | 'Skeleton_Rogue' | 'Wolf' | 'Dragon' | 'Imp';
  scale: number;
  offsetY?: number;
  primaryColor?: number;
  emissiveColor?: number;
  attackAnim?: string;
  skillAnim?: string;
  idleAnim?: string;
  walkAnim?: string;
  hitAnim?: string;
  deathAnim?: string;
  stunAnim?: string;
  aura?: 'HOLY_GOLD' | 'ARCANE_BLUE' | 'SHADOW_PURPLE' | 'FROST_CYAN' | 'FIRE_RED' | 'GOBLIN_GOLD' | 'POISON_GREEN' | 'NONE';
}

/**
 * 20대 핵심 챔피언 및 시너지/의도에 직결된 맞춤형 3D 비주얼 설정 (1~2차 완료)
 */
export const DEDICATED_CHAMPION_3D_MAP: Record<string, Champion3DVisualConfig> = {
  // -------------------------------------------------------------
  // [1차 완료 10종]
  // -------------------------------------------------------------
  // 1. 가렌 (제국 보병 가렌) - 1코 Holy Empire / Vanguard (신성 제국 판금 갑주 & 방패검)
  u1_garen: {
    modelKey: 'Knight',
    scale: 1.15,
    primaryColor: 0x94a3b8,
    emissiveColor: 0x334155,
    attackAnim: '1H_Melee_Attack_Slice_Horizontal',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },
  // 2. 핍 (고블린 소매치기 핍) - 1코 Golden Goblin / Shadow Assassin (날렵한 녹색/황금 단검 암살자)
  u1_pip: {
    modelKey: 'Rogue',
    scale: 0.95,
    primaryColor: 0x16a34a,
    emissiveColor: 0xca8a04,
    attackAnim: 'Dualwield_Melee_Attack_Slice',
    skillAnim: '1H_Melee_Attack_Stab',
    stunAnim: 'Lie_Idle',
    aura: 'GOBLIN_GOLD',
  },
  // 3. 스켈 (해골 전사 스켈) - 1코 Undead Scourge / Berserker (언데드 녹슨 장검 & 도골 해골병)
  u1_skel: {
    modelKey: 'Skeleton_Warrior',
    scale: 1.12,
    primaryColor: 0x94a3b8,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '1H_Melee_Attack_Jump_Chop',
    deathAnim: 'Death_C_Skeletons',
    stunAnim: 'Skeleton_Inactive_Standing_Pose',
    aura: 'NONE',
  },
  // 4. 루미 (견습 마법사 루미) - 1코 Arcane Tower / Archmage (사파이어 로브 & 비전 지팡이)
  u1_lumi: {
    modelKey: 'Mage',
    scale: 1.05,
    primaryColor: 0x38bdf8,
    emissiveColor: 0x0284c7,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Raise',
    stunAnim: 'Lie_Idle',
    aura: 'ARCANE_BLUE',
  },
  // 5. 데스나이트 (망자 기병 데스나이트) - 2코 Undead Scourge / Vanguard / Berserker (흑철 갑주 해골 챔피언)
  u2_boneknight: {
    modelKey: 'Skeleton_Warrior',
    scale: 1.25,
    primaryColor: 0x1e293b,
    emissiveColor: 0x06b6d4,
    attackAnim: '2H_Melee_Attack_Slice',
    skillAnim: '2H_Melee_Attack_Spin',
    deathAnim: 'Death_B',
    stunAnim: 'Lie_Idle',
    aura: 'FROST_CYAN',
  },
  // 6. 펜리르 (서리송곳니 광전사 펜리르) - 3코 Undead Scourge / Berserker (서리 늑대 맹수)
  u3_fenrir: {
    modelKey: 'Wolf',
    scale: 1.22,
    primaryColor: 0x93c5fd,
    emissiveColor: 0x38bdf8,
    idleAnim: 'AnimalArmature|Idle',
    walkAnim: 'AnimalArmature|Gallop',
    attackAnim: 'AnimalArmature|Attack',
    skillAnim: 'AnimalArmature|Gallop_Jump',
    hitAnim: 'AnimalArmature|Idle_HitReact_Left',
    deathAnim: 'AnimalArmature|Death',
    stunAnim: 'AnimalArmature|Idle_HitReact_Right',
    aura: 'FROST_CYAN',
  },
  // 7. 아서 (성검의 집행자 아서) - 4코 Holy Empire / Berserker / Paladin (황금 성검 & 군주 망토)
  u4_arthur: {
    modelKey: 'Knight',
    scale: 1.30,
    primaryColor: 0xfacc15,
    emissiveColor: 0xeab308,
    attackAnim: '2H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },
  // 8. 타나토스 (칠흑의 사신 타나토스) - 4코 Undead Scourge / Shadow Assassin (칠흑 후드 망토 & 영혼 수확도)
  u4_thanatos: {
    modelKey: 'Rogue_Hooded',
    scale: 1.22,
    primaryColor: 0x1e1b4b,
    emissiveColor: 0x8b5cf6,
    attackAnim: 'Dualwield_Melee_Attack_Stab',
    skillAnim: 'Dualwield_Melee_Attack_Slice',
    stunAnim: 'Lie_Idle',
    aura: 'SHADOW_PURPLE',
  },
  // 9. 멀린 (대마도사 멀린) - 4코 Arcane Tower / Archmage (신비의 대마도사 & 유성 낙하 주술)
  u4_merlin: {
    modelKey: 'Mage',
    scale: 1.25,
    primaryColor: 0x6366f1,
    emissiveColor: 0xa855f7,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Long',
    stunAnim: 'Lie_Idle',
    aura: 'ARCANE_BLUE',
  },
  // 10. 이그니스 (고대 종말룡 이그니스) - 5코 Dragonkin / Abyssal Demon / Berserker (거대 고대 화염룡)
  u5_ignis: {
    modelKey: 'Dragon',
    scale: 1.35,
    primaryColor: 0xef4444,
    emissiveColor: 0xf97316,
    idleAnim: 'Idle',
    walkAnim: 'Idle',
    attackAnim: 'DragonArmature|DragonArmature|Dragon_Attack2',
    skillAnim: '2H_Melee_Attack_Chop',
    hitAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
    deathAnim: 'Death_A',
    stunAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
    aura: 'FIRE_RED',
  },

  // -------------------------------------------------------------
  // [2차 신규 추가 10종]
  // -------------------------------------------------------------
  // 11. 아리아 (엘프 궁수 아리아) - 1코 Elven Sylvan / Ranger (초록빛 숲의 정찰 궁수 & 연속사격)
  u1_aria: {
    modelKey: 'Rogue',
    scale: 1.08,
    primaryColor: 0x15803d,
    emissiveColor: 0x22c55e,
    attackAnim: '2H_Ranged_Shoot',
    skillAnim: '1H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },
  // 12. 발렌 (성당 수련기사 발렌) - 1코 Holy Empire / Paladin (순백의 수련기사 & 성스러운 축복 방패)
  u1_valen: {
    modelKey: 'Knight',
    scale: 1.12,
    primaryColor: 0xe2e8f0,
    emissiveColor: 0xfacc15,
    attackAnim: '1H_Melee_Attack_Slice_Horizontal',
    skillAnim: 'Spellcast_Raise',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },
  // 13. 렉스 (심연 화염임프 렉스) - 1코 Abyssal Demon / Archmage (귀여운 전용 화염 도깨비 임프)
  u1_imp: {
    modelKey: 'Imp',
    scale: 1.10,
    primaryColor: 0xd97706,
    emissiveColor: 0xef4444,
    idleAnim: 'MonsterArmature|Idle',
    walkAnim: 'MonsterArmature|Walk',
    attackAnim: 'MonsterArmature|Bite_Front',
    skillAnim: 'MonsterArmature|Jump',
    hitAnim: 'MonsterArmature|HitRecieve',
    deathAnim: 'MonsterArmature|Death',
    stunAnim: 'MonsterArmature|HitRecieve',
    aura: 'FIRE_RED',
  },
  // 14. 이그니 (새끼 화염룡 이그니) - 1코 Dragonkin / Ranger (소형 비행 아기 비룡)
  u1_whelp: {
    modelKey: 'Dragon',
    scale: 0.65,
    primaryColor: 0xf97316,
    emissiveColor: 0xfbbf24,
    idleAnim: 'Idle',
    walkAnim: 'Idle',
    attackAnim: 'DragonArmature|DragonArmature|Dragon_Attack2',
    skillAnim: '2H_Melee_Attack_Chop',
    hitAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
    deathAnim: 'Death_A',
    stunAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
    aura: 'FIRE_RED',
  },
  // 15. 구울 (무덤 도굴꾼 구울) - 1코 Undead Scourge / Shadow Assassin (쌍단검 해골 자객 도굴꾼)
  u1_ghoul: {
    modelKey: 'Skeleton_Rogue',
    scale: 1.08,
    primaryColor: 0x475569,
    emissiveColor: 0xa855f7,
    attackAnim: 'Dualwield_Melee_Attack_Slice',
    skillAnim: '1H_Melee_Attack_Stab',
    deathAnim: 'Death_C_Skeletons',
    stunAnim: 'Skeleton_Inactive_Standing_Pose',
    aura: 'SHADOW_PURPLE',
  },
  // 16. 잔느 (성전사 잔느) - 2코 Holy Empire / Paladin / Vanguard (백은 갑주 성처녀 여기사)
  u2_jeanne: {
    modelKey: 'Knight',
    scale: 1.18,
    primaryColor: 0xf1f5f9,
    emissiveColor: 0x3b82f6,
    attackAnim: '1H_Melee_Attack_Slice_Horizontal',
    skillAnim: 'Spellcast_Raise',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },
  // 17. 제드 (그림자 칼날 제드) - 2코 Undead Scourge / Shadow Assassin (칠흑 후드 닌자 자객)
  u2_zed: {
    modelKey: 'Rogue_Hooded',
    scale: 1.18,
    primaryColor: 0x0f172a,
    emissiveColor: 0x06b6d4,
    attackAnim: 'Dualwield_Melee_Attack_Slice',
    skillAnim: 'Dualwield_Melee_Attack_Stab',
    stunAnim: 'Lie_Idle',
    aura: 'SHADOW_PURPLE',
  },
  // 18. 그롬 (고블린 용병대장 그롬) - 3코 Golden Goblin / Berserker (거구의 초록 고블린 족장 버서커)
  u3_grom: {
    modelKey: 'Barbarian',
    scale: 1.25,
    primaryColor: 0x15803d,
    emissiveColor: 0xeab308,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'GOBLIN_GOLD',
  },
  // 19. 실바나 (신궁 여왕 실바나) - 4코 Elven Sylvan / Ranger (세계수의 은빛 활 여왕 & 화살비)
  u4_sylph: {
    modelKey: 'Rogue_Hooded',
    scale: 1.25,
    primaryColor: 0x047857,
    emissiveColor: 0xfacc15,
    attackAnim: '2H_Ranged_Shoot',
    skillAnim: '1H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },
  // 20. 미카엘 (천군 총사령관 미카엘) - 5코 Holy Empire / Paladin / Vanguard (신성 대천사 군단장)
  u5_michael: {
    modelKey: 'Knight',
    scale: 1.40,
    primaryColor: 0xfffbeb,
    emissiveColor: 0xfacc15,
    attackAnim: '2H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },

  // -------------------------------------------------------------
  // [3차 신규 추가 10종 (총 30/60종 - 50% 달성)]
  // -------------------------------------------------------------
  // 21. 쏜 (가시덩굴 파수꾼 쏜) - 1코 Elven Sylvan / Vanguard (엘프 고목 덩굴 전사)
  u1_thorn: {
    modelKey: 'Barbarian',
    scale: 1.18,
    primaryColor: 0x166534,
    emissiveColor: 0x4ade80,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Chop',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },
  // 22. 크로나 (마탑 파수병 크로나) - 1코 Arcane Tower / Vanguard (비전 룬 마법 판금병)
  u1_chrona: {
    modelKey: 'Knight',
    scale: 1.16,
    primaryColor: 0x1e3a8a,
    emissiveColor: 0x38bdf8,
    attackAnim: '1H_Melee_Attack_Slice_Horizontal',
    skillAnim: 'Spellcast_Raise',
    stunAnim: 'Lie_Idle',
    aura: 'ARCANE_BLUE',
  },
  // 23. 스내치 (고블린 투창병 스내치) - 1코 Golden Goblin / Ranger (황금 고블린 투창 저격병)
  u1_snatch: {
    modelKey: 'Rogue',
    scale: 0.95,
    primaryColor: 0x15803d,
    emissiveColor: 0xeab308,
    attackAnim: '1H_Ranged_Shoot',
    skillAnim: '2H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'GOBLIN_GOLD',
  },
  // 24. 프레이 (황혼의 도끼병 프레이) - 1코 Holy Empire / Berserker / Vanguard (황혼 발키리 전사)
  u1_shieldmaiden: {
    modelKey: 'Barbarian',
    scale: 1.12,
    primaryColor: 0xb91c1c,
    emissiveColor: 0xf59e0b,
    attackAnim: '1H_Melee_Attack_Slice_Diagonal',
    skillAnim: '1H_Melee_Attack_Jump_Chop',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },
  // 25. 모르그 (심연 방패병 모르그) - 1코 Abyssal Demon / Vanguard / Undead Scourge (용암 해골 방패병)
  u1_ember: {
    modelKey: 'Skeleton_Warrior',
    scale: 1.20,
    primaryColor: 0x7f1d1d,
    emissiveColor: 0xf97316,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Slice',
    deathAnim: 'Death_C_Skeletons',
    stunAnim: 'Skeleton_Inactive_Standing_Pose',
    aura: 'FIRE_RED',
  },
  // 26. 팅크 (고블린 연금술사 팅크) - 2코 Golden Goblin / Arcane Tower / Archmage (고블린 비전 연금술사)
  u2_tink: {
    modelKey: 'Mage',
    scale: 0.96,
    primaryColor: 0x16a34a,
    emissiveColor: 0x84cc16,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Raise',
    stunAnim: 'Lie_Idle',
    aura: 'GOBLIN_GOLD',
  },
  // 27. 카일 (심연의 사냥꾼 카일) - 2코 Abyssal Demon / Ranger (심연 흑가죽 흑궁수)
  u2_kyle: {
    modelKey: 'Rogue_Hooded',
    scale: 1.15,
    primaryColor: 0x18181b,
    emissiveColor: 0xdc2626,
    attackAnim: '2H_Ranged_Shoot',
    skillAnim: '1H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'FIRE_RED',
  },
  // 28. 엔트 (숲의 수호신 엔트) - 2코 Elven Sylvan / Vanguard / Paladin (거대 고목 수호신)
  u2_ent: {
    modelKey: 'Barbarian',
    scale: 1.35,
    primaryColor: 0x3f2e1e,
    emissiveColor: 0x22c55e,
    attackAnim: '2H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },
  // 29. 제피르 (심연 암살자 제피르) - 2코 Abyssal Demon / Shadow Assassin (심연 돌풍 자객)
  u2_zephyr: {
    modelKey: 'Rogue',
    scale: 1.14,
    primaryColor: 0x3b0764,
    emissiveColor: 0xa855f7,
    attackAnim: 'Dualwield_Melee_Attack_Slice',
    skillAnim: 'Dualwield_Melee_Attack_Stab',
    stunAnim: 'Lie_Idle',
    aura: 'SHADOW_PURPLE',
  },
  // 30. 엘로웬 (숲의 무녀 엘로웬) - 2코 Elven Sylvan / Paladin (생명의 숲 성스러운 무녀 힐러)
  u2_elowen: {
    modelKey: 'Mage',
    scale: 1.08,
    primaryColor: 0xf0fdf4,
    emissiveColor: 0x10b981,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Long',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },

  // -------------------------------------------------------------
  // [4차 신규 추가 10종 (총 40/60종 - 66.7% 달성)]
  // -------------------------------------------------------------
  // 31. 볼더 (룬 거석병 볼더) - 2코 Arcane Tower / Vanguard (거대 비전 룬 거석병)
  u2_boulder: {
    modelKey: 'Barbarian',
    scale: 1.38,
    primaryColor: 0x64748b,
    emissiveColor: 0x38bdf8,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Jump_Chop',
    stunAnim: 'Lie_Idle',
    aura: 'ARCANE_BLUE',
  },
  // 32. 붐 (고블린 폭격수 붐) - 2코 Golden Goblin / Ranger (황금 고블린 폭탄마)
  u2_boom: {
    modelKey: 'Rogue',
    scale: 0.95,
    primaryColor: 0x16a34a,
    emissiveColor: 0xf97316,
    attackAnim: '1H_Ranged_Shoot',
    skillAnim: '2H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'GOBLIN_GOLD',
  },
  // 33. 베인 (제국 석궁병 베인) - 2코 Holy Empire / Ranger (신성 제국 정예 은화살 석궁수)
  u2_vayne: {
    modelKey: 'Rogue',
    scale: 1.10,
    primaryColor: 0xe2e8f0,
    emissiveColor: 0xfacc15,
    attackAnim: '2H_Ranged_Shoot',
    skillAnim: '1H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },
  // 34. 파이어 (화염 비늘 전사 파이어) - 2코 Dragonkin / Berserker (용린 화염 버서커 전사)
  u2_pyre: {
    modelKey: 'Barbarian',
    scale: 1.25,
    primaryColor: 0xd97706,
    emissiveColor: 0xef4444,
    attackAnim: '1H_Melee_Attack_Slice_Diagonal',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'FIRE_RED',
  },
  // 35. 말리스 (심연 흑마법사 말리스) - 2코 Abyssal Demon / Archmage (칠흑 보라 심연 사령술사)
  u2_malice: {
    modelKey: 'Skeleton_Mage',
    scale: 1.18,
    primaryColor: 0x3b0764,
    emissiveColor: 0xa855f7,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Long',
    deathAnim: 'Death_C_Skeletons',
    stunAnim: 'Skeleton_Inactive_Standing_Pose',
    aura: 'SHADOW_PURPLE',
  },
  // 36. 지크 (드래곤 나이트 지크) - 3코 Dragonkin / Vanguard (용린 판금 갑주 거대 용기사)
  u3_sieg: {
    modelKey: 'Knight',
    scale: 1.28,
    primaryColor: 0x991b1b,
    emissiveColor: 0xf59e0b,
    attackAnim: '1H_Melee_Attack_Slice_Horizontal',
    skillAnim: '2H_Melee_Attack_Chop',
    stunAnim: 'Lie_Idle',
    aura: 'FIRE_RED',
  },
  // 37. 실피 (엘프 바람술사 실피) - 3코 Elven Sylvan / Archmage (돌풍과 폭풍을 부리는 요정 술사)
  u3_sylphie: {
    modelKey: 'Mage',
    scale: 1.12,
    primaryColor: 0x059669,
    emissiveColor: 0x34d399,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Raise',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },
  // 38. 블라드 (블러드 로드 블라드) - 3코 Abyssal Demon / Arcane Tower (선혈 흡혈 군주 뱀파이어)
  u3_vlad: {
    modelKey: 'Rogue_Hooded',
    scale: 1.20,
    primaryColor: 0x450a0a,
    emissiveColor: 0xb91c1c,
    attackAnim: 'Dualwield_Melee_Attack_Stab',
    skillAnim: 'Spellcast_Long',
    stunAnim: 'Lie_Idle',
    aura: 'FIRE_RED',
  },
  // 39. 드레이크 (적염의 용기병 드레이크) - 3코 Dragonkin / Berserker / Vanguard (적염의 맹렬한 용기병)
  u3_drake: {
    modelKey: 'Barbarian',
    scale: 1.26,
    primaryColor: 0xb45309,
    emissiveColor: 0xf97316,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'FIRE_RED',
  },
  // 40. 레오나 (태양의 성기사 레오나) - 3코 Holy Empire / Vanguard / Paladin (광채의 태양 방패 여기사)
  u3_leona: {
    modelKey: 'Knight',
    scale: 1.22,
    primaryColor: 0xfacc15,
    emissiveColor: 0xfef08a,
    attackAnim: '1H_Melee_Attack_Slice_Horizontal',
    skillAnim: 'Spellcast_Raise',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },

  // -------------------------------------------------------------
  // [5차 신규 추가 10종 (총 50/60종 - 83.3% 달성)]
  // -------------------------------------------------------------
  // 41. 카즈 (환영의 검객 카즈) - 3코 Elven Sylvan / Shadow Assassin / Berserker (엘프 환영 신속 검객)
  u3_kazu: {
    modelKey: 'Rogue',
    scale: 1.16,
    primaryColor: 0x065f46,
    emissiveColor: 0x34d399,
    attackAnim: 'Dualwield_Melee_Attack_Slice',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },
  // 42. 말라코르 (영혼 수확자 말라코르) - 3코 Undead Scourge / Archmage (망령 영혼 수확 사령관)
  u3_malakor: {
    modelKey: 'Skeleton_Mage',
    scale: 1.20,
    primaryColor: 0x1e293b,
    emissiveColor: 0x06b6d4,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Raise',
    deathAnim: 'Death_C_Skeletons',
    stunAnim: 'Skeleton_Inactive_Standing_Pose',
    aura: 'FROST_CYAN',
  },
  // 43. 세라피나 (빛의 사제 세라피나) - 3코 Holy Empire / Arcane Tower / Paladin (순백의 대천사 사제)
  u3_seraphina: {
    modelKey: 'Mage',
    scale: 1.10,
    primaryColor: 0xfffbeb,
    emissiveColor: 0xfacc15,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Long',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },
  // 44. 그리즐 (고블린 중장갑차 그리즐) - 3코 Golden Goblin / Vanguard (황금 강철 중장갑 전사)
  u3_grizzle: {
    modelKey: 'Knight',
    scale: 1.30,
    primaryColor: 0xd97706,
    emissiveColor: 0xfacc15,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'GOBLIN_GOLD',
  },
  // 45. 오리온 (별자리 명궁 오리온) - 3코 Arcane Tower / Ranger / Archmage (비전 성운 천문 명궁)
  u3_orion: {
    modelKey: 'Rogue_Hooded',
    scale: 1.16,
    primaryColor: 0x1e1b4b,
    emissiveColor: 0x38bdf8,
    attackAnim: '2H_Ranged_Shoot',
    skillAnim: '1H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'ARCANE_BLUE',
  },
  // 46. 닉스 (심연의 밤마녀 닉스) - 3코 Abyssal Demon / Shadow Assassin / Archmage (심연 서큐버스 자객)
  u3_nyx: {
    modelKey: 'Rogue',
    scale: 1.12,
    primaryColor: 0x581c87,
    emissiveColor: 0xc084fc,
    attackAnim: 'Dualwield_Melee_Attack_Slice',
    skillAnim: 'Dualwield_Melee_Attack_Stab',
    stunAnim: 'Lie_Idle',
    aura: 'SHADOW_PURPLE',
  },
  // 47. 아스타로트 (심연의 대공 아스타로트) - 4코 Abyssal Demon / Berserker (거대 심연 악마 버서커 군주)
  u4_astaroth: {
    modelKey: 'Barbarian',
    scale: 1.35,
    primaryColor: 0x7f1d1d,
    emissiveColor: 0xef4444,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Jump_Chop',
    stunAnim: 'Lie_Idle',
    aura: 'FIRE_RED',
  },
  // 48. 벨코라 (공허의 여제 벨코라) - 4코 Abyssal Demon / Arcane Tower / Archmage (차원의 균열 공허 여제)
  u4_velkora: {
    modelKey: 'Mage',
    scale: 1.22,
    primaryColor: 0x312e81,
    emissiveColor: 0xa855f7,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Long',
    stunAnim: 'Lie_Idle',
    aura: 'SHADOW_PURPLE',
  },
  // 49. 브륜힐드 (천상의 발키리 브륜힐드) - 4코 Holy Empire / Paladin / Ranger (황금빛 전장의 수호 발키리)
  u4_valkyrie: {
    modelKey: 'Knight',
    scale: 1.26,
    primaryColor: 0xf8fafc,
    emissiveColor: 0xfacc15,
    attackAnim: '1H_Melee_Attack_Slice_Horizontal',
    skillAnim: '2H_Melee_Attack_Chop',
    stunAnim: 'Lie_Idle',
    aura: 'HOLY_GOLD',
  },
  // 50. 파프니르 (황금 갑주룡 파프니르) - 4코 Dragonkin / Golden Goblin / Vanguard (탐욕의 거대 황금 갑주룡)
  u4_fafnir: {
    modelKey: 'Dragon',
    scale: 1.25,
    primaryColor: 0xeab308,
    emissiveColor: 0xfde047,
    idleAnim: 'Idle',
    walkAnim: 'Idle',
    attackAnim: 'DragonArmature|DragonArmature|Dragon_Attack2',
    skillAnim: '2H_Melee_Attack_Chop',
    hitAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
    deathAnim: 'Death_A',
    stunAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
    aura: 'GOBLIN_GOLD',
  },

  // -------------------------------------------------------------
  // [6차 최종 추가 10종 (총 60/60종 - 100% 완전 정복)]
  // -------------------------------------------------------------
  // 51. 칼드로스 (절대영도 리치왕 칼드로스) - 4코 Undead Scourge / Arcane Tower / Archmage (빙하 절대영도 리치왕)
  u4_lichking: {
    modelKey: 'Skeleton_Mage',
    scale: 1.28,
    primaryColor: 0x0ea5e9,
    emissiveColor: 0x38bdf8,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Long',
    deathAnim: 'Death_C_Skeletons',
    stunAnim: 'Skeleton_Inactive_Standing_Pose',
    aura: 'FROST_CYAN',
  },
  // 52. 미다스 (황금 연금술사 미다스) - 4코 Golden Goblin / Archmage / Arcane Tower (만물 황금 연금술 대가)
  u4_midas: {
    modelKey: 'Mage',
    scale: 1.18,
    primaryColor: 0xfacc15,
    emissiveColor: 0xfde047,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Raise',
    stunAnim: 'Lie_Idle',
    aura: 'GOBLIN_GOLD',
  },
  // 53. 아르테미스 (용사냥꾼 아르테미스) - 4코 Dragonkin / Ranger / Berserker (용린 갑주 전설의 용 학살자)
  u4_artemis: {
    modelKey: 'Rogue_Hooded',
    scale: 1.22,
    primaryColor: 0xb91c1c,
    emissiveColor: 0xf59e0b,
    attackAnim: '2H_Ranged_Shoot',
    skillAnim: '1H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'FIRE_RED',
  },
  // 54. 오베론 (숲의 고대수호자 오베론) - 4코 Elven Sylvan / Vanguard / Paladin (고대 요정왕 수호 기사)
  u4_diablo: {
    modelKey: 'Knight',
    scale: 1.32,
    primaryColor: 0x065f46,
    emissiveColor: 0x22c55e,
    attackAnim: '1H_Melee_Attack_Slice_Horizontal',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },
  // 55. 골드투스 (황금 고블린 왕 골드투스) - 5코 전설 Golden Goblin / Paladin / Vanguard (탐욕의 황금 고블린 황제)
  u5_goldtooth: {
    modelKey: 'Barbarian',
    scale: 1.30,
    primaryColor: 0xeab308,
    emissiveColor: 0xfef08a,
    attackAnim: '1H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Jump_Chop',
    stunAnim: 'Lie_Idle',
    aura: 'GOBLIN_GOLD',
  },
  // 56. 루시엘 (타락한 대천사 루시엘) - 5코 전설 Holy Empire / Undead Scourge / Ranger (흑백 날개 타락천사 명궁)
  u5_luciel: {
    modelKey: 'Rogue_Hooded',
    scale: 1.32,
    primaryColor: 0x111827,
    emissiveColor: 0xe0e7ff,
    attackAnim: '2H_Ranged_Shoot',
    skillAnim: '1H_Ranged_Shoot',
    stunAnim: 'Lie_Idle',
    aura: 'SHADOW_PURPLE',
  },
  // 57. 바하무트 (성운의 창세룡 바하무트) - 5코 전설 Dragonkin / Arcane Tower / Archmage (우주 성운 초대형 창세룡)
  u5_bahamut: {
    modelKey: 'Dragon',
    scale: 1.45,
    primaryColor: 0x1e1b4b,
    emissiveColor: 0x38bdf8,
    idleAnim: 'Idle',
    walkAnim: 'Idle',
    attackAnim: 'DragonArmature|DragonArmature|Dragon_Attack2',
    skillAnim: '2H_Melee_Attack_Chop',
    hitAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
    deathAnim: 'Death_A',
    stunAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
    aura: 'ARCANE_BLUE',
  },
  // 58. 크로노스 (시간의 지배자 크로노스) - 5코 전설 Arcane Tower / Archmage / Undead Scourge (시공간 차원 지배신)
  u5_chronos: {
    modelKey: 'Mage',
    scale: 1.30,
    primaryColor: 0x1e3a8a,
    emissiveColor: 0x38bdf8,
    attackAnim: 'Spellcast_Shoot',
    skillAnim: 'Spellcast_Long',
    stunAnim: 'Lie_Idle',
    aura: 'ARCANE_BLUE',
  },
  // 59. 릴리스 (심연의 여왕 릴리스) - 5코 전설 Abyssal Demon / Shadow Assassin / Berserker (피의 지옥 심연 여왕)
  u5_lilith: {
    modelKey: 'Rogue',
    scale: 1.24,
    primaryColor: 0x881337,
    emissiveColor: 0xef4444,
    attackAnim: 'Dualwield_Melee_Attack_Slice',
    skillAnim: 'Dualwield_Melee_Attack_Stab',
    stunAnim: 'Lie_Idle',
    aura: 'FIRE_RED',
  },
  // 60. 이그드라실 (세계수의 화신 이그드라실) - 5코 전설 Elven Sylvan / Vanguard / Paladin (태고의 거대 세계수 현신)
  u5_yggdrasil: {
    modelKey: 'Barbarian',
    scale: 1.45,
    primaryColor: 0x271c14,
    emissiveColor: 0x10b981,
    attackAnim: '2H_Melee_Attack_Chop',
    skillAnim: '2H_Melee_Attack_Spin',
    stunAnim: 'Lie_Idle',
    aura: 'POISON_GREEN',
  },
};

export interface RenderState3D {
  inCombat: boolean;
  viewedParticipant: Participant;
  combatUnits: CombatUnit[];
  hoveredHex: HexCoord | null;
  hoveredBenchIndex: number | null;
  isDraggingUnit: boolean;
  draggedInstanceId: string | null;
  selectedInstanceId: string | null;
  hasPandoraBench: boolean;
  opponentName: string;
  isCreepMatch: boolean;
}

interface UnitJuice3D {
  facingY: number;
  lungeTimerMs: number;
  lungeMaxMs: number;
  lungeDirX: number;
  lungeDirZ: number;
  hitFlashTimerMs: number;
  leapProgress: number;
  leapStartPos: THREE.Vector3;
  leapTargetPos: THREE.Vector3;
  /** MOVE 이벤트 기반 시간 보간 (시각적 순간이동 방지) */
  moveFrom: THREE.Vector3;
  moveTo: THREE.Vector3;
  moveElapsedMs: number;
  moveDurationMs: number;
  isMoving: boolean;
}

interface Active3DProjectile {
  mesh: THREE.Group;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  elapsedMs: number;
  durationMs: number;
  arcHeight: number;
  kind: 'ARROW' | 'MAGIC_ORB';
}

interface Active3DPopup {
  sprite: THREE.Sprite;
  startPos: THREE.Vector3;
  elapsedMs: number;
  durationMs: number;
  riseSpeed: number;
}

interface Active3DSpark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  lifeMs: number;
  maxLifeMs: number;
}

interface UnitAnimController {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentAction: THREE.AnimationAction | null;
  currentActionName: string;
}

export class ThreeJsGameRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;

  // 3D 전장 그리드 메트릭 (World Space)
  public readonly hexRadius: number = 1.15;
  public readonly hexWidth: number = Math.sqrt(3) * 1.15; // ~1.99
  public readonly rowStepZ: number = 1.5 * 1.15; // 1.725
  public readonly benchZ: number = 4 * 1.725 + 2.2;

  // 3D 씬 계층 구조
  private boardGroup: THREE.Group = new THREE.Group();
  private benchGroup: THREE.Group = new THREE.Group();
  private unitsGroup: THREE.Group = new THREE.Group();
  private environmentGroup: THREE.Group = new THREE.Group();
  private projectilesGroup: THREE.Group = new THREE.Group();
  private popupsGroup: THREE.Group = new THREE.Group();
  private vfxGroup: THREE.Group = new THREE.Group();

  // 타일 메시 캐시
  private hexTileMeshes: Map<string, THREE.Mesh> = new Map();
  private benchTileMeshes: Map<number, THREE.Mesh> = new Map();
  private tileOriginalY: Map<THREE.Mesh, number> = new Map();

  // 유닛 3D 메시 및 쥬스 상태
  private unitMeshesMap: Map<string, THREE.Group> = new Map();
  private unitJuiceMap: Map<string, UnitJuice3D> = new Map();
  private unitAnimControllers: Map<string, UnitAnimController> = new Map();

  // GLB 모델 에셋 캐시 (10종 판타지 전용 모델 및 골격 애니메이션)
  private glbLoadedTemplates: Map<string, THREE.Group> = new Map();
  private glbAnimations: Map<string, THREE.AnimationClip[]> = new Map();
  private glbLoader: GLTFLoader = new GLTFLoader();

  // 3D 챔피언 초상화 오프스크린 렌더링 시스템 & 캐시
  private portraitRenderer: THREE.WebGLRenderer | null = null;
  private portraitScene: THREE.Scene | null = null;
  private portraitCamera: THREE.PerspectiveCamera | null = null;
  private portraitCanvas: HTMLCanvasElement | null = null;
  private champion3DPortraitCache: Map<string, HTMLCanvasElement> = new Map();
  public onModelsLoaded?: () => void;

  // 횃불 조명들 (Flickering Torches)
  private torchLights: { light: THREE.PointLight; baseIntensity: number; phase: number }[] = [];

  // 활성 투사체 및 팝업 텍스트
  private activeProjectiles: Active3DProjectile[] = [];
  private activePopups: Active3DPopup[] = [];
  private activeSparks: Active3DSpark[] = [];

  // 조명
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;

  // 카메라 쉐이크 & 시간
  private shakeRemainingMs: number = 0;
  private shakeIntensity: number = 0;
  private animClockMs: number = 0;

  // 3D 레이캐스터 및 지면 평면
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouseVec: THREE.Vector2 = new THREE.Vector2();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private currentDragWorldPos: THREE.Vector3 = new THREE.Vector3();
  private isPointerDownOn3D: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    // 찬란하고 밝은 야외 산악 판타지 성채 결투장 (어두운 암흑/홀로그램 완전 탈피)
    this.scene.background = new THREE.Color(0x60a5fa);
    this.scene.fog = new THREE.FogExp2(0x93c5fd, 0.012);

    // 1. TFT 스타일 쿼터뷰 — 필드를 더 크게 보이도록 FOV↑ / 카메라 당김
    const aspect = (window.innerWidth || 800) / (window.innerHeight || 600);
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.5, 140);
    this.camera.position.set(0, 15.2, 14.0);
    this.camera.lookAt(0, 0, 1.0);

    // 2. WebGL 렌더러
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth || 800, window.innerHeight || 600);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. 화사하고 맑은 대낮 판타지 태양광 & 앰비언트 라이트 (경기장이 환하게 비치도록 대폭 보강)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.95);
    this.scene.add(ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x4d7c0f, 1.8);
    this.scene.add(this.hemiLight);

    // 3-1. 정면 페이스 라이트 (플레이어 방향에서 캐릭터 정면/얼굴/가슴 갑옷을 화사하고 선명하게 비추는 전용 조명)
    const frontFaceLight = new THREE.DirectionalLight(0xfff7ed, 1.6);
    frontFaceLight.position.set(0, 10, 20);
    frontFaceLight.target.position.set(0, 0, 2);
    this.scene.add(frontFaceLight);
    this.scene.add(frontFaceLight.target);

    // 찬란한 황금빛 태양 직사광
    this.dirLight = new THREE.DirectionalLight(0xfffbeb, 3.6);
    this.dirLight.position.set(10, 24, 14);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 60;
    this.dirLight.shadow.camera.left = -14;
    this.dirLight.shadow.camera.right = 14;
    this.dirLight.shadow.camera.top = 14;
    this.dirLight.shadow.camera.bottom = -14;
    this.dirLight.shadow.bias = -0.0006;
    this.scene.add(this.dirLight);

    this.scene.add(this.boardGroup);
    this.scene.add(this.benchGroup);
    this.scene.add(this.unitsGroup);
    this.scene.add(this.environmentGroup);
    this.scene.add(this.projectilesGroup);
    this.scene.add(this.popupsGroup);
    this.scene.add(this.vfxGroup);

    this.buildMedievalStoneArena();
    this.buildMedievalStoneBench();
    this.buildColosseumSurroundingsAndTorches();

    // 4. 외부 고품질 GLB 캐릭터 모델 비동기 로딩 시작
    this.loadGlbCharacterModels();
  }

  /**
   * 외부 GLB 모델 파일 10종 비동기 사전 로딩
   */
  private loadGlbCharacterModels(): void {
    const modelSources: { key: string; url: string; scale: number; offsetY: number }[] = [
      { key: 'Knight', url: './models/Knight.glb', scale: 1.15, offsetY: 0 },
      { key: 'Mage', url: './models/Mage.glb', scale: 1.15, offsetY: 0 },
      { key: 'Rogue', url: './models/Rogue.glb', scale: 1.10, offsetY: 0 },
      { key: 'Rogue_Hooded', url: './models/Rogue_Hooded.glb', scale: 1.12, offsetY: 0 },
      { key: 'Barbarian', url: './models/Barbarian.glb', scale: 1.20, offsetY: 0 },
      { key: 'Skeleton_Warrior', url: './models/Skeleton_Warrior.glb', scale: 1.15, offsetY: 0 },
      { key: 'Skeleton_Mage', url: './models/Skeleton_Mage.glb', scale: 1.15, offsetY: 0 },
      { key: 'Skeleton_Rogue', url: './models/Skeleton_Rogue.glb', scale: 1.10, offsetY: 0 },
      { key: 'Wolf', url: './models/Wolf.glb', scale: 1.22, offsetY: 0 },
      { key: 'Dragon', url: './models/Dragon.glb', scale: 0.95, offsetY: 0 },
      { key: 'Imp', url: './models/Imp.glb', scale: 1.10, offsetY: 0 },
    ];

    modelSources.forEach((src) => {
      this.glbLoader.load(
        src.url,
        (gltf) => {
          const root = gltf.scene;
          root.scale.set(src.scale, src.scale, src.scale);
          root.position.y = src.offsetY;

          // 그림자 활성화 & 재질 최적화
          root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const m = child as THREE.Mesh;
              m.castShadow = true;
              m.receiveShadow = true;
              if (m.material) {
                const mat = m.material as THREE.MeshStandardMaterial;
                mat.roughness = 0.55;
                mat.metalness = 0.35;
              }
            }
          });

          this.glbLoadedTemplates.set(src.key, root);
          if (gltf.animations && gltf.animations.length > 0) {
            this.glbAnimations.set(src.key, gltf.animations);
          }
          this.upgradeActiveUnitsToGlb(src.key);
          this.champion3DPortraitCache.clear();
          this.onModelsLoaded?.();
        },
        undefined,
        (err) => {
          console.warn(`[ThreeJsGameRenderer] Model load fallback for ${src.key}:`, err);
        }
      );
    });
  }

  /**
   * GLB 로딩 완료 시 현재 씬에 있는 fallback 유닛들을 고품질 GLB 메시와 실제 골격 애니메이션으로 핫스왑
   */
  private upgradeActiveUnitsToGlb(loadedModelKey: string): void {
    const glbTemplate = this.glbLoadedTemplates.get(loadedModelKey);
    if (!glbTemplate) return;

    for (const [instanceId, group] of this.unitMeshesMap) {
      const unitId = group.userData?.unitId;
      if (!unitId) continue;
      const cfg = this.getChampion3DConfig(unitId);
      if (cfg.modelKey === loadedModelKey) {
        const fallbackRoot = group.getObjectByName('FALLBACK_ROOT');
        if (fallbackRoot) {
          group.remove(fallbackRoot);
          const clonedModel = SkeletonUtils.clone(glbTemplate) as THREE.Group;
          clonedModel.name = 'GLB_MODEL_ROOT';

          if (cfg.primaryColor) {
            clonedModel.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.material) {
                  const mat = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
                  if (mat.color && cfg.primaryColor) {
                    mat.color.lerp(new THREE.Color(cfg.primaryColor), 0.3);
                  }
                  mesh.material = mat;
                }
              }
            });
          }

          group.add(clonedModel);
          this.setupUnitAnimations(instanceId, clonedModel, cfg);
        }
      }
    }
  }

  /**
   * 3D 기물 전용 실시간 스켈레탈 애니메이션(Idle/Walk/Attack/Spell/Hit/Death/Stun) 바인딩
   */
  private setupUnitAnimations(
    instanceId: string,
    clonedModel: THREE.Group,
    cfg: Champion3DVisualConfig
  ): void {
    const clips = this.glbAnimations.get(cfg.modelKey);
    if (!clips || clips.length === 0) return;

    const oldCtrl = this.unitAnimControllers.get(instanceId);
    if (oldCtrl) {
      oldCtrl.mixer.stopAllAction();
      this.unitAnimControllers.delete(instanceId);
    }

    const mixer = new THREE.AnimationMixer(clonedModel);
    const actions = new Map<string, THREE.AnimationAction>();

    const getClip = (names: string[]): THREE.AnimationClip | undefined => {
      for (const name of names) {
        const c = clips.find((clip) => clip.name === name || clip.name.includes(name));
        if (c) return c;
      }
      return undefined;
    };

    // 1. Idle (자연스럽게 서서 숨쉬는 전투 대기)
    const idleClip = cfg.idleAnim ? getClip([cfg.idleAnim]) : getClip(['Idle', 'Unarmed_Idle']);
    if (idleClip) actions.set('idle', mixer.clipAction(idleClip));

    // 2. Walk / Run (돌진 및 이동)
    const walkClip = cfg.walkAnim ? getClip([cfg.walkAnim]) : getClip(['Running_A', 'Walking_A', 'Gallop', 'Run', 'Walk']);
    if (walkClip) actions.set('walk', mixer.clipAction(walkClip));

    // 3. Attack (일반 공격 - 직업별 베기, 찌르기, 마법 발사, 주먹, 깨물기)
    let attackClip: THREE.AnimationClip | undefined;
    if (cfg.attackAnim) {
      attackClip = getClip([cfg.attackAnim]);
    }
    if (!attackClip) {
      attackClip = getClip([
        'Dualwield_Melee_Attack_Slice',
        '1H_Melee_Attack_Slice_Horizontal',
        '1H_Melee_Attack_Chop',
        '2H_Melee_Attack_Chop',
        'Spellcast_Shoot',
        'Attack'
      ]);
    }
    if (attackClip) actions.set('attack', mixer.clipAction(attackClip));

    // 4. Skill / Spell (궁극기 및 특수 스킬 모션 - 휠윈드 회전참, 유성낙하, 도약물어뜯기 등)
    let spellClip: THREE.AnimationClip | undefined;
    if (cfg.skillAnim) {
      spellClip = getClip([cfg.skillAnim]);
    }
    if (!spellClip) {
      spellClip = getClip([
        '2H_Melee_Attack_Spin',
        'Spellcast_Raise',
        'Spellcast_Long',
        '1H_Melee_Attack_Jump_Chop',
        'Dualwield_Melee_Attack_Slice',
        'Gallop_Jump'
      ]);
    }
    if (!spellClip) spellClip = attackClip;
    if (spellClip) actions.set('spell', mixer.clipAction(spellClip));

    // 5. Hit (피격 리액션)
    const hitClip = cfg.hitAnim ? getClip([cfg.hitAnim]) : getClip(['Hit_A', 'Hit_B', 'Block_Hit', 'Dragon_Hit', 'Idle_HitReact_Left']);
    if (hitClip) actions.set('hit', mixer.clipAction(hitClip));

    // 6. Death (사망 쓰러짐)
    const deathClip = cfg.deathAnim ? getClip([cfg.deathAnim]) : getClip(['Death_A', 'Death_B', 'Death_C_Skeletons', 'Death']);
    if (deathClip) actions.set('death', mixer.clipAction(deathClip));

    // 7. Stun (기절/상태이상 쓰러짐 및 기절 포즈)
    const stunClip = cfg.stunAnim ? getClip([cfg.stunAnim]) : getClip(['Lie_Idle', 'Lie_Pose', 'Lie_Down', 'Skeleton_Inactive_Standing_Pose', 'Idle_HitReact_Right', 'Hit_A']);
    if (stunClip) actions.set('stun', mixer.clipAction(stunClip));

    const idleAction = actions.get('idle');
    if (idleAction) {
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.play();
      idleAction.time = Math.random() * 2.0;
    }

    const controller: UnitAnimController = {
      mixer,
      actions,
      currentAction: idleAction || null,
      currentActionName: 'idle',
    };

    mixer.addEventListener('finished', (e: unknown) => {
      const evt = e as { action: THREE.AnimationAction };
      if (
        controller.currentAction === evt.action &&
        controller.currentActionName !== 'death' &&
        controller.currentActionName !== 'stun'
      ) {
        const nextIdle = controller.actions.get('idle');
        if (nextIdle) {
          evt.action.fadeOut(0.12);
          nextIdle.reset().fadeIn(0.12).play();
          controller.currentAction = nextIdle;
          controller.currentActionName = 'idle';
        }
      }
    });

    this.unitAnimControllers.set(instanceId, controller);
  }

  /**
   * 지정된 유닛의 애니메이션 부드러운 전환 재생 (idle/walk/attack/spell/hit/death/stun)
   */
  public playUnitAnimation(
    instanceId: string,
    actionName: 'idle' | 'walk' | 'attack' | 'spell' | 'hit' | 'death' | 'stun'
  ): void {
    const ctrl = this.unitAnimControllers.get(instanceId);
    if (!ctrl) return;
    if (ctrl.currentActionName === actionName && (actionName === 'walk' || actionName === 'idle' || actionName === 'stun')) return;
    if (ctrl.currentActionName === 'death') return;

    let targetAction = ctrl.actions.get(actionName);
    if (!targetAction && actionName === 'spell') targetAction = ctrl.actions.get('attack');
    if (!targetAction && actionName === 'walk') targetAction = ctrl.actions.get('idle');
    if (!targetAction && actionName === 'stun') targetAction = ctrl.actions.get('hit');
    if (!targetAction) return;

    const isOneShot = actionName === 'attack' || actionName === 'spell' || actionName === 'hit' || actionName === 'death';

    if (ctrl.currentAction && ctrl.currentAction !== targetAction) {
      ctrl.currentAction.fadeOut(0.12);
    }

    targetAction.reset();
    if (isOneShot) {
      targetAction.setLoop(THREE.LoopOnce, 1);
      targetAction.clampWhenFinished = true;
    } else {
      targetAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    targetAction.fadeIn(0.12).play();

    ctrl.currentAction = targetAction;
    ctrl.currentActionName = actionName;
  }

  /**
   * 챔피언 맞춤형 3D 비주얼 설정 (10대 우선 챔피언 및 시너지/역할군 지능형 매핑)
   */
  public getChampion3DConfig(unitId: string): Champion3DVisualConfig {
    if (DEDICATED_CHAMPION_3D_MAP[unitId]) {
      return DEDICATED_CHAMPION_3D_MAP[unitId];
    }

    const tpl = UNIT_TEMPLATES[unitId];
    const traits = tpl?.traits || [];
    const range = tpl?.stats?.range ?? 1;

    // 크립 및 용족
    if (unitId.startsWith('creep_') || traits.includes('DRAGONKIN')) {
      return {
        modelKey: 'Dragon',
        scale: 1.05,
        attackAnim: 'DragonArmature|DragonArmature|Dragon_Attack2',
        skillAnim: '2H_Melee_Attack_Chop',
        hitAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
        deathAnim: 'Death_A',
        stunAnim: 'DragonArmature|DragonArmature|Dragon_Hit',
        aura: 'FIRE_RED',
      };
    }

    // 언데드 진영 세분화 (마법사: Skeleton_Mage, 암살자: Skeleton_Rogue, 전사: Skeleton_Warrior)
    if (traits.includes('UNDEAD_SCOURGE')) {
      if (traits.includes('ARCHMAGE') || range >= 3) {
        return {
          modelKey: 'Skeleton_Mage',
          scale: 1.15,
          attackAnim: 'Spellcast_Shoot',
          skillAnim: 'Spellcast_Raise',
          stunAnim: 'Skeleton_Inactive_Standing_Pose',
          aura: 'SHADOW_PURPLE',
        };
      }
      if (traits.includes('SHADOW_ASSASSIN')) {
        return {
          modelKey: 'Skeleton_Rogue',
          scale: 1.12,
          attackAnim: 'Dualwield_Melee_Attack_Slice',
          skillAnim: '1H_Melee_Attack_Stab',
          stunAnim: 'Skeleton_Inactive_Standing_Pose',
          aura: 'SHADOW_PURPLE',
        };
      }
      return {
        modelKey: 'Skeleton_Warrior',
        scale: 1.15,
        attackAnim: '1H_Melee_Attack_Chop',
        skillAnim: '2H_Melee_Attack_Spin',
        deathAnim: 'Death_C_Skeletons',
        stunAnim: 'Skeleton_Inactive_Standing_Pose',
        aura: 'NONE',
      };
    }

    // 원거리 궁수 / 정찰대 (활 조준 사격 모션)
    if (traits.includes('RANGER')) {
      return {
        modelKey: 'Rogue',
        scale: 1.12,
        attackAnim: '2H_Ranged_Shoot',
        skillAnim: '1H_Ranged_Shoot',
        stunAnim: 'Lie_Idle',
        aura: traits.includes('ELVEN_SYLVAN') ? 'POISON_GREEN' : 'ARCANE_BLUE',
      };
    }

    // 마법사 및 사제 (마법 지팡이 및 주문 시전)
    if (traits.includes('ARCHMAGE') || traits.includes('ARCANE_TOWER') || range >= 3) {
      return {
        modelKey: 'Mage',
        scale: 1.15,
        attackAnim: 'Spellcast_Shoot',
        skillAnim: 'Spellcast_Raise',
        stunAnim: 'Lie_Idle',
        aura: 'ARCANE_BLUE',
      };
    }

    // 암살자 (후드 쓴 어둠의 자객)
    if (traits.includes('SHADOW_ASSASSIN')) {
      return {
        modelKey: 'Rogue_Hooded',
        scale: 1.12,
        attackAnim: 'Dualwield_Melee_Attack_Slice',
        skillAnim: '1H_Melee_Attack_Stab',
        stunAnim: 'Lie_Idle',
        aura: 'SHADOW_PURPLE',
      };
    }

    // 황금 고블린
    if (traits.includes('GOLDEN_GOBLIN')) {
      return {
        modelKey: 'Rogue',
        scale: 0.98,
        attackAnim: 'Dualwield_Melee_Attack_Slice',
        skillAnim: '1H_Melee_Attack_Slice_Horizontal',
        stunAnim: 'Lie_Idle',
        aura: 'GOBLIN_GOLD',
      };
    }

    // 광전사
    if (traits.includes('BERSERKER')) {
      return {
        modelKey: 'Barbarian',
        scale: 1.22,
        attackAnim: '1H_Melee_Attack_Chop',
        skillAnim: '2H_Melee_Attack_Spin',
        stunAnim: 'Lie_Idle',
        aura: 'FIRE_RED',
      };
    }

    // 기본: 신성 기사 / 보병
    return {
      modelKey: 'Knight',
      scale: 1.15,
      attackAnim: '1H_Melee_Attack_Slice_Horizontal',
      skillAnim: '2H_Melee_Attack_Spin',
      stunAnim: 'Lie_Idle',
      aura: traits.includes('HOLY_EMPIRE') ? 'HOLY_GOLD' : 'NONE',
    };
  }

  /**
   * 챔피언 아키타입 분류
   */
  public getChampionArchetype(unitId: string): ChampionArchetype {
    if (unitId.startsWith('creep_')) {
      return 'BEAST_GOLEM';
    }

    const tpl = UNIT_TEMPLATES[unitId];
    if (!tpl) {
      return 'WARRIOR';
    }

    const traits = tpl.traits || [];
    const range = tpl.stats?.range ?? 1;

    // 언데드
    if (traits.includes('UNDEAD_SCOURGE') || unitId.includes('skel')) {
      return 'SKELETON';
    }

    // 용족 / 크립
    if (traits.includes('DRAGONKIN') || unitId.includes('dragon')) {
      return 'BEAST_GOLEM';
    }

    // 마법사
    if (traits.includes('ARCHMAGE') || traits.includes('ARCANE_TOWER') || range >= 3) {
      return 'MAGE';
    }

    // 도적 / 암살자
    if (traits.includes('SHADOW_ASSASSIN') || traits.includes('GOLDEN_GOBLIN')) {
      return 'ROGUE';
    }

    // 광전사
    if (traits.includes('BERSERKER')) {
      return 'BRAWLER';
    }

    // 선봉대 / 기사
    return 'WARRIOR';
  }

  /**
   * 중세 석조 헥사곤 전장 타일 생성 (네온 와이어프레임 완전 철거, 자연스러운 고대 석조 대리석 재질)
   */
  private buildMedievalStoneArena(): void {
    const tileGeo = new THREE.CylinderGeometry(
      this.hexRadius,
      this.hexRadius * 0.96,
      0.38,
      6
    );

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 7; c++) {
        const isAway = r < 4;
        // 밝고 고급스러운 중세 성채 석조 바닥재 (플레이어: 산뜻한 은백색/아이보리 대리석 타일, 적: 온화한 샌드스톤 사암 타일)
        const stoneColor = isAway
          ? (r + c) % 2 === 0
            ? 0xd8caa8
            : 0xcdbe9b
          : (r + c) % 2 === 0
          ? 0xe2e8f0
          : 0xcbd5e1;

        const mat = new THREE.MeshStandardMaterial({
          color: stoneColor,
          roughness: 0.62,
          metalness: 0.12,
          flatShading: true,
        });

        const mesh = new THREE.Mesh(tileGeo, mat);
        mesh.rotation.y = Math.PI / 6;
        mesh.receiveShadow = true;

        const pos = this.hexToWorldPos(r, c);
        mesh.position.set(pos.x, 0, pos.z);
        mesh.userData = {
          type: 'HEX',
          row: r,
          col: c,
          baseColor: stoneColor,
          baseY: 0,
        };

        const key = `${r},${c}`;
        this.hexTileMeshes.set(key, mesh);
        this.tileOriginalY.set(mesh, 0);
        this.boardGroup.add(mesh);
      }
    }
  }

  /**
   * 하단 1x9 중세 석조 대기석(Bench) 단상 생성
   */
  private buildMedievalStoneBench(): void {
    const slotGeo = new THREE.BoxGeometry(1.68, 0.36, 1.68);
    const benchBaseGeo = new THREE.BoxGeometry(17.6, 0.3, 2.4);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x64748b, // 고급스러운 슬레이트 석조 베이스
      roughness: 0.75,
      metalness: 0.1,
      flatShading: true,
    });
    const baseMesh = new THREE.Mesh(benchBaseGeo, baseMat);
    baseMesh.position.set(0, -0.06, this.benchZ);
    baseMesh.receiveShadow = true;
    this.benchGroup.add(baseMesh);

    for (let i = 0; i < 9; i++) {
      const slotColor = i % 2 === 0 ? 0x94a3b8 : 0x8294aa;
      const slotMat = new THREE.MeshStandardMaterial({
        color: slotColor,
        roughness: 0.65,
        metalness: 0.15,
        flatShading: true,
      });

      const slot = new THREE.Mesh(slotGeo, slotMat);
      const slotX = (i - 4) * 1.85;
      slot.position.set(slotX, 0.08, this.benchZ);
      slot.receiveShadow = true;
      slot.userData = {
        type: 'BENCH',
        index: i,
        baseColor: slotColor,
        baseY: 0.08,
      };

      this.benchTileMeshes.set(i, slot);
      this.tileOriginalY.set(slot, 0.08);
      this.benchGroup.add(slot);
    }
  }

  /**
   * 중세 성채 야외 결투장 (초원 대지, 석조 테라스, 흉벽, 왕국 깃발 & 타오르는 횃불)
   */
  private buildColosseumSurroundingsAndTorches(): void {
    // 1. 넓게 펼쳐진 푸른 초원 대지 (야외 중세 성채 정원)
    const meadowGeo = new THREE.CylinderGeometry(55, 60, 2.0, 36);
    const meadowMat = new THREE.MeshStandardMaterial({
      color: 0x4d7c0f, // 생동감 넘치는 중세 성채 잔디
      roughness: 0.92,
      metalness: 0.05,
    });
    const meadow = new THREE.Mesh(meadowGeo, meadowMat);
    meadow.position.set(0, -1.8, 1.5);
    meadow.receiveShadow = true;
    this.environmentGroup.add(meadow);

    // 2. 웅장한 중앙 석조 성채 결투 단상 (Raised Castle Stone Terrace)
    const terraceGeo = new THREE.CylinderGeometry(23, 24.5, 1.4, 32);
    const terraceMat = new THREE.MeshStandardMaterial({
      color: 0x78716c, // 따뜻한 석조 성벽 질감
      roughness: 0.8,
      metalness: 0.1,
    });
    const terrace = new THREE.Mesh(terraceGeo, terraceMat);
    terrace.position.set(0, -0.75, 1.5);
    terrace.receiveShadow = true;
    this.environmentGroup.add(terrace);

    // 3. 성채 테라스 외곽 석조 흉벽 (Crenelated Castle Battlements)
    const battlementCount = 14;
    const battlementRadius = 22.8;
    const battlementGeo = new THREE.BoxGeometry(2.4, 1.2, 0.9);
    const battlementMat = new THREE.MeshStandardMaterial({
      color: 0x57534e,
      roughness: 0.85,
      flatShading: true,
    });
    for (let i = 0; i < battlementCount; i++) {
      const angle = (i / battlementCount) * Math.PI * 2;
      // 플레이어 정면 뷰(남쪽)는 시야 확보를 위해 흉벽을 두지 않음
      if (angle > Math.PI * 0.35 && angle < Math.PI * 0.65) continue;
      const bx = Math.sin(angle) * battlementRadius;
      const bz = Math.cos(angle) * battlementRadius + 1.5;
      const block = new THREE.Mesh(battlementGeo, battlementMat);
      block.position.set(bx, 0.3, bz);
      block.rotation.y = angle;
      block.castShadow = true;
      block.receiveShadow = true;
      this.environmentGroup.add(block);
    }

    // 4. 전장 모서리 4곳의 고대 석조 횃불 기둥 & 왕국 깃발 (Royal Banners)
    const pillarConfigs = [
      { pos: [-11.8, 0, -8.5], isAway: true },
      { pos: [11.8, 0, -8.5], isAway: true },
      { pos: [-12.2, 0, 8.5], isAway: false },
      { pos: [12.2, 0, 8.5], isAway: false },
    ];

    pillarConfigs.forEach((cfg, idx) => {
      const pillarGroup = new THREE.Group();
      pillarGroup.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

      // 석조 기둥 베이스
      const pillarGeo = new THREE.CylinderGeometry(0.65, 0.85, 3.6, 8);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x78716c,
        roughness: 0.8,
        flatShading: true,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.y = 1.8;
      pillar.castShadow = true;
      pillarGroup.add(pillar);

      // 상단 황금 장식구 (Gold Finial)
      const finialGeo = new THREE.SphereGeometry(0.35, 12, 12);
      const finialMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.8,
        roughness: 0.25,
      });
      const finial = new THREE.Mesh(finialGeo, finialMat);
      finial.position.y = 3.8;
      pillarGroup.add(finial);

      // 횃불 화로 보울 (Brazier Bowl)
      const bowlGeo = new THREE.CylinderGeometry(0.9, 0.5, 0.5, 8);
      const bowlMat = new THREE.MeshStandardMaterial({
        color: 0x44403c,
        metalness: 0.6,
        roughness: 0.4,
      });
      const bowl = new THREE.Mesh(bowlGeo, bowlMat);
      bowl.position.y = 3.4;
      pillarGroup.add(bowl);

      // 타오르는 화염 덩어리
      const flameGeo = new THREE.DodecahedronGeometry(0.4, 0);
      const flameMat = new THREE.MeshStandardMaterial({
        color: 0xff7700,
        emissive: 0xff5500,
        emissiveIntensity: 2.2,
        roughness: 0.2,
      });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.y = 3.85;
      pillarGroup.add(flame);

      // 왕국 깃발 (Banner: 내 진영 로열 블루, 적 진영 크림슨 레드)
      const bannerGeo = new THREE.PlaneGeometry(1.2, 2.2);
      const bannerMat = new THREE.MeshStandardMaterial({
        color: cfg.isAway ? 0xb91c1c : 0x1d4ed8,
        roughness: 0.7,
        side: THREE.DoubleSide,
      });
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.set(0, 1.6, cfg.isAway ? 0.9 : -0.9);
      banner.rotation.y = cfg.isAway ? 0 : Math.PI;
      pillarGroup.add(banner);

      // 따뜻한 주황빛 포인트 라이트 (Flickering Flame Light)
      const fireLight = new THREE.PointLight(0xff8822, 2.8, 20);
      fireLight.position.set(0, 4.0, 0);
      pillarGroup.add(fireLight);

      this.torchLights.push({
        light: fireLight,
        baseIntensity: 2.8,
        phase: idx * 1.5,
      });

      this.environmentGroup.add(pillarGroup);
    });

    // 5. 배경 외곽 자연 요소 (중세 상록수 몇 그루 배치로 풍성한 야외 전장 분위기 조성)
    const treePositions = [
      [-26, 0, -18],
      [-22, 0, -24],
      [24, 0, -20],
      [28, 0, -14],
      [-28, 0, 10],
      [28, 0, 12],
    ];
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 2.5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x543d2b, roughness: 0.9 });
    const foliageGeo = new THREE.ConeGeometry(2.2, 5.0, 6);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });

    treePositions.forEach((tp) => {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(tp[0], -0.8, tp[2]);

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.25;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.position.y = 4.2;
      foliage.castShadow = true;
      treeGroup.add(foliage);

      this.environmentGroup.add(treeGroup);
    });
  }

  /**
   * 2D HexCoord (row, col) -> 3D World Position (X, Z)
   */
  public hexToWorldPos(row: number, col: number): { x: number; z: number } {
    const isOdd = row % 2 === 1;
    const offsetX = isOdd ? this.hexWidth * 0.5 : 0;
    const x = (col - 3) * this.hexWidth + offsetX;
    const z = (row - 3.5) * this.rowStepZ;
    return { x, z };
  }

  /**
   * 1x9 대기석 인덱스 -> 3D World Position
   */
  public benchIndexToWorldPos(index: number): { x: number; z: number } {
    const x = (index - 4) * 1.85;
    return { x, z: this.benchZ };
  }

  /**
   * 화면 2D 논리 캔버스 좌표 (px, py) -> 3D 헥사곤 / 대기석 타일 / 유닛 레이캐스팅 검출
   */
  public screenPointTo3DTarget(
    px: number,
    py: number
  ): { kind: 'HEX'; row: number; col: number } | { kind: 'BENCH'; index: number } | null {
    const w = this.renderer.domElement.clientWidth || this.canvas.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || this.canvas.clientHeight || window.innerHeight;
    this.mouseVec.x = (px / w) * 2 - 1;
    this.mouseVec.y = -(py / h) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const allMeshes = [
      ...Array.from(this.hexTileMeshes.values()),
      ...Array.from(this.benchTileMeshes.values()),
    ];

    // 1차: 타일 직접 레이캐스팅 교차 검사
    const intersects = this.raycaster.intersectObjects(allMeshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData.type === 'HEX') {
        return { kind: 'HEX', row: hit.userData.row, col: hit.userData.col };
      }
      if (hit.userData.type === 'BENCH') {
        return { kind: 'BENCH', index: hit.userData.index };
      }
    }

    // 2차: 지면 평면(y=0) 교차점 기반 초정밀 근접 자석 스냅 (손가락 면적 오차 100% 보정)
    const groundPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, groundPoint)) {
      // A. 대기석 슬롯 근접 검사 (Z 좌표 7.5 이상)
      if (Math.abs(groundPoint.z - this.benchZ) < 1.6) {
        const rawIdx = Math.round((groundPoint.x / 1.85) + 4);
        const clampedIdx = Math.max(0, Math.min(8, rawIdx));
        return { kind: 'BENCH', index: clampedIdx };
      }

      // B. 전장 헥사곤 타일 근접 검사 (가장 가까운 헥스 중심 탐색)
      let closestDist = Infinity;
      let closestHex: { row: number; col: number } | null = null;

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 7; c++) {
          const pos = this.hexToWorldPos(r, c);
          const d = Math.hypot(groundPoint.x - pos.x, groundPoint.z - pos.z);
          if (d < closestDist) {
            closestDist = d;
            closestHex = { row: r, col: c };
          }
        }
      }

      if (closestHex && closestDist < this.hexRadius * 1.55) {
        return { kind: 'HEX', row: closestHex.row, col: closestHex.col };
      }
    }
    return null;
  }

  /** 월드 좌표 → 캔버스 정규화 비율(0~1) */
  public worldToScreenPercent(
    worldX: number,
    worldY: number,
    worldZ: number
  ): { x: number; y: number } {
    const v = new THREE.Vector3(worldX, worldY, worldZ);
    v.project(this.camera);
    return {
      x: Math.min(0.98, Math.max(0.02, (v.x + 1) * 0.5)),
      y: Math.min(0.98, Math.max(0.02, (1 - v.y) * 0.5)),
    };
  }

  /** 헥스 → 화면 % (루트 오브 배치용) */
  public hexToScreenPercent(row: number, col: number): { x: number; y: number } {
    const pos = this.hexToWorldPos(row, col);
    return this.worldToScreenPercent(pos.x, 0.6, pos.z);
  }

  /**
   * 아이템 장착용: 화면 좌표에서 가장 가까운 아군(정비 보드/대기석) 기물.
   * 전투 중에는 HOME_ 접두 클론을 원본 instanceId로 환원한다.
   */
  public findNearestUnitForItemEquip(
    px: number,
    py: number,
    candidates: Array<{ instanceId: string; row?: number; col?: number; benchIndex?: number }>,
    maxDistPx: number = 90
  ): { instanceId: string; screenX: number; screenY: number } | null {
    const w =
      this.renderer.domElement.clientWidth ||
      this.canvas.clientWidth ||
      window.innerWidth ||
      1;
    const h =
      this.renderer.domElement.clientHeight ||
      this.canvas.clientHeight ||
      window.innerHeight ||
      1;

    let best: { instanceId: string; screenX: number; screenY: number; dist: number } | null =
      null;

    for (const c of candidates) {
      let world: { x: number; z: number } | null = null;
      if (c.benchIndex !== undefined) {
        world = this.benchIndexToWorldPos(c.benchIndex);
      } else if (c.row !== undefined && c.col !== undefined) {
        world = this.hexToWorldPos(c.row, c.col);
      }
      if (!world) continue;

      const pct = this.worldToScreenPercent(world.x, 0.8, world.z);
      const sx = pct.x * w;
      const sy = pct.y * h;
      const dist = Math.hypot(px - sx, py - sy);
      if (dist <= maxDistPx && (!best || dist < best.dist)) {
        const rawId = c.instanceId.startsWith('HOME_')
          ? c.instanceId.slice('HOME_'.length)
          : c.instanceId.startsWith('AWAY_')
          ? c.instanceId.slice('AWAY_'.length)
          : c.instanceId;
        best = { instanceId: rawId, screenX: sx, screenY: sy, dist };
      }
    }
    return best
      ? {
          instanceId: best.instanceId,
          screenX: best.screenX,
          screenY: best.screenY,
        }
      : null;
  }

  /**
   * 3D 캐릭터 메시 빌더 (GLB 에셋 복제 또는 정교한 로우폴리 피규어)
   */
  public create3DChampionMesh(
    unitId: string,
    cost: CostTier,
    starLevel: StarLevel,
    instanceId?: string
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `UNIT_${unitId}`;
    const cfg = this.getChampion3DConfig(unitId);
    const archetype = this.getChampionArchetype(unitId);
    group.userData = { type: 'UNIT', instanceId, unitId, archetype, modelKey: cfg.modelKey };

    // 코스트별 팔레트 (1코: 실버/아이언, 2코: 에메랄드, 3코: 사파이어, 4코: 자수정, 5코: 황금)
    const costColors: Record<CostTier, { primary: number; trim: number; emissive: number }> = {
      1: { primary: 0x94a3b8, trim: 0x475569, emissive: 0x334155 },
      2: { primary: 0x10b981, trim: 0x065f46, emissive: 0x047857 },
      3: { primary: 0x38bdf8, trim: 0x0369a1, emissive: 0x0284c7 },
      4: { primary: 0xc084fc, trim: 0x6b21a8, emissive: 0x9333ea },
      5: { primary: 0xfacc15, trim: 0xb45309, emissive: 0xeab308 },
    };
    const palette = costColors[cost] || costColors[1];
    const scaleMultiplier = starLevel === 3 ? 1.55 : starLevel === 2 ? 1.25 : 1.0;

    // A. 만약 고품질 외부 GLB 모델이 로드되어 있다면 실제 3D 모델 복제 사용!
    const glbTemplate = this.glbLoadedTemplates.get(cfg.modelKey);
    if (glbTemplate) {
      const clonedModel = SkeletonUtils.clone(glbTemplate) as THREE.Group;
      clonedModel.name = 'GLB_MODEL_ROOT';

      // 챔피언 맞춤형 틴트 및 코스트 틴트 적용
      clonedModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.material) {
            const mat = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
            if (mat.color && cfg.primaryColor) {
              mat.color.lerp(new THREE.Color(cfg.primaryColor), 0.3);
            } else if (mat.color && cost >= 3) {
              mat.color.lerp(new THREE.Color(palette.primary), 0.25);
            }
            if (cfg.emissiveColor) {
              mat.emissive = new THREE.Color(cfg.emissiveColor);
              mat.emissiveIntensity = 0.25;
            }
            mesh.material = mat;
          }
        }
      });

      group.add(clonedModel);
      if (instanceId) {
        this.setupUnitAnimations(instanceId, clonedModel, cfg);
      }
    } else {
      // B. GLB 모델 로딩 전 또는 폴백용 세련된 판타지 미니어처 피규어 조형
      const fallbackRoot = new THREE.Group();
      fallbackRoot.name = 'FALLBACK_ROOT';

      // 머리, 투구, 눈 바이저, 흉갑, 어깨갑, 무기
      const chestGeo = new THREE.BoxGeometry(0.8, 0.95, 0.55);
      const chestMat = new THREE.MeshStandardMaterial({
        color: palette.primary,
        roughness: 0.4,
        metalness: 0.6,
      });
      const chest = new THREE.Mesh(chestGeo, chestMat);
      chest.position.y = 0.95;
      chest.castShadow = true;
      fallbackRoot.add(chest);

      const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      const headMat = new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.3, metalness: 0.7 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 1.68;
      head.castShadow = true;
      fallbackRoot.add(head);

      // 빛나는 바이저 눈
      const eyeGeo = new THREE.BoxGeometry(0.5, 0.14, 0.62);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: palette.emissive,
        emissive: palette.emissive,
        emissiveIntensity: 0.8,
      });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0, 1.68, 0.05);
      fallbackRoot.add(eye);

      // 망토 (Cape)
      const capeGeo = new THREE.BoxGeometry(0.7, 1.2, 0.08);
      const capeMat = new THREE.MeshStandardMaterial({
        color: palette.trim,
        roughness: 0.8,
      });
      const cape = new THREE.Mesh(capeGeo, capeMat);
      cape.position.set(0, 0.9, -0.32);
      cape.rotation.x = -Math.PI / 18;
      fallbackRoot.add(cape);

      // 오른손 무기
      const weaponGroup = new THREE.Group();
      weaponGroup.name = 'WEAPON_RIGHT';
      const swordGeo = new THREE.BoxGeometry(0.16, 1.4, 0.06);
      const swordMat = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        emissive: palette.emissive,
        emissiveIntensity: 0.35,
        metalness: 0.9,
      });
      const sword = new THREE.Mesh(swordGeo, swordMat);
      sword.position.y = 0.6;
      weaponGroup.add(sword);
      weaponGroup.position.set(0.65, 0.85, 0.2);
      fallbackRoot.add(weaponGroup);

      group.add(fallbackRoot);
    }

    // -------------------------------------------------------------
    // 머리 위 실시간 3D 체력바 / 마나바 / 성급 빌보드 게이지
    // -------------------------------------------------------------
    const overheadGroup = new THREE.Group();
    overheadGroup.name = 'OVERHEAD_BAR';
    overheadGroup.position.set(0, 2.45, 0);

    const hpBgGeo = new THREE.PlaneGeometry(1.4, 0.18);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const hpBg = new THREE.Mesh(hpBgGeo, hpBgMat);
    overheadGroup.add(hpBg);

    const hpFillGeo = new THREE.PlaneGeometry(1.36, 0.14);
    const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const hpFill = new THREE.Mesh(hpFillGeo, hpFillMat);
    hpFill.name = 'HP_FILL';
    hpFill.position.set(0, 0, 0.01);
    overheadGroup.add(hpFill);

    const manaBgGeo = new THREE.PlaneGeometry(1.4, 0.08);
    const manaBgMat = new THREE.MeshBasicMaterial({ color: 0x020617 });
    const manaBg = new THREE.Mesh(manaBgGeo, manaBgMat);
    manaBg.position.set(0, -0.12, 0);
    overheadGroup.add(manaBg);

    const manaFillGeo = new THREE.PlaneGeometry(1.36, 0.06);
    const manaFillMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const manaFill = new THREE.Mesh(manaFillGeo, manaFillMat);
    manaFill.name = 'MANA_FILL';
    manaFill.position.set(0, -0.12, 0.01);
    overheadGroup.add(manaFill);

    // 성급 별 표시 (1성: 1개, 2성: 2개, 3성: 3개 황금 큐브)
    const starCount = starLevel;
    const starGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const starMat = new THREE.MeshStandardMaterial({
      color: starLevel === 3 ? 0xfacc15 : starLevel === 2 ? 0xfef08a : 0x94a3b8,
      emissive: 0xfacc15,
      emissiveIntensity: starLevel === 3 ? 0.9 : 0.4,
    });
    for (let s = 0; s < starCount; s++) {
      const star = new THREE.Mesh(starGeo, starMat);
      const starX = (s - (starCount - 1) * 0.5) * 0.22;
      star.position.set(starX, 0.16, 0.02);
      overheadGroup.add(star);
    }
    group.add(overheadGroup);

    // 3성 전용 바닥 황금 룬 마법진
    if (starLevel === 3) {
      const circleGeo = new THREE.RingGeometry(1.0, 1.25, 6);
      const circleMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const circle = new THREE.Mesh(circleGeo, circleMat);
      circle.rotation.x = Math.PI / 2;
      circle.position.y = 0.05;
      circle.name = 'STAR3_RING';
      group.add(circle);
    }

    // 시너지 / 전설 챔피언 전용 고유 아우라 링 (AURA_RING)
    if (cfg.aura && cfg.aura !== 'NONE') {
      const auraColors: Record<string, number> = {
        HOLY_GOLD: 0xfacc15,
        ARCANE_BLUE: 0x38bdf8,
        SHADOW_PURPLE: 0xa855f7,
        FROST_CYAN: 0x22d3ee,
        FIRE_RED: 0xef4444,
        GOBLIN_GOLD: 0xeab308,
        POISON_GREEN: 0x10b981,
      };
      const color = auraColors[cfg.aura] || 0x38bdf8;
      const auraGeo = new THREE.RingGeometry(0.85, 1.15, 8);
      const auraMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      });
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      auraMesh.name = 'AURA_RING';
      auraMesh.rotation.x = Math.PI / 2;
      auraMesh.position.y = 0.04;
      group.add(auraMesh);
    }

    // 상태이상 기절(Stun) 회전하는 별 이펙트 (STUN_STARS)
    const stunStarsGroup = new THREE.Group();
    stunStarsGroup.name = 'STUN_STARS';
    stunStarsGroup.position.set(0, 2.2, 0);
    stunStarsGroup.visible = false;

    const stunStarGeo = new THREE.OctahedronGeometry(0.09, 0);
    const stunStarMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(stunStarGeo, stunStarMat);
      const angle = (i * Math.PI * 2) / 3;
      star.position.set(Math.cos(angle) * 0.45, Math.sin(angle * 2) * 0.06, Math.sin(angle) * 0.45);
      stunStarsGroup.add(star);
    }
    group.add(stunStarsGroup);

    group.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier);
    return group;
  }

  /**
   * 포인터 위치(논리 캔버스 px, py)를 3D 지면 평면(y=0)과 교차시켜 3D 월드 좌표 계산 (드래그 실시간 추적용)
   */
  public updateDragPointerWorldPos(px: number, py: number): void {
    const w = this.renderer.domElement.clientWidth || this.canvas.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || this.canvas.clientHeight || window.innerHeight;
    this.mouseVec.x = (px / w) * 2 - 1;
    this.mouseVec.y = -(py / h) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.currentDragWorldPos);
  }

  /**
   * 전투 틱 이벤트 스트림 인제스트
   */
  public ingestCombatEvents(events: CombatEvent[], units: CombatUnit[]): void {
    const unitMap = new Map<string, CombatUnit>();
    for (const u of units) {
      unitMap.set(u.instanceId, u);
    }

    for (const ev of events) {
      if (ev.type === 'MOVE' || ev.type === 'LEAP') {
        if (ev.sourceId && ev.fromRow !== undefined && ev.toRow !== undefined) {
          const juice = this.getOrInitJuice(ev.sourceId);
          const pFrom = this.hexToWorldPos(ev.fromRow, ev.fromCol ?? 0);
          const pTo = this.hexToWorldPos(ev.toRow, ev.toCol ?? 0);

          const dx = pTo.x - pFrom.x;
          const dz = pTo.z - pFrom.z;
          if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
            juice.facingY = Math.atan2(dx, dz);
          }
          this.playUnitAnimation(ev.sourceId, 'walk');

          if (ev.type === 'LEAP') {
            juice.isMoving = false;
            juice.leapProgress = 0.01;
            juice.leapStartPos.set(pFrom.x, 0.2, pFrom.z);
            juice.leapTargetPos.set(pTo.x, 0.2, pTo.z);
            this.spawnSparks(pFrom.x, 0.5, pFrom.z, 0x9333ea, 8);
            this.spawnSparks(pTo.x, 0.5, pTo.z, 0xc084fc, 12);
          } else {
            juice.isMoving = true;
            juice.moveFrom.set(pFrom.x, 0.2, pFrom.z);
            juice.moveTo.set(pTo.x, 0.2, pTo.z);
            juice.moveElapsedMs = 0;
            juice.moveDurationMs = Math.max(420, ev.durationMs ?? 700);
          }
        }
      } else if (ev.type === 'BASIC_ATTACK' || ev.type === 'SKILL_CAST') {
        if (ev.sourceId) {
          const juice = this.getOrInitJuice(ev.sourceId);
          const attacker = unitMap.get(ev.sourceId);
          const isSkill = ev.type === 'SKILL_CAST';

          juice.lungeMaxMs = isSkill ? 240 : 160;
          juice.lungeTimerMs = juice.lungeMaxMs;
          this.playUnitAnimation(ev.sourceId, isSkill ? 'spell' : 'attack');

          if (ev.fromRow !== undefined && ev.toRow !== undefined) {
            const pFrom = this.hexToWorldPos(ev.fromRow, ev.fromCol ?? 0);
            const pTo = this.hexToWorldPos(ev.toRow, ev.toCol ?? 0);
            const dx = pTo.x - pFrom.x;
            const dz = pTo.z - pFrom.z;
            const len = Math.max(0.1, Math.hypot(dx, dz));
            juice.lungeDirX = (dx / len) * (isSkill ? 0.6 : 0.4);
            juice.lungeDirZ = (dz / len) * (isSkill ? 0.6 : 0.4);
            juice.facingY = Math.atan2(dx, dz);

            const isRanged = attacker && attacker.range > 1;
            if (isRanged) {
              const archetype = attacker ? this.getChampionArchetype(attacker.unitId) : 'WARRIOR';
              const projKind = archetype === 'WARRIOR' || archetype === 'ROGUE' ? 'ARROW' : 'MAGIC_ORB';
              this.spawn3DProjectile(pFrom.x, 1.3, pFrom.z, pTo.x, 1.1, pTo.z, projKind);
            }
          }
        }
      } else if (ev.type === 'DAMAGE') {
        if (ev.targetId) {
          const juice = this.getOrInitJuice(ev.targetId);
          juice.hitFlashTimerMs = 180;
          this.playUnitAnimation(ev.targetId, 'hit');

          const targetUnit = unitMap.get(ev.targetId);
          if (targetUnit) {
            const p = this.hexToWorldPos(targetUnit.row, targetUnit.col);
            const amount = Math.round(ev.amount ?? 0);
            const isCrit = !!ev.isCrit;
            const text = isCrit ? `⚡${amount}!` : `${amount}`;
            const color = isCrit ? '#f97316' : '#f1f5f9';

            this.spawn3DFloatingPopup(
              new THREE.Vector3(p.x, 2.5, p.z),
              text,
              color,
              isCrit
            );
            this.spawnSparks(p.x, 1.2, p.z, isCrit ? 0xf59e0b : 0xef4444, isCrit ? 10 : 5);
          }
        }
      } else if (ev.type === 'HEAL' || ev.type === 'SHIELD') {
        if (ev.targetId) {
          const targetUnit = unitMap.get(ev.targetId);
          if (targetUnit) {
            const p = this.hexToWorldPos(targetUnit.row, targetUnit.col);
            const amount = Math.round(ev.amount ?? 0);
            const isHeal = ev.type === 'HEAL';
            const text = isHeal ? `+${amount}` : `🛡️${amount}`;
            const color = isHeal ? '#22c55e' : '#38bdf8';
            this.spawn3DFloatingPopup(new THREE.Vector3(p.x, 2.5, p.z), text, color, false);
          }
        }
      } else if (ev.type === 'STUN') {
        if (ev.targetId) {
          this.playUnitAnimation(ev.targetId, 'stun');
          const targetUnit = unitMap.get(ev.targetId);
          if (targetUnit) {
            const p = this.hexToWorldPos(targetUnit.row, targetUnit.col);
            this.spawn3DFloatingPopup(new THREE.Vector3(p.x, 2.8, p.z), '💫 기절!', '#facc15', true);
            this.spawnSparks(p.x, 2.2, p.z, 0xfacc15, 8);
          }
        }
      } else if (ev.type === 'DEATH') {
        if (ev.targetId) {
          this.playUnitAnimation(ev.targetId, 'death');
        }
      } else if (ev.type === 'FIVE_COST_3STAR_CATACLYSM') {
        this.triggerImpactShake(18, 600);
        this.spawn3DFloatingPopup(
          new THREE.Vector3(0, 4.0, 0),
          '⚡ 99,999! 5코 3성 절대 권능! ⚡',
          '#facc15',
          true
        );
      }
    }
  }

  private spawn3DProjectile(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    kind: 'ARROW' | 'MAGIC_ORB'
  ): void {
    const group = new THREE.Group();
    if (kind === 'ARROW') {
      const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.85, 4);
      const shaftMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 0.8,
      });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);
    } else {
      const orbGeo = new THREE.SphereGeometry(0.26, 8, 8);
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.5,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      group.add(orb);
    }

    group.position.set(x1, y1, z1);
    this.projectilesGroup.add(group);

    this.activeProjectiles.push({
      mesh: group,
      startPos: new THREE.Vector3(x1, y1, z1),
      targetPos: new THREE.Vector3(x2, y2, z2),
      elapsedMs: 0,
      durationMs: 280,
      arcHeight: 1.2,
      kind,
    });
  }

  public spawn3DFloatingPopup(
    worldPos: THREE.Vector3,
    text: string,
    color: string,
    isCrit: boolean
  ): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = isCrit
      ? '900 48px Impact, system-ui, sans-serif'
      : 'bold 38px Impact, system-ui, sans-serif';

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 128, 64);

    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    const spriteScale = isCrit ? 2.2 : 1.7;
    sprite.scale.set(spriteScale, spriteScale * 0.5, 1);
    sprite.position.copy(worldPos);

    this.popupsGroup.add(sprite);

    this.activePopups.push({
      sprite,
      startPos: worldPos.clone(),
      elapsedMs: 0,
      durationMs: 650,
      riseSpeed: 1.6,
    });
  }

  private spawnSparks(x: number, y: number, z: number, color: number, count: number): void {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.vfxGroup.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        2.5 + Math.random() * 3.0,
        Math.sin(angle) * speed
      );

      this.activeSparks.push({
        mesh,
        vel,
        lifeMs: 0,
        maxLifeMs: 350 + Math.random() * 200,
      });
    }
  }

  private getOrInitJuice(instanceId: string): UnitJuice3D {
    let juice = this.unitJuiceMap.get(instanceId);
    if (!juice) {
      juice = {
        facingY: 0,
        lungeTimerMs: 0,
        lungeMaxMs: 160,
        lungeDirX: 0,
        lungeDirZ: 0,
        hitFlashTimerMs: 0,
        leapProgress: 0,
        leapStartPos: new THREE.Vector3(),
        leapTargetPos: new THREE.Vector3(),
        moveFrom: new THREE.Vector3(),
        moveTo: new THREE.Vector3(),
        moveElapsedMs: 0,
        moveDurationMs: 700,
        isMoving: false,
      };
      this.unitJuiceMap.set(instanceId, juice);
    }
    return juice;
  }

  public triggerImpactShake(intensity: number, durationMs: number): void {
    this.shakeIntensity = intensity * 0.04;
    this.shakeRemainingMs = durationMs;
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * 메인 3D 렌더링 프레임 루프
   */
  public renderFrame(dtMs: number, state: RenderState3D): void {
    this.animClockMs += dtMs;

    // 0. 실시간 스켈레탈 골격 애니메이션 믹서 갱신
    const dtSec = dtMs * 0.001;
    for (const ctrl of this.unitAnimControllers.values()) {
      ctrl.mixer.update(dtSec);
    }

    // 1. 카메라 쉐이크 연산 (직관적인 고각 탑다운 쿼터뷰 앵글 유지)
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (this.shakeRemainingMs > 0) {
      this.shakeRemainingMs = Math.max(0, this.shakeRemainingMs - dtMs);
      const decay = this.shakeRemainingMs / 200;
      shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * decay;
      shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * decay;
    }
    this.camera.position.x = shakeOffsetX;
    this.camera.position.y = 15.2 + shakeOffsetY;
    this.camera.position.z = 14.0;
    this.camera.lookAt(0, 0, 1.0);

    // 2. 판타지 횃불 깜빡임 (Flickering Torches)
    this.torchLights.forEach((t) => {
      const flicker = Math.sin(this.animClockMs * 0.008 + t.phase) * 0.4 +
                      Math.cos(this.animClockMs * 0.017 + t.phase) * 0.2;
      t.light.intensity = Math.max(1.2, t.baseIntensity + flicker);
    });

    // 3. 호버링/드래그 타일 물리적 엘리베이션 리프트 (Elevation Lift) & 황금 룬 반응
    for (const [key, mesh] of this.hexTileMeshes) {
      const isHovered =
        state.hoveredHex &&
        `${state.hoveredHex.row},${state.hoveredHex.col}` === key;
      const mat = mesh.material as THREE.MeshStandardMaterial;

      if (isHovered) {
        // 타일이 자석처럼 붕 떠오르고 황금 룬 발광
        mesh.position.y += (0.16 - mesh.position.y) * 0.35;
        mat.emissive.setHex(0xf59e0b);
        mat.emissiveIntensity = 0.65;
      } else {
        mesh.position.y += (0 - mesh.position.y) * 0.25;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    for (const [idx, mesh] of this.benchTileMeshes) {
      const isHovered = state.hoveredBenchIndex === idx;
      const mat = mesh.material as THREE.MeshStandardMaterial;

      if (isHovered) {
        mesh.position.y += (0.24 - mesh.position.y) * 0.35;
        mat.emissive.setHex(0x38bdf8);
        mat.emissiveIntensity = 0.7;
      } else {
        mesh.position.y += (0.08 - mesh.position.y) * 0.25;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    // 4. 유닛 동기화 및 3D 1:1 드래그 물리 모션 갱신
    this.syncUnits3D(dtMs, state);

    // 5. 투사체 & 팝업 & 스파크 업데이트
    this.updateProjectiles(dtMs);
    this.updatePopups(dtMs);
    this.updateSparks(dtMs);

    this.renderer.render(this.scene, this.camera);
  }

  private updateProjectiles(dtMs: number): void {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      p.elapsedMs += dtMs;
      const t = Math.min(1.0, p.elapsedMs / p.durationMs);

      const curX = p.startPos.x + (p.targetPos.x - p.startPos.x) * t;
      const curZ = p.startPos.z + (p.targetPos.z - p.startPos.z) * t;
      const curY =
        p.startPos.y +
        (p.targetPos.y - p.startPos.y) * t +
        Math.sin(t * Math.PI) * p.arcHeight;

      p.mesh.position.set(curX, curY, curZ);

      if (p.kind === 'ARROW') {
        p.mesh.lookAt(p.targetPos.x, p.targetPos.y, p.targetPos.z);
      }

      if (t >= 1.0) {
        this.spawnSparks(p.targetPos.x, p.targetPos.y, p.targetPos.z, 0xfacc15, 6);
        this.projectilesGroup.remove(p.mesh);
        this.activeProjectiles.splice(i, 1);
      }
    }
  }

  private updatePopups(dtMs: number): void {
    for (let i = this.activePopups.length - 1; i >= 0; i--) {
      const pop = this.activePopups[i];
      pop.elapsedMs += dtMs;
      const t = pop.elapsedMs / pop.durationMs;

      if (t >= 1.0) {
        this.popupsGroup.remove(pop.sprite);
        if (pop.sprite.material.map) pop.sprite.material.map.dispose();
        pop.sprite.material.dispose();
        this.activePopups.splice(i, 1);
        continue;
      }

      pop.sprite.position.y = pop.startPos.y + (t * pop.riseSpeed);
      pop.sprite.material.opacity = 1.0 - t * t;
    }
  }

  private updateSparks(dtMs: number): void {
    const dtSec = dtMs * 0.001;
    for (let i = this.activeSparks.length - 1; i >= 0; i--) {
      const s = this.activeSparks[i];
      s.lifeMs += dtMs;
      if (s.lifeMs >= s.maxLifeMs) {
        this.vfxGroup.remove(s.mesh);
        this.activeSparks.splice(i, 1);
        continue;
      }

      s.vel.y -= 9.8 * dtSec;
      s.mesh.position.x += s.vel.x * dtSec;
      s.mesh.position.y += s.vel.y * dtSec;
      s.mesh.position.z += s.vel.z * dtSec;

      const scale = 1.0 - s.lifeMs / s.maxLifeMs;
      s.mesh.scale.set(scale, scale, scale);
    }
  }

  /**
   * 유닛 3D 씬 오브젝트 동기화 & 1:1 손가락 추적 3D 드래그 모션
   */
  private syncUnits3D(dtMs: number, state: RenderState3D): void {
    const activeIds = new Set<string>();

    if (state.inCombat) {
      for (const cu of state.combatUnits) {
        if (cu.currentHp <= 0) continue;
        activeIds.add(cu.instanceId);

        let group = this.unitMeshesMap.get(cu.instanceId);
        if (!group) {
          group = this.create3DChampionMesh(cu.unitId, cu.cost, cu.starLevel, cu.instanceId);
          this.unitMeshesMap.set(cu.instanceId, group);
          this.unitsGroup.add(group);
        }

        const juice = this.getOrInitJuice(cu.instanceId);
        const targetPos = this.hexToWorldPos(cu.row, cu.col);

        let lungeOffsetX = 0;
        let lungeOffsetZ = 0;
        if (juice.lungeTimerMs > 0) {
          juice.lungeTimerMs = Math.max(0, juice.lungeTimerMs - dtMs);
          const ratio = Math.sin((juice.lungeTimerMs / juice.lungeMaxMs) * Math.PI);
          lungeOffsetX = juice.lungeDirX * ratio;
          lungeOffsetZ = juice.lungeDirZ * ratio;
        }

        if (juice.leapProgress > 0 && juice.leapProgress < 1.0) {
          juice.leapProgress = Math.min(1.0, juice.leapProgress + dtMs * 0.0026);
          const lp = juice.leapProgress;
          const lx = juice.leapStartPos.x + (juice.leapTargetPos.x - juice.leapStartPos.x) * lp;
          const lz = juice.leapStartPos.z + (juice.leapTargetPos.z - juice.leapStartPos.z) * lp;
          const ly = juice.leapStartPos.y + Math.sin(lp * Math.PI) * 2.8;
          group.position.set(lx, ly, lz);
          this.playUnitAnimation(cu.instanceId, 'walk');
        } else if (juice.isMoving) {
          juice.moveElapsedMs += dtMs;
          const t = Math.min(1, juice.moveElapsedMs / juice.moveDurationMs);
          // ease-out cubic — 착지감 유지하면서 순간이동 방지
          const ease = 1 - Math.pow(1 - t, 3);
          const prevX = group.position.x;
          const prevZ = group.position.z;
          group.position.x =
            juice.moveFrom.x + (juice.moveTo.x - juice.moveFrom.x) * ease + lungeOffsetX;
          group.position.z =
            juice.moveFrom.z + (juice.moveTo.z - juice.moveFrom.z) * ease + lungeOffsetZ;
          group.position.y = 0.2 + Math.sin(this.animClockMs * 0.005 + cu.row) * 0.05;
          if (t >= 1) juice.isMoving = false;

          const isStunned = (cu.stunTimerMs ?? 0) > 0;
          const distMoved = Math.hypot(group.position.x - prevX, group.position.z - prevZ);
          if (isStunned) {
            this.playUnitAnimation(cu.instanceId, 'stun');
          } else if (distMoved > 0.01) {
            this.playUnitAnimation(cu.instanceId, 'walk');
          }
        } else {
          const prevX = group.position.x;
          const prevZ = group.position.z;
          // 정착 스냅만 부드럽게 (이동 자체는 MOVE 보간으로 처리)
          group.position.x += (targetPos.x + lungeOffsetX - group.position.x) * 0.12;
          group.position.z += (targetPos.z + lungeOffsetZ - group.position.z) * 0.12;
          group.position.y = 0.2 + Math.sin(this.animClockMs * 0.005 + cu.row) * 0.05;

          const isStunned = (cu.stunTimerMs ?? 0) > 0;
          const distMoved = Math.hypot(group.position.x - prevX, group.position.z - prevZ);
          const distToTarget = Math.hypot(targetPos.x - group.position.x, targetPos.z - group.position.z);

          if (isStunned) {
            this.playUnitAnimation(cu.instanceId, 'stun');
          } else if (distToTarget > 0.18 && distMoved > 0.02) {
            this.playUnitAnimation(cu.instanceId, 'walk');
          } else {
            const ctrl = this.unitAnimControllers.get(cu.instanceId);
            if (ctrl && (ctrl.currentActionName === 'walk' || ctrl.currentActionName === 'stun')) {
              this.playUnitAnimation(cu.instanceId, 'idle');
            }
          }
        }

        // 기절(Stun) 회전하는 별 이펙트 제어
        const isStunned = (cu.stunTimerMs ?? 0) > 0;
        const stunStars = group.getObjectByName('STUN_STARS');
        if (stunStars) {
          stunStars.visible = isStunned;
          if (isStunned) {
            stunStars.rotation.y += dtMs * 0.008;
          }
        }

        // 고유 아우라 링 회전
        const auraRing = group.getObjectByName('AURA_RING');
        if (auraRing) {
          auraRing.rotation.z += dtMs * 0.002;
        }

        // 라운드 진행 중: 적군을 향해 180도 돌아서 전투 (가장 가까운 적을 직접 바라봄)
        let targetRotY = cu.team === 'HOME' ? Math.PI : 0;
        let closestDist = Infinity;
        let closestEnemy: CombatUnit | null = null;
        for (const other of state.combatUnits) {
          if (other.team !== cu.team && other.currentHp > 0) {
            const d = Math.hypot(other.row - cu.row, other.col - cu.col);
            if (d < closestDist) {
              closestDist = d;
              closestEnemy = other;
            }
          }
        }
        if (closestEnemy) {
          const tPos = this.hexToWorldPos(closestEnemy.row, closestEnemy.col);
          const dx = tPos.x - group.position.x;
          const dz = tPos.z - group.position.z;
          if (Math.hypot(dx, dz) > 0.15) {
            targetRotY = Math.atan2(dx, dz);
          }
        }
        let rotDiff = targetRotY - group.rotation.y;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        group.rotation.y += rotDiff * 0.2;
        group.rotation.x = 0;

        const star3Ring = group.getObjectByName('STAR3_RING');
        if (star3Ring) {
          star3Ring.rotation.z += 0.03;
        }

        const overhead = group.getObjectByName('OVERHEAD_BAR');
        if (overhead) {
          overhead.quaternion.copy(this.camera.quaternion);

          const hpRatio = Math.max(0, Math.min(1, cu.currentHp / Math.max(1, cu.maxHp)));
          const hpFill = overhead.getObjectByName('HP_FILL') as THREE.Mesh;
          if (hpFill) {
            hpFill.scale.x = hpRatio;
            hpFill.position.x = -(1.36 * (1 - hpRatio) * 0.5);
          }

          const manaRatio = Math.max(0, Math.min(1, cu.currentMana / Math.max(1, cu.maxMana)));
          const manaFill = overhead.getObjectByName('MANA_FILL') as THREE.Mesh;
          if (manaFill) {
            manaFill.scale.x = manaRatio;
            manaFill.position.x = -(1.36 * (1 - manaRatio) * 0.5);
          }
        }
      }
    } else {
      // 정비 페이즈: 보드 위 기물
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 7; c++) {
          const u = state.viewedParticipant.board[r][c];
          if (!u) continue;
          activeIds.add(u.instanceId);

          let group = this.unitMeshesMap.get(u.instanceId);
          if (!group) {
            group = this.create3DChampionMesh(u.unitId, u.cost, u.starLevel, u.instanceId);
            this.unitMeshesMap.set(u.instanceId, group);
            this.unitsGroup.add(group);
          }

          const targetPos = this.hexToWorldPos(r + 4, c);
          const isDragged = state.isDraggingUnit && state.draggedInstanceId === u.instanceId;

          if (isDragged) {
            // [TFT 극상 조작감] 손가락 위치(currentDragWorldPos)를 1:1로 리얼타임 부드럽게 추종하며 공중에 둥실 뜸
            group.position.x += (this.currentDragWorldPos.x - group.position.x) * 0.45;
            group.position.z += (this.currentDragWorldPos.z - group.position.z) * 0.45;
            group.position.y += (1.45 - group.position.y) * 0.35;
            this.playUnitAnimation(u.instanceId, 'walk');
          } else {
            group.position.x += (targetPos.x - group.position.x) * 0.28;
            group.position.z += (targetPos.z - group.position.z) * 0.28;
            group.position.y += (0.2 - group.position.y) * 0.28;
            this.playUnitAnimation(u.instanceId, 'idle');
          }
          // 정비 페이즈: 플레이어(카메라)를 향해 정면(0도)을 바라보고, 시선을 살짝 들어 카메라와 눈맞춤 (얼굴이 또렷하게 보임)
          let rotDiff = 0 - group.rotation.y;
          while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
          while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
          group.rotation.y += rotDiff * 0.18;
          group.rotation.x = -0.06;

          const auraRing = group.getObjectByName('AURA_RING');
          if (auraRing) auraRing.rotation.z += dtMs * 0.002;
          const star3Ring = group.getObjectByName('STAR3_RING');
          if (star3Ring) star3Ring.rotation.z += 0.03;

          const overhead = group.getObjectByName('OVERHEAD_BAR');
          if (overhead) {
            overhead.quaternion.copy(this.camera.quaternion);
          }
        }
      }

      // 대기석 위 기물
      for (let i = 0; i < state.viewedParticipant.bench.length; i++) {
        const u = state.viewedParticipant.bench[i];
        if (!u) continue;
        activeIds.add(u.instanceId);

        let group = this.unitMeshesMap.get(u.instanceId);
        if (!group) {
          group = this.create3DChampionMesh(u.unitId, u.cost, u.starLevel, u.instanceId);
          this.unitMeshesMap.set(u.instanceId, group);
          this.unitsGroup.add(group);
        }

        const targetPos = this.benchIndexToWorldPos(i);
        const isDragged = state.isDraggingUnit && state.draggedInstanceId === u.instanceId;

        if (isDragged) {
          group.position.x += (this.currentDragWorldPos.x - group.position.x) * 0.45;
          group.position.z += (this.currentDragWorldPos.z - group.position.z) * 0.45;
          group.position.y += (1.45 - group.position.y) * 0.35;
          this.playUnitAnimation(u.instanceId, 'walk');
        } else {
          group.position.x += (targetPos.x - group.position.x) * 0.28;
          group.position.z += (targetPos.z - group.position.z) * 0.28;
          group.position.y += (0.25 - group.position.y) * 0.28;
          this.playUnitAnimation(u.instanceId, 'idle');
        }
        // 대기석: 항상 플레이어(카메라)를 향해 정면(0도)을 바라보고, 시선을 살짝 들어 눈맞춤
        let rotDiff = 0 - group.rotation.y;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        group.rotation.y += rotDiff * 0.18;
        group.rotation.x = -0.06;

        const auraRing = group.getObjectByName('AURA_RING');
        if (auraRing) auraRing.rotation.z += dtMs * 0.002;
        const star3Ring = group.getObjectByName('STAR3_RING');
        if (star3Ring) star3Ring.rotation.z += 0.03;

        const overhead = group.getObjectByName('OVERHEAD_BAR');
        if (overhead) {
          overhead.quaternion.copy(this.camera.quaternion);
        }
      }
    }

    // 소멸된 기물 제거 및 믹서 정리
    for (const [id, group] of this.unitMeshesMap) {
      if (!activeIds.has(id)) {
        this.unitsGroup.remove(group);
        this.unitMeshesMap.delete(id);
        this.unitJuiceMap.delete(id);
        const ctrl = this.unitAnimControllers.get(id);
        if (ctrl) {
          ctrl.mixer.stopAllAction();
          this.unitAnimControllers.delete(id);
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 3D 챔피언 초상화 오프스크린 렌더링 시스템
  // -------------------------------------------------------------

  /**
   * 챔피언의 실제 3D 모델(GLB)을 스튜디오 조명 하에서 3/4 앵글로 촬영하여 2D 캔버스로 캐싱
   */
  public getOrCreateChampion3DPortrait(unitId: string, cost: CostTier): HTMLCanvasElement | null {
    if (this.champion3DPortraitCache.has(unitId)) {
      return this.champion3DPortraitCache.get(unitId)!;
    }

    const cfg = this.getChampion3DConfig(unitId);
    const glbTemplate = this.glbLoadedTemplates.get(cfg.modelKey);
    if (!glbTemplate) {
      return null;
    }

    if (!this.portraitRenderer) {
      this.portraitCanvas = document.createElement('canvas');
      this.portraitCanvas.width = 192;
      this.portraitCanvas.height = 148;
      this.portraitRenderer = new THREE.WebGLRenderer({
        canvas: this.portraitCanvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      this.portraitRenderer.setPixelRatio(1);
      this.portraitRenderer.setSize(192, 148, false);
      this.portraitRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.portraitRenderer.toneMappingExposure = 1.35;

      this.portraitScene = new THREE.Scene();

      // 영웅 초상화 스튜디오 조명
      const ambLight = new THREE.AmbientLight(0xffffff, 1.5);
      this.portraitScene.add(ambLight);

      const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.4);
      keyLight.position.set(2.5, 4, 3.5);
      this.portraitScene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x67e8f9, 1.8);
      rimLight.position.set(-2.5, 2.5, -2);
      this.portraitScene.add(rimLight);

      const fillLight = new THREE.DirectionalLight(0xfef08a, 1.0);
      fillLight.position.set(0, -1.5, 2);
      this.portraitScene.add(fillLight);

      this.portraitCamera = new THREE.PerspectiveCamera(38, 192 / 148, 0.1, 50);
    }

    // 챔피언 모델 클론 및 재질 세팅
    const cloned = SkeletonUtils.clone(glbTemplate) as THREE.Group;
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        if (m.material) {
          const mat = (m.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
          if (mat.color && cfg.primaryColor) {
            mat.color.lerp(new THREE.Color(cfg.primaryColor), 0.35);
          }
          if (cfg.emissiveColor) {
            mat.emissive = new THREE.Color(cfg.emissiveColor);
            mat.emissiveIntensity = 0.45;
          }
          mat.roughness = 0.45;
          mat.metalness = 0.35;
          m.material = mat;
        }
      }
    });

    // 1) 아이들 애니메이션 적용 (자연스러운 포즈로 셋업)
    const animList = this.glbAnimations.get(cfg.modelKey);
    if (animList && animList.length > 0) {
      const idleClip = animList.find(
        (a) =>
          a.name === (cfg.idleAnim || 'Idle') ||
          a.name.includes('Idle') ||
          a.name.includes('idle')
      );
      if (idleClip) {
        const mixer = new THREE.AnimationMixer(cloned);
        const act = mixer.clipAction(idleClip);
        act.play();
        mixer.update(0.35);
      }
    }

    // 2) 챔피언 모델별 자연스러운 3/4 얼짱 각도 회전
    cloned.position.set(0, 0, 0);
    cloned.rotation.y = -0.32;
    if (cfg.modelKey === 'Dragon') cloned.rotation.y = -0.42;
    else if (cfg.modelKey === 'Wolf') cloned.rotation.y = -0.46;
    else if (cfg.modelKey === 'Imp') cloned.rotation.y = -0.28;

    // 3) Three.js Box3로 모델의 실제 3D 크기 및 중심점을 완벽하게 측정
    cloned.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // 4) 가로/세로/대각선 어느 방향으로도 잘리지 않도록 넉넉한 여백(패딩)을 두고 카메라 거리 자동 계산
    const aspect = 192 / 148;
    const fov = 34;
    this.portraitCamera!.fov = fov;
    this.portraitCamera!.aspect = aspect;
    this.portraitCamera!.updateProjectionMatrix();

    const fovRad = (fov * Math.PI) / 180;
    // 패딩 비율 1.45: 상하좌우에 넉넉한 여백을 두어 거대 무기, 날개, 투구 뿔, 발끝까지 온전히 다 보이도록 함
    const padding = 1.45;
    const distH = (Math.max(1.2, size.y) * 0.5 * padding) / Math.tan(fovRad / 2);
    const distW = (Math.max(1.0, size.x) * 0.5 * padding) / (Math.tan(fovRad / 2) * aspect);
    const camDist = Math.max(distH, distW, size.z * 1.35, 3.8);

    // 카메라 시선: 캐릭터의 중심점을 정면에서 약간 위로 자연스럽게 바라봄
    const lookTargetY = center.y > 0 ? center.y : 0.9;
    this.portraitCamera!.position.set(0, lookTargetY + camDist * 0.12, camDist);
    this.portraitCamera!.lookAt(0, lookTargetY, 0);

    this.portraitScene!.add(cloned);
    this.portraitRenderer.render(this.portraitScene!, this.portraitCamera!);
    this.portraitScene!.remove(cloned);

    // 2D 캔버스로 영구 캐싱
    const cachedCanvas = document.createElement('canvas');
    cachedCanvas.width = 192;
    cachedCanvas.height = 148;
    const cCtx = cachedCanvas.getContext('2d')!;
    cCtx.drawImage(this.portraitCanvas!, 0, 0);

    this.champion3DPortraitCache.set(unitId, cachedCanvas);
    return cachedCanvas;
  }

  /**
   * 3D 모드 상점 카드 초상화 렌더링
   */
  public renderShopCardPortrait3D(
    portraitCanvas: HTMLCanvasElement,
    unitId: string,
    cost: CostTier,
    isCanUpgrade: boolean
  ): void {
    const dpr = 2;
    const logicalW = 96;
    const logicalH = 74;
    portraitCanvas.width = logicalW * dpr;
    portraitCanvas.height = logicalH * dpr;

    const pCtx = portraitCanvas.getContext('2d')!;
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pCtx.imageSmoothingEnabled = true;

    const spec = UNIT_PIXEL_SPECS[unitId] ?? UNIT_PIXEL_SPECS.u1_garen;

    // 1) 3D 전용 프리미엄 다크 메탈릭 그라데이션 배경
    const costThemes: Record<number, { bgTop: string; bgBottom: string; ringColor: string }> = {
      1: { bgTop: '#1e293b', bgBottom: '#090d16', ringColor: '#94a3b8' },
      2: { bgTop: '#14532d', bgBottom: '#052e16', ringColor: '#22c55e' },
      3: { bgTop: '#0369a1', bgBottom: '#082f49', ringColor: '#38bdf8' },
      4: { bgTop: '#581c87', bgBottom: '#2e1065', ringColor: '#c084fc' },
      5: { bgTop: '#78350f', bgBottom: '#451a03', ringColor: '#facc15' },
    };
    const theme = costThemes[cost] || costThemes[1];

    const bgGrad = pCtx.createRadialGradient(
      logicalW * 0.5,
      logicalH * 0.55,
      8,
      logicalW * 0.5,
      logicalH * 0.52,
      logicalW * 0.72
    );
    bgGrad.addColorStop(0, theme.bgTop);
    bgGrad.addColorStop(0.65, theme.bgBottom);
    bgGrad.addColorStop(1, '#05070c');
    pCtx.fillStyle = bgGrad;
    pCtx.fillRect(0, 0, logicalW, logicalH);

    // 2) 바닥 3D 룬 서클 패드 (Subtle 3D Halo)
    pCtx.strokeStyle = theme.ringColor;
    pCtx.lineWidth = 1.2;
    pCtx.globalAlpha = 0.45;
    pCtx.beginPath();
    pCtx.ellipse(logicalW * 0.5, logicalH * 0.88, 28, 7, 0, 0, Math.PI * 2);
    pCtx.stroke();
    pCtx.globalAlpha = 1.0;

    // 3) 2성/3성 합성 가능 시 골드 후광 링
    if (isCanUpgrade) {
      pCtx.strokeStyle = 'rgba(255, 234, 0, 0.75)';
      pCtx.lineWidth = 2.2;
      pCtx.beginPath();
      pCtx.arc(logicalW * 0.5, logicalH * 0.52, 28, 0, Math.PI * 2);
      pCtx.stroke();
    }

    // 4) 3D 챔피언 스냅샷 렌더링
    const cached3D = this.getOrCreateChampion3DPortrait(unitId, cost);
    if (cached3D) {
      pCtx.drawImage(cached3D, 0, 0, logicalW, logicalH);
    } else {
      pCtx.fillStyle = '#64748b';
      pCtx.font = '24px sans-serif';
      pCtx.textAlign = 'center';
      pCtx.textBaseline = 'middle';
      pCtx.fillText('⏳', logicalW * 0.5, logicalH * 0.5);
    }

    // 5) 좌측 상단 "3D" 크리스탈 입체 뱃지
    pCtx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    pCtx.beginPath();
    pCtx.roundRect(4, 4, 23, 13, 3);
    pCtx.fill();
    pCtx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    pCtx.lineWidth = 1;
    pCtx.stroke();
    pCtx.fillStyle = '#38bdf8';
    pCtx.font = 'bold 8px sans-serif';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.fillText('3D', 15.5, 11);

    // 6) 우측 상단 무기 아이콘
    const weaponIcon = WEAPON_BADGE_ICONS[spec.weapon] ?? '⚔️';
    pCtx.font = '12px sans-serif';
    pCtx.textAlign = 'right';
    pCtx.textBaseline = 'alphabetic';
    pCtx.globalAlpha = 0.88;
    pCtx.fillText(weaponIcon, logicalW - 5, 15);
    pCtx.globalAlpha = 1.0;
  }

  /**
   * 툴팁 및 상세 정보 패널용 3D 초상화 DataURL 반환
   */
  public getChampion3DPortraitDataUrl(unitId: string, cost: CostTier): string | null {
    const cached = this.getOrCreateChampion3DPortrait(unitId, cost);
    if (!cached) return null;
    return cached.toDataURL();
  }
}

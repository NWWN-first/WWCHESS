import { UNIT_TEMPLATES } from '../GameData/units';
import { Participant } from '../Participant';
import { SET6_SKILL_BEHAVIOR, Set6SkillBehavior } from './set6SkillBehaviors';

/** Skill-pattern placement tags for Set 6 bot board heuristics (no skill prose at runtime). */
export type BoardPlacementTag =
  | 'BACKLINE_CARRY'
  | 'SNIPER'
  | 'ASSASSIN_DIVE'
  | 'FRONT_TANK'
  | 'FRONT_CC'
  | 'MIDLINE_BRUISER'
  | 'ENCHANTER_BACK';

const CC_BEHAVIORS = new Set<Set6SkillBehavior>([
  'hook_farthest_stun',
  'shield_stun',
  'aoe_stun_shield',
  'charge_knockup',
  'dash_shield_stun',
  'stun_bomb_adjacent',
  'root_sleep',
  'devour',
  'fling_adjacent',
  'hook_lowest_armor',
  'rupture_aoe',
  'taunt_slash_aoe',
]);

const SNIPER_BEHAVIORS = new Set<Set6SkillBehavior>([
  'farthest_magic',
  'jhin_curtain_call',
  'kogmaw_barrage',
  'icathian_barrage',
]);

const ASSASSIN_BEHAVIORS = new Set<Set6SkillBehavior>([
  'akali_perfect_execution',
  'vanish_crit',
  'blossom_dash',
]);

const HEALER_BEHAVIORS = new Set<Set6SkillBehavior>([
  'heal_allies',
  'polymorph_shield',
  'tempest_shield',
  'shield_wave',
]);

/** Explicit per-unit overrides when skill behavior + stats still disagree. */
const PLACEMENT_TAG_OVERRIDES: Partial<Record<string, BoardPlacementTag[]>> = {
  u1_caitlyn: ['SNIPER', 'BACKLINE_CARRY'],
  u1_singed: ['FRONT_CC', 'MIDLINE_BRUISER'],
  u2_talon: ['ASSASSIN_DIVE'],
  u3_taric: ['ENCHANTER_BACK'],
  u2_lulu: ['ENCHANTER_BACK'],
  u4_janna: ['ENCHANTER_BACK'],
  u4_seraphine: ['ENCHANTER_BACK'],
  u3_leona: ['FRONT_CC', 'FRONT_TANK'],
  u4_braum: ['FRONT_CC', 'FRONT_TANK'],
  u4_sion: ['FRONT_CC', 'FRONT_TANK'],
  u5_galio: ['FRONT_CC', 'FRONT_TANK'],
  u5_tahm_kench: ['FRONT_CC', 'FRONT_TANK'],
};

export function getPlacementTags(unitId: string): BoardPlacementTag[] {
  const override = PLACEMENT_TAG_OVERRIDES[unitId];
  if (override) return [...override];

  const tpl = UNIT_TEMPLATES[unitId];
  if (!tpl) return ['MIDLINE_BRUISER'];

  const behavior = SET6_SKILL_BEHAVIOR[unitId];
  const tags = new Set<BoardPlacementTag>();

  if (tpl.traits.includes('ASSASSIN') || (behavior && ASSASSIN_BEHAVIORS.has(behavior))) {
    tags.add('ASSASSIN_DIVE');
  }
  if (
    tpl.traits.includes('SNIPER') ||
    (behavior && SNIPER_BEHAVIORS.has(behavior)) ||
    tpl.stats.range >= 4
  ) {
    tags.add('SNIPER');
    tags.add('BACKLINE_CARRY');
  }
  if (
    tpl.traits.includes('ENCHANTER') ||
    (behavior && HEALER_BEHAVIORS.has(behavior))
  ) {
    tags.add('ENCHANTER_BACK');
  }
  if (
    (behavior && CC_BEHAVIORS.has(behavior)) ||
    tpl.traits.includes('BODYGUARD') ||
    tpl.traits.includes('COLOSSUS')
  ) {
    tags.add('FRONT_CC');
  }
  if (
    tpl.traits.includes('COLOSSUS') ||
    tpl.traits.includes('BODYGUARD') ||
    tpl.traits.includes('PROTECTOR') ||
    (tpl.stats.def >= 35 && tpl.stats.range <= 1)
  ) {
    tags.add('FRONT_TANK');
  }
  if (tpl.stats.range <= 1 && !tags.has('ASSASSIN_DIVE') && !tags.has('FRONT_TANK')) {
    tags.add('MIDLINE_BRUISER');
  }
  if (tags.size === 0) {
    tags.add(tpl.stats.range >= 3 ? 'BACKLINE_CARRY' : 'MIDLINE_BRUISER');
  }
  return [...tags];
}

export function primaryPlacementBucket(
  unitId: string
): 'front' | 'mid' | 'back' | 'assassin' {
  const tags = getPlacementTags(unitId);
  if (tags.includes('ASSASSIN_DIVE')) return 'assassin';
  if (tags.includes('BACKLINE_CARRY') || tags.includes('SNIPER')) return 'back';
  if (tags.includes('ENCHANTER_BACK') && !tags.includes('FRONT_CC')) return 'back';
  if (tags.includes('FRONT_TANK') || tags.includes('FRONT_CC')) return 'front';
  return 'mid';
}

export function placementRowPriority(unitId: string): readonly number[] {
  switch (primaryPlacementBucket(unitId)) {
    case 'front':
      return [0, 1, 2];
    case 'back':
      return [3, 2, 1];
    case 'assassin':
      return [2, 3, 1, 0];
    default:
      return [1, 2, 0, 3];
  }
}

function uniqueCols(cols: number[]): number[] {
  return cols.filter(
    (col, idx, arr) =>
      col >= 0 && col < Participant.BOARD_COLS && arr.indexOf(col) === idx
  );
}

export function placementColPriority(
  unitId: string,
  playerCarryCol: number
): number[] {
  const tags = getPlacementTags(unitId);
  if (tags.includes('ASSASSIN_DIVE')) {
    return uniqueCols([
      playerCarryCol,
      6 - playerCarryCol,
      0,
      6,
      1,
      5,
      2,
      4,
      3,
    ]);
  }
  if (
    tags.includes('SNIPER') ||
    tags.includes('BACKLINE_CARRY') ||
    tags.includes('ENCHANTER_BACK')
  ) {
    return uniqueCols([0, 6, 1, 5, 2, 4, 3]);
  }
  if (tags.includes('FRONT_CC')) {
    return uniqueCols([playerCarryCol, 3, 2, 4, 1, 5, 0, 6]);
  }
  return uniqueCols([3, 2, 4, 1, 5, 0, 6]);
}

export function isHighPriorityFrontCc(unitId: string): boolean {
  const tags = getPlacementTags(unitId);
  return tags.includes('FRONT_CC') || tags.includes('FRONT_TANK');
}
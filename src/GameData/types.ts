// src/GameData/types.ts

export type CostTier = 1 | 2 | 3 | 4 | 5;
export type StarLevel = 1 | 2 | 3;
export type TraitType = 'ORIGIN' | 'CLASS';
export type AugmentTier = 'SILVER' | 'GOLD' | 'PRISMATIC';

/** TFT Set 6 (Gizmos & Gadgets) — 15 origins + 13 classes */
export type TraitId =
  | 'SCRAP'
  | 'MUTANT'
  | 'SYNDICATE'
  | 'SOCIALITE'
  | 'CLOCKWORK'
  | 'ACADEMY'
  | 'MERCENARY'
  | 'YORDLE'
  | 'IMPERIAL'
  | 'ENFORCER'
  | 'CHEMTECH'
  | 'SISTER'
  | 'CUDDLY'
  | 'GLUTTON'
  | 'YORDLE_LORD'
  | 'ENCHANTER'
  | 'BODYGUARD'
  | 'BRUISER'
  | 'CHALLENGER'
  | 'INNOVATOR'
  | 'PROTECTOR'
  | 'ARCANIST'
  | 'TWINSHOT'
  | 'ASSASSIN'
  | 'SNIPER'
  | 'SCHOLAR'
  | 'COLOSSUS'
  | 'TRANSFORMER';

export type BaseItemId = 'SWORD' | 'BOW' | 'ROD' | 'TEAR' | 'ARMOR';

export type CompletedItemId =
  | 'INFINITY_EDGE'
  | 'GIANT_SLAYER'
  | 'HEXTECH_GUNBLADE'
  | 'SPEAR_OF_SHOJIN'
  | 'BLOODTHIRSTER'
  | 'RAPID_FIRECANNON'
  | 'GUINSOOS_RAGEBLADE'
  | 'STATIKK_SHIV'
  | 'TITANS_RESOLVE'
  | 'RABADONS_DEATHCAP'
  | 'ARCHANGELS_STAFF'
  | 'SUNFIRE_CAPE'
  | 'BLUE_BUFF'
  | 'PROTECTORS_VOW'
  | 'BRAMBLE_VEST';

export type ItemId = BaseItemId | CompletedItemId;

export type SkillType =
  | 'SELF_SHIELD_SLASH'
  | 'ASSASSIN_GOLD_STRIKE'
  | 'TRIPLE_SNIPE'
  | 'THORN_SMASH'
  | 'ARCANE_BOLT'
  | 'ACID_BOMB_SHRED'
  | 'SHIELD_BASH_HEAL'
  | 'CURRENT_HP_ARROW'
  | 'ROOT_AND_REGEN'
  | 'BACKLINE_CRIT_SLASH'
  | 'GOLD_SCALING_CLEAVE'
  | 'DRAGON_BREATH_ARMOR'
  | 'TORNADO_KNOCKUP'
  | 'BLOOD_DRAIN_TRIO'
  | 'EXCALIBUR_TEAM_SHIELD'
  | 'METEOR_SWARM'
  | 'EXECUTE_RESET'
  | 'APOCALYPSE_BREATH'
  | 'GOLDEN_VAULT_BOMBARD'
  | 'JUDGMENT_BARRAGE'
  | 'FURYHORN_STORM';

export type TraitKind = 'NORMAL' | 'UNIQUE' | 'PAIR' | 'CHAMPION_ONLY';
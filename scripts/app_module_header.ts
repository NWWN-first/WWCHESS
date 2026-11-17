// src/app/__FNAME__

import { getCreepMonsterTemplate } from '../CreepMonsterData';
import {
  AUGMENT_DEFINITIONS,
  BaseItemId,
  GAME_CONTENT_STATS,
  ITEM_DEFINITIONS,
  ItemId,
  SHOP_ODDS_BY_LEVEL,
  TRAIT_DEFINITIONS,
  TraitId,
  UNIT_TEMPLATES,
  XP_REQUIRED_BY_LEVEL,
  combineBaseItems,
} from '../GameData';
import { GameLoopManager } from '../GameLoopManager';
import { HexCoord, HexGridMath, ScreenPoint } from '../HexGridMath';
import { AIPersona, Participant, UnitInstance } from '../Participant';
import { PixelGameRenderer } from '../PixelGameRenderer';
import {
  RANK_TIER_BADGE_ICONS,
  RANK_TIER_KOREAN_NAMES,
  RANK_TIERS_ORDERED,
  RankTier,
} from '../RankManager';
import { CombatEngine } from '../CombatEngine';
import { PixiVfxEngine } from '../PixiVfxEngine';
import { CombatUnit } from '../SkillRegistry';
import { soundFX } from '../SoundFXManager';
import { SynergyEngine } from '../SynergyEngine';
import { ThreeJsGameRenderer } from '../ThreeJsGameRenderer';
import type { FantasyAutoBattlerApp } from '../FantasyAutoBattlerApp';
import { DragPayload, PERSONA_BADGE_LABELS } from './types';
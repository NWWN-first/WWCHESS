// src/GameData/contentStats.ts

import { TRAIT_DEFINITIONS } from './traits';
import { UNIT_TEMPLATES } from './units';
import { AUGMENT_DEFINITIONS } from './augments';
import { ITEM_DEFINITIONS } from './items';
import type { BaseItemId, ItemId } from './types';

/** UI·릴리스 노트용 콘텐츠 규모 (GameData 단일 소스) */
export const GAME_CONTENT_STATS = {
  traitCount: Object.keys(TRAIT_DEFINITIONS).length,
  championCount: Object.keys(UNIT_TEMPLATES).length,
  augmentCount: AUGMENT_DEFINITIONS.length,
  completedItemCount: (Object.keys(ITEM_DEFINITIONS) as ItemId[]).filter(
    (id) => !(['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR'] as const).includes(id as BaseItemId)
  ).length,
} as const;

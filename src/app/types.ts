// src/app/types.ts

import type { ItemId } from '../GameData';
import type { AIPersona, UnitInstance } from '../Participant';

export type DragPayload =
  | {
      kind: 'UNIT';
      instanceId: string;
      unit: UnitInstance;
      fromArea: 'BOARD' | 'BENCH';
      fromRow?: number;
      fromCol?: number;
      fromIndex?: number;
    }
  | {
      kind: 'ITEM';
      itemBenchIndex: number;
      itemId: ItemId;
    }
  | {
      kind: 'DUPLICATOR';
    };

export const PERSONA_BADGE_LABELS: Record<AIPersona, string> = {
  HYPER_ROLLER: '🎲리롤',
  LOW_COST_REROLLER: '🎲리롤',
  FAST_NINE_GREEDY: '👑9렙',
  FAST_NINE_ECONOMIST: '👑9렙',
  MERCENARY_GAMBLER: '🎲용병',
  FLEX_MASTER: '⚖️유연',
  FLEX_BALANCED: '⚖️유연',
};
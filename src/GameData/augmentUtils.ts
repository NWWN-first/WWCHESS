// src/GameData/augmentUtils.ts

import {
  AUGMENT_DEFINITIONS,
  type AugmentDefinition,
  type AugmentEffectKey,
} from './augments';

const ID_TO_DEF = new Map<string, AugmentDefinition>(
  AUGMENT_DEFINITIONS.map((a) => [a.id, a])
);

export function augmentDefForId(augmentId: string): AugmentDefinition | undefined {
  return ID_TO_DEF.get(augmentId);
}

export function participantHasEffect(
  augmentIds: readonly string[],
  effectKey: AugmentEffectKey
): boolean {
  for (const id of augmentIds) {
    if (ID_TO_DEF.get(id)?.effectKey === effectKey) return true;
  }
  return false;
}

export function participantHasAnyEffect(
  augmentIds: readonly string[],
  effectKeys: readonly AugmentEffectKey[]
): boolean {
  return effectKeys.some((k) => participantHasEffect(augmentIds, k));
}

export function participantEffectTier(
  augmentIds: readonly string[],
  prefix: string
): 0 | 1 | 2 | 3 {
  let tier: 0 | 1 | 2 | 3 = 0;
  for (const id of augmentIds) {
    const key = ID_TO_DEF.get(id)?.effectKey;
    if (!key?.startsWith(prefix)) continue;
    if (key.endsWith('_3')) tier = Math.max(tier, 3) as 0 | 1 | 2 | 3;
    else if (key.endsWith('_2')) tier = Math.max(tier, 2) as 0 | 1 | 2 | 3;
    else if (key.endsWith('_1')) tier = Math.max(tier, 1) as 0 | 1 | 2 | 3;
    else if (key === prefix) tier = Math.max(tier, 1) as 0 | 1 | 2 | 3;
  }
  return tier;
}
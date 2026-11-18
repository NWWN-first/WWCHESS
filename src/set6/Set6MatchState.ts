// Set 6 match-wide trait state (Mutant variant, etc.)

export const MUTANT_VARIANTS = [
  'METAL_CLAWS',
  'ADRENALINE_RUSH',
  'VAMPIRIC',
  'HUNGER',
  'ARCANA',
  'TOWER_POWER',
  'DREAD',
] as const;

export type MutantVariant = (typeof MUTANT_VARIANTS)[number];

export function rollMutantVariant(): MutantVariant {
  const idx = Math.floor(Math.random() * MUTANT_VARIANTS.length);
  return MUTANT_VARIANTS[idx]!;
}

/** Effect strength multiplier by Mutant breakpoint (3 / 5 / 7). */
export function mutantPowerMultiplier(count: number): number {
  if (count >= 7) return 2.2;
  if (count >= 5) return 1.5;
  if (count >= 3) return 1.0;
  return 0;
}

export interface SocialiteSpotlight {
  boardRow: number;
  boardCol: number;
}

/** Default home-board spotlight hexes (Set 6: row 2 / center). */
export function defaultSocialiteSpotlights(count: number): SocialiteSpotlight[] {
  if (count >= 3) {
    return [
      { boardRow: 1, boardCol: 2 },
      { boardRow: 1, boardCol: 4 },
    ];
  }
  return [{ boardRow: 1, boardCol: 3 }];
}
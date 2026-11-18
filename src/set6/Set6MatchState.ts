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

/** Official Set 6 mutant power names (TOWER_POWER = Tower of Power, not a trait). */
export const MUTANT_VARIANT_LABELS: Record<MutantVariant, string> = {
  METAL_CLAWS: 'Metal Claws',
  ADRENALINE_RUSH: 'Adrenaline Burst',
  VAMPIRIC: 'Vampiric',
  HUNGER: 'Hungry',
  ARCANA: 'Arcana',
  TOWER_POWER: 'Tower of Power',
  DREAD: 'Dread',
};

export const MUTANT_VARIANT_LABELS_KO: Record<MutantVariant, string> = {
  METAL_CLAWS: '금속 발톱',
  ADRENALINE_RUSH: '아드레날린 폭주',
  VAMPIRIC: '흡혈',
  HUNGER: '갈망',
  ARCANA: '비전',
  TOWER_POWER: '탑의 힘',
  DREAD: '공포',
};

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
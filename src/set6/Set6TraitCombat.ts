// Set 6 origin/class combat hooks (SCRAP, MUTANT, SOCIALITE, ...).

import {
  ITEM_DEFINITIONS,
  type CompletedItemId,
  type ItemId,
  type TraitId,
} from '../GameData';
import type { ActiveSynergyState } from '../SynergyEngine';
import type { Participant } from '../Participant';
import type { CombatTeam, CombatUnit } from '../SkillRegistry';
import { HexGridMath } from '../HexGridMath';
import {
  defaultSocialiteSpotlights,
  type MutantVariant,
  mutantPowerMultiplier,
} from './Set6MatchState';

const COMPLETED_ITEM_IDS = Object.keys(ITEM_DEFINITIONS).filter(
  (id) => ITEM_DEFINITIONS[id as ItemId]?.isCompleted
) as CompletedItemId[];

function isCompletedItem(id: ItemId): boolean {
  return Boolean(ITEM_DEFINITIONS[id]?.isCompleted);
}

function pickRandomCompleted(): CompletedItemId | null {
  if (COMPLETED_ITEM_IDS.length === 0) return null;
  return COMPLETED_ITEM_IDS[Math.floor(Math.random() * COMPLETED_ITEM_IDS.length)]!;
}

function scrapTier(synergyMap: Map<TraitId, ActiveSynergyState>): 0 | 2 | 4 | 6 {
  const n = synergyMap.get('SCRAP')?.count ?? 0;
  if (n >= 6) return 6;
  if (n >= 4) return 4;
  if (n >= 2) return 2;
  return 0;
}

function innovatorTier(synergyMap: Map<TraitId, ActiveSynergyState>): 0 | 3 | 5 | 7 {
  const n = synergyMap.get('INNOVATOR')?.count ?? 0;
  if (n >= 7) return 7;
  if (n >= 5) return 5;
  if (n >= 3) return 3;
  return 0;
}

function clockworkBonus(
  synergyMap: Map<TraitId, ActiveSynergyState>,
  augmentCount: number
): number {
  const n = synergyMap.get('CLOCKWORK')?.count ?? 0;
  let base = 0;
  let perAugment = 0;
  let cap = 0.25;
  if (n >= 6) {
    base = 0.4;
    perAugment = 0.05;
  } else if (n >= 4) {
    base = 0.25;
    perAugment = 0.03;
  } else if (n >= 2) {
    base = 0.15;
    perAugment = 0.02;
  } else {
    return 0;
  }
  return Math.min(cap, base + perAugment * augmentCount);
}

function socialiteTier(synergyMap: Map<TraitId, ActiveSynergyState>): 0 | 1 | 2 | 3 {
  const n = synergyMap.get('SOCIALITE')?.count ?? 0;
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  if (n >= 1) return 1;
  return 0;
}

function academyParams(count: number): {
  baseAtk: number;
  baseSp: number;
  stackAtk: number;
  stackSp: number;
  maxStacks: number;
} {
  if (count >= 8) {
    return { baseAtk: 0.32, baseSp: 0.4, stackAtk: 0.015, stackSp: 0.02, maxStacks: 35 };
  }
  if (count >= 6) {
    return { baseAtk: 0.22, baseSp: 0.28, stackAtk: 0.012, stackSp: 0.018, maxStacks: 25 };
  }
  if (count >= 4) {
    return { baseAtk: 0.14, baseSp: 0.18, stackAtk: 0.01, stackSp: 0.015, maxStacks: 18 };
  }
  if (count >= 2) {
    return { baseAtk: 0.08, baseSp: 0.1, stackAtk: 0.008, stackSp: 0.012, maxStacks: 10 };
  }
  return { baseAtk: 0, baseSp: 0, stackAtk: 0, stackSp: 0, maxStacks: 0 };
}

function yordleMaxManaReduction(count: number): number {
  return count >= 6 ? 10 : 0;
}

function arcanistSelfSpellBonus(count: number): number {
  if (count >= 8) return 0.4;
  if (count >= 6) return 0.32;
  if (count >= 4) return 0.22;
  if (count >= 2) return 0.15;
  return 0;
}

export class Set6TraitCombat {
  public homeAcademyStacks = 0;
  public awayAcademyStacks = 0;

  public applyPreCombatUnitBonuses(
    cu: CombatUnit,
    owner: Participant,
    synergyMap: Map<TraitId, ActiveSynergyState>,
    boardRow: number,
    boardCol: number
  ): void {
    const yordleFx = synergyMap.get('YORDLE')?.activeEffect;
    if (yordleFx?.dodgeChance && cu.traits.includes('YORDLE')) {
      cu.dodgeChance = Math.min(0.95, cu.dodgeChance + yordleFx.dodgeChance);
    }

    if (
      owner.set6ImperialTyrantInstanceId &&
      cu.sourceInstanceId === owner.set6ImperialTyrantInstanceId &&
      cu.traits.includes('IMPERIAL')
    ) {
      const impFx = synergyMap.get('IMPERIAL')?.activeEffect;
      if (impFx?.imperialDamageBonus) {
        cu.set6ImperialTyrant = true;
        cu.trueDamageBonusRatio += impFx.imperialDamageBonus;
      }
    }

    const cw = clockworkBonus(synergyMap, owner.augments.length);
    if (cw > 0) {
      cu.atkSpeed = Number((cu.atkSpeed * (1 + cw)).toFixed(3));
      cu.baseAtkSpeed = cu.atkSpeed;
    }

    const acCount = synergyMap.get('ACADEMY')?.count ?? 0;
    if (acCount >= 2) {
      const p = academyParams(acCount);
      cu.atk = Math.round(cu.atk * (1 + p.baseAtk));
      cu.baseAtk = cu.atk;
      cu.spellPower = Number((cu.spellPower * (1 + p.baseSp)).toFixed(3));
    }

    const yordleN = synergyMap.get('YORDLE')?.count ?? 0;
    const manaCut = yordleMaxManaReduction(yordleN);
    if (cu.traits.includes('YORDLE') && manaCut > 0) {
      cu.maxMana = Math.max(0, cu.maxMana - manaCut);
      cu.currentMana = Math.min(cu.currentMana, cu.maxMana);
    }

    const socTier = socialiteTier(synergyMap);
    if (socTier > 0) {
      const spots = owner.socialiteSpotlights.length
        ? owner.socialiteSpotlights
        : defaultSocialiteSpotlights(socTier);
      const onSpot = spots.some((s) => s.boardRow === boardRow && s.boardCol === boardCol);
      if (onSpot) {
        const dmgBon = socTier === 3 ? 0.25 : socTier === 2 ? 0.15 : 0.08;
        const omni = socTier === 3 ? 0.18 : socTier === 2 ? 0.1 : 0.05;
        cu.trueDamageBonusRatio += dmgBon;
        cu.omnivamp += omni;
        cu.set6SocialiteManaPerAttack =
          socTier === 3 ? 6 : socTier === 2 ? 4 : 2;
      }
    }

    if (cu.traits.includes('COLOSSUS')) {
      cu.set6Colossus = true;
    }
  }

  public static applyMutantVariantStats(
    cu: CombatUnit,
    variant: MutantVariant,
    mult: number
  ): void {
    switch (variant) {
      case 'METAL_CLAWS':
        cu.trueDamageBonusRatio += 0.1 * mult;
        break;
      case 'ADRENALINE_RUSH':
        cu.set6MutantAdrenaline = true;
        break;
      case 'VAMPIRIC':
      case 'HUNGER':
        cu.omnivamp += 0.12 * mult;
        break;
      case 'ARCANA':
        cu.spellPower = Number((cu.spellPower * (1 + 0.25 * mult)).toFixed(3));
        break;
      case 'TOWER_POWER':
        cu.range += 1;
        break;
      case 'DREAD':
        cu.maxMana = Math.max(10, Math.round(cu.maxMana * (1 - 0.15 * mult)));
        cu.spellPower = Number((cu.spellPower * (1 + 0.15 * mult)).toFixed(3));
        break;
      default:
        break;
    }
  }

  public applyTeamWideBonuses(
    teamUnits: CombatUnit[],
    synergyMap: Map<TraitId, ActiveSynergyState>
  ): void {
    const bruiserFx = synergyMap.get('BRUISER')?.activeEffect;
    const teamHpRatio = bruiserFx?.teamMaxHpRatio ?? 0;
    if (teamHpRatio > 0) {
      for (const u of teamUnits) {
        const mult = u.traits.includes('BRUISER') ? teamHpRatio * 2 : teamHpRatio;
        const bonus = Math.round(u.maxHp * mult);
        u.maxHp += bonus;
        u.currentHp += bonus;
      }
    }

    const challengerFx = synergyMap.get('CHALLENGER')?.activeEffect;
    if (challengerFx?.bonusAtkSpeed) {
      for (const u of teamUnits) {
        if (!u.traits.includes('CHALLENGER')) continue;
        u.atkSpeed = Number((u.atkSpeed * (1 + challengerFx.bonusAtkSpeed)).toFixed(3));
        u.baseAtkSpeed = u.atkSpeed;
      }
    }

    const twinFx = synergyMap.get('TWINSHOT')?.activeEffect;
    if (twinFx?.bonusAtkSpeed) {
      for (const u of teamUnits) {
        if (!u.traits.includes('TWINSHOT')) continue;
        u.atk = Math.round(u.atk * (1 + twinFx.bonusAtkSpeed));
        u.baseAtk = u.atk;
      }
    }

    const arcanistState = synergyMap.get('ARCANIST');
    const teamSp = arcanistState?.activeEffect?.spellPowerBonus ?? 0;
    const arcanistExtra = arcanistSelfSpellBonus(arcanistState?.count ?? 0);
    if (teamSp > 0) {
      for (const u of teamUnits) {
        const selfExtra = u.traits.includes('ARCANIST') ? arcanistExtra : 0;
        u.spellPower = Number((u.spellPower * (1 + teamSp + selfExtra)).toFixed(3));
      }
    }

    const enchanterFx = synergyMap.get('ENCHANTER')?.activeEffect;
    if (enchanterFx?.magicDamageReduction) {
      for (const u of teamUnits) {
        u.magicDamageReduction = Math.max(
          u.magicDamageReduction,
          enchanterFx.magicDamageReduction
        );
      }
    }

    const syndicateFx = synergyMap.get('SYNDICATE')?.activeEffect;
    const syndicateCount = synergyMap.get('SYNDICATE')?.count ?? 0;
    if (syndicateFx) {
      for (const u of teamUnits) {
        if (!u.traits.includes('SYNDICATE')) continue;
        let magicDr = syndicateFx.magicDamageReduction ?? 0;
        let omi = syndicateFx.omnivamp ?? 0;
        let defBonus = syndicateFx.bonusDef ?? 0;
        if (syndicateCount >= 7) {
          magicDr *= 2;
          omi *= 2;
          defBonus *= 2;
          u.set6SyndicateAmpUntilMs = 8000;
          if (syndicateFx.damageReductionFirst8s) {
            u.set6SyndicateCombatDr = syndicateFx.damageReductionFirst8s * 2;
          }
        }
        u.magicDamageReduction = Math.max(u.magicDamageReduction, magicDr);
        u.omnivamp += omi;
        if (defBonus > 0) {
          u.def += defBonus;
          u.baseDef += defBonus;
        }
      }
    }
  }

  public static applyMutantVariantsToTeam(
    teamUnits: CombatUnit[],
    owner: Participant,
    synergyMap: Map<TraitId, ActiveSynergyState>
  ): void {
    const mutantCount = synergyMap.get('MUTANT')?.count ?? 0;
    if (!owner.set6MutantVariant || mutantCount < 3) return;
    const mult = mutantPowerMultiplier(mutantCount);
    const cap = mutantCount >= 7 ? 2 : 1;
    const mutants = teamUnits
      .filter((u) => u.traits.includes('MUTANT'))
      .slice(0, cap);
    for (const cu of mutants) {
      cu.set6MutantVariant = owner.set6MutantVariant;
      Set6TraitCombat.applyMutantVariantStats(cu, owner.set6MutantVariant, mult);
    }
  }

  public static recordImperialTyrant(
    participant: Participant,
    teamUnits: CombatUnit[]
  ): void {
    let best: CombatUnit | null = null;
    for (const u of teamUnits) {
      if (!u.traits.includes('IMPERIAL')) continue;
      if (!best || u.totalDamageDealt > best.totalDamageDealt) {
        best = u;
      }
    }
    participant.set6ImperialTyrantInstanceId = best?.sourceInstanceId ?? null;
  }

  public applyScrapEffects(
    teamUnits: CombatUnit[],
    synergyMap: Map<TraitId, ActiveSynergyState>,
    addShield: (cu: CombatUnit, amt: number) => void
  ): void {
    const tier = scrapTier(synergyMap);
    if (tier === 0) return;

    const perItem =
      tier === 6 ? 0.08 : tier === 4 ? 0.05 : 0.03;
    const cap = tier === 6 ? 0.8 : tier === 4 ? 0.5 : 0.3;
    const totalItems = teamUnits.reduce((s, u) => s + u.items.length, 0);
    const shieldRatio = Math.min(cap, totalItems * perItem);
    for (const u of teamUnits) {
      addShield(u, Math.round(u.maxHp * shieldRatio));
      if (u.traits.includes('SCRAP') && tier >= 4) {
        u.def += 15;
        u.baseDef += 15;
      }
    }

    const transformSlots = tier >= 6 ? 2 : 1;
    for (const u of teamUnits) {
      if (!u.traits.includes('SCRAP')) continue;
      let slots = 0;
      for (let i = 0; i < u.items.length && slots < transformSlots; i++) {
        const it = u.items[i]!;
        if (!isCompletedItem(it)) continue;
        const rolled = pickRandomCompleted();
        if (!rolled || rolled === it) continue;
        if (!u.set6ScrapOriginalItems) {
          u.set6ScrapOriginalItems = [...u.items];
        }
        u.items[i] = rolled;
        u.set6ScrapTransformed = true;
        slots += 1;
      }
    }
  }

  public spawnInnovatorMechs(
    team: CombatTeam,
    synergyMap: Map<TraitId, ActiveSynergyState>,
    teamUnits: CombatUnit[],
    createSummon: (cfg: {
      name: string;
      hp: number;
      atk: number;
      row: number;
      col: number;
    }) => CombatUnit
  ): CombatUnit[] {
    const tier = innovatorTier(synergyMap);
    if (tier === 0) return [];
    const anchor = teamUnits[0];
    if (!anchor) return [];

    const innovatorStars = teamUnits
      .filter((u) => u.traits.includes('INNOVATOR'))
      .reduce((s, u) => s + u.starLevel, 0);
    const starScale = 1 + innovatorStars * 0.12;

    const spawns: CombatUnit[] = [];
    const baseRow = anchor.row;
    const baseCol = Math.min(6, anchor.col + 1);

    if (tier >= 3) {
      spawns.push(
        createSummon({
          name: 'Mechanical Scarab',
          hp: Math.round(450 * starScale),
          atk: Math.round(35 * starScale),
          row: baseRow,
          col: baseCol,
        })
      );
    }
    if (tier >= 5) {
      spawns.push(
        createSummon({
          name: 'Mechanical Bear',
          hp: Math.round(900 * starScale),
          atk: Math.round(55 * starScale),
          row: baseRow,
          col: Math.max(0, baseCol - 1),
        })
      );
    }
    if (tier >= 7) {
      spawns.push(
        createSummon({
          name: 'Mechanical Dragon',
          hp: Math.round(1600 * starScale),
          atk: Math.round(80 * starScale),
          row: Math.max(0, baseRow - 1),
          col: baseCol,
        })
      );
    }
    for (const s of spawns) {
      s.set6InnovatorSummon = true;
      s.team = team;
    }
    return spawns;
  }

  public applyEnforcerCombatStart(
    team: CombatTeam,
    synergyMap: Map<TraitId, ActiveSynergyState>,
    teamUnits: CombatUnit[],
    enemyUnits: CombatUnit[],
    stun: (source: CombatUnit, target: CombatUnit, ms: number) => void
  ): void {
    const n = synergyMap.get('ENFORCER')?.count ?? 0;
    if (n < 2 || enemyUnits.length === 0) return;
    const highest = [...enemyUnits].sort((a, b) => b.maxHp - a.maxHp)[0]!;
    const source = teamUnits[0];
    if (source) stun(source, highest, 4000);
    if (n >= 4) {
      const topDmg = [...enemyUnits].sort((a, b) => b.totalDamageDealt - a.totalDamageDealt)[0];
      if (topDmg && topDmg.instanceId !== highest.instanceId && source) {
        stun(source, topDmg, 4000);
      }
    }
  }

  public onAcademySkillCast(team: CombatTeam, synergyMap: Map<TraitId, ActiveSynergyState>): void {
    const n = synergyMap.get('ACADEMY')?.count ?? 0;
    if (n < 2) return;
    const p = academyParams(n);
    if (team === 'HOME') {
      if (this.homeAcademyStacks >= p.maxStacks) return;
      this.homeAcademyStacks += 1;
    } else {
      if (this.awayAcademyStacks >= p.maxStacks) return;
      this.awayAcademyStacks += 1;
    }
  }

  public applyAcademyOnCast(
    team: CombatTeam,
    teamUnits: CombatUnit[],
    synergyMap: Map<TraitId, ActiveSynergyState>
  ): void {
    const n = synergyMap.get('ACADEMY')?.count ?? 0;
    if (n < 2) return;
    const p = academyParams(n);
    const stacks = team === 'HOME' ? this.homeAcademyStacks : this.awayAcademyStacks;
    for (const cu of teamUnits) {
      if (!cu.traits.includes('ACADEMY')) continue;
      cu.atk = Math.round(cu.baseAtk * (1 + p.baseAtk + stacks * p.stackAtk));
      cu.spellPower = Number(
        (cu.spellPower * (1 + stacks * p.stackSp)).toFixed(3)
      );
    }
  }

  public onChallengerKill(
    killer: CombatUnit,
    synergyMap: Map<TraitId, ActiveSynergyState>
  ): void {
    if (!killer.traits.includes('CHALLENGER')) return;
    const fx = synergyMap.get('CHALLENGER')?.activeEffect;
    if (!fx?.challengerOnKillAsMult) return;
    killer.set6ChallengerAsBoostUntilMs =
      fx.challengerOnKillDurationMs ?? 2500;
    killer.atkSpeed = Number(
      (killer.atkSpeed * fx.challengerOnKillAsMult).toFixed(3)
    );
  }

  /** Tiles occupied by this unit (Colossus = 2 hexes). */
  public static occupiedTileKeys(unit: CombatUnit): string[] {
    const keys = [`${unit.row},${unit.col}`];
    if (unit.set6Colossus) {
      const neighbor = HexGridMath.getHexNeighbors(
        unit.row,
        unit.col,
        8,
        7
      ).find((n) => n.col === unit.col + 1 || n.col === unit.col - 1);
      if (neighbor) keys.push(`${neighbor.row},${neighbor.col}`);
    }
    return keys;
  }
}
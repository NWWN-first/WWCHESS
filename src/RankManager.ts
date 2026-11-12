// src/RankManager.ts

export type RankTier =
  | 'IRON'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'MASTER'
  | 'CHALLENGER';

export interface PlayerRankProfile {
  tier: RankTier;
  lp: number;
  gamesPlayed: number;
  wins: number;
  top4Count: number;
}

export interface AISkillParameters {
  skillLevel: number; // 0.25 (IRON) ~ 0.95 (CHALLENGER)
  temperature: number; // 0.80 (IRON) ~ 0.10 (CHALLENGER)
  scoutingChance: number; // 0.00 (IRON) ~ 0.90 (CHALLENGER)
}

export interface RankUpdateResult {
  previousTier: RankTier;
  previousLp: number;
  newTier: RankTier;
  newLp: number;
  lpDelta: number;
  promoted: boolean;
  demoted: boolean;
  placement: number;
  summaryText: string;
}

export const RANK_TIERS_ORDERED: RankTier[] = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'DIAMOND',
  'MASTER',
  'CHALLENGER',
];

export const RANK_TIER_KOREAN_NAMES: Record<RankTier, string> = {
  IRON: '아이언',
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
  PLATINUM: '플래티넘',
  DIAMOND: '다이아몬드',
  MASTER: '마스터',
  CHALLENGER: '챌린저',
};

export const RANK_TIER_BADGE_ICONS: Record<RankTier, string> = {
  IRON: '⚙️',
  BRONZE: '🥉',
  SILVER: '🥈',
  GOLD: '🥇',
  PLATINUM: '💠',
  DIAMOND: '💎',
  MASTER: '🔮',
  CHALLENGER: '👑',
};

const AI_SKILL_BY_TIER: Record<RankTier, AISkillParameters> = {
  IRON: { skillLevel: 0.25, temperature: 0.8, scoutingChance: 0.0 },
  BRONZE: { skillLevel: 0.35, temperature: 0.7, scoutingChance: 0.1 },
  SILVER: { skillLevel: 0.45, temperature: 0.58, scoutingChance: 0.22 },
  GOLD: { skillLevel: 0.55, temperature: 0.45, scoutingChance: 0.38 },
  PLATINUM: { skillLevel: 0.65, temperature: 0.35, scoutingChance: 0.55 },
  DIAMOND: { skillLevel: 0.78, temperature: 0.24, scoutingChance: 0.75 },
  MASTER: { skillLevel: 0.88, temperature: 0.16, scoutingChance: 0.85 },
  CHALLENGER: { skillLevel: 0.95, temperature: 0.1, scoutingChance: 0.9 },
};

const LP_CHANGE_BY_PLACEMENT: Record<number, number> = {
  1: 45,
  2: 32,
  3: 20,
  4: 10,
  5: -10,
  6: -20,
  7: -32,
  8: -45,
};

export class RankManager {
  private static readonly STORAGE_KEY = 'WWCHESS_FANTASY_AUTOBATTLER_RANK_V1';
  private profile: PlayerRankProfile;

  constructor() {
    this.profile = this.loadProfile();
  }

  /**
   * LocalStorage에서 플레이어 랭크 프로필을 로드한다.
   */
  public loadProfile(): PlayerRankProfile {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(RankManager.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PlayerRankProfile>;
          if (parsed && parsed.tier && RANK_TIERS_ORDERED.includes(parsed.tier)) {
            this.profile = {
              tier: parsed.tier,
              lp: Math.max(0, Math.min(100, Number(parsed.lp ?? 0))),
              gamesPlayed: Math.max(0, Number(parsed.gamesPlayed ?? 0)),
              wins: Math.max(0, Number(parsed.wins ?? 0)),
              top4Count: Math.max(0, Number(parsed.top4Count ?? 0)),
            };
            return this.profile;
          }
        }
      }
    } catch {
      // LocalStorage 접근 불가 환경 폴백
    }

    this.profile = {
      tier: 'SILVER',
      lp: 20,
      gamesPlayed: 0,
      wins: 0,
      top4Count: 0,
    };
    this.saveProfile();
    return this.profile;
  }

  /**
   * LocalStorage에 현재 플레이어 랭크 프로필을 저장한다.
   */
  public saveProfile(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          RankManager.STORAGE_KEY,
          JSON.stringify(this.profile)
        );
      }
    } catch {
      // 무시
    }
  }

  public getProfile(): PlayerRankProfile {
    return { ...this.profile };
  }

  /**
   * 디버그 또는 티어 테스트를 위해 수동으로 티어를 변경한다.
   */
  public setTierForTesting(tier: RankTier, lp: number = 50): void {
    this.profile.tier = tier;
    this.profile.lp = Math.max(0, Math.min(100, lp));
    this.saveProfile();
  }

  /**
   * 현재 플레이어 티어에 따라 이번 판 AI 봇들의 지능 지수(skillLevel: 0.25 ~ 0.95),
   * 의사결정 노이즈 온도(temperature: 0.8 ~ 0.1), 정찰 및 견제 확률(scoutingChance: 0.0 ~ 0.9)을 반환한다.
   */
  public getAISkillParameters(): AISkillParameters {
    const params = AI_SKILL_BY_TIER[this.profile.tier] ?? AI_SKILL_BY_TIER.SILVER;
    return { ...params };
  }

  /**
   * 1~8위 게임 결과에 따라 LP를 증감하고 승급/강등 내역을 계산하여 저장 및 반환한다.
   */
  public updateRankAfterGame(placement: number): RankUpdateResult {
    const clampedPlacement = Math.max(1, Math.min(8, Math.round(placement)));
    const previousTier = this.profile.tier;
    const previousLp = this.profile.lp;

    const baseDelta = LP_CHANGE_BY_PLACEMENT[clampedPlacement] ?? 0;
    const tierIndex = RANK_TIERS_ORDERED.indexOf(previousTier);

    // 고티어일수록 승리 LP 획득은 소폭 완만해지고 패배 LP 차감은 소폭 엄격해짐
    let adjustedDelta = baseDelta;
    if (tierIndex >= 5) {
      adjustedDelta =
        baseDelta > 0 ? Math.max(5, baseDelta - 5) : baseDelta - 5;
    }

    this.profile.gamesPlayed += 1;
    if (clampedPlacement === 1) {
      this.profile.wins += 1;
    }
    if (clampedPlacement <= 4) {
      this.profile.top4Count += 1;
    }

    let currentTierIdx = tierIndex;
    let newLp = previousLp + adjustedDelta;
    let promoted = false;
    let demoted = false;

    // LP >= 100 도달 시 상위 티어로 승급
    if (newLp >= 100) {
      if (currentTierIdx < RANK_TIERS_ORDERED.length - 1) {
        currentTierIdx += 1;
        newLp = newLp - 100;
        promoted = true;
      } else {
        // CHALLENGER는 최대 100 LP 캡 유지
        newLp = 100;
      }
    } else if (newLp < 0) {
      // LP < 0 도달 시 하위 티어로 강등 (IRON 0 LP는 하한선)
      if (currentTierIdx > 0) {
        currentTierIdx -= 1;
        newLp = Math.max(0, 100 + newLp);
        demoted = true;
      } else {
        newLp = 0;
      }
    }

    const newTier = RANK_TIERS_ORDERED[currentTierIdx];
    this.profile.tier = newTier;
    this.profile.lp = newLp;
    this.saveProfile();

    const sign = adjustedDelta >= 0 ? `+${adjustedDelta}` : `${adjustedDelta}`;
    let summaryText = `${clampedPlacement}위 달성! (${RANK_TIER_KOREAN_NAMES[newTier]} ${newLp} LP, ${sign} LP)`;
    if (promoted) {
      summaryText = `🎉 [${RANK_TIER_KOREAN_NAMES[newTier]}] 티어로 승급했습니다! (${newLp} LP, ${sign} LP)`;
    } else if (demoted) {
      summaryText = `⚠️ [${RANK_TIER_KOREAN_NAMES[newTier]}] 티어로 강등되었습니다. (${newLp} LP, ${sign} LP)`;
    }

    return {
      previousTier,
      previousLp,
      newTier,
      newLp,
      lpDelta: adjustedDelta,
      promoted,
      demoted,
      placement: clampedPlacement,
      summaryText,
    };
  }
}

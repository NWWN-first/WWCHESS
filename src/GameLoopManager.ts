// src/GameLoopManager.ts

import { AIBotController } from './AIBotController';
import { CombatEngine, CombatSummary } from './CombatEngine';
import { CreepRoundManager } from './CreepRoundManager';
import { DopamineEngine, LootOrb } from './DopamineEngine';
import {
  AugmentDefinition,
  AugmentTier,
  BASE_ITEM_IDS,
  CompletedItemId,
  ITEM_DEFINITIONS,
  ItemId,
  UNIT_TEMPLATES,
  UNITS_BY_COST,
} from './GameData';
import { Participant } from './Participant';
import { RankManager, RankUpdateResult } from './RankManager';
import { SharedPoolManager } from './SharedPoolManager';
import { SynergyEngine } from './SynergyEngine';

export type GamePhase =
  | 'AUGMENT_PHASE'
  | 'ANVIL_PHASE'
  | 'PREPARATION_PHASE'
  | 'COMBAT_PHASE'
  | 'RESOLUTION_PHASE'
  | 'GAME_OVER_PHASE';

export type RoundType = 'CREEP' | 'PVP' | 'BOSS_CREEP';

export interface FateAnvilOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  itemId?: ItemId;
  unitId?: string;
  gold?: number;
  duplicators?: number;
}

export interface MatchPairing {
  home: Participant;
  away: Participant;
  isGhostMatch: boolean;
  ghostSourceParticipant?: Participant;
  isCreepMatch: boolean;
  engine?: CombatEngine;
}

export interface RoundMatchResult {
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  isGhostMatch: boolean;
  isCreepMatch: boolean;
  winner: 'HOME' | 'AWAY' | 'DRAW';
  homeDamageTaken: number;
  awayDamageTaken: number;
  survivingHomeUnits: number;
  survivingAwayUnits: number;
}

export interface AvatarFinisherLaserPayload {
  id: number;
  winnerSide: 'HOME' | 'AWAY';
  winnerName: string;
  loserName: string;
  damage: number;
  survivingUnits: number;
}

export class GameLoopManager {
  public sharedPool: SharedPoolManager;
  public rankManager: RankManager;
  public aiController: AIBotController;

  public player!: Participant;
  public participants: Participant[] = [];

  public stage: number = 1;
  public roundInStage: number = 1;
  public phase: GamePhase = 'PREPARATION_PHASE';
  public playbackSpeed: 1 | 2 = 1;

  /**
   * 실제 TFT 순정 정비 시간표 카운트다운 상태 (초반 1~2스테이지 30초, 3스테이지 35초, 4스테이지 이후 40초)
   */
  public prepTotalSec: number = 30;
  public prepRemainingSec: number = 30;
  private prepRemainingMs: number = 30000;
  private prepTimerIntervalId: number | null = null;
  private resolutionTimeoutId: number | null = null;

  /**
   * 전투 종료 직후 승리 아바타 -> 패배 아바타 레이저 피니시 연출 페이로드
   */
  public activeFinisherLaser: AvatarFinisherLaserPayload | null = null;
  private finisherSeqCounter: number = 1;

  /**
   * 현재 플레이어가 정찰(Scouting) 중인 참가자 ID (기본값: 플레이어 자신)
   */
  public viewedParticipantId: string = 'player_1';

  /**
   * 플레이어 보드 위에 드랍된 ?/! 미스터리 박스(Loot Orbs) 목록
   */
  public playerLootOrbs: LootOrb[] = [];

  /**
   * 증강체 선택 페이즈 상태 (카드 3장 + 카드별 1회 리롤 가능 여부)
   * 2-1, 3-2, 4-2 라운드에 적용될 [T1, T2, T3] 등급 (게임 시작 시 무작위 추첨하여 8인 전원 동일 적용)
   */
  public gameAugmentTiers: [AugmentTier, AugmentTier, AugmentTier] = ['SILVER', 'GOLD', 'PRISMATIC'];
  public currentAugmentTier: AugmentTier | null = null;
  /** 현재 증강 페이즈의 라운드 라벨 (2-1 / 3-2 / 4-2) — 단계별 풀 게이트 */
  public currentAugmentStage: '2-1' | '3-2' | '4-2' | null = null;
  public playerAugmentChoices: AugmentDefinition[] = [];
  public augmentCardRerolled: [boolean, boolean, boolean] = [false, false, false];
  /** 이번 증강 페이즈에서 한 번이라도 제시된 ID (리롤로 버린 카드 포함 — 재출현 금지) */
  public offeredAugmentIdsThisPhase: string[] = [];

  /**
   * 모바일형 회전초밥(운명의 모루) 선택지 4종
   */
  public playerAnvilChoices: FateAnvilOption[] = [];

  /**
   * 현재 라운드의 매칭 페어링 및 플레이어 실시간 전투 엔진
   */
  public currentPairings: MatchPairing[] = [];
  public playerCombatEngine: CombatEngine = new CombatEngine();
  public playerCurrentOpponentName: string = '';
  public isPlayerFightingGhost: boolean = false;

  /**
   * 최근 라운드 결과 로그 및 상단 배너 알림 큐
   */
  public lastRoundResults: RoundMatchResult[] = [];
  public bannerNotifications: string[] = [];

  /**
   * 탈락 순서 기록 (나중에 탈락할수록 높은 순위 부여)
   */
  private eliminationOrderIds: string[] = [];
  private lastOpponentMap: Map<string, string> = new Map();

  /**
   * 게임 종료 시 최종 순위 및 LP 정산 결과
   */
  public finalPlacement: number | null = null;
  public rankSettlementResult: RankUpdateResult | null = null;

  private combatIntervalId: number | null = null;
  private onStateChangeCallback?: () => void;

  constructor(onStateChange?: () => void, autoStart: boolean = true) {
    this.sharedPool = new SharedPoolManager();
    this.rankManager = new RankManager();
    this.aiController = new AIBotController(this.rankManager);
    this.onStateChangeCallback = onStateChange;
    if (autoStart) {
      this.startNewGame();
    } else {
      // 로비 대기 상태 초기화
      this.player = new Participant('player_1', '지휘관', false, null);
      this.participants = [this.player, ...this.aiController.createSevenAIBots()];
    }
  }

  public pauseOrStopGame(): void {
    this.stopPrepTimer();
    this.stopCombatLoopTimer();
    this.clearResolutionTimeout();
  }

  public setOnStateChange(cb: () => void): void {
    this.onStateChangeCallback = cb;
  }

  private notifyStateChange(): void {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  public pushBannerNotification(message: string): void {
    this.bannerNotifications.unshift(message);
    if (this.bannerNotifications.length > 15) {
      this.bannerNotifications.pop();
    }
  }

  /**
   * 새 게임(8인 로비: 플레이어 1명 + 7인 7색 AI 봇 7명)을 초기화하고 1-1 라운드를 시작한다.
   */
  public startNewGame(): void {
    this.stopPrepTimer();
    this.stopCombatLoopTimer();
    this.clearResolutionTimeout();
    this.sharedPool.resetPool();

    this.player = new Participant('player_1', '지휘관', false, null);
    const bots = this.aiController.createSevenAIBots();
    this.participants = [this.player, ...bots];

    this.stage = 1;
    this.roundInStage = 1;
    this.viewedParticipantId = this.player.id;
    this.playerLootOrbs = [];
    this.bannerNotifications = [];
    this.lastRoundResults = [];
    this.eliminationOrderIds = [];
    this.lastOpponentMap.clear();
    this.finalPlacement = null;
    this.rankSettlementResult = null;
    this.activeFinisherLaser = null;

    // 판마다 무작위 증강 등급 조합 추첨 (모든 플레이어 동일 등급 적용)
    const augmentTierCombos: [AugmentTier, AugmentTier, AugmentTier][] = [
      ['SILVER', 'GOLD', 'PRISMATIC'],
      ['GOLD', 'GOLD', 'GOLD'],
      ['SILVER', 'GOLD', 'GOLD'],
      ['GOLD', 'SILVER', 'GOLD'],
      ['GOLD', 'GOLD', 'PRISMATIC'],
      ['PRISMATIC', 'GOLD', 'GOLD'],
      ['SILVER', 'SILVER', 'GOLD'],
      ['PRISMATIC', 'GOLD', 'PRISMATIC'],
      ['PRISMATIC', 'PRISMATIC', 'PRISMATIC'],
    ];
    this.gameAugmentTiers =
      augmentTierCombos[Math.floor(Math.random() * augmentTierCombos.length)];


    // 8인 전원 초기 골드(10G), 레벨 1, 시작 1코스트 기물 1기 지급 및 첫 상점 추첨
    for (const p of this.participants) {
      p.gold = 10;
      p.level = 1;
      p.xp = 0;

      // 시작 기물 1코스트 1기 랜덤 지급 (공유 풀 차감)
      const starterCandidates = UNITS_BY_COST[1].filter(
        (u) => this.sharedPool.getRemainingCount(u.id) > 0
      );
      if (starterCandidates.length > 0) {
        const picked =
          starterCandidates[Math.floor(Math.random() * starterCandidates.length)];
        if (this.sharedPool.pullSpecificUnitFromPool(picked.id)) {
          const starterInstance = Participant.createUnitInstance(picked.id, 1);
          p.board[0][3] = starterInstance;
        }
      }

      this.sharedPool.drawShopForParticipant(p);
    }

    this.pushBannerNotification(
      '⚔️ 판타지 오토배틀러 8인 로비 매치가 시작되었습니다! (라운드 1-1: 들판 미니언 포식자)'
    );
    this.beginRoundEntrySequence();
  }

  /**
   * 현재 라운드 문자열 반환 (예: "1-1", "2-1", "4-2")
   */
  public getRoundLabel(): string {
    return `${this.stage}-${this.roundInStage}`;
  }

  /**
   * 현재 라운드의 유형(초반 크립 / 보스 크립 / 대인전) 판별
   */
  public getCurrentRoundType(): RoundType {
    if (this.stage === 1) {
      return 'CREEP';
    }
    if (this.roundInStage === 5) {
      return 'BOSS_CREEP';
    }
    return 'PVP';
  }

  /**
   * 현재 정찰(Scouting) 화면에 표시할 참가자 객체 반환
   */
  public getViewedParticipant(): Participant {
    return (
      this.participants.find((p) => p.id === this.viewedParticipantId) ??
      this.player
    );
  }

  /**
   * 현재 정찰(Scouting) 중이거나 화면에 보고 있는 진영의 실시간 전투 엔진 및 대전 정보 반환
   */
  public getViewedCombatContext(): {
    engine: CombatEngine;
    viewedParticipant: Participant;
    opponentName: string;
    isCreepMatch: boolean;
  } | null {
    if (this.phase !== 'COMBAT_PHASE' && this.phase !== 'RESOLUTION_PHASE') {
      return null;
    }

    const viewed = this.getViewedParticipant();
    const pairing = this.currentPairings.find(
      (p) => p.home.id === viewed.id || (!p.isGhostMatch && p.away.id === viewed.id)
    );

    if (pairing && pairing.engine) {
      const isHome = pairing.home.id === viewed.id;
      const opponent = isHome ? pairing.away : pairing.home;
      const opponentName = pairing.isGhostMatch
        ? `${opponent.name} (고스트 군대)`
        : opponent.name;
      return {
        engine: pairing.engine,
        viewedParticipant: pairing.home,
        opponentName,
        isCreepMatch: pairing.isCreepMatch,
      };
    }

    return {
      engine: this.playerCombatEngine,
      viewedParticipant: this.player,
      opponentName: this.playerCurrentOpponentName,
      isCreepMatch: this.getCurrentRoundType() !== 'PVP',
    };
  }

  /**
   * 실제 TFT 순정 스테이지별 정비 시간(초):
   * - 1~2스테이지: 30초
   * - 3스테이지: 35초
   * - 4스테이지 이후: 40초
   */
  public getStandardPrepDurationSec(): number {
    if (this.stage <= 2) return 30;
    if (this.stage === 3) return 35;
    return 40;
  }

  // ==========================================================================
  // 1. 라운드 진입 시퀀스 (증강체 2-1/3-2/4-2 -> 운명의 모루 2-4/3-4/4-4 -> 정비 페이즈)
  // ==========================================================================

  private beginRoundEntrySequence(): void {
    this.stopPrepTimer();
    this.clearResolutionTimeout();
    this.activeFinisherLaser = null;
    const label = this.getRoundLabel();

    // 1) 2-1, 3-2, 4-2 라운드 시작 시: 증강체 선택 페이즈(AUGMENT_PHASE) 발동
    // 판마다 무작위로 추첨된 [T1, T2, T3] 등급에 따라 모든 참가자가 동일 등급 증강 카드를 수신!
    if (label === '2-1' || label === '3-2' || label === '4-2') {
      const idx = label === '2-1' ? 0 : label === '3-2' ? 1 : 2;
      const tier: AugmentTier = this.gameAugmentTiers[idx];
      this.triggerAugmentPhase(tier);
      return;
    }

    // 2) 2-4, 3-4, 4-4 라운드 시작 시: 모바일형 회전초밥(운명의 모루 선택 페이즈) 발동
    if (label === '2-4' || label === '3-4' || label === '4-4') {
      this.triggerFateAnvilPhase();
      return;
    }

    // 3) 일반 라운드: 즉시 정비 페이즈(PREPARATION_PHASE) 진입
    this.enterPreparationPhase();
  }

  /**
   * 증강체 선택 페이즈(AUGMENT_PHASE) 시작:
   * 플레이어에게 3장의 증강체 카드를 제시(카드별 1회 리롤 가능)하고 AI 7명도 즉시 선택한다.
   */
  private triggerAugmentPhase(tier: AugmentTier): void {
    this.phase = 'AUGMENT_PHASE';
    this.currentAugmentTier = tier;
    const label = this.getRoundLabel();
    this.currentAugmentStage =
      label === '2-1' || label === '3-2' || label === '4-2' ? label : null;
    this.augmentCardRerolled = [false, false, false];
    this.offeredAugmentIdsThisPhase = [];
    this.playerAugmentChoices = DopamineEngine.rollAugmentChoices(
      this.player,
      tier,
      [],
      this.currentAugmentStage ?? undefined,
      3
    );
    this.offeredAugmentIdsThisPhase = this.playerAugmentChoices.map((c) => c.id);

    for (const p of this.participants) {
      if (p.isAI && !p.isEliminated) {
        this.aiController.selectAugmentForBot(
          p,
          tier,
          this.sharedPool,
          this.participants,
          this.currentAugmentStage ?? undefined
        );
      }
    }

    this.pushBannerNotification(
      `✨ [${label}] ${tier} 등급 증강체 선택 페이즈! 원하는 증강체 카드를 선택하세요.`
    );
    this.notifyStateChange();
  }

  /**
   * 플레이어가 특정 증강체 카드(0, 1, 2)를 1회 리롤한다.
   * 이미 제시됐던 카드(다른 칸·리롤로 버린 카드 포함)는 다시 나오지 않는다.
   */
  public rerollPlayerAugmentCard(cardIndex: 0 | 1 | 2): boolean {
    if (
      this.phase !== 'AUGMENT_PHASE' ||
      !this.currentAugmentTier ||
      this.augmentCardRerolled[cardIndex]
    ) {
      return false;
    }

    const replacementList = DopamineEngine.rollAugmentChoices(
      this.player,
      this.currentAugmentTier,
      this.offeredAugmentIdsThisPhase,
      this.currentAugmentStage ?? undefined,
      1
    );

    if (replacementList.length > 0) {
      this.playerAugmentChoices[cardIndex] = replacementList[0];
      this.offeredAugmentIdsThisPhase.push(replacementList[0].id);
      this.augmentCardRerolled[cardIndex] = true;
      this.notifyStateChange();
      return true;
    }

    return false;
  }

  /**
   * 플레이어가 증강체 카드 1장을 최종 선택하면 즉시 적용 후 정비 페이즈로 이동한다.
   */
  public selectPlayerAugment(cardIndex: number): boolean {
    if (this.phase !== 'AUGMENT_PHASE') return false;
    const chosen = this.playerAugmentChoices[cardIndex];
    if (!chosen) return false;

    this.player.applyAugment(chosen.id, this.sharedPool);
    this.pushBannerNotification(
      `✨ 증강체 [${chosen.name}] 선택 완료! 정비 페이즈를 시작합니다.`
    );
    this.currentAugmentTier = null;
    this.currentAugmentStage = null;
    this.offeredAugmentIdsThisPhase = [];
    this.playerAugmentChoices = [];
    this.enterPreparationPhase();
    return true;
  }

  /**
   * 2-4, 3-4, 4-4 모바일형 회전초밥(운명의 모루 선택 페이즈) 시작
   */
  private triggerFateAnvilPhase(): void {
    this.phase = 'ANVIL_PHASE';
    const isLateStage = this.stage >= 4;

    const completedItems = Object.values(ITEM_DEFINITIONS).filter(
      (i) => i.isCompleted
    );
    const randomCompleted =
      completedItems[Math.floor(Math.random() * completedItems.length)];
    const randomBaseA =
      BASE_ITEM_IDS[Math.floor(Math.random() * BASE_ITEM_IDS.length)];
    const randomBaseB =
      BASE_ITEM_IDS.find((b) => b !== randomBaseA) ?? BASE_ITEM_IDS[0];

    const targetCost = isLateStage ? 5 : this.stage === 3 ? 4 : 3;
    const unitPool = UNITS_BY_COST[targetCost];
    const featuredUnit =
      unitPool[Math.floor(Math.random() * unitPool.length)] ?? UNITS_BY_COST[3][0];

    this.playerAnvilChoices = [
      {
        id: 'anvil_opt_1',
        label: `[${ITEM_DEFINITIONS[randomBaseA].name}] + 4 골드`,
        description: `${ITEM_DEFINITIONS[randomBaseA].description} 기본 아이템 1개와 4골드를 획득합니다.`,
        icon: ITEM_DEFINITIONS[randomBaseA].icon,
        itemId: randomBaseA,
        gold: 4,
      },
      {
        id: 'anvil_opt_2',
        label: `[${ITEM_DEFINITIONS[randomBaseB].name}] + 4 골드`,
        description: `${ITEM_DEFINITIONS[randomBaseB].description} 기본 아이템 1개와 4골드를 획득합니다.`,
        icon: ITEM_DEFINITIONS[randomBaseB].icon,
        itemId: randomBaseB,
        gold: 4,
      },
      {
        id: 'anvil_opt_3',
        label: `[${featuredUnit.name}] (${featuredUnit.cost}코스트)`,
        description: `고코스트 핵심 기물 [${featuredUnit.name}] 1성과 2골드를 무료로 영입합니다.`,
        icon: featuredUnit.icon,
        unitId: featuredUnit.id,
        gold: 2,
      },
      {
        id: 'anvil_opt_4',
        label: isLateStage
          ? `[${randomCompleted.name}] 완성 아이템`
          : `챔피언 복제기 1개 + 6 골드`,
        description: isLateStage
          ? `상위 완성 아이템 [${randomCompleted.name}] 1개를 즉시 획득합니다!`
          : `원하는 기물을 복제하는 챔피언 복제기 1개와 6골드를 획득합니다!`,
        icon: isLateStage ? randomCompleted.icon : '🧬',
        itemId: isLateStage ? (randomCompleted.id as CompletedItemId) : undefined,
        duplicators: isLateStage ? undefined : 1,
        gold: isLateStage ? 0 : 6,
      },
    ];

    // AI 봇들도 운명의 모루 보상으로 기본 아이템 1개 + 4골드 획득
    for (const p of this.participants) {
      if (p.isAI && !p.isEliminated) {
        const botItem =
          BASE_ITEM_IDS[Math.floor(Math.random() * BASE_ITEM_IDS.length)];
        p.addItemToBench(botItem);
        p.gold += 4;
      }
    }

    this.pushBannerNotification(
      `⚒️ [${this.getRoundLabel()} 운명의 모루] 4가지 보물 중 1개를 무료로 선택하세요!`
    );
    this.notifyStateChange();
  }

  /**
   * 플레이어가 운명의 모루 선택지(0~3)를 선택하면 보상을 지급하고 정비 페이즈로 진입한다.
   */
  public selectPlayerAnvilOption(optionIndex: number): boolean {
    if (this.phase !== 'ANVIL_PHASE') return false;
    const option = this.playerAnvilChoices[optionIndex];
    if (!option) return false;

    if (option.gold) {
      this.player.gold += option.gold;
    }
    if (option.duplicators) {
      this.player.duplicators += option.duplicators;
    }
    if (option.itemId) {
      this.player.addItemToBench(option.itemId);
    }
    if (option.unitId) {
      if (this.sharedPool.pullSpecificUnitFromPool(option.unitId)) {
        const emptyIdx = this.player.bench.findIndex((s) => s === null);
        if (emptyIdx !== -1) {
          this.player.bench[emptyIdx] = Participant.createUnitInstance(
            option.unitId,
            1
          );
          this.player.tryMergeUnits(option.unitId, this.sharedPool);
        } else {
          this.sharedPool.returnUnitToPool(option.unitId, 1);
          this.player.gold += UNIT_TEMPLATES[option.unitId]?.cost ?? 3;
        }
      } else {
        this.player.gold += UNIT_TEMPLATES[option.unitId]?.cost ?? 3;
      }
    }

    this.pushBannerNotification(`⚒️ [운명의 모루] ${option.label} 획득 완료!`);
    this.playerAnvilChoices = [];
    this.enterPreparationPhase();
    return true;
  }

  // ==========================================================================
  // 2. 정비 페이즈 (PREPARATION_PHASE): 실시간 카운트다운(30s/35s/40s) + AI 동적 올인 APM
  // ==========================================================================

  private enterPreparationPhase(): void {
    this.stopPrepTimer();
    this.phase = 'PREPARATION_PHASE';
    this.activeFinisherLaser = null;
    const roundLabel = this.getRoundLabel();

    // 1. 생존자 전원 라운드 시작 증강체 효과(판도라의 대기석 등) 발동
    for (const p of this.participants) {
      if (!p.isEliminated) {
        const logs = DopamineEngine.processRoundStartAugments(p, this.sharedPool);
        if (!p.isAI && logs.length > 0) {
          for (const log of logs) {
            this.pushBannerNotification(log);
          }
        }
      }
    }

    // 1.5 Step 7b: 동적 전략/페르소나 전환 평가 (EXPERIMENT_DYNAMIC_STRATEGY=1, X-1/X-2만)
    // prepareBotForRealTimePrep보다 먼저 실행해야 골드 하한·리롤 상한이 새 페르소나로 갱신된다.
    {
      const stage = this.stage;
      const roundInStage = this.roundInStage;
      const isStrategyEvalWindow =
        stage >= 2 && (roundInStage === 1 || roundInStage === 2);
      if (
        typeof process !== 'undefined' &&
        process.env?.EXPERIMENT_DYNAMIC_STRATEGY === '1' &&
        isStrategyEvalWindow
      ) {
        const absoluteRoundIndex = (stage - 1) * 5 + roundInStage;
        this.aiController.evaluateDynamicStrategies(
          this.participants,
          this.sharedPool,
          roundLabel,
          absoluteRoundIndex
        );
      }
    }

    // 2. 생존한 AI 봇 7명의 실시간 동적 APM(평상시 1~5초 간격 vs 올인 Rolldown 시 0.6~1초 '다다다다' 리롤) 초기화
    for (const p of this.participants) {
      if (p.isAI && !p.isEliminated) {
        this.aiController.prepareBotForRealTimePrep(
          p,
          this.participants,
          this.sharedPool,
          roundLabel
        );
      }
    }

    // 3. 플레이어가 만약 보드에 기물을 1기도 안 올렸고 대기석에 기물이 있다면 최소 1기는 자동 배치 보조
    if (this.player.getBoardUnitCount() === 0) {
      const firstBenchIdx = this.player.bench.findIndex((u) => u !== null);
      if (firstBenchIdx !== -1) {
        this.player.moveUnit(
          { area: 'BENCH', index: firstBenchIdx },
          { area: 'BOARD', row: 0, col: 3 }
        );
      }
    }

    // 4. 실제 TFT 순정 정비 타이머 가동 (초반 1~2스테이지 30초, 3스테이지 35초, 4스테이지 이후 40초)
    this.prepTotalSec = this.getStandardPrepDurationSec();
    this.prepRemainingSec = this.prepTotalSec;
    this.prepRemainingMs = this.prepTotalSec * 1000;
    this.startPrepCountdownTimer();

    this.notifyStateChange();
  }

  private startPrepCountdownTimer(): void {
    this.stopPrepTimer();
    if (typeof window === 'undefined') return;

    const tickMs = 200;
    this.prepTimerIntervalId = window.setInterval(() => {
      if (this.phase !== 'PREPARATION_PHASE') {
        this.stopPrepTimer();
        return;
      }

      const prevSec = this.prepRemainingSec;
      this.prepRemainingMs = Math.max(0, this.prepRemainingMs - tickMs);
      this.prepRemainingSec = Math.ceil(this.prepRemainingMs / 1000);

      // AI 봇 7명의 실시간 동적 APM 스텝 실행 (평상시 1~5초, 올인 타이밍 0.6~1.0초 초고속 리롤)
      let anyBotActed = false;
      const roundLabel = this.getRoundLabel();
      for (const p of this.participants) {
        if (p.isAI && !p.isEliminated) {
          if (
            this.aiController.stepBotRealTimeAPM(
              p,
              tickMs,
              this.participants,
              this.sharedPool,
              roundLabel
            )
          ) {
            anyBotActed = true;
          }
        }
      }

      if (this.prepRemainingMs <= 0) {
        this.stopPrepTimer();
        this.startCombatPhase();
        return;
      }

      if (this.prepRemainingSec !== prevSec || anyBotActed) {
        this.notifyStateChange();
      }
    }, tickMs);
  }

  private stopPrepTimer(): void {
    if (this.prepTimerIntervalId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.prepTimerIntervalId);
      this.prepTimerIntervalId = null;
    }
  }

  private clearResolutionTimeout(): void {
    if (this.resolutionTimeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.resolutionTimeoutId);
      this.resolutionTimeoutId = null;
    }
  }

  /**
   * 플레이어가 보드 위의 ?/! 미스터리 박스(LootOrb)를 터치하여 오픈한다.
   */
  public openPlayerLootOrb(orbId: string): string[] {
    const idx = this.playerLootOrbs.findIndex((o) => o.id === orbId);
    if (idx === -1) return [];

    const [orb] = this.playerLootOrbs.splice(idx, 1);
    const rewards = DopamineEngine.claimLootOrb(
      this.player,
      orb,
      this.sharedPool
    );
    this.pushBannerNotification(
      `🎁 [${orb.label ?? '미스터리 상자'}] 오픈: ${rewards.join(', ')}`
    );
    this.notifyStateChange();
    return rewards;
  }

  // ==========================================================================
  // 3. 전투 페이즈 (COMBAT_PHASE) 및 홀수 생존자 고스트(Ghost Army) 매칭
  // ==========================================================================

  /**
   * 정비 카운트다운 종료(0초) 또는 유저의 [즉시 전투] 단축 버튼 클릭 시 전투 페이즈로 진입한다.
   */
  public startCombatPhase(): void {
    if (this.phase !== 'PREPARATION_PHASE') return;
    this.stopPrepTimer();

    // 만약 유저가 타이머 종료 전에 수동으로 빨리 넘겼다면, AI 봇들의 남은 정비 턴을 즉시 완료시켜 공정성 유지
    const roundLabel = this.getRoundLabel();
    for (const p of this.participants) {
      if (p.isAI && !p.isEliminated) {
        this.aiController.executeAITurn(
          p,
          this.participants,
          this.sharedPool,
          roundLabel
        );
      }
    }

    // [Step 5 B] EXPERIMENT_BENCH_CLEAR: 정비 단계 종료 직전(전투 진입 직전) 대기석 정리
    if (typeof process !== 'undefined' && process.env?.EXPERIMENT_BENCH_CLEAR === '1') {
      for (const p of this.participants) {
        if (!p.isEliminated) {
          const brain = (this.aiController as any).botBrains?.get(p.id);
          if (brain) {
            this.aiController.executeExperimentalBenchClear(p, brain, this.sharedPool);
          }
        }
      }
    }

    // 전투 돌입 시 플레이어 보드에 빈자리가 있고 대기석에 기물이 있으면 자동 충원 보조
    while (this.player.getBoardUnitCount() < this.player.level) {
      const benchIdx = this.player.bench.findIndex((u) => u !== null);
      if (benchIdx === -1) break;
      let placed = false;
      for (let r = 0; r < Participant.BOARD_ROWS && !placed; r++) {
        for (let c = 0; c < Participant.BOARD_COLS && !placed; c++) {
          if (this.player.board[r][c] === null) {
            this.player.moveUnit(
              { area: 'BENCH', index: benchIdx },
              { area: 'BOARD', row: r, col: c }
            );
            placed = true;
          }
        }
      }
      if (!placed) break;
    }

    this.phase = 'COMBAT_PHASE';
    this.viewedParticipantId = this.player.id;
    this.currentPairings = this.buildRoundPairings();
    this.lastRoundResults = [];
    this.activeFinisherLaser = null;

    // 1. 모든 매칭(플레이어 매칭 포함)의 실시간 CombatEngine 초기화
    for (const pair of this.currentPairings) {
      const engine = new CombatEngine();
      engine.initCombat(pair.home, pair.away);
      pair.engine = engine;

      if (
        pair.home.id === this.player.id ||
        (!pair.isGhostMatch && pair.away.id === this.player.id)
      ) {
        this.playerCombatEngine = engine;
        const opponent =
          pair.home.id === this.player.id ? pair.away : pair.home;
        this.playerCurrentOpponentName = pair.isGhostMatch
          ? `${opponent.name} (고스트 군대)`
          : opponent.name;
        this.isPlayerFightingGhost = pair.isGhostMatch;
      }
    }

    // 2. 플레이어 및 모든 봇 전투 실시간 틱 타이머 가동 (1x: 50ms, 2x: 25ms)
    this.startCombatLoopTimer();
    this.notifyStateChange();
  }

  /**
   * 전투 중 배속 전환 (1x <-> 2x)
   */
  public setPlaybackSpeed(speed: 1 | 2): void {
    this.playbackSpeed = speed;
    if (this.phase === 'COMBAT_PHASE') {
      this.startCombatLoopTimer();
    }
    this.notifyStateChange();
  }

  /**
   * 전투 중 [⚡ 즉시 결과 스킵] 버튼을 눌렀을 때 남은 전투를 즉시 시뮬레이션하고 정산 페이즈로 넘어간다.
   */
  public skipCombatToResolution(): void {
    if (this.phase !== 'COMBAT_PHASE') return;
    this.stopCombatLoopTimer();
    for (const pairing of this.currentPairings) {
      if (pairing.engine && !pairing.engine.isFinished) {
        pairing.engine.simulateToCompletion();
      }
    }
    this.resolveAllMatchesAndAdvance();
  }

  private startCombatLoopTimer(): void {
    this.stopCombatLoopTimer();
    const intervalMs = this.playbackSpeed === 2 ? 25 : 50;

    if (typeof window !== 'undefined') {
      this.combatIntervalId = window.setInterval(() => {
        if (this.phase !== 'COMBAT_PHASE') {
          this.stopCombatLoopTimer();
          return;
        }

        // 모든 매칭의 전투 틱 동시 진행
        for (const pairing of this.currentPairings) {
          if (pairing.engine && !pairing.engine.isFinished) {
            pairing.engine.stepTick(50);
          }
        }

        if (!this.playerCombatEngine.isFinished) {
          this.notifyStateChange();
        } else {
          this.stopCombatLoopTimer();
          this.resolveAllMatchesAndAdvance();
        }
      }, intervalMs);
    }
  }

  private stopCombatLoopTimer(): void {
    if (this.combatIntervalId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.combatIntervalId);
      this.combatIntervalId = null;
    }
  }

  /**
   * 크립 라운드(전용 몬스터/동물 스폰) 또는 대인전(홀수 생존자 고스트 매칭 포함) 페어링 생성
   */
  private buildRoundPairings(): MatchPairing[] {
    const roundType = this.getCurrentRoundType();
    const roundLabel = this.getRoundLabel();
    const aliveList = this.participants.filter((p) => !p.isEliminated);
    const pairings: MatchPairing[] = [];

    // A. 크립 / 보스 크립 라운드: 전용 야생 몬스터/동물 군단(CreepRoundManager)과 1:1 전투
    if (roundType === 'CREEP' || roundType === 'BOSS_CREEP') {
      for (const p of aliveList) {
        const creepOpponent = CreepRoundManager.createCreepOpponentForRound(
          roundLabel,
          roundType
        );
        pairings.push({
          home: p,
          away: creepOpponent,
          isGhostMatch: false,
          isCreepMatch: true,
        });
      }
      return pairings;
    }

    // B. 대인전(PVP) 매칭: 최근에 만나지 않은 상대 우선 매칭
    const pool = [...aliveList].sort(() => Math.random() - 0.5);

    while (pool.length >= 2) {
      const home = pool.shift()!;
      const lastOppId = this.lastOpponentMap.get(home.id);

      let partnerIdx = pool.findIndex((cand) => cand.id !== lastOppId);
      if (partnerIdx === -1) {
        partnerIdx = 0;
      }

      const [away] = pool.splice(partnerIdx, 1);
      this.lastOpponentMap.set(home.id, away.id);
      this.lastOpponentMap.set(away.id, home.id);

      // 플레이어가 away에 뽑혔다면 화면 표시 편의를 위해 플레이어를 home으로 배치
      if (away.id === this.player.id) {
        pairings.push({
          home: away,
          away: home,
          isGhostMatch: false,
          isCreepMatch: false,
        });
      } else {
        pairings.push({
          home,
          away,
          isGhostMatch: false,
          isCreepMatch: false,
        });
      }
    }

    // C. 홀수 생존자(7명, 5명, 3명)여서 1명이 남았을 때:
    // 무작위 다른 생존자 1명의 보드를 복제한 고스트 군대(Ghost Army)와 매칭!
    if (pool.length === 1) {
      const oddParticipant = pool.shift()!;
      const otherCandidates = aliveList.filter((p) => p.id !== oddParticipant.id);
      const ghostSource =
        otherCandidates[Math.floor(Math.random() * otherCandidates.length)] ??
        oddParticipant;

      const ghostClone = this.createGhostParticipantClone(ghostSource);
      pairings.push({
        home: oddParticipant,
        away: ghostClone,
        isGhostMatch: true,
        ghostSourceParticipant: ghostSource,
        isCreepMatch: false,
      });
    }

    return pairings;
  }

  /**
   * 고스트 군대(Ghost Army) 복제 참가자 생성 (원본 참가자의 보드와 시너지만 복제)
   */
  private createGhostParticipantClone(source: Participant): Participant {
    const ghost = new Participant(
      `ghost_${source.id}`,
      `${source.name}의 환영`,
      true,
      source.persona
    );
    ghost.level = source.level;
    ghost.augments = [...source.augments];
    ghost.bonusTraits = new Map(source.bonusTraits);

    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const u = source.board[r][c];
        if (u) {
          ghost.board[r][c] = Participant.createUnitInstance(
            u.unitId,
            u.starLevel,
            [...u.items]
          );
        }
      }
    }
    return ghost;
  }

  // ==========================================================================
  // 4. 정산 페이즈 (RESOLUTION_PHASE): 아바타 레이저 피니시 연출, 공정성 ?/! 미스터리 상자, 황금 고블린, 이자 지급
  // ==========================================================================

  private resolveAllMatchesAndAdvance(): void {
    this.phase = 'RESOLUTION_PHASE';
    const results: RoundMatchResult[] = [];
    const roundLabel = this.getRoundLabel();
    const roundType = this.getCurrentRoundType();

    for (const pairing of this.currentPairings) {
      let summary: CombatSummary;

      if (pairing.engine) {
        if (!pairing.engine.isFinished) {
          pairing.engine.simulateToCompletion();
        }
        summary = pairing.engine.getCombatSummary(this.stage);
      } else {
        // 백업: 엔진이 없었던 경우 즉시 시뮬레이션
        const bgEngine = new CombatEngine();
        bgEngine.initCombat(pairing.home, pairing.away);
        bgEngine.simulateToCompletion();
        summary = bgEngine.getCombatSummary(this.stage);
      }

      const baseStageDmg = Math.max(2, this.stage * 2);
      let homeDamageTaken = 0;
      let awayDamageTaken = 0;

      if (summary.winner === 'HOME') {
        awayDamageTaken =
          pairing.isGhostMatch || pairing.isCreepMatch
            ? baseStageDmg + summary.survivingHomeUnits * 2
            : baseStageDmg + summary.survivingHomeUnits * 2;
      } else if (summary.winner === 'AWAY') {
        homeDamageTaken = baseStageDmg + summary.survivingAwayUnits * 2;
      } else {
        homeDamageTaken = 2;
        awayDamageTaken = 2;
      }

      // 플레이어 매치 종료 시: 크립전이 아닐 때만 승리 지휘관 아바타 -> 패배 지휘관 아바타 피니시 레이저 발사!
      if (pairing.home.id === this.player.id && !pairing.isCreepMatch) {
        if (summary.winner === 'HOME') {
          this.activeFinisherLaser = {
            id: this.finisherSeqCounter++,
            winnerSide: 'HOME',
            winnerName: this.player.name,
            loserName: pairing.away.name,
            damage: awayDamageTaken,
            survivingUnits: summary.survivingHomeUnits,
          };
        } else if (summary.winner === 'AWAY') {
          this.activeFinisherLaser = {
            id: this.finisherSeqCounter++,
            winnerSide: 'AWAY',
            winnerName: pairing.away.name,
            loserName: this.player.name,
            damage: homeDamageTaken,
            survivingUnits: summary.survivingAwayUnits,
          };
        }
      }

      // 1) HOME 참가자 승패/연승/연패/체력/황금 고블린 처리
      this.applyCombatOutcomeToParticipant(
        pairing.home,
        summary.winner === 'HOME',
        summary.winner === 'DRAW',
        homeDamageTaken,
        pairing.isCreepMatch
      );

      // 2) AWAY 참가자 처리 (고스트나 크립이 아닌 실제 참가자일 때만)
      if (!pairing.isGhostMatch && !pairing.isCreepMatch) {
        this.applyCombatOutcomeToParticipant(
          pairing.away,
          summary.winner === 'AWAY',
          summary.winner === 'DRAW',
          awayDamageTaken,
          false
        );
      }

      results.push({
        homeId: pairing.home.id,
        homeName: pairing.home.name,
        awayId: pairing.away.id,
        awayName: pairing.away.name,
        isGhostMatch: pairing.isGhostMatch,
        isCreepMatch: pairing.isCreepMatch,
        winner: summary.winner,
        homeDamageTaken,
        awayDamageTaken,
        survivingHomeUnits: summary.survivingHomeUnits,
        survivingAwayUnits: summary.survivingAwayUnits,
      });
    }

    this.lastRoundResults = results;

    // 3) 크립 라운드 종료 시: 8인 공정성 보장 법칙(Loot Equity Rule)에 따라 ?/! 미스터리 박스 및 AI 동기화 전리품 지급!
    if (roundType === 'CREEP' || roundType === 'BOSS_CREEP') {
      const aiBots = this.participants.filter((p) => p.isAI && !p.isEliminated);
      const deathHexes: Array<{ row: number; col: number }> = [];
      if (this.playerCombatEngine) {
        for (const u of this.playerCombatEngine.units) {
          if (u.team === 'AWAY' && u.currentHp <= 0) {
            deathHexes.push({ row: u.row, col: u.col });
          }
        }
      }
      const mysteryBoxes = CreepRoundManager.distributeEquityCreepLoot(
        roundLabel,
        roundType,
        this.player,
        aiBots,
        deathHexes
      );
      if (mysteryBoxes.length > 0) {
        this.playerLootOrbs.push(...mysteryBoxes);
        this.pushBannerNotification(
          `🎁 [${roundLabel} 크립 처치!] 전장에 ?/! 미스터리 보물상자 ${mysteryBoxes.length}개가 드랍되었습니다! 터치하여 오픈하세요!`
        );
      }
    }

    // 4) 체력 0 이하 탈락자 처리 및 공유 풀 100% 환원
    for (const p of this.participants) {
      if (!p.isEliminated && p.hp <= 0) {
        p.eliminate(this.sharedPool);
        if (!this.eliminationOrderIds.includes(p.id)) {
          this.eliminationOrderIds.push(p.id);
        }
        const elimMsg = `🔥 [${p.name}] 탈락! 보유하던 모든 기물이 공유 풀로 반환되었습니다!`;
        this.pushBannerNotification(elimMsg);
      }
    }

    // 5) 게임 종료 조건 확인 (플레이어 탈락 또는 생존자 1명 이하)
    const aliveParticipants = this.participants.filter((p) => !p.isEliminated);
    if (this.player.isEliminated || aliveParticipants.length <= 1) {
      this.finalizeGameAndRank();
      return;
    }

    // 6) 아바타 레이저 피니시 연출을 감상할 수 있도록 약 1.15초 동안 RESOLUTION_PHASE를 유지한 뒤 다음 라운드로 전진!
    this.notifyStateChange();

    if (typeof window !== 'undefined') {
      this.clearResolutionTimeout();
      this.resolutionTimeoutId = window.setTimeout(() => {
        this.distributeRoundIncomeAndRefreshShops();
        this.advanceRoundCounter();
        this.beginRoundEntrySequence();
      }, 1150);
    } else {
      this.distributeRoundIncomeAndRefreshShops();
      this.advanceRoundCounter();
      this.beginRoundEntrySequence();
    }
  }

  /**
   * 개별 참가자에게 전투 승패, 연승/연패, 체력 차감, 황금 고블린 스택/캐시아웃을 적용한다.
   */
  private applyCombatOutcomeToParticipant(
    participant: Participant,
    didWin: boolean,
    isDraw: boolean,
    damageTaken: number,
    isCreepMatch: boolean
  ): void {
    if (participant.isEliminated) return;

    // 연승/연패 갱신 및 승리 즉시 +1골드 보너스
    if (didWin) {
      participant.winStreak += 1;
      participant.loseStreak = 0;
      if (!isCreepMatch) {
        participant.gold += 1;
        // 국왕시해자: 승리 시 1골드, 상대 체력이 더 높았다면 6골드
        if (participant.augments.includes('AUG_KINGSLAYER')) {
          participant.gold += 1;
        }
      }
    } else if (!isDraw) {
      participant.loseStreak += 1;
      participant.winStreak = 0;
      // 계산된 패배: 2골드 + 무료 새로고침 1
      if (
        !isCreepMatch &&
        participant.augments.includes('AUG_CALCULATED_LOSS')
      ) {
        participant.gold += 2;
        participant.freeRerolls += 1;
      }
    }

    // 체력 차감 (저주받은 왕관: 패배 피해 2배)
    let finalDamage = damageTaken;
    if (
      finalDamage > 0 &&
      !didWin &&
      !isDraw &&
      participant.augments.includes('AUG_CURSED_CROWN')
    ) {
      finalDamage *= 2;
    }
    if (finalDamage > 0) {
      participant.hp = Math.max(0, participant.hp - finalDamage);
    }

    // 황금 고블린(GOLDEN_GOBLIN) 시너지 패배 스택 축적 또는 승리 캐시아웃 발동!
    if (!isCreepMatch && participant.hp > 0) {
      const synergies = SynergyEngine.getActiveSynergyMap(participant);
      const goblinCount = synergies.get('GOLDEN_GOBLIN')?.count ?? 0;

      if (goblinCount >= 3) {
        const cashoutOrbs = DopamineEngine.processGoldenGoblinTrait(
          participant,
          goblinCount,
          didWin,
          this.sharedPool
        );

        if (cashoutOrbs.length > 0) {
          if (!participant.isAI) {
            this.playerLootOrbs.push(...cashoutOrbs);
            this.pushBannerNotification(
              `💥🪙 [황금 고블린 금고 대폭발!] ! 대박 미스터리 상자 ${cashoutOrbs.length}개가 보드에 쏟아졌습니다! 터치하여 오픈하세요!`
            );
          } else {
            // AI 봇은 캐시아웃 구슬을 즉시 오픈하여 보상 획득
            for (const orb of cashoutOrbs) {
              DopamineEngine.claimLootOrb(participant, orb, this.sharedPool);
            }
            this.pushBannerNotification(
              `💥🪙 [${participant.name}] 황금 고블린 금고 캐시아웃 성공!`
            );
          }
        }
      }
    }
  }

  /**
   * 라운드 기본 골드(5G) + 이자 골드(최대 5G / 사악한 금융 7G) + 연승/연패 골드 지급 및 +2 XP, 상점 자동 새로고침
   */
  private distributeRoundIncomeAndRefreshShops(): void {
    // 스테이지 1~2는 TFT보다 타이트하게 (골드 과속 체감 완화)
    const baseGold =
      this.stage === 1
        ? this.roundInStage === 1
          ? 2
          : 3
        : this.stage === 2
          ? 3
          : this.stage === 3
            ? 4
            : 5;

    for (const p of this.participants) {
      if (p.isEliminated) continue;

      const interestGold = p.calculateInterestGold();
      const maxStreak = Math.max(p.winStreak, p.loseStreak);
      // TFT에 가깝게: 2연은 0, 3연=1, 4연=2, 5연+=3 (기존 2연부터 +1이라 골드가 빨리 쌓임)
      let streakGold =
        maxStreak >= 5 ? 3 : maxStreak >= 4 ? 2 : maxStreak >= 3 ? 1 : 0;
      // 전술적 후퇴: 연패 골드 1.5배
      if (p.augments.includes('AUG_TACTICAL_RETREAT') && p.loseStreak >= 2) {
        streakGold = Math.floor(streakGold * 1.5);
      }

      p.gold += baseGold + interestGold + streakGold;
      p.addXp(2, this.sharedPool);

      if (!p.isShopLocked) {
        this.sharedPool.drawShopForParticipant(p);
      } else {
        p.isShopLocked = false;
      }
    }
  }

  /**
   * 스테이지 및 라운드 번호 전진
   * - 스테이지 1은 1-1, 1-2 (2라운드) 후 2-1로 진입
   * - 스테이지 2 이상은 X-1 ~ X-5 (5라운드)로 구성
   */
  private advanceRoundCounter(): void {
    if (this.stage === 1) {
      if (this.roundInStage < 2) {
        this.roundInStage += 1;
      } else {
        this.stage = 2;
        this.roundInStage = 1;
      }
      return;
    }

    if (this.roundInStage < 5) {
      this.roundInStage += 1;
    } else {
      this.stage += 1;
      this.roundInStage = 1;
    }
  }

  /**
   * 게임 종료 시 플레이어 최종 등수(1~8위) 산출 및 RankManager LP 업데이트
   */
  private finalizeGameAndRank(): void {
    this.stopPrepTimer();
    this.stopCombatLoopTimer();
    this.clearResolutionTimeout();
    this.phase = 'GAME_OVER_PHASE';

    const aliveCount = this.participants.filter((p) => !p.isEliminated).length;
    let placement = 1;

    if (!this.player.isEliminated && aliveCount === 1) {
      placement = 1;
    } else {
      // 플레이어가 탈락한 시점의 생존자 수 + 1 (동시 탈락 보정)
      placement = Math.max(2, Math.min(8, aliveCount + 1));
    }

    this.finalPlacement = placement;
    this.rankSettlementResult = this.rankManager.updateRankAfterGame(placement);
    this.pushBannerNotification(this.rankSettlementResult.summaryText);
    this.notifyStateChange();
  }
}

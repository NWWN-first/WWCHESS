// src/GameLoopManager.ts

import { AIBotController } from './AIBotController';
import { CombatEngine, CombatSummary } from './CombatEngine';
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
import { Participant, UnitInstance } from './Participant';
import { RankManager, RankUpdateResult } from './RankManager';
import { SharedPoolManager } from './SharedPoolManager';
import { CombatEvent } from './SkillRegistry';
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
   * 현재 플레이어가 정찰(Scouting) 중인 참가자 ID (기본값: 플레이어 자신)
   */
  public viewedParticipantId: string = 'player_1';

  /**
   * 플레이어 보드 위에 드랍된 전리품 구슬(Loot Orbs) 목록
   */
  public playerLootOrbs: LootOrb[] = [];

  /**
   * 증강체 선택 페이즈 상태 (카드 3장 + 카드별 1회 리롤 가능 여부)
   */
  public currentAugmentTier: AugmentTier | null = null;
  public playerAugmentChoices: AugmentDefinition[] = [];
  public augmentCardRerolled: [boolean, boolean, boolean] = [false, false, false];

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

  constructor(onStateChange?: () => void) {
    this.sharedPool = new SharedPoolManager();
    this.rankManager = new RankManager();
    this.aiController = new AIBotController(this.rankManager);
    this.onStateChangeCallback = onStateChange;
    this.startNewGame();
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
    this.stopCombatLoopTimer();
    this.sharedPool.resetPool();

    this.player = new Participant('player_1', '나 (전설이)', false, null);
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
      '⚔️ 판타지 오토배틀러 8인 로비 매치가 시작되었습니다! (라운드 1-1: 고블린 정찰병)'
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

  // ==========================================================================
  // 1. 라운드 진입 시퀀스 (증강체 2-1/3-2/4-2 -> 운명의 모루 2-4/3-4/4-4 -> 정비 페이즈)
  // ==========================================================================

  private beginRoundEntrySequence(): void {
    const label = this.getRoundLabel();

    // 1) 2-1, 3-2, 4-2 라운드 시작 시: 증강체 선택 페이즈(AUGMENT_PHASE) 발동
    if (label === '2-1' || label === '3-2' || label === '4-2') {
      const tier: AugmentTier =
        label === '2-1' ? 'SILVER' : label === '3-2' ? 'GOLD' : 'PRISMATIC';
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
    this.augmentCardRerolled = [false, false, false];
    this.playerAugmentChoices = DopamineEngine.rollAugmentChoices(
      this.player,
      tier
    );

    // 생존한 AI 봇 7명도 자신의 페르소나와 덱에 맞는 증강체를 즉시 선택
    for (const p of this.participants) {
      if (p.isAI && !p.isEliminated) {
        this.aiController.selectAugmentForBot(p, tier, this.sharedPool);
      }
    }

    this.pushBannerNotification(
      `✨ [${this.getRoundLabel()}] ${tier} 등급 증강체 선택 페이즈! 원하는 증강체 카드를 선택하세요.`
    );
    this.notifyStateChange();
  }

  /**
   * 플레이어가 특정 증강체 카드(0, 1, 2)를 1회 리롤한다.
   */
  public rerollPlayerAugmentCard(cardIndex: 0 | 1 | 2): boolean {
    if (
      this.phase !== 'AUGMENT_PHASE' ||
      !this.currentAugmentTier ||
      this.augmentCardRerolled[cardIndex]
    ) {
      return false;
    }

    const currentIds = this.playerAugmentChoices.map((c) => c.id);
    const replacementList = DopamineEngine.rollAugmentChoices(
      this.player,
      this.currentAugmentTier,
      currentIds
    );

    if (replacementList.length > 0) {
      this.playerAugmentChoices[cardIndex] = replacementList[0];
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
  // 2. 정비 페이즈 (PREPARATION_PHASE)
  // ==========================================================================

  private enterPreparationPhase(): void {
    this.phase = 'PREPARATION_PHASE';
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

    // 2. 생존한 AI 봇 7명이 0.1초 이내에 자신의 상점 리롤/구매/배치/아이템 장착을 완료
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

    this.notifyStateChange();
  }

  /**
   * 플레이어가 보드 위의 전리품 구슬(LootOrb)을 터치하여 오픈한다.
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
      `🎁 전리품 구슬 오픈: ${rewards.join(', ')}`
    );
    this.notifyStateChange();
    return rewards;
  }

  // ==========================================================================
  // 3. 전투 페이즈 (COMBAT_PHASE) 및 홀수 생존자 고스트(Ghost Army) 매칭
  // ==========================================================================

  /**
   * 플레이어가 [전투 시작] 버튼을 누르면 즉시 전투 페이즈로 진입한다.
   */
  public startCombatPhase(): void {
    if (this.phase !== 'PREPARATION_PHASE') return;

    this.phase = 'COMBAT_PHASE';
    this.viewedParticipantId = this.player.id;
    this.currentPairings = this.buildRoundPairings();
    this.lastRoundResults = [];

    // 1. 플레이어 매치 찾기 및 실시간 CombatEngine 초기화
    const playerPairing = this.currentPairings.find(
      (pair) =>
        pair.home.id === this.player.id ||
        (!pair.isGhostMatch && pair.away.id === this.player.id)
    );

    if (playerPairing) {
      // 플레이어가 항상 HOME(하단 4~7행)에 보이도록 정규화
      const opponent =
        playerPairing.home.id === this.player.id
          ? playerPairing.away
          : playerPairing.home;

      this.playerCurrentOpponentName = playerPairing.isGhostMatch
        ? `${opponent.name} (고스트 군대)`
        : opponent.name;
      this.isPlayerFightingGhost = playerPairing.isGhostMatch;

      this.playerCombatEngine.initCombat(this.player, opponent);
    }

    // 2. 플레이어 전투 실시간 틱 타이머 가동 (1x: 50ms, 2x: 25ms)
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
    this.playerCombatEngine.simulateToCompletion();
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

        if (!this.playerCombatEngine.isFinished) {
          this.playerCombatEngine.stepTick(50);
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
   * 크립 라운드 또는 대인전(홀수 생존자 고스트 매칭 포함) 페어링 생성
   */
  private buildRoundPairings(): MatchPairing[] {
    const roundType = this.getCurrentRoundType();
    const aliveList = this.participants.filter((p) => !p.isEliminated);
    const pairings: MatchPairing[] = [];

    // A. 크립 / 보스 크립 라운드: 생존자 각자가 몬스터 군단과 1:1 전투
    if (roundType === 'CREEP' || roundType === 'BOSS_CREEP') {
      for (const p of aliveList) {
        const creepOpponent = this.createCreepOpponentForRound();
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

  /**
   * 1-1, 1-2 크립 라운드 및 2-5, 3-5, 4-5, 5-5 보스 크립 라운드용 몬스터 군단 생성
   */
  private createCreepOpponentForRound(): Participant {
    const label = this.getRoundLabel();
    const creep = new Participant(
      `creep_${label}`,
      this.stage === 1
        ? label === '1-1'
          ? '고블린 정찰대'
          : '그림자 늑대 무리'
        : this.stage === 2
        ? '고대 바위 골렘'
        : this.stage === 3
        ? '심연의 화염 드래곤'
        : '공허의 종말 거수',
      true,
      null
    );

    if (label === '1-1') {
      creep.board[0][2] = Participant.createUnitInstance('u1_pip', 1);
      creep.board[0][4] = Participant.createUnitInstance('u1_skel', 1);
    } else if (label === '1-2') {
      creep.board[0][1] = Participant.createUnitInstance('u1_skel', 1);
      creep.board[0][3] = Participant.createUnitInstance('u1_garen', 1);
      creep.board[1][5] = Participant.createUnitInstance('u1_aria', 1);
    } else if (this.stage === 2) {
      creep.board[0][2] = Participant.createUnitInstance('u2_ent', 2);
      creep.board[0][4] = Participant.createUnitInstance('u2_ent', 2);
      creep.board[2][3] = Participant.createUnitInstance('u2_tink', 2);
    } else if (this.stage === 3) {
      creep.board[0][3] = Participant.createUnitInstance('u3_sieg', 2, [
        'SUNFIRE_CAPE',
      ]);
      creep.board[1][1] = Participant.createUnitInstance('u3_grom', 2);
      creep.board[1][5] = Participant.createUnitInstance('u3_vlad', 2);
    } else {
      creep.board[0][3] = Participant.createUnitInstance('u5_ignis', 2, [
        'BRAMBLE_VEST',
        'RABADONS_DEATHCAP',
      ]);
      creep.board[1][1] = Participant.createUnitInstance('u4_arthur', 2);
      creep.board[1][5] = Participant.createUnitInstance('u4_merlin', 2);
    }

    return creep;
  }

  // ==========================================================================
  // 4. 정산 페이즈 (RESOLUTION_PHASE): 황금 고블린 캐시아웃, 탈락자 풀 환원, 이자 지급
  // ==========================================================================

  private resolveAllMatchesAndAdvance(): void {
    this.phase = 'RESOLUTION_PHASE';
    const results: RoundMatchResult[] = [];

    for (const pairing of this.currentPairings) {
      let summary: CombatSummary;

      if (pairing.home.id === this.player.id) {
        if (!this.playerCombatEngine.isFinished) {
          this.playerCombatEngine.simulateToCompletion();
        }
        summary = this.playerCombatEngine.getCombatSummary(this.stage);
      } else {
        // AI 대 AI (또는 AI 대 크립/고스트) 백그라운드 즉시 시뮬레이션
        const bgEngine = new CombatEngine();
        bgEngine.initCombat(pairing.home, pairing.away);
        bgEngine.simulateToCompletion();
        summary = bgEngine.getCombatSummary(this.stage);
      }

      const baseStageDmg = Math.max(2, this.stage * 2);
      let homeDamageTaken = 0;
      let awayDamageTaken = 0;

      if (summary.winner === 'HOME') {
        awayDamageTaken = pairing.isGhostMatch || pairing.isCreepMatch
          ? 0
          : baseStageDmg + summary.survivingHomeUnits * 2;
      } else if (summary.winner === 'AWAY') {
        homeDamageTaken = baseStageDmg + summary.survivingAwayUnits * 2;
      } else {
        homeDamageTaken = 2;
        awayDamageTaken = pairing.isGhostMatch || pairing.isCreepMatch ? 0 : 2;
      }

      // 1) HOME 참가자 승패/연승/연패/체력/크립 구슬/황금 고블린 처리
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

    // 3) 체력 0 이하 탈락자 처리 및 공유 풀 100% 환원
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

    // 4) 게임 종료 조건 확인 (플레이어 탈락 또는 생존자 1명 이하)
    const aliveParticipants = this.participants.filter((p) => !p.isEliminated);
    if (this.player.isEliminated || aliveParticipants.length <= 1) {
      this.finalizeGameAndRank();
      return;
    }

    // 5) 생존자 전원에게 라운드 골드(기본 5G + 이자 + 연승/연패) 및 경험치(+2 XP) 지급, 상점 갱신
    this.distributeRoundIncomeAndRefreshShops();

    // 6) 다음 라운드로 스테이지/라운드 카운터 전진
    this.advanceRoundCounter();
    this.beginRoundEntrySequence();
  }

  /**
   * 개별 참가자에게 전투 승패, 연승/연패, 체력 차감, 황금 고블린 스택/캐시아웃, 크립 구슬 보상을 적용한다.
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
      }
    } else if (!isDraw) {
      participant.loseStreak += 1;
      participant.winStreak = 0;
    }

    // 체력 차감
    if (damageTaken > 0) {
      participant.hp = Math.max(0, participant.hp - damageTaken);
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
              `💥🪙 [황금 고블린 금고 대폭발!] 전리품 구슬 ${cashoutOrbs.length}개가 보드에 쏟아졌습니다! 터치하여 오픈하세요!`
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

    // 크립 라운드 종료 시 전리품 구슬 드랍
    if (isCreepMatch && participant.hp > 0) {
      const creepOrbs = DopamineEngine.generateCreepRoundOrbs(
        participant,
        this.stage,
        this.sharedPool
      );
      if (!participant.isAI) {
        this.playerLootOrbs.push(...creepOrbs);
      } else {
        for (const orb of creepOrbs) {
          DopamineEngine.claimLootOrb(participant, orb, this.sharedPool);
        }
      }
    }
  }

  /**
   * 라운드 기본 골드(5G) + 이자 골드(최대 5G / 사악한 금융 7G) + 연승/연패 골드 지급 및 +2 XP, 상점 자동 새로고침
   */
  private distributeRoundIncomeAndRefreshShops(): void {
    const baseGold =
      this.stage === 1 ? (this.roundInStage === 1 ? 3 : 4) : 5;

    for (const p of this.participants) {
      if (p.isEliminated) continue;

      const interestGold = p.calculateInterestGold();
      const maxStreak = Math.max(p.winStreak, p.loseStreak);
      const streakGold =
        maxStreak >= 5 ? 3 : maxStreak >= 4 ? 2 : maxStreak >= 2 ? 1 : 0;

      p.gold += baseGold + interestGold + streakGold;
      p.addXp(2);

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
    this.stopCombatLoopTimer();
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

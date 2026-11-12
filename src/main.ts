// src/main.ts

import {
  AUGMENT_DEFINITIONS,
  ITEM_DEFINITIONS,
  ItemId,
  SHOP_ODDS_BY_LEVEL,
  TRAIT_DEFINITIONS,
  TraitId,
  UNIT_TEMPLATES,
  XP_REQUIRED_BY_LEVEL,
} from './GameData';
import { GameLoopManager } from './GameLoopManager';
import { HexCoord, HexGridMath } from './HexGridMath';
import { AIPersona, Participant, UnitInstance } from './Participant';
import { PixelGameRenderer } from './PixelGameRenderer';
import {
  RANK_TIER_BADGE_ICONS,
  RANK_TIER_KOREAN_NAMES,
  RANK_TIERS_ORDERED,
  RankTier,
} from './RankManager';
import { CombatUnit } from './SkillRegistry';
import { SynergyEngine } from './SynergyEngine';

type DragPayload =
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

const PERSONA_BADGE_LABELS: Record<AIPersona, string> = {
  HYPER_ROLLER: '🎲리롤꾼',
  LOW_COST_REROLLER: '🎲리롤꾼',
  FAST_NINE_GREEDY: '👑패스트9',
  FAST_NINE_ECONOMIST: '👑패스트9',
  GOBLIN_GAMBLER: '🪙고블린',
  FLEX_MASTER: '⚖️유연덱',
  FLEX_BALANCED: '⚖️유연덱',
};

class FantasyAutoBattlerApp {
  private game: GameLoopManager;
  private fxCanvas: HTMLCanvasElement;
  private pixelRenderer: PixelGameRenderer;

  private lastProcessedCombatTick: number = -1;
  private knownThreeStarUnits: Set<string> = new Set();

  // 모바일 포인터 드래그 앤 드롭 & 육각형 타일 스냅 상태
  private activePointerId: number | null = null;
  private pointerDownTime: number = 0;
  private pointerStartX: number = 0;
  private pointerStartY: number = 0;
  private isDragging: boolean = false;
  private dragPayload: DragPayload | null = null;
  private tapCallback: (() => void) | null = null;

  private hoveredHex: HexCoord | null = null;
  private hoveredBenchIndex: number | null = null;

  constructor() {
    this.fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;
    this.pixelRenderer = new PixelGameRenderer(this.fxCanvas);

    this.game = new GameLoopManager();
    this.game.setOnStateChange(() => {
      this.onGameStateUpdated();
    });

    this.bindGlobalDOMEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.onGameStateUpdated();
    this.startRenderLoop();
  }

  // ==========================================================================
  // 1. 전역 버튼 및 모바일 포인터(PointerEvents) + 육각형 타일 히트박스 바인딩
  // ==========================================================================

  private bindGlobalDOMEvents(): void {
    // 상단 HUD 룬/보석 버튼
    document
      .getElementById('pool-inspector-btn')
      ?.addEventListener('pointerup', () => this.openPoolInspectorModal());
    document
      .getElementById('close-inspector-btn')
      ?.addEventListener('pointerup', () =>
        document.getElementById('pool-inspector-modal')?.classList.add('hidden')
      );

    document
      .getElementById('rank-badge-btn')
      ?.addEventListener('pointerup', () => this.openRankModal());
    document
      .getElementById('close-rank-modal-btn')
      ?.addEventListener('pointerup', () =>
        document.getElementById('rank-modal')?.classList.add('hidden')
      );

    document
      .getElementById('new-game-btn')
      ?.addEventListener('pointerup', () => {
        this.knownThreeStarUnits.clear();
        this.pixelRenderer.resetCombatJuiceStates();
        this.game.startNewGame();
      });

    document
      .getElementById('play-again-btn')
      ?.addEventListener('pointerup', () => {
        document.getElementById('gameover-modal')?.classList.add('hidden');
        this.knownThreeStarUnits.clear();
        this.pixelRenderer.resetCombatJuiceStates();
        this.game.startNewGame();
      });

    document
      .getElementById('tap-tooltip-close')
      ?.addEventListener('pointerup', () =>
        document.getElementById('tap-tooltip-bar')?.classList.add('hidden')
      );

    document
      .getElementById('return-home-btn')
      ?.addEventListener('pointerup', () => {
        this.game.viewedParticipantId = this.game.player.id;
        this.renderAllHUD();
      });

    document
      .getElementById('goblin-vault-box')
      ?.addEventListener('pointerup', () => {
        const p = this.game.getViewedParticipant();
        const estGold = p.goblinVaultStacks * 3 + Math.floor(p.goblinVaultStacks / 4) * 5;
        this.showTapTooltip(
          `<strong>🪙 황금 고블린 금고 (${p.goblinVaultStacks} 스택)</strong><br/>고블린 시너지 활성화 중 패배할 때마다 스택이 쌓이며, 다음 전투 승리 시 한꺼번에 캐시아웃 대폭발 보상을 드랍합니다! (현재 예상 가치: 약 ${estGold}G 상당)`
        );
      });

    // 하단 경제 & 전투 컨트롤 버튼
    document.getElementById('buy-xp-btn')?.addEventListener('pointerup', (e) => {
      if (this.game.player.buyXp()) {
        this.pixelRenderer.spawnPixelSparks(e.clientX, e.clientY, '#38bdf8', 14);
        this.renderAllHUD();
      } else if (this.game.player.lastActionMessage) {
        this.game.pushBannerNotification(this.game.player.lastActionMessage);
        this.renderTopHud();
      }
    });

    document.getElementById('reroll-btn')?.addEventListener('pointerup', (e) => {
      if (this.game.phase !== 'PREPARATION_PHASE') return;
      if (this.game.player.rerollShop(this.game.sharedPool)) {
        this.pixelRenderer.spawnPixelSparks(e.clientX, e.clientY, '#facc15', 14);
        if (this.game.player.lastActionMessage) {
          this.game.pushBannerNotification(this.game.player.lastActionMessage);
        }
        this.renderAllHUD();
      } else if (this.game.player.lastActionMessage) {
        this.game.pushBannerNotification(this.game.player.lastActionMessage);
        this.renderTopHud();
      }
    });

    document
      .getElementById('lock-shop-btn')
      ?.addEventListener('pointerup', () => {
        this.game.player.isShopLocked = !this.game.player.isShopLocked;
        this.renderShopAndControls();
      });

    document
      .getElementById('start-combat-btn')
      ?.addEventListener('pointerup', () => {
        this.lastProcessedCombatTick = -1;
        this.pixelRenderer.resetCombatJuiceStates();
        this.game.startCombatPhase();
      });

    document
      .getElementById('speed-1x-btn')
      ?.addEventListener('pointerup', () => this.game.setPlaybackSpeed(1));
    document
      .getElementById('speed-2x-btn')
      ?.addEventListener('pointerup', () => this.game.setPlaybackSpeed(2));
    document
      .getElementById('skip-combat-btn')
      ?.addEventListener('pointerup', () => {
        this.game.skipCombatToResolution();
      });

    // 전체화면 게임 캔버스 위での 육각형 타일 & 대기석 터치/드래그 시작
    this.fxCanvas.addEventListener('pointerdown', (e) =>
      this.handleCanvasPointerDown(e)
    );

    // 전역 PointerMove / PointerUp
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
  }

  /**
   * 캔버스 위에서 pointerdown 발생 시:
   * - 육각형 타일 히트박스(HexGridMath.screenPointToHex) 또는 하단 1x9 대기석 슬롯 히트 검사
   */
  private handleCanvasPointerDown(e: PointerEvent): void {
    const rect = this.fxCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const viewed = this.game.getViewedParticipant();

    // 1. 전투 페이즈 중이면 가장 가까운 전투 기물 탭 툴팁 조회
    if (
      this.game.phase === 'COMBAT_PHASE' &&
      viewed.id === this.game.player.id
    ) {
      const hitHex = HexGridMath.screenPointToHex(
        px,
        py,
        this.pixelRenderer.hexMetrics
      );
      if (hitHex) {
        const cu = this.game.playerCombatEngine.units.find(
          (u) =>
            u.currentHp > 0 && u.row === hitHex.row && u.col === hitHex.col
        );
        if (cu) {
          this.startPointerInteraction(e, null, () => {
            this.showCombatUnitTooltip(cu);
          });
          return;
        }
      }
    }

    // 2. 하단 1x9 대기석(Bench) 슬롯 히트 검사
    const benchIdx = this.pixelRenderer.screenPointToBenchIndex(px, py);
    if (benchIdx !== null) {
      const benchUnit = viewed.bench[benchIdx];
      if (benchUnit) {
        const canDrag =
          this.game.phase === 'PREPARATION_PHASE' &&
          viewed.id === this.game.player.id;
        this.startPointerInteraction(
          e,
          canDrag
            ? {
                kind: 'UNIT',
                instanceId: benchUnit.instanceId,
                unit: benchUnit,
                fromArea: 'BENCH',
                fromIndex: benchIdx,
              }
            : null,
          () => {
            this.showUnitDetailTooltip(benchUnit);
          }
        );
        return;
      }
    }

    // 3. 육각형 전장 타일(row 0~7, col 0~6) 히트 검사
    const hitHex = HexGridMath.screenPointToHex(
      px,
      py,
      this.pixelRenderer.hexMetrics
    );
    if (hitHex && hitHex.row >= 4) {
      const boardRow = hitHex.row - 4;
      const boardCol = hitHex.col;
      const boardUnit = viewed.board[boardRow]?.[boardCol];
      if (boardUnit) {
        const canDrag =
          this.game.phase === 'PREPARATION_PHASE' &&
          viewed.id === this.game.player.id;
        this.startPointerInteraction(
          e,
          canDrag
            ? {
                kind: 'UNIT',
                instanceId: boardUnit.instanceId,
                unit: boardUnit,
                fromArea: 'BOARD',
                fromRow: boardRow,
                fromCol: boardCol,
              }
            : null,
          () => {
            this.showUnitDetailTooltip(boardUnit);
          }
        );
      }
    }
  }

  private startPointerInteraction(
    e: PointerEvent,
    payload: DragPayload | null,
    onShortTap: () => void
  ): void {
    e.stopPropagation();
    this.activePointerId = e.pointerId;
    this.pointerDownTime = performance.now();
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.isDragging = false;
    this.dragPayload = payload;
    this.tapCallback = onShortTap;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.activePointerId !== e.pointerId) return;

    const dx = e.clientX - this.pointerStartX;
    const dy = e.clientY - this.pointerStartY;
    const dist = Math.hypot(dx, dy);

    if (!this.isDragging && dist > 9 && this.dragPayload) {
      if (
        this.game.phase === 'PREPARATION_PHASE' &&
        this.game.viewedParticipantId === this.game.player.id
      ) {
        this.isDragging = true;
        this.showDragGhost(e.clientX, e.clientY);

        if (this.dragPayload.kind === 'UNIT') {
          this.showSellDropzoneOverlay(this.dragPayload.unit);
        }
      }
    }

    if (this.isDragging) {
      this.updateDragGhostPosition(e.clientX, e.clientY);
      const rect = this.fxCanvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      this.hoveredBenchIndex = this.pixelRenderer.screenPointToBenchIndex(px, py);
      this.hoveredHex =
        this.hoveredBenchIndex === null
          ? HexGridMath.screenPointToHex(px, py, this.pixelRenderer.hexMetrics)
          : null;
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.activePointerId !== e.pointerId) return;

    const elapsed = performance.now() - this.pointerDownTime;
    const wasDragging = this.isDragging;
    const payload = this.dragPayload;
    const tapCb = this.tapCallback;

    this.activePointerId = null;
    this.isDragging = false;
    this.dragPayload = null;
    this.tapCallback = null;
    this.hoveredHex = null;
    this.hoveredBenchIndex = null;

    this.hideDragGhost();
    this.hideSellDropzoneOverlay();

    if (!wasDragging && elapsed < 360 && tapCb) {
      tapCb();
      return;
    }

    if (wasDragging && payload) {
      this.completeDropAtPoint(payload, e.clientX, e.clientY);
    }
  }

  private showDragGhost(x: number, y: number): void {
    const ghostEl = document.getElementById('drag-ghost');
    if (!ghostEl || !this.dragPayload) return;

    if (this.dragPayload.kind === 'UNIT') {
      const u = this.dragPayload.unit;
      ghostEl.textContent = `${u.icon} ${u.name} (${'★'.repeat(u.starLevel)})`;
    } else if (this.dragPayload.kind === 'ITEM') {
      const item = ITEM_DEFINITIONS[this.dragPayload.itemId];
      ghostEl.textContent = `${item.icon} ${item.name}`;
    } else {
      ghostEl.textContent = `🌟 챔피언 복제기`;
    }

    ghostEl.style.left = `${x}px`;
    ghostEl.style.top = `${y}px`;
    ghostEl.classList.remove('hidden');
  }

  private updateDragGhostPosition(x: number, y: number): void {
    const ghostEl = document.getElementById('drag-ghost');
    if (!ghostEl) return;
    ghostEl.style.left = `${x}px`;
    ghostEl.style.top = `${y}px`;
  }

  private hideDragGhost(): void {
    document.getElementById('drag-ghost')?.classList.add('hidden');
  }

  private showSellDropzoneOverlay(unit: UnitInstance): void {
    const overlay = document.getElementById('sell-dropzone-overlay');
    const textEl = document.getElementById('sell-dropzone-text');
    if (!overlay || !textEl) return;

    const refund =
      unit.starLevel === 1
        ? unit.cost
        : unit.starLevel === 2
        ? unit.cost === 1
          ? 3
          : unit.cost * 3 - 1
        : unit.cost === 1
        ? 9
        : unit.cost * 9 - 2;

    textEl.textContent = `💰 여기에 놓아 [${unit.name} ${'★'.repeat(
      unit.starLevel
    )}] 판매 (+${refund} 골드 & 공유 풀 복구)`;
    overlay.classList.remove('hidden');
  }

  private hideSellDropzoneOverlay(): void {
    document.getElementById('sell-dropzone-overlay')?.classList.add('hidden');
  }

  /**
   * 육각형 슬롯 스냅(HexGridMath.screenPointToHex) 또는 하단 1x9 대기석 슬롯, 상점 판매 드롭존 처리
   */
  private completeDropAtPoint(payload: DragPayload, clientX: number, clientY: number): void {
    const player = this.game.player;
    const domTarget = document.elementFromPoint(clientX, clientY);

    // 1) 기물 드래그 앤 드롭 처리
    if (payload.kind === 'UNIT') {
      // a. 하단 상점 영역에 드롭 시 즉시 기물 판매
      if (
        domTarget?.closest('#shop-cards-wrapper') ||
        domTarget?.closest('#bottom-shop-bar')
      ) {
        const earned = player.sellUnit(payload.instanceId, this.game.sharedPool);
        if (earned > 0) {
          this.pixelRenderer.spawnPixelSparks(clientX, clientY, '#facc15', 26);
          this.pixelRenderer.spawnArcadePopupText(
            clientX,
            clientY - 20,
            `+${earned}G`,
            '#ffea00',
            18
          );
          this.game.pushBannerNotification(player.lastActionMessage);
          this.renderAllHUD();
        }
        return;
      }

      const rect = this.fxCanvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;

      const fromLoc =
        payload.fromArea === 'BENCH'
          ? ({ area: 'BENCH', index: payload.fromIndex! } as const)
          : ({
              area: 'BOARD',
              row: payload.fromRow!,
              col: payload.fromCol!,
            } as const);

      // b. 하단 1x9 대기석 슬롯에 스냅
      const benchIdx = this.pixelRenderer.screenPointToBenchIndex(px, py);
      if (benchIdx !== null) {
        player.moveUnit(fromLoc, { area: 'BENCH', index: benchIdx });
        this.pixelRenderer.spawnPixelSparks(px, py, '#38bdf8', 10);
        this.renderAllHUD();
        return;
      }

      // c. 아군 육각형 전장 타일(row 4~7 -> boardRow 0~3, col 0~6)에 스냅
      const hitHex = HexGridMath.screenPointToHex(
        px,
        py,
        this.pixelRenderer.hexMetrics
      );
      if (hitHex && hitHex.row >= 4) {
        const boardRow = hitHex.row - 4;
        const boardCol = hitHex.col;
        if (
          player.moveUnit(fromLoc, {
            area: 'BOARD',
            row: boardRow,
            col: boardCol,
          })
        ) {
          const center = HexGridMath.hexToScreenCenter(
            hitHex.row,
            hitHex.col,
            this.pixelRenderer.hexMetrics
          );
          this.pixelRenderer.spawnPixelSparks(center.x, center.y, '#4cc9f0', 14);
        } else if (player.lastActionMessage) {
          this.game.pushBannerNotification(player.lastActionMessage);
        }
        this.renderAllHUD();
      }
      return;
    }

    // 2) 아이템 또는 챔피언 복제기 드롭 -> 해당 육각형 타일 또는 대기석 기물 탐색
    const rect = this.fxCanvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    let targetInstanceId: string | undefined;

    const benchIdx = this.pixelRenderer.screenPointToBenchIndex(px, py);
    if (benchIdx !== null) {
      targetInstanceId = player.bench[benchIdx]?.instanceId;
    } else {
      const hitHex = HexGridMath.screenPointToHex(
        px,
        py,
        this.pixelRenderer.hexMetrics
      );
      if (hitHex && hitHex.row >= 4) {
        targetInstanceId = player.board[hitHex.row - 4]?.[hitHex.col]?.instanceId;
      }
    }

    if (!targetInstanceId) return;

    if (payload.kind === 'ITEM') {
      if (player.equipItemToUnit(payload.itemBenchIndex, targetInstanceId)) {
        this.pixelRenderer.spawnPixelSparks(px, py, '#00f5d4', 22);
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderAllHUD();
      } else if (player.lastActionMessage) {
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderTopHud();
      }
    } else if (payload.kind === 'DUPLICATOR') {
      if (player.useChampionDuplicator(targetInstanceId, this.game.sharedPool)) {
        this.pixelRenderer.spawnPixelSparks(px, py, '#ffea00', 34);
        this.checkNewStarUpgrades();
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderAllHUD();
      } else if (player.lastActionMessage) {
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderTopHud();
      }
    }
  }

  // ==========================================================================
  // 2. 상태 업데이트 콜백 및 네이티브 모바일 HUD 렌더링
  // ==========================================================================

  private onGameStateUpdated(): void {
    if (this.game.phase === 'COMBAT_PHASE') {
      const engine = this.game.playerCombatEngine;
      if (engine.currentTick === 0) {
        const initEvs = engine.consumeInitialEvents();
        this.pixelRenderer.ingestCombatEvents(initEvs, engine.units);
      } else if (engine.currentTick !== this.lastProcessedCombatTick) {
        this.lastProcessedCombatTick = engine.currentTick;
        this.pixelRenderer.ingestCombatEvents(
          engine.getLastTickEvents(),
          engine.units
        );
      }
    }

    this.checkNewStarUpgrades();
    this.renderAllHUD();
  }

  private renderAllHUD(): void {
    this.renderTopHud();
    this.renderLeftFloatingDock();
    this.renderLootOrbs();
    this.renderRightLeaderboard();
    this.renderShopAndControls();
    this.renderPhaseModals();
  }

  private renderTopHud(): void {
    const profile = this.game.rankManager.getProfile();
    const rankIcon = document.getElementById('rank-icon');
    const rankText = document.getElementById('rank-text');
    if (rankIcon && rankText) {
      rankIcon.textContent = RANK_TIER_BADGE_ICONS[profile.tier];
      rankText.textContent = `${RANK_TIER_KOREAN_NAMES[profile.tier]} ${profile.lp}LP`;
    }

    const roundLabel = document.getElementById('round-label');
    const phaseLabel = document.getElementById('phase-label');
    if (roundLabel && phaseLabel) {
      roundLabel.textContent = `스테이지 ${this.game.getRoundLabel()}`;
      const phaseNames: Record<string, string> = {
        AUGMENT_PHASE: '✨ 증강체 선택',
        ANVIL_PHASE: '⚒️ 운명의 모루',
        PREPARATION_PHASE: '🛠️ 정비 페이즈',
        COMBAT_PHASE: '⚔️ 전투 진행 중',
        RESOLUTION_PHASE: '📦 전투 정산',
        GAME_OVER_PHASE: '🏆 게임 종료',
      };
      phaseLabel.textContent = phaseNames[this.game.phase] ?? this.game.phase;
    }

    const viewed = this.game.getViewedParticipant();
    const deployCounter = document.getElementById('deploy-counter');
    if (deployCounter) {
      deployCounter.textContent = `⚔️ 배치 ${viewed.getBoardUnitCount()} / ${viewed.level}`;
    }

    const oppIndicator = document.getElementById('opponent-indicator');
    if (oppIndicator) {
      if (this.game.phase === 'COMBAT_PHASE') {
        oppIndicator.textContent = `VS ${this.game.playerCurrentOpponentName}`;
      } else {
        const rType = this.game.getCurrentRoundType();
        oppIndicator.textContent =
          rType === 'CREEP'
            ? '예정: 몬스터 정찰병'
            : rType === 'BOSS_CREEP'
            ? '예정: 고대 보스 몬스터'
            : '예정: 8인 로비 대인전(PvP)';
      }
    }

    const ticker = document.getElementById('banner-ticker');
    if (ticker && this.game.bannerNotifications.length > 0) {
      ticker.textContent = this.game.bannerNotifications[0];
    }

    // 정찰(Scouting) 배너 표시/숨김
    const scoutBanner = document.getElementById('scouting-banner');
    const scoutText = document.getElementById('scouting-target-text');
    if (scoutBanner && scoutText) {
      if (viewed.id !== this.game.player.id) {
        const personaLabel = viewed.persona
          ? PERSONA_BADGE_LABELS[viewed.persona]
          : '';
        scoutText.textContent = `🔍 [${viewed.name}] ${personaLabel} 육각형 진영 정찰 중 (🪙${viewed.gold}G / Lv.${viewed.level})`;
        scoutBanner.classList.remove('hidden');
      } else {
        scoutBanner.classList.add('hidden');
      }
    }

    // 판도라의 대기석 표시
    const pandoraTag = document.getElementById('pandora-indicator');
    if (pandoraTag) {
      pandoraTag.classList.toggle(
        'hidden',
        !viewed.augments.includes('AUG_PANDORA_BENCH')
      );
    }
  }

  private renderLeftFloatingDock(): void {
    const viewed = this.game.getViewedParticipant();

    // 1. 황금 고블린 금고 스택
    const vaultEl = document.getElementById('goblin-vault-stacks');
    if (vaultEl) {
      vaultEl.textContent = `${viewed.goblinVaultStacks}`;
    }

    // 2. 반투명 블러 육각형 시너지 독
    const synContainer = document.getElementById('synergy-list');
    if (synContainer) {
      synContainer.innerHTML = '';
      const states = SynergyEngine.calculateActiveSynergies(viewed).filter(
        (s) => s.count > 0
      );

      for (const st of states) {
        const threshText = st.definition.thresholds
          .map((t: number) => (st.count >= t ? `<b>${t}</b>` : `${t}`))
          .join('/');

        const badge = document.createElement('div');
        badge.className = `synergy-badge style-${st.styleTier}`;
        badge.innerHTML = `
          <span>${st.definition.icon} ${st.count}</span>
          <span style="font-size:8px;opacity:0.85;">${threshText}</span>
        `;
        badge.addEventListener('pointerup', () => {
          this.showTapTooltip(
            `<strong>${st.definition.icon} ${st.definition.name} (${st.count}명 활성)</strong><br/>${
              st.definition.description
            }<br/><span style="color:#fde047">${
              st.activeEffect ? st.activeEffect.label : '아직 임계값 미달'
            }</span>`
          );
        });
        synContainer.appendChild(badge);
      }
    }

    // 3. 보유 증강체 미니 룬 아이콘
    const augContainer = document.getElementById('augment-list');
    if (augContainer) {
      augContainer.innerHTML = '';
      for (const augId of viewed.augments) {
        const def = AUGMENT_DEFINITIONS.find((a) => a.id === augId);
        if (!def) continue;
        const iconEl = document.createElement('div');
        iconEl.className = 'aug-gem-icon';
        iconEl.textContent = def.icon;
        iconEl.addEventListener('pointerup', () => {
          this.showTapTooltip(
            `<strong>${def.icon} ${def.name} [${def.tier}]</strong><br/>${def.description}`
          );
        });
        augContainer.appendChild(iconEl);
      }
    }

    // 4. 챔피언 복제기 & 아이템 슬롯 (드래그 앤 드롭 장착)
    const dupWrap = document.getElementById('duplicator-slot-wrap');
    if (dupWrap) {
      dupWrap.innerHTML = '';
      if (viewed.duplicators > 0) {
        const chip = document.createElement('div');
        chip.className = 'duplicator-chip';
        chip.innerHTML = `🌟x${viewed.duplicators}`;
        chip.addEventListener('pointerdown', (e) => {
          this.startPointerInteraction(
            e,
            viewed.id === this.game.player.id ? { kind: 'DUPLICATOR' } : null,
            () => {
              this.showTapTooltip(
                `<strong>🌟 챔피언 복제기 (${viewed.duplicators}개)</strong><br/>아군 육각형 타일 또는 대기석의 기물 위로 드래그하여 놓으면 공유 풀 재고를 1개 소모하여 즉시 1성 복사본을 생성합니다.`
              );
            }
          );
        });
        dupWrap.appendChild(chip);
      }
    }

    const itemGrid = document.getElementById('item-bench-grid');
    if (itemGrid) {
      itemGrid.innerHTML = '';
      viewed.itemBench.forEach((itemId, idx) => {
        const def = ITEM_DEFINITIONS[itemId];
        if (!def) return;
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        slot.textContent = def.icon;
        slot.addEventListener('pointerdown', (e) => {
          this.startPointerInteraction(
            e,
            viewed.id === this.game.player.id
              ? { kind: 'ITEM', itemBenchIndex: idx, itemId }
              : null,
            () => {
              this.showTapTooltip(
                `<strong>${def.icon} ${def.name}</strong><br/>${def.description}<br/><span style="color:#7dd3fc">기물 위로 드래그하여 장착 (기본 아이템 2개는 자동 합체)</span>`
              );
            }
          );
        });
        itemGrid.appendChild(slot);
      });
    }
  }

  private renderLootOrbs(): void {
    const orbLayer = document.getElementById('loot-orb-layer');
    if (!orbLayer) return;
    orbLayer.innerHTML = '';

    if (this.game.viewedParticipantId !== this.game.player.id) return;

    for (const orb of this.game.playerLootOrbs) {
      const btn = document.createElement('div');
      btn.className = `loot-orb-btn orb-${orb.tier}`;
      btn.style.left = `${Math.round(18 + orb.x * 64)}%`;
      btn.style.top = `${Math.round(22 + orb.y * 42)}%`;

      const icon =
        orb.tier === 'PRISMATIC'
          ? '💎'
          : orb.tier === 'GOLD'
          ? '🪙'
          : orb.tier === 'BLUE'
          ? '🔹'
          : '🎁';
      btn.innerHTML = `<span>${icon}</span><span>${orb.label ?? '전리품 구슬'}</span>`;

      btn.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        this.pixelRenderer.spawnPixelSparks(
          e.clientX,
          e.clientY,
          orb.tier === 'PRISMATIC' ? '#4cc9f0' : '#ffea00',
          32
        );
        const rewards = this.game.openPlayerLootOrb(orb.id);
        if (rewards.length > 0) {
          this.pixelRenderer.spawnArcadePopupText(
            e.clientX,
            e.clientY - 15,
            `🎁 ${rewards.join(' + ')}`,
            '#ffea00',
            15
          );
        }
      });

      orbLayer.appendChild(btn);
    }
  }

  private renderRightLeaderboard(): void {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const sorted = [...this.game.participants].sort((a, b) => {
      if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
      return b.hp - a.hp;
    });

    sorted.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = `leader-card ${!p.isAI ? 'is-player' : ''} ${
        p.id === this.game.viewedParticipantId ? 'is-viewed' : ''
      } ${p.isEliminated ? 'eliminated' : ''}`;

      const hpPct = Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100)));
      const personaText = p.persona
        ? PERSONA_BADGE_LABELS[p.persona]
        : '👤나';

      card.innerHTML = `
        <div class="leader-top-row">
          <span>#${idx + 1} ${p.name.slice(0, 5)}</span>
          <span style="color:${p.hp > 35 ? '#34d399' : '#fb7185'}">${
        p.isEliminated ? '💀' : p.hp
      }</span>
        </div>
        <div class="leader-hp-gauge">
          <div class="leader-hp-fill" style="width:${hpPct}%;background:${
        p.hp > 35 ? '#10b981' : '#f43f5e'
      }"></div>
        </div>
        <div class="leader-sub-row">
          <span>${personaText}</span>
          <span>Lv.${p.level}·${p.gold}G</span>
        </div>
      `;

      card.addEventListener('pointerup', () => {
        this.game.viewedParticipantId = p.id;
        this.renderAllHUD();
      });

      listEl.appendChild(card);
    });
  }

  private renderShopAndControls(): void {
    const player = this.game.player;

    const lvlText = document.getElementById('player-level-text');
    const xpText = document.getElementById('player-xp-text');
    if (lvlText && xpText) {
      lvlText.textContent = `Lv.${player.level}`;
      const nextXp = XP_REQUIRED_BY_LEVEL[player.level + 1];
      xpText.textContent =
        player.level >= 9 ? 'MAX' : `XP ${player.xp}/${nextXp}`;
    }

    const goldText = document.getElementById('player-gold-text');
    const intText = document.getElementById('player-interest-text');
    if (goldText && intText) {
      goldText.textContent = `🪙 ${player.gold} G`;
      intText.textContent = `이자+${player.calculateInterestGold()}G`;
    }

    const rerollBtn = document.getElementById('reroll-btn');
    if (rerollBtn) {
      rerollBtn.innerHTML =
        player.freeRerolls > 0
          ? `<span class="btn-main-label">🎟️ 무료리롤</span><span class="btn-sub-cost">${player.freeRerolls}회 남음</span>`
          : `<span class="btn-main-label">🎲 리롤</span><span class="btn-sub-cost">2 골드</span>`;
    }

    const lockBtn = document.getElementById('lock-shop-btn');
    if (lockBtn) {
      lockBtn.textContent = player.isShopLocked ? '🔒' : '🔓';
    }

    const oddsBar = document.getElementById('shop-odds-bar');
    if (oddsBar) {
      const odds = SHOP_ODDS_BY_LEVEL[player.level] ?? SHOP_ODDS_BY_LEVEL[1];
      oddsBar.innerHTML = `
        <span style="color:var(--cost-1)">1코 ${odds[0]}%</span>
        <span style="color:var(--cost-2)">2코 ${odds[1]}%</span>
        <span style="color:var(--cost-3)">3코 ${odds[2]}%</span>
        <span style="color:var(--cost-4)">4코 ${odds[3]}%</span>
        <span style="color:var(--cost-5)">5코 ${odds[4]}%</span>
      `;
    }

    const startCombatBtn = document.getElementById('start-combat-btn');
    const speedControls = document.getElementById('combat-speed-controls');
    if (startCombatBtn && speedControls) {
      const inCombat = this.game.phase === 'COMBAT_PHASE';
      startCombatBtn.classList.toggle('hidden', inCombat);
      speedControls.classList.toggle('hidden', !inCombat);

      document
        .getElementById('speed-1x-btn')
        ?.classList.toggle('active', this.game.playbackSpeed === 1);
      document
        .getElementById('speed-2x-btn')
        ?.classList.toggle('active', this.game.playbackSpeed === 2);
    }

    // 하단 5장 챔피언 도트 일러스트 카드 렌더링
    const shopContainer = document.getElementById('shop-cards-container');
    if (!shopContainer) return;
    shopContainer.innerHTML = '';

    player.shop.forEach((unitId, slotIdx) => {
      const card = document.createElement('div');
      if (!unitId) {
        card.className = 'shop-card empty-slot';
        card.textContent = '구매 완료';
        shopContainer.appendChild(card);
        return;
      }

      const template = UNIT_TEMPLATES[unitId];
      const ownedCopies = player.getOwnedUnitCopiesCount(unitId);
      const remainingPool = this.game.sharedPool.getRemainingCount(unitId);
      const maxPool = this.game.sharedPool.getMaxCount(unitId);

      const isOwned = ownedCopies > 0;
      card.className = `shop-card cost-${template.cost} ${
        isOwned ? 'owned-highlight' : ''
      }`;

      let mergeHintBadge = '';
      if (ownedCopies === 8) {
        mergeHintBadge = `<div class="shop-merge-badge">👑즉시3성!</div>`;
      } else if (ownedCopies === 2 || ownedCopies === 5) {
        mergeHintBadge = `<div class="shop-merge-badge">⚡즉시2성!</div>`;
      } else if (ownedCopies > 0) {
        mergeHintBadge = `<div class="shop-merge-badge">✨보유(${ownedCopies})</div>`;
      }

      const traitNames = template.traits
        .map((t: TraitId) => `${TRAIT_DEFINITIONS[t].icon} ${TRAIT_DEFINITIONS[t].name}`)
        .join('<br/>');

      card.innerHTML = `
        <div class="shop-card-top">
          <span>${template.name}</span>
          <span class="shop-cost-tag">🪙${template.cost}</span>
        </div>
        ${mergeHintBadge}
        <div class="shop-card-portrait-row">
          <canvas class="shop-pixel-portrait" width="28" height="28"></canvas>
          <div class="shop-card-traits">${traitNames}</div>
        </div>
        <div class="shop-pool-footer">
          <span>남은 풀:</span>
          <strong>${remainingPool}/${maxPool}</strong>
        </div>
      `;

      // 상점 카드 내부에 실제 28x28 도트 캐릭터 일러스트 복사 렌더링
      const portraitCanvas = card.querySelector(
        '.shop-pixel-portrait'
      ) as HTMLCanvasElement | null;
      if (portraitCanvas) {
        const pCtx = portraitCanvas.getContext('2d')!;
        pCtx.imageSmoothingEnabled = false;
        const sprite = this.pixelRenderer.getOrCreateUnitPixelSprite(
          unitId,
          1,
          0,
          false
        );
        pCtx.drawImage(sprite, 0, 0);
      }

      card.addEventListener('pointerup', (e) => {
        if (player.buyUnit(slotIdx, this.game.sharedPool)) {
          this.pixelRenderer.spawnPixelSparks(
            e.clientX,
            e.clientY,
            '#fde047',
            22
          );
          this.checkNewStarUpgrades();
          this.renderAllHUD();
        } else if (player.lastActionMessage) {
          this.game.pushBannerNotification(player.lastActionMessage);
          this.renderTopHud();
        }
      });

      shopContainer.appendChild(card);
    });
  }

  private renderPhaseModals(): void {
    // 1. 증강체 선택 모달
    const augModal = document.getElementById('augment-modal');
    const augRow = document.getElementById('augment-cards-row');
    if (augModal && augRow) {
      if (this.game.phase === 'AUGMENT_PHASE') {
        augModal.classList.remove('hidden');
        augRow.innerHTML = '';

        this.game.playerAugmentChoices.forEach((aug, idx) => {
          const card = document.createElement('div');
          card.className = `choice-card tier-${aug.tier}`;
          const canReroll = !this.game.augmentCardRerolled[idx as 0 | 1 | 2];

          card.innerHTML = `
            <div>
              <div class="choice-card-title">${aug.icon} ${aug.name}</div>
              <div style="font-size:10px;color:#fde047;margin:4px 0;">[${aug.tier} 룬 증강체]</div>
              <div class="choice-card-desc">${aug.description}</div>
            </div>
            <div class="choice-btn-group">
              <div class="rune-choice-btn select-aug-btn">✅ 이 증강체 각인</div>
              <div class="rune-choice-btn secondary reroll-aug-btn" style="${
                !canReroll ? 'opacity:0.35;pointer-events:none;' : ''
              }">🎲 리롤 (${canReroll ? '1회' : '완료'})</div>
            </div>
          `;

          card
            .querySelector('.select-aug-btn')
            ?.addEventListener('pointerup', () => {
              this.game.selectPlayerAugment(idx);
            });
          card
            .querySelector('.reroll-aug-btn')
            ?.addEventListener('pointerup', () => {
              this.game.rerollPlayerAugmentCard(idx as 0 | 1 | 2);
            });

          augRow.appendChild(card);
        });
      } else {
        augModal.classList.add('hidden');
      }
    }

    // 2. 운명의 모루 모달
    const anvilModal = document.getElementById('anvil-modal');
    const anvilRow = document.getElementById('anvil-cards-row');
    if (anvilModal && anvilRow) {
      if (this.game.phase === 'ANVIL_PHASE') {
        anvilModal.classList.remove('hidden');
        anvilRow.innerHTML = '';

        this.game.playerAnvilChoices.forEach((opt, idx) => {
          const card = document.createElement('div');
          card.className = 'choice-card';
          card.innerHTML = `
            <div>
              <div class="choice-card-title">${opt.icon} ${opt.label}</div>
              <div class="choice-card-desc" style="margin-top:6px;">${opt.description}</div>
            </div>
            <div class="rune-choice-btn anvil-pick-btn">🎁 무료 제련 획득</div>
          `;
          card
            .querySelector('.anvil-pick-btn')
            ?.addEventListener('pointerup', () => {
              this.game.selectPlayerAnvilOption(idx);
            });
          anvilRow.appendChild(card);
        });
      } else {
        anvilModal.classList.add('hidden');
      }
    }

    // 3. 게임 종료 & LP 정산 모달
    const overModal = document.getElementById('gameover-modal');
    const overSummary = document.getElementById('gameover-summary');
    if (overModal && overSummary) {
      if (
        this.game.phase === 'GAME_OVER_PHASE' &&
        this.game.rankSettlementResult
      ) {
        overModal.classList.remove('hidden');
        const res = this.game.rankSettlementResult;
        overSummary.innerHTML = `
          <div style="font-size:20px;font-weight:900;color:#fde047;margin:8px 0;text-align:center;">
            최종 순위: #${res.placement}위!
          </div>
          <div style="font-size:13px;margin-bottom:10px;text-align:center;">
            ${res.summaryText}
          </div>
        `;
      } else {
        overModal.classList.add('hidden');
      }
    }
  }

  // ==========================================================================
  // 3. 공유 기물 풀 & 3성 차단 인스펙터 모달 및 랭크 설정 모달
  // ==========================================================================

  private openPoolInspectorModal(): void {
    const modal = document.getElementById('pool-inspector-modal');
    const tbody = document.getElementById('pool-inspector-tbody');
    if (!modal || !tbody) return;

    const rows = this.game.sharedPool.getPoolInspectionData(
      this.game.player,
      this.game.participants
    );
    tbody.innerHTML = '';

    for (const row of rows) {
      const tr = document.createElement('tr');
      const lockBadge = row.isBlockedForPlayer
        ? `<span class="locked-badge">🔒 3성 달성 차단됨</span>`
        : `<span class="open-badge">정상 추첨</span>`;

      tr.innerHTML = `
        <td style="color:var(--cost-${row.cost});font-weight:900;">${row.cost}코</td>
        <td style="font-weight:800;">${UNIT_TEMPLATES[row.unitId].icon} ${row.unitName}</td>
        <td>${row.maxCount}</td>
        <td style="color:#38bdf8;font-weight:900;">${row.remainingInPool}</td>
        <td>${row.ownedByAllParticipants}</td>
        <td>${row.inShopsCount}</td>
        <td>${lockBadge}</td>
      `;
      tbody.appendChild(tr);
    }

    modal.classList.remove('hidden');
  }

  private openRankModal(): void {
    const modal = document.getElementById('rank-modal');
    const summaryEl = document.getElementById('rank-profile-summary');
    const gridEl = document.getElementById('tier-selector-grid');
    if (!modal || !summaryEl || !gridEl) return;

    const profile = this.game.rankManager.getProfile();
    const aiParams = this.game.rankManager.getAISkillParameters();

    summaryEl.innerHTML = `
      <div style="background:#0f172a;padding:10px;margin-bottom:8px;">
        <div style="font-size:14px;font-weight:900;color:#fde047;">
          현재 티어: ${RANK_TIER_BADGE_ICONS[profile.tier]} ${RANK_TIER_KOREAN_NAMES[profile.tier]} (${profile.lp} LP)
        </div>
        <div style="font-size:11px;color:#cbd5e1;margin-top:4px;">
          전적: ${profile.gamesPlayed}전 | 1위: ${profile.wins}회 | TOP 4: ${profile.top4Count}회
        </div>
        <div style="font-size:10px;color:#38bdf8;margin-top:4px;">
          AI 지능(skillLevel): <strong>${aiParams.skillLevel}</strong> | 정찰 확률: <strong>${Math.round(
      aiParams.scoutingChance * 100
    )}%</strong> | 4~5코 3성 견제: <strong>${
      aiParams.skillLevel >= 0.75 ? 'ON (다이아+)' : 'OFF'
    }</strong>
        </div>
      </div>
    `;

    gridEl.innerHTML = '';
    for (const tier of RANK_TIERS_ORDERED) {
      const btn = document.createElement('div');
      btn.className = `rune-icon-btn ${tier === profile.tier ? 'gold-gem' : ''}`;
      btn.innerHTML = `${RANK_TIER_BADGE_ICONS[tier]} ${RANK_TIER_KOREAN_NAMES[tier]}`;
      btn.addEventListener('pointerup', () => {
        this.game.rankManager.setTierForTesting(tier as RankTier, 50);
        this.openRankModal();
        this.renderTopHud();
      });
      gridEl.appendChild(btn);
    }

    modal.classList.remove('hidden');
  }

  // ==========================================================================
  // 4. 단기 탭(Short Tap) 상세 툴팁 & 3성 합성 달성 연출
  // ==========================================================================

  private showTapTooltip(html: string): void {
    const bar = document.getElementById('tap-tooltip-bar');
    const content = document.getElementById('tap-tooltip-content');
    if (!bar || !content) return;
    content.innerHTML = html;
    bar.classList.remove('hidden');
  }

  private showUnitDetailTooltip(unit: UnitInstance): void {
    const template = UNIT_TEMPLATES[unit.unitId];
    const traitsStr = unit.traits
      .map((t) => `${TRAIT_DEFINITIONS[t].icon}${TRAIT_DEFINITIONS[t].name}`)
      .join(', ');
    const itemsStr =
      unit.items.length > 0
        ? unit.items.map((i) => ITEM_DEFINITIONS[i]?.name).join(', ')
        : '없음';

    this.showTapTooltip(
      `<strong>${unit.icon} ${unit.name} (${'★'.repeat(unit.starLevel)} / ${
        unit.cost
      }코스트)</strong> [${traitsStr}]<br/>HP: ${unit.maxHp} | 공격력: ${
        unit.atk
      } | 방어력: ${unit.def} | 공속: ${unit.atkSpeed} | 육각형 사거리: ${
        unit.range
      }칸 | 마나: ${unit.startMana}/${unit.maxMana} | 아이템: ${itemsStr}<br/><span style="color:#fde047">스킬 [${
        template.skill.name
      }]:</span> ${template.skill.description}`
    );
  }

  private showCombatUnitTooltip(cu: CombatUnit): void {
    const template = UNIT_TEMPLATES[cu.unitId];
    this.showTapTooltip(
      `<strong>${cu.icon} ${cu.name} (${cu.starLevel}성)</strong> | HP: ${cu.currentHp}/${cu.maxHp} (보호막 ${cu.shield}) | 공격력: ${cu.atk} | 방어력: ${cu.def} | 사거리: ${cu.range}칸 | 누적 딜량: ${cu.totalDamageDealt}<br/><span style="color:#fde047">스킬 [${template?.skill.name}]:</span> ${template?.skill.description}`
    );
  }

  private checkNewStarUpgrades(): void {
    for (const loc of this.game.player.getAllUnitLocations()) {
      if (
        loc.unit.starLevel === 3 &&
        !this.knownThreeStarUnits.has(loc.unit.instanceId)
      ) {
        this.knownThreeStarUnits.add(loc.unit.instanceId);
        this.pixelRenderer.triggerImpactShake(11, 380, 50);
        this.pixelRenderer.spawnPixelSparks(
          window.innerWidth * 0.5,
          window.innerHeight * 0.45,
          '#ffea00',
          55
        );
        this.pixelRenderer.spawnArcadePopupText(
          window.innerWidth * 0.5,
          window.innerHeight * 0.4,
          `★★★ ${loc.unit.name} 3성 진화!`,
          '#ffea00',
          20
        );
        this.game.pushBannerNotification(
          `🌟★★★ [${loc.unit.name}] 3성 달성!! (1.5배 거대화 & 황금 마법진 발동 / 상점 영구 차단됨)`
        );
      }
    }
  }

  // ==========================================================================
  // 5. 전체화면 캔버스 리사이즈 및 60FPS 픽셀 렌더 루프
  // ==========================================================================

  private resizeCanvas(): void {
    this.fxCanvas.width = window.innerWidth || 800;
    this.fxCanvas.height = window.innerHeight || 600;
    this.pixelRenderer.recomputeLayoutMetrics();
  }

  private startRenderLoop(): void {
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      const viewed = this.game.getViewedParticipant();
      const inCombat =
        this.game.phase === 'COMBAT_PHASE' &&
        viewed.id === this.game.player.id;

      this.pixelRenderer.renderFrame(dt, {
        inCombat,
        viewedParticipant: viewed,
        combatUnits: this.game.playerCombatEngine.units,
        hoveredHex: this.hoveredHex,
        hoveredBenchIndex: this.hoveredBenchIndex,
        isDraggingUnit: this.isDragging && this.dragPayload?.kind === 'UNIT',
        draggedInstanceId:
          this.isDragging && this.dragPayload?.kind === 'UNIT'
            ? this.dragPayload.instanceId
            : null,
        hasPandoraBench: viewed.augments.includes('AUG_PANDORA_BENCH'),
      });

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    new FantasyAutoBattlerApp();
  });
} else {
  new FantasyAutoBattlerApp();
}

// src/main.ts

import { getCreepMonsterTemplate } from './CreepMonsterData';
import {
  AUGMENT_DEFINITIONS,
  BaseItemId,
  ITEM_DEFINITIONS,
  ItemId,
  SHOP_ODDS_BY_LEVEL,
  TRAIT_DEFINITIONS,
  TraitId,
  UNIT_TEMPLATES,
  XP_REQUIRED_BY_LEVEL,
  combineBaseItems,
} from './GameData';
import { GameLoopManager } from './GameLoopManager';
import { HexCoord, HexGridMath, ScreenPoint } from './HexGridMath';
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
  HYPER_ROLLER: '🎲리롤',
  LOW_COST_REROLLER: '🎲리롤',
  FAST_NINE_GREEDY: '👑9렙',
  FAST_NINE_ECONOMIST: '👑9렙',
  GOBLIN_GAMBLER: '🪙고블린',
  FLEX_MASTER: '⚖️유연',
  FLEX_BALANCED: '⚖️유연',
};

class FantasyAutoBattlerApp {
  private game: GameLoopManager;
  private fxCanvas: HTMLCanvasElement;
  private pixelRenderer: PixelGameRenderer;

  private lastProcessedCombatTick: number = -1;
  private lastTriggeredLaserKey: string = '';
  private lastKnownPhase: string = '';
  private knownThreeStarUnits: Set<string> = new Set();

  // 가로모드 강제 회전 상태 (세로로 폰을 들고 있을 때 90도 회전 적용 여부)
  private isPortraitRotated: boolean = false;

  // 접이식 하단 상점 드로어 수동 접힘 여부
  private isShopManuallyCollapsed: boolean = false;

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

  // 플레이어가 터치(Tap)하여 선택한 기물 인스턴스 ID (선택/드래그 중일 때만 말풍선 이름표 표시)
  private selectedUnitInstanceId: string | null = null;

  // 메인 로비 화면 vs 인게임 세션 진행 여부
  private isInGameSession: boolean = false;

  constructor() {
    this.fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;
    this.pixelRenderer = new PixelGameRenderer(this.fxCanvas);

    // 로비 화면 대기 상태로 초기화 (autoStart = false)
    this.game = new GameLoopManager(undefined, false);
    this.lastKnownPhase = this.game.phase;
    this.game.setOnStateChange(() => {
      this.onGameStateUpdated();
    });

    this.bindGlobalDOMEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.resizeCanvas(), 60);
    });

    this.onGameStateUpdated();
    this.startRenderLoop();
  }

  /**
   * 화면 포인터(clientX, clientY)를 가로 고정(#app) 내부 논리적 캔버스 좌표(px, py)로 변환
   */
  private clientToCanvasPoint(clientX: number, clientY: number): ScreenPoint {
    if (this.isPortraitRotated) {
      const winW = window.innerWidth || 360;
      return {
        x: clientY,
        y: winW - clientX,
      };
    }
    const rect = this.fxCanvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private tryLockNativeLandscape(): void {
    try {
      const orient = (screen as unknown as { orientation?: { lock?: (mode: string) => Promise<void> } }).orientation;
      if (orient && typeof orient.lock === 'function') {
        orient.lock('landscape').catch(() => {});
      }
    } catch {
      // 일부 모바일 브라우저는 CSS 회전 래퍼로 가로모드 유지
    }
  }

  private isShopCurrentlyExpanded(): boolean {
    if (
      this.game.phase === 'COMBAT_PHASE' ||
      this.game.phase === 'RESOLUTION_PHASE'
    ) {
      return false;
    }
    return !this.isShopManuallyCollapsed;
  }

  // ==========================================================================
  // 1. 전역 버튼 및 모바일 포인터(PointerEvents) + 육각형 타일 히트박스 바인딩
  // ==========================================================================

  private bindGlobalDOMEvents(): void {
    window.addEventListener(
      'pointerdown',
      () => {
        this.tryLockNativeLandscape();
      },
      { once: true }
    );

    document
      .getElementById('map-theme-btn')
      ?.addEventListener('pointerup', () => {
        const nextTheme = this.pixelRenderer.toggleMapTheme();
        const btn = document.getElementById('map-theme-btn');
        if (btn) {
          btn.textContent = nextTheme === 'FOREST' ? '🌲숲맵' : '🏰도시맵';
        }
      });

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
        this.selectedUnitInstanceId = null;
        this.isShopManuallyCollapsed = false;
        this.pixelRenderer.resetCombatJuiceStates();
        this.game.startNewGame();
      });

    // 메인 로비 화면 및 설정 모달 이벤트 바인딩
    document
      .getElementById('lobby-start-btn')
      ?.addEventListener('pointerup', () => this.startNewGameFromLobby());

    document
      .getElementById('lobby-compendium-btn')
      ?.addEventListener('pointerup', () => this.openPoolInspectorModal());

    document
      .getElementById('lobby-rank-btn')
      ?.addEventListener('pointerup', () => this.openRankModal());

    document
      .getElementById('lobby-settings-btn')
      ?.addEventListener('pointerup', () => this.openSettingsModal());

    document
      .getElementById('close-settings-modal-btn')
      ?.addEventListener('pointerup', () => this.closeSettingsModal());

    document
      .getElementById('lobby-nav-btn')
      ?.addEventListener('pointerup', () => {
        if (confirm('메인 로비 화면으로 이동하시겠습니까? (현재 게임이 일시정지됩니다)')) {
          this.returnToLobbyScreen();
        }
      });

    document
      .getElementById('gameover-lobby-btn')
      ?.addEventListener('pointerup', () => this.returnToLobbyScreen());

    // 환경 설정 옵션 토글 이벤트
    document.querySelectorAll('#settings-speed-options .setting-opt-btn').forEach((btn) => {
      btn.addEventListener('pointerup', (e) => {
        const target = e.currentTarget as HTMLElement;
        const speed = parseInt(target.dataset.speed || '1', 10) as 1 | 2;
        this.game.playbackSpeed = speed;
        document.querySelectorAll('#settings-speed-options .setting-opt-btn').forEach((b) => b.classList.remove('active'));
        target.classList.add('active');
        document.getElementById('speed-1x-btn')?.classList.toggle('active', this.game.playbackSpeed === 1);
        document.getElementById('speed-2x-btn')?.classList.toggle('active', this.game.playbackSpeed === 2);
      });
    });

    document.querySelectorAll('#settings-map-options .setting-opt-btn').forEach((btn) => {
      btn.addEventListener('pointerup', (e) => {
        const target = e.currentTarget as HTMLElement;
        const map = target.dataset.map;
        this.pixelRenderer.currentMapTheme = map === 'forest' ? 'FOREST' : 'CASTLE_TOWN';
        const mapBtn = document.getElementById('map-theme-btn');
        if (mapBtn) {
          mapBtn.textContent = map === 'forest' ? '🌲숲맵' : '🏰도시맵';
        }
        document.querySelectorAll('#settings-map-options .setting-opt-btn').forEach((b) => b.classList.remove('active'));
        target.classList.add('active');
      });
    });

    document
      .getElementById('play-again-btn')
      ?.addEventListener('pointerup', () => {
        document.getElementById('gameover-modal')?.classList.add('hidden');
        this.knownThreeStarUnits.clear();
        this.selectedUnitInstanceId = null;
        this.isShopManuallyCollapsed = false;
        this.pixelRenderer.resetCombatJuiceStates();
        this.game.startNewGame();
      });

    document
      .getElementById('tap-tooltip-close')
      ?.addEventListener('pointerup', () => {
        this.selectedUnitInstanceId = null;
        document.getElementById('tap-tooltip-bar')?.classList.add('hidden');
      });

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
        const estGold =
          p.goblinVaultStacks * 3 + Math.floor(p.goblinVaultStacks / 4) * 5;
        this.showTapTooltip(
          `<strong>🪙 황금 고블린 금고 (${p.goblinVaultStacks} 스택)</strong><br/>고블린 시너지 활성화 중 패배할 때마다 스택이 쌓이며, 다음 전투 승리 시 한꺼번에 캐시아웃 보상을 드랍합니다! (예상 가치: 약 ${estGold}G)`
        );
      });

    // 상점 접기 / 열기 토글 버튼
    document
      .getElementById('toggle-shop-btn')
      ?.addEventListener('pointerup', () => {
        this.isShopManuallyCollapsed = !this.isShopManuallyCollapsed;
        this.pixelRenderer.recomputeLayoutMetrics(this.isShopCurrentlyExpanded());
        this.renderShopAndControls();
      });

    document
      .getElementById('quick-open-shop-btn')
      ?.addEventListener('pointerup', () => {
        this.isShopManuallyCollapsed = false;
        this.pixelRenderer.recomputeLayoutMetrics(this.isShopCurrentlyExpanded());
        this.renderShopAndControls();
      });

    document.getElementById('buy-xp-btn')?.addEventListener('pointerup', (e) => {
      const pt = this.clientToCanvasPoint(e.clientX, e.clientY);
      if (this.game.player.buyXp()) {
        this.pixelRenderer.spawnPixelSparks(pt.x, pt.y, '#38bdf8', 14);
        this.renderAllHUD();
      } else if (this.game.player.lastActionMessage) {
        this.game.pushBannerNotification(this.game.player.lastActionMessage);
        this.renderTopHud();
      }
    });

    document.getElementById('reroll-btn')?.addEventListener('pointerup', (e) => {
      if (this.game.phase !== 'PREPARATION_PHASE') return;
      const pt = this.clientToCanvasPoint(e.clientX, e.clientY);
      if (this.game.player.rerollShop(this.game.sharedPool)) {
        this.pixelRenderer.spawnPixelSparks(pt.x, pt.y, '#facc15', 14);
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

    const triggerStartCombat = () => {
      if (this.game.phase !== 'PREPARATION_PHASE') return;
      this.lastProcessedCombatTick = -1;
      this.selectedUnitInstanceId = null;
      this.pixelRenderer.resetCombatJuiceStates();
      this.game.startCombatPhase();
    };

    document
      .getElementById('start-combat-btn')
      ?.addEventListener('pointerup', triggerStartCombat);
    document
      .getElementById('quick-start-combat-btn')
      ?.addEventListener('pointerup', triggerStartCombat);

    // 상시 노출되는 배속 컨트롤 (1x / 2x / 스킵)
    document
      .getElementById('speed-1x-btn')
      ?.addEventListener('pointerup', () => {
        this.game.setPlaybackSpeed(1);
        this.renderTopHud();
        this.renderShopAndControls();
      });
    document
      .getElementById('speed-2x-btn')
      ?.addEventListener('pointerup', () => {
        this.game.setPlaybackSpeed(2);
        this.renderTopHud();
        this.renderShopAndControls();
      });
    document
      .getElementById('skip-combat-btn')
      ?.addEventListener('pointerup', () => {
        this.game.skipCombatToResolution();
      });

    this.fxCanvas.addEventListener('pointerdown', (e) =>
      this.handleCanvasPointerDown(e)
    );

    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
  }

  private handleCanvasPointerDown(e: PointerEvent): void {
    const pt = this.clientToCanvasPoint(e.clientX, e.clientY);
    const px = pt.x;
    const py = pt.y;

    const viewed = this.game.getViewedParticipant();

    // 1. 전투 페이즈 중이면 가장 가까운 전투 기물 탭 선택 및 툴팁 조회
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
          this.selectedUnitInstanceId = cu.instanceId;
          this.startPointerInteraction(e, null, () => {
            this.showCombatUnitTooltip(cu);
          });
          return;
        }
      }
      this.selectedUnitInstanceId = null;
      document.getElementById('tap-tooltip-bar')?.classList.add('hidden');
      return;
    }

    // 2. 하단 1x9 대기석(Bench) 슬롯 히트 검사
    const benchIdx = this.pixelRenderer.screenPointToBenchIndex(px, py);
    if (benchIdx !== null) {
      const benchUnit = viewed.bench[benchIdx];
      if (benchUnit) {
        this.selectedUnitInstanceId = benchUnit.instanceId;
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
        this.selectedUnitInstanceId = boardUnit.instanceId;
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
        return;
      }
    }

    // 4. 빈 곳 터치 시: 선택 해제 및 내 지휘관 아바타를 터치한 위치로 즉시 이동!
    this.selectedUnitInstanceId = null;
    document.getElementById('tap-tooltip-bar')?.classList.add('hidden');

    if (viewed.id === this.game.player.id) {
      this.pixelRenderer.movePlayerAvatarTo(px, py);
      // 터치 지점에 반짝이는 마법 핑 이펙트 스폰
      this.pixelRenderer.spawnPixelSparks(px, py, '#38bdf8', 12);
    }
  }

  private startPointerInteraction(
    e: PointerEvent,
    payload: DragPayload | null,
    onShortTap: () => void
  ): void {
    e.stopPropagation();
    const pt = this.clientToCanvasPoint(e.clientX, e.clientY);
    this.activePointerId = e.pointerId;
    this.pointerDownTime = performance.now();
    this.pointerStartX = pt.x;
    this.pointerStartY = pt.y;
    this.isDragging = false;
    this.dragPayload = payload;
    this.tapCallback = onShortTap;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.activePointerId !== e.pointerId) return;

    const pt = this.clientToCanvasPoint(e.clientX, e.clientY);
    const dx = pt.x - this.pointerStartX;
    const dy = pt.y - this.pointerStartY;
    const dist = Math.hypot(dx, dy);

    if (!this.isDragging && dist > 8 && this.dragPayload) {
      if (
        this.game.phase === 'PREPARATION_PHASE' &&
        this.game.viewedParticipantId === this.game.player.id
      ) {
        this.isDragging = true;
        if (this.dragPayload.kind === 'UNIT') {
          this.selectedUnitInstanceId = this.dragPayload.instanceId;
          if (this.isShopManuallyCollapsed) {
            this.isShopManuallyCollapsed = false;
            this.pixelRenderer.recomputeLayoutMetrics(true);
            this.renderShopAndControls();
          }
          this.showSellDropzoneOverlay(this.dragPayload.unit);
        }
        this.showDragGhost(e.clientX, e.clientY);
      }
    }

    if (this.isDragging) {
      const px = pt.x;
      const py = pt.y;
      this.updateDragGhostPosition(e.clientX, e.clientY, px, py);

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

  private showDragGhost(clientX: number, clientY: number): void {
    const ghostEl = document.getElementById('drag-ghost');
    if (!ghostEl || !this.dragPayload) return;

    if (this.dragPayload.kind === 'UNIT') {
      const u = this.dragPayload.unit;
      ghostEl.innerHTML = `${u.icon} ${u.name} (${'★'.repeat(u.starLevel)})`;
    } else if (this.dragPayload.kind === 'ITEM') {
      const item = ITEM_DEFINITIONS[this.dragPayload.itemId];
      ghostEl.innerHTML = `<div class="ghost-item-title">${item.icon} ${item.name}</div>`;
    } else {
      ghostEl.innerHTML = `🌟 챔피언 복제기`;
    }

    ghostEl.style.left = `${clientX}px`;
    ghostEl.style.top = `${clientY}px`;
    ghostEl.classList.remove('hidden');
  }

  private updateDragGhostPosition(
    clientX: number,
    clientY: number,
    px: number,
    py: number
  ): void {
    const ghostEl = document.getElementById('drag-ghost');
    if (!ghostEl) return;
    ghostEl.style.left = `${clientX}px`;
    ghostEl.style.top = `${clientY}px`;

    if (!this.dragPayload || this.dragPayload.kind !== 'ITEM') return;

    const payload = this.dragPayload;
    const itemDef = ITEM_DEFINITIONS[payload.itemId];
    if (!itemDef) return;

    // A. 대기석 다른 기본 아이템 슬롯 호버링 검사 (대기석 합성 미리보기)
    const domTarget = document.elementFromPoint(clientX, clientY);
    const targetSlotEl = domTarget?.closest('.item-slot') as HTMLElement | null;
    if (targetSlotEl && targetSlotEl.dataset.slotIndex !== undefined) {
      const targetBenchIdx = parseInt(targetSlotEl.dataset.slotIndex, 10);
      if (!isNaN(targetBenchIdx) && targetBenchIdx !== payload.itemBenchIndex) {
        const targetItemId = this.game.player.itemBench[targetBenchIdx];
        const targetDef = ITEM_DEFINITIONS[targetItemId];
        if (!itemDef.isCompleted && targetDef && !targetDef.isCompleted) {
          const combinedId = combineBaseItems(
            payload.itemId as BaseItemId,
            targetItemId as BaseItemId
          );
          const combinedDef = ITEM_DEFINITIONS[combinedId];
          ghostEl.innerHTML = `
            <div class="ghost-item-title">${itemDef.icon} ${itemDef.name}</div>
            <div class="craft-preview-banner">
              <span class="craft-tag">대기석 조합 미리보기</span>
              <strong style="color:#fde047; font-size:11px;">${combinedDef.icon} ${combinedDef.name}</strong>
              <div class="craft-desc">${combinedDef.description}</div>
            </div>
          `;
          return;
        }
      }
    }

    // B. 자석 판정: 반경 70px 이내의 가장 가까운 기물 호버링 검사 (기물 합성/장착 미리보기)
    const nearest = this.pixelRenderer.findNearestUnitInstance(
      px,
      py,
      this.game.player,
      70
    );
    if (nearest) {
      const u = nearest.unit;
      const existingBaseId = u.items.find(
        (id) => !ITEM_DEFINITIONS[id]?.isCompleted
      ) as BaseItemId | undefined;

      if (!itemDef.isCompleted && existingBaseId) {
        const combinedId = combineBaseItems(
          existingBaseId,
          payload.itemId as BaseItemId
        );
        const combinedDef = ITEM_DEFINITIONS[combinedId];
        ghostEl.innerHTML = `
          <div class="ghost-item-title">${itemDef.icon} ${itemDef.name}</div>
          <div class="craft-preview-banner">
            <span class="craft-tag">${u.name} 즉시 합체!</span>
            <strong style="color:#38bdf8; font-size:11px;">${combinedDef.icon} ${combinedDef.name}</strong>
            <div class="craft-desc">${combinedDef.description}</div>
          </div>
        `;
        return;
      } else {
        const slotCount = `${u.items.length}/3`;
        ghostEl.innerHTML = `
          <div class="ghost-item-title">${itemDef.icon} ${itemDef.name}</div>
          <div class="craft-preview-banner">
            <span class="craft-tag">${u.name} 장착 (${slotCount})</span>
            <div class="craft-desc">${itemDef.description}</div>
          </div>
        `;
        return;
      }
    }

    // 호버 대상이 없을 때 기본 표시
    ghostEl.innerHTML = `<div class="ghost-item-title">${itemDef.icon} ${itemDef.name}</div>`;
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
    )}] 판매 (+${refund}G)`;
    overlay.classList.remove('hidden');
  }

  private hideSellDropzoneOverlay(): void {
    document.getElementById('sell-dropzone-overlay')?.classList.add('hidden');
  }

  private completeDropAtPoint(
    payload: DragPayload,
    clientX: number,
    clientY: number
  ): void {
    const player = this.game.player;
    const domTarget = document.elementFromPoint(clientX, clientY);
    const pt = this.clientToCanvasPoint(clientX, clientY);
    const px = pt.x;
    const py = pt.y;

    if (payload.kind === 'UNIT') {
      if (
        domTarget?.closest('#shop-cards-wrapper') ||
        domTarget?.closest('#bottom-shop-bar') ||
        py >= this.pixelRenderer.viewportHeight - 92
      ) {
        const earned = player.sellUnit(payload.instanceId, this.game.sharedPool);
        if (earned > 0) {
          this.selectedUnitInstanceId = null;
          this.pixelRenderer.spawnPixelSparks(px, py, '#facc15', 26);
          this.pixelRenderer.spawnArcadePopupText(
            px,
            py - 20,
            `+${earned}G`,
            '#ffea00',
            18
          );
          this.game.pushBannerNotification(player.lastActionMessage);
          this.renderAllHUD();
        }
        return;
      }

      const fromLoc =
        payload.fromArea === 'BENCH'
          ? ({ area: 'BENCH', index: payload.fromIndex! } as const)
          : ({
              area: 'BOARD',
              row: payload.fromRow!,
              col: payload.fromCol!,
            } as const);

      const benchIdx = this.pixelRenderer.screenPointToBenchIndex(px, py);
      if (benchIdx !== null) {
        player.moveUnit(fromLoc, { area: 'BENCH', index: benchIdx });
        this.pixelRenderer.spawnPixelSparks(px, py, '#38bdf8', 10);
        this.renderAllHUD();
        return;
      }

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

    // 1) 아이템을 대기석(itemBench)의 다른 아이템 슬롯 위로 드롭한 경우 -> 대기석 즉시 합성
    if (payload.kind === 'ITEM') {
      const targetSlotEl = domTarget?.closest('.item-slot') as HTMLElement | null;
      if (targetSlotEl && targetSlotEl.dataset.slotIndex !== undefined) {
        const targetBenchIdx = parseInt(targetSlotEl.dataset.slotIndex, 10);
        if (!isNaN(targetBenchIdx) && targetBenchIdx !== payload.itemBenchIndex) {
          const combined = player.combineItemsOnBench(
            payload.itemBenchIndex,
            targetBenchIdx
          );
          if (combined) {
            this.pixelRenderer.spawnPixelSparks(px, py, '#facc15', 28);
            this.pixelRenderer.spawnArcadePopupText(
              px,
              py - 20,
              '조합 완료!',
              '#ffea00',
              16
            );
            this.game.pushBannerNotification(player.lastActionMessage);
            this.renderAllHUD();
            return;
          }
        }
      }
    }

    // 2) 기물 탐색 (자석 스냅: 터치 지점 반경 70px 이내의 가장 가까운 기물 자동 인식)
    let targetInstanceId: string | undefined;
    let targetCenter = { x: px, y: py };

    const nearest = this.pixelRenderer.findNearestUnitInstance(px, py, player, 70);
    if (nearest) {
      targetInstanceId = nearest.unit.instanceId;
      targetCenter = nearest.center;
    } else {
      // 보조 백업: 대기석 슬롯 또는 육각형 타일 직접 판정
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
          targetInstanceId =
            player.board[hitHex.row - 4]?.[hitHex.col]?.instanceId;
        }
      }
    }

    if (!targetInstanceId) return;

    if (payload.kind === 'ITEM') {
      if (player.equipItemToUnit(payload.itemBenchIndex, targetInstanceId)) {
        this.pixelRenderer.spawnPixelSparks(
          targetCenter.x,
          targetCenter.y,
          '#00f5d4',
          24
        );
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderAllHUD();
      } else if (player.lastActionMessage) {
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderTopHud();
      }
    } else if (payload.kind === 'DUPLICATOR') {
      if (player.useChampionDuplicator(targetInstanceId, this.game.sharedPool)) {
        this.pixelRenderer.spawnPixelSparks(
          targetCenter.x,
          targetCenter.y,
          '#ffea00',
          34
        );
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
    // 새 정비 페이즈 진입 시 상점 자동 펼침 & 전투 진입 시 상점 자동 접힘
    if (this.game.phase !== this.lastKnownPhase) {
      if (this.game.phase === 'PREPARATION_PHASE') {
        this.isShopManuallyCollapsed = false;
      }
      this.lastKnownPhase = this.game.phase;
      this.pixelRenderer.recomputeLayoutMetrics(this.isShopCurrentlyExpanded());
    }

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

    // 전투 종료 직후 승자 아바타 -> 패자 아바타 피니시 레이저 연출 발동
    if (this.game.activeFinisherLaser) {
      const laserKey = `${this.game.stage}-${this.game.roundInStage}-${this.game.activeFinisherLaser.winnerSide}-${this.game.activeFinisherLaser.damage}`;
      if (this.lastTriggeredLaserKey !== laserKey) {
        this.lastTriggeredLaserKey = laserKey;
        this.pixelRenderer.triggerAvatarFinisherLaser(this.game.activeFinisherLaser);
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
      roundLabel.textContent = this.game.getRoundLabel();
      const phaseNames: Record<string, string> = {
        AUGMENT_PHASE: '증강체',
        ANVIL_PHASE: '모루',
        PREPARATION_PHASE: '정비',
        COMBAT_PHASE: '전투',
        RESOLUTION_PHASE: '정산',
        GAME_OVER_PHASE: '종료',
      };
      phaseLabel.textContent = phaseNames[this.game.phase] ?? this.game.phase;
    }

    // TFT 순정 실시간 정비 카운트다운 타이머 & 5초 이하 긴박 붉은 맥동(Pulse)
    const timerPill = document.getElementById('prep-timer-pill');
    const timerText = document.getElementById('prep-timer-text');
    const timerFill = document.getElementById('prep-timer-fill');
    const centerBanner = document.getElementById('hud-center-banner');
    const urgentVignette = document.getElementById('urgent-vignette-overlay');

    const isPrep = this.game.phase === 'PREPARATION_PHASE';
    const isUrgentFiveSec =
      isPrep && this.game.prepRemainingSec <= 5 && this.game.prepRemainingSec > 0;

    if (timerPill && timerText && timerFill) {
      if (isPrep) {
        timerPill.classList.remove('hidden');
        timerText.textContent = `⏱️${this.game.prepRemainingSec}s`;
        const pct =
          this.game.prepTotalSec > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  Math.round(
                    (this.game.prepRemainingSec / this.game.prepTotalSec) * 100
                  )
                )
              )
            : 100;
        timerFill.style.width = `${pct}%`;
        timerPill.classList.toggle('urgent-pulse', isUrgentFiveSec);
      } else {
        timerPill.classList.add('hidden');
        timerPill.classList.remove('urgent-pulse');
      }
    }

    if (centerBanner) {
      centerBanner.classList.toggle('urgent-pulse', isUrgentFiveSec);
    }
    if (urgentVignette) {
      urgentVignette.classList.toggle('hidden', !isUrgentFiveSec);
    }

    const viewed = this.game.getViewedParticipant();
    const deployCounter = document.getElementById('deploy-counter');
    if (deployCounter) {
      deployCounter.textContent = `⚔️ ${viewed.getBoardUnitCount()}/${viewed.level}`;
    }

    const oppIndicator = document.getElementById('opponent-indicator');
    if (oppIndicator) {
      if (
        this.game.phase === 'COMBAT_PHASE' ||
        this.game.phase === 'RESOLUTION_PHASE'
      ) {
        oppIndicator.textContent = `VS ${this.game.playerCurrentOpponentName}`;
      } else {
        const rType = this.game.getCurrentRoundType();
        oppIndicator.textContent =
          rType === 'CREEP'
            ? '크립전'
            : rType === 'BOSS_CREEP'
            ? '보스전'
            : '대인전';
      }
    }

    const ticker = document.getElementById('banner-ticker');
    if (ticker && this.game.bannerNotifications.length > 0) {
      ticker.textContent = this.game.bannerNotifications[0];
    }

    // 배속 버튼 상시 활성화 표시 & 전투 중 스킵 버튼 노출
    const inCombat = this.game.phase === 'COMBAT_PHASE';
    document
      .getElementById('speed-1x-btn')
      ?.classList.toggle('active', this.game.playbackSpeed === 1);
    document
      .getElementById('speed-2x-btn')
      ?.classList.toggle('active', this.game.playbackSpeed === 2);
    document
      .getElementById('skip-combat-btn')
      ?.classList.toggle('hidden', !inCombat);

    const scoutBanner = document.getElementById('scouting-banner');
    const scoutText = document.getElementById('scouting-target-text');
    if (scoutBanner && scoutText) {
      if (viewed.id !== this.game.player.id) {
        const personaLabel = viewed.persona
          ? PERSONA_BADGE_LABELS[viewed.persona]
          : '';
        scoutText.textContent = `🔍 ${viewed.name} (${personaLabel} · 🪙${viewed.gold}G)`;
        scoutBanner.classList.remove('hidden');
      } else {
        scoutBanner.classList.add('hidden');
      }
    }

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

    const vaultEl = document.getElementById('goblin-vault-stacks');
    if (vaultEl) {
      vaultEl.textContent = `${viewed.goblinVaultStacks}`;
    }

    const synContainer = document.getElementById('synergy-list');
    if (synContainer) {
      synContainer.innerHTML = '';
      const states = SynergyEngine.calculateActiveSynergies(viewed).filter(
        (s) => s.count > 0
      );

      for (const st of states) {
        const nextThresh =
          st.definition.thresholds.find((t: number) => t >= st.count) ??
          st.definition.thresholds[st.definition.thresholds.length - 1];

        const badge = document.createElement('div');
        badge.className = `synergy-badge style-${st.styleTier}`;
        badge.innerHTML = `
          <span>${st.definition.icon}</span>
          <span>${st.count}/${nextThresh}</span>
        `;
        badge.addEventListener('pointerup', () => {
          this.showTapTooltip(
            `<strong>${st.definition.icon} ${st.definition.name} (${st.count}명)</strong><br/>${
              st.definition.description
            }<br/><span style="color:#fde047">${
              st.activeEffect ? st.activeEffect.label : '임계값 미달'
            }</span>`
          );
        });
        synContainer.appendChild(badge);
      }
    }

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
                `<strong>🌟 챔피언 복제기 (${viewed.duplicators}개)</strong><br/>아군 기물 위로 드래그하여 놓으면 1성 복사본을 즉시 생성합니다.`
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
        slot.dataset.slotIndex = String(idx);
        slot.textContent = def.icon;
        slot.addEventListener('pointerdown', (e) => {
          this.startPointerInteraction(
            e,
            viewed.id === this.game.player.id
              ? { kind: 'ITEM', itemBenchIndex: idx, itemId }
              : null,
            () => {
              this.showTapTooltip(
                `<strong>${def.icon} ${def.name}</strong><br/>${def.description}<br/><span style="color:#7dd3fc">기물 위로 드래그하여 장착하거나, 다른 재료 아이템 위로 올려 대기석에서 즉시 합성</span>`
              );
            }
          );
        });
        itemGrid.appendChild(slot);
      });
    }
  }

  /**
   * ? / ! 미스터리 보물상자(Mystery Box) 렌더링 & 터치 시 화려한 파티클 개봉 연출
   */
  private renderLootOrbs(): void {
    const orbLayer = document.getElementById('loot-orb-layer');
    if (!orbLayer) return;
    orbLayer.innerHTML = '';

    if (this.game.viewedParticipantId !== this.game.player.id) return;

    for (const orb of this.game.playerLootOrbs) {
      const btn = document.createElement('div');
      btn.className = `loot-orb-btn mystery-box-chest orb-${orb.tier}`;
      btn.style.left = `${Math.round(22 + orb.x * 54)}%`;
      btn.style.top = `${Math.round(22 + orb.y * 36)}%`;

      // 프리즘/고등급 상자는 강렬한 '!' 마크, 일반/골드/블루 상자는 호기심을 자극하는 '?' 마크 표시
      const isExclaim =
        orb.tier === 'PRISMATIC' || (orb.label && orb.label.startsWith('!'));
      const mysteryMark = isExclaim ? '!' : '?';
      const chestIcon =
        orb.tier === 'PRISMATIC'
          ? '👑'
          : orb.tier === 'GOLD'
          ? '🧰'
          : '📦';

      // 불필요한 '미스터리', '대박상자' 텍스트 라벨 완전 삭제하고 순수한 ? / ! 도트 룬 심볼 및 보물상자만 직관적으로 표시
      btn.innerHTML = `
        <div class="mystery-badge-mark ${isExclaim ? 'mark-exclaim' : 'mark-question'}">${mysteryMark}</div>
        <div class="mystery-chest-body">
          <span class="chest-sprite-icon">${chestIcon}</span>
        </div>
      `;

      btn.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        // 터치했을 때도 아바타가 해당 상자로 달려가서 먹도록 유도
        const orbCanvasX = Math.round(
          this.pixelRenderer.viewportWidth * (0.22 + orb.x * 0.54)
        );
        const orbCanvasY = Math.round(
          this.pixelRenderer.viewportHeight * (0.22 + orb.y * 0.36)
        );
        this.pixelRenderer.movePlayerAvatarTo(orbCanvasX, orbCanvasY);
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

      const hpPct = Math.max(
        0,
        Math.min(100, Math.round((p.hp / p.maxHp) * 100))
      );
      const shortName = !p.isAI ? '나' : p.name.slice(0, 3);

      card.innerHTML = `
        <div class="leader-top-row">
          <span>#${idx + 1} ${shortName}</span>
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
          <span>Lv.${p.level}</span>
          <span>🪙${p.gold}</span>
        </div>
      `;

      card.addEventListener('pointerup', () => {
        this.game.viewedParticipantId = p.id;
        this.renderAllHUD();
      });

      listEl.appendChild(card);
    });
  }

  /**
   * 슬림 접이식 상점 드로어 & 2.6배 확대 클로즈업 도트 아바타 카드 렌더링
   */
  private renderShopAndControls(): void {
    const player = this.game.player;
    const inCombat =
      this.game.phase === 'COMBAT_PHASE' ||
      this.game.phase === 'RESOLUTION_PHASE';
    const isExpanded = this.isShopCurrentlyExpanded();

    const shopBar = document.getElementById('bottom-shop-bar');
    const toggleBar = document.getElementById('shop-drawer-toggle-bar');
    const toggleBtn = document.getElementById('toggle-shop-btn');
    const quickBar = document.getElementById('Collapsed-quick-bar');
    const quickGold = document.getElementById('quick-gold-text');
    const quickCombatBtn = document.getElementById('quick-start-combat-btn');

    if (shopBar && toggleBar && quickBar) {
      shopBar.classList.toggle('hidden', !isExpanded);
      toggleBar.classList.toggle('hidden', !isExpanded);
      quickBar.classList.toggle('hidden', isExpanded || inCombat);
    }
    if (toggleBtn) {
      toggleBtn.textContent = isExpanded ? '🛒 상점 접기 ▼' : '🛒 상점 열기 ▲';
    }
    if (quickGold) {
      quickGold.textContent = `${player.gold}G`;
    }
    if (quickCombatBtn) {
      quickCombatBtn.classList.toggle('hidden', inCombat);
      if (this.game.phase === 'PREPARATION_PHASE') {
        quickCombatBtn.textContent = `⏱️ ${this.game.prepRemainingSec}s (출격)`;
      }
    }

    const lvlText = document.getElementById('player-level-text');
    const xpText = document.getElementById('player-xp-text');
    if (lvlText && xpText) {
      lvlText.textContent = `Lv.${player.level}`;
      const nextXp = XP_REQUIRED_BY_LEVEL[player.level + 1];
      xpText.textContent =
        player.level >= 10 ? 'MAX' : `${player.xp}/${nextXp}`;
    }

    const goldText = document.getElementById('player-gold-text');
    const intText = document.getElementById('player-interest-text');
    if (goldText && intText) {
      goldText.textContent = `🪙${player.gold}G`;
      intText.textContent = `+${player.calculateInterestGold()}G`;
    }

    const rerollBtn = document.getElementById('reroll-btn');
    if (rerollBtn) {
      rerollBtn.innerHTML =
        player.freeRerolls > 0
          ? `<span class="btn-main-label">🎟️무료리롤</span><span class="btn-sub-cost">${player.freeRerolls}회</span>`
          : `<span class="btn-main-label">🎲리롤</span><span class="btn-sub-cost">2G</span>`;
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
    if (startCombatBtn) {
      startCombatBtn.classList.toggle('hidden', inCombat);
      if (this.game.phase === 'PREPARATION_PHASE') {
        const isUrgent = this.game.prepRemainingSec <= 5;
        startCombatBtn.classList.toggle('urgent-pulse', isUrgent);
        startCombatBtn.innerHTML = `
          <span class="sword-emblem" style="font-size:15px;">⏱️${this.game.prepRemainingSec}s</span>
          <span class="battle-label">즉시출격</span>
        `;
      }
    }

    const shopContainer = document.getElementById('shop-cards-container');
    if (!shopContainer) return;
    shopContainer.innerHTML = '';

    player.shop.forEach((unitId, slotIdx) => {
      const card = document.createElement('div');
      if (!unitId) {
        card.className = 'shop-card empty-slot';
        card.textContent = '구매완료';
        shopContainer.appendChild(card);
        return;
      }

      const template = UNIT_TEMPLATES[unitId];
      const ownedCopies = player.getOwnedUnitCopiesCount(unitId);
      const remainingPool = this.game.sharedPool.getRemainingCount(unitId);

      const canUpgrade =
        ownedCopies === 2 || ownedCopies === 5 || ownedCopies === 8;
      card.className = `shop-card cost-${template.cost} ${
        canUpgrade ? 'can-upgrade-card' : ''
      }`;

      let mergeHintBadge = '';
      if (ownedCopies === 8) {
        mergeHintBadge = `<div class="shop-merge-badge gold-merge">★3성 가능!</div>`;
      } else if (ownedCopies === 2 || ownedCopies === 5) {
        mergeHintBadge = `<div class="shop-merge-badge">★2성 가능!</div>`;
      } else if (ownedCopies > 0) {
        mergeHintBadge = `<div class="shop-owned-count-tag">보유 ${ownedCopies}</div>`;
      }

      const traitIconsHtml = template.traits
        .map(
          (t: TraitId) =>
            `<span class="shop-trait-pill">${TRAIT_DEFINITIONS[t].icon}${TRAIT_DEFINITIONS[t].name.slice(0, 2)}</span>`
        )
        .join('');

      card.innerHTML = `
        <div class="shop-card-top cost-header-${template.cost}">
          <span class="shop-unit-name">${template.name}</span>
          <span class="shop-cost-pill cost-tag-${template.cost}">🪙${template.cost}G</span>
        </div>
        ${mergeHintBadge}
        <div class="shop-portrait-stage">
          <canvas class="shop-pixel-portrait"></canvas>
          <div class="shop-trait-Overlay-strip">
            <div>${traitIconsHtml}</div>
            <span class="shop-trait-pill">📦${remainingPool}</span>
          </div>
        </div>
      `;

      const portraitCanvas = card.querySelector(
        '.shop-pixel-portrait'
      ) as HTMLCanvasElement | null;
      if (portraitCanvas) {
        this.pixelRenderer.renderShopCardPortrait(
          portraitCanvas,
          unitId,
          template.cost,
          canUpgrade
        );
      }

      card.addEventListener('pointerup', (e) => {
        const pt = this.clientToCanvasPoint(e.clientX, e.clientY);
        if (player.buyUnit(slotIdx, this.game.sharedPool)) {
          this.pixelRenderer.spawnPixelSparks(pt.x, pt.y, '#fde047', 22);
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
    const augModal = document.getElementById('augment-modal');
    const augRow = document.getElementById('augment-cards-row');
    if (augModal && augRow) {
      if (this.game.phase === 'AUGMENT_PHASE') {
        augModal.classList.remove('hidden');
        augRow.innerHTML = '';

        this.game.playerAugmentChoices.forEach((aug, idx) => {
          const card = document.createElement('div');
          card.className = `augment-card tier-${aug.tier}`;
          const canReroll = !this.game.augmentCardRerolled[idx as 0 | 1 | 2];

          card.innerHTML = `
            <div>
              <div class="aug-card-icon">${aug.icon}</div>
              <div class="aug-card-title">${aug.name}</div>
              <div class="aug-card-desc">${aug.description}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div class="rune-icon-btn gold-gem select-aug-btn">✅ 각인 선택</div>
              <div class="aug-reroll-btn reroll-aug-btn" style="${
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

    const anvilModal = document.getElementById('anvil-modal');
    const anvilRow = document.getElementById('anvil-cards-row');
    if (anvilModal && anvilRow) {
      if (this.game.phase === 'ANVIL_PHASE') {
        anvilModal.classList.remove('hidden');
        anvilRow.innerHTML = '';

        this.game.playerAnvilChoices.forEach((opt, idx) => {
          const card = document.createElement('div');
          card.className = 'augment-card';
          card.innerHTML = `
            <div>
              <div class="aug-card-icon">${opt.icon}</div>
              <div class="aug-card-title">${opt.label}</div>
              <div class="aug-card-desc">${opt.description}</div>
            </div>
            <div class="rune-icon-btn gold-gem anvil-pick-btn">🎁 무료 제련</div>
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
          <div style="font-size:20px;color:#fde047;margin:6px 0;text-align:center;">
            최종 순위: #${res.placement}위!
          </div>
          <div style="font-size:12px;margin-bottom:8px;text-align:center;">
            ${res.summaryText}
          </div>
        `;
      } else {
        overModal.classList.add('hidden');
      }
    }
  }

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
        ? `<span style="color:#fb7185;">🔒 3성 차단</span>`
        : `<span style="color:#34d399;">정상</span>`;

      tr.innerHTML = `
        <td style="color:var(--cost-${row.cost});">${row.cost}코</td>
        <td>${UNIT_TEMPLATES[row.unitId].icon} ${row.unitName}</td>
        <td>${row.maxCount}</td>
        <td style="color:#38bdf8;">${row.remainingInPool}</td>
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
      <div>
        <div style="font-size:14px;color:#fde047;">
          현재 티어: ${RANK_TIER_BADGE_ICONS[profile.tier]} ${RANK_TIER_KOREAN_NAMES[profile.tier]} (${profile.lp} LP)
        </div>
        <div style="font-size:11px;color:#cbd5e1;margin-top:4px;">
          전적: ${profile.gamesPlayed}전 | 1위: ${profile.wins}회 | TOP 4: ${profile.top4Count}회
        </div>
        <div style="font-size:10px;color:#38bdf8;margin-top:4px;">
          AI 지능: <strong>${aiParams.skillLevel}</strong> | 정찰 확률: <strong>${Math.round(
      aiParams.scoutingChance * 100
    )}%</strong> | 4~5코 견제: <strong>${
      aiParams.skillLevel >= 0.75 ? 'ON' : 'OFF'
    }</strong>
        </div>
      </div>
    `;

    gridEl.innerHTML = '';
    for (const tier of RANK_TIERS_ORDERED) {
      const btn = document.createElement('div');
      btn.className = `tier-select-btn ${tier === profile.tier ? 'active' : ''}`;
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
      `<strong>${unit.icon} ${unit.name} (${'★'.repeat(unit.starLevel)} · ${
        unit.cost
      }코)</strong> [${traitsStr}]<br/>HP ${unit.maxHp} · 공격 ${
        unit.atk
      } · 방어 ${unit.def} · 사거리 ${unit.range}칸 · 아이템: ${itemsStr}<br/><span style="color:#fde047">[${
        template.skill.name
      }]:</span> ${template.skill.description}`
    );
  }

  private showCombatUnitTooltip(cu: CombatUnit): void {
    const template =
      UNIT_TEMPLATES[cu.unitId] ?? getCreepMonsterTemplate(cu.unitId);
    const skillName = template?.skill.name ?? '야생 본능';
    const skillDesc = template?.skill.description ?? '야생 몬스터의 특수 공격을 수행합니다.';
    this.showTapTooltip(
      `<strong>${cu.icon} ${cu.name} (${cu.starLevel}성)</strong> | HP ${cu.currentHp}/${cu.maxHp} · 공격 ${cu.atk} · 딜량 ${cu.totalDamageDealt}<br/><span style="color:#fde047">[${skillName}]:</span> ${skillDesc}`
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
        const cx = this.pixelRenderer.viewportWidth * 0.5;
        const cy = this.pixelRenderer.viewportHeight * 0.45;
        this.pixelRenderer.spawnPixelSparks(cx, cy, '#ffea00', 55);
        this.pixelRenderer.spawnArcadePopupText(
          cx,
          cy - 20,
          `★★★ ${loc.unit.name} 3성 진화!`,
          '#ffea00',
          20
        );
        this.game.pushBannerNotification(
          `🌟★★★ [${loc.unit.name}] 3성 달성! (상점 영구 차단됨)`
        );
      }
    }
  }

  // ==========================================================================
  // 3. 100% 가로모드 고정(Auto-Landscape Rotation) & 레티나(DPR) 리사이즈
  // ==========================================================================

  private resizeCanvas(): void {
    const rawW = window.innerWidth || 800;
    const rawH = window.innerHeight || 600;
    const dpr = window.devicePixelRatio || 1;
    const appEl = document.getElementById('app');

    // 폰이 세로(rawH > rawW)로 들려 있으면 자동으로 #app을 90도 회전해 100% 가로모드로 고정
    if (rawH > rawW) {
      this.isPortraitRotated = true;
      appEl?.classList.add('force-landscape-rotated');
      this.pixelRenderer.resizeViewport(
        rawH,
        rawW,
        dpr,
        this.isShopCurrentlyExpanded()
      );
    } else {
      this.isPortraitRotated = false;
      appEl?.classList.remove('force-landscape-rotated');
      this.pixelRenderer.resizeViewport(
        rawW,
        rawH,
        dpr,
        this.isShopCurrentlyExpanded()
      );
    }
  }

  private startRenderLoop(): void {
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      const viewed = this.game.getViewedParticipant();
      const inCombat =
        (this.game.phase === 'COMBAT_PHASE' ||
          this.game.phase === 'RESOLUTION_PHASE') &&
        viewed.id === this.game.player.id;

      const activeSelectedOrDraggedId =
        this.isDragging && this.dragPayload?.kind === 'UNIT'
          ? this.dragPayload.instanceId
          : this.selectedUnitInstanceId;

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
        selectedInstanceId: activeSelectedOrDraggedId,
        hasPandoraBench: viewed.augments.includes('AUG_PANDORA_BENCH'),
        opponentName: this.game.playerCurrentOpponentName,
        isCreepMatch: this.game.getCurrentRoundType() !== 'PVP',
      });

      // 내 아바타가 전장을 이동하다가 ? / ! 미스터리 상자와 접촉(거리 36px 이내)하면 상자 폭발 & 획득!
      if (
        viewed.id === this.game.player.id &&
        this.game.playerLootOrbs.length > 0
      ) {
        const avatarPos = this.pixelRenderer.getPlayerAvatarCurrentPos();
        for (const orb of [...this.game.playerLootOrbs]) {
          const orbX = Math.round(
            this.pixelRenderer.viewportWidth * (0.22 + orb.x * 0.54)
          );
          const orbY = Math.round(
            this.pixelRenderer.viewportHeight * (0.22 + orb.y * 0.36)
          );
          const dist = Math.hypot(avatarPos.x - orbX, avatarPos.y - orbY);

          if (dist <= 40) {
            this.pixelRenderer.triggerImpactShake(6, 180, 0);
            this.pixelRenderer.spawnPixelSparks(
              orbX,
              orbY,
              orb.tier === 'PRISMATIC'
                ? '#f472b6'
                : orb.tier === 'GOLD'
                ? '#ffea00'
                : '#38bdf8',
              38
            );
            const rewards = this.game.openPlayerLootOrb(orb.id);
            if (rewards.length > 0) {
              this.pixelRenderer.spawnArcadePopupText(
                orbX,
                orbY - 20,
                `🎉 ${rewards.join(' + ')}`,
                orb.tier === 'PRISMATIC' ? '#f472b6' : '#ffea00',
                16
              );
            }
            this.renderLootOrbs();
          }
        }
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  /**
   * 메인 로비 화면에서 [게임 시작]을 눌렀을 때 부드러운 커튼 페이드 전환과 함께 게임 진입
   */
  private startNewGameFromLobby(): void {
    const curtain = document.getElementById('screen-transition-curtain');
    const lobbyScreen = document.getElementById('main-lobby-screen');

    // 1. 커튼 페이드아웃 (화면 암전)
    curtain?.classList.add('active');

    setTimeout(() => {
      // 2. 로비 화면 숨기기 & 인게임 세션 플래그 활성화
      lobbyScreen?.classList.add('hidden');
      this.isInGameSession = true;

      // 3. 인게임 세션 시작 및 상태 초기화
      this.knownThreeStarUnits.clear();
      this.selectedUnitInstanceId = null;
      this.isShopManuallyCollapsed = false;
      this.pixelRenderer.resetCombatJuiceStates();
      this.game.startNewGame();
      this.onGameStateUpdated();
      this.resizeCanvas();

      // 4. 커튼 페이드인 (화면 밝아지며 인게임 등장)
      setTimeout(() => {
        curtain?.classList.remove('active');
      }, 120);
    }, 280);
  }

  /**
   * 인게임 또는 게임오버 화면에서 [메인 로비로 이동]을 눌렀을 때 부드럽게 로비로 복귀
   */
  private returnToLobbyScreen(): void {
    const curtain = document.getElementById('screen-transition-curtain');
    const lobbyScreen = document.getElementById('main-lobby-screen');

    // 열려있는 인게임 모달들 숨김
    document.getElementById('gameover-modal')?.classList.add('hidden');
    document.getElementById('augment-modal')?.classList.add('hidden');
    document.getElementById('anvil-modal')?.classList.add('hidden');
    document.getElementById('pool-inspector-modal')?.classList.add('hidden');
    document.getElementById('rank-modal')?.classList.add('hidden');
    document.getElementById('settings-modal')?.classList.add('hidden');

    curtain?.classList.add('active');

    setTimeout(() => {
      this.isInGameSession = false;
      this.game.pauseOrStopGame();
      lobbyScreen?.classList.remove('hidden');

      setTimeout(() => {
        curtain?.classList.remove('active');
      }, 120);
    }, 280);
  }

  private openSettingsModal(): void {
    const modal = document.getElementById('settings-modal');
    modal?.classList.remove('hidden');
  }

  private closeSettingsModal(): void {
    const modal = document.getElementById('settings-modal');
    modal?.classList.add('hidden');
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    new FantasyAutoBattlerApp();
  });
} else {
  new FantasyAutoBattlerApp();
}

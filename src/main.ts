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
import { AIPersona, Participant, UnitInstance } from './Participant';
import {
  RANK_TIER_BADGE_ICONS,
  RANK_TIER_KOREAN_NAMES,
  RANK_TIERS_ORDERED,
  RankTier,
} from './RankManager';
import { CombatEvent, CombatUnit } from './SkillRegistry';
import { SynergyEngine } from './SynergyEngine';

// ============================================================================
// 시각 이펙트(VFX) 파티클 & 플로팅 텍스트 인터페이스
// ============================================================================

interface FloatingTextFX {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  fontSize: number;
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
}

interface ParticleFX {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
}

interface BeamFX {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  lifeMs: number;
  maxLifeMs: number;
}

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
  HYPER_ROLLER: '🎲 리롤 도박꾼',
  LOW_COST_REROLLER: '🎲 리롤 도박꾼',
  FAST_NINE_GREEDY: '👑 패스트9 황제',
  FAST_NINE_ECONOMIST: '👑 패스트9 황제',
  GOBLIN_GAMBLER: '🪙 고블린 코인충',
  FLEX_MASTER: '⚖️ 유연 밸런스',
  FLEX_BALANCED: '⚖️ 유연 밸런스',
};

class FantasyAutoBattlerApp {
  private game: GameLoopManager;
  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;

  private floatingTexts: FloatingTextFX[] = [];
  private particles: ParticleFX[] = [];
  private beams: BeamFX[] = [];
  private lastProcessedCombatTick: number = -1;
  private knownThreeStarUnits: Set<string> = new Set();

  // 모바일 포인터 드래그 앤 드롭 & 탭 판별 상태
  private activePointerId: number | null = null;
  private pointerDownTime: number = 0;
  private pointerStartX: number = 0;
  private pointerStartY: number = 0;
  private isDragging: boolean = false;
  private dragPayload: DragPayload | null = null;
  private tapCallback: (() => void) | null = null;

  constructor() {
    this.fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;
    this.fxCtx = this.fxCanvas.getContext('2d')!;

    this.game = new GameLoopManager(() => {
      this.onGameStateUpdated();
    });

    this.bindGlobalDOMEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.onGameStateUpdated();
    this.startVFXAnimationLoop();
  }

  // ==========================================================================
  // 1. 전역 버튼 및 모바일 포인터(PointerEvents) 바인딩
  // ==========================================================================

  private bindGlobalDOMEvents(): void {
    // 상단 버튼
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
        this.game.startNewGame();
      });

    document
      .getElementById('play-again-btn')
      ?.addEventListener('pointerup', () => {
        document.getElementById('gameover-modal')?.classList.add('hidden');
        this.knownThreeStarUnits.clear();
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
        this.renderAll();
      });

    // 하단 경제 및 전투 컨트롤 버튼
    document.getElementById('buy-xp-btn')?.addEventListener('pointerup', () => {
      if (this.game.player.buyXp()) {
        this.renderAll();
      } else if (this.game.player.lastActionMessage) {
        this.game.pushBannerNotification(this.game.player.lastActionMessage);
        this.renderTopHud();
      }
    });

    document.getElementById('reroll-btn')?.addEventListener('pointerup', () => {
      if (this.game.phase !== 'PREPARATION_PHASE') return;
      if (this.game.player.rerollShop(this.game.sharedPool)) {
        if (this.game.player.lastActionMessage) {
          this.game.pushBannerNotification(this.game.player.lastActionMessage);
        }
        this.renderAll();
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

    // 전역 PointerMove / PointerUp (모바일 터치 드래그 앤 드롭 처리)
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
  }

  /**
   * 기물, 아이템, 복제기 위에서 pointerdown 발생 시 호출
   */
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

    if (!this.isDragging && dist > 10 && this.dragPayload) {
      // 정비 페이즈이고 내 보드를 보고 있을 때만 드래그 시작 허용
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
      this.highlightDropTargetAt(e.clientX, e.clientY);
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

    this.hideDragGhost();
    this.hideSellDropzoneOverlay();
    this.clearAllDropHighlights();

    // 1. 짧은 터치(Short Tap)인 경우 상세 툴팁 표시
    if (!wasDragging && elapsed < 350 && tapCb) {
      tapCb();
      return;
    }

    // 2. 드래그 앤 드롭 완료 처리
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
      ghostEl.textContent = `🧬 챔피언 복제기`;
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

    const cost = unit.cost;
    const refund =
      unit.starLevel === 1
        ? cost
        : unit.starLevel === 2
        ? cost === 1
          ? 3
          : cost * 3 - 1
        : cost === 1
        ? 9
        : cost * 9 - 2;

    textEl.textContent = `💰 여기에 놓아 [${unit.name} ${unit.starLevel}성] 판매 (+${refund} 골드)`;
    overlay.classList.remove('hidden');
  }

  private hideSellDropzoneOverlay(): void {
    const overlay = document.getElementById('sell-dropzone-overlay');
    overlay?.classList.add('hidden');
    overlay?.classList.remove('sell-hover');
  }

  private clearAllDropHighlights(): void {
    document
      .querySelectorAll('.drop-highlight')
      .forEach((el) => el.classList.remove('drop-highlight'));
  }

  private highlightDropTargetAt(x: number, y: number): void {
    this.clearAllDropHighlights();
    const targetEl = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!targetEl) return;

    const sellOverlay = document.getElementById('sell-dropzone-overlay');
    if (sellOverlay && !sellOverlay.classList.contains('hidden')) {
      if (targetEl.closest('#shop-cards-wrapper')) {
        sellOverlay.classList.add('sell-hover');
        return;
      } else {
        sellOverlay.classList.remove('sell-hover');
      }
    }

    const boardTile = targetEl.closest('.board-tile.ally-row') as HTMLElement | null;
    if (boardTile) {
      boardTile.classList.add('drop-highlight');
      return;
    }

    const benchSlot = targetEl.closest('.bench-slot') as HTMLElement | null;
    if (benchSlot) {
      benchSlot.classList.add('drop-highlight');
    }
  }

  /**
   * 포인터를 놓은 위치(x, y)의 DOM 엘리먼트를 분석하여 기물 배치/교체, 판매, 아이템 장착, 복제기 사용을 수행한다.
   */
  private completeDropAtPoint(payload: DragPayload, x: number, y: number): void {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return;

    const player = this.game.player;

    // A. 기물 드래그 앤 드롭 처리
    if (payload.kind === 'UNIT') {
      // 1) 하단 상점 영역에 드롭 시 즉시 기물 판매(Drag-to-Sell)
      if (el.closest('#shop-cards-wrapper') || el.closest('#bottom-shop-bar')) {
        const refund = player.sellUnit(payload.instanceId, this.game.sharedPool);
        if (refund > 0) {
          this.spawnParticleBurst(x, y, '#ffd54f', 22);
          this.game.pushBannerNotification(player.lastActionMessage);
          this.renderAll();
        }
        return;
      }

      // 2) 아군 전투 보드 타일(하단 4행: combatRow 4~7 -> boardRow 0~3)에 드롭
      const boardTile = el.closest('.board-tile.ally-row') as HTMLElement | null;
      if (boardTile) {
        const boardRow = Number(boardTile.dataset.boardRow);
        const boardCol = Number(boardTile.dataset.boardCol);
        if (!Number.isNaN(boardRow) && !Number.isNaN(boardCol)) {
          const fromLoc =
            payload.fromArea === 'BENCH'
              ? ({ area: 'BENCH', index: payload.fromIndex! } as const)
              : ({
                  area: 'BOARD',
                  row: payload.fromRow!,
                  col: payload.fromCol!,
                } as const);

          if (!player.moveUnit(fromLoc, { area: 'BOARD', row: boardRow, col: boardCol })) {
            if (player.lastActionMessage) {
              this.game.pushBannerNotification(player.lastActionMessage);
            }
          }
          this.renderAll();
          return;
        }
      }

      // 3) 대기석 슬롯(0~8)에 드롭
      const benchSlot = el.closest('.bench-slot') as HTMLElement | null;
      if (benchSlot) {
        const benchIdx = Number(benchSlot.dataset.benchIndex);
        if (!Number.isNaN(benchIdx)) {
          const fromLoc =
            payload.fromArea === 'BENCH'
              ? ({ area: 'BENCH', index: payload.fromIndex! } as const)
              : ({
                  area: 'BOARD',
                  row: payload.fromRow!,
                  col: payload.fromCol!,
                } as const);

          player.moveUnit(fromLoc, { area: 'BENCH', index: benchIdx });
          this.renderAll();
        }
      }
      return;
    }

    // B. 아이템 또는 챔피언 복제기 드롭 처리 -> 대상 기물 탐색
    const unitToken = el.closest('.unit-token') as HTMLElement | null;
    let targetInstanceId = unitToken?.dataset.instanceId;

    if (!targetInstanceId) {
      const boardTile = el.closest('.board-tile.ally-row') as HTMLElement | null;
      if (boardTile) {
        const r = Number(boardTile.dataset.boardRow);
        const c = Number(boardTile.dataset.boardCol);
        targetInstanceId = player.board[r]?.[c]?.instanceId;
      }
      const benchSlot = el.closest('.bench-slot') as HTMLElement | null;
      if (benchSlot) {
        const idx = Number(benchSlot.dataset.benchIndex);
        targetInstanceId = player.bench[idx]?.instanceId;
      }
    }

    if (!targetInstanceId) return;

    if (payload.kind === 'ITEM') {
      if (player.equipItemToUnit(payload.itemBenchIndex, targetInstanceId)) {
        this.spawnParticleBurst(x, y, '#00e5ff', 20);
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderAll();
      } else if (player.lastActionMessage) {
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderTopHud();
      }
    } else if (payload.kind === 'DUPLICATOR') {
      if (player.useChampionDuplicator(targetInstanceId, this.game.sharedPool)) {
        this.spawnParticleBurst(x, y, '#ffea00', 32);
        this.checkNewStarUpgrades();
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderAll();
      } else if (player.lastActionMessage) {
        this.game.pushBannerNotification(player.lastActionMessage);
        this.renderTopHud();
      }
    }
  }

  // ==========================================================================
  // 2. 상태 업데이트 콜백 및 화면 전체 렌더링
  // ==========================================================================

  private onGameStateUpdated(): void {
    // 전투 페이즈 중 새로운 틱 이벤트가 발생했다면 VFX(데미지 폰트, 투사체, 5코 3성 번개) 처리
    if (this.game.phase === 'COMBAT_PHASE') {
      const engine = this.game.playerCombatEngine;
      if (engine.currentTick === 0) {
        const initEvs = engine.consumeInitialEvents();
        this.processCombatEventsForVFX(initEvs);
      } else if (engine.currentTick !== this.lastProcessedCombatTick) {
        this.lastProcessedCombatTick = engine.currentTick;
        this.processCombatEventsForVFX(engine.getLastTickEvents());
      }
    }

    this.checkNewStarUpgrades();
    this.renderAll();
  }

  private renderAll(): void {
    this.renderTopHud();
    this.renderLeftPanel();
    this.renderBoardAndBench();
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
      rankText.textContent = `${RANK_TIER_KOREAN_NAMES[profile.tier]} ${profile.lp} LP`;
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

    const bannerTicker = document.getElementById('banner-ticker');
    if (bannerTicker) {
      bannerTicker.textContent =
        this.game.bannerNotifications[0] ??
        '기물을 드래그하여 전장에 배치하고 [전투 시작]을 누르세요!';
    }
  }

  private renderLeftPanel(): void {
    const viewed = this.game.getViewedParticipant();

    // 1. 황금 고블린 금고 스택 표시
    const vaultStacksEl = document.getElementById('goblin-vault-stacks');
    if (vaultStacksEl) {
      vaultStacksEl.textContent = `${viewed.goblinVaultStacks} 스택`;
    }

    // 2. 활성화 시너지 목록
    const synergyListEl = document.getElementById('synergy-list');
    if (synergyListEl) {
      synergyListEl.innerHTML = '';
      const synergies = SynergyEngine.calculateActiveSynergies(viewed);

      if (synergies.length === 0) {
        synergyListEl.innerHTML = `<div style="color:#7f8c8d;font-size:11px;">보드에 기물을 배치하면 시너지가 활성화됩니다.</div>`;
      } else {
        for (const syn of synergies) {
          const chip = document.createElement('div');
          chip.className = `synergy-chip tier-${syn.styleTier}`;
          const thresholdText = syn.definition.thresholds.join('/');
          chip.innerHTML = `
            <span>${syn.definition.icon} <strong>${syn.definition.name}</strong></span>
            <span>${syn.count} <small style="color:#9aa5c4">(${thresholdText})</small></span>
          `;
          chip.addEventListener('pointerup', () => {
            const activeDesc = syn.activeEffect
              ? `<br/><span style="color:#ffd54f">현재 효과: ${syn.activeEffect.label}</span>`
              : '';
            this.showTapTooltip(
              `<strong>${syn.definition.icon} ${syn.definition.name} (${syn.count})</strong>: ${syn.definition.description}${activeDesc}`
            );
          });
          synergyListEl.appendChild(chip);
        }
      }
    }

    // 3. 보유 증강체 목록
    const augListEl = document.getElementById('augment-list');
    if (augListEl) {
      augListEl.innerHTML = '';
      if (viewed.augments.length === 0) {
        augListEl.innerHTML = `<span style="color:#7f8c8d;font-size:11px;">2-1, 3-2, 4-2 라운드에 선택</span>`;
      } else {
        for (const augId of viewed.augments) {
          const aug = AUGMENT_DEFINITIONS.find((a) => a.id === augId);
          if (!aug) continue;
          const pill = document.createElement('div');
          pill.className = 'augment-pill';
          pill.textContent = `${aug.icon} ${aug.name}`;
          pill.addEventListener('pointerup', () => {
            this.showTapTooltip(
              `<strong>${aug.icon} ${aug.name} [${aug.tier}]</strong>: ${aug.description}`
            );
          });
          augListEl.appendChild(pill);
        }
      }
    }

    // 4. 챔피언 복제기 슬롯 및 아이템 보관함
    const dupWrap = document.getElementById('duplicator-slot-wrap');
    if (dupWrap) {
      dupWrap.innerHTML = '';
      if (viewed.duplicators > 0) {
        const dupToken = document.createElement('div');
        dupToken.className = 'duplicator-token';
        dupToken.innerHTML = `<span>🧬 챔피언 복제기</span><span>x${viewed.duplicators}</span>`;
        dupToken.addEventListener('pointerdown', (e) => {
          this.startPointerInteraction(
            e,
            { kind: 'DUPLICATOR' },
            () => {
              this.showTapTooltip(
                `<strong>🧬 챔피언 복제기 (보유: ${viewed.duplicators}개)</strong>: 원하는 아군 기물 위로 드래그하여 드롭하면 공유 풀에서 즉시 1성 복사본을 뽑아 합성합니다!`
              );
            }
          );
        });
        dupWrap.appendChild(dupToken);
      }
    }

    const itemGrid = document.getElementById('item-bench-grid');
    if (itemGrid) {
      itemGrid.innerHTML = '';
      viewed.itemBench.forEach((itemId, idx) => {
        const def = ITEM_DEFINITIONS[itemId];
        if (!def) return;
        const slot = document.createElement('div');
        slot.className = `item-slot ${def.isCompleted ? 'completed-item' : ''}`;
        slot.innerHTML = `
          <span>${def.icon}</span>
          <span class="item-slot-name">${def.name}</span>
        `;
        slot.addEventListener('pointerdown', (e) => {
          this.startPointerInteraction(
            e,
            { kind: 'ITEM', itemBenchIndex: idx, itemId },
            () => {
              this.showTapTooltip(
                `<strong>${def.icon} ${def.name}</strong>: ${def.description} <span style="color:#ffd54f">(아군 기물 위로 드래그하여 장착/조합)</span>`
              );
            }
          );
        });
        itemGrid.appendChild(slot);
      });
    }
  }

  /**
   * 중앙 8x7 전장 그리드 및 하단 1x9 대기석 렌더링
   */
  private renderBoardAndBench(): void {
    const viewed = this.game.getViewedParticipant();
    const isScouting = viewed.id !== this.game.player.id;

    // 정찰 배너 업데이트
    const scoutingBanner = document.getElementById('scouting-banner');
    const scoutingText = document.getElementById('scouting-target-text');
    if (scoutingBanner && scoutingText) {
      if (isScouting) {
        const personaLabel = viewed.persona
          ? PERSONA_BADGE_LABELS[viewed.persona]
          : '';
        scoutingText.textContent = `🔍 [${viewed.name}] ${personaLabel} 보드 정찰 중 (골드: ${viewed.gold}G / 레벨: Lv.${viewed.level})`;
        scoutingBanner.classList.remove('hidden');
      } else {
        scoutingBanner.classList.add('hidden');
      }
    }

    // 배치 인원 및 상대 표시
    const deployCounter = document.getElementById('deploy-counter');
    if (deployCounter) {
      deployCounter.textContent = `배치 인원: ${viewed.getBoardUnitCount()} / ${viewed.level} (최대 Lv.${viewed.level})`;
    }
    const opponentIndicator = document.getElementById('opponent-indicator');
    if (opponentIndicator) {
      if (this.game.phase === 'COMBAT_PHASE') {
        opponentIndicator.textContent = `⚔️ 상대: ${this.game.playerCurrentOpponentName}`;
      } else {
        const roundType = this.game.getCurrentRoundType();
        opponentIndicator.textContent =
          roundType === 'CREEP'
            ? '🐺 크립 라운드'
            : roundType === 'BOSS_CREEP'
            ? '🐉 보스 크립 라운드'
            : '⚔️ 8인 대인전 라운드';
      }
    }

    // 8x7 그리드 렌더링
    const boardGrid = document.getElementById('board-grid');
    if (boardGrid) {
      boardGrid.innerHTML = '';

      const isCombatView =
        this.game.phase === 'COMBAT_PHASE' && !isScouting;

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 7; c++) {
          const tile = document.createElement('div');
          const isAllyRow = r >= 4;
          tile.className = `board-tile ${isAllyRow ? 'ally-row' : 'enemy-row'} ${
            r === 4 ? 'row-divider' : ''
          }`;

          if (isAllyRow) {
            tile.dataset.boardRow = String(r - 4);
            tile.dataset.boardCol = String(c);
          }

          if (isCombatView) {
            // 실시간 전투 중인 유닛 표시
            const combatUnit = this.game.playerCombatEngine.units.find(
              (u) =>
                u.row === r &&
                u.col === c &&
                (u.currentHp > 0 || u.isReviving)
            );
            if (combatUnit) {
              tile.appendChild(this.createCombatUnitTokenElement(combatUnit));
            }
          } else {
            // 정비 페이즈(또는 정찰 뷰): 하단 4~7행에 viewed.board[0..3][0..6] 표시
            if (isAllyRow) {
              const boardRow = r - 4;
              const unit = viewed.board[boardRow][c];
              if (unit) {
                tile.appendChild(
                  this.createPrepUnitTokenElement(unit, {
                    area: 'BOARD',
                    row: boardRow,
                    col: c,
                  })
                );
              }
            }
          }

          boardGrid.appendChild(tile);
        }
      }
    }

    // 1x9 대기석 렌더링
    const pandoraIndicator = document.getElementById('pandora-indicator');
    const hasPandora = viewed.augments.includes('AUG_PANDORA_BENCH');
    if (pandoraIndicator) {
      pandoraIndicator.classList.toggle('hidden', !hasPandora);
    }

    const benchGrid = document.getElementById('bench-grid');
    if (benchGrid) {
      benchGrid.innerHTML = '';
      for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        const isPandoraSlot = hasPandora && i >= 6;
        slot.className = `bench-slot ${isPandoraSlot ? 'pandora-slot' : ''}`;
        slot.dataset.benchIndex = String(i);

        const unit = viewed.bench[i];
        if (unit) {
          slot.appendChild(
            this.createPrepUnitTokenElement(unit, { area: 'BENCH', index: i })
          );
        }
        benchGrid.appendChild(slot);
      }
    }
  }

  private createPrepUnitTokenElement(
    unit: UnitInstance,
    loc: { area: 'BOARD'; row: number; col: number } | { area: 'BENCH'; index: number }
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = `unit-token cost-${unit.cost} star-${unit.starLevel}`;
    el.dataset.instanceId = unit.instanceId;

    const starsText = '★'.repeat(unit.starLevel);
    const itemsHtml = unit.items
      .map((id) => `<span class="mini-item-icon">${ITEM_DEFINITIONS[id]?.icon ?? ''}</span>`)
      .join('');
    const manaPct =
      unit.maxMana > 0 ? Math.round((unit.currentMana / unit.maxMana) * 100) : 0;

    el.innerHTML = `
      <div class="unit-bars">
        <div class="hp-bar-track">
          <div class="hp-bar-fill" style="width: 100%"></div>
        </div>
        <div class="mana-bar-track">
          <div class="mana-bar-fill" style="width: ${manaPct}%"></div>
        </div>
      </div>
      <div class="unit-center-row">
        <span class="unit-icon">${unit.icon}</span>
        <span class="unit-stars unit-star-${unit.starLevel}">${starsText}</span>
      </div>
      <div class="unit-bottom-row">
        <span class="unit-name-label">${unit.name}</span>
        <div class="unit-items-row">${itemsHtml}</div>
      </div>
    `;

    const payload: DragPayload =
      loc.area === 'BOARD'
        ? {
            kind: 'UNIT',
            instanceId: unit.instanceId,
            unit,
            fromArea: 'BOARD',
            fromRow: loc.row,
            fromCol: loc.col,
          }
        : {
            kind: 'UNIT',
            instanceId: unit.instanceId,
            unit,
            fromArea: 'BENCH',
            fromIndex: loc.index,
          };

    el.addEventListener('pointerdown', (e) => {
      this.startPointerInteraction(e, payload, () => {
        this.showUnitDetailTooltip(unit);
      });
    });

    return el;
  }

  private createCombatUnitTokenElement(cu: CombatUnit): HTMLElement {
    const el = document.createElement('div');
    el.className = `unit-token cost-${cu.cost} star-${cu.starLevel} ${
      cu.stunTimerMs > 0 ? 'stunned' : ''
    } ${cu.isReviving ? 'reviving' : ''}`;

    const hpPct = Math.max(0, Math.min(100, Math.round((cu.currentHp / cu.maxHp) * 100)));
    const shieldPct = Math.min(100, Math.round((cu.shield / cu.maxHp) * 100));
    const manaPct =
      cu.maxMana > 0
        ? Math.max(0, Math.min(100, Math.round((cu.currentMana / cu.maxMana) * 100)))
        : 0;
    const starsText = '★'.repeat(cu.starLevel);
    const itemsHtml = cu.items
      .map((id) => `<span class="mini-item-icon">${ITEM_DEFINITIONS[id]?.icon ?? ''}</span>`)
      .join('');

    el.innerHTML = `
      <div class="unit-bars">
        <div class="hp-bar-track">
          <div class="hp-bar-fill ${cu.team === 'AWAY' ? 'enemy' : ''}" style="width: ${hpPct}%"></div>
          ${shieldPct > 0 ? `<div class="shield-bar-fill" style="width: ${shieldPct}%"></div>` : ''}
        </div>
        <div class="mana-bar-track">
          <div class="mana-bar-fill" style="width: ${manaPct}%"></div>
        </div>
      </div>
      <div class="unit-center-row">
        <span class="unit-icon">${cu.icon}</span>
        <span class="unit-stars unit-star-${cu.starLevel}">${starsText}</span>
      </div>
      <div class="unit-bottom-row">
        <span class="unit-name-label">${cu.name}</span>
        <div class="unit-items-row">${itemsHtml}</div>
      </div>
    `;

    el.addEventListener('pointerup', () => {
      const template = UNIT_TEMPLATES[cu.unitId];
      this.showTapTooltip(
        `<strong>${cu.icon} ${cu.name} (${cu.starLevel}성)</strong> | 체력: ${cu.currentHp}/${cu.maxHp} (보호막 ${cu.shield}) | 공격력: ${cu.atk} | 방어력: ${cu.def} | 공속: ${cu.atkSpeed} | 누적 딜량: ${cu.totalDamageDealt}<br/><strong>스킬 [${template?.skill.name}]</strong>: ${template?.skill.description}`
      );
    });

    return el;
  }

  /**
   * 보드 위에 드랍된 전리품 구슬(Loot Orbs) 렌더링 및 터치 오픈 이벤트
   */
  private renderLootOrbs(): void {
    const orbLayer = document.getElementById('loot-orb-layer');
    if (!orbLayer) return;
    orbLayer.innerHTML = '';

    if (this.game.viewedParticipantId !== this.game.player.id) return;

    for (const orb of this.game.playerLootOrbs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `loot-orb-btn orb-${orb.tier}`;
      btn.style.left = `${Math.round(orb.x * 100)}%`;
      btn.style.top = `${Math.round(orb.y * 100)}%`;

      const icon =
        orb.tier === 'PRISMATIC'
          ? '💎'
          : orb.tier === 'GOLD'
          ? '🪙'
          : orb.tier === 'BLUE'
          ? '🔹'
          : '🎁';
      btn.innerHTML = `<span>${icon}</span><span>${orb.label ?? '전리품 구슬'} (터치!)</span>`;

      btn.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        const rect = this.fxCanvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        this.spawnParticleBurst(
          e.clientX,
          e.clientY,
          orb.tier === 'PRISMATIC' ? '#00e5ff' : '#ffd54f',
          36
        );
        const rewards = this.game.openPlayerLootOrb(orb.id);
        if (rewards.length > 0) {
          this.floatingTexts.push({
            x: px,
            y: py,
            vy: -45,
            text: `🎁 ${rewards.join(' + ')}`,
            color: '#ffea00',
            fontSize: 15,
            alpha: 1,
            lifeMs: 0,
            maxLifeMs: 1400,
          });
        }
      });

      orbLayer.appendChild(btn);
    }
  }

  /**
   * 우측 8인 실시간 순위표 & AI 봇 보드 정찰(Scouting) 전환
   */
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

      const streakBadge =
        p.winStreak >= 2
          ? `🔥${p.winStreak}연승`
          : p.loseStreak >= 2
          ? `❄️${p.loseStreak}연패`
          : '';
      const personaText = p.persona ? PERSONA_BADGE_LABELS[p.persona] : '👤 플레이어';
      const goblinBadge =
        p.goblinVaultStacks > 0 ? ` | 🪙금고:${p.goblinVaultStacks}` : '';

      card.innerHTML = `
        <div class="leader-top-row">
          <span>#${idx + 1} ${p.name}</span>
          <span style="color:${p.hp > 35 ? '#2ecc71' : '#ff5252'}">${
        p.isEliminated ? '💀 탈락' : `❤️ ${p.hp}`
      }</span>
        </div>
        <div class="leader-sub-row">
          <span class="persona-tag">${personaText}</span>
          <span>Lv.${p.level} · 🪙${p.gold}G ${streakBadge}${goblinBadge}</span>
        </div>
      `;

      card.addEventListener('pointerup', () => {
        this.game.viewedParticipantId = p.id;
        this.renderAll();
      });

      listEl.appendChild(card);
    });
  }

  /**
   * 하단 상점 5칸 카드(페어/2성/3성 임박 하이라이트 & 실시간 공유 풀 잔여량 표시) 및 컨트롤 바 렌더링
   */
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
      intText.textContent = `(이자 +${player.calculateInterestGold()}G / 한도 ${player.getMaxInterestCap()}G)`;
    }

    const rerollBtn = document.getElementById('reroll-btn');
    if (rerollBtn) {
      rerollBtn.textContent =
        player.freeRerolls > 0
          ? `🎟️ 무료 리롤 (${player.freeRerolls}회)`
          : `🎲 상점 리롤 (2G)`;
    }

    const lockBtn = document.getElementById('lock-shop-btn');
    if (lockBtn) {
      lockBtn.textContent = player.isShopLocked ? '🔒 상점 잠김' : '🔓 잠금 해제됨';
    }

    // 레벨별 코스트 등장 확률 표시
    const oddsBar = document.getElementById('shop-odds-bar');
    if (oddsBar) {
      const odds = SHOP_ODDS_BY_LEVEL[player.level] ?? SHOP_ODDS_BY_LEVEL[1];
      oddsBar.innerHTML = `
        <span style="color:var(--cost-1)">1코:${odds[0]}%</span>
        <span style="color:var(--cost-2)">2코:${odds[1]}%</span>
        <span style="color:var(--cost-3)">3코:${odds[2]}%</span>
        <span style="color:var(--cost-4)">4코:${odds[3]}%</span>
        <span style="color:var(--cost-5)">5코:${odds[4]}%</span>
      `;
    }

    // 전투 시작 vs 배속/스킵 버튼 전환
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

    // 상점 5칸 카드 렌더링
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
        mergeHintBadge = `<div class="shop-merge-badge">👑 구매 즉시 3성 달성!</div>`;
      } else if (ownedCopies === 2 || ownedCopies === 5) {
        mergeHintBadge = `<div class="shop-merge-badge">⚡ 구매 즉시 2성 합성!</div>`;
      } else if (ownedCopies > 0) {
        mergeHintBadge = `<div class="shop-merge-badge">✨ 보유 중 (${ownedCopies}장)</div>`;
      }

      const traitNames = template.traits
        .map((t: TraitId) => `${TRAIT_DEFINITIONS[t].icon} ${TRAIT_DEFINITIONS[t].name}`)
        .join('<br/>');

      card.innerHTML = `
        <div class="shop-card-top">
          <span>${template.icon} ${template.name}</span>
          <span class="shop-cost-tag">🪙${template.cost}</span>
        </div>
        ${mergeHintBadge}
        <div class="shop-card-traits">${traitNames}</div>
        <div class="shop-pool-footer">
          <span>공유 풀 잔여:</span>
          <strong>${remainingPool} / ${maxPool}</strong>
        </div>
      `;

      card.addEventListener('pointerup', (e) => {
        if (player.buyUnit(slotIdx, this.game.sharedPool)) {
          this.spawnParticleBurst(e.clientX, e.clientY, '#ffd54f', 18);
          this.checkNewStarUpgrades();
          this.renderAll();
        } else if (player.lastActionMessage) {
          this.game.pushBannerNotification(player.lastActionMessage);
          this.renderTopHud();
        }
      });

      shopContainer.appendChild(card);
    });
  }

  /**
   * 증강체 모달(2-1, 3-2, 4-2), 운명의 모루 모달(2-4, 3-4, 4-4), 게임오버 모달 렌더링
   */
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
              <div style="font-size:10px;color:#ffd54f;margin:4px 0;">[${aug.tier} 등급 증강체]</div>
              <div class="choice-card-desc">${aug.description}</div>
            </div>
            <div class="choice-btn-group">
              <button type="button" class="action-btn select-aug-btn" style="border-color:#ffd54f;padding:7px;">✅ 이 증강체 선택</button>
              <button type="button" class="action-btn reroll-aug-btn" ${
                !canReroll ? 'disabled style="opacity:0.4"' : ''
              }>🎲 카드 리롤 (${canReroll ? '1회 가능' : '사용됨'})</button>
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
          card.className = 'choice-card tier-GOLD';
          card.innerHTML = `
            <div>
              <div class="choice-card-title">${opt.icon} ${opt.label}</div>
              <div class="choice-card-desc" style="margin-top:6px;">${opt.description}</div>
            </div>
            <button type="button" class="action-btn" style="border-color:#ffd54f;padding:8px;">🎁 무료 획득</button>
          `;
          card.querySelector('button')?.addEventListener('pointerup', () => {
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
          <div style="font-size:20px;font-weight:900;color:#ffd54f;margin:8px 0;">
            최종 순위: #${res.placement}위!
          </div>
          <div style="font-size:14px;margin-bottom:12px;">
            ${res.summaryText}
          </div>
        `;
      } else {
        overModal.classList.add('hidden');
      }
    }
  }

  // ==========================================================================
  // 3. 실시간 공유 기물 풀 & 3성 차단 인스펙터 모달 및 랭크 설정 모달
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
        ? `<span class="locked-badge">🔒 3성 달성 차단됨 (상점 등장 불가)</span>`
        : `<span class="open-badge">정상 추첨 가능</span>`;

      tr.innerHTML = `
        <td style="color:var(--cost-${row.cost});font-weight:800;">${row.cost}코스트</td>
        <td style="font-weight:800;">${UNIT_TEMPLATES[row.unitId].icon} ${row.unitName}</td>
        <td>${row.maxCount}개</td>
        <td style="color:#80d8ff;font-weight:900;">${row.remainingInPool}개</td>
        <td>${row.ownedByAllParticipants}개</td>
        <td>${row.inShopsCount}개</td>
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
      <div style="background:#151b2e;padding:10px;border-radius:8px;border:1px solid #2b3558;">
        <div style="font-size:15px;font-weight:900;color:#ffd54f;">
          현재 티어: ${RANK_TIER_BADGE_ICONS[profile.tier]} ${RANK_TIER_KOREAN_NAMES[profile.tier]} (${profile.lp} LP)
        </div>
        <div style="font-size:12px;color:#b8c6e8;margin-top:4px;">
          전적: ${profile.gamesPlayed}전 | 1위 우승: ${profile.wins}회 | TOP 4: ${profile.top4Count}회
        </div>
        <div style="font-size:11px;color:#80d8ff;margin-top:4px;">
          현재 로비 AI 지능 지수(skillLevel): <strong>${aiParams.skillLevel}</strong> | 정찰/덱전환 확률: <strong>${Math.round(
      aiParams.scoutingChance * 100
    )}%</strong> | 4~5코 3성 견제: <strong>${
      aiParams.skillLevel >= 0.75 ? '활성화 (다이아+)' : '비활성'
    }</strong>
        </div>
      </div>
    `;

    gridEl.innerHTML = '';
    for (const tier of RANK_TIERS_ORDERED) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn';
      btn.style.padding = '8px';
      if (tier === profile.tier) {
        btn.style.borderColor = '#ffd54f';
      }
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
  // 4. 단기 탭(Tap) 상세 툴팁 및 2성/3성 달성/5코 3성 권능 VFX 연출
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
      }코스트)</strong> [${traitsStr}]<br/>체력: ${unit.maxHp} | 공격력: ${
        unit.atk
      } | 방어력: ${unit.def} | 공속: ${unit.atkSpeed} | 사거리: ${
        unit.range
      } | 마나: ${unit.startMana}/${unit.maxMana} | 장착 아이템: ${itemsStr}<br/><span style="color:#ffd54f">스킬 [${
        template.skill.name
      }]:</span> ${template.skill.description}`
    );
  }

  /**
   * 새로운 3성 기물이 합성되었는지 감지하여 황금빛 폭발 연출과 상단 배너를 출력한다.
   */
  private checkNewStarUpgrades(): void {
    for (const loc of this.game.player.getAllUnitLocations()) {
      if (
        loc.unit.starLevel === 3 &&
        !this.knownThreeStarUnits.has(loc.unit.instanceId)
      ) {
        this.knownThreeStarUnits.add(loc.unit.instanceId);
        this.triggerScreenShake();
        this.spawnParticleBurst(
          window.innerWidth * 0.5,
          window.innerHeight * 0.45,
          '#ffd700',
          60
        );
        this.game.pushBannerNotification(
          `🌟★★★ [${loc.unit.name}] 3성 달성!! 공유 풀에서 해당 기물의 내 상점 등장이 영구 잠금(BLOCKED)되었습니다!`
        );
      }
    }
  }

  public triggerScreenShake(): void {
    const appRoot = document.getElementById('app');
    if (!appRoot) return;
    appRoot.classList.remove('screen-shake');
    void appRoot.offsetWidth;
    appRoot.classList.add('screen-shake');
  }

  private processCombatEventsForVFX(events: CombatEvent[]): void {
    const w = this.fxCanvas.width;
    const h = this.fxCanvas.height;
    const cellW = w / 7;
    const cellH = h / 8;

    for (const ev of events) {
      if (ev.type === 'FIVE_COST_3STAR_CATACLYSM') {
        this.triggerScreenShake();
        if (ev.message) {
          this.game.pushBannerNotification(ev.message);
        }
        // 화면 중앙 초대형 99,999! 황금 번개 연출
        this.floatingTexts.push({
          x: w * 0.5,
          y: h * 0.45,
          vy: -25,
          text: `⚡ 99,999! 절대 권능! ⚡`,
          color: '#ffea00',
          fontSize: 26,
          alpha: 1,
          lifeMs: 0,
          maxLifeMs: 1800,
        });
        for (let i = 0; i < 7; i++) {
          this.beams.push({
            x1: (i + 0.5) * cellW,
            y1: 0,
            x2: (i + 0.5) * cellW,
            y2: h,
            color: '#ffea00',
            width: 6,
            lifeMs: 0,
            maxLifeMs: 550,
          });
        }
      } else if (
        (ev.type === 'BASIC_ATTACK' || ev.type === 'SKILL_CAST') &&
        ev.fromRow !== undefined &&
        ev.fromCol !== undefined &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined
      ) {
        const x1 = (ev.fromCol + 0.5) * cellW;
        const y1 = (ev.fromRow + 0.5) * cellH;
        const x2 = (ev.toCol + 0.5) * cellW;
        const y2 = (ev.toRow + 0.5) * cellH;
        this.beams.push({
          x1,
          y1,
          x2,
          y2,
          color: ev.type === 'SKILL_CAST' ? '#00e5ff' : '#ffd54f',
          width: ev.type === 'SKILL_CAST' ? 4 : 2,
          lifeMs: 0,
          maxLifeMs: ev.type === 'SKILL_CAST' ? 320 : 160,
        });
      } else if (
        ev.type === 'DAMAGE' &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined &&
        ev.amount !== undefined
      ) {
        const x = (ev.toCol + 0.5) * cellW + (Math.random() - 0.5) * 18;
        const y = (ev.toRow + 0.4) * cellH;
        const isCataclysmDmg = ev.amount >= 10000;
        const color = isCataclysmDmg
          ? '#ffea00'
          : ev.damageType === 'TRUE'
          ? '#ffffff'
          : ev.damageType === 'MAGICAL'
          ? '#40c4ff'
          : ev.isCrit
          ? '#ff5252'
          : '#ffab40';

        this.floatingTexts.push({
          x,
          y,
          vy: -35,
          text: `${ev.isCrit || isCataclysmDmg ? '💥' : ''}-${ev.amount}`,
          color,
          fontSize: isCataclysmDmg ? 22 : ev.isCrit ? 15 : 12,
          alpha: 1,
          lifeMs: 0,
          maxLifeMs: isCataclysmDmg ? 1300 : 750,
        });
      } else if (
        ev.type === 'HEAL' &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined &&
        ev.amount !== undefined
      ) {
        const x = (ev.toCol + 0.5) * cellW;
        const y = (ev.toRow + 0.3) * cellH;
        this.floatingTexts.push({
          x,
          y,
          vy: -30,
          text: `+${ev.amount}`,
          color: '#69f0ae',
          fontSize: 12,
          alpha: 1,
          lifeMs: 0,
          maxLifeMs: 700,
        });
      } else if (ev.type === 'GOLD_DROP' && ev.message) {
        this.game.pushBannerNotification(ev.message);
      }
    }
  }

  private spawnParticleBurst(
    clientX: number,
    clientY: number,
    color: string,
    count: number
  ): void {
    const rect = this.fxCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        color,
        alpha: 1,
        lifeMs: 0,
        maxLifeMs: 450 + Math.random() * 350,
      });
    }
  }

  private resizeCanvas(): void {
    const container = document.getElementById('battlefield-container');
    if (!container) return;
    this.fxCanvas.width = container.clientWidth || 600;
    this.fxCanvas.height = container.clientHeight || 400;
  }

  private startVFXAnimationLoop(): void {
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;
      this.updateAndDrawVFX(dt);
      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  private updateAndDrawVFX(dtMs: number): void {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);

    // 1. 투사체/스킬 광선(Beams)
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.lifeMs += dtMs;
      if (b.lifeMs >= b.maxLifeMs) {
        this.beams.splice(i, 1);
        continue;
      }
      const alpha = 1 - b.lifeMs / b.maxLifeMs;
      ctx.save();
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = b.width;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. 파티클(Particles)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifeMs += dtMs;
      if (p.lifeMs >= p.maxLifeMs) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += (p.vx * dtMs) / 1000;
      p.y += (p.vy * dtMs) / 1000;
      p.alpha = 1 - p.lifeMs / p.maxLifeMs;

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. 플로팅 데미지/회복 텍스트
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.lifeMs += dtMs;
      if (ft.lifeMs >= ft.maxLifeMs) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += (ft.vy * dtMs) / 1000;
      ft.alpha = 1 - ft.lifeMs / ft.maxLifeMs;

      ctx.save();
      ctx.font = `900 ${ft.fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = ft.alpha;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new FantasyAutoBattlerApp();
});

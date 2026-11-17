// src/FantasyAutoBattlerApp.ts

import { getCreepMonsterTemplate } from './CreepMonsterData';
import {
  AUGMENT_DEFINITIONS,
  BaseItemId,
  GAME_CONTENT_STATS,
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
import { CombatEngine } from './CombatEngine';
import { PixiVfxEngine } from './PixiVfxEngine';
import { CombatUnit } from './SkillRegistry';
import { soundFX } from './SoundFXManager';
import { SynergyEngine } from './SynergyEngine';
import { ThreeJsGameRenderer } from './ThreeJsGameRenderer';

import { DragPayload, PERSONA_BADGE_LABELS } from './app/types';
import * as pointerDrag from './app/pointerDrag';
import * as hudModals from './app/hudModals';
import * as renderBridge from './app/renderBridge';
import * as domBindings from './app/domBindings';

export class FantasyAutoBattlerApp {
  public game: GameLoopManager;
  public fxCanvas: HTMLCanvasElement;
  public pixiCanvas: HTMLCanvasElement;
  public threeCanvas: HTMLCanvasElement;
  public pixelRenderer: PixelGameRenderer;
  public pixiVfx: PixiVfxEngine;
  public threeRenderer: ThreeJsGameRenderer;
  public is3DViewMode: boolean = true;

  public lastProcessedCombatTick: number = -1;
  public lastProcessedCombatEngine: CombatEngine | null = null;
  public lastTriggeredLaserKey: string = '';
  public lastKnownPhase: string = '';
  public knownThreeStarUnits: Set<string> = new Set();

  // 가로모드 강제 회전 상태 (세로로 폰을 들고 있을 때 90도 회전 적용 여부)
  public isPortraitRotated: boolean = false;

  // 접이식 하단 상점 드로어 수동 접힘 여부
  public isShopManuallyCollapsed: boolean = false;

  // 모바일 포인터 드래그 앤 드롭 & 육각형 타일 스냅 상태
  public activePointerId: number | null = null;
  public pointerDownTime: number = 0;
  public pointerStartX: number = 0;
  public pointerStartY: number = 0;
  public isDragging: boolean = false;
  public dragPayload: DragPayload | null = null;
  public tapCallback: (() => void) | null = null;

  public hoveredHex: HexCoord | null = null;
  public hoveredBenchIndex: number | null = null;

  // 플레이어가 터치(Tap)하여 선택한 기물 인스턴스 ID (선택/드래그 중일 때만 말풍선 이름표 표시)
  public selectedUnitInstanceId: string | null = null;

  // 빈 땅 탭 완료 시에만 아바타를 이동하기 위한 후보 좌표
  public pendingAvatarMove: { px: number; py: number } | null = null;

  // 메인 로비 화면 vs 인게임 세션 진행 여부
  public isInGameSession: boolean = false;

  constructor() {
    this.fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;
    this.pixiCanvas = document.getElementById('pixi-canvas') as HTMLCanvasElement;
    this.threeCanvas = document.getElementById('three-canvas') as HTMLCanvasElement;
    this.pixelRenderer = new PixelGameRenderer(this.fxCanvas);
    this.pixiVfx = new PixiVfxEngine(this.pixiCanvas);
    this.threeRenderer = new ThreeJsGameRenderer(this.threeCanvas);
    this.threeRenderer.onModelsLoaded = () => {
      if (this.is3DViewMode) {
        this.renderShopAndControls();
      }
    };
    this.pixiVfx.init();

    // 3D 모드가 기본이므로 2D 캔버스는 완전 숨김 (화면 겹침 및 반투명 잔상 방지)
    if (this.is3DViewMode) {
      this.threeCanvas.classList.remove('hidden');
      this.threeCanvas.style.display = 'block';
      this.fxCanvas.classList.add('hidden');
      this.fxCanvas.style.display = 'none';
    } else {
      this.threeCanvas.classList.add('hidden');
      this.threeCanvas.style.display = 'none';
      this.fxCanvas.classList.remove('hidden');
      this.fxCanvas.style.display = 'block';
    }

    // 로비 화면 대기 상태로 초기화 (autoStart = false)
    this.game = new GameLoopManager(undefined, false);
    this.lastKnownPhase = this.game.phase;
    this.game.setOnStateChange(() => {
      this.onGameStateUpdated();
    });

    this.bindGlobalDOMEvents();
    this.refreshLobbyContentBadges();
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
  public clientToCanvasPoint(clientX: number, clientY: number): ScreenPoint {
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

  public tryLockNativeLandscape(): void {
    try {
      const orient = (screen as unknown as { orientation?: { lock?: (mode: string) => Promise<void> } }).orientation;
      if (orient && typeof orient.lock === 'function') {
        orient.lock('landscape').catch(() => {});
      }
    } catch {
      // 일부 모바일 브라우저는 CSS 회전 래퍼로 가로모드 유지
    }
  }

  public isShopCurrentlyExpanded(): boolean {
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



  // ==========================================================================
  // 2. 상태 업데이트 콜백 및 네이티브 모바일 HUD 렌더링
  // ==========================================================================


  // ==========================================================================
  // 3. 100% 가로모드 고정(Auto-Landscape Rotation) & 레티나(DPR) 리사이즈
  // ==========================================================================


  public enableImmersiveFullscreen(): void {
    const docEl = document.documentElement as HTMLElement & {
      requestFullscreen?: (options?: { navigationUI?: string }) => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void>;
      mozRequestFullScreen?: () => Promise<void>;
      msRequestFullscreen?: () => Promise<void>;
    };

    try {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      }
    } catch {
      // Ignore user gesture restrictions
    }
  }

  public exitFullscreen(): void {
    const doc = document as Document & {
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => Promise<void>;
      mozCancelFullScreen?: () => Promise<void>;
      msExitFullscreen?: () => Promise<void>;
    };
    try {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
        else if (doc.msExitFullscreen) doc.msExitFullscreen();
      }
    } catch {
      // Ignore
    }
  }

  public refreshLobbyContentBadges(): void {
    const aug = document.getElementById('lobby-badge-augments');
    if (aug) {
      aug.textContent = `✨ 증강 ${GAME_CONTENT_STATS.augmentCount}종 · 시너지 ${GAME_CONTENT_STATS.traitCount}종`;
    }
    const neural = document.getElementById('lobby-badge-neural');
    if (neural) {
      neural.textContent = `🧠 ONNX·인라인 신경망 봇 (${GAME_CONTENT_STATS.championCount}챔피언)`;
    }
  }

  /**
   * 메인 로비 화면에서 [게임 시작]을 눌렀을 때 부드러운 커튼 페이드 전환과 함께 게임 진입
   */
  public startNewGameFromLobby(): void {
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
  public returnToLobbyScreen(): void {
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

  public openSettingsModal(): void {
    const modal = document.getElementById('settings-modal');
    modal?.classList.remove('hidden');
  }

  public closeSettingsModal(): void {
    const modal = document.getElementById('settings-modal');
    modal?.classList.add('hidden');
  }
  public bindGlobalDOMEvents(...args: unknown[]): unknown {
    return (domBindings.bindGlobalDOMEvents as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public handleCanvasPointerDown(...args: unknown[]): unknown {
    return (pointerDrag.handleCanvasPointerDown as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public startPointerInteraction(...args: unknown[]): unknown {
    return (pointerDrag.startPointerInteraction as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public handlePointerMove(...args: unknown[]): unknown {
    return (pointerDrag.handlePointerMove as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public handlePointerUp(...args: unknown[]): unknown {
    return (pointerDrag.handlePointerUp as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public showDragGhost(...args: unknown[]): unknown {
    return (pointerDrag.showDragGhost as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public updateDragGhostPosition(...args: unknown[]): unknown {
    return (pointerDrag.updateDragGhostPosition as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public hideDragGhost(...args: unknown[]): unknown {
    return (pointerDrag.hideDragGhost as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public showSellDropzoneOverlay(...args: unknown[]): unknown {
    return (pointerDrag.showSellDropzoneOverlay as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public hideSellDropzoneOverlay(...args: unknown[]): unknown {
    return (pointerDrag.hideSellDropzoneOverlay as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public completeDropAtPoint(...args: unknown[]): unknown {
    return (pointerDrag.completeDropAtPoint as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public onGameStateUpdated(...args: unknown[]): unknown {
    return (hudModals.onGameStateUpdated as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public renderAllHUD(...args: unknown[]): unknown {
    return (hudModals.renderAllHUD as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public renderTopHud(...args: unknown[]): unknown {
    return (hudModals.renderTopHud as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public renderLeftFloatingDock(...args: unknown[]): unknown {
    return (hudModals.renderLeftFloatingDock as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public renderLootOrbs(...args: unknown[]): unknown {
    return (hudModals.renderLootOrbs as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public renderRightLeaderboard(...args: unknown[]): unknown {
    return (hudModals.renderRightLeaderboard as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public renderShopAndControls(...args: unknown[]): unknown {
    return (hudModals.renderShopAndControls as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public renderPhaseModals(...args: unknown[]): unknown {
    return (hudModals.renderPhaseModals as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public openPoolInspectorModal(...args: unknown[]): unknown {
    return (hudModals.openPoolInspectorModal as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public openRankModal(...args: unknown[]): unknown {
    return (hudModals.openRankModal as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public showTapTooltip(...args: unknown[]): unknown {
    return (hudModals.showTapTooltip as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public showUnitDetailTooltip(...args: unknown[]): unknown {
    return (hudModals.showUnitDetailTooltip as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public showCombatUnitTooltip(...args: unknown[]): unknown {
    return (hudModals.showCombatUnitTooltip as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public checkNewStarUpgrades(...args: unknown[]): unknown {
    return (hudModals.checkNewStarUpgrades as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public resizeCanvas(...args: unknown[]): unknown {
    return (renderBridge.resizeCanvas as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

  public startRenderLoop(...args: unknown[]): unknown {
    return (renderBridge.startRenderLoop as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);
  }

}

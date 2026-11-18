// src/app/domBindings.ts

import { getCreepMonsterTemplate } from '../CreepMonsterData';
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
} from '../GameData';
import { GameLoopManager } from '../GameLoopManager';
import { HexCoord, HexGridMath, ScreenPoint } from '../HexGridMath';
import { AIPersona, Participant, UnitInstance } from '../Participant';
import { PixelGameRenderer } from '../PixelGameRenderer';
import {
  RANK_TIER_BADGE_ICONS,
  RANK_TIER_KOREAN_NAMES,
  RANK_TIERS_ORDERED,
  RankTier,
} from '../RankManager';
import { CombatEngine } from '../CombatEngine';
import { PixiVfxEngine } from '../PixiVfxEngine';
import { CombatUnit } from '../SkillRegistry';
import { soundFX } from '../SoundFXManager';
import { SynergyEngine } from '../SynergyEngine';
import { ThreeJsGameRenderer } from '../ThreeJsGameRenderer';
import type { FantasyAutoBattlerApp } from '../FantasyAutoBattlerApp';
import { DragPayload, PERSONA_BADGE_LABELS } from './types';
export function bindGlobalDOMEvents(app: FantasyAutoBattlerApp): void {
    window.addEventListener(
      'pointerdown',
      () => {
        app.tryLockNativeLandscape();
        app.enableImmersiveFullscreen();
      },
      { once: true }
    );

    document
      .getElementById('view-mode-toggle-btn')
      ?.addEventListener('pointerup', () => {
        soundFX.playPickup();
        app.is3DViewMode = !app.is3DViewMode;
        const btn = document.getElementById('view-mode-toggle-btn');
        if (btn) {
          btn.textContent = app.is3DViewMode ? '🎮3D모드' : '👾2D도트';
        }
        if (app.is3DViewMode) {
          app.threeCanvas.classList.remove('hidden');
          app.threeCanvas.style.display = 'block';
          app.fxCanvas.classList.add('hidden');
          app.fxCanvas.style.display = 'none';
        } else {
          app.threeCanvas.classList.add('hidden');
          app.threeCanvas.style.display = 'none';
          app.fxCanvas.classList.remove('hidden');
          app.fxCanvas.style.display = 'block';
        }
        // 2D/3D 전환 시 상점 카드 초상화 즉시 동기화
        app.renderShopAndControls();
      });

    document
      .getElementById('map-theme-btn')
      ?.addEventListener('pointerup', () => {
        const nextTheme = app.pixelRenderer.toggleMapTheme();
        const btn = document.getElementById('map-theme-btn');
        if (btn) {
          btn.textContent = nextTheme === 'FOREST' ? '🔬연구' : '🏙️즈운';
        }
      });

    document
      .getElementById('sound-toggle-btn')
      ?.addEventListener('pointerup', () => {
        const isMuted = soundFX.toggleMute();
        const btn = document.getElementById('sound-toggle-btn');
        if (btn) {
          btn.textContent = isMuted ? '🔇' : '🔊';
        }
      });

    document
      .getElementById('fullscreen-toggle-btn')
      ?.addEventListener('pointerup', () => {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          app.enableImmersiveFullscreen();
        } else {
          app.exitFullscreen();
        }
      });

    const updateFullscreenBtn = () => {
      const isFull = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      const btn = document.getElementById('fullscreen-toggle-btn');
      if (btn) btn.textContent = isFull ? '✖' : '⛶';
    };
    document.addEventListener('fullscreenchange', updateFullscreenBtn);
    document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

    document
      .getElementById('pool-inspector-btn')
      ?.addEventListener('pointerup', () => app.openPoolInspectorModal());

    document
      .getElementById('close-inspector-btn')
      ?.addEventListener('pointerup', () =>
        document.getElementById('pool-inspector-modal')?.classList.add('hidden')
      );

    document
      .getElementById('rank-badge-btn')
      ?.addEventListener('pointerup', () => app.openRankModal());
    document
      .getElementById('close-rank-modal-btn')
      ?.addEventListener('pointerup', () =>
        document.getElementById('rank-modal')?.classList.add('hidden')
      );

    document
      .getElementById('new-game-btn')
      ?.addEventListener('pointerup', () => {
        app.knownThreeStarUnits.clear();
        app.selectedUnitInstanceId = null;
        app.isShopManuallyCollapsed = false;
        app.pixelRenderer.resetCombatJuiceStates();
        app.game.startNewGame();
      });

    // 메인 로비 화면 및 설정 모달 이벤트 바인딩
    document
      .getElementById('lobby-start-btn')
      ?.addEventListener('pointerup', () => {
        app.enableImmersiveFullscreen();
        app.startNewGameFromLobby();
      });

    document
      .getElementById('lobby-compendium-btn')
      ?.addEventListener('pointerup', () => app.openPoolInspectorModal());

    document
      .getElementById('lobby-rank-btn')
      ?.addEventListener('pointerup', () => app.openRankModal());

    document
      .getElementById('lobby-settings-btn')
      ?.addEventListener('pointerup', () => app.openSettingsModal());

    document
      .getElementById('close-settings-modal-btn')
      ?.addEventListener('pointerup', () => app.closeSettingsModal());

    document
      .getElementById('lobby-nav-btn')
      ?.addEventListener('pointerup', () => {
        if (confirm('메인 로비 화면으로 이동하시겠습니까? (현재 게임이 일시정지됩니다)')) {
          app.returnToLobbyScreen();
        }
      });

    document
      .getElementById('gameover-lobby-btn')
      ?.addEventListener('pointerup', () => app.returnToLobbyScreen());

    // 증강체 모달 최소화 (필드 확인) & 복원
    document
      .getElementById('minimize-augment-btn')
      ?.addEventListener('pointerup', () => {
        document.getElementById('augment-modal')?.classList.add('hidden');
        document.getElementById('restore-augment-bar')?.classList.remove('hidden');
      });

    document
      .getElementById('restore-augment-btn')
      ?.addEventListener('pointerup', () => {
        document.getElementById('restore-augment-bar')?.classList.add('hidden');
        document.getElementById('augment-modal')?.classList.remove('hidden');
      });

    // 환경 설정 옵션 토글 이벤트
    document.querySelectorAll('#settings-speed-options .setting-opt-btn').forEach((btn) => {
      btn.addEventListener('pointerup', (e) => {
        const target = e.currentTarget as HTMLElement;
        const speed = parseInt(target.dataset.speed || '1', 10) as 1 | 2;
        app.game.playbackSpeed = speed;
        document.querySelectorAll('#settings-speed-options .setting-opt-btn').forEach((b) => b.classList.remove('active'));
        target.classList.add('active');
        document.getElementById('speed-1x-btn')?.classList.toggle('active', app.game.playbackSpeed === 1);
        document.getElementById('speed-2x-btn')?.classList.toggle('active', app.game.playbackSpeed === 2);
      });
    });

    document.querySelectorAll('#settings-map-options .setting-opt-btn').forEach((btn) => {
      btn.addEventListener('pointerup', (e) => {
        const target = e.currentTarget as HTMLElement;
        const map = target.dataset.map;
        app.pixelRenderer.currentMapTheme = map === 'forest' ? 'FOREST' : 'CASTLE_TOWN';
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
        app.knownThreeStarUnits.clear();
        app.selectedUnitInstanceId = null;
        app.isShopManuallyCollapsed = false;
        app.pixelRenderer.resetCombatJuiceStates();
        app.game.startNewGame();
      });

    document
      .getElementById('tap-tooltip-close')
      ?.addEventListener('pointerup', () => {
        app.selectedUnitInstanceId = null;
        document.getElementById('tap-tooltip-bar')?.classList.add('hidden');
      });

    const returnHome = () => {
      if (app.game.viewedParticipantId !== app.game.player.id) {
        app.game.viewedParticipantId = app.game.player.id;
        app.renderAllHUD();
      }
    };

    document
      .getElementById('return-home-btn')
      ?.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        returnHome();
      });

    document
      .getElementById('scouting-banner')
      ?.addEventListener('pointerup', () => {
        returnHome();
      });

    window.addEventListener('keydown', (e) => {
      if (
        (e.code === 'Space' || e.key === ' ') &&
        app.game.viewedParticipantId !== app.game.player.id
      ) {
        e.preventDefault();
        returnHome();
      }
    });

    document
      .getElementById('mercenary-armory-box')
      ?.addEventListener('pointerup', () => {
        const p = app.game.getViewedParticipant();
        app.showTapTooltip(
          `<strong>🎲 용병 무기고 (${p.mercenaryArmoryLoot} 전리품)</strong><br/>패배 시 전리품이 무기고에 쌓이고, 다음 PvP 승리 시 주사위로 캐시인합니다 (Set 6 MERCENARY).`
        );
      });

    // 상점 접기 / 열기 토글 버튼
    document
      .getElementById('toggle-shop-btn')
      ?.addEventListener('pointerup', () => {
        soundFX.playPickup();
        app.isShopManuallyCollapsed = !app.isShopManuallyCollapsed;
        app.pixelRenderer.recomputeLayoutMetrics(app.isShopCurrentlyExpanded());
        app.renderShopAndControls();
      });

    document
      .getElementById('quick-open-shop-btn')
      ?.addEventListener('pointerup', () => {
        soundFX.playPickup();
        app.isShopManuallyCollapsed = false;
        app.pixelRenderer.recomputeLayoutMetrics(app.isShopCurrentlyExpanded());
        app.renderShopAndControls();
      });

    document.getElementById('buy-xp-btn')?.addEventListener('pointerup', (e) => {
      const pt = app.clientToCanvasPoint(e.clientX, e.clientY);
      if (app.game.player.buyXp(app.game.sharedPool)) {
        soundFX.playCoin(1.2);
        app.pixelRenderer.spawnPixelSparks(pt.x, pt.y, '#38bdf8', 14);
        app.renderAllHUD();
      } else if (app.game.player.lastActionMessage) {
        app.game.pushBannerNotification(app.game.player.lastActionMessage);
        app.renderTopHud();
      }
    });

    document.getElementById('reroll-btn')?.addEventListener('pointerup', (e) => {
      if (app.game.phase !== 'PREPARATION_PHASE') return;
      const pt = app.clientToCanvasPoint(e.clientX, e.clientY);
      if (app.game.player.rerollShop(app.game.sharedPool)) {
        soundFX.playReroll();
        app.pixelRenderer.spawnPixelSparks(pt.x, pt.y, '#facc15', 14);
        if (app.game.player.lastActionMessage) {
          app.game.pushBannerNotification(app.game.player.lastActionMessage);
        }
        app.renderAllHUD();
      } else if (app.game.player.lastActionMessage) {
        app.game.pushBannerNotification(app.game.player.lastActionMessage);
        app.renderTopHud();
      }
    });

    document
      .getElementById('lock-shop-btn')
      ?.addEventListener('pointerup', () => {
        soundFX.playPickup();
        app.game.player.isShopLocked = !app.game.player.isShopLocked;
        app.renderShopAndControls();
      });

    const triggerStartCombat = () => {
      if (app.game.phase !== 'PREPARATION_PHASE') return;
      soundFX.playCombatHorn();
      app.lastProcessedCombatTick = -1;
      app.selectedUnitInstanceId = null;
      app.pixelRenderer.resetCombatJuiceStates();
      app.game.startCombatPhase();
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
        app.game.setPlaybackSpeed(1);
        app.renderTopHud();
        app.renderShopAndControls();
      });
    document
      .getElementById('speed-2x-btn')
      ?.addEventListener('pointerup', () => {
        app.game.setPlaybackSpeed(2);
        app.renderTopHud();
        app.renderShopAndControls();
      });
    document
      .getElementById('skip-combat-btn')
      ?.addEventListener('pointerup', () => {
        app.game.skipCombatToResolution();
      });

    app.fxCanvas.addEventListener('pointerdown', (e) =>
      app.handleCanvasPointerDown(e)
    );
    app.threeCanvas.addEventListener('pointerdown', (e) =>
      app.handleCanvasPointerDown(e)
    );

    window.addEventListener('pointermove', (e) => app.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => app.handlePointerUp(e));
    window.addEventListener('pointercancel', (e) => app.handlePointerUp(e));
  }

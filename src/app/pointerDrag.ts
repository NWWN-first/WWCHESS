// src/app/pointerDrag.ts

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
export function handleCanvasPointerDown(app: FantasyAutoBattlerApp, e: PointerEvent): void {
    const pt = app.clientToCanvasPoint(e.clientX, e.clientY);
    const px = pt.x;
    const py = pt.y;

    const viewed = app.game.getViewedParticipant();
    const hit3D = app.is3DViewMode
      ? app.threeRenderer.screenPointTo3DTarget(px, py)
      : null;

    // 1. 전투 페이즈 중이면 가장 가까운 전투 기물 탭 선택 및 툴팁 조회
    if (app.game.phase === 'COMBAT_PHASE') {
      const viewedCombat = app.game.getViewedCombatContext();
      const combatUnits = viewedCombat ? viewedCombat.engine.units : app.game.playerCombatEngine.units;
      
      let cu: CombatUnit | undefined;
      if (hit3D && hit3D.kind === 'HEX') {
        cu = combatUnits.find(
          (u) => u.currentHp > 0 && u.row === hit3D.row && u.col === hit3D.col
        );
      } else {
        const hitHex = HexGridMath.screenPointToHex(
          px,
          py,
          app.pixelRenderer.hexMetrics,
          8,
          7,
          1.5
        );
        if (hitHex) {
          cu = combatUnits.find(
            (u) =>
              u.currentHp > 0 && u.row === hitHex.row && u.col === hitHex.col
          );
        }
      }

      if (cu) {
        app.selectedUnitInstanceId = cu.instanceId;
        app.startPointerInteraction(e, null, () => {
          app.showCombatUnitTooltip(cu!);
        });
        return;
      }
      app.selectedUnitInstanceId = null;
      document.getElementById('tap-tooltip-bar')?.classList.add('hidden');
      return;
    }

    // 2. 하단 1x9 대기석(Bench) 슬롯 히트 검사
    const benchIdx = hit3D && hit3D.kind === 'BENCH'
      ? hit3D.index
      : app.pixelRenderer.screenPointToBenchIndex(px, py);

    if (benchIdx !== null && benchIdx >= 0 && benchIdx < 9) {
      const benchUnit = viewed.bench[benchIdx];
      if (benchUnit) {
        app.selectedUnitInstanceId = benchUnit.instanceId;
        const canDrag =
          app.game.phase === 'PREPARATION_PHASE' &&
          viewed.id === app.game.player.id;
        app.startPointerInteraction(
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
            app.showUnitDetailTooltip(benchUnit);
          }
        );
        return;
      }
    }

    // 3. 육각형 전장 타일(row 0~7, col 0~6) 히트 검사
    let hexRow: number | null = null;
    let hexCol: number | null = null;

    if (hit3D && hit3D.kind === 'HEX') {
      hexRow = hit3D.row;
      hexCol = hit3D.col;
    } else {
      const hitHex = HexGridMath.screenPointToHex(
        px,
        py,
        app.pixelRenderer.hexMetrics,
        8,
        7,
        1.5
      );
      if (hitHex) {
        hexRow = hitHex.row;
        hexCol = hitHex.col;
      }
    }

    if (hexRow !== null && hexCol !== null && hexRow >= 4) {
      const boardRow = hexRow - 4;
      const boardCol = hexCol;
      const boardUnit = viewed.board[boardRow]?.[boardCol];
      if (boardUnit) {
        app.selectedUnitInstanceId = boardUnit.instanceId;
        const canDrag =
          app.game.phase === 'PREPARATION_PHASE' &&
          viewed.id === app.game.player.id;
        app.startPointerInteraction(
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
            app.showUnitDetailTooltip(boardUnit);
          }
        );
        return;
      }
    }

    // 3-B. 자석(Magnetic) 기물 감지: 손가락 터치가 중심에서 약간 빗나갔더라도 48px 이내에 기물이 있으면 즉시 픽업
    if (
      app.game.phase === 'PREPARATION_PHASE' &&
      viewed.id === app.game.player.id
    ) {
      const nearest = app.pixelRenderer.findNearestUnitInstance(
        px,
        py,
        viewed,
        48
      );
      if (nearest) {
        const targetUnit = nearest.unit;
        app.selectedUnitInstanceId = targetUnit.instanceId;

        const bIdx = viewed.bench.findIndex(
          (u) => u && u.instanceId === targetUnit.instanceId
        );
        if (bIdx !== -1) {
          app.startPointerInteraction(
            e,
            {
              kind: 'UNIT',
              instanceId: targetUnit.instanceId,
              unit: targetUnit,
              fromArea: 'BENCH',
              fromIndex: bIdx,
            },
            () => {
              app.showUnitDetailTooltip(targetUnit);
            }
          );
          return;
        }

        for (let r = 0; r < Participant.BOARD_ROWS; r++) {
          for (let c = 0; c < Participant.BOARD_COLS; c++) {
            if (viewed.board[r][c]?.instanceId === targetUnit.instanceId) {
              app.startPointerInteraction(
                e,
                {
                  kind: 'UNIT',
                  instanceId: targetUnit.instanceId,
                  unit: targetUnit,
                  fromArea: 'BOARD',
                  fromRow: r,
                  fromCol: c,
                },
                () => {
                  app.showUnitDetailTooltip(targetUnit);
                }
              );
              return;
            }
          }
        }
      }
    }

    // 4. 빈 곳 터치 시: 선택 해제 및 탭 완료(handlePointerUp) 시 이동하도록 후보 좌표만 저장
    app.selectedUnitInstanceId = null;
    document.getElementById('tap-tooltip-bar')?.classList.add('hidden');

    if (viewed.id === app.game.player.id) {
      app.pendingAvatarMove = { px, py };
    }
  }

export function startPointerInteraction(app: FantasyAutoBattlerApp, 
    e: PointerEvent,
    payload: DragPayload | null,
    onShortTap: () => void
  ): void {
    e.stopPropagation();
    const pt = app.clientToCanvasPoint(e.clientX, e.clientY);
    app.activePointerId = e.pointerId;
    app.pointerDownTime = performance.now();
    app.pointerStartX = pt.x;
    app.pointerStartY = pt.y;
    app.isDragging = false;
    app.dragPayload = payload;
    app.tapCallback = onShortTap;
    app.pendingAvatarMove = null;
  }

export function handlePointerMove(app: FantasyAutoBattlerApp, e: PointerEvent): void {
    if (app.activePointerId !== e.pointerId) return;

    const pt = app.clientToCanvasPoint(e.clientX, e.clientY);
    const dx = pt.x - app.pointerStartX;
    const dy = pt.y - app.pointerStartY;
    const dist = Math.hypot(dx, dy);

    if (!app.isDragging && dist > 8 && app.dragPayload) {
      app.pendingAvatarMove = null;
      if (
        app.game.phase === 'PREPARATION_PHASE' &&
        app.game.viewedParticipantId === app.game.player.id
      ) {
        app.isDragging = true;
        soundFX.playPickup();
        if (app.dragPayload.kind === 'UNIT') {
          app.selectedUnitInstanceId = app.dragPayload.instanceId;
          // 주의: 상점을 수동으로 접어둔 상태라면, 배치 시야를 가리지 않도록 강제로 펼치지 않음!
          app.showSellDropzoneOverlay(app.dragPayload.unit);
        }
        if (!app.is3DViewMode || app.dragPayload.kind !== 'UNIT') {
          app.showDragGhost(e.clientX, e.clientY);
        }
      }
    }

    if (app.isDragging) {
      const px = pt.x;
      const py = pt.y;
      if (!app.is3DViewMode || app.dragPayload?.kind !== 'UNIT') {
        app.updateDragGhostPosition(e.clientX, e.clientY, px, py);
      }

      if (app.is3DViewMode) {
        app.threeRenderer.updateDragPointerWorldPos(px, py);
        const hit3D = app.threeRenderer.screenPointTo3DTarget(px, py);
        if (hit3D?.kind === 'BENCH') {
          app.hoveredBenchIndex = hit3D.index;
          app.hoveredHex = null;
        } else if (hit3D?.kind === 'HEX') {
          app.hoveredBenchIndex = null;
          app.hoveredHex = { row: hit3D.row, col: hit3D.col };
        } else {
          app.hoveredBenchIndex = null;
          app.hoveredHex = null;
        }
      } else {
        app.hoveredBenchIndex = app.pixelRenderer.screenPointToBenchIndex(px, py);
        app.hoveredHex =
          app.hoveredBenchIndex === null
            ? HexGridMath.screenPointToHex(px, py, app.pixelRenderer.hexMetrics, 8, 7, 1.4)
            : null;
      }
    }
  }

export function handlePointerUp(app: FantasyAutoBattlerApp, e: PointerEvent): void {
    if (app.activePointerId !== e.pointerId) return;

    const elapsed = performance.now() - app.pointerDownTime;
    const wasDragging = app.isDragging;
    const payload = app.dragPayload;
    const tapCb = app.tapCallback;
    const avatarTarget = app.pendingAvatarMove;
    const activeHoveredHex = app.hoveredHex;
    const activeHoveredBenchIndex = app.hoveredBenchIndex;

    app.activePointerId = null;
    app.isDragging = false;
    app.dragPayload = null;
    app.tapCallback = null;
    app.pendingAvatarMove = null;
    app.hoveredHex = null;
    app.hoveredBenchIndex = null;

    app.hideDragGhost();
    app.hideSellDropzoneOverlay();

    if (!wasDragging && elapsed < 360 && tapCb) {
      tapCb();
      return;
    }

    // 드래그가 아니었고 기물을 탭한 것도 아니라면 빈 땅 탭 이동 실행!
    if (!wasDragging && avatarTarget && app.game.viewedParticipantId === app.game.player.id) {
      app.pixelRenderer.movePlayerAvatarTo(avatarTarget.px, avatarTarget.py);
      app.pixelRenderer.spawnPixelSparks(avatarTarget.px, avatarTarget.py, '#38bdf8', 12);
      return;
    }

    if (wasDragging && payload) {
      app.completeDropAtPoint(
        payload,
        e.clientX,
        e.clientY,
        activeHoveredHex,
        activeHoveredBenchIndex
      );
    }
  }

export function showDragGhost(app: FantasyAutoBattlerApp, clientX: number, clientY: number): void {
    const ghostEl = document.getElementById('drag-ghost');
    if (!ghostEl || !app.dragPayload) return;

    if (app.dragPayload.kind === 'UNIT') {
      const u = app.dragPayload.unit;
      ghostEl.innerHTML = `${u.icon} ${u.name} (${'★'.repeat(u.starLevel)})`;
    } else if (app.dragPayload.kind === 'ITEM') {
      const item = ITEM_DEFINITIONS[app.dragPayload.itemId];
      ghostEl.innerHTML = `<div class="ghost-item-title">${item.icon} ${item.name}</div>`;
    } else {
      ghostEl.innerHTML = `🌟 챔피언 복제기`;
    }

    ghostEl.style.left = `${clientX}px`;
    ghostEl.style.top = `${clientY}px`;
    ghostEl.classList.remove('hidden');
  }

export function updateDragGhostPosition(app: FantasyAutoBattlerApp, 
    clientX: number,
    clientY: number,
    px: number,
    py: number
  ): void {
    const ghostEl = document.getElementById('drag-ghost');
    if (!ghostEl) return;
    ghostEl.style.left = `${clientX}px`;
    ghostEl.style.top = `${clientY}px`;

    if (!app.dragPayload || app.dragPayload.kind !== 'ITEM') return;

    const payload = app.dragPayload;
    const itemDef = ITEM_DEFINITIONS[payload.itemId];
    if (!itemDef) return;

    // A. 대기석 다른 기본 아이템 슬롯 호버링 검사 (대기석 합성 미리보기)
    const domTarget = document.elementFromPoint(clientX, clientY);
    const targetSlotEl = domTarget?.closest('.item-slot') as HTMLElement | null;
    if (targetSlotEl && targetSlotEl.dataset.slotIndex !== undefined) {
      const targetBenchIdx = parseInt(targetSlotEl.dataset.slotIndex, 10);
      if (!isNaN(targetBenchIdx) && targetBenchIdx !== payload.itemBenchIndex) {
        const targetItemId = app.game.player.itemBench[targetBenchIdx];
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
    const nearest = app.pixelRenderer.findNearestUnitInstance(
      px,
      py,
      app.game.player,
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


export function hideDragGhost(app: FantasyAutoBattlerApp): void {
    document.getElementById('drag-ghost')?.classList.add('hidden');
  }

export function showSellDropzoneOverlay(app: FantasyAutoBattlerApp, unit: UnitInstance): void {
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

export function hideSellDropzoneOverlay(app: FantasyAutoBattlerApp): void {
    document.getElementById('sell-dropzone-overlay')?.classList.add('hidden');
  }

export function completeDropAtPoint(app: FantasyAutoBattlerApp, 
    payload: DragPayload,
    clientX: number,
    clientY: number,
    hoveredHexSnap?: { row: number; col: number } | null,
    hoveredBenchSnap?: number | null
  ): void {
    const player = app.game.player;
    const domTarget = document.elementFromPoint(clientX, clientY);
    const pt = app.clientToCanvasPoint(clientX, clientY);
    const px = pt.x;
    const py = pt.y;

    if (payload.kind === 'UNIT') {
      const isShopExpanded = app.isShopCurrentlyExpanded();
      const isSellingArea =
        domTarget?.closest('#sell-dropzone-overlay') ||
        domTarget?.closest('#shop-cards-wrapper') ||
        (isShopExpanded &&
          (domTarget?.closest('#bottom-shop-bar') ||
            py >= app.pixelRenderer.viewportHeight - 92));

      if (isSellingArea) {
        const earned = player.sellUnit(payload.instanceId, app.game.sharedPool);
        if (earned > 0) {
          soundFX.playCoin(1.15);
          app.selectedUnitInstanceId = null;
          app.pixelRenderer.spawnPixelSparks(px, py, '#facc15', 26);
          app.pixelRenderer.spawnArcadePopupText(
            px,
            py - 20,
            `+${earned}G`,
            '#ffea00',
            18
          );
          app.game.pushBannerNotification(player.lastActionMessage);
          app.renderAllHUD();
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

      let benchIdx: number | null = null;
      let targetRow: number | null = null;
      let targetCol: number | null = null;

      if (app.is3DViewMode) {
        // [초정밀 배치 보장] 손가락을 떼는 순간, 직전까지 시각적으로 하이라이트/상승해 있던 타일을 최우선 적용
        if (hoveredBenchSnap !== undefined && hoveredBenchSnap !== null) {
          benchIdx = hoveredBenchSnap;
        } else if (hoveredHexSnap && hoveredHexSnap.row >= 4) {
          targetRow = hoveredHexSnap.row - 4;
          targetCol = hoveredHexSnap.col;
        } else {
          const hit3D = app.threeRenderer.screenPointTo3DTarget(px, py);
          if (hit3D?.kind === 'BENCH') {
            benchIdx = hit3D.index;
          } else if (hit3D?.kind === 'HEX' && hit3D.row >= 4) {
            targetRow = hit3D.row - 4;
            targetCol = hit3D.col;
          }
        }
      } else {
        benchIdx = app.pixelRenderer.screenPointToBenchIndex(px, py);
        if (benchIdx === null) {
          let hitHex = HexGridMath.screenPointToHex(
            px,
            py,
            app.pixelRenderer.hexMetrics,
            8,
            7,
            1.5
          );
          if (!hitHex || hitHex.row < 4) {
            const m = app.pixelRenderer.hexMetrics;
            if (py >= m.originY + 3.0 * m.rowStepY && py <= m.boardBottomY + 25) {
              hitHex = HexGridMath.screenPointToHex(px, py, m, 8, 7, 2.2);
            }
          }
          if (hitHex && hitHex.row >= 4) {
            targetRow = hitHex.row - 4;
            targetCol = hitHex.col;
          }
        }
      }

      if (benchIdx !== null) {
        player.moveUnit(fromLoc, { area: 'BENCH', index: benchIdx });
        soundFX.playPlaceThud();
        app.pixiVfx.triggerPlacementShockwave(px, py, 0x38bdf8);
        app.pixelRenderer.spawnPixelSparks(px, py, '#38bdf8', 10);
        app.renderAllHUD();
        return;
      }

      if (targetRow !== null && targetCol !== null) {
        if (
          player.moveUnit(fromLoc, {
            area: 'BOARD',
            row: targetRow,
            col: targetCol,
          })
        ) {
          soundFX.playPlaceThud();
          app.pixiVfx.triggerPlacementShockwave(px, py, 0x4cc9f0);
          app.pixelRenderer.spawnPixelSparks(px, py, '#4cc9f0', 14);
        } else if (player.lastActionMessage) {
          app.game.pushBannerNotification(player.lastActionMessage);
        }
        app.renderAllHUD();
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
            app.pixelRenderer.spawnPixelSparks(px, py, '#facc15', 28);
            app.pixelRenderer.spawnArcadePopupText(
              px,
              py - 20,
              '조합 완료!',
              '#ffea00',
              16
            );
            app.game.pushBannerNotification(player.lastActionMessage);
            app.renderAllHUD();
            return;
          }
        }
      }
    }

    // 2) 기물 탐색 (자석 스냅: 3D 모드 타일 및 터치 지점 반경 70px 이내 가장 가까운 기물 자동 인식)
    let targetInstanceId: string | undefined;
    let targetCenter = { x: px, y: py };

    if (app.is3DViewMode) {
      if (hoveredBenchSnap !== undefined && hoveredBenchSnap !== null) {
        targetInstanceId = player.bench[hoveredBenchSnap]?.instanceId;
      } else if (hoveredHexSnap && hoveredHexSnap.row >= 4) {
        targetInstanceId = player.board[hoveredHexSnap.row - 4]?.[hoveredHexSnap.col]?.instanceId;
      } else {
        const hit3D = app.threeRenderer.screenPointTo3DTarget(px, py);
        if (hit3D?.kind === 'BENCH') {
          targetInstanceId = player.bench[hit3D.index]?.instanceId;
        } else if (hit3D?.kind === 'HEX' && hit3D.row >= 4) {
          targetInstanceId = player.board[hit3D.row - 4]?.[hit3D.col]?.instanceId;
        }
      }
    }

    if (!targetInstanceId) {
      const nearest = app.pixelRenderer.findNearestUnitInstance(px, py, player, 70);
      if (nearest) {
        targetInstanceId = nearest.unit.instanceId;
        targetCenter = nearest.center;
      } else {
        // 보조 백업: 대기석 슬롯 또는 육각형 타일 직접 판정
        const benchIdx = app.pixelRenderer.screenPointToBenchIndex(px, py);
        if (benchIdx !== null) {
          targetInstanceId = player.bench[benchIdx]?.instanceId;
        } else {
          const hitHex = HexGridMath.screenPointToHex(
            px,
            py,
            app.pixelRenderer.hexMetrics
          );
          if (hitHex && hitHex.row >= 4) {
            targetInstanceId =
              player.board[hitHex.row - 4]?.[hitHex.col]?.instanceId;
          }
        }
      }
    }

    if (!targetInstanceId) return;

    if (payload.kind === 'ITEM') {
      if (player.equipItemToUnit(payload.itemBenchIndex, targetInstanceId)) {
        app.pixelRenderer.spawnPixelSparks(
          targetCenter.x,
          targetCenter.y,
          '#00f5d4',
          24
        );
        app.game.pushBannerNotification(player.lastActionMessage);
        app.renderAllHUD();
      } else if (player.lastActionMessage) {
        app.game.pushBannerNotification(player.lastActionMessage);
        app.renderTopHud();
      }
    } else if (payload.kind === 'DUPLICATOR') {
      if (player.useChampionDuplicator(targetInstanceId, app.game.sharedPool)) {
        app.pixelRenderer.spawnPixelSparks(
          targetCenter.x,
          targetCenter.y,
          '#ffea00',
          34
        );
        app.checkNewStarUpgrades();
        app.game.pushBannerNotification(player.lastActionMessage);
        app.renderAllHUD();
      } else if (player.lastActionMessage) {
        app.game.pushBannerNotification(player.lastActionMessage);
        app.renderTopHud();
      }
    }
  }

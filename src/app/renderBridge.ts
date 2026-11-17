// src/app/renderBridge.ts

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
export function resizeCanvas(app: FantasyAutoBattlerApp): void {
    const rawW = window.innerWidth || 800;
    const rawH = window.innerHeight || 600;
    const dpr = window.devicePixelRatio || 1;
    const appEl = document.getElementById('app');

    // 폰이 세로(rawH > rawW)로 들려 있으면 자동으로 #app을 90도 회전해 100% 가로모드로 고정
    if (rawH > rawW) {
      app.isPortraitRotated = true;
      appEl?.classList.add('force-landscape-rotated');
      app.pixelRenderer.resizeViewport(
        rawH,
        rawW,
        dpr,
        app.isShopCurrentlyExpanded()
      );
      app.pixiVfx.resize(rawH, rawW, dpr);
      app.threeRenderer.resize(rawH, rawW);
    } else {
      app.isPortraitRotated = false;
      appEl?.classList.remove('force-landscape-rotated');
      app.pixelRenderer.resizeViewport(
        rawW,
        rawH,
        dpr,
        app.isShopCurrentlyExpanded()
      );
      app.pixiVfx.resize(rawW, rawH, dpr);
      app.threeRenderer.resize(rawW, rawH);
    }
  }

export function startRenderLoop(app: FantasyAutoBattlerApp): void {
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      app.pixiVfx.update(dt);

      const viewed = app.game.getViewedParticipant();
      const isCombatPhase =
        app.game.phase === 'COMBAT_PHASE' ||
        app.game.phase === 'RESOLUTION_PHASE';
      const viewedCombat = isCombatPhase
        ? app.game.getViewedCombatContext()
        : null;
      const inCombat = viewedCombat !== null;

      const activeSelectedOrDraggedId =
        app.isDragging && app.dragPayload?.kind === 'UNIT'
          ? app.dragPayload.instanceId
          : app.selectedUnitInstanceId;

      if (app.is3DViewMode) {
        app.threeRenderer.renderFrame(dt, {
          inCombat,
          viewedParticipant: viewedCombat
            ? viewedCombat.viewedParticipant
            : viewed,
          combatUnits: viewedCombat ? viewedCombat.engine.units : [],
          hoveredHex: app.hoveredHex,
          hoveredBenchIndex: app.hoveredBenchIndex,
          isDraggingUnit: app.isDragging && app.dragPayload?.kind === 'UNIT',
          draggedInstanceId:
            app.isDragging && app.dragPayload?.kind === 'UNIT'
              ? app.dragPayload.instanceId
              : null,
          selectedInstanceId: activeSelectedOrDraggedId,
          hasPandoraBench: viewed.augments.includes('AUG_PANDORA_BENCH'),
          opponentName: viewedCombat
            ? viewedCombat.opponentName
            : app.game.playerCurrentOpponentName,
          isCreepMatch: viewedCombat
            ? viewedCombat.isCreepMatch
            : app.game.getCurrentRoundType() !== 'PVP',
        });
      } else {
        app.pixelRenderer.renderFrame(dt, {
        inCombat,
        viewedParticipant: viewedCombat
          ? viewedCombat.viewedParticipant
          : viewed,
        combatUnits: viewedCombat ? viewedCombat.engine.units : [],
        hoveredHex: app.hoveredHex,
        hoveredBenchIndex: app.hoveredBenchIndex,
        isDraggingUnit: app.isDragging && app.dragPayload?.kind === 'UNIT',
        draggedInstanceId:
          app.isDragging && app.dragPayload?.kind === 'UNIT'
            ? app.dragPayload.instanceId
            : null,
        selectedInstanceId: activeSelectedOrDraggedId,
        hasPandoraBench: viewed.augments.includes('AUG_PANDORA_BENCH'),
        opponentName: viewedCombat
          ? viewedCombat.opponentName
          : app.game.playerCurrentOpponentName,
        isCreepMatch: viewedCombat
          ? viewedCombat.isCreepMatch
          : app.game.getCurrentRoundType() !== 'PVP',
      });
    }

      // 내 아바타가 전장을 이동하다가 ? / ! 미스터리 상자와 접촉(거리 36px 이내)하면 상자 폭발 & 획득!
      if (
        viewed.id === app.game.player.id &&
        app.game.playerLootOrbs.length > 0
      ) {
        const avatarPos = app.pixelRenderer.getPlayerAvatarCurrentPos();
        for (const orb of [...app.game.playerLootOrbs]) {
          const orbX = Math.round(
            app.pixelRenderer.viewportWidth * (0.22 + orb.x * 0.54)
          );
          const orbY = Math.round(
            app.pixelRenderer.viewportHeight * (0.22 + orb.y * 0.36)
          );
          const dist = Math.hypot(avatarPos.x - orbX, avatarPos.y - orbY);

          if (dist <= 40) {
            soundFX.playCoin(1.4);
            app.pixiVfx.triggerPlacementShockwave(orbX, orbY, 0xffea00);
            app.pixelRenderer.triggerImpactShake(6, 180, 0);
            app.pixelRenderer.spawnPixelSparks(
              orbX,
              orbY,
              orb.tier === 'PRISMATIC'
                ? '#f472b6'
                : orb.tier === 'GOLD'
                ? '#ffea00'
                : '#38bdf8',
              38
            );
            const rewards = app.game.openPlayerLootOrb(orb.id);
            if (rewards.length > 0) {
              app.pixelRenderer.spawnArcadePopupText(
                orbX,
                orbY - 20,
                `🎉 ${rewards.join(' + ')}`,
                orb.tier === 'PRISMATIC' ? '#f472b6' : '#ffea00',
                16
              );
            }
            app.renderLootOrbs();
          }
        }
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

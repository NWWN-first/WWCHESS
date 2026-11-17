// src/app/hudModals.ts

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
export function onGameStateUpdated(app: FantasyAutoBattlerApp): void {
    // 새 정비 페이즈 진입 시 상점 자동 펼침 & 전투 진입 시 상점 자동 접힘
    if (app.game.phase !== app.lastKnownPhase) {
      if (app.game.phase === 'COMBAT_PHASE') {
        soundFX.playCombatHorn();
      } else if (app.game.phase === 'RESOLUTION_PHASE') {
        soundFX.playFanfare(false);
      } else if (app.game.phase === 'PREPARATION_PHASE') {
        app.isShopManuallyCollapsed = false;
      }
      app.lastKnownPhase = app.game.phase;
      app.pixelRenderer.recomputeLayoutMetrics(app.isShopCurrentlyExpanded());
    }

    if (app.game.phase === 'COMBAT_PHASE') {
      const combatCtx = app.game.getViewedCombatContext();
      const engine = combatCtx?.engine ?? app.game.playerCombatEngine;
      if (app.lastProcessedCombatEngine !== engine) {
        app.lastProcessedCombatEngine = engine;
        app.lastProcessedCombatTick = -1;
      }
      if (engine.currentTick === 0) {
        const initEvs = engine.consumeInitialEvents();
        app.pixelRenderer.ingestCombatEvents(initEvs, engine.units);
        app.threeRenderer.ingestCombatEvents(initEvs, engine.units);
      } else if (engine.currentTick !== app.lastProcessedCombatTick) {
        app.lastProcessedCombatTick = engine.currentTick;
        const tickEvs = engine.getLastTickEvents();
        app.pixelRenderer.ingestCombatEvents(tickEvs, engine.units);
        app.threeRenderer.ingestCombatEvents(tickEvs, engine.units);
      }
    } else {
      app.lastProcessedCombatEngine = null;
    }

    // 전투 종료 직후 승자 아바타 -> 패자 아바타 피니시 레이저 연출 발동
    if (app.game.activeFinisherLaser) {
      const laserKey = `${app.game.stage}-${app.game.roundInStage}-${app.game.activeFinisherLaser.winnerSide}-${app.game.activeFinisherLaser.damage}`;
      if (app.lastTriggeredLaserKey !== laserKey) {
        app.lastTriggeredLaserKey = laserKey;
        app.pixelRenderer.triggerAvatarFinisherLaser(app.game.activeFinisherLaser);
      }
    }

    app.checkNewStarUpgrades();
    app.renderAllHUD();
  }

export function renderAllHUD(app: FantasyAutoBattlerApp): void {
    app.renderTopHud();
    app.renderLeftFloatingDock();
    app.renderLootOrbs();
    app.renderRightLeaderboard();
    app.renderShopAndControls();
    app.renderPhaseModals();
  }

export function renderTopHud(app: FantasyAutoBattlerApp): void {
    const profile = app.game.rankManager.getProfile();
    const rankIcon = document.getElementById('rank-icon');
    const rankText = document.getElementById('rank-text');
    if (rankIcon && rankText) {
      rankIcon.textContent = RANK_TIER_BADGE_ICONS[profile.tier];
      rankText.textContent = `${RANK_TIER_KOREAN_NAMES[profile.tier]} ${profile.lp}LP`;
    }

    const roundLabel = document.getElementById('round-label');
    const phaseLabel = document.getElementById('phase-label');
    if (roundLabel && phaseLabel) {
      roundLabel.textContent = app.game.getRoundLabel();
      const phaseNames: Record<string, string> = {
        AUGMENT_PHASE: '증강체',
        ANVIL_PHASE: '모루',
        PREPARATION_PHASE: '정비',
        COMBAT_PHASE: '전투',
        RESOLUTION_PHASE: '정산',
        GAME_OVER_PHASE: '종료',
      };
      phaseLabel.textContent = phaseNames[app.game.phase] ?? app.game.phase;
    }

    // TFT 순정 실시간 정비 카운트다운 타이머 & 5초 이하 긴박 붉은 맥동(Pulse)
    const timerPill = document.getElementById('prep-timer-pill');
    const timerText = document.getElementById('prep-timer-text');
    const timerFill = document.getElementById('prep-timer-fill');
    const centerBanner = document.getElementById('hud-center-banner');
    const urgentVignette = document.getElementById('urgent-vignette-overlay');

    const isPrep = app.game.phase === 'PREPARATION_PHASE';
    const isUrgentFiveSec =
      isPrep && app.game.prepRemainingSec <= 5 && app.game.prepRemainingSec > 0;

    if (timerPill && timerText && timerFill) {
      if (isPrep) {
        timerPill.classList.remove('hidden');
        timerText.textContent = `⏱️${app.game.prepRemainingSec}s`;
        const pct =
          app.game.prepTotalSec > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  Math.round(
                    (app.game.prepRemainingSec / app.game.prepTotalSec) * 100
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

    const viewed = app.game.getViewedParticipant();
    const deployCounter = document.getElementById('deploy-counter');
    if (deployCounter) {
      deployCounter.textContent = `⚔️ ${viewed.getBoardUnitCount()}/${viewed.level}`;
    }

    const oppIndicator = document.getElementById('opponent-indicator');
    if (oppIndicator) {
      if (
        app.game.phase === 'COMBAT_PHASE' ||
        app.game.phase === 'RESOLUTION_PHASE'
      ) {
        oppIndicator.textContent = `VS ${app.game.playerCurrentOpponentName}`;
      } else {
        const rType = app.game.getCurrentRoundType();
        oppIndicator.textContent =
          rType === 'CREEP'
            ? '크립전'
            : rType === 'BOSS_CREEP'
            ? '보스전'
            : '대인전';
      }
    }

    const ticker = document.getElementById('banner-ticker');
    if (ticker && app.game.bannerNotifications.length > 0) {
      ticker.textContent = app.game.bannerNotifications[0];
    }

    // 배속 버튼 상시 활성화 표시 & 전투 중 스킵 버튼 노출
    const inCombat = app.game.phase === 'COMBAT_PHASE';
    document
      .getElementById('speed-1x-btn')
      ?.classList.toggle('active', app.game.playbackSpeed === 1);
    document
      .getElementById('speed-2x-btn')
      ?.classList.toggle('active', app.game.playbackSpeed === 2);
    document
      .getElementById('skip-combat-btn')
      ?.classList.toggle('hidden', !inCombat);

    const scoutBanner = document.getElementById('scouting-banner');
    const scoutText = document.getElementById('scouting-target-text');
    if (scoutBanner && scoutText) {
      if (viewed.id !== app.game.player.id) {
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

export function renderLeftFloatingDock(app: FantasyAutoBattlerApp): void {
    const viewed = app.game.getViewedParticipant();

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
          app.showTapTooltip(
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
          app.showTapTooltip(
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
          app.startPointerInteraction(
            e,
            viewed.id === app.game.player.id ? { kind: 'DUPLICATOR' } : null,
            () => {
              app.showTapTooltip(
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
          app.startPointerInteraction(
            e,
            viewed.id === app.game.player.id
              ? { kind: 'ITEM', itemBenchIndex: idx, itemId }
              : null,
            () => {
              app.showTapTooltip(
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
export function renderLootOrbs(app: FantasyAutoBattlerApp): void {
    const orbLayer = document.getElementById('loot-orb-layer');
    if (!orbLayer) return;
    orbLayer.innerHTML = '';

    if (app.game.viewedParticipantId !== app.game.player.id) return;

    for (const orb of app.game.playerLootOrbs) {
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
          app.pixelRenderer.viewportWidth * (0.22 + orb.x * 0.54)
        );
        const orbCanvasY = Math.round(
          app.pixelRenderer.viewportHeight * (0.22 + orb.y * 0.36)
        );
        app.pixelRenderer.movePlayerAvatarTo(orbCanvasX, orbCanvasY);
      });

      orbLayer.appendChild(btn);
    }
  }

export function renderRightLeaderboard(app: FantasyAutoBattlerApp): void {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const dockEl = document.querySelector('.right-player-dock');
    if (dockEl) {
      dockEl.classList.toggle('shop-collapsed', !app.isShopCurrentlyExpanded());
    }

    const sorted = [...app.game.participants].sort((a, b) => {
      if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
      return b.hp - a.hp;
    });

    const isScouting = app.game.viewedParticipantId !== app.game.player.id;

    sorted.forEach((p, idx) => {
      const isPlayer = !p.isAI;
      const isViewed = p.id === app.game.viewedParticipantId;
      const needsReturn = isPlayer && isScouting;

      const card = document.createElement('div');
      card.className = `leader-card ${isPlayer ? 'is-player' : ''} ${
        isViewed ? 'is-viewed' : ''
      } ${needsReturn ? 'needs-return' : ''} ${p.isEliminated ? 'eliminated' : ''}`;

      const hpPct = Math.max(
        0,
        Math.min(100, Math.round((p.hp / p.maxHp) * 100))
      );
      const nameLabel = isPlayer
        ? (needsReturn ? '🏠내전장' : '나')
        : p.name.slice(0, 3);

      card.innerHTML = `
        <div class="leader-top-row">
          <span>#${idx + 1} ${nameLabel}</span>
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
        app.game.viewedParticipantId = p.id;
        app.renderAllHUD();
      });

      listEl.appendChild(card);
    });
  }

  /**
   * 슬림 접이식 상점 드로어 & 2.6배 확대 클로즈업 도트 아바타 카드 렌더링
   */
export function renderShopAndControls(app: FantasyAutoBattlerApp): void {
    const player = app.game.player;
    const inCombat =
      app.game.phase === 'COMBAT_PHASE' ||
      app.game.phase === 'RESOLUTION_PHASE';
    const isExpanded = app.isShopCurrentlyExpanded();

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
      if (app.game.phase === 'PREPARATION_PHASE') {
        quickCombatBtn.textContent = `⏱️ ${app.game.prepRemainingSec}s (출격)`;
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
      if (app.game.phase === 'PREPARATION_PHASE') {
        const isUrgent = app.game.prepRemainingSec <= 5;
        startCombatBtn.classList.toggle('urgent-pulse', isUrgent);
        startCombatBtn.innerHTML = `
          <span class="sword-emblem" style="font-size:15px;">⏱️${app.game.prepRemainingSec}s</span>
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
      const remainingPool = app.game.sharedPool.getRemainingCount(unitId);

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

      const nameTokens = template.name.trim().split(' ');
      const coreName = nameTokens[nameTokens.length - 1];
      const prefix = nameTokens.length > 1 ? nameTokens.slice(0, -1).join(' ') : '';

      card.innerHTML = `
        <div class="shop-card-top cost-header-${template.cost}">
          <div class="shop-unit-name-box" title="${template.name}">
            ${prefix ? `<span class="shop-unit-prefix">${prefix}</span>` : ''}
            <span class="shop-unit-name">${coreName}</span>
          </div>
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
        if (app.is3DViewMode) {
          app.threeRenderer.renderShopCardPortrait3D(
            portraitCanvas,
            unitId,
            template.cost,
            canUpgrade
          );
        } else {
          app.pixelRenderer.renderShopCardPortrait(
            portraitCanvas,
            unitId,
            template.cost,
            canUpgrade
          );
        }
      }

      card.addEventListener('pointerup', (e) => {
        const pt = app.clientToCanvasPoint(e.clientX, e.clientY);
        if (player.buyUnit(slotIdx, app.game.sharedPool)) {
          soundFX.playCoin(1.0);
          app.pixelRenderer.spawnPixelSparks(pt.x, pt.y, '#fde047', 22);
          app.checkNewStarUpgrades();
          app.renderAllHUD();
        } else if (player.lastActionMessage) {
          app.game.pushBannerNotification(player.lastActionMessage);
          app.renderTopHud();
        }
      });

      shopContainer.appendChild(card);
    });
  }

export function renderPhaseModals(app: FantasyAutoBattlerApp): void {
    const augModal = document.getElementById('augment-modal');
    const augRow = document.getElementById('augment-cards-row');
    const restoreAugBar = document.getElementById('restore-augment-bar');

    if (augModal && augRow) {
      if (app.game.phase === 'AUGMENT_PHASE') {
        if (!restoreAugBar || restoreAugBar.classList.contains('hidden')) {
          augModal.classList.remove('hidden');
        }
        augRow.innerHTML = '';

        app.game.playerAugmentChoices.forEach((aug, idx) => {
          const card = document.createElement('div');
          card.className = `augment-card tier-${aug.tier}`;
          const canReroll = !app.game.augmentCardRerolled[idx as 0 | 1 | 2];
          const tierLabel =
            aug.tier === 'PRISMATIC'
              ? '💎 프리즘 증강체'
              : aug.tier === 'GOLD'
              ? '🥇 골드 증강체'
              : '🥈 실버 증강체';

          card.innerHTML = `
            <div>
              <div class="aug-tier-ribbon">${tierLabel}</div>
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
              restoreAugBar?.classList.add('hidden');
              soundFX.playAugmentSelect();
              app.pixiVfx.triggerSkillExplosion(window.innerWidth * 0.5, window.innerHeight * 0.5, 0x818cf8);
              app.game.selectPlayerAugment(idx);
            });
          card
            .querySelector('.reroll-aug-btn')
            ?.addEventListener('pointerup', () => {
              app.game.rerollPlayerAugmentCard(idx as 0 | 1 | 2);
            });

          augRow.appendChild(card);
        });
      } else {
        augModal.classList.add('hidden');
        restoreAugBar?.classList.add('hidden');
      }
    }

    const anvilModal = document.getElementById('anvil-modal');
    const anvilRow = document.getElementById('anvil-cards-row');
    if (anvilModal && anvilRow) {
      if (app.game.phase === 'ANVIL_PHASE') {
        anvilModal.classList.remove('hidden');
        anvilRow.innerHTML = '';

        app.game.playerAnvilChoices.forEach((opt, idx) => {
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
              app.game.selectPlayerAnvilOption(idx);
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
        app.game.phase === 'GAME_OVER_PHASE' &&
        app.game.rankSettlementResult
      ) {
        overModal.classList.remove('hidden');
        const res = app.game.rankSettlementResult;
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

export function openPoolInspectorModal(app: FantasyAutoBattlerApp): void {
    const modal = document.getElementById('pool-inspector-modal');
    const tbody = document.getElementById('pool-inspector-tbody');
    if (!modal || !tbody) return;

    const rows = app.game.sharedPool.getPoolInspectionData(
      app.game.player,
      app.game.participants
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

export function openRankModal(app: FantasyAutoBattlerApp): void {
    const modal = document.getElementById('rank-modal');
    const summaryEl = document.getElementById('rank-profile-summary');
    const gridEl = document.getElementById('tier-selector-grid');
    if (!modal || !summaryEl || !gridEl) return;

    const profile = app.game.rankManager.getProfile();
    const aiParams = app.game.rankManager.getAISkillParameters();

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
        app.game.rankManager.setTierForTesting(tier as RankTier, 50);
        app.openRankModal();
        app.renderTopHud();
      });
      gridEl.appendChild(btn);
    }

    modal.classList.remove('hidden');
  }

export function showTapTooltip(app: FantasyAutoBattlerApp, html: string): void {
    const bar = document.getElementById('tap-tooltip-bar');
    const content = document.getElementById('tap-tooltip-content');
    if (!bar || !content) return;
    content.innerHTML = html;
    bar.classList.remove('hidden');
  }

export function showUnitDetailTooltip(app: FantasyAutoBattlerApp, unit: UnitInstance): void {
    const template = UNIT_TEMPLATES[unit.unitId];
    const traitsStr = unit.traits
      .map((t) => `${TRAIT_DEFINITIONS[t].icon}${TRAIT_DEFINITIONS[t].name}`)
      .join(', ');
    const itemsStr =
      unit.items.length > 0
        ? unit.items.map((i) => ITEM_DEFINITIONS[i]?.name).join(', ')
        : '없음';

    const portrait3d = app.is3DViewMode
      ? app.threeRenderer.getChampion3DPortraitDataUrl(unit.unitId, unit.cost)
      : null;
    const thumbHtml = portrait3d
      ? `<img src="${portrait3d}" style="width:40px;height:32px;object-fit:cover;border-radius:4px;border:1px solid #38bdf8;float:left;margin-right:8px;background:#090d16;" />`
      : '';

    app.showTapTooltip(
      `${thumbHtml}<strong>${unit.icon} ${unit.name} (${'★'.repeat(unit.starLevel)} · ${
        unit.cost
      }코)</strong> [${traitsStr}]<br/>HP ${unit.maxHp} · 공격 ${
        unit.atk
      } · 방어 ${unit.def} · 사거리 ${unit.range}칸 · 아이템: ${itemsStr}<br/><span style="color:#fde047">[${
        template.skill.name
      }]:</span> ${template.skill.description}`
    );
  }

export function showCombatUnitTooltip(app: FantasyAutoBattlerApp, cu: CombatUnit): void {
    const template =
      UNIT_TEMPLATES[cu.unitId] ?? getCreepMonsterTemplate(cu.unitId);
    const skillName = template?.skill.name ?? '야생 본능';
    const skillDesc = template?.skill.description ?? '야생 몬스터의 특수 공격을 수행합니다.';

    const portrait3d = app.is3DViewMode && UNIT_TEMPLATES[cu.unitId]
      ? app.threeRenderer.getChampion3DPortraitDataUrl(cu.unitId, cu.cost)
      : null;
    const thumbHtml = portrait3d
      ? `<img src="${portrait3d}" style="width:40px;height:32px;object-fit:cover;border-radius:4px;border:1px solid #38bdf8;float:left;margin-right:8px;background:#090d16;" />`
      : '';

    app.showTapTooltip(
      `${thumbHtml}<strong>${cu.icon} ${cu.name} (${cu.starLevel}성)</strong> | HP ${cu.currentHp}/${cu.maxHp} · 공격 ${cu.atk} · 딜량 ${cu.totalDamageDealt}<br/><span style="color:#fde047">[${skillName}]:</span> ${skillDesc}`
    );
  }

export function checkNewStarUpgrades(app: FantasyAutoBattlerApp): void {
    for (const loc of app.game.player.getAllUnitLocations()) {
      if (
        loc.unit.starLevel === 3 &&
        !app.knownThreeStarUnits.has(loc.unit.instanceId)
      ) {
        app.knownThreeStarUnits.add(loc.unit.instanceId);
        soundFX.playFanfare(true);
        app.pixelRenderer.triggerImpactShake(11, 380, 50);
        const cx = app.pixelRenderer.viewportWidth * 0.5;
        const cy = app.pixelRenderer.viewportHeight * 0.45;
        app.pixiVfx.triggerSkillExplosion(cx, cy, 0xffea00);
        app.pixelRenderer.spawnPixelSparks(cx, cy, '#ffea00', 55);
        app.pixelRenderer.spawnArcadePopupText(
          cx,
          cy - 20,
          `★★★ ${loc.unit.name} 3성 진화!`,
          '#ffea00',
          20
        );
        app.game.pushBannerNotification(
          `🌟★★★ [${loc.unit.name}] 3성 달성! (상점 영구 차단됨)`
        );
      }
    }
  }

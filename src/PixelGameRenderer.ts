// src/PixelGameRenderer.ts

import { CostTier, ITEM_DEFINITIONS, ItemId, StarLevel, UNIT_TEMPLATES } from './GameData';
import { HexBoardViewportMetrics, HexCoord, HexGridMath } from './HexGridMath';
import { Participant, UnitInstance } from './Participant';
import { CombatEvent, CombatUnit } from './SkillRegistry';

/**
 * 20종 판타지 챔피언 전용 24x24 ~ 32x32 도트 스프라이트 아키타입 및 컬러 팔레트
 */
export type WeaponKind =
  | 'GREATSWORD'
  | 'SWORD_SHIELD'
  | 'DUAL_DAGGERS'
  | 'BOW'
  | 'ARCANE_STAFF'
  | 'NATURE_STAFF'
  | 'SCYTHE'
  | 'DRAGON_CLAW'
  | 'SPEAR'
  | 'CANNON_BAG'
  | 'HOLY_BLADE'
  | 'ARCHMAGE_ORB';

export type HeadgearKind =
  | 'KNIGHT_HELM'
  | 'CROWN'
  | 'HOOD'
  | 'ELVEN_CIRCLET'
  | 'SKULL'
  | 'WIZARD_HAT'
  | 'DEMON_HORNS'
  | 'DRAGON_HORNS'
  | 'HALO_HELM'
  | 'GOBLIN_EARS'
  | 'GOLEM_CORE';

export type WingKind = 'NONE' | 'ANGEL_WINGS' | 'DRAGON_WINGS' | 'DEMON_WINGS' | 'CAPE';

export interface UnitPixelArtSpec {
  primaryArmor: string;
  secondaryArmor: string;
  trimGold: string;
  skinOrFace: string;
  eyeGlow: string;
  weaponColor: string;
  weaponGlow: string;
  headgear: HeadgearKind;
  weapon: WeaponKind;
  wings: WingKind;
}

const UNIT_PIXEL_SPECS: Record<string, UnitPixelArtSpec> = {
  // 1코스트 (5종)
  u1_garen: {
    primaryArmor: '#2b579a',
    secondaryArmor: '#d9e2ec',
    trimGold: '#f4c430',
    skinOrFace: '#f3c6a0',
    eyeGlow: '#ffffff',
    weaponColor: '#e2e8f0',
    weaponGlow: '#ffd700',
    headgear: 'KNIGHT_HELM',
    weapon: 'SWORD_SHIELD',
    wings: 'CAPE',
  },
  u1_pip: {
    primaryArmor: '#5c4033',
    secondaryArmor: '#8b5a2b',
    trimGold: '#ffd700',
    skinOrFace: '#55a630',
    eyeGlow: '#ffea00',
    weaponColor: '#cbd5e1',
    weaponGlow: '#ffbe0b',
    headgear: 'GOBLIN_EARS',
    weapon: 'DUAL_DAGGERS',
    wings: 'NONE',
  },
  u1_aria: {
    primaryArmor: '#1b4332',
    secondaryArmor: '#40916c',
    trimGold: '#95d5b2',
    skinOrFace: '#fde2c4',
    eyeGlow: '#52b788',
    weaponColor: '#b08968',
    weaponGlow: '#74c69d',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'BOW',
    wings: 'CAPE',
  },
  u1_skel: {
    primaryArmor: '#3a0ca3',
    secondaryArmor: '#4cc9f0',
    trimGold: '#7209b7',
    skinOrFace: '#e5e5e5',
    eyeGlow: '#00f5d4',
    weaponColor: '#94a3b8',
    weaponGlow: '#b5179e',
    headgear: 'SKULL',
    weapon: 'GREATSWORD',
    wings: 'NONE',
  },
  u1_lumi: {
    primaryArmor: '#3f37c9',
    secondaryArmor: '#4895ef',
    trimGold: '#f72585',
    skinOrFace: '#ffe5d9',
    eyeGlow: '#4cc9f0',
    weaponColor: '#7209b7',
    weaponGlow: '#4cc9f0',
    headgear: 'WIZARD_HAT',
    weapon: 'ARCANE_STAFF',
    wings: 'NONE',
  },

  // 2코스트 (5종)
  u2_zephyr: {
    primaryArmor: '#1e1b2e',
    secondaryArmor: '#7209b7',
    trimGold: '#f72585',
    skinOrFace: '#d8b4e2',
    eyeGlow: '#ff2a85',
    weaponColor: '#e2e8f0',
    weaponGlow: '#f72585',
    headgear: 'DEMON_HORNS',
    weapon: 'DUAL_DAGGERS',
    wings: 'CAPE',
  },
  u2_elowen: {
    primaryArmor: '#2d6a4f',
    secondaryArmor: '#74c69d',
    trimGold: '#ffd166',
    skinOrFace: '#fae1dd',
    eyeGlow: '#80ed99',
    weaponColor: '#7f4f24',
    weaponGlow: '#57cc99',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'NATURE_STAFF',
    wings: 'NONE',
  },
  u2_boulder: {
    primaryArmor: '#495057',
    secondaryArmor: '#6c757d',
    trimGold: '#48cae4',
    skinOrFace: '#adb5bd',
    eyeGlow: '#00f5d4',
    weaponColor: '#6c757d',
    weaponGlow: '#00bbf9',
    headgear: 'GOLEM_CORE',
    weapon: 'SWORD_SHIELD',
    wings: 'NONE',
  },
  u2_boom: {
    primaryArmor: '#9b2226',
    secondaryArmor: '#ca6702',
    trimGold: '#ee9b00',
    skinOrFace: '#6a994e',
    eyeGlow: '#ffea00',
    weaponColor: '#bb3e03',
    weaponGlow: '#ff9e00',
    headgear: 'GOBLIN_EARS',
    weapon: 'CANNON_BAG',
    wings: 'NONE',
  },
  u2_vayne: {
    primaryArmor: '#1d3557',
    secondaryArmor: '#e63946',
    trimGold: '#f1faee',
    skinOrFace: '#f8edeb',
    eyeGlow: '#ffd166',
    weaponColor: '#e5e5e5',
    weaponGlow: '#a8dadc',
    headgear: 'HOOD',
    weapon: 'BOW',
    wings: 'CAPE',
  },

  // 3코스트 (4종)
  u3_drake: {
    primaryArmor: '#9d0208',
    secondaryArmor: '#dc2f02',
    trimGold: '#ffba08',
    skinOrFace: '#f48c06',
    eyeGlow: '#ffea00',
    weaponColor: '#ffba08',
    weaponGlow: '#ff4800',
    headgear: 'DRAGON_HORNS',
    weapon: 'SPEAR',
    wings: 'DRAGON_WINGS',
  },
  u3_leona: {
    primaryArmor: '#e09f3e',
    secondaryArmor: '#fff3b0',
    trimGold: '#ffd700',
    skinOrFace: '#fae1dd',
    eyeGlow: '#ffffff',
    weaponColor: '#ffd700',
    weaponGlow: '#fff3b0',
    headgear: 'HALO_HELM',
    weapon: 'SWORD_SHIELD',
    wings: 'CAPE',
  },
  u3_kazu: {
    primaryArmor: '#240046',
    secondaryArmor: '#5a189a',
    trimGold: '#9d4edd',
    skinOrFace: '#e0aaff',
    eyeGlow: '#ff007f',
    weaponColor: '#c77dff',
    weaponGlow: '#e0aaff',
    headgear: 'HOOD',
    weapon: 'DUAL_DAGGERS',
    wings: 'NONE',
  },
  u3_malakor: {
    primaryArmor: '#10002b',
    secondaryArmor: '#3c096c',
    trimGold: '#00f5d4',
    skinOrFace: '#dee2e6',
    eyeGlow: '#00f5d4',
    weaponColor: '#5a189a',
    weaponGlow: '#00f5d4',
    headgear: 'SKULL',
    weapon: 'SCYTHE',
    wings: 'CAPE',
  },

  // 4코스트 (3종)
  u4_sylph: {
    primaryArmor: '#1b4332',
    secondaryArmor: '#52b788',
    trimGold: '#ffd166',
    skinOrFace: '#fff1e6',
    eyeGlow: '#b7e4c7',
    weaponColor: '#ffd166',
    weaponGlow: '#95d5b2',
    headgear: 'ELVEN_CIRCLET',
    weapon: 'BOW',
    wings: 'CAPE',
  },
  u4_astaroth: {
    primaryArmor: '#640d14',
    secondaryArmor: '#ad2831',
    trimGold: '#ff4d6d',
    skinOrFace: '#800f2f',
    eyeGlow: '#ffbe0b',
    weaponColor: '#ff4d6d',
    weaponGlow: '#ff0055',
    headgear: 'DEMON_HORNS',
    weapon: 'GREATSWORD',
    wings: 'DEMON_WINGS',
  },
  u4_velkora: {
    primaryArmor: '#3a0ca3',
    secondaryArmor: '#7209b7',
    trimGold: '#4cc9f0',
    skinOrFace: '#f8edeb',
    eyeGlow: '#4cc9f0',
    weaponColor: '#f72585',
    weaponGlow: '#4cc9f0',
    headgear: 'WIZARD_HAT',
    weapon: 'ARCHMAGE_ORB',
    wings: 'CAPE',
  },

  // 5코스트 전설 (3종)
  u5_ignis: {
    primaryArmor: '#b7094c',
    secondaryArmor: '#ff4800',
    trimGold: '#ffea00',
    skinOrFace: '#ff9e00',
    eyeGlow: '#ffffff',
    weaponColor: '#ffea00',
    weaponGlow: '#ff0000',
    headgear: 'DRAGON_HORNS',
    weapon: 'DRAGON_CLAW',
    wings: 'DRAGON_WINGS',
  },
  u5_michael: {
    primaryArmor: '#ffffff',
    secondaryArmor: '#ffd700',
    trimGold: '#ffea00',
    skinOrFace: '#fff8e7',
    eyeGlow: '#00f5d4',
    weaponColor: '#ffea00',
    weaponGlow: '#ffffff',
    headgear: 'HALO_HELM',
    weapon: 'HOLY_BLADE',
    wings: 'ANGEL_WINGS',
  },
  u5_goldtooth: {
    primaryArmor: '#ffd700',
    secondaryArmor: '#b5179e',
    trimGold: '#ffea00',
    skinOrFace: '#70e000',
    eyeGlow: '#ff0055',
    weaponColor: '#ffea00',
    weaponGlow: '#00f5d4',
    headgear: 'CROWN',
    weapon: 'CANNON_BAG',
    wings: 'CAPE',
  },
};

/**
 * 실시간 전투 타격감(Combat Juice) 애니메이션 상태
 */
interface UnitVisualJuiceState {
  // 이동 보간
  renderRow: number;
  renderCol: number;
  moveFromRow: number;
  moveFromCol: number;
  moveToRow: number;
  moveToCol: number;
  moveProgress: number; // 0.0 ~ 1.0

  // 6방향 공격 돌진(Hex Lunge)
  lungeDirX: number;
  lungeDirY: number;
  lungeTimerMs: number;
  lungeDurationMs: number;

  // 피격 점멸(White Hit-Flash 80ms) & 넉백/찌그러짐(Squash & Stretch)
  hitFlashTimerMs: number;
  knockbackOffsetX: number;
  knockbackOffsetY: number;
  squashTimerMs: number;

  // 바라보는 좌우 방향 (1 = 우측, -1 = 좌측)
  facingX: 1 | -1;
}

/**
 * 초승달 모양 픽셀 검기(Slash Smear) 이펙트
 */
interface SlashSmearFX {
  x: number;
  y: number;
  angleRad: number;
  radius: number;
  color: string;
  coreColor: string;
  lifeMs: number;
  maxLifeMs: number;
}

/**
 * 원거리 화살/마법탄 도트 투사체(Pixel Projectile)
 */
interface ProjectileFX {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  trailColor: string;
  kind: 'ARROW' | 'ORB' | 'FIRE' | 'COIN' | 'LIGHTNING';
  lifeMs: number;
  maxLifeMs: number;
}

/**
 * 픽셀 피격 파편(Hit Sparks) 및 3성 마법진 상승 입자
 */
interface PixelSparkFX {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  color: string;
  lifeMs: number;
  maxLifeMs: number;
}

/**
 * 중력 포물선 아케이드 팝업 데미지 폰트
 */
interface ArcadeDamagePopFX {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  text: string;
  color: string;
  strokeColor: string;
  baseFontSize: number;
  isCritOrCataclysm: boolean;
  lifeMs: number;
  maxLifeMs: number;
}

const COST_BORDER_COLORS: Record<CostTier, string> = {
  1: '#8d99ae',
  2: '#2ec4b6',
  3: '#3a86ff',
  4: '#b5179e',
  5: '#ffbe0b',
};

export class PixelGameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // 오프스크린 도트 스프라이트 캐시 (unitId_star_frame_flashKey -> HTMLCanvasElement)
  private spriteCache: Map<string, HTMLCanvasElement> = new Map();

  // 유닛별 전투 모션/타격감 상태
  private unitJuiceMap: Map<string, UnitVisualJuiceState> = new Map();

  // 전투 VFX 리스트
  private slashSmears: SlashSmearFX[] = [];
  private projectiles: ProjectileFX[] = [];
  private pixelSparks: PixelSparkFX[] = [];
  private damagePops: ArcadeDamagePopFX[] = [];

  // 역경직(Hit-Stop 45ms) & 카메라 쉐이크(Screen Shake) 타이머
  private hitStopRemainingMs: number = 0;
  private shakeRemainingMs: number = 0;
  private shakeIntensity: number = 0;

  // 5코 3성 천지개벽 황금 번개 기둥 타이머
  private cataclysmFlashMs: number = 0;

  private globalAnimClockMs: number = 0;

  // 현재 프레임의 육각형 보드 메트릭스 & 하단 1x9 대기석 슬롯 히트박스
  public hexMetrics!: HexBoardViewportMetrics;
  public benchSlotRects: Array<{ x: number; y: number; w: number; h: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.recomputeLayoutMetrics();
  }

  /**
   * 캔버스 크기 변경 시 육각형 전장(8x7) 및 하단 1x9 대기석 슬롯 좌표를 재계산한다.
   */
  public recomputeLayoutMetrics(): void {
    const w = this.canvas.width || 800;
    const h = this.canvas.height || 600;

    // 상단 HUD(48px)와 하단 상점 드로어(124px), 그리고 대기석(58px)을 제외한 중앙 영역에 8x7 육각형 전장 배치
    const topHudMargin = Math.max(46, Math.round(h * 0.08));
    const bottomDockMargin = Math.max(122, Math.round(h * 0.21));
    const benchHeight = Math.max(50, Math.min(68, Math.round(h * 0.1)));

    const leftMargin = Math.max(66, Math.round(w * 0.09));
    const rightMargin = Math.max(82, Math.round(w * 0.11));

    const boardAreaLeft = leftMargin;
    const boardAreaTop = topHudMargin + 6;
    const boardAreaWidth = Math.max(220, w - leftMargin - rightMargin);
    const boardAreaHeight = Math.max(
      180,
      h - topHudMargin - bottomDockMargin - benchHeight - 16
    );

    this.hexMetrics = HexGridMath.computeBoardMetrics(
      boardAreaLeft,
      boardAreaTop,
      boardAreaWidth,
      boardAreaHeight,
      8,
      7
    );

    // 하단 1x9 대기석(Bench) 일렬 슬롯 계산 (육각형 전장 바로 아래 중앙 정렬)
    const benchTotalWidth = Math.min(
      boardAreaWidth * 0.98,
      this.hexMetrics.hexWidth * 7.6
    );
    const slotGap = 5;
    const slotW = Math.floor((benchTotalWidth - slotGap * 8) / 9);
    const slotH = Math.min(benchHeight - 6, slotW + 6);
    const benchStartX = Math.round((w - (slotW * 9 + slotGap * 8)) * 0.5);
    const benchY = Math.round(boardAreaTop + boardAreaHeight + 4);

    this.benchSlotRects = [];
    for (let i = 0; i < 9; i++) {
      this.benchSlotRects.push({
        x: benchStartX + i * (slotW + slotGap),
        y: benchY,
        w: slotW,
        h: slotH,
      });
    }
  }

  /**
   * 화면 포인터 좌표 (px, py)가 하단 1x9 대기석 슬롯(0~8) 중 어디에 속하는지 반환
   */
  public screenPointToBenchIndex(px: number, py: number): number | null {
    for (let i = 0; i < this.benchSlotRects.length; i++) {
      const r = this.benchSlotRects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        return i;
      }
    }
    return null;
  }

  /**
   * 새 전투 또는 라운드 전환 시 유닛 모션 상태 초기화
   */
  public resetCombatJuiceStates(): void {
    this.unitJuiceMap.clear();
    this.slashSmears = [];
    this.projectiles = [];
    this.hitStopRemainingMs = 0;
  }

  /**
   * 외부(상점 구매, 구슬 오픈, 3성 합성 등)에서 픽셀 파티클 폭발 생성
   */
  public spawnPixelSparks(
    x: number,
    y: number,
    color: string,
    count: number = 22
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 165;
      this.pixelSparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 45,
        gravity: 340,
        size: Math.random() < 0.4 ? 4 : 3,
        color,
        lifeMs: 0,
        maxLifeMs: 360 + Math.random() * 280,
      });
    }
  }

  /**
   * 외부에서 아케이드 포물선 팝업 텍스트 추가
   */
  public spawnArcadePopupText(
    x: number,
    y: number,
    text: string,
    color: string = '#ffea00',
    fontSize: number = 15
  ): void {
    this.damagePops.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 40,
      vy: -135,
      gravity: 360,
      text,
      color,
      strokeColor: '#000000',
      baseFontSize: fontSize,
      isCritOrCataclysm: true,
      lifeMs: 0,
      maxLifeMs: 1100,
    });
  }

  /**
   * 카메라 흔들림(Screen Shake) 및 역경직(Hit-Stop) 수동 트리거
   */
  public triggerImpactShake(intensity: number = 7, durationMs: number = 220, hitStopMs: number = 45): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeRemainingMs = Math.max(this.shakeRemainingMs, durationMs);
    if (hitStopMs > 0) {
      this.hitStopRemainingMs = Math.max(this.hitStopRemainingMs, hitStopMs);
    }
  }

  /**
   * CombatEngine에서 발생한 틱 이벤트들을 받아
   * 1) 6방향 공격 돌진(Hex Lunge) & 초승달 검기(Slash Smear) / 원거리 도트 투사체
   * 2) 피격 점멸(White Hit-Flash 80ms) & 넉백/찌그러짐(Squash & Stretch)
   * 3) 치명타/고코스트 광역 스킬 적중 시 45ms 역경직(Hit-Stop) & 화면 타격 흔들림(Screen Shake)
   * 4) 픽셀 피격 파편(Hit Sparks) & 포물선 팝업 데미지 폰트
   * 로 변환한다.
   */
  public ingestCombatEvents(events: CombatEvent[], units: CombatUnit[]): void {
    const unitById = new Map<string, CombatUnit>();
    for (const u of units) {
      unitById.set(u.instanceId, u);
    }

    for (const ev of events) {
      if (ev.type === 'MOVE' || ev.type === 'LEAP') {
        if (
          ev.sourceId &&
          ev.fromRow !== undefined &&
          ev.fromCol !== undefined &&
          ev.toRow !== undefined &&
          ev.toCol !== undefined
        ) {
          const state = this.getOrInitUnitJuice(
            ev.sourceId,
            ev.fromRow,
            ev.fromCol
          );
          state.moveFromRow = ev.fromRow;
          state.moveFromCol = ev.fromCol;
          state.moveToRow = ev.toRow;
          state.moveToCol = ev.toCol;
          state.moveProgress = 0;

          const pFrom = HexGridMath.hexToScreenCenter(
            ev.fromRow,
            ev.fromCol,
            this.hexMetrics
          );
          const pTo = HexGridMath.hexToScreenCenter(
            ev.toRow,
            ev.toCol,
            this.hexMetrics
          );
          if (Math.abs(pTo.x - pFrom.x) > 2) {
            state.facingX = pTo.x >= pFrom.x ? 1 : -1;
          }
          if (ev.type === 'LEAP') {
            this.spawnPixelSparks(pFrom.x, pFrom.y, '#9d4edd', 14);
            this.spawnPixelSparks(pTo.x, pTo.y, '#e0aaff', 18);
          }
        }
      } else if (ev.type === 'FIVE_COST_3STAR_CATACLYSM') {
        this.cataclysmFlashMs = 900;
        this.triggerImpactShake(14, 550, 75);
        const cx = this.canvas.width * 0.5;
        const cy = this.canvas.height * 0.42;
        this.spawnArcadePopupText(cx, cy, '⚡ 99,999! 5코 3성 절대 권능! ⚡', '#ffea00', 24);
        this.spawnPixelSparks(cx, cy, '#ffea00', 65);
      } else if (
        (ev.type === 'BASIC_ATTACK' || ev.type === 'SKILL_CAST') &&
        ev.sourceId &&
        ev.fromRow !== undefined &&
        ev.fromCol !== undefined &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined
      ) {
        const attacker = unitById.get(ev.sourceId);
        const pFrom = HexGridMath.hexToScreenCenter(
          ev.fromRow,
          ev.fromCol,
          this.hexMetrics
        );
        const pTo = HexGridMath.hexToScreenCenter(
          ev.toRow,
          ev.toCol,
          this.hexMetrics
        );
        const dx = pTo.x - pFrom.x;
        const dy = pTo.y - pFrom.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const nx = dx / len;
        const ny = dy / len;

        const state = this.getOrInitUnitJuice(
          ev.sourceId,
          ev.fromRow,
          ev.fromCol
        );
        if (Math.abs(dx) > 2) {
          state.facingX = dx >= 0 ? 1 : -1;
        }

        // 6방향 공격 돌진(Hex Lunge) 설정
        state.lungeDirX = nx;
        state.lungeDirY = ny;
        state.lungeDurationMs = ev.type === 'SKILL_CAST' ? 210 : 150;
        state.lungeTimerMs = state.lungeDurationMs;

        const isMelee = !attacker || attacker.range <= 1;
        const spec = UNIT_PIXEL_SPECS[ev.unitId ?? 'u1_garen'] ?? UNIT_PIXEL_SPECS.u1_garen;

        if (isMelee) {
          // 근접 기물: 타겟 방향 초승달 픽셀 검기(Slash Smear) 생성
          const smearX = pFrom.x + nx * (this.hexMetrics.hexRadius * 0.65);
          const smearY = pFrom.y + ny * (this.hexMetrics.hexRadius * 0.65);
          this.slashSmears.push({
            x: smearX,
            y: smearY,
            angleRad: Math.atan2(dy, dx),
            radius:
              this.hexMetrics.hexRadius *
              (ev.type === 'SKILL_CAST' ? 1.15 : 0.78),
            color: ev.type === 'SKILL_CAST' ? spec.weaponGlow : spec.weaponColor,
            coreColor: '#ffffff',
            lifeMs: 0,
            maxLifeMs: ev.type === 'SKILL_CAST' ? 220 : 145,
          });
        } else {
          // 원거리 기물: 화살/마법탄 도트 투사체 발사
          const projKind =
            spec.weapon === 'BOW'
              ? 'ARROW'
              : spec.weapon === 'CANNON_BAG'
              ? 'COIN'
              : spec.wings === 'DRAGON_WINGS'
              ? 'FIRE'
              : 'ORB';
          this.projectiles.push({
            x1: pFrom.x,
            y1: pFrom.y - 10,
            x2: pTo.x,
            y2: pTo.y - 8,
            color: spec.weaponGlow,
            trailColor: spec.primaryArmor,
            kind: projKind,
            lifeMs: 0,
            maxLifeMs: 165,
          });
        }

        // 고코스트 스킬 시전 시 역경직(45ms) + 화면 쉐이크
        if (ev.type === 'SKILL_CAST' && attacker && attacker.cost >= 3) {
          this.triggerImpactShake(attacker.cost >= 4 ? 8 : 5, 190, 45);
        }
      } else if (
        ev.type === 'DAMAGE' &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined &&
        ev.amount !== undefined
      ) {
        const pTarget = HexGridMath.hexToScreenCenter(
          ev.toRow,
          ev.toCol,
          this.hexMetrics
        );

        // 피격 유닛의 80ms White Hit-Flash 및 넉백/찌그러짐(Squash & Stretch) 적용
        if (ev.targetId) {
          const targetState = this.getOrInitUnitJuice(
            ev.targetId,
            ev.toRow,
            ev.toCol
          );
          targetState.hitFlashTimerMs = 80; // 명세: 80ms 동안 스프라이트 전체가 새하얗게 번쩍
          targetState.squashTimerMs = 150;

          if (ev.fromRow !== undefined && ev.fromCol !== undefined) {
            const pAttacker = HexGridMath.hexToScreenCenter(
              ev.fromRow,
              ev.fromCol,
              this.hexMetrics
            );
            const kdx = pTarget.x - pAttacker.x;
            const kdy = pTarget.y - pAttacker.y;
            const klen = Math.max(1, Math.hypot(kdx, kdy));
            const knockDist = ev.isCrit ? 8.5 : 5.0;
            targetState.knockbackOffsetX = (kdx / klen) * knockDist;
            targetState.knockbackOffsetY = (kdy / klen) * knockDist;
          } else {
            targetState.knockbackOffsetY = -5;
          }
        }

        // 치명타 또는 초대형 피해 시 45ms 역경직(Hit-Stop) & 카메라 쉐이크
        const isCataclysm = ev.amount >= 9999;
        if (ev.isCrit || isCataclysm || ev.amount >= 380) {
          this.triggerImpactShake(
            isCataclysm ? 13 : ev.isCrit ? 6.5 : 4.5,
            isCataclysm ? 420 : 160,
            45
          );
        }

        // 픽셀 피격 파편(Hit Sparks) 방출
        const sparkColor = isCataclysm
          ? '#ffea00'
          : ev.damageType === 'TRUE'
          ? '#ffffff'
          : ev.damageType === 'MAGICAL'
          ? '#4cc9f0'
          : ev.isCrit
          ? '#ff2a85'
          : '#ff9e00';
        this.spawnPixelSparks(
          pTarget.x,
          pTarget.y - 8,
          sparkColor,
          ev.isCrit || isCataclysm ? 16 : 8
        );

        // 포물선 중력 데미지 폰트 생성
        const vx = (Math.random() - 0.5) * 95;
        const vy = isCataclysm ? -190 : ev.isCrit ? -155 : -120;
        this.damagePops.push({
          x: pTarget.x + (Math.random() - 0.5) * 10,
          y: pTarget.y - 16,
          vx,
          vy,
          gravity: 420,
          text: `${ev.isCrit || isCataclysm ? '💥' : ''}-${ev.amount}`,
          color: sparkColor,
          strokeColor: '#090b10',
          baseFontSize: isCataclysm ? 22 : ev.isCrit ? 16 : 12,
          isCritOrCataclysm: Boolean(ev.isCrit || isCataclysm),
          lifeMs: 0,
          maxLifeMs: isCataclysm ? 1250 : 760,
        });
      } else if (
        ev.type === 'HEAL' &&
        ev.toRow !== undefined &&
        ev.toCol !== undefined &&
        ev.amount !== undefined
      ) {
        const pTarget = HexGridMath.hexToScreenCenter(
          ev.toRow,
          ev.toCol,
          this.hexMetrics
        );
        this.damagePops.push({
          x: pTarget.x,
          y: pTarget.y - 18,
          vx: (Math.random() - 0.5) * 35,
          vy: -105,
          gravity: 260,
          text: `+${ev.amount}`,
          color: '#52b788',
          strokeColor: '#081c15',
          baseFontSize: 12,
          isCritOrCataclysm: false,
          lifeMs: 0,
          maxLifeMs: 680,
        });
      }
    }
  }

  private getOrInitUnitJuice(
    instanceId: string,
    row: number,
    col: number
  ): UnitVisualJuiceState {
    let st = this.unitJuiceMap.get(instanceId);
    if (!st) {
      st = {
        renderRow: row,
        renderCol: col,
        moveFromRow: row,
        moveFromCol: col,
        moveToRow: row,
        moveToCol: col,
        moveProgress: 1,
        lungeDirX: 0,
        lungeDirY: 0,
        lungeTimerMs: 0,
        lungeDurationMs: 150,
        hitFlashTimerMs: 0,
        knockbackOffsetX: 0,
        knockbackOffsetY: 0,
        squashTimerMs: 0,
        facingX: 1,
      };
      this.unitJuiceMap.set(instanceId, st);
    }
    return st;
  }

  // ==========================================================================
  // 메인 프레임 렌더링 루프
  // ==========================================================================

  public renderFrame(
    dtMs: number,
    params: {
      inCombat: boolean;
      viewedParticipant: Participant;
      combatUnits: CombatUnit[];
      hoveredHex: HexCoord | null;
      hoveredBenchIndex: number | null;
      isDraggingUnit: boolean;
      draggedInstanceId: string | null;
      hasPandoraBench: boolean;
    }
  ): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. 역경직(Hit-Stop 45ms) 처리: 역경직 중에는 유닛 모션/파티클 시간을 동결시켜 묵직한 타격감을 부여
    let effectiveDt = dtMs;
    if (this.hitStopRemainingMs > 0) {
      this.hitStopRemainingMs = Math.max(0, this.hitStopRemainingMs - dtMs);
      effectiveDt = 0;
    } else {
      this.globalAnimClockMs += dtMs;
    }

    // 2. 카메라 쉐이크 오프셋 계산
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeRemainingMs > 0) {
      this.shakeRemainingMs = Math.max(0, this.shakeRemainingMs - dtMs);
      const decay = Math.min(1, this.shakeRemainingMs / 180);
      shakeX = Math.round((Math.random() - 0.5) * 2 * this.shakeIntensity * decay);
      shakeY = Math.round((Math.random() - 0.5) * 2 * this.shakeIntensity * decay);
    }

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 3. 다크 판타지 던전 배경 석판 & 횃불 앰비언트 라이트 렌더링
    this.drawDungeonArenaBackground(ctx, w, h);

    ctx.translate(shakeX, shakeY);

    // 4. 8x7 입체 육각형(Pointy-top Odd-R Hex) 판타지 석재/룬 타일 전장 렌더링
    this.drawHexagonalBattlefieldGrid(
      ctx,
      params.inCombat,
      params.hoveredHex,
      params.isDraggingUnit
    );

    // 5. 하단 1x9 대기석(Bench) 도트 석재 슬롯 및 기물 렌더링
    this.drawBenchSlotsAndUnits(
      ctx,
      params.viewedParticipant,
      params.hoveredBenchIndex,
      params.draggedInstanceId,
      params.hasPandoraBench
    );

    // 6. 육각형 전장 위 기물들 렌더링 (Y좌표 기준 깊이 정렬로 입체감 보장)
    if (params.inCombat) {
      this.updateAndDrawCombatUnits(ctx, effectiveDt, params.combatUnits);
    } else {
      this.drawPreparationBoardUnits(
        ctx,
        params.viewedParticipant,
        params.draggedInstanceId
      );
    }

    // 7. 전투 타격 이펙트(초승달 검기, 도트 투사체, 피격 스파크, 5코 3성 번개, 포물선 데미지 폰트) 렌더링
    this.updateAndDrawCombatVFX(ctx, effectiveDt);

    ctx.restore();
  }

  // ==========================================================================
  // A. 다크 판타지 던전 배경 & 입체 육각형(Hex) 석재 타일 렌더링
  // ==========================================================================

  private drawDungeonArenaBackground(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    const grad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.44,
      30,
      w * 0.5,
      h * 0.44,
      Math.max(w, h) * 0.72
    );
    grad.addColorStop(0, '#1a1f33');
    grad.addColorStop(0.55, '#0f1322');
    grad.addColorStop(1, '#070911');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 배경 픽셀 성벽 벽돌 패턴
    ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
    const brickW = 32;
    const brickH = 16;
    for (let y = 0; y < h; y += brickH) {
      const offset = ((y / brickH) % 2) * (brickW / 2);
      for (let x = -brickW; x < w; x += brickW) {
        ctx.fillRect(x + offset, y, brickW - 2, brickH - 2);
      }
    }
  }

  /**
   * 8행 x 7열 Pointy-top Odd-R 육각형 전장 타일을 입체 베벨(상단 면 + 하단 석재 두께 그림자)로 렌더링
   */
  private drawHexagonalBattlefieldGrid(
    ctx: CanvasRenderingContext2D,
    inCombat: boolean,
    hoveredHex: HexCoord | null,
    isDraggingUnit: boolean
  ): void {
    const m = this.hexMetrics;
    const bevelDepth = Math.max(4, Math.round(m.hexRadius * 0.22));
    const innerRadius = m.hexRadius * 0.93;

    for (let r = 0; r < HexGridMath.ROWS; r++) {
      const isEnemyRow = r < 4;
      for (let c = 0; c < HexGridMath.COLS; c++) {
        const center = HexGridMath.hexToScreenCenter(r, c, m);
        const isHoveredAllySlot =
          !inCombat &&
          hoveredHex !== null &&
          hoveredHex.row === r &&
          hoveredHex.col === c &&
          !isEnemyRow;

        // 1) 하단 입체 석재 두께(3D Bevel Side) 렌더링
        const bottomPts = HexGridMath.getHexPolygonVertices(
          center.x,
          center.y + bevelDepth,
          innerRadius
        );
        ctx.beginPath();
        ctx.moveTo(bottomPts[0].x, bottomPts[0].y);
        for (let i = 1; i < 6; i++) {
          ctx.lineTo(bottomPts[i].x, bottomPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = isEnemyRow ? '#190d16' : '#0d1929';
        ctx.fill();

        // 2) 상단 육각형 석판 표면 렌더링
        const topPts = HexGridMath.getHexPolygonVertices(
          center.x,
          center.y,
          innerRadius
        );
        ctx.beginPath();
        ctx.moveTo(topPts[0].x, topPts[0].y);
        for (let i = 1; i < 6; i++) {
          ctx.lineTo(topPts[i].x, topPts[i].y);
        }
        ctx.closePath();

        if (isHoveredAllySlot) {
          ctx.fillStyle = '#2d4b6e';
        } else if (isEnemyRow) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#271726' : '#211320';
        } else {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#18263c' : '#142033';
        }
        ctx.fill();

        // 3) 육각형 룬 테두리 (적군 4줄: 암적색 룬, 아군 4줄: 청록/황금 룬, 드래그 중 밝게 하이라이트)
        ctx.lineWidth = isHoveredAllySlot ? 2.5 : 1.5;
        if (isHoveredAllySlot) {
          ctx.strokeStyle = '#ffea00';
        } else if (isEnemyRow) {
          ctx.strokeStyle = 'rgba(220, 60, 90, 0.48)';
        } else if (isDraggingUnit && !inCombat) {
          ctx.strokeStyle = 'rgba(76, 201, 240, 0.78)';
        } else {
          ctx.strokeStyle =
            r === 4
              ? 'rgba(244, 196, 48, 0.55)'
              : 'rgba(64, 196, 255, 0.42)';
        }
        ctx.stroke();

        // 4) 타일 내부 미세 고대 룬 문양 내곽선
        const runePts = HexGridMath.getHexPolygonVertices(
          center.x,
          center.y,
          innerRadius * 0.72
        );
        ctx.beginPath();
        ctx.moveTo(runePts[0].x, runePts[0].y);
        for (let i = 1; i < 6; i++) {
          ctx.lineTo(runePts[i].x, runePts[i].y);
        }
        ctx.closePath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = isEnemyRow
          ? 'rgba(255, 100, 120, 0.12)'
          : 'rgba(120, 220, 255, 0.14)';
        ctx.stroke();
      }
    }
  }

  /**
   * 하단 1x9 대기석(Bench) 석재 슬롯 및 대기 중인 도트 기물 렌더링
   */
  private drawBenchSlotsAndUnits(
    ctx: CanvasRenderingContext2D,
    participant: Participant,
    hoveredBenchIndex: number | null,
    draggedInstanceId: string | null,
    hasPandoraBench: boolean
  ): void {
    for (let i = 0; i < this.benchSlotRects.length; i++) {
      const slot = this.benchSlotRects[i];
      const isPandoraSlot = hasPandoraBench && i >= 6;
      const isHovered = hoveredBenchIndex === i;

      // 입체 하단 베벨
      ctx.fillStyle = '#090d16';
      ctx.fillRect(slot.x, slot.y + 4, slot.w, slot.h);

      // 상단 슬롯 표면
      ctx.fillStyle = isHovered
        ? '#2b456b'
        : isPandoraSlot
        ? '#291a3e'
        : '#151e30';
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);

      // 픽셀 금장/판도라 테두리
      ctx.lineWidth = isHovered ? 2 : 1.5;
      ctx.strokeStyle = isHovered
        ? '#ffea00'
        : isPandoraSlot
        ? '#c77dff'
        : '#3b4d71';
      ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);

      if (isPandoraSlot) {
        ctx.fillStyle = 'rgba(199, 125, 255, 0.28)';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('🎲', slot.x + slot.w - 3, slot.y + 11);
      }

      const unit = participant.bench[i];
      if (unit && unit.instanceId !== draggedInstanceId) {
        const cx = slot.x + slot.w * 0.5;
        const cy = slot.y + slot.h * 0.58;
        this.drawUnitCompleteOnCanvas(ctx, {
          unitId: unit.unitId,
          name: unit.name,
          cost: unit.cost,
          starLevel: unit.starLevel,
          currentHp: unit.maxHp,
          maxHp: unit.maxHp,
          shield: 0,
          currentMana: unit.startMana,
          maxMana: unit.maxMana,
          items: unit.items,
          team: 'HOME',
          cx,
          cy,
          baseSizePx: Math.min(slot.w, slot.h) * 0.68,
          facingX: 1,
          hitFlash: false,
          squashRatioX: 1,
          squashRatioY: 1,
          isStunned: false,
          isReviving: false,
          compactBenchMode: true,
        });
      }
    }
  }

  /**
   * 정비 페이즈(PREPARATION_PHASE): 보드(4x7) 기물들을 하단 아군 육각형 타일(row 4~7)에 렌더링
   */
  private drawPreparationBoardUnits(
    ctx: CanvasRenderingContext2D,
    participant: Participant,
    draggedInstanceId: string | null
  ): void {
    const m = this.hexMetrics;
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = participant.board[r][c];
        if (!unit || unit.instanceId === draggedInstanceId) continue;

        const combatRow = 4 + r;
        const center = HexGridMath.hexToScreenCenter(combatRow, c, m);
        this.drawUnitCompleteOnCanvas(ctx, {
          unitId: unit.unitId,
          name: unit.name,
          cost: unit.cost,
          starLevel: unit.starLevel,
          currentHp: unit.maxHp,
          maxHp: unit.maxHp,
          shield: 0,
          currentMana: unit.startMana,
          maxMana: unit.maxMana,
          items: unit.items,
          team: 'HOME',
          cx: center.x,
          cy: center.y,
          baseSizePx: m.hexRadius * 1.18,
          facingX: 1,
          hitFlash: false,
          squashRatioX: 1,
          squashRatioY: 1,
          isStunned: false,
          isReviving: false,
          compactBenchMode: false,
        });
      }
    }
  }

  /**
   * 전투 페이즈(COMBAT_PHASE): 6방향 보간 이동, 공격 돌진(Hex Lunge), 80ms 피격 점멸, 넉백/탄성을 반영하여 렌더링
   */
  private updateAndDrawCombatUnits(
    ctx: CanvasRenderingContext2D,
    dtMs: number,
    combatUnits: CombatUnit[]
  ): void {
    const m = this.hexMetrics;

    const renderList: Array<{
      cu: CombatUnit;
      cx: number;
      cy: number;
      facingX: 1 | -1;
      hitFlash: boolean;
      squashX: number;
      squashY: number;
    }> = [];

    for (const cu of combatUnits) {
      if (cu.currentHp <= 0 && !cu.isReviving) continue;

      const st = this.getOrInitUnitJuice(cu.instanceId, cu.row, cu.col);

      // 1) 이동 보간 업데이트 (50ms 틱 사이를 부드럽게 6방향 육각형 중심으로 슬라이딩)
      if (st.moveToRow !== cu.row || st.moveToCol !== cu.col) {
        st.moveFromRow = st.renderRow;
        st.moveFromCol = st.renderCol;
        st.moveToRow = cu.row;
        st.moveToCol = cu.col;
        st.moveProgress = 0;
      }

      if (st.moveProgress < 1) {
        st.moveProgress = Math.min(1, st.moveProgress + dtMs / 55);
        st.renderRow =
          st.moveFromRow + (st.moveToRow - st.moveFromRow) * st.moveProgress;
        st.renderCol =
          st.moveFromCol + (st.moveToCol - st.moveFromCol) * st.moveProgress;
      } else {
        st.renderRow = cu.row;
        st.renderCol = cu.col;
      }

      const basePos = HexGridMath.lerpHexScreenPoint(
        st.moveFromRow,
        st.moveFromCol,
        st.moveToRow,
        st.moveToCol,
        st.moveProgress,
        m
      );

      // 2) 6방향 공격 돌진(Hex Lunge) 오프셋 계산
      let lungeOffsetX = 0;
      let lungeOffsetY = 0;
      if (st.lungeTimerMs > 0) {
        st.lungeTimerMs = Math.max(0, st.lungeTimerMs - dtMs);
        const progress = 1 - st.lungeTimerMs / st.lungeDurationMs;
        // 앞으로 확 찔렀다가 돌아오는 사인 곡선
        const lungeFactor = Math.sin(progress * Math.PI);
        const maxLungePx = m.hexRadius * 0.52;
        lungeOffsetX = st.lungeDirX * maxLungePx * lungeFactor;
        lungeOffsetY = st.lungeDirY * maxLungePx * lungeFactor;
      }

      // 3) 피격 점멸(80ms White Hit-Flash) & 넉백 감쇠 & 찌그러짐(Squash & Stretch)
      if (st.hitFlashTimerMs > 0) {
        st.hitFlashTimerMs = Math.max(0, st.hitFlashTimerMs - dtMs);
      }
      st.knockbackOffsetX *= Math.pow(0.75, dtMs / 16);
      st.knockbackOffsetY *= Math.pow(0.75, dtMs / 16);

      let squashX = 1.0;
      let squashY = 1.0;
      if (st.squashTimerMs > 0) {
        st.squashTimerMs = Math.max(0, st.squashTimerMs - dtMs);
        const sqPhase = (st.squashTimerMs / 150) * Math.PI;
        squashX = 1 + Math.sin(sqPhase) * 0.22;
        squashY = 1 - Math.sin(sqPhase) * 0.18;
      }

      renderList.push({
        cu,
        cx: basePos.x + lungeOffsetX + st.knockbackOffsetX,
        cy: basePos.y + lungeOffsetY + st.knockbackOffsetY,
        facingX: st.facingX,
        hitFlash: st.hitFlashTimerMs > 0,
        squashX,
        squashY,
      });
    }

    // Y좌표 오름차순 정렬하여 아래쪽 행 기물이 위쪽 행 기물 앞에 자연스럽게 겹치도록 렌더링
    renderList.sort((a, b) => a.cy - b.cy);

    for (const item of renderList) {
      const { cu, cx, cy, facingX, hitFlash, squashX, squashY } = item;
      this.drawUnitCompleteOnCanvas(ctx, {
        unitId: cu.unitId,
        name: cu.name,
        cost: cu.cost,
        starLevel: cu.starLevel,
        currentHp: cu.currentHp,
        maxHp: cu.maxHp,
        shield: cu.shield,
        currentMana: cu.currentMana,
        maxMana: cu.maxMana,
        items: cu.items,
        team: cu.team,
        cx,
        cy,
        baseSizePx: m.hexRadius * 1.18,
        facingX,
        hitFlash,
        squashRatioX: squashX,
        squashRatioY: squashY,
        isStunned: cu.stunTimerMs > 0,
        isReviving: cu.isReviving,
        compactBenchMode: false,
      });
    }
  }

  // ==========================================================================
  // B. 단일 도트 기물 통합 렌더링 (3성 황금 마법진 + 그림자 + 성급별 1.0x/1.25x/1.5x 도트 + 눈금 체력바)
  // ==========================================================================

  private drawUnitCompleteOnCanvas(
    ctx: CanvasRenderingContext2D,
    u: {
      unitId: string;
      name: string;
      cost: CostTier;
      starLevel: StarLevel;
      currentHp: number;
      maxHp: number;
      shield: number;
      currentMana: number;
      maxMana: number;
      items: ItemId[];
      team: 'HOME' | 'AWAY';
      cx: number;
      cy: number;
      baseSizePx: number;
      facingX: 1 | -1;
      hitFlash: boolean;
      squashRatioX: number;
      squashRatioY: number;
      isStunned: boolean;
      isReviving: boolean;
      compactBenchMode: boolean;
    }
  ): void {
    // 성급별 외형 진화 배율: 1성 1.0배, 2성 1.25배, 3성 1.5배 거대화
    const starScale =
      u.starLevel === 3 ? 1.5 : u.starLevel === 2 ? 1.25 : 1.0;
    const bobbingOffset =
      Math.floor(Math.sin(this.globalAnimClockMs / 180 + u.cx) * 1.5);

    ctx.save();

    // 1) 3성 기물 전용: 발밑 육각형 타일에 회전하는 도트 황금 마법진과 상승하는 빛 입자 상시 출력
    if (u.starLevel === 3 && !u.compactBenchMode) {
      this.drawThreeStarMagicCircle(ctx, u.cx, u.cy + 5, this.hexMetrics.hexRadius * 0.78);
    }

    // 2) 캐릭터 발밑 타원형 반투명 그림자(Drop Shadow)
    const shadowRx = u.baseSizePx * 0.42 * starScale;
    const shadowRy = shadowRx * 0.38;
    ctx.beginPath();
    ctx.ellipse(u.cx, u.cy + 7, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();

    // 3) 2성 은빛 글로우 / 3성 황금 아우라 외곽 효과
    const spriteDrawW = Math.round(u.baseSizePx * starScale * u.squashRatioX);
    const spriteDrawH = Math.round(u.baseSizePx * starScale * u.squashRatioY);
    const animFrame: 0 | 1 =
      Math.floor(this.globalAnimClockMs / 260) % 2 === 0 ? 0 : 1;

    const spriteCanvas = this.getOrCreateUnitPixelSprite(
      u.unitId,
      u.starLevel,
      animFrame,
      u.hitFlash
    );

    ctx.save();
    ctx.translate(Math.round(u.cx), Math.round(u.cy + bobbingOffset));
    if (u.facingX === -1) {
      ctx.scale(-1, 1);
    }
    if (u.isReviving) {
      ctx.globalAlpha = 0.45;
    }
    ctx.drawImage(
      spriteCanvas,
      Math.round(-spriteDrawW * 0.5),
      Math.round(-spriteDrawH * 0.78),
      spriteDrawW,
      spriteDrawH
    );
    ctx.restore();

    // 4) 기절(Stun) 중일 때 머리 위 회전하는 도트 별 표시
    if (u.isStunned) {
      ctx.fillStyle = '#ffea00';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('💫STUN', u.cx, u.cy - spriteDrawH * 0.85);
    }

    // 5) 머리 위 세련된 모바일 게임풍 체력바(200 HP마다 눈금 표시) + 마나바 + 성급 별표 + 장착 아이템
    const barWidth = u.compactBenchMode
      ? Math.max(30, u.baseSizePx * 0.95)
      : Math.max(38, u.baseSizePx * (u.starLevel === 3 ? 1.25 : 1.05));
    const barHeight = u.compactBenchMode ? 4 : 6;
    const manaHeight = u.compactBenchMode ? 2 : 3;
    const barX = Math.round(u.cx - barWidth * 0.5);
    const barY = Math.round(u.cy - spriteDrawH * 0.76 - (u.compactBenchMode ? 6 : 11));

    // 성급 별표 (★ / ★★ / ★★★)
    const starsStr = '★'.repeat(u.starLevel);
    ctx.font = `900 ${u.starLevel === 3 ? 11 : 9}px monospace`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.strokeText(starsStr, u.cx, barY - 2);
    ctx.fillStyle =
      u.starLevel === 3
        ? '#ffea00'
        : u.starLevel === 2
        ? '#e2e8f0'
        : '#cbd5e1';
    ctx.fillText(starsStr, u.cx, barY - 2);

    if (!u.compactBenchMode) {
      // 체력바 배경
      ctx.fillStyle = '#090c14';
      ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + manaHeight + 3);

      // 체력 비율 채우기
      const hpRatio = Math.max(0, Math.min(1, u.currentHp / Math.max(1, u.maxHp)));
      const hpFillW = Math.round(barWidth * hpRatio);
      ctx.fillStyle = u.team === 'HOME' ? '#2ec4b6' : '#e63946';
      ctx.fillRect(barX, barY, hpFillW, barHeight);

      // 보호막(Shield) 오버레이
      if (u.shield > 0) {
        const shieldW = Math.min(
          barWidth,
          Math.round((u.shield / Math.max(1, u.maxHp)) * barWidth)
        );
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(barX, barY, shieldW, Math.max(2, barHeight - 2));
      }

      // 200 HP마다 검은색 픽셀 눈금(Tick Marks) 표시
      const segmentCount = Math.min(20, Math.floor(u.maxHp / 200));
      if (segmentCount >= 1) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        for (let s = 1; s <= segmentCount; s++) {
          const segHp = s * 200;
          if (segHp >= u.maxHp) break;
          const tickX = barX + Math.round((segHp / u.maxHp) * barWidth);
          ctx.fillRect(tickX, barY, 1, barHeight);
        }
      }

      // 마나바
      const manaRatio =
        u.maxMana > 0
          ? Math.max(0, Math.min(1, u.currentMana / u.maxMana))
          : 0;
      ctx.fillStyle = '#1b263b';
      ctx.fillRect(barX, barY + barHeight + 1, barWidth, manaHeight);
      ctx.fillStyle = '#00bbf9';
      ctx.fillRect(
        barX,
        barY + barHeight + 1,
        Math.round(barWidth * manaRatio),
        manaHeight
      );
    }

    // 장착 아이템 뱃지 & 코스트 테두리 이름표
    if (u.items.length > 0) {
      const iconText = u.items
        .map((id) => ITEM_DEFINITIONS[id]?.icon ?? '')
        .join('');
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(iconText, u.cx, barY - (u.compactBenchMode ? 10 : 12));
    }

    // 하단 코스트 컬러 도트 이름표
    const shortName =
      u.name.length > 6 ? u.name.slice(u.name.indexOf(' ') + 1) : u.name;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#05070c';
    ctx.lineWidth = 2.5;
    ctx.strokeText(shortName, u.cx, u.cy + (u.compactBenchMode ? 15 : 17));
    ctx.fillStyle = COST_BORDER_COLORS[u.cost];
    ctx.fillText(shortName, u.cx, u.cy + (u.compactBenchMode ? 15 : 17));

    ctx.restore();
  }

  /**
   * 3성 기물 발밑에 회전하는 도트 황금 마법진과 상승하는 황금 입자 렌더링
   */
  private drawThreeStarMagicCircle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number
  ): void {
    const angle = (this.globalAnimClockMs / 900) % (Math.PI * 2);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.55); // 타원형 원근감
    ctx.rotate(angle);

    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 내부 회전 6각 별 마법진
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * 120 + k * 60) * (Math.PI / 180);
        const px = Math.cos(a) * radius * 0.92;
        const py = Math.sin(a) * radius * 0.92;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = k === 0 ? '#ffd700' : '#ffffff';
      ctx.stroke();
    }
    ctx.restore();

    // 상승하는 빛 도트 입자 4개
    for (let i = 0; i < 4; i++) {
      const phase = ((this.globalAnimClockMs * 0.04 + i * 25) % 100) / 100;
      const px = cx + Math.cos(i * 1.7 + this.globalAnimClockMs * 0.003) * (radius * 0.65);
      const py = cy - phase * 28;
      ctx.fillStyle = i % 2 === 0 ? '#ffea00' : '#ffffff';
      ctx.fillRect(Math.round(px), Math.round(py), 3, 3);
    }
  }

  // ==========================================================================
  // C. 20종 챔피언 고유 28x28 도트 스프라이트 프로시저럴 생성기 (1px 검은 외곽선 + 2성/3성 글로우 + 80ms White Flash)
  // ==========================================================================

  public getOrCreateUnitPixelSprite(
    unitId: string,
    starLevel: StarLevel,
    frame: 0 | 1,
    whiteHitFlash: boolean
  ): HTMLCanvasElement {
    const key = `${unitId}_s${starLevel}_f${frame}_${whiteHitFlash ? 'FLASH' : 'NORM'}`;
    const cached = this.spriteCache.get(key);
    if (cached) return cached;

    const size = 28;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const g = off.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    const spec = UNIT_PIXEL_SPECS[unitId] ?? UNIT_PIXEL_SPECS.u1_garen;

    // 28x28 컬러 그리드 버퍼
    const pixels: (string | null)[][] = Array.from({ length: size }, () =>
      Array<string | null>(size).fill(null)
    );

    const setPx = (x: number, y: number, color: string) => {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix >= 0 && ix < size && iy >= 0 && iy < size) {
        pixels[iy][ix] = color;
      }
    };

    const fillRectPx = (x: number, y: number, w: number, h: number, color: string) => {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          setPx(px, py, color);
        }
      }
    };

    const dy = frame === 1 ? -1 : 0; // 숨쉬기 1픽셀 모션

    // 1. 등 뒤 날개 / 망토 (Wings & Cape)
    if (spec.wings === 'ANGEL_WINGS' || spec.wings === 'DRAGON_WINGS' || spec.wings === 'DEMON_WINGS') {
      const wingColor =
        spec.wings === 'ANGEL_WINGS'
          ? '#ffffff'
          : spec.wings === 'DRAGON_WINGS'
          ? spec.secondaryArmor
          : '#5a189a';
      const wingTip = spec.trimGold;
      // 좌우 거대 날개 픽셀
      for (let wy = 7; wy <= 18; wy++) {
        const span = wy < 12 ? 9 - (wy - 7) : 5;
        for (let wx = 2; wx < 2 + span; wx++) {
          setPx(wx, wy + dy, wx === 2 ? wingTip : wingColor);
          setPx(size - 1 - wx, wy + dy, wx === 2 ? wingTip : wingColor);
        }
      }
    } else if (spec.wings === 'CAPE') {
      fillRectPx(8, 12 + dy, 11, 10, spec.secondaryArmor);
    }

    // 2. 다리 & 부츠 (Legs)
    const legOffset = frame === 1 ? 1 : 0;
    fillRectPx(10, 21, 3, 4 - legOffset, spec.primaryArmor);
    fillRectPx(15, 21, 3, 4, spec.primaryArmor);
    fillRectPx(10, 24 - legOffset, 3, 2, spec.trimGold);
    fillRectPx(15, 24, 3, 2, spec.trimGold);

    // 3. 몸통 갑옷 / 로브 (Torso & Pauldrons)
    fillRectPx(9, 13 + dy, 10, 8, spec.primaryArmor);
    fillRectPx(11, 14 + dy, 6, 6, spec.secondaryArmor);
    // 갑옷 금장 벨트 & 흉갑 문양
    fillRectPx(9, 19 + dy, 10, 2, spec.trimGold);
    fillRectPx(13, 14 + dy, 2, 5, spec.trimGold);
    // 양 어깨 견갑(Pauldrons)
    fillRectPx(7, 13 + dy, 3, 4, spec.secondaryArmor);
    fillRectPx(18, 13 + dy, 3, 4, spec.secondaryArmor);
    setPx(7, 13 + dy, spec.trimGold);
    setPx(20, 13 + dy, spec.trimGold);

    // 4. 머리 & 얼굴 & 눈빛 (Head & Eyes)
    fillRectPx(10, 7 + dy, 8, 6, spec.skinOrFace);
    // 빛나는 눈 (우측을 바라보는 기준)
    setPx(12, 10 + dy, spec.eyeGlow);
    setPx(16, 10 + dy, spec.eyeGlow);

    // 5. 투구 / 왕관 / 뿔 / 마법모자 (Headgear)
    if (spec.headgear === 'KNIGHT_HELM' || spec.headgear === 'HALO_HELM') {
      fillRectPx(9, 5 + dy, 10, 4, spec.primaryArmor);
      fillRectPx(10, 8 + dy, 8, 2, spec.trimGold);
      fillRectPx(13, 3 + dy, 2, 3, spec.trimGold); // 투구 깃털
      if (spec.headgear === 'HALO_HELM') {
        fillRectPx(10, 2 + dy, 8, 1, '#ffea00'); // 천사 헤일로
      }
    } else if (spec.headgear === 'CROWN') {
      fillRectPx(9, 4 + dy, 10, 3, '#ffd700');
      setPx(9, 3 + dy, '#ffea00');
      setPx(13, 2 + dy, '#ff0055');
      setPx(14, 2 + dy, '#ff0055');
      setPx(18, 3 + dy, '#ffea00');
      // 고블린 귀
      fillRectPx(7, 8 + dy, 3, 2, spec.skinOrFace);
      fillRectPx(18, 8 + dy, 3, 2, spec.skinOrFace);
    } else if (spec.headgear === 'GOBLIN_EARS') {
      fillRectPx(6, 8 + dy, 4, 2, spec.skinOrFace);
      fillRectPx(18, 8 + dy, 4, 2, spec.skinOrFace);
      fillRectPx(10, 6 + dy, 8, 2, spec.secondaryArmor);
    } else if (spec.headgear === 'WIZARD_HAT') {
      fillRectPx(7, 7 + dy, 14, 2, spec.primaryArmor);
      fillRectPx(10, 4 + dy, 8, 3, spec.primaryArmor);
      fillRectPx(12, 2 + dy, 5, 2, spec.secondaryArmor);
      fillRectPx(10, 6 + dy, 8, 1, spec.trimGold);
    } else if (spec.headgear === 'DEMON_HORNS' || spec.headgear === 'DRAGON_HORNS') {
      fillRectPx(10, 6 + dy, 8, 2, spec.primaryArmor);
      // 솟아오른 양쪽 뿔
      fillRectPx(8, 3 + dy, 2, 4, spec.trimGold);
      fillRectPx(18, 3 + dy, 2, 4, spec.trimGold);
      setPx(7, 2 + dy, spec.weaponGlow);
      setPx(20, 2 + dy, spec.weaponGlow);
    } else if (spec.headgear === 'ELVEN_CIRCLET') {
      fillRectPx(9, 6 + dy, 10, 2, spec.trimGold);
      setPx(14, 5 + dy, spec.eyeGlow);
      fillRectPx(8, 8 + dy, 2, 5, spec.secondaryArmor); // 엘프 장발
    } else if (spec.headgear === 'HOOD') {
      fillRectPx(9, 5 + dy, 10, 5, spec.primaryArmor);
      fillRectPx(11, 8 + dy, 6, 3, '#111111');
      setPx(12, 9 + dy, spec.eyeGlow);
      setPx(15, 9 + dy, spec.eyeGlow);
    } else if (spec.headgear === 'SKULL') {
      fillRectPx(10, 6 + dy, 8, 6, '#e2e8f0');
      setPx(12, 9 + dy, spec.eyeGlow);
      setPx(15, 9 + dy, spec.eyeGlow);
      setPx(11, 12 + dy, '#475569');
      setPx(13, 12 + dy, '#475569');
      setPx(15, 12 + dy, '#475569');
    } else if (spec.headgear === 'GOLEM_CORE') {
      fillRectPx(9, 6 + dy, 10, 7, spec.primaryArmor);
      fillRectPx(12, 8 + dy, 4, 3, spec.eyeGlow);
    }

    // 6. 손에 든 무기 (Weapons)
    if (spec.weapon === 'SWORD_SHIELD') {
      // 왼손 거대 방패 + 오른손 검
      fillRectPx(4, 13 + dy, 4, 7, spec.secondaryArmor);
      fillRectPx(5, 14 + dy, 2, 5, spec.trimGold);
      fillRectPx(21, 7 + dy, 2, 11, spec.weaponColor);
      fillRectPx(19, 15 + dy, 6, 2, spec.trimGold);
    } else if (spec.weapon === 'GREATSWORD' || spec.weapon === 'HOLY_BLADE') {
      fillRectPx(21, 4 + dy, 3, 14, spec.weaponColor);
      fillRectPx(22, 5 + dy, 1, 12, spec.weaponGlow);
      fillRectPx(19, 16 + dy, 7, 2, spec.trimGold);
    } else if (spec.weapon === 'DUAL_DAGGERS') {
      fillRectPx(4, 14 + dy, 2, 6, spec.weaponColor);
      fillRectPx(21, 12 + dy, 2, 7, spec.weaponColor);
      setPx(4, 14 + dy, spec.weaponGlow);
      setPx(22, 12 + dy, spec.weaponGlow);
    } else if (spec.weapon === 'BOW') {
      for (let by = 8; by <= 19; by++) {
        const bx = by === 8 || by === 19 ? 20 : by < 11 || by > 16 ? 22 : 23;
        setPx(bx, by + dy, spec.weaponColor);
      }
      fillRectPx(20, 9 + dy, 1, 10, '#e2e8f0'); // 활시위
      fillRectPx(19, 13 + dy, 6, 1, spec.weaponGlow); // 화살
    } else if (
      spec.weapon === 'ARCANE_STAFF' ||
      spec.weapon === 'NATURE_STAFF' ||
      spec.weapon === 'ARCHMAGE_ORB'
    ) {
      fillRectPx(21, 7 + dy, 2, 16, spec.weaponColor);
      fillRectPx(20, 5 + dy, 4, 4, spec.weaponGlow);
      setPx(21, 6 + dy, '#ffffff');
    } else if (spec.weapon === 'SCYTHE') {
      fillRectPx(21, 5 + dy, 2, 18, spec.weaponColor);
      fillRectPx(15, 5 + dy, 8, 2, spec.weaponGlow);
      fillRectPx(14, 7 + dy, 3, 2, spec.weaponGlow);
    } else if (spec.weapon === 'SPEAR') {
      fillRectPx(21, 3 + dy, 2, 20, spec.weaponColor);
      fillRectPx(20, 2 + dy, 4, 3, spec.weaponGlow);
    } else if (spec.weapon === 'CANNON_BAG') {
      fillRectPx(4, 11 + dy, 5, 9, '#ffd700'); // 황금 보따리
      fillRectPx(20, 12 + dy, 5, 5, '#334155'); // 폭탄/대포
      setPx(24, 11 + dy, '#ffea00');
    } else if (spec.weapon === 'DRAGON_CLAW') {
      fillRectPx(20, 11 + dy, 5, 5, spec.weaponGlow);
      setPx(25, 10 + dy, '#ffea00');
      setPx(25, 13 + dy, '#ffea00');
      setPx(25, 16 + dy, '#ffea00');
    }

    // 7. 1px 검은색 외곽선(Pixel Outline) 및 2성 은빛 / 3성 황금 외곽 글로우 렌더링
    const outlineColor =
      starLevel === 3
        ? '#ffd700'
        : starLevel === 2
        ? '#e2e8f0'
        : '#05070d';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (pixels[y][x] !== null) continue;
        const hasNeighbor =
          (y > 0 && pixels[y - 1][x] !== null) ||
          (y < size - 1 && pixels[y + 1][x] !== null) ||
          (x > 0 && pixels[y][x - 1] !== null) ||
          (x < size - 1 && pixels[y][x + 1] !== null);
        if (hasNeighbor) {
          g.fillStyle = outlineColor;
          g.fillRect(x, y, 1, 1);
        }
      }
    }

    // 8. 본체 픽셀 채우기 (피격 점멸 80ms 동안은 스프라이트 전체를 새하얗게 렌더링)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const col = pixels[y][x];
        if (!col) continue;
        g.fillStyle = whiteHitFlash ? '#ffffff' : col;
        g.fillRect(x, y, 1, 1);
      }
    }

    this.spriteCache.set(key, off);
    return off;
  }

  // ==========================================================================
  // D. 전투 타격 이펙트 (초승달 검기, 도트 투사체, 피격 스파크, 포물선 데미지 폰트)
  // ==========================================================================

  private updateAndDrawCombatVFX(
    ctx: CanvasRenderingContext2D,
    dtMs: number
  ): void {
    // 1. 5코 3성 천지개벽 황금 번개 기둥 연출
    if (this.cataclysmFlashMs > 0) {
      this.cataclysmFlashMs = Math.max(0, this.cataclysmFlashMs - dtMs);
      const alpha = (this.cataclysmFlashMs / 900) * 0.75;
      ctx.save();
      ctx.fillStyle = `rgba(255, 234, 0, ${alpha * 0.35})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.strokeStyle = '#ffea00';
      ctx.lineWidth = 6;
      ctx.globalAlpha = Math.min(1, alpha * 1.4);
      for (let i = 0; i < 7; i++) {
        const lx = ((i + 0.5) / 7) * this.canvas.width;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx + (Math.random() - 0.5) * 24, this.canvas.height * 0.5);
        ctx.lineTo(lx, this.canvas.height);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. 근접 공격 초승달 모양 픽셀 검기(Slash Smear)
    for (let i = this.slashSmears.length - 1; i >= 0; i--) {
      const s = this.slashSmears[i];
      s.lifeMs += dtMs;
      if (s.lifeMs >= s.maxLifeMs) {
        this.slashSmears.splice(i, 1);
        continue;
      }
      const prog = s.lifeMs / s.maxLifeMs;
      const alpha = 1 - prog;

      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.rotate(s.angleRad);
      ctx.globalAlpha = alpha;

      // 외곽 초승달 검기 호
      ctx.beginPath();
      ctx.arc(0, 0, s.radius, -Math.PI * 0.42, Math.PI * 0.42, false);
      ctx.arc(
        -s.radius * 0.22,
        0,
        s.radius * 0.85,
        Math.PI * 0.38,
        -Math.PI * 0.38,
        true
      );
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();

      // 중심 백색 날카로운 코어
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = s.coreColor;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius * 0.92, -Math.PI * 0.34, Math.PI * 0.34);
      ctx.stroke();

      ctx.restore();
    }

    // 3. 원거리 화살/마법탄 도트 투사체(Pixel Projectiles)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifeMs += dtMs;
      if (p.lifeMs >= p.maxLifeMs) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const t = p.lifeMs / p.maxLifeMs;
      const cx = p.x1 + (p.x2 - p.x1) * t;
      const cy = p.y1 + (p.y2 - p.y1) * t - Math.sin(t * Math.PI) * 14;

      ctx.save();
      // 잔상 꼬리
      const prevT = Math.max(0, t - 0.18);
      const tx = p.x1 + (p.x2 - p.x1) * prevT;
      const ty = p.y1 + (p.y2 - p.y1) * prevT - Math.sin(prevT * Math.PI) * 14;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      // 도트 탄두
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(cx - 3), Math.round(cy - 3), 6, 6);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(cx - 4), Math.round(cy - 4), 8, 8);
      ctx.restore();
    }

    // 4. 픽셀 피격 파편(Hit Sparks)
    for (let i = this.pixelSparks.length - 1; i >= 0; i--) {
      const sp = this.pixelSparks[i];
      sp.lifeMs += dtMs;
      if (sp.lifeMs >= sp.maxLifeMs) {
        this.pixelSparks.splice(i, 1);
        continue;
      }
      const dtSec = dtMs / 1000;
      sp.vy += sp.gravity * dtSec;
      sp.x += sp.vx * dtSec;
      sp.y += sp.vy * dtSec;

      const alpha = 1 - sp.lifeMs / sp.maxLifeMs;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = sp.color;
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), sp.size, sp.size);
      ctx.restore();
    }

    // 5. 포물선 중력 팝업 데미지 폰트(Arcade Damage Popups)
    for (let i = this.damagePops.length - 1; i >= 0; i--) {
      const dp = this.damagePops[i];
      dp.lifeMs += dtMs;
      if (dp.lifeMs >= dp.maxLifeMs) {
        this.damagePops.splice(i, 1);
        continue;
      }
      const dtSec = dtMs / 1000;
      dp.vy += dp.gravity * dtSec;
      dp.x += dp.vx * dtSec;
      dp.y += dp.vy * dtSec;

      const lifeRatio = dp.lifeMs / dp.maxLifeMs;
      const popScale =
        lifeRatio < 0.18
          ? 0.8 + (lifeRatio / 0.18) * 0.55
          : lifeRatio < 0.35
          ? 1.35 - ((lifeRatio - 0.18) / 0.17) * 0.35
          : 1.0;
      const alpha = lifeRatio > 0.72 ? 1 - (lifeRatio - 0.72) / 0.28 : 1;

      const fontSize = Math.round(dp.baseFontSize * popScale);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = dp.isCritOrCataclysm ? 4 : 3;
      ctx.strokeStyle = dp.strokeColor;
      ctx.strokeText(dp.text, Math.round(dp.x), Math.round(dp.y));
      ctx.fillStyle = dp.color;
      ctx.fillText(dp.text, Math.round(dp.x), Math.round(dp.y));
      ctx.restore();
    }
  }
}

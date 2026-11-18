// src/CombatEngine.ts

import { ITEM_DEFINITIONS, TraitId, UNIT_TEMPLATES } from './GameData';
import { HexGridMath } from './HexGridMath';
import { Participant, UnitInstance } from './Participant';
import {
  CombatDamageType,
  CombatEvent,
  CombatTeam,
  CombatUnit,
  SkillCombatContext,
  SkillRegistry,
} from './SkillRegistry';
import { ActiveSynergyState, SynergyEngine } from './SynergyEngine';
import { Set6TraitCombat } from './set6/Set6TraitCombat';
import { defaultSocialiteSpotlights } from './set6/Set6MatchState';
import { applySet6AugmentSpawnBonuses, celestialBlessingShieldCap } from './set6/Set6AugmentCombat';
import { participantEffectTier, participantHasEffect } from './GameData/augmentUtils';

export interface CombatSummary {
  winner: 'HOME' | 'AWAY' | 'DRAW';
  survivingHomeUnits: number;
  survivingAwayUnits: number;
  homeGoldEarnedInCombat: number;
  awayGoldEarnedInCombat: number;
  playerDamageTaken: number;
  totalTicks: number;
}

interface AStarNode {
  row: number;
  col: number;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

export class CombatEngine implements SkillCombatContext {
  public static readonly GRID_ROWS = 8;
  public static readonly GRID_COLS = 7;
  public static readonly MAX_COMBAT_MS = 45000; // 45초 초과 시 승패 판정

  public currentTick: number = 0;
  public elapsedMs: number = 0;
  public units: CombatUnit[] = [];
  public isFinished: boolean = false;
  public winner: 'HOME' | 'AWAY' | 'DRAW' | null = null;

  public homeGoldEarned: number = 0;
  public awayGoldEarned: number = 0;

  private homeParticipant: Participant | null = null;
  private awayParticipant: Participant | null = null;
  private readonly set6TraitCombat = new Set6TraitCombat();
  private homeSynergies: Map<TraitId, ActiveSynergyState> = new Map();
  private awaySynergies: Map<TraitId, ActiveSynergyState> = new Map();

  private currentTickEvents: CombatEvent[] = [];
  private initialEventsBuffer: CombatEvent[] = [];

  private elvenTickTimerMs: number = 0;
  private sunfireTickTimerMs: number = 0;
  private archangelTickTimerMs: number = 0;

  /**
   * 1) 전투 초기화 (initCombat)
   * - 원본 기물 상태가 오염되지 않도록 양쪽 보드 기물을 깊은 복사(Deep Clone)하여 CombatUnit 생성
   *   (하단 4~7행은 HOME 아군, 상단 0~3행은 AWAY 적군 점대칭 배치)
   * - 양쪽의 활성화된 시너지(SynergyEngine)와 장착된 아이템, 증강체 효과를 완벽히 반영
   * - 전투 시작 특수 효과 발동:
   *   1) 신성 제국(HOLY_EMPIRE) 보호막 부여
   *   2) 용족(DRAGONKIN) 시작 화염 브레스 피해 및 스킬 치명타 활성화
   *   3) 그림자 암살자(SHADOW_ASSASSIN) 적진 최후방 빈 타일로 은신 도약(Leap)
   *   4) 5코스트 3성 황금 고블린 왕 골드투스(u5_goldtooth) 개전 즉시 적 전체 99,999 폭격 및 +50G
   */
  public initCombat(home: Participant, away: Participant): CombatEvent[] {
    this.currentTick = 0;
    this.elapsedMs = 0;
    this.units = [];
    this.isFinished = false;
    this.winner = null;
    this.homeGoldEarned = 0;
    this.awayGoldEarned = 0;
    this.currentTickEvents = [];
    this.initialEventsBuffer = [];
    this.elvenTickTimerMs = 0;
    this.sunfireTickTimerMs = 0;
    this.archangelTickTimerMs = 0;

    this.homeParticipant = home;
    this.awayParticipant = away;
    this.homeSynergies = SynergyEngine.getActiveSynergyMap(home);
    this.awaySynergies = SynergyEngine.getActiveSynergyMap(away);
    this.set6TraitCombat.homeAcademyStacks = 0;
    this.set6TraitCombat.awayAcademyStacks = 0;

    if (home.socialiteSpotlights.length === 0) {
      const sc = this.homeSynergies.get('SOCIALITE')?.count ?? 0;
      if (sc > 0) {
        home.socialiteSpotlights = defaultSocialiteSpotlights(sc);
      }
    }
    if (away.socialiteSpotlights.length === 0) {
      const sc = this.awaySynergies.get('SOCIALITE')?.count ?? 0;
      if (sc > 0) {
        away.socialiteSpotlights = defaultSocialiteSpotlights(sc);
      }
    }

    // 1. HOME(아군) 기물 깊은 복사 및 배치 (4~7행, 0~6열)
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = home.board[r][c];
        if (!unit) continue;
        const combatRow = 4 + r;
        const combatCol = c;
        const cloned = this.createDeepClonedCombatUnit(
          unit,
          'HOME',
          combatRow,
          combatCol,
          home,
          this.homeSynergies,
          r,
          c
        );
        this.units.push(cloned);
      }
    }

    // 2. AWAY(적군) 기물 깊은 복사 및 점대칭 배치 (0~3행, 0~6열)
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = away.board[r][c];
        if (!unit) continue;
        const combatRow = 3 - r;
        const combatCol = Participant.BOARD_COLS - 1 - c;
        const cloned = this.createDeepClonedCombatUnit(
          unit,
          'AWAY',
          combatRow,
          combatCol,
          away,
          this.awaySynergies,
          r,
          c
        );
        this.units.push(cloned);
      }
    }

    // 3. 개전 특수 효과 발동 (신성 제국 보호막, 용족 브레스, 그림자 암살자 후방 도약, 5코 3성 골드투스 개전 권능)
    this.triggerCombatStartEffects('HOME', this.homeSynergies);
    this.triggerCombatStartEffects('AWAY', this.awaySynergies);
    this.applySet6TraitCombatStart('HOME', this.homeSynergies, home);
    this.applySet6TraitCombatStart('AWAY', this.awaySynergies, away);

    // 4. 개전 직후 이미 한쪽이 전멸했는지 확인
    this.checkCombatEndCondition();

    const startEvents = [...this.currentTickEvents];
    this.initialEventsBuffer = [...startEvents];
    return startEvents;
  }

  /**
   * 개전 시 생성된 이벤트들을 소비(반환 후 비움)한다.
   */
  public consumeInitialEvents(): CombatEvent[] {
    const ev = [...this.initialEventsBuffer];
    this.initialEventsBuffer = [];
    return ev;
  }

  /**
   * 가장 최근 stepTick에서 발생한 전투 이벤트 목록을 반환한다 (화면 VFX 렌더링용).
   */
  public getLastTickEvents(): CombatEvent[] {
    return [...this.currentTickEvents];
  }

  /**
   * 유닛의 고유 역할군/시너지/체형 특성에 따른 1칸 보행 소요 시간(ms)을 산출한다.
   * - 암살자/고블린 경보병: 360~400ms (재빠르고 날렵한 발걸음)
   * - 광전사/비룡 기병/대천사: 450~470ms (기동형 돌격)
   * - 순찰자/마법사/일반 보병: 500~540ms (표준 보행)
   * - 중장갑 선봉대/거대 나무 정령/마군주: 580~650ms (묵직하고 위압감 있는 중갑 행군)
   */
  private computeCharacteristicMoveIntervalMs(source: UnitInstance): number {
    const unitCustomMap: Record<string, number> = {
      u1_gob: 360, // 고블린 소매치기: 가장 가볍고 재빠름
      u3_kazu: 380, // 환영 자객 카즈: 닌자 질주
      u1_zix: 390, // 그림자 단검 카직: 날렵한 암살자
      u2_vayne: 430, // 은화살 사냥꾼 베인: 경장 추격자
      u2_fenrir: 440, // 광전사 펜리르: 야수 질주 (광기 발동 시 310ms로 폭주)
      u3_drake: 450, // 화염 기병 드레이크: 비룡 기병
      u5_michael: 460, // 대천사 미카엘: 날개 강림 비행
      u5_ignis: 470, // 고대 화염용 이그니스: 거룡 비행
      u1_pip: 480, // 숲의 요정 핍: 경쾌한 발걸음
      u4_sylph: 490, // 바람의 신궁 실피: 바람 걸음
      u1_elise: 500, // 성전사 수습생 엘리스
      u2_boom: 500, // 폭탄광 붐
      u2_lyra: 510, // 달빛 무녀 라이라
      u3_malakor: 510, // 영혼 수확자 말라코르
      u1_vex: 520, // 비전 학도 벡스
      u5_goldtooth: 530, // 황금 고블린 왕 골드투스
      u4_velkora: 540, // 대현자 벨코라
      u1_garen: 580, // 신성 수호병 가렌: 중갑 보병
      u1_bone: 600, // 해골 방패병 본즈: 중장갑 방패병
      u3_leona: 610, // 태양의 성기사 레오나: 중갑 대방패
      u4_astaroth: 630, // 심연의 군주 아스타로스: 거대 마군주
      u2_thorn: 650, // 가시 덩굴 수호자 쏜: 거대 고목 정령 (가장 묵직함)
    };

    if (unitCustomMap[source.unitId] !== undefined) {
      return unitCustomMap[source.unitId];
    }

    if (source.traits.includes('ASSASSIN')) return 380;
    if (source.traits.includes('BRUISER')) return 450;
    if (source.traits.includes('BODYGUARD')) return 600;
    if (source.traits.includes('SNIPER')) return 490;
    return 520;
  }

  /**
   * 원본 UnitInstance를 오염시키지 않도록 깊은 복사하고 시너지/아이템/증강체 초기 버프를 적용한다.
   */
  private createDeepClonedCombatUnit(
    source: UnitInstance,
    team: CombatTeam,
    row: number,
    col: number,
    owner: Participant,
    synergyMap: Map<TraitId, ActiveSynergyState>,
    boardRow: number,
    boardCol: number
  ): CombatUnit {
    const baseMoveIntervalMs = this.computeCharacteristicMoveIntervalMs(source);
    // 개전 직후 기물마다 자연스러운 출발 차이를 두어 기계적인 동시 이동을 방지
    const initialMoveStaggerMs =
      100 + ((row * 37 + col * 53) % 140) + (source.traits.includes('BODYGUARD') ? 60 : 0);

    const cu: CombatUnit = {
      instanceId: `${team}_${source.instanceId}`,
      unitId: source.unitId,
      name: source.name,
      team,
      cost: source.cost,
      starLevel: source.starLevel,
      traits: [...source.traits],
      icon: source.icon,
      items: [...source.items],
      row,
      col,
      maxHp: source.maxHp,
      currentHp: source.maxHp,
      shield: 0,
      atk: source.atk,
      baseAtk: source.atk,
      def: source.def,
      baseDef: source.def,
      atkSpeed: source.atkSpeed,
      baseAtkSpeed: source.atkSpeed,
      range: source.range,
      startMana: source.startMana,
      maxMana: source.maxMana,
      currentMana: source.startMana,
      spellPower: source.spellPower,
      critChance: source.critChance,
      critDamage: source.critDamage,
      omnivamp: source.omnivamp,
      enableSkillCrit: false,
      trueDamageBonusRatio: 0,
      damageReductionRatio: 0,
      ccDurationReduction: 0,
      stunTimerMs: 0,
      manaLockTimerMs: 0,
      attackCooldownMs: Math.round(1000 / Math.max(0.2, source.atkSpeed)),
      baseMoveIntervalMs,
      moveCooldownMs: initialMoveStaggerMs,
      basicAttackCount: 0,
      titansStacks: 0,
      berserkTriggered: false,
      bloodthirsterTriggered: false,
      protectorsVowTriggered: false,
      hasReviveAvailable: false,
      isReviving: false,
      reviveTimerMs: 0,
      reviveHpRatio: 0,
      reviveBonusAtkSpeed: 0,
      ownerGold: owner.gold,
      totalDamageDealt: 0,
    };

    if (cu.unitId === 'u4_jhin') {
      const jhinAttackSpeed = [0.9, 0.9, 1.4][Math.max(0, cu.starLevel - 1)] ?? 0.9;
      cu.atkSpeed = jhinAttackSpeed;
      cu.baseAtkSpeed = jhinAttackSpeed;
      cu.attackCooldownMs = Math.round(1000 / Math.max(0.2, jhinAttackSpeed));
    }
    if (cu.unitId === 'u5_jayce') {
      cu.set6JayceHammerForm = true;
      cu.range = 1;
    }

    // 아이템 고유 패시브(무한의 대검 스킬 치명타) 반영
    for (const itemId of cu.items) {
      const def = ITEM_DEFINITIONS[itemId];
      if (def?.passiveFlags.enableSkillCrit) {
        cu.enableSkillCrit = true;
      }
    }

    const originalBoardRow = team === 'HOME' ? row - 4 : 3 - row;
    applySet6AugmentSpawnBonuses(cu, {
      owner,
      synergyActiveCount: synergyMap.size,
      synergyMap,
      originalBoardRow,
      unitCost: source.cost,
    });

    // 용병(MERCENARY) 전투 스텁 — (5)(7) 수치는 TRAIT_DEFINITIONS 단일 소스
    const mercFx = synergyMap.get('MERCENARY')?.activeEffect;
    if (mercFx && cu.traits.includes('MERCENARY')) {
      if (mercFx.mercenaryCombatBonusHp) {
        cu.maxHp += mercFx.mercenaryCombatBonusHp;
        cu.currentHp += mercFx.mercenaryCombatBonusHp;
      }
      if (mercFx.mercenaryCombatBonusAtk) {
        cu.atk += mercFx.mercenaryCombatBonusAtk;
        cu.baseAtk += mercFx.mercenaryCombatBonusAtk;
      }
      if (mercFx.mercenaryCombatBonusAtkSpeed) {
        cu.atkSpeed = Number((cu.atkSpeed + mercFx.mercenaryCombatBonusAtkSpeed).toFixed(2));
      }
      if (mercFx.mercenaryCombatDamageReduction) {
        cu.damageReductionRatio = Math.max(
          cu.damageReductionRatio,
          mercFx.mercenaryCombatDamageReduction
        );
      }
    }

    // 시너지 상시 스탯 버프 반영
    // - 범죄조직(SYNDICATE): 방어/흡혈
    const syndicate = synergyMap.get('SYNDICATE')?.activeEffect;
    if (syndicate && cu.traits.includes('SYNDICATE')) {
      cu.def += syndicate.bonusDef ?? 0;
      cu.baseDef += syndicate.bonusDef ?? 0;
      cu.omnivamp += syndicate.omnivamp ?? 0;
    }

    // - 경호대(BODYGUARD): 방어력 상승
    const bodyguard = synergyMap.get('BODYGUARD')?.activeEffect;
    if (bodyguard && cu.traits.includes('BODYGUARD')) {
      cu.def += bodyguard.bonusDef ?? 0;
      cu.baseDef += bodyguard.bonusDef ?? 0;
      if (bodyguard.damageReductionFirst8s) {
        cu.damageReductionRatio = bodyguard.damageReductionFirst8s;
      }
    }

    // - 저격수(SNIPER): 사거리 증가
    const sniper = synergyMap.get('SNIPER')?.activeEffect;
    if (sniper && cu.traits.includes('SNIPER') && sniper.bonusRange) {
      cu.range += sniper.bonusRange;
    }

    // - 비전 마법사(ARCANIST): 주문력 상승
    const arcanist = synergyMap.get('ARCANIST')?.activeEffect;
    if (arcanist && cu.traits.includes('ARCANIST') && arcanist.spellPowerBonus) {
      cu.spellPower = Number((cu.spellPower + arcanist.spellPowerBonus).toFixed(2));
    }

    // - 그림자 암살자(SHADOW_ASSASSIN): 치명타 확률 및 치명타 피해량 증가
    const assassin = synergyMap.get('ASSASSIN')?.activeEffect;
    if (assassin && cu.traits.includes('ASSASSIN')) {
      cu.critChance = Math.min(1.0, cu.critChance + (assassin.bonusCritChance ?? 0));
      cu.critDamage += assassin.bonusCritDamage ?? 0;
    }

    // - 성기사(PALADIN): 아군 전체 군중제어(기절) 지속시간 감소 또는 면역
    const paladin = synergyMap.get('ENCHANTER')?.activeEffect;
    if (paladin && paladin.ccDurationReduction) {
      cu.ccDurationReduction = paladin.ccDurationReduction;
    }

    this.set6TraitCombat.applyPreCombatUnitBonuses(
      cu,
      owner,
      synergyMap,
      boardRow,
      boardCol
    );

    return cu;
  }

  private createInnovatorSummon(
    team: CombatTeam,
    cfg: { name: string; hp: number; atk: number; row: number; col: number }
  ): CombatUnit {
    return {
      instanceId: `${team}_innovator_${cfg.name}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      unitId: 'set6_innovator_mech',
      name: cfg.name,
      team,
      cost: 1,
      starLevel: 1,
      traits: [],
      icon: '🔧',
      items: [],
      row: cfg.row,
      col: cfg.col,
      maxHp: cfg.hp,
      currentHp: cfg.hp,
      shield: 0,
      atk: cfg.atk,
      baseAtk: cfg.atk,
      def: 25,
      baseDef: 25,
      atkSpeed: 0.55,
      baseAtkSpeed: 0.55,
      range: 1,
      startMana: 0,
      maxMana: 0,
      currentMana: 0,
      spellPower: 1,
      critChance: 0.1,
      critDamage: 1.4,
      omnivamp: 0,
      enableSkillCrit: false,
      trueDamageBonusRatio: 0,
      damageReductionRatio: 0,
      ccDurationReduction: 0,
      stunTimerMs: 0,
      manaLockTimerMs: 0,
      attackCooldownMs: 600,
      baseMoveIntervalMs: 520,
      moveCooldownMs: 80,
      basicAttackCount: 0,
      titansStacks: 0,
      berserkTriggered: false,
      bloodthirsterTriggered: false,
      protectorsVowTriggered: false,
      hasReviveAvailable: false,
      isReviving: false,
      reviveTimerMs: 0,
      reviveHpRatio: 0,
      reviveBonusAtkSpeed: 0,
      ownerGold: 0,
      totalDamageDealt: 0,
      set6InnovatorSummon: true,
    };
  }

  private applySet6TraitCombatStart(
    team: CombatTeam,
    synergyMap: Map<TraitId, ActiveSynergyState>,
    owner: Participant
  ): void {
    const teamUnits = this.units.filter((u) => u.team === team && u.currentHp > 0);
    const enemyUnits = this.units.filter((u) => u.team !== team && u.currentHp > 0);

    this.set6TraitCombat.applyScrapEffects(teamUnits, synergyMap, (cu, amt) => {
      this.addShield(cu, cu, amt);
    });

    this.set6TraitCombat.spawnInnovatorMechs(team, synergyMap, teamUnits, (cfg) =>
      this.createInnovatorSummon(team, cfg)
    ).forEach((s) => this.units.push(s));

    this.set6TraitCombat.applyEnforcerCombatStart(
      team,
      synergyMap,
      teamUnits,
      enemyUnits,
      (source, target, ms) => this.applyStun(source, target, ms)
    );
  }

  /**
   * 전투 시작 시 발동하는 특수 시너지 효과 처리
   */
  private triggerCombatStartEffects(
    team: CombatTeam,
    synergyMap: Map<TraitId, ActiveSynergyState>
  ): void {
    const teamUnits = this.units.filter((u) => u.team === team && u.currentHp > 0);
    const enemyUnits = this.units.filter((u) => u.team !== team && u.currentHp > 0);

    // 1. 경호대(BODYGUARD): 개전 최대 체력 비례 보호막
    const bodyguardFx = synergyMap.get('BODYGUARD')?.activeEffect;
    if (bodyguardFx?.shieldMaxHpRatio) {
      for (const u of teamUnits) {
        if (u.traits.includes('BODYGUARD')) {
          const shieldAmt = Math.round(u.maxHp * bodyguardFx.shieldMaxHpRatio);
          this.addShield(u, u, shieldAmt);
        }
      }
    }

    // 2. 암살자(ASSASSIN): 전투 시작 시 적진 후방 도약
    const targetBackRows = team === 'HOME' ? [0, 1, 2, 3] : [7, 6, 5, 4];
    for (const u of teamUnits) {
      if (u.traits.includes('ASSASSIN')) {
        const leapTile = this.findBacklineLeapTile(u, targetBackRows);
        if (leapTile && (leapTile.row !== u.row || leapTile.col !== u.col)) {
          const fromRow = u.row;
          const fromCol = u.col;
          u.row = leapTile.row;
          u.col = leapTile.col;
          this.emitEvent({
            type: 'LEAP',
            tick: this.currentTick,
            sourceId: u.instanceId,
            team: u.team,
            unitId: u.unitId,
            fromRow,
            fromCol,
            toRow: u.row,
            toCol: u.col,
            message: `🗡️ [${u.name}] 적진 후방으로 은신 도약!`,
          });
        }
      }
    }

  }

  private findBacklineLeapTile(
    assassin: CombatUnit,
    preferredRows: number[]
  ): { row: number; col: number } | null {
    const occupied = new Set<string>();
    for (const u of this.units) {
      if (u.currentHp > 0 && u.instanceId !== assassin.instanceId) {
        occupied.add(`${u.row},${u.col}`);
      }
    }

    // 자신의 원래 열(col)과 가장 가까운 열부터 탐색
    const colsOrdered = [0, 1, 2, 3, 4, 5, 6].sort(
      (a, b) => Math.abs(a - assassin.col) - Math.abs(b - assassin.col)
    );

    for (const r of preferredRows) {
      for (const c of colsOrdered) {
        if (!occupied.has(`${r},${c}`)) {
          return { row: r, col: c };
        }
      }
    }
    return null;
  }

  // ==========================================================================
  // 2. 타일 예약제 A* 길찾기 (findNextStepWithReservation - 이동 충돌 100% 방지)
  // ==========================================================================

  /**
   * 현재 유닛들이 서 있는 타일(occupiedTiles)뿐만 아니라,
   * 이번 틱에 다른 유닛이 이동하기로 결정한 타일(reservedTiles)도 장애물로 간주하여
   * A* 최단 경로 1칸을 찾는다.
   * 이동할 타일 (nextRow, nextCol)이 결정되는 즉시 reservedTiles에 등록하여
   * 두 근접 기물이 같은 칸으로 겹쳐 들어가는 버그를 100% 차단한다.
   */
  public findNextStepWithReservation(
    unit: CombatUnit,
    target: CombatUnit,
    occupiedTiles: Set<string>,
    reservedTiles: Set<string>
  ): { row: number; col: number } | null {
    const startKey = `${unit.row},${unit.col}`;
    const openList: AStarNode[] = [];
    const closedSet = new Set<string>();

    const startNode: AStarNode = {
      row: unit.row,
      col: unit.col,
      g: 0,
      h: HexGridMath.hexDistance(unit.row, unit.col, target.row, target.col),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);

    let bestGoalNode: AStarNode | null = null;

    while (openList.length > 0) {
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;
      const currentKey = `${current.row},${current.col}`;

      if (closedSet.has(currentKey)) continue;
      closedSet.add(currentKey);

      // 현재 노드가 타겟을 공격할 수 있는 육각형 사거리(Hex Distance) 내에 도달했다면 경로 완성
      const distToTarget = HexGridMath.hexDistance(
        current.row,
        current.col,
        target.row,
        target.col
      );
      if (currentKey !== startKey && distToTarget <= unit.range) {
        bestGoalNode = current;
        break;
      }

      // 육각형 6방향 인접 이웃 탐색 (짝수/홀수 행 오프셋 자동 반영)
      const hexNeighbors = HexGridMath.getHexNeighbors(
        current.row,
        current.col,
        CombatEngine.GRID_ROWS,
        CombatEngine.GRID_COLS
      );

      for (const { row: nr, col: nc } of hexNeighbors) {
        const neighborKey = `${nr},${nc}`;
        if (closedSet.has(neighborKey)) continue;

        // occupiedTiles 또는 reservedTiles에 있는 칸은 절대 통과/진입 불가
        if (occupiedTiles.has(neighborKey) || reservedTiles.has(neighborKey)) {
          continue;
        }

        const stepCost = 1.0;
        const gScore = current.g + stepCost;
        const hScore =
          HexGridMath.hexDistance(nr, nc, target.row, target.col) +
          HexGridMath.hexEuclideanDistance(nr, nc, target.row, target.col) * 0.05;
        const fScore = gScore + hScore;

        const existing = openList.find((n) => n.row === nr && n.col === nc);
        if (!existing || gScore < existing.g) {
          if (existing) {
            existing.g = gScore;
            existing.h = hScore;
            existing.f = fScore;
            existing.parent = current;
          } else {
            openList.push({
              row: nr,
              col: nc,
              g: gScore,
              h: hScore,
              f: fScore,
              parent: current,
            });
          }
        }
      }
    }

    // 만약 6방향 A*로 사거리 내 빈 육각형 타일을 찾았다면 첫 번째 이동 스텝 추출
    if (bestGoalNode) {
      let stepNode: AStarNode = bestGoalNode;
      while (stepNode.parent && stepNode.parent.parent !== null) {
        stepNode = stepNode.parent;
      }
      const nextKey = `${stepNode.row},${stepNode.col}`;
      reservedTiles.add(nextKey);
      occupiedTiles.delete(startKey);
      occupiedTiles.add(nextKey);
      return { row: stepNode.row, col: stepNode.col };
    }

    // 사거리 타일이 모두 둘러싸여 막혀있는 경우: 인접 6방향 육각형 중 타겟과 가장 가까워지는 빈 칸으로 포위 이동
    let fallbackStep: { row: number; col: number } | null = null;
    let bestFallbackHexDist = HexGridMath.hexDistance(
      unit.row,
      unit.col,
      target.row,
      target.col
    );
    let bestFallbackEuclid = HexGridMath.hexEuclideanDistance(
      unit.row,
      unit.col,
      target.row,
      target.col
    );

    const directNeighbors = HexGridMath.getHexNeighbors(
      unit.row,
      unit.col,
      CombatEngine.GRID_ROWS,
      CombatEngine.GRID_COLS
    );

    for (const { row: nr, col: nc } of directNeighbors) {
      const key = `${nr},${nc}`;
      if (occupiedTiles.has(key) || reservedTiles.has(key)) continue;

      const dHex = HexGridMath.hexDistance(nr, nc, target.row, target.col);
      const dEuc = HexGridMath.hexEuclideanDistance(nr, nc, target.row, target.col);
      if (
        dHex < bestFallbackHexDist ||
        (dHex === bestFallbackHexDist && dEuc < bestFallbackEuclid)
      ) {
        bestFallbackHexDist = dHex;
        bestFallbackEuclid = dEuc;
        fallbackStep = { row: nr, col: nc };
      }
    }

    if (fallbackStep) {
      const nextKey = `${fallbackStep.row},${fallbackStep.col}`;
      reservedTiles.add(nextKey);
      occupiedTiles.delete(startKey);
      occupiedTiles.add(nextKey);
      return fallbackStep;
    }

    return null;
  }

  // ==========================================================================
  // 3. 단일 틱 업데이트 (stepTick(deltaMs = 50): CombatEvent[])
  // ==========================================================================

  public stepTick(deltaMs: number = 50): CombatEvent[] {
    if (this.isFinished) return [];

    this.currentTick += 1;
    this.elapsedMs += deltaMs;
    this.currentTickEvents = [];

    // 1. 주기적 시너지/아이템 타이머 업데이트 (엘프 숲 2초, 태양불꽃 망토 2초, 대천사의 지팡이 4초, 선봉대 8초)
    this.processPeriodicTimers(deltaMs);

    // 2. 현재 틱의 점유 타일(occupiedTiles) 및 예약 타일(reservedTiles) 초기화
    const occupiedTiles = new Set<string>();
    const reservedTiles = new Set<string>();

    for (const u of this.units) {
      if (u.currentHp > 0 || u.isReviving) {
        for (const key of Set6TraitCombat.occupiedTileKeys(u)) {
          occupiedTiles.add(key);
        }
      }
    }

    // 3. 모든 유닛 루프 (부활 대기, 기절, 이동, 스킬 시전, 기본 공격)
    for (const unit of this.units) {
      if (this.isFinished) break;

      // 언데드 군단(UNDEAD_SCOURGE) 부활 대기 상태 처리
      if (unit.isReviving) {
        unit.reviveTimerMs -= deltaMs;
        if (unit.reviveTimerMs <= 0) {
          unit.isReviving = false;
          unit.currentHp = Math.max(1, Math.round(unit.maxHp * unit.reviveHpRatio));
          unit.atkSpeed = Number(
            (unit.atkSpeed * (1 + unit.reviveBonusAtkSpeed)).toFixed(3)
          );
          unit.stunTimerMs = 0;
          this.emitEvent({
            type: 'REVIVE_COMPLETE',
            tick: this.currentTick,
            sourceId: unit.instanceId,
            team: unit.team,
            unitId: unit.unitId,
            toRow: unit.row,
            toCol: unit.col,
            amount: unit.currentHp,
            message: `💀 [${unit.name}] 언데드 군단 권능으로 부활!`,
          });
        }
        continue;
      }

      if (unit.currentHp <= 0) continue;

      // 마나 락, 공격 쿨타임 및 이동 쿨타임 감소
      if (unit.manaLockTimerMs > 0) {
        unit.manaLockTimerMs = Math.max(0, unit.manaLockTimerMs - deltaMs);
      }
      if (unit.attackCooldownMs > 0) {
        unit.attackCooldownMs = Math.max(0, unit.attackCooldownMs - deltaMs);
      }
      if (unit.moveCooldownMs > 0) {
        unit.moveCooldownMs = Math.max(0, unit.moveCooldownMs - deltaMs);
      }

      // 기절(Stun) 상태 확인
      if (unit.stunTimerMs > 0) {
        unit.stunTimerMs = Math.max(0, unit.stunTimerMs - deltaMs);
        continue;
      }

      // 가장 가까운 살아있는 적 타겟 탐색
      const target = this.findNearestEnemy(unit);
      if (!target) {
        break;
      }

      const dist = this.chebyshevDistance(
        unit.row,
        unit.col,
        target.row,
        target.col
      );

      // 사거리 밖에 있으면 유닛 고유 보행 주기(moveCooldownMs)가 돌아왔을 때만 1칸 이동
      if (dist > unit.range) {
        if (unit.moveCooldownMs > 0) {
          continue;
        }
        const nextTile = this.findNextStepWithReservation(
          unit,
          target,
          occupiedTiles,
          reservedTiles
        );
        if (nextTile) {
          const fromRow = unit.row;
          const fromCol = unit.col;
          unit.row = nextTile.row;
          unit.col = nextTile.col;
          const stepIntervalMs = unit.berserkTriggered
            ? Math.max(260, Math.round(unit.baseMoveIntervalMs * 0.72))
            : unit.baseMoveIntervalMs;
          unit.moveCooldownMs = stepIntervalMs;

          this.emitEvent({
            type: 'MOVE',
            tick: this.currentTick,
            sourceId: unit.instanceId,
            team: unit.team,
            unitId: unit.unitId,
            fromRow,
            fromCol,
            toRow: unit.row,
            toCol: unit.col,
            durationMs: stepIntervalMs,
          });
        }
        continue;
      }


      // 사거리 내에 타겟이 있을 때:
      // A) 마나가 가득 찼다면 즉시 스킬 시전!
      if (unit.currentMana >= unit.maxMana && unit.maxMana > 0) {
        this.castUnitSkill(unit, target);
        this.checkCombatEndCondition();
        continue;
      }

      // B) 공격 쿨타임이 돌아왔다면 기본 공격 실행!
      if (unit.attackCooldownMs <= 0) {
        this.performBasicAttack(unit, target);
        unit.attackCooldownMs = Math.max(
          150,
          Math.round(1000 / Math.max(0.25, unit.atkSpeed))
        );
        this.checkCombatEndCondition();
      }
    }

    this.checkCombatEndCondition();
    return [...this.currentTickEvents];
  }

  /**
   * [⚡ 즉시 결과 스킵] 버튼을 위해 전투가 끝날 때까지 남은 모든 틱을 즉시 시뮬레이션한다.
   */
  public simulateToCompletion(): CombatEvent[] {
    const allEvents: CombatEvent[] = [...this.consumeInitialEvents()];
    let safetySteps = 0;
    while (!this.isFinished && safetySteps < 1000) {
      const evs = this.stepTick(50);
      allEvents.push(...evs);
      safetySteps++;
    }
    return allEvents;
  }

  /**
   * 스킬 시전 처리 (5코스트 3성 FIVE_COST_3STAR_CATACLYSM 특수 이벤트 및 대마법사 연쇄 번개 포함)
   */
  private castUnitSkill(unit: CombatUnit, target: CombatUnit): void {
    const template = UNIT_TEMPLATES[unit.unitId];
    const skillName = template?.skill.name ?? '스킬';
    const manaLockMs = template?.skill.manaLockMs ?? 1000;

    // 푸른 파수꾼(BLUE_BUFF) 보유 시 스킬 시전 직후 마나 20 페이백
    const hasBlueBuff = unit.items.some(
      (id) => ITEM_DEFINITIONS[id]?.passiveFlags.blueBuffReset
    );
    unit.currentMana = hasBlueBuff ? 20 : 0;
    unit.manaLockTimerMs = manaLockMs;

    // 5코스트 3성 절대 권능(FIVE_COST_3STAR_CATACLYSM) 이벤트 발행!
    if (unit.cost === 5 && unit.starLevel === 3) {
      this.emitEvent({
        type: 'FIVE_COST_3STAR_CATACLYSM',
        tick: this.currentTick,
        sourceId: unit.instanceId,
        targetId: target.instanceId,
        team: unit.team,
        unitId: unit.unitId,
        skillName,
        toRow: target.row,
        toCol: target.col,
        message: `⚡👑 [5코스트 3성 절대 권능!] ${unit.name} - [${skillName}] 발동!!`,
      });
    }

    this.emitEvent({
      type: 'SKILL_CAST',
      tick: this.currentTick,
      sourceId: unit.instanceId,
      targetId: target.instanceId,
      team: unit.team,
      unitId: unit.unitId,
      skillName,
      skillType: template?.skill.skillType,
      fromRow: unit.row,
      fromCol: unit.col,
      toRow: target.row,
      toCol: target.col,
    });

    // SkillRegistry 전략 핸들러 실행
    SkillRegistry.executeSkill(unit, target, this.units, this);

    const synergyMap =
      unit.team === 'HOME' ? this.homeSynergies : this.awaySynergies;
    this.set6TraitCombat.onAcademySkillCast(unit.team, synergyMap);
    this.set6TraitCombat.applyAcademyOnCast(
      unit.team,
      this.units.filter((u) => u.team === unit.team && u.currentHp > 0),
      synergyMap
    );
    if (unit.set6MutantAdrenaline) {
      unit.atkSpeed = Number(Math.min(5, unit.atkSpeed * 1.35).toFixed(3));
    }

    const owner = unit.team === 'HOME' ? this.homeParticipant : this.awayParticipant;

    // 대마법사(ARCHMAGE) 시너지 활성화 시: 스킬 시전할 때 체력이 가장 낮은 적에게 연쇄 번개 추가 낙하!
    const archmageEffect = synergyMap.get('ARCANIST')?.activeEffect;
    if (
      archmageEffect &&
      unit.traits.includes('ARCANIST') &&
      archmageEffect.chainLightningDamage
    ) {
      const aliveEnemies = this.units
        .filter((e) => e.team !== unit.team && e.currentHp > 0 && !e.isReviving)
        .sort((a, b) => a.currentHp - b.currentHp);

      if (aliveEnemies.length > 0) {
        this.dealDamage(
          unit,
          aliveEnemies[0],
          archmageEffect.chainLightningDamage * unit.spellPower,
          'MAGICAL',
          unit.enableSkillCrit,
          true
        );
      }
    }
  }


  /**
   * 기본 공격 및 직업/아이템 온히트 효과 처리
   */
  private performBasicAttack(attacker: CombatUnit, target: CombatUnit): void {
    attacker.basicAttackCount += 1;

    this.emitEvent({
      type: 'BASIC_ATTACK',
      tick: this.currentTick,
      sourceId: attacker.instanceId,
      targetId: target.instanceId,
      team: attacker.team,
      unitId: attacker.unitId,
      fromRow: attacker.row,
      fromCol: attacker.col,
      toRow: target.row,
      toCol: target.col,
    });

    // 1. 기본 물리 공격 피해 적용 (공식: rawAtk * (100 / (100 + targetDef))는 dealDamage 내부에서 수행)
    this.dealDamage(attacker, target, attacker.atk, 'PHYSICAL', true, false);

    const skillTemplate = UNIT_TEMPLATES[attacker.unitId]?.skill;
    if (skillTemplate) {
      const starIdx = Math.max(0, Math.min(2, attacker.starLevel - 1));
      const skillPrimary =
        skillTemplate.baseValueByStar[starIdx] * attacker.spellPower;
      const skillSecondary = skillTemplate.secondaryValueByStar?.[starIdx] ?? 0;

      if (attacker.unitId === 'u2_warwick' && attacker.maxMana === 0) {
        const onHit = target.currentHp * (skillPrimary / 100);
        this.dealDamage(attacker, target, onHit, 'MAGICAL', false, true);
        if (skillSecondary > 0) {
          this.healUnit(attacker, attacker, skillSecondary);
        }
      }

      if (attacker.unitId === 'u2_talon' && attacker.maxMana === 0) {
        if (attacker.basicAttackCount === 1 || attacker.basicAttackCount % 3 === 0) {
          this.dealDamage(attacker, target, skillPrimary, 'MAGICAL', false, true);
        }
      }

      if (attacker.unitId === 'u5_viktor') {
        target.def = Math.max(5, Math.round(target.def * 0.3));
      }

      if (
        attacker.unitId === 'u2_kogmaw' &&
        attacker.set6KogmawBarrageUntilMs &&
        this.elapsedMs <= attacker.set6KogmawBarrageUntilMs &&
        attacker.set6KogmawOnHitPct
      ) {
        const pct = attacker.set6KogmawOnHitPct / 100;
        this.dealDamage(attacker, target, target.maxHp * pct, 'MAGICAL', false, true);
      }
    }

    if (
      attacker.unitId === 'u2_kogmaw' &&
      attacker.set6KogmawBarrageUntilMs &&
      this.elapsedMs > attacker.set6KogmawBarrageUntilMs
    ) {
      const template = UNIT_TEMPLATES[attacker.unitId];
      attacker.set6KogmawBarrageUntilMs = undefined;
      attacker.set6KogmawOnHitPct = undefined;
      if (template) {
        attacker.range = template.stats.range;
      }
    }

    // 2. 공격자 마나 회복: 기본 +10 + 마탑(ARCANE_TOWER) 보너스 + 쇼진의 창(SPEAR_OF_SHOJIN) 보너스
    const synergyMap =
      attacker.team === 'HOME' ? this.homeSynergies : this.awaySynergies;
    const arcaneBonus =
      synergyMap.get('SCHOLAR')?.activeEffect?.teamManaPerAttack ?? 0;

    let shojinBonus = 0;
    for (const itemId of attacker.items) {
      const pf = ITEM_DEFINITIONS[itemId]?.passiveFlags;
      if (pf?.shojinBonusMana) {
        shojinBonus += pf.shojinBonusMana;
      }
      if (pf?.guinsooStackingAtkSpeed) {
        attacker.atkSpeed = Number(
          Math.min(5.0, attacker.atkSpeed * (1 + pf.guinsooStackingAtkSpeed)).toFixed(3)
        );
      }
    }

    const socialiteMana = attacker.set6SocialiteManaPerAttack ?? 0;
    this.grantMana(attacker, 10 + arcaneBonus + shojinBonus + socialiteMana);
    this.incrementTitansResolve(attacker);

    // 3. 광전사(BERSERKER) 광폭화 중 스플래시 피해 처리
    const berserkerEffect = synergyMap.get('BRUISER')?.activeEffect;
    if (
      berserkerEffect &&
      attacker.traits.includes('BRUISER') &&
      attacker.berserkTriggered &&
      berserkerEffect.berserkSplashRatio
    ) {
      const splashDmg = attacker.atk * berserkerEffect.berserkSplashRatio;
      const nearbyEnemies = this.units.filter(
        (e) =>
          e.team !== attacker.team &&
          e.currentHp > 0 &&
          !e.isReviving &&
          e.instanceId !== target.instanceId &&
          this.chebyshevDistance(target.row, target.col, e.row, e.col) <= 1
      );
      for (const enemy of nearbyEnemies) {
        this.dealDamage(attacker, enemy, splashDmg, 'PHYSICAL', false, false);
      }
    }

    // 4. 순찰자(RANGER) 3타마다 관통 화살 추가 발사
    const twinShotEffect = synergyMap.get('TWINSHOT')?.activeEffect;
    if (
      twinShotEffect &&
      attacker.traits.includes('TWINSHOT') &&
      attacker.basicAttackCount % 2 === 0 &&
      twinShotEffect.pierceArrowDamageRatio
    ) {
      if (target.currentHp > 0) {
        this.dealDamage(
          attacker,
          target,
          attacker.atk * twinShotEffect.pierceArrowDamageRatio,
          'PHYSICAL',
          true,
          false
        );
      }
    }

    // 5. 스태틱의 단검(STATIKK_SHIV) 3타마다 적 3명에게 연쇄 번개 및 방어력 30% 파쇄
    const hasStatikk = attacker.items.some(
      (id) => ITEM_DEFINITIONS[id]?.passiveFlags.statikkChainLightning
    );
    if (hasStatikk && attacker.basicAttackCount % 3 === 0) {
      const bounceTargets = this.units
        .filter((e) => e.team !== attacker.team && e.currentHp > 0 && !e.isReviving)
        .slice(0, 3);
      for (const bt of bounceTargets) {
        this.shredArmor(attacker, bt, 0.3);
        this.dealDamage(attacker, bt, 90, 'MAGICAL', false, true);
      }
    }

    // 6. 성기사(PALADIN) 기본 공격 시 주변 아군 체력 회복
    const paladinEffect = synergyMap.get('ENCHANTER')?.activeEffect;
    if (
      paladinEffect &&
      attacker.traits.includes('ENCHANTER') &&
      paladinEffect.healPerAttack
    ) {
      const allies = this.units
        .filter((a) => a.team === attacker.team && a.currentHp > 0 && !a.isReviving)
        .sort((a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp);
      if (allies.length > 0) {
        this.healUnit(attacker, allies[0], paladinEffect.healPerAttack);
      }
    }
  }

  // ==========================================================================
  // 4. 데미지 계산, 치명타, 보호막, 흡혈, 사망/부활 처리 (SkillCombatContext 구현)
  // ==========================================================================

  public dealDamage(
    attacker: CombatUnit,
    target: CombatUnit,
    rawAmount: number,
    damageType: CombatDamageType,
    canCrit: boolean,
    isSkill: boolean
  ): { actualDamage: number; killed: boolean; isCrit: boolean } {
    if (target.currentHp <= 0 || target.isReviving) {
      return { actualDamage: 0, killed: false, isCrit: false };
    }

    let modifiedRaw = Math.max(1, rawAmount);

    // 거인 학살자(GIANT_SLAYER): 대상 최대 체력 1300 이상일 때 피해량 +35%
    if (
      target.maxHp >= 1300 &&
      attacker.items.some((id) => ITEM_DEFINITIONS[id]?.passiveFlags.giantSlayerBonus)
    ) {
      modifiedRaw *= 1.35;
    }

    // 치명타 판정 (가시 갑옷 BRAMBLE_VEST 보유 피격자는 치명타 추가 피해 무효화)
    let isCrit = false;
    if (canCrit && Math.random() < attacker.critChance) {
      isCrit = true;
      const targetHasBramble = target.items.some(
        (id) => ITEM_DEFINITIONS[id]?.passiveFlags.brambleReflect
      );
      if (!targetHasBramble) {
        modifiedRaw *= attacker.critDamage;
      }
    }

    // 방어력 감산 공식: raw * (100 / (100 + targetDef))
    let mitigatedDamage = modifiedRaw;
    if (damageType !== 'TRUE') {
      const effectiveDef = Math.max(0, target.def);
      mitigatedDamage = modifiedRaw * (100 / (100 + effectiveDef));
    }

    // 선봉대(VANGUARD) 개전 8초간 피해 감소 적용
    if (target.damageReductionRatio > 0 && damageType !== 'TRUE') {
      mitigatedDamage *= 1 - target.damageReductionRatio;
    }

    // 심연의 악마(ABYSSAL_DEMON) 추가 고정 피해 합산
    if (attacker.trueDamageBonusRatio > 0 && damageType !== 'TRUE') {
      mitigatedDamage += modifiedRaw * attacker.trueDamageBonusRatio;
    }

    const finalDamage = Math.max(1, Math.round(mitigatedDamage));
    attacker.totalDamageDealt += finalDamage;

    // 보호막 우선 차감 후 체력 차감
    let remainingDmg = finalDamage;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, remainingDmg);
      target.shield -= absorbed;
      remainingDmg -= absorbed;
    }

    target.currentHp = Math.max(0, target.currentHp - remainingDmg);

    this.emitEvent({
      type: 'DAMAGE',
      tick: this.currentTick,
      sourceId: attacker.instanceId,
      targetId: target.instanceId,
      team: attacker.team,
      unitId: attacker.unitId,
      toRow: target.row,
      toCol: target.col,
      amount: finalDamage,
      damageType,
      isCrit,
    });

    // 공격자 모든 피해 흡혈(Omnivamp) 및 마법공학 총검(HEXTECH_GUNBLADE) 아군 치유
    if (attacker.omnivamp > 0 && attacker.currentHp > 0) {
      this.healUnit(attacker, attacker, Math.round(finalDamage * attacker.omnivamp));
    }
    if (
      attacker.currentHp > 0 &&
      attacker.items.some((id) => ITEM_DEFINITIONS[id]?.passiveFlags.gunbladeAllyHeal)
    ) {
      const lowestAlly = this.units
        .filter((a) => a.team === attacker.team && a.currentHp > 0 && !a.isReviving)
        .sort((a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp)[0];
      if (lowestAlly) {
        this.healUnit(attacker, lowestAlly, Math.round(finalDamage * 0.25));
      }
    }

    // 피격자 마나 회복 (마나 락 상태가 아닐 때만) 및 피격 트리거 처리
    if (target.currentHp > 0) {
      const manaFromDamage = Math.min(35, Math.max(4, Math.round(finalDamage * 0.06)));
      this.grantMana(target, manaFromDamage);
      this.incrementTitansResolve(target);
      this.checkLowHpThresholds(target);

      // 가시 갑옷(BRAMBLE_VEST) 기본 공격 피격 시 반사 피해
      if (
        !isSkill &&
        target.items.some((id) => ITEM_DEFINITIONS[id]?.passiveFlags.brambleReflect)
      ) {
        const adjEnemies = this.units.filter(
          (e) =>
            e.team !== target.team &&
            e.currentHp > 0 &&
            !e.isReviving &&
            this.chebyshevDistance(target.row, target.col, e.row, e.col) <= 1
        );
        for (const e of adjEnemies) {
          this.dealDamage(target, e, 120, 'MAGICAL', false, true);
        }
      }
    } else {
      // 사망 또는 언데드 군단(UNDEAD_SCOURGE) 부활 대기 진입
      if (target.hasReviveAvailable) {
        target.hasReviveAvailable = false;
        target.isReviving = true;
        target.reviveTimerMs = 2000; // 2초 뒤 부활!
        this.emitEvent({
          type: 'REVIVE_START',
          tick: this.currentTick,
          sourceId: target.instanceId,
          team: target.team,
          unitId: target.unitId,
          toRow: target.row,
          toCol: target.col,
          message: `💀 [${target.name}] 2초 뒤 부활합니다...`,
        });
        return { actualDamage: finalDamage, killed: false, isCrit };
      } else {
        this.emitEvent({
          type: 'DEATH',
          tick: this.currentTick,
          sourceId: attacker.instanceId,
          targetId: target.instanceId,
          team: target.team,
          unitId: target.unitId,
          toRow: target.row,
          toCol: target.col,
        });

        const killTeamOwner =
          attacker.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
        const thrillTier = killTeamOwner
          ? participantEffectTier(killTeamOwner.augments, 'THRILL_OF_THE_HUNT')
          : 0;
        if (thrillTier > 0) {
          const healAmt = [0, 400, 700, 700][thrillTier];
          attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmt);
        }

        return { actualDamage: finalDamage, killed: true, isCrit };
      }
    }

    return { actualDamage: finalDamage, killed: false, isCrit };
  }

  public healUnit(source: CombatUnit, target: CombatUnit, amount: number): number {
    if (target.currentHp <= 0 || target.isReviving || amount <= 0) return 0;
    const rounded = Math.round(amount);
    const prevHp = target.currentHp;
    target.currentHp = Math.min(target.maxHp, target.currentHp + rounded);
    const actualHeal = target.currentHp - prevHp;

    const owner =
      target.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
    if (owner && prevHp + rounded > target.maxHp) {
      const cap = celestialBlessingShieldCap(owner.augments);
      if (cap > 0) {
        const overheal = prevHp + rounded - target.maxHp;
        target.shield = Math.min(target.shield + overheal, Math.max(target.shield, cap));
      }
    }

    if (actualHeal > 0) {
      this.emitEvent({
        type: 'HEAL',
        tick: this.currentTick,
        sourceId: source.instanceId,
        targetId: target.instanceId,
        team: target.team,
        unitId: target.unitId,
        toRow: target.row,
        toCol: target.col,
        amount: actualHeal,
      });
    }
    return actualHeal;
  }

  public addShield(source: CombatUnit, target: CombatUnit, amount: number): void {
    if (target.currentHp <= 0 || target.isReviving || amount <= 0) return;
    const rounded = Math.round(amount);
    target.shield += rounded;
    this.emitEvent({
      type: 'SHIELD',
      tick: this.currentTick,
      sourceId: source.instanceId,
      targetId: target.instanceId,
      team: target.team,
      unitId: target.unitId,
      toRow: target.row,
      toCol: target.col,
      amount: rounded,
    });
  }

  public applyStun(
    source: CombatUnit,
    target: CombatUnit,
    durationMs: number
  ): void {
    if (target.currentHp <= 0 || target.isReviving) return;
    // 성기사(PALADIN) 군중제어 감소/면역 반영
    const effectiveDuration = Math.round(
      durationMs * Math.max(0, 1 - target.ccDurationReduction)
    );
    if (effectiveDuration <= 0) return;

    target.stunTimerMs = Math.max(target.stunTimerMs, effectiveDuration);
    this.emitEvent({
      type: 'STUN',
      tick: this.currentTick,
      sourceId: source.instanceId,
      targetId: target.instanceId,
      team: target.team,
      unitId: target.unitId,
      toRow: target.row,
      toCol: target.col,
      amount: effectiveDuration,
    });
  }

  public shredArmor(
    source: CombatUnit,
    target: CombatUnit,
    shredRatio: number
  ): void {
    if (target.currentHp <= 0 || target.isReviving) return;
    target.def = Math.max(5, Math.round(target.def * (1 - shredRatio)));
    this.emitEvent({
      type: 'ARMOR_SHRED',
      tick: this.currentTick,
      sourceId: source.instanceId,
      targetId: target.instanceId,
      team: target.team,
      unitId: target.unitId,
      toRow: target.row,
      toCol: target.col,
    });
  }

  public teleportUnit(
    unit: CombatUnit,
    targetRow: number,
    targetCol: number
  ): boolean {
    const occupied = this.units.some(
      (u) =>
        u.instanceId !== unit.instanceId &&
        (u.currentHp > 0 || u.isReviving) &&
        u.row === targetRow &&
        u.col === targetCol
    );
    if (occupied) return false;

    const fromRow = unit.row;
    const fromCol = unit.col;
    unit.row = targetRow;
    unit.col = targetCol;
    this.emitEvent({
      type: 'LEAP',
      tick: this.currentTick,
      sourceId: unit.instanceId,
      team: unit.team,
      unitId: unit.unitId,
      fromRow,
      fromCol,
      toRow: targetRow,
      toCol: targetCol,
    });
    return true;
  }

  public findEmptyTileBehindTarget(
    mover: CombatUnit,
    target: CombatUnit
  ): { row: number; col: number } | null {
    const occupied = new Set<string>();
    for (const u of this.units) {
      if (u.instanceId !== mover.instanceId && (u.currentHp > 0 || u.isReviving)) {
        occupied.add(`${u.row},${u.col}`);
      }
    }

    // 타겟 주변 6방향 육각형 이웃 중 적진 깊숙한 방향(HOME이면 row가 작은 쪽, AWAY이면 row가 큰 쪽) 우선 정렬
    const hexNeighbors = HexGridMath.getHexNeighbors(
      target.row,
      target.col,
      CombatEngine.GRID_ROWS,
      CombatEngine.GRID_COLS
    );
    hexNeighbors.sort((a, b) =>
      mover.team === 'HOME' ? a.row - b.row : b.row - a.row
    );

    for (const { row: r, col: c } of hexNeighbors) {
      if (!occupied.has(`${r},${c}`)) {
        return { row: r, col: c };
      }
    }
    return null;
  }

  public emitEvent(event: CombatEvent): void {
    if (event.type === 'GOLD_DROP' && event.goldAmount) {
      if (event.team === 'HOME') {
        this.homeGoldEarned += event.goldAmount;
        if (this.homeParticipant) {
          this.homeParticipant.gold += event.goldAmount;
        }
      } else if (event.team === 'AWAY') {
        this.awayGoldEarned += event.goldAmount;
        if (this.awayParticipant) {
          this.awayParticipant.gold += event.goldAmount;
        }
      }
    }
    this.currentTickEvents.push(event);
  }

  // ==========================================================================
  // 내부 보조 메서드 (마나, 광전사/아이템 체력 임계값, 주기적 타이머, 종료 판정)
  // ==========================================================================

  private grantMana(unit: CombatUnit, amount: number): void {
    if (unit.manaLockTimerMs > 0 || unit.maxMana <= 0 || unit.currentHp <= 0) {
      return;
    }
    unit.currentMana = Math.min(unit.maxMana, unit.currentMana + amount);
  }

  private incrementTitansResolve(unit: CombatUnit): void {
    const hasTitans = unit.items.some(
      (id) => ITEM_DEFINITIONS[id]?.passiveFlags.titansResolveStacking
    );
    if (!hasTitans || unit.titansStacks >= 25) return;

    unit.titansStacks += 1;
    unit.atk = Math.round(unit.atk * 1.02);
    unit.spellPower = Number((unit.spellPower + 0.02).toFixed(2));
    if (unit.titansStacks === 25) {
      unit.def += 35;
    }
  }

  private checkLowHpThresholds(unit: CombatUnit): void {
    const hpRatio = unit.currentHp / unit.maxHp;

    const synergyMap =
      unit.team === 'HOME' ? this.homeSynergies : this.awaySynergies;

    // 1. 난동꾼(BRUISER) / 화학공학(CHEMTECH): 체력 임계 시 버스트 (스텁)
    const chemThreshold = unit.traits.includes('CHEMTECH') ? 0.6 : 0.5;
    const burstTrait: TraitId | null = unit.traits.includes('CHEMTECH')
      ? 'CHEMTECH'
      : unit.traits.includes('BRUISER')
        ? 'BRUISER'
        : null;
    if (!unit.berserkTriggered && burstTrait && hpRatio <= chemThreshold) {
      const berserkEffect = synergyMap.get(burstTrait)?.activeEffect;
      if (berserkEffect) {
        unit.berserkTriggered = true;
        unit.atk = Math.round(unit.atk * (berserkEffect.berserkAtkMultiplier ?? 2.0));
        unit.atkSpeed = Number(
          Math.min(
            5.0,
            unit.atkSpeed * (berserkEffect.berserkAtkSpeedMultiplier ?? 2.0)
          ).toFixed(3)
        );
      }
    }

    // 2. 피바라기(BLOODTHIRSTER): 체력 40% 이하 시 최대 체력 30% 보호막
    if (
      !unit.bloodthirsterTriggered &&
      hpRatio <= 0.4 &&
      unit.items.some((id) => ITEM_DEFINITIONS[id]?.passiveFlags.bloodthirsterShield)
    ) {
      unit.bloodthirsterTriggered = true;
      this.addShield(unit, unit, Math.round(unit.maxHp * 0.3));
    }

    // 3. 수호자의 맹세(PROTECTORS_VOW): 체력 40% 이하 시 최대 체력 25% 보호막 및 방어력 +30
    if (
      !unit.protectorsVowTriggered &&
      hpRatio <= 0.4 &&
      unit.items.some((id) => ITEM_DEFINITIONS[id]?.passiveFlags.protectorsVowShield)
    ) {
      unit.protectorsVowTriggered = true;
      unit.def += 30;
      this.addShield(unit, unit, Math.round(unit.maxHp * 0.25));
    }
  }

  private processPeriodicTimers(deltaMs: number): void {
  // 초월 (Ascension): 15초 후 아군 피해 +50%
    if (this.elapsedMs >= 15000 && this.elapsedMs - deltaMs < 15000) {
      for (const u of this.units) {
        if (u.currentHp <= 0 || u.isReviving) continue;
        const owner = u.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
        if (owner && participantHasEffect(owner.augments, 'ASCENSION')) {
          u.atk = Math.round(u.atk * 1.5);
          u.baseAtk = Math.round(u.baseAtk * 1.5);
          u.spellPower = Number((u.spellPower * 1.5).toFixed(2));
        }
      }
    }

    // 선봉대(VANGUARD) 개전 8초 경과 시 추가 피해감소 해제
    if (this.elapsedMs >= 8000) {
      for (const u of this.units) {
        if (u.damageReductionRatio > 0) {
          u.damageReductionRatio = 0;
        }
      }
    }

    // 엘프 숲(ELVEN_SYLVAN): 매 2초마다 공속 중첩 및 체력 회복
    this.elvenTickTimerMs += deltaMs;
    if (this.elvenTickTimerMs >= 2000) {
      this.elvenTickTimerMs -= 2000;
      for (const u of this.units) {
        if (u.currentHp <= 0 || u.isReviving || !u.traits.includes('SCHOLAR')) {
          continue;
        }
        const synergyMap =
          u.team === 'HOME' ? this.homeSynergies : this.awaySynergies;
        const elven = synergyMap.get('SCHOLAR')?.activeEffect;
        if (elven) {
          if (elven.atkSpeedPerStack) {
            u.atkSpeed = Number(
              Math.min(5.0, u.atkSpeed * (1 + elven.atkSpeedPerStack)).toFixed(3)
            );
          }
          if (elven.hpRegenRatioPerTick) {
            this.healUnit(u, u, Math.round(u.maxHp * elven.hpRegenRatioPerTick));
          }
        }
      }
    }

    // 태양불꽃 망토(SUNFIRE_CAPE): 매 2초마다 주변 2칸 적에게 최대 체력 8% 고정 화상 피해
    this.sunfireTickTimerMs += deltaMs;
    if (this.sunfireTickTimerMs >= 2000) {
      this.sunfireTickTimerMs -= 2000;
      for (const u of this.units) {
        if (u.currentHp <= 0 || u.isReviving) continue;
        const hasSunfire = u.items.some(
          (id) => ITEM_DEFINITIONS[id]?.passiveFlags.sunfireBurnAura
        );
        if (!hasSunfire) continue;

        const nearbyEnemies = this.units.filter(
          (e) =>
            e.team !== u.team &&
            e.currentHp > 0 &&
            !e.isReviving &&
            this.chebyshevDistance(u.row, u.col, e.row, e.col) <= 2
        );
        for (const e of nearbyEnemies) {
          this.dealDamage(u, e, Math.round(e.maxHp * 0.08), 'TRUE', false, true);
        }
      }
    }

    // 대천사의 지팡이(ARCHANGELS_STAFF): 매 3초마다 주문력 +25% 영구 중첩
    this.archangelTickTimerMs += deltaMs;
    if (this.archangelTickTimerMs >= 3000) {
      this.archangelTickTimerMs -= 3000;
      for (const u of this.units) {
        if (u.currentHp <= 0 || u.isReviving) continue;
        const count = u.items.filter(
          (id) => ITEM_DEFINITIONS[id]?.passiveFlags.archangelManaScaling
        ).length;
        if (count > 0) {
          u.spellPower = Number((u.spellPower + 0.25 * count).toFixed(2));
        }
      }
    }
  }

  private findNearestEnemy(unit: CombatUnit): CombatUnit | null {
    let bestTarget: CombatUnit | null = null;
    let bestHexDist = 9999;
    let bestEuclidDist = 9999;

    for (const other of this.units) {
      if (other.team === unit.team) continue;
      if (other.currentHp <= 0 || other.isReviving) continue;

      const hexDist = HexGridMath.hexDistance(
        unit.row,
        unit.col,
        other.row,
        other.col
      );
      const euclidDist = HexGridMath.hexEuclideanDistance(
        unit.row,
        unit.col,
        other.row,
        other.col
      );
      if (
        hexDist < bestHexDist ||
        (hexDist === bestHexDist && euclidDist < bestEuclidDist)
      ) {
        bestHexDist = hexDist;
        bestEuclidDist = euclidDist;
        bestTarget = other;
      }
    }

    return bestTarget;
  }

  public chebyshevDistance(
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ): number {
    return HexGridMath.hexDistance(r1, c1, r2, c2);
  }

  private checkCombatEndCondition(): void {
    const homeAlive = this.units.filter(
      (u) => u.team === 'HOME' && (u.currentHp > 0 || u.isReviving)
    ).length;
    const awayAlive = this.units.filter(
      (u) => u.team === 'AWAY' && (u.currentHp > 0 || u.isReviving)
    ).length;

    if (homeAlive === 0 && awayAlive === 0) {
      this.isFinished = true;
      this.winner = 'DRAW';
    } else if (awayAlive === 0) {
      this.isFinished = true;
      this.winner = 'HOME';
    } else if (homeAlive === 0) {
      this.isFinished = true;
      this.winner = 'AWAY';
    } else if (this.elapsedMs >= CombatEngine.MAX_COMBAT_MS) {
      this.isFinished = true;
      const homeHpSum = this.units
        .filter((u) => u.team === 'HOME' && u.currentHp > 0)
        .reduce((acc, u) => acc + u.currentHp, 0);
      const awayHpSum = this.units
        .filter((u) => u.team === 'AWAY' && u.currentHp > 0)
        .reduce((acc, u) => acc + u.currentHp, 0);
      this.winner =
        homeHpSum > awayHpSum
          ? 'HOME'
          : awayHpSum > homeHpSum
          ? 'AWAY'
          : 'DRAW';
    }
  }

  /**
   * 전투 종료 후 요약 데이터(승패, 생존 기물 수, 플레이어 피해량 등)를 반환한다.
   */
  public getCombatSummary(stageNumber: number = 2): CombatSummary {
    const survivingHomeUnits = this.units.filter(
      (u) => u.team === 'HOME' && (u.currentHp > 0 || u.isReviving)
    ).length;
    const survivingAwayUnits = this.units.filter(
      (u) => u.team === 'AWAY' && (u.currentHp > 0 || u.isReviving)
    ).length;

    const winner = this.winner ?? 'DRAW';
    let playerDamageTaken = 0;

    if (winner === 'AWAY') {
      const baseStageDmg = Math.max(2, stageNumber * 2);
      playerDamageTaken = baseStageDmg + survivingAwayUnits * 2;
    } else if (winner === 'DRAW') {
      playerDamageTaken = 2;
    }

    return {
      winner,
      survivingHomeUnits,
      survivingAwayUnits,
      homeGoldEarnedInCombat: this.homeGoldEarned,
      awayGoldEarnedInCombat: this.awayGoldEarned,
      playerDamageTaken,
      totalTicks: this.currentTick,
    };
  }
}

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
          this.homeSynergies
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
          this.awaySynergies
        );
        this.units.push(cloned);
      }
    }

    // 3. 개전 특수 효과 발동 (신성 제국 보호막, 용족 브레스, 그림자 암살자 후방 도약, 5코 3성 골드투스 개전 권능)
    this.triggerCombatStartEffects('HOME', this.homeSynergies);
    this.triggerCombatStartEffects('AWAY', this.awaySynergies);

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
    // 근접 유닛이 전장을 순식간에 가로지르지 않도록 전체적으로 ~35% 느리게 조정
    const unitCustomMap: Record<string, number> = {
      u1_gob: 500,
      u3_kazu: 520,
      u1_zix: 530,
      u2_vayne: 580,
      u2_fenrir: 600,
      u3_drake: 610,
      u5_michael: 620,
      u5_ignis: 640,
      u1_pip: 650,
      u4_sylph: 660,
      u1_elise: 680,
      u2_boom: 680,
      u2_lyra: 690,
      u3_malakor: 690,
      u1_vex: 700,
      u5_goldtooth: 720,
      u4_velkora: 730,
      u1_garen: 780,
      u1_bone: 810,
      u3_leona: 820,
      u4_astaroth: 850,
      u2_thorn: 880,
    };

    if (unitCustomMap[source.unitId] !== undefined) {
      return unitCustomMap[source.unitId];
    }

    if (source.traits.includes('SHADOW_ASSASSIN')) return 520;
    if (source.traits.includes('BERSERKER')) return 610;
    if (source.traits.includes('VANGUARD')) return 810;
    if (source.traits.includes('RANGER')) return 660;
    return 700;
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
    synergyMap: Map<TraitId, ActiveSynergyState>
  ): CombatUnit {
    const baseMoveIntervalMs = this.computeCharacteristicMoveIntervalMs(source);
    // 개전 직후 기물마다 자연스러운 출발 차이를 두어 기계적인 동시 이동을 방지
    const initialMoveStaggerMs =
      100 + ((row * 37 + col * 53) % 140) + (source.traits.includes('VANGUARD') ? 60 : 0);

    const plane = HexGridMath.offsetToPlane(row, col);
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
      posX: plane.x,
      posZ: plane.z,
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


    // 아이템 고유 패시브(무한의 대검 스킬 치명타) 반영
    for (const itemId of cu.items) {
      const def = ITEM_DEFINITIONS[itemId];
      if (def?.passiveFlags.enableSkillCrit) {
        cu.enableSkillCrit = true;
      }
    }

    // 증강체 전투 버프 반영
    // 1) 사이버네틱 이식술: 아이템 장착 시 체력 +100, 공격력 +15%
    if (owner.augments.includes('AUG_CYBERNETIC_IMPLANT') && cu.items.length > 0) {
      cu.maxHp += 100;
      cu.currentHp += 100;
      cu.atk = Math.round(cu.atk * 1.15);
      cu.baseAtk = Math.round(cu.baseAtk * 1.15);
    }
    // 2) 전투 마법사: 전방 2열(원본 보드 기준 0~1행)에 배치된 아군 기물이 주문력 +35%, 방어력 +35
    const originalBoardRow = team === 'HOME' ? row - 4 : 3 - row;
    if (owner.augments.includes('AUG_BATTLE_MAGE') && originalBoardRow <= 1) {
      cu.spellPower = Number((cu.spellPower + 0.35).toFixed(2));
      cu.def += 35;
      cu.baseDef += 35;
    }
    // 3) 천상의 축복 I: 흡혈 +12%
    if (owner.augments.includes('AUG_CELESTIAL_BLESSING')) {
      cu.omnivamp = Number((cu.omnivamp + 0.12).toFixed(2));
    }
    // 4) 무술 훈련 (Martial Training): 아군 전체 공격력 +25, 공속 +0.15
    if (owner.augments.includes('AUG_MARTIAL_TRAINING')) {
      cu.atk += 25;
      cu.baseAtk += 25;
      cu.atkSpeed = Number((cu.atkSpeed + 0.15).toFixed(2));
    }
    // 5) 상승 (Ascension): 아군 전체 공격력/주문력 +30%
    if (owner.augments.includes('AUG_ASCENSION')) {
      cu.atk = Math.round(cu.atk * 1.3);
      cu.baseAtk = Math.round(cu.baseAtk * 1.3);
      cu.spellPower = Number((cu.spellPower + 0.3).toFixed(2));
    }
    // 6) 고단수 II / 단결된 힘: 활성 특성당 공·주문력 +2.5%, 방어 +2
    if (owner.augments.includes('AUG_STAND_UNITED')) {
      const activeTraitsCount = synergyMap.size;
      cu.atk = Math.round(cu.atk * (1 + activeTraitsCount * 0.025));
      cu.baseAtk = Math.round(cu.baseAtk * (1 + activeTraitsCount * 0.025));
      cu.spellPower = Number(
        (cu.spellPower + activeTraitsCount * 0.025).toFixed(2)
      );
      cu.def += activeTraitsCount * 2;
      cu.baseDef += activeTraitsCount * 2;
    }

    // TFT 시즌 18 적응 증강 전투 버프
    const frontlineCount = owner.board
      .slice(0, 2)
      .flat()
      .filter((u) => u !== null).length;
    const activeTraitsS18 = synergyMap.size;

    if (owner.augments.includes('AUG_STAND_UNITED_1')) {
      cu.atk = Math.round(cu.atk * (1 + activeTraitsS18 * 0.015));
      cu.baseAtk = Math.round(cu.baseAtk * (1 + activeTraitsS18 * 0.015));
      cu.spellPower = Number((cu.spellPower + activeTraitsS18 * 0.015).toFixed(2));
      cu.def += Math.round(activeTraitsS18 * 1.5);
      cu.baseDef += Math.round(activeTraitsS18 * 1.5);
    }
    if (owner.augments.includes('AUG_STAND_UNITED_3')) {
      cu.atk = Math.round(cu.atk * (1 + activeTraitsS18 * 0.04));
      cu.baseAtk = Math.round(cu.baseAtk * (1 + activeTraitsS18 * 0.04));
      cu.spellPower = Number((cu.spellPower + activeTraitsS18 * 0.04).toFixed(2));
      cu.def += Math.round(activeTraitsS18 * 3.5);
      cu.baseDef += Math.round(activeTraitsS18 * 3.5);
    }
    if (owner.augments.includes('AUG_UNITED_WILL')) {
      cu.atk = Math.round(cu.atk * (1 + activeTraitsS18 * 0.015));
      cu.baseAtk = Math.round(cu.baseAtk * (1 + activeTraitsS18 * 0.015));
      cu.spellPower = Number((cu.spellPower + activeTraitsS18 * 0.015).toFixed(2));
    }
    if (owner.augments.includes('AUG_BOXING_LESSON')) {
      const bonus = frontlineCount * 30;
      cu.maxHp += bonus;
      cu.currentHp += bonus;
    }
    if (owner.augments.includes('AUG_MAKE_WAY')) {
      cu.atk += 10;
      cu.baseAtk += 10;
    }
    if (owner.augments.includes('AUG_EXTRABUCKLE')) {
      cu.maxHp += 80;
      cu.currentHp += 80;
    }
    if (owner.augments.includes('AUG_SPARE_BOW')) {
      cu.atkSpeed = Number((cu.atkSpeed * 1.08).toFixed(3));
    }
    if (owner.augments.includes('AUG_FLOWING_TEARS')) {
      cu.currentMana = Math.min(cu.maxMana, cu.currentMana + 10);
    }
    if (owner.augments.includes('AUG_GROUP_HUG')) {
      cu.def += 10;
      cu.baseDef += 10;
    }
    if (owner.augments.includes('AUG_GROUP_HUG_2')) {
      cu.def += 18;
      cu.baseDef += 18;
    }
    if (owner.augments.includes('AUG_TWIN_GUARDIAN') && originalBoardRow <= 1 && frontlineCount >= 2) {
      cu.maxHp += 100;
      cu.currentHp += 100;
      cu.def += 35;
      cu.baseDef += 35;
    }
    if (owner.augments.includes('AUG_MAKESHIFT_ARMOR') && cu.items.length === 0) {
      cu.def += 30;
      cu.baseDef += 30;
    }
    if (owner.augments.includes('AUG_MAKESHIFT_ARMOR_2') && cu.items.length === 0) {
      cu.def += 50;
      cu.baseDef += 50;
    }
    if (owner.augments.includes('AUG_GLASS_CANNON') && originalBoardRow >= 2) {
      cu.maxHp = Math.max(100, Math.round(cu.maxHp * 0.8));
      cu.currentHp = Math.min(cu.currentHp, cu.maxHp);
      cu.atk = Math.round(cu.atk * 1.16);
      cu.baseAtk = Math.round(cu.baseAtk * 1.16);
      cu.spellPower = Number((cu.spellPower + 0.16).toFixed(2));
    }
    if (owner.augments.includes('AUG_GLASS_CANNON_2') && originalBoardRow >= 2) {
      cu.maxHp = Math.max(100, Math.round(cu.maxHp * 0.8));
      cu.currentHp = Math.min(cu.currentHp, cu.maxHp);
      cu.atk = Math.round(cu.atk * 1.25);
      cu.baseAtk = Math.round(cu.baseAtk * 1.25);
      cu.spellPower = Number((cu.spellPower + 0.25).toFixed(2));
    }
    if (owner.augments.includes('AUG_JEWELED_LOTUS')) {
      cu.enableSkillCrit = true;
      cu.critChance = Math.min(1.0, cu.critChance + 0.15);
    }
    if (owner.augments.includes('AUG_JEWELED_LOTUS_2')) {
      cu.enableSkillCrit = true;
      cu.critChance = Math.min(1.0, cu.critChance + 0.25);
      cu.critDamage += 0.1;
    }
    if (owner.augments.includes('AUG_TITANIC_FORCE')) {
      cu.maxHp += 225;
      cu.currentHp += 225;
      cu.maxHp = Math.round(cu.maxHp * 1.1);
      cu.currentHp = Math.round(cu.currentHp * 1.1);
    }
    if (
      owner.augments.includes('AUG_WARP_DRIVE') &&
      (cu.traits.includes('SHADOW_ASSASSIN') || originalBoardRow >= 2)
    ) {
      cu.currentMana = Math.min(cu.maxMana, cu.currentMana + 35);
    }
    if (owner.augments.includes('AUG_GOLDEN_SCALPEL')) {
      cu.critDamage += 0.35;
    }
    if (owner.augments.includes('AUG_HEROIC_INSPIRATION')) {
      const threeStarCount = owner.board.flat().filter((u) => u && u.starLevel === 3).length;
      if (threeStarCount > 0) {
        cu.atk = Math.round(cu.atk * (1 + threeStarCount * 0.12));
        cu.spellPower = Number((cu.spellPower + threeStarCount * 0.12).toFixed(2));
      }
    }
    if (owner.augments.includes('AUG_PASSIVE_HP')) {
      cu.maxHp += 60;
      cu.currentHp += 60;
    }
    if (owner.augments.includes('AUG_PASSIVE_HP_PLUS')) {
      cu.maxHp += 75;
      cu.currentHp += 75;
    }
    if (owner.augments.includes('AUG_PASSIVE_HP_PLUSPLUS')) {
      cu.maxHp += 90;
      cu.currentHp += 90;
    }
    if (owner.augments.includes('AUG_FOCUS_FIRE')) {
      cu.atk = Math.round(cu.atk * 1.15);
      cu.baseAtk = Math.round(cu.baseAtk * 1.15);
    }
    if (owner.augments.includes('AUG_CENTER_STAGE') && originalBoardRow === 0) {
      cu.atk = Math.round(cu.atk * 1.15);
      cu.spellPower = Number((cu.spellPower + 0.15).toFixed(2));
      cu.maxHp = Math.round(cu.maxHp * 1.25);
      cu.currentHp = Math.round(cu.currentHp * 1.25);
    }
    if (owner.augments.includes('AUG_HEALING_ORB_1')) {
      cu.omnivamp = Number((cu.omnivamp + 0.08).toFixed(2));
    }
    if (owner.augments.includes('AUG_HEALING_ORB_2')) {
      cu.omnivamp = Number((cu.omnivamp + 0.15).toFixed(2));
    }
    if (owner.augments.includes('AUG_ELECTRIC_1')) {
      cu.spellPower = Number((cu.spellPower + 0.12).toFixed(2));
    }
    if (owner.augments.includes('AUG_ELECTRIC_2')) {
      cu.spellPower = Number((cu.spellPower + 0.22).toFixed(2));
    }
    if (owner.augments.includes('AUG_CELESTIAL_BLESSING_2')) {
      cu.omnivamp = Number((cu.omnivamp + 0.18).toFixed(2));
    }
    if (owner.augments.includes('AUG_CELESTIAL_BLESSING_3')) {
      cu.omnivamp = Number((cu.omnivamp + 0.25).toFixed(2));
    }
    if (owner.augments.includes('AUG_OVERFLOWING_BELT')) {
      cu.maxHp += 85;
      cu.currentHp += 85;
    }
    if (owner.augments.includes('AUG_OVERFLOWING_BLADE')) {
      cu.atkSpeed = Number((cu.atkSpeed * 1.04).toFixed(3));
    }
    if (owner.augments.includes('AUG_PHALANX') && originalBoardRow >= 2) {
      const mult = 1 + frontlineCount * 0.11;
      cu.atk = Math.round(cu.atk * mult);
      cu.baseAtk = Math.round(cu.baseAtk * mult);
      cu.spellPower = Number((cu.spellPower + frontlineCount * 0.11).toFixed(2));
    }
    if (owner.augments.includes('AUG_LAST_STAND')) {
      cu.def += 8;
      cu.baseDef += 8;
      if (cu.currentHp / Math.max(1, cu.maxHp) < 0.5) {
        cu.def += 32;
        cu.baseDef += 32;
      }
    }
    if (
      owner.augments.includes('AUG_GARGANTUAN') &&
      cu.cost <= 4 &&
      owner.board.flat().some((u) => u && u.cost === 5)
    ) {
      cu.maxHp = Math.round(cu.maxHp * 1.08);
      cu.currentHp = Math.round(cu.currentHp * 1.08);
    }

    // 황금 고블린(GOLDEN_GOBLIN) 5/7 전투력 보너스
    const goblin = synergyMap.get('GOLDEN_GOBLIN');
    if (goblin && cu.traits.includes('GOLDEN_GOBLIN')) {
      if (goblin.count >= 7) {
        cu.maxHp += 600;
        cu.currentHp += 600;
        cu.atk += 50;
        cu.baseAtk += 50;
        cu.atkSpeed = Number((cu.atkSpeed + 0.35).toFixed(2));
      } else if (goblin.count >= 5) {
        cu.atk += 25;
        cu.baseAtk += 25;
        cu.atkSpeed = Number((cu.atkSpeed + 0.25).toFixed(2));
      }
    }

    // 영웅 전용 증강 (Hero Augments) 고유 메커니즘 변신
    if (cu.unitId === 'u1_garen' && owner.augments.includes('AUG_HERO_GAREN')) {
      cu.range = 4; // 근거리 탱커 -> 초장거리 원거리 저격수 변신!
      cu.atkSpeed = Number((cu.atkSpeed + 0.35).toFixed(2));
      cu.atk += 45;
      cu.baseAtk += 45;
      cu.maxHp += 400;
      cu.currentHp += 400;
    }
    if (cu.unitId === 'u1_pip' && owner.augments.includes('AUG_HERO_PIP')) {
      cu.range = 1; // 원거리 -> 초근접 광역 암살자 변신!
      cu.currentMana = cu.maxMana; // 전투 시작 즉시 스킬 발사!
      cu.critChance = 1.0; // 100% 확정 치명타!
      cu.critDamage += 0.5;
      cu.atk += 40;
      cu.baseAtk += 40;
    }
    if (cu.unitId === 'u2_jeanne' && owner.augments.includes('AUG_HERO_JEANNE')) {
      cu.maxHp += 500;
      cu.currentHp += 500;
      cu.def += 40;
      cu.baseDef += 40;
    }
    if (cu.unitId === 'u3_orion' && owner.augments.includes('AUG_HERO_ORION')) {
      cu.range = 4;
      cu.atkSpeed = Number((cu.atkSpeed + 0.25).toFixed(2));
      cu.atk += 35;
      cu.baseAtk += 35;
    }
    if (cu.unitId === 'u3_drake' && owner.augments.includes('AUG_HERO_DRAKE')) {
      cu.maxHp += 400;
      cu.currentHp += 400;
      cu.atk += 35;
      cu.baseAtk += 35;
      cu.omnivamp = Number((cu.omnivamp + 0.15).toFixed(2));
    }
    if (cu.unitId === 'u3_malakor' && owner.augments.includes('AUG_HERO_MALAKOR')) {
      cu.spellPower = Number((cu.spellPower + 0.5).toFixed(2));
      cu.currentMana = cu.maxMana; // 전투 시작 즉시 광역 마나 강탈 스킬 발사!
    }



    // 시너지 상시 스탯 버프 반영
    // - 신성 제국(HOLY_EMPIRE): 방어력 보너스
    const empire = synergyMap.get('HOLY_EMPIRE')?.activeEffect;
    if (empire && cu.traits.includes('HOLY_EMPIRE') && empire.bonusDef) {
      cu.def += empire.bonusDef;
      cu.baseDef += empire.bonusDef;
    }

    // - 심연의 악마(ABYSSAL_DEMON): 고정 피해 및 모든 피해 흡혈
    const demon = synergyMap.get('ABYSSAL_DEMON')?.activeEffect;
    if (demon && cu.traits.includes('ABYSSAL_DEMON')) {
      cu.trueDamageBonusRatio += demon.trueDamageRatio ?? 0;
      cu.omnivamp += demon.omnivamp ?? 0;
    }

    // - 용족(DRAGONKIN): 스킬 치명타 활성화 및 치명타 피해 증가
    const dragon = synergyMap.get('DRAGONKIN')?.activeEffect;
    if (dragon && cu.traits.includes('DRAGONKIN')) {
      if (dragon.enableSkillCrit) cu.enableSkillCrit = true;
      cu.critDamage += dragon.bonusCritDamage ?? 0;
    }

    // - 언데드 군단(UNDEAD_SCOURGE): 최초 사망 시 2초 뒤 부활 플래그
    const undead = synergyMap.get('UNDEAD_SCOURGE')?.activeEffect;
    if (undead && cu.traits.includes('UNDEAD_SCOURGE') && undead.reviveHpRatio) {
      cu.hasReviveAvailable = true;
      cu.reviveHpRatio = undead.reviveHpRatio;
      cu.reviveBonusAtkSpeed = undead.reviveBonusAtkSpeed ?? 0.35;
    }

    // - 마탑(ARCANE_TOWER): 마탑 기물 주문력 상승
    const arcane = synergyMap.get('ARCANE_TOWER')?.activeEffect;
    if (arcane && cu.traits.includes('ARCANE_TOWER') && arcane.spellPowerBonus) {
      cu.spellPower = Number((cu.spellPower + arcane.spellPowerBonus).toFixed(2));
    }

    // - 선봉대(VANGUARD): 방어력 상승 및 개전 8초간 피해 감소 30%
    const vanguard = synergyMap.get('VANGUARD')?.activeEffect;
    if (vanguard && cu.traits.includes('VANGUARD')) {
      cu.def += vanguard.bonusDef ?? 0;
      cu.baseDef += vanguard.bonusDef ?? 0;
      cu.damageReductionRatio = vanguard.damageReductionFirst8s ?? 0.3;
    }

    // - 순찰자(RANGER): 사거리 +1 증가
    const ranger = synergyMap.get('RANGER')?.activeEffect;
    if (ranger && cu.traits.includes('RANGER') && ranger.bonusRange) {
      cu.range += ranger.bonusRange;
    }

    // - 대마법사(ARCHMAGE): 주문력 상승
    const archmage = synergyMap.get('ARCHMAGE')?.activeEffect;
    if (archmage && cu.traits.includes('ARCHMAGE') && archmage.spellPowerBonus) {
      cu.spellPower = Number((cu.spellPower + archmage.spellPowerBonus).toFixed(2));
    }

    // - 그림자 암살자(SHADOW_ASSASSIN): 치명타 확률 및 치명타 피해량 증가
    const assassin = synergyMap.get('SHADOW_ASSASSIN')?.activeEffect;
    if (assassin && cu.traits.includes('SHADOW_ASSASSIN')) {
      cu.critChance = Math.min(1.0, cu.critChance + (assassin.bonusCritChance ?? 0));
      cu.critDamage += assassin.bonusCritDamage ?? 0;
    }

    // - 성기사(PALADIN): 아군 전체 군중제어(기절) 지속시간 감소 또는 면역
    const paladin = synergyMap.get('PALADIN')?.activeEffect;
    if (paladin && paladin.ccDurationReduction) {
      cu.ccDurationReduction = paladin.ccDurationReduction;
    }

    return cu;
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

    // 1. 신성 제국(HOLY_EMPIRE): 최대 체력 비례 신성 보호막 부여
    const empire = synergyMap.get('HOLY_EMPIRE')?.activeEffect;
    if (empire && empire.shieldMaxHpRatio) {
      for (const u of teamUnits) {
        if (u.traits.includes('HOLY_EMPIRE')) {
          const shieldAmt = Math.round(u.maxHp * empire.shieldMaxHpRatio);
          this.addShield(u, u, shieldAmt);
        }
      }
    }

    // 2. 용족(DRAGONKIN): 전투 시작 시 화염 숨결로 적 전체에게 최대 체력 비례 화상 피해
    const dragon = synergyMap.get('DRAGONKIN')?.activeEffect;
    if (dragon && dragon.initialBurnMaxHpRatio) {
      const dragonCaster = teamUnits.find((u) => u.traits.includes('DRAGONKIN'));
      if (dragonCaster) {
        for (const enemy of enemyUnits) {
          if (enemy.currentHp > 0) {
            const burnDmg = Math.round(enemy.maxHp * dragon.initialBurnMaxHpRatio);
            this.dealDamage(dragonCaster, enemy, burnDmg, 'TRUE', false, true);
          }
        }
      }
    }

    // 3. 그림자 암살자(SHADOW_ASSASSIN): 전투 시작 시 적진 가장 뒷열(원거리 딜러 라인) 빈 타일로 은신 도약(Leap)
    const targetBackRows = team === 'HOME' ? [0, 1, 2, 3] : [7, 6, 5, 4];
    for (const u of teamUnits) {
      if (u.traits.includes('SHADOW_ASSASSIN')) {
        const leapTile = this.findBacklineLeapTile(u, targetBackRows);
        if (leapTile && (leapTile.row !== u.row || leapTile.col !== u.col)) {
          const fromRow = u.row;
          const fromCol = u.col;
          u.row = leapTile.row;
          u.col = leapTile.col;
          const leapPlane = HexGridMath.offsetToPlane(u.row, u.col);
          u.posX = leapPlane.x;
          u.posZ = leapPlane.z;
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

    // 4. 5코스트 3성 황금 고블린 왕 골드투스(u5_goldtooth) 개전 즉시 권능 발동!
    for (const u of teamUnits) {
      if (u.unitId === 'u5_goldtooth' && u.starLevel === 3 && u.currentHp > 0) {
        const aliveEnemies = this.units.filter(
          (e) => e.team !== u.team && e.currentHp > 0
        );
        if (aliveEnemies.length > 0) {
          this.emitEvent({
            type: 'FIVE_COST_3STAR_CATACLYSM',
            tick: this.currentTick,
            sourceId: u.instanceId,
            team: u.team,
            unitId: u.unitId,
            skillName: UNIT_TEMPLATES[u.unitId].skill.name,
            message: `⚡👑 [3성 골드투스 절대 권능!] 개전 즉시 황금 제국 금고 대폭격 (99,999 피해 & +50G)!`,
          });
          SkillRegistry.executeSkill(u, aliveEnemies[0], this.units, this);
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

    // 2. 모든 유닛 루프 (부활 대기, 기절, 자유이동, 스킬 시전, 기본 공격)
    const dtSec = deltaMs / 1000;
    const UNIT_RADIUS = 0.48;
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

      if (unit.manaLockTimerMs > 0) {
        unit.manaLockTimerMs = Math.max(0, unit.manaLockTimerMs - deltaMs);
      }
      if (unit.attackCooldownMs > 0) {
        unit.attackCooldownMs = Math.max(0, unit.attackCooldownMs - deltaMs);
      }
      if (unit.moveCooldownMs > 0) {
        unit.moveCooldownMs = Math.max(0, unit.moveCooldownMs - deltaMs);
      }

      if (unit.stunTimerMs > 0) {
        unit.stunTimerMs = Math.max(0, unit.stunTimerMs - deltaMs);
        continue;
      }

      const target = this.findNearestEnemy(unit);
      if (!target) {
        break;
      }

      const planeDist = HexGridMath.planeDistance(
        unit.posX,
        unit.posZ,
        target.posX,
        target.posZ
      );
      // 헥스 사거리를 평면 거리로 환산 (칸 점프 없이 사거리에서 정지)
      const engageRadius = unit.range * 1.05 + 0.12;

      if (planeDist > engageRadius) {
        if (unit.moveCooldownMs > 0) {
          continue;
        }

        const fromRow = unit.row;
        const fromCol = unit.col;
        const fromX = unit.posX;
        const fromZ = unit.posZ;

        // 목표 방향 조향
        let dx = target.posX - unit.posX;
        let dz = target.posZ - unit.posZ;
        const len = Math.max(0.001, Math.hypot(dx, dz));
        dx /= len;
        dz /= len;

        // 유닛 간 겹침 방지: 가까운 유닛에게서 밀어내기
        let sepX = 0;
        let sepZ = 0;
        for (const other of this.units) {
          if (other.instanceId === unit.instanceId) continue;
          if (other.currentHp <= 0 && !other.isReviving) continue;
          const odx = unit.posX - other.posX;
          const odz = unit.posZ - other.posZ;
          const od = Math.hypot(odx, odz);
          const minDist = UNIT_RADIUS * 2;
          if (od > 0.001 && od < minDist) {
            const push = (minDist - od) / minDist;
            sepX += (odx / od) * push;
            sepZ += (odz / od) * push;
          }
        }

        const stepIntervalMs = unit.berserkTriggered
          ? Math.max(380, Math.round(unit.baseMoveIntervalMs * 0.78))
          : unit.baseMoveIntervalMs;
        // 1헥스/stepInterval 속도 ≈ 초당 plane 유닛
        const speed = 1.0 / Math.max(0.28, stepIntervalMs / 1000);
        const steerX = dx * 1.0 + sepX * 1.35;
        const steerZ = dz * 1.0 + sepZ * 1.35;
        const steerLen = Math.max(0.001, Math.hypot(steerX, steerZ));
        const nx = unit.posX + (steerX / steerLen) * speed * dtSec;
        const nz = unit.posZ + (steerZ / steerLen) * speed * dtSec;
        const clamped = HexGridMath.clampPlaneToBoard(nx, nz);
        unit.posX = clamped.x;
        unit.posZ = clamped.z;
        this.syncUnitOccupancy(unit);

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
          durationMs: deltaMs,
          amount: Math.round(HexGridMath.planeDistance(fromX, fromZ, unit.posX, unit.posZ) * 1000),
        });
        continue;
      }

      // 사거리 내: 스킬 / 기본 공격
      if (unit.currentMana >= unit.maxMana && unit.maxMana > 0) {
        this.castUnitSkill(unit, target);
        this.checkCombatEndCondition();
        continue;
      }

      if (unit.attackCooldownMs <= 0) {
        this.performBasicAttack(unit, target);
        unit.attackCooldownMs = Math.max(
          150,
          Math.round(1000 / Math.max(0.25, unit.atkSpeed))
        );
        this.checkCombatEndCondition();
      }
    }

    // 틱 종료 후 잔여 겹침 한 번 더 해소
    this.resolveUnitOverlaps(UNIT_RADIUS);

    this.checkCombatEndCondition();
    return [...this.currentTickEvents];
  }

  /** 평면 좌표 → 가장 가까운 헥스 occupancy (스킬 AOE용) */
  private syncUnitOccupancy(unit: CombatUnit): void {
    const nearest = HexGridMath.planeToNearestOffset(unit.posX, unit.posZ);
    unit.row = nearest.row;
    unit.col = nearest.col;
  }

  /** 유닛 원형 충돌 해소 (서로 겹치지 않게) */
  private resolveUnitOverlaps(radius: number): void {
    const alive = this.units.filter((u) => u.currentHp > 0 || u.isReviving);
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i];
          const b = alive[j];
          let dx = a.posX - b.posX;
          let dz = a.posZ - b.posZ;
          let dist = Math.hypot(dx, dz);
          const minDist = radius * 2;
          if (dist < 0.0001) {
            dx = (Math.random() - 0.5) * 0.02;
            dz = (Math.random() - 0.5) * 0.02;
            dist = Math.hypot(dx, dz);
          }
          if (dist < minDist) {
            const push = (minDist - dist) * 0.5;
            const nx = dx / dist;
            const nz = dz / dist;
            a.posX += nx * push;
            a.posZ += nz * push;
            b.posX -= nx * push;
            b.posZ -= nz * push;
            const ca = HexGridMath.clampPlaneToBoard(a.posX, a.posZ);
            const cb = HexGridMath.clampPlaneToBoard(b.posX, b.posZ);
            a.posX = ca.x;
            a.posZ = ca.z;
            b.posX = cb.x;
            b.posZ = cb.z;
            this.syncUnitOccupancy(a);
            this.syncUnitOccupancy(b);
          }
        }
      }
    }
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
      fromRow: unit.row,
      fromCol: unit.col,
      toRow: target.row,
      toCol: target.col,
    });

    // SkillRegistry 전략 핸들러 실행
    SkillRegistry.executeSkill(unit, target, this.units, this);

    const owner = unit.team === 'HOME' ? this.homeParticipant : this.awayParticipant;

    // [영웅] 검기 투척수 가렌: 전장 관통 십자 칼바람 발사 (일직선상 모든 적 2.2배 강타)
    if (unit.unitId === 'u1_garen' && owner?.augments.includes('AUG_HERO_GAREN')) {
      const enemiesInLine = this.units.filter(
        (e) =>
          e.team !== unit.team &&
          e.currentHp > 0 &&
          !e.isReviving &&
          (e.row === unit.row || e.col === unit.col)
      );
      for (const enemy of enemiesInLine) {
        this.dealDamage(
          unit,
          enemy,
          Math.round(unit.atk * 1.8 * unit.spellPower),
          'PHYSICAL',
          unit.enableSkillCrit,
          true
        );
      }
    }

    // [영웅] 초근접 폭탄광 핍: 주변 2칸 반경 대규모 광역 폭발 + 치명타 골드 약탈
    if (unit.unitId === 'u1_pip' && owner?.augments.includes('AUG_HERO_PIP')) {
      const nearbyEnemies = this.units.filter(
        (e) =>
          e.team !== unit.team &&
          e.currentHp > 0 &&
          !e.isReviving &&
          this.chebyshevDistance(unit.row, unit.col, e.row, e.col) <= 2
      );
      for (const enemy of nearbyEnemies) {
        const res = this.dealDamage(
          unit,
          enemy,
          Math.round((unit.atk * 1.5 + 180) * unit.spellPower),
          'MAGICAL',
          true,
          true
        );
        if (res.isCrit && Math.random() < 0.45) {
          if (unit.team === 'HOME' && this.homeGoldEarned < 5) {
            this.homeGoldEarned += 1;
            if (this.homeParticipant) this.homeParticipant.gold += 1;
          }
        }
      }
    }

    // [영웅] 파멸의 영혼 군주 말라코르: 모든 적 치유 감소 60% 및 전원 마나 5씩 강탈
    if (unit.unitId === 'u3_malakor' && owner?.augments.includes('AUG_HERO_MALAKOR')) {
      const allEnemies = this.units.filter(
        (e) => e.team !== unit.team && e.currentHp > 0 && !e.isReviving
      );
      for (const enemy of allEnemies) {
        enemy.currentMana = Math.max(0, enemy.currentMana - 6);
        this.dealDamage(unit, enemy, 150 * unit.spellPower, 'MAGICAL', false, true);
      }
      unit.currentMana = Math.min(unit.maxMana, unit.currentMana + allEnemies.length * 3);
    }

    // 대마법사(ARCHMAGE) 시너지 활성화 시: 스킬 시전할 때 체력이 가장 낮은 적에게 연쇄 번개 추가 낙하!
    const synergyMap =
      unit.team === 'HOME' ? this.homeSynergies : this.awaySynergies;
    const archmageEffect = synergyMap.get('ARCHMAGE')?.activeEffect;
    if (
      archmageEffect &&
      unit.traits.includes('ARCHMAGE') &&
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

    // 2. 공격자 마나 회복: 기본 +10 + 마탑(ARCANE_TOWER) 보너스 + 쇼진의 창(SPEAR_OF_SHOJIN) 보너스
    const synergyMap =
      attacker.team === 'HOME' ? this.homeSynergies : this.awaySynergies;
    const arcaneBonus =
      synergyMap.get('ARCANE_TOWER')?.activeEffect?.teamManaPerAttack ?? 0;

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

    this.grantMana(attacker, 10 + arcaneBonus + shojinBonus);
    this.incrementTitansResolve(attacker);

    // 3. 광전사(BERSERKER) 광폭화 중 스플래시 피해 처리
    const berserkerEffect = synergyMap.get('BERSERKER')?.activeEffect;
    if (
      berserkerEffect &&
      attacker.traits.includes('BERSERKER') &&
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
    const rangerEffect = synergyMap.get('RANGER')?.activeEffect;
    if (
      rangerEffect &&
      attacker.traits.includes('RANGER') &&
      attacker.basicAttackCount % 3 === 0 &&
      rangerEffect.pierceArrowDamageRatio
    ) {
      if (target.currentHp > 0) {
        this.dealDamage(
          attacker,
          target,
          attacker.atk * rangerEffect.pierceArrowDamageRatio,
          'PHYSICAL',
          true,
          false
        );
      }
    }

    // [영웅] 성운의 일제사격 오리온: 공격 시마다 공속 +6% 무한 누적 & 3발 분기 사격!
    const attackerOwner =
      attacker.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
    if (
      attacker.unitId === 'u3_orion' &&
      attackerOwner?.augments.includes('AUG_HERO_ORION')
    ) {
      attacker.atkSpeed = Math.min(3.2, Number((attacker.atkSpeed * 1.06).toFixed(3)));
      const otherEnemies = this.units.filter(
        (e) =>
          e.team !== attacker.team &&
          e.currentHp > 0 &&
          !e.isReviving &&
          e.instanceId !== target.instanceId
      );
      otherEnemies.slice(0, 2).forEach((extra) => {
        this.dealDamage(
          attacker,
          extra,
          Math.round(attacker.atk * 0.75),
          'PHYSICAL',
          attacker.enableSkillCrit,
          false
        );
      });
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
    const paladinEffect = synergyMap.get('PALADIN')?.activeEffect;
    if (
      paladinEffect &&
      attacker.traits.includes('PALADIN') &&
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

        // [영웅] 무한 분노 학살자 드레이크: 적 처치 시 처치 팀 드레이크에게 공 +40, 체 +400, 흡혈 +12% 무한 스택!
        const killTeamOwner =
          attacker.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
        if (killTeamOwner?.augments.includes('AUG_HERO_DRAKE')) {
          const drakes = this.units.filter(
            (u) =>
              u.team === attacker.team &&
              u.unitId === 'u3_drake' &&
              u.currentHp > 0 &&
              !u.isReviving
          );
          for (const d of drakes) {
            d.atk += 40;
            d.baseAtk += 40;
            d.maxHp += 400;
            d.currentHp += 400;
            d.omnivamp = Number((d.omnivamp + 0.12).toFixed(2));
          }
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

    // 천상의 축복(AUG_CELESTIAL_BLESSING): 초과 회복량 보호막 전환 (최대 350)
    const owner =
      target.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
    if (
      owner?.augments.includes('AUG_CELESTIAL_BLESSING') &&
      prevHp + rounded > target.maxHp
    ) {
      const overheal = prevHp + rounded - target.maxHp;
      target.shield = Math.min(target.shield + overheal, Math.max(target.shield, 350));
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
    const plane = HexGridMath.offsetToPlane(targetRow, targetCol);
    unit.posX = plane.x;
    unit.posZ = plane.z;
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

    // 1. 광전사(BERSERKER): 체력 50% 이하 도달 시 공격력/공속 폭증
    if (!unit.berserkTriggered && hpRatio <= 0.5 && unit.traits.includes('BERSERKER')) {
      const synergyMap =
        unit.team === 'HOME' ? this.homeSynergies : this.awaySynergies;
      const berserkEffect = synergyMap.get('BERSERKER')?.activeEffect;
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
    // [영웅] 불멸의 대지 거인 잔느: 매 1초마다 최대 체력 +150, 방어/마저 +5씩 영구히 무한 성장!
    if (this.elapsedMs % 1000 < deltaMs) {
      for (const u of this.units) {
        if (u.currentHp <= 0 || u.isReviving) continue;
        const owner = u.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
        if (u.unitId === 'u2_jeanne' && owner?.augments.includes('AUG_HERO_JEANNE')) {
          u.maxHp += 150;
          u.currentHp += 150;
          u.def += 5;
          u.baseDef += 5;
        }
      }
    }

    // 유성 낙하 (AUG_METEORIC_IMPACT): 전투 5초 후 적 전체 진영에 최대 체력 16% 광역 마법 피해
    if (this.elapsedMs >= 5000 && this.elapsedMs - deltaMs < 5000) {
      for (const homeOrAway of ['HOME', 'AWAY'] as const) {
        const owner = homeOrAway === 'HOME' ? this.homeParticipant : this.awayParticipant;
        if (owner?.augments.includes('AUG_METEORIC_IMPACT')) {
          const enemies = this.units.filter((u) => u.team !== homeOrAway && u.currentHp > 0);
          const caster = this.units.find((u) => u.team === homeOrAway && u.currentHp > 0);
          for (const e of enemies) {
            const meteorDmg = Math.round(e.maxHp * 0.16);
            if (caster) this.dealDamage(caster, e, meteorDmg, 'MAGICAL', false, true);
          }
        }
      }
    }

    // 아케인 빅토리! (AUG_ARCANE_VICTORY): 전투 8초 후 적 전체 20% 마법 피해, 2.5초 기절 및 마나 0 소멸
    if (this.elapsedMs >= 8000 && this.elapsedMs - deltaMs < 8000) {
      for (const homeOrAway of ['HOME', 'AWAY'] as const) {
        const owner = homeOrAway === 'HOME' ? this.homeParticipant : this.awayParticipant;
        if (owner?.augments.includes('AUG_ARCANE_VICTORY')) {
          const enemies = this.units.filter((u) => u.team !== homeOrAway && u.currentHp > 0);
          const caster = this.units.find((u) => u.team === homeOrAway && u.currentHp > 0);
          for (const e of enemies) {
            e.currentMana = 0;
            const lightningDmg = Math.round(e.maxHp * 0.2);
            if (caster) {
              this.dealDamage(caster, e, lightningDmg, 'MAGICAL', false, true);
              this.applyStun(caster, e, 2500);
            } else {
              e.currentHp = Math.max(1, e.currentHp - lightningDmg);
              e.stunTimerMs = Math.max(e.stunTimerMs, 2500);
            }
          }
        }
      }
    }

    // 불완전한 초월 (10초 후 피해 증폭 +22%)
    if (this.elapsedMs >= 10000 && this.elapsedMs - deltaMs < 10000) {
      for (const u of this.units) {
        if (u.currentHp <= 0) continue;
        const owner = u.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
        if (owner?.augments.includes('AUG_INCOMPLETE_ASCENSION')) {
          u.atk = Math.round(u.atk * 1.22);
          u.baseAtk = Math.round(u.baseAtk * 1.22);
          u.spellPower = Number((cu_sp => cu_sp + 0.22)(u.spellPower));
        }
      }
    }

    // 궁극의 초월 (12초 후 피해 증폭 +80%)
    if (this.elapsedMs >= 12000 && this.elapsedMs - deltaMs < 12000) {
      for (const u of this.units) {
        if (u.currentHp <= 0) continue;
        const owner = u.team === 'HOME' ? this.homeParticipant : this.awayParticipant;
        if (owner?.augments.includes('AUG_FINAL_ASCENSION')) {
          u.atk = Math.round(u.atk * 1.8);
          u.baseAtk = Math.round(u.baseAtk * 1.8);
          u.spellPower = Number((cu_sp => cu_sp + 0.8)(u.spellPower));
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
        if (u.currentHp <= 0 || u.isReviving || !u.traits.includes('ELVEN_SYLVAN')) {
          continue;
        }
        const synergyMap =
          u.team === 'HOME' ? this.homeSynergies : this.awaySynergies;
        const elven = synergyMap.get('ELVEN_SYLVAN')?.activeEffect;
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
    let bestPlaneDist = 9999;

    for (const other of this.units) {
      if (other.team === unit.team) continue;
      if (other.currentHp <= 0 || other.isReviving) continue;

      const planeDist = HexGridMath.planeDistance(
        unit.posX,
        unit.posZ,
        other.posX,
        other.posZ
      );
      if (planeDist < bestPlaneDist) {
        bestPlaneDist = planeDist;
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

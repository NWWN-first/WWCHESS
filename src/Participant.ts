// src/Participant.ts

import {
  AUGMENT_DEFINITIONS,
  BaseItemId,
  combineBaseItems,
  CostTier,
  ITEM_DEFINITIONS,
  ItemId,
  STAR_STAT_MULTIPLIER,
  StarLevel,
  TraitId,
  UNIT_TEMPLATES,
  UnitTemplate,
  XP_REQUIRED_BY_LEVEL,
} from './GameData';
import { PoolParticipant, SharedPoolManager } from './SharedPoolManager';

export type AIPersona =
  | 'HYPER_ROLLER'
  | 'FAST_NINE_GREEDY'
  | 'GOBLIN_GAMBLER'
  | 'FLEX_MASTER'
  | 'LOW_COST_REROLLER'
  | 'FAST_NINE_ECONOMIST'
  | 'FLEX_BALANCED';

export interface UnitInstance {
  instanceId: string;
  unitId: string;
  name: string;
  cost: CostTier;
  starLevel: StarLevel;
  traits: TraitId[];
  icon: string;
  items: ItemId[];
  maxHp: number;
  currentHp: number;
  atk: number;
  def: number;
  atkSpeed: number;
  range: number;
  startMana: number;
  maxMana: number;
  currentMana: number;
  spellPower: number;
  critChance: number;
  critDamage: number;
  omnivamp: number;
}

export type UnitLocation =
  | { area: 'BOARD'; row: number; col: number; unit: UnitInstance }
  | { area: 'BENCH'; index: number; unit: UnitInstance }
  | { area: 'OVERFLOW'; index: number; unit: UnitInstance };

let globalInstanceCounter = 1;

export class Participant implements PoolParticipant {
  public static readonly BOARD_ROWS = 4;
  public static readonly BOARD_COLS = 7;
  public static readonly BENCH_SIZE = 9;
  public static readonly SHOP_SIZE = 5;
  public static readonly MAX_ITEM_BENCH_SIZE = 15;

  public id: string;
  public name: string;
  public isAI: boolean;
  public persona: AIPersona | null;
  public hp: number = 100;
  public maxHp: number = 100;
  public isEliminated: boolean = false;

  public gold: number = 10;
  public level: number = 1;
  public xp: number = 0;
  public winStreak: number = 0;
  public loseStreak: number = 0;

  public goblinVaultStacks: number = 0;

  public bench: (UnitInstance | null)[];
  public board: (UnitInstance | null)[][];
  public shop: (string | null)[];
  public isShopLocked: boolean = false;
  public freeRerolls: number = 0;

  public itemBench: ItemId[] = [];
  public duplicators: number = 0;

  public augments: string[] = [];
  public bonusTraits: Map<TraitId, number> = new Map();

  /**
   * 최근 실패/성공 액션에 대한 사용자 알림 메시지 (UI 토스트 연동용)
   */
  public lastActionMessage: string = '';

  /**
   * 대기석 만석 구매 예외 상황에서 합성 직전 기물을 잠시 보관하는 내부 버퍼
   */
  private overflowUnits: UnitInstance[] = [];

  constructor(
    id: string,
    name: string,
    isAI: boolean = false,
    persona: AIPersona | null = null
  ) {
    this.id = id;
    this.name = name;
    this.isAI = isAI;
    this.persona = persona;

    this.bench = new Array<UnitInstance | null>(Participant.BENCH_SIZE).fill(null);
    this.board = Array.from({ length: Participant.BOARD_ROWS }, () =>
      new Array<UnitInstance | null>(Participant.BOARD_COLS).fill(null)
    );
    this.shop = new Array<string | null>(Participant.SHOP_SIZE).fill(null);
  }

  /**
   * 새로운 UnitInstance를 생성하고 성급 및 장착 아이템에 맞춰 스탯을 계산한다.
   */
  public static createUnitInstance(
    unitId: string,
    starLevel: StarLevel = 1,
    items: ItemId[] = []
  ): UnitInstance {
    const template: UnitTemplate | undefined = UNIT_TEMPLATES[unitId];
    if (!template) {
      throw new Error(`존재하지 않는 기물 ID입니다: ${unitId}`);
    }

    const instance: UnitInstance = {
      instanceId: `unit_${Date.now()}_${globalInstanceCounter++}`,
      unitId: template.id,
      name: template.name,
      cost: template.cost,
      starLevel,
      traits: [...template.traits],
      icon: template.icon,
      items: [...items],
      maxHp: template.stats.hp,
      currentHp: template.stats.hp,
      atk: template.stats.atk,
      def: template.stats.def,
      atkSpeed: template.stats.atkSpeed,
      range: template.stats.range,
      startMana: template.stats.startMana,
      maxMana: template.stats.maxMana,
      currentMana: template.stats.startMana,
      spellPower: 1.0,
      critChance: 0.25,
      critDamage: 1.4,
      omnivamp: 0,
    };

    Participant.recalculateUnitStats(instance);
    return instance;
  }

  /**
   * 기물의 성급(1~4코 1.8x, 5코 3성 4.0x) 및 장착 아이템 스탯을 재계산한다.
   */
  public static recalculateUnitStats(unit: UnitInstance): void {
    const template = UNIT_TEMPLATES[unit.unitId];
    if (!template) return;

    const mult = STAR_STAT_MULTIPLIER[template.cost][unit.starLevel];

    let maxHp = Math.round(template.stats.hp * mult.hpMult);
    let atk = Math.round(template.stats.atk * mult.atkMult);
    let def = template.stats.def;
    let atkSpeedBonus = 0;
    let range = template.stats.range;
    let startMana = template.stats.startMana;
    let spellPower = 1.0;
    let critChance = 0.25;
    let critDamage = 1.4;
    let omnivamp = 0;

    for (const itemId of unit.items) {
      const itemDef = ITEM_DEFINITIONS[itemId];
      if (!itemDef) continue;
      const st = itemDef.stats;
      if (st.hp) maxHp += st.hp;
      if (st.atk) atk += st.atk;
      if (st.def) def += st.def;
      if (st.atkSpeed) atkSpeedBonus += st.atkSpeed;
      if (st.bonusRange) range += st.bonusRange;
      if (st.startMana) startMana += st.startMana;
      if (st.spellPower) spellPower += st.spellPower;
      if (st.critChance) critChance += st.critChance;
      if (st.critDamage) critDamage += st.critDamage;
      if (st.omnivamp) omnivamp += st.omnivamp;
    }

    unit.maxHp = maxHp;
    unit.currentHp = maxHp;
    unit.atk = atk;
    unit.def = def;
    unit.atkSpeed = Number((template.stats.atkSpeed * (1 + atkSpeedBonus)).toFixed(3));
    unit.range = range;
    unit.startMana = Math.min(template.stats.maxMana, startMana);
    unit.maxMana = template.stats.maxMana;
    unit.currentMana = unit.startMana;
    unit.spellPower = Number(spellPower.toFixed(2));
    unit.critChance = Math.min(1.0, Number(critChance.toFixed(2)));
    unit.critDamage = Number(critDamage.toFixed(2));
    unit.omnivamp = Number(omnivamp.toFixed(2));
  }

  /**
   * 1) 현재 자신의 board와 bench를 모두 스캔하여 해당 unitId의 starLevel === 3인 기물이
   *    하나라도 존재하면 true, 없으면 false를 반환한다.
   *    (3성 기물을 판매하면 자동으로 false가 되어 상점 잠금이 해제됨)
   */
  public hasThreeStarUnit(unitId: string): boolean {
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const u = this.board[r][c];
        if (u && u.unitId === unitId && u.starLevel === 3) {
          return true;
        }
      }
    }

    for (let i = 0; i < Participant.BENCH_SIZE; i++) {
      const u = this.bench[i];
      if (u && u.unitId === unitId && u.starLevel === 3) {
        return true;
      }
    }

    return false;
  }

  /**
   * 보드와 대기석에 보유한 특정 unitId의 1성 환산 총 개수(1성=1, 2성=3, 3성=9)를 반환한다.
   */
  public getOwnedUnitCopiesCount(unitId: string): number {
    let total = 0;
    for (const loc of this.getAllUnitLocations()) {
      if (loc.unit.unitId === unitId) {
        total += SharedPoolManager.getCopiesCountForStar(loc.unit.starLevel);
      }
    }
    return total;
  }

  /**
   * 보드 + 대기석 + 임시 버퍼에 있는 특정 unitId 및 특정 starLevel 기물 개수를 센다.
   */
  public countUnitsByIdAndStar(unitId: string, starLevel: StarLevel): number {
    let count = 0;
    for (const loc of this.getAllUnitLocations()) {
      if (loc.unit.unitId === unitId && loc.unit.starLevel === starLevel) {
        count++;
      }
    }
    return count;
  }

  /**
   * 2) 기물 구매 가능 여부 판별
   * - gold < unitCost 이거나 hasThreeStarUnit(unitId)이면 false.
   * - bench에 빈자리(null)가 하나라도 있으면 true.
   * - 대기석 만석 시 구매 예외: bench가 꽉 찼더라도 현재 board + bench에 동일 unitId의
   *   1성(starLevel === 1) 기물이 2개 이상 있으면 구매 즉시 합성이 일어나므로 true 반환!
   */
  public canBuyUnit(unitId: string, unitCost: number): boolean {
    if (this.isEliminated) return false;
    if (this.gold < unitCost) return false;
    if (this.hasThreeStarUnit(unitId)) return false;

    const hasEmptyBenchSlot = this.bench.some((slot) => slot === null);
    if (hasEmptyBenchSlot) {
      return true;
    }

    // 대기석 만석 시 구매 예외 검사 (1성 기물 2개 이상 보유 시 즉시 2성 합성 가능)
    const oneStarCount = this.countUnitsByIdAndStar(unitId, 1);
    if (oneStarCount >= 2) {
      return true;
    }

    return false;
  }

  /**
   * 3) 상점 슬롯에서 기물 구매
   * 조건 검증 후 골드 차감, 상점 슬롯 null 처리, 새 UnitInstance 생성.
   * 대기석에 빈자리가 있으면 넣고, 대기석이 꽉 찬 예외 구매 상태라면 임시 배열에 넣은 뒤
   * 즉시 tryMergeUnits(unitId, sharedPool)를 호출한다.
   */
  public buyUnit(shopIndex: number, sharedPool: SharedPoolManager): boolean {
    if (shopIndex < 0 || shopIndex >= this.shop.length) {
      return false;
    }

    const unitId = this.shop[shopIndex];
    if (!unitId) {
      return false;
    }

    const template = UNIT_TEMPLATES[unitId];
    if (!template) {
      return false;
    }

    if (!this.canBuyUnit(unitId, template.cost)) {
      this.lastActionMessage = this.hasThreeStarUnit(unitId)
        ? '이미 3성을 달성한 기물은 구매할 수 없습니다.'
        : this.gold < template.cost
        ? '골드가 부족합니다.'
        : '대기석이 가득 찼습니다.';
      return false;
    }

    // 골드 차감 및 상점 슬롯 비우기 (공유 풀에서는 상점 등장 시 이미 -1 차감되어 있음)
    this.gold -= template.cost;
    this.shop[shopIndex] = null;

    const newUnit = Participant.createUnitInstance(unitId, 1);
    const emptyBenchIdx = this.bench.findIndex((slot) => slot === null);

    if (emptyBenchIdx !== -1) {
      this.bench[emptyBenchIdx] = newUnit;
    } else {
      // 대기석 만석 구매 예외: 임시 오버플로우 배열에 넣고 즉시 합성 실행
      this.overflowUnits.push(newUnit);
    }

    this.tryMergeUnits(unitId, sharedPool);
    this.lastActionMessage = `${template.name} 구매 완료`;
    return true;
  }

  /**
   * 4) 기물 재귀 합성 (1성 3개 -> 2성 1개, 2성 3개 -> 3성 1개)
   * - 3개 중 board 위에 있던 기물이 하나라도 있으면 그 보드 좌표를 승계하고,
   *   모두 bench에 있었다면 가장 앞쪽 bench 슬롯을 승계한다.
   * - 합쳐지는 3개 기물의 장착 아이템들을 하나로 모아 기본 아이템 2개가 만나면 완성 아이템으로 합체하고,
   *   최대 3개까지만 합성 기물에 장착한 뒤 초과분은 itemBench로 안전하게 반환한다.
   * - 3성 달성 시 즉시 현재 자신의 shop에서 동일 unitId를 찾아 공유 풀로 반환하고 null로 비운다!
   */
  public tryMergeUnits(unitId: string, sharedPool: SharedPoolManager): boolean {
    let didMergeAny = false;

    for (const targetStar of [1, 2] as StarLevel[]) {
      while (true) {
        const matchingLocations = this.getAllUnitLocations().filter(
          (loc) => loc.unit.unitId === unitId && loc.unit.starLevel === targetStar
        );

        if (matchingLocations.length < 3) {
          break;
        }

        didMergeAny = true;
        const trio = matchingLocations.slice(0, 3);

        // 승계 위치 결정: 보드 위 기물이 하나라도 있으면 첫 번째 보드 기물 위치 우선, 아니면 가장 앞쪽 대기석 슬롯
        const boardCandidate = trio.find((loc) => loc.area === 'BOARD');
        const benchCandidate = trio.find((loc) => loc.area === 'BENCH');
        const anchor = boardCandidate ?? benchCandidate ?? trio[0];

        // 3개 기물의 모든 아이템 수집
        const collectedItems: ItemId[] = [];
        for (const loc of trio) {
          collectedItems.push(...loc.unit.items);
        }

        // 나머지 2개(또는 3개 모두) 제거
        for (const loc of trio) {
          this.removeUnitAtLocation(loc);
        }

        const nextStar = (targetStar + 1) as StarLevel;
        const { equippedItems, overflowItems } = this.consolidateMergedItems(collectedItems);

        // 초과 아이템은 안전하게 아이템 인벤토리(itemBench)로 회수
        for (const extraItem of overflowItems) {
          this.addItemToBench(extraItem);
        }

        const mergedUnit = Participant.createUnitInstance(unitId, nextStar, equippedItems);

        // 승계 위치에 배치
        if (anchor.area === 'BOARD') {
          this.board[anchor.row][anchor.col] = mergedUnit;
        } else if (anchor.area === 'BENCH') {
          this.bench[anchor.index] = mergedUnit;
        } else {
          const firstEmptyBench = this.bench.findIndex((s) => s === null);
          if (firstEmptyBench !== -1) {
            this.bench[firstEmptyBench] = mergedUnit;
          } else {
            this.bench[0] = mergedUnit;
          }
        }

        // 만약 3성(starLevel === 3) 합성이 달성되었다면:
        // 즉시 현재 자신의 shop을 순회하여 동일한 unitId 슬롯을 공유 풀로 반환(+1)하고 null 처리
        if (nextStar === 3) {
          for (let i = 0; i < this.shop.length; i++) {
            if (this.shop[i] === unitId) {
              sharedPool.returnUnitToPool(unitId, 1);
              this.shop[i] = null;
            }
          }
        }
      }
    }

    // 혹시라도 overflowUnits에 남은 기물이 있으면 빈 대기석으로 이동
    while (this.overflowUnits.length > 0) {
      const u = this.overflowUnits.shift()!;
      const emptyIdx = this.bench.findIndex((s) => s === null);
      if (emptyIdx !== -1) {
        this.bench[emptyIdx] = u;
      } else {
        // 이론상 발생하지 않지만 무결성을 위해 풀로 반환
        sharedPool.returnUnitToPool(u.unitId, u.starLevel);
      }
    }

    return didMergeAny;
  }

  /**
   * 합성되는 기물들의 아이템 목록을 받아 기본 아이템 쌍을 완성 아이템으로 자동 조합하고,
   * 최대 3개 장착분과 초과 회수분으로 분리한다.
   */
  private consolidateMergedItems(rawItems: ItemId[]): {
    equippedItems: ItemId[];
    overflowItems: ItemId[];
  } {
    const completedList: ItemId[] = [];
    const baseList: BaseItemId[] = [];

    for (const itemId of rawItems) {
      const def = ITEM_DEFINITIONS[itemId];
      if (!def) continue;
      if (def.isCompleted) {
        completedList.push(itemId);
      } else {
        baseList.push(itemId as BaseItemId);
      }
    }

    // 기본 아이템이 2개 이상 만나면 순서대로 완성 아이템으로 즉시 합체
    while (baseList.length >= 2) {
      const first = baseList.shift()!;
      const second = baseList.shift()!;
      const combined = combineBaseItems(first, second);
      completedList.push(combined);
    }

    const allFinalItems: ItemId[] = [...completedList, ...baseList];
    const equippedItems = allFinalItems.slice(0, 3);
    const overflowItems = allFinalItems.slice(3);

    return { equippedItems, overflowItems };
  }

  /**
   * 5) 기물 판매 (Sell Unit)
   * - board 또는 bench에서 해당 기물을 찾아 제거한다.
   * - 환급 골드: 1성은 cost, 2성은 cost === 1 ? 3 : cost * 3 - 1, 3성은 cost === 1 ? 9 : cost * 9 - 2
   * - 장착 중이던 모든 아이템을 즉시 itemBench로 회수한다.
   * - sharedPool.returnUnitToPool(unit.unitId, unit.starLevel)을 호출하여 1/3/9개를 공유 풀에 복구한다.
   */
  public sellUnit(instanceId: string, sharedPool: SharedPoolManager): number {
    const found = this.findUnitLocationByInstanceId(instanceId);
    if (!found) {
      return 0;
    }

    const { unit } = found;
    this.removeUnitAtLocation(found);

    // 환급 골드 계산
    const cost: number = unit.cost;
    let refundGold: number = cost;
    if (unit.starLevel === 2) {
      refundGold = cost === 1 ? 3 : cost * 3 - 1;
    } else if (unit.starLevel === 3) {
      refundGold = cost === 1 ? 9 : cost * 9 - 2;
    }

    this.gold += refundGold;

    // 장착 아이템 전부 회수
    for (const itemId of unit.items) {
      this.addItemToBench(itemId);
    }
    unit.items = [];

    // 공유 풀에 1성(1개) / 2성(3개) / 3성(9개) 즉시 반환
    sharedPool.returnUnitToPool(unit.unitId, unit.starLevel);

    this.lastActionMessage = `${unit.name}(${unit.starLevel}성) 판매 (+${refundGold}G)`;
    return refundGold;
  }

  /**
   * 6) 아이템 장착 및 자동 조합
   * - 대상 기물의 아이템 슬롯 여유 확인.
   * - 이미 기본 아이템 1개가 장착되어 있고 새로 넣는 것도 기본 아이템이면
   *   ITEM_DEFINITIONS 조합표를 참조해 즉시 완성 아이템으로 변환 장착한다.
   */
  public equipItemToUnit(itemBenchIndex: number, targetUnitInstanceId: string): boolean {
    if (itemBenchIndex < 0 || itemBenchIndex >= this.itemBench.length) {
      return false;
    }

    const found = this.findUnitLocationByInstanceId(targetUnitInstanceId);
    if (!found) {
      return false;
    }

    const incomingItemId = this.itemBench[itemBenchIndex];
    const incomingDef = ITEM_DEFINITIONS[incomingItemId];
    if (!incomingDef) {
      return false;
    }

    const unit = found.unit;

    // 새로 넣는 아이템이 기본 아이템이고, 기물에 이미 기본 아이템이 장착되어 있는 경우 즉시 완성 아이템으로 합체
    if (!incomingDef.isCompleted) {
      const existingBaseIndex = unit.items.findIndex(
        (eqId) => !ITEM_DEFINITIONS[eqId]?.isCompleted
      );

      if (existingBaseIndex !== -1) {
        const existingBaseId = unit.items[existingBaseIndex] as BaseItemId;
        const completedId = combineBaseItems(existingBaseId, incomingItemId as BaseItemId);
        unit.items[existingBaseIndex] = completedId;
        this.itemBench.splice(itemBenchIndex, 1);
        Participant.recalculateUnitStats(unit);
        this.lastActionMessage = `${ITEM_DEFINITIONS[completedId].name} 조합 완료!`;
        return true;
      }
    }

    // 일반 장착: 최대 3칸 제한 확인
    if (unit.items.length >= 3) {
      this.lastActionMessage = '해당 기물의 아이템 슬롯(3칸)이 가득 찼습니다.';
      return false;
    }

    unit.items.push(incomingItemId);
    this.itemBench.splice(itemBenchIndex, 1);
    Participant.recalculateUnitStats(unit);
    this.lastActionMessage = `${incomingDef.name} 장착 완료`;
    return true;
  }

  /**
   * 7) 챔피언 복제기 사용 (Use Champion Duplicator)
   * - 대상 기물과 동일한 unitId의 1성 기물을 sharedPool.pullSpecificUnitFromPool(unitId)를 통해
   *   가져와 생성하고 즉시 tryMergeUnits를 실행한다.
   * - 풀에 남은 개수가 0개이면 복제 실패 및 알림 메시지를 설정하고 false를 반환한다.
   */
  public useChampionDuplicator(
    targetUnitInstanceId: string,
    sharedPool: SharedPoolManager
  ): boolean {
    if (this.duplicators <= 0) {
      this.lastActionMessage = '보유한 챔피언 복제기가 없습니다.';
      return false;
    }

    const found = this.findUnitLocationByInstanceId(targetUnitInstanceId);
    if (!found) {
      this.lastActionMessage = '복제할 대상 기물을 찾을 수 없습니다.';
      return false;
    }

    const targetUnit = found.unit;
    if (this.hasThreeStarUnit(targetUnit.unitId)) {
      this.lastActionMessage = '이미 3성을 달성한 기물에는 복제기를 사용할 수 없습니다.';
      return false;
    }

    const emptyBenchIdx = this.bench.findIndex((s) => s === null);
    const canAutoMergeOnFullBench = this.countUnitsByIdAndStar(targetUnit.unitId, 1) >= 2;

    if (emptyBenchIdx === -1 && !canAutoMergeOnFullBench) {
      this.lastActionMessage = '대기석이 가득 차서 복제기를 사용할 수 없습니다.';
      return false;
    }

    // 공유 풀 재고 확인 및 차감 (풀 잔여량이 0개이면 절대 생성 불가)
    const pulled = sharedPool.pullSpecificUnitFromPool(targetUnit.unitId);
    if (!pulled) {
      this.lastActionMessage = `공유 풀에 [${targetUnit.name}] 재고가 고갈되어 복제할 수 없습니다!`;
      return false;
    }

    this.duplicators -= 1;
    const clonedUnit = Participant.createUnitInstance(targetUnit.unitId, 1);

    if (emptyBenchIdx !== -1) {
      this.bench[emptyBenchIdx] = clonedUnit;
    } else {
      this.overflowUnits.push(clonedUnit);
    }

    this.tryMergeUnits(targetUnit.unitId, sharedPool);
    this.lastActionMessage = `[챔피언 복제기] ${targetUnit.name} 1성 복제 완료!`;
    return true;
  }

  /**
   * 8) 참가자 탈락 처리 (Eliminate)
   * 체력이 0 이하가 되어 탈락할 때 호출.
   * isEliminated = true 설정 후, board, bench, shop에 남아있는 모든 기물을
   * 빠짐없이 sharedPool로 100% 반환하고 비운다.
   */
  public eliminate(sharedPool: SharedPoolManager): void {
    if (this.isEliminated) return;
    this.isEliminated = true;
    this.hp = 0;

    // 1. 전투 보드(4x7)의 모든 기물 반환
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = this.board[r][c];
        if (unit) {
          sharedPool.returnUnitToPool(unit.unitId, unit.starLevel);
          this.board[r][c] = null;
        }
      }
    }

    // 2. 대기석(1x9)의 모든 기물 반환
    for (let i = 0; i < Participant.BENCH_SIZE; i++) {
      const unit = this.bench[i];
      if (unit) {
        sharedPool.returnUnitToPool(unit.unitId, unit.starLevel);
        this.bench[i] = null;
      }
    }

    // 3. 오버플로우 버퍼 기물 반환
    while (this.overflowUnits.length > 0) {
      const unit = this.overflowUnits.pop()!;
      sharedPool.returnUnitToPool(unit.unitId, unit.starLevel);
    }

    // 4. 현재 상점 슬롯(5칸)에 예약되어 있던 모든 기물 반환
    sharedPool.releaseShopToPool(this);
  }

  // ==========================================================================
  // 보드/대기석 배치, 이자/경험치/리롤, 시너지 계산 유틸리티 메서드
  // ==========================================================================

  /**
   * 아이템 인벤토리에 아이템을 안전하게 추가한다.
   */
  public addItemToBench(itemId: ItemId): boolean {
    if (this.itemBench.length >= Participant.MAX_ITEM_BENCH_SIZE) {
      // 인벤토리가 꽉 찼을 때도 증발 방지를 위해 배열 끝에 보존하되 경고 메시지 기록
      this.itemBench.push(itemId);
      this.lastActionMessage = '아이템 보관함이 가득 찼습니다! 기물에 아이템을 장착해주세요.';
      return true;
    }
    this.itemBench.push(itemId);
    return true;
  }

  /**
   * 현재 전투 보드에 배치된 기물 수를 반환한다.
   */
  public getBoardUnitCount(): number {
    let count = 0;
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        if (this.board[r][c] !== null) count++;
      }
    }
    return count;
  }

  /**
   * 현재 전투 보드에 배치된 모든 기물 배열을 반환한다.
   */
  public getBoardUnits(): UnitInstance[] {
    const units: UnitInstance[] = [];
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const u = this.board[r][c];
        if (u) units.push(u);
      }
    }
    return units;
  }

  /**
   * 대기석(Bench)과 전투 보드(Board) 간 기물 이동 및 자리 교체(Swap)
   * 내 레벨(level) 이상의 기물을 빈 보드 칸으로 추가 배치하려 할 때는 차단한다.
   */
  public moveUnit(
    from: { area: 'BENCH'; index: number } | { area: 'BOARD'; row: number; col: number },
    to: { area: 'BENCH'; index: number } | { area: 'BOARD'; row: number; col: number }
  ): boolean {
    const sourceUnit =
      from.area === 'BENCH' ? this.bench[from.index] : this.board[from.row]?.[from.col];
    if (!sourceUnit) return false;

    const targetUnit =
      to.area === 'BENCH' ? this.bench[to.index] : this.board[to.row]?.[to.col];

    // 대기석 -> 빈 보드 타일로 배치 시 인구수(레벨) 한도 체크
    if (from.area === 'BENCH' && to.area === 'BOARD' && targetUnit === null) {
      if (this.getBoardUnitCount() >= this.level) {
        this.lastActionMessage = `배치 한도 초과! (현재 레벨 ${this.level}: 최대 ${this.level}기 배치 가능)`;
        return false;
      }
    }

    // 위치 스왑 실행
    if (from.area === 'BENCH') {
      this.bench[from.index] = targetUnit ?? null;
    } else {
      this.board[from.row][from.col] = targetUnit ?? null;
    }

    if (to.area === 'BENCH') {
      this.bench[to.index] = sourceUnit;
    } else {
      this.board[to.row][to.col] = sourceUnit;
    }

    return true;
  }

  /**
   * 상점 리롤 수행 (2골드 소모 또는 무료 리롤 사용, 황금 티켓 증강체 40% 무료 리롤 반영)
   */
  public rerollShop(sharedPool: SharedPoolManager): boolean {
    if (this.isEliminated) return false;

    const rerollCost = this.freeRerolls > 0 ? 0 : 2;
    if (this.gold < rerollCost) {
      this.lastActionMessage = '리롤에 필요한 골드(2G)가 부족합니다.';
      return false;
    }

    if (this.freeRerolls > 0) {
      this.freeRerolls -= 1;
    } else {
      this.gold -= 2;
    }

    this.isShopLocked = false;
    sharedPool.drawShopForParticipant(this);

    // [황금 티켓] 증강체 보유 시 리롤마다 40% 확률로 무료 리롤 +1 획득
    if (this.augments.includes('AUG_GOLDEN_TICKET') && Math.random() < 0.4) {
      this.freeRerolls += 1;
      this.lastActionMessage = '🎟️ [황금 티켓] 발동! 무료 리롤 1회를 획득했습니다!';
    }

    return true;
  }

  /**
   * 경험치 구매 (4골드 소모 -> 기본 +4 XP, [레벨 업!] 증강체 보유 시 +7 XP)
   */
  public buyXp(): boolean {
    if (this.isEliminated || this.level >= 10) {
      this.lastActionMessage = '이미 최대 레벨(Lv.10)입니다.';
      return false;
    }
    if (this.gold < 4) {
      this.lastActionMessage = '경험치 구매에 필요한 골드(4G)가 부족합니다.';
      return false;
    }

    this.gold -= 4;
    const xpGain = this.augments.includes('AUG_LEVEL_UP') ? 7 : 4;
    this.addXp(xpGain);
    return true;
  }

  /**
   * 경험치를 추가하고 레벨업 임계값 도달 시 자동 레벨업을 수행한다.
   */
  public addXp(amount: number): void {
    if (this.level >= 10) {
      this.xp = 0;
      return;
    }

    this.xp += amount;
    while (this.level < 10) {
      const nextLevel = this.level + 1;
      const required = XP_REQUIRED_BY_LEVEL[nextLevel] ?? 124;
      if (this.xp >= required) {
        this.xp -= required;
        this.level = nextLevel;
      } else {
        break;
      }
    }

    if (this.level >= 10) {
      this.xp = 0;
    }
  }

  /**
   * 최대 이자 한도 반환 (기본 5골드, [사악한 금융] 증강체 보유 시 7골드)
   */
  public getMaxInterestCap(): number {
    return this.augments.includes('AUG_DIABOLIC_FINANCE') ? 7 : 5;
  }

  /**
   * 현재 보유 골드 기준 이자 골드 계산
   */
  public calculateInterestGold(): number {
    const cap = this.getMaxInterestCap();
    return Math.min(cap, Math.floor(this.gold / 10));
  }

  /**
   * 현재 전투 보드 위 고유(Unique) 기물들의 시너지 카운트 + bonusTraits 합산 맵 반환
   */
  public getActiveTraitCounts(): Map<TraitId, number> {
    const counts = new Map<TraitId, number>();
    const seenUnitIds = new Set<string>();

    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = this.board[r][c];
        if (!unit || seenUnitIds.has(unit.unitId)) continue;
        seenUnitIds.add(unit.unitId);

        for (const traitId of unit.traits) {
          counts.set(traitId, (counts.get(traitId) ?? 0) + 1);
        }
      }
    }

    for (const [traitId, bonus] of this.bonusTraits.entries()) {
      counts.set(traitId, (counts.get(traitId) ?? 0) + bonus);
    }

    return counts;
  }

  /**
   * 증강체 선택 및 즉시 보상 적용
   */
  public applyAugment(augmentId: string, sharedPool: SharedPoolManager): boolean {
    const aug = AUGMENT_DEFINITIONS.find((a) => a.id === augmentId);
    if (!aug || this.augments.includes(augmentId)) return false;

    this.augments.push(augmentId);

    if (aug.immediateGold) {
      this.gold += aug.immediateGold;
    }
    if (aug.immediateDuplicators) {
      this.duplicators += aug.immediateDuplicators;
    }
    if (aug.immediateBaseItems) {
      for (const itemId of aug.immediateBaseItems) {
        this.addItemToBench(itemId);
      }
    }
    if (aug.bonusTrait && aug.bonusTraitCount) {
      const prev = this.bonusTraits.get(aug.bonusTrait) ?? 0;
      this.bonusTraits.set(aug.bonusTrait, prev + aug.bonusTraitCount);
    }
    if (aug.effectKey === 'ARCANE_CREST') {
      // 고대 마탑의 왕관: 마탑 +1 외에 대마법사(ARCHMAGE)도 +1 추가 부여
      const prevArchmage = this.bonusTraits.get('ARCHMAGE') ?? 0;
      this.bonusTraits.set('ARCHMAGE', prevArchmage + 1);
    }
    if (aug.effectKey === 'TINY_TITANS') {
      this.maxHp = 130;
      this.hp = Math.min(this.maxHp, this.hp + 30);
    }
    if (aug.immediateUnitId) {
      if (sharedPool.pullSpecificUnitFromPool(aug.immediateUnitId)) {
        const unit = Participant.createUnitInstance(aug.immediateUnitId, 1);
        const emptyIdx = this.bench.findIndex((s) => s === null);
        if (emptyIdx !== -1) {
          this.bench[emptyIdx] = unit;
        } else {
          this.overflowUnits.push(unit);
        }
        this.tryMergeUnits(aug.immediateUnitId, sharedPool);
      }
    }

    return true;
  }

  /**
   * 내부 헬퍼: 보드, 대기석, 오버플로우의 모든 기물 위치 목록 반환
   */
  public getAllUnitLocations(): UnitLocation[] {
    const locations: UnitLocation[] = [];

    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = this.board[r][c];
        if (unit) {
          locations.push({ area: 'BOARD', row: r, col: c, unit });
        }
      }
    }

    for (let i = 0; i < Participant.BENCH_SIZE; i++) {
      const unit = this.bench[i];
      if (unit) {
        locations.push({ area: 'BENCH', index: i, unit });
      }
    }

    for (let i = 0; i < this.overflowUnits.length; i++) {
      const unit = this.overflowUnits[i];
      if (unit) {
        locations.push({ area: 'OVERFLOW', index: i, unit });
      }
    }

    return locations;
  }

  public findUnitLocationByInstanceId(instanceId: string): UnitLocation | null {
    for (const loc of this.getAllUnitLocations()) {
      if (loc.unit.instanceId === instanceId) {
        return loc;
      }
    }
    return null;
  }

  private removeUnitAtLocation(loc: UnitLocation): void {
    if (loc.area === 'BOARD') {
      this.board[loc.row][loc.col] = null;
    } else if (loc.area === 'BENCH') {
      this.bench[loc.index] = null;
    } else if (loc.area === 'OVERFLOW') {
      const idx = this.overflowUnits.findIndex((u) => u.instanceId === loc.unit.instanceId);
      if (idx !== -1) {
        this.overflowUnits.splice(idx, 1);
      }
    }
  }
}
